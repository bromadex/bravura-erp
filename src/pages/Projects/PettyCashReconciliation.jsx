// src/pages/Projects/PettyCashReconciliation.jsx
// Petty Cash — Reconciliation management and posting to General Ledger

import { useState, useMemo } from 'react'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { useAccounting } from '../../contexts/AccountingContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions, TabNav,
} from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const BLANK_RECON = {
  fund_id: '', period_start: '', period_end: '', actual_cash: '', notes: '',
}

const BLANK_POST = {
  petty_cash_account_id: '', expense_account_id: '', variance_account_id: '',
}

// ── Variance display helper ───────────────────────────────────────────────────
function VarianceCell({ variance, pct }) {
  const over = Math.abs(pct) > 10
  return (
    <span style={{
      fontFamily:  'var(--mono)',
      fontWeight:  over ? 800 : 600,
      fontSize:    12,
      color:       over ? 'var(--red)' : 'var(--green)',
    }}>
      {variance >= 0 ? '+' : ''}{fmtNum(variance)}
      <span style={{ fontSize: 10, marginLeft: 4, opacity: .85 }}>
        ({Math.abs(pct).toFixed(1)}%{over ? ' ⚠' : ''})
      </span>
    </span>
  )
}

// ── Category summary helper ───────────────────────────────────────────────────
function categoryBreakdown(expenses) {
  const map = {}
  for (const e of expenses) {
    const cat = e.category || 'Uncategorised'
    map[cat] = (map[cat] || 0) + (parseFloat(e.amount) || 0)
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1])
}

