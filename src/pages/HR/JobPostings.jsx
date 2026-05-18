// src/pages/HR/JobPostings.jsx
// Recruitment — Job Openings management page.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog
} from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']
const CURRENCIES       = ['USD', 'ZWL', 'ZAR', 'GBP', 'EUR']
const STATUSES         = ['Draft', 'Open', 'On Hold', 'Closed', 'Cancelled']

const BLANK_FORM = {
  job_title:       '',
  department_id:   '',
  employment_type: 'Full-time',
  headcount:       1,
  min_salary:      '',
  max_salary:      '',
  currency:        'USD',
  description:     '',
  requirements:    '',
  status:          'Draft',
  posted_date:     today,
  closing_date:    '',
}

const fmt = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function JobPostings() {
  useAuth()
  const canEdit = useCanEdit('hr', 'recruitment')

  const [openings,     setOpenings]     = useState([])
  const [departments,  setDepartments]  = useState([])
  const [applicantMap, setApplicantMap] = useState({})   // { job_opening_id: count }
  const [loading,      setLoading]      = useState(true)

  const [modalOpen,  setModalOpen]  = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [form,       setForm]       = useState(BLANK_FORM)
  const [saving,     setSaving]     = useState(false)

  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, title: '' })
  const [deleting,      setDeleting]      = useState(false)

  // ── Fetch ────────────────────────────────────────────────────
  const fetchOpenings = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: jobs }, { data: apps }, { data: depts }] = await Promise.all([
        supabase.from('job_openings').select('*').order('created_at', { ascending: false }),
        supabase.from('job_applicants').select('job_opening_id'),
        supabase.from('departments').select('id,name').order('name'),
      ])

      setOpenings(jobs || [])
      setDepartments(depts || [])

      // Build applicant count map
      const map = {}
      ;(apps || []).forEach(a => {
        map[a.job_opening_id] = (map[a.job_opening_id] || 0) + 1
      })
      setApplicantMap(map)
    } catch (err) {
      toast.error('Failed to load job openings')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOpenings() }, [fetchOpenings])

  // ── KPIs ─────────────────────────────────────────────────────
  const total    = openings.length
  const openCnt  = openings.filter(j => j.status === 'Open').length
  const filled   = openings.filter(j => j.status === 'Closed').length

  // Applicants this month
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const applicantsThisMonth = Object.values(applicantMap).reduce((a, b) => a + b, 0)

  // ── Modal helpers ────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (job) => {
    setEditingId(job.id)
    setForm({
      job_title:       job.job_title       || '',
      department_id:   job.department_id   || '',
      employment_type: job.employment_type || 'Full-time',
      headcount:       job.headcount       || 1,
      min_salary:      job.min_salary      ?? '',
      max_salary:      job.max_salary      ?? '',
      currency:        job.currency        || 'USD',
      description:     job.description     || '',
      requirements:    job.requirements    || '',
      status:          job.status          || 'Draft',
      posted_date:     job.posted_date     || today,
      closing_date:    job.closing_date    || '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(BLANK_FORM)
  }

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.job_title.trim())   return toast.error('Job title is required')
    if (!form.department_id)      return toast.error('Department is required')
    if (!form.employment_type)    return toast.error('Employment type is required')
    if (Number(form.headcount) < 1) return toast.error('Headcount must be at least 1')

    setSaving(true)
    try {
      const payload = {
        job_title:       form.job_title.trim(),
        department_id:   form.department_id,
        employment_type: form.employment_type,
        headcount:       Number(form.headcount),
        min_salary:      form.min_salary !== '' ? Number(form.min_salary) : null,
        max_salary:      form.max_salary !== '' ? Number(form.max_salary) : null,
        currency:        form.currency,
        description:     form.description.trim(),
        requirements:    form.requirements.trim(),
        status:          form.status,
        posted_date:     form.posted_date || null,
        closing_date:    form.closing_date || null,
        updated_at:      new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase.from('job_openings').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)
        toast.success('Job opening updated')
      } else {
        const { error } = await supabase.from('job_openings').insert([{
          id:         crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...payload,
        }])
        if (error) throw new Error(error.message)
        toast.success('Job opening created')
      }
      closeModal()
      await fetchOpenings()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete.id) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('job_openings').delete().eq('id', confirmDelete.id)
      if (error) throw new Error(error.message)
      toast.success('Job opening deleted')
      setConfirmDelete({ open: false, id: null, title: '' })
      await fetchOpenings()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────
  const deptName = (id) => departments.find(d => d.id === id)?.name || '—'

  const filledCount     = (job) => Math.min(applicantMap[job.id] || 0, job.headcount)
  const remainingCount  = (job) => Math.max(job.headcount - (applicantMap[job.id] || 0), 0)

  const statusColor = (s) => ({
    Open:      'green',
    Draft:     'yellow',
    'On Hold': 'orange',
    Closed:    'red',
    Cancelled: 'red',
  }[s] || 'dim')

  const canDelete = (job) => ['Draft', 'Cancelled'].includes(job.status)

  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader title="Job Openings" subtitle="Manage open positions and headcount">
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span>
            New Opening
          </button>
        )}
      </PageHeader>

      {/* ── KPI strip ──────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard label="Total Openings"        value={total}               icon="work_outline"    />
        <KPICard label="Open"                  value={openCnt}             icon="lock_open"       color="green" />
        <KPICard label="Applicants This Month" value={applicantsThisMonth} icon="people_outline"  color="blue"  />
        <KPICard label="Filled / Closed"       value={filled}              icon="check_circle"    color="teal"  />
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : openings.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState icon="work_outline" message="No job openings yet"
              action={canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>Create Opening</button>}
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'center' }}>Headcount</th>
                  <th style={{ textAlign: 'center' }}>Filled / Left</th>
                  <th>Status</th>
                  <th>Closing Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {openings.map(job => (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 600 }}>{job.job_title}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{deptName(job.department_id)}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{job.employment_type}</td>
                    <td style={{ textAlign: 'center' }}>{job.headcount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>{filledCount(job)}</span>
                      <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>/</span>
                      <span style={{ color: remainingCount(job) === 0 ? 'var(--text-dim)' : 'var(--gold)', fontWeight: 600 }}>
                        {remainingCount(job)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={job.status?.toLowerCase().replace(' ', '_')} label={job.status} />
                    </td>
                    <td style={{ color: 'var(--text-dim)' }}>{fmt(job.closing_date)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group-sm">
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(job)}
                            title="Edit">
                            <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                          </button>
                        )}
                        {canEdit && canDelete(job) && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDelete({ open: true, id: job.id, title: job.job_title })}
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

      {/* ── New / Edit Modal ────────────────────────────────── */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit · Job Opening' : 'New · Job Opening'}
        size="lg"
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Job Title *</label>
            <input className="form-control" value={form.job_title} onChange={f('job_title')}
              placeholder="e.g. Senior Geologist" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Employment Type *</label>
            <select className="form-control" value={form.employment_type} onChange={f('employment_type')}>
              {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Department *</label>
            <select className="form-control" value={form.department_id} onChange={f('department_id')}>
              <option value="">Select department…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Headcount *</label>
            <input type="number" className="form-control" min="1" value={form.headcount}
              onChange={f('headcount')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Status</label>
            <select className="form-control" value={form.status} onChange={f('status')}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Min Salary</label>
            <input type="number" className="form-control" min="0" value={form.min_salary}
              onChange={f('min_salary')} placeholder="0" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Max Salary</label>
            <input type="number" className="form-control" min="0" value={form.max_salary}
              onChange={f('max_salary')} placeholder="0" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Currency</label>
            <select className="form-control" value={form.currency} onChange={f('currency')}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Posted Date</label>
            <input type="date" className="form-control" value={form.posted_date} onChange={f('posted_date')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Closing Date</label>
            <input type="date" className="form-control" value={form.closing_date} onChange={f('closing_date')} />
          </div>
        </div>

        <div className="form-group">
          <label>Job Description</label>
          <textarea className="form-control" rows="4" value={form.description} onChange={f('description')}
            placeholder="Describe the role, responsibilities, and expectations…" />
        </div>

        <div className="form-group">
          <label>Requirements</label>
          <textarea className="form-control" rows="3" value={form.requirements} onChange={f('requirements')}
            placeholder="Qualifications, experience, skills required…" />
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Opening'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Confirm Delete ──────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, title: '' })}
        onConfirm={handleDelete}
        title="Delete Job Opening"
        message={`Delete "${confirmDelete.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  )
}
