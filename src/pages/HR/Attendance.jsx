// src/pages/HR/Attendance.jsx
import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function Attendance() {
  const { 
    employees, attendance, clockIn, clockOut, addAttendanceRecord, 
    approveAttendance, rejectAttendance, bulkApproveAttendance,
    updateAttendanceRecord, deleteAttendanceRecord, fetchAll 
  } = useHR()
  const { user } = useAuth()
  const canApprove = useCanApprove('hr', 'attendance')

  const [filterEmployee, setFilterEmployee] = useState('ALL')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [selectedRecords, setSelectedRecords] = useState([])
  const [rejectModal, setRejectModal] = useState({ open: false, recordId: null, reason: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
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
    if (filterStatus !== 'ALL' && record.status !== filterStatus) return false
    if (!canApprove && record.employee_id !== user?.employee_id) return false
    return true
  }).sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return new Date(b.date) - new Date(a.date)
  })

  // KPIs
  const totalHours = filteredAttendance.reduce((sum, r) => sum + (r.total_hours || 0), 0)
  const totalOvertime = filteredAttendance.reduce((sum, r) => sum + (r.overtime_hours || 0), 0)
  const pendingCount = attendance.filter(r => r.status === 'pending').length
  const uniqueDays = new Set(filteredAttendance.map(r => r.date)).size
  const activeEmployees = employees.filter(e => e.status === 'Active').length
  const attendanceRate = uniqueDays > 0 ? (filteredAttendance.length / (activeEmployees * uniqueDays) * 100).toFixed(1) : 0

  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || '—'

  // Open edit modal
  const openEditModal = (record) => {
    if (record.status === 'approved') {
      toast.error('Approved records cannot be edited')
      return
    }
    setEditingRecord(record)
    setForm({
      employee_id: record.employee_id,
      date: record.date,
      clock_in: record.clock_in,
      clock_out: record.clock_out || '',
      shift_type: record.shift_type || 'Day',
      notes: record.notes || ''
    })
    setModalOpen(true)
  }

  // Handle edit submit
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id || !form.date || !form.clock_in) {
      toast.error('Employee, date, and clock‑in time required')
      return
    }
    
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
      const result = await updateAttendanceRecord(
        editingRecord.id,
        {
          employee_id: form.employee_id,
          date: form.date,
          clock_in: form.clock_in,
          clock_out: clockOutTime || null,
          shift_type: form.shift_type,
          total_hours: totalHours || null,
          overtime_hours: overtime || null,
          notes: form.notes
        },
        editingRecord.status
      )
      
      if (result?.reset) {
        toast.success('Record updated – status reset to pending for approval')
      } else {
        toast.success('Attendance record updated')
      }
      setModalOpen(false)
      setEditingRecord(null)
      setForm({ employee_id: '', date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', shift_type: 'Day', notes: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // Handle delete
  const handleDelete = async (record) => {
    if (record.status === 'approved') {
      toast.error('Approved records cannot be deleted')
      return
    }
    if (window.confirm(`Delete attendance record for ${getEmployeeName(record.employee_id)} on ${record.date}?`)) {
      try {
        await deleteAttendanceRecord(record.id, record.status)
        toast.success('Record deleted')
        await fetchAll()
      } catch (err) { toast.error(err.message) }
    }
  }

  // Approve/Reject handlers
  const handleApprove = async (recordId) => {
    try {
      await approveAttendance(recordId, user?.full_name || user?.username, canApprove)
      toast.success('Attendance approved')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      toast.error('Rejection reason required')
      return
    }
    try {
      await rejectAttendance(rejectModal.recordId, user?.full_name || user?.username, rejectModal.reason, canApprove)
      toast.success('Attendance rejected')
      setRejectModal({ open: false, recordId: null, reason: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleBulkApprove = async () => {
    if (selectedRecords.length === 0) {
      toast.error('No records selected')
      return
    }
    try {
      await bulkApproveAttendance(selectedRecords, user?.full_name || user?.username, canApprove)
      toast.success(`${selectedRecords.length} records approved`)
      setSelectedRecords([])
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const toggleSelectRecord = (recordId) => {
    setSelectedRecords(prev =>
      prev.includes(recordId) ? prev.filter(id => id !== recordId) : [...prev, recordId]
    )
  }

  // Quick clock in/out
  const today = new Date().toISOString().split('T')[0]
  const activeEmployeesList = employees.filter(e => e.status === 'Active')
  const todayAttendance = attendance.filter(a => a.date === today)
  const missingAttendance = activeEmployeesList.filter(emp => !todayAttendance.some(a => a.employee_id === emp.id))

  const handleClockIn = async (employeeId) => {
    try {
      await clockIn(employeeId, today, 'Day')
      toast.success('Clocked in')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleClockOut = async (employeeId) => {
    try {
      await clockOut(employeeId, today)
      toast.success('Clocked out')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id || !form.date || !form.clock_in) {
      toast.error('Employee, date, and clock‑in time required')
      return
    }
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
        status: 'pending'
      })
      toast.success('Attendance record saved (pending approval)')
      setModalOpen(false)
      setForm({ employee_id: '', date: new Date().toISOString().split('T')[0], clock_in: '', clock_out: '', shift_type: 'Day', notes: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const exportToExcel = () => {
    const exportData = filteredAttendance.map(r => ({
      Date: r.date,
      Employee: getEmployeeName(r.employee_id),
      'Clock In': r.clock_in,
      'Clock Out': r.clock_out || '—',
      'Shift Type': r.shift_type,
      Hours: r.total_hours?.toFixed(1) || '—',
      Overtime: r.overtime_hours?.toFixed(1) || '—',
      Status: r.status,
      'Approved By': r.approved_by || '—',
      'Rejection Reason': r.rejection_reason || '—',
      Notes: r.notes || '—'
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `Attendance_${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success('Exported to Excel')
  }

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return <span className="badge bg-yellow">Pending</span>
      case 'approved': return <span className="badge bg-green">Approved</span>
      case 'rejected': return <span className="badge bg-red">Rejected</span>
      default: return <span className="badge">{status}</span>
    }
  }

  // Helper to format approved date safely
  const formatApprovedDate = (date) => {
    if (!date) return null
    try {
      return new Date(date).toLocaleDateString()
    } catch {
      return null
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Attendance Tracking</h1>
        <div>
          <button className="btn btn-primary" onClick={() => { setEditingRecord(null); setModalOpen(true) }} style={{ marginRight: 8 }}>
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
        <div className="kpi-card"><div className="kpi-label">Pending Approval</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{pendingCount}</div><div className="kpi-sub">awaiting review</div></div>
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
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>info</span> Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setFilterEmployee('ALL'); setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus('ALL') }}>
              <span className="material-icons">clear</span> Clear
            </button>
            {canApprove && selectedRecords.length > 0 && (
              <button className="btn btn-primary" onClick={handleBulkApprove}>
                <span className="material-icons">done_all</span> Approve Selected ({selectedRecords.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Clock In/Out */}
      {canApprove && (
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
      )}

      {/* Attendance Table */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Attendance Records</h3>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>{canApprove && <input type="checkbox" onChange={e => setSelectedRecords(e.target.checked ? filteredAttendance.filter(r => r.status === 'pending').map(r => r.id) : [])} />}</th>
                <th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Shift</th>
                <th>Hours</th><th>Overtime</th><th>Status</th><th>Approved By</th><th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map(record => {
                const isPending = record.status === 'pending'
                const isApproved = record.status === 'approved'
                const isSelected = selectedRecords.includes(record.id)
                const approvedDate = formatApprovedDate(record.approved_at)
                return (
                  <tr key={record.id} style={{ background: isPending ? 'rgba(251,191,36,.05)' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      {canApprove && isPending && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRecord(record.id)} />
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{record.date}</td>
                    <td><strong>{getEmployeeName(record.employee_id)}</strong></td>
                    <td>{record.clock_in}</td>
                    <td>{record.clock_out || '—'}</td>
                    <td><span className="badge bg-blue">{record.shift_type}</span></td>
                    <td>{record.total_hours?.toFixed(1) || '—'}</td>
                    <td>{record.overtime_hours?.toFixed(1) || '—'}</td>
                    <td>{getStatusBadge(record.status)}</td>
                    <td style={{ fontSize: 12 }}>
                      {record.approved_by || '—'}
                      {approvedDate && <br />}
                      {approvedDate && <small>{approvedDate}</small>}
                    </td>
                    <td style={{ color: 'var(--text-dim)', maxWidth: 150 }}>{record.notes || '—'}</td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {isPending ? (
                        canApprove ? (
                          <>
                            <button className="btn btn-green btn-sm" onClick={() => handleApprove(record.id)}>
                              <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span> Approve
                            </button>
                            <button className="btn btn-red btn-sm" onClick={() => setRejectModal({ open: true, recordId: record.id, reason: '' })}>
                              <span className="material-icons" style={{ fontSize: 14 }}>cancel</span> Reject
                            </button>
                          </>
                        ) : (
                          <span className="badge bg-yellow">Pending</span>
                        )
                      ) : (
                        <>
                          {!isApproved && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(record)}>
                              <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                            </button>
                          )}
                          {!isApproved && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(record)}>
                              <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                            </button>
                          )}
                          {isApproved && (
                            <span className="badge bg-green" style={{ fontSize: 11 }}>Locked</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredAttendance.length === 0 && (
                <tr><td colSpan={12} className="empty-state">No attendance records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, recordId: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject Attendance Record</div>
            <div className="form-group">
              <label>Reason for Rejection *</label>
              <textarea className="form-control" rows="3" value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} placeholder="Explain why this attendance record is being rejected..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, recordId: null, reason: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry / Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => { setModalOpen(false); setEditingRecord(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingRecord ? 'Edit Attendance' : 'Manual Attendance Entry'}</div>
            {editingRecord?.status === 'rejected' && (
              <div className="info-box" style={{ marginBottom: 16, background: 'rgba(251,191,36,.1)', borderColor: 'var(--yellow)', padding: 8 }}>
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle' }}>info</span>
                This record was rejected. Editing will reset its status to <strong>Pending</strong> for re-approval.
              </div>
            )}
            <form onSubmit={editingRecord ? handleEditSubmit : handleManualSubmit}>
              <div className="form-group">
                <label>Employee *</label>
                <select className="form-control" required value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">Select Employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="form-group"><label>Shift Type</label><select className="form-control" value={form.shift_type} onChange={e => setForm({ ...form, shift_type: e.target.value })}><option>Day</option><option>Night</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Clock In *</label><input type="time" className="form-control" required value={form.clock_in} onChange={e => setForm({ ...form, clock_in: e.target.value })} /></div>
                <div className="form-group"><label>Clock Out</label><input type="time" className="form-control" value={form.clock_out} onChange={e => setForm({ ...form, clock_out: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setModalOpen(false); setEditingRecord(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingRecord ? 'Save Changes' : 'Save Record (Pending)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
