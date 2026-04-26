import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import toast from 'react-hot-toast'

export default function StockOut() {
  const { items, transactions, stockOut: doStockOut, loading } = useInventory()
  const [showModal, setShowModal] = useState(false)
  const stockOutTransactions = transactions.filter(t => t.type === 'OUT')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Out Log</h1>
        <button className="btn btn-danger" onClick={() => setShowModal(true)}><span className="material-icons">remove<\/span> Stock Out<\/button>
      <\/div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#<\/th><th>Date<\/th><th>Item<\/th><th>Category<\/th><th>Qty<\/th><th>Issued To<\/th><th>Authorized By<\/th><th>Purpose<\/th><\/tr><\/thead>
          <tbody>
            {loading ? <tr><td colSpan="8" style={{ textAlign:'center', padding:40 }}>Loading...<\/td><\/tr> : stockOutTransactions.length === 0 ? <tr><td colSpan="8" style={{ textAlign:'center', padding:40 }}>No stock out records<\/td><\/tr> : stockOutTransactions.map((tx, idx) => (
              <tr key={tx.id}>
                <td>{idx+1}<\/td>
                <td>{new Date(tx.date).toLocaleDateString()}<\/td>
                <td style={{ fontWeight:600 }}>{tx.item_name}<\/td>
                <td>{tx.category}<\/td>
                <td style={{ color:'var(--red)' }}>-{tx.qty}<\/td>
                <td>{tx.issued_to || '-'}<\/td>
                <td>{tx.authorized_by || '-'}<\/td>
                <td style={{ color:'var(--text-dim)' }}>{tx.notes || '-'}<\/td>
              <\/tr>
            ))}
          <\/tbody>
        <\/table>
      <\/div>
      {showModal && <StockOutModal items={items} onClose={() => setShowModal(false)} onSave={doStockOut} />}
    <\/div>
  )
}

function StockOutModal({ items, onClose, onSave }) {
  const [form, setForm] = useState({ itemId: '', quantity: 1, date: new Date().toISOString().split('T')[0], issuedTo: '', authorizedBy: '', purpose: '' })
  const [loading, setLoading] = useState(false)
  const selectedItem = items.find(i => i.id === form.itemId)
  const isValid = selectedItem && form.quantity <= selectedItem.balance

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId) return toast.error('Select an item')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter a valid quantity')
    if (!isValid) return toast.error(`Insufficient stock. Available: ${selectedItem.balance} ${selectedItem?.unit || 'pcs'}`)
    setLoading(true)
    try {
      await onSave(form.itemId, form.quantity, form.date, form.issuedTo, form.authorizedBy || 'System', form.purpose)
      toast.success(`-${form.quantity} ${selectedItem?.unit || 'units'} issued`)
      onClose()
    } catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span className="material-icons">assignment_return<\/span> Stock <span>Out<\/span><\/div>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Item *<\/label><select className="form-control" required value={form.itemId} onChange={e => setForm({...form, itemId:e.target.value})}><option value="">Select item<\/option>{items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'pcs'}) — Balance: {i.balance}<\/option>)}<\/select><\/div>
          {selectedItem && <div style={{ background: !isValid ? 'rgba(248,113,113,.1)' : 'rgba(52,211,153,.1)', padding:8, borderRadius:8, marginBottom:12, fontSize:12, display:'flex', gap:16, color:!isValid ? 'var(--red)' : 'var(--green)' }}><span>Available: <strong>{selectedItem.balance} {selectedItem.unit || 'pcs'}<\/strong><\/span><span>Threshold: <strong>{selectedItem.threshold}<\/strong><\/span><\/div>}
          <div className="form-row">
            <div className="form-group"><label>Quantity *<\/label><input type="number" className="form-control" required min="1" max={selectedItem?.balance || 0} value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})} /><\/div>
            <div className="form-group"><label>Date<\/label><input type="date" className="form-control" value={form.date} onChange={e => setForm({...form, date:e.target.value})} /><\/div>
          <\/div>
          <div className="form-row">
            <div className="form-group"><label>Issued To<\/label><input className="form-control" value={form.issuedTo} onChange={e => setForm({...form, issuedTo:e.target.value})} /><\/div>
            <div className="form-group"><label>Authorized By<\/label><input className="form-control" value={form.authorizedBy} onChange={e => setForm({...form, authorizedBy:e.target.value})} /><\/div>
          <\/div>
          <div className="form-group"><label>Purpose / Notes<\/label><textarea className="form-control" rows="2" value={form.purpose} onChange={e => setForm({...form, purpose:e.target.value})} /><\/div>
          <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel<\/button><button type="submit" className="btn btn-danger" disabled={loading || !isValid}>{loading ? 'Processing...' : 'Confirm Stock Out'}<\/button><\/div>
        <\/form>
      <\/div>
    <\/div>
  )
}
