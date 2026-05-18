// src/pages/HR/CompensatoryLeave.jsx
// Compensatory leave requests — work on holiday earns leave days.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState, SectionCard,
  TabNav, ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import { createLedgerEntry } from '../../engine/leaveEngine'
import { pushNotificationToRole } from '../../engine/notificationEngine'

const today = new Date().toISOString().split('T')[0]
const thisMonth = new Date().toISOString().slice(0, 7)

function diffDays(from, to) {
  if (!from || !to) return 0
  const a = new Date(from)
  const b = new Date(to)
  return Math.max(0, Math.round((b - a) / 86400000) + 1)
}

export default function CompensatoryLeave() {
  const { user } = useAuth()
  const { employees, leaveTypes } = useHR()
  const canApprove = useCanApprove('hr', 'leave')

  // ── Current user's employee_id ────────────────────────────────
  const [employeeId, setEmployeeId] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // ── Data ─────────────────────────────────────────────────────
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [activeTab, setActiveTab] = useState('mine')

  // KPIs
  const [kpiPending,   setKpiPending]   = useState(0)
  const [kpiApprovedM, setKpiApprovedM] = useState(0)
  const [kpiDaysYear,  setKpiDaysYear]  = useState(0)

  // ── Compensatory leave types ──────────────────────────────────
  const compLeaveTypes = leaveTypes.filter(lt => lt.is_compensatory)

  // ── Modal: new request ────────────────────────────────────────
  const [reqModal, setReqModal] = useState({
    open: false,
    saving: false,
    form: {
      employee_id: '', leave_type_id: '',
      work_from_date: today, work_end_date: today,
      half_day: false, half_day_date: today, reason: '',
    },
  })

  // ── Modal: reject ─────────────────────────────────────────────
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '' })

  // ── Resolve current user employee ─────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.employee_id) setEmployeeId(data.employee_id)
      })
      .finally(() => setLoadingUser(false))
  }, [user])

  useEffect(() => {
    if (!loadingUser && employeeId) {
      setReqModal(m => ({ ...m, form: { ...m.form, employee_id: employeeId } }))
    }
  }, [employeeId, loadingUser])

  // ── Fetch requests ────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('compensatory_leave_requests')
        .select('*, employees(name, employee_number), leave_types(name, color)')
        .order('created_at', { ascending: false })

      if (activeTab === 'mine' && employeeId) {
        query = query.eq('employee_id', employeeId)
      } else if (activeTab === 'pending') {
        query = query.eq('status', 'pending')
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])

      // KPIs — pull from full dataset
      const { data: allData } = await supabase
        .from('compensatory_leave_requests')
        .select('status, work_from_date, work_end_date, half_day, created_at')
      if (allData) {
        setKpiPending(allData.filter(r => r.status === 'pending' || r.status === 'draft').length)
        const approvedMonth = allData.filter(r =>
          r.status === 'approved' && r.created_at?.startsWith(thisMonth)
        ).length
        setKpiApprovedM(approvedMonth)
        const yearStart = `${new Date().getFullYear()}-01-01`
        const daysYear = allData
          .filter(r => r.status === 'approved' && r.work_from_date >= yearStart)
          .reduce((s, r) => s + (r.half_day ? 0.5 : diffDays(r.work_from_date, r.work_end_date)), 0)
        setKpiDaysYear(daysYear)
      }
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [activeTab, employeeId])

  useEffect(() => { if (!loadingUser) fetchRequests() }, [fetchRequests, loadingUser])

  // ── Submit new request ────────────────────────────────────────
  const submitRequest = async () => {
    const f = reqModal.form
    if (!f.employee_id)     return toast.error('Employee is required')
    if (!f.leave_type_id)   return toast.error('Leave type is required')
    if (!f.work_from_date)  return toast.error('Work from date is required')
    if (!f.work_end_date)   return toast.error('Work end date is required')
    if (!f.reason.trim())   return toast.error('Reason is required')
    if (new Date(f.work_end_date) < new Date(f.work_from_date))
      return toast.error('Work end date must be after work from date')

    setReqModal(m => ({ ...m, saving: true }))
    try {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('compensatory_leave_requests').insert([{
        id,
        employee_id:    f.employee_id,
        leave_type_id:  f.leave_type_id,
        work_from_date: f.work_from_date,
        work_end_date:  f.work_end_date,
        half_day:       f.half_day,
        reason:         f.reason,
        status:         'pending',
        created_at:     new Date().toISOString(),
      }])
      if (error) throw error

      toast.success('Compensatory leave request submitted')

      // Notify HR role
      pushNotificationToRole('hr', {
        type:     'comp_leave_request',
        title:    'New Compensatory Leave Request',
        message:  `${employees.find(e => e.id === f.employee_id)?.name || 'An employee'} submitted a compensatory leave request for ${f.work_from_date}${f.work_from_date !== f.work_end_date ? ` - ${f.work_end_date}` : ''}.`,
        link:     '/module/hr/compensatory-leave',
        category: 'leave',
      }).catch(() => {})

      setReqModal({
        open: false, saving: false,
        form: { employee_id: employeeId || '', leave_type_id: '', work_from_date: today, work_end_date: today, half_day: false, half_day_date: today, reason: '' },
      })
      fetchRequests()
    } catch (err) {
      toast.error(err.message)
      setReqModal(m => ({ ...m, saving: false }))
    }
  }

  // ── Approve ───────────────────────────────────────────────────
  const approveRequest = async (req) => {
    try {
      const days = req.half_day ? 0.5 : diffDays(req.work_from_date, req.work_end_date)

      // Update status
      const { error } = await supabase
        .from('compensatory_leave_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', req.id)
      if (error) throw error

      // Create leave allocation (credit ledger)
      await createLedgerEntry({
        employeeId:      req.employee_id,
        leaveTypeId:     req.leave_type_id,
        transactionType: 'Compensatory Earn',
        transactionName: `Compensatory Leave — Work on ${req.work_from_date}`,
        fromDate:        req.work_from_date,
        toDate:          req.work_end_date,
        leaves:          days,
        isCarryForward:  false,
      })

      // Notify employee
      const empUser = await supabase.from('app_users').select('id').eq('employee_id', req.employee_id).maybeSingle()
      if (empUser.data?.id) {
        const { pushNotification } = await import('../../engine/notificationEngine')
        pushNotification(empUser.data.id, {
          type:     'comp_leave_approved',
          title:    'Compensatory Leave Approved',
          message:  `Your compensatory leave request for ${req.work_from_date} has been approved. ${days} day(s) credited to your leave balance.`,
          link:     '/ess/leave',
          category: 'leave',
        }).catch(() => {})
      }

      toast.success(`Approved — ${days} day(s) credited`)
      fetchRequests()
    } catch (err) { toast.error(err.message) }
  }

  // ── Reject ────────────────────────────────────────────────────
  const rejectRequest = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Rejection reason is required')
    try {
      const { error } = await supabase
        .from('compensatory_leave_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', rejectModal.id)
      if (error) throw error

      // Notify employee
      const req = requests.find(r => r.id === rejectModal.id)
      if (req) {
        const empUser = await supabase.from('app_users').select('id').eq('employee_id', req.employee_id).maybeSingle()
        if (empUser.data?.id) {
          const { pushNotification } = await import('../../engine/notificationEngine')
          pushNotification(empUser.data.id, {
            type:     'comp_leave_rejected',
            title:    'Compensatory Leave Rejected',
            message:  `Your compensatory leave request for ${req.work_from_date} was rejected. Reason: ${rejectModal.reason}`,
            link:     '/ess/leave',
            category: 'leave',
          }).catch(() => {})
        }
      }

      toast.success('Request rejected')
      setRejectModal({ open: false, id: null, reason: '' })
      fetchRequests()
    } catch (err) { toast.error(err.message) }
  }

  const openReqModal = () =>
    setReqModal({
      open: true, saving: false,
      form: {
        employee_id: employeeId || '',
        leave_type_id: '', work_from_date: today, work_end_date: today,
        half_day: false, half_day_date: today, reason: '',
      },
    })

  const updateReqForm = (key, value) =>
    setReqModal(m => ({ ...m, form: { ...m.form, [key]: value } }))

  const tabs = [
    { id: 'mine', label: 'My Requests' },
    ...(canApprove ? [{ id: 'pending', label: 'Pending Approval', count: kpiPending }] : []),
    ...(canApprove ? [{ id: 'all', label: 'All Requests' }] : []),
  ]

  // ── Render ───────────────────────────────────────────────────
  if (loadingUser) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div>
      <PageHeader title="Compensatory Leave" subtitle="Request and manage compensatory leave for working on holidays">
        <button className="btn btn-primary" onClick={openReqModal}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> New Request
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Pending" value={kpiPending} icon="pending" color="yellow" alert={kpiPending > 0} />
        <KPICard label="Approved This Month" value={kpiApprovedM} icon="check_circle" color="green" />
        <KPICard label="Days Earned This Year" value={kpiDaysYear.toFixed(1)} icon="event_available" color="gold" />
      </div>

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <SectionCard style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</div>
        ) : requests.length === 0 ? (
          <EmptyState icon="beach_access" message="No compensatory leave requests found" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Work Dates</th>
                <th>Leave Type</th>
                <th>Half Day</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                {canApprove && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map(req => {
                const days = req.half_day ? 0.5 : diffDays(req.work_from_date, req.work_end_date)
                return (
                  <tr key={req.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{req.employees?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{req.employees?.employee_number}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {req.work_from_date}
                      {req.work_from_date !== req.work_end_date ? ` → ${req.work_end_date}` : ''}
                    </td>
                    <td>
                      {req.leave_types?.color && (
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: req.leave_types.color, marginRight: 5 }} />
                      )}
                      {req.leave_types?.name || '—'}
                    </td>
                    <td>{req.half_day ? <span className="badge badge-yellow">Yes</span> : '—'}</td>
                    <td style={{ fontWeight: 700 }}>{days}</td>
                    <td style={{ maxWidth: 200, fontSize: 12, color: 'var(--text-dim)' }}>
                      {req.reason?.slice(0, 80)}{req.reason?.length > 80 ? '…' : ''}
                    </td>
                    <td><StatusBadge status={req.status} /></td>
                    {canApprove && (
                      <td>
                        {req.status === 'pending' && (
                          <div className="btn-group-sm">
                            <button className="btn btn-primary btn-sm" onClick={() => approveRequest(req)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>check</span>
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ open: true, id: req.id, reason: '' })}>
                              <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* ── New Request Modal ─────────────────────────────────── */}
      <ModalDialog
        open={reqModal.open}
        onClose={() => setReqModal(m => ({ ...m, open: false }))}
        title="New Compensatory Leave Request"
        size="lg"
      >
        {canApprove && (
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={reqModal.form.employee_id}
              onChange={e => updateReqForm('employee_id', e.target.value)}>
              <option value="">Select employee…</option>
              {employees.filter(e => e.status !== 'Terminated').map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Leave Type (Compensatory) *</label>
          <select className="form-control" value={reqModal.form.leave_type_id}
            onChange={e => updateReqForm('leave_type_id', e.target.value)}>
            <option value="">Select compensatory leave type…</option>
            {compLeaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
          {compLeaveTypes.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              No compensatory leave types found. Mark leave types with is_compensatory = true.
            </div>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Work From Date *</label>
            <input type="date" className="form-control" value={reqModal.form.work_from_date}
              onChange={e => updateReqForm('work_from_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Work End Date *</label>
            <input type="date" className="form-control" value={reqModal.form.work_end_date}
              onChange={e => updateReqForm('work_end_date', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={reqModal.form.half_day}
              onChange={e => updateReqForm('half_day', e.target.checked)} />
            Half Day
          </label>
        </div>
        {reqModal.form.half_day && (
          <div className="form-group">
            <label>Half Day Date</label>
            <input type="date" className="form-control" value={reqModal.form.half_day_date}
              onChange={e => updateReqForm('half_day_date', e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Reason *</label>
          <textarea className="form-control" rows={3} value={reqModal.form.reason}
            onChange={e => updateReqForm('reason', e.target.value)}
            placeholder="Describe the work performed on the holiday…" />
        </div>
        {reqModal.form.work_from_date && reqModal.form.work_end_date && (
          <div style={{ background: 'var(--surface2)', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            <strong>Days to be credited:</strong>{' '}
            {reqModal.form.half_day ? '0.5' : diffDays(reqModal.form.work_from_date, reqModal.form.work_end_date)} day(s) (pending approval)
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setReqModal(m => ({ ...m, open: false }))}>Cancel</button>
          <button className="btn btn-primary" onClick={submitRequest} disabled={reqModal.saving}>
            {reqModal.saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Reject Modal ─────────────────────────────────────── */}
      <ModalDialog
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, id: null, reason: '' })}
        title="Reject Compensatory Leave Request"
      >
        <div className="form-group">
          <label>Rejection Reason *</label>
          <textarea className="form-control" rows={3} value={rejectModal.reason}
            onChange={e => setRejectModal(r => ({ ...r, reason: e.target.value }))}
            placeholder="Explain why this request is being rejected…" />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>Cancel</button>
          <button className="btn btn-danger" onClick={rejectRequest}>Confirm Rejection</button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
