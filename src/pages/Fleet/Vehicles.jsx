import { useState } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const { vehicles, addVehicle, updateVehicle, deleteVehicle, getVehicleFuel, loading, fetchAll } = useFleet()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    reg: '', type: '', description: '', driver_name: '', status: 'Active'
  })

  const openModal = (vehicle = null) => {
    if (vehicle) {
      setEditing(vehicle)
      setForm({
        reg: vehicle.reg, type: vehicle.type || '', description: vehicle.description || '',
        driver_name: vehicle.driver_name || '', status: vehicle.status || 'Active'
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', driver_name: '', status: 'Active' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration required')
    try {
      if (editing) {
        await updateVehicle(editing.id, form)
        toast.success('Vehicle updated')
      } else {
        await addVehicle(form)
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vehicles</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Vehicle
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {loading ? (
          <div>Loading...</div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">No vehicles added</div>
        ) : (
          vehicles.map(v => {
            const totalFuel = getVehicleFuel(v.reg)
            return (
              <div key={v.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>directions_car</span>
                  <span className={`badge ${v.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{v.status}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{v.reg}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{v.type || '—'}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{v.description || ''}</div>
                {v.driver_name && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>person</span> {v.driver_name}</div>}
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 500 }}>⛽ Total Fuel: <strong>{totalFuel.toLocaleString()} L</strong></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openModal(v)}><span className="material-icons">edit</span></button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v)}><span className="material-icons">delete</span></button>
                </div>
              </div>
            )
          })
        )}
      </div>

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
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
