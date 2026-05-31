// src/pages/Projects/ProjectTasks.jsx
// Phase P1.2 / P2 — Task Board: Kanban, List, Milestones, Gantt, Calendar

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

// ─── constants ────────────────────────────────────────────────────────────────
const STATUSES = ['open', 'in_progress', 'pending_review', 'blocked', 'completed', 'cancelled']
const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', pending_review: 'Pending Review',
  blocked: 'Blocked', completed: 'Completed', cancelled: 'Cancelled',
}
const STATUS_COLORS = {
  open: 'var(--blue)', in_progress: 'var(--teal)', pending_review: 'var(--gold)',
  blocked: 'var(--red)', completed: 'var(--green)', cancelled: 'var(--text-dim)',
}
const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
const PRIORITY_COLORS = {
  urgent: 'var(--red)', high: 'var(--gold)', medium: 'var(--blue)', low: 'var(--text-dim)',
}

const emptyForm = () => ({
  title: '', description: '', status: 'open', priority: 'medium',
  assignee_id: '', assignee_name: '', start_date: '', due_date: '',
  estimated_hours: '', actual_hours: '', completion_pct: 0,
  is_milestone: false, milestone_date: '', parent_task_id: '',
  depends_on_ids: [], tags: '', task_weight: 1,
})

// ─── helpers ──────────────────────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
function avatarColor(name) {
  const colors = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6']
  if (!name) return colors[0]
  return colors[name.charCodeAt(0) % colors.length]
}
function isOverdue(dueDate, status) {
  if (!dueDate) return false
  if (status === 'completed' || status === 'cancelled') return false
  return dueDate < new Date().toISOString().split('T')[0]
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}
function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}
function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function PriorityBadge({ priority }) {
  const label = PRIORITY_LABELS[priority] || priority
  const color = PRIORITY_COLORS[priority] || 'var(--text-dim)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 7px',
      background: `${color}22`, color, display: 'inline-block',
    }}>{label}</span>
  )
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-dim)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 7px',
      background: `${color}22`, color,
    }}>{STATUS_LABELS[status] || status}</span>
  )
}

