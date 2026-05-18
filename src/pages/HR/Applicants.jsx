// src/pages/HR/Applicants.jsx
// Recruitment — Applicant tracking with Kanban pipeline overview.

import { useState, useEffect, useCallback } from 'react'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog
} from '../../components/ui'

// ── Constants ────────────────────────────────────────────────
const STAGES = ['Applied', 'Screening', 'Interview', 'Assessment', 'Offer', 'Hired', 'Rejected', 'Withdrawn']
const PIPELINE_STAGES = ['Applied', 'Screening', 'Interview', 'Assessment', 'Offer', 'Hired']
const SOURCES  = ['Job Board', 'LinkedIn', 'Referral', 'Company Website', 'Recruitment Agency', 'Walk-in', 'Other']
const RATINGS  = [1, 2, 3, 4, 5]

const STAGE_COLOR = {
  Applied:    'var(--blue)',
  Screening:  'var(--yellow)',
  Interview:  '#f97316',
  Assessment: '#a855f7',
  Offer:      'var(--teal)',
  Hired:      'var(--green)',
  Rejected:   'var(--red)',
  Withdrawn:  'var(--text-dim)',
}

const BLANK_FORM = {
  job_opening_id:   '',
  first_name:       '',
  last_name:        '',
  email:            '',
  phone:            '',
  current_employer: '',
  current_title:    '',
  years_experience: '',
  source:           'Job Board',
  cover_letter:     '',
  notes:            '',
  rating:           '',
  stage:            'Applied',
}

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const StarRating = ({ value }) => (
  <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>
    {'★'.repeat(value || 0)}{'☆'.repeat(5 - (value || 0))}
  </span>
)

