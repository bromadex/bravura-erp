// src/pages/HR/Attendance.jsx
//
// CHANGES:
// 1. Regular employees can ONLY clock in/out for themselves.
//    Manual entry and "clock in for another employee" are restricted
//    to supervisors (canApprove) and HR only.
//
// 2. Every attendance record now requires a work_description
//    and optionally supports multiple attachment uploads (images/docs).
//    These are stored in employee_attendance.work_description and
//    attachment_urls (JSONB array of Supabase storage URLs).
//
// 3. Modern UI: card-based today's status, timeline view, clean badges.
//
// 4. Badge classes use badge-green/yellow/red (not bg-*).

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function Attendance() {
  const {
    employees, attendance,
    clockIn, clockOut, addAttendanceRecord,
    approveAttendance, rejectAttendance, bulkApproveAttendance,
    updateAttendanceRecord, deleteAttendanceRecord, fetchAll
  } = useHR()
  const { user } = useAuth()
  const canApprove = useCanApprove('hr', 'attendance')

  const today = new Date().toISOString().split('T')[0]

  // Resolve the current user's employee ID
  const [myEmployeeId, setMyEmployeeId] = useState(user?.employee_id || null)

  useEffect(() => {
    if (user?.employee_id) { setMyEmployeeId(user.employee_id); return }
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => { if (data?.employee_id) setMyEmployeeId(data.employee_id) })
  }, [user])

  // Today's record for the current user
  const myTodayRecord = attendance.find(a => a.employee_id === myEmployeeId && a.date === today)
  const isClockedIn   = myTodayRecord && !myTodayRecord.clock_out

  // Clock-in form state (with work description + attachments)
  const [clockForm, setClockForm] = useState({ shift_type: 'Day', work_description: '', attachment_urls: [] })
  const [uploading,    setUploading]    = useState(false)
  const [clocking,     setClocking]     = useState(false)

  // Filters
  const [filterEmployee, setFilterEmployee] = useState('ALL')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')
  const [filterStatus,   setFilterStatus]   = useState('ALL')
  const [selectedRecords, setSelectedRecords] = useState([])
  const [rejectModal, setRejectModal] = useState({ open: false, recordId: null, reason: '' })

  // Manual entry modal (supervisors / HR only)
  const [manualModal, setManualModal] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [manualForm, setManualForm] = useState({
    employee_id: '', date: today, clock_in: '', clock_out: '',
    shift_type: 'Day', work_description: '', attachment_urls: [], notes: ''
  })

  // ── File upload helper ───────────────────────────────────────────
  const uploadFile = async (file, folder = 'attendance') => {
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${folder}/${Date.now()}_${safeFileName}`
    const { error } = await supabase.storage.from('hr-documents').upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(path)
    return publicUrl
  }

  const handleClockInAttachments = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(Array.from(files).map(f => uploadFile(f)))
      setClockForm(prev => ({ ...prev, attachment_urls: [...prev.attachment_urls, ...urls] }))
    } catch (err) { toast.error(`Upload failed: ${err.message}`) }
    finally { setUploading(false) }
  }

  const handleManualAttachments = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(Array.from(files).map(f => uploadFile(f)))
      setManualForm(prev => ({ ...prev, attachment_urls: [...prev.attachment_urls, ...urls] }))
    } catch (err) { toast.error(`Upload failed: ${err.message}`) }
    finally { setUploading(false) }
  }

  // ── Self clock-in ────────────────────────────────────────────────
  const handleSelfClockIn = async (e) => {
    e.preventDefault()
    if (!myEmployeeId) return toast.error('Your account is not linked to an employee record.')
    if (!clockForm.work_description?.trim()) return toast.error('Please describe what you will be working on today.')
    setClocking(true)
    try {
      await clockIn(myEmployeeId, today, clockForm.shift_type)
      // Also update with description + attachments
      const record = attendance.find(a => a.employee_id === myEmployeeId && a.date === today && !a.clock_out)
      if (record) {
        await supabase.from('employee_attendance')
          .update({ work_description: clockForm.work_description, attachment_urls: clockForm.attachment_urls })
          .eq('id', record.id)
      }
      toast.success('Clocked in successfully')
      setClockForm({ shift_type: 'Day', work_description: '', attachment_urls: [] })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setClocking(false) }
  }

  // ── Self clock-out ───────────────────────────────────────────────
  const handleSelfClockOut = async () => {
    if (!myEmployeeId) return
    setClocking(true)
    try {
      await clockOut(myEmployeeId, today)
      toast.success('Clocked out — your timesheet is pending approval.')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setClocking(false) }
  }

  // ── Filtered records ─────────────────────────────────────────────
  const filteredAttendance = attendance.filter(record => {
    if (!canApprove && record.employee_id !== myEmployeeId) return false
    if (filterEmployee !== 'ALL' && record.employee_id !== filterEmployee) return false
    if (filterDateFrom && record.date < filterDateFrom) return false
    if (filterDateTo   && record.date > filterDateTo)   return false
    if (filterStatus !== 'ALL' && record.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return  1
    return new Date(b.date) - new Date(a.date)
  })

  // KPIs
  const totalHours    = filteredAttendance.reduce((s, r) => s + (r.total_hours    || 0), 0)
  const totalOvertime = filteredAttendance.reduce((s, r) => s + (r.overtime_hours || 0), 0)
  const pendingCount  = attendance.filter(r => r.status === 'pending').length
  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || '—'

  // ── Approval handlers ────────────────────────────────────────────
  const handleApprove = async (recordId) => {
    try { await approveAttendance(recordId, user?.full_name || user?.username, canApprove); toast.success('Approved'); await fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Rejection reason required')
    try {
      await rejectAttendance(rejectModal.recordId, user?.full_name || user?.username, rejectModal.reason, canApprove)
      toast.success('Rejected')
      setRejectModal({ open: false, recordId: null, reason: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleBulkApprove = async () => {
    if (!selectedRecords.length) return toast.error('No records selected')
    try { await bulkApproveAttendance(selectedRecords, user?.full_name || user?.username, canApprove); toast.success(`${selectedRecords.length} records approved`); setSelectedRecords([]); await fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const toggleSelect = (id) => setSelectedRecords(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ── Manual entry (supervisors/HR only) ──────────────────────────
  const openManualModal = (record = null) => {
    if (record) {
      if (record.status === 'approved') { toast.error('Approved records cannot be edited'); return }
      setEditingRecord(record)
      setManualForm({ employee_id: record.employee_id, date: record.date, clock_in: record.clock_in, clock_out: record.clock_out || '', shift_type: record.shift_type || 'Day', work_description: record.work_description || '', attachment_urls: record.attachment_urls || [], notes: record.notes || '' })
    } else {
      setEditingRecord(null)
      setManualForm({ employee_id: '', date: today, clock_in: '', clock_out: '', shift_type: 'Day', work_description: '', attachment_urls: [], notes: '' })
    }
    setManualModal(true)
  }

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!manualForm.employee_id || !manualForm.date || !manualForm.clock_in) return toast.error('Employee, date, and clock-in time required')
    let totalH = 0, overtime = 0
    if (manualForm.clock_out) {
      const [inH, inM]   = manualForm.clock_in.split(':').map(Number)
      const [outH, outM] = manualForm.clock_out.split(':').map(Number)
      let mins = (outH * 60 + outM) - (inH * 60 + inM)
      if (mins < 0) mins += 24 * 60
      totalH   = mins / 60
      overtime = Math.max(0, totalH - 8)
    }
    const payload = { employee_id: manualForm.employee_id, date: manualForm.date, clock_in: manualForm.clock_in, clock_out: manualForm.clock_out || null, shift_type: manualForm.shift_type, work_description: manualForm.work_description, attachment_urls: manualForm.attachment_urls, total_hours: totalH || null, overtime_hours: overtime || null, notes: manualForm.notes, status: 'pending' }
    try {
      if (editingRecord) {
        await updateAttendanceRecord(editingRecord.id, payload, editingRecord.status)
        toast.success('Record updated')
      } else {
        await addAttendanceRecord(payload)
        toast.success('Record saved (pending approval)')
      }
      setManualModal(false); setEditingRecord(null); await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (record) => {
    if (record.status === 'approved') { toast.error('Approved records cannot be deleted'); return }
    if (!window.confirm(`Delete attendance for ${getEmployeeName(record.employee_id)} on ${record.date}?`)) return
    try { await deleteAttendanceRecord(record.id, record.status); toast.success('Deleted'); await fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const exportToExcel = () => {
    const data = filteredAttendance.map(r => ({
      Date: r.date, Employee: getEmployeeName(r.employee_id),
      'Clock In': r.clock_in, 'Clock Out': r.clock_out || '—',
      Shift: r.shift_type, Hours: r.total_hours?.toFixed(1) || '—',
      Overtime: r.overtime_hours?.toFixed(1) || '—', Status: r.status,
      'Work Description': r.work_description || '—', Notes: r.notes || '—',
      'Approved By': r.approved_by || '—',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    XLSX.writeFile(wb, `Attendance_${today}.xlsx`)
    toast.success('Exported')
  }

  const statusBadge = (s) => {
    const map = { pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red' }
    return <span className={`badge ${map[s] || 'badge-gold'}`}>{s}</span>
  }

  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Attendance</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canApprove && (
            <button className="btn btn-primary" onClick={() => openManualModal()}>
              <span className="material-icons">add</span> Manual Entry
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportToExcel}>
            <span className="material-icons">table_chart</span> Export
          </button>
        </div>
      </div>

      {/* ── MY TODAY STATUS ──────────────────────────────────────── */}
      {myEmployeeId && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>today</span>
            My Timesheet — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          {!myTodayRecord ? (
            /* Clock-in form */
            <form onSubmit={handleSelfClockIn}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Shift Type</label>
                  <select className="form-control" value={clockForm.shift_type}
                    onChange={e => setClockForm({ ...clockForm, shift_type: e.target.value })}>
                    <option>Day</option><option>Night</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>What are you working on today? *</label>
                <textarea className="form-control" rows="3" required
                  placeholder="Describe your planned tasks for today…"
                  value={clockForm.work_description}
                  onChange={e => setClockForm({ ...clockForm, work_description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Attachments (optional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>attach_file</span> Attach Files
                    <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xlsx"
                      disabled={uploading}
                      onChange={e => handleClockInAttachments(e.target.files)} />
                  </label>
                  {uploading && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Uploading…</span>}
                  {clockForm.attachment_urls.map((url, i) => (
                    <span key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>File {i + 1}</a>
                      <button type="button" onClick={() => setClockForm(prev => ({ ...prev, attachment_urls: prev.attachment_urls.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={clocking || uploading} style={{ marginTop: 4 }}>
                <span className="material-icons">login</span>
                {clocking ? 'Clocking in…' : 'Clock In'}
              </button>
            </form>
          ) : isClockedIn ? (
            /* Clock-out panel */
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: 'var(--green)' }}>check_circle</span>
                  Clocked in at <strong>{myTodayRecord.clock_in}</strong> · {myTodayRecord.shift_type} shift
                </div>
                {myTodayRecord.work_description && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    "{myTodayRecord.work_description}"
                  </div>
                )}
              </div>
              <button className="btn btn-danger" onClick={handleSelfClockOut} disabled={clocking}>
                <span className="material-icons">logout</span>
                {clocking ? 'Clocking out…' : 'Clock Out'}
              </button>
            </div>
          ) : (
            /* Completed */
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span className="badge badge-green" style={{ fontSize: 13 }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>
                Day Complete
              </span>
              <span style={{ fontSize: 13 }}>
                {myTodayRecord.clock_in} → {myTodayRecord.clock_out} ·
                <strong> {myTodayRecord.total_hours?.toFixed(1)}h</strong>
                {myTodayRecord.overtime_hours > 0 && ` (${myTodayRecord.overtime_hours?.toFixed(1)}h OT)`}
              </span>
              <span className={`badge ${myTodayRecord.status === 'approved' ? 'badge-green' : myTodayRecord.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                {myTodayRecord.status}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Hours</div><div className="kpi-val">{totalHours.toFixed(1)}</div><div className="kpi-sub">filtered</div></div>
        <div className="kpi-card"><div className="kpi-label">Overtime</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{totalOvertime.toFixed(1)}</div><div className="kpi-sub">filtered</div></div>
        <div className="kpi-card"><div className="kpi-label">Records</div><div className="kpi-val">{filteredAttendance.length}</div><div className="kpi-sub">filtered</div></div>
        {canApprove && <div className="kpi-card"><div className="kpi-label">Pending Approval</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{pendingCount}</div><div className="kpi-sub">awaiting review</div></div>}
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row">
          {canApprove && (
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14 }}>person</span> Employee</label>
              <select className="form-control" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                <option value="ALL">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">All</option><option value="pending">Pending</option>
              <option value="approved">Approved</option><option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setFilterEmployee('ALL'); setFilterDateFrom(''); setFilterDateTo(''); setFilterStatus('ALL') }}>
              <span className="material-icons">clear</span>
            </button>
            {canApprove && selectedRecords.length > 0 && (
              <button className="btn btn-primary" onClick={handleBulkApprove}>
                <span className="material-icons">done_all</span> Approve ({selectedRecords.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Records table ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Attendance Records</h3>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                {canApprove && <th style={{ width: 32 }}><input type="checkbox" onChange={e => setSelectedRecords(e.target.checked ? filteredAttendance.filter(r => r.status === 'pending').map(r => r.id) : [])} /></th>}
                <th>Date</th>
                {canApprove && <th>Employee</th>}
                <th>Clock In</th><th>Clock Out</th><th>Shift</th>
                <th>Hours</th><th>OT</th>
                <th>Work Description</th>
                <th>Status</th>
                {canApprove && <th>Approved By</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttendance.map(record => {
                const isPending  = record.status === 'pending'
                const isApproved = record.status === 'approved'
                const isSelected = selectedRecords.includes(record.id)
                return (
                  <tr key={record.id} style={{ background: isPending ? 'rgba(251,191,36,.04)' : 'transparent' }}>
                    {canApprove && (
                      <td style={{ textAlign: 'center' }}>
                        {isPending && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(record.id)} />}
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{record.date}</td>
                    {canApprove && <td><strong>{getEmployeeName(record.employee_id)}</strong></td>}
                    <td>{record.clock_in}</td>
                    <td>{record.clock_out || '—'}</td>
                    <td><span className="badge badge-blue">{record.shift_type}</span></td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{record.total_hours?.toFixed(1) || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: record.overtime_hours > 0 ? 'var(--yellow)' : 'inherit' }}>{record.overtime_hours?.toFixed(1) || '—'}</td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {record.work_description || '—'}
                      </div>
                      {Array.isArray(record.attachment_urls) && record.attachment_urls.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {record.attachment_urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: 10 }}>
                              <span className="material-icons" style={{ fontSize: 11 }}>attach_file</span> {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{statusBadge(record.status)}</td>
                    {canApprove && (
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {record.approved_by || '—'}
                        {record.approved_at && <div style={{ fontSize: 10 }}>{new Date(record.approved_at).toLocaleDateString()}</div>}
                        {record.rejection_reason && <div style={{ color: 'var(--red)', fontSize: 10 }}>{record.rejection_reason}</div>}
                      </td>
                    )}
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {isPending && canApprove && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => handleApprove(record.id)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>check</span>
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ open: true, recordId: record.id, reason: '' })}>
                            <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                          </button>
                        </>
                      )}
                      {!isApproved && canApprove && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openManualModal(record)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {!isApproved && canApprove && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(record)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                      {isApproved && <span className="badge badge-green" style={{ fontSize: 10 }}>Locked</span>}
                    </td>
                  </tr>
                )
              })}
              {filteredAttendance.length === 0 && (
                <tr><td colSpan={canApprove ? 12 : 9} className="empty-state">No attendance records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Reject modal ─────────────────────────────────────────── */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, recordId: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject <span>Attendance Record</span></div>
            <div className="form-group">
              <label>Reason *</label>
              <textarea className="form-control" rows="3" value={rejectModal.reason}
                onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="Explain why this attendance record is being rejected…" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, recordId: null, reason: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual entry modal (supervisors / HR only) ──────────── */}
      {manualModal && canApprove && (
        <div className="overlay" onClick={() => { setManualModal(false); setEditingRecord(null) }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingRecord ? 'Edit Attendance' : 'Manual Attendance Entry'}</div>
            {editingRecord?.status === 'rejected' && (
              <div className="info-box" style={{ marginBottom: 16, background: 'rgba(251,191,36,.1)', borderColor: 'var(--yellow)' }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle' }}>info</span>
                {' '}Editing a rejected record will reset it to <strong>Pending</strong>.
              </div>
            )}
            <form onSubmit={handleManualSubmit}>
              <div className="form-group">
                <label>Employee *</label>
                <select className="form-control" required value={manualForm.employee_id}
                  onChange={e => setManualForm({ ...manualForm, employee_id: e.target.value })}>
                  <option value="">Select Employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} /></div>
                <div className="form-group"><label>Shift</label><select className="form-control" value={manualForm.shift_type} onChange={e => setManualForm({ ...manualForm, shift_type: e.target.value })}><option>Day</option><option>Night</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Clock In *</label><input type="time" className="form-control" required value={manualForm.clock_in} onChange={e => setManualForm({ ...manualForm, clock_in: e.target.value })} /></div>
                <div className="form-group"><label>Clock Out</label><input type="time" className="form-control" value={manualForm.clock_out} onChange={e => setManualForm({ ...manualForm, clock_out: e.target.value })} /></div>
              </div>
              <div className="form-group">
                <label>Work Description *</label>
                <textarea className="form-control" rows="3" required value={manualForm.work_description}
                  onChange={e => setManualForm({ ...manualForm, work_description: e.target.value })}
                  placeholder="What work was carried out?" />
              </div>
              <div className="form-group">
                <label>Attachments</label>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 8 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>attach_file</span> Attach Files
                  <input type="file" hidden multiple accept="image/*,application/pdf,.doc,.docx"
                    disabled={uploading} onChange={e => handleManualAttachments(e.target.files)} />
                </label>
                {uploading && <span style={{ fontSize: 12, marginLeft: 8 }}>Uploading…</span>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {manualForm.attachment_urls.map((url, i) => (
                    <span key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>File {i + 1}</a>
                      <button type="button" onClick={() => setManualForm(prev => ({ ...prev, attachment_urls: prev.attachment_urls.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={manualForm.notes} onChange={e => setManualForm({ ...manualForm, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setManualModal(false); setEditingRecord(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingRecord ? 'Save Changes' : 'Save (Pending)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
