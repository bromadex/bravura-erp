import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  draft: 'badge-blue', submitted: 'badge-yellow',
  approved: 'badge-green', rejected: 'badge-red', fulfilled: 'badge-purple',
}

export default function StoreRequisitions() {
  const { storeRequisitions, createStoreRequisition, updateStoreRequisition, approveStoreRequisition, rejectStoreRequisition, loading } = useProcurement()
  const { user } = useAuth()
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
        <button className="btn btn-primary" onClick={openCreate}>
          <span className="material-icons">add</span> New Requisition
        </button>
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
                    {r.status === 'draft' && <>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons">edit<\/span><\/button>
                      <button className="btn btn-primary btn-sm" onClick={() => submitForApproval(r.id)}>Submit<\/button>
                    </>}
                    {r.status === 'submitted' && <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r.id)}><span className="material-icons">check_circle<\/span> Approve<\/button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleReject(r.id)}><span className="material-icons">cancel<\/span> Reject<\/button>
                    </>}
                  <\/td>
                <\/tr>
              )
            })}
          <\/tbody>
        <\/table>
      <\/div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'New'} Store <span>Requisition<\/span><\/div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>DATE<\/label><input type="date" className="form-control" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))} /><\/div>
                <div className="form-group"><label>DEPARTMENT *<\/label><input className="form-control" required value={form.department} onChange={e => setForm(f => ({...f, department:e.target.value}))} /><\/div>
                <div className="form-group"><label>PRIORITY<\/label>
                  <select className="form-control" value={form.priority} onChange={e => setForm(f => ({...f, priority:e.target.value}))}>
                    <option value="normal">Normal<\/option>
                    <option value="urgent">Urgent<\/option>
                    <option value="critical">Critical<\/option>
                  <\/select>
                <\/div>
              <\/div>
              <div className="form-group"><label>REQUESTED BY<\/label><input className="form-control" value={form.requester_name} onChange={e => setForm(f => ({...f, requester_name:e.target.value}))} /><\/div>

              <div style={{ margin:'16px 0 8px', fontWeight:700, fontSize:12, color:'var(--text-dim)' }}>ITEMS REQUESTED<\/div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 0.7fr 0.7fr 1.5fr auto', gap:6, marginBottom:6, fontSize:9, fontFamily:'var(--mono)', color:'var(--text-dim)' }}>
                <span>ITEM NAME<\/span><span>CATEGORY<\/span><span>QTY<\/span><span>UNIT<\/span><span>NOTES<\/span><span><\/span>
              <\/div>
              {form.items.map((it, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 0.7fr 0.7fr 1.5fr auto', gap:6, marginBottom:6 }}>
                  <input className="form-control" placeholder="Item name" value={it.name} onChange={e => setItem(i,'name',e.target.value)} />
                  <input className="form-control" placeholder="Category" value={it.category} onChange={e => setItem(i,'category',e.target.value)} />
                  <input type="number" className="form-control" min="1" value={it.qty} onChange={e => setItem(i,'qty',parseInt(e.target.value)||1)} />
                  <input className="form-control" placeholder="pcs" value={it.unit} onChange={e => setItem(i,'unit',e.target.value)} />
                  <input className="form-control" placeholder="Notes" value={it.notes} onChange={e => setItem(i,'notes',e.target.value)} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}><span className="material-icons">close<\/span><\/button>
                <\/div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginBottom:16 }}>
                <span className="material-icons">add<\/span> Add Item
              <\/button>

              <div className="form-group"><label>NOTES \/ JUSTIFICATION<\/label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} /><\/div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel<\/button>
                <button type="submit" className="btn btn-primary">Save Draft<\/button>
              <\/div>
            <\/form>
          <\/div>
        <\/div>
      )}

      {/* View Modal */}
      {viewReq && (
        <div className="overlay" onClick={() => setViewReq(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewReq.req_number} — <span>{viewReq.department}<\/span><\/div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16, fontSize:13 }}>
              <div><span style={{ color:'var(--text-dim)' }}>Date:<\/span> {viewReq.date}<\/div>
              <div><span style={{ color:'var(--text-dim)' }}>Status:<\/span> <span className={`badge ${STATUS_COLORS[viewReq.status]}`}>{viewReq.status}<\/span><\/div>
              <div><span style={{ color:'var(--text-dim)' }}>Requested by:<\/span> {viewReq.requester_name}<\/div>
              <div><span style={{ color:'var(--text-dim)' }}>Priority:<\/span> {viewReq.priority}<\/div>
              {viewReq.approver_name && <div><span style={{ color:'var(--text-dim)' }}>Approved by:<\/span> {viewReq.approver_name}<\/div>}
              {viewReq.rejection_reason && <div style={{ gridColumn:'span 2', color:'var(--red)' }}>Rejected: {viewReq.rejection_reason}<\/div>}
            <\/div>
            <table>
              <thead><tr><th>Item<\/th><th>Category<\/th><th>Qty<\/th><th>Unit<\/th><th>Notes<\/th><\/tr><\/thead>
              <tbody>
                {(typeof viewReq.items === 'string' ? JSON.parse(viewReq.items || '[]') : viewReq.items).map((it, i) => (
                  <tr key={i}><td>{it.name}<\/td><td>{it.category}<\/td><td style={{ fontFamily:'var(--mono)' }}>{it.qty}<\/td><td>{it.unit}<\/td><td style={{ color:'var(--text-dim)' }}>{it.notes}<\/td><\/tr>
                ))}
              <\/tbody>
            <\/table>
            {viewReq.notes && <div style={{ marginTop:12, padding:10, background:'var(--surface2)', borderRadius:8, fontSize:12, color:'var(--text-dim)' }}>{viewReq.notes}<\/div>}
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setViewReq(null)}>Close<\/button><\/div>
          <\/div>
        <\/div>
      )}
    <\/div>
  )
}
