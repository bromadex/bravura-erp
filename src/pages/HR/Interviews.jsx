// src/pages/HR/Interviews.jsx
// Recruitment — Interview scheduling, tracking, and outcomes.

import { useState, useEffect, useCallback } from 'react'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog
} from '../../components/ui'

// ── Constants ─────────────────────────────────────────────────
const INTERVIEW_TYPES = [
  'Phone Screen',
  'HR Interview',
  'Technical Interview',
  'Panel Interview',
  'Case Study',
  'Assessment',
  'Final Interview',
]

const STATUSES  = ['Scheduled', 'Completed', 'Cancelled', 'No Show', 'Rescheduled']
const OUTCOMES  = ['Pass', 'Fail', 'On Hold']
const DURATIONS = [15, 30, 45, 60, 90, 120]

const BLANK_SCHEDULE = {
  applicant_id:     '',
  job_opening_id:   '',
  interview_type:   'HR Interview',
  interviewer_name: '',
  scheduled_date:   '',
  duration_minutes: 60,
  location_or_link: '',
  status:           'Scheduled',
}

const BLANK_COMPLETE = {
  outcome:  '',
  score:    '',
  feedback: '',
}

const fmtDt = (d) =>
  d ? new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—'

const toLocalDatetimeValue = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const pad = n => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export default function Interviews() {
  const canEdit = useCanEdit('hr', 'recruitment')

  const [interviews,  setInterviews]  = useState([])
  const [applicants,  setApplicants]  = useState([])
  const [jobOpenings, setJobOpenings] = useState([])
  const [loading,     setLoading]     = useState(true)

  // Schedule modal
  const [schedModal,  setSchedModal]  = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [schedForm,   setSchedForm]   = useState(BLANK_SCHEDULE)
  const [saving,      setSaving]      = useState(false)

  // Complete modal
  const [completeModal, setCompleteModal] = useState({ open: false, interview: null })
  const [complForm,     setComplForm]     = useState(BLANK_COMPLETE)
  const [completing,    setCompleting]    = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null })
  const [deleting,      setDeleting]      = useState(false)

  // ── Fetch ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: ivs }, { data: apps }, { data: jobs }] = await Promise.all([
        supabase
          .from('interview_schedules')
          .select('*, job_applicants(first_name,last_name,job_opening_id), job_openings(job_title)')
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('job_applicants')
          .select('id,first_name,last_name,job_opening_id,stage')
          .not('stage', 'in', '("Hired","Rejected","Withdrawn")')
          .order('last_name'),
        supabase
          .from('job_openings')
          .select('id,job_title')
          .order('job_title'),
      ])
      setInterviews(ivs || [])
      setApplicants(apps || [])
      setJobOpenings(jobs || [])
    } catch (err) {
      toast.error('Failed to load interviews')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── KPIs ──────────────────────────────────────────────────
  const now    = new Date()
  const todayS = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayE = new Date(todayS.getTime() + 86400000)

  const weekStart = new Date(todayS)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)

  const scheduledToday = interviews.filter(iv => {
    if (!iv.scheduled_date) return false
    const d = new Date(iv.scheduled_date)
    return d >= todayS && d < todayE && iv.status === 'Scheduled'
  }).length

  const scheduledThisWeek = interviews.filter(iv => {
    if (!iv.scheduled_date) return false
    const d = new Date(iv.scheduled_date)
    return d >= weekStart && d < weekEnd && iv.status === 'Scheduled'
  }).length

  const completed = interviews.filter(iv => iv.status === 'Completed').length

  const passRate = (() => {
    const decided = interviews.filter(iv => ['Pass', 'Fail'].includes(iv.outcome))
    if (!decided.length) return null
    const passes = decided.filter(iv => iv.outcome === 'Pass').length
    return Math.round((passes / decided.length) * 100)
  })()

  // ── Schedule modal helpers ─────────────────────────────────
  const openSchedule = () => {
    setEditingId(null)
    setSchedForm(BLANK_SCHEDULE)
    setSchedModal(true)
  }

  const openEdit = (iv) => {
    setEditingId(iv.id)
    setSchedForm({
      applicant_id:     iv.applicant_id     || '',
      job_opening_id:   iv.job_opening_id   || '',
      interview_type:   iv.interview_type   || 'HR Interview',
      interviewer_name: iv.interviewer_name || '',
      scheduled_date:   toLocalDatetimeValue(iv.scheduled_date),
      duration_minutes: iv.duration_minutes || 60,
      location_or_link: iv.location_or_link || '',
      status:           iv.status           || 'Scheduled',
    })
    setSchedModal(true)
  }

  const closeSchedModal = () => {
    setSchedModal(false)
    setEditingId(null)
    setSchedForm(BLANK_SCHEDULE)
  }

  const sf = (field) => (e) => setSchedForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleApplicantChange = (e) => {
    const appId = e.target.value
    const app = applicants.find(a => a.id === appId)
    setSchedForm(prev => ({
      ...prev,
      applicant_id:   appId,
      job_opening_id: app?.job_opening_id || '',
    }))
  }

  // ── Save schedule ─────────────────────────────────────────
  const handleSaveSchedule = async () => {
    if (!schedForm.applicant_id)            return toast.error('Applicant is required')
    if (!schedForm.interview_type)          return toast.error('Interview type is required')
    if (!schedForm.interviewer_name.trim()) return toast.error('Interviewer name is required')
    if (!schedForm.scheduled_date)          return toast.error('Scheduled date/time is required')

    setSaving(true)
    try {
      const payload = {
        applicant_id:     schedForm.applicant_id,
        job_opening_id:   schedForm.job_opening_id || null,
        interview_type:   schedForm.interview_type,
        interviewer_name: schedForm.interviewer_name.trim(),
        scheduled_date:   new Date(schedForm.scheduled_date).toISOString(),
        duration_minutes: Number(schedForm.duration_minutes),
        location_or_link: schedForm.location_or_link.trim() || null,
        status:           schedForm.status,
        updated_at:       new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase.from('interview_schedules').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)
        toast.success('Interview updated')
      } else {
        const { error } = await supabase.from('interview_schedules').insert([{
          id:         crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...payload,
        }])
        if (error) throw new Error(error.message)
        toast.success('Interview scheduled')
      }
      closeSchedModal()
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Mark complete ─────────────────────────────────────────
  const openComplete = (iv) => {
    setComplForm({
      outcome:  iv.outcome  || '',
      score:    iv.score    ?? '',
      feedback: iv.feedback || '',
    })
    setCompleteModal({ open: true, interview: iv })
  }

  const cf = (field) => (e) => setComplForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleMarkComplete = async () => {
    if (!complForm.outcome) return toast.error('Outcome is required')
    const score = complForm.score !== '' ? Number(complForm.score) : null
    if (score !== null && (score < 1 || score > 10)) return toast.error('Score must be between 1 and 10')

    setCompleting(true)
    try {
      const { error } = await supabase
        .from('interview_schedules')
        .update({
          status:     'Completed',
          outcome:    complForm.outcome,
          score:      score,
          feedback:   complForm.feedback.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', completeModal.interview.id)
      if (error) throw new Error(error.message)
      toast.success('Interview marked complete')
      setCompleteModal({ open: false, interview: null })
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCompleting(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete.id) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('interview_schedules').delete().eq('id', confirmDelete.id)
      if (error) throw new Error(error.message)
      toast.success('Interview removed')
      setConfirmDelete({ open: false, id: null })
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  const applicantName = (iv) => {
    if (iv.job_applicants) {
      return `${iv.job_applicants.first_name} ${iv.job_applicants.last_name}`
    }
    const a = applicants.find(a => a.id === iv.applicant_id)
    return a ? `${a.first_name} ${a.last_name}` : '—'
  }

  const jobTitle = (iv) => {
    if (iv.job_openings?.job_title) return iv.job_openings.job_title
    const jobId = iv.job_opening_id || iv.job_applicants?.job_opening_id
    return jobOpenings.find(j => j.id === jobId)?.job_title || '—'
  }

  const canComplete = (iv) => iv.status === 'Scheduled' || iv.status === 'Rescheduled'
  const canRemove   = (iv) => ['Scheduled', 'Cancelled', 'No Show'].includes(iv.status)

  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader title="Interviews" subtitle="Schedule and track candidate interviews">
        {canEdit && (
          <button className="btn btn-primary" onClick={openSchedule}>
            <span className="material-icons" style={{ fontSize: 16 }}>event</span>
            Schedule Interview
          </button>
        )}
      </PageHeader>

      {/* ── KPI strip ────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard label="Scheduled Today" value={scheduledToday}    icon="today"      color="blue"  />
        <KPICard label="This Week"       value={scheduledThisWeek} icon="date_range" color="teal"  />
        <KPICard label="Completed"       value={completed}         icon="task_alt"   color="green" />
        <KPICard
          label="Pass Rate"
          value={passRate !== null ? `${passRate}%` : '—'}
          icon="trending_up"
          color={passRate !== null && passRate >= 50 ? 'green' : 'red'}
          sub={passRate !== null ? 'of decided outcomes' : 'No outcomes yet'}
        />
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : interviews.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState icon="event_note" message="No interviews scheduled yet"
              action={canEdit && (
                <button className="btn btn-primary btn-sm" onClick={openSchedule}>
                  Schedule Interview
                </button>
              )}
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Date / Time</th>
                  <th>Interviewer</th>
                  <th>Status</th>
                  <th>Outcome</th>
                  <th style={{ textAlign: 'center' }}>Score</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map(iv => (
                  <tr key={iv.id}>
                    <td style={{ fontWeight: 600 }}>{applicantName(iv)}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{jobTitle(iv)}</td>
                    <td style={{ fontSize: 13 }}>{iv.interview_type}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDt(iv.scheduled_date)}</td>
                    <td style={{ fontSize: 13 }}>{iv.interviewer_name || '—'}</td>
                    <td>
                      <StatusBadge status={iv.status?.toLowerCase().replace(/ /g, '_')} label={iv.status} />
                    </td>
                    <td>
                      {iv.outcome
                        ? <StatusBadge status={iv.outcome?.toLowerCase().replace(/ /g, '_')} label={iv.outcome} />
                        : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {iv.score != null ? (
                        <span style={{ fontWeight: 700, color: iv.score >= 7 ? 'var(--green)' : iv.score >= 4 ? 'var(--yellow)' : 'var(--red)' }}>
                          {iv.score}<span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 11 }}>/10</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group-sm">
                        {canEdit && canComplete(iv) && (
                          <button className="btn btn-primary btn-sm" onClick={() => openComplete(iv)}
                            title="Mark Complete">
                            <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span>
                          </button>
                        )}
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(iv)}
                            title="Edit">
                            <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                          </button>
                        )}
                        {canEdit && canRemove(iv) && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDelete({ open: true, id: iv.id })}
                            title="Delete">
                            <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Schedule / Edit Modal ────────────────────────── */}
      <ModalDialog
        open={schedModal}
        onClose={closeSchedModal}
        title={editingId ? 'Edit · Interview' : 'Schedule · Interview'}
        size="lg"
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Applicant *</label>
            <select className="form-control" value={schedForm.applicant_id} onChange={handleApplicantChange}>
              <option value="">Select applicant…</option>
              {applicants.map(a => (
                <option key={a.id} value={a.id}>
                  {a.first_name} {a.last_name}
                  {a.job_opening_id
                    ? ` — ${jobOpenings.find(j => j.id === a.job_opening_id)?.job_title || ''}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Job Opening</label>
            <select className="form-control" value={schedForm.job_opening_id} onChange={sf('job_opening_id')}>
              <option value="">— auto from applicant —</option>
              {jobOpenings.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Interview Type *</label>
            <select className="form-control" value={schedForm.interview_type} onChange={sf('interview_type')}>
              {INTERVIEW_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Interviewer Name *</label>
            <input className="form-control" value={schedForm.interviewer_name} onChange={sf('interviewer_name')}
              placeholder="Full name of interviewer" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Date &amp; Time *</label>
            <input type="datetime-local" className="form-control"
              value={schedForm.scheduled_date} onChange={sf('scheduled_date')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Duration (minutes)</label>
            <select className="form-control" value={schedForm.duration_minutes} onChange={sf('duration_minutes')}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Status</label>
            <select className="form-control" value={schedForm.status} onChange={sf('status')}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Location / Meeting Link</label>
          <input className="form-control" value={schedForm.location_or_link} onChange={sf('location_or_link')}
            placeholder="Room name, address, or Zoom/Teams link…" />
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeSchedModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Schedule'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Mark Complete Modal ──────────────────────────── */}
      <ModalDialog
        open={completeModal.open}
        onClose={() => setCompleteModal({ open: false, interview: null })}
        title="Mark · Interview Complete"
      >
        {completeModal.interview && (
          <>
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{applicantName(completeModal.interview)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {completeModal.interview.interview_type} · {fmtDt(completeModal.interview.scheduled_date)}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Outcome *</label>
                <select className="form-control" value={complForm.outcome} onChange={cf('outcome')}>
                  <option value="">Select outcome…</option>
                  {OUTCOMES.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Score (1–10)</label>
                <input type="number" className="form-control" min="1" max="10"
                  value={complForm.score} onChange={cf('score')} placeholder="Optional" />
              </div>
            </div>

            <div className="form-group">
              <label>Feedback / Notes</label>
              <textarea className="form-control" rows="4" value={complForm.feedback} onChange={cf('feedback')}
                placeholder="Interviewer's notes, strengths, weaknesses…" />
            </div>

            <ModalActions>
              <button className="btn btn-secondary"
                onClick={() => setCompleteModal({ open: false, interview: null })}
                disabled={completing}>Cancel</button>
              <button className="btn btn-primary" onClick={handleMarkComplete} disabled={completing}>
                {completing ? 'Saving…' : 'Mark Complete'}
              </button>
            </ModalActions>
          </>
        )}
      </ModalDialog>

      {/* ── Confirm Delete ───────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null })}
        onConfirm={handleDelete}
        title="Delete Interview"
        message="Remove this interview record? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  )
}
