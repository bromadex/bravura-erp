// src/pages/Projects/PettyCashReconciliation.jsx
// Petty cash reconciliation: create, submit, approve, reject, post to accounts.

import { useState, useMemo } from 'react'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { useAccounting } from '../../contexts/AccountingContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const BLANK_RECON = {
  fund_id: '', period_start: '', period_end: '',
  actual_cash: '', notes: '',
}

const BLANK_POST = {
  petty_cash_account_id: '', expense_account_id: '', variance_account_id: '',
}

function VarianceBadge({ pct, variance }) {
  const over = Math.abs(pct) > 10
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12,
      color: over ? 'var(--red)' : 'var(--green)',
    }}>
      {variance >= 0 ? '+' : ''}{fmtNum(variance)} ({Math.abs(pct).toFixed(1)}%{over ? ' ⚠' : ''})
    </span>
  )
}

export default function PettyCashReconciliation() {
  const {
    funds, transactions, topups, reconciliations, loading,
    createReconciliation, submitReconciliation, approveReconciliation, rejectReconciliation,
    postReconciliationToAccounts,
    getUnreconciledExpenses,
  } = usePettyCash()

  const { accounts } = useAccounting()
  const canEdit = useCanEdit('projects', 'petty-cash-reconciliation')

  const [tab, setTab]             = useState('reconciliations')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [reconForm, setReconForm] = useState(BLANK_RECON)
  const [postForm, setPostForm]   = useState(BLANK_POST)
  const [postTarget, setPostTarget] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  // Live preview calculations for the new reconciliation modal
  const preview = useMemo(() => {
    if (!reconForm.fund_id || !reconForm.period_start || !reconForm.period_end) return null
    const fund = funds.find(f => f.id === reconForm.fund_id)
    if (!fund) return null

    const periodTopups = topups.filter(t =>
      t.fund_id === reconForm.fund_id &&
      t.date >= reconForm.period_start &&
      t.date <= reconForm.period_end
    )
    const unreconciled = (getUnreconciledExpenses ? getUnreconciledExpenses(reconForm.fund_id) : transactions.filter(t =>
      t.fund_id === reconForm.fund_id &&
      t.status === 'approved' &&
      !t.reconciliation_id &&
      t.date >= reconForm.period_start &&
      t.date <= reconForm.period_end
    ))

    const opening       = parseFloat(fund.opening_balance) || 0
    const topupsTotal   = periodTopups.reduce((s, t) => s + (t.amount || 0), 0)
    const expensesTotal = unreconciled.reduce((s, t) => s + (t.amount || 0), 0)
    const expected      = opening + topupsTotal - expensesTotal
    const actual        = parseFloat(reconForm.actual_cash) || 0
    const variance      = actual - expected
    const variancePct   = expected !== 0 ? (Math.abs(variance) / Math.abs(expected)) * 100 : 0

    return {
      fund, opening, topupsTotal, expensesTotal, expected,
      actual, variance, variancePct,
      unreconciledCount: unreconciled.length,
      expenses:          unreconciled,
    }
  }, [reconForm, funds, topups, transactions, getUnreconciledExpenses])

  const handleCreateRecon = async (e) => {
    e.preventDefault()
    if (!reconForm.fund_id)       return toast.error('Select a fund')
    if (!reconForm.period_start)  return toast.error('Period start required')
    if (!reconForm.period_end)    return toast.error('Period end required')
    if (reconForm.period_end < reconForm.period_start) return toast.error('End must be after start')
    if (!reconForm.actual_cash)   return toast.error('Enter actual cash on hand')
    setSaving(true)
    try {
      const code = await createReconciliation({
        fundId:      reconForm.fund_id,
        periodStart: reconForm.period_start,
        periodEnd:   reconForm.period_end,
        actualCash:  parseFloat(reconForm.actual_cash),
        notes:       reconForm.notes,
      })
      toast.success(`Reconciliation created — ${code}`)
      setShowNewModal(false)
      setReconForm(BLANK_RECON)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSubmitRecon = async (id) => {
    try {
      await submitReconciliation(id)
    } catch (err) { toast.error(err.message) }
  }

  const handleApproveRecon = async (id) => {
    try {
      await approveReconciliation(id, '')
      toast.success('Reconciliation approved')
    } catch (err) { toast.error(err.message) }
  }

  const handleRejectRecon = async () => {
    if (!rejectReason.trim()) return toast.error('Reason required')
    try {
      await rejectReconciliation(rejectTarget, rejectReason)
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) { toast.error(err.message) }
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
    setSaving(true)
    try {
      const result = await postReconciliationToAccounts({
        reconId:             postTarget.id,
        pettyCashAccountId:  postForm.petty_cash_account_id,
        expenseAccountId:    postForm.expense_account_id,
        varianceAccountId:   postForm.variance_account_id || null,
      })
      toast.success(`Posted — ${result?.jeCode || 'Journal entry created'}`)
      setShowPostModal(false)
      setPostTarget(null)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // Account type filters for selects
  const assetAccounts    = (accounts || []).filter(a => a.account_type === 'Asset' || a.account_type === 'asset')
  const expenseAccounts  = (accounts || []).filter(a => a.account_type === 'Expense' || a.account_type === 'expense')

  const enriched = useMemo(() => reconciliations.map(r => {
    const fund = funds.find(f => f.id === r.fund_id)
    return { ...r, fund }
  }), [reconciliations, funds])

  return (
    <div>
      <PageHeader title="Petty Cash Reconciliation">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setReconForm(BLANK_RECON); setShowNewModal(true) }}>
            <span className="material-icons">add</span> New Reconciliation
          </button>
        )}
      </PageHeader>

      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn${tab === 'reconciliations' ? ' active' : ''}`} onClick={() => setTab('reconciliations')}>
          Reconciliations
        </button>
        <button className={`tab-btn${tab === 'post' ? ' active' : ''}`} onClick={() => setTab('post')}>
          Post to Accounts
        </button>
      </div>

      {/* Reconciliations Table */}
      {tab === 'reconciliations' && (
        loading ? <EmptyState icon="hourglass_empty" message="Loading…" /> :
        enriched.length === 0 ? <EmptyState icon="balance" message="No reconciliations yet" /> : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Code</th><th>Fund</th><th>Period</th>
                  <th style={{ textAlign: 'right' }}>Opening</th>
                  <th style={{ textAlign: 'right' }}>Top-ups</th>
                  <th style={{ textAlign: 'right' }}>Expenses</th>
                  <th style={{ textAlign: 'right' }}>Expected</th>
                  <th style={{ textAlign: 'right' }}>Actual</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(r => {
                  const over = Math.abs(r.variance_pct || 0) > 10
                  return (
                    <tr key={r.id} style={over ? { background: 'rgba(248,113,113,.05)' } : {}}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>{r.pcr_code}</td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{r.fund?.pcf_code}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.fund?.custodian_name}</div>
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtNum(r.opening_balance)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--blue)' }}>+{fmtNum(r.topups)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>-{fmtNum(r.total_expenses)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtNum(r.expected_closing)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>{fmtNum(r.actual_cash)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <VarianceBadge pct={r.variance_pct || 0} variance={r.variance || 0} />
                      </td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        <div className="btn-group-sm">
                          {canEdit && r.status === 'draft' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleSubmitRecon(r.id)} title="Submit">
                              <span className="material-icons">send</span>
                            </button>
                          )}
                          {canEdit && (r.status === 'submitted' || r.status === 'pending') && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => handleApproveRecon(r.id)} title="Approve">
                                <span className="material-icons">check</span>
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => { setRejectTarget(r.id); setRejectReason('') }} title="Reject">
                                <span className="material-icons">close</span>
                              </button>
                            </>
                          )}
                          {r.status === 'approved' && !r.journal_entry_ref && canEdit && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openPostModal(r)} title="Post to Accounts">
                              <span className="material-icons">account_balance</span>
                            </button>
                          )}
                          {r.journal_entry_ref && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>Posted</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Post to Accounts overview tab */}
      {tab === 'post' && (
        <div>
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-dim)' }}>
            Approved reconciliations ready to post to the General Ledger:
          </div>
          {enriched.filter(r => r.status === 'approved' && !r.journal_entry_ref).length === 0 ? (
            <EmptyState icon="account_balance" message="No approved reconciliations awaiting posting" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
              {enriched.filter(r => r.status === 'approved' && !r.journal_entry_ref).map(r => (
                <div key={r.id} className="card" style={{ padding: 16, borderTop: '3px solid var(--green)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>{r.pcr_code}</div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.fund?.custodian_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
                    {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 12 }}>
                    <div><span style={{ color: 'var(--text-dim)' }}>Expenses</span><br />
                      <strong style={{ fontFamily: 'var(--mono)' }}>{fmtNum(r.total_expenses)}</strong>
                    </div>
                    <div><span style={{ color: 'var(--text-dim)' }}>Variance</span><br />
                      <VarianceBadge pct={r.variance_pct || 0} variance={r.variance || 0} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => openPostModal(r)}>
                    <span className="material-icons" style={{ fontSize: 14 }}>account_balance</span> Post to Accounts
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Reconciliation Modal */}
      <ModalDialog open={showNewModal} onClose={() => setShowNewModal(false)} title="New Reconciliation">
        <form onSubmit={handleCreateRecon}>
          <div className="form-group">
            <label>Fund *</label>
            <select className="form-control" required value={reconForm.fund_id}
              onChange={e => setReconForm(f => ({ ...f, fund_id: e.target.value }))}>
              <option value="">— Select fund —</option>
              {funds.filter(f => f.status === 'active').map(f => (
                <option key={f.id} value={f.id}>{f.pcf_code} — {f.custodian_name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Period Start *</label>
              <input type="date" className="form-control" required value={reconForm.period_start}
                onChange={e => setReconForm(f => ({ ...f, period_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Period End *</label>
              <input type="date" className="form-control" required value={reconForm.period_end}
                onChange={e => setReconForm(f => ({ ...f, period_end: e.target.value }))} />
            </div>
          </div>

          {/* Preview panel */}
          {preview && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-dim)', fontSize: 11 }}>RECONCILIATION PREVIEW</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                <div>Opening Balance</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(preview.opening)}</div>
                <div style={{ color: 'var(--blue)' }}>+ Top-ups</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>+{fmtNum(preview.topupsTotal)}</div>
                <div style={{ color: 'var(--red)' }}>- Expenses ({preview.unreconciledCount} items)</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>-{fmtNum(preview.expensesTotal)}</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 700 }}>Expected Closing</div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtNum(preview.expected)}</div>
              </div>
              {preview.unreconciledCount === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--yellow)' }}>
                  ⚠ No approved unreconciled expenses found in this period.
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Actual Cash on Hand *</label>
            <input type="number" step="0.01" className="form-control" required value={reconForm.actual_cash}
              onChange={e => setReconForm(f => ({ ...f, actual_cash: e.target.value }))}
              placeholder="Count the physical cash and enter the total" />
          </div>

          {/* Variance preview */}
          {preview && reconForm.actual_cash && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 14,
              background: Math.abs(preview.variancePct) > 10 ? 'rgba(248,113,113,.08)' : 'rgba(52,211,153,.08)',
              border: `1px solid ${Math.abs(preview.variancePct) > 10 ? 'rgba(248,113,113,.3)' : 'rgba(52,211,153,.3)'}`,
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Variance:</span>
                <VarianceBadge pct={preview.variancePct} variance={preview.variance} />
              </div>
              {Math.abs(preview.variancePct) > 10 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
                  Variance exceeds 10% threshold. Accountant and Group Manager will be notified upon submission.
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={reconForm.notes}
              onChange={e => setReconForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Reconciliation'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* Reject Modal */}
      <ModalDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Reconciliation">
        <div className="form-group">
          <label>Rejection Reason *</label>
          <textarea className="form-control" rows={3} value={rejectReason}
            onChange={e => setRejectReason(e.target.value)} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleRejectRecon}>Reject</button>
        </ModalActions>
      </ModalDialog>

      {/* Post to Accounts Modal */}
      {postTarget && (
        <ModalDialog open={showPostModal} onClose={() => setShowPostModal(false)} title="Post to General Ledger">
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Journal Entry Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
              Reconciliation <strong>{postTarget.pcr_code}</strong> · Period {fmtDate(postTarget.period_start)} – {fmtDate(postTarget.period_end)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', fontSize: 12 }}>
              <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Account</div>
              <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>DR</div>
              <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>CR</div>
              <div>Expense Account</div>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmtNum(postTarget.total_expenses)}</div>
              <div>—</div>
              <div>Petty Cash Account</div>
              <div>—</div>
              <div style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmtNum(postTarget.total_expenses)}</div>
              {(postTarget.variance || 0) !== 0 && (
                <>
                  <div>Variance Account {postTarget.variance > 0 ? '(surplus)' : '(shortage)'}</div>
                  <div style={{ fontFamily: 'var(--mono)' }}>{postTarget.variance < 0 ? fmtNum(Math.abs(postTarget.variance)) : '—'}</div>
                  <div style={{ fontFamily: 'var(--mono)' }}>{postTarget.variance > 0 ? fmtNum(postTarget.variance) : '—'}</div>
                </>
              )}
            </div>
          </div>

          <form onSubmit={handlePost}>
            <div className="form-group">
              <label>Petty Cash Account (Asset) *</label>
              <select className="form-control" required value={postForm.petty_cash_account_id}
                onChange={e => setPostForm(f => ({ ...f, petty_cash_account_id: e.target.value }))}>
                <option value="">— Select account —</option>
                {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Expense Account *</label>
              <select className="form-control" required value={postForm.expense_account_id}
                onChange={e => setPostForm(f => ({ ...f, expense_account_id: e.target.value }))}>
                <option value="">— Select account —</option>
                {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
              </select>
            </div>
            {(postTarget.variance || 0) !== 0 && (
              <div className="form-group">
                <label>Variance Account (Expense)</label>
                <select className="form-control" value={postForm.variance_account_id}
                  onChange={e => setPostForm(f => ({ ...f, variance_account_id: e.target.value }))}>
                  <option value="">— Select account (optional) —</option>
                  {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>)}
                </select>
              </div>
            )}
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPostModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <span className="material-icons" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>account_balance</span>
                {saving ? 'Posting…' : 'Post Journal Entry'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
