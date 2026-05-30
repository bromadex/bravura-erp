// src/pages/Fleet/TripManagement.jsx — Vehicle trip log with full lifecycle

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import { exportXLSX } from '../../engine/reportingEngine'
import { auditLog } from '../../engine/auditEngine'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Pagination, TabNav } from '../../components/ui'

const today      = new Date().toISOString().split('T')[0]
const PAGE_SIZE  = 50
const FUEL_PRICE = 1.50 // K per litre default estimate

const PURPOSE_CATS = ['operations', 'transport', 'delivery', 'site_visit', 'personal', 'other']
const TRIP_TYPES   = ['outward', 'return', 'round_trip']
const APPROVAL_ST  = ['draft', 'submitted', 'approved', 'rejected']
const TRIP_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled']

const BLANK = {
  date: today,
  asset_id: '',
  vehicle_id: '',
  driver_id: '',
  driver_name: '',
  start_odometer: '',
  end_odometer: '',
  fuel_used: '',
  route_from: '',
  route_to: '',
  purpose: '',
  purpose_category: 'operations',
  trip_type: 'outward',
  passenger_count: 0,
  project_id: '',
  cost_center: '',
  cargo_description: '',
  trip_status: 'completed',
  notes: '',
  approval_status: 'approved',
}

function tripStatusPill(s) {
  const cfg = {
    planned:     { color: 'var(--blue)',   cls: 'badge-blue'   },
    in_progress: { color: 'var(--green)',  cls: 'badge-green'  },
    completed:   { color: 'var(--teal)',   cls: 'badge-teal'   },
    cancelled:   { color: 'var(--red)',    cls: 'badge-red'    },
  }[s] || { color: 'var(--text-dim)', cls: '' }
  return <span className={`badge ${cfg.cls}`} style={{ fontSize: 9 }}>{s || '—'}</span>
}

