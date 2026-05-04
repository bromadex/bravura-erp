// src/pages/Fuel/FuelIssuance.jsx
//
// FIX: Removed useHR() — HRProvider is not in the Fuel route.
// Employees are now fetched directly from Supabase (id, name, status only).
//
// MODERN REDESIGN:
// - KPI bar: today's issued litres, total issuances, unique vehicles, drivers
// - Card-based issuance log with search + date filter
// - Fuel type badge colours
// - Quick stats per issuance card
// - Edit and delete (for admins)

import { useState, useEffect } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useLeave } from '../../contexts/LeaveContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const FUEL_COLORS = { DIESEL: 'badge-yellow', PETROL: 'badge-green', PARAFFIN: 'badge-blue' }
const today = new Date().toISOString().split('T')[0]

export default function FuelIssuance() {
  const { issuances, addIssuance, loading, fetchAll } = useFuel()
  const { isOnLeave } = useLeave()
  const { user } = useAuth()
  const canEdit   = useCanEdit('fuel', 'issuance')
  const canDelete = useCanDelete('fuel', 'issuance')

  // ✅ FIX: fetch employees directly — no HRProvider needed
  const [employees, setEmployees] = useState([])
  useEffect(() => {
    supabase.from('employees').select('id, name, status').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const [vehicles,    setVehicles]    = useState([])
  const [generators,  setGenerators]  = useState([])
  const [earthmovers, setEarthmovers] = useState([])
  useEffect(() => {
    Promise.all([
      supabase.from('fleet').select('reg, description').eq('status', 'Active'),
      supabase.from('generators').select('gen_code, gen_name'),
      supabase.from('earth_movers').select('reg, description'),
    ]).then(([vRes, gRes, eRes]) => {
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthmovers(eRes.data)
    })
  }, [])

  const [showModal,  setShowModal]  = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [fuelFilter, setFuelFilter] = useState('ALL')
  const [equipType,  setEquipType]  = useState('vehicle')

  const BLANK = {
    date: today, time: new Date().toTimeString().slice(0, 5),
    fuel_type: 'DIESEL', amount: '', vehicle: '', driver: '',
    authorized_by: user?.full_name || user?.username || '',
    purpose: '', odometer: '', flowmeter: '',
  }
  const [form, setForm] = useState(BLANK)

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setEquipType('vehicle'); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({ date: r.date, time: r.time || '', fuel_type: r.fuel_type || 'DIESEL', amount: r.amount, vehicle: r.vehicle || '', driver: r.driver || '', authorized_by: r.authorized_by || '', purpose: r.purpose || '', odometer: r.odometer || '', flowmeter: r.flowmeter || '' })
    setShowModal(true)
  }

  const selectedDriver = employees.find(e => e.id === form.driver)
  const driverOnLeave  = form.driver && isOnLeave(form.driver)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (!form.vehicle) return toast.error('Select vehicle / equipment')
    if (driverOnLeave) { toast.error(`${selectedDriver?.name} is currently on leave`); return }

    const driverName = selectedDriver?.name || form.driver
    const payload    = { ...form, amount: parseFloat(form.amount), flowmeter: parseFloat(form.flowmeter) || 0, odometer: form.odometer ? parseFloat(form.odometer) : null, user_name: user?.full_name || user?.username, driver: driverName }

    try {
      if (editRecord) {
        const { error } = await supabase.from('fuel_log').update(payload).eq('id', editRecord.id)
        if (error) throw error
        toast.success('Record updated')
        await fetchAll()
      } else {
        const txnCode = await generateTxnCode('FI')
        await addIssuance({ ...payload, txn_code: txnCode })
        toast.success(`Issued ${form.amount} L — ${txnCode}`)
      }
      setShowModal(false)
      setForm(BLANK)
      setEditRecord(null)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this issuance record?')) return
    const { error } = await supabase.from('fuel_log').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    await fetchAll()
  }

  // Filtered list
  const filtered = issuances.filter(r => {
    if (fuelFilter !== 'ALL' && r.fuel_type !== fuelFilter) return false
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo   && r.date > dateTo)   return false
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      if (!(r.vehicle?.toLowerCase().includes(t) || r.driver?.toLowerCase().includes(t) || r.purpose?.toLowerCase().includes(t))) return false
    }
    return true
  })

  // KPIs
  const issuedToday   = issuances.filter(r => r.date === today).reduce((s, r) => s + (r.amount || 0), 0)
  const totalIssued   = issuances.reduce((s, r) => s + (r.amount || 0), 0)
  const uniqueVehicles = new Set(issuances.map(r => r.vehicle).filter(Boolean)).size
  const uniqueDrivers  = new Set(issuances.map(r => r.driver).filter(Boolean)).size

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ Date: r.date, Time: r.time, Type: r.fuel_type, Litres: r.amount, Vehicle: r.vehicle, Driver: r.driver, Odometer: r.odometer, Flowmeter: r.flowmeter, Purpose: r.purpose, AuthorisedBy: r.authorized_by })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Issuances')
    XLSX.writeFile(wb, `FuelIssuance_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Issuance</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}>
            <span className="material-icons">table_chart</span> Export
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={openNew}>
              <span className="material-icons">local_gas_station</span> New Issuance
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Issued Today</div>
          <div className="kpi-val" style={{ color: 'var(--yellow)' }}>{issuedToday.toLocaleString()}</div>
          <div className="kpi-sub">litres</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Issued</div>
          <div className="kpi-val">{totalIssued.toLocaleString()}</div>
          <div className="kpi-sub">all time (L)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Unique Vehicles</div>
          <div className="kpi-val" style={{ color: 'var(--teal)' }}>{uniqueVehicles}</div>
          <div className="kpi-sub">served</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Drivers</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{uniqueDrivers}</div>
          <div className="kpi-sub">recorded</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Records</div>
          <div className="kpi-val">{issuances.length}</div>
          <div className="kpi-sub">total entries</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Vehicle, driver, purpose…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fuel Type</label>
            <select className="form-control" value={fuelFilter}
              onChange={e => setFuelFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              <option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setDateFrom(''); setDateTo(''); setFuelFilter('ALL') }}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Issuance Records</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} of {issuances.length}</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Code</th><th>Date</th><th>Time</th><th>Type</th><th>Vehicle / Equipment</th>
                <th>Amount (L)</th><th>Driver</th><th>Odometer</th><th>Purpose</th>
                <th>Authorised By</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="10" className="empty-state">No records match your filters</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.txn_code ? <TxnCodeBadge code={r.txn_code} /> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{r.time || '—'}</td>
                  <td><span className={`badge ${FUEL_COLORS[r.fuel_type] || 'badge-gold'}`}>{r.fuel_type}</span></td>
                  <td style={{ fontWeight: 600 }}>{r.vehicle || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>{r.amount} L</td>
                  <td>{r.driver || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{r.odometer ? `${r.odometer} km` : '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.purpose || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.authorized_by || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td style={{ display: 'flex', gap: 4 }}>
                      {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>}
                      {canDelete && <button className="btn btn-danger btn-sm"    onClick={() => handleDelete(r.id)}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="overlay" onClick={() => { setShowModal(false); setEditRecord(null) }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editRecord ? 'Edit' : 'New'} Fuel <span>Issuance</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" className="form-control" required value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" className="form-control" value={form.time}
                    onChange={e => setForm({ ...form, time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Fuel Type</label>
                  <select className="form-control" value={form.fuel_type}
                    onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
                    <option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (L) *</label>
                  <input type="number" className="form-control" required min="0.1" step="0.1"
                    value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>Equipment Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['vehicle', 'generator', 'earthmover'].map(t => (
                    <button key={t} type="button"
                      className={equipType === t ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      onClick={() => { setEquipType(t); setForm({ ...form, vehicle: '' }) }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>
                        {t === 'vehicle' ? 'directions_car' : t === 'generator' ? 'bolt' : 'construction'}
                      </span>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>{equipType === 'vehicle' ? 'Vehicle' : equipType === 'generator' ? 'Generator' : 'Equipment'} *</label>
                <select className="form-control" required value={form.vehicle}
                  onChange={e => setForm({ ...form, vehicle: e.target.value })}>
                  <option value="">Select…</option>
                  {equipType === 'vehicle'    && vehicles.map(v    => <option key={v.reg}      value={`${v.reg} – ${v.description}`}>{v.reg} – {v.description}</option>)}
                  {equipType === 'generator'  && generators.map(g  => <option key={g.gen_code} value={`${g.gen_code} – ${g.gen_name}`}>{g.gen_code} – {g.gen_name}</option>)}
                  {equipType === 'earthmover' && earthmovers.map(e => <option key={e.reg}      value={`${e.reg} – ${e.description}`}>{e.reg} – {e.description}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Driver / Operator</label>
                <select className="form-control" value={form.driver}
                  onChange={e => setForm({ ...form, driver: e.target.value })}>
                  <option value="">— Select driver —</option>
                  {employees.map(emp => {
                    const onLeave = isOnLeave(emp.id)
                    return (
                      <option key={emp.id} value={emp.id} disabled={onLeave}>
                        {emp.name}{onLeave ? ' (On Leave)' : ''}
                      </option>
                    )
                  })}
                </select>
                {driverOnLeave && (
                  <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>event_busy</span>
                    {selectedDriver?.name} is on approved leave — cannot be selected.
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Odometer (km)</label>
                  <input type="number" className="form-control" min="0" value={form.odometer}
                    onChange={e => setForm({ ...form, odometer: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Flowmeter Reading</label>
                  <input type="number" className="form-control" min="0" step="0.1" value={form.flowmeter}
                    onChange={e => setForm({ ...form, flowmeter: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Authorized By</label>
                  <select className="form-control" value={form.authorized_by}
                    onChange={e => setForm({ ...form, authorized_by: e.target.value })}>
                    <option value="">— Select authoriser —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.name}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Purpose</label>
                  <input className="form-control" value={form.purpose}
                    onChange={e => setForm({ ...form, purpose: e.target.value })} />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditRecord(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={driverOnLeave}>
                  <span className="material-icons">local_gas_station</span>
                  {editRecord ? 'Save Changes' : 'Confirm Issuance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
