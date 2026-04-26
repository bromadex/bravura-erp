import { useState, useEffect } from 'react'
import { useProcurement } from '../../hooks/useProcurement'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function StoreRequisitions() {
  const { storeRequisitions, createStoreRequisition, updateStoreRequisition, approveStoreRequisition, rejectStoreRequisition, loading, fetchAll } = useProcurement()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    department: '',
    requester_name: user?.full_name || user?.username || '',
    priority: 'normal',
    items: [{ name: '', category: '', qty: 1, unit: 'pcs', notes: '' }],
    notes: ''
  })

  const addItem = () => setForm({...form, items: [...form.items, { name: '', category: '', qty: 1, unit: 'pcs', notes: '' }]})
  const removeItem = (idx) => setForm({...form, items: form.items.filter((_,i) => i !== idx)})
  const updateItem = (idx, field, val) => {
    const newItems = [...form.items]
    newItems[idx][field] = val
    setForm({...form, items: newItems})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.department) return toast.error('Department required')
    if (!form.items.length || form.items.some(it => !it.name || !it.qty)) return toast.error('Each item needs name and quantity')
    try {
      if (editing) {
        await updateStoreRequisition(editing.id, { ...form, status: 'draft' })
        toast.success('Requisition updated')
      } else {
        await createStoreRequisition({ ...form, status: 'draft', requester_id: user?.id })
        toast.success('Requisition saved as draft')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const submitForApproval = async (id) => {
    await updateStoreRequisition(id, { status: 'submitted' })
    toast.success('Submitted for approval')
    await fetchAll()
  }

  const handleApprove = async (id) => {
    await approveStoreRequisition(id, user?.full_name || user?.username, user?.id)
    toast.success('Requisition approved')
  }

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection:')
    if (reason) {
      await rejectStoreRequisition(id, reason, user?.full_name || user?.username, user?.id)
      toast.success('Requisition rejected')
    }
  }

  const filtered = storeRequisitions.filter(r => filterStatus === 'all' || r.status === filterStatus)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Store Requisitions</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ date: new Date().toISOString().split('T')[0], department: '', requester_name: user?.full_name || user?.username || '', priority: 'normal', items: [{ name: '', category: '', qty: 1, unit: 'pcs', notes: '' }], notes: '' }); setModalOpen(true) }}>
          <span className="material-icons">add</span> New Requisition
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all','draft','submitted','approved','rejected','fulfilled'].map(s => (
          <button key={s} className={`btn btn-secondary btn-sm ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Department</th><th>Requester</th><th>Priority</th><th>Items</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan="8">No requisitions</td></tr> : filtered.map((r, idx) => (
              <tr key={r.id}>
                <td>{r.req_number || idx+1}</td>
                <td>{r.date}</td>
                <td>{r.department}</td>
                <td>{r.requester_name}</td>
                <td><span className={`badge ${r.priority === 'urgent' ? 'bg-yellow' : r.priority === 'critical' ? 'bg-red' : 'bg-blue'}`}>{r.priority}</span></td>
                <td>{(typeof r.items === 'string' ? JSON.parse(r.items) : r.items).length}</td>
                <td><span className={`badge bg-${r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : 'yellow'}`}>{r.status}</span></td>
                <td style={{ display: 'flex', gap: 4 }}>
                  {r.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(r); setForm({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items }); setModalOpen(true) }}>Edit</button>}
                  {r.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => submitForApproval(r.id)}>Submit</button>}
                  {r.status === 'submitted' && <button className="btn btn-green btn-sm" onClick={() => handleApprove(r.id)}>Approve</button>}
                  {r.status === 'submitted' && <button className="btn btn-red btn-sm" onClick={() => handleReject(r.id)}>Reject</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal – same as before but with dynamic item rows */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'New'} <span>Store Requisition</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div className="form-group"><label>Department</label><input className="form-control" required value={form.department} onChange={e => setForm({...form, department: e.target.value})} /></div>
                <div className="form-group"><label>Priority</label><select className="form-control" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}><option>normal</option><option>urgent</option><option>critical</option></select></div>
              </div>
              <div className="form-group"><label>Requester Name</label><input className="form-control" value={form.requester_name} onChange={e => setForm({...form, requester_name: e.target.value})} /></div>
              <div className="section-label">Items</div>
              {form.items.map((it, idx) => (
                <div key={idx} className="form-row" style={{ marginBottom: 8 }}>
                  <input className="form-control" placeholder="Item name" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} style={{ flex: 2 }} />
                  <input className="form-control" placeholder="Category" value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)} />
                  <input type="number" className="form-control" placeholder="Qty" value={it.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
                  <input className="form-control" placeholder="Unit" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} style={{ width: 80 }} />
                  <input className="form-control" placeholder="Notes" value={it.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Draft</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
