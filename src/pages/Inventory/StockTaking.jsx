import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import toast from 'react-hot-toast'

export default function StockTaking() {
  const { items, stockTakes, stockTake, loading, fetchAll } = useInventory()
  const [showModal, setShowModal] = useState(false)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Taking<\/h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><span className="material-icons">fact_check<\/span> New Stock Take<\/button>
      <\/div>
      <div className="warn-box" style={{ marginBottom:20, background:'rgba(251,191,36,.1)', border:'1px solid rgba(251,191,36,.2)', borderRadius:8, padding:12, fontSize:12, color:'var(--yellow)' }}>
        <span className="material-icons" style={{ fontSize:16, verticalAlign:'middle', marginRight:6 }}>warning<\/span>
        Stock Taking overrides the system balance with physically counted values. This action creates an adjustment transaction.
      <\/div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date<\/th><th>Item<\/th><th>System Qty<\/th><th>Counted<\/th><th>Variance<\/th><th>Done By<\/th><th>Notes<\/th><\/tr><\/thead>
          <tbody>
            {loading ? <tr><td colSpan="7" style={{ textAlign:'center', padding:40 }}>Loading...<\/td><\/tr> : stockTakes.length === 0 ? <tr><td colSpan="7" style={{ textAlign:'center', padding:40 }}>No stock take records<\/td><\/tr> : stockTakes.map(st => (
              <tr key={st.id}>
                <td>{new Date(st.date).toLocaleDateString()}<\/td>
                <td style={{ fontWeight:600 }}>{st.item_name}<\/td>
                <td>{st.system_qty}<\/td>
                <td style={{ fontWeight:700, color:'var(--teal)' }}>{st.counted}<\/td>
                <td style={{ color:st.variance >= 0 ? 'var(--green)' : 'var(--red)' }}>{st.variance >= 0 ? '+' : ''}{st.variance}<\/td>
                <td>{st.done_by || '-'}<\/td>
                <td style={{ fontSize:12, color:'var(--text-dim)' }}>{st.notes || '-'}<\/td>
              <\/tr>
            ))}
          <\/tbody>
        <\/table>
      <\/div>
      {showModal && <StockTakeModal items={items} onClose={() => setShowModal(false)} onSave={stockTake} fetchAll={fetchAll} />}
    <\/div>
  )
}

function StockTakeModal({ items, onClose, onSave, fetchAll }) {
  const [form, setForm] = useState({ itemId: '', countedQty: 0, date: new Date().toISOString().split('T')[0], countedBy: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const selectedItem = items.find(i => i.id === form.itemId)
  const variance = selectedItem ? form.countedQty - selectedItem.balance : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId) return toast.error('Select an item')
    if (form.countedQty < 0) return toast.error('Counted quantity cannot be negative')
    setLoading(true)
    try {
      await onSave(form.itemId, form.countedQty, form.date, form.countedBy || 'System', form.notes)
      toast.success(`Stock take completed. Variance: ${variance >= 0 ? '+' : ''}${variance}`)
      await fetchAll()
      onClose()
    } catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span className="material-icons">fact_check<\/span> Stock <span>Take<\/span><\/div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Item *<\/label><select className="form-control" required value={form.itemId} onChange={e => setForm({...form, itemId:e.target.value})}><option value="">Select item<\/option>{items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'pcs'}) — Current: {i.balance}<\/option>)}<\/select><\/div>
          {selectedItem && <div style={{ background:'var(--surface2)', padding:8, borderRadius:8, marginBottom:12, fontSize:12 }}>Current Balance: <strong>{selectedItem.balance} {selectedItem.unit || 'pcs'}<\/strong>{variance !== 0 && <span style={{ marginLeft:16, color:variance > 0 ? 'var(--green)' : 'var(--red)' }}>Adjustment: {variance > 0 ? '+' : ''}{variance}<\/span>}<\/div>}
          <div className="form-row">
            <div className="form-group"><label>Counted Quantity *<\/label><input type="number" className="form-control" required min="0" value={form.countedQty} onChange={e => setForm({...form, countedQty: parseInt(e.target.value) || 0})} /><\/div>
            <div className="form-group"><label>Date<\/label><input type="date" className="form-control" value={form.date} onChange={e => setForm({...form, date:e.target.value})} /><\/div>
          <\/div>
          <div className="form-row">
            <div className="form-group"><label>Counted By<\/label><input className="form-control" value={form.countedBy} onChange={e => setForm({...form, countedBy:e.target.value})} /><\/div>
            <div className="form-group"><label>Notes<\/label><input className="form-control" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} /><\/div>
          <\/div>
          <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel<\/button><button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Processing...' : 'Apply Count'}<\/button><\/div>
        <\/form>
      <\/div>
    <\/div>
  )
}
