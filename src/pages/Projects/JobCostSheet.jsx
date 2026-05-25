// src/pages/Projects/JobCostSheet.jsx
// Phase 21 — Job Cost Sheet: per-job cost analysis, entries, SR import, XLSX export

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX, exportMultiSheet, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'

// ─── constants ────────────────────────────────────────────────────────────────
const COST_TYPES = ['Material', 'Labour', 'Overhead', 'Subcontractor', 'Other']
const SOURCE_TYPES = ['Manual', 'StoreRequisition', 'PayrollRecord', 'PurchaseInvoice']

const COST_TYPE_COLOR = {
  Material:       'var(--blue)',
  Labour:         'var(--teal)',
  Overhead:       'var(--purple)',
  Subcontractor:  'var(--gold)',
  Other:          'var(--text-dim)',
}

const COST_TYPE_BADGE = {
  Material:       'badge-blue',
  Labour:         'badge-teal',
  Overhead:       'badge-purple',
  Subcontractor:  'badge-gold',
  Other:          'badge-dim',
}

const SOURCE_TYPE_COLOR = {
  Manual:             'var(--text-dim)',
  StoreRequisition:   'var(--green)',
  PayrollRecord:      'var(--teal)',
  PurchaseInvoice:    'var(--blue)',
}

const SOURCE_TYPE_BADGE = {
  Manual:             'badge-dim',
  StoreRequisition:   'badge-green',
  PayrollRecord:      'badge-teal',
  PurchaseInvoice:    'badge-blue',
}

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

const emptyEntry = () => ({
  cost_type:    'Material',
  description:  '',
  source_type:  '',
  source_ref:   '',
  posting_date: new Date().toISOString().split('T')[0],
  qty:          '1',
  unit:         'pcs',
  rate:         '',
  notes:        '',
})

// ─── helper badges ────────────────────────────────────────────────────────────
function CostTypeBadge({ type }) {
  return (
    <span className={`badge ${COST_TYPE_BADGE[type] || 'badge-dim'}`} style={{ fontSize: 11 }}>
      {type}
    </span>
  )
}

function SourceTypeBadge({ type }) {
  if (!type) return <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
  return (
    <span className={`badge ${SOURCE_TYPE_BADGE[type] || 'badge-dim'}`} style={{ fontSize: 11 }}>
      {type === 'StoreRequisition' ? 'SR' : type === 'PurchaseInvoice' ? 'PI' : type === 'PayrollRecord' ? 'Payroll' : type}
    </span>
  )
}

function StatusBadgeLocal({ status }) {
  return (
    <span className={`badge ${STATUS_BADGE_CLS[status] || 'badge-dim'}`} style={{ fontSize: 11 }}>
      {status}
    </span>
  )
}

// ─── variance color helper ─────────────────────────────────────────────────────
function varColor(v) { return v >= 0 ? 'var(--green)' : 'var(--red)' }