export default function Applicants() {
  const canEdit = useCanEdit('hr', 'recruitment')

  const [applicants,   setApplicants]   = useState([])
  const [jobOpenings,  setJobOpenings]  = useState([])
  const [interviews,   setInterviews]   = useState([])
  const [loading,      setLoading]      = useState(true)

  const [filterJob,    setFilterJob]    = useState('')
  const [filterStage,  setFilterStage]  = useState('')

  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const [form,         setForm]         = useState(BLANK_FORM)
  const [saving,       setSaving]       = useState(false)

  const [viewModal,    setViewModal]    = useState({ open: false, applicant: null })
  const [advanceModal, setAdvanceModal] = useState({ open: false, applicant: null })
  const [advancing,    setAdvancing]    = useState(false)

  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' })
  const [deleting,      setDeleting]      = useState(false)

  // ── Fetch ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: apps }, { data: jobs }, { data: ivs }] = await Promise.all([
        supabase.from('job_applicants')
          .select('*, job_openings(job_title)')
          .order('created_at', { ascending: false }),
        supabase.from('job_openings')
          .select('id,job_title')
          .eq('status', 'Open')
          .order('job_title'),
        supabase.from('interview_schedules')
          .select('id,applicant_id,interview_type,scheduled_date,status,outcome'),
      ])
      setApplicants(apps || [])
      setJobOpenings(jobs || [])
      setInterviews(ivs || [])
    } catch (err) {
      toast.error('Failed to load applicants')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived data ──────────────────────────────────────────
  const filtered = applicants.filter(a => {
    if (filterJob   && a.job_opening_id !== filterJob)   return false
    if (filterStage && a.stage          !== filterStage) return false
    return true
  })

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.stage === s).length
    return acc
  }, {})

  // ── KPIs ──────────────────────────────────────────────────
  const kpis = {
    total:     applicants.length,
    applied:   stageCounts['Applied']   || 0,
    interview: stageCounts['Interview'] || 0,
    offers:    stageCounts['Offer']     || 0,
    hired:     stageCounts['Hired']     || 0,
    rejected:  stageCounts['Rejected']  || 0,
  }

  // ── Modal helpers ─────────────────────────────────────────
  const openNew = () => {
    setEditingId(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (app) => {
    setEditingId(app.id)
    setForm({
      job_opening_id:   app.job_opening_id   || '',
      first_name:       app.first_name       || '',
      last_name:        app.last_name        || '',
      email:            app.email            || '',
      phone:            app.phone            || '',
      current_employer: app.current_employer || '',
      current_title:    app.current_title    || '',
      years_experience: app.years_experience ?? '',
      source:           app.source           || 'Job Board',
      cover_letter:     app.cover_letter     || '',
      notes:            app.notes            || '',
      rating:           app.rating           ?? '',
      stage:            app.stage            || 'Applied',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(BLANK_FORM)
  }

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.job_opening_id)    return toast.error('Job opening is required')
    if (!form.first_name.trim()) return toast.error('First name is required')
    if (!form.last_name.trim())  return toast.error('Last name is required')

    setSaving(true)
    try {
      const payload = {
        job_opening_id:   form.job_opening_id,
        first_name:       form.first_name.trim(),
        last_name:        form.last_name.trim(),
        email:            form.email.trim() || null,
        phone:            form.phone.trim() || null,
        current_employer: form.current_employer.trim() || null,
        current_title:    form.current_title.trim()    || null,
        years_experience: form.years_experience !== '' ? Number(form.years_experience) : null,
        source:           form.source,
        cover_letter:     form.cover_letter.trim() || null,
        notes:            form.notes.trim()        || null,
        rating:           form.rating !== '' ? Number(form.rating) : null,
        stage:            form.stage,
        updated_at:       new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase.from('job_applicants').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)
        toast.success('Applicant updated')
      } else {
        const { error } = await supabase.from('job_applicants').insert([{
          id:         crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...payload,
        }])
        if (error) throw new Error(error.message)
        toast.success('Applicant added')
      }
      closeModal()
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Advance stage ─────────────────────────────────────────
  const nextStage = (current) => {
    const active = ['Applied', 'Screening', 'Interview', 'Assessment', 'Offer', 'Hired']
    const idx = active.indexOf(current)
    return idx >= 0 && idx < active.length - 1 ? active[idx + 1] : null
  }

  const handleAdvance = async () => {
    const app = advanceModal.applicant
    if (!app) return
    const next = nextStage(app.stage)
    if (!next) return
    setAdvancing(true)
    try {
      const { error } = await supabase
        .from('job_applicants')
        .update({ stage: next, updated_at: new Date().toISOString() })
        .eq('id', app.id)
      if (error) throw new Error(error.message)
      toast.success(`Advanced to ${next}`)
      setAdvanceModal({ open: false, applicant: null })
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAdvancing(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete.id) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('job_applicants').delete().eq('id', confirmDelete.id)
      if (error) throw new Error(error.message)
      toast.success('Applicant removed')
      setConfirmDelete({ open: false, id: null, name: '' })
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  const fullName   = (a) => `${a.first_name} ${a.last_name}`
  const jobTitle   = (a) => a.job_openings?.job_title || jobOpenings.find(j => j.id === a.job_opening_id)?.job_title || '—'
  const appIvs     = (id) => interviews.filter(iv => iv.applicant_id === id)

  const canAdvance = (app) => !['Hired', 'Rejected', 'Withdrawn'].includes(app.stage) && nextStage(app.stage)
  const canRemove  = (app) => ['Applied', 'Rejected', 'Withdrawn'].includes(app.stage)

  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader title="Applicants" subtitle="Track candidates through the recruitment pipeline">
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>person_add</span>
            Add Applicant
          </button>
        )}
      </PageHeader>

      {/* ── KPI strip ────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard label="Total"        value={kpis.total}     icon="people"            />
        <KPICard label="Applied"      value={kpis.applied}   icon="inbox"             color="blue"  />
        <KPICard label="Interviewing" value={kpis.interview} icon="record_voice_over" color="teal"  />
        <KPICard label="Offers Sent"  value={kpis.offers}    icon="local_offer"       color="gold"  />
        <KPICard label="Hired"        value={kpis.hired}     icon="how_to_reg"        color="green" />
        <KPICard label="Rejected"     value={kpis.rejected}  icon="person_remove"     color="red"   />
      </div>

      {/* ── Pipeline pills ───────────────────────────────── */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Pipeline
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {PIPELINE_STAGES.map((stage, idx) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className={filterStage === stage ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setFilterStage(prev => prev === stage ? '' : stage)}
                style={{ borderLeft: `3px solid ${STAGE_COLOR[stage]}`, borderRadius: 4 }}
              >
                {stage}
                <span style={{
                  marginLeft: 6,
                  background: STAGE_COLOR[stage],
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {stageCounts[stage] || 0}
                </span>
              </button>
              {idx < PIPELINE_STAGES.length - 1 && (
                <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>chevron_right</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: 260 }} value={filterJob}
          onChange={e => setFilterJob(e.target.value)}>
          <option value="">All Job Openings</option>
          {jobOpenings.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
        </select>
        <select className="form-control" style={{ width: 180 }} value={filterStage}
          onChange={e => setFilterStage(e.target.value)}>
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        {(filterJob || filterStage) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterJob(''); setFilterStage('') }}>
            <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear Filters
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24 }}>
            <EmptyState icon="person_search" message="No applicants found"
              action={canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>Add Applicant</button>}
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Job</th>
                  <th>Stage</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'center' }}>Exp (yrs)</th>
                  <th>Rating</th>
                  <th>Applied</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => (
                  <tr key={app.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{fullName(app)}</div>
                      {app.email && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{app.email}</div>}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{jobTitle(app)}</td>
                    <td>
                      <StatusBadge status={app.stage?.toLowerCase()} label={app.stage} />
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{app.source || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{app.years_experience ?? '—'}</td>
                    <td><StarRating value={app.rating} /></td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{fmt(app.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group-sm">
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => setViewModal({ open: true, applicant: app })}
                          title="View details">
                          <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                        </button>
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(app)}
                            title="Edit">
                            <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                          </button>
                        )}
                        {canEdit && canAdvance(app) && (
                          <button className="btn btn-primary btn-sm"
                            onClick={() => setAdvanceModal({ open: true, applicant: app })}
                            title={`Advance to ${nextStage(app.stage)}`}>
                            <span className="material-icons" style={{ fontSize: 14 }}>arrow_forward</span>
                          </button>
                        )}
                        {canEdit && canRemove(app) && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDelete({ open: true, id: app.id, name: fullName(app) })}
                            title="Remove">
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

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit · Applicant' : 'Add · Applicant'}
        size="lg"
      >
        <div className="form-group">
          <label>Job Opening *</label>
          <select className="form-control" value={form.job_opening_id} onChange={f('job_opening_id')}>
            <option value="">Select a job opening…</option>
            {jobOpenings.map(j => <option key={j.id} value={j.id}>{j.job_title}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>First Name *</label>
            <input className="form-control" value={form.first_name} onChange={f('first_name')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Last Name *</label>
            <input className="form-control" value={form.last_name} onChange={f('last_name')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" className="form-control" value={form.email} onChange={f('email')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Phone</label>
            <input className="form-control" value={form.phone} onChange={f('phone')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Current Employer</label>
            <input className="form-control" value={form.current_employer} onChange={f('current_employer')} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Current Title</label>
            <input className="form-control" value={form.current_title} onChange={f('current_title')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Years of Experience</label>
            <input type="number" className="form-control" min="0" max="50"
              value={form.years_experience} onChange={f('years_experience')} placeholder="0" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Source</label>
            <select className="form-control" value={form.source} onChange={f('source')}>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Rating (1–5)</label>
            <select className="form-control" value={form.rating} onChange={f('rating')}>
              <option value="">No rating</option>
              {RATINGS.map(r => <option key={r} value={r}>{r} star{r > 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Stage</label>
            <select className="form-control" value={form.stage} onChange={f('stage')}>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Cover Letter / Summary</label>
          <textarea className="form-control" rows="3" value={form.cover_letter} onChange={f('cover_letter')}
            placeholder="Applicant's cover letter or summary…" />
        </div>

        <div className="form-group">
          <label>Internal Notes</label>
          <textarea className="form-control" rows="2" value={form.notes} onChange={f('notes')}
            placeholder="Private notes visible to HR only…" />
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Applicant'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── View Detail Modal ────────────────────────────── */}
      {viewModal.open && viewModal.applicant && (
        <ModalDialog
          open={viewModal.open}
          onClose={() => setViewModal({ open: false, applicant: null })}
          title={`Applicant · ${fullName(viewModal.applicant)}`}
          size="lg"
        >
          {(() => {
            const app = viewModal.applicant
            const ivList = appIvs(app.id)
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}>
                  {[
                    ['Job',              jobTitle(app)],
                    ['Stage',            <StatusBadge key="s" status={app.stage?.toLowerCase()} label={app.stage} />],
                    ['Email',            app.email      || '—'],
                    ['Phone',            app.phone      || '—'],
                    ['Current Employer', app.current_employer || '—'],
                    ['Current Title',    app.current_title    || '—'],
                    ['Experience',       app.years_experience != null ? `${app.years_experience} yr${app.years_experience !== 1 ? 's' : ''}` : '—'],
                    ['Source',           app.source || '—'],
                    ['Rating',           <StarRating key="r" value={app.rating} />],
                    ['Applied',          fmt(app.created_at)],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                    </div>
                  ))}
                </div>

                {app.cover_letter && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Cover Letter</div>
                    <div style={{ fontSize: 13, background: 'var(--surface2)', padding: '10px 14px', borderRadius: 6, lineHeight: 1.6 }}>
                      {app.cover_letter}
                    </div>
                  </div>
                )}
                {app.notes && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Internal Notes</div>
                    <div style={{ fontSize: 13, background: 'var(--surface2)', padding: '10px 14px', borderRadius: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
                      {app.notes}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Interviews ({ivList.length})
                  </div>
                  {ivList.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No interviews scheduled yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {ivList.map(iv => (
                        <div key={iv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{iv.interview_type}</span>
                            <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 8 }}>
                              {iv.scheduled_date ? new Date(iv.scheduled_date).toLocaleString('en-GB') : '—'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <StatusBadge status={iv.status?.toLowerCase()} label={iv.status} />
                            {iv.outcome && <StatusBadge status={iv.outcome?.toLowerCase()} label={iv.outcome} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <ModalActions>
                  {canEdit && (
                    <button className="btn btn-secondary" onClick={() => { setViewModal({ open: false, applicant: null }); openEdit(app) }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={() => setViewModal({ open: false, applicant: null })}>
                    Close
                  </button>
                </ModalActions>
              </>
            )
          })()}
        </ModalDialog>
      )}

      {/* ── Advance Stage Confirm ────────────────────────── */}
      {advanceModal.open && advanceModal.applicant && (
        <ConfirmDialog
          open={advanceModal.open}
          onClose={() => setAdvanceModal({ open: false, applicant: null })}
          onConfirm={handleAdvance}
          title="Advance Stage"
          message={`Move ${fullName(advanceModal.applicant)} from "${advanceModal.applicant.stage}" to "${nextStage(advanceModal.applicant.stage)}"?`}
          confirmLabel="Advance"
          loading={advancing}
        />
      )}

      {/* ── Confirm Remove ───────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, name: '' })}
        onConfirm={handleDelete}
        title="Remove Applicant"
        message={`Remove "${confirmDelete.name}" from the applicant list? This cannot be undone.`}
        confirmLabel="Remove"
        danger
        loading={deleting}
      />
    </div>
  )
}
