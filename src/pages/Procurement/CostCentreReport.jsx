// src/pages/Procurement/CostCentreReport.jsx
// Cost Centre / Department Spending Report
// Aggregates spend from stock issues (transactions), PO lines, and invoice lines
// across department, cost centre, and project dimensions.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, TabNav } from '../../components/ui'

// ── Date helpers ──────────────────────────────────────────────────────────
const TODAY = new Date()
const pad = n => String(n).padStart(2, '0')
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function getPeriodRange(preset) {
  const y  = TODAY.getFullYear()
  const m  = TODAY.getMonth()   // 0-indexed
  switch (preset) {
    case 'this_month':
      return [isoDate(new Date(y, m, 1)), isoDate(new Date(y, m + 1, 0))]
    case 'last_month':
      return [isoDate(new Date(y, m - 1, 1)), isoDate(new Date(y, m, 0))]
    case 'this_quarter': {
      const q = Math.floor(m / 3)
      return [isoDate(new Date(y, q * 3, 1)), isoDate(new Date(y, q * 3 + 3, 0))]
    }
    case 'this_year':
      return [isoDate(new Date(y, 0, 1)), isoDate(new Date(y, 11, 31))]
    default:
      return [isoDate(new Date(y, m, 1)), isoDate(new Date(y, m + 1, 0))]
  }
}

const PRESETS = [
  { id: 'this_month',   label: 'This Month'   },
  { id: 'last_month',   label: 'Last Month'   },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'this_year',    label: 'This Year'    },
  { id: 'custom',       label: 'Custom'       },
]

const TABS = [
  { id: 'department',   label: 'By Department',   icon: 'corporate_fare'  },
  { id: 'cost_center',  label: 'By Cost Centre',  icon: 'account_balance' },
  { id: 'project',      label: 'By Project',      icon: 'folder_open'     },
  { id: 'timeline',     label: 'Timeline',         icon: 'bar_chart'       },
]

const UNALLOCATED = 'Unallocated'

// ── Aggregation helpers ───────────────────────────────────────────────────
function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const d = dateStr.split('T')[0]
  return d >= from && d <= to
}

function groupSpend(transactions, poLines, invoiceLines, dateFrom, dateTo, groupKey) {
  const map = {}

  const upsert = (key, field, amount) => {
    const k = key || UNALLOCATED
    if (!map[k]) map[k] = { key: k, poSpend: 0, invoiceSpend: 0, stockIssues: 0 }
    map[k][field] += amount
  }

  // Stock issues from transactions
  for (const t of transactions) {
    if (!inRange(t.date, dateFrom, dateTo)) continue
    const val = (Number(t.qty) || 0) * (Number(t.cost) || 0)
    if (val <= 0) continue
    const k = t[groupKey]
    upsert(k, 'stockIssues', val)
  }

  // PO lines
  for (const line of poLines) {
    const po = line.purchase_orders
    if (!po) continue
    if (!inRange(po.order_date, dateFrom, dateTo)) continue
    const k = po[groupKey]
    const lineTotal = (Number(line.qty) || 0) * (Number(line.unit_price) || 0)
    upsert(k, 'poSpend', lineTotal)
  }

  // Invoice lines (posted/paid only)
  for (const line of invoiceLines) {
    const inv = line.purchase_invoices
    if (!inv) continue
    if (!['posted', 'paid', 'Posted', 'Paid'].includes(inv.status)) continue
    // Invoice lines don't have their own groupKey — we'll skip non-PO ones or use inv date
    const invDate = inv.invoice_date
    if (!inRange(invDate, dateFrom, dateTo)) continue
    // invoiceLines don't have department/cost_center/project unless joined via PO
    // use line.purchase_invoices to get any available group field
    const k = inv[groupKey]
    const lineTotal = (Number(line.qty) || 0) * (Number(line.unit_price) || 0)
    upsert(k, 'invoiceSpend', lineTotal)
  }

  const rows = Object.values(map).map(r => ({
    ...r,
    total: r.poSpend + r.invoiceSpend + r.stockIssues,
  })).sort((a, b) => b.total - a.total)

  const grand = rows.reduce((s, r) => s + r.total, 0) || 1
  return rows.map(r => ({ ...r, pct: (r.total / grand) * 100 }))
}

