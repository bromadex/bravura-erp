// src/pages/Projects/JobCostingReport.jsx
//
// Phase 21: Multi-job costing overview report
// - WIP valuation
// - Budget utilisation
// - Profitability analysis
// - Period filter + multi-sheet XLSX export

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { exportMultiSheet, dateTag } from '../../engine/reportingEngine'
import { PageHeader, StatusBadge } from '../../components/ui'

// ── helpers ────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const STATUS_COLOR = {
  Open:        'var(--blue)',
  'In Progress': 'var(--gold)',
  Completed:   'var(--green)',
  Cancelled:   'var(--red)',
  'On Hold':   'var(--yellow)',
}

const StatusPill = ({ status }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 99,
    border: `1px solid ${STATUS_COLOR[status] || 'var(--border)'}`,
    color: STATUS_COLOR[status] || 'var(--text-dim)',
    background: 'transparent', whiteSpace: 'nowrap',
  }}>{status || '—'}</span>
)

const ProgressBar = ({ pct }) => {
  const color = pct > 90 ? 'var(--red)' : pct > 75 ? 'var(--yellow)' : 'var(--green)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color, minWidth: 38, textAlign: 'right' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────
export default function JobCostingReport() {
  const navigate = useNavigate()

  const [jobs,     setJobs]     = useState([])
  const [entries,  setEntries]  = useState([])     // all-time entries
  const [period,   setPeriod]   = useState([])     // period-filtered entries
  const [loading,  setLoading]  = useState(false)
  const [view,     setView]     = useState('summary')  // 'summary' | 'wip' | 'profitability'

  // Date range — default: start of current year → today
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear(), 0, 1)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])

  // ── Data load ────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    try {
      const [{ data: jobData }, { data: allEntries }, { data: periodEntries }] = await Promise.all([
        supabase.from('jobs').select('*').order('job_number'),
        supabase.from('job_cost_entries').select('*'),
        supabase.from('job_cost_entries').select('*')
          .gte('posting_date', fromDate)
          .lte('posting_date', toDate),
      ])
      setJobs(jobData || [])
      setEntries(allEntries || [])
      setPeriod(periodEntries || [])
    } catch (err) {
      toast.error('Failed to load job costing data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed summaries ────────────────────────────────────
  const jobSummaries = useMemo(() => jobs.map(job => {
    const allJobEntries    = entries.filter(e => e.job_id === job.id)
    const periodJobEntries = period.filter(e => e.job_id === job.id)

    const totalBudget  = (job.budget_materials || 0) + (job.budget_labour || 0) +
                         (job.budget_overhead  || 0) + (job.budget_other  || 0)
    const allTimeActual  = allJobEntries.reduce((s, e) => s + (e.amount || 0), 0)
    const periodActual   = periodJobEntries.reduce((s, e) => s + (e.amount || 0), 0)
    const utilisationPct = totalBudget > 0 ? (allTimeActual / totalBudget) * 100 : 0
    const variance       = totalBudget - allTimeActual

    const grossMargin = job.contract_value ? job.contract_value - allTimeActual : null
    const marginPct   = (job.contract_value && job.contract_value > 0)
      ? ((grossMargin / job.contract_value) * 100) : null

    // Cost type breakdown (all-time)
    const byType = { Material: 0, Labour: 0, Overhead: 0, Other: 0 }
    for (const e of allJobEntries) {
      const k = e.cost_type || 'Other'
      byType[k] = (byType[k] || 0) + (e.amount || 0)
    }

    return {
      ...job,
      totalBudget, allTimeActual, periodActual,
      utilisationPct, variance, grossMargin, marginPct,
      byType,
    }
  }), [jobs, entries, period])

  // ── KPIs ──────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activeJobs  = jobSummaries.filter(j => j.status === 'Open' || j.status === 'In Progress')
    const wipJobs     = jobSummaries.filter(j => j.status === 'In Progress')
    const totalBudget = activeJobs.reduce((s, j) => s + j.totalBudget, 0)
    const totalActual = activeJobs.reduce((s, j) => s + j.allTimeActual, 0)
    const wipValue    = wipJobs.reduce((s, j) => s + j.allTimeActual, 0)
    return {
      totalJobs:    jobs.length,
      activeCount:  activeJobs.length,
      totalBudget,
      totalActual,
      budgetPct:    totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
      wipValue,
    }
  }, [jobSummaries, jobs.length])

  // ── WIP jobs ─────────────────────────────────────────────
  const wipSummaries = useMemo(() =>
    jobSummaries.filter(j => j.status === 'Open' || j.status === 'In Progress')
  , [jobSummaries])

  // ── Profitability jobs ────────────────────────────────────
  const profitJobs = useMemo(() =>
    jobSummaries.filter(j => j.contract_value > 0)
  , [jobSummaries])

  // ── Export ────────────────────────────────────────────────
  const handleExport = () => {
    exportMultiSheet([
      {
        name: 'Job Summary',
        rows: jobSummaries.map(j => ({
          'Job No':       j.job_number,
          'Title':        j.title,
          'Client':       j.client_name || j.client || '—',
          'Status':       j.status,
          'Department':   j.department || '—',
          'Total Budget': j.totalBudget,
          'Actual Cost':  j.allTimeActual,
          'Variance':     j.variance,
          '% Used':       +j.utilisationPct.toFixed(2),
          'Period Spend': j.periodActual,
        })),
      },
      {
        name: 'WIP Valuation',
        rows: wipSummaries.map(j => ({
          'Job No':       j.job_number,
          'Title':        j.title,
          'Status':       j.status,
          'Budget':       j.totalBudget,
          'WIP (Actual)': j.allTimeActual,
          '% Complete':   +j.utilisationPct.toFixed(2),
        })),
      },
      {
        name: 'Profitability',
        rows: profitJobs.map(j => ({
          'Job No':         j.job_number,
          'Title':          j.title,
          'Client':         j.client_name || j.client || '—',
          'Contract Value': j.contract_value,
          'Total Cost':     j.allTimeActual,
          'Gross Margin':   j.grossMargin,
          'Margin %':       j.marginPct != null ? +j.marginPct.toFixed(2) : null,
          'Status':         j.status,
        })),
      },
    ], `JobCostingReport_${dateTag()}`)
    toast.success('Report exported — 3 sheets')
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Job Costing Report">
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export Report
        </button>
      </PageHeader>

      {/* ── Date range + Load ────────────────────────────── */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>From</label>
            <input type="date" className="form-control" style={{ width: 160 }}
              value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>To</label>
            <input type="date" className="form-control" style={{ width: 160 }}
              value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={loadData} disabled={loading}>
            <span className="material-icons">refresh</span>
            {loading ? 'Loading…' : 'Load'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>
            Period spend column uses the date range above. Budget vs actual uses all-time entries.
          </span>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--blue)' }}>
          <div className="kpi-label">Total Jobs</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{kpis.totalJobs}</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--gold)' }}>
          <div className="kpi-label">Open / In Progress</div>
          <div className="kpi-val" style={{ color: 'var(--gold)' }}>{kpis.activeCount}</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--teal)' }}>
          <div className="kpi-label">Total Budget (Active)</div>
          <div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 18 }}>${fmt(kpis.totalBudget)}</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: `3px solid ${kpis.budgetPct > 90 ? 'var(--red)' : 'var(--green)'}` }}>
          <div className="kpi-label">Total Actual (Active)</div>
          <div className="kpi-val" style={{ color: kpis.budgetPct > 90 ? 'var(--red)' : 'var(--green)', fontSize: 18 }}>
            ${fmt(kpis.totalActual)}
          </div>
          <div className="kpi-sub">{kpis.budgetPct.toFixed(1)}% of budget</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '3px solid var(--purple)' }}>
          <div className="kpi-label">WIP Value</div>
          <div className="kpi-val" style={{ color: 'var(--purple)', fontSize: 18 }}>${fmt(kpis.wipValue)}</div>
          <div className="kpi-sub">In Progress jobs only</div>
        </div>
      </div>

      {/* ── View tabs ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'summary',      label: 'Job Summary',    icon: 'table_view'     },
          { key: 'wip',          label: 'WIP Valuation',  icon: 'construction'   },
          { key: 'profitability',label: 'Profitability',  icon: 'trending_up'    },
        ].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', border: 'none', cursor: 'pointer',
              background: 'transparent', fontSize: 13, fontWeight: view === t.key ? 700 : 400,
              color: view === t.key ? 'var(--gold)' : 'var(--text-dim)',
              borderBottom: view === t.key ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>hourglass_empty</span>
          Loading data…
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VIEW: Job Summary
      ══════════════════════════════════════════════════════ */}
      {!loading && view === 'summary' && (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Job No</th>
                <th>Title</th>
                <th>Client</th>
                <th>Status</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Total Budget</th>
                <th style={{ textAlign: 'right' }}>Actual Cost</th>
                <th style={{ textAlign: 'right' }}>Variance</th>
                <th style={{ minWidth: 120 }}>% Used</th>
                <th style={{ textAlign: 'right' }}>Period Spend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobSummaries.length === 0 ? (
                <tr><td colSpan="11" className="empty-state">No jobs found</td></tr>
              ) : jobSummaries.map(j => (
                <tr key={j.id}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e  => e.currentTarget.style.background = ''}>
                  <td className="td-mono" style={{ color: 'var(--gold)', fontWeight: 700 }}>{j.job_number}</td>
                  <td style={{ fontWeight: 600, maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div>
                    {/* Cost type breakdown mini row */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                      {Object.entries(j.byType).filter(([, v]) => v > 0).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                          {k}: {fmt(v)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>
                    {j.client_name || j.client || '—'}
                  </td>
                  <td><StatusPill status={j.status} /></td>
                  <td style={{ fontSize: 12 }}>{j.department || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {j.totalBudget > 0 ? `$${fmt(j.totalBudget)}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    ${fmt(j.allTimeActual)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12,
                    color: j.variance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {j.totalBudget > 0 ? (j.variance >= 0 ? '+' : '') + '$' + fmt(Math.abs(j.variance)) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td>
                    {j.totalBudget > 0
                      ? <ProgressBar pct={j.utilisationPct} />
                      : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>No budget</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {j.periodActual > 0 ? `$${fmt(j.periodActual)}` : <span style={{ color: 'var(--text-dim)' }}>$0.00</span>}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm"
                      title="Open Cost Sheet"
                      onClick={() => navigate(`/module/projects/jobs/${j.id}/cost-sheet`)}>
                      <span className="material-icons" style={{ fontSize: 14 }}>receipt_long</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VIEW: WIP Valuation
      ══════════════════════════════════════════════════════ */}
      {!loading && view === 'wip' && (
        <div>
          {/* Gold-bordered WIP summary box */}
          <div style={{
            border: '1px solid var(--gold)', borderRadius: 10,
            padding: '20px 24px', marginBottom: 24,
            background: 'rgba(234,179,8,.04)',
            fontFamily: 'var(--mono)', fontSize: 13,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 12 }}>
              WORK IN PROGRESS VALUATION
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>
              As at: <strong style={{ color: 'var(--text)' }}>{toDate}</strong>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border)', marginBottom: 12 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '6px 24px', alignItems: 'center' }}>
              {/* Header row */}
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: '0.08em' }}>JOB</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, textAlign: 'right' }}>BUDGET</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, textAlign: 'right' }}>ACTUAL</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, textAlign: 'right' }}>WIP %</div>

              {/* Open Jobs section */}
              {wipSummaries.filter(j => j.status === 'Open').length > 0 && <>
                <div style={{ gridColumn: 'span 4', fontSize: 10, color: 'var(--blue)', marginTop: 8, fontWeight: 700, letterSpacing: '0.06em' }}>
                  OPEN JOBS
                </div>
                {wipSummaries.filter(j => j.status === 'Open').map(j => (
                  <>
                    <div key={j.id + 'n'} style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--gold)' }}>{j.job_number}</span>
                      {' '}<span style={{ color: 'var(--text-mid)' }}>{j.title}</span>
                    </div>
                    <div key={j.id + 'b'} style={{ textAlign: 'right', fontSize: 12 }}>${fmt(j.totalBudget)}</div>
                    <div key={j.id + 'a'} style={{ textAlign: 'right', fontSize: 12, color: 'var(--blue)' }}>${fmt(j.allTimeActual)}</div>
                    <div key={j.id + 'p'} style={{ textAlign: 'right', fontSize: 12 }}>{j.utilisationPct.toFixed(1)}%</div>
                  </>
                ))}
              </>}

              {/* In Progress Jobs section */}
              {wipSummaries.filter(j => j.status === 'In Progress').length > 0 && <>
                <div style={{ gridColumn: 'span 4', fontSize: 10, color: 'var(--gold)', marginTop: 8, fontWeight: 700, letterSpacing: '0.06em' }}>
                  IN PROGRESS JOBS
                </div>
                {wipSummaries.filter(j => j.status === 'In Progress').map(j => (
                  <>
                    <div key={j.id + 'n'} style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--gold)' }}>{j.job_number}</span>
                      {' '}<span style={{ color: 'var(--text-mid)' }}>{j.title}</span>
                    </div>
                    <div key={j.id + 'b'} style={{ textAlign: 'right', fontSize: 12 }}>${fmt(j.totalBudget)}</div>
                    <div key={j.id + 'a'} style={{ textAlign: 'right', fontSize: 12, color: 'var(--gold)' }}>${fmt(j.allTimeActual)}</div>
                    <div key={j.id + 'p'} style={{ textAlign: 'right', fontSize: 12 }}>{j.utilisationPct.toFixed(1)}%</div>
                  </>
                ))}
              </>}

              {/* Totals */}
              <div style={{ gridColumn: 'span 4', borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }} />
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>TOTAL WIP</div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                ${fmt(wipSummaries.reduce((s, j) => s + j.totalBudget, 0))}
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: 'var(--purple)' }}>
                ${fmt(wipSummaries.reduce((s, j) => s + j.allTimeActual, 0))}
              </div>
              <div />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10, fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Note: WIP represents costs incurred on incomplete work (Open + In Progress jobs)
            </div>
          </div>

          {/* WIP Table */}
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Job No</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Budget</th>
                  <th style={{ textAlign: 'right' }}>Actual (WIP)</th>
                  <th style={{ minWidth: 130 }}>% Complete</th>
                  <th style={{ textAlign: 'right' }}>Est. Completion Value</th>
                </tr>
              </thead>
              <tbody>
                {wipSummaries.length === 0 ? (
                  <tr><td colSpan="7" className="empty-state">No open or in-progress jobs</td></tr>
                ) : wipSummaries.map(j => {
                  // Est. completion value: budget remaining + actual so far
                  const estComplete = j.allTimeActual + Math.max(0, j.totalBudget - j.allTimeActual)
                  return (
                    <tr key={j.id}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseOut={e  => e.currentTarget.style.background = ''}>
                      <td className="td-mono" style={{ color: 'var(--gold)', fontWeight: 700 }}>{j.job_number}</td>
                      <td style={{ fontWeight: 600 }}>{j.title}</td>
                      <td><StatusPill status={j.status} /></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {j.totalBudget > 0 ? `$${fmt(j.totalBudget)}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--purple)' }}>
                        ${fmt(j.allTimeActual)}
                      </td>
                      <td>
                        {j.totalBudget > 0
                          ? <ProgressBar pct={j.utilisationPct} />
                          : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>No budget set</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>
                        {j.totalBudget > 0 ? `$${fmt(estComplete)}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          VIEW: Profitability
      ══════════════════════════════════════════════════════ */}
      {!loading && view === 'profitability' && (
        <div>
          {profitJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>trending_up</span>
              <div>No jobs with contract values set.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Set a contract value on job records to see profitability analysis.</div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Job No</th>
                      <th>Title</th>
                      <th>Client</th>
                      <th style={{ textAlign: 'right' }}>Contract Value</th>
                      <th style={{ textAlign: 'right' }}>Total Cost</th>
                      <th style={{ textAlign: 'right' }}>Gross Margin</th>
                      <th style={{ minWidth: 110 }}>Margin %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitJobs.map(j => {
                      const marginColor = j.marginPct == null ? 'var(--text-dim)'
                        : j.marginPct > 20 ? 'var(--green)'
                        : j.marginPct >= 5 ? 'var(--yellow)'
                        : 'var(--red)'
                      return (
                        <tr key={j.id}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                          onMouseOut={e  => e.currentTarget.style.background = ''}>
                          <td className="td-mono" style={{ color: 'var(--gold)', fontWeight: 700 }}>{j.job_number}</td>
                          <td style={{ fontWeight: 600 }}>{j.title}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{j.client_name || j.client || '—'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>
                            ${fmt(j.contract_value)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                            ${fmt(j.allTimeActual)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: j.grossMargin >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {j.grossMargin != null ? (j.grossMargin >= 0 ? '+' : '') + '$' + fmt(Math.abs(j.grossMargin)) : '—'}
                          </td>
                          <td>
                            {j.marginPct != null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', minWidth: 50 }}>
                                  <div style={{ width: `${Math.min(Math.max(j.marginPct, 0), 100)}%`, height: '100%', background: marginColor, borderRadius: 4 }} />
                                </div>
                                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: marginColor, minWidth: 40, textAlign: 'right' }}>
                                  {j.marginPct.toFixed(1)}%
                                </span>
                              </div>
                            ) : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>}
                          </td>
                          <td><StatusPill status={j.status} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Profitability summary footer */}
              {(() => {
                const totalCV    = profitJobs.reduce((s, j) => s + (j.contract_value || 0), 0)
                const totalCost  = profitJobs.reduce((s, j) => s + j.allTimeActual, 0)
                const totalGM    = totalCV - totalCost
                const blendedPct = totalCV > 0 ? (totalGM / totalCV) * 100 : 0
                const blendColor = blendedPct > 20 ? 'var(--green)' : blendedPct >= 5 ? 'var(--yellow)' : 'var(--red)'
                return (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16,
                    padding: '16px 20px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 10,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Total Contract Value</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--teal)' }}>${fmt(totalCV)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Total Cost</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700 }}>${fmt(totalCost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Total Gross Margin</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: totalGM >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {totalGM >= 0 ? '+' : ''}${fmt(Math.abs(totalGM))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Blended Margin %</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: blendColor }}>
                        {blendedPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
