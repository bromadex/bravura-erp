// src/pages/Procurement/BudgetVsActual.jsx
// Budget vs Actual analytics — compares procurement_budgets against
// committed PO spend and invoiced actuals for a selected fiscal year / period.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase }                                   from '../../lib/supabase'
import toast                                          from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag }               from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState }            from '../../components/ui'

// ── Constants ─────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear()

const FISCAL_YEARS = [2024, 2025, 2026]

const PERIOD_OPTIONS = [
  { value: 'annual', label: 'Annual (Full Year)' },
  { value: 'Q1',     label: 'Q1 (Jan–Mar)' },
  { value: 'Q2',     label: 'Q2 (Apr–Jun)' },
  { value: 'Q3',     label: 'Q3 (Jul–Sep)' },
  { value: 'Q4',     label: 'Q4 (Oct–Dec)' },
  { value: 'YYYY-01', label: 'January'   },
  { value: 'YYYY-02', label: 'February'  },
  { value: 'YYYY-03', label: 'March'     },
  { value: 'YYYY-04', label: 'April'     },
  { value: 'YYYY-05', label: 'May'       },
  { value: 'YYYY-06', label: 'June'      },
  { value: 'YYYY-07', label: 'July'      },
  { value: 'YYYY-08', label: 'August'    },
  { value: 'YYYY-09', label: 'September' },
  { value: 'YYYY-10', label: 'October'   },
  { value: 'YYYY-11', label: 'November'  },
  { value: 'YYYY-12', label: 'December'  },
]

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]

const TABS = [
  { id: 'budget_lines', label: 'By Budget Line' },
  { id: 'department',   label: 'By Department'  },
  { id: 'trend',        label: 'Monthly Trend'  },
]

// ── Date helpers ──────────────────────────────────────────────────────────────
function getPeriodRange(period, fiscalYear) {
  const y = Number(fiscalYear)
  if (period === 'annual') return [`${y}-01-01`, `${y}-12-31`]
  if (period === 'Q1')     return [`${y}-01-01`, `${y}-03-31`]
  if (period === 'Q2')     return [`${y}-04-01`, `${y}-06-30`]
  if (period === 'Q3')     return [`${y}-07-01`, `${y}-09-30`]
  if (period === 'Q4')     return [`${y}-10-01`, `${y}-12-31`]
  // YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [py, pm] = period.split('-').map(Number)
    const lastDay = new Date(py, pm, 0).getDate()
    const mm = String(pm).padStart(2, '0')
    return [`${py}-${mm}-01`, `${py}-${mm}-${String(lastDay).padStart(2, '0')}`]
  }
  return [`${y}-01-01`, `${y}-12-31`]
}