export default function PettyCashReconciliation() {
  const {
    funds, transactions, topups, reconciliations, loading,
    createReconciliation, submitReconciliation, approveReconciliation, rejectReconciliation,
    postReconciliationToAccounts,
    getUnreconciledExpenses,
  } = usePettyCash()

  const { accounts } = useAccounting()
  const { user }     = useAuth()
  const canEdit      = useCanEdit('projects', 'petty-cash-reconciliation')

  const [tab, setTab] = useState('reconciliations')

  // ── New reconciliation modal ──────────────────────────────────────────────
  const [showNewModal, setShowNewModal] = useState(false)
  const [reconForm,    setReconForm]    = useState(BLANK_RECON)
  const [savingNew,    setSavingNew]    = useState(false)

  // ── Reject modal ──────────────────────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)

  // ── Post to accounts modal ────────────────────────────────────────────────
  const [showPostModal, setShowPostModal] = useState(false)
  const [postTarget,    setPostTarget]    = useState(null)
  const [postForm,      setPostForm]      = useState(BLANK_POST)
  const [savingPost,    setSavingPost]    = useState(false)

  // ── Form helper ───────────────────────────────────────────────────────────
  const setRF = (field, val) => setReconForm(f => ({ ...f, [field]: val }))

  // ── Live preview for new reconciliation ───────────────────────────────────
  const preview = useMemo(() => {
    if (!reconForm.fund_id || !reconForm.period_start || !reconForm.period_end) return null
    const fund = funds.find(f => f.id === reconForm.fund_id)
    if (!fund) return null

    const periodTopups = topups.filter(t =>
      t.fund_id === reconForm.fund_id &&
      t.date >= reconForm.period_start &&
      t.date <= reconForm.period_end
    )

    const unrecon = getUnreconciledExpenses
      ? getUnreconciledExpenses(reconForm.fund_id).filter(t =>
          t.date >= reconForm.period_start && t.date <= reconForm.period_end
        )
      : transactions.filter(t =>
          t.fund_id === reconForm.fund_id &&
          (t.status || '').toLowerCase() === 'approved' &&
          !t.reconciliation_id &&
          t.date >= reconForm.period_start &&
          t.date <= reconForm.period_end
        )

    const opening       = parseFloat(fund.opening_amount) || parseFloat(fund.opening_balance) || 0
    const topupsTotal   = periodTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const expensesTotal = unrecon.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const expected      = opening + topupsTotal - expensesTotal
    const actual        = parseFloat(reconForm.actual_cash) || 0
    const variance      = actual - expected
    const variancePct   = expected !== 0 ? (Math.abs(variance) / Math.abs(expected)) * 100 : 0

    return {
      fund, opening, topupsTotal, expensesTotal, expected,
      actual, variance, variancePct,
      expenses: unrecon,
      catBreakdown: categoryBreakdown(unrecon),
    }
  }, [reconForm, funds, topups, transactions, getUnreconciledExpenses])

  // ── Category breakdown for post modal ────────────────────────────────────
  const postCatBreakdown = useMemo(() => {
    if (!postTarget) return []
    const txns = transactions.filter(t => t.reconciliation_id === postTarget.id)
    return categoryBreakdown(txns)
  }, [postTarget, transactions])

  // ── Accounts filtered by type ─────────────────────────────────────────────
  const assetAccounts   = useMemo(() =>
    (accounts || []).filter(a => ['asset', 'Asset'].includes(a.account_type || a.type || '')),
    [accounts]
  )
  const expenseAccounts = useMemo(() =>
    (accounts || []).filter(a => ['expense', 'Expense'].includes(a.account_type || a.type || '')),
    [accounts]
  )

  // ── Enriched reconciliations ──────────────────────────────────────────────
  const enriched = useMemo(() =>
    [...reconciliations]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map(r => {
        const fund = funds.find(f => f.id === r.fund_id)
        return { ...r, fund }
      }),
    [reconciliations, funds]
  )

  const readyToPost = useMemo(() =>
    enriched.filter(r => r.status === 'approved' && !r.journal_entry_ref),
    [enriched]
  )

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'reconciliations', label: 'Reconciliations', icon: 'balance',          count: reconciliations.length },
    { id: 'post',            label: 'Post to Accounts', icon: 'account_balance', count: readyToPost.length || undefined },
  ]

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateRecon = async (e) => {
    e.preventDefault()
    if (!reconForm.fund_id)      return toast.error('Select a fund')
    if (!reconForm.period_start) return toast.error('Period start required')
    if (!reconForm.period_end)   return toast.error('Period end required')
    if (reconForm.period_end < reconForm.period_start) return toast.error('Period end must be after start')
    if (!reconForm.actual_cash)  return toast.error('Enter actual cash on hand')

    setSavingNew(true)
    try {
      await createReconciliation({
        fundId:      reconForm.fund_id,
        periodStart: reconForm.period_start,
        periodEnd:   reconForm.period_end,
        actualCash:  parseFloat(reconForm.actual_cash),
        notes:       reconForm.notes.trim() || null,
        createdBy:   user?.full_name || user?.username || null,
      })
      toast.success('Reconciliation created')
      setShowNewModal(false)
      setReconForm(BLANK_RECON)
    } catch (err) { toast.error(err.message) }
    finally { setSavingNew(false) }
  }

  const handleSubmitRecon = async (recon) => {
    try {
      await submitReconciliation(recon.id)
      toast.success('Reconciliation submitted')
    } catch (err) { toast.error(err.message) }
  }

  const handleApproveRecon = async (recon) => {
    try {
      await approveReconciliation(recon.id, user?.full_name || user?.username || '')
      toast.success('Reconciliation approved')
    } catch (err) { toast.error(err.message) }
  }

  const openReject = (recon) => { setRejectTarget(recon); setRejectReason('') }

  const handleRejectRecon = async () => {
    if (!rejectReason.trim()) return toast.error('Rejection reason required')
    setRejecting(true)
    try {
      await rejectReconciliation(rejectTarget.id, rejectReason, user?.full_name || user?.username)
      toast.success('Reconciliation rejected')
      setRejectTarget(null)
    } catch (err) { toast.error(err.message) }
    finally { setRejecting(false) }
  }

  const openPostModal = (recon) => {
    setPostTarget(recon)
    setPostForm(BLANK_POST)
    setShowPostModal(true)
  }

  const handlePost = async (e) => {
    e.preventDefault()
    if (!postForm.petty_cash_account_id) return toast.error('Select petty cash account')
    if (!postForm.expense_account_id)    return toast.error('Select expense account')

    setSavingPost(true)
    try {
      await postReconciliationToAccounts({
        reconId:            postTarget.id,
        pettyCashAccountId: postForm.petty_cash_account_id,
        expenseAccountId:   postForm.expense_account_id,
        varianceAccountId:  postForm.variance_account_id || null,
        postedBy:           user?.full_name || user?.username || null,
      })
      toast.success('Posted to General Ledger')
      setShowPostModal(false)
      setPostTarget(null)
    } catch (err) { toast.error(err.message) }
    finally { setSavingPost(false) }
  }

  const getAccountLabel = (id) => {
    const a = accounts.find(x => x.id === id)
    return a ? `${a.code || a.account_code || ''} ${a.name || a.account_name || ''}`.trim() : '—'
  }

  // ── Journal preview lines ─────────────────────────────────────────────────
  const journalPreviewLines = useMemo(() => {
    if (!postTarget) return []
    const total    = parseFloat(postTarget.total_expenses) || 0
    const variance = parseFloat(postTarget.variance)       || 0
    const lines    = [
      { account: postForm.expense_account_id ? getAccountLabel(postForm.expense_account_id) : 'Expense Account', dr: total, cr: 0, memo: 'Petty cash expenses' },
      { account: postForm.petty_cash_account_id ? getAccountLabel(postForm.petty_cash_account_id) : 'Petty Cash Account', dr: 0, cr: total, memo: 'Reduce petty cash balance' },
    ]
    if (variance !== 0) {
      if (variance < 0) {
        lines.push({ account: postForm.variance_account_id ? getAccountLabel(postForm.variance_account_id) : 'Cash Variance Account', dr: Math.abs(variance), cr: 0, memo: 'Cash shortage' })
        lines[1].cr += Math.abs(variance)
      } else {
        lines.push({ account: postForm.variance_account_id ? getAccountLabel(postForm.variance_account_id) : 'Cash Variance Account', dr: 0, cr: variance, memo: 'Cash surplus' })
        lines[0].dr += variance
      }
    }
    return lines
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postTarget, postForm, accounts])

  return (
    <div>
      <PageHeader
        title="Petty Cash Reconciliation"
        subtitle="Reconcile funds and post to the General Ledger"
      >
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setReconForm(BLANK_RECON); setShowNewModal(true) }}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span>
            New Reconciliation
          </button>
        )}
      </PageHeader>

      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* ═══════════════════ RECONCILIATIONS TAB ═══════════════════ */}
      {tab === 'reconciliations' && (
        <>
          {loading ? (
            <EmptyState icon="hourglass_empty" message="Loading reconciliations…" />
          ) : enriched.length === 0 ? (
            <EmptyState
              icon="balance"
              message="No reconciliations yet"
              action={canEdit && <button className="btn btn-primary btn-sm" onClick={() => { setReconForm(BLANK_RECON); setShowNewModal(true) }}>Create First Reconciliation</button>}
            />
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Fund</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'right' }}>Opening</th>
                      <th style={{ textAlign: 'right' }}>Top-ups</th>
                      <th style={{ textAlign: 'right' }}>Expenses</th>
                      <th style={{ textAlign: 'right' }}>Expected</th>
                      <th style={{ textAlign: 'right' }}>Actual Cash</th>
                      <th style={{ textAlign: 'right' }}>Variance</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map(r => {
                      const over   = Math.abs(r.variance_pct || 0) > 10
                      const status = (r.status || '').toLowerCase()
                      return (
                        <tr key={r.id} style={over ? { background: 'rgba(248,113,113,.04)' } : {}}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)' }}>{r.pcr_code || '—'}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.fund?.pcf_code || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.fund?.custodian_name || '—'}</div>
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>
                            {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtNum(r.opening_balance)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--blue)' }}>+{fmtNum(r.topups)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>-{fmtNum(r.total_expenses)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtNum(r.expected_closing)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{fmtNum(r.actual_cash)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <VarianceCell variance={r.variance || 0} pct={r.variance_pct || 0} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <StatusBadge status={r.status} />
                              {r.journal_entry_ref && (
                                <span className="badge badge-green" style={{ fontSize: 9 }}>Posted</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="btn-group-sm">
                              {canEdit && status === 'draft' && (
                                <button className="btn btn-success btn-sm" onClick={() => handleSubmitRecon(r)} title="Submit">
                                  <span className="material-icons" style={{ fontSize: 13 }}>send</span>
                                </button>
                              )}
                              {canEdit && (status === 'submitted' || status === 'pending') && (
                                <>
                                  <button className="btn btn-success btn-sm" onClick={() => handleApproveRecon(r)} title="Approve">
                                    <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>
                                  </button>
                                  <button className="btn btn-danger btn-sm" onClick={() => openReject(r)} title="Reject">
                                    <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>
                                  </button>
                                </>
                              )}
                              {status === 'approved' && !r.journal_entry_ref && canEdit && (
                                <button className="btn btn-secondary btn-sm" onClick={() => openPostModal(r)} title="Post to Accounts">
                                  <span className="material-icons" style={{ fontSize: 13 }}>account_balance</span>
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
          )}
        </>
      )}

      {/* ═══════════════════ POST TO ACCOUNTS TAB ═══════════════════ */}
      {tab === 'post' && (
        <>
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-dim)' }}>
            Approved reconciliations ready to post to the General Ledger.
          </div>
          {readyToPost.length === 0 ? (
            <EmptyState icon="account_balance" message="No approved reconciliations awaiting posting" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
              {readyToPost.map(r => (
                <div key={r.id} className="card" style={{ padding: 0, overflow: 'hidden', borderTop: '3px solid var(--green)' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', fontSize: 12 }}>{r.pcr_code}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{r.fund?.custodian_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12, marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Expenses</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>{fmtNum(r.total_expenses)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Variance</div>
                        <VarianceCell variance={r.variance || 0} pct={r.variance_pct || 0} />
                      </div>
                    </div>
                    {canEdit && (
                      <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => openPostModal(r)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>account_balance</span>
                        Post to Accounts
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ NEW RECONCILIATION MODAL ═══════════════════ */}
      <ModalDialog
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Reconciliation"
        size="lg"
      >
        <form onSubmit={handleCreateRecon}>
          <div className="form-section">
            <div className="form-section-title">Fund & Period</div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>FUND *</label>
              <select className="form-control" required value={reconForm.fund_id}
                onChange={e => setRF('fund_id', e.target.value)}>
                <option value="">— Select Active Fund —</option>
                {funds.filter(f => (f.status || '').toLowerCase() === 'active').map(f => (
                  <option key={f.id} value={f.id}>{f.pcf_code ? `${f.pcf_code} — ` : ''}{f.custodian_name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>PERIOD START *</label>
                <input type="date" className="form-control" required value={reconForm.period_start}
                  onChange={e => setRF('period_start', e.target.value)} />
              </div>
              <div className="form-group">
                <label>PERIOD END *</label>
                <input type="date" className="form-control" required value={reconForm.period_end}
                  onChange={e => setRF('period_end', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Summary preview */}
          {preview && (
            <div className="form-section">
              <div className="form-section-title" style={{ marginBottom: 10 }}>
                Period Summary
                <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>
                  {preview.expenses.length} unreconciled expense{preview.expenses.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 16px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Opening Balance</span>
                  <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{fmtNum(preview.opening)}</span>
                  <span style={{ color: 'var(--blue)' }}>+ Top-ups</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', textAlign: 'right' }}>+{fmtNum(preview.topupsTotal)}</span>
                  <span style={{ color: 'var(--red)' }}>− Expenses ({preview.expenses.length})</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)', textAlign: 'right' }}>−{fmtNum(preview.expensesTotal)}</span>
                  <span style={{ fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 6 }}>Expected Closing</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right', borderTop: '1px solid var(--border)', paddingTop: 6 }}>{fmtNum(preview.expected)}</span>
                </div>
              </div>
              {preview.expenses.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>info</span>
                  No approved unreconciled expenses found in this period.
                </div>
              )}

              {/* Preview expense list */}
              {preview.expenses.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>
                    Show {preview.expenses.length} expense{preview.expenses.length !== 1 ? 's' : ''} included
                  </summary>
                  <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <th style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Date</th>
                          <th style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Category</th>
                          <th style={{ padding: '5px 8px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Purpose</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.expenses.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{fmtDate(t.date)}</td>
                            <td style={{ padding: '4px 8px' }}>{t.category || '—'}</td>
                            <td style={{ padding: '4px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>{t.purpose || '—'}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--teal)' }}>{fmtNum(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Actual cash */}
          <div className="form-section">
            <div className="form-section-title">Cash Count</div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>ACTUAL CASH ON HAND *</label>
              <input type="number" step="0.01" min="0" className="form-control" required
                value={reconForm.actual_cash}
                onChange={e => setRF('actual_cash', e.target.value)}
                placeholder="Count the physical cash and enter the total" />
            </div>

            {/* Live variance */}
            {preview && reconForm.actual_cash && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 4,
                background: Math.abs(preview.variancePct) > 10 ? 'rgba(248,113,113,.08)' : 'rgba(52,211,153,.08)',
                border:     `1px solid ${Math.abs(preview.variancePct) > 10 ? 'rgba(248,113,113,.3)' : 'rgba(52,211,153,.3)'}`,
                fontSize:   13,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: Math.abs(preview.variancePct) > 10 ? 8 : 0 }}>
                  <span style={{ color: 'var(--text-dim)' }}>Expected Closing</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtNum(preview.expected)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Variance</span>
                  <VarianceCell variance={preview.variance} pct={preview.variancePct} />
                </div>
                {Math.abs(preview.variancePct) > 10 && (
                  <div style={{
                    marginTop: 8, fontSize: 12, color: 'var(--red)',
                    display: 'flex', alignItems: 'flex-start', gap: 5,
                    padding: '6px 8px', background: 'rgba(248,113,113,.1)', borderRadius: 5,
                  }}>
                    <span className="material-icons" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>warning</span>
                    Variance exceeds 10% threshold. Accountant and Group Manager will be notified upon submission.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 4 }}>
            <label>NOTES</label>
            <textarea className="form-control" rows={2} value={reconForm.notes}
              onChange={e => setRF('notes', e.target.value)}
              placeholder="Any additional notes…"
              style={{ resize: 'vertical' }} />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingNew}>
              {savingNew ? 'Creating…' : 'Create Reconciliation'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ═══════════════════ REJECT MODAL ═══════════════════ */}
      <ModalDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={`Reject Reconciliation · ${rejectTarget?.pcr_code || ''}`}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
          Provide a reason for rejecting this reconciliation.
        </div>
        <div className="form-group" style={{ marginBottom: 4 }}>
          <label>REJECTION REASON *</label>
          <textarea className="form-control" rows={3} value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="e.g. Variance too high, supporting documents missing…"
            style={{ resize: 'vertical' }} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleRejectRecon} disabled={rejecting}>
            {rejecting ? 'Rejecting…' : 'Reject Reconciliation'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ═══════════════════ POST TO ACCOUNTS MODAL ═══════════════════ */}
      {postTarget && (
        <ModalDialog
          open={showPostModal}
          onClose={() => setShowPostModal(false)}
          title={`Post to General Ledger · ${postTarget.pcr_code || ''}`}
          size="lg"
        >
          {/* Expense summary by category */}
          {postCatBreakdown.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="form-section-title" style={{ marginBottom: 8 }}>Expenses by Category</div>
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', fontSize: 12 }}>
                {postCatBreakdown.map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{cat}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>{fmtNum(amt)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--surface2)', fontWeight: 700 }}>
                  <span>Total Expenses</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                    {fmtNum(postCatBreakdown.reduce((s, [, v]) => s + v, 0))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Account selectors */}
          <form onSubmit={handlePost}>
            <div className="form-section">
              <div className="form-section-title">Account Mapping</div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>PETTY CASH ACCOUNT (Asset) *</label>
                <select className="form-control" required value={postForm.petty_cash_account_id}
                  onChange={e => setPostForm(f => ({ ...f, petty_cash_account_id: e.target.value }))}>
                  <option value="">— Select Asset Account —</option>
                  {assetAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.code || a.account_code || '')} {(a.name || a.account_name || '')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>DEFAULT EXPENSE ACCOUNT *</label>
                <select className="form-control" required value={postForm.expense_account_id}
                  onChange={e => setPostForm(f => ({ ...f, expense_account_id: e.target.value }))}>
                  <option value="">— Select Expense Account —</option>
                  {expenseAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.code || a.account_code || '')} {(a.name || a.account_name || '')}
                    </option>
                  ))}
                </select>
              </div>
              {(postTarget.variance || 0) !== 0 && (
                <div className="form-group" style={{ marginBottom: 4 }}>
                  <label>CASH VARIANCE ACCOUNT</label>
                  <select className="form-control" value={postForm.variance_account_id}
                    onChange={e => setPostForm(f => ({ ...f, variance_account_id: e.target.value }))}>
                    <option value="">— Select Variance Account (optional) —</option>
                    {expenseAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {(a.code || a.account_code || '')} {(a.name || a.account_name || '')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Journal entry preview */}
            <div className="form-section" style={{ marginBottom: 0 }}>
              <div className="form-section-title" style={{ marginBottom: 8 }}>Journal Entry Preview</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                {postTarget.pcr_code} · Period {fmtDate(postTarget.period_start)} – {fmtDate(postTarget.period_end)}
              </div>
              <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)' }}>ACCOUNT</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)' }}>MEMO</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)', width: 90 }}>DR</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)', width: 90 }}>CR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalPreviewLines.map((line, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontSize: 12 }}>{line.account}</td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-dim)' }}>{line.memo}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: line.dr > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {line.dr > 0 ? fmtNum(line.dr) : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: line.cr > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                          {line.cr > 0 ? fmtNum(line.cr) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                      <td colSpan={2} style={{ padding: '6px 10px', fontSize: 12 }}>Total</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                        {fmtNum(journalPreviewLines.reduce((s, l) => s + l.dr, 0))}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                        {fmtNum(journalPreviewLines.reduce((s, l) => s + l.cr, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPostModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={savingPost}>
                <span className="material-icons" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>account_balance</span>
                {savingPost ? 'Posting…' : 'Post Journal Entry'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
