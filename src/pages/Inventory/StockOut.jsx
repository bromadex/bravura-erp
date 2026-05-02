// src/pages/Inventory/StockOut.jsx
//
// FIX: Removed useHR() — HRProvider is not in the Inventory route.
// Employees fetched directly from Supabase (id, name, status only).
// On-leave guard still works via LeaveContext.
// Added: KPIs, search, date filter, Excel export, "after balance" preview.

import { useState, useEffect } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useLeave } from '../../contexts/LeaveContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function StockOut() {
  const { items, transactions, stockOut: doStockOut, loading } = useInventory()
  const { isOnLeave } = useLeave()
  const canEdit = useCanEdit('inventory', 'stock-out')

  // ✅ FIX: fetch employees directly — no HRProvider needed
  const [employees, setEmployees] = useState([])
  useEffect(() => {
    supabase.from('employees').select('id, name, status').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const [showModal, setShowModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const stockOutTx = transactions.filter(t => t.type === 'OUT')
  const filtered   = stockOutTx.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false
    if (dateTo   && tx.date > dateTo)   return false
    if (searchTerm && !tx.item_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const issuedToday   = stockOutTx.filter(t => t.date === today).reduce((s, t) => s + (t.qty || 0), 0)
  const issuedThisMonth = stockOutTx.filter(t => t.date?.startsWith(today.slice(0,7))).reduce((s, t) => s + (t.qty || 0), 0)

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(t => ({
      Date: t.date, Item: t.item_name, Category: t.category, Qty: t.qty,
      'Issued To': t.issued_to, 'Authorized By': t.authorized_by, Purpose: t.notes
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stock Out')
    XLSX.writeFile(wb, `StockOut_${today}.xlsx`); toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Out Log</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-danger" onClick={() => setShowModal(true)}>
              <span className="material-icons">remove_circle</span> Issue Stock
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Issued Today</div><div className="kpi-val" style={{ color: 'var(--red)' }}>{issuedToday}</div><div className="kpi-sub">units</div></div>
        <div className="kpi-card"><div className="kpi-label">This Month</div><div className="kpi-val">{issuedThisMonth}</div><div className="kpi-sub">units issued</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Records</div><div className="kpi-val">{stockOutTx.length}</div></div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="Search item…" style={{ maxWidth: 200 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 140 }} value={dateTo}   onChange={e => setDateTo(e.target.value)} />
          {(searchTerm || dateFrom || dateTo) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearchTerm(''); setDateFrom(''); setDateTo('') }}><span className="material-icons">clear</span></button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>Issued To</th><th>Authorized By</th><th>Purpose</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan="7" className="empty-state">No stock out records</td></tr>
              : filtered.map(tx => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{tx.date}</td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td style={{ fontSize: 12 }}>{tx.category}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>-{tx.qty}</td>
                  <td>{tx.issued_to || '—'}</td>
                  <td style={{ fontSize: 12 }}>{tx.authorized_by || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [form, setForm] = useState({ itemId: '', quantity: 1, date: today, issuedToId: '', authorizedBy: '', purpose: '' })
  const [saving, setSaving] = useState(false)

  const selectedItem     = items.find(i => i.id === form.itemId)
  const isValid          = selectedItem && parseInt(form.quantity) > 0 && parseInt(form.quantity) <= selectedItem.balance
  const selectedEmployee = employees.find(e => e.id === form.issuedToId)
  const recipientOnLeave = form.issuedToId && isOnLeave(form.issuedToId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId)   return toast.error('Select an item')
    if (!isValid)       return toast.error(`Insufficient stock. Available: ${selectedItem?.balance} ${selectedItem?.unit || 'pcs'}`)
    if (recipientOnLeave) { toast.error(`${selectedEmployee?.name} is on approved leave`); return }
    setSaving(true)
    try {
      const issuedToName = selectedEmployee?.name || form.issuedToId || ''
      await onSave(form.itemId, parseInt(form.quantity), form.date, issuedToName, form.authorizedBy || 'Store', form.purpose)
      toast.success(`-${form.quantity} ${selectedItem?.unit || 'units'} of ${selectedItem?.name} issued`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span className="material-icons">remove_circle</span> Issue <span>Stock</span></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item *</label>
            <select className="form-control" required value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })}>
              <option value="">— Select item —</option>
              {items.map(i => <option key={i.id} value={i.id} disabled={i.balance <= 0}>{i.name} ({i.unit || 'pcs'}) — Balance: {i.balance}{i.balance <= 0 ? ' [OUT OF STOCK]' : ''}</option>)}
            </select>
          </div>

          {selectedItem && (
            <div style={{ background: !isValid ? 'rgba(248,113,113,.08)' : 'rgba(52,211,153,.08)', border: `1px solid ${!isValid ? 'rgba(248,113,113,.2)' : 'rgba(52,211,153,.2)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, display: 'flex', gap: 16 }}>
              <span>Available: <strong style={{ color: selectedItem.balance > 0 ? 'var(--green)' : 'var(--red)' }}>{selectedItem.balance} {selectedItem.unit || 'pcs'}</strong></span>
              <span>Reorder at: {selectedItem.threshold || 5}</span>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Quantity *</label>
              <input type="number" className="form-control" required min="1" max={selectedItem?.balance || 9999}
                value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Issued To</label>
            <select className="form-control" value={form.issuedToId} onChange={e => setForm({ ...form, issuedToId: e.target.value })}>
              <option value="">— Select employee (optional) —</option>
              {employees.map(emp => {
                const onLeave = isOnLeave(emp.id)
                return <option key={emp.id} value={emp.id} disabled={onLeave}>{emp.name}{onLeave ? ' (On Leave — cannot receive)' : ''}</option>
              })}
            </select>
            {recipientOnLeave && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.1)', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>event_busy</span>
                {selectedEmployee?.name} is on approved leave — cannot receive stock.
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group"><label>Authorized By</label><input className="form-control" value={form.authorizedBy} onChange={e => setForm({ ...form, authorizedBy: e.target.value })} /></div>
            <div className="form-group"><label>Purpose / Notes</label><input className="form-control" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} /></div>
          </div>

          {form.itemId && form.quantity > 0 && isValid && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12 }}>
              After issuance: <strong style={{ color: 'var(--yellow)' }}>{(selectedItem?.balance || 0) - parseInt(form.quantity || 0)} {selectedItem?.unit || 'pcs'}</strong> remaining
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={saving || !isValid || recipientOnLeave}>
              {saving ? 'Processing…' : 'Confirm Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
