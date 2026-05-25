// src/pages/Projects/Jobs.jsx
// Phase 21 — Job Register: create and manage jobs with budgets, actuals, utilisation

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

// ─── constants ────────────────────────────────────────────────────────────────
const STATUSES = ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled']

const STATUS_COLOR = {
  'Open':        'var(--blue)',
  'In Progress': 'var(--gold)',
  'On Hold':     'var(--yellow)',
  'Completed':   'var(--green)',
  'Cancelled':   'var(--red)',
}

const STATUS_BADGE_CLS = {
  'Open':        'badge-blue',
  'In Progress': 'badge-gold',
  'On Hold':     'badge-yellow',
  'Completed':   'badge-green',
  'Cancelled':   'badge-red',
}

const emptyForm = () => ({
  title: '', client_name: '', status: 'Open',
  start_date: new Date().toISOString().split('T')[0], end_date: '',
  department: '', cost_center: '', project_manager: '',
  budget_materials: '', budget_labour: '', budget_overhead: '', budget_other: '',
  contract_value: '', notes: '',
})

// ─── helpers ──────────────────────────────────────────────────────────────────
function progressColor(pct) {
  if (pct > 90) return 'var(--red)'
  if (pct > 75) return 'var(--yellow)'
  return 'var(--green)'
}

function StatusBadgeLocal({ status }) {
  return (
    <span className={`badge ${STATUS_BADGE_CLS[status] || 'badge-dim'}`} style={{ fontSize: 11 }}>
      {status}
    </span>
  )
}

