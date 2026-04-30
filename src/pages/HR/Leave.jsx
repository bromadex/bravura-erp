// src/pages/HR/Leave.jsx
//
// BUG FIX — Supervisor approval list never appeared:
//
// Root cause 1 (stale closure):
//   fetchPendingSupervisor() closed over `approverEmployeeId`. On mount
//   that value was still null, so `if (!approverEmployeeId) return` fired
//   immediately and the function exited. By the time the ID resolved via
//   the async useEffect, the fetch was never retried.
//
// Root cause 2 (separate effect timing):
//   A second useEffect was supposed to re-run the fetch when approverEmployeeId
//   changed — but because fetchPendingSupervisor was a plain inline function
//   (not useCallback), React couldn't reliably track it as a dep and the
//   effect fired inconsistently.
//
// Fix:
//   1. Wrap both fetch functions in useCallback.
//   2. Pass the resolved employee ID as a parameter so there is no
//      closed-over state dependency at all.
//   3. Call both fetches at the END of the same useEffect that resolves
//      the employee ID — guaranteed to run with the correct ID in hand.
//   4. A separate refresh effect still runs when leaveRequests changes
//      (after approvals / new submissions), using approverEmployeeId from
//      state (which is set by that point).
//   5. Added `isSupervisor` flag so the Pending Approvals column always
//      renders for HODs — shows "no pending" empty state instead of
//      disappearing entirely when the list is temporarily empty.
//
// Also fixed in this file:
//   - btn-green / btn-red → btn-primary / btn-danger  (those classes don't exist)
//   - Status badges use badge-yellow/blue/green/red/purple  (not bg-*)
//   - Edit button restricted to draft only

import { useState, useEffect, useCallback } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { getWorkingDays, formatDate } from '../../utils/dateUtils'
import { useCanApprove } from '../../hooks/usePermission'

