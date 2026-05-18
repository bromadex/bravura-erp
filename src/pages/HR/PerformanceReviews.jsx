// src/pages/HR/PerformanceReviews.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, TabNav, SectionCard, Spinner
} from '../../components/ui'

// ── Rating helpers ─────────────────────────────────────────────
const RATING_MAP = {
  5: { label: 'Exceptional', color: 'var(--gold)'   },
  4: { label: 'Exceeds',     color: 'var(--green)'  },
  3: { label: 'Meets',       color: 'var(--blue)'   },
  2: { label: 'Below',       color: 'var(--yellow)' },
  1: { label: 'Poor',        color: 'var(--red)'    },
}

function RatingBadge({ value }) {
  if (!value) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  const r = RATING_MAP[Number(value)]
  if (!r) return <span>{value}</span>
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700,
      background: r.color + '22', color: r.color, border: `1px solid ${r.color}44`,
    }}>
      {value} – {r.label}
    </span>
  )
}

function RatingSelect({ value, onChange, disabled }) {
  return (
    <select
      className="form-control"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">— Not rated —</option>
      {[1, 2, 3, 4, 5].map(n => (
        <option key={n} value={n}>{n} – {RATING_MAP[n].label}</option>
      ))}
    </select>
  )
}

const REVIEW_STATUSES = ['Draft', 'Self Review', 'Manager Review', 'Completed']

const BLANK_GOAL = {
  goal_title: '', weight: 10, target_value: '', actual_value: '',
  score: '', manager_score: '', comments: '',
}

const BLANK_SUMMARY = {
  self_rating: '', overall_rating: '',
  strengths: '', development_areas: '',
  manager_comments: '', employee_comments: '',
}

