// src/pages/HR/Leave.jsx
import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { getWorkingDays, formatDate } from '../../utils/dateUtils'

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
    fetchAll
  } = useHR()

  const [currentEmployeeId, setCurrentEmployeeId] = useState(null)
  const [loadingEmployee, setLoadingEmployee] = useState(true)

  // Form state
  const [form, setForm] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: formatDate(new Date()),
    end_date: formatDate(new Date()),
    is_half_day: false,
    half_day_type: 'morning',
    reason: '',
    attachment_url: '',
    status: 'draft'
  })

  const [draftId, setDraftId] = useState(null)
  const [calculatedDays, setCalculatedDays] = useState(0)
  const [balance, setBalance] = useState({ total: 0, used: 0, remaining: 0 })
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [myRequests, setMyRequests] = useState([])

  // ✅ Resolve employee ID from logged-in user
  useEffect(() => {
    const resolveEmployeeId = async () => {
      setLoadingEmployee(true)
      try {
        if (user?.employee_id) {
          setCurrentEmployeeId(user.employee_id)
          setForm(prev => ({ ...prev, employee_id: user.employee_id }))
        } else if (user?.id) {
          const { data, error } = await supabase
            .from('app_users')
            .select('employee_id')
            .eq('id', user.id)
            .single()
          if (!error && data?.employee_id) {
            setCurrentEmployeeId(data.employee_id)
            setForm(prev => ({ ...prev, employee_id: data.employee_id }))
          } else {
            toast.error('Your user account is not linked to an employee record. Please contact HR.')
          }
        } else {
          toast.error('User not authenticated')
        }
      } catch (err) {
        console.error('Error resolving employee ID:', err)
      } finally {
        setLoadingEmployee(false)
      }
    }
    resolveEmployeeId()
  }, [user])

  // Fetch employee's leave balance when leave type changes
  useEffect(() => {
    if (currentEmployeeId && form.leave_type_id) {
      const bal = getEmployeeLeaveBalance(currentEmployeeId, form.leave_type_id)
      setBalance(bal)
    }
  }, [currentEmployeeId, form.leave_type_id, leaveBalances])

  // Calculate working days when dates change
  useEffect(() => {
    if (form.start_date && form.end_date) {
      let days = getWorkingDays(form.start_date, form.end_date)
      if (form.is_half_day) days = 0.5
      setCalculatedDays(days)
    }
  }, [form.start_date, form.end_date, form.is_half_day])

  // Load employee's own requests
  useEffect(() => {
    if (currentEmployeeId) {
      const myReqs = leaveRequests.filter(r => r.employee_id === currentEmployeeId)
      setMyRequests(myReqs)
    }
  }, [leaveRequests, currentEmployeeId])

  const selectedLeaveType = leaveTypes.find(lt => lt.id === form.leave_type_id)
  const requiresAttachment = selectedLeaveType?.requires_attachment === true

  const handleFileUpload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `leave_attachments/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('hr-documents')
        .upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage
        .from('hr-documents')
        .getPublicUrl(fileName)
      setForm({ ...form, attachment_url: publicUrl })
      toast.success('Document uploaded')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!currentEmployeeId) {
      toast.error('Employee ID not found. Please log out and log in again.')
      return
    }
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Please fill required fields: leave type, start date, end date')
      return
    }
    if (requiresAttachment && !form.attachment_url) {
      toast.error('This leave type requires an attachment')
      return
    }
    setSubmitting(true)
    try {
      const requestData = {
        employee_id: currentEmployeeId,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: calculatedDays,
        is_half_day: form.is_half_day,
        half_day_type: form.is_half_day ? form.half_day_type : null,
        reason: form.reason,
        attachment_url: form.attachment_url,
        status: 'draft'
      }
      if (draftId) {
        await updateLeaveRequest(draftId, requestData)
        toast.success('Draft updated')
      } else {
        const newId = await createLeaveRequest(requestData)
        setDraftId(newId)
        toast.success('Draft saved')
      }
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!currentEmployeeId) {
      toast.error('Employee ID not found. Please log out and log in again.')
      return
    }
    if (!form.leave_type_id) {
      toast.error('Select leave type')
      return
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Select start and end dates')
      return
    }
    if (calculatedDays <= 0) {
      toast.error('Invalid leave duration')
      return
    }
    if (balance.remaining < calculatedDays) {
      toast.error(`Insufficient balance. Available: ${balance.remaining} days`)
      return
    }
    if (hasDateConflict(currentEmployeeId, form.start_date, form.end_date, draftId)) {
      toast.error('You have another leave request overlapping these dates')
      return
    }
    if (requiresAttachment && !form.attachment_url) {
      toast.error('This leave type requires an attached document')
      return
    }

    const today = new Date()
    const start = new Date(form.start_date)
    if (start < today) {
      if (!window.confirm('This leave starts in the past. Are you sure you want to submit?')) return
    }

    setSubmitting(true)
    try {
      const requestData = {
        employee_id: currentEmployeeId,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: calculatedDays,
        is_half_day: form.is_half_day,
        half_day_type: form.is_half_day ? form.half_day_type : null,
        reason: form.reason,
        attachment_url: form.attachment_url,
        status: 'pending_supervisor'
      }
      if (draftId) {
        await updateLeaveRequest(draftId, requestData)
      } else {
        await createLeaveRequest(requestData)
      }
      toast.success('Leave request submitted for approval')
      setForm({
        employee_id: currentEmployeeId,
        leave_type_id: '',
        start_date: formatDate(new Date()),
        end_date: formatDate(new Date()),
        is_half_day: false,
        half_day_type: 'morning',
        reason: '',
        attachment_url: '',
        status: 'draft'
      })
      setDraftId(null)
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async (requestId) => {
    if (window.confirm('Cancel this leave request?')) {
      try {
        await updateLeaveRequest(requestId, { status: 'cancelled' })
        toast.success('Request cancelled')
        await fetchAll()
      } catch (err) {
        toast.error(err.message)
      }
    }
  }

  const handleDeleteDraft = async (requestId) => {
    if (window.confirm('Delete this draft permanently?')) {
      try {
        await deleteLeaveRequest(requestId)
        if (draftId === requestId) setDraftId(null)
        toast.success('Draft deleted')
        await fetchAll()
      } catch (err) {
        toast.error(err.message)
      }
    }
  }

  const editDraft = (request) => {
    setForm({
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      start_date: request.start_date,
      end_date: request.end_date,
      is_half_day: request.is_half_day || false,
      half_day_type: request.half_day_type || 'morning',
      reason: request.reason || '',
      attachment_url: request.attachment_url || '',
      status: 'draft'
    })
    setDraftId(request.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const getLeaveTypeName = (id) => leaveTypes.find(lt => lt.id === id)?.name || '—'

  if (loadingEmployee) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading your employee record...</div>
  }

  if (!currentEmployeeId) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>error</span>
        <p>Your user account is not linked to an employee record. Please contact HR.</p>
      </div>
    )
  }

  return (
    <div className="leave-module">
      <div className="page-header">
        <h1 className="page-title">Leave Management</h1>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* New Request Form */}
        <div className="card" style={{ flex: 2, minWidth: 300, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{draftId ? 'Edit Draft' : 'New Leave Request'}</h2>
          
          <div className="form-group">
            <label>Leave Type *</label>
            <select
              className="form-control"
              value={form.leave_type_id}
              onChange={e => setForm({ ...form, leave_type_id: e.target.value })}
            >
              <option value="">Select leave type</option>
              {leaveTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>

          {form.leave_type_id && (
            <div className="info-box" style={{ marginBottom: 16, background: 'var(--surface2)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Your balance for {selectedLeaveType?.name}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                <span><strong>Total:</strong> {balance.total}</span>
                <span><strong>Used:</strong> {balance.used}</span>
                <span><strong>Remaining:</strong> <strong style={{ color: balance.remaining < calculatedDays ? 'var(--red)' : 'var(--green)' }}>{balance.remaining}</strong></span>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" className="form-control" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>End Date *</label>
              <input type="date" className="form-control" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.is_half_day} onChange={e => setForm({ ...form, is_half_day: e.target.checked })} />
              <span>Half day request</span>
            </label>
            {form.is_half_day && (
              <select className="form-control" style={{ marginTop: 8 }} value={form.half_day_type} onChange={e => setForm({ ...form, half_day_type: e.target.value })}>
                <option value="morning">Morning (0.5 day)</option>
                <option value="afternoon">Afternoon (0.5 day)</option>
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Days Requested</label>
            <div className="form-control" disabled style={{ background: 'var(--surface2)' }}>
              {calculatedDays} day{calculatedDays !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="form-group">
            <label>Reason (Optional)</label>
            <textarea className="form-control" rows="3" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Provide additional information" />
          </div>

          {requiresAttachment && (
            <div className="form-group">
              <label>Supporting Document *</label>
              <input type="file" className="form-control" accept="image/*,application/pdf" onChange={e => handleFileUpload(e.target.files[0])} disabled={uploading} />
              {uploading && <span style={{ fontSize: 12 }}>Uploading...</span>}
              {form.attachment_url && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <a href={form.attachment_url} target="_blank" rel="noopener noreferrer">View uploaded file</a>
                  <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => setForm({ ...form, attachment_url: '' })}>Remove</button>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} disabled={submitting}>Save Draft</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || (requiresAttachment && !form.attachment_url)}>
              {submitting ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </div>

        {/* My Leave Requests */}
        <div className="card" style={{ flex: 1.5, minWidth: 300, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>My Leave Requests</h2>
          {myRequests.length === 0 ? (
            <div className="empty-state">No leave requests yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myRequests.map(req => {
                const leaveType = getLeaveTypeName(req.leave_type_id)
                const statusColors = {
                  draft: 'bg-yellow',
                  pending_supervisor: 'bg-blue',
                  pending_hr: 'bg-blue',
                  approved: 'bg-green',
                  rejected: 'bg-red',
                  cancelled: 'bg-gray'
                }
                return (
                  <div key={req.id} style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{leaveType}</div>
                        <div style={{ fontSize: 12 }}>{req.start_date} → {req.end_date} ({req.days_requested} days)</div>
                        <div className="badge" style={{ marginTop: 4 }}><span className={statusColors[req.status] || 'bg-gray'}>{req.status.replace('_', ' ')}</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(req.status === 'draft' || req.status === 'pending_supervisor' || req.status === 'pending_hr') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => editDraft(req)}>Edit</button>
                        )}
                        {req.status === 'draft' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDraft(req.id)}>Delete</button>
                        )}
                        {['pending_supervisor', 'pending_hr', 'approved'].includes(req.status) && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleCancelRequest(req.id)}>Cancel</button>
                        )}
                      </div>
                    </div>
                    {req.reason && <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-dim)' }}>Reason: {req.reason}</div>}
                    {req.attachment_url && (
                      <div style={{ marginTop: 4 }}>
                        <a href={req.attachment_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>📎 Attachment</a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
