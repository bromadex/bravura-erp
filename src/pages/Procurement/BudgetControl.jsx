// src/pages/Procurement/BudgetControl.jsx
// Department budget management with real-time PO spend tracking
// and overspend prevention.

import { useState, useEffect, useMemo } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useMasterData } from '../../contexts/MasterDataContext'
import toast from 'react-hot-toast'
import { fmtNum, dateTag, exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, StatusBadge, SegmentedBar } from '../../components/ui'

const CURRENT_YEAR = new Date().getFullYear()

const CATEGORIES = ['General', 'CapEx', 'OpEx', 'Maintenance']

const PERIOD_OPTIONS = [
  { value: 'annual', label: 'Annual' },
  { value: 'Q1',     label: 'Q1 (Jan–Mar)' },
  { value: 'Q2',     label: 'Q2 (Apr–Jun)' },
  { value: 'Q3',     label: 'Q3 (Jul–Sep)' },
  { value: 'Q4',     label: 'Q4 (Oct–Dec)' },
  { value: `${CURRENT_YEAR}-01`, label: 'January' },
  { value: `${CURRENT_YEAR}-02`, label: 'February' },
  { value: `${CURRENT_YEAR}-03`, label: 'March' },
  { value: `${CURRENT_YEAR}-04`, label: 'April' },
  { value: `${CURRENT_YEAR}-05`, label: 'May' },
  { value: `${CURRENT_YEAR}-06`, label: 'June' },
  { value: `${CURRENT_YEAR}-07`, label: 'July' },
  { value: `${CURRENT_YEAR}-08`, label: 'August' },
  { value: `${CURRENT_YEAR}-09`, label: 'September' },
  { value: `${CURRENT_YEAR}-10`, label: 'October' },
  { value: `${CURRENT_YEAR}-11`, label: 'November' },
  { value: `${CURRENT_YEAR}-12`, label: 'December' },
]

function periodLabel(value) {
  return PERIOD_OPTIONS.find(p => p.value === value)?.label || value || '—'
}

