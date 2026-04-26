import { useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import toast from 'react-hot-toast'

export default function StockIn() {
  const { items, transactions, stockIn: doStockIn, loading } = useInventory()
  const [showModal, setShowModal] = useState(false)

  const stockInTransactions = transactions.filter(t => t.type === 'IN' || t.type === 'GRN')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock In Log</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <span className="material-icons" style={{ fontSize: 18 }}>add</span> Stock In
        </button>
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>Delivered By</th><th>Received By</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : stockInTransactions.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>No stock in records</td></tr>
            ) : (
              stockInTransactions.map((tx, idx) => (
                <tr key={tx.id}>
                  <td>{idx + 1}</td>
                  <td>{new Date(tx.date).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td>{tx.category}</td>
                  <td style={{ color: 'var(--green)' }}>+{tx.qty}</td>
                  <td>{tx.delivered_by || '-'}</td>
                  <td>{tx.received_by || '-'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{tx.notes || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <StockInModal items={items} onClose={() => setShowModal(false)} onSave={doStockIn} />}
    </div>
  )
}

function StockInModal({ items, onClose, onSave }) {
  const [form, setForm] = useState({
    itemId: '',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    deliveredBy: '',
    receivedBy: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const selectedItem = items.find(i => i.id === form.itemId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId) return toast.error('Select an item')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter a valid quantity')
    setLoading(true)
    try {
      await onSave(form.itemId, form.quantity, form.date, form.deliveredBy, form.receivedBy || 'System', form.notes)
      toast.success(`+${form.quantity} ${selectedItem?.unit || 'units'} added`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>inventory_2</span>
          Stock <span>In</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>category</span> Item *</label>
            <select className="form-control" required value={form.itemId} onChange={e => setForm({...form, itemId: e.target.value})}>
              <option value="">Select item</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'pcs'}) — Balance: {i.balance}</option>)}
            </select>
          </div>
          {selectedItem && (
            <div style={{ background: 'var(--surface2)', padding: 8, borderRadius: 8, marginBottom: 12, fontSize: 12, display: 'flex', gap: 16 }}>
              <span><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>straighten</span> Unit: <strong>{selectedItem.unit || 'pcs'}</strong></span>
              <span><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>inventory</span> Current Stock: <strong>{selectedItem.balance}</strong></span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>add_circle</span> Quantity *</label>
              <input type="number" className="form-control" required min="1" value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})} />
            </div>
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>event</span> Date</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>local_shipping</span> Delivered By</label>
              <input className="form-control" value={form.deliveredBy} onChange={e => setForm({...form, deliveredBy: e.target.value})} />
            </div>
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>badge</span> Received By</label>
              <input className="form-control" value={form.receivedBy} onChange={e => setForm({...form, receivedBy: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>description</span> Notes</label>
            <textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Processing...' : 'Confirm Stock In'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
