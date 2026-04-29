// src/pages/HR/HRDashboard.jsx
import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'

export default function HRDashboard() {
  const navigate = useNavigate()
  const { employees, departments, attendance, certifications, fetchAll } = useHR()
  const canViewEmployees = useCanView('hr', 'employees')
  const canViewAttendance = useCanView('hr', 'attendance')

  const [dashboardData, setDashboardData] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
    attendanceToday: 0,
    attendanceRate: 0,
    overtimeAlerts: 0,
    departmentHeadcounts: [],
    alerts: []
  })

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (!employees.length) return

    const total = employees.length
    const active = employees.filter(e => e.status === 'Active').length
    const inactive = total - active

    const today = new Date().toISOString().split('T')[0]
    const todayAttendance = attendance.filter(a => a.date === today && a.clock_in)
    const attendanceToday = todayAttendance.length
    const attendanceRate = active > 0 ? ((attendanceToday / active) * 100).toFixed(1) : 0

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
    employees.forEach(e => {
      if (e.department_id && deptMap.has(e.department_id)) {
        deptMap.get(e.department_id).count++
      }
    })
    const departmentHeadcounts = Array.from(deptMap.values()).sort((a, b) => b.count - a.count)

    const alerts = []
    const activeEmployees = employees.filter(e => e.status === 'Active')
    const attendedIds = new Set(todayAttendance.map(a => a.employee_id))
    const missingAttendance = activeEmployees.filter(e => !attendedIds.has(e.id))
    if (missingAttendance.length > 0) {
      alerts.push({ type: 'warning', icon: 'schedule', message: `${missingAttendance.length} employee(s) have not clocked in today`, action: () => navigate('/module/hr/attendance'), color: 'var(--yellow)' })
    }
    const noDept = employees.filter(e => !e.department_id)
    if (noDept.length > 0) {
      alerts.push({ type: 'warning', icon: 'business', message: `${noDept.length} employee(s) have no department assigned`, action: () => navigate('/module/hr/employees'), color: 'var(--yellow)' })
    }
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const expiringCerts = certifications.filter(c => {
      if (!c.expiry_date) return false
      const expiry = new Date(c.expiry_date)
      return expiry <= thirtyDaysFromNow && expiry >= new Date()
    })
    if (expiringCerts.length > 0) {
      alerts.push({ type: 'warning', icon: 'verified', message: `${expiringCerts.length} certification(s) expiring within 30 days`, action: () => navigate('/module/hr/employees'), color: 'var(--yellow)' })
    }
    const missingContact = employees.filter(e => !e.phone || !e.email)
    if (missingContact.length > 0) {
      alerts.push({ type: 'info', icon: 'contact_phone', message: `${missingContact.length} employee(s) missing phone or email`, action: () => navigate('/module/hr/employees'), color: 'var(--blue)' })
    }
    const incompleteProfile = employees.filter(e => !e.hire_date || !e.designation_id)
    if (incompleteProfile.length > 0) {
      alerts.push({ type: 'info', icon: 'person', message: `${incompleteProfile.length} employee(s) have incomplete profiles`, action: () => navigate('/module/hr/employees'), color: 'var(--blue)' })
    }
    if (overtimeAlerts > 0) {
      alerts.push({ type: 'warning', icon: 'warning', message: `${overtimeAlerts} employee(s) exceeded 10 hours overtime this week`, action: () => navigate('/module/hr/attendance'), color: 'var(--red)' })
    }

    setDashboardData({
      totalEmployees: total,
      activeEmployees: active,
      inactiveEmployees: inactive,
      attendanceToday,
      attendanceRate,
      overtimeAlerts,
      departmentHeadcounts,
      alerts
    })
  }, [employees, departments, attendance, certifications, navigate])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">HR Dashboard</h1>
        <div>
          {canViewEmployees && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/hr/employees')} style={{ marginRight: 8 }}>
              <span className="material-icons">people</span> Employees
            </button>
          )}
          {canViewAttendance && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/hr/attendance')}>
              <span className="material-icons">schedule</span> Attendance
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Employees</div>
          <div className="kpi-val">{dashboardData.totalEmployees}</div>
          <div className="kpi-sub">Active: {dashboardData.activeEmployees} · Inactive: {dashboardData.inactiveEmployees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Attendance Today</div>
          <div className="kpi-val">{dashboardData.attendanceToday}</div>
          <div className="kpi-sub">{dashboardData.attendanceRate}% of active employees</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Overtime Alerts</div>
          <div className="kpi-val" style={{ color: dashboardData.overtimeAlerts > 0 ? 'var(--red)' : 'var(--green)' }}>{dashboardData.overtimeAlerts}</div>
          <div className="kpi-sub">Over 10hrs this week</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Departments</div>
          <div className="kpi-val">{departments.length}</div>
          <div className="kpi-sub">Avg {(dashboardData.totalEmployees / (departments.length || 1)).toFixed(1)} per dept</div>
        </div>
      </div>

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
                  <td>{((dept.count / dashboardData.totalEmployees) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {dashboardData.departmentHeadcounts.length === 0 && (<tr><td colSpan="3" className="empty-state">No departments</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Smart Alerts</h3>
        {dashboardData.alerts.length === 0 ? (
          <div className="empty-state">
            <span className="material-icons" style={{ fontSize: 36, opacity: 0.5 }}>check_circle</span>
            <div>All systems normal. No alerts.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dashboardData.alerts.map((alert, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, cursor: 'pointer', borderLeft: `3px solid ${alert.color}` }} onClick={alert.action}>
                <span className="material-icons" style={{ color: alert.color }}>{alert.icon}</span>
                <span style={{ flex: 1 }}>{alert.message}</span>
                <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>chevron_right</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
