// src/pages/Inventory/StockTransfers.jsx
// Warehouse-to-warehouse stock movement with approval workflow + paired SLE creation

import { useState, useMemo } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit } from '../../hooks/usePermission'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]
const thisMonth = today.slice(0, 7)

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  Draft:             'var(--text-dim)',
  'Pending Approval':'var(--yellow)',
  Approved:          'var(--blue)',
  'In Transit':      'var(--teal)',
  Completed:         'var(--green)',
  Cancelled:         'var(--red)',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-dim)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `${color}18`, color, border: `1px solid ${color}44`,
    }}>
      {status}
    </span>
  )
}

// ── Progress indicator ────────────────────────────────────────────────────────

const STEPS = ['Draft', 'Pending Approval', 'Approved', 'Completed']

function TransferProgress({ status }) {
  if (status === 'Cancelled') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', marginBottom: 16 }}>
        <span className="material-icons" style={{ color: 'var(--red)', fontSize: 18 }}>cancel</span>
        <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>Transfer Cancelled</span>
      </div>
    )
  }
  const activeIdx = status === 'In Transit' ? 2 : STEPS.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20 }}>
      {STEPS.map((step, i) => {
        const done    = i < activeIdx
        const active  = i === activeIdx
        const color   = done || active ? STATUS_COLORS[step === 'Approved' && status === 'In Transit' ? 'Approved' : step] || 'var(--blue)' : 'var(--border2)'
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 72 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'var(--green)' : active ? color : 'var(--surface2)',
                border: `2px solid ${done ? 'var(--green)' : active ? color : 'var(--border2)'}`,
              }}>
                {done
                  ? <span className="material-icons" style={{ fontSize: 14, color: '#fff' }}>check</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#fff' : 'var(--text-dim)' }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: 10, color: active ? color : done ? 'var(--green)' : 'var(--text-dim)', fontWeight: active || done ? 700 : 400, textAlign: 'center', lineHeight: 1.2 }}>{step}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--green)' : 'var(--border2)', margin: '0 4px', marginBottom: 20 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ['All', 'Draft', 'Pending', 'Approved', 'Completed', 'Cancelled']

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16, flexWrap: 'wrap' }}>
      {TABS.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: '6px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: active === t ? 700 : 400,
          color: active === t ? 'var(--gold)' : 'var(--text-dim)',
          borderBottom: active === t ? '2px solid var(--gold)' : '2px solid transparent',
          marginBottom: -1,
        }}>
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StockTransfers() {
  const {
    stockTransfers, warehouses, items, getBin,
    createStockTransfer, submitStockTransfer, approveStockTransfer,
    completeStockTransfer, cancelStockTransfer, loading,
  } = useInventory()
  const canEdit = useCanEdit('inventory', 'stock-transfers')
  const { user } = useAuth()

  const [showCreate, setShowCreate] = useState(false)
  const [viewTransfer, setViewTransfer] = useState(null)
  const [tab, setTab]         = useState('All')
  const [search, setSearch]   = useState('')

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const draft    = stockTransfers.filter(t => t.status === 'Draft').length
    const pending  = stockTransfers.filter(t => t.status === 'Pending Approval').length
    const active   = stockTransfers.filter(t => ['Approved', 'In Transit'].includes(t.status)).length
    const doneThisMonth = stockTransfers.filter(t =>
      t.status === 'Completed' && (t.completed_at || t.updated_at || '').startsWith(thisMonth)
    ).length
    return { draft, pending, active, doneThisMonth }
  }, [stockTransfers])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...stockTransfers]
    if (tab !== 'All') {
      const tabStatus = { Pending: 'Pending Approval', Approved: 'Approved' }
      const match = tabStatus[tab] || tab
      list = list.filter(t => t.status === match)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t => {
        const fromWh = warehouses.find(w => w.id === t.from_warehouse_id)?.name || ''
        const toWh   = warehouses.find(w => w.id === t.to_warehouse_id)?.name   || ''
        return (
          (t.transfer_no || '').toLowerCase().includes(q) ||
          fromWh.toLowerCase().includes(q) ||
          toWh.toLowerCase().includes(q) ||
          (t.purpose || '').toLowerCase().includes(q)
        )
      })
    }
    return list
  }, [stockTransfers, tab, search, warehouses])

  // ── Row actions ───────────────────────────────────────────────────────────

  const handleSubmit = async (transfer) => {
    try {
      await submitStockTransfer(transfer.id)
      toast.success(`${transfer.transfer_no} submitted for approval`)
    } catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (transfer) => {
    try {
      await approveStockTransfer(transfer.id, user?.full_name || user?.email || 'System', user?.id)
      toast.success(`${transfer.transfer_no} approved`)
    } catch (err) { toast.error(err.message) }
  }

  const handleComplete = async (transfer) => {
    try {
      await completeStockTransfer(transfer.id)
      toast.success(`${transfer.transfer_no} completed — SLEs created`)
    } catch (err) { toast.error(err.message) }
  }

  const handleCancel = async (transfer) => {
    const reason = window.prompt('Cancellation reason (optional):') ?? ''
    try {
      await cancelStockTransfer(transfer.id, reason)
      toast.success(`${transfer.transfer_no} cancelled`)
    } catch (err) { toast.error(err.message) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Stock Transfers">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <span className="material-icons">add_circle</span> New Transfer
          </button>
        )}
      </PageHeader>

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Draft"            value={kpis.draft}         sub="pending action"     />
        <KPICard label="Pending Approval" value={kpis.pending}       sub="awaiting sign-off"  color="yellow" />
        <KPICard label="Approved / In Transit" value={kpis.active}   sub="in progress"        color="teal"  />
        <KPICard label="Completed This Month"  value={kpis.doneThisMonth} sub="transfers done" color="green" />
      </div>

      {/* Search */}
      <div className="card" style={{ padding: 14, marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 18 }}>search</span>
          <input
            className="form-control"
            placeholder="Search by transfer no, warehouse, purpose…"
            style={{ maxWidth: 380 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 16 }}>
        <TabBar active={tab} onChange={setTab} />
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Transfer No</th>
                <th>Date</th>
                <th>Route</th>
                <th>Items</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="6">
                  <EmptyState icon="sync_alt" message="No transfers found" sub={tab !== 'All' ? `No ${tab} transfers` : 'Create your first stock transfer'} />
                </td></tr>
              ) : filtered.map(t => {
                const fromWh = warehouses.find(w => w.id === t.from_warehouse_id)?.name || t.from_warehouse_id
                const toWh   = warehouses.find(w => w.id === t.to_warehouse_id)?.name   || t.to_warehouse_id
                const lineCount = (t.stock_transfer_lines || []).length
                const txDate = (t.transfer_date || t.created_at || '').slice(0, 10)
                return (
                  <tr key={t.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)', background: 'rgba(212,175,55,.10)', padding: '2px 8px', borderRadius: 6 }}>
                        {t.transfer_no}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{txDate}</td>
                    <td>
                      <span style={{ fontSize: 12 }}>
                        <strong>{fromWh}</strong>
                        <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)', verticalAlign: 'middle', margin: '0 4px' }}>arrow_forward</span>
                        <strong>{toWh}</strong>
                      </span>
                      {t.purpose && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t.purpose}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {lineCount} item{lineCount !== 1 ? 's' : ''}
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" title="View" onClick={() => setViewTransfer(t)}>
                          <span className="material-icons" style={{ fontSize: 15 }}>visibility</span>
                        </button>
                        {canEdit && t.status === 'Draft' && (
                          <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: '#000', fontSize: 11 }} onClick={() => handleSubmit(t)}>
                            Submit
                          </button>
                        )}
                        {canEdit && t.status === 'Pending Approval' && (
                          <button className="btn btn-sm" style={{ background: 'var(--blue)', color: '#fff', fontSize: 11 }} onClick={() => handleApprove(t)}>
                            Approve
                          </button>
                        )}
                        {canEdit && t.status === 'Approved' && (
                          <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', fontSize: 11 }} onClick={() => handleComplete(t)}>
                            Complete
                          </button>
                        )}
                        {canEdit && ['Draft', 'Pending Approval'].includes(t.status) && (
                          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', fontSize: 11 }} onClick={() => handleCancel(t)}>
                            Cancel
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
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateTransferModal
          warehouses={warehouses}
          items={items}
          getBin={getBin}
          onClose={() => setShowCreate(false)}
          onSave={createStockTransfer}
          user={user}
        />
      )}

      {viewTransfer && (
        <ViewTransferModal
          transfer={viewTransfer}
          warehouses={warehouses}
          items={items}
          getBin={getBin}
          canEdit={canEdit}
          user={user}
          onClose={() => setViewTransfer(null)}
          onSubmit={submitStockTransfer}
          onApprove={approveStockTransfer}
          onComplete={completeStockTransfer}
          onCancel={cancelStockTransfer}
          stockTransfers={stockTransfers}
        />
      )}
    </div>
  )
}