function getMonthRange(year, monthIndex) {
  // monthIndex: 0 = Jan
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const mm = String(monthIndex + 1).padStart(2, '0')
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`]
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const d = dateStr.split('T')[0]
  return d >= from && d <= to
}

// Resolve the period value from template (YYYY-MM pattern → actual year-month)
function resolvePeriodValue(template, fiscalYear) {
  if (template && template.startsWith('YYYY-')) {
    return `${fiscalYear}-${template.slice(5)}`
  }
  return template
}

function getPeriodLabel(value) {
  const opt = PERIOD_OPTIONS.find(p => p.value === value || resolvePeriodValue(p.value, CURRENT_YEAR) === value)
  if (opt) return opt.label
  // fallback for resolved YYYY-MM
  if (/^\d{4}-\d{2}$/.test(value)) {
    const m = parseInt(value.split('-')[1], 10)
    return MONTH_NAMES[m - 1] || value
  }
  return value
}

// ── Sub-components ────────────────────────────────────────────────────────────
function BudgetBar({ pct, threshold }) {
  const color = pct > 100 ? 'var(--red)' : pct > threshold ? 'var(--yellow)' : 'var(--green)'
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 8, width: 120, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  )
}

function StatusBadge({ invoiced, committed, budget, threshold }) {
  if (budget === 0) {
    return <span style={badge('var(--text-dim)', '#333')}>No Budget</span>
  }
  if (invoiced > budget) {
    return <span style={badge('var(--red)', 'rgba(255,59,48,.15)')}>Over Budget</span>
  }
  if ((committed + invoiced) / budget * 100 > threshold) {
    return <span style={badge('var(--yellow)', 'rgba(255,204,0,.15)')}>At Risk</span>
  }
  return <span style={badge('var(--green)', 'rgba(48,209,88,.15)')}>On Track</span>
}

function badge(color, bg) {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    whiteSpace: 'nowrap',
  }
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '8px 18px',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--gold)' : '2px solid transparent',
            background: 'none',
            color: active === t.id ? 'var(--gold)' : 'var(--text-dim)',
            fontWeight: active === t.id ? 700 : 400,
            cursor: 'pointer',
            fontSize: 14,
            marginBottom: -1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BudgetVsActual() {
  const [budgets,  setBudgets]  = useState([])
  const [pos,      setPos]      = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)

  const [fiscalYear, setFiscalYear] = useState(String(CURRENT_YEAR))
  const [period,     setPeriod]     = useState('annual')

  const [activeTab,    setActiveTab]    = useState('budget_lines')
  const [expandedDept, setExpandedDept] = useState(null)

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [budgetsRes, posRes, pisRes] = await Promise.all([
        supabase.from('procurement_budgets').select('*'),
        supabase.from('purchase_orders')
          .select('id, po_number, order_date, department, cost_center, total_amount, status')
          .not('status', 'in', '("Cancelled","Draft")'),
        supabase.from('purchase_invoices')
          .select('id, pi_number, invoice_date, po_id, total_amount, status')
          .in('status', ['Posted', 'Partially Paid', 'Paid', 'Overdue']),
      ])

      if (budgetsRes.error) throw budgetsRes.error
      if (posRes.error)     throw posRes.error
      if (pisRes.error)     throw pisRes.error

      setBudgets(budgetsRes.data || [])
      setPos(posRes.data || [])
      setInvoices(pisRes.data || [])
    } catch (err) {
      toast.error('Failed to load budget data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Resolved period value (YYYY-MM template → actual) ─────────────────────
  const resolvedPeriod = useMemo(
    () => resolvePeriodValue(period, fiscalYear),
    [period, fiscalYear],
  )

  // ── Period date range ──────────────────────────────────────────────────────
  const [dateFrom, dateTo] = useMemo(
    () => getPeriodRange(resolvedPeriod, fiscalYear),
    [resolvedPeriod, fiscalYear],
  )

  // ── PO lookup map by id ────────────────────────────────────────────────────
  const poById = useMemo(() => {
    const m = {}
    for (const po of pos) m[po.id] = po
    return m
  }, [pos])

  // ── Filtered budgets (by fiscal year + period) ─────────────────────────────
  const filteredBudgets = useMemo(
    () => budgets.filter(b =>
      String(b.fiscal_year) === String(fiscalYear) && b.period === resolvedPeriod,
    ),
    [budgets, fiscalYear, resolvedPeriod],
  )

  // ── Compute committed & invoiced for a given budget row ───────────────────
  function computeActuals(budget) {
    // Committed: Approved / Partially Received / Received POs in period + department
    const committed = pos
      .filter(po =>
        po.department === budget.department &&
        ['Approved', 'Partially Received', 'Received'].includes(po.status) &&
        inRange(po.order_date, dateFrom, dateTo),
      )
      .reduce((s, po) => s + (Number(po.total_amount) || 0), 0)

    // Invoiced: invoices whose linked PO belongs to this department, invoice_date in period
    const invoiced = invoices
      .filter(inv => {
        const po = poById[inv.po_id]
        return (
          po &&
          po.department === budget.department &&
          inRange(inv.invoice_date, dateFrom, dateTo)
        )
      })
      .reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0)

    return { committed, invoiced }
  }

  // ── Enriched budget lines ─────────────────────────────────────────────────
  const budgetLines = useMemo(() => {
    return filteredBudgets.map(b => {
      const budgetAmt = Number(b.budget_amount) || 0
      const threshold = Number(b.alert_threshold) || 80
      const { committed, invoiced } = computeActuals(b)
      const remaining = budgetAmt - invoiced
      const pctUsed   = budgetAmt > 0 ? (invoiced / budgetAmt) * 100 : 0
      return { ...b, budget_amount: budgetAmt, alert_threshold: threshold, committed, invoiced, remaining, pctUsed }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBudgets, pos, invoices, poById, dateFrom, dateTo])

  // ── KPI totals ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalBudget    = budgetLines.reduce((s, b) => s + b.budget_amount, 0)
    const totalCommitted = budgetLines.reduce((s, b) => s + b.committed,     0)
    const totalInvoiced  = budgetLines.reduce((s, b) => s + b.invoiced,      0)
    const overThreshold  = budgetLines.filter(b =>
      b.budget_amount > 0 &&
      (b.committed + b.invoiced) / b.budget_amount * 100 > b.alert_threshold,
    ).length
    return { totalBudget, totalCommitted, totalInvoiced, overThreshold }
  }, [budgetLines])

  // ── By Department pivot ───────────────────────────────────────────────────
  const deptRows = useMemo(() => {
    const map = {}
    for (const b of budgetLines) {
      const d = b.department || 'Unallocated'
      if (!map[d]) map[d] = { department: d, budget: 0, committed: 0, invoiced: 0, lines: [] }
      map[d].budget    += b.budget_amount
      map[d].committed += b.committed
      map[d].invoiced  += b.invoiced
      map[d].lines.push(b)
    }
    return Object.values(map).sort((a, b) => b.budget - a.budget)
  }, [budgetLines])

  // ── Monthly Trend (last 6 months) ─────────────────────────────────────────
  const trendData = useMemo(() => {
    const today = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() }) // month: 0-indexed
    }

    return months.map(({ year, month }) => {
      const [mFrom, mTo] = getMonthRange(year, month)

      // Budget: sum monthly budgets matching this month, or annual/12
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
      let budgetTotal = budgets
        .filter(b => b.period === monthKey)
        .reduce((s, b) => s + (Number(b.budget_amount) || 0), 0)

      // Also include 1/12 of annual budgets for this fiscal year
      const annualShare = budgets
        .filter(b => String(b.fiscal_year) === String(year) && b.period === 'annual')
        .reduce((s, b) => s + (Number(b.budget_amount) || 0), 0) / 12
      budgetTotal += annualShare

      // Committed POs in this month
      const committed = pos
        .filter(po =>
          ['Approved', 'Partially Received', 'Received'].includes(po.status) &&
          inRange(po.order_date, mFrom, mTo),
        )
        .reduce((s, po) => s + (Number(po.total_amount) || 0), 0)

      // Invoiced in this month
      const invoiced = invoices
        .filter(inv => inRange(inv.invoice_date, mFrom, mTo))
        .reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0)

      const variance = budgetTotal - invoiced

      return {
        label:    `${MONTH_NAMES[month]} ${year}`,
        shortLabel: MONTH_NAMES[month],
        budgetTotal,
        committed,
        invoiced,
        variance,
      }
    })
  }, [budgets, pos, invoices])

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    if (activeTab === 'budget_lines') {
      const rows = budgetLines.map(b => ({
        Department:      b.department,
        'Cost Center':   b.cost_center,
        Period:          b.period,
        Category:        b.category,
        Budget:          b.budget_amount,
        Committed:       b.committed,
        Invoiced:        b.invoiced,
        Remaining:       b.remaining,
        '% Used':        b.pctUsed.toFixed(1),
        'Alert %':       b.alert_threshold,
        Status:          b.invoiced > b.budget_amount ? 'Over Budget'
                       : (b.committed + b.invoiced) / (b.budget_amount || 1) * 100 > b.alert_threshold ? 'At Risk'
                       : 'On Track',
      }))
      exportXLSX(rows, `BudgetVsActual_Lines_${dateTag()}`)
    } else if (activeTab === 'department') {
      const rows = deptRows.map(d => ({
        Department: d.department,
        Budget:     d.budget,
        Committed:  d.committed,
        Invoiced:   d.invoiced,
        Remaining:  d.budget - d.invoiced,
        '% Used':   d.budget > 0 ? ((d.invoiced / d.budget) * 100).toFixed(1) : '0.0',
      }))
      exportXLSX(rows, `BudgetVsActual_Department_${dateTag()}`)
    } else {
      const rows = trendData.map(t => ({
        Month:      t.label,
        Budget:     t.budgetTotal,
        Committed:  t.committed,
        Invoiced:   t.invoiced,
        Variance:   t.variance,
      }))
      exportXLSX(rows, `BudgetVsActual_Trend_${dateTag()}`)
    }
    toast.success('Export started')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const periodSelectOptions = PERIOD_OPTIONS.map(p => ({
    value: p.value,
    label: p.label,
    resolved: resolvePeriodValue(p.value, fiscalYear),
  }))

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Budget vs Actual"
        subtitle="Compare procurement budgets against committed PO spend and invoiced actuals"
        actions={
          <button onClick={handleExport} style={btnStyle('var(--gold)', '#000')}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>download</span>
            Export
          </button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={labelStyle}>
          Fiscal Year
          <select
            value={fiscalYear}
            onChange={e => setFiscalYear(e.target.value)}
            style={selectStyle}
          >
            {FISCAL_YEARS.map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Period
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={selectStyle}
          >
            {periodSelectOptions.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <button
          onClick={loadData}
          style={{ ...btnStyle('var(--surface2)', 'var(--text)'), border: '1px solid var(--border)', marginTop: 18 }}
        >
          <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>refresh</span>
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPICard
          label="Total Budget"
          value={`$${fmtNum(kpis.totalBudget)}`}
          icon="account_balance_wallet"
        />
        <KPICard
          label="Total Committed / PO Spend"
          value={`$${fmtNum(kpis.totalCommitted)}`}
          icon="shopping_cart"
        />
        <KPICard
          label="Total Invoiced / Actual Spend"
          value={`$${fmtNum(kpis.totalInvoiced)}`}
          icon="receipt_long"
        />
        <KPICard
          label="Budgets Over Threshold"
          value={String(kpis.overThreshold)}
          icon="warning"
        />
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
        <TabBar tabs={TABS} active={activeTab} onChange={id => { setActiveTab(id); setExpandedDept(null) }} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>Loading…</div>
        ) : (
          <>
            {/* ── Tab 1: By Budget Line ── */}
            {activeTab === 'budget_lines' && (
              <>
                {budgetLines.length === 0 ? (
                  <EmptyState
                    icon="analytics"
                    title="No budgets found"
                    description={`No budgets for fiscal year ${fiscalYear} / ${getPeriodLabel(resolvedPeriod)}.`}
                  />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          {['Department','Period','Category','Budget','Committed','Invoiced','Remaining','% Used','Alert %','Status'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {budgetLines.map(b => (
                          <tr key={b.id} style={trHover}>
                            <td style={tdStyle}>{b.department || '—'}</td>
                            <td style={tdStyle}>{getPeriodLabel(b.period)}</td>
                            <td style={tdStyle}>
                              <span style={{ textTransform: 'capitalize' }}>{b.category}</span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>${fmtNum(b.budget_amount)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(b.committed)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--purple)' }}>${fmtNum(b.invoiced)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', color: b.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                              ${fmtNum(b.remaining)}
                            </td>
                            <td style={{ ...tdStyle, minWidth: 160 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <BudgetBar pct={b.pctUsed} threshold={b.alert_threshold} />
                                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.pctUsed.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{b.alert_threshold}%</td>
                            <td style={tdStyle}>
                              <StatusBadge
                                invoiced={b.invoiced}
                                committed={b.committed}
                                budget={b.budget_amount}
                                threshold={b.alert_threshold}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── Tab 2: By Department ── */}
            {activeTab === 'department' && (
              <>
                {deptRows.length === 0 ? (
                  <EmptyState
                    icon="corporate_fare"
                    title="No department data"
                    description="No budgets match the selected period."
                  />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          {['Department','Budget','Committed','Invoiced','Remaining','% Used',''].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {deptRows.map(d => {
                          const remaining = d.budget - d.invoiced
                          const pct = d.budget > 0 ? (d.invoiced / d.budget) * 100 : 0
                          const isExpanded = expandedDept === d.department
                          return (
                            <>
                              <tr
                                key={d.department}
                                style={{ ...trHover, cursor: 'pointer' }}
                                onClick={() => setExpandedDept(isExpanded ? null : d.department)}
                              >
                                <td style={tdStyle}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
                                      chevron_right
                                    </span>
                                    <strong>{d.department}</strong>
                                  </div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${fmtNum(d.budget)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(d.committed)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--purple)' }}>${fmtNum(d.invoiced)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                                  ${fmtNum(remaining)}
                                </td>
                                <td style={{ ...tdStyle, minWidth: 160 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <BudgetBar pct={pct} threshold={80} />
                                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{pct.toFixed(1)}%</span>
                                  </div>
                                </td>
                                <td style={tdStyle}>
                                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.lines.length} line{d.lines.length !== 1 ? 's' : ''}</span>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr key={`${d.department}-expand`}>
                                  <td colSpan={7} style={{ padding: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                                    <DeptExpandPanel lines={d.lines} />
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ── Tab 3: Monthly Trend ── */}
            {activeTab === 'trend' && (
              <TrendChart data={trendData} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Dept Drill-Down Panel ─────────────────────────────────────────────────────
function DeptExpandPanel({ lines }) {
  return (
    <div style={{ padding: '16px 24px' }}>
      <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Budget Lines — Category Breakdown
      </p>
      <table style={{ ...tableStyle, fontSize: 13 }}>
        <thead>
          <tr>
            {['Cost Center','Category','Budget','Committed','Invoiced','Remaining','% Used','Notes'].map(h => (
              <th key={h} style={{ ...thStyle, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(b => (
            <tr key={b.id}>
              <td style={tdStyle}>{b.cost_center || '—'}</td>
              <td style={tdStyle}>
                <span style={categoryChip(b.category)}>{b.category}</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>${fmtNum(b.budget_amount)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(b.committed)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--purple)' }}>${fmtNum(b.invoiced)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: b.remaining < 0 ? 'var(--red)' : 'var(--green)' }}>
                ${fmtNum(b.remaining)}
              </td>
              <td style={{ ...tdStyle, minWidth: 140 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <BudgetBar pct={b.pctUsed} threshold={b.alert_threshold} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{b.pctUsed.toFixed(1)}%</span>
                </div>
              </td>
              <td style={{ ...tdStyle, maxWidth: 200, color: 'var(--text-dim)', fontSize: 12 }}>
                {b.notes || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function categoryChip(cat) {
  const colors = {
    general:     { color: 'var(--blue)',   bg: 'rgba(10,132,255,.12)' },
    capex:       { color: 'var(--purple)', bg: 'rgba(191,90,242,.12)' },
    opex:        { color: 'var(--teal)',   bg: 'rgba(100,210,255,.12)' },
    maintenance: { color: 'var(--yellow)', bg: 'rgba(255,214,10,.12)' },
  }
  const c = colors[(cat || '').toLowerCase()] || { color: 'var(--text-dim)', bg: 'var(--surface)' }
  return {
    display: 'inline-block',
    padding: '2px 7px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    color: c.color,
    background: c.bg,
    textTransform: 'capitalize',
  }
}

// ── Monthly Trend Chart ───────────────────────────────────────────────────────
function TrendChart({ data }) {
  const maxVal = useMemo(() => {
    const m = Math.max(...data.map(d => Math.max(d.budgetTotal, d.committed, d.invoiced)), 1)
    return m
  }, [data])

  const CHART_H = 220 // px height of bars area

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
        <LegendItem color="var(--gold)"   label="Budget"    dashed />
        <LegendItem color="var(--teal)"   label="Committed" />
        <LegendItem color="var(--purple)" label="Invoiced"  />
      </div>

      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {data.map((m, i) => {
          const budgetH    = (m.budgetTotal / maxVal) * CHART_H
          const committedH = (m.committed   / maxVal) * CHART_H
          const invoicedH  = (m.invoiced    / maxVal) * CHART_H

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 80px', minWidth: 80 }}>
              {/* Bars group */}
              <div style={{ position: 'relative', width: '100%', height: CHART_H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
                {/* Budget dashed line */}
                <div
                  title={`Budget: $${fmtNum(m.budgetTotal)}`}
                  style={{
                    position: 'absolute',
                    bottom: budgetH,
                    left: 0,
                    right: 0,
                    borderTop: '2px dashed var(--gold)',
                    opacity: 0.8,
                  }}
                />
                {/* Committed bar */}
                <div
                  title={`Committed: $${fmtNum(m.committed)}`}
                  style={{
                    width: 28,
                    height: Math.max(committedH, 2),
                    background: 'var(--teal)',
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85,
                    transition: 'height .4s',
                  }}
                />
                {/* Invoiced bar */}
                <div
                  title={`Invoiced: $${fmtNum(m.invoiced)}`}
                  style={{
                    width: 28,
                    height: Math.max(invoicedH, 2),
                    background: 'var(--purple)',
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85,
                    transition: 'height .4s',
                  }}
                />
              </div>
              {/* Month label */}
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{m.shortLabel}</div>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      {/* Summary table */}
      <table style={tableStyle}>
        <thead>
          <tr>
            {['Month','Budget','Committed','Invoiced','Variance'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <tr key={i} style={trHover}>
              <td style={tdStyle}><strong>{m.label}</strong></td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--gold)' }}>${fmtNum(m.budgetTotal)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--teal)' }}>${fmtNum(m.committed)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--purple)' }}>${fmtNum(m.invoiced)}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: m.variance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {m.variance >= 0 ? '+' : ''}${fmtNum(m.variance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LegendItem({ color, label, dashed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
      <div style={{
        width: 24,
        height: 3,
        background: dashed ? 'transparent' : color,
        border: dashed ? `2px dashed ${color}` : 'none',
        borderRadius: 2,
      }} />
      {label}
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────
function btnStyle(bg, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    background: bg,
    color,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  }
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  color: 'var(--text-dim)',
  fontWeight: 500,
}

const selectStyle = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  fontSize: 14,
  minWidth: 180,
  cursor: 'pointer',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 14,
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '2px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const trHover = {
  transition: 'background .15s',
}
