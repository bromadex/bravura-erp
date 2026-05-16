// src/pages/Projects/PettyCashDashboard.jsx
// Petty Cash Management — overview dashboard
// KPIs · Fund cards with balance color coding · Recent transactions · Alerts

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { PageHeader, StatusBadge, EmptyState, KPICard } from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'

const TODAY = new Date().toISOString().split('T')[0]
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const START_OF_MONTH = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString().split('T')[0]

/** Returns a color for the balance bar based on % of opening balance remaining. */
function balanceColor(current, opening) {
  if (!opening || opening === 0) return 'var(--text-dim)'
  const pct = (current / opening) * 100
  if (pct > 50) return 'var(--green)'
  if (pct > 20) return 'var(--yellow)'
  return 'var(--red)'
}

export default function PettyCashDashboard() {
  const navigate = useNavigate()
  const {
    funds,
    transactions,
    reconciliations,
    loading,
    getFundBalance,
    getPendingExpenses,
    getUnreconciledExpenses,
  } = usePettyCash()

  // ── KPI computations ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activeFunds = funds.filter(f => (f.status || '').toLowerCase() === 'active')
    const totalFunds = activeFunds.length

    const totalBalance = activeFunds.reduce((sum, f) => {
      return sum + (getFundBalance ? getFundBalance(f.id) : (parseFloat(f.current_balance) || 0))
    }, 0)

    const thisMonthExpenses = transactions.filter(t => {
      const date = (t.date || t.created_at || '').slice(0, 10)
      return date >= START_OF_MONTH && (t.status || '').toLowerCase() !== 'rejected'
    }).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

    const pendingRecon = reconciliations.filter(r =>
      ['draft', 'submitted'].includes((r.status || '').toLowerCase())
    ).length

    return { totalFunds, totalBalance, thisMonthExpenses, pendingRecon }
  }, [funds, transactions, reconciliations, getFundBalance])

  // ── Active fund cards ─────────────────────────────────────────────────────
  const activeFunds = useMemo(() => {
    return funds
      .filter(f => (f.status || '').toLowerCase() === 'active')
      .map(f => {
        const currentBalance = getFundBalance ? getFundBalance(f.id) : (parseFloat(f.current_balance) || 0)
        const opening = parseFloat(f.opening_amount) || 0
        const pct = opening > 0 ? Math.min(100, (currentBalance / opening) * 100) : 0
        const color = balanceColor(currentBalance, opening)
        const pendingCount = getPendingExpenses ? getPendingExpenses(f.id)?.length ?? 0 : 0
        const lastTxn = transactions
          .filter(t => t.fund_id === f.id)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .at(0)
        return { ...f, currentBalance, opening, pct, color, pendingCount, lastActivity: lastTxn?.date }
      })
  }, [funds, transactions, getFundBalance, getPendingExpenses])

  // ── Recent transactions (last 10) ─────────────────────────────────────────
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => (b.date || b.created_at || '').localeCompare(a.date || a.created_at || ''))
      .slice(0, 10)
      .map(t => {
        const fund = funds.find(f => f.id === t.fund_id)
        return { ...t, fundLabel: fund?.pcf_code || fund?.project || '—', custodian: fund?.custodian_name || '—' }
      })
  }, [transactions, funds])

  // ── Alert: funds with variance > 10% ─────────────────────────────────────
  const varianceAlerts = useMemo(() => {
    return reconciliations.filter(r => {
      const variance = parseFloat(r.variance_pct) || 0
      return Math.abs(variance) > 10
    })
  }, [reconciliations])

  // ── Alert: funds with unreconciled expenses older than 30 days ───────────
  const staleAlerts = useMemo(() => {
    return activeFunds.filter(f => {
      const unrecon = getUnreconciledExpenses ? getUnreconciledExpenses(f.id) : []
      return unrecon.some(t => (t.date || '').slice(0, 10) < THIRTY_DAYS_AGO)
    })
  }, [activeFunds, getUnreconciledExpenses])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Petty Cash Dashboard"
        subtitle="Overview of all petty cash funds, balances and recent activity"
      >
        <button className="btn btn-primary" onClick={() => navigate('/module/projects/petty-cash-funds')}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          New Fund
        </button>
      </PageHeader>

      {/* ── KPI Row ── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Active Funds"
          value={kpis.totalFunds}
          icon="account_balance_wallet"
          color="teal"
          sub="petty cash funds"
        />
        <KPICard
          label="Total Balance"
          value={`$${fmtNum(kpis.totalBalance)}`}
          icon="savings"
          sub="across all active funds"
        />
        <KPICard
          label="This Month Expenses"
          value={`$${fmtNum(kpis.thisMonthExpenses)}`}
          icon="receipt"
          color="yellow"
          sub="approved & submitted"
        />
        <KPICard
          label="Pending Reconciliation"
          value={kpis.pendingRecon}
          icon="balance"
          color={kpis.pendingRecon > 0 ? 'red' : 'green'}
          sub="awaiting action"
        />
      </div>

      {/* ── Alerts ── */}
      {varianceAlerts.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(239,68,68,.08)',
          border: '1px solid rgba(239,68,68,.3)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <span className="material-icons" style={{ color: 'var(--red)', fontSize: 20, flexShrink: 0, marginTop: 1 }}>
            warning
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>
              High Variance Detected
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {varianceAlerts.length} reconciliation{varianceAlerts.length !== 1 ? 's have' : ' has'} a variance exceeding 10%.
              Immediate review required.
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => navigate('/module/projects/petty-cash-reconciliation')}
          >
            Review <span className="material-icons" style={{ fontSize: 13 }}>arrow_forward</span>
          </button>
        </div>
      )}

      {staleAlerts.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: 'rgba(234,179,8,.07)',
          border: '1px solid rgba(234,179,8,.3)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 20, flexShrink: 0, marginTop: 1 }}>
            hourglass_empty
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--yellow)', marginBottom: 4 }}>
              Stale Unreconciled Expenses
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {staleAlerts.map(f => f.custodian_name || f.pcf_code).join(', ')} — unreconciled expenses older than 30 days.
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            onClick={() => navigate('/module/projects/petty-cash-reconciliation')}
          >
            Reconcile <span className="material-icons" style={{ fontSize: 13 }}>arrow_forward</span>
          </button>
        </div>
      )}

      {/* ── Fund Cards Grid ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Active Funds</div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/module/projects/petty-cash-funds')}
          >
            Manage Funds <span className="material-icons" style={{ fontSize: 13 }}>arrow_forward</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading funds…</div>
        ) : activeFunds.length === 0 ? (
          <EmptyState
            icon="account_balance_wallet"
            message="No active petty cash funds"
            action={
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/module/projects/petty-cash-funds')}>
                Create First Fund
              </button>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {activeFunds.map(fund => (
              <div
                key={fund.id}
                className="card"
                style={{ padding: 0, overflow: 'hidden', borderTop: `3px solid ${fund.color}` }}
              >
                {/* Card header */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                        {fund.pcf_code || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                        {fund.project || fund.department || 'General'}
                      </div>
                    </div>
                    <StatusBadge status={fund.status} />
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '12px 16px' }}>
                  {/* Custodian */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>person</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {fund.custodian_name || '—'}
                    </span>
                  </div>

                  {/* Balance */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Current Balance</span>
                      <span style={{
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        fontSize: 15,
                        color: fund.color,
                      }}>
                        {fund.currency || 'USD'} {fmtNum(fund.currentBalance)}
                      </span>
                    </div>
                    {/* Balance bar */}
                    <div style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--surface-2)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${fund.pct}%`,
                        background: fund.color,
                        borderRadius: 3,
                        transition: 'width .3s',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fund.pct.toFixed(0)}% remaining</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        Opening: {fund.currency || 'USD'} {fmtNum(fund.opening)}
                      </span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11, color: 'var(--text-dim)' }}>
                    <span>
                      <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>schedule</span>
                      {fund.lastActivity ? fmtDate(fund.lastActivity) : 'No activity'}
                    </span>
                    {fund.pendingCount > 0 && (
                      <span style={{
                        background: 'rgba(234,179,8,.15)',
                        color: 'var(--yellow)',
                        border: '1px solid rgba(234,179,8,.3)',
                        borderRadius: 10,
                        padding: '1px 8px',
                        fontWeight: 700,
                      }}>
                        {fund.pendingCount} pending
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="btn-group">
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => navigate('/module/projects/petty-cash-expenses')}
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>add_circle_outline</span>
                      Add Expense
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => navigate('/module/projects/petty-cash-reconciliation')}
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>balance</span>
                      Reconcile
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Transactions ── */}
      <div className="card">
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Recent Transactions</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/module/projects/petty-cash-expenses')}
          >
            View All <span className="material-icons" style={{ fontSize: 13 }}>arrow_forward</span>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : recentTransactions.length === 0 ? (
          <EmptyState icon="receipt_long" message="No transactions recorded yet" />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Fund / Custodian</th>
                  <th>Supplier</th>
                  <th>Category</th>
                  <th>Purpose</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 12 }}>
                      {fmtDate(t.date)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{t.fundLabel}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.custodian}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{t.supplier || '—'}</td>
                    <td>
                      <span className="badge badge-dim" style={{ fontSize: 11 }}>{t.category || '—'}</span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12, maxWidth: 180 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.purpose || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                      {fmtNum(t.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {t.has_receipt ? (
                        <span className="material-icons" style={{ fontSize: 16, color: 'var(--green)' }}>receipt</span>
                      ) : (
                        <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>receipt_long</span>
                      )}
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
