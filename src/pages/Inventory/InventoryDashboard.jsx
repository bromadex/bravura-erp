// src/pages/Inventory/InventoryDashboard.jsx
// Phase 19 — Live Inventory KPI Dashboard
// Loads all data directly from Supabase. Auto-refreshes every 120 seconds.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { fmtNum } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { ChartCard } from '../../components/ui/ChartCard'
import { StatBar, SegmentedBar } from '../../components/ui/StatBar'

// ── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 120_000
const CATEGORY_COLORS = [
  'var(--teal)',
  'var(--blue)',
  'var(--purple)',
  'var(--gold)',
  'var(--green)',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function monthLabel(d) {
  return d.toLocaleString('default', { month: 'short' })
}

function daysFromNow(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function fmtAge(seconds) {
  if (seconds < 60) return 'just now'
  const mins = Math.floor(seconds / 60)
  if (mins === 1) return '1 min ago'
  return `${mins} min ago`
}

function fmtCurrency(n) {
  if (n >= 1_000_000) return `${fmtNum(n / 1_000_000, 2)}M`
  if (n >= 1_000) return `${fmtNum(n / 1_000, 1)}k`
  return fmtNum(n, 0)
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState(null)
  const [monthlyChart, setMonthlyChart] = useState({ inData: [], outData: [] })
  const [topItemsData, setTopItemsData] = useState([])
  const [belowReorder, setBelowReorder] = useState([])
  const [expiringBatches, setExpiringBatches] = useState([])
  const [categorySegments, setCategorySegments] = useState([])
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [ageSecs, setAgeSecs] = useState(0)

  const intervalRef = useRef(null)
  const ageIntervalRef = useRef(null)

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const now = new Date()
      const sixMonthsAgo = isoDate(addMonths(now, -6))
      const threeMonthsAgo = isoDate(addMonths(now, -3))

      const [itemsRes, binsRes, sleRes, txRes, batRes, resRes, rlRes] = await Promise.all([
        supabase.from('items').select(
          'id, name, category, unit, cost, balance, threshold, safety_stock, lead_time_days, has_batch_no, has_serial_no'
        ),
        supabase.from('bins').select('*, warehouses(name, code)'),
        supabase
          .from('stock_ledger_entries')
          .select('item_id, warehouse_id, actual_qty, voucher_type, posting_datetime')
          .eq('is_cancelled', false)
          .gte('posting_datetime', sixMonthsAgo),
        supabase
          .from('transactions')
          .select('type, qty, date, item_name, category, cost_center, department')
          .gte('date', threeMonthsAgo)
          .limit(2000),
        supabase
          .from('item_batches')
          .select('id, status, expiry_date, qty_available, batch_no, item_name')
          .in('status', ['Active', 'Quarantine']),
        supabase
          .from('stock_reservations')
          .select('id, status, reserved_qty, consumed_qty')
          .eq('status', 'Active'),
        supabase.from('item_reorder_levels').select('item_id, warehouse_id, reorder_level'),
      ])

      const items = itemsRes.data || []
      const bins = binsRes.data || []
      const sles = sleRes.data || []
      const batches = batRes.data || []
      const reservations = resRes.data || []
      const reorderLevels = rlRes.data || []

      // ── KPI: Total SKUs ──────────────────────────────────────────────────
      const totalSKUs = items.length

      // ── KPI: Total Stock Value (bins) ────────────────────────────────────
      const totalStockValue = bins.reduce((sum, b) => {
        const qty = b.actual_qty ?? 0
        const rate = b.valuation_rate ?? 0
        return sum + qty * rate
      }, 0)

      // ── KPI: Items Below Reorder ─────────────────────────────────────────
      // Build a map of reorder levels: key = `${item_id}:${warehouse_id}`
      const rlMap = {}
      for (const rl of reorderLevels) {
        const key = `${rl.item_id}:${rl.warehouse_id}`
        rlMap[key] = rl.reorder_level
      }

      // Aggregate bin qty per item+warehouse
      const binQtyMap = {}
      const binValueMap = {}
      for (const bin of bins) {
        const key = `${bin.item_id}:${bin.warehouse_id}`
        binQtyMap[key] = (binQtyMap[key] ?? 0) + (bin.actual_qty ?? 0)
        binValueMap[key] = (binValueMap[key] ?? 0) + (bin.actual_qty ?? 0) * (bin.valuation_rate ?? 0)
      }

      // Find items below reorder
      const belowReorderRows = []
      for (const [key, onHand] of Object.entries(binQtyMap)) {
        const rl = rlMap[key]
        if (rl !== undefined && onHand <= rl) {
          const [itemId, warehouseId] = key.split(':')
          const item = items.find(i => String(i.id) === itemId)
          belowReorderRows.push({
            key,
            itemId,
            warehouseId,
            itemName: item?.name ?? itemId,
            onHand,
            reorderLevel: rl,
            shortage: Math.max(0, rl - onHand),
          })
        }
      }
      belowReorderRows.sort((a, b) => b.shortage - a.shortage)

      // ── KPI: Active Reservations ─────────────────────────────────────────
      const activeReservations = reservations.length

      // ── KPI: Expiring Batches (next 30 days) ────────────────────────────
      const thirtyDaysOut = new Date()
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
      const expiringRows = batches
        .filter(b => b.status === 'Active' && b.expiry_date)
        .map(b => ({ ...b, daysLeft: daysFromNow(b.expiry_date) }))
        .filter(b => b.daysLeft !== null && b.daysLeft <= 30 && b.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft)

      // ── KPI: Receipts & Issues this month (SLEs) ────────────────────────
      const monthStart = startOfMonth(now)
      const monthStartStr = isoDate(monthStart)

      let receiptsThisMonth = 0
      let issuesThisMonth = 0
      let issues30d = 0

      const thirtyDaysAgoStr = isoDate(new Date(now.getTime() - 30 * 86400 * 1000))

      for (const sle of sles) {
        const qty = sle.actual_qty ?? 0
        const dt = sle.posting_datetime ?? ''
        if (dt >= monthStartStr) {
          if (qty > 0) receiptsThisMonth += qty
          else issuesThisMonth += Math.abs(qty)
        }
        if (dt >= thirtyDaysAgoStr && qty < 0) {
          issues30d += Math.abs(qty)
        }
      }

      // ── KPI: Turnover Rate ───────────────────────────────────────────────
      const avgStockValue = totalStockValue || 1
      const turnoverRate = (issues30d / avgStockValue) * 100

      // ── Monthly In/Out chart (last 6 months) ────────────────────────────
      const months = []
      for (let i = 5; i >= 0; i--) {
        const mStart = addMonths(now, -i)
        const mEnd = addMonths(now, -i + 1)
        months.push({
          label: monthLabel(mStart),
          startStr: isoDate(mStart),
          endStr: isoDate(mEnd),
          totalIn: 0,
          totalOut: 0,
        })
      }

      for (const sle of sles) {
        const qty = sle.actual_qty ?? 0
        const dt = (sle.posting_datetime ?? '').slice(0, 10)
        for (const m of months) {
          if (dt >= m.startStr && dt < m.endStr) {
            if (qty > 0) m.totalIn += qty
            else m.totalOut += Math.abs(qty)
            break
          }
        }
      }

      const inData = months.map(m => ({ label: m.label, value: Math.round(m.totalIn), color: 'var(--teal)' }))
      const outData = months.map(m => ({ label: m.label, value: Math.round(m.totalOut), color: 'var(--red)' }))

      // ── Top 8 Items by Stock Value ───────────────────────────────────────
      // Aggregate per item
      const itemValueMap = {}
      for (const bin of bins) {
        if (!bin.item_id) continue
        const v = (bin.actual_qty ?? 0) * (bin.valuation_rate ?? 0)
        itemValueMap[bin.item_id] = (itemValueMap[bin.item_id] ?? 0) + v
      }
      const topItems = Object.entries(itemValueMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([itemId, value]) => {
          const item = items.find(i => String(i.id) === itemId)
          return { label: item?.name?.slice(0, 12) ?? itemId, value: Math.round(value), color: 'var(--blue)' }
        })

      // ── Category Distribution (SegmentedBar) ────────────────────────────
      const catValueMap = {}
      for (const bin of bins) {
        if (!bin.item_id) continue
        const item = items.find(i => String(i.id) === bin.item_id)
        const cat = item?.category ?? 'Other'
        const v = (bin.actual_qty ?? 0) * (bin.valuation_rate ?? 0)
        catValueMap[cat] = (catValueMap[cat] ?? 0) + v
      }
      const catEntries = Object.entries(catValueMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
      const catSegs = catEntries.map(([label, value], i) => ({
        label,
        value: Math.round(value),
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }))

      // ── Commit state ────────────────────────────────────────────────────
      setKpis({
        totalSKUs,
        totalStockValue,
        belowReorderCount: belowReorderRows.length,
        activeReservations,
        expiringBatchesCount: expiringRows.length,
        receiptsThisMonth: Math.round(receiptsThisMonth),
        issuesThisMonth: Math.round(issuesThisMonth),
        turnoverRate,
      })
      setMonthlyChart({ inData, outData })
      setTopItemsData(topItems)
      setBelowReorder(belowReorderRows)
      setExpiringBatches(expiringRows)
      setCategorySegments(catSegs)
      setLastRefreshed(new Date())
      setAgeSecs(0)
    } catch (err) {
      console.error('InventoryDashboard load error:', err)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Auto-refresh ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadData()
    intervalRef.current = setInterval(loadData, REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [loadData])

  // ── Age counter (updates every second) ──────────────────────────────────

  useEffect(() => {
    ageIntervalRef.current = setInterval(() => {
      if (lastRefreshed) {
        const secs = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)
        setAgeSecs(secs)
      }
    }, 1000)
    return () => clearInterval(ageIntervalRef.current)
  }, [lastRefreshed])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Live stock overview · auto-refreshes every 2 min"
      >
        <button className="btn btn-sm" onClick={() => navigate('/module/inventory/stock-in')}>
          <span className="material-icons" style={{ fontSize: 16 }}>add_circle_outline</span>
          Stock In
        </button>
        <button className="btn btn-sm" onClick={() => navigate('/module/inventory/stock-transfers')}>
          <span className="material-icons" style={{ fontSize: 16 }}>swap_horiz</span>
          New Transfer
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => navigate('/module/inventory/forecast-reorder')}>
          <span className="material-icons" style={{ fontSize: 16 }}>insights</span>
          View Forecast
        </button>
      </PageHeader>

      {/* ── Last updated indicator ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, marginTop: -4 }}>
        <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
          {loading ? 'hourglass_empty' : 'check_circle'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {loading
            ? 'Loading…'
            : lastRefreshed
            ? `Last updated: ${fmtAge(ageSecs)}`
            : 'Not yet loaded'}
        </span>
        <button
          className="btn btn-xs"
          style={{ marginLeft: 4, fontSize: 11, padding: '2px 8px' }}
          onClick={loadData}
          disabled={loading}
        >
          <span className="material-icons" style={{ fontSize: 12 }}>refresh</span>
          Refresh
        </button>
      </div>

      {loading && !kpis ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ marginRight: 8 }}>hourglass_empty</span>
          Loading inventory data…
        </div>
      ) : (
        <>
          {/* ── Row 1: KPI Cards ─────────────────────────────────────────── */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <KPICard
              label="Total SKUs"
              value={fmtNum(kpis?.totalSKUs ?? 0, 0)}
              sub="active items"
              icon="inventory_2"
              color="teal"
            />
            <KPICard
              label="Stock Value"
              value={`$${fmtCurrency(kpis?.totalStockValue ?? 0)}`}
              sub="all warehouses"
              icon="account_balance_wallet"
              color="blue"
            />
            <KPICard
              label="Below Reorder"
              value={fmtNum(kpis?.belowReorderCount ?? 0, 0)}
              sub="items need attention"
              icon="warning"
              color={kpis?.belowReorderCount > 0 ? 'red' : ''}
              alert={kpis?.belowReorderCount > 0}
            />
            <KPICard
              label="Reservations"
              value={fmtNum(kpis?.activeReservations ?? 0, 0)}
              sub="active holds"
              icon="bookmark"
              color="purple"
            />
            <KPICard
              label="Expiring Batches"
              value={fmtNum(kpis?.expiringBatchesCount ?? 0, 0)}
              sub="within 30 days"
              icon="timer"
              color={kpis?.expiringBatchesCount > 0 ? 'yellow' : ''}
              alert={kpis?.expiringBatchesCount > 0}
            />
            <KPICard
              label="Receipts This Month"
              value={fmtNum(kpis?.receiptsThisMonth ?? 0, 0)}
              sub="units received"
              icon="move_to_inbox"
              color="green"
            />
            <KPICard
              label="Issues This Month"
              value={fmtNum(kpis?.issuesThisMonth ?? 0, 0)}
              sub="units issued"
              icon="outbox"
              color="gold"
            />
            <KPICard
              label="Turnover Rate"
              value={`${fmtNum(kpis?.turnoverRate ?? 0, 1)}%`}
              sub="30-day velocity"
              icon="speed"
              color="teal"
            />
          </div>

          {/* ── Row 2: Charts ────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Left: Stock In vs Out */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  Stock In vs Out (Last 6 Months)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>quantity units</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-dim)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--teal)' }} />
                    Stock In
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-dim)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)' }} />
                    Stock Out
                  </div>
                </div>
              </div>
              <ChartCard
                data={monthlyChart.inData}
                unit=" units"
                height={100}
                style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none' }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                ↑ Receipts
              </div>
              <ChartCard
                data={monthlyChart.outData}
                unit=" units"
                height={80}
                style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', marginTop: 8 }}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
                ↓ Issues
              </div>
            </div>

            {/* Right: Top 8 Items by Stock Value */}
            <ChartCard
              title="Top 8 Items by Stock Value"
              subtitle="bin qty × valuation rate"
              data={topItemsData.length ? topItemsData : [{ label: 'No data', value: 0, color: 'var(--border)' }]}
              unit=""
              height={200}
            />
          </div>

          {/* ── Row 3: Three panels ──────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

            {/* Panel A: Items Below Reorder */}
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Items Below Reorder</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>requires replenishment</div>
                </div>
                <span className="material-icons" style={{ color: 'var(--red)', fontSize: 20 }}>warning</span>
              </div>

              {belowReorder.length === 0 ? (
                <EmptyState icon="check_circle" message="All items above reorder level" />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 600 }}>Item</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 600 }}>On Hand</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 600 }}>Reorder</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 600 }}>Shortage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {belowReorder.slice(0, 8).map((row) => (
                        <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 6px', color: 'var(--text)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.itemName}
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                            {fmtNum(row.onHand, 1)}
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                            {fmtNum(row.reorderLevel, 1)}
                          </td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }}>
                            {fmtNum(row.shortage, 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {belowReorder.length > 0 && (
                <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11 }}
                    onClick={() => navigate('/module/inventory/forecast-reorder')}
                  >
                    <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                    View All ({belowReorder.length})
                  </button>
                </div>
              )}
            </div>

            {/* Panel B: Expiring Batches */}
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Expiring Batches</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>next 30 days</div>
                </div>
                <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 20 }}>timer</span>
              </div>

              {expiringBatches.length === 0 ? (
                <EmptyState icon="check_circle" message="No batches expiring soon" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {expiringBatches.slice(0, 6).map((b) => {
                    const daysColor = b.daysLeft < 7 ? 'var(--red)' : 'var(--yellow)'
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'var(--surface2)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.item_name ?? '—'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 8 }}>
                            <span>Batch: {b.batch_no ?? b.id?.slice(0, 8) ?? '—'}</span>
                            <span>Qty: {fmtNum(b.qty_available ?? 0, 1)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                            Exp: {b.expiry_date ?? '—'}
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                        }}>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: daysColor,
                            fontFamily: 'var(--mono)',
                          }}>
                            {b.daysLeft}d
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>left</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={() => navigate('/module/inventory/batch-serials')}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                  Manage Batches
                </button>
              </div>
            </div>

            {/* Panel C: Category Distribution */}
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Category Distribution</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>by stock value</div>
                </div>
                <span className="material-icons" style={{ color: 'var(--blue)', fontSize: 20 }}>pie_chart</span>
              </div>

              {categorySegments.length === 0 ? (
                <EmptyState icon="pie_chart" message="No category data available" />
              ) : (
                <>
                  <SegmentedBar
                    segments={categorySegments}
                    height={12}
                    radius={6}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {categorySegments.map((seg, i) => {
                      const total = categorySegments.reduce((s, c) => s + c.value, 0) || 1
                      const pct = ((seg.value / total) * 100).toFixed(1)
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 8, alignItems: 'center' }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {seg.label}
                          </span>
                          <StatBar
                            value={seg.value}
                            max={categorySegments[0]?.value || 1}
                            color={seg.color}
                            height={4}
                            style={{ width: 60 }}
                          />
                          <div style={{ textAlign: 'right', minWidth: 54 }}>
                            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600 }}>
                              ${fmtCurrency(seg.value)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{pct}%</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}
