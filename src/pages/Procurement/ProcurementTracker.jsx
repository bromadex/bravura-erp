// src/pages/Procurement/ProcurementTracker.jsx
// Phase 13 — End-to-end procurement pipeline tracker
// MR → PO → GRN → Invoice → Paid

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { exportXLSX, dateTag } from '../../engine/reportingEngine'

// ── helpers ───────────────────────────────────────────────────────────────────

const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]

function daysSince(dateStr) {
  if (!dateStr) return 0
  return Math.floor((TODAY - new Date(dateStr)) / 86400000)
}

function fmtDate(d) {
  return d ? String(d).slice(0, 10) : '—'
}

function fmtAmt(n) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── stage dot component ───────────────────────────────────────────────────────
// status: 'done' | 'partial' | 'pending' | 'overdue' | 'none'

const STAGE_COLOR = {
  done:    'var(--green)',
  partial: 'var(--yellow)',
  overdue: 'var(--red)',
  pending: 'var(--text-dim)',
  none:    'rgba(255,255,255,.1)',
}

const STAGE_LABEL_COLOR = {
  done:    'var(--green)',
  partial: 'var(--yellow)',
  overdue: 'var(--red)',
  pending: 'var(--text-mid)',
  none:    'var(--text-dim)',
}

function StageDot({ status, label, count }) {
  const color = STAGE_COLOR[status] || STAGE_COLOR.none
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 60 }}>
      <div style={{
        width: 12, height: 12,
        borderRadius: '50%',
        background: color,
        boxShadow: status !== 'none' ? `0 0 6px ${color}80` : 'none',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9,
        fontFamily: 'var(--mono)',
        fontWeight: 700,
        color: STAGE_LABEL_COLOR[status] || 'var(--text-dim)',
        letterSpacing: '.5px',
        textAlign: 'center',
      }}>
        {label}
        {count > 1 && <span style={{ color: 'var(--text-dim)' }}> ×{count}</span>}
      </span>
    </div>
  )
}

function StageArrow() {
  return (
    <div style={{ color: 'var(--border2)', fontSize: 14, marginTop: -4, alignSelf: 'flex-start', paddingTop: 0 }}>
      →
    </div>
  )
}

// ── stage logic ───────────────────────────────────────────────────────────────

function getMrStage() {
  return 'done'
}

function getPoStage(pos) {
  if (!pos.length) return 'none'
  const nonDraft = pos.filter((p) => p.status && p.status !== 'Draft')
  if (nonDraft.length === pos.length) return 'done'
  if (nonDraft.length > 0) return 'partial'
  return 'pending'
}

function getGrnStage(grns, pos) {
  if (!grns.length) return 'none'
  if (!pos.length) return 'none'
  const received = grns.filter((g) => g.status === 'Received' || g.status === 'Submitted' || g.status === 'Posted')
  if (received.length >= pos.length) return 'done'
  if (received.length > 0) return 'partial'
  return 'pending'
}

function getInvoiceStage(invoices, grns) {
  if (!invoices.length) return 'none'
  const paid = invoices.filter((i) => i.status === 'Paid' || i.status === 'Posted')
  if (paid.length === invoices.length) return 'done'
  const overdue = invoices.some((i) => i.due_date && i.due_date < TODAY_STR && i.status !== 'Paid' && i.status !== 'Cancelled')
  if (overdue) return 'overdue'
  if (invoices.length > 0) return 'partial'
  return 'none'
}

function getPaidStage(invoices) {
  if (!invoices.length) return 'none'
  const active = invoices.filter((i) => i.status !== 'Cancelled')
  if (!active.length) return 'none'
  const totalAmt  = active.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)
  const totalPaid = active.reduce((s, i) => s + (parseFloat(i.paid_amount) || 0), 0)
  if (totalAmt <= 0) return 'none'
  if (totalPaid >= totalAmt) return 'done'
  if (totalPaid > 0) return 'partial'
  return 'none'
}

function getOverallFilter(chain) {
  const { pos, grns, invoices } = chain
  if (!pos.length)      return 'needs_po'
  if (!grns.length)     return 'needs_grn'
  if (!invoices.length) return 'needs_invoice'
  const active = invoices.filter((i) => i.status !== 'Cancelled')
  const totalAmt  = active.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0)
  const totalPaid = active.reduce((s, i) => s + (parseFloat(i.paid_amount) || 0), 0)
  if (totalAmt > 0 && totalPaid < totalAmt) return 'needs_payment'
  return 'complete'
}

// ── filter options ────────────────────────────────────────────────────────────

