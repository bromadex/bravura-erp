import { useState } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function HeavyEquipment() {
  const { earthMovers, addEarthMover, updateEarthMover, deleteEarthMover, loading, fetchAll } = useFleet()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [fuelMap, setFuelMap] = useState({})
  const [form, setForm] = useState({
    reg: '', type: '', description: '', operator_name: '', status: 'Active'
  })

  // Fetch fuel consumption for heavy equipment (from fuel_log by reg)
  useState(() => {
    const loadFuel = async () => {
      const { data } = await supabase.from('fuel_log').select('vehicle, amount')
      if (data) {
        const map = {}
        data.forEach(f => {
          if (f.vehicle) map[f.vehicle] = (map[f.vehicle] || 0) + (f.amount || 0)
        })
        setFuelMap(map)
      }
    }
    loadFuel()
  }, [earthMovers])

  const openModal = (eq = null) => {
    if (eq) {
      setEditing(eq)
      setForm({
        reg: eq.reg, type: eq.type || '', description: eq.description || '',
        operator_name: eq.operator_name || '', status: eq.status || 'Active'
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', operator_name: '', status: 'Active' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Equipment ID required')
    try {
      if (editing) {
        await updateEarthMover(editing.id, form)
        toast.success('Equipment updated')
      } else {
        await addEarthMover(form)
        toast.success('Equipment added')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (eq) => {
    if (window.confirm(`Delete equipment "${eq.reg}"?`)) {
      await deleteEarthMover(eq.id)
      toast.success('Deleted')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Heavy Equipment</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Equipment
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {loading ? (
          <div>Loading...</div>
        ) : earthMovers.length === 0 ? (
          <div className="empty-state">No equipment added</div>
        ) : (
          earthMovers.map(e => {
            const totalFuel = fuelMap[e.reg] || 0
            return (
              <div key={e.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>construction</span>
                  <span className={`badge ${e.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{e.status}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{e.reg}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{e.type || '—'}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{e.description || ''}</div>
                {e.operator_name && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>person</span> {e.operator_name}</div>}
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 500 }}>⛽ Total Fuel: <strong>{totalFuel.toLocaleString()} L</strong></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openModal(e)}><span className="material-icons">edit</span></button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e)}><span className="material-icons">delete</span></button>
                </div>
              </div>
            )
          })
        )}
      </div>

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
