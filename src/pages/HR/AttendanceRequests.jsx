// src/pages/HR/AttendanceRequests.jsx
// Regularization requests for correcting missed / wrong attendance.
// Two views:
//   - Employee: "My Requests" tab + new request form
//   - HR Approver (canApprove): "Pending Approval" tab with approve/reject actions

import { useState, useMemo, useEffect } from 'react'
import { useShift } from '../../contexts/ShiftContext'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, DataTable, TabNav, Spinner,
} from '../../components/ui'

const REQUEST_DEFAULTS = {
  from_date:     '',
  to_date:       '',
  reason:        '',
  explanation:   '',
  shift_type_id: '',
  half_day:      false,
  half_day_date: '',
}

function daysBetween(from, to) {
  if (!from || !to) return 0
  const a = new Date(from)
  const b = new Date(to)
  if (isNaN(a) || isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000) + 1)
}

export default function AttendanceRequests() {
  const { user } = useAuth()
  const canApprove = useCanApprove('hr', 'attendance')
  const { shiftTypes, attendanceRequests, loading, createAttendanceRequest, approveAttendanceRequest, rejectAttendanceRequest } = useShift()
  const { employees } = useHR()

  // ── Employee ID for current user ──────────────────────────────────────────
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null)
  useEffect(() => {
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.employee_id) setCurrentEmployeeId(data.employee_id) })
  }, [user?.id])

  // ── Tab ───────────────────────────────────────────────────────────────────
  const tabs = canApprove
    ? [{ id: 'pending', label: 'Pending Approval' }, { id: 'all', label: 'All Requests' }, { id: 'my', label: 'My Requests' }]
    : [{ id: 'my', label: 'My Requests' }]
  const [activeTab, setActiveTab] = useState(canApprove ? 'pending' : 'my')

  // ── New request modal ─────────────────────────────────────────────────────
  const [reqModal,  setReqModal]  = useState(false)
  const [form,      setForm]      = useState(REQUEST_DEFAULTS)
  const [saving,    setSaving]    = useState(false)

  // ── Reject modal ──────────────────────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)

  // ── Approve loading ───────────────────────────────────────────────────────
  const [approvingId,  setApprovingId]  = useState(null)

  // ── Derived data ──────────────────────────────────────────────────────────
  const enriched = useMemo(() =>
    attendanceRequests.map(r => {
      const emp   = employees.find(e => e.id === r.employee_id)
      const shift = shiftTypes.find(s => s.id === r.shift_type_id)
      return { ...r, _emp: emp, _shift: shift }
    })
  , [attendanceRequests, employees, shiftTypes])

  const myRequests      = useMemo(() => enriched.filter(r => r.employee_id === currentEmployeeId), [enriched, currentEmployeeId])
  const pendingRequests = useMemo(() => enriched.filter(r => r.status === 'pending'),              [enriched])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const now         = new Date()
  const monthStart  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const pendingCt   = enriched.filter(r => r.status === 'pending').length
  const approvedCt  = enriched.filter(r => r.status === 'approved' && r.created_at >= monthStart).length
  const rejectedCt  = enriched.filter(r => r.status === 'rejected' && r.created_at >= monthStart).length

  // ── Form helpers ──────────────────────────────────────────────────────────
  const field = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [key]: val }))
  }

  const handleNewRequest = async () => {
    if (!form.from_date)       { toast.error('From date is required'); return }
    if (!form.to_date)         { toast.error('To date is required');   return }
    if (!form.reason.trim())   { toast.error('Reason is required');    return }
    if (!currentEmployeeId)    { toast.error('Employee profile not linked to your account'); return }
    if (form.half_day && !form.half_day_date) { toast.error('Specify the half-day date'); return }

    setSaving(true)
    try {
      await createAttendanceRequest({
        employee_id:   currentEmployeeId,
        from_date:     form.from_date,
        to_date:       form.to_date,
        reason:        form.reason.trim(),
        explanation:   form.explanation.trim() || null,
        shift_type_id: form.shift_type_id || null,
        half_day:      form.half_day,
        half_day_date: form.half_day && form.half_day_date ? form.half_day_date : null,
      })
      toast.success('Attendance request submitted')
      setReqModal(false)
      setForm(REQUEST_DEFAULTS)
    } catch (err) {
      toast.error(err.message || 'Failed to submit request')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id) => {
    setApprovingId(id)
    try {
      await approveAttendanceRequest(id, user?.full_name || user?.username || 'HR')
      toast.success('Request approved')
    } catch (err) {
      toast.error(err.message || 'Failed to approve')
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Rejection reason is required'); return }
    setRejecting(true)
    try {
      await rejectAttendanceRequest(rejectTarget.id, rejectReason.trim(), user?.full_name || user?.username || 'HR')
      toast.success('Request rejected')
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) {
      toast.error(err.message || 'Failed to reject')
    } finally {
      setRejecting(false)
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  const baseColumns = [
    { key: '_emp',        label: 'Employee',      render: (_, r) => r._emp?.name || '—' },
    { key: 'from_date',   label: 'From',          sortable: true },
    { key: 'to_date',     label: 'To',            render: (v, r) => v === r.from_date ? r.from_date : v },
    { key: '_days',       label: 'Days',          render: (_, r) => daysBetween(r.from_date, r.to_date) },
    { key: 'reason',      label: 'Reason' },
    { key: '_shift',      label: 'Shift',         render: (_, r) => r._shift?.name || '—' },
    { key: 'status',      label: 'Status',        render: (v) => <StatusBadge status={v} /> },
    { key: 'created_at',  label: 'Submitted',     render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
  ]

  const hrActionColumn = {
    key: '_actions',
    label: '',
    render: (_, row) => {
      if (row.status !== 'pending') return null
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => handleApprove(row.id)}
            disabled={approvingId === row.id}
          >
            {approvingId === row.id ? '…' : 'Approve'}
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => { setRejectTarget(row); setRejectReason('') }}
          >
            Reject
          </button>
        </div>
      )
    },
  }

  const myColumns = [
    ...baseColumns.filter(c => c.key !== '_emp'),
  ]

  const hrColumns = [...baseColumns, hrActionColumn]

  if (loading) return <div className="page-body"><Spinner /></div>

  const displayData = activeTab === 'pending' ? pendingRequests
    : activeTab === 'my' ? myRequests
    : enriched

  const displayColumns = (activeTab === 'my') ? myColumns : hrColumns

  return (
    <div>
      <PageHeader
        title="Attendance Requests"
        subtitle="Regularization requests for correcting attendance records"
      >
        <button className="btn btn-primary" onClick={() => { setForm(REQUEST_DEFAULTS); setReqModal(true) }}>
          <span className="material-icons md-18">add</span> New Request
        </button>
      </PageHeader>

      <div className="page-body">
        {/* KPI Row */}
        <div className="kpi-row">
          <KPICard label="Pending"            value={pendingCt}  icon="hourglass_empty" color="yellow" />
          <KPICard label="Approved (month)"   value={approvedCt} icon="check_circle"    color="green"  />
          <KPICard label="Rejected (month)"   value={rejectedCt} icon="cancel"          color="red"    />
        </div>

        {/* Tab Nav */}
        <TabNav
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
        />

        {/* Empty state for My Requests when not linked */}
        {activeTab === 'my' && !currentEmployeeId && (
          <div style={{ marginTop: 16 }}>
            <EmptyState icon="person_off" text="Your account is not linked to an employee profile. Contact HR." />
          </div>
        )}

        {/* Table */}
        {(activeTab !== 'my' || currentEmployeeId) && (
          <DataTable
            columns={displayColumns}
            data={displayData}
            rowKey="id"
            emptyText={
              activeTab === 'pending' ? 'No pending requests' :
              activeTab === 'my'      ? 'You have no attendance requests' :
              'No attendance requests found'
            }
            emptyIcon="event_busy"
            searchable
            searchPlaceholder="Search by employee, reason…"
          />
        )}
      </div>

      {/* ── New Request Modal ────────────────────────────────────────────────── */}
      <ModalDialog
        open={reqModal}
        onClose={() => setReqModal(false)}
        title="New Attendance Regularization Request"
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          {/* Date range */}
          <div className="form-group">
            <label className="form-label">From Date *</label>
            <input className="form-control" type="date" value={form.from_date} onChange={field('from_date')} />
          </div>
          <div className="form-group">
            <label className="form-label">To Date *</label>
            <input className="form-control" type="date" value={form.to_date} min={form.from_date} onChange={field('to_date')} />
          </div>

          {/* Reason */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Reason *</label>
            <input className="form-control" value={form.reason} onChange={field('reason')} placeholder="e.g. Forgot to punch in" />
          </div>

          {/* Explanation */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Additional Explanation (optional)</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.explanation}
              onChange={field('explanation')}
              placeholder="Provide any additional context…"
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Shift Type */}
          <div className="form-group">
            <label className="form-label">Shift Type (optional)</label>
            <select className="form-control" value={form.shift_type_id} onChange={field('shift_type_id')}>
              <option value="">Not specified</option>
              {shiftTypes.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Half day */}
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>
              <input type="checkbox" checked={form.half_day} onChange={field('half_day')} />
              Half Day Request
            </label>
            {form.half_day && (
              <>
                <label className="form-label">Half Day Date *</label>
                <input
                  className="form-control"
                  type="date"
                  value={form.half_day_date}
                  min={form.from_date}
                  max={form.to_date}
                  onChange={field('half_day_date')}
                />
              </>
            )}
          </div>

          {/* Days summary */}
          {form.from_date && form.to_date && (
            <div style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--text-dim)' }}>
              Duration: <strong>{daysBetween(form.from_date, form.to_date)} day(s)</strong>
            </div>
          )}
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setReqModal(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleNewRequest} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Reject Modal ─────────────────────────────────────────────────────── */}
      <ModalDialog
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectReason('') }}
        title="Reject Attendance Request"
      >
        <div style={{ padding: '16px 0' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-mid)' }}>
            Rejecting request from <strong>{rejectTarget?._emp?.name || '—'}</strong> for{' '}
            {rejectTarget?.from_date}
            {rejectTarget?.to_date !== rejectTarget?.from_date ? ` – ${rejectTarget?.to_date}` : ''}.
          </p>
          <div className="form-group">
            <label className="form-label">Rejection Reason *</label>
            <textarea
              className="form-control"
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="State the reason for rejection…"
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => { setRejectTarget(null); setRejectReason('') }} disabled={rejecting}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={rejecting}>
            {rejecting ? 'Rejecting…' : 'Reject Request'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
