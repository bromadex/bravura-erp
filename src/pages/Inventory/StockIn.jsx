// src/pages/Inventory/StockIn.jsx
// Modern rewrite: KPIs, search, date filter, Excel export

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

export default function StockIn() {
  const { items, transactions, warehouses, stockIn: doStockIn, getBin, loading, recordBatch, registerSerial } = useInventory()
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

  const handleExport = () => {
    exportXLSX(filtered.map(t => ({
      Date: t.date, Type: t.type, Item: t.item_name, Category: t.category,
      Qty: t.qty, 'Delivered By': t.delivered_by, 'Received By': t.received_by, Notes: t.notes
    })), `StockIn_${today}`, 'Stock In')
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader title="Stock In Log">
        <button className="btn btn-secondary" onClick={handleExport}><span className="material-icons">table_chart</span> Export</button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <span className="material-icons">add_circle</span> Stock In
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Today Received" value={todayIn} sub="units" color="green" />
        <KPICard label="This Month" value={thisMonthIn} sub="units received" />
        <KPICard label="Total Records" value={stockInTx.length} />
        <KPICard label="Filtered Total" value={totalIn} sub="units in view" color="teal" />
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
              : filtered.length === 0 ? (
                <tr><td colSpan="8"><EmptyState icon="inventory_2" message="No stock in records" /></td></tr>
              )
              : filtered.map((tx, idx) => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{tx.date}</td>
                  <td><span className={`badge ${tx.type === 'GRN' ? 'badge-purple' : 'badge-green'}`}>{tx.type}</span></td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td style={{ fontSize: 12 }}>{tx.category}</td>
                  <td className="td-mono" style={{ color: 'var(--green)' }}>+{tx.qty}</td>
                  <td style={{ fontSize: 12 }}>{tx.delivered_by || '—'}</td>
                  <td style={{ fontSize: 12 }}>{tx.received_by || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <StockInModal items={items} warehouses={warehouses} getBin={getBin} onClose={() => setShowModal(false)} onSave={doStockIn} recordBatch={recordBatch} registerSerial={registerSerial} />}
    </div>
  )
}

function StockInModal({ items, warehouses, getBin, onClose, onSave, recordBatch, registerSerial }) {
  const [form, setForm] = useState({
    itemId: '', quantity: 1, date: today, deliveredBy: '',
    receivedBy: '', notes: '', warehouseId: 'wh_main_store', unitCost: '',
    batchNo: '', expiryDate: '', serialNos: '',
  })
  const [saving, setSaving] = useState(false)
  const selectedItem = items.find(i => i.id === form.itemId)
  const currentBin   = selectedItem ? getBin(selectedItem.id, form.warehouseId) : null
  const currentQty   = currentBin?.actual_qty ?? selectedItem?.balance ?? 0

  const handleItemChange = (itemId) => {
    const item = items.find(i => i.id === itemId)
    setForm(f => ({
      ...f,
      itemId,
      unitCost:    item ? String(item.last_purchase_rate || item.cost || '') : '',
      warehouseId: item?.default_warehouse_id || 'wh_main_store',
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.itemId)  return toast.error('Select an item')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter a valid quantity')
    if (selectedItem?.has_batch_no && !form.batchNo.trim()) return toast.error('Batch No is required for this item')
    if (selectedItem?.has_serial_no && !form.serialNos.trim()) return toast.error('Serial number(s) required for this item')
    setSaving(true)
    try {
      await onSave(
        form.itemId, parseFloat(form.quantity), form.date,
        form.deliveredBy, form.receivedBy || 'Store', form.notes,
        form.warehouseId, form.unitCost ? parseFloat(form.unitCost) : null,
      )
      // Register batch if item is batch-tracked
      if (selectedItem?.has_batch_no && form.batchNo.trim()) {
        await recordBatch({
          batch_no:    form.batchNo.trim(),
          item_id:     form.itemId,
          item_name:   selectedItem.name,
          qty:         parseFloat(form.quantity),
          warehouse_id: form.warehouseId,
          expiry_date: form.expiryDate || null,
        }).catch(() => null)
      }
      // Register serials if item is serial-tracked
      if (selectedItem?.has_serial_no && form.serialNos.trim()) {
        const nos = form.serialNos.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        for (const sno of nos) {
          await registerSerial({
            serial_no:    sno,
            item_id:      form.itemId,
            item_name:    selectedItem.name,
            warehouse_id: form.warehouseId,
            purchase_rate: form.unitCost ? parseFloat(form.unitCost) : 0,
          }).catch(() => null)
        }
      }
      toast.success(`+${form.quantity} ${selectedItem?.unit || 'units'} of ${selectedItem?.name} added`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog open onClose={onClose} title="Stock In" size="lg">
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Item *</label>
            <select className="form-control" required value={form.itemId} onChange={e => handleItemChange(e.target.value)}>
              <option value="">— Select item —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit || 'pcs'})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Warehouse</label>
            <select className="form-control" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })}>
              {(warehouses.length ? warehouses : [{ id: 'wh_main_store', name: 'Main Store' }]).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        {selectedItem && (
          <div style={{ background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>Unit: <strong>{selectedItem.unit || 'pcs'}</strong></span>
            <span>On Hand: <strong style={{ color: 'var(--green)' }}>{currentQty}</strong></span>
            <span>Projected: <strong style={{ color: 'var(--teal)' }}>{currentBin?.projected_qty ?? currentQty}</strong></span>
            <span>Valuation Rate: <strong>${(currentBin?.valuation_rate ?? selectedItem.cost ?? 0).toFixed(2)}</strong></span>
          </div>
        )}
        <div className="form-row">
          <div className="form-group"><label>Quantity *</label><input type="number" className="form-control" required min="0.01" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="form-group"><label>Unit Cost (for valuation)</label><input type="number" className="form-control" min="0" step="0.01" placeholder="Auto from last purchase" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} /></div>
          <div className="form-group"><label>Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Delivered By</label><input className="form-control" value={form.deliveredBy} onChange={e => setForm({ ...form, deliveredBy: e.target.value })} /></div>
          <div className="form-group"><label>Received By</label><input className="form-control" value={form.receivedBy} onChange={e => setForm({ ...form, receivedBy: e.target.value })} /></div>
        </div>
        <div className="form-group"><label>Notes / Reference</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        {selectedItem?.has_batch_no && (
          <div className="form-row">
            <div className="form-group">
              <label>Batch No *</label>
              <input className="form-control" placeholder="e.g. BATCH-2026-001" value={form.batchNo} onChange={e => setForm({ ...form, batchNo: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Expiry Date</label>
              <input type="date" className="form-control" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>
        )}
        {selectedItem?.has_serial_no && (
          <div className="form-group">
            <label>Serial Numbers * <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>— one per line or comma-separated</span></label>
            <textarea className="form-control" rows="3" placeholder="SN-001&#10;SN-002&#10;SN-003" value={form.serialNos} onChange={e => setForm({ ...form, serialNos: e.target.value })} />
          </div>
        )}
        {form.itemId && form.quantity > 0 && (
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: 12 }}>
            After this transaction: <strong style={{ color: 'var(--green)' }}>
              {(parseFloat(currentQty) + parseFloat(form.quantity || 0)).toFixed(2)} {selectedItem?.unit || 'pcs'}
            </strong>
            {form.unitCost && <span style={{ marginLeft: 16 }}>New Valuation Rate: <strong>${parseFloat(form.unitCost).toFixed(2)}</strong> (Moving Average)</span>}
          </div>
        )}
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Adding…' : 'Confirm Stock In'}
          </button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}