export default function TripManagement() {
  const { user }    = useAuth()
  const canEdit     = useCanEdit('fleet', 'vehicles')
  const canDelete   = useCanDelete('fleet', 'vehicles')

  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [tableLoading, setTableLoading] = useState(true)
  const [kpiData,      setKpiData]      = useState({ today: 0, month: 0, total: 0, distance: 0 })
  const [assets,       setAssets]       = useState([])
  const [employees,    setEmployees]    = useState([])
  const [showModal,    setShowModal]    = useState(false)
  const [editRecord,   setEditRecord]   = useState(null)
  const [form,         setForm]         = useState(BLANK)
  const [searchInput,  setSearchInput]  = useState('')
  const [searchTerm,   setSearchTerm]   = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [assetFilter,  setAssetFilter]  = useState('')
  const debounceRef    = useRef(null)
  const [activeTab,    setActiveTab]    = useState('trips')
  const [driverStats,  setDriverStats]  = useState([])
  const [driverLoading, setDriverLoading] = useState(false)
  const [driverPeriod, setDriverPeriod] = useState('month')
  const [routeData,    setRouteData]    = useState([])
  const [routeLoading, setRouteLoading] = useState(false)
  const [tripFuel,     setTripFuel]     = useState([]) // fuel records for detail modal

  // Load reference data
  useEffect(() => {
    supabase.from('asset_registry').select('id, asset_name, plate_number, asset_code, asset_category, status')
      .in('status', ['Active', 'active'])
      .order('asset_name')
      .then(({ data }) => setAssets(data || []))

    supabase.from('employees').select('id, name, status').neq('status', 'Terminated').order('name')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  // KPIs
  useEffect(() => {
    const monthStart = today.slice(0, 7) + '-01'
    Promise.all([
      supabase.from('vehicle_trips').select('id', { count: 'exact' }).eq('date', today),
      supabase.from('vehicle_trips').select('id', { count: 'exact' }).gte('date', monthStart),
      supabase.from('vehicle_trips').select('id,distance', { count: 'exact' }),
    ]).then(([todayRes, monthRes, allRes]) => {
      const totalDist = (allRes.data || []).reduce((s, r) => s + (r.distance || 0), 0)
      setKpiData({
        today: todayRes.count || 0,
        month: monthRes.count || 0,
        total: allRes.count  || 0,
        distance: totalDist,
      })
    }).catch(console.error)
  }, [])

  const loadDriverStats = useCallback(async () => {
    setDriverLoading(true)
    const monthStart = today.slice(0, 7) + '-01'
    const qm = Math.floor(new Date().getMonth() / 3) * 3
    const quarterStart = `${today.slice(0, 4)}-${String(qm + 1).padStart(2, '0')}-01`
    const start = driverPeriod === 'month' ? monthStart : quarterStart

    const { data } = await supabase
      .from('vehicle_trips')
      .select('driver_name,driver_id,asset_id,distance,fuel_used')
      .gte('date', start).lte('date', today)

    const map = {}
    ;(data || []).forEach(r => {
      const key = r.driver_name || r.driver_id || 'Unknown'
      if (!map[key]) map[key] = { driver: key, trips: 0, totalKm: 0, totalFuel: 0, estFuelCost: 0 }
      map[key].trips++
      map[key].totalKm += r.distance || 0
      map[key].totalFuel += r.fuel_used || 0
      if ((r.fuel_used || 0) > 0) {
        map[key].estFuelCost += r.fuel_used * FUEL_PRICE
      } else if ((r.distance || 0) > 0) {
        map[key].estFuelCost += (r.distance * 15 / 100) * FUEL_PRICE
      }
    })
    setDriverStats(Object.values(map).sort((a, b) => b.totalKm - a.totalKm))
    setDriverLoading(false)
  }, [driverPeriod])

  const loadRoutePerformance = useCallback(async () => {
    setRouteLoading(true)
    const { data, error } = await supabase.from('fleet_route_performance').select('*')
    if (!error) setRouteData(data || [])
    setRouteLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'drivers') loadDriverStats()
    if (activeTab === 'routes')  loadRoutePerformance()
  }, [activeTab, loadDriverStats, loadRoutePerformance])

  const fetchPage = useCallback(async (p = 0) => {
    setTableLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = supabase
      .from('vehicle_trips')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (dateFrom)           q = q.gte('date', dateFrom)
    if (dateTo)             q = q.lte('date', dateTo)
    if (assetFilter)        q = q.or(`asset_id.eq.${assetFilter},vehicle_id.eq.${assetFilter}`)
    if (searchTerm.trim())  q = q.or(`driver_name.ilike.%${searchTerm}%,purpose.ilike.%${searchTerm}%,route_from.ilike.%${searchTerm}%,route_to.ilike.%${searchTerm}%`)

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0); setPage(p) }
    setTableLoading(false)
  }, [dateFrom, dateTo, assetFilter, searchTerm])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const handleSearchChange = (v) => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 400)
  }

  const distance = form.end_odometer && form.start_odometer
    ? Math.max(0, parseFloat(form.end_odometer) - parseFloat(form.start_odometer))
    : 0

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setTripFuel([]); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({
      date:              r.date || today,
      asset_id:          r.asset_id || '',
      vehicle_id:        r.vehicle_id || '',
      driver_id:         r.driver_id || '',
      driver_name:       r.driver_name || '',
      start_odometer:    r.start_odometer ?? '',
      end_odometer:      r.end_odometer ?? '',
      fuel_used:         r.fuel_used ?? '',
      route_from:        r.route_from || '',
      route_to:          r.route_to || '',
      purpose:           r.purpose || '',
      purpose_category:  r.purpose_category || 'operations',
      trip_type:         r.trip_type || 'outward',
      passenger_count:   r.passenger_count || 0,
      project_id:        r.project_id || '',
      cost_center:       r.cost_center || '',
      cargo_description: r.cargo_description || '',
      trip_status:       r.trip_status || 'completed',
      notes:             r.notes || '',
      approval_status:   r.approval_status || 'approved',
    })
    // Load fuel issuance for this trip (by asset_id + date)
    if (r.asset_id && r.date) {
      supabase.from('fuel_issuance')
        .select('id,date,quantity,unit_cost,total_cost,driver_operator')
        .eq('asset_id', r.asset_id)
        .eq('date', r.date)
        .catch(() => ({ data: [] }))
        .then(({ data }) => setTripFuel(data || []))
    } else {
      setTripFuel([])
    }
    setShowModal(true)
  }

  const handleDriverChange = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({ ...f, driver_id: empId, driver_name: emp?.name || '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date)             return toast.error('Date is required')
    if (!form.start_odometer)   return toast.error('Start odometer is required')
    if (!form.end_odometer)     return toast.error('End odometer is required')
    if (parseFloat(form.end_odometer) < parseFloat(form.start_odometer))
      return toast.error('End odometer must be ≥ start odometer')

    const payload = {
      ...form,
      start_odometer:    parseFloat(form.start_odometer),
      end_odometer:      parseFloat(form.end_odometer),
      distance:          distance,
      fuel_used:         form.fuel_used ? parseFloat(form.fuel_used) : null,
      passenger_count:   parseInt(form.passenger_count) || 0,
      cargo_description: form.cargo_description || null,
      trip_status:       form.trip_status || 'completed',
      created_by:        user?.full_name || user?.username || '',
    }

    try {
      if (editRecord) {
        const { error } = await supabase.from('vehicle_trips').update(payload).eq('id', editRecord.id)
        if (error) throw error
        auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'vehicle_trip', entityId: editRecord.id, entityName: editRecord.trip_no || editRecord.id })
        toast.success('Trip updated')
      } else {
        const id       = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
        let trip_no
        try { trip_no = await generateTxnCode('TRIP') } catch { trip_no = null }
        const { error } = await supabase.from('vehicle_trips').insert([{ id, trip_no, ...payload, created_at: new Date().toISOString() }])
        if (error) throw error
        auditLog({ module: 'fleet', action: 'CREATE', entityType: 'vehicle_trip', entityId: id, entityName: trip_no || id })
        toast.success(`Trip recorded${trip_no ? ` — ${trip_no}` : ''}`)
      }
      setShowModal(false)
      setEditRecord(null)
      fetchPage(0)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm('Delete this trip record?')) return
    const { error } = await supabase.from('vehicle_trips').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'vehicle_trip', entityId: id, entityName: name || id })
    toast.success('Trip deleted')
    fetchPage(page)
  }

  const handleExport = async () => {
    let q = supabase.from('vehicle_trips').select('*').order('date', { ascending: false })
    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo)   q = q.lte('date', dateTo)
    if (assetFilter) q = q.or(`asset_id.eq.${assetFilter},vehicle_id.eq.${assetFilter}`)
    const { data } = await q
    if (!data?.length) return toast.error('No records to export')
    exportXLSX(data.map(r => ({
      TripNo: r.trip_no, Date: r.date, Asset: r.asset_id || r.vehicle_id,
      Driver: r.driver_name, From: r.route_from, To: r.route_to,
      StartOdo: r.start_odometer, EndOdo: r.end_odometer, Distance: r.distance,
      FuelUsed: r.fuel_used, Purpose: r.purpose, Category: r.purpose_category,
      TripType: r.trip_type, Status: r.approval_status,
    })), `Trips_${today}`, 'Trips')
    toast.success(`Exported ${data.length} records`)
  }

  const clearFilters = () => { setSearchInput(''); setSearchTerm(''); setDateFrom(''); setDateTo(''); setAssetFilter('') }

  return (
    <div>
      <PageHeader title="Trip Management">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons">add</span> New Trip
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Trips Today"    value={kpiData.today}                        sub={today}            color="gold"  />
        <KPICard label="Trips (Month)"  value={kpiData.month}                        sub={today.slice(0,7)} color="teal"  />
        <KPICard label="Total Trips"    value={kpiData.total}                        sub="all time"                       />
        <KPICard label="Total Distance" value={`${kpiData.distance.toLocaleString()} km`} sub="all time"  color="yellow" />
      </div>

      <TabNav tabs={['Trips', 'Driver Performance', 'Route Performance']}
        active={activeTab === 'trips' ? 0 : activeTab === 'drivers' ? 1 : 2}
        onChange={i => setActiveTab(i === 0 ? 'trips' : i === 1 ? 'drivers' : 'routes')} />

      {activeTab === 'drivers' && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Driver Performance</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn btn-sm ${driverPeriod === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDriverPeriod('month')}>This Month</button>
              <button className={`btn btn-sm ${driverPeriod === 'quarter' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDriverPeriod('quarter')}>This Quarter</button>
            </div>
          </div>
          {driverLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</div>
          ) : driverStats.length === 0 ? (
            <EmptyState icon="person" message="No trip data for the selected period" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th><th>Driver</th>
                    <th style={{ textAlign: 'right' }}>Trips</th>
                    <th style={{ textAlign: 'right' }}>Total KM</th>
                    <th style={{ textAlign: 'right' }}>Avg KM/Trip</th>
                    <th style={{ textAlign: 'right' }}>Fuel Used (L)</th>
                    <th style={{ textAlign: 'right' }}>Est. Fuel Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map((d, i) => (
                    <tr key={d.driver}>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{d.driver}</td>
                      <td className="td-mono" style={{ textAlign: 'right' }}>{d.trips}</td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>
                        {d.totalKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                        {d.trips > 0 ? (d.totalKm / d.trips).toFixed(1) : '—'} km
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--yellow)' }}>
                        {d.totalFuel > 0 ? `${d.totalFuel.toFixed(1)} L` : '—'}
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>
                        K{d.estFuelCost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2} style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>TOTAL</td>
                    <td className="td-mono" style={{ textAlign: 'right' }}>{driverStats.reduce((s, d) => s + d.trips, 0)}</td>
                    <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>
                      {driverStats.reduce((s, d) => s + d.totalKm, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} km
                    </td>
                    <td />
                    <td className="td-mono" style={{ textAlign: 'right', color: 'var(--yellow)' }}>
                      {driverStats.reduce((s, d) => s + d.totalFuel, 0).toFixed(1)} L
                    </td>
                    <td className="td-mono" style={{ textAlign: 'right', color: 'var(--gold)' }}>
                      K{driverStats.reduce((s, d) => s + d.estFuelCost, 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--teal)' }}>map</span>
              Route Performance
            </span>
            <button className="btn btn-secondary btn-sm" onClick={loadRoutePerformance}>
              <span className="material-icons" style={{ fontSize: 12 }}>refresh</span>
            </button>
          </div>
          {routeLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</div>
          ) : routeData.length === 0 ? (
            <EmptyState icon="map" message="No route data yet — record trips with origin and destination to see route analysis" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th style={{ textAlign: 'right' }}>Trips</th>
                    <th style={{ textAlign: 'right' }}>Avg Distance</th>
                    <th style={{ textAlign: 'right' }}>Avg Fuel (L)</th>
                    <th style={{ textAlign: 'right' }}>Avg Cost</th>
                    <th style={{ textAlign: 'right' }}>Drivers</th>
                    <th style={{ textAlign: 'right' }}>Assets</th>
                    <th>Last Trip</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {routeData.map((r, i) => {
                    // Benchmark: avg fuel / (avg_distance/100) = L/100km; flag if > 15 L/100km (generic benchmark)
                    const l100km = r.avg_distance_km > 0 && r.avg_fuel_used > 0
                      ? (r.avg_fuel_used / r.avg_distance_km * 100)
                      : null
                    const isHighConsumption = l100km !== null && l100km > 15
                    const avgCost = r.avg_fuel_used > 0 ? (r.avg_fuel_used * FUEL_PRICE) : (r.avg_distance_km > 0 ? (r.avg_distance_km * 15 / 100 * FUEL_PRICE) : 0)
                    return (
                      <tr key={i} style={{ background: isHighConsumption ? 'color-mix(in srgb,var(--red) 5%,var(--surface))' : '' }}>
                        <td style={{ fontWeight: 600 }}>
                          <span style={{ fontSize: 12 }}>{r.origin}</span>
                          <span className="material-icons" style={{ fontSize: 11, verticalAlign: 'middle', margin: '0 4px', color: 'var(--teal)' }}>arrow_forward</span>
                          <span style={{ fontSize: 12, color: 'var(--teal)' }}>{r.destination}</span>
                        </td>
                        <td className="td-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{r.total_trips}</td>
                        <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>
                          {r.avg_distance_km > 0 ? `${r.avg_distance_km} km` : '—'}
                        </td>
                        <td className="td-mono" style={{ textAlign: 'right', color: 'var(--yellow)' }}>
                          {r.avg_fuel_used > 0 ? `${r.avg_fuel_used} L` : '—'}
                          {l100km !== null && (
                            <span style={{ fontSize: 9, color: 'var(--text-dim)', display: 'block' }}>
                              {l100km.toFixed(1)} L/100km
                            </span>
                          )}
                        </td>
                        <td className="td-mono" style={{ textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>
                          K{avgCost.toFixed(2)}
                        </td>
                        <td className="td-mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{r.unique_drivers}</td>
                        <td className="td-mono" style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{r.unique_assets}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.last_trip || '—'}</td>
                        <td>
                          {isHighConsumption && (
                            <span title="High fuel consumption route" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>
                              <span className="material-icons" style={{ fontSize: 12 }}>local_gas_station</span> High
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trips' && <>
      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Driver, purpose, route…" value={searchInput}
              onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Asset</label>
            <select className="form-control" value={assetFilter} onChange={e => setAssetFilter(e.target.value)}>
              <option value="">All Assets</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.asset_name || a.plate_number || a.asset_code}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={clearFilters}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Trip Records</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{total} records · page {page + 1}</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Trip No</th><th>Date</th><th>Asset</th><th>Driver</th>
                <th>From → To</th><th>Distance</th><th>Fuel (L)</th><th>Est. Cost</th><th>Purpose</th><th>Trip Status</th><th>Approval</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="12"><EmptyState icon="route" message="No trips found" /></td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.trip_no ? <TxnCodeBadge code={r.trip_no} /> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{r.asset_id || r.vehicle_id || '—'}</td>
                  <td>{r.driver_name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {r.route_from && r.route_to ? `${r.route_from} → ${r.route_to}` : r.route_from || r.route_to || '—'}
                  </td>
                  <td className="td-mono" style={{ color: 'var(--teal)' }}>{r.distance ? `${r.distance} km` : '—'}</td>
                  <td className="td-mono" style={{ color: 'var(--yellow)' }}>{r.fuel_used ? `${r.fuel_used} L` : '—'}</td>
                  <td className="td-mono" style={{ fontSize: 12, color: 'var(--teal)' }}>
                    {r.fuel_used > 0
                      ? `K${(r.fuel_used * FUEL_PRICE).toFixed(2)}`
                      : r.distance > 0
                      ? `~K${(r.distance * 15 / 100 * FUEL_PRICE).toFixed(2)}`
                      : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.purpose || '—'}</td>
                  <td>{r.trip_status ? tripStatusPill(r.trip_status) : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>}</td>
                  <td>
                    <span className={`badge ${r.approval_status === 'approved' ? 'badge-green' : r.approval_status === 'rejected' ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 9 }}>
                      {r.approval_status || 'approved'}
                    </span>
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>}
                        {canDelete && <button className="btn btn-danger btn-sm"    onClick={() => handleDelete(r.id, r.trip_no)}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={fetchPage} />
      </div>
      </>}

      {/* Modal */}
      {showModal && (
        <ModalDialog open onClose={() => { setShowModal(false); setEditRecord(null) }}
          title={`${editRecord ? 'Edit' : 'New'} Trip`} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" className="form-control" required value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Trip Type</label>
                <select className="form-control" value={form.trip_type}
                  onChange={e => setForm(f => ({ ...f, trip_type: e.target.value }))}>
                  {TRIP_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Category</label>
                <select className="form-control" value={form.purpose_category}
                  onChange={e => setForm(f => ({ ...f, purpose_category: e.target.value }))}>
                  {PURPOSE_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Asset / Vehicle *</label>
                <select className="form-control" required value={form.asset_id}
                  onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))}>
                  <option value="">Select asset…</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.asset_name || a.plate_number || a.asset_code} ({a.asset_category})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Driver / Operator</label>
                <select className="form-control" value={form.driver_id}
                  onChange={e => handleDriverChange(e.target.value)}>
                  <option value="">— Select driver —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Passengers</label>
                <input type="number" className="form-control" min="0" value={form.passenger_count}
                  onChange={e => setForm(f => ({ ...f, passenger_count: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Route From</label>
                <input className="form-control" placeholder="Origin / departure point" value={form.route_from}
                  onChange={e => setForm(f => ({ ...f, route_from: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Route To</label>
                <input className="form-control" placeholder="Destination" value={form.route_to}
                  onChange={e => setForm(f => ({ ...f, route_to: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Start Odometer (km) *</label>
                <input type="number" className="form-control" required min="0" step="0.1" value={form.start_odometer}
                  onChange={e => setForm(f => ({ ...f, start_odometer: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>End Odometer (km) *</label>
                <input type="number" className="form-control" required min="0" step="0.1" value={form.end_odometer}
                  onChange={e => setForm(f => ({ ...f, end_odometer: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Distance</label>
                <input className="form-control" readOnly value={distance > 0 ? `${distance.toFixed(1)} km` : '—'}
                  style={{ background: 'var(--surface2)', cursor: 'default', color: distance > 0 ? 'var(--teal)' : 'var(--text-dim)' }} />
              </div>
              <div className="form-group">
                <label>Fuel Used (L)</label>
                <input type="number" className="form-control" min="0" step="0.1" value={form.fuel_used}
                  onChange={e => setForm(f => ({ ...f, fuel_used: e.target.value }))} />
              </div>
            </div>

            {distance > 0 && form.fuel_used > 0 && (
              <div style={{ padding: '6px 12px', background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
                Fuel efficiency: <strong style={{ color: 'var(--teal)' }}>{(distance / parseFloat(form.fuel_used)).toFixed(2)} km/L</strong>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Purpose</label>
                <input className="form-control" value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Trip Status</label>
                <select className="form-control" value={form.trip_status}
                  onChange={e => setForm(f => ({ ...f, trip_status: e.target.value }))}>
                  {TRIP_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Project</label>
                <input className="form-control" placeholder="Project ID / code" value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Cost Centre</label>
                <input className="form-control" value={form.cost_center}
                  onChange={e => setForm(f => ({ ...f, cost_center: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Cargo / Load Description</label>
                <input className="form-control" placeholder="Describe cargo or load carried" value={form.cargo_description}
                  onChange={e => setForm(f => ({ ...f, cargo_description: e.target.value }))} />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* Fuel issued on this day for this asset */}
            {tripFuel.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'color-mix(in srgb,var(--yellow) 8%,var(--surface2))', border: '1px solid color-mix(in srgb,var(--yellow) 25%,transparent)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--yellow)', marginBottom: 6 }}>
                  <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>local_gas_station</span>
                  Fuel Issued (same asset, same date)
                </div>
                {tripFuel.map(f => (
                  <div key={f.id} style={{ fontSize: 11, display: 'flex', gap: 16 }}>
                    <span style={{ fontWeight: 700, color: 'var(--yellow)' }}>{f.quantity} L</span>
                    {f.unit_cost > 0 && <span style={{ color: 'var(--text-dim)' }}>@ K{f.unit_cost}/L</span>}
                    {f.total_cost > 0 && <span style={{ fontWeight: 700, color: 'var(--gold)' }}>K{f.total_cost}</span>}
                    {f.driver_operator && <span style={{ color: 'var(--text-dim)' }}>{f.driver_operator}</span>}
                  </div>
                ))}
              </div>
            )}

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditRecord(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary">
                <span className="material-icons">route</span>
                {editRecord ? 'Save Changes' : 'Record Trip'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