export default function BudgetControl() {
  const {
    budgets, purchaseOrders, purchaseInvoices,
    createBudget, updateBudget, deleteBudget,
    loading,
  } = useProcurement()
  const { user }                    = useAuth()
  const { departments, costCenters } = useMasterData()

  const [activeTab,     setActiveTab]     = useState('overview')
  const [fiscalYear,    setFiscalYear]    = useState(CURRENT_YEAR)
  const [filterDept,    setFilterDept]    = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editBudget, setEditBudget] = useState(null)
  const [saving,    setSaving]    = useState(false)

  const emptyForm = () => ({
    department:       '',
    cost_center:      '',
    fiscal_year:      CURRENT_YEAR,
    period:           'annual',
    category:         'General',
    budget_amount:    '',
    alert_threshold:  80,
    notes:            '',
  })
  const [form, setForm] = useState(emptyForm())

  // ── Reset form when modal opens ────────────────────────────
  useEffect(() => {
    if (editBudget) {
      setForm({
        department:      editBudget.department      || '',
        cost_center:     editBudget.cost_center     || '',
        fiscal_year:     editBudget.fiscal_year     || CURRENT_YEAR,
        period:          editBudget.period          || 'annual',
        category:        editBudget.category        || 'General',
        budget_amount:   editBudget.budget_amount   || '',
        alert_threshold: editBudget.alert_threshold ?? 80,
        notes:           editBudget.notes           || '',
      })
    } else if (modalOpen) {
      setForm(emptyForm())
    }
  }, [editBudget, modalOpen])

  // ── Budget computation helpers ─────────────────────────────
  const getDeptSpend = useMemo(() => {
    // Pre-compute per-department spend from context data
    const result = {}

    // Committed = active POs not yet fully invoiced
    for (const po of purchaseOrders) {
      if (!po.department) continue
      if (po.status === 'Cancelled') continue
      const dept = po.department
      if (!result[dept]) result[dept] = { committed: 0, actual: 0 }
      // Check if this PO already has a linked invoice
      const hasInvoice = purchaseInvoices.some(
        inv => inv.po_id === po.id && !['Cancelled'].includes(inv.status)
      )
      if (!hasInvoice) {
        result[dept].committed += parseFloat(po.total_amount) || 0
      }
    }

    // Actual = sum of non-cancelled invoices
    for (const inv of purchaseInvoices) {
      if (!inv.department && !inv.supplier_id) continue
      // Try to get department from linked PO
      const dept = inv.department ||
        (inv.po_id ? purchaseOrders.find(p => p.id === inv.po_id)?.department : null)
      if (!dept) continue
      if (inv.status === 'Cancelled') continue
      if (!result[dept]) result[dept] = { committed: 0, actual: 0 }
      result[dept].actual += parseFloat(inv.total_amount) || 0
    }

    return result
  }, [purchaseOrders, purchaseInvoices])

  // ── Filtered budgets for overview tab ────────────────────
  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => {
      if (b.fiscal_year !== fiscalYear && String(b.fiscal_year) !== String(fiscalYear)) return false
      if (filterDept && b.department !== filterDept) return false
      return true
    })
  }, [budgets, fiscalYear, filterDept])

  // Group by department
  const deptBudgets = useMemo(() => {
    const grouped = {}
    for (const b of filteredBudgets) {
      const dept = b.department || 'Unknown'
      if (!grouped[dept]) grouped[dept] = []
      grouped[dept].push(b)
    }
    return grouped
  }, [filteredBudgets])

  // ── Status helper ─────────────────────────────────────────
  const getBudgetStatus = (budgetAmount, actual, committed, threshold = 80) => {
    const total = actual + committed
    if (budgetAmount <= 0) return { label: 'No Budget', color: 'var(--text-dim)', icon: '—' }
    const pct = (total / budgetAmount) * 100
    if (total > budgetAmount) return { label: 'Over Budget', color: 'var(--red)', icon: '✗', pct }
    if (pct >= threshold)     return { label: `Alert (${pct.toFixed(0)}%)`, color: 'var(--yellow)', icon: '⚠', pct }
    return { label: 'On Track', color: 'var(--green)', icon: '✓', pct }
  }

  // ── Save budget ───────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.department) return toast.error('Select a department')
    if (!form.budget_amount || parseFloat(form.budget_amount) <= 0) return toast.error('Enter a valid budget amount')
    setSaving(true)
    try {
      const payload = {
        department:      form.department,
        cost_center:     form.cost_center || null,
        fiscal_year:     parseInt(form.fiscal_year) || CURRENT_YEAR,
        period:          form.period,
        category:        form.category,
        budget_amount:   parseFloat(form.budget_amount),
        alert_threshold: parseInt(form.alert_threshold) || 80,
        notes:           form.notes,
        created_by:      user?.full_name || user?.username,
      }
      if (editBudget) {
        await updateBudget(editBudget.id, payload)
        toast.success('Budget updated')
      } else {
        await createBudget(payload)
        toast.success('Budget created')
      }
      setModalOpen(false)
      setEditBudget(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save budget')
    } finally { setSaving(false) }
  }

  // ── Delete budget ─────────────────────────────────────────
  const handleDelete = async (b) => {
    if (!window.confirm(`Delete budget for ${b.department} (${periodLabel(b.period)} ${b.fiscal_year})?`)) return
    try {
      await deleteBudget(b.id)
      toast.success('Budget deleted')
    } catch (err) { toast.error(err.message) }
  }

  // ── Export summary ────────────────────────────────────────
  const handleExport = () => {
    const rows = Object.entries(deptBudgets).map(([dept, dBudgets]) => {
      const budgetAmount = dBudgets.reduce((s, b) => s + (b.budget_amount || 0), 0)
      const spend  = getDeptSpend[dept] || { committed: 0, actual: 0 }
      const remaining = budgetAmount - spend.actual - spend.committed
      const pct = budgetAmount > 0 ? ((spend.actual + spend.committed) / budgetAmount * 100).toFixed(1) : '0.0'
      const { label } = getBudgetStatus(budgetAmount, spend.actual, spend.committed)
      return {
        Department: dept,
        'Budget ($)':     budgetAmount.toFixed(2),
        'Actual ($)':     spend.actual.toFixed(2),
        'Committed ($)':  spend.committed.toFixed(2),
        'Remaining ($)':  remaining.toFixed(2),
        '% Used':         pct,
        Status:           label,
      }
    })
    exportXLSX(rows, `BudgetSummary_${dateTag()}`, 'Budget Summary')
    toast.success('Exported')
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Budget Control">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {activeTab === 'manage' && (
          <button className="btn btn-primary" onClick={() => { setEditBudget(null); setModalOpen(true) }}>
            <span className="material-icons">add</span> Add Budget
          </button>
        )}
      </PageHeader>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['overview', 'Budget Overview'], ['manage', 'Manage Budgets']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === key ? 700 : 400,
              color: activeTab === key ? 'var(--gold)' : 'var(--text-dim)',
              borderBottom: activeTab === key ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ───────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Filters */}
          <div className="card" style={{ padding: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>Fiscal Year</label>
                <select className="form-control" style={{ width: 120 }} value={fiscalYear}
                  onChange={e => setFiscalYear(parseInt(e.target.value))}>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y =>
                    <option key={y} value={y}>{y}</option>
                  )}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, display: 'block' }}>Department</label>
                <select className="form-control" style={{ width: 200 }} value={filterDept}
                  onChange={e => setFilterDept(e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Budget cards */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</div>
          ) : Object.keys(deptBudgets).length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <span className="material-icons" style={{ fontSize: 48, color: 'var(--text-dim)', display: 'block', marginBottom: 12 }}>account_balance</span>
              <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>No budgets configured for FY {fiscalYear}</div>
              <button className="btn btn-primary" onClick={() => { setActiveTab('manage'); setEditBudget(null); setModalOpen(true) }}>
                <span className="material-icons">add</span> Add First Budget
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
                {Object.entries(deptBudgets).map(([dept, dBudgets]) => {
                  const budgetAmount = dBudgets.reduce((s, b) => s + (b.budget_amount || 0), 0)
                  const threshold    = dBudgets[0]?.alert_threshold ?? 80
                  const spend        = getDeptSpend[dept] || { committed: 0, actual: 0 }
                  const remaining    = budgetAmount - spend.actual - spend.committed
                  const pct          = budgetAmount > 0
                    ? Math.min(100, ((spend.actual + spend.committed) / budgetAmount) * 100)
                    : 0
                  const { label: statusLabel, color: statusColor, icon: statusIcon } =
                    getBudgetStatus(budgetAmount, spend.actual, spend.committed, threshold)

                  return (
                    <div key={dept} className="card" style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{dept}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            FY {fiscalYear} · {dBudgets.map(b => periodLabel(b.period)).join(', ')}
                          </div>
                        </div>
                        <span style={{ color: statusColor, fontWeight: 600, fontSize: 13 }}>
                          {statusIcon} {statusLabel}
                        </span>
                      </div>

                      {/* Progress bar — actual (green) + committed (amber) + remaining (grey) */}
                      <SegmentedBar
                        height={10}
                        segments={[
                          { value: Math.max(0, spend.actual),    color: 'var(--green)',  label: 'Actual' },
                          { value: Math.max(0, spend.committed), color: 'var(--yellow)', label: 'Committed' },
                          { value: Math.max(0, remaining),       color: 'var(--surface2)', label: 'Remaining' },
                        ]}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right', marginTop: 3, fontFamily: 'var(--mono)' }}>
                        {pct.toFixed(0)}% used
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, fontSize: 12 }}>
                        <div>
                          <div style={{ color: 'var(--text-dim)' }}>Budget</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>${fmtNum(budgetAmount)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-dim)' }}>Committed</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>${fmtNum(spend.committed)}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-dim)' }}>Remaining</div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                            ${fmtNum(Math.abs(remaining))}{remaining < 0 ? ' over' : ''}
                          </div>
                        </div>
                      </div>

                      {/* Sub-line */}
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 16 }}>
                        <span>Invoiced: <span style={{ fontFamily: 'var(--mono)' }}>${fmtNum(spend.actual)}</span></span>
                        <span>POs in progress: <span style={{ fontFamily: 'var(--mono)' }}>${fmtNum(spend.committed)}</span></span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Summary table */}
              <div className="card">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
                  Summary — FY {fiscalYear}
                </div>
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th style={{ textAlign: 'right' }}>Budget</th>
                        <th style={{ textAlign: 'right' }}>Actual</th>
                        <th style={{ textAlign: 'right' }}>Committed</th>
                        <th style={{ textAlign: 'right' }}>Remaining</th>
                        <th style={{ textAlign: 'right' }}>% Used</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(deptBudgets).map(([dept, dBudgets]) => {
                        const budgetAmount = dBudgets.reduce((s, b) => s + (b.budget_amount || 0), 0)
                        const threshold    = dBudgets[0]?.alert_threshold ?? 80
                        const spend        = getDeptSpend[dept] || { committed: 0, actual: 0 }
                        const remaining    = budgetAmount - spend.actual - spend.committed
                        const pct          = budgetAmount > 0
                          ? ((spend.actual + spend.committed) / budgetAmount * 100).toFixed(1)
                          : '0.0'
                        const { label: statusLabel, color: statusColor } =
                          getBudgetStatus(budgetAmount, spend.actual, spend.committed, threshold)
                        return (
                          <tr key={dept}>
                            <td style={{ fontWeight: 600 }}>{dept}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(budgetAmount)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmtNum(spend.actual)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--yellow)' }}>${fmtNum(spend.committed)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: remaining < 0 ? 'var(--red)' : undefined }}>
                              {remaining < 0 ? '-' : ''}${fmtNum(Math.abs(remaining))}
                            </td>
                            <td className="td-mono" style={{ textAlign: 'right' }}>{pct}%</td>
                            <td style={{ color: statusColor, fontWeight: 600, fontSize: 12 }}>{statusLabel}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── TAB 2: MANAGE BUDGETS ─────────────────────────── */}
      {activeTab === 'manage' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Cost Center</th>
                  <th>Year</th>
                  <th>Period</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Budget Amount</th>
                  <th style={{ textAlign: 'right' }}>Alert %</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
                  : budgets.length === 0
                    ? <tr><td colSpan="8" className="empty-state">No budgets configured. Click "+ Add Budget" to get started.</td></tr>
                    : budgets.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 600 }}>{b.department}</td>
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{b.cost_center || '—'}</td>
                          <td className="td-mono">{b.fiscal_year}</td>
                          <td>{periodLabel(b.period)}</td>
                          <td>
                            <span className="badge" style={{ fontSize: 11 }}>{b.category}</span>
                          </td>
                          <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(b.budget_amount)}</td>
                          <td className="td-mono" style={{ textAlign: 'right' }}>{b.alert_threshold ?? 80}%</td>
                          <td className="td-actions">
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => { setEditBudget(b); setModalOpen(true) }}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT BUDGET MODAL ───────────────────────── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditBudget(null) }}
        title={editBudget ? `Edit Budget · ${editBudget.department}` : 'Add Budget'}>
        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="form-group">
              <label>Department *</label>
              <select className="form-control" required value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">— Select —</option>
                {departments.map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Cost Center</label>
              <select className="form-control" value={form.cost_center}
                onChange={e => setForm(f => ({ ...f, cost_center: e.target.value }))}>
                <option value="">— Optional —</option>
                {(costCenters || []).map(cc =>
                  <option key={cc.id || cc.code} value={cc.name || cc.code}>{cc.name || cc.code}</option>
                )}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Fiscal Year *</label>
              <input type="number" className="form-control" required min="2020" max="2099"
                value={form.fiscal_year}
                onChange={e => setForm(f => ({ ...f, fiscal_year: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Period *</label>
              <select className="form-control" required value={form.period}
                onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>
                {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Category *</label>
              <select className="form-control" required value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Budget Amount ($) *</label>
              <input type="number" className="form-control" required min="0" step="0.01"
                placeholder="e.g. 50000"
                value={form.budget_amount}
                onChange={e => setForm(f => ({ ...f, budget_amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Alert Threshold %</label>
              <input type="number" className="form-control" min="1" max="100"
                value={form.alert_threshold}
                onChange={e => setForm(f => ({ ...f, alert_threshold: e.target.value }))} />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                Warn when spend reaches this % of budget (default 80%)
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows="2" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary"
              onClick={() => { setModalOpen(false); setEditBudget(null) }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="material-icons">save</span> {saving ? 'Saving…' : editBudget ? 'Update Budget' : 'Create Budget'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