// ─── Task Card (Kanban) ───────────────────────────────────────────────────────
function TaskCard({ task, allTasks, onDragStart, onClick }) {
  const subtasks = allTasks.filter(t => t.parent_task_id === task.id)
  const overdue = isOverdue(task.due_date, task.status)

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task)}
      onClick={() => onClick(task)}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px', marginBottom: 8, cursor: 'grab',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)', userSelect: 'none',
        transition: 'box-shadow .15s',
      }}
      onMouseOver={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,.12)'}
      onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.06)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, flex: 1, marginRight: 8 }}>
          {task.is_milestone && (
            <span style={{ color: 'var(--gold)', marginRight: 4 }}>◆</span>
          )}
          {task.title}
        </div>
        <PriorityBadge priority={task.priority} />
      </div>

      {task.description && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {task.description}
        </div>
      )}

      {/* Progress bar */}
      {task.completion_pct > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${task.completion_pct}%`,
              background: task.completion_pct === 100 ? 'var(--green)' : 'var(--blue)',
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {task.assignee_name && (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: avatarColor(task.assignee_name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: '#fff',
            }}>
              {initials(task.assignee_name)}
            </div>
          )}
          {subtasks.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px' }}>
              {subtasks.length} sub
            </span>
          )}
        </div>
        {task.due_date && (
          <span style={{ fontSize: 10, color: overdue ? 'var(--red)' : 'var(--text-dim)', fontWeight: overdue ? 700 : 400 }}>
            {overdue && '⚠ '}{fmtDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ status, tasks, allTasks, onDragOver, onDrop, onDragLeave, isDragOver, onCardClick, onDragStart }) {
  const color = STATUS_COLORS[status]
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(status) }}
      onDrop={e => onDrop(e, status)}
      onDragLeave={onDragLeave}
      style={{
        minWidth: 280, width: 280, background: isDragOver ? `${color}0a` : 'var(--surface2)',
        border: isDragOver ? `2px dashed ${color}` : '2px dashed transparent',
        borderRadius: 12, padding: '12px 10px', display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 260px)', transition: 'border .15s, background .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 4 }}>
        <div style={{ width: 3, height: 16, background: color, borderRadius: 2 }} />
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{STATUS_LABELS[status]}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, background: `${color}22`, color,
          borderRadius: 12, padding: '1px 7px', marginLeft: 'auto',
        }}>{tasks.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            allTasks={allTasks}
            onDragStart={onDragStart}
            onClick={onCardClick}
          />
        ))}
        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)', fontSize: 12 }}>
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Task Detail Slide-over ───────────────────────────────────────────────────
function TaskSlideover({ task, allTasks, jobs, employees, onClose, onSave, onComment }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...task })
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [savingComment, setSavingComment] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({ ...task })
    loadComments()
    // eslint-disable-next-line
  }, [task.id])

  const loadComments = async () => {
    setLoadingComments(true)
    const { data } = await supabase.from('task_comments')
      .select('*').eq('task_id', task.id).order('created_at', { ascending: true })
    setComments(data || [])
    setLoadingComments(false)
  }

  const submitComment = async () => {
    if (!comment.trim()) return
    setSavingComment(true)
    try {
      const { error } = await supabase.from('task_comments').insert({
        id: crypto.randomUUID(),
        task_id: task.id,
        author_name: user?.full_name || user?.email || 'User',
        body: comment.trim(),
        created_at: new Date().toISOString(),
      })
      if (error) throw error
      setComment('')
      loadComments()
      if (onComment) onComment()
    } catch (err) {
      toast.error('Failed to add comment')
    } finally {
      setSavingComment(false)
    }
  }

  const saveEdits = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('project_tasks').update({
        ...form,
        tags: typeof form.tags === 'string' ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : form.tags,
        completion_pct: parseInt(form.completion_pct) || 0,
        estimated_hours: parseFloat(form.estimated_hours) || 0,
        actual_hours: parseFloat(form.actual_hours) || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id)
      if (error) throw error
      toast.success('Task updated')
      setEditing(false)
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const jobName = jobs.find(j => j.id === task.job_id)?.title || ''

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      zIndex: 400, display: 'flex', flexDirection: 'column',
      boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
      transform: 'translateX(0)', transition: 'transform .25s',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {task.is_milestone && <span style={{ color: 'var(--gold)' }}>◆</span>}
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{task.title}</div>
          {jobName && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{jobName}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>
            <span className="material-icons" style={{ fontSize: 14 }}>{editing ? 'close' : 'edit'}</span>
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <span className="material-icons" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">Title</label>
              <input className="form-control" value={form.title} onChange={e => setF('title', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setF('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority} onChange={e => setF('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={form.start_date || ''} onChange={e => setF('start_date', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Due Date</label>
                <input type="date" className="form-control" value={form.due_date || ''} onChange={e => setF('due_date', e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label className="form-label">Est. Hours</label>
                <input type="number" className="form-control" value={form.estimated_hours || ''} onChange={e => setF('estimated_hours', e.target.value)} min="0" step="0.5" />
              </div>
              <div>
                <label className="form-label">Actual Hrs</label>
                <input type="number" className="form-control" value={form.actual_hours || ''} onChange={e => setF('actual_hours', e.target.value)} min="0" step="0.5" />
              </div>
              <div>
                <label className="form-label">% Done</label>
                <input type="number" className="form-control" value={form.completion_pct || 0} onChange={e => setF('completion_pct', e.target.value)} min="0" max="100" />
              </div>
            </div>
            <div>
              <label className="form-label">Assignee</label>
              <select className="form-control" value={form.assignee_id || ''} onChange={e => {
                const emp = employees.find(em => em.id === e.target.value)
                setF('assignee_id', e.target.value)
                setF('assignee_name', emp?.name || '')
              }}>
                <option value="">— Unassigned —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={3} value={form.description || ''} onChange={e => setF('description', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Tags (comma-separated)</label>
              <input className="form-control" value={Array.isArray(form.tags) ? form.tags.join(', ') : (form.tags || '')} onChange={e => setF('tags', e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={saveEdits} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <div>
            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 16 }}>
              {[
                ['Assignee', task.assignee_name || '—'],
                ['Start Date', task.start_date ? fmtDate(task.start_date) : '—'],
                ['Due Date', task.due_date ? fmtDate(task.due_date) : '—'],
                ['Est. Hours', task.estimated_hours || '—'],
                ['Actual Hours', task.actual_hours || '—'],
                ['Weight', task.task_weight || 1],
                ['Milestone', task.is_milestone ? `Yes — ${task.milestone_date ? fmtDate(task.milestone_date) : 'no date'}` : 'No'],
                ['Tags', Array.isArray(task.tags) ? task.tags.join(', ') || '—' : '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, fontFamily: 'var(--mono)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Completion */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Completion</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{task.completion_pct || 0}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${task.completion_pct || 0}%`,
                  background: (task.completion_pct || 0) === 100 ? 'var(--green)' : 'var(--blue)',
                }} />
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, fontFamily: 'var(--mono)', marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{task.description}</div>
              </div>
            )}

            {/* Dependencies */}
            {task.depends_on_ids && task.depends_on_ids.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, fontFamily: 'var(--mono)', marginBottom: 6 }}>Depends On</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {task.depends_on_ids.map(depId => {
                    const dep = allTasks.find(t => t.id === depId)
                    return dep ? (
                      <span key={depId} style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px' }}>
                        {dep.title}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments section */}
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            Comments ({comments.length})
          </div>
          {loadingComments ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
          ) : comments.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>No comments yet.</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{c.author_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{c.body}</div>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="form-control"
            rows={3}
            placeholder="Add a comment…"
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={savingComment || !comment.trim()}>
            {savingComment ? 'Posting…' : 'Post Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Gantt Chart ──────────────────────────────────────────────────────────────
function GanttChart({ tasks, job }) {
  const [scale, setScale] = useState('week') // day | week | month
  const containerRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  const projectStart = useMemo(() => {
    const dates = tasks.filter(t => t.start_date).map(t => t.start_date)
    if (job?.start_date) dates.push(job.start_date)
    if (!dates.length) return addDays(today, -7)
    return addDays(dates.sort()[0], -7)
  }, [tasks, job, today])

  const projectEnd = useMemo(() => {
    const dates = tasks.filter(t => t.due_date).map(t => t.due_date)
    if (job?.end_date) dates.push(job.end_date)
    if (!dates.length) return addDays(today, 30)
    return addDays(dates.sort().reverse()[0], 7)
  }, [tasks, job, today])

  const totalDays = Math.max(1, daysBetween(projectStart, projectEnd))

  // Generate columns
  const columns = useMemo(() => {
    const cols = []
    const start = new Date(projectStart)
    const end = new Date(projectEnd)
    if (scale === 'day') {
      let d = new Date(start)
      while (d <= end) {
        cols.push(d.toISOString().split('T')[0])
        d.setDate(d.getDate() + 1)
      }
    } else if (scale === 'week') {
      let d = new Date(start)
      d.setDate(d.getDate() - d.getDay()) // start of week
      while (d <= end) {
        cols.push(d.toISOString().split('T')[0])
        d.setDate(d.getDate() + 7)
      }
    } else {
      let d = new Date(start)
      d.setDate(1)
      while (d <= end) {
        cols.push(d.toISOString().split('T')[0])
        d.setMonth(d.getMonth() + 1)
      }
    }
    return cols
  }, [projectStart, projectEnd, scale])

  const colWidth = scale === 'day' ? 28 : scale === 'week' ? 60 : 80
  const nameColW = 220

  function barStyle(task) {
    const start = task.start_date || task.due_date
    const end   = task.due_date || task.start_date
    if (!start || !end) return null
    const left = Math.max(0, (daysBetween(projectStart, start) / totalDays)) * (columns.length * colWidth)
    const width = Math.max(colWidth / 2, (daysBetween(start, end) / totalDays) * (columns.length * colWidth))
    return { left, width }
  }

  const todayLeft = (daysBetween(projectStart, today) / totalDays) * (columns.length * colWidth)

  // Scroll to today on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = Math.max(0, todayLeft - 200)
    }
  }, [todayLeft, scale])

  const rootTasks = tasks.filter(t => !t.parent_task_id)
  const getSubtasks = (id) => tasks.filter(t => t.parent_task_id === id)

  function renderRow(task, depth = 0) {
    const bStyle = barStyle(task)
    const color = task.is_milestone ? 'var(--gold)' : STATUS_COLORS[task.status] || 'var(--blue)'
    const rows = [
      <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', width: nameColW, minWidth: nameColW, padding: '6px 8px 6px ' + (8 + depth * 20) + 'px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: depth === 0 ? 700 : 400, color: task.is_milestone ? 'var(--gold)' : 'var(--text)' }}>
            {depth > 0 && <span style={{ color: 'var(--text-dim)', marginRight: 4 }}>↳</span>}
            {task.is_milestone && '◆ '}{task.title}
          </span>
        </td>
        <td style={{ position: 'relative', height: 32, padding: 0 }}>
          <div style={{ position: 'relative', height: '100%', minWidth: columns.length * colWidth }}>
            {/* Today line */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayLeft, width: 2, background: 'var(--red)', opacity: .6, zIndex: 1 }} />
            {bStyle && !task.is_milestone && (
              <div style={{
                position: 'absolute', top: 8, height: 16,
                left: bStyle.left, width: bStyle.width,
                background: color, borderRadius: 4, zIndex: 2, opacity: .85,
                display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden',
              }}>
                <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {task.completion_pct > 0 && `${task.completion_pct}%`}
                </span>
              </div>
            )}
            {task.is_milestone && bStyle && (
              <div style={{
                position: 'absolute', top: 4, left: bStyle.left - 8,
                fontSize: 18, color: 'var(--gold)', zIndex: 2, lineHeight: 1,
              }}>◆</div>
            )}
          </div>
        </td>
      </tr>
    ]
    getSubtasks(task.id).forEach(sub => rows.push(...renderRow(sub, depth + 1)))
    return rows
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Scale:</span>
        {['day', 'week', 'month'].map(s => (
          <button key={s} className={`btn btn-sm ${scale === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setScale(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => {
          if (containerRef.current) containerRef.current.scrollLeft = Math.max(0, todayLeft - 200)
        }}>
          <span className="material-icons" style={{ fontSize: 14 }}>today</span>
          Today
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon="timeline" message="No tasks with dates to show on Gantt" />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div ref={containerRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: nameColW + columns.length * colWidth }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 3 }}>
                  <th style={{ position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface2)', width: nameColW, minWidth: nameColW, padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'left', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>Task</th>
                  <th style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex' }}>
                      {columns.map((col, i) => {
                        const d = new Date(col)
                        let label = ''
                        if (scale === 'day') label = d.getDate()
                        else if (scale === 'week') label = `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleString('default', { month: 'short' })}`
                        else label = d.toLocaleString('default', { month: 'short', year: '2-digit' })
                        return (
                          <div key={i} style={{
                            width: colWidth, minWidth: colWidth, fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
                            textAlign: 'center', padding: '6px 2px', borderRight: '1px solid var(--border)',
                            background: col === today ? 'var(--red)18' : 'transparent',
                          }}>{label}</div>
                        )
                      })}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rootTasks.map(task => renderRow(task))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(STATUS_COLORS).map(([s, c]) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <div style={{ width: 12, height: 8, borderRadius: 2, background: c }} />
                <span style={{ color: 'var(--text-dim)' }}>{STATUS_LABELS[s]}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 2, height: 12, background: 'var(--red)' }} />
              <span style={{ color: 'var(--text-dim)' }}>Today</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({ tasks, onTaskClick }) {
  const [current, setCurrent] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const today = new Date().toISOString().split('T')[0]

  const { year, month } = current

  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  // Pad to Monday start
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d)

  const tasksByDate = useMemo(() => {
    const map = {}
    tasks.forEach(t => {
      if (t.due_date) {
        if (!map[t.due_date]) map[t.due_date] = []
        map[t.due_date].push(t)
      }
      if (t.is_milestone && t.milestone_date) {
        if (!map[t.milestone_date]) map[t.milestone_date] = []
        if (!map[t.milestone_date].find(x => x.id === t.id))
          map[t.milestone_date].push({ ...t, _isMilestoneMark: true })
      }
    })
    return map
  }, [tasks])

  const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(c => {
          const d = new Date(c.year, c.month - 1)
          return { year: d.getFullYear(), month: d.getMonth() }
        })}>
          <span className="material-icons" style={{ fontSize: 16 }}>chevron_left</span>
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, minWidth: 180, textAlign: 'center' }}>{monthName}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setCurrent(c => {
          const d = new Date(c.year, c.month + 1)
          return { year: d.getFullYear(), month: d.getMonth() }
        })}>
          <span className="material-icons" style={{ fontSize: 16 }}>chevron_right</span>
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          const now = new Date()
          setCurrent({ year: now.getFullYear(), month: now.getMonth() })
        }}>Today</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DOW.map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ minHeight: 100, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }} />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayTasks = tasksByDate[dateStr] || []
            const isToday = dateStr === today
            const show = dayTasks.slice(0, 3)
            const hidden = dayTasks.length - 3
            return (
              <div key={i} style={{
                minHeight: 100, padding: '6px 6px 4px',
                borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                background: isToday ? 'var(--blue)08' : 'transparent',
              }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 800 : 400,
                  color: isToday ? 'var(--blue)' : 'var(--text)',
                  marginBottom: 4,
                  width: 22, height: 22, borderRadius: '50%',
                  background: isToday ? 'var(--blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isToday ? '#fff' : 'var(--text)',
                }}>{day}</div>
                {show.map(t => (
                  <div key={t.id} onClick={() => onTaskClick(t)}
                    style={{
                      fontSize: 10, borderRadius: 4, padding: '2px 5px', marginBottom: 2,
                      background: `${STATUS_COLORS[t.status]}22`,
                      color: STATUS_COLORS[t.status],
                      cursor: 'pointer', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                    {t.is_milestone || t._isMilestoneMark ? '◆ ' : ''}{t.title}
                  </div>
                ))}
                {hidden > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>+{hidden} more</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({ open, onClose, onSaved, editingTask, jobId, jobs, employees, allTasks }) {
  const { user } = useAuth()
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [empSearch, setEmpSearch] = useState('')

  useEffect(() => {
    if (editingTask) {
      setForm({
        ...editingTask,
        tags: Array.isArray(editingTask.tags) ? editingTask.tags.join(', ') : (editingTask.tags || ''),
        depends_on_ids: editingTask.depends_on_ids || [],
      })
    } else {
      setForm({ ...emptyForm(), job_id: jobId || '' })
    }
  }, [editingTask, jobId, open])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const filteredEmps = employees.filter(e =>
    !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase())
  )

  const save = async () => {
    if (!form.title?.trim()) return toast.error('Title is required')
    if (!form.job_id) return toast.error('Job is required')
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        job_id: form.job_id,
        status: form.status || 'open',
        priority: form.priority || 'medium',
        assignee_id: form.assignee_id || null,
        assignee_name: form.assignee_name || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        estimated_hours: parseFloat(form.estimated_hours) || 0,
        actual_hours: parseFloat(form.actual_hours) || 0,
        completion_pct: parseInt(form.completion_pct) || 0,
        task_weight: parseFloat(form.task_weight) || 1,
        parent_task_id: form.parent_task_id || null,
        depends_on_ids: form.depends_on_ids || [],
        is_milestone: !!form.is_milestone,
        milestone_date: form.is_milestone ? (form.milestone_date || null) : null,
        tags: typeof form.tags === 'string' ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : (form.tags || []),
        updated_at: new Date().toISOString(),
      }
      if (editingTask) {
        const { error } = await supabase.from('project_tasks').update(payload).eq('id', editingTask.id)
        if (error) throw error
        toast.success('Task updated')
      } else {
        const { error } = await supabase.from('project_tasks').insert({
          id: crypto.randomUUID(),
          ...payload,
          task_order: 0,
          created_by: user?.full_name || 'system',
          created_at: new Date().toISOString(),
        })
        if (error) throw error
        toast.success('Task created')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const jobTasks = allTasks.filter(t => t.job_id === form.job_id && t.id !== editingTask?.id)

  const toggleDepend = (id) => {
    setForm(f => ({
      ...f,
      depends_on_ids: (f.depends_on_ids || []).includes(id)
        ? f.depends_on_ids.filter(x => x !== id)
        : [...(f.depends_on_ids || []), id],
    }))
  }

  return (
    <ModalDialog open={open} onClose={onClose} title={editingTask ? 'Edit Task' : 'New Task'} size="xl">
      <div style={{ padding: '0 24px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <div>
          <label className="form-label">Title <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="form-control" value={form.title || ''} onChange={e => setF('title', e.target.value)} placeholder="Task title" />
        </div>

        {/* Job */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">Job / Project <span style={{ color: 'var(--red)' }}>*</span></label>
            <select className="form-control" value={form.job_id || ''} onChange={e => setF('job_id', e.target.value)}>
              <option value="">— Select Job —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} · {j.title}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Parent Task (optional)</label>
            <select className="form-control" value={form.parent_task_id || ''} onChange={e => setF('parent_task_id', e.target.value)}>
              <option value="">— None (top-level) —</option>
              {jobTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        {/* Status + Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={form.status} onChange={e => setF('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Priority</label>
            <select className="form-control" value={form.priority} onChange={e => setF('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="form-label">Assignee</label>
          <input className="form-control" style={{ marginBottom: 4 }} placeholder="Search employees…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
          <select className="form-control" value={form.assignee_id || ''} onChange={e => {
            const emp = employees.find(em => em.id === e.target.value)
            setF('assignee_id', e.target.value)
            setF('assignee_name', emp?.name || '')
          }}>
            <option value="">— Unassigned —</option>
            {filteredEmps.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {emp.dept || emp.role || ''}</option>)}
          </select>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">Start Date</label>
            <input type="date" className="form-control" value={form.start_date || ''} onChange={e => setF('start_date', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Due Date</label>
            <input type="date" className="form-control" value={form.due_date || ''} onChange={e => setF('due_date', e.target.value)} />
          </div>
        </div>

        {/* Hours + Completion */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label className="form-label">Estimated Hours</label>
            <input type="number" className="form-control" value={form.estimated_hours || ''} onChange={e => setF('estimated_hours', e.target.value)} min="0" step="0.5" placeholder="0" />
          </div>
          <div>
            <label className="form-label">Completion %</label>
            <input type="number" className="form-control" value={form.completion_pct || 0} onChange={e => setF('completion_pct', e.target.value)} min="0" max="100" />
          </div>
          <div>
            <label className="form-label">Weight</label>
            <input type="number" className="form-control" value={form.task_weight || 1} onChange={e => setF('task_weight', e.target.value)} min="0.1" step="0.1" />
          </div>
        </div>

        {/* Milestone */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            <input type="checkbox" checked={!!form.is_milestone} onChange={e => setF('is_milestone', e.target.checked)} />
            Is Milestone
          </label>
          {form.is_milestone && (
            <div style={{ flex: 1 }}>
              <input type="date" className="form-control" value={form.milestone_date || ''} onChange={e => setF('milestone_date', e.target.value)} placeholder="Milestone date" />
            </div>
          )}
        </div>

        {/* Depends On */}
        {jobTasks.length > 0 && (
          <div>
            <label className="form-label">Depends On</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {jobTasks.map(t => {
                const selected = (form.depends_on_ids || []).includes(t.id)
                return (
                  <button key={t.id} type="button"
                    onClick={() => toggleDepend(t.id)}
                    style={{
                      fontSize: 11, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: selected ? 700 : 400,
                      background: selected ? 'var(--blue)22' : 'var(--surface2)',
                      border: `1px solid ${selected ? 'var(--blue)' : 'var(--border)'}`,
                      color: selected ? 'var(--blue)' : 'var(--text)',
                    }}>
                    {t.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={3} value={form.description || ''} onChange={e => setF('description', e.target.value)} placeholder="Task details, acceptance criteria…" />
        </div>

        {/* Tags */}
        <div>
          <label className="form-label">Tags (comma-separated)</label>
          <input className="form-control" value={typeof form.tags === 'string' ? form.tags : (form.tags || []).join(', ')} onChange={e => setF('tags', e.target.value)} placeholder="safety, procurement, critical" />
        </div>
      </div>
      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : editingTask ? 'Save Changes' : 'Create Task'}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProjectTasks() {
  const [searchParams] = useSearchParams()
  const [jobs, setJobs]           = useState([])
  const [tasks, setTasks]         = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedJobId, setSelectedJobId] = useState(searchParams.get('job') || '')
  const [loading, setLoading]     = useState(false)
  const [activeTab, setActiveTab] = useState('board')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [editingTask, setEditingTask]     = useState(null)
  const [selectedTask, setSelectedTask]  = useState(null)
  const [dragOverCol, setDragOverCol]    = useState(null)
  const dragTaskRef = useRef(null)

  // List filters
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [collapsed, setCollapsed]         = useState({})

  const loadJobs = useCallback(async () => {
    const { data } = await supabase.from('jobs')
      .select('id, job_number, title, status, start_date, end_date, project_manager')
      .in('status', ['Open', 'In Progress', 'On Hold'])
      .order('created_at', { ascending: false })
    setJobs(data || [])
  }, [])

  const loadTasks = useCallback(async (jobId) => {
    if (!jobId) { setTasks([]); return }
    setLoading(true)
    const { data, error } = await supabase.from('project_tasks')
      .select('*').eq('job_id', jobId).order('task_order').order('created_at')
    if (error) { toast.error('Failed to load tasks'); console.error(error) }
    setTasks(data || [])
    setLoading(false)
  }, [])

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees')
      .select('id, name, dept, role').neq('status', 'Terminated').order('name')
    setEmployees(data || [])
  }, [])

  useEffect(() => { loadJobs(); loadEmployees() }, [loadJobs, loadEmployees])
  useEffect(() => { loadTasks(selectedJobId) }, [selectedJobId, loadTasks])

  const selectedJob = jobs.find(j => j.id === selectedJobId)

  // ── Kanban drag and drop ──
  const onDragStart = (e, task) => {
    dragTaskRef.current = task
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (status) => setDragOverCol(status)
  const onDragLeave = () => setDragOverCol(null)
  const onDrop = async (e, newStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const task = dragTaskRef.current
    if (!task || task.status === newStatus) return
    // Optimistic update
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    supabase.from('project_tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', task.id)
      .then(({ error }) => {
        if (error) {
          toast.error('Failed to update status')
          setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: task.status } : t))
        } else {
          toast.success(`Moved to ${STATUS_LABELS[newStatus]}`)
        }
      })
      .catch(e => console.warn('drag drop err', e))
  }

  // ── List filters ──
  const today = new Date().toISOString().split('T')[0]
  const filteredTasks = useMemo(() => {
    let list = tasks.filter(t => !t.parent_task_id) // top-level only in list root
    if (filterStatus) list = list.filter(t => t.status === filterStatus)
    if (filterPriority) list = list.filter(t => t.priority === filterPriority)
    if (filterAssignee) list = list.filter(t => t.assignee_name?.toLowerCase().includes(filterAssignee.toLowerCase()))
    if (filterOverdue) list = list.filter(t => t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'cancelled')
    return list
  }, [tasks, filterStatus, filterPriority, filterAssignee, filterOverdue, today])

  const milestones = useMemo(() => tasks.filter(t => t.is_milestone), [tasks])

  const deleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return
    await supabase.from('project_tasks').delete().eq('id', id)
    toast.success('Task deleted')
    loadTasks(selectedJobId)
  }

  const tabs = [
    { id: 'board', label: 'Board', icon: 'view_kanban' },
    { id: 'list', label: 'List', icon: 'format_list_bulleted' },
    { id: 'milestones', label: 'Milestones', icon: 'flag' },
    { id: 'gantt', label: 'Gantt', icon: 'timeline' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
  ]

  // Milestone summary
  const msDone   = milestones.filter(m => m.status === 'completed').length
  const msTotal  = milestones.length

  return (
    <div>
      <PageHeader
        title="Task Board"
        subtitle="Manage project tasks with Kanban, Gantt and Calendar views"
      >
        <button className="btn btn-primary" onClick={() => { setEditingTask(null); setShowTaskModal(true) }}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          New Task
        </button>
      </PageHeader>

      {/* ── Job selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Project:</label>
        <select
          className="form-control"
          style={{ maxWidth: 380 }}
          value={selectedJobId}
          onChange={e => setSelectedJobId(e.target.value)}
        >
          <option value="">— Select a project —</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.job_number} · {j.title}</option>
          ))}
        </select>
        {selectedJob && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            PM: {selectedJob.project_manager || '—'} ·
            {tasks.length} tasks ·
            {tasks.filter(t => t.status === 'completed').length} done
          </span>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--blue)' : 'var(--text-dim)',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--blue)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            <span className="material-icons" style={{ fontSize: 15 }}>{tab.icon}</span>
            {tab.label}
            {tab.id === 'milestones' && msTotal > 0 && (
              <span style={{ fontSize: 10, background: 'var(--gold)22', color: 'var(--gold)', borderRadius: 10, padding: '1px 6px' }}>
                {msDone}/{msTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {!selectedJobId ? (
        <EmptyState
          icon="folder_open"
          message="Select a project to view tasks"
          action={
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingTask(null); setShowTaskModal(true) }}>
              Create First Task
            </button>
          }
        />
      ) : loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading tasks…</div>
      ) : (
        <>
          {/* ── BOARD TAB ── */}
          {activeTab === 'board' && (
            <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, minWidth: 'max-content' }}>
                {STATUSES.map(status => {
                  const colTasks = tasks.filter(t => t.status === status && !t.parent_task_id)
                  return (
                    <KanbanColumn
                      key={status}
                      status={status}
                      tasks={colTasks}
                      allTasks={tasks}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDragLeave={onDragLeave}
                      isDragOver={dragOverCol === status}
                      onCardClick={(task) => setSelectedTask(task)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* ── LIST TAB ── */}
          {activeTab === 'list' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <select className="form-control" style={{ maxWidth: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <select className="form-control" style={{ maxWidth: 130 }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                  <option value="">All Priorities</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
                <input className="form-control" style={{ maxWidth: 180 }} placeholder="Filter by assignee…" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={filterOverdue} onChange={e => setFilterOverdue(e.target.checked)} />
                  Overdue only
                </label>
              </div>
              {filteredTasks.length === 0 ? (
                <EmptyState icon="task_alt" message="No tasks match filters" />
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  <div className="table-wrap">
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Title</th>
                          <th>Priority</th>
                          <th>Assignee</th>
                          <th>Start</th>
                          <th>Due</th>
                          <th style={{ textAlign: 'right' }}>Est.Hrs</th>
                          <th style={{ textAlign: 'right' }}>Act.Hrs</th>
                          <th>%</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task, i) => {
                          const subtasks = tasks.filter(t => t.parent_task_id === task.id)
                          const overdue = isOverdue(task.due_date, task.status)
                          const isCollapsed = collapsed[task.id]
                          return (
                            <>
                              <tr key={task.id} style={{ background: overdue ? 'var(--red)06' : 'transparent' }}>
                                <td style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{i + 1}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {subtasks.length > 0 && (
                                      <button onClick={() => setCollapsed(c => ({ ...c, [task.id]: !c[task.id] }))}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-dim)' }}>
                                        <span className="material-icons" style={{ fontSize: 14 }}>
                                          {isCollapsed ? 'chevron_right' : 'expand_more'}
                                        </span>
                                      </button>
                                    )}
                                    {task.is_milestone && <span style={{ color: 'var(--gold)' }}>◆</span>}
                                    <span
                                      style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--blue)' }}
                                      onClick={() => setSelectedTask(task)}
                                    >{task.title}</span>
                                  </div>
                                </td>
                                <td><PriorityBadge priority={task.priority} /></td>
                                <td style={{ fontSize: 12 }}>
                                  {task.assignee_name ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: avatarColor(task.assignee_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                        {initials(task.assignee_name)}
                                      </div>
                                      <span style={{ fontSize: 11 }}>{task.assignee_name}</span>
                                    </div>
                                  ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                                </td>
                                <td style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{task.start_date ? fmtDate(task.start_date) : '—'}</td>
                                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: overdue ? 'var(--red)' : 'var(--text-dim)', fontWeight: overdue ? 700 : 400 }}>
                                  {overdue && <span style={{ marginRight: 3 }}>⚠</span>}{task.due_date ? fmtDate(task.due_date) : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>{task.estimated_hours || '—'}</td>
                                <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>{task.actual_hours || '—'}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 48, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${task.completion_pct || 0}%`, background: task.completion_pct === 100 ? 'var(--green)' : 'var(--blue)', borderRadius: 2 }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{task.completion_pct || 0}%</span>
                                  </div>
                                </td>
                                <td><StatusBadge status={task.status} /></td>
                                <td>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => { setEditingTask(task); setShowTaskModal(true) }}>
                                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                    </button>
                                    <button className="btn btn-secondary btn-sm" title="View details" onClick={() => setSelectedTask(task)}>
                                      <span className="material-icons" style={{ fontSize: 13 }}>open_in_full</span>
                                    </button>
                                    <button className="btn btn-secondary btn-sm" title="Delete" style={{ color: 'var(--red)' }} onClick={() => deleteTask(task.id)}>
                                      <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Subtasks */}
                              {!isCollapsed && subtasks.map(sub => {
                                const subOverdue = isOverdue(sub.due_date, sub.status)
                                return (
                                  <tr key={sub.id} style={{ background: 'var(--surface2)' }}>
                                    <td />
                                    <td>
                                      <div style={{ paddingLeft: 28, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>↳</span>
                                        <span style={{ fontSize: 12, cursor: 'pointer', color: 'var(--blue)' }} onClick={() => setSelectedTask(sub)}>{sub.title}</span>
                                      </div>
                                    </td>
                                    <td><PriorityBadge priority={sub.priority} /></td>
                                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub.assignee_name || '—'}</td>
                                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub.start_date ? fmtDate(sub.start_date) : '—'}</td>
                                    <td style={{ fontSize: 11, color: subOverdue ? 'var(--red)' : 'var(--text-dim)' }}>{sub.due_date ? fmtDate(sub.due_date) : '—'}</td>
                                    <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>{sub.estimated_hours || '—'}</td>
                                    <td style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>{sub.actual_hours || '—'}</td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <div style={{ width: 36, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                                          <div style={{ height: '100%', width: `${sub.completion_pct || 0}%`, background: 'var(--blue)', borderRadius: 2 }} />
                                        </div>
                                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{sub.completion_pct || 0}%</span>
                                      </div>
                                    </td>
                                    <td><StatusBadge status={sub.status} /></td>
                                    <td>
                                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingTask(sub); setShowTaskModal(true) }}>
                                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MILESTONES TAB ── */}
          {activeTab === 'milestones' && (
            <div>
              {/* Summary card */}
              {msTotal > 0 && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 24, color: 'var(--gold)' }}>flag</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{msDone} / {msTotal}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Milestones Complete</div>
                    </div>
                    <div style={{ marginLeft: 8 }}>
                      <div style={{ width: 100, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${msTotal > 0 ? (msDone / msTotal) * 100 : 0}%`, background: 'var(--green)', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {milestones.length === 0 ? (
                <EmptyState icon="flag" message="No milestones defined" action={
                  <button className="btn btn-primary btn-sm" onClick={() => { setEditingTask(null); setShowTaskModal(true) }}>Add Milestone</button>
                } />
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  <div className="table-wrap">
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th>Milestone</th>
                          <th>Due Date</th>
                          <th>Status</th>
                          <th>Assignee</th>
                          <th>Days Until Due</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {milestones.map(ms => {
                          const msDate = ms.milestone_date || ms.due_date
                          const daysLeft = msDate ? daysBetween(today, msDate) : null
                          const overdue = msDate && msDate < today && ms.status !== 'completed'
                          const soon = !overdue && daysLeft !== null && daysLeft <= 7 && ms.status !== 'completed'
                          const rowColor = overdue ? 'var(--red)' : soon ? 'var(--yellow)' : 'var(--green)'
                          return (
                            <tr key={ms.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ color: 'var(--gold)', fontSize: 16 }}>◆</span>
                                  <span style={{ fontWeight: 600 }}>{ms.title}</span>
                                </div>
                              </td>
                              <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{msDate ? fmtDate(msDate) : '—'}</td>
                              <td><StatusBadge status={ms.status} /></td>
                              <td style={{ fontSize: 12 }}>{ms.assignee_name || '—'}</td>
                              <td>
                                {daysLeft !== null ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: rowColor }}>
                                    {overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d`}
                                  </span>
                                ) : '—'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditingTask(ms); setShowTaskModal(true) }}>
                                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                  </button>
                                  {ms.status === 'completed' && (
                                    <button className="btn btn-secondary btn-sm" disabled title="Create Invoice — Available in Phase P9" style={{ opacity: .5 }}>
                                      <span className="material-icons" style={{ fontSize: 13 }}>receipt</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GANTT TAB ── */}
          {activeTab === 'gantt' && (
            <GanttChart tasks={tasks} job={selectedJob} />
          )}

          {/* ── CALENDAR TAB ── */}
          {activeTab === 'calendar' && (
            <CalendarView tasks={tasks} onTaskClick={(t) => setSelectedTask(t)} />
          )}
        </>
      )}

      {/* ── Task Modal ── */}
      <TaskModal
        open={showTaskModal}
        onClose={() => { setShowTaskModal(false); setEditingTask(null) }}
        onSaved={() => loadTasks(selectedJobId)}
        editingTask={editingTask}
        jobId={selectedJobId}
        jobs={jobs}
        employees={employees}
        allTasks={tasks}
      />

      {/* ── Task Slideover ── */}
      {selectedTask && (
        <>
          {/* backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', zIndex: 399 }}
            onClick={() => setSelectedTask(null)}
          />
          <TaskSlideover
            task={selectedTask}
            allTasks={tasks}
            jobs={jobs}
            employees={employees}
            onClose={() => setSelectedTask(null)}
            onSave={() => { loadTasks(selectedJobId); setSelectedTask(null) }}
            onComment={() => { /* no-op, comments reload internally */ }}
          />
        </>
      )}
    </div>
  )
}
