// src/pages/Inventory/Warehouses.jsx
//
// Warehouse management: card grid view, add/edit modal, active toggle,
// per-warehouse stock stats, and stock-alert reorder section.

import { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useInventory } from '../../contexts/InventoryContext'
import { PageHeader, EmptyState, ModalActions } from '../../components/ui'

// ── Constants ──────────────────────────────────────────────────────────────────

/** IDs of the seed/default warehouses that must never be deleted. */
const PROTECTED_IDS = ['wh_main_store', 'wh_rejected', 'wh_transit']

const WAREHOUSE_TYPES = [
  { value: 'stores',         label: 'Stores',         color: 'var(--blue)',     bg: 'rgba(96,165,250,0.12)'  },
  { value: 'transit',        label: 'Transit',        color: 'var(--yellow)',   bg: 'rgba(251,191,36,0.12)'  },
  { value: 'rejected',       label: 'Rejected',       color: 'var(--red)',      bg: 'rgba(248,113,113,0.12)' },
  { value: 'wip',            label: 'WIP',            color: 'var(--purple)',   bg: 'rgba(167,139,250,0.12)' },
  { value: 'finished_goods', label: 'Finished Goods', color: 'var(--green)',    bg: 'rgba(52,211,153,0.12)'  },
  { value: 'virtual',        label: 'Virtual',        color: 'var(--text-dim)', bg: 'rgba(120,120,120,0.10)' },
]

const TYPE_META = Object.fromEntries(WAREHOUSE_TYPES.map(t => [t.value, t]))

function getTypeMeta(type) {
  return TYPE_META[type] ?? { label: type ?? 'Unknown', color: 'var(--text-dim)', bg: 'rgba(120,120,120,0.10)' }
}

const EMPTY_FORM = { code: '', name: '', type: 'stores', description: '', is_group: false, parent_id: '' }

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtNum = (n) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fmtCurrency = (n) => {
  if (n == null || isNaN(n)) return '$0.00'
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const { label, color, bg } = getTypeMeta(type)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4,
      background: bg, color,
    }}>
      {label}
    </span>
  )
}

// ── WarehouseCard ─────────────────────────────────────────────────────────────

