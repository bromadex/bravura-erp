// src/pages/Inventory/StockIn.jsx
// Modern rewrite: KPIs, search, date filter, Excel export

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function StockIn() {
  const { items, transactions, stockIn: doStockIn, loading } = useInventory()
  const canEdit = useCanEdit('inventory', 'stock-in')

  const [showModal, setShowModal] = useState(false)
  const [search,    setSearch]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')

  const stockInTx = transactions.filter(t => t.type === 'IN' || t.type === 'GRN')
  const filtered  = stockInTx.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false
    if (dateTo   && tx.date > dateTo)   return false
    if (search && !tx.item_name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalIn      = filtered.reduce((s, t) => s + (t.qty || 0), 0)
  const todayIn      = stockInTx.filter(t => t.date === today).reduce((s, t) => s + (t.qty || 0), 0)
  const thisMonthIn  = stockInTx.filter(t => t.date?.startsWith(today.slice(0, 7))).reduce((s, t) => s + (t.qty || 0), 0)

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(t => ({
      Date: t.date, Type: t.type, Item: t.item_name, Category: t.category,
      Qty: t.qty, 'Delivered By': t.delivered_by, 'Received By': t.received_by, Notes: t.notes
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stock In')
    XLSX.writeFile(wb, `StockIn_${today}.xlsx`); toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock In Log</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <span className="material-icons">add_circle</span> Stock In
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Today Received</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{todayIn}</div><div className="kpi-sub">units</div></div>
        <div className="kpi-card"><div className="kpi-label">This Month</div><div className="kpi-val">{thisMonthIn}</div><div className="kpi-sub">units received</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Records</div><div className="kpi-val">{stockInTx.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Filtered Total</div><div className="kpi-val" style={{ color: 'var(--teal)' }}>{totalIn}</div><div className="kpi-sub">units in view</div></div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="Search item…" style={{ maxWidth: 200 }}
            value={search} onChange={e => setSearch(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 140 }} value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 140 }} value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
          {(search || dateFrom || dateTo) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Item</th><th>Category</th><th>Qty</th><th>Delivered By</th><th>Received By</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan="8" className="empty-state">No stock in records</td></tr>
              : filtered.map((tx, idx) => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{tx.date}</td>
                  <td><span className={`badge ${tx.type === 'GRN' ? 'badge-purple' : 'badge-green'}`}>{tx.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td style={{ fontSize: 12 }}>{tx.category}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>+{tx.qty}</td>
                  <td style={{ fontSize: 12 }}>{tx.delivered_by || '—'}</td>
                  <td style={{ fontSize: 12 }}>{tx.received_by || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <StockInModal items={items} onClose={() => setShowModal(false)} onSave={doStockIn} />}
    </div>
  )
}

function StockInModal({ items, onClose, onSave }) {
  const [form, setForm] = useState({ itemId: '', quantity: 1, date: today, deliveredBy: '', receivedBy: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const selectedItem = items.find(i => i.id === form.itemId)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId)   return toast.error('Select an item')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter a valid quantity')
    setSaving(true)
    try {
      await onSave(form.itemId, parseInt(form.quantity), form.date, form.deliveredBy, form.receivedBy || 'Store', form.notes)
      toast.success(`+${form.quantity} ${selectedItem?.unit || 'units'} of ${selectedItem?.name} added`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title"><span className="material-icons">add_circle</span> Stock <span>In</span></div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item *</label>
            <select className="form-control" required value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })}>
              <option value="">— Select item —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'pcs'}) — Balance: {i.balance}</option>)}
            </select>
          </div>
          {selectedItem && (
            <div style={{ background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, display: 'flex', gap: 16 }}>
              <span>Unit: <strong>{selectedItem.unit || 'pcs'}</strong></span>
              <span>Current Balance: <strong style={{ color: 'var(--green)' }}>{selectedItem.balance}</strong></span>
              <span>Unit Cost: <strong>${(selectedItem.cost || 0).toFixed(2)}</strong></span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group"><label>Quantity *</label><input type="number" className="form-control" required min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="form-group"><label>Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Delivered By (Supplier/Driver)</label><input className="form-control" value={form.deliveredBy} onChange={e => setForm({ ...form, deliveredBy: e.target.value })} /></div>
            <div className="form-group"><label>Received By</label><input className="form-control" value={form.receivedBy} onChange={e => setForm({ ...form, receivedBy: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Notes / Reference</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          {form.itemId && form.quantity > 0 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12 }}>
              After this transaction: <strong style={{ color: 'var(--green)' }}>{(selectedItem?.balance || 0) + parseInt(form.quantity || 0)} {selectedItem?.unit || 'pcs'}</strong>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Confirm Stock In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
