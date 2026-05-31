// src/pages/Projects/ProjectDashboard.jsx
// Phase P1.1 — Project Dashboard: KPI tiles, health grid, recent activity feed

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ─── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function healthColor(job) {
  const pct = job.utilisation_pct || 0
  const overdue = job.overdue_tasks || 0
  if (pct > 90 || overdue > 5) return { color: 'var(--red)', label: 'At Risk', icon: 'warning' }
  if (pct > 75 || overdue > 0) return { color: 'var(--yellow)', label: 'Amber', icon: 'error_outline' }
  return { color: 'var(--green)', label: 'On Track', icon: 'check_circle' }
}

function HealthCard({ job, onClick }) {
  const health = healthColor(job)
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: `1px solid var(--border)`,
        borderLeft: `4px solid ${health.color}`, borderRadius: 10,
        padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow .15s',
      }}
      onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'}
      onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{job.title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {job.job_number} · {job.project_manager || 'No PM'}
          </div>
        </div>
        <span className="material-icons" style={{ fontSize: 18, color: health.color }}>{health.icon}</span>
      </div>
      {/* Budget bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Budget used</span>
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: health.color, fontWeight: 700 }}>
            {(job.utilisation_pct || 0).toFixed(0)}%
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${Math.min(100, job.utilisation_pct || 0)}%`,
            background: health.color, transition: 'width .3s',
          }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <span style={{ color: 'var(--text)' }}>{job.task_count || 0}</span> tasks
          </span>
          {job.overdue_tasks > 0 && (
            <span style={{ fontSize: 11, color: 'var(--red)' }}>
              <span style={{ fontWeight: 700 }}>{job.overdue_tasks}</span> overdue
            </span>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: `${health.color}18`, color: health.color,
        }}>{health.label}</span>
      </div>
    </div>
  )
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ProjectDashboard() {
  const navigate = useNavigate()
  const [jobs, setJobs]       = useState([])
  const [tasks, setTasks]     = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jobsRes, tasksRes, commentsRes, costRes] = await Promise.all([
        supabase.from('jobs')
          .select('id, job_number, title, client_name, status, project_manager, start_date, end_date, budget_materials, budget_labour, budget_overhead, budget_other, site_location')
          .in('status', ['Open', 'In Progress'])
          .order('created_at', { ascending: false }),
        supabase.from('project_tasks')
          .select('id, job_id, title, status, due_date, updated_at, assignee_name, completion_pct'),
        supabase.from('task_comments')
          .select('id, task_id, author_name, body, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('job_cost_entries')
          .select('job_id, amount'),
      ])

      if (jobsRes.error) throw jobsRes.error

      const costByJob = {}
      ;(costRes.data || []).forEach(e => {
        costByJob[e.job_id] = (costByJob[e.job_id] || 0) + (parseFloat(e.amount) || 0)
      })

      const tasksByJob = {}
      const today = new Date().toISOString().split('T')[0]
      ;(tasksRes.data || []).forEach(t => {
        if (!tasksByJob[t.job_id]) tasksByJob[t.job_id] = { count: 0, overdue: 0 }
        tasksByJob[t.job_id].count++
        if (t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'cancelled') {
          tasksByJob[t.job_id].overdue++
        }
      })

      const enriched = (jobsRes.data || []).map(job => {
        const actual_total = costByJob[job.id] || 0
        const total_budget = (parseFloat(job.budget_materials) || 0)
          + (parseFloat(job.budget_labour) || 0)
          + (parseFloat(job.budget_overhead) || 0)
          + (parseFloat(job.budget_other) || 0)
        const utilisation_pct = total_budget > 0 ? (actual_total / total_budget) * 100 : 0
        const tj = tasksByJob[job.id] || { count: 0, overdue: 0 }
        return { ...job, actual_total, total_budget, utilisation_pct, task_count: tj.count, overdue_tasks: tj.overdue }
      })
      setJobs(enriched)
      setTasks(tasksRes.data || [])

      // Build activity feed from recent task updates + comments
      const recentTasks = (tasksRes.data || [])
        .filter(t => t.updated_at)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 5)
        .map(t => ({
          id: `task-${t.id}`,
          type: 'task',
          icon: 'task_alt',
          color: 'var(--blue)',
          text: `Task "${t.title}" updated`,
          sub: t.assignee_name ? `Assigned to ${t.assignee_name}` : '',
          ts: t.updated_at,
        }))

      const recentComments = (commentsRes.data || []).map(c => ({
        id: `comment-${c.id}`,
        type: 'comment',
        icon: 'chat_bubble',
        color: 'var(--teal)',
        text: `${c.author_name} commented`,
        sub: c.body.slice(0, 60) + (c.body.length > 60 ? '…' : ''),
        ts: c.created_at,
      }))

      const allActivity = [...recentTasks, ...recentComments]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 10)
      setActivity(allActivity)
    } catch (err) {
      toast.error('Failed to load dashboard')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const kpis = useMemo(() => {
    const totalBudget = jobs.reduce((s, j) => s + j.total_budget, 0)
    const totalSpent  = jobs.reduce((s, j) => s + j.actual_total, 0)
    const wipValue    = jobs.filter(j => j.status === 'In Progress').reduce((s, j) => s + j.actual_total, 0)
    const today = new Date().toISOString().split('T')[0]
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed' && t.status !== 'cancelled').length
    const assignees = new Set(tasks.filter(t => t.assignee_name).map(t => t.assignee_name))
    return { activeProjects: jobs.length, totalBudget, totalSpent, wipValue, overdueTasks, resources: assignees.size }
  }, [jobs, tasks])

  return (
    <div>
      <PageHeader
        title="Project Dashboard"
        subtitle="Real-time overview of all active projects, budgets and task health"
      >
        <button className="btn btn-primary" onClick={() => navigate('/module/projects/jobs')}>
          <span className="material-icons" style={{ fontSize: 16 }}>work</span>
          Job Register
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/module/projects/project-tasks')}>
          <span className="material-icons" style={{ fontSize: 16 }}>task_alt</span>
          Task Board
        </button>
      </PageHeader>

      {/* ── KPI row ── */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <KPICard
          label="Active Projects"
          value={kpis.activeProjects}
          icon="folder_open"
          color="blue"
          sub="Open + In Progress"
        />
        <KPICard
          label="Total Budget"
          value={`$${fmtNum(kpis.totalBudget)}`}
          icon="account_balance"
          color="gold"
          sub="across active projects"
        />
        <KPICard
          label="Total Spent"
          value={`$${fmtNum(kpis.totalSpent)}`}
          icon="payments"
          color={kpis.totalSpent > kpis.totalBudget && kpis.totalBudget > 0 ? 'red' : 'green'}
          sub="actual costs posted"
        />
        <KPICard
          label="WIP Value"
          value={`$${fmtNum(kpis.wipValue)}`}
          icon="construction"
          color="teal"
          sub="costs on In Progress"
        />
        <KPICard
          label="Overdue Tasks"
          value={kpis.overdueTasks}
          icon="event_busy"
          color={kpis.overdueTasks > 0 ? 'red' : 'green'}
          sub="across all projects"
        />
        <KPICard
          label="Resources"
          value={kpis.resources}
          icon="people"
          color="teal"
          sub="unique assignees"
        />
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading dashboard…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
          {/* ── Health Grid ── */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>health_and_safety</span>
              Project Health
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>({jobs.length} active)</span>
            </div>
            {jobs.length === 0 ? (
              <EmptyState
                icon="folder_open"
                message="No active projects"
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/module/projects/jobs')}>
                    Create Project
                  </button>
                }
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {jobs.map(job => (
                  <HealthCard
                    key={job.id}
                    job={job}
                    onClick={() => navigate(`/module/projects/project-tasks?job=${job.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Activity Feed ── */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--blue)' }}>history</span>
              Recent Activity
            </div>
            {activity.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                No recent activity
              </div>
            ) : (
              <div>
                {activity.map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-icons" style={{ fontSize: 16, color: item.color }}>{item.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</div>
                      {item.sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {timeAgo(item.ts)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => navigate('/module/projects/project-tasks')}>
                View All Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
