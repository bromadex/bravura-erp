// src/pages/Fleet/Vehicles.jsx
// Vehicles with employee-linked driver dropdown

import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle, loading, fetchAll } = useFleet()
  const canEdit   = useCanEdit('fleet', 'vehicles')
  const canDelete = useCanDelete('fleet', 'vehicles')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [fuelMap,   setFuelMap]   = useState({})
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState({
    reg: '', type: '', description: '', driver_name: '', driver_id: '', status: 'Active',
    odometer_km: '', last_service_date: '', service_interval_km: '', assigned_project: ''
  })

  useEffect(() => {
    const fetchData = async () => {
      const [fuelRes, empRes] = await Promise.all([
        supabase.from('fuel_log').select('vehicle, amount'),
        supabase.from('employees').select('id, name, employee_number').neq('status', 'Terminated').order('name'),
      ])
      if (fuelRes.data) {
        const map = {}
        fuelRes.data.forEach(f => { if (f.vehicle) map[f.vehicle] = (map[f.vehicle] || 0) + (f.amount || 0) })
        setFuelMap(map)
      }
      if (empRes.data) setEmployees(empRes.data)
    }
    fetchData()
  }, [vehicles])

  const openModal = (vehicle = null) => {
    if (vehicle) {
      setEditing(vehicle)
      setForm({
        reg: vehicle.reg, type: vehicle.type || '', description: vehicle.description || '',
        driver_name: vehicle.driver_name || '', driver_id: vehicle.driver_id || '',
        status: vehicle.status || 'Active', odometer_km: vehicle.odometer_km || '',
        last_service_date: vehicle.last_service_date || '',
        service_interval_km: vehicle.service_interval_km || '',
        assigned_project: vehicle.assigned_project || ''
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', driver_name: '', driver_id: '', status: 'Active', odometer_km: '', last_service_date: '', service_interval_km: '', assigned_project: '' })
    }
    setModalOpen(true)
  }

  const handleDriverSelect = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({ ...f, driver_id: empId, driver_name: emp?.name || '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration required')
    try {
      const payload = {
        ...form,
        odometer_km: form.odometer_km ? parseFloat(form.odometer_km) : null,
        service_interval_km: form.service_interval_km ? parseInt(form.service_interval_km) : null,
      }
      if (editing) {
        await updateVehicle(editing.id, payload)
        toast.success('Vehicle updated')
      } else {
        await addVehicle(payload)
        toast.success('Vehicle added')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (vehicle) => {
    if (window.confirm(`Delete vehicle "${vehicle.reg}"?`)) {
      await deleteVehicle(vehicle.id)
      toast.success('Deleted')
    }
  }

  const vehicleTypes = ['Pickup', 'LDV', 'Bus', 'Truck', 'Tanker', 'Crane', 'Grader', 'Water Bowser', 'Other']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vehicles</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            <span className="material-icons">add</span> Add Vehicle
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading vehicles…</div>
      ) : vehicles.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>directions_car</span>
          <p>No vehicles added yet</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {vehicles.map(v => {
            const totalFuel = fuelMap[v.reg] || 0
            return (
              <div key={v.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>directions_car</span>
                  <span className={`badge ${v.status === 'Active' ? 'bg-green' : v.status === 'Maintenance' ? 'bg-yellow' : 'bg-red'}`}>{v.status}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{v.reg}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{v.type || '—'} {v.description ? `· ${v.description}` : ''}</div>
                {v.driver_name && (
                  <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--teal)' }}>person</span>
                    {v.driver_name}
                  </div>
                )}
                {v.assigned_project && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>📍 {v.assigned_project}</div>
                )}
                {v.odometer_km != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>🔢 {Number(v.odometer_km).toLocaleString()} km</div>
                )}
                <div style={{ marginTop: 8, fontSize: 12 }}>⛽ Total Fuel: <strong>{totalFuel.toLocaleString()} L</strong></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openModal(v)}><span className="material-icons">edit</span></button>}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v)}><span className="material-icons">delete</span></button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Vehicle</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Registration *</label>
                  <input className="form-control" required value={form.reg} onChange={e => setForm({...form, reg: e.target.value.toUpperCase()})} placeholder="e.g. ABC 123Z" />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="">— Select type —</option>
                    {vehicleTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description / Model</label>
                <input className="form-control" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Toyota Hilux D4D" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Assigned Driver</label>
                  <select className="form-control" value={form.driver_id} onChange={e => handleDriverSelect(e.target.value)}>
                    <option value="">— Select employee —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option>Active</option>
                    <option>Grounded</option>
                    <option>Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Odometer (km)</label>
                  <input type="number" className="form-control" value={form.odometer_km} onChange={e => setForm({...form, odometer_km: e.target.value})} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Service Interval (km)</label>
                  <input type="number" className="form-control" value={form.service_interval_km} onChange={e => setForm({...form, service_interval_km: e.target.value})} placeholder="5000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Last Service Date</label>
                  <input type="date" className="form-control" value={form.last_service_date} onChange={e => setForm({...form, last_service_date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Assigned Project</label>
                  <input className="form-control" value={form.assigned_project} onChange={e => setForm({...form, assigned_project: e.target.value})} placeholder="e.g. Boxcut" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
