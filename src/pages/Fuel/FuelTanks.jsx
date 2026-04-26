import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import toast from 'react-hot-toast'

export default function FuelTanks() {
  const { tanks, addTank, updateTank, deleteTank, loading } = useFuel()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', capacity: 0, current_level: 0, fuel_type: 'DIESEL', alert_threshold: 200, location: '', notes: ''
  })

  const openModal = (tank = null) => {
    if (tank) {
      setEditing(tank)
      setForm({
        name: tank.name,
        capacity: tank.capacity,
        current_level: tank.current_level || 0,
        fuel_type: tank.fuel_type || 'DIESEL',
        alert_threshold: tank.alert_threshold || 200,
        location: tank.location || '',
        notes: tank.notes || '',
      })
    } else {
      setEditing(null)
      setForm({ name: '', capacity: 0, current_level: 0, fuel_type: 'DIESEL', alert_threshold: 200, location: '', notes: '' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || form.capacity <= 0) return toast.error('Name and capacity required')
    try {
      if (editing) {
        await updateTank(editing.id, form)
        toast.success('Tank updated')
      } else {
        await addTank(form)
        toast.success('Tank added')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete tank "${name}"?`)) {
      await deleteTank(id)
      toast.success('Deleted')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Tanks</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Tank
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Capacity (L)</th><th>Current Level (L)</th><th>Fuel Type</th><th>Alert Threshold</th><th>Location</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7">Loading...</td></tr>
            ) : tanks.length === 0 ? (
              <tr><td colSpan="7">No tanks</td></tr>
            ) : (
              tanks.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>{t.capacity.toLocaleString()}</td>
                  <td style={{ color: t.current_level < t.alert_threshold ? 'var(--red)' : 'var(--green)' }}>{t.current_level.toLocaleString()}</td>
                  <td><span className="badge bg-blue">{t.fuel_type}</span></td>
                  <td>{t.alert_threshold} L</td>
                  <td>{t.location || '-'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openModal(t)}><span className="material-icons">edit</span></button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.id, t.name)}><span className="material-icons">delete</span></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Fuel Tank</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Tank Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="form-group"><label>Capacity (Litres) *</label><input type="number" className="form-control" required min="1" value={form.capacity} onChange={e => setForm({...form, capacity: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Current Level (Litres)</label><input type="number" className="form-control" min="0" value={form.current_level} onChange={e => setForm({...form, current_level: parseFloat(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Fuel Type</label><select className="form-control" value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}><option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Alert Threshold (L)</label><input type="number" className="form-control" min="0" value={form.alert_threshold} onChange={e => setForm({...form, alert_threshold: parseFloat(e.target.value) || 0})} /></div>
                <div className="form-group"><label>Location</label><input className="form-control" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
