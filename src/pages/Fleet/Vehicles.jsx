import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const { vehicles, updateVehicle, deleteVehicle, addVehicleTrip, getVehicleFuelEfficiency, getNextService, getHealthScore, getHealthStatus, loading, fetchAll } = useFleet()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [tripModalOpen, setTripModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [form, setForm] = useState({
    reg: '', type: '', description: '', driver_name: '', status: 'Active',
    odometer_km: 0, last_service_date: '', service_interval_km: 5000,
    service_interval_days: 180, assigned_project: ''
  })
  const [tripForm, setTripForm] = useState({
    vehicle_id: '', date: new Date().toISOString().split('T')[0], driver_name: '',
    start_odometer: '', end_odometer: '', fuel_used: '', purpose: '', notes: ''
  })

  useEffect(() => { fetchAll() }, [])

  const openModal = (vehicle = null) => {
    if (vehicle) {
      setEditing(vehicle)
      setForm({
        reg: vehicle.reg, type: vehicle.type || '', description: vehicle.description || '',
        driver_name: vehicle.driver_name || '', status: vehicle.status || 'Active',
        odometer_km: vehicle.odometer_km || 0, last_service_date: vehicle.last_service_date || '',
        service_interval_km: vehicle.service_interval_km || 5000,
        service_interval_days: vehicle.service_interval_days || 180,
        assigned_project: vehicle.assigned_project || ''
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', driver_name: '', status: 'Active', odometer_km: 0, last_service_date: '', service_interval_km: 5000, service_interval_days: 180, assigned_project: '' })
    }
    setModalOpen(true)
  }

  const openTripModal = (vehicle) => {
    setSelectedVehicle(vehicle)
    setTripForm({
      vehicle_id: vehicle.id, date: new Date().toISOString().split('T')[0], driver_name: vehicle.driver_name || '',
      start_odometer: vehicle.odometer_km || 0, end_odometer: '', fuel_used: '', purpose: '', notes: ''
    })
    setTripModalOpen(true)
  }

  const handleTripSubmit = async (e) => {
    e.preventDefault()
    if (!tripForm.end_odometer || parseFloat(tripForm.end_odometer) <= parseFloat(tripForm.start_odometer)) {
      toast.error('End odometer must be greater than start')
      return
    }
    try {
      await addVehicleTrip({
        vehicle_id: tripForm.vehicle_id,
        date: tripForm.date,
        driver_name: tripForm.driver_name,
        start_odometer: parseFloat(tripForm.start_odometer),
        end_odometer: parseFloat(tripForm.end_odometer),
        fuel_used: parseFloat(tripForm.fuel_used) || 0,
        purpose: tripForm.purpose,
        notes: tripForm.notes,
        created_by: user?.full_name || user?.username,
      })
      toast.success('Trip logged successfully')
      setTripModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration required')
    try {
      await updateVehicle(editing.id, { ...form, odometer_km: parseFloat(form.odometer_km) || 0 })
      toast.success('Vehicle updated')
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vehicles</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Vehicle
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {loading ? <div>Loading...</div> : vehicles.length === 0 ? <div className="empty-state">No vehicles added</div> : vehicles.map(v => {
          const efficiency = getVehicleFuelEfficiency(v.reg)
          const nextService = getNextService(v)
          const healthScore = getHealthScore(v, 'vehicle')
          const health = getHealthStatus(healthScore)
          const isServiceOverdue = nextService?.type === 'date' && new Date(nextService) < new Date()

          return (
            <div key={v.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>directions_car</span>
                <span className="material-icons" style={{ fontSize: 20, color: v.status === 'Active' ? 'var(--green)' : 'var(--red)' }}>
                  {v.status === 'Active' ? 'check_circle' : 'error'}
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{v.reg}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{v.type || '—'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{v.description || ''}</div>
              {v.driver_name && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>person</span> {v.driver_name}</div>}
              {v.assigned_project && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>location_on</span> {v.assigned_project}</div>}
              <div style={{ marginTop: 8, fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>straighten</span> Odometer: <strong>{v.odometer_km?.toLocaleString()} km</strong></div>
              {efficiency && (
                <div style={{ fontSize: 12 }}>
                  <span className="material-icons" style={{ fontSize: 12 }}>local_gas_station</span> Fuel Efficiency: <strong>{efficiency.kmPerLiter?.toFixed(1)} km/L</strong> ({efficiency.litersPer100km?.toFixed(1)} L/100km)
                </div>
              )}
              <div style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 12 }}>build</span> Last Service: {v.last_service_date || '—'} {nextService && nextService.type === 'date' && (
                  <span style={{ color: isServiceOverdue ? 'var(--red)' : 'var(--green)' }}>
                    · Next: {nextService} {isServiceOverdue && '(Overdue)'}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons" style={{ fontSize: 16, color: health.color }}>{health.icon}</span>
                <span style={{ fontWeight: 600 }}>Health: {health.label}</span>
                <div className="progress-bar" style={{ flex: 1, background: 'var(--surface2)' }}><div className="progress-fill" style={{ width: `${healthScore}%`, background: health.color }}></div></div>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openTripModal(v)}><span className="material-icons">route</span> Log Trip</button>
                <button className="btn btn-secondary btn-sm" onClick={() => openModal(v)}><span className="material-icons">edit</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteVehicle(v.id)}><span className="material-icons">delete</span></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Vehicle Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Vehicle</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Registration *</label><input className="form-control" required value={form.reg} onChange={e => setForm({...form, reg: e.target.value.toUpperCase()})} /></div>
                <div className="form-group"><label>Type</label><input className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Description / Model</label><input className="form-control" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label>Driver Name</label><input className="form-control" value={form.driver_name} onChange={e => setForm({...form, driver_name: e.target.value})} /></div>
                <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option>Active</option><option>Grounded</option><option>Maintenance</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Odometer (km)</label><input type="number" className="form-control" value={form.odometer_km} onChange={e => setForm({...form, odometer_km: parseFloat(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Last Service Date</label><input type="date" className="form-control" value={form.last_service_date} onChange={e => setForm({...form, last_service_date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Service Interval (km)</label><input type="number" className="form-control" value={form.service_interval_km} onChange={e => setForm({...form, service_interval_km: parseInt(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Service Interval (days)</label><input type="number" className="form-control" value={form.service_interval_days} onChange={e => setForm({...form, service_interval_days: parseInt(e.target.value) || 0})} /></div>
              </div>
              <div className="form-group"><label>Assigned Project / Site</label><input className="form-control" value={form.assigned_project} onChange={e => setForm({...form, assigned_project: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trip Log Modal */}
      {tripModalOpen && selectedVehicle && (
        <div className="overlay" onClick={() => setTripModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log Trip for <span>{selectedVehicle.reg}</span></div>
            <form onSubmit={handleTripSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date</label><input type="date" className="form-control" required value={tripForm.date} onChange={e => setTripForm({...tripForm, date: e.target.value})} /></div>
                <div className="form-group"><label>Driver</label><input className="form-control" value={tripForm.driver_name} onChange={e => setTripForm({...tripForm, driver_name: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Odometer (km)</label><input type="number" step="0.1" className="form-control" required value={tripForm.start_odometer} onChange={e => setTripForm({...tripForm, start_odometer: parseFloat(e.target.value)})} /></div>
                <div className="form-group"><label>End Odometer (km)</label><input type="number" step="0.1" className="form-control" required value={tripForm.end_odometer} onChange={e => setTripForm({...tripForm, end_odometer: parseFloat(e.target.value)})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Fuel Used (L)</label><input type="number" step="0.1" className="form-control" value={tripForm.fuel_used} onChange={e => setTripForm({...tripForm, fuel_used: parseFloat(e.target.value)})} /></div>
                <div className="form-group"><label>Purpose</label><input className="form-control" value={tripForm.purpose} onChange={e => setTripForm({...tripForm, purpose: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={tripForm.notes} onChange={e => setTripForm({...tripForm, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTripModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Trip</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