function WarehouseCard({ wh, stats, parentName, onEdit, onDelete, onToggleActive }) {
  const isProtected = PROTECTED_IDS.includes(wh.id)
  const { color } = getTypeMeta(wh.type)

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        opacity: wh.is_active ? 1 : 0.55,
        border: wh.is_active ? '1px solid var(--border)' : '1px dashed var(--border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Colour stripe by type */}
      <div style={{ height: 3, background: color, flexShrink: 0 }} />

      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Row 1: code + type + is_group + active toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800,
            color: 'var(--gold)', background: 'rgba(184,50,50,0.10)',
            padding: '2px 8px', borderRadius: 4, letterSpacing: 0.5,
          }}>
            {wh.code}
          </span>
          <TypeBadge type={wh.type} />
          {wh.is_group && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--teal)',
              background: 'rgba(45,212,191,0.10)', padding: '2px 6px',
              borderRadius: 4, letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
              Group
            </span>
          )}
          <span style={{ flex: 1 }} />
          {/* Active toggle pill */}
          <button
            onClick={() => onToggleActive(wh)}
            title={wh.is_active ? 'Click to deactivate' : 'Click to activate'}
            style={{
              padding: '2px 9px', fontSize: 11, fontWeight: 700, borderRadius: 4,
              background: wh.is_active ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.10)',
              color: wh.is_active ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${wh.is_active ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
              cursor: 'pointer',
            }}
          >
            <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>
              {wh.is_active ? 'toggle_on' : 'toggle_off'}
            </span>
            {wh.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>

        {/* Row 2: name */}
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{wh.name}</div>

        {/* Row 3: parent (if any) */}
        {parentName && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: -6 }}>
            <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>
              subdirectory_arrow_right
            </span>
            under {parentName}
          </div>
        )}

        {/* Row 4: description */}
        {wh.description && (
          <div style={{
            fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {wh.description}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
          padding: '8px 0', marginTop: 'auto',
        }}>
          {[
            { label: 'Items',      value: stats.itemCount,        color: 'var(--text)'  },
            { label: 'Total Qty',  value: fmtNum(stats.totalQty), color: 'var(--text)'  },
            { label: 'Stock Value',value: fmtCurrency(stats.stockValue), color: 'var(--gold)' },
          ].map(({ label, value, color: c }, i) => (
            <div key={label} style={{
              textAlign: 'center',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: i === 2 ? 12 : 17, fontWeight: 700, color: c, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 0.3, marginTop: 3, textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(wh)} title="Edit">
            <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
            Edit
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDelete(wh)}
            disabled={isProtected}
            title={isProtected ? 'Default system warehouse — cannot delete' : 'Delete warehouse'}
            style={{ opacity: isProtected ? 0.35 : 1 }}
          >
            <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WarehouseModal ─────────────────────────────────────────────────────────────

function WarehouseModal({ open, editing, warehouses, onClose, onSave }) {
  const [form,   setForm]   = useState(() => editing ? {
    code:        editing.code        ?? '',
    name:        editing.name        ?? '',
    type:        editing.type        ?? 'stores',
    description: editing.description ?? '',
    is_group:    editing.is_group    ?? false,
    parent_id:   editing.parent_id   ?? '',
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const parentOpts = warehouses.filter(w => w.id !== editing?.id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code.trim()) { toast.error('Code is required'); return }
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      await onSave({
        code:        form.code.trim().toUpperCase(),
        name:        form.name.trim(),
        type:        form.type,
        description: form.description.trim(),
        is_group:    form.is_group,
        parent_id:   form.parent_id || null,
      })
      onClose()
    } catch (err) {
      toast.error(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {editing ? 'Edit' : 'Add'} <span>Warehouse</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label>Code <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                placeholder="e.g. MAIN-STORE"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
                readOnly={!!editing}
                style={editing ? { background: 'var(--surface2)', color: 'var(--text-dim)' } : {}}
              />
              {editing && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Code is immutable after creation</span>
              )}
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                className="form-control"
                value={form.type}
                onChange={e => set('type', e.target.value)}
              >
                {WAREHOUSE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              placeholder="e.g. Main Storeroom"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Description</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Optional notes about this warehouse…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label>Parent Warehouse <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
              <select
                className="form-control"
                value={form.parent_id}
                onChange={e => set('parent_id', e.target.value)}
              >
                <option value="">— None —</option>
                {parentOpts.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '10px 14px', background: 'var(--surface2)',
                  border: '1px solid var(--border2)', borderRadius: 8, userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.is_group}
                  onChange={e => set('is_group', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13 }}>Is Group</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(contains sub-warehouses)</span>
              </label>
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="material-icons" style={{ fontSize: 15 }}>
                {saving ? 'hourglass_top' : editing ? 'save' : 'add_business'}
              </span>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Warehouse'}
            </button>
          </ModalActions>
        </form>
      </div>
    </div>
  )
}

// ── Stock Alerts ──────────────────────────────────────────────────────────────

function StockAlerts({ bins, warehouses, getItemsBelowReorder, autoCreateReorderMRs }) {
  const [creating, setCreating] = useState(false)

  // Re-compute alerts whenever bins/warehouses change (memoised inside parent via useMemo dependency)
  const alerts = getItemsBelowReorder()

  const warehouseMap = useMemo(
    () => Object.fromEntries(warehouses.map(w => [w.id, w])),
    [warehouses]
  )

  const binMap = useMemo(() => {
    const m = {}
    bins.forEach(b => { m[`${b.item_id}::${b.warehouse_id}`] = b })
    return m
  }, [bins])

  const handleCreateMRs = async () => {
    setCreating(true)
    try {
      const count = await autoCreateReorderMRs('system')
      if (count === 0) {
        toast('No reorder MRs needed — all items are above reorder level', { icon: 'ℹ️' })
      } else {
        toast.success(`Created ${count} reorder Material Request${count !== 1 ? 's' : ''}`)
      }
    } catch (err) {
      toast.error(err.message ?? 'Failed to create reorder MRs')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="material-icons"
            style={{ fontSize: 22, color: alerts.length ? 'var(--yellow)' : 'var(--green)' }}
          >
            {alerts.length ? 'warning_amber' : 'check_circle'}
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Stock Alerts</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>
              {alerts.length
                ? `${alerts.length} item${alerts.length !== 1 ? 's' : ''} below reorder level`
                : 'All items are above their reorder levels — no action needed'}
            </div>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCreateMRs}
          disabled={creating || alerts.length === 0}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>
            {creating ? 'hourglass_top' : 'add_shopping_cart'}
          </span>
          {creating ? 'Creating MRs…' : 'Create Reorder MRs'}
        </button>
      </div>

      <div className="card">
        {alerts.length === 0 ? (
          <EmptyState icon="inventory" message="No items below reorder level — stock is healthy" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Warehouse</th>
                  <th style={{ textAlign: 'right' }}>Actual Qty</th>
                  <th style={{ textAlign: 'right' }}>Projected Qty</th>
                  <th style={{ textAlign: 'right' }}>Reorder Level</th>
                  <th style={{ textAlign: 'right' }}>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((rl, idx) => {
                  const wh         = warehouseMap[rl.warehouse_id]
                  const binEntry   = binMap[`${rl.item_id}::${rl.warehouse_id}`]
                  const actualQty  = binEntry?.actual_qty ?? 0
                  const projQty    = rl.projQty ?? 0
                  const shortage   = rl.shortage ?? Math.max(0, rl.reorder_level - projQty)
                  return (
                    <tr key={`${rl.item_id}::${rl.warehouse_id}::${idx}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{rl.item?.name ?? rl.item_id}</div>
                        {rl.item?.category && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            {rl.item.category}
                            {rl.item?.unit ? ` · ${rl.item.unit}` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        {wh ? (
                          <>
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)', marginRight: 5,
                            }}>
                              {wh.code}
                            </span>
                            <span style={{ color: 'var(--text-mid)' }}>{wh.name}</span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                            {rl.warehouse_id}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {fmtNum(actualQty)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        <span style={{ color: projQty <= 0 ? 'var(--red)' : 'var(--yellow)', fontWeight: 600 }}>
                          {fmtNum(projQty)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                        {fmtNum(rl.reorder_level)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)',
                          background: 'rgba(248,113,113,0.10)', padding: '2px 8px', borderRadius: 4,
                        }}>
                          -{fmtNum(shortage)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Warehouses() {
  const {
    warehouses,
    bins,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    getItemsBelowReorder,
    autoCreateReorderMRs,
    fetchAll,
  } = useInventory()

  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('ALL')

  // ── Per-warehouse stats ───────────────────────────────────────────────────

  const binsByWarehouse = useMemo(() => {
    const m = {}
    bins.forEach(b => {
      if (!m[b.warehouse_id]) m[b.warehouse_id] = []
      m[b.warehouse_id].push(b)
    })
    return m
  }, [bins])

  const warehouseStats = useMemo(() => {
    const m = {}
    warehouses.forEach(wh => {
      const whBins    = binsByWarehouse[wh.id] ?? []
      const withStock = whBins.filter(b => (b.actual_qty ?? 0) > 0)
      m[wh.id] = {
        itemCount:  new Set(withStock.map(b => b.item_id)).size,
        totalQty:   withStock.reduce((s, b) => s + (Number(b.actual_qty) || 0), 0),
        stockValue: whBins.reduce((s, b) => s + (Number(b.stock_value) || 0), 0),
      }
    })
    return m
  }, [warehouses, binsByWarehouse])

  // ── KPI totals ────────────────────────────────────────────────────────────

  const totalStockValue = useMemo(
    () => Object.values(warehouseStats).reduce((s, w) => s + w.stockValue, 0),
    [warehouseStats]
  )
  const activeCount = warehouses.filter(w => w.is_active).length

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return warehouses.filter(w => {
      if (typeFilter !== 'ALL' && w.type !== typeFilter) return false
      if (q && !(
        w.code?.toLowerCase().includes(q) ||
        w.name?.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [warehouses, search, typeFilter])

  // ── Warehouse map (for parent lookup) ────────────────────────────────────

  const warehouseMap = useMemo(
    () => Object.fromEntries(warehouses.map(w => [w.id, w])),
    [warehouses]
  )

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openCreate = () => { setEditing(null); setShowModal(true) }
  const openEdit   = (wh) => { setEditing(wh); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditing(null) }

  const handleSave = async (formData) => {
    if (editing) {
      // Never update the code — strip it from the payload
      const { code: _code, ...updates } = formData
      await updateWarehouse(editing.id, updates)
      toast.success('Warehouse updated')
    } else {
      await addWarehouse({ ...formData, is_active: true })
      toast.success('Warehouse created')
    }
  }

  const handleToggleActive = async (wh) => {
    try {
      await updateWarehouse(wh.id, { is_active: !wh.is_active })
      toast.success(wh.is_active ? `"${wh.name}" deactivated` : `"${wh.name}" activated`)
    } catch (err) {
      toast.error(err.message ?? 'Update failed')
    }
  }

  const handleDelete = async (wh) => {
    if (PROTECTED_IDS.includes(wh.id)) {
      toast.error('Default system warehouses cannot be deleted')
      return
    }
    const hasStock = (binsByWarehouse[wh.id] ?? []).some(b => (b.actual_qty ?? 0) > 0)
    if (hasStock) {
      toast.error('Cannot delete warehouse with stock')
      return
    }
    if (!window.confirm(`Delete warehouse "${wh.name}" (${wh.code})? This cannot be undone.`)) return
    try {
      await deleteWarehouse(wh.id)
      toast.success(`"${wh.name}" deleted`)
    } catch (err) {
      toast.error(err.message ?? 'Delete failed')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Warehouses" subtitle="Manage physical and virtual inventory locations">
        <button className="btn btn-secondary btn-sm" onClick={fetchAll} title="Refresh data">
          <span className="material-icons" style={{ fontSize: 15 }}>refresh</span>
        </button>
        <button className="btn btn-primary" onClick={openCreate}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          Add Warehouse
        </button>
      </PageHeader>

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Warehouses</div>
          <div className="kpi-val">{warehouses.length}</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-label">Active</div>
          <div className="kpi-val">{activeCount}</div>
        </div>
        <div className="kpi-card kpi-gold">
          <div className="kpi-label">Total Stock Value</div>
          <div className="kpi-val" style={{ fontSize: 20 }}>{fmtCurrency(totalStockValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-control"
          placeholder="Search code, name, description…"
          style={{ maxWidth: 240 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={typeFilter === 'ALL' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setTypeFilter('ALL')}
          >
            All Types
          </button>
          {WAREHOUSE_TYPES.map(t => (
            <button
              key={t.value}
              className={typeFilter === t.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setTypeFilter(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {filtered.length !== warehouses.length && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
            {filtered.length} / {warehouses.length} shown
          </span>
        )}
      </div>

      {/* Warehouse card grid */}
      {warehouses.length === 0 ? (
        <EmptyState
          icon="warehouse"
          message="No warehouses configured yet"
          action={{ label: 'Add Warehouse', onClick: openCreate }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          message="No warehouses match your filters"
          action={{ label: 'Clear Filters', onClick: () => { setSearch(''); setTypeFilter('ALL') } }}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}>
          {filtered.map(wh => (
            <WarehouseCard
              key={wh.id}
              wh={wh}
              stats={warehouseStats[wh.id] ?? { itemCount: 0, totalQty: 0, stockValue: 0 }}
              parentName={wh.parent_id ? warehouseMap[wh.parent_id]?.name : null}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {/* Stock Alerts */}
      <StockAlerts
        bins={bins}
        warehouses={warehouses}
        getItemsBelowReorder={getItemsBelowReorder}
        autoCreateReorderMRs={autoCreateReorderMRs}
      />

      {/* Add / Edit Modal */}
      {showModal && (
        <WarehouseModal
          open={showModal}
          editing={editing}
          warehouses={warehouses}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
