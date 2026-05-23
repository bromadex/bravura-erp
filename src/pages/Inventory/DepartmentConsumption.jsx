// src/pages/Inventory/DepartmentConsumption.jsx
// Phase 19 — Department Consumption Analytics

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { ChartCard } from '../../components/ui/ChartCard'
import { StatBar } from '../../components/ui/StatBar'

// ── helpers ──────────────────────────────────────────────────────────────────

function isoMonth(dateStr) {
  if (!dateStr) return ''
  return dateStr.slice(0, 7) // 'YYYY-MM'
}

function monthLabel(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' })
}

function last12Months() {
  const months = []
  const d = new Date()
  for (let i = 11; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function periodDateFrom(preset, customFrom) {
  const now = new Date()
  if (preset === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  }
  if (preset === '3m') {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }
  if (preset === 'year') {
    return `${now.getFullYear()}-01-01`
  }
  if (preset === '12m') {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }
  if (preset === 'custom') return customFrom || ''
  return ''
}

const DEPT_COLORS = [
  'var(--teal)', 'var(--blue)', 'var(--purple)', 'var(--gold)',
  'var(--green)', 'var(--yellow)', 'var(--red)',
]

function deptColor(idx) {
  return DEPT_COLORS[idx % DEPT_COLORS.length]
}

const TABS = ['By Department', 'By Category', 'Timeline', 'Top Items']

// ── main component ────────────────────────────────────────────────────────────

export default function DepartmentConsumption() {
  const [preset, setPreset]         = useState('3m')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [tab, setTab]               = useState(0)
  const [loading, setLoading]       = useState(false)

  const [transactions, setTransactions] = useState([])
  const [requisitions, setRequisitions] = useState([])

  const [expandedDept, setExpandedDept] = useState(null)

  // ── date range ──────────────────────────────────────────────────────────────
  const dateFrom = useMemo(() => periodDateFrom(preset, customFrom), [preset, customFrom])
  const dateTo   = useMemo(() => {
    if (preset === 'custom' && customTo) return customTo
    return new Date().toISOString().split('T')[0]
  }, [preset, customTo])

  // ── fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!dateFrom) return
    setLoading(true)
    try {
      const [txRes, srRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, qty, date, item_name, category, department, cost_center, project, notes')
          .eq('type', 'OUT')
          .gte('date', dateFrom)
          .order('date', { ascending: false })
          .limit(3000),
        supabase
          .from('store_requisitions')
          .select('id, sr_number, department, status, issued_items, issued_at, req_number')
          .in('status', ['fulfilled', 'partially_fulfilled'])
          .gte('issued_at', dateFrom)
          .order('issued_at', { ascending: false }),
      ])
      if (txRes.error) throw txRes.error
      if (srRes.error) throw srRes.error
      setTransactions(txRes.data || [])
      setRequisitions(srRes.data || [])
    } catch (err) {
      toast.error('Failed to load data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom])

  useEffect(() => { fetchData() }, [fetchData])

  // ── normalise dept ──────────────────────────────────────────────────────────
  const normTx = useMemo(() =>
    transactions.map(t => ({ ...t, dept: t.department?.trim() || 'Unallocated' })),
    [transactions]
  )

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total   = normTx.length
    const totalQty = normTx.reduce((s, t) => s + (Number(t.qty) || 0), 0)
    const depts   = new Set(normTx.filter(t => t.dept !== 'Unallocated').map(t => t.dept))
    const deptCounts = {}
    for (const t of normTx) {
      deptCounts[t.dept] = (deptCounts[t.dept] || 0) + 1
    }
    const topDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    return { total, totalQty, activeDepts: depts.size, topDept }
  }, [normTx])

  // ── By Department ────────────────────────────────────────────────────────────
  const deptRows = useMemo(() => {
    const map = {}
    for (const t of normTx) {
      if (!map[t.dept]) map[t.dept] = { dept: t.dept, txCount: 0, qty: 0, items: {} }
      map[t.dept].txCount++
      map[t.dept].qty += Number(t.qty) || 0
      const name = t.item_name || 'Unknown'
      map[t.dept].items[name] = (map[t.dept].items[name] || 0) + (Number(t.qty) || 0)
    }
    const totalQty = normTx.reduce((s, t) => s + (Number(t.qty) || 0), 0) || 1
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .map(r => ({ ...r, pct: (r.qty / totalQty) * 100 }))
  }, [normTx])

  // ── By Category ──────────────────────────────────────────────────────────────
  const catRows = useMemo(() => {
    const map = {}
    for (const t of normTx) {
      const cat = t.category?.trim() || 'Uncategorised'
      if (!map[cat]) map[cat] = { cat, txCount: 0, qty: 0 }
      map[cat].txCount++
      map[cat].qty += Number(t.qty) || 0
    }
    const totalQty = normTx.reduce((s, t) => s + (Number(t.qty) || 0), 0) || 1
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .map(r => ({ ...r, pct: (r.qty / totalQty) * 100 }))
  }, [normTx])

  const catChartData = useMemo(() =>
    catRows.slice(0, 10).map((r, i) => ({
      label: r.cat.length > 12 ? r.cat.slice(0, 10) + '…' : r.cat,
      value: r.qty,
      color: deptColor(i),
    })),
    [catRows]
  )

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const timelineData = useMemo(() => {
    const months = last12Months()
    const monthMap = {}
    for (const m of months) {
      monthMap[m] = { month: m, txCount: 0, qty: 0, deptCounts: {}, catCounts: {} }
    }
    for (const t of normTx) {
      const m = isoMonth(t.date)
      if (!monthMap[m]) continue
      monthMap[m].txCount++
      monthMap[m].qty += Number(t.qty) || 0
      monthMap[m].deptCounts[t.dept] = (monthMap[m].deptCounts[t.dept] || 0) + 1
      const cat = t.category?.trim() || 'Uncategorised'
      monthMap[m].catCounts[cat] = (monthMap[m].catCounts[cat] || 0) + 1
    }
    return months.map(m => {
      const row = monthMap[m]
      const topDept = Object.entries(row.deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      const topCat  = Object.entries(row.catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      return { ...row, topDept, topCat }
    })
  }, [normTx])

  const timelineChartData = useMemo(() =>
    timelineData.map(r => ({
      label: monthLabel(r.month),
      value: r.qty,
      color: 'var(--teal)',
    })),
    [timelineData]
  )

  // ── Top Items ─────────────────────────────────────────────────────────────────
  const topItems = useMemo(() => {
    const map = {}
    for (const t of normTx) {
      const key = t.item_name || 'Unknown'
      if (!map[key]) map[key] = { name: key, cat: t.category || '—', qty: 0, txCount: 0, depts: new Set() }
      map[key].qty += Number(t.qty) || 0
      map[key].txCount++
      map[key].depts.add(t.dept)
    }
    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20)
      .map((r, i) => ({ ...r, rank: i + 1, deptsCount: r.depts.size }))
  }, [normTx])

  // ── Dept drill-down ──────────────────────────────────────────────────────────
  const deptDrilldown = useMemo(() => {
    if (!expandedDept) return null
    const deptTx = normTx.filter(t => t.dept === expandedDept)

    // top 5 items
    const itemMap = {}
    for (const t of deptTx) {
      const n = t.item_name || 'Unknown'
      itemMap[n] = (itemMap[n] || 0) + (Number(t.qty) || 0)
    }
    const topItems5 = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    // monthly (last 6 months)
    const months6 = last12Months().slice(-6)
    const monthlyMap = {}
    for (const m of months6) monthlyMap[m] = 0
    for (const t of deptTx) {
      const m = isoMonth(t.date)
      if (monthlyMap[m] !== undefined) monthlyMap[m] += Number(t.qty) || 0
    }
    const monthlyChart = months6.map(m => ({
      label: monthLabel(m),
      value: monthlyMap[m],
      color: 'var(--blue)',
    }))

    // top category
    const catMap = {}
    for (const t of deptTx) {
      const c = t.category?.trim() || 'Uncategorised'
      catMap[c] = (catMap[c] || 0) + 1
    }
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    return { topItems5, monthlyChart, topCat }
  }, [expandedDept, normTx])

  // ── export ────────────────────────────────────────────────────────────────────
  function handleExport() {
    if (tab === 0) {
      exportXLSX(
        deptRows.map(r => ({ Department: r.dept, Transactions: r.txCount, 'Total Qty': r.qty, '% of Total': r.pct.toFixed(1) })),
        `DeptConsumption_ByDept_${dateTag()}`
      )
    } else if (tab === 1) {
      exportXLSX(
        catRows.map(r => ({ Category: r.cat, Transactions: r.txCount, 'Total Qty': r.qty, '% of Total': r.pct.toFixed(1) })),
        `DeptConsumption_ByCategory_${dateTag()}`
      )
    } else if (tab === 2) {
      exportXLSX(
        timelineData.map(r => ({ Month: r.month, Transactions: r.txCount, 'Total Qty': r.qty, 'Top Dept': r.topDept, 'Top Category': r.topCat })),
        `DeptConsumption_Timeline_${dateTag()}`
      )
    } else {
      exportXLSX(
        topItems.map(r => ({ Rank: r.rank, Item: r.name, Category: r.cat, 'Total Qty': r.qty, 'Departments': r.deptsCount, Transactions: r.txCount })),
        `DeptConsumption_TopItems_${dateTag()}`
      )
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Department Consumption"
        subtitle="Stock issue analytics by department, category and time period"
      >
        <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
          <span className="material-icons md-16">refresh</span>
          Refresh
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleExport}>
          <span className="material-icons md-16">download</span>
          Export XLSX
        </button>
      </PageHeader>

      {/* Period filter */}
      <div className="card" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginRight: 4 }}>Period:</span>
        {[
          { key: 'month', label: 'This Month' },
          { key: '3m',    label: 'Last 3 Months' },
          { key: 'year',  label: 'This Year' },
          { key: '12m',   label: 'Last 12 Months' },
          { key: 'custom', label: 'Custom' },
        ].map(p => (
          <button
            key={p.key}
            className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input
              type="date"
              className="form-control"
              style={{ width: 140, fontSize: 12 }}
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
            <input
              type="date"
              className="form-control"
              style={{ width: 140, fontSize: 12 }}
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={fetchData}>Apply</button>
          </>
        )}
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>Loading…</span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          label="Total Stock Issues"
          value={fmtNum(kpi.total)}
          sub="OUT transactions"
          icon="output"
          color="blue"
        />
        <KPICard
          label="Units Issued"
          value={fmtNum(kpi.totalQty)}
          sub="Total qty across all issues"
          icon="inventory_2"
        />
        <KPICard
          label="Departments Active"
          value={kpi.activeDepts}
          sub="Distinct departments with issues"
          icon="corporate_fare"
          color="teal"
        />
        <KPICard
          label="Top Department"
          value={kpi.topDept}
          sub="Highest transaction count"
          icon="leaderboard"
          color="gold"
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: tab === i ? '2px solid var(--gold)' : '2px solid transparent',
              color: tab === i ? 'var(--gold)' : 'var(--text-dim)',
              fontWeight: tab === i ? 700 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab A: By Department ── */}
      {tab === 0 && (
        <div>
          {normTx.length === 0 && !loading
            ? <EmptyState icon="inventory" message="No stock issues found for the selected period." />
            : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={th}>Department</th>
                      <th style={{ ...th, textAlign: 'right' }}>Transactions</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total Qty</th>
                      <th style={{ ...th, textAlign: 'right' }}>% Share</th>
                      <th style={{ ...th, minWidth: 120 }}>Share Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptRows.map((row, idx) => {
                      const isExpanded = expandedDept === row.dept
                      return (
                        <>
                          <tr
                            key={row.dept}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              cursor: 'pointer',
                              background: isExpanded ? 'var(--surface2)' : 'transparent',
                              transition: 'background .15s',
                            }}
                            onClick={() => setExpandedDept(isExpanded ? null : row.dept)}
                          >
                            <td style={{ ...td, fontWeight: idx === 0 ? 700 : 400 }}>
                              <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 6, color: deptColor(idx) }}>
                                {isExpanded ? 'expand_less' : 'chevron_right'}
                              </span>
                              {row.dept}
                              {idx === 0 && (
                                <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--gold)', color: '#000', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>
                                  TOP
                                </span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.txCount)}</td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.qty)}</td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{row.pct.toFixed(1)}%</td>
                            <td style={{ ...td }}>
                              <StatBar value={row.qty} max={deptRows[0]?.qty || 1} color={deptColor(idx)} height={6} />
                            </td>
                          </tr>

                          {/* Inline drilldown */}
                          {isExpanded && deptDrilldown && (
                            <tr key={`${row.dept}-expand`}>
                              <td colSpan={5} style={{ padding: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                <DrilldownPanel
                                  dept={row.dept}
                                  data={deptDrilldown}
                                  onClose={() => setExpandedDept(null)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
                {deptRows.length === 0 && !loading && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>No data</div>
                )}
              </div>
            )
          }
        </div>
      )}

      {/* ── Tab B: By Category ── */}
      {tab === 1 && (
        <div>
          {catRows.length > 0 && (
            <ChartCard
              title="Category Distribution"
              subtitle="Units issued by category"
              data={catChartData}
              unit=" units"
              height={160}
              style={{ marginBottom: 16 }}
            />
          )}
          {catRows.length === 0 && !loading
            ? <EmptyState icon="category" message="No category data for selected period." />
            : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={th}>Category</th>
                      <th style={{ ...th, textAlign: 'right' }}>Transactions</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total Qty</th>
                      <th style={{ ...th, textAlign: 'right' }}>% Share</th>
                      <th style={{ ...th, minWidth: 120 }}>Share Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catRows.map((row, idx) => (
                      <tr key={row.cat} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: deptColor(idx), flexShrink: 0 }} />
                          {row.cat}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.txCount)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.qty)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{row.pct.toFixed(1)}%</td>
                        <td style={td}>
                          <StatBar value={row.qty} max={catRows[0]?.qty || 1} color={deptColor(idx)} height={6} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ── Tab C: Timeline ── */}
      {tab === 2 && (
        <div>
          {timelineChartData.some(d => d.value > 0) ? (
            <ChartCard
              title="Monthly Issue Quantities"
              subtitle="Total units issued per month (last 12 months)"
              data={timelineChartData}
              unit=" units"
              height={180}
              style={{ marginBottom: 16 }}
            />
          ) : (
            !loading && <EmptyState icon="timeline" message="No issue data for the past 12 months." />
          )}

          {timelineData.some(r => r.txCount > 0) && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <th style={th}>Month</th>
                    <th style={{ ...th, textAlign: 'right' }}>Transactions</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total Qty</th>
                    <th style={th}>Top Dept</th>
                    <th style={th}>Top Category</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineData.filter(r => r.txCount > 0).map(row => (
                    <tr key={row.month} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text)' }}>{monthLabel(row.month)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.txCount)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.qty)}</td>
                      <td style={{ ...td, color: 'var(--teal)' }}>{row.topDept}</td>
                      <td style={{ ...td, color: 'var(--text-dim)' }}>{row.topCat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab D: Top Items ── */}
      {tab === 3 && (
        <div>
          {topItems.length === 0 && !loading
            ? <EmptyState icon="inventory_2" message="No items issued in the selected period." />
            : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ ...th, width: 48, textAlign: 'center' }}>Rank</th>
                      <th style={th}>Item Name</th>
                      <th style={th}>Category</th>
                      <th style={{ ...th, textAlign: 'right' }}>Total Qty</th>
                      <th style={{ ...th, textAlign: 'right' }}>Depts Issued To</th>
                      <th style={{ ...th, textAlign: 'right' }}>Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map(row => (
                      <tr
                        key={row.name}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: row.rank === 1 ? 'color-mix(in srgb, var(--gold) 8%, transparent)' : 'transparent',
                        }}
                      >
                        <td style={{ ...td, textAlign: 'center' }}>
                          {row.rank === 1 ? (
                            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                              <span className="material-icons md-16" style={{ verticalAlign: 'middle' }}>star</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>#{row.rank}</span>
                          )}
                        </td>
                        <td style={{ ...td, fontWeight: row.rank === 1 ? 700 : 400, color: row.rank === 1 ? 'var(--gold)' : 'var(--text)' }}>
                          {row.name}
                        </td>
                        <td style={{ ...td, color: 'var(--text-dim)', fontSize: 12 }}>{row.cat}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtNum(row.qty)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{row.deptsCount}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(row.txCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}
    </div>
  )
}

// ── Drilldown panel component ─────────────────────────────────────────────────

function DrilldownPanel({ dept, data, onClose }) {
  const { topItems5, monthlyChart, topCat } = data
  return (
    <div style={{ padding: 20, borderTop: '2px solid var(--gold)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{dept}</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-dim)' }}>Consumption breakdown</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          <span className="material-icons md-14">close</span>
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Monthly chart */}
        <ChartCard
          title="Monthly Consumption (last 6 months)"
          data={monthlyChart}
          unit=" units"
          height={120}
        />

        {/* Top items + top category */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 10 }}>
            Top 5 Items Consumed
          </div>
          {topItems5.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No item data</span>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, fontSize: 11, paddingTop: 0 }}>Item</th>
                  <th style={{ ...th, fontSize: 11, paddingTop: 0, textAlign: 'right' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {topItems5.map(([name, qty], i) => (
                  <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontSize: 12, paddingTop: 6, paddingBottom: 6, color: i === 0 ? 'var(--teal)' : 'var(--text)' }}>
                      {name}
                    </td>
                    <td style={{ ...td, fontSize: 12, paddingTop: 6, paddingBottom: 6, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {fmtNum(qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
            Top category:{' '}
            <strong style={{ color: 'var(--text)' }}>{topCat}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── shared table styles ───────────────────────────────────────────────────────

const th = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const td = {
  padding: '10px 14px',
  fontSize: 13,
  color: 'var(--text)',
  verticalAlign: 'middle',
}
