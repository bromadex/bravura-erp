// src/pages/Inventory/StockAgeingReport.jsx
// Stock Ageing Report — FIFO-based analysis of how long inventory has been
// sitting unsold/unissued, computed from stock_ledger_entries.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'

const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]

function daysBetween(dateStr) {
  if (!dateStr) return 0
  return Math.floor((TODAY - new Date(dateStr)) / 86400000)
}

function ageBucket(days) {
  if (days <= 30)  return '0-30'
  if (days <= 60)  return '31-60'
  if (days <= 90)  return '61-90'
  if (days <= 180) return '91-180'
  return '181+'
}

const BUCKETS = ['0-30', '31-60', '61-90', '91-180', '181+']

const BUCKET_STYLE = {
  '0-30':   { color: 'var(--green)',  bold: false },
  '31-60':  { color: 'var(--teal)',   bold: false },
  '61-90':  { color: 'var(--yellow)', bold: false },
  '91-180': { color: 'var(--red)',    bold: false },
  '181+':   { color: 'var(--red)',    bold: true  },
}

// ── FIFO ageing engine ───────────────────────────────────────────────────
function computeAgeing(sles, bins, items) {
  // Group SLEs by item+warehouse
  const grouped = {}
  for (const sle of sles) {
    const key = `${sle.item_id}::${sle.warehouse_id}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(sle)
  }

  const rows = []

  for (const [key, entries] of Object.entries(grouped)) {
    const [itemId, warehouseId] = key.split('::')

    const item = items.find(i => i.id === itemId)
    if (!item) continue

    const bin = bins.find(b => b.item_id === itemId && b.warehouse_id === warehouseId)
    const onHand = bin?.actual_qty ?? 0
    if (onHand <= 0) continue

    const valRate = bin?.valuation_rate ?? item.cost ?? 0
    const warehouseName = bin?.warehouses?.name ?? warehouseId ?? 'Unknown'

    // Sort chronologically (already ordered, but ensure)
    const sorted = [...entries].sort((a, b) =>
      new Date(a.posting_datetime) - new Date(b.posting_datetime)
    )

    // Build a FIFO queue of incoming lots
    const queue = [] // { date, qty }
    let consumed = 0

    for (const sle of sorted) {
      const qty = Number(sle.actual_qty_change ?? 0)
      if (qty > 0) {
        queue.push({ date: sle.posting_datetime?.split('T')[0] ?? sle.posting_date ?? TODAY_STR, qty })
      } else if (qty < 0) {
        consumed += Math.abs(qty)
      }
    }

    // Consume from oldest lots first
    let remaining = consumed
    const aged = []
    for (const lot of queue) {
      if (remaining <= 0) { aged.push({ ...lot }); continue }
      if (lot.qty <= remaining) { remaining -= lot.qty; continue }
      // Partially consumed lot
      aged.push({ date: lot.date, qty: lot.qty - remaining })
      remaining = 0
    }

    // The aged lots represent the current on-hand stock (FIFO remainder)
    // Reconcile: total aged qty should match onHand; scale if needed
    const agedTotal = aged.reduce((s, l) => s + l.qty, 0)
    const scale = agedTotal > 0 ? onHand / agedTotal : 1

    const bucketQty = { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '181+': 0 }
    let oldestDate = null

    for (const lot of aged) {
      const scaledQty = lot.qty * scale
      const days = daysBetween(lot.date)
      const bkt = ageBucket(days)
      bucketQty[bkt] += scaledQty
      if (!oldestDate || lot.date < oldestDate) oldestDate = lot.date
    }

    const totalValue = onHand * valRate

    rows.push({
      itemId,
      itemName:      item.name,
      category:      item.category ?? '—',
      warehouseId,
      warehouseName,
      unit:          item.unit ?? 'pcs',
      onHand,
      valRate,
      totalValue,
      bucketQty,
      oldestDate,
      oldestDays:    oldestDate ? daysBetween(oldestDate) : 0,
    })
  }

  return rows.sort((a, b) => b.oldestDays - a.oldestDays)
}

// ── Summary bar ──────────────────────────────────────────────────────────
function SummaryBar({ rows }) {
  const totals = { '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '181+': 0 }
  for (const r of rows) {
    for (const b of BUCKETS) totals[b] += r.bucketQty[b]
  }
  const grand = Object.values(totals).reduce((s, v) => s + v, 0) || 1

  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Stock Age Distribution (by qty)
      </div>
      <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {BUCKETS.map(b => {
          const pct = (totals[b] / grand) * 100
          return pct > 0 ? (
            <div key={b} style={{ width: `${pct}%`, background: BUCKET_STYLE[b].color, transition: 'width .4s' }} />
          ) : null
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {BUCKETS.map(b => {
          const pct = ((totals[b] / grand) * 100).toFixed(1)
          return (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: BUCKET_STYLE[b].color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-dim)' }}>{b} days:</span>
              <span style={{ fontWeight: 700, color: BUCKET_STYLE[b].color }}>{pct}%</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({fmtNum(totals[b])})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function StockAgeingReport() {
  const [sles,        setSles]        = useState([])
  const [bins,        setBins]        = useState([])
  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)

  // Filters
  const [whFilter,    setWhFilter]    = useState('ALL')
  const [catFilter,   setCatFilter]   = useState('ALL')
  const [search,      setSearch]      = useState('')
  const [minAge,      setMinAge]      = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('stock_ledger_entries')
        .select('item_id, warehouse_id, actual_qty_change, posting_datetime, posting_date')
        .eq('is_cancelled', false)
        .order('posting_datetime'),
      supabase
        .from('bins')
        .select('item_id, warehouse_id, actual_qty, valuation_rate, warehouses(name)'),
      supabase
        .from('items')
        .select('id, name, category, unit, cost'),
    ]).then(([{ data: sData }, { data: bData }, { data: iData }]) => {
      setSles(sData  || [])
      setBins(bData  || [])
      setItems(iData || [])
      setLoading(false)
    }).catch(err => {
      toast.error('Failed to load data: ' + err.message)
      setLoading(false)
    })
  }, [])

  const allRows = useMemo(() => computeAgeing(sles, bins, items), [sles, bins, items])

  // Unique lists for filter dropdowns
  const warehouses = useMemo(() => {
    const seen = new Map()
    for (const r of allRows) seen.set(r.warehouseId, r.warehouseName)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [allRows])

  const categories = useMemo(() => [...new Set(allRows.map(r => r.category).filter(Boolean))], [allRows])

  const filtered = useMemo(() => {
    const minAgeNum = parseInt(minAge) || 0
    return allRows.filter(r => {
      if (whFilter  !== 'ALL' && r.warehouseId !== whFilter)       return false
      if (catFilter !== 'ALL' && r.category    !== catFilter)       return false
      if (search && !r.itemName.toLowerCase().includes(search.toLowerCase())) return false
      if (minAgeNum > 0 && r.oldestDays < minAgeNum)               return false
      return true
    })
  }, [allRows, whFilter, catFilter, search, minAge])

  // KPIs
  const totalStockValue = useMemo(() =>
    bins.reduce((s, b) => s + (b.actual_qty || 0) * (b.valuation_rate || 0), 0),
  [bins])

  const agedValue = useMemo(() =>
    allRows.reduce((s, r) => s + (r.bucketQty['91-180'] + r.bucketQty['181+']) * r.valRate, 0),
  [allRows])

  const deadStockItems = useMemo(() =>
    allRows.filter(r => r.bucketQty['181+'] > 0 && r.bucketQty['0-30'] + r.bucketQty['31-60'] + r.bucketQty['61-90'] + r.bucketQty['91-180'] < 0.01).length,
  [allRows])

  const activeWarehouses = warehouses.length

  const handleExport = () => {
    if (!filtered.length) { toast.error('Nothing to export'); return }
    exportXLSX(
      filtered.map(r => ({
        Item:                r.itemName,
        Category:            r.category,
        Warehouse:           r.warehouseName,
        Unit:                r.unit,
        'On Hand':           +r.onHand.toFixed(2),
        '0-30 Days':         +r.bucketQty['0-30'].toFixed(2),
        '31-60 Days':        +r.bucketQty['31-60'].toFixed(2),
        '61-90 Days':        +r.bucketQty['61-90'].toFixed(2),
        '91-180 Days':       +r.bucketQty['91-180'].toFixed(2),
        '181+ Days':         +r.bucketQty['181+'].toFixed(2),
        'Total Value ($)':   +r.totalValue.toFixed(2),
        'Oldest Receipt':    r.oldestDate ?? '—',
        'Oldest (Days)':     r.oldestDays,
      })),
      `StockAgeingReport_${dateTag()}`,
      'Stock Ageing'
    )
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader
        title="Stock Ageing Report"
        subtitle="FIFO analysis of how long inventory has been sitting unsold"
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="inventory_2"
          label="Total Stock Value"
          value={`$${fmtNum(totalStockValue)}`}
          sub="all bins · valuation rate"
          color="teal"
        />
        <KPICard
          icon="hourglass_bottom"
          label="Aged > 90 Days Value"
          value={`$${fmtNum(agedValue)}`}
          sub="91-180 + 181+ buckets"
          color={agedValue > 0 ? 'red' : 'green'}
        />
        <KPICard
          icon="block"
          label="Dead Stock Items"
          value={deadStockItems}
          sub="100% in 181+ bracket"
          color={deadStockItems > 0 ? 'red' : 'green'}
        />
        <KPICard
          icon="warehouse"
          label="Active Warehouses"
          value={activeWarehouses}
          sub="warehouses in this report"
          color="blue"
        />
      </div>

      {/* Summary bar */}
      {!loading && allRows.length > 0 && <SummaryBar rows={filtered.length ? filtered : allRows} />}

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="Search item name…"
            style={{ maxWidth: 220 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 170 }}
            value={whFilter}
            onChange={e => setWhFilter(e.target.value)}
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select
            className="form-control"
            style={{ width: 150 }}
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Min Age:</label>
            <input
              type="number"
              className="form-control"
              placeholder="days"
              style={{ width: 80 }}
              min="0"
              value={minAge}
              onChange={e => setMinAge(e.target.value)}
            />
          </div>
          {(search || whFilter !== 'ALL' || catFilter !== 'ALL' || minAge) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setWhFilter('ALL'); setCatFilter('ALL'); setMinAge('') }}
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {allRows.length} item-warehouse combinations
          {' · '}Sorted by oldest receipt date (worst aged first)
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th>Unit</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right', color: BUCKET_STYLE['0-30'].color }}>0–30 d</th>
                <th style={{ textAlign: 'right', color: BUCKET_STYLE['31-60'].color }}>31–60 d</th>
                <th style={{ textAlign: 'right', color: BUCKET_STYLE['61-90'].color }}>61–90 d</th>
                <th style={{ textAlign: 'right', color: BUCKET_STYLE['91-180'].color }}>91–180 d</th>
                <th style={{ textAlign: 'right', color: BUCKET_STYLE['181+'].color }}>181+ d</th>
                <th style={{ textAlign: 'right' }}>Total Value</th>
                <th>Oldest Receipt</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
                    <span className="material-icons" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}>hourglass_empty</span>
                    Computing stock ageing…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="13">
                    <EmptyState
                      icon="inventory"
                      message={search || whFilter !== 'ALL' || catFilter !== 'ALL' || minAge
                        ? 'No items match your filters'
                        : 'No stock ageing data found'}
                    />
                  </td>
                </tr>
              ) : filtered.map((r, idx) => {
                const isDeadStock = r.bucketQty['181+'] > 0 &&
                  r.bucketQty['0-30'] + r.bucketQty['31-60'] + r.bucketQty['61-90'] + r.bucketQty['91-180'] < 0.01
                return (
                  <tr
                    key={`${r.itemId}-${r.warehouseId}`}
                    style={{
                      background: isDeadStock ? 'rgba(239,68,68,0.04)' : '',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = isDeadStock ? 'rgba(239,68,68,0.04)' : ''}
                  >
                    <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.itemName}</div>
                      {isDeadStock && (
                        <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>DEAD STOCK</div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{ fontSize: 9 }}>{r.category}</span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.warehouseName}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.unit}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                      {fmtNum(r.onHand)}
                    </td>
                    {BUCKETS.map(b => {
                      const qty = r.bucketQty[b]
                      const style = BUCKET_STYLE[b]
                      return (
                        <td
                          key={b}
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: qty > 0 ? style.color : 'var(--text-dim)',
                            fontWeight: qty > 0 && style.bold ? 700 : 400,
                            opacity: qty > 0 ? 1 : 0.35,
                          }}
                        >
                          {qty > 0 ? fmtNum(qty) : '—'}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>
                      ${fmtNum(r.totalValue)}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.oldestDate ? (
                        <div>
                          <div style={{ fontFamily: 'var(--mono)' }}>{r.oldestDate}</div>
                          <div style={{
                            fontSize: 10,
                            color: r.oldestDays > 180 ? 'var(--red)'
                              : r.oldestDays > 90 ? 'var(--yellow)'
                              : 'var(--text-dim)',
                            fontWeight: r.oldestDays > 90 ? 600 : 400,
                          }}>
                            {r.oldestDays}d ago
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td colSpan="5" style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px' }}>
                    Totals ({filtered.length} rows)
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtNum(filtered.reduce((s, r) => s + r.onHand, 0))}
                  </td>
                  {BUCKETS.map(b => (
                    <td key={b} style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: BUCKET_STYLE[b].color }}>
                      {fmtNum(filtered.reduce((s, r) => s + r.bucketQty[b], 0))}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                    ${fmtNum(filtered.reduce((s, r) => s + r.totalValue, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
