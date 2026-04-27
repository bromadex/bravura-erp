import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function Attendance() {
  const { employees, attendance, clockIn, clockOut, addAttendanceRecord, fetchAll } = useHR()
  const { user } = useAuth()
  
  const [filterEmployee, setFilterEmployee] = useState('ALL')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    clock_in: '',
    clock_out: '',
    shift_type: 'Day',
    notes: ''
  })

  // Filter attendance records
  const filteredAttendance = attendance.filter(record => {
    if (filterEmployee !== 'ALL' && record.employee_id !== filterEmployee) return false
    if (filterDateFrom && record.date < filterDateFrom) return false
    if (filterDateTo && record.date > filterDateTo) return false
    return true
  }).sort((a, b) => new Date(b.date) - new Date(a.date))

  // Calculate KPIs
  const totalHours = filteredAttendance.reduce((sum, r) => sum + (r.total_hours || 0), 0)
  const totalOvertime = filteredAttendance.reduce((sum, r) => sum + (r.overtime_hours || 0), 0)
  const uniqueDays = new Set(filteredAttendance.map(r => r.date)).size
  const activeEmployees = employees.filter(e => e.status === 'Active').length
  const attendanceRate = uniqueDays > 0 ? (filteredAttendance.length / (activeEmployees * uniqueDays) * 100).toFixed(1) : 0

  // Get employee name
  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || '—'

  // Handle clock in/out
  const handleClockIn = async (employeeId) => {
    const today = new Date().toISOString().split('T')[0]
    const existing = attendance.find(a => a.employee_id === employeeId && a.date === today && !a.clock_out)
    if (existing) {
      toast.error('Already clocked in today')
      return
    }
    try {
      await clockIn(employeeId, today, 'Day')
      toast.success('Clocked in successfully')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleClockOut = async (employeeId) => {
    const today = new Date().toISOString().split('T')[0]
    const record = attendance.find(a => a.employee_id === employeeId && a.date === today && !a.clock_out)
    if (!record) {
      toast.error('No open clock‑in record found')
      return
    }
    try {
      await clockOut(employeeId, today)
      toast.success('Clocked out successfully')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // Manual entry
  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id) return toast.error('Select employee')
    if (!form.date) return toast.error('Enter date')
    if (!form.clock_in) return toast.error('Enter clock‑in time')
    
    let clockOutTime = form.clock_out
    let totalHours = 0
    let overtime = 0
    
    if (clockOutTime) {
      const [inH, inM] = form.clock_in.split(':').map(Number)
      const [outH, outM] = clockOutTime.split(':').map(Number)
      let mins = (outH * 60 + outM) - (inH * 60 + inM)
      if (mins < 0) mins += 24 * 60
      totalHours = mins / 60
      overtime = Math.max(0, totalHours - 8)
    }
    
    try {
      await addAttendanceRecord({
        employee_id: form.employee_id,
        date: form.date,
        clock_in: form.clock_in,
        clock_out: clockOutTime || null,
        shift_type: form.shift_type,
        total_hours: totalHours || null,
        overtime_hours: overtime || null,
        notes: form.notes,
        created_at: new Date().toISOString()
      })
      toast.success('Attendance record saved')
      setModalOpen(false)
      setForm({ employee_id: '', date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', shift_type: 'Day', notes: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredAttendance.map(r => ({
      Date: r.date,
      Employee: getEmployeeName(r.employee_id),
      'Clock In': r.clock_in,
      'Clock Out': r.clock_out || '—',
      'Shift Type': r.shift_type,
      'Hours': r.total_hours?.toFixed(1) || '—',
      'Overtime': r.overtime_hours?.toFixed(1) || '—',
      Notes: r.notes || '—'
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `Attendance_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Exported to Excel')
  }

  // Get today's missing attendance (active employees with no clock‑in today)
  const today = new Date().toISOString().split('T')[0]
  const activeEmployeesList = employees.filter(e => e.status === 'Active')
  const todayAttendance = attendance.filter(a => a.date === today)
  const missingAttendance = activeEmployeesList.filter(emp => !todayAttendance.some(a => a.employee_id === emp.id))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Attendance Tracking</h1>
        <div>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} style={{ marginRight: 8 }}>
            <span className="material-icons">add</span> Manual Entry
          </button>
          <button className="btn btn-secondary" onClick={exportToExcel}>
            <span className="material-icons">table_chart</span> Export
          </button>
        </div>
      </div>

      {/* Missing Attendance Alert */}
      {missingAttendance.length > 0 && (
        <div className="card" style={{ background: 'rgba(248,113,113,.1)', borderColor: 'var(--red)', marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="material-icons" style={{ color: 'var(--red)' }}>warning</span>
            <span><strong>{missingAttendance.length} employee(s)</strong> have not clocked in today:</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{missingAttendance.map(e => e.name).join(', ')}</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Hours</div><div className="kpi-val">{totalHours.toFixed(1)}</div><div className="kpi-sub">filtered period</div></div>
        <div className="kpi-card"><div className="kpi-label">Overtime</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{totalOvertime.toFixed(1)}</div><div className="kpi-sub">filtered period</div></div>
        <div className="kpi-card"><div className="kpi-label">Records</div><div className="kpi-val">{filteredAttendance.length}</div><div className="kpi-sub">filtered</div></div>
        <div className="kpi-card"><div className="kpi-label">Attendance Rate</div><div className="kpi-val">{attendanceRate}%</div><div className="kpi-sub">of expected check‑ins</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>person</span> Employee</label>
            <select className="form-control" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
              <option value="ALL">All Employees</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>date_range</span> From Date</label>
            <input type="date" className="form-control" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>date_range</span> To Date</label>
            <input type="date" className="form-control" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setFilterEmployee('ALL'); setFilterDateFrom(''); setFilterDateTo('') }}>
              <span className="material-icons">clear</span> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Quick Clock In/Out Cards for Active Employees */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Quick Clock In / Out – Today</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {activeEmployeesList.map(emp => {
            const todayRecord = attendance.find(a => a.employee_id === emp.id && a.date === today)
            const isClockedIn = todayRecord && !todayRecord.clock_out
            return (
              <div key={emp.id} className="card" style={{ padding: 8, minWidth: 180, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>{emp.name}</span>
                {!todayRecord ? (
                  <button className="btn btn-primary btn-sm" onClick={() => handleClockIn(emp.id)}>Clock In</button>
                ) : isClockedIn ? (
                  <button className="btn btn-danger btn-sm" onClick={() => handleClockOut(emp.id)}>Clock Out</button>
                ) : (
                  <span className="badge bg-green">Completed</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Attendance Table */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Attendance Records</h3>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Shift</th><th>Hours</th><th>Overtime</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map(record => (
                <tr key={record.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{record.date}</td>
                  <td><strong>{getEmployeeName(record.employee_id)}</strong></td>
                  <td>{record.clock_in}</td>
                  <td>{record.clock_out || '—'}</td>
                  <td><span className="badge bg-blue">{record.shift_type}</span></td>
                  <td>{record.total_hours?.toFixed(1) || '—'}</td>
                  <td>{record.overtime_hours?.toFixed(1) || '—'}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{record.notes || '—'}</td>
                </tr>
              ))}
              {filteredAttendance.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty-state">No attendance records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Manual <span>Attendance Entry</span></div>
            <form onSubmit={handleManualSubmit}>
              <div className="form-group">
                <label>Employee *</label>
                <select className="form-control" required value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})}>
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div className="form-group"><label>Shift Type</label>
                  <select className="form-control" value={form.shift_type} onChange={e => setForm({...form, shift_type: e.target.value})}>
                    <option>Day</option><option>Night</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Clock In *</label><input type="time" className="form-control" required value={form.clock_in} onChange={e => setForm({...form, clock_in: e.target.value})} /></div>
                <div className="form-group"><label>Clock Out</label><input type="time" className="form-control" value={form.clock_out} onChange={e => setForm({...form, clock_out: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