// ─── component ────────────────────────────────────────────────────────────────
export default function JobCostSheet() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('job')

  const [job, setJob]                     = useState(null)
  const [entries, setEntries]             = useState([])
  const [linkedSRs, setLinkedSRs]         = useState([])
  const [loading, setLoading]             = useState(false)
  const [showAddModal, setShowAddModal]   = useState(false)
  const [entryForm, setEntryForm]         = useState(emptyEntry())
  const [filterType, setFilterType]       = useState('All')
  const [saving, setSaving]               = useState(false)
  const [srExpanded, setSrExpanded]       = useState(true)
  const [importingId, setImportingId]     = useState(null)

  // ── load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    try {
      const [{ data: jobData, error: jobErr }, { data: entryData, error: entryErr }, { data: srData }] =
        await Promise.all([
          supabase.from('jobs').select('*').eq('id', jobId).single(),
          supabase.from('job_cost_entries').select('*').eq('job_id', jobId).order('posting_date', { ascending: false }),
          supabase.from('store_requisitions').select('id, sr_number, req_number, date, department, items, status').eq('job_id', jobId).eq('status', 'fulfilled'),
        ])
      if (jobErr) throw jobErr
      if (entryErr) throw entryErr
      setJob(jobData)
      setEntries(entryData || [])
      setLinkedSRs(srData || [])
    } catch (err) {
      toast.error('Failed to load cost sheet')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadData() }, [loadData])

  // ── budget vs actual ─────────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!job) return { byType: {}, totalBudget: 0, totalActual: 0, totalVariance: 0, profitability: null }

    const byType = COST_TYPES.reduce((acc, t) => {
      const typeEntries = entries.filter(e => e.cost_type === t)
      const actual = typeEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
      const budget = t === 'Material'  ? (parseFloat(job.budget_materials) || 0)
                   : t === 'Labour'    ? (parseFloat(job.budget_labour) || 0)
                   : t === 'Overhead'  ? (parseFloat(job.budget_overhead) || 0)
                   : (parseFloat(job.budget_other) || 0)  // Subcontractor + Other share budget_other
      return { ...acc, [t]: { actual, budget, variance: budget - actual, pct: budget > 0 ? (actual / budget) * 100 : 0 } }
    }, {})

    const totalBudget  = (parseFloat(job.budget_materials) || 0)
      + (parseFloat(job.budget_labour) || 0)
      + (parseFloat(job.budget_overhead) || 0)
      + (parseFloat(job.budget_other) || 0)
    const totalActual  = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
    const totalVariance = totalBudget - totalActual
    const profitability = job.contract_value != null
      ? { contractValue: parseFloat(job.contract_value), totalCost: totalActual,
          grossMargin: parseFloat(job.contract_value) - totalActual,
          marginPct: parseFloat(job.contract_value) > 0
            ? ((parseFloat(job.contract_value) - totalActual) / parseFloat(job.contract_value)) * 100
            : 0 }
      : null

    return { byType, totalBudget, totalActual, totalVariance, profitability }
  }, [job, entries])

  // ── filtered entries ─────────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (filterType === 'All') return entries
    return entries.filter(e => e.cost_type === filterType)
  }, [entries, filterType])

  // ── entry form helpers ───────────────────────────────────────────────────────
  const setEF = useCallback((field, val) => setEntryForm(f => ({ ...f, [field]: val })), [])

  const computedAmount = useMemo(() => {
    const q = parseFloat(entryForm.qty) || 0
    const r = parseFloat(entryForm.rate) || 0
    return q * r
  }, [entryForm.qty, entryForm.rate])

  const saveEntry = async () => {
    if (!entryForm.description.trim()) return toast.error('Description is required')
    if (!entryForm.rate || parseFloat(entryForm.rate) <= 0) return toast.error('Rate must be greater than 0')
    if (!entryForm.qty || parseFloat(entryForm.qty) <= 0) return toast.error('Qty must be greater than 0')
    setSaving(true)
    try {
      const { error } = await supabase.from('job_cost_entries').insert({
        id:           crypto.randomUUID(),
        job_id:       jobId,
        cost_type:    entryForm.cost_type,
        source_type:  entryForm.source_type || null,
        source_ref:   entryForm.source_ref || null,
        description:  entryForm.description,
        qty:          parseFloat(entryForm.qty),
        unit:         entryForm.unit || 'pcs',
        rate:         parseFloat(entryForm.rate),
        posting_date: entryForm.posting_date,
        notes:        entryForm.notes || null,
        created_by:   user?.full_name || 'system',
        created_at:   new Date().toISOString(),
      })
      if (error) throw error
      toast.success('Cost entry added')
      setShowAddModal(false)
      setEntryForm(emptyEntry())
      loadData()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this cost entry?')) return
    try {
      const { error } = await supabase.from('job_cost_entries').delete().eq('id', id)
      if (error) throw error
      toast.success('Entry deleted')
      loadData()
    } catch (err) {
      toast.error('Delete failed')
    }
  }

  // ── import from SR ────────────────────────────────────────────────────────────
  const importFromSR = async (sr) => {
    setImportingId(sr.id)
    try {
      // Try to get SLE values for this SR
      const srRef = sr.sr_number || sr.req_number
      let totalValue = 0
      const { data: sleData } = await supabase
        .from('stock_ledger_entries')
        .select('actual_qty, outgoing_rate')
        .eq('voucher_type', 'StoreRequisition')
        .or(`voucher_no.eq.${srRef}`)
      if (sleData && sleData.length > 0) {
        totalValue = sleData.reduce((s, e) => s + Math.abs((parseFloat(e.actual_qty) || 0) * (parseFloat(e.outgoing_rate) || 0)), 0)
      }
      // If no SLE data, try to estimate from SR items array
      if (totalValue === 0 && Array.isArray(sr.items)) {
        totalValue = sr.items.reduce((s, item) => {
          const qty  = parseFloat(item.qty) || parseFloat(item.quantity) || 0
          const rate = parseFloat(item.rate) || parseFloat(item.unit_price) || parseFloat(item.estimated_rate) || 0
          return s + qty * rate
        }, 0)
      }

      const { error } = await supabase.from('job_cost_entries').insert({
        id:           crypto.randomUUID(),
        job_id:       jobId,
        cost_type:    'Material',
        source_type:  'StoreRequisition',
        source_ref:   srRef,
        description:  `SR ${srRef} — ${sr.department || 'Unknown Dept'}`,
        qty:          1,
        unit:         'lot',
        rate:         totalValue > 0 ? totalValue : 0,
        posting_date: sr.date || new Date().toISOString().split('T')[0],
        notes:        `Imported from fulfilled SR ${srRef}`,
        created_by:   user?.full_name || 'system',
        created_at:   new Date().toISOString(),
      })
      if (error) throw error
      toast.success('Cost entry created from SR')
      loadData()
    } catch (err) {
      toast.error('Import failed: ' + (err.message || 'Unknown error'))
    } finally {
      setImportingId(null)
    }
  }

  // ── export ────────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const summaryRows = COST_TYPES.map(t => ({
      'Cost Type':   t,
      'Budget':      analysis.byType[t]?.budget ?? 0,
      'Actual':      analysis.byType[t]?.actual ?? 0,
      'Variance':    analysis.byType[t]?.variance ?? 0,
      '% Used':      (analysis.byType[t]?.pct ?? 0).toFixed(1),
    }))
    summaryRows.push({
      'Cost Type':   'TOTAL',
      'Budget':      analysis.totalBudget,
      'Actual':      analysis.totalActual,
      'Variance':    analysis.totalVariance,
      '% Used':      analysis.totalBudget > 0 ? ((analysis.totalActual / analysis.totalBudget) * 100).toFixed(1) : '0.0',
    })

    const detailRows = entries.map(e => ({
      'Date':         e.posting_date,
      'Cost Type':    e.cost_type,
      'Description':  e.description,
      'Source Type':  e.source_type || '',
      'Source Ref':   e.source_ref || '',
      'Qty':          e.qty,
      'Unit':         e.unit,
      'Rate':         e.rate,
      'Amount':       e.amount,
      'Notes':        e.notes || '',
    }))

    exportMultiSheet(
      [
        { name: 'Budget vs Actual', rows: summaryRows },
        { name: 'Cost Entries',     rows: detailRows  },
      ],
      `CostSheet_${job?.job_number || jobId}_${dateTag()}`
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  if (!jobId) {
    return (
      <div>
        <PageHeader title="Job Cost Sheet" subtitle="Select a job from the Job Register" />
        <EmptyState
          icon="receipt_long"
          message="No job selected"
          action={
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/module/projects/jobs')}>
              Go to Job Register
            </button>
          }
        />
      </div>
    )
  }

  if (loading && !job) {
    return (
      <div>
        <PageHeader title="Job Cost Sheet" subtitle="Loading…" />
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading cost sheet…</div>
      </div>
    )
  }

  return (
    <div>
      {/* ── page header ── */}
      <PageHeader
        title={job ? `Cost Sheet · ${job.job_number}` : 'Job Cost Sheet'}
        subtitle={job?.title || ''}
      >
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/module/projects/jobs')}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>arrow_back</span>
          All Jobs
        </button>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!job}>
          <span className="material-icons" style={{ fontSize: 16 }}>download</span>
          Export Cost Sheet
        </button>
        <button
          className="btn btn-primary"
          onClick={() => { setEntryForm(emptyEntry()); setShowAddModal(true) }}
          disabled={!job}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>add</span>
          Add Cost Entry
        </button>
      </PageHeader>

      {/* ── job header strip ── */}
      {job && (
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 13,
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', fontSize: 14 }}>
            {job.job_number}
          </span>
          <span style={{ fontWeight: 600 }}>{job.title}</span>
          {job.client_name && <span style={{ color: 'var(--text-dim)' }}>{job.client_name}</span>}
          <span className={`badge ${STATUS_BADGE_CLS[job.status] || 'badge-dim'}`} style={{ fontSize: 11 }}>
            {job.status}
          </span>
          {job.project_manager && (
            <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-icons" style={{ fontSize: 14 }}>person</span>
              {job.project_manager}
            </span>
          )}
          {job.department && (
            <span style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-icons" style={{ fontSize: 14 }}>business</span>
              {job.department}
            </span>
          )}
          {(job.start_date || job.end_date) && (
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              {job.start_date ? fmtDate(job.start_date) : '?'} – {job.end_date ? fmtDate(job.end_date) : 'ongoing'}
            </span>
          )}
        </div>
      )}

      {/* ── budget vs actual summary cards ── */}
      {job && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>
            Budget vs Actual
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            {COST_TYPES.map(t => {
              const d = analysis.byType[t] || { budget: 0, actual: 0, variance: 0, pct: 0 }
              return (
                <div key={t} className="card" style={{ padding: '12px 14px', borderTop: `3px solid ${COST_TYPE_COLOR[t]}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>{t}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Budget</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>${fmtNum(d.budget)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Actual</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>${fmtNum(d.actual)}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, d.pct)}%`,
                      background: d.pct > 90 ? 'var(--red)' : d.pct > 75 ? 'var(--yellow)' : COST_TYPE_COLOR[t],
                      borderRadius: 2, transition: 'width .3s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: varColor(d.variance), fontFamily: 'var(--mono)' }}>
                      {d.variance >= 0 ? '+' : ''}{fmtNum(d.variance)}
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{d.pct.toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}

            {/* Total card */}
            <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid var(--gold)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 }}>Total</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Budget</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>${fmtNum(analysis.totalBudget)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Actual</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>${fmtNum(analysis.totalActual)}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, analysis.totalBudget > 0 ? (analysis.totalActual / analysis.totalBudget) * 100 : 0)}%`,
                  background: analysis.totalActual > analysis.totalBudget ? 'var(--red)' : 'var(--gold)',
                  borderRadius: 2, transition: 'width .3s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: varColor(analysis.totalVariance), fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  {analysis.totalVariance >= 0 ? '+' : ''}{fmtNum(analysis.totalVariance)}
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {analysis.totalBudget > 0 ? ((analysis.totalActual / analysis.totalBudget) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Profitability card */}
          {analysis.profitability && (
            <div className="card" style={{ padding: '14px 18px', borderTop: `3px solid ${analysis.profitability.grossMargin >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>
                Profitability
              </div>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Contract Value</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: 'var(--blue)' }}>
                    ${fmtNum(analysis.profitability.contractValue)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Total Cost</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16 }}>
                    ${fmtNum(analysis.profitability.totalCost)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Gross Margin</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16,
                    color: analysis.profitability.grossMargin >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {analysis.profitability.grossMargin >= 0 ? '+' : ''}${fmtNum(analysis.profitability.grossMargin)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Margin %</div>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16,
                    color: analysis.profitability.marginPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {analysis.profitability.marginPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── cost entries section ── */}
      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Cost Entries</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['All', ...COST_TYPES].map(t => (
              <button
                key={t}
                className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            message={filterType === 'All' ? 'No cost entries yet' : `No ${filterType} entries`}
            action={
              <button className="btn btn-primary btn-sm" onClick={() => { setEntryForm(emptyEntry()); setShowAddModal(true) }}>
                Add First Entry
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 12 }}>
                      {fmtDate(e.posting_date)}
                    </td>
                    <td><CostTypeBadge type={e.cost_type} /></td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{e.description}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SourceTypeBadge type={e.source_type} />
                        {e.source_ref && (
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {e.source_ref}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtNum(e.qty)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{e.unit}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>${fmtNum(e.rate)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                      ${fmtNum(e.amount)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.notes || '—'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        title="Delete entry"
                        style={{ color: 'var(--red)' }}
                        onClick={() => deleteEntry(e.id)}
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, padding: '8px 12px' }}>
                    {filterType === 'All' ? 'Total Actual Cost' : `${filterType} Total`}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', fontSize: 14, padding: '8px 12px' }}>
                    ${fmtNum(filteredEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── linked store requisitions ── */}
      {job && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <button
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: srExpanded ? '1px solid var(--border)' : 'none',
            }}
            onClick={() => setSrExpanded(v => !v)}
          >
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Store Requisitions ({linkedSRs.length})
            </span>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)' }}>
              {srExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {srExpanded && (
            linkedSRs.length === 0 ? (
              <EmptyState
                icon="inventory_2"
                message="No fulfilled store requisitions linked to this job"
              />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>SR Number</th>
                      <th>Date</th>
                      <th>Department</th>
                      <th>Items</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedSRs.map(sr => {
                      const itemCount = Array.isArray(sr.items) ? sr.items.length : '—'
                      return (
                        <tr key={sr.id}>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700, fontSize: 12 }}>
                            {sr.sr_number || sr.req_number || '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            {sr.date ? fmtDate(sr.date) : '—'}
                          </td>
                          <td style={{ fontSize: 12 }}>{sr.department || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{itemCount} line{itemCount !== 1 ? 's' : ''}</td>
                          <td>
                            <span className="badge badge-green" style={{ fontSize: 11 }}>Fulfilled</span>
                          </td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => importFromSR(sr)}
                              disabled={importingId === sr.id}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              <span className="material-icons" style={{ fontSize: 14 }}>download_for_offline</span>
                              {importingId === sr.id ? 'Importing…' : 'Import as Cost Entry'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ── Add Cost Entry Modal ── */}
      <ModalDialog
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Cost Entry"
        size="lg"
      >
        <div style={{ padding: '0 24px 8px' }}>
          {/* Cost Type + Description */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Cost Type <span style={{ color: 'var(--red)' }}>*</span></label>
              <select className="form-control" value={entryForm.cost_type} onChange={e => setEF('cost_type', e.target.value)}>
                {COST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Description <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="form-control"
                value={entryForm.description}
                onChange={e => setEF('description', e.target.value)}
                placeholder="What was the cost for?"
              />
            </div>
          </div>

          {/* Source Type + Source Ref + Posting Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Source Type</label>
              <select className="form-control" value={entryForm.source_type} onChange={e => setEF('source_type', e.target.value)}>
                <option value="">— select —</option>
                {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Source Ref</label>
              <input
                className="form-control"
                value={entryForm.source_ref}
                onChange={e => setEF('source_ref', e.target.value)}
                placeholder="SR-0001, PI-0023…"
              />
            </div>
            <div>
              <label className="form-label">Posting Date <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="date"
                className="form-control"
                value={entryForm.posting_date}
                onChange={e => setEF('posting_date', e.target.value)}
              />
            </div>
          </div>

          {/* Qty + Unit + Rate + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Qty <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="number"
                className="form-control"
                value={entryForm.qty}
                onChange={e => setEF('qty', e.target.value)}
                min="0" step="0.0001" placeholder="1"
              />
            </div>
            <div>
              <label className="form-label">Unit</label>
              <input
                className="form-control"
                value={entryForm.unit}
                onChange={e => setEF('unit', e.target.value)}
                placeholder="pcs"
              />
            </div>
            <div>
              <label className="form-label">Rate <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="number"
                className="form-control"
                value={entryForm.rate}
                onChange={e => setEF('rate', e.target.value)}
                min="0" step="0.01" placeholder="0.00"
              />
            </div>
            <div>
              <label className="form-label">Amount (computed)</label>
              <input
                className="form-control"
                readOnly
                value={`$${fmtNum(computedAmount)}`}
                style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)', background: 'var(--surface2)' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 8 }}>
            <label className="form-label">Notes</label>
            <textarea
              className="form-control"
              rows={2}
              value={entryForm.notes}
              onChange={e => setEF('notes', e.target.value)}
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={saveEntry} disabled={saving}>
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
