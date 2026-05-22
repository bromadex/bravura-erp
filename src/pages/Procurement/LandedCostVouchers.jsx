// src/pages/Procurement/LandedCostVouchers.jsx
// Phase 14 — Freight, customs duty, handling and other charges distributed
// across GRN line items with Moving Average (MAP) recompute on valuation bins.

import { useState, useMemo } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useCanEdit }     from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const EXPENSE_TYPES = ['Freight', 'Customs Duty', 'Handling', 'Transport', 'Insurance', 'Other']
const DISTRIBUTION_METHODS = ['By Amount', 'By Qty', 'By Weight']

const today = () => new Date().toISOString().split('T')[0]
const thisMonth = () => new Date().toISOString().slice(0, 7)

const emptyLine = () => ({ expense_type: 'Freight', description: '', amount: '' })

// ── Status badge colours ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = status === 'Submitted' ? 'badge-green'
    : status === 'Cancelled' ? 'badge-red'
    : 'badge-yellow'
  return <span className={`badge ${cls}`}>{status}</span>
}

// ── Allocation maths (client-side preview) ──────────────────────────────────

function computeAllocations(grnLines, totalLandedCost, method) {
  if (!grnLines.length || totalLandedCost <= 0) return grnLines.map(l => ({ ...l, allocated_cost: 0 }))

  let denom = 0
  if (method === 'By Amount') {
    denom = grnLines.reduce((s, l) => s + (l.qty_received * l.unit_rate), 0)
  } else if (method === 'By Qty') {
    denom = grnLines.reduce((s, l) => s + l.qty_received, 0)
  }
  // By Weight: treat qty_received as weight (no separate weight column yet)
  else {
    denom = grnLines.reduce((s, l) => s + l.qty_received, 0)
  }

  return grnLines.map(l => {
    let share = 0
    if (denom > 0) {
      if (method === 'By Amount') {
        share = (l.qty_received * l.unit_rate) / denom
      } else {
        share = l.qty_received / denom
      }
    }
    const allocated_cost = share * totalLandedCost
    const new_valuation_rate = l.qty_received > 0
      ? l.unit_rate + allocated_cost / l.qty_received
      : l.unit_rate
    const stock_value_adjustment = allocated_cost
    return { ...l, allocated_cost, new_valuation_rate, stock_value_adjustment }
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LandedCostVouchers() {
  const {
    landedCostVouchers, goodsReceived, grnLines,
    createLCV, applyLCV, cancelLCV,
  } = useProcurement()
  const canEdit = useCanEdit('procurement', 'landed-costs')

  // ── Modal state ────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [viewLCV,    setViewLCV]    = useState(null)
  const [applying,   setApplying]   = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [saving,     setSaving]     = useState(false)

  // ── Create form state ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    grn_id: '', posting_date: today(), distribution_method: 'By Amount', notes: '',
  })
  const [lines, setLines] = useState([emptyLine()])

  const resetCreate = () => {
    setForm({ grn_id: '', posting_date: today(), distribution_method: 'By Amount', notes: '' })
    setLines([emptyLine()])
  }

  // ── Line helpers ───────────────────────────────────────────────────────────
  const addLine    = () => setLines(ls => [...ls, emptyLine()])
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i))
  const setLine    = (i, field, val) => setLines(ls => {
    const n = [...ls]; n[i] = { ...n[i], [field]: val }; return n
  })

  const totalCost = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // ── KPI values ─────────────────────────────────────────────────────────────
  const lcvs = landedCostVouchers || []

  const kpi = useMemo(() => {
    const month = thisMonth()
    const draft   = lcvs.filter(l => l.status === 'Draft').length
    const subThisMonth = lcvs.filter(l => l.status === 'Submitted' && l.posting_date?.startsWith(month)).length
    const costThisMonth = lcvs
      .filter(l => l.status === 'Submitted' && l.posting_date?.startsWith(month))
      .reduce((s, l) => s + parseFloat(l.total_landed_cost || 0), 0)
    return { total: lcvs.length, draft, subThisMonth, costThisMonth }
  }, [lcvs])

  // ── GRN helper ─────────────────────────────────────────────────────────────
  const selectedGrn = goodsReceived.find(g => g.id === form.grn_id)
  const selectedGrnForView = viewLCV ? goodsReceived.find(g => g.id === viewLCV.grn_id) : null

  // Lines from the GRN selected in create modal
  const createGrnLines = useMemo(() => {
    if (!form.grn_id) return []
    return grnLines.filter(l => l.grn_id === form.grn_id)
  }, [form.grn_id, grnLines])

  // Lines from the GRN attached to the LCV being viewed
  const viewGrnLines = useMemo(() => {
    if (!viewLCV?.grn_id) return []
    return grnLines.filter(l => l.grn_id === viewLCV.grn_id)
  }, [viewLCV, grnLines])

  // Allocations preview for the view modal
  const allocations = useMemo(() => {
    if (!viewLCV) return []
    const method = viewLCV.distribution_method || 'By Amount'
    const total  = parseFloat(viewLCV.total_landed_cost || 0)
    return computeAllocations(viewGrnLines, total, method)
  }, [viewLCV, viewGrnLines])

  // ── Create handler ─────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.posting_date) return toast.error('Enter a posting date')
    if (lines.some(l => !l.expense_type || !(parseFloat(l.amount) > 0)))
      return toast.error('All expense lines need a type and amount > 0')

    setSaving(true)
    try {
      await createLCV({
        grn_id:              form.grn_id || null,
        grn_number:          selectedGrn?.grn_number || null,
        supplier_name:       selectedGrn?.supplier_name || null,
        posting_date:        form.posting_date,
        distribution_method: form.distribution_method,
        notes:               form.notes,
      }, lines)
      resetCreate()
      setCreateOpen(false)
      toast.success('Landed Cost Voucher created')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // ── Apply handler ──────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!viewLCV) return
    if (allocations.length === 0) return toast.error('No GRN lines to allocate costs to')

    setApplying(true)
    try {
      const allocationRows = allocations.map(a => ({
        grn_line_id:           a.id || null,
        item_id:               a.item_id || null,
        item_name:             a.item_name || '',
        qty_received:          parseFloat(a.qty_received) || 0,
        original_rate:         parseFloat(a.unit_rate)    || 0,
        allocated_cost:        parseFloat(a.allocated_cost) || 0,
        stock_value_adjustment:parseFloat(a.stock_value_adjustment) || 0,
      }))
      await applyLCV(viewLCV.id, allocationRows)
      toast.success(`Landed costs applied — Moving Average updated for ${allocationRows.length} item${allocationRows.length !== 1 ? 's' : ''}`)
      setViewLCV(v => ({ ...v, status: 'Submitted' }))
    } catch (err) { toast.error(err.message) }
    finally { setApplying(false) }
  }

  // ── Cancel handler ─────────────────────────────────────────────────────────
  const handleCancel = async (id) => {
    setCancelling(true)
    try {
      await cancelLCV(id)
      toast.success('LCV cancelled')
      setViewLCV(null)
    } catch (err) { toast.error(err.message) }
    finally { setCancelling(false) }
  }

  // ── Expense types display for table row ───────────────────────────────────
  const expenseTypesList = (lcv) => {
    const ls = lcv.landed_cost_lines || []
    if (!ls.length) return '—'
    const types = [...new Set(ls.map(l => l.expense_type))].slice(0, 3)
    return types.join(', ')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Landed Cost Vouchers"
        action={canEdit && (
          <button className="btn btn-primary" onClick={() => { resetCreate(); setCreateOpen(true) }}>
            <span className="material-icons">add</span> New LCV
          </button>
        )}
      />

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total LCVs"             value={kpi.total}           icon="receipt_long"  />
        <KPICard label="Draft (pending)"         value={kpi.draft}           icon="pending" color="yellow" />
        <KPICard label="Submitted This Month"    value={kpi.subThisMonth}    icon="check_circle" color="green" />
        <KPICard
          label="Total Landed Costs This Month"
          value={`$${kpi.costThisMonth.toFixed(2)}`}
          icon="local_shipping"
          color="teal"
        />
      </div>

      {/* Table */}
      {lcvs.length === 0 ? (
        <EmptyState
          icon="local_shipping"
          title="No landed cost vouchers yet"
          message="Create your first LCV to allocate freight, customs duty, and other charges across received goods."
        />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>LCV Number</th>
                <th>Date</th>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Expense Types</th>
                <th>Total Cost</th>
                <th>Distribution</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lcvs.map(lcv => (
                <tr key={lcv.id}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                    {lcv.lcv_number}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{lcv.posting_date}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                    {lcv.grn_number || '—'}
                  </td>
                  <td>{lcv.supplier_name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{expenseTypesList(lcv)}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>
                    ${parseFloat(lcv.total_landed_cost || 0).toFixed(2)}
                  </td>
                  <td style={{ fontSize: 12 }}>{lcv.distribution_method || 'By Amount'}</td>
                  <td><StatusBadge status={lcv.status || 'Draft'} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewLCV(lcv)}
                        title="View"
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                      </button>
                      {lcv.status === 'Draft' && canEdit && (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setViewLCV(lcv)}
                            title="Apply landed costs"
                          >
                            <span className="material-icons" style={{ fontSize: 14 }}>done_all</span>
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCancel(lcv.id)}
                            title="Cancel LCV"
                          >
                            <span className="material-icons" style={{ fontSize: 14 }}>cancel</span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create LCV Modal ─────────────────────────────────────────────────── */}
      <ModalDialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Landed Cost Voucher" size="lg">
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>LINK TO GRN (optional)</label>
              <select
                className="form-control"
                value={form.grn_id}
                onChange={e => setForm(f => ({ ...f, grn_id: e.target.value }))}
              >
                <option value="">— Select GRN —</option>
                {goodsReceived.map(grn => (
                  <option key={grn.id} value={grn.id}>
                    {grn.grn_number} — {grn.supplier_name || 'No supplier'} ({grn.date})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>POSTING DATE *</label>
              <input
                type="date" className="form-control" required
                value={form.posting_date}
                onChange={e => setForm(f => ({ ...f, posting_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>DISTRIBUTION METHOD</label>
              <select
                className="form-control"
                value={form.distribution_method}
                onChange={e => setForm(f => ({ ...f, distribution_method: e.target.value }))}
              >
                {DISTRIBUTION_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                {form.distribution_method === 'By Amount' && 'Costs spread proportional to item value (qty × rate).'}
                {form.distribution_method === 'By Qty'    && 'Costs spread proportional to quantity received.'}
                {form.distribution_method === 'By Weight' && 'Costs spread proportional to weight (uses qty if no weight column).'}
              </div>
            </div>
          </div>

          {/* Expense lines */}
          <div style={{ marginTop: 16, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)' }}>EXPENSE LINES</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>
              Total: <strong>${totalCost.toFixed(2)}</strong>
            </span>
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr auto', gap: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-dim)', marginBottom: 4 }}>
            <span>TYPE</span><span>DESCRIPTION</span><span>AMOUNT ($)</span><span></span>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <select className="form-control" value={l.expense_type} onChange={e => setLine(i, 'expense_type', e.target.value)}>
                {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="form-control" placeholder="Description" value={l.description}
                onChange={e => setLine(i, 'description', e.target.value)} />
              <input type="number" className="form-control" min="0" step="0.01" placeholder="0.00"
                value={l.amount} onChange={e => setLine(i, 'amount', e.target.value)} />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLine(i)}
                disabled={lines.length === 1}>
                <span className="material-icons" style={{ fontSize: 14 }}>close</span>
              </button>
            </div>
          ))}

          {/* Total row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr auto', gap: 6, marginBottom: 16, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', alignSelf: 'center' }}>TOTAL</span>
            <span />
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', alignSelf: 'center' }}>${totalCost.toFixed(2)}</span>
            <span />
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>
            <span className="material-icons">add</span> Add Expense Line
          </button>

          <div className="form-group">
            <label>NOTES</label>
            <textarea className="form-control" rows="2" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || totalCost === 0}>
              <span className="material-icons">receipt_long</span>
              {saving ? 'Saving…' : 'Create LCV (Draft)'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ── View / Apply LCV Modal ───────────────────────────────────────────── */}
      {viewLCV && (
        <ModalDialog open={!!viewLCV} onClose={() => setViewLCV(null)} title={`${viewLCV.lcv_number} · Landed Cost Voucher`} size="lg">
          {/* Header info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13, background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
            <div><span style={{ color: 'var(--text-dim)' }}>LCV Number:</span> <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{viewLCV.lcv_number}</strong></div>
            <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <StatusBadge status={viewLCV.status || 'Draft'} /></div>
            <div><span style={{ color: 'var(--text-dim)' }}>GRN:</span> <strong style={{ color: 'var(--blue)' }}>{viewLCV.grn_number || '—'}</strong></div>
            <div><span style={{ color: 'var(--text-dim)' }}>Supplier:</span> {viewLCV.supplier_name || '—'}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>Posting Date:</span> {viewLCV.posting_date}</div>
            <div><span style={{ color: 'var(--text-dim)' }}>Distribution:</span> {viewLCV.distribution_method || 'By Amount'}</div>
            {viewLCV.notes && (
              <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>
                {viewLCV.notes}
              </div>
            )}
          </div>

          {/* Expense lines table */}
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>receipt_long</span>
            EXPENSE LINES
          </div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="stock-table">
              <thead>
                <tr><th>Type</th><th>Description</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {(viewLCV.landed_cost_lines || []).length === 0 ? (
                  <tr><td colSpan="3" style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 16 }}>No expense lines</td></tr>
                ) : (
                  (viewLCV.landed_cost_lines || []).map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{l.expense_type}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{l.description || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>${parseFloat(l.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan="2" style={{ fontWeight: 700, textAlign: 'right', fontSize: 12 }}>TOTAL LANDED COST</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--gold)', fontSize: 14 }}>
                    ${parseFloat(viewLCV.total_landed_cost || 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Item allocation preview */}
          {viewGrnLines.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>calculate</span>
                ITEM ALLOCATION PREVIEW
                <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 4 }}>
                  ({viewLCV.distribution_method || 'By Amount'})
                </span>
              </div>

              {/* Method explanation */}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 13, color: 'var(--blue)' }}>info</span>
                {viewLCV.distribution_method === 'By Amount'
                  ? 'Each item receives a share proportional to (item value / total GRN value). New MAP = Original Rate + (Allocated Cost / Qty).'
                  : 'Each item receives a share proportional to (item qty / total GRN qty). New MAP = Original Rate + (Allocated Cost / Qty).'}
              </div>

              <div className="table-wrap" style={{ marginBottom: 20 }}>
                <table className="stock-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Qty Received</th>
                      <th>Original Rate</th>
                      <th>Allocated Cost</th>
                      <th>New Valuation Rate</th>
                      <th>Value Adjustment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{a.item_name}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{parseFloat(a.qty_received || 0).toFixed(4)}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>${parseFloat(a.unit_rate || 0).toFixed(4)}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--yellow)', fontWeight: 700 }}>
                          ${parseFloat(a.allocated_cost || 0).toFixed(4)}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>
                          ${parseFloat(a.new_valuation_rate || 0).toFixed(4)}
                          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>
                            (+{parseFloat((a.new_valuation_rate || 0) - (a.unit_rate || 0)).toFixed(4)})
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                          ${parseFloat(a.stock_value_adjustment || 0).toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {viewGrnLines.length === 0 && viewLCV.status === 'Draft' && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', fontSize: 12, marginBottom: 16, display: 'flex', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 16, color: 'var(--yellow)' }}>warning</span>
              No GRN lines found for this voucher. Link a GRN with line items to see the allocation preview and apply costs.
            </div>
          )}

          {/* Actions */}
          <ModalActions>
            {viewLCV.status === 'Draft' && canEdit && (
              <>
                <button
                  className="btn btn-danger"
                  disabled={cancelling}
                  onClick={() => handleCancel(viewLCV.id)}
                >
                  <span className="material-icons">cancel</span>
                  {cancelling ? 'Cancelling…' : 'Cancel LCV'}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={applying || allocations.length === 0}
                  onClick={handleApply}
                  title={allocations.length === 0 ? 'Link a GRN with lines first' : ''}
                >
                  <span className="material-icons">done_all</span>
                  {applying ? 'Applying…' : 'Apply Landed Costs'}
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={() => setViewLCV(null)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