export default function Leave() {
  const { user } = useAuth()
  const {
    employees,
    leaveTypes,
    leaveBalances,
    leaveRequests,
    getEmployeeLeaveBalance,
    hasDateConflict,
    createLeaveRequest,
    updateLeaveRequest,
    deleteLeaveRequest,
    approveLeaveRequest,
    rejectLeaveRequest,
    addLeaveComment,
    fetchAll
  } = useHR()

  const canApproveHR = useCanApprove('hr', 'leave')

  // ── Employee ID state ───────────────────────────────────────
  const [currentEmployeeId,  setCurrentEmployeeId]  = useState(null)
  const [approverEmployeeId, setApproverEmployeeId] = useState(null)
  const [loadingEmployee,    setLoadingEmployee]    = useState(true)

  // ── Form state ──────────────────────────────────────────────
  const [form, setForm] = useState({
    employee_id:    '',
    leave_type_id:  '',
    start_date:     formatDate(new Date()),
    end_date:       formatDate(new Date()),
    is_half_day:    false,
    half_day_type:  'morning',
    reason:         '',
    attachment_url: '',
    status:         'draft'
  })
  const [draftId,        setDraftId]        = useState(null)
  const [calculatedDays, setCalculatedDays] = useState(0)
  const [balance,        setBalance]        = useState({ total: 0, used: 0, remaining: 0 })
  const [uploading,      setUploading]      = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [myRequests,     setMyRequests]     = useState([])

  // ── Approval state ──────────────────────────────────────────
  const [pendingSupervisor, setPendingSupervisor] = useState([])
  const [pendingHR,         setPendingHR]         = useState([])
  const [isSupervisor,      setIsSupervisor]      = useState(false)
  const [rejectModal,  setRejectModal]  = useState({ open: false, requestId: null, reason: '' })
  const [commentModal, setCommentModal] = useState({ open: false, requestId: null, comment: '' })

  // ── ✅ FIX: fetch functions wrapped in useCallback ──────────
  // empId is passed as a parameter — no stale-closure risk.

  const fetchPendingSupervisor = useCallback(async (empId) => {
    if (!empId) return
    try {
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('hod_id', empId)
        .maybeSingle()

      if (!dept) {
        setIsSupervisor(false)
        setPendingSupervisor([])
        return
      }

      setIsSupervisor(true)

      const { data: deptEmps } = await supabase
        .from('employees')
        .select('id')
        .eq('department_id', dept.id)

      if (!deptEmps?.length) {
        setPendingSupervisor([])
        return
      }

      const { data: pending } = await supabase
        .from('leave_requests')
        .select('*, leave_types(name), employees(name)')
        .in('employee_id', deptEmps.map(e => e.id))
        .eq('status', 'pending_supervisor')
        .order('created_at', { ascending: false })

      setPendingSupervisor(pending || [])
    } catch (err) {
      console.error('fetchPendingSupervisor:', err)
      setPendingSupervisor([])
    }
  }, [])

  const fetchPendingHR = useCallback(async () => {
    if (!canApproveHR) return
    try {
      const { data } = await supabase
        .from('leave_requests')
        .select('*, leave_types(name), employees(name)')
        .eq('status', 'pending_hr')
        .order('created_at', { ascending: false })
      setPendingHR(data || [])
    } catch (err) {
      console.error('fetchPendingHR:', err)
      setPendingHR([])
    }
  }, [canApproveHR])

  // ── ✅ FIX: single useEffect resolves ID then immediately fetches ──
  useEffect(() => {
    const resolveAndFetch = async () => {
      setLoadingEmployee(true)
      try {
        let empId = null

        if (user?.employee_id) {
          empId = user.employee_id
        } else if (user?.id) {
          const { data, error } = await supabase
            .from('app_users')
            .select('employee_id')
            .eq('id', user.id)
            .single()
          if (!error && data?.employee_id) {
            empId = data.employee_id
          } else {
            toast.error('Your account is not linked to an employee record.')
          }
        }

        if (empId) {
          setCurrentEmployeeId(empId)
          setApproverEmployeeId(empId)
          setForm(prev => ({ ...prev, employee_id: empId }))

          // Pass empId directly — not via state (which wouldn't be set yet)
          await fetchPendingSupervisor(empId)
          await fetchPendingHR()
        }
      } catch (err) {
        console.error('resolveAndFetch:', err)
      } finally {
        setLoadingEmployee(false)
      }
    }
    resolveAndFetch()
  }, [user, fetchPendingSupervisor, fetchPendingHR])

  // ── Refresh after any leave request change ──────────────────
  useEffect(() => {
    if (approverEmployeeId) fetchPendingSupervisor(approverEmployeeId)
    if (canApproveHR)       fetchPendingHR()
  }, [leaveRequests, approverEmployeeId, canApproveHR, fetchPendingSupervisor, fetchPendingHR])

  // ── Balance display ─────────────────────────────────────────
  useEffect(() => {
    if (currentEmployeeId && form.leave_type_id) {
      setBalance(getEmployeeLeaveBalance(currentEmployeeId, form.leave_type_id))
    }
  }, [currentEmployeeId, form.leave_type_id, leaveBalances])

  // ── Days calculation ────────────────────────────────────────
  useEffect(() => {
    if (form.start_date && form.end_date) {
      let days = getWorkingDays(form.start_date, form.end_date)
      if (form.is_half_day) days = 0.5
      setCalculatedDays(days)
    }
  }, [form.start_date, form.end_date, form.is_half_day])

  // ── My requests ─────────────────────────────────────────────
  useEffect(() => {
    if (currentEmployeeId) {
      setMyRequests(leaveRequests.filter(r => r.employee_id === currentEmployeeId))
    }
  }, [leaveRequests, currentEmployeeId])

  const selectedLeaveType  = leaveTypes.find(lt => lt.id === form.leave_type_id)
  const requiresAttachment = selectedLeaveType?.requires_attachment === true

  // ── File upload ─────────────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `leave_attachments/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${fileExt}`
      const { error } = await supabase.storage.from('hr-documents').upload(fileName, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(fileName)
      setForm(prev => ({ ...prev, attachment_url: publicUrl }))
      toast.success('Document uploaded')
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  // ── Save draft ──────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!currentEmployeeId) return toast.error('Employee ID not found.')
    if (!form.leave_type_id || !form.start_date || !form.end_date)
      return toast.error('Leave type, start date, and end date are required')
    if (requiresAttachment && !form.attachment_url)
      return toast.error('This leave type requires an attachment')
    setSubmitting(true)
    try {
      const data = { employee_id: currentEmployeeId, leave_type_id: form.leave_type_id, start_date: form.start_date, end_date: form.end_date, days_requested: calculatedDays, is_half_day: form.is_half_day, half_day_type: form.is_half_day ? form.half_day_type : null, reason: form.reason, attachment_url: form.attachment_url, status: 'draft' }
      if (draftId) {
        await updateLeaveRequest(draftId, data)
        toast.success('Draft updated')
      } else {
        const newId = await createLeaveRequest(data)
        setDraftId(newId)
        toast.success('Draft saved')
      }
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Submit for approval ─────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentEmployeeId)    return toast.error('Employee ID not found')
    if (!form.leave_type_id)   return toast.error('Select leave type')
    if (!form.start_date || !form.end_date) return toast.error('Select dates')
    if (calculatedDays <= 0)   return toast.error('Invalid leave duration')
    if (balance.remaining < calculatedDays)
      return toast.error(`Insufficient balance. Available: ${balance.remaining} days`)
    if (hasDateConflict(currentEmployeeId, form.start_date, form.end_date, draftId))
      return toast.error('Dates overlap an existing request')
    if (requiresAttachment && !form.attachment_url)
      return toast.error('This leave type requires an attachment')
    if (new Date(form.start_date) < new Date()) {
      if (!window.confirm('This leave starts in the past. Continue?')) return
    }
    setSubmitting(true)
    try {
      const data = { employee_id: currentEmployeeId, leave_type_id: form.leave_type_id, start_date: form.start_date, end_date: form.end_date, days_requested: calculatedDays, is_half_day: form.is_half_day, half_day_type: form.is_half_day ? form.half_day_type : null, reason: form.reason, attachment_url: form.attachment_url, status: 'pending_supervisor' }
      if (draftId) { await updateLeaveRequest(draftId, data) } else { await createLeaveRequest(data) }
      toast.success('Leave request submitted for approval')
      setForm({ employee_id: currentEmployeeId, leave_type_id: '', start_date: formatDate(new Date()), end_date: formatDate(new Date()), is_half_day: false, half_day_type: 'morning', reason: '', attachment_url: '', status: 'draft' })
      setDraftId(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Cancel / delete ─────────────────────────────────────────
  const handleCancelRequest = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return
    try { await updateLeaveRequest(id, { status: 'cancelled' }); toast.success('Cancelled'); await fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const handleDeleteDraft = async (id) => {
    if (!window.confirm('Delete this draft permanently?')) return
    try {
      await deleteLeaveRequest(id)
      if (draftId === id) setDraftId(null)
      toast.success('Deleted')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const editDraft = (req) => {
    if (req.status !== 'draft') { toast.error('Only drafts can be edited.'); return }
    setForm({ employee_id: req.employee_id, leave_type_id: req.leave_type_id, start_date: req.start_date, end_date: req.end_date, is_half_day: req.is_half_day || false, half_day_type: req.half_day_type || 'morning', reason: req.reason || '', attachment_url: req.attachment_url || '', status: 'draft' })
    setDraftId(req.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Approval actions ────────────────────────────────────────
  const handleApprove = async (requestId, role) => {
    try {
      await approveLeaveRequest(requestId, approverEmployeeId, user?.full_name || user?.username, null)
      toast.success(role === 'supervisor' ? 'Forwarded to HR for final approval' : 'Leave approved')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Rejection reason required')
    try {
      await rejectLeaveRequest(rejectModal.requestId, approverEmployeeId, user?.full_name || user?.username, rejectModal.reason)
      toast.success('Request rejected')
      setRejectModal({ open: false, requestId: null, reason: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const submitComment = async () => {
    if (!commentModal.comment.trim()) return toast.error('Comment cannot be empty')
    try {
      const isSupv = pendingSupervisor.some(r => r.id === commentModal.requestId)
      await addLeaveComment(commentModal.requestId, approverEmployeeId, user?.full_name || user?.username, commentModal.comment, isSupv ? 'supervisor' : 'HR')
      toast.success('Comment added')
      setCommentModal({ open: false, requestId: null, comment: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const getLeaveTypeName = (id) => leaveTypes.find(lt => lt.id === id)?.name || '—'

  const statusBadge = (s) => ({ draft: 'badge-yellow', pending_supervisor: 'badge-blue', pending_hr: 'badge-blue', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-purple' }[s] || 'badge-gold')

  // ── Approval card ───────────────────────────────────────────
  const ApprovalCard = ({ request, role, onApprove, onReject, onComment }) => {
    const emp = employees.find(e => e.id === request.employee_id)
    return (
      <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{emp?.name || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              {getLeaveTypeName(request.leave_type_id)} · {request.start_date} → {request.end_date}
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>
              <strong style={{ color: 'var(--gold)' }}>{request.days_requested} day{request.days_requested !== 1 ? 's' : ''}</strong>
            </div>
          </div>
          <span className={`badge ${role === 'supervisor' ? 'badge-blue' : 'badge-purple'}`}>
            {role === 'supervisor' ? 'Supervisor' : 'HR'}
          </span>
        </div>
        {request.reason && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, fontStyle: 'italic' }}>
            "{request.reason}"
          </div>
        )}
        {Array.isArray(request.approver_comments) && request.approver_comments.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {request.approver_comments.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
                <strong>{c.by}</strong> ({c.role}) — {c.action}: {c.comment}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={onApprove}>
            <span className="material-icons" style={{ fontSize: 14 }}>check</span> Approve
          </button>
          <button className="btn btn-danger btn-sm" onClick={onReject}>
            <span className="material-icons" style={{ fontSize: 14 }}>close</span> Reject
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onComment}>
            <span className="material-icons" style={{ fontSize: 14 }}>comment</span> Comment
          </button>
        </div>
      </div>
    )
  }

  // ── Loading / unlinked guards ────────────────────────────────
  if (loadingEmployee) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
  }
  if (!currentEmployeeId) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.4, display: 'block', marginBottom: 12 }}>error_outline</span>
        <p>Your account is not linked to an employee record. Please contact HR.</p>
      </div>
    )
  }

  const showApprovalColumn = isSupervisor || canApproveHR

  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Management</h1>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Column 1: New Request Form ───────────────────── */}
        <div className="card" style={{ flex: 2, minWidth: 300, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
            {draftId ? 'Edit Draft' : 'New Leave Request'}
          </h2>

          <div className="form-group">
            <label>Leave Type *</label>
            <select className="form-control" value={form.leave_type_id}
              onChange={e => setForm({ ...form, leave_type_id: e.target.value })}>
              <option value="">Select leave type</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>

          {form.leave_type_id && (
            <div style={{ marginBottom: 16, background: 'var(--surface2)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Balance for {selectedLeaveType?.name}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                <span><strong>Total:</strong> {balance.total}</span>
                <span><strong>Used:</strong> {balance.used}</span>
                <span><strong>Remaining:</strong>{' '}
                  <strong style={{ color: balance.remaining < calculatedDays ? 'var(--red)' : 'var(--green)' }}>
                    {balance.remaining}
                  </strong>
                </span>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" className="form-control" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>End Date *</label>
              <input type="date" className="form-control" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.is_half_day}
                onChange={e => setForm({ ...form, is_half_day: e.target.checked })} />
              <span>Half day request</span>
            </label>
            {form.is_half_day && (
              <select className="form-control" style={{ marginTop: 8 }} value={form.half_day_type}
                onChange={e => setForm({ ...form, half_day_type: e.target.value })}>
                <option value="morning">Morning (0.5 day)</option>
                <option value="afternoon">Afternoon (0.5 day)</option>
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Days Requested</label>
            <div className="form-control" style={{ background: 'var(--surface2)', cursor: 'default' }}>
              {calculatedDays} day{calculatedDays !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="form-group">
            <label>Reason (Optional)</label>
            <textarea className="form-control" rows="3" value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Provide additional information" />
          </div>

          {requiresAttachment && (
            <div className="form-group">
              <label>Supporting Document *</label>
              <input type="file" className="form-control" accept="image/*,application/pdf"
                onChange={e => handleFileUpload(e.target.files[0])} disabled={uploading} />
              {uploading && <span style={{ fontSize: 12 }}>Uploading…</span>}
              {form.attachment_url && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <a href={form.attachment_url} target="_blank" rel="noopener noreferrer">View file</a>
                  <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 8 }}
                    onClick={() => setForm({ ...form, attachment_url: '' })}>Remove</button>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary"
              onClick={handleSaveDraft} disabled={submitting}>
              <span className="material-icons" style={{ fontSize: 14 }}>save</span> Save Draft
            </button>
            <button type="button" className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || (requiresAttachment && !form.attachment_url)}>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </div>

        {/* ── Column 2: My Leave Requests ──────────────────── */}
        <div className="card" style={{ flex: 1.5, minWidth: 280, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>My Leave Requests</h2>
          {myRequests.length === 0 ? (
            <div className="empty-state">
              <span className="material-icons" style={{ fontSize: 32, opacity: 0.4 }}>event_note</span>
              <span>No leave requests yet</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myRequests.map(req => (
                <div key={req.id} style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{getLeaveTypeName(req.leave_type_id)}</div>
                      <div style={{ fontSize: 12 }}>{req.start_date} → {req.end_date} ({req.days_requested} days)</div>
                      <span className={`badge ${statusBadge(req.status)}`} style={{ marginTop: 6 }}>
                        {req.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {req.status === 'draft' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => editDraft(req)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDraft(req.id)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </>
                      )}
                      {['pending_supervisor', 'pending_hr', 'approved'].includes(req.status) && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancelRequest(req.id)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {req.reason && (
                    <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-dim)' }}>{req.reason}</div>
                  )}
                  {req.attachment_url && (
                    <a href={req.attachment_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <span className="material-icons" style={{ fontSize: 12 }}>attachment</span> Attachment
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Column 3: Pending Approvals ──────────────────── */}
        {/* Always renders for supervisors/HR — empty state instead of vanishing */}
        {showApprovalColumn && (
          <div className="card" style={{ flex: 1.5, minWidth: 280, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              <span className="material-icons" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>approval</span>
              Pending Approvals
            </h2>
            {pendingSupervisor.length === 0 && pendingHR.length === 0 ? (
              <div className="empty-state">
                <span className="material-icons" style={{ fontSize: 32, opacity: 0.4 }}>check_circle</span>
                <span>No requests pending your approval</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingSupervisor.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      Supervisor Review
                    </div>
                    {pendingSupervisor.map(req => (
                      <ApprovalCard key={req.id} request={req} role="supervisor"
                        onApprove={() => handleApprove(req.id, 'supervisor')}
                        onReject={() => setRejectModal({ open: true, requestId: req.id, reason: '' })}
                        onComment={() => setCommentModal({ open: true, requestId: req.id, comment: '' })}
                      />
                    ))}
                  </>
                )}
                {pendingHR.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginTop: pendingSupervisor.length ? 12 : 0 }}>
                      HR Review
                    </div>
                    {pendingHR.map(req => (
                      <ApprovalCard key={req.id} request={req} role="HR"
                        onApprove={() => handleApprove(req.id, 'hr')}
                        onReject={() => setRejectModal({ open: true, requestId: req.id, reason: '' })}
                        onComment={() => setCommentModal({ open: true, requestId: req.id, comment: '' })}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reject modal ──────────────────────────────────────── */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject <span>Leave Request</span></div>
            <div className="form-group">
              <label>Reason for Rejection *</label>
              <textarea className="form-control" rows="3" value={rejectModal.reason}
                onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="Explain why this request is being rejected…" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary"
                onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Comment modal ─────────────────────────────────────── */}
      {commentModal.open && (
        <div className="overlay" onClick={() => setCommentModal({ open: false, requestId: null, comment: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add <span>Comment</span></div>
            <div className="form-group">
              <label>Comment *</label>
              <textarea className="form-control" rows="3" value={commentModal.comment}
                onChange={e => setCommentModal({ ...commentModal, comment: e.target.value })}
                placeholder="Add your comment…" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary"
                onClick={() => setCommentModal({ open: false, requestId: null, comment: '' })}>Cancel</button>
              <button className="btn btn-primary" onClick={submitComment}>Add Comment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
