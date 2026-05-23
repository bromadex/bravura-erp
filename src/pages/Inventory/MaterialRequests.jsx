// src/pages/Inventory/MaterialRequests.jsx
// Material Requests — list, create, view, submit, cancel, auto-reorder

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '../../contexts/InventoryContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader, EmptyState, KPICard, TabNav,
  ModalDialog, ModalActions,
} from '../../components/ui'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

// ── helpers ────────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]

const fmt = (d) => (d ? String(d).slice(0, 10) : '—')

const MR_TYPES = ['Purchase', 'Transfer', 'Issue', 'Manufacture']

const STATUS_BADGE = {
  Draft:               'badge-yellow',
  Submitted:           'badge-blue',
  Pending:             'badge-blue',
  'Partially Ordered': 'badge-purple',
  Ordered:             'badge-teal',
  'Partially Received':'badge-purple',
  Received:            'badge-green',
  Cancelled:           'badge-red',
  Stopped:             'badge-red',
}

function MrBadge({ status }) {
  const cls = STATUS_BADGE[status] || 'badge-dim'
  return <span className={`badge ${cls}`}>{status || '—'}</span>
}

function ProgressBar({ pct, color = 'var(--teal)', label }) {
  const val = Math.min(100, Math.max(0, parseFloat(pct) || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden',
      }}>
        <div style={{ width: `${val}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', minWidth: 34 }}>
        {val.toFixed(0)}%
      </span>
    </div>
  )
}

// blank row for the create-form items table
const blankRow = () => ({
  _key:          Math.random().toString(36).slice(2),
  item_id:       '',
  item_name:     '',
  qty:           1,
  unit:          '',
  schedule_date: '',
  notes:         '',
})

// ── tabs ───────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'ordered',   label: 'Ordered' },
  { id: 'received',  label: 'Received' },
  { id: 'cancelled', label: 'Cancelled' },
]

function tabFilter(tab, mr) {
  if (tab === 'all')       return true
  if (tab === 'draft')     return mr.status === 'Draft'
  if (tab === 'submitted') return mr.status === 'Submitted' || mr.status === 'Pending'
  if (tab === 'ordered')   return mr.status === 'Ordered' || mr.status === 'Partially Ordered'
  if (tab === 'received')  return mr.status === 'Received' || mr.status === 'Partially Received'
  if (tab === 'cancelled') return mr.status === 'Cancelled' || mr.status === 'Stopped'
  return true
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function MaterialRequests() {
  const {
    items, warehouses, materialRequests, mrItems,
    createMaterialRequest, updateMaterialRequestStatus, deleteMaterialRequest,
    getItemsBelowReorder, autoCreateReorderMRs,
    DEFAULT_WAREHOUSE, getActualQty,
    loading,
  } = useInventory()

  const { user } = useAuth()
  const navigate = useNavigate()

  const [activeTab,   setActiveTab]   = useState('all')
  const [showCreate,  setShowCreate]  = useState(false)
  const [viewMr,      setViewMr]      = useState(null)   // MR object being viewed
  const [search,      setSearch]      = useState('')

  // ── KPIs ──────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total            = materialRequests.length
    const draft            = materialRequests.filter(m => m.status === 'Draft').length
    const submittedPending = materialRequests.filter(m => m.status === 'Submitted' || m.status === 'Pending').length
    const ordered          = materialRequests.filter(m => m.status === 'Ordered' || m.status === 'Partially Ordered').length
    const received         = materialRequests.filter(m => m.status === 'Received' || m.status === 'Partially Received').length
    return { total, draft, submittedPending, ordered, received }
  }, [materialRequests])

  const belowReorder = useMemo(() => getItemsBelowReorder(), [getItemsBelowReorder, items])

  // ── filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return materialRequests.filter(mr => {
      if (!tabFilter(activeTab, mr)) return false
      if (q) {
        return (
          mr.mr_number?.toLowerCase().includes(q) ||
          mr.requested_by?.toLowerCase().includes(q) ||
          mr.department?.toLowerCase().includes(q) ||
          mr.type?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [materialRequests, activeTab, search])

  // tab counts
  const tabsWithCounts = useMemo(() => TABS.map(t => ({
    ...t,
    count: t.id === 'all' ? materialRequests.length : materialRequests.filter(mr => tabFilter(t.id, mr)).length,
  })), [materialRequests])

  // ── auto-reorder ───────────────────────────────────────────────
  const handleAutoReorder = async () => {
    if (belowReorder.length === 0) {
      toast('All items are above reorder level.', { icon: '✓' })
      return
    }
    const tid = toast.loading(`Creating MRs for ${belowReorder.length} item(s)…`)
    try {
      const count = await autoCreateReorderMRs(user?.username || user?.name || 'system')
      toast.success(`Created ${count} reorder MR${count !== 1 ? 's' : ''}.`, { id: tid })
    } catch (err) {
      toast.error(err.message, { id: tid })
    }
  }

  // ── delete ─────────────────────────────────────────────────────
  const handleDelete = async (mr) => {
    if (!window.confirm(`Delete ${mr.mr_number}? This cannot be undone.`)) return
    try {
      await deleteMaterialRequest(mr.id)
      toast.success(`${mr.mr_number} deleted`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── submit (from list action) ──────────────────────────────────
  const handleSubmitMr = async (mr) => {
    try {
      await updateMaterialRequestStatus(mr.id, 'Submitted')
      // update indented qty on bins for each MR item
      const lines = mrItems.filter(i => i.mr_id === mr.id)
      for (const line of lines) {
        await supabase.rpc('fn_mr_update_bin_indented', {
          p_item_id:      line.item_id,
          p_warehouse_id: line.warehouse_id || DEFAULT_WAREHOUSE,
          p_qty_delta:    line.qty,
        })
      }
      toast.success(`${mr.mr_number} submitted`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <PageHeader title="Material Requests">
        <button
          className="btn btn-secondary"
          onClick={handleAutoReorder}
          title={`${belowReorder.length} item(s) below reorder level`}
        >
          <span className="material-icons">autorenew</span>
          Auto-Reorder
          {belowReorder.length > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 4 }}>{belowReorder.length}</span>
          )}
        </button>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <span className="material-icons">add_circle</span> New MR
        </button>
      </PageHeader>

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total MRs"         value={kpi.total}            icon="list_alt"           />
        <KPICard label="Draft"             value={kpi.draft}            icon="edit_note"          color="yellow" />
        <KPICard label="Submitted/Pending" value={kpi.submittedPending} icon="pending_actions"    color="blue"   />
        <KPICard label="Ordered"           value={kpi.ordered}          icon="shopping_cart"      color="teal"   />
        <KPICard label="Received"          value={kpi.received}         icon="inventory"          color="green"  />
      </div>

      {/* Tabs + search bar */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 12 }}>
        <TabNav tabs={tabsWithCounts} active={activeTab} onChange={t => { setActiveTab(t); setSearch('') }} />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <input
            className="form-control"
            placeholder="Search MR#, department, requested by…"
            style={{ maxWidth: 340 }}
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

      {/* MR table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>MR #</th>
                <th>Date</th>
                <th>Type</th>
                <th>Requested By</th>
                <th>Department</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th>Status</th>
                <th style={{ minWidth: 90 }}>% Ordered</th>
                <th style={{ minWidth: 90 }}>% Received</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: 40 }}>
                    <span className="material-icons" style={{ fontSize: 28, opacity: .3, display: 'block', marginBottom: 6 }}>hourglass_empty</span>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="10">
                    <EmptyState
                      icon="assignment"
                      message="No material requests found"
                      action={{ label: 'Create New MR', onClick: () => setShowCreate(true) }}
                    />
                  </td>
                </tr>
              ) : filtered.map(mr => {
                const lineCount = mrItems.filter(i => i.mr_id === mr.id).length
                const isDraft   = mr.status === 'Draft'
                const canCancel = mr.status === 'Draft' || mr.status === 'Submitted' || mr.status === 'Pending'
                return (
                  <tr key={mr.id}>
                    <td style={{ fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                      {mr.mr_number}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(mr.transaction_date)}</td>
                    <td>
                      <span className="badge badge-dim">{mr.type}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>{mr.requested_by || '—'}</td>
                    <td style={{ fontSize: 13 }}>{mr.department || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-dim">{lineCount}</span>
                    </td>
                    <td>
                      <MrBadge status={mr.status} />
                    </td>
                    <td>
                      <ProgressBar pct={mr.per_ordered} color="var(--teal)" />
                    </td>
                    <td>
                      <ProgressBar pct={mr.per_received} color="var(--green)" />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {/* View */}
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View MR"
                          onClick={() => setViewMr(mr)}
                        >
                          <span className="material-icons" style={{ fontSize: 16 }}>visibility</span>
                        </button>
                        {/* Submit (Draft only) */}
                        {isDraft && (
                          <button
                            className="btn btn-primary btn-sm"
                            title="Submit"
                            onClick={() => handleSubmitMr(mr)}
                          >
                            <span className="material-icons" style={{ fontSize: 16 }}>arrow_forward</span>
                          </button>
                        )}
                        {/* Delete (Draft only) */}
                        {isDraft && (
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete"
                            onClick={() => handleDelete(mr)}
                          >
                            <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
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

      {/* Create modal */}
      {showCreate && (
        <CreateMRModal
          items={items}
          warehouses={warehouses}
          getActualQty={getActualQty}
          defaultWarehouse={DEFAULT_WAREHOUSE}
          user={user}
          onCreate={createMaterialRequest}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* View modal */}
      {viewMr && (
        <ViewMRModal
          mr={viewMr}
          lines={mrItems.filter(i => i.mr_id === viewMr.id)}
          onClose={() => setViewMr(null)}
          onStatusChange={async (id, status) => {
            await updateMaterialRequestStatus(id, status)
            setViewMr(prev => prev ? { ...prev, status } : null)
          }}
          onSubmit={async (mr) => {
            await handleSubmitMr(mr)
            setViewMr(prev => prev ? { ...prev, status: 'Submitted' } : null)
          }}
          onNavigateToPO={(mr) => navigate(`/module/procurement/purchase-orders?source_mr_id=${encodeURIComponent(mr.id)}&mr_number=${encodeURIComponent(mr.mr_number || '')}`)}
          defaultWarehouse={DEFAULT_WAREHOUSE}
          mrItems={mrItems}
        />
      )}
    </div>
  )
}

// ── Create MR Modal ────────────────────────────────────────────────────────────

function CreateMRModal({ items, warehouses, getActualQty, defaultWarehouse, user, onCreate, onClose }) {
  const [header, setHeader] = useState({
    type:             'Purchase',
    required_by_date: '',
    department:       '',
    requested_by:     user?.name || user?.username || '',
    set_warehouse_id: defaultWarehouse,
    notes:            '',
  })
  const [rows, setRows]   = useState([blankRow()])
  const [saving, setSaving] = useState(false)

  const setHeaderField = (field, value) => setHeader(h => ({ ...h, [field]: value }))

  // rows helpers
  const addRow    = () => setRows(r => [...r, blankRow()])
  const removeRow = (key) => setRows(r => r.filter(x => x._key !== key))

  const updateRow = (key, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r
      const updated = { ...r, [field]: value }
      if (field === 'item_id') {
        const item = items.find(i => i.id === value)
        updated.item_name = item?.name || ''
        updated.unit      = item?.unit || ''
      }
      return updated
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // validate rows
    const validRows = rows.filter(r => r.item_id)
    if (validRows.length === 0) {
      toast.error('Add at least one item to the request.')
      return
    }
    for (const r of validRows) {
      if (!r.qty || parseFloat(r.qty) <= 0) {
        toast.error(`Qty must be > 0 for "${r.item_name || 'a row'}"`)
        return
      }
    }

    setSaving(true)
    try {
      const result = await onCreate(
        {
          type:             header.type,
          transaction_date: today,
          required_by_date: header.required_by_date || null,
          department:       header.department || null,
          requested_by:     header.requested_by || null,
          set_warehouse_id: header.set_warehouse_id || defaultWarehouse,
          notes:            header.notes || null,
          created_by:       user?.username || user?.name || null,
        },
        validRows.map(r => ({
          item_id:       r.item_id,
          item_name:     r.item_name,
          qty:           parseFloat(r.qty),
          unit:          r.unit,
          warehouse_id:  header.set_warehouse_id || defaultWarehouse,
          schedule_date: r.schedule_date || null,
          notes:         r.notes || null,
        }))
      )
      toast.success(`MR created: ${result.mr_number}`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open onClose={onClose} title="New Material Request" size="xl">
      <form onSubmit={handleSubmit}>
        {/* Header fields */}
        <div className="form-row">
          <div className="form-group">
            <label>Type *</label>
            <select
              className="form-control"
              value={header.type}
              onChange={e => setHeaderField('type', e.target.value)}
            >
              {MR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Required By Date</label>
            <input
              type="date"
              className="form-control"
              value={header.required_by_date}
              min={today}
              onChange={e => setHeaderField('required_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <input
              className="form-control"
              placeholder="e.g. Kitchen, Maintenance"
              value={header.department}
              onChange={e => setHeaderField('department', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Requested By</label>
            <input
              className="form-control"
              placeholder="Name of requester"
              value={header.requested_by}
              onChange={e => setHeaderField('requested_by', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Target Warehouse</label>
          <select
            className="form-control"
            value={header.set_warehouse_id}
            onChange={e => setHeaderField('set_warehouse_id', e.target.value)}
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="form-control"
            rows={2}
            placeholder="Optional notes or references…"
            value={header.notes}
            onChange={e => setHeaderField('notes', e.target.value)}
          />
        </div>

        {/* Items table */}
        <div style={{ marginTop: 8, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Request Items</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
            <span className="material-icons" style={{ fontSize: 15 }}>add</span> Add Item
          </button>
        </div>

        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Item *</th>
                <th style={{ width: 80 }}>Qty *</th>
                <th style={{ width: 70 }}>Unit</th>
                <th style={{ width: 130 }}>Schedule Date</th>
                <th>Notes</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const selectedItem = items.find(i => i.id === row.item_id)
                const onHand = selectedItem
                  ? getActualQty(selectedItem.id, header.set_warehouse_id || defaultWarehouse)
                  : null
                return (
                  <tr key={row._key}>
                    <td>
                      <select
                        className="form-control"
                        style={{ minWidth: 200 }}
                        value={row.item_id}
                        onChange={e => updateRow(row._key, 'item_id', e.target.value)}
                      >
                        <option value="">— Select item —</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      {onHand !== null && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>
                          On hand: <strong style={{ color: onHand > 0 ? 'var(--green)' : 'var(--red)' }}>
                            {onHand} {selectedItem?.unit || ''}
                          </strong>
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control"
                        min="0.001"
                        step="any"
                        value={row.qty}
                        onChange={e => updateRow(row._key, 'qty', e.target.value)}
                        style={{ width: 72 }}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control"
                        value={row.unit}
                        readOnly
                        style={{ width: 60, background: 'var(--surface2)', color: 'var(--text-dim)' }}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control"
                        value={row.schedule_date}
                        min={today}
                        onChange={e => updateRow(row._key, 'schedule_date', e.target.value)}
                        style={{ width: 124 }}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control"
                        value={row.notes}
                        placeholder="Optional"
                        onChange={e => updateRow(row._key, 'notes', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={rows.length === 1}
                        onClick={() => removeRow(row._key)}
                        title="Remove row"
                      >
                        <span className="material-icons" style={{ fontSize: 15 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Material Request'}
          </button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

// ── View MR Modal ──────────────────────────────────────────────────────────────

function ViewMRModal({ mr, lines, onClose, onStatusChange, onSubmit, onNavigateToPO, defaultWarehouse, mrItems }) {
  const [busy, setBusy] = useState(false)
  const isDraft     = mr.status === 'Draft'
  const isSubmitted = mr.status === 'Submitted' || mr.status === 'Pending'
  const canCancel   = isDraft || isSubmitted

  const handleSubmit = async () => {
    setBusy(true)
    try {
      await onSubmit(mr)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm(`Cancel ${mr.mr_number}? This action cannot be undone.`)) return
    setBusy(true)
    try {
      await onStatusChange(mr.id, 'Cancelled')
      toast.success(`${mr.mr_number} cancelled`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const pctOrdered  = parseFloat(mr.per_ordered)  || 0
  const pctReceived = parseFloat(mr.per_received) || 0

  return (
    <ModalDialog open onClose={onClose} title={`${mr.mr_number} · ${mr.type}`} size="xl">
      {/* Header info grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '10px 16px', marginBottom: 16, background: 'var(--surface2)',
        borderRadius: 8, padding: 14,
      }}>
        <InfoField label="Status">
          <MrBadge status={mr.status} />
        </InfoField>
        <InfoField label="Transaction Date">{fmt(mr.transaction_date)}</InfoField>
        <InfoField label="Required By">{fmt(mr.required_by_date)}</InfoField>
        <InfoField label="Department">{mr.department || '—'}</InfoField>
        <InfoField label="Requested By">{mr.requested_by || '—'}</InfoField>
        <InfoField label="Created By">{mr.created_by || '—'}</InfoField>
        <InfoField label="Created At">{fmt(mr.created_at)}</InfoField>
        {mr.notes && (
          <InfoField label="Notes" style={{ gridColumn: '1 / -1' }}>{mr.notes}</InfoField>
        )}
      </div>

      {/* Progress */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16,
        background: 'var(--surface2)', borderRadius: 8, padding: 14,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Ordered Progress</div>
          <ProgressBar pct={pctOrdered} color="var(--teal)" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Received Progress</div>
          <ProgressBar pct={pctReceived} color="var(--green)" />
        </div>
      </div>

      {/* Items table */}
      <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
        Items ({lines.length})
      </div>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="stock-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ width: 60 }}>Unit</th>
              <th style={{ textAlign: 'right' }}>Ordered Qty</th>
              <th style={{ textAlign: 'right' }}>Received Qty</th>
              <th>Schedule Date</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan="7">
                  <EmptyState icon="inventory_2" message="No items in this request" />
                </td>
              </tr>
            ) : lines.map(line => (
              <tr key={line.id}>
                <td style={{ fontWeight: 600 }}>{line.item_name}</td>
                <td className="td-mono" style={{ textAlign: 'right' }}>{line.qty}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.unit || '—'}</td>
                <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>
                  {line.ordered_qty || 0}
                </td>
                <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>
                  {line.received_qty || 0}
                </td>
                <td style={{ fontSize: 12 }}>{fmt(line.schedule_date)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer actions */}
      <ModalActions>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Close
        </button>

        {canCancel && (
          <button type="button" className="btn btn-danger" onClick={handleCancel} disabled={busy}>
            <span className="material-icons" style={{ fontSize: 16 }}>cancel</span>
            Cancel MR
          </button>
        )}

        {isDraft && (
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            <span className="material-icons" style={{ fontSize: 16 }}>arrow_forward</span>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        )}

        {isSubmitted && (
          <button type="button" className="btn btn-primary" onClick={() => onNavigateToPO(mr)} disabled={busy}>
            <span className="material-icons" style={{ fontSize: 16 }}>shopping_cart</span>
            Create Purchase Order
          </button>
        )}
      </ModalActions>
    </ModalDialog>
  )
}

// ── Tiny label+value helper ────────────────────────────────────────────────────

function InfoField({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{children}</div>
    </div>
  )
}
