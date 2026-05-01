// src/pages/Inventory/StockOut.jsx
//
// FIX: Removed useHR() — HRProvider is not mounted in the Inventory
// module route. Now fetches employees directly from Supabase with a
// local useEffect. Lightweight — only name, id, status columns.
// On-leave guard still works via LeaveContext cache.

import { useState, useEffect } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useLeave } from '../../contexts/LeaveContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function StockOut() {
  const { items, transactions, stockOut: doStockOut, loading } = useInventory()
  const { isOnLeave } = useLeave()
  const canEdit = useCanEdit('inventory', 'stock-out')

  // ✅ FIX: fetch employees directly — no HRProvider needed
  const [employees, setEmployees] = useState([])
  useEffect(() => {
    supabase
      .from('employees')
      .select('id, name, status')
      .neq('status', 'Terminated')
      .order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const [showModal, setShowModal] = useState(false)
  const stockOutTransactions = transactions.filter(t => t.type === 'OUT')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Out Log</h1>
        {canEdit && (
          <button className="btn btn-danger" onClick={() => setShowModal(true)}>
            <span className="material-icons">remove</span> Stock Out
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Item</th><th>Category</th>
              <th>Qty</th><th>Issued To</th><th>Authorized By</th><th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : stockOutTransactions.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>No stock out records</td></tr>
            ) : (
              stockOutTransactions.map((tx, idx) => (
                <tr key={tx.id}>
                  <td>{idx + 1}</td>
                  <td>{new Date(tx.date).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td>{tx.category}</td>
                  <td style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>-{tx.qty}</td>
                  <td>{tx.issued_to || '—'}</td>
                  <td>{tx.authorized_by || '—'}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{tx.notes || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <StockOutModal
          items={items}
          employees={employees}
          isOnLeave={isOnLeave}
          onClose={() => setShowModal(false)}
          onSave={doStockOut}
        />
      )}
    </div>
  )
}

function StockOutModal({ items, employees, isOnLeave, onClose, onSave }) {
  const [form, setForm] = useState({
    itemId: '',
    quantity: 1,
    date: new Date().toISOString().split('T')[0],
    issuedToId: '',
    authorizedBy: '',
    purpose: ''
  })
  const [submitting, setSubmitting] = useState(false)

  const selectedItem     = items.find(i => i.id === form.itemId)
  const isValid          = selectedItem && form.quantity <= selectedItem.balance
  const selectedEmployee = employees.find(e => e.id === form.issuedToId)
  const recipientOnLeave = form.issuedToId && isOnLeave(form.issuedToId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId)   return toast.error('Select an item')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter a valid quantity')
    if (!isValid) return toast.error(`Insufficient stock. Available: ${selectedItem?.balance} ${selectedItem?.unit || 'pcs'}`)
    if (recipientOnLeave) {
      toast.error(`${selectedEmployee?.name} is currently on approved leave. Stock cannot be issued to them.`)
      return
    }
    setSubmitting(true)
    try {
      const issuedToName = selectedEmployee?.name || form.issuedToId || ''
      await onSave(form.itemId, form.quantity, form.date, issuedToName, form.authorizedBy || 'System', form.purpose)
      toast.success(`-${form.quantity} ${selectedItem?.unit || 'units'} issued`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span className="material-icons">assignment_return</span> Stock <span>Out</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item *</label>
            <select className="form-control" required value={form.itemId}
              onChange={e => setForm({ ...form, itemId: e.target.value })}>
              <option value="">Select item</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit || 'pcs'}) — Balance: {i.balance}
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div style={{ background: !isValid ? 'rgba(248,113,113,.1)' : 'rgba(52,211,153,.1)', padding: 8, borderRadius: 8, marginBottom: 12, fontSize: 12, display: 'flex', gap: 16, color: !isValid ? 'var(--red)' : 'var(--green)' }}>
              <span>Available: <strong>{selectedItem.balance} {selectedItem.unit || 'pcs'}</strong></span>
              <span>Threshold: <strong>{selectedItem.threshold}</strong></span>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Quantity *</label>
              <input type="number" className="form-control" required min="1"
                max={selectedItem?.balance || 0} value={form.quantity}
                onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="form-control" value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Issued To</label>
              <select className="form-control" value={form.issuedToId}
                onChange={e => setForm({ ...form, issuedToId: e.target.value })}>
                <option value="">— Select employee —</option>
                {employees.map(emp => {
                  const onLeave = isOnLeave(emp.id)
                  return (
                    <option key={emp.id} value={emp.id} disabled={onLeave}>
                      {emp.name}{onLeave ? ' (On Leave)' : ''}
                    </option>
                  )
                })}
              </select>
              {recipientOnLeave && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>event_busy</span>
                  {selectedEmployee?.name} is on approved leave — cannot receive stock.
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Authorized By</label>
              <input className="form-control" value={form.authorizedBy}
                onChange={e => setForm({ ...form, authorizedBy: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Purpose / Notes</label>
            <textarea className="form-control" rows="2" value={form.purpose}
              onChange={e => setForm({ ...form, purpose: e.target.value })} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger"
              disabled={submitting || !isValid || recipientOnLeave}>
              {submitting ? 'Processing...' : 'Confirm Stock Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
