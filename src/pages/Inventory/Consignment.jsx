// src/pages/Inventory/Consignment.jsx
// Phase 20 — Consignment Stock Management
// Supplier-owned goods held at company premises; payment triggered on consumption.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader, KPICard, EmptyState,
  ModalDialog, ModalActions,
} from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WAREHOUSE = 'wh_main_store'
const today = () => new Date().toISOString().split('T')[0]

const STATUS_COLORS = {
  'Active':             'badge-green',
  'Partially Consumed': 'badge-teal',
  'Consumed':           'badge-dim',
  'Returned':           'badge-blue',
  'Expired':            'badge-red',
}

const ALL_STATUSES = ['All', 'Active', 'Partially Consumed', 'Consumed', 'Returned']

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'badge-dim'
  return <span className={`badge ${cls}`}>{status || '—'}</span>
}

function fmt(v) { return v ? String(v).slice(0, 10) : '—' }

function fmtCur(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function addDays(dateStr, n) {
  const d = new Date(dateStr || today())
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── Get next consignment number ──────────────────────────────────────────────

async function getNextConNo() {
  const { data } = await supabase
    .from('consignment_stock')
    .select('consignment_no')
    .ilike('consignment_no', 'CON-%')
    .order('created_at', { ascending: false })
    .limit(1)
  const last = data?.[0]?.consignment_no || 'CON-0000'
  const num = parseInt(last.replace('CON-', ''), 10) || 0
  return `CON-${String(num + 1).padStart(4, '0')}`
}

// ── Receive Modal ────────────────────────────────────────────────────────────

function ReceiveModal({ open, onClose, onSaved, suppliers, items, warehouses, user }) {
  const blank = {
    supplier_id: '',
    item_id: '',
    warehouse_id: DEFAULT_WAREHOUSE,
    unit: '',
    qty_received: '',
    unit_cost: '',
    receipt_date: today(),
    review_date: addDays(today(), 90),
    notes: '',
  }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    if (open) {
      setForm(blank)
      setSupplierSearch('')
      setItemSearch('')
    }
  }, [open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.toLowerCase()
    return suppliers.filter(s => s.name.toLowerCase().includes(q))
  }, [suppliers, supplierSearch])

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.item_code || '').toLowerCase().includes(q)
    )
  }, [items, itemSearch])

  const handleItemSelect = (item) => {
    set('item_id', item.id)
    set('unit', item.unit || 'pcs')
    setItemSearch(item.name)
  }

  const handleSupplierSelect = (sup) => {
    set('supplier_id', sup.id)
    setSupplierSearch(sup.name)
  }

  const handleSave = async () => {
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (!form.item_id)     return toast.error('Select an item')
    if (!form.warehouse_id) return toast.error('Select a warehouse')
    if (!form.qty_received || Number(form.qty_received) <= 0) return toast.error('Enter a valid quantity')
    if (!form.receipt_date) return toast.error('Enter receipt date')

    setSaving(true)
    try {
      const conNo = await getNextConNo()
      const supplier = suppliers.find(s => s.id === form.supplier_id)
      const item = items.find(i => i.id === form.item_id)
      const warehouse = warehouses.find(w => w.id === form.warehouse_id)

      const conId = crypto.randomUUID()
      const { error: conErr } = await supabase.from('consignment_stock').insert({
        id: conId,
        consignment_no: conNo,
        supplier_id: form.supplier_id,
        supplier_name: supplier?.name || '',
        item_id: form.item_id,
        item_name: item?.name || '',
        item_code: item?.item_code || '',
        warehouse_id: form.warehouse_id,
        warehouse_name: warehouse?.name || '',
        unit: form.unit || item?.unit || 'pcs',
        qty_received: Number(form.qty_received),
        qty_consumed: 0,
        qty_returned: 0,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : 0,
        receipt_date: form.receipt_date,
        review_date: form.review_date || null,
        status: 'Active',
        notes: form.notes || null,
        created_by: user?.full_name || 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (conErr) throw conErr

      // SLE — physical receipt into warehouse (positive = in)
      const { error: sleErr } = await supabase.from('stock_ledger_entries').insert({
        id: crypto.randomUUID(),
        item_id: form.item_id,
        warehouse_id: form.warehouse_id,
        posting_datetime: new Date(form.receipt_date + 'T08:00:00').toISOString(),
        voucher_type: 'Consignment',
        voucher_no: conNo,
        actual_qty: Number(form.qty_received),
        incoming_rate: form.unit_cost ? Number(form.unit_cost) : 0,
        valuation_rate: form.unit_cost ? Number(form.unit_cost) : 0,
        created_by: user?.full_name || 'system',
        created_at: new Date().toISOString(),
      })
      if (sleErr) throw sleErr

      toast.success(`Consignment ${conNo} received successfully`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error('Failed to receive consignment: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Receive Consignment Stock" size="lg">
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        {/* Supplier */}
        <div className="form-group">
          <label className="form-label">Supplier *</label>
          <input
            type="text"
            className="input"
            placeholder="Search supplier…"
            value={supplierSearch}
            onChange={e => { setSupplierSearch(e.target.value); set('supplier_id', '') }}
          />
          {supplierSearch && !form.supplier_id && filteredSuppliers.length > 0 && (
            <div className="dropdown-list">
              {filteredSuppliers.slice(0, 8).map(s => (
                <div key={s.id} className="dropdown-item" onClick={() => handleSupplierSelect(s)}>
                  {s.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Item */}
        <div className="form-group">
          <label className="form-label">Item *</label>
          <input
            type="text"
            className="input"
            placeholder="Search item…"
            value={itemSearch}
            onChange={e => { setItemSearch(e.target.value); set('item_id', ''); set('unit', '') }}
          />
          {itemSearch && !form.item_id && filteredItems.length > 0 && (
            <div className="dropdown-list">
              {filteredItems.slice(0, 8).map(i => (
                <div key={i.id} className="dropdown-item" onClick={() => handleItemSelect(i)}>
                  {i.item_code && <span className="mono" style={{ marginRight: 6, color: 'var(--text-dim)' }}>{i.item_code}</span>}
                  {i.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Warehouse */}
          <div className="form-group">
            <label className="form-label">Warehouse *</label>
            <select
              className="input"
              value={form.warehouse_id}
              onChange={e => set('warehouse_id', e.target.value)}
            >
              <option value="">Select…</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Unit */}
          <div className="form-group">
            <label className="form-label">Unit</label>
            <input
              type="text"
              className="input"
              placeholder="pcs"
              value={form.unit}
              onChange={e => set('unit', e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Qty Received */}
          <div className="form-group">
            <label className="form-label">Qty Received *</label>
            <input
              type="number"
              className="input"
              min="0"
              step="0.01"
              placeholder="0"
              value={form.qty_received}
              onChange={e => set('qty_received', e.target.value)}
            />
          </div>

          {/* Unit Cost */}
          <div className="form-group">
            <label className="form-label">Unit Cost (agreed price)</label>
            <input
              type="number"
              className="input"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.unit_cost}
              onChange={e => set('unit_cost', e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Receipt Date */}
          <div className="form-group">
            <label className="form-label">Receipt Date *</label>
            <input
              type="date"
              className="input"
              value={form.receipt_date}
              onChange={e => set('receipt_date', e.target.value)}
            />
          </div>

          {/* Review Date */}
          <div className="form-group">
            <label className="form-label">Review Date</label>
            <input
              type="date"
              className="input"
              value={form.review_date}
              onChange={e => set('review_date', e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Optional notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>
      </div>

      <ModalActions>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Receive Consignment'}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ── Consume Modal ────────────────────────────────────────────────────────────

function ConsumeModal({ open, onClose, onSaved, record, user }) {
  const [consumeQty, setConsumeQty] = useState('')
  const [notes, setNotes]           = useState('')
  const [date, setDate]             = useState(today())
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (open) {
      setConsumeQty('')
      setNotes('')
      setDate(today())
    }
  }, [open])

  if (!record) return null

  const balance = (record.qty_received || 0) - (record.qty_consumed || 0) - (record.qty_returned || 0)

  const handleSave = async () => {
    const qty = Number(consumeQty)
    if (!qty || qty <= 0) return toast.error('Enter a valid quantity')
    if (qty > balance) return toast.error(`Cannot consume more than balance (${fmtNum(balance, 2)})`)

    setSaving(true)
    try {
      const newConsumed = (record.qty_consumed || 0) + qty
      const totalUsed = newConsumed + (record.qty_returned || 0)
      const newStatus =
        totalUsed >= record.qty_received ? 'Consumed'
        : newConsumed > 0 ? 'Partially Consumed'
        : 'Active'

      const { error: upErr } = await supabase
        .from('consignment_stock')
        .update({
          qty_consumed: newConsumed,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id)
      if (upErr) throw upErr

      // SLE — consumption (negative = issue)
      const { error: sleErr } = await supabase.from('stock_ledger_entries').insert({
        id: crypto.randomUUID(),
        item_id: record.item_id,
        warehouse_id: record.warehouse_id,
        posting_datetime: new Date(date + 'T08:00:00').toISOString(),
        voucher_type: 'Consignment',
        voucher_no: record.consignment_no,
        actual_qty: -qty,
        outgoing_rate: record.unit_cost || 0,
        valuation_rate: record.unit_cost || 0,
        created_by: user?.full_name || 'system',
        created_at: new Date().toISOString(),
      })
      if (sleErr) throw sleErr

      toast.success('Consignment consumption recorded. Advise supplier for invoice.')
      onSaved()
      onClose()
    } catch (e) {
      toast.error('Failed to record consumption: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title={`Consume from Consignment · ${record.consignment_no}`}>
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
          <div><strong>Item:</strong> {record.item_name}</div>
          <div><strong>Supplier:</strong> {record.supplier_name}</div>
          <div><strong>Balance Qty:</strong> <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtNum(balance, 2)} {record.unit}</span></div>
          <div><strong>Unit Cost:</strong> {fmtCur(record.unit_cost)}</div>
        </div>

        <div className="form-group">
          <label className="form-label">Consume Qty * (max: {fmtNum(balance, 2)})</label>
          <input
            type="number"
            className="input"
            min="0.01"
            max={balance}
            step="0.01"
            placeholder="0"
            value={consumeQty}
            onChange={e => setConsumeQty(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Consumption Date</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Purpose of consumption…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {consumeQty && Number(consumeQty) > 0 && record.unit_cost > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13, color: 'var(--gold)' }}>
            Invoice value: <strong>{fmtCur(Number(consumeQty) * record.unit_cost)}</strong>
          </div>
        )}
      </div>

      <ModalActions>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          style={{ background: 'var(--teal)' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Recording…' : 'Record Consumption'}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ── Return Modal ─────────────────────────────────────────────────────────────

function ReturnModal({ open, onClose, onSaved, record, user }) {
  const [returnQty, setReturnQty] = useState('')
  const [returnDate, setReturnDate] = useState(today())
  const [reason, setReason]         = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (open) {
      setReturnQty('')
      setReturnDate(today())
      setReason('')
      setNotes('')
    }
  }, [open])

  if (!record) return null

  const balance = (record.qty_received || 0) - (record.qty_consumed || 0) - (record.qty_returned || 0)

  const handleSave = async () => {
    const qty = Number(returnQty)
    if (!qty || qty <= 0) return toast.error('Enter a valid quantity')
    if (qty > balance) return toast.error(`Cannot return more than balance (${fmtNum(balance, 2)})`)

    setSaving(true)
    try {
      const newReturned = (record.qty_returned || 0) + qty
      const totalUsed = (record.qty_consumed || 0) + newReturned
      const newStatus =
        totalUsed >= record.qty_received ? 'Returned'
        : newReturned > 0 ? 'Partially Consumed'
        : 'Active'

      const { error: upErr } = await supabase
        .from('consignment_stock')
        .update({
          qty_returned: newReturned,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id)
      if (upErr) throw upErr

      // SLE — return to supplier (negative = stock leaves warehouse)
      const { error: sleErr } = await supabase.from('stock_ledger_entries').insert({
        id: crypto.randomUUID(),
        item_id: record.item_id,
        warehouse_id: record.warehouse_id,
        posting_datetime: new Date(returnDate + 'T08:00:00').toISOString(),
        voucher_type: 'Consignment',
        voucher_no: record.consignment_no,
        actual_qty: -qty,
        outgoing_rate: record.unit_cost || 0,
        valuation_rate: record.unit_cost || 0,
        created_by: user?.full_name || 'system',
        created_at: new Date().toISOString(),
      })
      if (sleErr) throw sleErr

      toast.success(`Returned ${fmtNum(qty, 2)} ${record.unit} to ${record.supplier_name}`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error('Failed to record return: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title={`Return to Supplier · ${record.consignment_no}`}>
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
          <div><strong>Item:</strong> {record.item_name}</div>
          <div><strong>Supplier:</strong> {record.supplier_name}</div>
          <div><strong>Balance Qty:</strong> <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtNum(balance, 2)} {record.unit}</span></div>
        </div>

        <div className="form-group">
          <label className="form-label">Return Qty * (max: {fmtNum(balance, 2)})</label>
          <input
            type="number"
            className="input"
            min="0.01"
            max={balance}
            step="0.01"
            placeholder="0"
            value={returnQty}
            onChange={e => setReturnQty(e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Return Date</label>
          <input
            type="date"
            className="input"
            value={returnDate}
            onChange={e => setReturnDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Reason</label>
          <input
            type="text"
            className="input"
            placeholder="Reason for return…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Additional notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
      </div>

      <ModalActions>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary"
          style={{ background: 'var(--blue)' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Recording…' : 'Record Return'}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ record, sles, onConsume, onReturn, onClose }) {
  if (!record) return null

  const balance = (record.qty_received || 0) - (record.qty_consumed || 0) - (record.qty_returned || 0)
  const canConsume = ['Active', 'Partially Consumed'].includes(record.status) && balance > 0
  const canReturn  = balance > 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 420,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface2)',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
            {record.consignment_no}
          </div>
          <StatusBadge status={record.status} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <span className="material-icons md-18">close</span>
        </button>
      </div>

      {/* Details */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>SUPPLIER</div><div style={{ fontWeight: 500 }}>{record.supplier_name}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>ITEM</div><div style={{ fontWeight: 500 }}>{record.item_name}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>WAREHOUSE</div><div>{record.warehouse_name || record.warehouse_id}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>UNIT</div><div>{record.unit}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>RECEIVED</div><div style={{ color: 'var(--green)', fontWeight: 600 }}>{fmtNum(record.qty_received, 2)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>CONSUMED</div><div style={{ color: 'var(--teal)', fontWeight: 600 }}>{fmtNum(record.qty_consumed, 2)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>RETURNED</div><div style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtNum(record.qty_returned, 2)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>BALANCE</div><div style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmtNum(balance, 2)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>UNIT COST</div><div>{fmtCur(record.unit_cost)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>BALANCE VALUE</div><div style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmtCur(balance * (record.unit_cost || 0))}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>RECEIPT DATE</div><div>{fmt(record.receipt_date)}</div></div>
          <div><div style={{ color: 'var(--text-dim)', fontSize: 11 }}>REVIEW DATE</div><div>{fmt(record.review_date)}</div></div>
        </div>
        {record.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {record.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        {canConsume && (
          <button
            className="btn btn-sm"
            style={{ background: 'var(--teal)', color: '#fff' }}
            onClick={onConsume}
          >
            <span className="material-icons md-16">remove_circle_outline</span> Consume
          </button>
        )}
        {canReturn && (
          <button
            className="btn btn-sm"
            style={{ background: 'var(--blue)', color: '#fff' }}
            onClick={onReturn}
          >
            <span className="material-icons md-16">assignment_return</span> Return
          </button>
        )}
      </div>

      {/* SLE History */}
      <div style={{ padding: '16px 20px', flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Movement History</div>
        {sles.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No movements recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sles.map(s => {
              const isIn = s.actual_qty > 0
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--surface2)',
                    borderRadius: 6,
                    borderLeft: `3px solid ${isIn ? 'var(--green)' : 'var(--teal)'}`,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, color: isIn ? 'var(--green)' : 'var(--teal)' }}>
                      {isIn ? '+' : ''}{fmtNum(s.actual_qty, 2)} {record.unit}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>
                      {s.posting_datetime ? String(s.posting_datetime).slice(0, 10) : '—'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-dim)' }}>
                    {isIn ? 'Receipt' : s.actual_qty < 0 && Math.abs(s.actual_qty) <= ((record.qty_consumed || 0)) ? 'Consumption / Return' : 'Issue'}
                    {s.created_by ? ` · ${s.created_by}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Consignment() {
  const [records, setRecords]         = useState([])
  const [suppliers, setSuppliers]     = useState([])
  const [items, setItems]             = useState([])
  const [warehouses, setWarehouses]   = useState([])
  const [selected, setSelected]       = useState(null)
  const [selectedSles, setSelectedSles] = useState([])
  const [loading, setLoading]         = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showConsumeModal, setShowConsumeModal] = useState(false)
  const [showReturnModal, setShowReturnModal]   = useState(false)
  const [filterStatus, setFilterStatus] = useState('All')
  const [search, setSearch]           = useState('')
  const { user } = useAuth()

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: recData },
        { data: supData },
        { data: itemData },
        { data: whData },
      ] = await Promise.all([
        supabase.from('consignment_stock').select('*').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('items').select('id, name, item_code, unit, valuation_rate').eq('is_active', true).order('name'),
        supabase.from('warehouses').select('id, name').eq('is_active', true),
      ])

      setRecords(recData || [])
      setSuppliers(supData || [])
      setItems(itemData || [])
      setWarehouses(whData || [])
    } catch (e) {
      toast.error('Failed to load consignment data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Load SLEs when a record is selected ───────────────────────────────────

  const loadSles = useCallback(async (record) => {
    if (!record) { setSelectedSles([]); return }
    const { data } = await supabase
      .from('stock_ledger_entries')
      .select('id, actual_qty, posting_datetime, created_by')
      .eq('voucher_type', 'Consignment')
      .eq('voucher_no', record.consignment_no)
      .order('posting_datetime', { ascending: true })
    setSelectedSles(data || [])
  }, [])

  const handleSelectRow = (rec) => {
    if (selected?.id === rec.id) {
      setSelected(null)
      setSelectedSles([])
    } else {
      setSelected(rec)
      loadSles(rec)
    }
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const todayStr = today()

  const kpis = useMemo(() => {
    const active = records.filter(r => ['Active', 'Partially Consumed'].includes(r.status))
    const totalValue = active.reduce((s, r) => {
      const bal = (r.qty_received || 0) - (r.qty_consumed || 0) - (r.qty_returned || 0)
      return s + bal * (r.unit_cost || 0)
    }, 0)
    const reviewDue = records.filter(r => {
      if (!r.review_date) return false
      return r.review_date <= addDays(todayStr, 7)
    }).length
    const supplierSet = new Set(active.map(r => r.supplier_id))
    return {
      activeCount: active.length,
      totalValue,
      reviewDue,
      supplierCount: supplierSet.size,
    }
  }, [records, todayStr])

  // ── Filtered records ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = filterStatus === 'All' ? records : records.filter(r => r.status === filterStatus)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(r =>
        r.consignment_no?.toLowerCase().includes(q) ||
        r.supplier_name?.toLowerCase().includes(q) ||
        r.item_name?.toLowerCase().includes(q) ||
        r.item_code?.toLowerCase().includes(q)
      )
    }
    return list
  }, [records, filterStatus, search])

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const active = records.filter(r => ['Active', 'Partially Consumed'].includes(r.status))
    if (!active.length) return toast('No active consignment records to export')
    const rows = active.map(r => {
      const bal = (r.qty_received || 0) - (r.qty_consumed || 0) - (r.qty_returned || 0)
      return {
        'CON No':          r.consignment_no,
        'Supplier':        r.supplier_name,
        'Item':            r.item_name,
        'Item Code':       r.item_code,
        'Warehouse':       r.warehouse_name || r.warehouse_id,
        'Unit':            r.unit,
        'Qty Received':    r.qty_received,
        'Qty Consumed':    r.qty_consumed,
        'Qty Returned':    r.qty_returned,
        'Balance':         bal,
        'Unit Cost':       r.unit_cost,
        'Balance Value':   bal * (r.unit_cost || 0),
        'Receipt Date':    r.receipt_date,
        'Review Date':     r.review_date,
        'Status':          r.status,
      }
    })
    exportXLSX(rows, `Consignment_Active_${todayStr}`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-container" style={{ paddingRight: selected ? 440 : undefined }}>
      <PageHeader
        title="Consignment Stock"
        subtitle="Supplier-owned goods held at company premises — payment triggered on consumption"
      >
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>
          <span className="material-icons md-18">download</span> Export Active
        </button>
        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
          <span className="material-icons md-18">refresh</span>
        </button>
        <button
          className="btn btn-primary btn-sm"
          style={{ background: 'var(--gold)', color: '#000' }}
          onClick={() => setShowReceiveModal(true)}
        >
          <span className="material-icons md-18">add</span> Receive Consignment
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard
          label="Active Consignments"
          value={kpis.activeCount}
          icon="inventory"
          color="blue"
        />
        <KPICard
          label="Total Consignment Value"
          value={fmtCur(kpis.totalValue)}
          icon="payments"
          color="gold"
        />
        <KPICard
          label="Items Due for Review"
          value={kpis.reviewDue}
          icon="event"
          color="yellow"
          sub="Within 7 days"
        />
        <KPICard
          label="Suppliers with Consignment"
          value={kpis.supplierCount}
          icon="local_shipping"
          color="teal"
        />
      </div>

      {/* Status filter tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              className={`tab-btn${filterStatus === s ? ' active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="input input-sm"
          placeholder="Search CON No, supplier, item…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', width: 240 }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state">
          <span className="material-icons md-36 spin" style={{ opacity: .4 }}>autorenew</span>
          <span className="empty-text">Loading…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="inventory_2"
          message="No consignment records found."
          action={{ label: 'Receive Consignment', onClick: () => setShowReceiveModal(true) }}
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>CON No</th>
                <th>Supplier</th>
                <th>Item</th>
                <th>Warehouse</th>
                <th className="text-right">Received</th>
                <th className="text-right">Consumed</th>
                <th className="text-right">Returned</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Value</th>
                <th>Receipt Date</th>
                <th>Review Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(rec => {
                const bal = (rec.qty_received || 0) - (rec.qty_consumed || 0) - (rec.qty_returned || 0)
                const value = bal * (rec.unit_cost || 0)
                const canConsume = ['Active', 'Partially Consumed'].includes(rec.status) && bal > 0
                const isSelected = selected?.id === rec.id
                const reviewSoon = rec.review_date && rec.review_date <= addDays(todayStr, 7)

                return (
                  <tr
                    key={rec.id}
                    className={isSelected ? 'row-selected' : ''}
                    onClick={() => handleSelectRow(rec)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className="mono" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                        {rec.consignment_no}
                      </span>
                    </td>
                    <td>{rec.supplier_name}</td>
                    <td>
                      <div>{rec.item_name}</div>
                      {rec.item_code && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{rec.item_code}</div>}
                    </td>
                    <td>{rec.warehouse_name || rec.warehouse_id}</td>
                    <td className="text-right">{fmtNum(rec.qty_received, 2)}</td>
                    <td className="text-right" style={{ color: rec.qty_consumed > 0 ? 'var(--teal)' : 'inherit' }}>
                      {fmtNum(rec.qty_consumed || 0, 2)}
                    </td>
                    <td className="text-right" style={{ color: rec.qty_returned > 0 ? 'var(--blue)' : 'inherit' }}>
                      {fmtNum(rec.qty_returned || 0, 2)}
                    </td>
                    <td className="text-right" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                      {fmtNum(bal, 2)}
                    </td>
                    <td className="text-right">{fmtCur(rec.unit_cost)}</td>
                    <td className="text-right" style={{ color: 'var(--gold)' }}>
                      {fmtCur(value)}
                    </td>
                    <td>{fmt(rec.receipt_date)}</td>
                    <td style={{ color: reviewSoon ? 'var(--yellow)' : 'inherit' }}>
                      {fmt(rec.review_date)}
                      {reviewSoon && <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginLeft: 4 }}>schedule</span>}
                    </td>
                    <td><StatusBadge status={rec.status} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canConsume && (
                          <button
                            className="btn btn-xs"
                            style={{ background: 'var(--teal)', color: '#fff' }}
                            onClick={() => { setSelected(rec); loadSles(rec); setShowConsumeModal(true) }}
                          >
                            Consume
                          </button>
                        )}
                        {bal > 0 && (
                          <button
                            className="btn btn-xs"
                            style={{ background: 'var(--blue)', color: '#fff' }}
                            onClick={() => { setSelected(rec); loadSles(rec); setShowReturnModal(true) }}
                          >
                            Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      {selected && !showConsumeModal && !showReturnModal && (
        <DetailDrawer
          record={selected}
          sles={selectedSles}
          onConsume={() => setShowConsumeModal(true)}
          onReturn={() => setShowReturnModal(true)}
          onClose={() => { setSelected(null); setSelectedSles([]) }}
        />
      )}

      {/* Modals */}
      <ReceiveModal
        open={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        onSaved={loadData}
        suppliers={suppliers}
        items={items}
        warehouses={warehouses}
        user={user}
      />

      <ConsumeModal
        open={showConsumeModal}
        onClose={() => setShowConsumeModal(false)}
        onSaved={() => { loadData(); if (selected) loadSles(selected) }}
        record={selected}
        user={user}
      />

      <ReturnModal
        open={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSaved={() => { loadData(); if (selected) loadSles(selected) }}
        record={selected}
        user={user}
      />
    </div>
  )
}
