// src/pages/HR/HRDashboard.jsx
// Added: leave pending alerts, accrual trigger button, leave summary KPIs

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useNavigate } from 'react-router-dom'
import { useCanView, useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function HRDashboard() {
  const navigate           = useNavigate()
  const { employees, departments, attendance, certifications, leaveRequests, fetchAll } = useHR()
  const canViewEmployees   = useCanView('hr', 'employees')
  const canViewAttendance  = useCanView('hr', 'attendance')
  const canApproveLeave    = useCanApprove('hr', 'leave')

  const [dashboardData, setDashboardData] = useState({
    totalEmployees: 0, activeEmployees: 0, inactiveEmployees: 0,
    attendanceToday: 0, attendanceRate: 0, overtimeAlerts: 0,
    pendingAttendance: 0, pendingLeave: 0, pendingSupervLeave: 0,
    lowBalanceCount: 0, departmentHeadcounts: [], alerts: []
  })

  const [runningAccrual,  setRunningAccrual]  = useState(false)
  const [accrualMonth,    setAccrualMonth]    = useState(new Date().getMonth() + 1)
  const [accrualYear,     setAccrualYear]     = useState(new Date().getFullYear())
  const [myEmployeeId,    setMyEmployeeId]    = useState(null)

  useEffect(() => { fetchAll() }, [])

  // Resolve current user's employee ID for supervisor check
  useEffect(() => {
    const session = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
    if (session?.employee_id) { setMyEmployeeId(session.employee_id); return }
    if (session?.id) {
      supabase.from('app_users').select('employee_id').eq('id', session.id).single()
        .then(({ data }) => { if (data?.employee_id) setMyEmployeeId(data.employee_id) })
    }
  }, [])

  useEffect(() => {
    if (!employees.length) return
    const total    = employees.length
    const active   = employees.filter(e => e.status === 'Active').length
    const inactive = total - active
    const today    = new Date().toISOString().split('T')[0]

    const todayAttendance = attendance.filter(a => a.date === today && a.clock_in)
    const attendanceToday = todayAttendance.length
    const attendanceRate  = active > 0 ? ((attendanceToday / active) * 100).toFixed(1) : 0
    const pendingAttendance = attendance.filter(a => a.status === 'pending').length

    // Leave alerts
    const pendingLeave      = leaveRequests.filter(r => r.status === 'pending_hr').length
    const pendingSupervLeave = leaveRequests.filter(r => r.status === 'pending_supervisor').length

    const startOfWeek = new Date()
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const weeklyOvertime = {}
    attendance.forEach(a => {
      if (new Date(a.date) >= startOfWeek && a.overtime_hours) {
        weeklyOvertime[a.employee_id] = (weeklyOvertime[a.employee_id] || 0) + a.overtime_hours
      }
    })
    const overtimeAlerts = Object.values(weeklyOvertime).filter(ot => ot > 10).length

    const deptMap = new Map()
    departments.forEach(d => deptMap.set(d.id, { name: d.name, count: 0 }))
    employees.forEach(e => { if (e.department_id && deptMap.has(e.department_id)) deptMap.get(e.department_id).count++ })
    const departmentHeadcounts = Array.from(deptMap.values()).sort((a, b) => b.count - a.count)

    const alerts = []

    if (pendingAttendance > 0) alerts.push({ type: 'warning', icon: 'schedule', message: `${pendingAttendance} attendance record(s) pending approval`, action: () => navigate('/module/hr/attendance'), color: 'var(--yellow)' })
    if (pendingLeave > 0 && canApproveLeave) alerts.push({ type: 'warning', icon: 'event_busy', message: `${pendingLeave} leave request(s) pending HR approval`, action: () => navigate('/module/hr/leave'), color: 'var(--red)' })
    if (pendingSupervLeave > 0) alerts.push({ type: 'warning', icon: 'approval', message: `${pendingSupervLeave} leave request(s) awaiting supervisor review`, action: () => navigate('/module/hr/leave'), color: 'var(--yellow)' })

    const activeEmployeesList = employees.filter(e => e.status === 'Active')
    const attendedIds = new Set(todayAttendance.map(a => a.employee_id))
    const missingAttendance = activeEmployeesList.filter(e => !attendedIds.has(e.id))
    if (missingAttendance.length > 0) alerts.push({ type: 'warning', icon: 'warning', message: `${missingAttendance.length} employee(s) have not clocked in today`, action: () => navigate('/module/hr/attendance'), color: 'var(--red)' })

    const noDept = employees.filter(e => !e.department_id)
    if (noDept.length > 0) alerts.push({ type: 'warning', icon: 'business', message: `${noDept.length} employee(s) have no department assigned`, action: () => navigate('/module/hr/employees'), color: 'var(--yellow)' })

    const thirtyDays = new Date()
    thirtyDays.setDate(thirtyDays.getDate() + 30)
    const expiringCerts = certifications.filter(c => { if (!c.expiry_date) return false; const e = new Date(c.expiry_date); return e <= thirtyDays && e >= new Date() })
    if (expiringCerts.length > 0) alerts.push({ type: 'warning', icon: 'verified', message: `${expiringCerts.length} certification(s) expiring within 30 days`, action: () => navigate('/module/hr/employees'), color: 'var(--yellow)' })

    const missingContact = employees.filter(e => !e.phone || !e.email)
    if (missingContact.length > 0) alerts.push({ type: 'info', icon: 'contact_phone', message: `${missingContact.length} employee(s) missing phone or email`, action: () => navigate('/module/hr/employees'), color: 'var(--blue)' })
    if (overtimeAlerts > 0) alerts.push({ type: 'warning', icon: 'warning', message: `${overtimeAlerts} employee(s) exceeded 10 hours overtime this week`, action: () => navigate('/module/hr/attendance'), color: 'var(--red)' })

    setDashboardData({
      totalEmployees: total, activeEmployees: active, inactiveEmployees: inactive,
      attendanceToday, attendanceRate, overtimeAlerts, pendingAttendance,
      pendingLeave, pendingSupervLeave, departmentHeadcounts, alerts,
    })
  }, [employees, departments, attendance, certifications, leaveRequests, navigate, canApproveLeave])

  const handleRunAccrual = async () => {
    if (!window.confirm(`Run monthly accrual for ${accrualMonth}/${accrualYear}? This adds 2.5 days to all active employees. Cannot be undone.`)) return
    setRunningAccrual(true)
    try {
      // Call the accrual function from HRContext if exposed, otherwise call directly
      const activeEmps = employees.filter(e => e.status === 'Active')
      const { data: ltData } = await supabase.from('leave_types').select('id').eq('is_active', true)
      const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
      let accrued = 0

      for (const emp of activeEmps) {
        for (const lt of (ltData || [])) {
          const { error: accrErr } = await supabase.from('leave_accruals').insert([{
            id: generateId(), employee_id: emp.id, leave_type_id: lt.id,
            days_accrued: 2.5, month: accrualMonth, year: accrualYear, created_at: new Date().toISOString()
          }])
          if (accrErr?.message?.includes('duplicate key') || accrErr?.code === '23505') continue
          if (accrErr) continue

          // Increment balance
          const { data: bal } = await supabase.from('leave_balances').select('id, total_days').eq('employee_id', emp.id).eq('leave_type_id', lt.id).eq('year', accrualYear).maybeSingle()
          if (bal) {
            await supabase.from('leave_balances').update({ total_days: (bal.total_days || 0) + 2.5 }).eq('id', bal.id)
          } else {
            await supabase.from('leave_balances').insert([{ id: generateId(), employee_id: emp.id, leave_type_id: lt.id, total_days: 2.5, used_days: 0, year: accrualYear }])
          }
          accrued++
        }
      }

      toast.success(`Accrual complete! ${accrued} records processed for ${activeEmps.length} employees.`)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setRunningAccrual(false) }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">HR Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canViewEmployees && <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/hr/employees')} style={{ marginRight: 4 }}><span className="material-icons">people</span> Employees</button>}
          {canViewAttendance && <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/hr/attendance')}><span className="material-icons">schedule</span> Attendance</button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Employees</div><div className="kpi-val">{dashboardData.totalEmployees}</div><div className="kpi-sub">Active: {dashboardData.activeEmployees} · Inactive: {dashboardData.inactiveEmployees}</div></div>
        <div className="kpi-card"><div className="kpi-label">Attendance Today</div><div className="kpi-val">{dashboardData.attendanceToday}</div><div className="kpi-sub">{dashboardData.attendanceRate}% of active</div></div>
        <div className="kpi-card"><div className="kpi-label">Pending Timesheets</div><div className="kpi-val" style={{ color: dashboardData.pendingAttendance > 0 ? 'var(--yellow)' : 'var(--green)' }}>{dashboardData.pendingAttendance}</div><div className="kpi-sub">awaiting approval</div></div>
        <div className="kpi-card"><div className="kpi-label">Leave Requests</div><div className="kpi-val" style={{ color: (dashboardData.pendingLeave + dashboardData.pendingSupervLeave) > 0 ? 'var(--yellow)' : 'var(--green)' }}>{dashboardData.pendingLeave + dashboardData.pendingSupervLeave}</div><div className="kpi-sub">HR: {dashboardData.pendingLeave} · Supervisor: {dashboardData.pendingSupervLeave}</div></div>
      </div>

      {/* Quick alerts for pending leave */}
      {(dashboardData.pendingLeave > 0 || dashboardData.pendingSupervLeave > 0) && (
        <div className="card" style={{ padding: 16, marginBottom: 20, borderLeft: '4px solid var(--yellow)', background: 'rgba(251,191,36,.04)', cursor: 'pointer' }} onClick={() => navigate('/module/hr/leave')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-icons" style={{ fontSize: 32, color: 'var(--yellow)' }}>event_busy</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {dashboardData.pendingLeave + dashboardData.pendingSupervLeave} leave request(s) need attention
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {dashboardData.pendingLeave > 0 && `${dashboardData.pendingLeave} pending HR approval`}
                {dashboardData.pendingLeave > 0 && dashboardData.pendingSupervLeave > 0 && ' · '}
                {dashboardData.pendingSupervLeave > 0 && `${dashboardData.pendingSupervLeave} pending supervisor review`}
              </div>
            </div>
            <span className="material-icons" style={{ color: 'var(--text-dim)' }}>chevron_right</span>
          </div>
        </div>
      )}

      {/* Monthly Accrual Panel */}
      {canApproveLeave && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--teal)' }}>timeline</span>
            Monthly Leave Accrual
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
            Adds 2.5 leave days per active employee per leave type. Duplicate-safe — running twice for the same month does nothing.
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Month</label>
              <select className="form-control" style={{ width: 120 }} value={accrualMonth} onChange={e => setAccrualMonth(parseInt(e.target.value))}>
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Year</label>
              <input type="number" className="form-control" style={{ width: 90 }} value={accrualYear} onChange={e => setAccrualYear(parseInt(e.target.value) || new Date().getFullYear())} />
            </div>
            <button className="btn btn-primary" onClick={handleRunAccrual} disabled={runningAccrual}>
              <span className="material-icons">autorenew</span>
              {runningAccrual ? 'Running…' : 'Run Accrual'}
            </button>
          </div>
        </div>
      )}

      {/* Department headcounts */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Department Headcounts</h3>
        <div className="table-wrap">
          <table className="stock-table">
            <thead><tr><th>Department</th><th>Employees</th><th>% of Total</th></tr></thead>
            <tbody>
              {dashboardData.departmentHeadcounts.map(dept => (
                <tr key={dept.name}>
                  <td style={{ fontWeight: 600 }}>{dept.name}</td>
                  <td style={{ fontWeight: 700 }}>{dept.count}</td>
                  <td>{dashboardData.totalEmployees ? ((dept.count / dashboardData.totalEmployees) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              {dashboardData.departmentHeadcounts.length === 0 && <tr><td colSpan="3" className="empty-state">No departments</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Smart Alerts */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Smart Alerts</h3>
        {dashboardData.alerts.length === 0 ? (
          <div className="empty-state">
            <span className="material-icons" style={{ fontSize: 36, opacity: 0.5 }}>check_circle</span>
            <div>All systems normal. No alerts.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dashboardData.alerts.map((alert, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, cursor: 'pointer', borderLeft: `3px solid ${alert.color}` }} onClick={alert.action}>
                <span className="material-icons" style={{ color: alert.color }}>{alert.icon}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{alert.message}</span>
                <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>chevron_right</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
