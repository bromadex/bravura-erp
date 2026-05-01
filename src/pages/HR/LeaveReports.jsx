// src/pages/HR/LeaveReports.jsx
// Leave analytics: usage by type, absenteeism rate, balance summary, pending summary
// Excel export for all views

import { useState, useMemo } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import { getWorkingDays } from '../../utils/dateUtils'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

export default function LeaveReports() {
  const { employees, departments, leaveTypes, leaveBalances, leaveRequests } = useHR()
  const canApprove = useCanApprove('hr', 'leave')

  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [dateTo,   setDateTo]   = useState(today)
  const [filterDept, setFilterDept] = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [activeView, setActiveView] = useState('usage')  // 'usage' | 'balances' | 'absenteeism' | 'pending'

  const year = new Date().getFullYear()

  // Filtered employees by dept
  const filteredEmployees = useMemo(() =>
    filterDept === 'ALL' ? employees : employees.filter(e => e.department_id === filterDept)
  , [employees, filterDept])

  // Approved requests in date range
  const approvedInRange = useMemo(() => leaveRequests.filter(r =>
    r.status === 'approved' &&
    filteredEmployees.some(e => e.id === r.employee_id) &&
    r.start_date <= dateTo &&
    r.end_date   >= dateFrom &&
    (filterType === 'ALL' || r.leave_type_id === filterType)
  ), [leaveRequests, filteredEmployees, dateFrom, dateTo, filterType])

  // Usage per leave type
  const usageByType = useMemo(() => {
    const map = {}
    leaveTypes.forEach(lt => { map[lt.id] = { name: lt.name, count: 0, days: 0 } })
    approvedInRange.forEach(r => {
      if (map[r.leave_type_id]) {
        map[r.leave_type_id].count++
        map[r.leave_type_id].days += r.days_requested || 0
      }
    })
    return Object.values(map).sort((a, b) => b.days - a.days)
  }, [approvedInRange, leaveTypes])

  // Per-employee usage
  const usageByEmployee = useMemo(() => {
    const map = {}
    filteredEmployees.forEach(e => {
      map[e.id] = { name: e.name, empNumber: e.employee_number, dept: departments.find(d => d.id === e.department_id)?.name || '—', days: 0, count: 0 }
    })
    approvedInRange.forEach(r => {
      if (map[r.employee_id]) {
        map[r.employee_id].days  += r.days_requested || 0
        map[r.employee_id].count++
      }
    })
    return Object.values(map).sort((a, b) => b.days - a.days)
  }, [approvedInRange, filteredEmployees, departments])

  // Leave balances table
  const balancesData = useMemo(() => {
    return filteredEmployees.map(emp => {
      const row = {
        name:       emp.name,
        empNumber:  emp.employee_number,
        dept:       departments.find(d => d.id === emp.department_id)?.name || '—',
      }
      leaveTypes.forEach(lt => {
        const bal = leaveBalances.find(b => b.employee_id === emp.id && b.leave_type_id === lt.id && b.year === year)
        row[lt.name] = bal ? `${(bal.total_days - bal.used_days).toFixed(1)} / ${bal.total_days}` : '0 / 0'
      })
      return row
    })
  }, [filteredEmployees, leaveTypes, leaveBalances, departments, year])

  // Absenteeism rate
  const workingDaysInRange = getWorkingDays(dateFrom, dateTo)
  const absenteeismData = useMemo(() => {
    return usageByEmployee.map(row => ({
      ...row,
      absenteeism: workingDaysInRange > 0 ? ((row.days / workingDaysInRange) * 100).toFixed(1) : '0.0',
    }))
  }, [usageByEmployee, workingDaysInRange])

  // Pending summary
  const pendingData = useMemo(() => {
    return leaveRequests
      .filter(r => ['pending_supervisor','pending_hr'].includes(r.status) && filteredEmployees.some(e => e.id === r.employee_id))
      .map(r => {
        const emp = employees.find(e => e.id === r.employee_id)
        const lt  = leaveTypes.find(l => l.id === r.leave_type_id)
        return { name: emp?.name || '—', type: lt?.name || '—', start: r.start_date, end: r.end_date, days: r.days_requested, status: r.status.replace(/_/g, ' '), created: r.created_at?.split('T')[0] }
      })
  }, [leaveRequests, filteredEmployees, employees, leaveTypes])

  const exportToExcel = () => {
    let data, sheetName
    if (activeView === 'usage') {
      data      = usageByEmployee.map(r => ({ Employee: r.name, 'Emp No': r.empNumber, Department: r.dept, 'Leave Days': r.days, 'Requests': r.count }))
      sheetName = 'Leave Usage'
    } else if (activeView === 'balances') {
      data      = balancesData
      sheetName = 'Leave Balances'
    } else if (activeView === 'absenteeism') {
      data      = absenteeismData.map(r => ({ Employee: r.name, Department: r.dept, 'Days Absent': r.days, 'Working Days': workingDaysInRange, 'Absenteeism %': r.absenteeism }))
      sheetName = 'Absenteeism'
    } else {
      data      = pendingData.map(r => ({ Employee: r.name, 'Leave Type': r.type, 'Start': r.start, 'End': r.end, 'Days': r.days, 'Status': r.status, 'Submitted': r.created }))
      sheetName = 'Pending Approvals'
    }
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `LeaveReport_${sheetName}_${today}.xlsx`)
    toast.success('Exported to Excel')
  }

  const totalDays = approvedInRange.reduce((s, r) => s + (r.days_requested || 0), 0)
  const totalReqs = approvedInRange.length

  const VIEWS = [
    { id: 'usage',       label: 'Usage',       icon: 'bar_chart'    },
    { id: 'balances',    label: 'Balances',    icon: 'account_balance_wallet' },
    { id: 'absenteeism', label: 'Absenteeism', icon: 'trending_down'          },
    { id: 'pending',     label: 'Pending',     icon: 'pending_actions'        },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Reports</h1>
        <button className="btn btn-secondary" onClick={exportToExcel}>
          <span className="material-icons">table_chart</span> Export to Excel
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Date From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Date To</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Department</label>
            <select className="form-control" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Leave Type</label>
            <select className="form-control" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="ALL">All Types</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Approved Requests</div><div className="kpi-val">{totalReqs}</div><div className="kpi-sub">in range</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Leave Days</div><div className="kpi-val">{totalDays.toFixed(1)}</div><div className="kpi-sub">approved</div></div>
        <div className="kpi-card"><div className="kpi-label">Working Days</div><div className="kpi-val">{workingDaysInRange}</div><div className="kpi-sub">in range</div></div>
        <div className="kpi-card">
          <div className="kpi-label">Avg Absenteeism</div>
          <div className="kpi-val" style={{ color: 'var(--yellow)' }}>
            {workingDaysInRange > 0 && filteredEmployees.length > 0
              ? ((totalDays / (workingDaysInRange * filteredEmployees.length)) * 100).toFixed(1)
              : '0.0'}%
          </div>
          <div className="kpi-sub">across employees</div>
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeView === v.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeView === v.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      {/* Usage view */}
      {activeView === 'usage' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 260 }}>
            <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>By Leave Type</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Type</th><th>Requests</th><th>Days</th></tr></thead>
                <tbody>
                  {usageByType.map(row => (
                    <tr key={row.name}>
                      <td style={{ fontWeight: 600 }}>{row.name}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{row.count}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{row.days.toFixed(1)}</td>
                    </tr>
                  ))}
                  {usageByType.length === 0 && <tr><td colSpan="3" className="empty-state">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={{ flex: 2, minWidth: 320 }}>
            <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>By Employee</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Employee</th><th>Dept</th><th>Requests</th><th>Days Taken</th></tr></thead>
                <tbody>
                  {usageByEmployee.map(row => (
                    <tr key={row.name}>
                      <td><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{row.empNumber}</div></td>
                      <td style={{ fontSize: 12 }}>{row.dept}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{row.count}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: row.days > 10 ? 'var(--yellow)' : 'inherit' }}>{row.days.toFixed(1)}</td>
                    </tr>
                  ))}
                  {usageByEmployee.length === 0 && <tr><td colSpan="4" className="empty-state">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Balances view */}
      {activeView === 'balances' && (
        <div className="card">
          <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>Leave Balances — {year} (Remaining / Total)</div>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="stock-table" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Employee</th><th>Dept</th>
                  {leaveTypes.map(lt => <th key={lt.id}>{lt.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {balancesData.map((row, i) => (
                  <tr key={i}>
                    <td><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{row.empNumber}</div></td>
                    <td style={{ fontSize: 12 }}>{row.dept}</td>
                    {leaveTypes.map(lt => (
                      <td key={lt.id} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {row[lt.name]}
                      </td>
                    ))}
                  </tr>
                ))}
                {balancesData.length === 0 && <tr><td colSpan={leaveTypes.length + 2} className="empty-state">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Absenteeism view */}
      {activeView === 'absenteeism' && (
        <div className="card">
          <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
            Absenteeism Rate = (Leave Days / Working Days in Range) × 100
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Employee</th><th>Dept</th><th>Days Absent</th><th>Working Days</th><th>Absenteeism %</th></tr></thead>
              <tbody>
                {absenteeismData.map((row, i) => {
                  const pct = parseFloat(row.absenteeism)
                  return (
                    <tr key={i}>
                      <td><div style={{ fontWeight: 600 }}>{row.name}</div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{row.empNumber}</div></td>
                      <td style={{ fontSize: 12 }}>{row.dept}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{row.days.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{workingDaysInRange}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden', maxWidth: 80 }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 10 ? 'var(--red)' : pct > 5 ? 'var(--yellow)' : 'var(--green)', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: pct > 10 ? 'var(--red)' : pct > 5 ? 'var(--yellow)' : 'var(--green)', minWidth: 40 }}>{row.absenteeism}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {absenteeismData.length === 0 && <tr><td colSpan="5" className="empty-state">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending view */}
      {activeView === 'pending' && (
        <div className="card">
          <div style={{ padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>Pending Approvals</div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Employee</th><th>Leave Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Submitted</th></tr></thead>
              <tbody>
                {pendingData.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td>{row.type}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.start}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.end}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{row.days}</td>
                    <td><span className="badge badge-yellow">{row.status}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{row.created}</td>
                  </tr>
                ))}
                {pendingData.length === 0 && <tr><td colSpan="7" className="empty-state">No pending requests</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
