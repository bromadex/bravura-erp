// src/pages/HR/LeaveBalance.jsx
// Stage 10.4 — Leave Balances & History
//
// - Employees see only their own balance
// - HR (canView 'hr','leave' + canApprove) can view any employee's balance
// - Every leave type always appears even when balance is zero
// - Accrual history shown below the balance table

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useCanApprove } from '../../hooks/usePermission'

export default function LeaveBalance() {
  const { user } = useAuth()
  const { employees, leaveTypes, leaveBalances, loading } = useHR()
  const canApproveLeave = useCanApprove('hr', 'leave')

  // The employee whose balance is being viewed
  const [viewingEmployeeId, setViewingEmployeeId] = useState(null)
  const [accrualHistory, setAccrualHistory] = useState([])
  const [accrualLoading, setAccrualLoading] = useState(false)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  // Resolve the current user's employee ID on mount
  useEffect(() => {
    const resolve = async () => {
      if (user?.employee_id) {
        setViewingEmployeeId(user.employee_id)
      } else if (user?.id) {
        const { data } = await supabase
          .from('app_users')
          .select('employee_id')
          .eq('id', user.id)
          .single()
        if (data?.employee_id) setViewingEmployeeId(data.employee_id)
      }
    }
    resolve()
  }, [user])

  // Load accrual history whenever the viewed employee changes
  useEffect(() => {
    if (!viewingEmployeeId) return
    const fetchAccruals = async () => {
      setAccrualLoading(true)
      try {
        const { data, error } = await supabase
          .from('leave_accruals')
          .select('*, leave_types(name)')
          .eq('employee_id', viewingEmployeeId)
          .order('year', { ascending: false })
          .order('month', { ascending: false })
        if (!error) setAccrualHistory(data || [])
      } finally {
        setAccrualLoading(false)
      }
    }
    fetchAccruals()
  }, [viewingEmployeeId])

  // Balances for the employee being viewed
  const getBalance = (leaveTypeId) => {
    const b = leaveBalances.find(
      row => row.employee_id === viewingEmployeeId &&
             row.leave_type_id === leaveTypeId &&
             row.year === currentYear
    )
    return {
      total:     b?.total_days     ?? 0,
      used:      b?.used_days      ?? 0,
      remaining: b?.remaining_days ?? (b ? (b.total_days - b.used_days) : 0)
    }
  }

  const viewingEmployee = employees.find(e => e.id === viewingEmployeeId)
  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Balances</h1>
        {/* Year switcher */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentYear(y => y - 1)}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>chevron_left</span>
            {currentYear - 1}
          </button>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '5px 12px', background: 'var(--surface2)',
            border: '1px solid var(--border2)', borderRadius: 8,
            fontWeight: 700, fontSize: 13
          }}>
            {currentYear}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentYear(y => y + 1)}
          >
            {currentYear + 1}
            <span className="material-icons" style={{ fontSize: 16 }}>chevron_right</span>
          </button>
        </div>
      </div>

      {/* HR: employee selector */}
      {canApproveLeave && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>person_search</span>
              View balance for employee
            </label>
            <select
              className="form-control"
              value={viewingEmployeeId || ''}
              onChange={e => setViewingEmployeeId(e.target.value)}
            >
              <option value="">— Select employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!viewingEmployeeId ? (
        <div className="empty-state">
          <span className="material-icons empty-icon">account_balance_wallet</span>
          <span className="empty-text">
            {canApproveLeave ? 'Select an employee above to view their leave balance.' : 'Loading your balance...'}
          </span>
        </div>
      ) : (
        <>
          {/* Employee header */}
          {viewingEmployee && (
            <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold), var(--teal))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 18, color: '#0b0f1a', flexShrink: 0
              }}>
                {viewingEmployee.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{viewingEmployee.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {viewingEmployee.employee_number || '—'} · Leave balance for {currentYear}
                </div>
              </div>
            </div>
          )}

          {/* KPI summary row */}
          {!loading && leaveTypes.length > 0 && (
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              {leaveTypes.map(lt => {
                const bal = getBalance(lt.id)
                const pct = bal.total > 0 ? Math.min(100, Math.round((bal.used / bal.total) * 100)) : 0
                return (
                  <div key={lt.id} className="kpi-card">
                    <div className="kpi-label">{lt.name}</div>
                    <div className="kpi-val" style={{
                      color: bal.remaining <= 0 ? 'var(--red)'
                           : bal.remaining <= 3  ? 'var(--yellow)'
                           : 'var(--green)'
                    }}>
                      {bal.remaining}
                    </div>
                    <div className="kpi-sub">days remaining</div>
                    {/* Mini progress bar */}
                    {bal.total > 0 && (
                      <div style={{
                        marginTop: 8, height: 4, borderRadius: 4,
                        background: 'var(--border2)', overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 4,
                          width: `${pct}%`,
                          background: pct >= 100 ? 'var(--red)'
                                    : pct >= 70  ? 'var(--yellow)'
                                    : 'var(--teal)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Detailed balance table */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>
                account_balance_wallet
              </span>
              Leave Balance — {currentYear}
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Allocated</th>
                    <th>Used</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>
                  ) : leaveTypes.length === 0 ? (
                    <tr><td colSpan="5" className="empty-state">No leave types configured</td></tr>
                  ) : (
                    leaveTypes.map(lt => {
                      const bal = getBalance(lt.id)
                      const isCritical = bal.total > 0 && bal.remaining <= 0
                      const isLow     = bal.total > 0 && bal.remaining > 0 && bal.remaining <= 3
                      return (
                        <tr key={lt.id}>
                          <td style={{ fontWeight: 600 }}>
                            {lt.name}
                            {lt.requires_attachment && (
                              <span
                                title="Supporting document required"
                                className="material-icons"
                                style={{ fontSize: 12, marginLeft: 6, color: 'var(--text-dim)', verticalAlign: 'middle' }}
                              >
                                attach_file
                              </span>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{bal.total}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: bal.used > 0 ? 'var(--yellow)' : 'inherit' }}>
                            {bal.used}
                          </td>
                          <td style={{
                            fontFamily: 'var(--mono)', fontWeight: 700,
                            color: isCritical ? 'var(--red)' : isLow ? 'var(--yellow)' : 'var(--green)'
                          }}>
                            {bal.remaining}
                          </td>
                          <td>
                            {bal.total === 0 ? (
                              <span className="badge badge-purple">Not Allocated</span>
                            ) : isCritical ? (
                              <span className="badge badge-red">Exhausted</span>
                            ) : isLow ? (
                              <span className="badge badge-yellow">Low</span>
                            ) : (
                              <span className="badge badge-green">Available</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Accrual history */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>
                history
              </span>
              Accrual History
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Year</th>
                    <th>Leave Type</th>
                    <th>Days Added</th>
                    <th>Date Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {accrualLoading ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 32 }}>Loading...</td></tr>
                  ) : accrualHistory.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-state">
                        <span className="material-icons" style={{ fontSize: 32, opacity: 0.4 }}>timeline</span>
                        <span>No accrual records yet. Run monthly accrual from HR Dashboard.</span>
                      </td>
                    </tr>
                  ) : (
                    accrualHistory.map(entry => (
                      <tr key={entry.id}>
                        <td>{months[(entry.month || 1) - 1]}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{entry.year}</td>
                        <td>{entry.leave_types?.name || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                          +{entry.days_accrued}
                        </td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                          {new Date(entry.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