export default function PerformanceReviews() {
  const { user } = useAuth()
  const canEdit    = useCanEdit('hr', 'performance_reviews')
  const canApprove = useCanApprove('hr', 'performance_reviews')

  // ── Data ───────────────────────────────────────────────────────
  const [reviews,      setReviews]      = useState([])
  const [periods,      setPeriods]      = useState([])
  const [departments,  setDepartments]  = useState([])
  const [templates,    setTemplates]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  // ── Filters ────────────────────────────────────────────────────
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterDept,   setFilterDept]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── Generate modal ─────────────────────────────────────────────
  const [genModal,    setGenModal]    = useState(false)
  const [genPeriodId, setGenPeriodId] = useState('')
  const [generating,  setGenerating]  = useState(false)

  // ── Review detail modal ────────────────────────────────────────
  const [reviewModal,  setReviewModal]  = useState(false)
  const [activeReview, setActiveReview] = useState(null)
  const [activeTab,    setActiveTab]    = useState('goals')
  const [goals,        setGoals]        = useState([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [summary,      setSummary]      = useState(BLANK_SUMMARY)
  const [editGoalIdx,  setEditGoalIdx]  = useState(null)
  const [goalForm,     setGoalForm]     = useState(BLANK_GOAL)

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('performance_reviews')
        .select('*, employees(name, department_id, departments:department_id(name)), appraisal_periods(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setReviews(data || [])
    } catch (err) {
      toast.error('Failed to load reviews: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPeriods = useCallback(async () => {
    const { data } = await supabase
      .from('appraisal_periods')
      .select('id, name, status')
      .order('start_date', { ascending: false })
    setPeriods(data || [])
  }, [])

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase
      .from('departments').select('id, name').order('name')
    setDepartments(data || [])
  }, [])

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('kpi_templates')
      .select('id, name, default_weight, unit')
      .eq('is_active', true).order('name')
    setTemplates(data || [])
  }, [])

  useEffect(() => {
    fetchReviews()
    fetchPeriods()
    fetchDepartments()
    fetchTemplates()
  }, [fetchReviews, fetchPeriods, fetchDepartments, fetchTemplates])

  // ── KPIs ───────────────────────────────────────────────────────
  const kpiTotal     = reviews.length
  const kpiSelfPend  = reviews.filter(r => r.status === 'Self Review').length
  const kpiMgrPend   = reviews.filter(r => r.status === 'Manager Review').length
  const kpiCompleted = reviews.filter(r => r.status === 'Completed').length

  const filtered = reviews.filter(r => {
    if (filterPeriod && r.appraisal_period_id !== filterPeriod)   return false
    if (filterStatus && r.status !== filterStatus)                 return false
    if (filterDept   && r.employees?.department_id !== filterDept) return false
    return true
  })

  // ── Generate reviews ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genPeriodId) return toast.error('Select a period')
    setGenerating(true)
    try {
      const { data: emps, error: empErr } = await supabase
        .from('employees').select('id').eq('status', 'Active')
      if (empErr) throw empErr
      if (!emps?.length) { toast.error('No active employees found'); return }

      const { data: existing } = await supabase
        .from('performance_reviews').select('employee_id')
        .eq('appraisal_period_id', genPeriodId)

      const existingIds = new Set((existing || []).map(r => r.employee_id))
      const toCreate = emps.filter(e => !existingIds.has(e.id))

      if (!toCreate.length) {
        toast.error('All active employees already have a review for this period')
        return
      }

      const rows = toCreate.map(emp => ({
        id: crypto.randomUUID(),
        appraisal_period_id: genPeriodId,
        employee_id: emp.id,
        status: 'Draft',
      }))

      const { error: insErr } = await supabase.from('performance_reviews').insert(rows)
      if (insErr) throw insErr

      toast.success(`Created ${rows.length} review(s)`)
      setGenModal(false)
      setGenPeriodId('')
      await fetchReviews()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Open review modal ──────────────────────────────────────────
  const openReview = async (review) => {
    setActiveReview(review)
    setSummary({
      self_rating:       review.self_rating        || '',
      overall_rating:    review.overall_rating     || '',
      strengths:         review.strengths          || '',
      development_areas: review.development_areas  || '',
      manager_comments:  review.manager_comments   || '',
      employee_comments: review.employee_comments  || '',
    })
    setActiveTab('goals')
    setEditGoalIdx(null)
    setGoalForm(BLANK_GOAL)
    setReviewModal(true)
    setGoalsLoading(true)
    try {
      const { data, error } = await supabase
        .from('performance_goals').select('*')
        .eq('review_id', review.id).order('created_at', { ascending: true })
      if (error) throw error
      setGoals(data || [])
    } catch (err) {
      toast.error('Failed to load goals: ' + err.message)
      setGoals([])
    } finally {
      setGoalsLoading(false)
    }
  }

  const closeReview = () => {
    setReviewModal(false); setActiveReview(null); setGoals([]); setEditGoalIdx(null)
  }

  // ── Save summary ───────────────────────────────────────────────
  const handleSaveSummary = async () => {
    if (!activeReview) return
    setSaving(true)
    try {
      const { error } = await supabase.from('performance_reviews').update({
        self_rating:       summary.self_rating       ? Number(summary.self_rating)    : null,
        overall_rating:    summary.overall_rating    ? Number(summary.overall_rating) : null,
        strengths:         summary.strengths.trim()         || null,
        development_areas: summary.development_areas.trim() || null,
        manager_comments:  summary.manager_comments.trim()  || null,
        employee_comments: summary.employee_comments.trim() || null,
      }).eq('id', activeReview.id)
      if (error) throw error
      toast.success('Summary saved')
      await fetchReviews()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Goal CRUD ──────────────────────────────────────────────────
  const refreshGoals = async () => {
    const { data } = await supabase
      .from('performance_goals').select('*')
      .eq('review_id', activeReview.id).order('created_at', { ascending: true })
    setGoals(data || [])
  }

  const handleSaveGoal = async () => {
    if (!goalForm.goal_title.trim()) return toast.error('Goal title required')
    setSaving(true)
    try {
      const payload = {
        review_id:     activeReview.id,
        goal_title:    goalForm.goal_title.trim(),
        weight:        Number(goalForm.weight)         || 10,
        target_value:  goalForm.target_value.trim()    || null,
        actual_value:  goalForm.actual_value.trim()    || null,
        score:         goalForm.score         ? Number(goalForm.score)         : null,
        manager_score: goalForm.manager_score ? Number(goalForm.manager_score) : null,
        comments:      goalForm.comments.trim()        || null,
      }
      if (editGoalIdx === 'new') {
        const { error } = await supabase.from('performance_goals')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Goal added')
      } else {
        const { error } = await supabase.from('performance_goals')
          .update(payload).eq('id', goals[editGoalIdx].id)
        if (error) throw error
        toast.success('Goal updated')
      }
      setEditGoalIdx(null)
      await refreshGoals()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGoal = async (goal) => {
    if (!window.confirm(`Delete goal "${goal.goal_title}"?`)) return
    try {
      const { error } = await supabase.from('performance_goals').delete().eq('id', goal.id)
      if (error) throw error
      setGoals(prev => prev.filter(g => g.id !== goal.id))
      toast.success('Goal deleted')
    } catch (err) { toast.error(err.message) }
  }

  const addFromTemplate = (tpl) => {
    setEditGoalIdx('new')
    setGoalForm({ goal_title: tpl.name, weight: tpl.default_weight || 10,
      target_value: '', actual_value: '', score: '', manager_score: '', comments: '' })
  }

  // ── Status transitions ─────────────────────────────────────────
  const handleTransition = async (newStatus) => {
    if (!activeReview) return
    setSaving(true)
    try {
      const updates = { status: newStatus }
      if (newStatus === 'Completed') {
        updates.completed_at = new Date().toISOString()
        if (summary.overall_rating) updates.overall_rating = Number(summary.overall_rating)
      }
      const { error } = await supabase.from('performance_reviews')
        .update(updates).eq('id', activeReview.id)
      if (error) throw error
      toast.success(`Status → ${newStatus}`)
      setActiveReview(prev => ({ ...prev, ...updates }))
      await fetchReviews()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Performance Reviews">
        {canApprove && (
          <button className="btn btn-primary" onClick={() => { setGenPeriodId(''); setGenModal(true) }}>
            <span className="material-icons">auto_awesome</span> Generate Reviews
          </button>
        )}
      </PageHeader>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPICard label="Total Reviews"          value={kpiTotal}     icon="rate_review" />
        <KPICard label="Self Review Pending"    value={kpiSelfPend}  icon="person"             color="yellow" />
        <KPICard label="Manager Review Pending" value={kpiMgrPend}   icon="supervisor_account" color="blue" />
        <KPICard label="Completed"              value={kpiCompleted} icon="check_circle"        color="green" />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-control" style={{ width: 'auto', minWidth: 180 }}
          value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
          <option value="">All Periods</option>
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto', minWidth: 160 }}
          value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto', minWidth: 160 }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {REVIEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterPeriod || filterDept || filterStatus) && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setFilterPeriod(''); setFilterDept(''); setFilterStatus('') }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Period</th>
              <th>Self Rating</th><th>Overall Rating</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}><Spinner size="sm" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="7"><EmptyState icon="rate_review" message="No reviews found" /></td></tr>
            ) : filtered.map(review => (
              <tr key={review.id}>
                <td style={{ fontWeight: 600 }}>{review.employees?.name || '—'}</td>
                <td>{review.employees?.departments?.name || '—'}</td>
                <td>{review.appraisal_periods?.name || '—'}</td>
                <td><RatingBadge value={review.self_rating} /></td>
                <td><RatingBadge value={review.overall_rating} /></td>
                <td>
                  <StatusBadge
                    status={review.status?.toLowerCase().replace(/ /g, '_')}
                    label={review.status}
                  />
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openReview(review)}>
                    <span className="material-icons" style={{ fontSize: 15 }}>open_in_new</span> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Generate Modal ──────────────────────────────────────── */}
      <ModalDialog open={genModal} onClose={() => setGenModal(false)} title="Generate Reviews">
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
          Creates one review record per active employee for the selected period.
          Employees who already have a review for that period are skipped.
        </p>
        <div className="form-group">
          <label>Appraisal Period *</label>
          <select className="form-control" value={genPeriodId}
            onChange={e => setGenPeriodId(e.target.value)}>
            <option value="">Select period…</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
            ))}
          </select>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setGenModal(false)} disabled={generating}>Cancel</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating || !genPeriodId}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Review Detail Modal ─────────────────────────────────── */}
      {reviewModal && activeReview && (
        <div className="overlay" onClick={closeReview}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 820, width: '95vw' }}>

            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              Review · <span>{activeReview.employees?.name || '—'}</span>
              <StatusBadge
                status={activeReview.status?.toLowerCase().replace(/ /g, '_')}
                label={activeReview.status}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              {activeReview.appraisal_periods?.name || '—'}&nbsp;·&nbsp;
              {activeReview.employees?.departments?.name || '—'}
            </div>

            <TabNav
              tabs={[
                { id: 'goals',   label: 'Goals',   icon: 'flag',      count: goals.length },
                { id: 'summary', label: 'Summary', icon: 'summarize' },
              ]}
              active={activeTab}
              onChange={tab => { setActiveTab(tab); setEditGoalIdx(null) }}
            />

            <div style={{ marginTop: 16, minHeight: 200 }}>

              {/* Goals Tab */}
              {activeTab === 'goals' && (
                <div>
                  {goalsLoading ? <Spinner text="Loading goals…" /> : (
                    <>
                      {goals.length === 0 && editGoalIdx === null && (
                        <EmptyState icon="flag" message="No goals added yet" />
                      )}

                      {goals.length > 0 && editGoalIdx === null && (
                        <div className="table-wrap" style={{ marginBottom: 12 }}>
                          <table className="stock-table">
                            <thead>
                              <tr>
                                <th>Goal</th>
                                <th style={{ width: 55 }}>Wt%</th>
                                <th>Target</th><th>Actual</th>
                                <th>Self</th><th>Manager</th><th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {goals.map((goal, idx) => (
                                <tr key={goal.id}>
                                  <td style={{ fontWeight: 600 }}>{goal.goal_title}</td>
                                  <td style={{ textAlign: 'center' }}>{goal.weight ?? '—'}</td>
                                  <td>{goal.target_value || '—'}</td>
                                  <td>{goal.actual_value || '—'}</td>
                                  <td><RatingBadge value={goal.score} /></td>
                                  <td><RatingBadge value={goal.manager_score} /></td>
                                  <td>
                                    <div className="btn-group-sm">
                                      {canEdit && (
                                        <button className="btn btn-secondary btn-sm"
                                          onClick={() => {
                                            setEditGoalIdx(idx)
                                            setGoalForm({
                                              goal_title:    goal.goal_title,
                                              weight:        goal.weight ?? 10,
                                              target_value:  goal.target_value  || '',
                                              actual_value:  goal.actual_value  || '',
                                              score:         goal.score         || '',
                                              manager_score: goal.manager_score || '',
                                              comments:      goal.comments      || '',
                                            })
                                          }}>
                                          <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                                        </button>
                                      )}
                                      {canEdit && (
                                        <button className="btn btn-danger btn-sm"
                                          onClick={() => handleDeleteGoal(goal)}>
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

                      {/* Inline goal form */}
                      {editGoalIdx !== null && (
                        <SectionCard title={editGoalIdx === 'new' ? 'Add Goal' : 'Edit Goal'} mb={12}>
                          <div className="form-group">
                            <label>Goal Title *</label>
                            <input className="form-control" value={goalForm.goal_title}
                              onChange={e => setGoalForm({ ...goalForm, goal_title: e.target.value })}
                              placeholder="e.g. Increase sales by 20%" />
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Weight (%)</label>
                              <input type="number" min="1" max="100" className="form-control"
                                value={goalForm.weight}
                                onChange={e => setGoalForm({ ...goalForm, weight: e.target.value })} />
                            </div>
                            <div className="form-group">
                              <label>Target</label>
                              <input className="form-control" value={goalForm.target_value}
                                onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })}
                                placeholder="e.g. 100 units" />
                            </div>
                            <div className="form-group">
                              <label>Actual</label>
                              <input className="form-control" value={goalForm.actual_value}
                                onChange={e => setGoalForm({ ...goalForm, actual_value: e.target.value })}
                                placeholder="Actual result" />
                            </div>
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Self Score</label>
                              <RatingSelect value={goalForm.score}
                                onChange={v => setGoalForm({ ...goalForm, score: v })} />
                            </div>
                            <div className="form-group">
                              <label>Manager Score</label>
                              <RatingSelect value={goalForm.manager_score}
                                onChange={v => setGoalForm({ ...goalForm, manager_score: v })}
                                disabled={!canApprove} />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Comments</label>
                            <textarea className="form-control" rows="2" value={goalForm.comments}
                              onChange={e => setGoalForm({ ...goalForm, comments: e.target.value })} />
                          </div>
                          <div className="btn-group-sm">
                            <button className="btn btn-primary btn-sm" onClick={handleSaveGoal} disabled={saving}>
                              {saving ? 'Saving…' : 'Save Goal'}
                            </button>
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => setEditGoalIdx(null)} disabled={saving}>
                              Cancel
                            </button>
                          </div>
                        </SectionCard>
                      )}

                      {/* Add goal buttons */}
                      {editGoalIdx === null && canEdit && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => { setEditGoalIdx('new'); setGoalForm(BLANK_GOAL) }}>
                            <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Goal
                          </button>
                          {templates.length > 0 && (
                            <select className="form-control"
                              style={{ width: 'auto', minWidth: 220, fontSize: 12 }}
                              value=""
                              onChange={e => {
                                const tpl = templates.find(t => t.id === e.target.value)
                                if (tpl) addFromTemplate(tpl)
                              }}>
                              <option value="">+ Quick-add from KPI template…</option>
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Summary Tab */}
              {activeTab === 'summary' && (
                <div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Self Rating (1–5)</label>
                      <RatingSelect value={summary.self_rating}
                        onChange={v => setSummary({ ...summary, self_rating: v })} />
                    </div>
                    <div className="form-group">
                      <label>Overall Rating (1–5)
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>Manager only</span>
                      </label>
                      <RatingSelect value={summary.overall_rating}
                        onChange={v => setSummary({ ...summary, overall_rating: v })}
                        disabled={!canApprove} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Strengths</label>
                    <textarea className="form-control" rows="3" value={summary.strengths}
                      onChange={e => setSummary({ ...summary, strengths: e.target.value })}
                      placeholder="Key strengths observed…" />
                  </div>
                  <div className="form-group">
                    <label>Development Areas</label>
                    <textarea className="form-control" rows="3" value={summary.development_areas}
                      onChange={e => setSummary({ ...summary, development_areas: e.target.value })}
                      placeholder="Areas for improvement…" />
                  </div>
                  <div className="form-group">
                    <label>Employee Comments</label>
                    <textarea className="form-control" rows="3" value={summary.employee_comments}
                      onChange={e => setSummary({ ...summary, employee_comments: e.target.value })}
                      placeholder="Employee's own comments…" />
                  </div>
                  {canApprove && (
                    <div className="form-group">
                      <label>Manager Comments</label>
                      <textarea className="form-control" rows="3" value={summary.manager_comments}
                        onChange={e => setSummary({ ...summary, manager_comments: e.target.value })}
                        placeholder="Manager's overall comments…" />
                    </div>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={handleSaveSummary} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Summary'}
                  </button>
                </div>
              )}
            </div>

            {/* Status transition footer */}
            <div style={{
              marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, flexWrap: 'wrap',
              alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activeReview.status === 'Draft' && canEdit && (
                  <button className="btn btn-primary"
                    onClick={() => handleTransition('Self Review')} disabled={saving}>
                    <span className="material-icons" style={{ fontSize: 16 }}>send</span> Submit for Self Review
                  </button>
                )}
                {activeReview.status === 'Self Review' && canEdit && (
                  <button className="btn btn-primary"
                    onClick={() => handleTransition('Manager Review')} disabled={saving}>
                    <span className="material-icons" style={{ fontSize: 16 }}>supervisor_account</span> Submit to Manager
                  </button>
                )}
                {activeReview.status === 'Manager Review' && canApprove && (
                  <button className="btn btn-primary"
                    onClick={() => handleTransition('Completed')} disabled={saving}>
                    <span className="material-icons" style={{ fontSize: 16 }}>check_circle</span> Mark Complete
                  </button>
                )}
              </div>
              <button className="btn btn-secondary" onClick={closeReview} disabled={saving}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
