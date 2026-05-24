// src/pages/Procurement/SpendAnalytics.jsx
//
// 12-month rolling procurement spend analytics
// Drill-down by supplier, category, and item.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase }                                   from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState }            from '../../components/ui'
import { exportXLSX, fmtNum, dateTag }                from '../../engine/reportingEngine'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts'

// ── Date helpers ──────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const monthLabel = (dateStr) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function getPresetRange(preset) {
  const now   = new Date()
  const today = isoDate(now)
  switch (preset) {
    case '12mo': {
      const from = new Date(now)
      from.setMonth(from.getMonth() - 12)
      return [isoDate(from), today]
    }
    case '6mo': {
      const from = new Date(now)
      from.setMonth(from.getMonth() - 6)
      return [isoDate(from), today]
    }
    case 'year': {
      return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`]
    }
    default:
      return [null, null]
  }
}

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'supplier', label: 'By Supplier' },
  { id: 'category', label: 'By Category' },
  { id: 'item',     label: 'By Item'     },
]

// ── Custom Recharts tooltip ───────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, valueLabel = 'Spend', extraKey }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
      minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      <div style={{ color: 'var(--text-mid)' }}>
        {valueLabel}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>
          ${fmtNum(payload[0]?.value ?? 0)}
        </span>
      </div>
      {extraKey && payload[0]?.payload?.[extraKey] != null && (
        <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
          {extraKey === 'count' ? `${payload[0].payload[extraKey]} invoice${payload[0].payload[extraKey] !== 1 ? 's' : ''}` : null}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpendAnalytics() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [preset,   setPreset]   = useState('12mo')   // '12mo' | '6mo' | 'year' | 'custom'
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [tab,      setTab]      = useState('supplier')
  const [loading,  setLoading]  = useState(false)

  const [invoices,      setInvoices]      = useState([])
  const [invoiceLines,  setInvoiceLines]  = useState([])

  // ── Effective date range ──────────────────────────────────────────────────
  const [dateFrom, dateTo] = useMemo(() => {
    if (preset === 'custom') return [fromDate, toDate]
    return getPresetRange(preset)
  }, [preset, fromDate, toDate])

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const { data: invData, error: invErr } = await supabase
        .from('purchase_invoices')
        .select('id, invoice_no, invoice_date, total_amount, currency, status, supplier_id, suppliers(name)')
        .gte('invoice_date', dateFrom)
        .lte('invoice_date', dateTo)
        .neq('status', 'Cancelled')
        .order('invoice_date', { ascending: true })

      if (invErr) throw invErr
      const invs = invData || []
      setInvoices(invs)

      if (invs.length === 0) {
        setInvoiceLines([])
        setLoading(false)
        return
      }

      const invoiceIds = invs.map(i => i.id)

      // Supabase .in() handles up to 2000 items; chunk if needed
      const CHUNK = 500
      let allLines = []
      for (let i = 0; i < invoiceIds.length; i += CHUNK) {
        const chunk = invoiceIds.slice(i, i + CHUNK)
        const { data: lineData, error: lineErr } = await supabase
          .from('purchase_invoice_lines')
          .select('id, invoice_id, item_name, category, qty, unit_rate, amount')
          .in('invoice_id', chunk)
        if (lineErr) throw lineErr
        allLines = allLines.concat(lineData || [])
      }
      setInvoiceLines(allLines)
    } catch (err) {
      console.error('SpendAnalytics fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Build enriched line dataset ───────────────────────────────────────────
  const enrichedLines = useMemo(() => {
    const invMap = new Map(invoices.map(inv => [inv.id, inv]))
    return invoiceLines.map(line => {
      const inv = invMap.get(line.invoice_id) || {}
      const amt = parseFloat(line.amount) || (parseFloat(line.qty) * parseFloat(line.unit_rate)) || 0
      return {
        invoice_id:    line.invoice_id,
        invoice_date:  inv.invoice_date || '',
        supplier_name: inv.suppliers?.name || 'Unknown Supplier',
        category:      line.category || 'Uncategorised',
        item_name:     line.item_name || 'Unknown Item',
        qty:           parseFloat(line.qty) || 0,
        amount:        amt,
      }
    })
  }, [invoices, invoiceLines])

  // ── KPI computations ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalSpend = invoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0)

    // Determine number of months in range
    let months = 12
    if (dateFrom && dateTo) {
      const f = new Date(dateFrom)
      const t = new Date(dateTo)
      months = Math.max(1, (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1)
    }
    const avgMonthlySpend = months > 0 ? totalSpend / months : 0

    // Top supplier by total invoice amount
    const supplierMap = {}
    invoices.forEach(inv => {
      const name = inv.suppliers?.name || 'Unknown'
      supplierMap[name] = (supplierMap[name] || 0) + (parseFloat(inv.total_amount) || 0)
    })
    const topSupplierEntry = Object.entries(supplierMap).sort((a, b) => b[1] - a[1])[0] || ['—', 0]

    // Top category by line amount
    const catMap = {}
    enrichedLines.forEach(l => {
      catMap[l.category] = (catMap[l.category] || 0) + l.amount
    })
    const topCategoryEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0] || ['—', 0]

    return {
      totalSpend,
      avgMonthlySpend,
      topSupplier:     topSupplierEntry[0],
      topSupplierAmt:  topSupplierEntry[1],
      topCategory:     topCategoryEntry[0],
      topCategoryAmt:  topCategoryEntry[1],
      months,
    }
  }, [invoices, enrichedLines, dateFrom, dateTo])

  // ── Monthly trend data ────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const map = {}
    invoices.forEach(inv => {
      if (!inv.invoice_date) return
      const label = monthLabel(inv.invoice_date)
      if (!map[label]) map[label] = { month: label, spend: 0, count: 0, _key: inv.invoice_date.slice(0, 7) }
      map[label].spend += parseFloat(inv.total_amount) || 0
      map[label].count += 1
    })
    return Object.values(map).sort((a, b) => a._key.localeCompare(b._key))
  }, [invoices])

  // ── Supplier aggregation ──────────────────────────────────────────────────
  const supplierRows = useMemo(() => {
    const map = {}
    invoices.forEach(inv => {
      const name = inv.suppliers?.name || 'Unknown Supplier'
      if (!map[name]) map[name] = { supplier: name, invoiceCount: 0, total: 0 }
      map[name].total += parseFloat(inv.total_amount) || 0
      map[name].invoiceCount += 1
    })
    const totalSpend = kpis.totalSpend || 1
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)
      .map((r, i) => ({ rank: i + 1, ...r, pct: (r.total / totalSpend * 100) }))
  }, [invoices, kpis.totalSpend])

  const supplierChartData = useMemo(() =>
    supplierRows.map(r => ({ name: r.supplier, amount: r.total }))
  , [supplierRows])

  // ── Category aggregation ──────────────────────────────────────────────────
  const categoryRows = useMemo(() => {
    const map = {}
    enrichedLines.forEach(l => {
      const cat = l.category
      if (!map[cat]) map[cat] = { category: cat, lineCount: 0, total: 0 }
      map[cat].total += l.amount
      map[cat].lineCount += 1
    })
    const totalSpend = enrichedLines.reduce((s, l) => s + l.amount, 0) || 1
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map((r, i) => ({ rank: i + 1, ...r, pct: (r.total / totalSpend * 100) }))
  }, [enrichedLines])

  const categoryChartData = useMemo(() =>
    categoryRows.slice(0, 15).map(r => ({ name: r.category, amount: r.total }))
  , [categoryRows])

  // ── Item aggregation ──────────────────────────────────────────────────────
  const itemRows = useMemo(() => {
    const map = {}
    enrichedLines.forEach(l => {
      const key = l.item_name
      if (!map[key]) map[key] = { item: key, category: l.category, timesOrdered: 0, totalQty: 0, totalValue: 0 }
      map[key].timesOrdered += 1
      map[key].totalQty    += l.qty
      map[key].totalValue  += l.amount
    })
    return Object.values(map)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, ...r }))
  }, [enrichedLines])

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (tab === 'supplier') {
      exportXLSX(
        supplierRows.map(r => ({
          Rank: r.rank, Supplier: r.supplier, 'Invoice Count': r.invoiceCount,
          'Total Amount': r.total.toFixed(2), '% of Spend': r.pct.toFixed(1),
        })),
        `SpendBySupplier_${dateTag()}`,
        'By Supplier',
      )
    } else if (tab === 'category') {
      exportXLSX(
        categoryRows.map(r => ({
          Rank: r.rank, Category: r.category, 'Line Count': r.lineCount,
          'Total Amount': r.total.toFixed(2), '% of Spend': r.pct.toFixed(1),
        })),
        `SpendByCategory_${dateTag()}`,
        'By Category',
      )
    } else {
      exportXLSX(
        itemRows.map(r => ({
          Rank: r.rank, Item: r.item, Category: r.category,
          'Times Ordered': r.timesOrdered, 'Total Qty': r.totalQty.toFixed(2),
          'Total Value': r.totalValue.toFixed(2),
        })),
        `SpendByItem_${dateTag()}`,
        'By Item',
      )
    }
  }

  // ── Derived label for date range ──────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (preset === 'custom') return `${fromDate} – ${toDate}`
    if (preset === '12mo')   return 'Last 12 months'
    if (preset === '6mo')    return 'Last 6 months'
    if (preset === 'year')   return `This year (${new Date().getFullYear()})`
    return ''
  }, [preset, fromDate, toDate])

  // ── Tick formatter (truncate long labels) ─────────────────────────────────
  const truncate = (str, n = 18) => str?.length > n ? str.slice(0, n) + '…' : str

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="main-content">
      {/* Page header */}
      <PageHeader
        title="Spend Analytics"
        subtitle="12-month rolling procurement spend — by supplier, category and department"
      >
        <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loading}>
          <span className="material-icons md-18">refresh</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleExport}>
          <span className="material-icons md-18">download</span>
          Export XLSX
        </button>
      </PageHeader>

      {/* Date range controls */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        {[
          { id: '12mo', label: 'Last 12 months' },
          { id: '6mo',  label: 'Last 6 months'  },
          { id: 'year', label: 'This year'       },
          { id: 'custom', label: 'Custom'        },
        ].map(opt => (
          <button
            key={opt.id}
            className={`btn btn-sm ${preset === opt.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset(opt.id)}
          >
            {opt.label}
          </button>
        ))}

        {preset === 'custom' && (
          <>
            <input
              type="date"
              className="form-control"
              style={{ width: 160 }}
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>to</span>
            <input
              type="date"
              className="form-control"
              style={{ width: 160 }}
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={fetchData} disabled={!fromDate || !toDate}>
              Apply
            </button>
          </>
        )}

        {rangeLabel && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
            {rangeLabel}
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <KPICard
          label="TOTAL SPEND"
          value={`$${fmtNum(kpis.totalSpend)}`}
          sub={rangeLabel}
          icon="payments"
          color="gold"
        />
        <KPICard
          label="AVG MONTHLY SPEND"
          value={`$${fmtNum(kpis.avgMonthlySpend)}`}
          sub={`Over ${kpis.months} months`}
          icon="bar_chart"
          color="teal"
        />
        <KPICard
          label="TOP SUPPLIER"
          value={kpis.topSupplier}
          sub={`$${fmtNum(kpis.topSupplierAmt)}`}
          icon="store"
          color="blue"
        />
        <KPICard
          label="TOP CATEGORY"
          value={kpis.topCategory}
          sub={`$${fmtNum(kpis.topCategoryAmt)}`}
          icon="category"
          color="green"
        />
      </div>

      {/* Monthly spend trend chart */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Monthly Spend Trend</h3>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
        </div>

        {monthlyTrend.length === 0 ? (
          <EmptyState icon="bar_chart" message="No invoice data for the selected period" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${fmtNum(v)}`}
                width={80}
              />
              <Tooltip content={<CustomTooltip valueLabel="Total Spend" extraKey="count" />} />
              <Bar dataKey="spend" name="Spend" fill="var(--gold)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Drill-down tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
              background: 'none',
              color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)',
              fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer',
              fontSize: 14,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: By Supplier */}
      {tab === 'supplier' && (
        <div>
          {supplierRows.length === 0 ? (
            <EmptyState icon="store" message="No supplier data for the selected period" />
          ) : (
            <>
              {/* Horizontal bar chart */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
              }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>
                  Top {supplierChartData.length} Suppliers by Spend
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(260, supplierChartData.length * 36)}>
                  <BarChart
                    data={supplierChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `$${fmtNum(v)}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={160}
                      tickFormatter={v => truncate(v, 22)}
                    />
                    <Tooltip
                      content={<CustomTooltip valueLabel="Spend" />}
                      cursor={{ fill: 'rgba(255,255,255,.04)' }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="var(--teal)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Supplier table */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>#</th>
                        <th>SUPPLIER</th>
                        <th style={{ textAlign: 'right' }}>INVOICES</th>
                        <th style={{ textAlign: 'right' }}>TOTAL SPEND</th>
                        <th style={{ textAlign: 'right' }}>% OF TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierRows.map(r => (
                        <tr key={r.supplier}>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>{r.rank}</td>
                          <td style={{ fontWeight: 500 }}>{r.supplier}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-mid)' }}>{r.invoiceCount}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                            ${fmtNum(r.total)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                              <div style={{
                                width: 60,
                                height: 6,
                                background: 'var(--surface2)',
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${Math.min(r.pct, 100)}%`,
                                  height: '100%',
                                  background: 'var(--teal)',
                                  borderRadius: 3,
                                }} />
                              </div>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', minWidth: 38 }}>
                                {r.pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: By Category */}
      {tab === 'category' && (
        <div>
          {categoryRows.length === 0 ? (
            <EmptyState icon="category" message="No category data for the selected period" />
          ) : (
            <>
              {/* Horizontal bar chart */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
              }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>
                  Top {categoryChartData.length} Categories by Spend
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(260, categoryChartData.length * 36)}>
                  <BarChart
                    data={categoryChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `$${fmtNum(v)}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={160}
                      tickFormatter={v => truncate(v, 22)}
                    />
                    <Tooltip
                      content={<CustomTooltip valueLabel="Spend" />}
                      cursor={{ fill: 'rgba(255,255,255,.04)' }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="var(--blue)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category table */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>#</th>
                        <th>CATEGORY</th>
                        <th style={{ textAlign: 'right' }}>LINE COUNT</th>
                        <th style={{ textAlign: 'right' }}>TOTAL SPEND</th>
                        <th style={{ textAlign: 'right' }}>% OF TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.map(r => (
                        <tr key={r.category}>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>{r.rank}</td>
                          <td style={{ fontWeight: 500 }}>{r.category}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-mid)' }}>{r.lineCount}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                            ${fmtNum(r.total)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                              <div style={{
                                width: 60,
                                height: 6,
                                background: 'var(--surface2)',
                                borderRadius: 3,
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${Math.min(r.pct, 100)}%`,
                                  height: '100%',
                                  background: 'var(--blue)',
                                  borderRadius: 3,
                                }} />
                              </div>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', minWidth: 38 }}>
                                {r.pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: By Item */}
      {tab === 'item' && (
        <div>
          {itemRows.length === 0 ? (
            <EmptyState icon="inventory_2" message="No item data for the selected period" />
          ) : (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                  Top {itemRows.length} Items by Value
                </h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>RANK</th>
                      <th>ITEM</th>
                      <th>CATEGORY</th>
                      <th style={{ textAlign: 'right' }}>TIMES ORDERED</th>
                      <th style={{ textAlign: 'right' }}>TOTAL QTY</th>
                      <th style={{ textAlign: 'right' }}>TOTAL VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.map(r => (
                      <tr key={r.item}>
                        <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>{r.rank}</td>
                        <td style={{ fontWeight: 500 }}>{r.item}</td>
                        <td>
                          <span style={{
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            color: 'var(--text-mid)',
                          }}>
                            {r.category}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-mid)' }}>{r.timesOrdered}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-mid)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {fmtNum(r.totalQty)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          ${fmtNum(r.totalValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '24px 36px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span className="material-icons md-18" style={{ animation: 'spin 1s linear infinite' }}>
              refresh
            </span>
            Loading spend data…
          </div>
        </div>
      )}
    </div>
  )
}