// ── Create Transfer Modal ─────────────────────────────────────────────────────

function CreateTransferModal({ warehouses, items, getBin, onClose, onSave, user }) {
  const blankLine = () => ({ key: Date.now() + Math.random(), itemId: '', itemName: '', unit: 'pcs', qty: '', valuationRate: '', notes: '' })

  const [form, setForm] = useState({
    from_warehouse_id: '',
    to_warehouse_id:   '',
    transfer_date:     today,
    purpose:           '',
    department:        '',
    cost_center:       '',
    notes:             '',
    requested_by:      user?.full_name || user?.email || '',
  })
  const [lines, setLines] = useState([blankLine()])
  const [saving, setSaving] = useState(false)

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const updateLine = (idx, field, val) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const updated = { ...l, [field]: val }
      if (field === 'itemId') {
        const item = items.find(it => it.id === val)
        updated.itemName = item?.name || ''
        updated.unit = item?.unit || 'pcs'
        if (form.from_warehouse_id) {
          const bin = getBin(val, form.from_warehouse_id)
          updated.valuationRate = bin?.valuation_rate ?? item?.cost ?? ''
        }
      }
      return updated
    }))
  }

  const addLine    = () => setLines(prev => [...prev, blankLine()])
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx))

  const getBinQty = (itemId, warehouseId) => {
    if (!itemId || !warehouseId) return null
    const bin = getBin(itemId, warehouseId)
    return bin?.actual_qty ?? null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.from_warehouse_id) return toast.error('Select a source warehouse')
    if (!form.to_warehouse_id)   return toast.error('Select a destination warehouse')
    if (form.from_warehouse_id === form.to_warehouse_id) return toast.error('Source and destination must be different')
    const validLines = lines.filter(l => l.itemId && parseFloat(l.qty) > 0)
    if (!validLines.length) return toast.error('Add at least one line item with quantity > 0')

    // Validate sufficient stock
    for (const l of validLines) {
      const avail = getBinQty(l.itemId, form.from_warehouse_id) ?? 0
      if (parseFloat(l.qty) > avail) {
        const item = items.find(it => it.id === l.itemId)
        return toast.error(`Insufficient stock for "${item?.name || l.itemId}". Available: ${avail}`)
      }
    }

    setSaving(true)
    try {
      const result = await onSave(form, validLines.map(l => ({
        itemId: l.itemId, itemName: l.itemName, unit: l.unit,
        qty: l.qty, valuationRate: l.valuationRate, notes: l.notes,
      })))
      toast.success(`Transfer ${result.transfer_no} created`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <ModalDialog open onClose={onClose} title="New Stock Transfer" size="lg">
      <form onSubmit={handleSubmit}>
        {/* Warehouses */}
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>From Warehouse *</label>
            <select className="form-control" required value={form.from_warehouse_id}
              onChange={e => setField('from_warehouse_id', e.target.value)}>
              <option value="">— Select source —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
            <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 22 }}>arrow_forward</span>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>To Warehouse *</label>
            <select className="form-control" required value={form.to_warehouse_id}
              onChange={e => setField('to_warehouse_id', e.target.value)}>
              <option value="">— Select destination —</option>
              {warehouses.filter(w => w.id !== form.from_warehouse_id).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Meta */}
        <div className="form-row">
          <div className="form-group">
            <label>Transfer Date</label>
            <input type="date" className="form-control" value={form.transfer_date}
              onChange={e => setField('transfer_date', e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Purpose</label>
            <input className="form-control" value={form.purpose} placeholder="e.g. Replenishment for Processing Plant"
              onChange={e => setField('purpose', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <input className="form-control" value={form.department}
              onChange={e => setField('department', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Cost Center</label>
            <input className="form-control" value={form.cost_center}
              onChange={e => setField('cost_center', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Requested By</label>
            <input className="form-control" value={form.requested_by}
              onChange={e => setField('requested_by', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea className="form-control" rows="2" value={form.notes}
            onChange={e => setField('notes', e.target.value)} />
        </div>

        {/* Line items */}
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Line Items
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
            <span className="material-icons" style={{ fontSize: 15 }}>add</span> Add Item
          </button>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', fontSize: 11 }}>Item</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', fontSize: 11, width: 60 }}>Unit</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', fontSize: 11, width: 90 }}>On Hand</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', fontSize: 11, width: 90 }}>Qty</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-dim)', fontSize: 11, width: 100 }}>Val. Rate</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const fromQty = getBinQty(line.itemId, form.from_warehouse_id)
                const toQty   = getBinQty(line.itemId, form.to_warehouse_id)
                const qty     = parseFloat(line.qty) || 0
                const hasErr  = line.itemId && qty > 0 && fromQty !== null && qty > fromQty
                return (
                  <tr key={line.key} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <select className="form-control" style={{ fontSize: 12 }} value={line.itemId}
                        onChange={e => updateLine(idx, 'itemId', e.target.value)}>
                        <option value="">— Select item —</option>
                        {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{line.unit}</span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {fromQty !== null ? (
                        <span style={{ color: hasErr ? 'var(--red)' : 'var(--green)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {fromQty}
                        </span>
                      ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="number" className="form-control" style={{ fontSize: 12, width: 80 }}
                        min="0.01" step="0.01" value={line.qty}
                        onChange={e => updateLine(idx, 'qty', e.target.value)} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="number" className="form-control" style={{ fontSize: 12, width: 88 }}
                        min="0" step="0.01" value={line.valuationRate} placeholder="Auto"
                        onChange={e => updateLine(idx, 'valuationRate', e.target.value)} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', padding: 4 }}>
                          <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Stock impact preview */}
        {form.from_warehouse_id && form.to_warehouse_id && lines.some(l => l.itemId && parseFloat(l.qty) > 0) && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>
              Stock Impact Preview
            </div>
            {lines.filter(l => l.itemId && parseFloat(l.qty) > 0).map((l, i) => {
              const item = items.find(it => it.id === l.itemId)
              const fromQty = getBinQty(l.itemId, form.from_warehouse_id) ?? 0
              const toQty   = getBinQty(l.itemId, form.to_warehouse_id)   ?? 0
              const qty     = parseFloat(l.qty) || 0
              const fromWh  = warehouses.find(w => w.id === form.from_warehouse_id)?.name || 'Source'
              const toWh    = warehouses.find(w => w.id === form.to_warehouse_id)?.name   || 'Dest'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, minWidth: 140 }}>{item?.name}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{fromWh}:</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {fromQty} <span style={{ color: 'var(--red)' }}>→ {Math.max(0, fromQty - qty)}</span>
                  </span>
                  <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>arrow_forward</span>
                  <span style={{ color: 'var(--text-dim)' }}>{toWh}:</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>
                    {toQty} <span style={{ color: 'var(--green)' }}>→ {toQty + qty}</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Transfer (Draft)'}
          </button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

// ── View Transfer Modal ───────────────────────────────────────────────────────

function ViewTransferModal({
  transfer: initialTransfer,
  warehouses, items, getBin, canEdit, user,
  onClose, onSubmit, onApprove, onComplete, onCancel,
  stockTransfers,
}) {
  // Always read fresh state from stockTransfers array
  const transfer = stockTransfers.find(t => t.id === initialTransfer.id) || initialTransfer
  const [busy, setBusy] = useState(false)

  const fromWh = warehouses.find(w => w.id === transfer.from_warehouse_id)?.name || transfer.from_warehouse_id
  const toWh   = warehouses.find(w => w.id === transfer.to_warehouse_id)?.name   || transfer.to_warehouse_id
  const lines  = transfer.stock_transfer_lines || []

  const wrap = (fn) => async () => {
    setBusy(true)
    try { await fn() }
    catch (err) { toast.error(err.message) }
    finally { setBusy(false) }
  }

  const handleSubmit  = wrap(async () => { await onSubmit(transfer.id); toast.success('Submitted for approval') })
  const handleApprove = wrap(async () => { await onApprove(transfer.id, user?.full_name || user?.email || 'System', user?.id); toast.success('Approved') })
  const handleComplete = wrap(async () => { await onComplete(transfer.id); toast.success('Transfer completed — SLEs created') })
  const handleCancel  = wrap(async () => {
    const reason = window.prompt('Cancellation reason (optional):') ?? ''
    await onCancel(transfer.id, reason)
    toast.success('Transfer cancelled')
  })

  const txDate = (transfer.transfer_date || transfer.created_at || '').slice(0, 10)

  return (
    <ModalDialog open onClose={onClose} title={`Transfer: ${transfer.transfer_no}`} size="lg">
      {/* Progress */}
      <TransferProgress status={transfer.status} />

      {/* Header info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 16px', background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 20 }}>
        {[
          { label: 'Transfer No',  value: transfer.transfer_no, mono: true },
          { label: 'Date',         value: txDate },
          { label: 'Status',       value: <StatusBadge status={transfer.status} /> },
          { label: 'From',         value: fromWh },
          { label: 'To',           value: toWh },
          { label: 'Purpose',      value: transfer.purpose || '—' },
          { label: 'Department',   value: transfer.department || '—' },
          { label: 'Cost Center',  value: transfer.cost_center || '—' },
          { label: 'Requested By', value: transfer.requested_by || '—' },
          { label: 'Approved By',  value: transfer.approved_by || '—' },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? 'var(--mono)' : undefined, color: mono ? 'var(--gold)' : 'var(--text)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {transfer.notes && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 700 }}>Notes: </span>{transfer.notes}
        </div>
      )}

      {/* Lines table */}
      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)' }}>
        Line Items ({lines.length})
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>Item</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>Unit</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>Qty Requested</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>Qty Transferred</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>From Bin Qty</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }}>To Bin Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>No line items</td></tr>
            ) : lines.map((line, i) => {
              const fromBin = getBin(line.item_id, transfer.from_warehouse_id)
              const toBin   = getBin(line.item_id, transfer.to_warehouse_id)
              const fromQty = fromBin?.actual_qty ?? '—'
              const toQty   = toBin?.actual_qty   ?? '—'
              const completed = transfer.status === 'Completed'
              return (
                <tr key={line.id || i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{line.item_name}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{line.unit}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{line.qty}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: completed ? 'var(--green)' : 'var(--text-dim)' }}>
                    {line.qty_transferred ?? 0}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{fromQty}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{toQty}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Cancellation reason */}
      {transfer.status === 'Cancelled' && transfer.cancellation_reason && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: 'var(--red)' }}>Cancellation Reason: </span>
          <span style={{ color: 'var(--text-dim)' }}>{transfer.cancellation_reason}</span>
        </div>
      )}

      {/* Actions */}
      <ModalActions>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        {canEdit && transfer.status === 'Draft' && <>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={handleCancel} disabled={busy}>Cancel Transfer</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>{busy ? 'Submitting…' : 'Submit for Approval'}</button>
        </>}
        {canEdit && transfer.status === 'Pending Approval' && <>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={handleCancel} disabled={busy}>Cancel Transfer</button>
          <button className="btn btn-primary" style={{ background: 'var(--blue)' }} onClick={handleApprove} disabled={busy}>{busy ? 'Approving…' : 'Approve'}</button>
        </>}
        {canEdit && transfer.status === 'Approved' && (
          <button className="btn btn-primary" style={{ background: 'var(--green)' }} onClick={handleComplete} disabled={busy}>{busy ? 'Completing…' : 'Complete Transfer'}</button>
        )}
      </ModalActions>
    </ModalDialog>
  )
}
