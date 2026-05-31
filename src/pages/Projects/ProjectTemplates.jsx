// src/pages/Projects/ProjectTemplates.jsx
// Phase P3 — Project Templates: builder, seed templates, create-from-template flow

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { fmtNum } from '../../engine/reportingEngine'

const CATEGORIES = ['Mining', 'Construction', 'Shutdown', 'Maintenance', 'Exploration', 'Other']
const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }

function catColor(cat) {
  const map = {
    Mining: 'var(--gold)', Construction: 'var(--blue)', Shutdown: 'var(--red)',
    Maintenance: 'var(--teal)', Exploration: 'var(--green)', Other: 'var(--text-dim)',
  }
  return map[cat] || 'var(--text-dim)'
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─── Template Builder Modal ───────────────────────────────────────────────────
function TemplateBuilderModal({ open, onClose, onSaved, editingTemplate }) {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', category: 'Mining', description: '' })
  const [templateTasks, setTemplateTasks] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editingTemplate) {
      setForm({
        name: editingTemplate.name || '',
        category: editingTemplate.category || 'Mining',
        description: editingTemplate.description || '',
      })
      loadTemplateTasks(editingTemplate.id)
    } else {
      setForm({ name: '', category: 'Mining', description: '' })
      setTemplateTasks([])
    }
  }, [editingTemplate, open])

  const loadTemplateTasks = async (tid) => {
    const { data } = await supabase.from('template_tasks').select('*').eq('template_id', tid).order('task_order')
    setTemplateTasks(data || [])
  }

  const addTask = () => {
    setTemplateTasks(ts => [...ts, {
      _new: true,
      id: `new-${Date.now()}`,
      title: '',
      priority: 'medium',
      estimated_hours: 0,
      day_offset: 0,
      duration_days: 1,
      is_milestone: false,
      task_order: ts.length + 1,
    }])
  }

  const setTaskField = (id, field, value) => {
    setTemplateTasks(ts => ts.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  const removeTask = (id) => {
    setTemplateTasks(ts => ts.filter(t => t.id !== id))
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Template name is required')
    setSaving(true)
    try {
      let templateId = editingTemplate?.id
      if (editingTemplate) {
        const { error } = await supabase.from('project_templates').update({
          name: form.name, category: form.category, description: form.description,
        }).eq('id', templateId)
        if (error) throw error
        // Delete old tasks and re-insert
        await supabase.from('template_tasks').delete().eq('template_id', templateId)
      } else {
        templateId = crypto.randomUUID()
        const { error } = await supabase.from('project_templates').insert({
          id: templateId, name: form.name, category: form.category,
          description: form.description, is_active: true,
          created_by: user?.full_name || 'system',
          created_at: new Date().toISOString(),
        })
        if (error) throw error
      }

      // Insert template tasks
      if (templateTasks.length > 0) {
        const rows = templateTasks.filter(t => t.title?.trim()).map((t, i) => ({
          id: t._new ? crypto.randomUUID() : t.id,
          template_id: templateId,
          title: t.title.trim(),
          priority: t.priority || 'medium',
          estimated_hours: parseFloat(t.estimated_hours) || 0,
          day_offset: parseInt(t.day_offset) || 0,
          duration_days: parseInt(t.duration_days) || 1,
          is_milestone: !!t.is_milestone,
          task_order: i + 1,
        }))
        const { error: te } = await supabase.from('template_tasks').insert(rows)
        if (te) throw te
      }

      toast.success(editingTemplate ? 'Template updated' : 'Template created')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title={editingTemplate ? 'Edit Template' : 'New Template'} size="xl">
      <div style={{ padding: '0 24px 8px' }}>
        {/* Template info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label className="form-label">Template Name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Road Rehabilitation" />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this template…" />
        </div>

        {/* Tasks */}
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 16, color: 'var(--blue)' }}>task_alt</span>
          Tasks ({templateTasks.length})
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={addTask}>
            <span className="material-icons" style={{ fontSize: 14 }}>add</span>
            Add Task
          </button>
        </div>

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {templateTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: 12 }}>
              No tasks yet. Click "Add Task" to start building.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Title</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, width: 80 }}>Priority</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, width: 72 }}>Day+</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, width: 72 }}>Duration</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, width: 64 }}>Est.Hrs</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, width: 60 }}>MS</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {templateTasks.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 6px' }}>
                      <input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} value={t.title} onChange={e => setTaskField(t.id, 'title', e.target.value)} placeholder="Task title" />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <select className="form-control" style={{ fontSize: 11, padding: '4px 6px' }} value={t.priority} onChange={e => setTaskField(t.id, 'priority', e.target.value)}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" className="form-control" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} value={t.day_offset} onChange={e => setTaskField(t.id, 'day_offset', e.target.value)} min="0" />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" className="form-control" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} value={t.duration_days} onChange={e => setTaskField(t.id, 'duration_days', e.target.value)} min="1" />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" className="form-control" style={{ fontSize: 12, padding: '4px 6px', textAlign: 'right' }} value={t.estimated_hours} onChange={e => setTaskField(t.id, 'estimated_hours', e.target.value)} min="0" step="0.5" />
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <input type="checkbox" checked={!!t.is_milestone} onChange={e => setTaskField(t.id, 'is_milestone', e.target.checked)} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <button className="btn btn-secondary btn-sm" style={{ padding: '2px 4px', color: 'var(--red)' }} onClick={() => removeTask(t.id)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : editingTemplate ? 'Save Template' : 'Create Template'}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ─── Create Project from Template Modal ──────────────────────────────────────
function CreateFromTemplateModal({ open, onClose, template, templateTasks, jobs }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '', client_name: '', site_location: '', project_manager: '',
    start_date: new Date().toISOString().split('T')[0],
    contract_value: '', budget_materials: '', budget_labour: '',
    budget_overhead: '', budget_other: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (template) {
      setForm(f => ({ ...f, title: template.name }))
    }
  }, [template])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const getNextJobNumber = async () => {
    const { data } = await supabase
      .from('jobs').select('job_number').ilike('job_number', 'JOB-%')
      .order('created_at', { ascending: false }).limit(1)
    const last = data?.[0]?.job_number || 'JOB-0000'
    const num = parseInt(last.replace('JOB-', ''), 10) || 0
    return `JOB-${String(num + 1).padStart(4, '0')}`
  }

  const create = async () => {
    if (!form.title.trim()) return toast.error('Project title is required')
    if (!form.start_date) return toast.error('Start date is required')
    setSaving(true)
    try {
      const jobId = crypto.randomUUID()
      const job_number = await getNextJobNumber()
      const { error: je } = await supabase.from('jobs').insert({
        id: jobId,
        job_number,
        title: form.title.trim(),
        client_name: form.client_name || null,
        site_location: form.site_location || null,
        project_manager: form.project_manager || null,
        status: 'Open',
        start_date: form.start_date,
        contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
        budget_materials: parseFloat(form.budget_materials) || 0,
        budget_labour: parseFloat(form.budget_labour) || 0,
        budget_overhead: parseFloat(form.budget_overhead) || 0,
        budget_other: parseFloat(form.budget_other) || 0,
        created_by: user?.full_name || 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (je) throw je

      // Create tasks from template
      if (templateTasks.length > 0) {
        const taskRows = templateTasks.map(tt => ({
          id: crypto.randomUUID(),
          job_id: jobId,
          title: tt.title,
          description: tt.description || null,
          status: 'open',
          priority: tt.priority || 'medium',
          start_date: addDays(form.start_date, tt.day_offset || 0),
          due_date: addDays(form.start_date, (tt.day_offset || 0) + (tt.duration_days || 1) - 1),
          estimated_hours: parseFloat(tt.estimated_hours) || 0,
          actual_hours: 0,
          completion_pct: 0,
          task_weight: 1,
          is_milestone: !!tt.is_milestone,
          milestone_date: tt.is_milestone ? addDays(form.start_date, (tt.day_offset || 0) + (tt.duration_days || 1) - 1) : null,
          task_order: tt.task_order || 0,
          created_by: user?.full_name || 'system',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        const { error: te } = await supabase.from('project_tasks').insert(taskRows)
        if (te) throw te
      }

      toast.success(`Project ${job_number} created with ${templateTasks.length} tasks from template`)
      onClose()
      navigate(`/module/projects/project-tasks?job=${jobId}`)
    } catch (err) {
      toast.error(err.message || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (!template) return null

  return (
    <ModalDialog open={open} onClose={onClose} title={`Create Project from: ${template.name}`} size="xl">
      <div style={{ padding: '0 24px 8px' }}>
        {/* Template preview */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${catColor(template.category)}22`, color: catColor(template.category) }}>{template.category}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{templateTasks.length} tasks</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{template.description}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {templateTasks.slice(0, 6).map(t => (
              <span key={t.id} style={{ fontSize: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>
                {t.is_milestone && '◆ '}{t.title}
              </span>
            ))}
            {templateTasks.length > 6 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>+{templateTasks.length - 6} more</span>}
          </div>
        </div>

        {/* Project fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Project Title <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="form-control" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="Project name" />
          </div>
          <div>
            <label className="form-label">Client</label>
            <input className="form-control" value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="Client or department" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Site / Location</label>
            <input className="form-control" value={form.site_location} onChange={e => setF('site_location', e.target.value)} placeholder="Site location" />
          </div>
          <div>
            <label className="form-label">Project Manager</label>
            <input className="form-control" value={form.project_manager} onChange={e => setF('project_manager', e.target.value)} placeholder="Manager name" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Start Date <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="date" className="form-control" value={form.start_date} onChange={e => setF('start_date', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Contract Value</label>
            <input type="number" className="form-control" value={form.contract_value} onChange={e => setF('contract_value', e.target.value)} min="0" step="0.01" placeholder="0.00" />
          </div>
        </div>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>Budget</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              ['Materials', 'budget_materials'],
              ['Labour', 'budget_labour'],
              ['Overhead', 'budget_overhead'],
              ['Other', 'budget_other'],
            ].map(([label, field]) => (
              <div key={field}>
                <label className="form-label" style={{ fontSize: 11 }}>{label}</label>
                <input type="number" className="form-control" value={form[field]} onChange={e => setF(field, e.target.value)} min="0" step="0.01" placeholder="0.00" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={create} disabled={saving}>
          {saving ? 'Creating…' : `Create Project with ${templateTasks.length} Tasks`}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProjectTemplates() {
  const { user } = useAuth()
  const [templates, setTemplates]   = useState([])
  const [tTasks, setTTasks]         = useState({}) // { templateId: tasks[] }
  const [loading, setLoading]       = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [createFromTpl, setCreateFromTpl]     = useState(null)
  const [jobs, setJobs]             = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const [tplRes, ttRes, jobsRes] = await Promise.all([
      supabase.from('project_templates').select('*').eq('is_active', true).order('created_at'),
      supabase.from('template_tasks').select('*').order('task_order'),
      supabase.from('jobs').select('id, job_number, title').in('status', ['Open', 'In Progress', 'On Hold']).order('created_at', { ascending: false }),
    ])
    setTemplates(tplRes.data || [])
    const byTpl = {}
    ;(ttRes.data || []).forEach(t => {
      if (!byTpl[t.template_id]) byTpl[t.template_id] = []
      byTpl[t.template_id].push(t)
    })
    setTTasks(byTpl)
    setJobs(jobsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    await supabase.from('template_tasks').delete().eq('template_id', id)
    await supabase.from('project_templates').update({ is_active: false }).eq('id', id)
    toast.success('Template deleted')
    load()
  }

  const duplicateTemplate = async (tpl) => {
    const newId = crypto.randomUUID()
    const tasks = tTasks[tpl.id] || []
    const { error: te } = await supabase.from('project_templates').insert({
      id: newId, name: `${tpl.name} (Copy)`, category: tpl.category,
      description: tpl.description, is_active: true,
      created_by: user?.full_name || 'system',
      created_at: new Date().toISOString(),
    })
    if (te) { toast.error('Duplicate failed'); return }
    if (tasks.length > 0) {
      await supabase.from('template_tasks').insert(
        tasks.map(t => ({ ...t, id: crypto.randomUUID(), template_id: newId }))
      )
    }
    toast.success('Template duplicated')
    load()
  }

  return (
    <div>
      <PageHeader
        title="Project Templates"
        subtitle="Reusable task templates for mining, construction and shutdown projects"
      >
        <button className="btn btn-primary" onClick={() => { setEditingTemplate(null); setShowBuilder(true) }}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          New Template
        </button>
      </PageHeader>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon="assignment"
          message="No templates yet"
          action={<button className="btn btn-primary btn-sm" onClick={() => { setEditingTemplate(null); setShowBuilder(true) }}>Create First Template</button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {templates.map(tpl => {
            const tasks = tTasks[tpl.id] || []
            const milestones = tasks.filter(t => t.is_milestone).length
            const totalHours = tasks.reduce((s, t) => s + (parseFloat(t.estimated_hours) || 0), 0)
            const maxDay = tasks.reduce((m, t) => Math.max(m, (t.day_offset || 0) + (t.duration_days || 1)), 0)
            const color = catColor(tpl.category)
            return (
              <div key={tpl.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${color}22`, color }}>{tpl.category}</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{tpl.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => { setEditingTemplate(tpl); setShowBuilder(true) }}>
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" title="Duplicate" onClick={() => duplicateTemplate(tpl)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>content_copy</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" title="Delete" style={{ color: 'var(--red)' }} onClick={() => deleteTemplate(tpl.id)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '10px 16px', flex: 1 }}>
                  {tpl.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.5 }}>{tpl.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{tasks.length}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Tasks</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{milestones}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Milestones</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{maxDay}d</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Duration</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{fmtNum(totalHours)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Est. Hrs</div>
                    </div>
                  </div>

                  {/* Task preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {tasks.slice(0, 5).map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                        <span style={{ color: t.is_milestone ? 'var(--gold)' : 'var(--text-dim)' }}>{t.is_milestone ? '◆' : '•'}</span>
                        <span style={{ color: 'var(--text)' }}>{t.title}</span>
                        <span style={{ color: 'var(--text-dim)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>Day {t.day_offset}, {t.duration_days}d</span>
                      </div>
                    ))}
                    {tasks.length > 5 && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>+{tasks.length - 5} more tasks…</div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => setCreateFromTpl(tpl)}
                  >
                    <span className="material-icons" style={{ fontSize: 15 }}>rocket_launch</span>
                    Create Project from Template
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Template Builder Modal */}
      <TemplateBuilderModal
        open={showBuilder}
        onClose={() => { setShowBuilder(false); setEditingTemplate(null) }}
        onSaved={load}
        editingTemplate={editingTemplate}
      />

      {/* Create from Template Modal */}
      <CreateFromTemplateModal
        open={!!createFromTpl}
        onClose={() => setCreateFromTpl(null)}
        template={createFromTpl}
        templateTasks={createFromTpl ? (tTasks[createFromTpl.id] || []) : []}
        jobs={jobs}
      />
    </div>
  )
}
