// src/pages/HR/PeerFeedback.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'

// ── Rating bar ─────────────────────────────────────────────────
function RatingBar({ rating }) {
  const pct = Math.min(Math.max((rating / 5) * 100, 0), 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, minWidth: 28 }}>{rating}</span>
    </div>
  )
}

// ── Star selector ──────────────────────────────────────────────
function StarSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{ fontSize: 22, cursor: 'pointer', color: i <= (hovered || value) ? 'var(--gold)' : 'var(--text-dim)', transition: 'color .1s' }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
        >★</span>
      ))}
    </span>
  )
}

const emptyForm = () => ({
  employee_id: '',
  reviewer_name: '',
  appraisal_period_id: '',
  feedback: '',
  ratings: [],
})

const emptyCriteria = () => ({ criteria: '', rating: 0, comments: '' })

export default function PeerFeedback() {
  const { employees } = useHR()

  const [periods,         setPeriods]         = useState([])
  const [feedbackList,    setFeedbackList]     = useState([])
  const [loading,         setLoading]         = useState(false)

  const [selectedEmpId,   setSelectedEmpId]   = useState('')
  const [filterPeriodId,  setFilterPeriodId]  = useState('')

  const [showAdd,         setShowAdd]         = useState(false)
  const [form,            setForm]            = useState(emptyForm())
  const [saving,          setSaving]          = useState(false)
  const [deleteItem,      setDeleteItem]      = useState(null)

  // Fetch appraisal periods once
  useEffect(() => {
    supabase
      .from('appraisal_periods')
      .select('id, name, start_date, end_date')
      .order('start_date', { ascending: false })
      .then(({ data }) => setPeriods(data || []))
  }, [])

  // Fetch feedback for selected employee
  const fetchFeedback = useCallback(async () => {
    if (!selectedEmpId) { setFeedbackList([]); return }
    setLoading(true)
    let query = supabase
      .from('performance_feedback')
      .select('*, ratings:feedback_ratings(id,criteria,rating,comments)')
      .eq('employee_id', selectedEmpId)
      .order('added_on', { ascending: false })
    if (filterPeriodId) query = query.eq('appraisal_period_id', filterPeriodId)
    const { data, error } = await query
    if (error) toast.error('Failed to load feedback')
    setFeedbackList(data || [])
    setLoading(false)
  }, [selectedEmpId, filterPeriodId])

  useEffect(() => { fetchFeedback() }, [fetchFeedback])

  const handleAddCriteria = () => setForm(f => ({ ...f, ratings: [...f.ratings, emptyCriteria()] }))
  const handleRemoveCriteria = idx => setForm(f => ({ ...f, ratings: f.ratings.filter((_, i) => i !== idx) }))
  const handleCriteriaChange = (idx, key, val) => setForm(f => ({
    ...f,
    ratings: f.ratings.map((r, i) => i === idx ? { ...r, [key]: val } : r),
  }))

  const handleSave = async () => {
    if (!form.employee_id)    { toast.error('Employee is required');       return }
    if (!form.reviewer_name?.trim()) { toast.error('Reviewer name is required'); return }
    if (!form.feedback?.trim())      { toast.error('Feedback text is required'); return }
    setSaving(true)
    try {
      const validRatings  = form.ratings.filter(r => r.criteria?.trim() && r.rating >= 1)
      const total_score   = validRatings.length
        ? validRatings.reduce((s, r) => s + parseFloat(r.rating), 0) / validRatings.length
        : null

      const fbId = crypto.randomUUID()
      const { error: fbErr } = await supabase.from('performance_feedback').insert([{
        id:                  fbId,
        employee_id:         form.employee_id,
        reviewer_name:       form.reviewer_name,
        appraisal_period_id: form.appraisal_period_id || null,
        total_score:         total_score,
        feedback:            form.feedback,
        added_on:            new Date().toISOString().split('T')[0],
      }])
      if (fbErr) throw fbErr

      if (validRatings.length) {
        const { error: rErr } = await supabase.from('feedback_ratings').insert(
          validRatings.map(r => ({
            id:          crypto.randomUUID(),
            feedback_id: fbId,
            criteria:    r.criteria,
            rating:      parseFloat(r.rating),
            comments:    r.comments || null,
          }))
        )
        if (rErr) throw rErr
      }

      toast.success('Feedback submitted')
      setShowAdd(false)
      setForm(emptyForm())
      fetchFeedback()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await supabase.from('feedback_ratings').delete().eq('feedback_id', deleteItem.id)
    const { error } = await supabase.from('performance_feedback').delete().eq('id', deleteItem.id)
    if (error) { toast.error(error.message); return }
    toast.success('Feedback deleted')
    setDeleteItem(null)
    fetchFeedback()
  }

  // KPI
  const kpi = {
    total:    feedbackList.length,
    avgScore: (() => {
      const scored = feedbackList.filter(f => f.total_score != null)
      return scored.length ? (scored.reduce((s, f) => s + parseFloat(f.total_score), 0) / scored.length).toFixed(1) : '—'
    })(),
    periods: [...new Set(feedbackList.map(f => f.appraisal_period_id).filter(Boolean))].length,
  }

  const openAdd = () => {
    setForm({ ...emptyForm(), employee_id: selectedEmpId })
    setShowAdd(true)
  }

  return (
    <div>
      <PageHeader title="Peer Feedback">
        <button className="btn btn-primary btn-sm" onClick={openAdd} disabled={!selectedEmpId}>
          <span className="material-icons">add</span> Give Feedback
        </button>
      </PageHeader>

      {/* Left panel: selectors + Right panel: content */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left panel ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Employee</label>
            <select
              className="form-control"
              value={selectedEmpId}
              onChange={e => setSelectedEmpId(e.target.value)}
            >
              <option value="">— Select —</option>
              {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Appraisal Period</label>
            <select
              className="form-control"
              value={filterPeriodId}
              onChange={e => setFilterPeriodId(e.target.value)}
            >
              <option value="">All periods</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div>
          {!selectedEmpId ? (
            <EmptyState icon="people" message="Select an employee to view their peer feedback." />
          ) : loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : (
            <>
              {/* KPI strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Feedback', value: kpi.total },
                  { label: 'Avg Score',      value: kpi.avgScore },
                  { label: 'Periods',        value: kpi.periods },
                ].map(k => (
                  <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>{k.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {feedbackList.length === 0 ? (
                <EmptyState icon="rate_review" message="No feedback found for this employee." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {feedbackList.map(fb => {
                    const avgScore = fb.ratings?.length
                      ? (fb.ratings.reduce((s, r) => s + parseFloat(r.rating), 0) / fb.ratings.length).toFixed(1)
                      : null
                    const period = periods.find(p => p.id === fb.appraisal_period_id)
                    return (
                      <div key={fb.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                        {/* Card header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{fb.reviewer_name || '—'}</span>
                            {fb.added_on && (
                              <span style={{ marginLeft: 10, fontSize: 12, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text-dim)' }}>
                                {fb.added_on}
                              </span>
                            )}
                            {period && (
                              <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px', borderRadius: 20, background: 'var(--blue)22', color: 'var(--blue)' }}>
                                {period.name}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {avgScore && (
                              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--gold)22', color: 'var(--gold)', border: '1px solid var(--gold)44' }}>
                                ★ {avgScore}
                              </span>
                            )}
                            <button className="btn btn-xs btn-danger" onClick={() => setDeleteItem(fb)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Feedback text */}
                        {fb.feedback && (
                          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                            {fb.feedback}
                          </div>
                        )}

                        {/* Ratings breakdown */}
                        {fb.ratings?.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Ratings</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-dim)', paddingBottom: 6, width: '35%' }}>Criteria</th>
                                  <th style={{ fontSize: 11, color: 'var(--text-dim)', paddingBottom: 6, width: '50%' }}>Rating</th>
                                  <th style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)', paddingBottom: 6, width: '15%' }}>Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fb.ratings.map(r => (
                                  <tr key={r.id}>
                                    <td style={{ padding: '4px 0', fontSize: 13 }}>{r.criteria}</td>
                                    <td style={{ padding: '4px 8px' }}>
                                      <RatingBar rating={parseFloat(r.rating)} />
                                    </td>
                                    <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>{r.rating}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {r => r.comments && (
                              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>{r.comments}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── ADD FEEDBACK MODAL ── */}
      <ModalDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Give Peer Feedback"
        size="lg"
      >
        <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
                <option value="">— Select —</option>
                {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Reviewer Name *</label>
              <input
                className="form-control"
                placeholder="e.g. John Smith"
                value={form.reviewer_name}
                onChange={e => setForm(f => ({ ...f, reviewer_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Appraisal Period</label>
            <select className="form-control" value={form.appraisal_period_id} onChange={e => setForm(f => ({ ...f, appraisal_period_id: e.target.value }))}>
              <option value="">— None —</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Feedback *</label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Overall feedback on the employee's performance…"
              value={form.feedback}
              onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))}
            />
          </div>

          {/* Ratings section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 0 }}>Ratings (optional)</label>
              <button className="btn btn-secondary btn-sm" onClick={handleAddCriteria} style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Criteria
              </button>
            </div>
            {form.ratings.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>
                No rating criteria yet. Click "+ Add Criteria" to add one.
              </div>
            )}
            {form.ratings.map((row, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', marginBottom: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    className="form-control"
                    placeholder="Criteria name (e.g. Teamwork)"
                    value={row.criteria}
                    onChange={e => handleCriteriaChange(idx, 'criteria', e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                  <input
                    className="form-control"
                    placeholder="Comments (optional)"
                    value={row.comments}
                    onChange={e => handleCriteriaChange(idx, 'comments', e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
                <StarSelector value={row.rating} onChange={v => handleCriteriaChange(idx, 'rating', v)} />
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
                  onClick={() => handleRemoveCriteria(idx)}
                  title="Remove"
                >×</button>
              </div>
            ))}
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Feedback"
        message={`Delete feedback from "${deleteItem?.reviewer_name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
