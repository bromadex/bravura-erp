import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  draft: 'badge-blue', submitted: 'badge-yellow',
  approved: 'badge-green', rejected: 'badge-red', fulfilled: 'badge-purple',
}

export default function StoreRequisitions() {
  const { storeRequisitions, createStoreRequisition, updateStoreRequisition, approveStoreRequisition, rejectStoreRequisition, loading } = useProcurement()
  const { user } = useAuth()
  const canEdit = useCanEdit('procurement', 'store-requisitions')
  const canApprove = useCanApprove('procurement', 'store-requisitions')
  
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewReq, setViewReq] = useState(null)

  const emptyForm = () => ({
    date: new Date().toISOString().split('T')[0],
    department: '', priority: 'normal',
    requester_name: user?.full_name || user?.username || '',
    items: [{ name:'', category:'', qty:1, unit:'pcs', notes:'' }],
    notes: '',
  })
  const [form, setForm] = useState(emptyForm)

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items })
    setModalOpen(true)
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name:'', category:'', qty:1, unit:'pcs', notes:'' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_,idx) => idx !== i) }))
  const setItem = (i, field, val) => setForm(f => {
    const items = [...f.items]; items[i] = { ...items[i], [field]: val }; return { ...f, items }
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.department) return toast.error('Department required')
    if (form.items.some(it => !it.name || !it.qty)) return toast.error('All items need name & quantity')
    try {
      if (editing) {
        await updateStoreRequisition(editing.id, { ...form, items: form.items })
        toast.success('Requisition updated')
      } else {
        await createStoreRequisition({ ...form, status: 'draft', requester_id: user?.id })
        toast.success('Requisition saved as draft')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const submitForApproval = async (id) => {
    try { await updateStoreRequisition(id, { status: 'submitted' }); toast.success('Submitted for approval') }
    catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (id) => {
    try { await approveStoreRequisition(id, user?.full_name || user?.username, user?.id); toast.success('Approved') }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    try { await rejectStoreRequisition(id, reason, user?.full_name || user?.username, user?.id); toast.success('Rejected') }
    catch (err) { toast.error(err.message) }
  }

  const filtered = storeRequisitions.filter(r => filterStatus === 'all' || r.status === filterStatus)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Store Requisitions</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="material-icons">add</span> New Requisition
          </button>
        )}
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {['all','draft','submitted','approved','rejected','fulfilled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className="btn btn-secondary btn-sm"
            style={{ textTransform:'capitalize', background: filterStatus === s ? 'var(--gold)' : '', color: filterStatus === s ? '#0b0f1a' : '' }}>
            {s}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SR #</th><th>Date</th><th>Department</th><th>Requester</th>
              <th>Priority</th><th>Items</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign:'center', padding:40 }}>Loading...<\/td><\/tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign:'center', padding:40 }}>No requisitions found<\/td><\/tr>
            ) : filtered.map((r, idx) => {
              const items = typeof r.items === 'string' ? JSON.parse(r.items || '[]') : (r.items || [])
              const showApproveButtons = canApprove && r.status === 'submitted'
              const showEditButtons = canEdit && (r.status === 'draft' || r.status === 'submitted')
              return (
                <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => setViewReq(r)}>
                  <td style={{ fontFamily:'var(--mono)', color:'var(--gold)' }}>{r.req_number || `SR-${idx+1}`}<\/td>
                  <td>{r.date}<\/td>
                  <td style={{ fontWeight:600 }}>{r.department}<\/td>
                  <td>{r.requester_name}<\/td>
                  <td><span className={`badge badge-${r.priority === 'critical' ? 'red' : r.priority === 'urgent' ? 'yellow' : 'blue'}`}>{r.priority}<\/span><\/td>
                  <td style={{ fontFamily:'var(--mono)' }}>{items.length} item{items.length !== 1 ? 's' : ''}<\/td>
                  <td><span className={`badge ${STATUS_COLORS[r.status] || 'badge-blue'}`}>{r.status}<\/span><\/td>
                  <td onClick={e => e.stopPropagation()} style={{ display:'flex', gap:4 }}>
                    {showEditButtons && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons">edit<\/span><\/button>
                        {r.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => submitForApproval(r.id)}>Submit<\/button>}
                      </>
                    )}
                    {showApproveButtons && (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r.id)}><span className="material-icons">check_circle<\/span> Approve<\/button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(r.id)}><span className="material-icons">cancel<\/span> Reject<\/button>
                      </>
                    )}
                  <\/td>
                <\/tr>
              )
            })}
          <\/tbody>
        <\/table>
      <\/div>

      {/* Modal code remains the same... */}
      {modalOpen && (
        {/* ... existing modal JSX ... */}
      )}
      {viewReq && (
        {/* ... existing view modal JSX ... */}
      )}
    <\/div>
  )
}
