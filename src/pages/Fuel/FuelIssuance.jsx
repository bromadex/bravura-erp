// src/pages/Fuel/FuelIssuance.jsx
//
// STAGE 10.6 ENFORCEMENT:
// The free-text "Driver" input is replaced with an employee dropdown
// sourced from HRContext. On-leave employees appear disabled with
// "(On Leave)" appended to their name. useLeave() reads from the
// in-memory cache built by LeaveContext — zero extra DB calls.
//
// If an HR-managed employee is on leave and somehow selected anyway,
// handleSubmit blocks the submission with a toast and returns.
//
// All other logic is unchanged from the original file.

import { useState, useEffect } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useHR } from '../../contexts/HRContext'
import { useLeave } from '../../contexts/LeaveContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

export default function FuelIssuance() {
  const { issuances, addIssuance, loading, fetchAll } = useFuel()
  const { employees } = useHR()
  const { isOnLeave } = useLeave()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'issuance')

  const [showModal, setShowModal] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [earthmovers, setEarthmovers] = useState([])

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
    fuel_type: 'DIESEL',
    amount: '',
    vehicle: '',
    driver: '',             // stores employee ID or free-text name
    authorized_by: user?.full_name || user?.username || '',
    purpose: '',
    odometer: '',
    flowmeter: '',
  })
  const [equipType, setEquipType] = useState('vehicle')

  useEffect(() => {
    const fetchEquipment = async () => {
      const [vRes, gRes, eRes] = await Promise.all([
        supabase.from('fleet').select('reg, description').eq('status', 'Active'),
        supabase.from('generators').select('gen_code, gen_name'),
        supabase.from('earth_movers').select('reg, description'),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthmovers(eRes.data)
    }
    fetchEquipment()
  }, [])

  // Active employees sorted by name — on-leave ones still listed but disabled
  const activeEmployees = [...employees]
    .filter(e => e.status !== 'Terminated')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const selectedDriverId = form.driver
  const selectedDriver = employees.find(e => e.id === selectedDriverId)
  const driverOnLeave = selectedDriverId && isOnLeave(selectedDriverId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (equipType === 'vehicle' && !form.vehicle) return toast.error('Select a vehicle')

    // ✅ 10.6 enforcement: block if selected driver is on leave
    if (driverOnLeave) {
      toast.error(`${selectedDriver?.name} is currently on approved leave and cannot be selected as driver.`)
      return
    }

    try {
      // Resolve driver name: if it matches an employee record use their name,
      // otherwise use the raw value (backward-compatible with old free-text records)
      const driverName = selectedDriver?.name || form.driver

      await addIssuance({
        ...form,
        amount: parseFloat(form.amount),
        flowmeter: parseFloat(form.flowmeter) || 0,
        odometer: form.odometer ? parseFloat(form.odometer) : null,
        user_name: user?.full_name || user?.username,
        vehicle: form.vehicle,
        driver: driverName,
        authorized_by: form.authorized_by,
      })
      toast.success(`Issued ${form.amount} L`)
      setShowModal(false)
      setForm({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        fuel_type: 'DIESEL',
        amount: '', vehicle: '', driver: '',
        authorized_by: user?.full_name || user?.username || '',
        purpose: '', odometer: '', flowmeter: '',
      })
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Issuance</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <span className="material-icons">local_gas_station</span> New Issuance
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Fuel Type</th>
              <th>Vehicle / Equipment</th><th>Amount (L)</th>
              <th>Driver</th><th>Authorized By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>
            ) : issuances.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>No records</td></tr>
            ) : issuances.map(i => (
              <tr key={i.id}>
                <td>{i.date}</td>
                <td>{i.time}</td>
                <td><span className="badge badge-blue">{i.fuel_type}</span></td>
                <td>{i.vehicle || '—'}</td>
                <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{i.amount} L</td>
                <td>{i.driver || '—'}</td>
                <td style={{ color: 'var(--text-dim)' }}>{i.authorized_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Issuance Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              New Fuel <span>Issuance</span>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" className="form-control" required
                    value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" className="form-control"
                    value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Fuel Type</label>
                  <select className="form-control" value={form.fuel_type}
                    onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
                    <option>DIESEL</option>
                    <option>PETROL</option>
                    <option>PARAFFIN</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (Litres) *</label>
                  <input type="number" className="form-control" required min="0" step="0.1"
                    value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>

              {/* Equipment type */}
              <div className="form-group">
                <label>Equipment Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['vehicle', 'generator', 'earthmover'].map(t => (
                    <button key={t} type="button"
                      className={equipType === t ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                      onClick={() => { setEquipType(t); setForm({ ...form, vehicle: '' }) }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>
                  {equipType === 'vehicle' ? 'Vehicle' : equipType === 'generator' ? 'Generator' : 'Equipment'} *
                </label>
                <select className="form-control" required
                  value={form.vehicle} onChange={e => setForm({ ...form, vehicle: e.target.value })}>
                  <option value="">Select {equipType}...</option>
                  {equipType === 'vehicle' && vehicles.map(v => (
                    <option key={v.reg} value={`${v.reg} – ${v.description}`}>
                      {v.reg} – {v.description}
                    </option>
                  ))}
                  {equipType === 'generator' && generators.map(g => (
                    <option key={g.gen_code} value={`${g.gen_code} – ${g.gen_name}`}>
                      {g.gen_code} – {g.gen_name}
                    </option>
                  ))}
                  {equipType === 'earthmover' && earthmovers.map(em => (
                    <option key={em.reg} value={`${em.reg} – ${em.description}`}>
                      {em.reg} – {em.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* ✅ 10.6: Driver dropdown with on-leave guard */}
              <div className="form-group">
                <label>Driver / Operator</label>
                <select className="form-control" value={form.driver}
                  onChange={e => setForm({ ...form, driver: e.target.value })}>
                  <option value="">— Select driver —</option>
                  {activeEmployees.map(emp => {
                    const onLeave = isOnLeave(emp.id)
                    return (
                      <option key={emp.id} value={emp.id} disabled={onLeave}>
                        {emp.name}{onLeave ? ' (On Leave)' : ''}
                      </option>
                    )
                  })}
                </select>
                {/* Visual warning if on-leave employee is somehow selected */}
                {driverOnLeave && (
                  <div style={{
                    marginTop: 6, padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(248,113,113,.12)',
                    border: '1px solid rgba(248,113,113,.3)',
                    fontSize: 12, color: 'var(--red)',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>event_busy</span>
                    {selectedDriver?.name} is on approved leave — cannot be selected.
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Odometer (km)</label>
                  <input type="number" className="form-control" min="0"
                    value={form.odometer} onChange={e => setForm({ ...form, odometer: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Flowmeter Reading</label>
                  <input type="number" className="form-control" min="0" step="0.1"
                    value={form.flowmeter} onChange={e => setForm({ ...form, flowmeter: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Authorized By</label>
                  <input className="form-control" value={form.authorized_by}
                    onChange={e => setForm({ ...form, authorized_by: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Purpose</label>
                  <input className="form-control" value={form.purpose}
                    onChange={e => setForm({ ...form, purpose: e.target.value })} />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={driverOnLeave}>
                  <span className="material-icons">local_gas_station</span> Confirm Issuance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