// ─── component ────────────────────────────────────────────────────────────────
export default function Jobs() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [jobs, setJobs]               = useState([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('Open')
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState(null)
  const [form, setForm]               = useState(emptyForm())
  const [saving, setSaving]           = useState(false)

  // ── load jobs ───────────────────────────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, job_cost_entries(amount)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const enriched = (data || []).map(job => {
        const actual_total = (job.job_cost_entries || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
        const total_budget = (parseFloat(job.budget_materials) || 0)
          + (parseFloat(job.budget_labour) || 0)
          + (parseFloat(job.budget_overhead) || 0)
          + (parseFloat(job.budget_other) || 0)
        const utilisation_pct = total_budget > 0 ? (actual_total / total_budget) * 100 : 0
        return { ...job, actual_total, total_budget, utilisation_pct }
      })
      setJobs(enriched)
    } catch (err) {
      toast.error('Failed to load jobs')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const openJobs = jobs.filter(j => j.status === 'Open' || j.status === 'In Progress')
    const totalBudget = openJobs.reduce((s, j) => s + j.total_budget, 0)
    const totalSpent  = openJobs.reduce((s, j) => s + j.actual_total, 0)
    const wipValue    = jobs
      .filter(j => j.status === 'In Progress')
      .reduce((s, j) => s + j.actual_total, 0)
    return {
      openCount:   openJobs.length,
      totalBudget,
      totalSpent,
      wipValue,
    }
  }, [jobs])

  // ── filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = jobs
    if (statusFilter !== 'All') list = list.filter(j => j.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(j =>
        j.job_number?.toLowerCase().includes(q) ||
        j.title?.toLowerCase().includes(q) ||
        j.client_name?.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q) ||
        j.project_manager?.toLowerCase().includes(q)
      )
    }
    return list
  }, [jobs, statusFilter, search])

  // ── numbering ───────────────────────────────────────────────────────────────
  const getNextJobNumber = async () => {
    const { data } = await supabase
      .from('jobs').select('job_number').ilike('job_number', 'JOB-%')
      .order('created_at', { ascending: false }).limit(1)
    const last = data?.[0]?.job_number || 'JOB-0000'
    const num = parseInt(last.replace('JOB-', ''), 10) || 0
    return `JOB-${String(num + 1).padStart(4, '0')}`
  }

  // ── form helpers ────────────────────────────────────────────────────────────
  const setF = useCallback((field, val) => setForm(f => ({ ...f, [field]: val })), [])

  const totalBudgetForm = useMemo(() => {
    return (parseFloat(form.budget_materials) || 0)
      + (parseFloat(form.budget_labour) || 0)
      + (parseFloat(form.budget_overhead) || 0)
      + (parseFloat(form.budget_other) || 0)
  }, [form.budget_materials, form.budget_labour, form.budget_overhead, form.budget_other])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (job) => {
    setEditing(job)
    setForm({
      title:            job.title || '',
      client_name:      job.client_name || '',
      status:           job.status || 'Open',
      start_date:       job.start_date || '',
      end_date:         job.end_date || '',
      department:       job.department || '',
      cost_center:      job.cost_center || '',
      project_manager:  job.project_manager || '',
      budget_materials: job.budget_materials ?? '',
      budget_labour:    job.budget_labour ?? '',
      budget_overhead:  job.budget_overhead ?? '',
      budget_other:     job.budget_other ?? '',
      contract_value:   job.contract_value ?? '',
      notes:            job.notes || '',
    })
    setShowForm(true)
  }

  const saveJob = async () => {
    if (!form.title.trim()) return toast.error('Title is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        budget_materials: parseFloat(form.budget_materials) || 0,
        budget_labour:    parseFloat(form.budget_labour) || 0,
        budget_overhead:  parseFloat(form.budget_overhead) || 0,
        budget_other:     parseFloat(form.budget_other) || 0,
        contract_value:   form.contract_value !== '' ? parseFloat(form.contract_value) : null,
        updated_at:       new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('jobs').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Job updated')
      } else {
        const job_number = await getNextJobNumber()
        const { error } = await supabase.from('jobs').insert({
          id: crypto.randomUUID(),
          job_number,
          ...payload,
          created_by: user?.full_name || 'system',
          created_at: new Date().toISOString(),
        })
        if (error) throw error
        toast.success(`Job ${job_number} created`)
      }
      setShowForm(false)
      loadJobs()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── export ───────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = jobs.map(j => ({
      'Job No':         j.job_number,
      'Title':          j.title,
      'Client':         j.client_name || '',
      'Status':         j.status,
      'Department':     j.department || '',
      'Manager':        j.project_manager || '',
      'Budget Materials': j.budget_materials,
      'Budget Labour':    j.budget_labour,
      'Budget Overhead':  j.budget_overhead,
      'Budget Other':     j.budget_other,
      'Total Budget':   j.total_budget,
      'Actual Cost':    j.actual_total,
      '% Used':         j.utilisation_pct.toFixed(1),
      'Contract Value': j.contract_value || '',
      'Start Date':     j.start_date || '',
      'End Date':       j.end_date || '',
      'Cost Center':    j.cost_center || '',
    }))
    exportXLSX(rows, `JobRegister_${dateTag()}`, 'Jobs')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Job Register"
        subtitle="Create and track jobs with budget vs actual cost analysis"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons" style={{ fontSize: 16 }}>download</span>
          Export
        </button>
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          New Job
        </button>
      </PageHeader>

      {/* ── KPI row ── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Open Jobs"
          value={kpis.openCount}
          icon="work"
          color="blue"
          sub="Open + In Progress"
        />
        <KPICard
          label="Total Budget"
          value={`$${fmtNum(kpis.totalBudget)}`}
          icon="account_balance"
          color="gold"
          sub="across open jobs"
        />
        <KPICard
          label="Total Spent"
          value={`$${fmtNum(kpis.totalSpent)}`}
          icon="payments"
          color={kpis.totalSpent > kpis.totalBudget ? 'red' : 'green'}
          sub="actual costs posted"
        />
        <KPICard
          label="WIP Value"
          value={`$${fmtNum(kpis.wipValue)}`}
          icon="construction"
          color="teal"
          sub="costs on In Progress jobs"
        />
      </div>

      {/* ── search + filter ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-control"
          style={{ maxWidth: 280 }}
          placeholder="Search jobs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="tab-nav" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...STATUSES].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── table ── */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="work_outline"
          message="No jobs found"
          action={
            <button className="btn btn-primary btn-sm" onClick={openAdd}>Create First Job</button>
          }
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Job No</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Department</th>
                  <th>Manager</th>
                  <th style={{ textAlign: 'right' }}>Budget</th>
                  <th style={{ textAlign: 'right' }}>Actual</th>
                  <th style={{ minWidth: 120 }}>% Used</th>
                  <th style={{ textAlign: 'right' }}>Contract Value</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => (
                  <tr key={job.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700, fontSize: 12 }}>
                        {job.job_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.title}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{job.client_name || '—'}</td>
                    <td><StatusBadgeLocal status={job.status} /></td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{job.department || '—'}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{job.project_manager || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      ${fmtNum(job.total_budget)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12,
                      color: job.actual_total > job.total_budget ? 'var(--red)' : 'var(--green)' }}>
                      ${fmtNum(job.actual_total)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          flex: 1, height: 6, borderRadius: 3,
                          background: 'var(--surface2)', overflow: 'hidden', minWidth: 60,
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, job.utilisation_pct)}%`,
                            background: progressColor(job.utilisation_pct),
                            borderRadius: 3, transition: 'width .3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--mono)',
                          color: progressColor(job.utilisation_pct), minWidth: 36, textAlign: 'right' }}>
                          {job.utilisation_pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                      {job.contract_value != null ? `$${fmtNum(job.contract_value)}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {job.start_date ? fmtDate(job.start_date) : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {job.end_date ? fmtDate(job.end_date) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Edit job"
                          onClick={() => openEdit(job)}
                        >
                          <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View Cost Sheet"
                          style={{ color: 'var(--teal)' }}
                          onClick={() => navigate(`/module/projects/job-cost-sheet?job=${job.id}`)}
                        >
                          <span className="material-icons" style={{ fontSize: 14 }}>receipt_long</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Job Form Modal ── */}
      <ModalDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Edit Job · ${editing.job_number}` : 'New Job'}
        size="xl"
      >
        <div style={{ padding: '0 24px 8px' }}>
          {/* Row 1: Title + Client */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Title <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                value={form.title}
                onChange={e => setF('title', e.target.value)}
                placeholder="e.g. Road Rehabilitation Phase 2"
              />
            </div>
            <div>
              <label className="form-label">Client Name</label>
              <input
                className="form-control"
                value={form.client_name}
                onChange={e => setF('client_name', e.target.value)}
                placeholder="External client or internal dept"
              />
            </div>
          </div>

          {/* Row 2: Status + Project Manager */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => setF('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Project Manager</label>
              <input
                className="form-control"
                value={form.project_manager}
                onChange={e => setF('project_manager', e.target.value)}
                placeholder="Responsible manager"
              />
            </div>
          </div>

          {/* Row 3: Department + Cost Center */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Department</label>
              <input
                className="form-control"
                value={form.department}
                onChange={e => setF('department', e.target.value)}
                placeholder="Owning department"
              />
            </div>
            <div>
              <label className="form-label">Cost Center</label>
              <input
                className="form-control"
                value={form.cost_center}
                onChange={e => setF('cost_center', e.target.value)}
                placeholder="Cost center code"
              />
            </div>
          </div>

          {/* Row 4: Start Date + End Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={form.start_date}
                onChange={e => setF('start_date', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-control"
                value={form.end_date}
                onChange={e => setF('end_date', e.target.value)}
              />
            </div>
          </div>

          {/* Budget section */}
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '14px 16px',
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: .5 }}>
              Budget
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label" style={{ fontSize: 11 }}>Materials</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.budget_materials}
                  onChange={e => setF('budget_materials', e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 11 }}>Labour</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.budget_labour}
                  onChange={e => setF('budget_labour', e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 11 }}>Overhead</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.budget_overhead}
                  onChange={e => setF('budget_overhead', e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 11 }}>Other</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.budget_other}
                  onChange={e => setF('budget_other', e.target.value)}
                  min="0" step="0.01" placeholder="0.00"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Total Budget:</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                ${fmtNum(totalBudgetForm)}
              </span>
            </div>
          </div>

          {/* Revenue section */}
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Contract Value <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional — agreed client amount)</span></label>
            <input
              type="number"
              className="form-control"
              style={{ maxWidth: 260 }}
              value={form.contract_value}
              onChange={e => setF('contract_value', e.target.value)}
              min="0" step="0.01" placeholder="Leave blank if not applicable"
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 8 }}>
            <label className="form-label">Notes</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              placeholder="Any additional notes…"
            />
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={saveJob} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Job'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
