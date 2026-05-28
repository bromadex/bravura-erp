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
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Pagination } from '../../components/ui'

const today    = new Date().toISOString().split('T')[0]
const PAGE_SIZE = 50

const PURPOSE_CATS = ['operations', 'transport', 'delivery', 'site_visit', 'personal', 'other']
const TRIP_TYPES   = ['outward', 'return', 'round_trip']
const APPROVAL_ST  = ['draft', 'submitted', 'approved', 'rejected']

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
  notes: '',
  approval_status: 'approved',
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
  const debounceRef = useRef(null)

  // Load reference data
  useEffect(() => {
    supabase.from('asset_registry').select('id, name, reg_no, asset_code, asset_type, status')
      .in('status', ['Active', 'active'])
      .order('name')
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

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({
      date:             r.date || today,
      asset_id:         r.asset_id || '',
      vehicle_id:       r.vehicle_id || '',
      driver_id:        r.driver_id || '',
      driver_name:      r.driver_name || '',
      start_odometer:   r.start_odometer ?? '',
      end_odometer:     r.end_odometer ?? '',
      fuel_used:        r.fuel_used ?? '',
      route_from:       r.route_from || '',
      route_to:         r.route_to || '',
      purpose:          r.purpose || '',
      purpose_category: r.purpose_category || 'operations',
      trip_type:        r.trip_type || 'outward',
      passenger_count:  r.passenger_count || 0,
      project_id:       r.project_id || '',
      cost_center:      r.cost_center || '',
      notes:            r.notes || '',
      approval_status:  r.approval_status || 'approved',
    })
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
      start_odometer:  parseFloat(form.start_odometer),
      end_odometer:    parseFloat(form.end_odometer),
      distance:        distance,
      fuel_used:       form.fuel_used ? parseFloat(form.fuel_used) : null,
      passenger_count: parseInt(form.passenger_count) || 0,
      created_by:      user?.full_name || user?.username || '',
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
              {assets.map(a => <option key={a.id} value={a.id}>{a.name || a.reg_no || a.asset_code}</option>)}
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
                <th>From → To</th><th>Distance</th><th>Fuel (L)</th><th>Purpose</th><th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="10"><EmptyState icon="route" message="No trips found" /></td></tr>
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
                  <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.purpose || '—'}</td>
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
                      {a.name || a.reg_no || a.asset_code} ({a.asset_type})
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

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

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
