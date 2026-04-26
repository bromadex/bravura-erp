import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function HeavyEquipment() {
  const { earthMovers, updateEarthMover, deleteEarthMover, addEquipmentHourLog, loading, fetchAll } = useFleet()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [hourModalOpen, setHourModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedEquipment, setSelectedEquipment] = useState(null)
  const [fuelMap, setFuelMap] = useState({})
  const [form, setForm] = useState({
    reg: '', type: '', description: '', operator_name: '', status: 'Active',
    hour_meter: 0, last_service_date: '', service_interval_hours: 500, assigned_project: ''
  })
  const [hourForm, setHourForm] = useState({
    equipment_id: '', date: new Date().toISOString().split('T')[0], operator_name: '',
    start_hour_meter: '', end_hour_meter: '', fuel_used: '', task_description: '', notes: ''
  })

  useEffect(() => {
    const loadFuel = async () => {
      const { data } = await supabase.from('fuel_log').select('vehicle, amount')
      if (data) {
        const map = {}
        data.forEach(f => { if (f.vehicle) map[f.vehicle] = (map[f.vehicle] || 0) + (f.amount || 0) })
        setFuelMap(map)
      }
    }
    loadFuel()
    fetchAll()
  }, [])

  const openModal = (eq = null) => {
    if (eq) {
      setEditing(eq)
      setForm({
        reg: eq.reg, type: eq.type || '', description: eq.description || '',
        operator_name: eq.operator_name || '', status: eq.status || 'Active',
        hour_meter: eq.hour_meter || 0, last_service_date: eq.last_service_date || '',
        service_interval_hours: eq.service_interval_hours || 500,
        assigned_project: eq.assigned_project || ''
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', operator_name: '', status: 'Active', hour_meter: 0, last_service_date: '', service_interval_hours: 500, assigned_project: '' })
    }
    setModalOpen(true)
  }

  const openHourModal = (eq) => {
    setSelectedEquipment(eq)
    setHourForm({
      equipment_id: eq.id, date: new Date().toISOString().split('T')[0], operator_name: eq.operator_name || '',
      start_hour_meter: eq.hour_meter || 0, end_hour_meter: '', fuel_used: '', task_description: '', notes: ''
    })
    setHourModalOpen(true)
  }

  const handleHourSubmit = async (e) => {
    e.preventDefault()
    if (!hourForm.end_hour_meter || parseFloat(hourForm.end_hour_meter) <= parseFloat(hourForm.start_hour_meter)) {
      toast.error('End hour meter must be greater than start')
      return
    }
    try {
      await addEquipmentHourLog({
        equipment_id: hourForm.equipment_id,
        date: hourForm.date,
        operator_name: hourForm.operator_name,
        start_hour_meter: parseFloat(hourForm.start_hour_meter),
        end_hour_meter: parseFloat(hourForm.end_hour_meter),
        fuel_used: parseFloat(hourForm.fuel_used) || 0,
        task_description: hourForm.task_description,
        notes: hourForm.notes,
        created_by: user?.full_name || user?.username,
      })
      toast.success('Hour log recorded')
      setHourModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Equipment ID required')
    try {
      await updateEarthMover(editing.id, { ...form, hour_meter: parseFloat(form.hour_meter) || 0 })
      toast.success('Equipment updated')
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Heavy Equipment</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Equipment
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {loading ? <div>Loading...</div> : earthMovers.length === 0 ? <div className="empty-state">No equipment added</div> : earthMovers.map(e => {
          const totalFuel = fuelMap[e.reg] || 0
          const efficiency = e.hour_meter > 0 ? totalFuel / e.hour_meter : null
          const isActive = e.status === 'Active'
          return (
            <div key={e.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>construction</span>
                <span className="material-icons" style={{ fontSize: 20, color: isActive ? 'var(--green)' : 'var(--red)' }}>
                  {isActive ? 'check_circle' : 'error'}
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{e.reg}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{e.type || '—'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{e.description || ''}</div>
              {e.operator_name && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>person</span> {e.operator_name}</div>}
              {e.assigned_project && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>location_on</span> {e.assigned_project}</div>}
              <div style={{ marginTop: 8, fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>schedule</span> Hour Meter: <strong>{e.hour_meter?.toLocaleString()} hrs</strong></div>
              {efficiency && (
                <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>local_gas_station</span> Fuel Efficiency: <strong>{efficiency.toFixed(1)} L/hour</strong></div>
              )}
              <div style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 12 }}>build</span> Last Service: {e.last_service_date || '—'}
                {e.last_service_date && e.service_interval_hours && (
                  <span> · Next: {e.hour_meter + e.service_interval_hours} hrs</span>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>local_gas_station</span> Total Fuel: <strong>{totalFuel.toLocaleString()} L</strong></div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openHourModal(e)}><span className="material-icons">schedule</span> Log Hours</button>
                <button className="btn btn-secondary btn-sm" onClick={() => openModal(e)}><span className="material-icons">edit</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteEarthMover(e.id)}><span className="material-icons">delete</span></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Heavy Equipment</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Equipment ID / Reg *</label><input className="form-control" required value={form.reg} onChange={e => setForm({...form, reg: e.target.value.toUpperCase()})} /></div>
                <div className="form-group"><label>Type</label><input className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Description / Model</label><input className="form-control" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label>Operator Name</label><input className="form-control" value={form.operator_name} onChange={e => setForm({...form, operator_name: e.target.value})} /></div>
                <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option>Active</option><option>Grounded</option><option>Maintenance</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Hour Meter (hours)</label><input type="number" className="form-control" value={form.hour_meter} onChange={e => setForm({...form, hour_meter: parseFloat(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Last Service Date</label><input type="date" className="form-control" value={form.last_service_date} onChange={e => setForm({...form, last_service_date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Service Interval (hours)</label><input type="number" className="form-control" value={form.service_interval_hours} onChange={e => setForm({...form, service_interval_hours: parseInt(e.target.value) || 500})} /></div>
                <div className="form-group"><label>Assigned Project / Site</label><input className="form-control" value={form.assigned_project} onChange={e => setForm({...form, assigned_project: e.target.value})} /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hour Log Modal */}
      {hourModalOpen && selectedEquipment && (
        <div className="overlay" onClick={() => setHourModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log Hours for <span>{selectedEquipment.reg}</span></div>
            <form onSubmit={handleHourSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date</label><input type="date" className="form-control" required value={hourForm.date} onChange={e => setHourForm({...hourForm, date: e.target.value})} /></div>
                <div className="form-group"><label>Operator</label><input className="form-control" value={hourForm.operator_name} onChange={e => setHourForm({...hourForm, operator_name: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Hour Meter</label><input type="number" step="0.1" className="form-control" required value={hourForm.start_hour_meter} onChange={e => setHourForm({...hourForm, start_hour_meter: parseFloat(e.target.value)})} /></div>
                <div className="form-group"><label>End Hour Meter</label><input type="number" step="0.1" className="form-control" required value={hourForm.end_hour_meter} onChange={e => setHourForm({...hourForm, end_hour_meter: parseFloat(e.target.value)})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Fuel Used (L)</label><input type="number" step="0.1" className="form-control" value={hourForm.fuel_used} onChange={e => setHourForm({...hourForm, fuel_used: parseFloat(e.target.value)})} /></div>
                <div className="form-group"><label>Task Description</label><input className="form-control" value={hourForm.task_description} onChange={e => setHourForm({...hourForm, task_description: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={hourForm.notes} onChange={e => setHourForm({...hourForm, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setHourModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Hours</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