// ── Monthly trend for timeline tab ───────────────────────────────────────
function buildMonthlyTrend(transactions, poLines, invoiceLines) {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d    = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1)
    const from = isoDate(d)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const to   = isoDate(last)
    const label = d.toLocaleString('en-US', { month: 'short' })

    let poSpend = 0
    let invSpend = 0
    let issueSpend = 0

    for (const t of transactions) {
      if (!inRange(t.date, from, to)) continue
      const val = (Number(t.qty) || 0) * (Number(t.cost) || 0)
      issueSpend += val
    }
    for (const line of poLines) {
      const po = line.purchase_orders
      if (!po || !inRange(po.order_date, from, to)) continue
      poSpend += (Number(line.qty) || 0) * (Number(line.unit_price) || 0)
    }
    for (const line of invoiceLines) {
      const inv = line.purchase_invoices
      if (!inv) continue
      if (!['posted', 'paid', 'Posted', 'Paid'].includes(inv.status)) continue
      if (!inRange(inv.invoice_date, from, to)) continue
      invSpend += (Number(line.qty) || 0) * (Number(line.unit_price) || 0)
    }

    months.push({ label, from, to, poSpend, invSpend, issueSpend, total: poSpend + invSpend + issueSpend })
  }
  return months
}

// ── CSS Bar Chart (no library) ────────────────────────────────────────────
function TimelineChart({ months }) {
  if (!months.length) return <EmptyState icon="bar_chart" message="No timeline data available" />

  const maxVal = Math.max(...months.map(m => m.total), 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, padding: '0 8px 0', borderBottom: '2px solid var(--border)' }}>
        {months.map((m, i) => {
          const pct = (m.total / maxVal) * 100
          return (
            <div
              key={i}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                  fontFamily: 'var(--mono)',
                  marginBottom: 2,
                }}
              >
                ${fmtNum(m.total)}
              </div>
              <div
                title={`PO: $${fmtNum(m.poSpend)} | Inv: $${fmtNum(m.invSpend)} | Issues: $${fmtNum(m.issueSpend)}`}
                style={{
                  width: '100%',
                  height: `${Math.max(pct, 2)}%`,
                  background: 'var(--teal)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height .4s',
                  cursor: 'default',
                  opacity: 0.85,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* stacked segments */}
                {m.total > 0 && (
                  <>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${(m.poSpend / m.total) * 100}%`, background: 'var(--blue)', opacity: 0.6 }} />
                    <div style={{ position: 'absolute', bottom: `${(m.poSpend / m.total) * 100}%`, left: 0, right: 0, height: `${(m.invSpend / m.total) * 100}%`, background: 'var(--purple)', opacity: 0.6 }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* X axis labels */}
      <div style={{ display: 'flex', gap: 12, padding: '6px 8px 0' }}>
        {months.map((m, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
            {m.label}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, padding: '0 8px' }}>
        {[
          { color: 'var(--blue)',   label: 'PO Spend'       },
          { color: 'var(--purple)', label: 'Invoice Spend'  },
          { color: 'var(--teal)',   label: 'Stock Issues'   },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ color: 'var(--text-dim)' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Spend table (shared by dept/cost_center/project tabs) ─────────────────
function SpendTable({ rows, groupLabel, expandedKey, onExpand }) {
  if (!rows.length) return <EmptyState icon="paid" message="No spending data for this period" />

  const grand = rows.reduce((s, r) => s + r.total, 0)

  return (
    <div className="table-wrap">
      <table className="stock-table">
        <thead>
          <tr>
            <th>{groupLabel}</th>
            <th style={{ textAlign: 'right' }}>PO Spend</th>
            <th style={{ textAlign: 'right' }}>Invoice Spend</th>
            <th style={{ textAlign: 'right' }}>Stock Issues</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th style={{ textAlign: 'right' }}>% of Total</th>
            <th style={{ width: 80 }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <>
              <tr
                key={r.key}
                style={{ cursor: 'pointer' }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background = ''}
                onClick={() => onExpand(r.key === expandedKey ? null : r.key)}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                      {r.key === expandedKey ? 'expand_less' : 'expand_more'}
                    </span>
                    <span style={{
                      fontWeight: r.key === UNALLOCATED ? 400 : 600,
                      color: r.key === UNALLOCATED ? 'var(--text-dim)' : 'var(--text)',
                      fontStyle: r.key === UNALLOCATED ? 'italic' : 'normal',
                    }}>
                      {r.key}
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                  {r.poSpend > 0 ? `$${fmtNum(r.poSpend)}` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                  {r.invoiceSpend > 0 ? `$${fmtNum(r.invoiceSpend)}` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                  {r.stockIssues > 0 ? `$${fmtNum(r.stockIssues)}` : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  ${fmtNum(r.total)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  {r.pct.toFixed(1)}%
                </td>
                <td style={{ paddingRight: 12 }}>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${r.pct}%`,
                      background: 'var(--teal)',
                      borderRadius: 3,
                      transition: 'width .4s',
                    }} />
                  </div>
                </td>
              </tr>
              {/* Expanded breakdown row */}
              {r.key === expandedKey && (
                <tr key={`${r.key}-detail`} style={{ background: 'var(--surface)' }}>
                  <td colSpan="7" style={{ padding: '8px 24px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      {[
                        { label: 'PO Spend',      value: r.poSpend,      color: 'var(--blue)',   icon: 'shopping_cart' },
                        { label: 'Invoice Spend', value: r.invoiceSpend, color: 'var(--purple)', icon: 'receipt_long' },
                        { label: 'Stock Issues',  value: r.stockIssues,  color: 'var(--teal)',   icon: 'output' },
                      ].map(s => (
                        <div key={s.label} style={{
                          background: 'var(--surface2)',
                          borderRadius: 8,
                          padding: '10px 14px',
                          borderLeft: `3px solid ${s.color}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            <span className="material-icons" style={{ fontSize: 14, color: s.color }}>{s.icon}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>{s.label}</span>
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--mono)', color: s.color }}>
                            ${fmtNum(s.value)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                            {r.total > 0 ? ((s.value / r.total) * 100).toFixed(1) : 0}% of row total
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
            <td style={{ padding: '8px 12px', fontSize: 12 }}>Grand Total</td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
              ${fmtNum(rows.reduce((s, r) => s + r.poSpend, 0))}
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
              ${fmtNum(rows.reduce((s, r) => s + r.invoiceSpend, 0))}
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
              ${fmtNum(rows.reduce((s, r) => s + r.stockIssues, 0))}
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>${fmtNum(grand)}</td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>100%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────
export default function CostCentreReport() {
  const [transactions,  setTransactions]  = useState([])
  const [poLines,       setPoLines]       = useState([])
  const [invoiceLines,  setInvoiceLines]  = useState([])
  const [loading,       setLoading]       = useState(true)

  const [preset,        setPreset]        = useState('this_month')
  const [dateFrom,      setDateFrom]      = useState(() => getPeriodRange('this_month')[0])
  const [dateTo,        setDateTo]        = useState(() => getPeriodRange('this_month')[1])

  const [activeTab,     setActiveTab]     = useState('department')
  const [expandedKey,   setExpandedKey]   = useState(null)

  // Load data once on mount
  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('transactions')
        .select('id, date, department, cost_center, project, qty, cost, item_name, category, notes')
        .eq('type', 'OUT')
        .order('date', { ascending: false })
        .limit(2000),
      supabase
        .from('purchase_order_lines')
        .select('qty, unit_price, purchase_orders(order_date, department, cost_center, project)')
        .limit(2000),
      supabase
        .from('purchase_invoice_lines')
        .select('qty, unit_price, purchase_invoices(invoice_date, status, supplier_name, department, cost_center, project)')
        .limit(2000),
    ]).then(([{ data: tData }, { data: pData }, { data: iData }]) => {
      setTransactions(tData  || [])
      setPoLines(pData       || [])
      setInvoiceLines(iData  || [])
      setLoading(false)
    }).catch(err => {
      toast.error('Failed to load data: ' + err.message)
      setLoading(false)
    })
  }, [])

  const handlePreset = useCallback((id) => {
    setPreset(id)
    if (id !== 'custom') {
      const [f, t] = getPeriodRange(id)
      setDateFrom(f)
      setDateTo(t)
    }
    setExpandedKey(null)
  }, [])

  // Computed rows for each dimension
  const deptRows = useMemo(() =>
    groupSpend(transactions, poLines, invoiceLines, dateFrom, dateTo, 'department'),
  [transactions, poLines, invoiceLines, dateFrom, dateTo])

  const ccRows = useMemo(() =>
    groupSpend(transactions, poLines, invoiceLines, dateFrom, dateTo, 'cost_center'),
  [transactions, poLines, invoiceLines, dateFrom, dateTo])

  const projectRows = useMemo(() =>
    groupSpend(transactions, poLines, invoiceLines, dateFrom, dateTo, 'project'),
  [transactions, poLines, invoiceLines, dateFrom, dateTo])

  const monthlyTrend = useMemo(() =>
    buildMonthlyTrend(transactions, poLines, invoiceLines),
  [transactions, poLines, invoiceLines])

  // KPIs for selected period
  const poSpendTotal = useMemo(() =>
    deptRows.reduce((s, r) => s + r.poSpend, 0),
  [deptRows])

  const invoiceSpendTotal = useMemo(() =>
    deptRows.reduce((s, r) => s + r.invoiceSpend, 0),
  [deptRows])

  const stockIssuesTotal = useMemo(() =>
    deptRows.reduce((s, r) => s + r.stockIssues, 0),
  [deptRows])

  const deptsTracked = useMemo(() =>
    deptRows.filter(r => r.key !== UNALLOCATED).length,
  [deptRows])

  // Active tab rows (for export)
  const activeRows = activeTab === 'department' ? deptRows
    : activeTab === 'cost_center' ? ccRows
    : activeTab === 'project' ? projectRows
    : []

  const ACTIVE_LABEL = { department: 'Department', cost_center: 'Cost Centre', project: 'Project' }

  const handleExport = () => {
    if (activeTab === 'timeline') {
      exportXLSX(
        monthlyTrend.map(m => ({
          Month:          m.label,
          'PO Spend':     +m.poSpend.toFixed(2),
          'Invoice Spend': +m.invSpend.toFixed(2),
          'Stock Issues': +m.issueSpend.toFixed(2),
          'Total':        +m.total.toFixed(2),
        })),
        `CostCentre_Timeline_${dateTag()}`,
        'Monthly Trend'
      )
    } else {
      if (!activeRows.length) { toast.error('Nothing to export'); return }
      exportXLSX(
        activeRows.map(r => ({
          [ACTIVE_LABEL[activeTab] || 'Key']: r.key,
          'PO Spend ($)':       +r.poSpend.toFixed(2),
          'Invoice Spend ($)':  +r.invoiceSpend.toFixed(2),
          'Stock Issues ($)':   +r.stockIssues.toFixed(2),
          'Total ($)':          +r.total.toFixed(2),
          '% of Total':         +r.pct.toFixed(1),
        })),
        `CostCentre_${activeTab}_${dateTag()}`,
        ACTIVE_LABEL[activeTab] || 'Report'
      )
    }
    toast.success('Exported')
  }

  const periodLabel = preset !== 'custom'
    ? PRESETS.find(p => p.id === preset)?.label
    : `${dateFrom} to ${dateTo}`

  return (
    <div>
      <PageHeader
        title="Cost Centre Report"
        subtitle="Department, cost centre and project spending analysis"
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
      </PageHeader>

      {/* Period filter */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginRight: 4 }}>Period:</span>
          {PRESETS.map(p => (
            <button
              key={p.id}
              className={preset === p.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => handlePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
              <input
                type="date"
                className="form-control"
                style={{ width: 140 }}
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setExpandedKey(null) }}
              />
              <span style={{ color: 'var(--text-dim)' }}>to</span>
              <input
                type="date"
                className="form-control"
                style={{ width: 140 }}
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setExpandedKey(null) }}
              />
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
            {periodLabel}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="shopping_cart"
          label="Total PO Spend"
          value={`$${fmtNum(poSpendTotal)}`}
          sub="purchase order lines"
          color="blue"
        />
        <KPICard
          icon="receipt_long"
          label="Total Invoice Spend"
          value={`$${fmtNum(invoiceSpendTotal)}`}
          sub="posted + paid invoices"
          color="purple"
        />
        <KPICard
          icon="output"
          label="Stock Issues Value"
          value={`$${fmtNum(stockIssuesTotal)}`}
          sub="qty × cost from transactions"
          color="teal"
        />
        <KPICard
          icon="corporate_fare"
          label="Departments Tracked"
          value={deptsTracked}
          sub="with allocated spend"
          color="gold"
        />
      </div>

      {/* Tabs */}
      <div className="card">
        <div style={{ padding: '10px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <TabNav tabs={TABS} active={activeTab} onChange={t => { setActiveTab(t); setExpandedKey(null) }} />
        </div>

        <div style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 10, opacity: 0.4 }}>hourglass_empty</span>
              Loading spend data…
            </div>
          ) : (
            <>
              {activeTab === 'department' && (
                <SpendTable
                  rows={deptRows}
                  groupLabel="Department"
                  expandedKey={expandedKey}
                  onExpand={setExpandedKey}
                />
              )}

              {activeTab === 'cost_center' && (
                <SpendTable
                  rows={ccRows}
                  groupLabel="Cost Centre"
                  expandedKey={expandedKey}
                  onExpand={setExpandedKey}
                />
              )}

              {activeTab === 'project' && (
                <SpendTable
                  rows={projectRows}
                  groupLabel="Project"
                  expandedKey={expandedKey}
                  onExpand={setExpandedKey}
                />
              )}

              {activeTab === 'timeline' && (
                <div style={{ padding: 24 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 20,
                  }}>
                    Monthly Spend Trend — Last 6 Months (All Spend Types)
                  </div>
                  <TimelineChart months={monthlyTrend} />

                  {/* Monthly breakdown table */}
                  <div style={{ marginTop: 28 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Month-by-Month Breakdown
                    </div>
                    <div className="table-wrap">
                      <table className="stock-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th style={{ textAlign: 'right' }}>PO Spend</th>
                            <th style={{ textAlign: 'right' }}>Invoice Spend</th>
                            <th style={{ textAlign: 'right' }}>Stock Issues</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyTrend.map((m, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{m.label}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                                {m.poSpend > 0 ? `$${fmtNum(m.poSpend)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                                {m.invSpend > 0 ? `$${fmtNum(m.invSpend)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                                {m.issueSpend > 0 ? `$${fmtNum(m.issueSpend)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                {m.total > 0 ? `$${fmtNum(m.total)}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
