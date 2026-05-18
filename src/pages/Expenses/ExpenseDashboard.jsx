// src/pages/Expenses/ExpenseDashboard.jsx
// Overview dashboard for the Expenses module — KPI cards + mini-tables.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, StatusBadge, EmptyState, Spinner } from '../../components/ui'

export default function ExpenseDashboard() {
  const { user }     = useAuth()
  const canApprove   = useCanApprove('expenses', 'claims')

  const [loading,       setLoading]       = useState(true)
  const [stats,         setStats]         = useState({
    pendingClaims:            0,
    pendingReimbursement:     0,
    pendingReimbursementAmt:  0,
    outstandingAdvances:      0,
    paidThisMonth:            0,
  })
  const [recentClaims,         setRecentClaims]         = useState([])
  const [outstandingAdvances,  setOutstandingAdvances]  = useState([])
  const [employeeMap,          setEmployeeMap]          = useState({})

  // Resolve current user's employee_id once
  const [myEmployeeId, setMyEmployeeId] = useState(user?.employee_id || null)

  useEffect(() => {
    if (myEmployeeId) return
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => { if (data?.employee_id) setMyEmployeeId(data.employee_id) })
  }, [user, myEmployeeId])

  useEffect(() => {
    if (!myEmployeeId && !canApprove) return   // wait until we know who we are
    fetchDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmployeeId, canApprove])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const now        = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      // Build base queries — filter by employee if not approver
      const claimsBase = supabase.from('expense_claims').select('*')
      const advancesBase = supabase.from('employee_advances').select('*')

      const applyEmployeeFilter = (q) =>
        canApprove ? q : q.eq('employee_id', myEmployeeId)

      const [
        pendingClaimsRes,
        pendingReimburseRes,
        outstandingAdvRes,
        paidMonthRes,
        recentClaimsRes,
        outstandingAdvListRes,
      ] = await Promise.all([
        applyEmployeeFilter(claimsBase.eq('approval_status', 'Submitted')).select('id'),
        applyEmployeeFilter(supabase.from('expense_claims').select('id, grand_total').eq('status', 'Unpaid')),
        applyEmployeeFilter(supabase.from('employee_advances').select('id').eq('status', 'Paid').gt('pending_amount', 0)),
        applyEmployeeFilter(supabase.from('expense_claims').select('id').eq('is_paid', true).gte('posting_date', monthStart).lt('posting_date', nextMonth)),
        applyEmployeeFilter(supabase.from('expense_claims').select('id, claim_number, employee_id, posting_date, grand_total, approval_status, status').order('created_at', { ascending: false }).limit(5)),
        applyEmployeeFilter(advancesBase.eq('status', 'Paid').gt('pending_amount', 0).order('created_at', { ascending: false }).limit(10)),
      ])

      // Collect all employee IDs from results
      const empIds = new Set()
      ;(recentClaimsRes.data || []).forEach(c => { if (c.employee_id) empIds.add(c.employee_id) })
      ;(outstandingAdvListRes.data || []).forEach(a => { if (a.employee_id) empIds.add(a.employee_id) })

      // Fetch employee names
      let nameMap = {}
      if (empIds.size > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, name')
          .in('id', Array.from(empIds))
        ;(emps || []).forEach(e => { nameMap[e.id] = e.name })
      }

      const pendingReimburseList = pendingReimburseRes.data || []
      const pendingReimbursementAmt = pendingReimburseList.reduce(
        (sum, c) => sum + (parseFloat(c.grand_total) || 0), 0
      )

      setStats({
        pendingClaims:           (pendingClaimsRes.data || []).length,
        pendingReimbursement:    pendingReimburseList.length,
        pendingReimbursementAmt,
        outstandingAdvances:     (outstandingAdvRes.data || []).length,
        paidThisMonth:           (paidMonthRes.data || []).length,
      })
      setRecentClaims(recentClaimsRes.data || [])
      setOutstandingAdvances(outstandingAdvListRes.data || [])
      setEmployeeMap(nameMap)
    } catch (err) {
      toast.error('Failed to load expense dashboard')
      console.error('[ExpenseDashboard] error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div>
      <PageHeader title="Expense Dashboard">
        <button className="btn btn-secondary btn-sm" onClick={fetchDashboardData}>
          <span className="material-icons">refresh</span> Refresh
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Pending Claims"
          value={stats.pendingClaims}
          sub="awaiting approval"
          icon="pending_actions"
          color={stats.pendingClaims > 0 ? 'yellow' : 'green'}
        />
        <KPICard
          label="Pending Reimbursement"
          value={stats.pendingReimbursement}
          sub={`$${fmt(stats.pendingReimbursementAmt)} total`}
          icon="payments"
          color={stats.pendingReimbursement > 0 ? 'orange' : 'green'}
        />
        <KPICard
          label="Outstanding Advances"
          value={stats.outstandingAdvances}
          sub="paid but not fully claimed"
          icon="account_balance_wallet"
          color={stats.outstandingAdvances > 0 ? 'blue' : 'green'}
        />
        <KPICard
          label="Claims Paid This Month"
          value={stats.paidThisMonth}
          sub="reimbursed in current month"
          icon="check_circle"
          color="teal"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Recent Claims */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Claims</h3>
          {recentClaims.length === 0 ? (
            <EmptyState icon="receipt_long" message="No claims found." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Claim #</th>
                    <th>Employee</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClaims.map(claim => (
                    <tr key={claim.id}>
                      <td style={{ fontWeight: 600 }}>{claim.claim_number || '—'}</td>
                      <td>{employeeMap[claim.employee_id] || '—'}</td>
                      <td>${fmt(claim.grand_total)}</td>
                      <td><StatusBadge status={(claim.approval_status || '').toLowerCase()} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Outstanding Advances */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Outstanding Advances</h3>
          {outstandingAdvances.length === 0 ? (
            <EmptyState icon="account_balance_wallet" message="No outstanding advances." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Advance #</th>
                    <th>Employee</th>
                    <th>Purpose</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingAdvances.map(adv => (
                    <tr key={adv.id}>
                      <td style={{ fontWeight: 600 }}>{adv.advance_number || '—'}</td>
                      <td>{employeeMap[adv.employee_id] || '—'}</td>
                      <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {adv.purpose || '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>${fmt(adv.pending_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
