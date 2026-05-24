// src/pages/Procurement/PurchaseReturns.jsx
// Supplier returns: create from GRN, submit (triggers negative SLE),
// dispatch with credit note, or cancel with reversal SLE.

import { useState, useEffect, useMemo } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, EmptyState, AlertBanner } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const RETURN_REASONS = ['Damaged', 'Wrong Item', 'Over-delivery', 'Quality Rejection', 'Other']

const STATUS_META = {
  Draft:      { color: 'var(--text-dim)',  icon: 'edit_note'    },
  Submitted:  { color: 'var(--blue)',      icon: 'assignment_turned_in' },
  Dispatched: { color: 'var(--green)',     icon: 'local_shipping' },
  Cancelled:  { color: 'var(--red)',       icon: 'cancel'       },
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PurchaseReturns() {
  const {
    purchaseReturns, returnLines,
    goodsReceived, grnLines,
    createPurchaseReturn, submitPurchaseReturn,
    dispatchPurchaseReturn, cancelPurchaseReturn,
    loading,
  } = useProcurement()
  const { user } = useAuth()
  const canEdit = useCanEdit('procurement', 'purchase-returns')

  // ── Filters ───────────────────────────────────────────────
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')

  // ── Modals ────────────────────────────────────────────────
  const [createOpen,    setCreateOpen]    = useState(false)
  const [viewReturn,    setViewReturn]    = useState(null)
  const [cancelModal,   setCancelModal]   = useState(null)
  const [cancelReason,  setCancelReason]  = useState('')
  const [dispatchModal, setDispatchModal] = useState(null)
  const [creditNoteNo,  setCreditNoteNo]  = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [dispatching,   setDispatching]   = useState(false)
  const [cancelling,    setCancelling]    = useState(false)

  // ── Create form ───────────────────────────────────────────
  const emptyForm = () => ({
    grn_id:      '',
    return_date: today,
    reason:      'Damaged',
    notes:       '',
  })
  const [form,      setForm]      = useState(emptyForm())
  const [lines,     setLines]     = useState([])
  const [saving,    setSaving]    = useState(false)

  // Eligible GRNs: Received status (not Draft, not already fully returned)
  const eligibleGRNs = useMemo(() =>
    goodsReceived.filter(g => ['Received', 'Approved', 'Submitted'].includes(g.status))
      .sort((a, b) => b.date < a.date ? -1 : 1)
  , [goodsReceived])

  const selectedGRN = useMemo(() =>
    goodsReceived.find(g => g.id === form.grn_id)
  , [form.grn_id, goodsReceived])

  // Load GRN lines when GRN changes
  useEffect(() => {
    if (!form.grn_id) { setLines([]); return }
    const grnLs = grnLines.filter(l => l.grn_id === form.grn_id && l.item_id)
    setLines(grnLs.map(l => ({
      grn_line_id:  l.id,
      item_id:      l.item_id,
      item_name:    l.item_name,
      warehouse_id: l.warehouse_id || 'wh_main_store',
      qty_received: Number(l.qty_received || 0),
      qty_returned: '',
      unit_rate:    Number(l.unit_rate || 0),
      reason:       '',
      notes:        '',
    })))
  }, [form.grn_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (idx, field, val) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  const filledLines = lines.filter(l => parseFloat(l.qty_returned) > 0)
  const totalReturnValue = filledLines.reduce((s, l) =>
    s + (parseFloat(l.qty_returned) || 0) * (Number(l.unit_rate) || 0), 0)

  const handleCreate = async () => {
    if (!form.grn_id)           return toast.error('Select a GRN')
    if (!form.return_date)      return toast.error('Enter return date')
    if (filledLines.length === 0) return toast.error('Enter quantity to return for at least one item')
    // Validate qty_returned ≤ qty_received
    for (const l of filledLines) {
      const qty = parseFloat(l.qty_returned)
      if (qty > l.qty_received) return toast.error(`${l.item_name}: return qty (${qty}) exceeds received qty (${l.qty_received})`)
    }
    if (!window.confirm(`Create return for GRN ${selectedGRN?.grn_number || form.grn_id} — ${filledLines.length} item(s), total value ${fmt(totalReturnValue)}?`)) return
    setSaving(true)
    try {
      const linePayload = filledLines.map(l => ({
        grn_line_id:  l.grn_line_id,
        item_id:      l.item_id,
        item_name:    l.item_name,
        warehouse_id: l.warehouse_id,
        qty_received: l.qty_received,
        qty_returned: parseFloat(l.qty_returned),
        unit_rate:    l.unit_rate,
        reason:       l.reason || null,
        notes:        l.notes  || null,
      }))
      await createPurchaseReturn({
        original_grn_id: form.grn_id,
        original_grn_no: selectedGRN?.grn_number || '',
        supplier_id:     selectedGRN?.supplier_id   || null,
        supplier_name:   selectedGRN?.supplier_name || '',
        return_date:     form.return_date,
        reason:          form.reason,
        notes:           form.notes || null,
        total_returned_value: totalReturnValue,
        created_by:      user?.full_name || user?.username || '',
      }, linePayload)
      toast.success('Purchase return created as Draft')
      setCreateOpen(false)
      setForm(emptyForm())
      setLines([])
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSubmit = async (returnId) => {
    if (!window.confirm('Submit this return? Stock will be deducted from the warehouse immediately.')) return
    setSubmitting(true)
    try {
      await submitPurchaseReturn(returnId, user?.full_name || user?.username || '')
      toast.success('Return submitted — stock deducted')
      setViewReturn(null)
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  const handleDispatch = async () => {
    setDispatching(true)
    try {
      await dispatchPurchaseReturn(dispatchModal.id, creditNoteNo.trim() || null)
      toast.success('Return marked as Dispatched' + (creditNoteNo.trim() ? ` — Credit note: ${creditNoteNo}` : ''))
      setDispatchModal(null)
      setCreditNoteNo('')
      setViewReturn(null)
    } catch (err) { toast.error(err.message) }
    finally { setDispatching(false) }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Enter a cancellation reason')
    setCancelling(true)
    try {
      await cancelPurchaseReturn(cancelModal.id, cancelReason.trim(), user?.full_name || user?.username || '')
      toast.success('Purchase return cancelled' + (['Submitted', 'Dispatched'].includes(cancelModal.status) ? ' — stock reversal created' : ''))
      setCancelModal(null)
      setCancelReason('')
      setViewReturn(null)
    } catch (err) { toast.error(err.message) }
    finally { setCancelling(false) }
  }

  // Reset form on open
  useEffect(() => {
    if (createOpen) { setForm(emptyForm()); setLines([]) }
  }, [createOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── KPI cards ────────────────────────────────────────────
  const startOfMonth = today.slice(0, 8) + '01'
  const thisMonthReturns = purchaseReturns.filter(r => r.return_date >= startOfMonth && r.status !== 'Cancelled')
  const totalValueThisMonth = thisMonthReturns.reduce((s, r) => s + (r.total_returned_value || 0), 0)
  const draftCount      = purchaseReturns.filter(r => r.status === 'Draft').length
  const submittedCount  = purchaseReturns.filter(r => r.status === 'Submitted').length
  const awaitingCredit  = purchaseReturns.filter(r => r.status === 'Dispatched' && !r.credit_note_no).length

  // ── Filtered list ─────────────────────────────────────────
  const filtered = useMemo(() => purchaseReturns.filter(r => {
    if (filterStatus   && r.status !== filterStatus) return false
    if (filterSupplier && !r.supplier_name?.toLowerCase().includes(filterSupplier.toLowerCase())) return false
    if (filterDateFrom && r.return_date < filterDateFrom) return false
    if (filterDateTo   && r.return_date > filterDateTo)   return false
    return true
  }), [purchaseReturns, filterStatus, filterSupplier, filterDateFrom, filterDateTo])

  const getReturnLines = (returnId) => returnLines.filter(l => l.purchase_return_id === returnId)

  const handleExport = () => {
    exportXLSX(filtered.map(r => ({
      'Return No':    r.pr_number,
      'Date':         r.return_date,
      'GRN Ref':      r.original_grn_no || '',
      'Supplier':     r.supplier_name,
      'Reason':       r.reason,
      'Total Value':  r.total_returned_value,
      'Status':       r.status,
      'Credit Note':  r.credit_note_no || '',
      'Notes':        r.notes || '',
    })), `PurchaseReturns_${today}`, 'Purchase Returns')
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader title="Purchase Returns">
        <button className="btn btn-secondary" onClick={handleExport}><span className="material-icons">table_chart</span> Export</button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <span className="material-icons">add</span> New Return
          </button>
        )}
      </PageHeader>

      <AlertBanner type="warning" message="Submitting a return creates a negative Stock Ledger Entry. Cancelling a submitted return creates a reversal entry to restore stock." />

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, marginTop: 16 }}>
        {[
          { label: 'Returns This Month', value: thisMonthReturns.length,         icon: 'assignment_return', color: 'var(--blue)'   },
          { label: 'Return Value (MTD)', value: `$${fmt(totalValueThisMonth)}`,   icon: 'money_off',         color: 'var(--red)'    },
          { label: 'Drafts Pending',     value: draftCount,                        icon: 'pending',           color: 'var(--yellow)' },
          { label: 'Awaiting Credit',    value: awaitingCredit,                    icon: 'receipt',           color: 'var(--gold)'   },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="material-icons" style={{ color: c.color, fontSize: 28 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: c.color }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
          <label>Status</label>
          <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option>Draft</option><option>Submitted</option>
            <option>Dispatched</option><option>Cancelled</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
          <label>Supplier</label>
          <input className="form-control" placeholder="Search…" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>From</label>
          <input type="date" className="form-control" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>To</label>
          <input type="date" className="form-control" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setFilterStatus(''); setFilterSupplier(''); setFilterDateFrom(''); setFilterDateTo('') }}>Clear</button>
      </div>

      {/* ── List ────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Return No</th><th>Date</th><th>Supplier</th><th>GRN Ref</th>
                <th>Reason</th><th style={{ textAlign: 'right' }}>Value</th>
                <th>Credit Note</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9"><EmptyState icon="assignment_return" message='No purchase returns found. Click "New Return" to create one.' /></td></tr>
              ) : filtered.map(r => {
                const meta = STATUS_META[r.status] || STATUS_META.Draft
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{r.pr_number}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{r.return_date}</td>
                    <td style={{ fontWeight: 600 }}>{r.supplier_name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.original_grn_no || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.reason}</td>
                    <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>${fmt(r.total_returned_value)}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{r.credit_note_no || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-icons" style={{ fontSize: 14 }}>{meta.icon}</span>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewReturn(r)}>View</button>
                        {canEdit && r.status === 'Draft' && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleSubmit(r.id)} disabled={submitting}>Submit</button>
                        )}
                        {canEdit && r.status === 'Submitted' && (
                          <button className="btn btn-primary btn-sm" onClick={() => { setDispatchModal(r); setCreditNoteNo(r.credit_note_no || '') }}>
                            Dispatch
                          </button>
                        )}
                        {canEdit && r.status !== 'Cancelled' && (
                          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => { setCancelModal(r); setCancelReason('') }}>
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

      {/* ── CREATE MODAL ────────────────────────────────────── */}
      {createOpen && (
        <ModalDialog title="New Purchase Return" onClose={() => setCreateOpen(false)}>
          {/* Header fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Source GRN *</label>
              <select className="form-control" value={form.grn_id} onChange={e => setForm(f => ({ ...f, grn_id: e.target.value }))}>
                <option value="">— Select GRN —</option>
                {eligibleGRNs.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.grn_number || g.id.slice(-8)} — {g.supplier_name} ({g.date})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Return Date *</label>
              <input type="date" className="form-control" value={form.return_date} onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Return Reason *</label>
              <select className="form-control" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                {RETURN_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input className="form-control" placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          {form.grn_id && (
            lines.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>inventory_2</span>
                No item lines found for this GRN. Lines may not have been recorded.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Return Quantities</div>
                <div className="table-wrap" style={{ marginBottom: 10 }}>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'right' }}>Received</th>
                        <th style={{ textAlign: 'right' }}>Unit Rate</th>
                        <th>Qty to Return</th>
                        <th style={{ textAlign: 'right' }}>Return Value</th>
                        <th>Line Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => {
                        const qty   = parseFloat(l.qty_returned) || 0
                        const value = qty * l.unit_rate
                        const overQty = qty > l.qty_received
                        return (
                          <tr key={l.grn_line_id || idx}
                            style={{ background: qty > 0 ? (overQty ? 'rgba(239,68,68,.05)' : 'rgba(52,211,153,.04)') : 'transparent' }}>
                            <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{l.qty_received}</td>
                            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${fmt(l.unit_rate)}</td>
                            <td>
                              <input
                                type="number" min="0" step="any"
                                placeholder="0"
                                value={l.qty_returned}
                                onChange={e => setLine(idx, 'qty_returned', e.target.value)}
                                className="form-control"
                                style={{
                                  maxWidth: 100, padding: '5px 8px',
                                  fontFamily: 'var(--mono)', fontWeight: 700,
                                  borderColor: overQty ? 'var(--red)' : qty > 0 ? 'rgba(52,211,153,.4)' : 'var(--border2)',
                                  background:  overQty ? 'rgba(239,68,68,.08)' : qty > 0 ? 'rgba(52,211,153,.08)' : 'var(--surface2)',
                                }}
                              />
                              {overQty && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>Exceeds received qty</div>}
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: qty > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                              {qty > 0 ? `$${fmt(value)}` : '—'}
                            </td>
                            <td>
                              <input
                                className="form-control"
                                placeholder="Optional"
                                value={l.reason}
                                onChange={e => setLine(idx, 'reason', e.target.value)}
                                style={{ maxWidth: 160, padding: '5px 8px', fontSize: 12 }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {filledLines.length > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: 13 }}>
                    <strong>{filledLines.length}</strong> item{filledLines.length !== 1 ? 's' : ''} to return ·
                    Total value: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>${fmt(totalReturnValue)}</strong>
                  </div>
                )}
              </>
            )
          )}

          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || filledLines.length === 0}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : `Save as Draft (${filledLines.length} item${filledLines.length !== 1 ? 's' : ''})`}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── VIEW MODAL ──────────────────────────────────────── */}
      {viewReturn && (() => {
        const rLines = getReturnLines(viewReturn.id)
        const meta   = STATUS_META[viewReturn.status] || STATUS_META.Draft
        return (
          <ModalDialog title={`Purchase Return — ${viewReturn.pr_number}`} onClose={() => setViewReturn(null)} size="lg">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                ['Supplier',     viewReturn.supplier_name],
                ['Return Date',  viewReturn.return_date],
                ['Source GRN',   viewReturn.original_grn_no || '—'],
                ['Reason',       viewReturn.reason],
                ['Total Value',  `$${fmt(viewReturn.total_returned_value)}`],
                ['Status',       viewReturn.status],
                ['Submitted By', viewReturn.submitted_by || '—'],
                ['Credit Note',  viewReturn.credit_note_no || '—'],
                ['Notes',        viewReturn.notes || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                  <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Return Lines</div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Received</th>
                    <th style={{ textAlign: 'right' }}>Returned</th>
                    <th style={{ textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ textAlign: 'right' }}>Return Value</th>
                    <th>Reason</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rLines.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>No lines</td></tr>
                  ) : rLines.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.item_name}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{l.qty_received}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>{l.qty_returned}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${fmt(l.unit_rate)}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--red)' }}>${fmt(l.return_value || (l.qty_returned * l.unit_rate))}</td>
                      <td style={{ fontSize: 12 }}>{l.reason || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{l.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewReturn.cancel_reason && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                <strong>Cancellation reason:</strong> {viewReturn.cancel_reason}
              </div>
            )}

            <ModalActions>
              {canEdit && viewReturn.status === 'Draft' && (
                <button className="btn btn-primary" onClick={() => handleSubmit(viewReturn.id)} disabled={submitting}>
                  <span className="material-icons">assignment_turned_in</span>
                  {submitting ? 'Submitting…' : 'Submit Return'}
                </button>
              )}
              {canEdit && viewReturn.status === 'Submitted' && (
                <button className="btn btn-primary" onClick={() => { setDispatchModal(viewReturn); setCreditNoteNo(viewReturn.credit_note_no || '') }}>
                  <span className="material-icons">local_shipping</span> Mark as Dispatched
                </button>
              )}
              {canEdit && viewReturn.status !== 'Cancelled' && (
                <button className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => { setCancelModal(viewReturn); setCancelReason('') }}>
                  <span className="material-icons">cancel</span> Cancel Return
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewReturn(null)}>Close</button>
            </ModalActions>
          </ModalDialog>
        )
      })()}

      {/* ── DISPATCH MODAL ──────────────────────────────────── */}
      {dispatchModal && (
        <ModalDialog title="Mark as Dispatched" onClose={() => setDispatchModal(null)}>
          <p style={{ marginBottom: 12 }}>
            Confirm goods for <strong>{dispatchModal.pr_number}</strong> have been sent back to the supplier.
          </p>
          <div className="form-group">
            <label>Supplier Credit Note No. (optional)</label>
            <input className="form-control" placeholder="e.g. CN-2024-0042"
              value={creditNoteNo} onChange={e => setCreditNoteNo(e.target.value)} />
            <small style={{ color: 'var(--text-dim)', fontSize: 11 }}>Enter if the supplier has already issued a credit note.</small>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setDispatchModal(null)}>Back</button>
            <button className="btn btn-primary" onClick={handleDispatch} disabled={dispatching}>
              <span className="material-icons">local_shipping</span>
              {dispatching ? 'Saving…' : 'Confirm Dispatch'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── CANCEL MODAL ────────────────────────────────────── */}
      {cancelModal && (
        <ModalDialog title="Cancel Purchase Return" onClose={() => setCancelModal(null)}>
          <p style={{ marginBottom: 12 }}>
            Cancel <strong>{cancelModal.pr_number}</strong>?
            {['Submitted', 'Dispatched'].includes(cancelModal.status) && (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}> A stock reversal entry will be created to restore inventory.</span>
            )}
          </p>
          <div className="form-group">
            <label>Cancellation Reason *</label>
            <textarea className="form-control" rows={3} placeholder="Enter reason…"
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setCancelModal(null)}>Back</button>
            <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