const FILTER_STAGES = [
  { id: 'all',            label: 'All' },
  { id: 'needs_po',       label: 'Needs PO' },
  { id: 'needs_grn',      label: 'Needs GRN' },
  { id: 'needs_invoice',  label: 'Needs Invoice' },
  { id: 'needs_payment',  label: 'Needs Payment' },
  { id: 'complete',       label: 'Complete' },
]

// ── expanded row ──────────────────────────────────────────────────────────────

function ExpandedChain({ chain }) {
  const { pos, grns, invoices, payments } = chain
  return (
    <div style={{
      padding: '12px 16px 16px 36px',
      background: 'rgba(255,255,255,.02)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* POs */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6, letterSpacing: '.8px' }}>
            PURCHASE ORDERS ({pos.length})
          </div>
          {pos.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>None</span>
          ) : pos.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: 'var(--blue)' }}>
                {p.po_number}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.supplier_name}</span>
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                background: p.status === 'Approved' || p.status === 'Received' ? 'rgba(52,211,153,.12)' : 'rgba(251,191,36,.12)',
                color: p.status === 'Approved' || p.status === 'Received' ? 'var(--green)' : 'var(--yellow)',
              }}>{p.status}</span>
              {p.total_amount && (
                <span style={{ fontSize: 11, color: 'var(--text-mid)', fontFamily: 'var(--mono)' }}>
                  {fmtAmt(p.total_amount)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* GRNs */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6, letterSpacing: '.8px' }}>
            GOODS RECEIVED ({grns.length})
          </div>
          {grns.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>None</span>
          ) : grns.map((g) => (
            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: 'var(--teal)' }}>
                {g.grn_number}
              </span>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                background: 'rgba(52,211,153,.12)', color: 'var(--green)' }}>{g.status}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtDate(g.created_at)}</span>
            </div>
          ))}
        </div>

        {/* Invoices */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6, letterSpacing: '.8px' }}>
            INVOICES ({invoices.length})
          </div>
          {invoices.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>None</span>
          ) : invoices.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: 'var(--purple)' }}>
                {i.pi_number}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)' }}>
                {fmtAmt(i.total_amount)}
              </span>
              {i.paid_amount > 0 && (
                <span style={{ fontSize: 11, color: 'var(--green)' }}>
                  Paid: {fmtAmt(i.paid_amount)}
                </span>
              )}
              {i.due_date && (
                <span style={{
                  fontSize: 10, color: i.due_date < TODAY_STR && i.status !== 'Paid' ? 'var(--red)' : 'var(--text-dim)',
                }}>
                  Due: {fmtDate(i.due_date)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Payments */}
        {payments.length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 6, letterSpacing: '.8px' }}>
              PAYMENTS ({payments.length})
            </div>
            {payments.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: 'var(--gold)' }}>
                  {p.pv_number}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)' }}>
                  {fmtAmt(p.total_amount)}
                </span>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                  background: 'rgba(52,211,153,.12)', color: 'var(--green)' }}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ProcurementTracker() {
  // ── data ──────────────────────────────────────────────────────────────────
  const [mrs,        setMrs]        = useState([])
  const [pos,        setPos]        = useState([])
  const [grns,       setGrns]       = useState([])
  const [invoices,   setInvoices]   = useState([])
  const [pvLines,    setPvLines]    = useState([])
  const [payments,   setPayments]   = useState([])
  const [loading,    setLoading]    = useState(true)

  // ── ui ────────────────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [expanded,    setExpanded]    = useState({})   // { mrId: true }

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const since90 = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]

    const [
      { data: mrData },
      { data: poData },
      { data: grnData },
      { data: invData },
      { data: pvData },
      { data: pvLineData },
    ] = await Promise.all([
      supabase.from('material_requests')
        .select('id, mr_number, status, department, total_amount, created_at, docstatus')
        .gte('created_at', since90)
        .order('created_at', { ascending: false }),
      supabase.from('purchase_orders')
        .select('id, po_number, source_mr_id, status, total_amount, supplier_name, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('goods_received')
        .select('id, grn_number, po_id, status, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('purchase_invoices')
        .select('id, pi_number, grn_id, status, total_amount, due_date, paid_amount, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('payment_vouchers')
        .select('id, pv_number, status, total_amount, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('payment_voucher_lines')
        .select('id, voucher_id, invoice_id, amount_paid'),
    ])

    setMrs(mrData || [])
    setPos(poData || [])
    setGrns(grnData || [])
    setInvoices(invData || [])
    setPayments(pvData || [])
    setPvLines(pvLineData || [])
    setLoading(false)
  }

  // ── build chain per MR ────────────────────────────────────────────────────
  const chains = useMemo(() => {
    return mrs.map((mr) => {
      const mrPos = pos.filter((p) => p.source_mr_id === mr.id)
      const mrGrns = grns.filter((g) => mrPos.some((p) => p.id === g.po_id))
      const mrInvoices = invoices.filter((i) => mrGrns.some((g) => g.id === i.grn_id))

      // Find payments for each invoice
      const invIds = new Set(mrInvoices.map((i) => i.id))
      const linkedPvIds = new Set(pvLines.filter((l) => invIds.has(l.invoice_id)).map((l) => l.voucher_id))
      const mrPayments = payments.filter((p) => linkedPvIds.has(p.id))

      return {
        mr,
        pos: mrPos,
        grns: mrGrns,
        invoices: mrInvoices,
        payments: mrPayments,
      }
    })
  }, [mrs, pos, grns, invoices, payments, pvLines])

  // ── stage statuses ────────────────────────────────────────────────────────
  const chainWithStages = useMemo(() => {
    return chains.map((c) => {
      const mrStage      = getMrStage()
      const poStage      = getPoStage(c.pos)
      const grnStage     = getGrnStage(c.grns, c.pos)
      const invoiceStage = getInvoiceStage(c.invoices, c.grns)
      const paidStage    = getPaidStage(c.invoices)
      const overallStage = getOverallFilter(c)
      const isStuck      = c.pos.length === 0 && daysSince(c.mr.created_at) > 7
      const daysInPipeline = daysSince(c.mr.created_at)

      return { ...c, mrStage, poStage, grnStage, invoiceStage, paidStage, overallStage, isStuck, daysInPipeline }
    })
  }, [chains])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = chainWithStages.length
    const fullyPaid = chainWithStages.filter((c) => c.overallStage === 'complete').length
    const stuck = chainWithStages.filter((c) => c.isStuck).length
    const openInvoices = invoices.filter((i) => i.status !== 'Paid' && i.status !== 'Cancelled').length
    return {
      total,
      fullyPaidPct: total > 0 ? Math.round((fullyPaid / total) * 100) : 0,
      stuck,
      openInvoices,
    }
  }, [chainWithStages, invoices])

  // ── filtered + searched rows ──────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    let rows = chainWithStages

    if (stageFilter !== 'all') {
      rows = rows.filter((c) => c.overallStage === stageFilter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((c) =>
        (c.mr.mr_number || '').toLowerCase().includes(q) ||
        (c.mr.department || '').toLowerCase().includes(q) ||
        c.pos.some((p) => (p.supplier_name || '').toLowerCase().includes(q)) ||
        c.pos.some((p) => (p.po_number || '').toLowerCase().includes(q))
      )
    }

    return rows
  }, [chainWithStages, stageFilter, search])

  // ── toggle expand ─────────────────────────────────────────────────────────
  function toggleExpand(mrId) {
    setExpanded((prev) => ({ ...prev, [mrId]: !prev[mrId] }))
  }

  // ── XLSX export ───────────────────────────────────────────────────────────
  function handleExport() {
    if (!visibleRows.length) return toast.error('Nothing to export')
    const rows = visibleRows.map((c) => ({
      'MR Number':    c.mr.mr_number,
      'Department':   c.mr.department || '—',
      'MR Date':      fmtDate(c.mr.created_at),
      'Days in Pipeline': c.daysInPipeline,
      'Total Amount': c.mr.total_amount || '',
      'PO Count':     c.pos.length,
      'PO Numbers':   c.pos.map((p) => p.po_number).join(', ') || '—',
      'Suppliers':    [...new Set(c.pos.map((p) => p.supplier_name).filter(Boolean))].join(', ') || '—',
      'GRN Count':    c.grns.length,
      'Invoice Count':c.invoices.length,
      'Paid Amount':  c.invoices.reduce((s, i) => s + (parseFloat(i.paid_amount) || 0), 0).toFixed(2),
      'Stage':        c.overallStage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      'Stuck':        c.isStuck ? 'Yes' : 'No',
    }))
    exportXLSX(rows, `ProcurementTracker_${dateTag()}`)
    toast.success(`Exported ${rows.length} rows`)
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 24 }}><p style={{ color: 'var(--text-dim)' }}>Loading procurement data…</p></div>
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Procurement Tracker"
        subtitle="End-to-end visibility: MR → PO → GRN → Invoice → Paid (last 90 days)"
      >
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>
          <span className="material-icons md-18">download</span> Export XLSX
        </button>
      </PageHeader>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 24 }}>
        <KPICard
          label="TOTAL MRs (90d)"
          value={kpis.total}
          icon="assignment"
          color="blue"
        />
        <KPICard
          label="FULLY PAID %"
          value={`${kpis.fullyPaidPct}%`}
          icon="paid"
          color="green"
          sub={`${chainWithStages.filter((c) => c.overallStage === 'complete').length} complete`}
        />
        <KPICard
          label="STUCK (NO PO > 7d)"
          value={kpis.stuck}
          icon="warning"
          color={kpis.stuck > 0 ? 'red' : 'teal'}
        />
        <KPICard
          label="OPEN INVOICES"
          value={kpis.openInvoices}
          icon="receipt_long"
          color="yellow"
        />
      </div>

      {/* Search + Stage Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-control"
          style={{ maxWidth: 300 }}
          placeholder="Search MR#, supplier, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="btn-group">
          {FILTER_STAGES.map((f) => {
            const count = f.id === 'all'
              ? chainWithStages.length
              : chainWithStages.filter((c) => c.overallStage === f.id).length
            return (
              <button
                key={f.id}
                className={`btn btn-sm ${stageFilter === f.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStageFilter(f.id)}
              >
                {f.label}
                {count > 0 && (
                  <span style={{
                    marginLeft: 4,
                    background: stageFilter === f.id ? 'rgba(255,255,255,.25)' : 'var(--surface2)',
                    borderRadius: 10,
                    padding: '1px 5px',
                    fontSize: 9,
                    fontFamily: 'var(--mono)',
                    fontWeight: 800,
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>
          {visibleRows.length} MR{visibleRows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tracker Table */}
      {visibleRows.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12,
        }}>
          <EmptyState icon="assignment" message="No procurement records match your filters" />
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '24px 140px 130px 1fr 90px 300px 80px',
            padding: '10px 16px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            gap: 8,
          }}>
            {['', 'MR NUMBER', 'DEPARTMENT', 'SUPPLIER(S)', 'AMOUNT', 'PIPELINE', 'DAYS'].map((h, i) => (
              <div key={i} style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                color: 'var(--text-dim)',
                fontWeight: 700,
                letterSpacing: '1px',
              }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {visibleRows.map((c) => {
            const isOpen = !!expanded[c.mr.id]
            const suppliers = [...new Set(c.pos.map((p) => p.supplier_name).filter(Boolean))]

            return (
              <div key={c.mr.id}>
                {/* Main row */}
                <div
                  onClick={() => toggleExpand(c.mr.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 140px 130px 1fr 90px 300px 80px',
                    padding: '12px 16px',
                    gap: 8,
                    alignItems: 'center',
                    cursor: 'pointer',
                    borderBottom: isOpen ? 'none' : '1px solid var(--border)',
                    borderLeft: c.isStuck ? '3px solid var(--red)' : '3px solid transparent',
                    background: isOpen ? 'rgba(255,255,255,.02)' : 'transparent',
                    transition: 'background .15s',
                  }}
                >
                  {/* Expand icon */}
                  <div>
                    <span className="material-icons md-18" style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                      {isOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>

                  {/* MR Number */}
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12, color: 'var(--text)' }}>
                      {c.mr.mr_number || c.mr.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                      {fmtDate(c.mr.created_at)}
                    </div>
                    {c.isStuck && (
                      <div style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: 2, fontWeight: 700 }}>
                        STUCK
                      </div>
                    )}
                  </div>

                  {/* Department */}
                  <div style={{ fontSize: 12, color: 'var(--text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.mr.department || '—'}
                  </div>

                  {/* Suppliers */}
                  <div style={{ overflow: 'hidden' }}>
                    {suppliers.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No PO yet</span>
                    ) : suppliers.length === 1 ? (
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {suppliers[0]}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12 }}>
                        {suppliers[0]}
                        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}> +{suppliers.length - 1}</span>
                      </span>
                    )}
                  </div>

                  {/* Amount */}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)', textAlign: 'right' }}>
                    {c.mr.total_amount ? fmtAmt(c.mr.total_amount) : '—'}
                  </div>

                  {/* Stage pipeline */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StageDot status={c.mrStage}      label="MR"      />
                    <StageArrow />
                    <StageDot status={c.poStage}      label="PO"      count={c.pos.length} />
                    <StageArrow />
                    <StageDot status={c.grnStage}     label="GRN"     count={c.grns.length} />
                    <StageArrow />
                    <StageDot status={c.invoiceStage} label="INVOICE" count={c.invoices.length} />
                    <StageArrow />
                    <StageDot status={c.paidStage}    label="PAID"    />
                  </div>

                  {/* Days in pipeline */}
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      fontFamily: 'var(--mono)',
                      fontWeight: 800,
                      fontSize: 13,
                      color: c.daysInPipeline > 30 ? 'var(--yellow)' : c.daysInPipeline > 60 ? 'var(--red)' : 'var(--text-mid)',
                    }}>
                      {c.daysInPipeline}d
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && <ExpandedChain chain={c} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
