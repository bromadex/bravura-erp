// src/pages/Inventory/ForecastReorder.jsx
// Phase 17 — Forecast & Reorder Intelligence
// Client-side consumption analytics with urgency tiers, reorder management,
// and one-click Material Request creation for at-risk inventory.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import {
  PageHeader, KPICard, EmptyState, ModalDialog, ModalActions,
} from '../../components/ui'

// ── Constants ────────────────────────────────────────────────────────────────

const CONSUMPTION_DAYS = 90
const REORDER_SUPPLY_DAYS = 30
const DEFAULT_LEAD_TIME = 14
const MR_TYPES = ['Purchase', 'Transfer', 'Production']

// Urgency tier definitions (order matters for sort priority)
const URGENCY = {
  Critical:     { order: 0, color: 'var(--red)',      badge: 'badge-red',    icon: 'error'        },
  Warning:      { order: 1, color: 'var(--yellow)',   badge: 'badge-yellow', icon: 'warning'      },
  Healthy:      { order: 2, color: 'var(--green)',    badge: 'badge-green',  icon: 'check_circle' },
  'No Movement':{ order: 3, color: 'var(--text-dim)', badge: 'badge-dim',    icon: 'remove_circle' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeUrgency(row) {
  const { daysToStockout, actualQty, dailyRate, suggestedReorderPoint } = row
  if (actualQty <= 0 || (daysToStockout !== null && daysToStockout <= 7)) return 'Critical'
  if (dailyRate === 0 && actualQty > 0) return 'No Movement'
  if (daysToStockout !== null && daysToStockout <= 30) return 'Warning'
  if (actualQty <= suggestedReorderPoint) return 'Warning'
  return 'Healthy'
}

function makeMrNumber() {
  return `MR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
}

function fmtDays(days) {
  if (days === null || days === undefined) return '—'
  if (days === Infinity || isNaN(days)) return '—'
  return `${fmtNum(days, 1)}d`
}

function fmtRate(rate) {
  if (!rate || rate === 0) return '—'
  return `${fmtNum(rate, 3)}/day`
}

// ── Consumption engine ───────────────────────────────────────────────────────

function buildForecastRows(items, bins, sles, reorderLevels) {
  const rows = []

  for (const bin of bins) {
    const item = items.find(i => i.id === bin.item_id)
    if (!item) continue

    const warehouseId = bin.warehouse_id
    const warehouseName = bin.warehouses?.name ?? warehouseId ?? 'Unknown'
    const warehouseCode = bin.warehouses?.code ?? ''

    // Filter SLEs for this item+warehouse pair over the consumption window
    const slesForPair = sles.filter(s =>
      s.item_id === bin.item_id &&
      s.warehouse_id === warehouseId &&
      s.actual_qty < 0 &&
      !['StockReconciliation', 'OpeningStock'].includes(s.voucher_type)
    )

    const totalOut = slesForPair.reduce((sum, r) => sum + Math.abs(r.actual_qty), 0)
    const dailyRate = totalOut / CONSUMPTION_DAYS

    const actualQty = bin.actual_qty ?? 0
    const daysToStockout = dailyRate > 0 ? actualQty / dailyRate : null

    const leadTimeDays = item.lead_time_days || DEFAULT_LEAD_TIME
    const safetyStock = item.safety_stock || 0
    const suggestedReorderPoint = leadTimeDays * dailyRate + safetyStock
    const suggestedReorderQty = Math.max(dailyRate * REORDER_SUPPLY_DAYS, item.threshold || 5)

    // Current reorder level for this item+warehouse
    const existingRL = reorderLevels.find(
      rl => rl.item_id === item.id && rl.warehouse_id === warehouseId
    )

    const row = {
      itemId:               item.id,
      itemName:             item.name,
      category:             item.category ?? '—',
      unit:                 item.unit ?? 'pcs',
      cost:                 item.cost ?? 0,
      warehouseId,
      warehouseName,
      warehouseCode,
      actualQty,
      projectedQty:         bin.projected_qty ?? actualQty,
      reservedQty:          bin.reserved_qty ?? 0,
      dailyRate,
      totalOutLast90:       totalOut,
      daysToStockout:       daysToStockout !== null ? Math.round(daysToStockout * 10) / 10 : null,
      suggestedReorderPoint: Math.round(suggestedReorderPoint * 100) / 100,
      suggestedReorderQty:  Math.round(suggestedReorderQty * 100) / 100,
      leadTimeDays,
      safetyStock,
      currentReorderLevel:  existingRL?.reorder_level ?? null,
      currentReorderQty:    existingRL?.reorder_qty ?? null,
      currentMrType:        existingRL?.material_request_type ?? 'Purchase',
      reorderLevelId:       existingRL?.id ?? null,
    }

    row.urgency = computeUrgency(row)
    rows.push(row)
  }

  // Sort: urgency tier order first, then daysToStockout ascending (nulls last)
  rows.sort((a, b) => {
    const urgencyDiff = URGENCY[a.urgency].order - URGENCY[b.urgency].order
    if (urgencyDiff !== 0) return urgencyDiff
    if (a.daysToStockout === null && b.daysToStockout === null) return 0
    if (a.daysToStockout === null) return 1
    if (b.daysToStockout === null) return -1
    return a.daysToStockout - b.daysToStockout
  })

  return rows
}

// ── Set Reorder Level Modal ───────────────────────────────────────────────────

function SetReorderModal({ open, onClose, row, onSaved }) {
  const [reorderLevel, setReorderLevel] = useState('')
  const [reorderQty,   setReorderQty]   = useState('')
  const [mrType,       setMrType]       = useState('Purchase')
  const [saving,       setSaving]       = useState(false)

  // Pre-fill when row changes
  useEffect(() => {
    if (!row) return
    setReorderLevel(
      row.currentReorderLevel !== null
        ? String(row.currentReorderLevel)
        : String(row.suggestedReorderPoint)
    )
    setReorderQty(
      row.currentReorderQty !== null
        ? String(row.currentReorderQty)
        : String(row.suggestedReorderQty)
    )
    setMrType(row.currentMrType ?? 'Purchase')
  }, [row])

  const handleSave = useCallback(async () => {
    if (!row) return
    const lvl = parseFloat(reorderLevel)
    const qty = parseFloat(reorderQty)
    if (isNaN(lvl) || lvl < 0) { toast.error('Enter a valid reorder level'); return }
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid reorder qty'); return }

    setSaving(true)
    try {
      const payload = {
        item_id:               row.itemId,
        warehouse_id:          row.warehouseId,
        reorder_level:         lvl,
        reorder_qty:           qty,
        material_request_type: mrType,
      }

      let error
      if (row.reorderLevelId) {
        // Update existing
        ;({ error } = await supabase
          .from('item_reorder_levels')
          .update(payload)
          .eq('id', row.reorderLevelId))
      } else {
        // Insert new
        ;({ error } = await supabase
          .from('item_reorder_levels')
          .insert(payload))
      }

      if (error) throw error
      toast.success(`Reorder level saved for ${row.itemName}`)
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }, [row, reorderLevel, reorderQty, mrType, onSaved, onClose])

  if (!row) return null

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`Set Reorder Level · ${row.itemName}`}
      size="sm"
    >
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Context info */}
        <div style={{
          background: 'var(--surface2)', borderRadius: 6, padding: '10px 14px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
          fontSize: 12,
        }}>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Warehouse:</span>{' '}
            <strong>{row.warehouseName}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>On Hand:</span>{' '}
            <strong style={{ fontFamily: 'var(--mono)' }}>{fmtNum(row.actualQty)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Daily Rate:</span>{' '}
            <strong style={{ fontFamily: 'var(--mono)' }}>{fmtRate(row.dailyRate)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Days Cover:</span>{' '}
            <strong
              style={{
                fontFamily: 'var(--mono)',
                color: row.daysToStockout !== null && row.daysToStockout <= 7
                  ? 'var(--red)'
                  : row.daysToStockout !== null && row.daysToStockout <= 30
                  ? 'var(--yellow)'
                  : 'var(--text)',
              }}
            >
              {fmtDays(row.daysToStockout)}
            </strong>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <span style={{ color: 'var(--text-dim)' }}>Suggested Reorder Point:</span>{' '}
            <strong style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
              {fmtNum(row.suggestedReorderPoint)} {row.unit}
            </strong>
            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
              {' '}(lead {row.leadTimeDays}d × {fmtNum(row.dailyRate, 3)}/day + {fmtNum(row.safetyStock)} safety)
            </span>
          </div>
        </div>

        {/* Fields */}
        <div>
          <label className="form-label">
            Reorder Level ({row.unit})
          </label>
          <input
            type="number"
            className="form-control"
            min="0"
            step="any"
            value={reorderLevel}
            onChange={e => setReorderLevel(e.target.value)}
            placeholder="0"
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Trigger a reorder when stock falls to or below this quantity.
          </div>
        </div>

        <div>
          <label className="form-label">
            Reorder Qty ({row.unit})
          </label>
          <input
            type="number"
            className="form-control"
            min="1"
            step="any"
            value={reorderQty}
            onChange={e => setReorderQty(e.target.value)}
            placeholder="0"
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Suggested: {fmtNum(row.suggestedReorderQty)} ({REORDER_SUPPLY_DAYS}-day supply)
          </div>
        </div>

        <div>
          <label className="form-label">Material Request Type</label>
          <select
            className="form-control"
            value={mrType}
            onChange={e => setMrType(e.target.value)}
          >
            {MR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving
            ? <><span className="material-icons md-18" style={{ animation: 'spin 1s linear infinite' }}>sync</span> Saving…</>
            : <><span className="material-icons md-18">save</span> Save Reorder Level</>
          }
        </button>
      </ModalActions>
    </ModalDialog>
  )
}

// ── Urgency badge ─────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY[urgency] ?? URGENCY.Healthy
  return (
    <span
      className={`badge ${cfg.badge}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <span className="material-icons" style={{ fontSize: 11 }}>{cfg.icon}</span>
      {urgency}
    </span>
  )
}

// ── Inline Days-to-stockout bar ───────────────────────────────────────────────

function CoverageBar({ days, maxDays = 90 }) {
  if (days === null) return <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
  const pct = Math.min(100, (days / maxDays) * 100)
  const color = days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--yellow)' : 'var(--green)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>
        {fmtDays(days)}
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, width: 64 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ForecastReorder() {
  // ── State ──────────────────────────────────────────────────────
  const [items,         setItems]         = useState([])
  const [bins,          setBins]          = useState([])
  const [warehouses,    setWarehouses]    = useState([])
  const [reorderLevels, setReorderLevels] = useState([])
  const [sles,          setSles]          = useState([])
  const [loading,       setLoading]       = useState(true)

  // Filters
  const [urgencyFilter, setUrgencyFilter] = useState('All')
  const [whFilter,      setWhFilter]      = useState('ALL')
  const [catFilter,     setCatFilter]     = useState('ALL')
  const [search,        setSearch]        = useState('')

  // Modals
  const [reorderRow,    setReorderRow]    = useState(null)   // row for Set Reorder modal
  const [mrCreating,    setMrCreating]    = useState(null)   // row for which MR is being created

  // ── Data loading ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const cutoff = new Date(Date.now() - CONSUMPTION_DAYS * 86400000).toISOString()
      const [
        { data: itemsData,   error: e1 },
        { data: binsData,    error: e2 },
        { data: whData,      error: e3 },
        { data: rlData,      error: e4 },
        { data: slesData,    error: e5 },
      ] = await Promise.all([
        supabase
          .from('items')
          .select('id, name, category, unit, cost, balance, safety_stock, lead_time_days, default_warehouse_id, threshold'),
        supabase
          .from('bins')
          .select('*, warehouses(name, code)'),
        supabase
          .from('warehouses')
          .select('id, name, code')
          .eq('is_active', true),
        supabase
          .from('item_reorder_levels')
          .select('*'),
        supabase
          .from('stock_ledger_entries')
          .select('item_id, warehouse_id, actual_qty, posting_datetime, voucher_type')
          .eq('is_cancelled', false)
          .gte('posting_datetime', cutoff),
      ])

      const firstError = e1 || e2 || e3 || e4 || e5
      if (firstError) throw firstError

      setItems(itemsData         || [])
      setBins(binsData           || [])
      setWarehouses(whData       || [])
      setReorderLevels(rlData    || [])
      setSles(slesData           || [])
    } catch (err) {
      toast.error('Failed to load forecast data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Computed rows ──────────────────────────────────────────────
  const allRows = useMemo(
    () => buildForecastRows(items, bins, sles, reorderLevels),
    [items, bins, sles, reorderLevels]
  )

  // ── Filter options ─────────────────────────────────────────────
  const categories = useMemo(
    () => [...new Set(allRows.map(r => r.category).filter(c => c && c !== '—'))].sort(),
    [allRows]
  )

  // ── Filtered rows ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (urgencyFilter !== 'All' && r.urgency !== urgencyFilter) return false
      if (whFilter !== 'ALL' && r.warehouseId !== whFilter) return false
      if (catFilter !== 'ALL' && r.category !== catFilter) return false
      if (search && !r.itemName.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [allRows, urgencyFilter, whFilter, catFilter, search])

  // ── KPIs ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const critical   = allRows.filter(r => r.urgency === 'Critical').length
    const warning    = allRows.filter(r => r.urgency === 'Warning').length
    const activeDays = allRows.filter(r => r.daysToStockout !== null)
    const avgCover   = activeDays.length
      ? activeDays.reduce((s, r) => s + r.daysToStockout, 0) / activeDays.length
      : null
    return {
      critical,
      warning,
      avgCover,
      total: allRows.length,
    }
  }, [allRows])

  // ── Create Material Request ────────────────────────────────────
  const handleCreateMR = useCallback(async (row) => {
    if (mrCreating === row.itemId + row.warehouseId) return
    setMrCreating(row.itemId + row.warehouseId)
    try {
      const mrNumber = makeMrNumber()
      const today = new Date().toISOString().split('T')[0]
      const requiredBy = new Date(Date.now() + (row.leadTimeDays + 7) * 86400000)
        .toISOString().split('T')[0]

      // Insert material request header
      const { data: mrData, error: mrErr } = await supabase
        .from('material_requests')
        .insert({
          mr_number:        mrNumber,
          type:             row.currentMrType ?? 'Purchase',
          status:           'Draft',
          transaction_date: today,
          required_by_date: requiredBy,
          set_warehouse_id: row.warehouseId,
          notes: `Auto-generated from Forecast & Reorder Intelligence. ` +
                 `Urgency: ${row.urgency}. ` +
                 `Days to stockout: ${row.daysToStockout !== null ? fmtDays(row.daysToStockout) : 'N/A'}. ` +
                 `Daily consumption: ${fmtRate(row.dailyRate)}.`,
        })
        .select('id')
        .single()

      if (mrErr) throw mrErr

      // Insert material request line item
      const { error: itemErr } = await supabase
        .from('material_request_items')
        .insert({
          mr_id:        mrData.id,
          item_id:      row.itemId,
          item_name:    row.itemName,
          qty:          row.suggestedReorderQty,
          unit:         row.unit,
          warehouse_id: row.warehouseId,
          rate:         row.cost ?? 0,
          schedule_date: requiredBy,
          notes: `Reorder point: ${fmtNum(row.suggestedReorderPoint)} ${row.unit}. ` +
                 `On hand: ${fmtNum(row.actualQty)} ${row.unit}.`,
        })

      if (itemErr) throw itemErr

      toast.success(
        `Material Request ${mrNumber} created for ${row.itemName}`,
        { duration: 5000 }
      )
    } catch (err) {
      toast.error('Failed to create MR: ' + err.message)
    } finally {
      setMrCreating(null)
    }
  }, [mrCreating])

  // ── Export ─────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!filtered.length) { toast.error('Nothing to export'); return }
    exportXLSX(
      filtered.map(r => ({
        Item:                   r.itemName,
        Category:               r.category,
        Warehouse:              r.warehouseName,
        Unit:                   r.unit,
        'On Hand':              +r.actualQty.toFixed(4),
        'Daily Use (avg 90d)':  +r.dailyRate.toFixed(6),
        'Total Out (90d)':      +r.totalOutLast90.toFixed(4),
        'Days Cover':           r.daysToStockout ?? '',
        'Suggested Reorder Pt': +r.suggestedReorderPoint.toFixed(2),
        'Suggested Reorder Qty':+r.suggestedReorderQty.toFixed(2),
        'Current Reorder Level':r.currentReorderLevel ?? '',
        'Current Reorder Qty':  r.currentReorderQty ?? '',
        'Lead Time (days)':     r.leadTimeDays,
        'Safety Stock':         r.safetyStock,
        'Urgency':              r.urgency,
      })),
      `ForecastReorder_${new Date().toISOString().split('T')[0]}`,
      'Forecast & Reorder'
    )
    toast.success('Exported')
  }, [filtered])

  // ── Reorder modal saved callback ───────────────────────────────
  const handleReorderSaved = useCallback(() => {
    loadData()
  }, [loadData])

  // ── Render ─────────────────────────────────────────────────────
  const hasFilters = urgencyFilter !== 'All' || whFilter !== 'ALL' || catFilter !== 'ALL' || search

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Forecast & Reorder Intelligence"
        subtitle={`Client-side consumption analysis · Last ${CONSUMPTION_DAYS} days · ${allRows.length} item-warehouse pairs tracked`}
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading || !filtered.length}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          <span className="material-icons" style={loading ? { animation: 'spin 1s linear infinite' } : {}}>refresh</span>
          Refresh
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="error"
          label="Critical Items"
          value={kpi.critical}
          sub="≤ 7 days cover or out of stock"
          color={kpi.critical > 0 ? 'red' : 'green'}
          alert={kpi.critical > 0}
          onClick={() => setUrgencyFilter(urgencyFilter === 'Critical' ? 'All' : 'Critical')}
        />
        <KPICard
          icon="warning"
          label="Reorder Needed"
          value={kpi.warning}
          sub="≤ 30 days cover or below reorder pt"
          color={kpi.warning > 0 ? 'yellow' : 'green'}
          onClick={() => setUrgencyFilter(urgencyFilter === 'Warning' ? 'All' : 'Warning')}
        />
        <KPICard
          icon="schedule"
          label="Avg Days Coverage"
          value={kpi.avgCover !== null ? `${fmtNum(kpi.avgCover, 1)}d` : '—'}
          sub="across items with active consumption"
          color={
            kpi.avgCover === null ? ''
            : kpi.avgCover <= 14 ? 'red'
            : kpi.avgCover <= 30 ? 'yellow'
            : 'teal'
          }
        />
        <KPICard
          icon="inventory_2"
          label="Total Items Tracked"
          value={kpi.total}
          sub="item-warehouse pairs with bin records"
          color="blue"
        />
      </div>

      {/* Urgency distribution bar */}
      {!loading && allRows.length > 0 && (
        <UrgencyDistributionBar rows={allRows} />
      )}

      {/* Filter bar */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Urgency chips */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['All', 'Critical', 'Warning', 'Healthy', 'No Movement'].map(u => {
              const active = urgencyFilter === u
              const cfg = u !== 'All' ? URGENCY[u] : null
              return (
                <button
                  key={u}
                  onClick={() => setUrgencyFilter(u)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: `1.5px solid ${active && cfg ? cfg.color : 'var(--border)'}`,
                    background: active ? (cfg ? cfg.color : 'var(--gold)') : 'var(--surface)',
                    color: active ? (cfg || u === 'All' ? '#fff' : 'var(--text)') : 'var(--text-dim)',
                    fontWeight: active ? 700 : 400,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all .15s',
                  }}
                >
                  {cfg && (
                    <span className="material-icons" style={{ fontSize: 12 }}>{cfg.icon}</span>
                  )}
                  {u}
                  {u !== 'All' && (
                    <span style={{
                      background: 'rgba(0,0,0,0.15)',
                      borderRadius: 10,
                      padding: '0 5px',
                      fontSize: 10,
                    }}>
                      {allRows.filter(r => r.urgency === u).length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <input
            className="form-control"
            placeholder="Search item…"
            style={{ maxWidth: 200 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Warehouse select */}
          <select
            className="form-control"
            style={{ width: 170 }}
            value={whFilter}
            onChange={e => setWhFilter(e.target.value)}
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {/* Category select */}
          <select
            className="form-control"
            style={{ width: 150 }}
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Clear */}
          {hasFilters && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setWhFilter('ALL'); setCatFilter('ALL'); setUrgencyFilter('All') }}
              title="Clear filters"
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {allRows.length} item-warehouse pairs
          {hasFilters && ' · Filters active'}
          {' · '}Sorted by urgency then days-to-stockout (ascending)
        </div>
      </div>

      {/* Main table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right' }}>Daily Use</th>
                <th style={{ textAlign: 'center' }}>Days Cover</th>
                <th style={{ textAlign: 'right' }}>Reorder Point</th>
                <th style={{ textAlign: 'right' }}>Suggested Qty</th>
                <th style={{ textAlign: 'right' }}>Current RL</th>
                <th>Urgency</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: 64, color: 'var(--text-dim)' }}>
                    <span
                      className="material-icons"
                      style={{ fontSize: 32, display: 'block', marginBottom: 10, opacity: 0.4, animation: 'spin 1.2s linear infinite' }}
                    >
                      sync
                    </span>
                    Computing forecast data…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="12">
                    <EmptyState
                      icon="bar_chart"
                      message={hasFilters ? 'No items match your filters' : 'No bin data found — stock some items first'}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const urgCfg = URGENCY[row.urgency]
                  const isCritical = row.urgency === 'Critical'
                  const isWarning  = row.urgency === 'Warning'
                  const creatingThis = mrCreating === row.itemId + row.warehouseId
                  const belowReorder = row.currentReorderLevel !== null &&
                    row.actualQty <= row.currentReorderLevel

                  return (
                    <tr
                      key={`${row.itemId}-${row.warehouseId}`}
                      style={{
                        background: isCritical
                          ? 'rgba(239,68,68,0.04)'
                          : isWarning
                          ? 'rgba(234,179,8,0.03)'
                          : '',
                        borderLeft: isCritical
                          ? '3px solid var(--red)'
                          : isWarning
                          ? '3px solid var(--yellow)'
                          : '3px solid transparent',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--surface2)'
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = isCritical
                          ? 'rgba(239,68,68,0.04)'
                          : isWarning
                          ? 'rgba(234,179,8,0.03)'
                          : ''
                      }}
                    >
                      {/* # */}
                      <td style={{ color: 'var(--text-dim)', fontSize: 11, width: 32 }}>{idx + 1}</td>

                      {/* Item */}
                      <td style={{ minWidth: 160 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{row.itemName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          {row.unit}
                          {row.safetyStock > 0 && (
                            <span style={{ marginLeft: 6, color: 'var(--blue)' }}>
                              Safety: {fmtNum(row.safetyStock)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>
                          {row.category}
                        </span>
                      </td>

                      {/* Warehouse */}
                      <td style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 500 }}>{row.warehouseName}</div>
                        {row.warehouseCode && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {row.warehouseCode}
                          </div>
                        )}
                      </td>

                      {/* On Hand */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{
                          fontFamily: 'var(--mono)',
                          fontWeight: 700,
                          fontSize: 13,
                          color: row.actualQty <= 0
                            ? 'var(--red)'
                            : belowReorder
                            ? 'var(--yellow)'
                            : 'var(--text)',
                        }}>
                          {fmtNum(row.actualQty)}
                        </div>
                        {row.reservedQty > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                            {fmtNum(row.reservedQty)} reserved
                          </div>
                        )}
                      </td>

                      {/* Daily Use */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                          {row.dailyRate > 0 ? fmtNum(row.dailyRate, 3) : (
                            <span style={{ color: 'var(--text-dim)' }}>0</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                          {row.totalOutLast90 > 0
                            ? `${fmtNum(row.totalOutLast90)} in 90d`
                            : 'No movement'}
                        </div>
                      </td>

                      {/* Days Cover */}
                      <td style={{ textAlign: 'center' }}>
                        <CoverageBar days={row.daysToStockout} />
                      </td>

                      {/* Reorder Point (suggested) */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {row.dailyRate > 0 ? fmtNum(row.suggestedReorderPoint) : '—'}
                        </div>
                        {row.dailyRate > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                            {row.leadTimeDays}d lead + {fmtNum(row.safetyStock)} safety
                          </div>
                        )}
                      </td>

                      {/* Suggested Reorder Qty */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--blue)' }}>
                          {fmtNum(row.suggestedReorderQty)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                          {REORDER_SUPPLY_DAYS}d supply
                        </div>
                      </td>

                      {/* Current Reorder Level */}
                      <td style={{ textAlign: 'right' }}>
                        {row.currentReorderLevel !== null ? (
                          <>
                            <div style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 12,
                              color: belowReorder ? 'var(--red)' : 'var(--teal)',
                              fontWeight: belowReorder ? 700 : 400,
                            }}>
                              {fmtNum(row.currentReorderLevel)}
                            </div>
                            {row.currentReorderQty !== null && (
                              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                RQ: {fmtNum(row.currentReorderQty)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>not set</span>
                        )}
                      </td>

                      {/* Urgency */}
                      <td>
                        <UrgencyBadge urgency={row.urgency} />
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {/* Update Reorder Level */}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setReorderRow(row)}
                            title="Set reorder level and qty"
                            style={{ fontSize: 11 }}
                          >
                            <span className="material-icons" style={{ fontSize: 13 }}>tune</span>
                            Set RL
                          </button>

                          {/* Create MR — only on Critical / Warning */}
                          {(isCritical || isWarning) && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleCreateMR(row)}
                              disabled={creatingThis}
                              title={`Create Draft Material Request for ${row.itemName}`}
                              style={{ fontSize: 11 }}
                            >
                              {creatingThis ? (
                                <>
                                  <span className="material-icons" style={{ fontSize: 13, animation: 'spin 1s linear infinite' }}>sync</span>
                                  Creating…
                                </>
                              ) : (
                                <>
                                  <span className="material-icons" style={{ fontSize: 13 }}>add_shopping_cart</span>
                                  Create MR
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Footer totals */}
            {!loading && filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td colSpan="4" style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px' }}>
                    Totals ({filtered.length} rows)
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {fmtNum(filtered.reduce((s, r) => s + r.actualQty, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                    {fmtNum(filtered.reduce((s, r) => s + r.dailyRate, 0), 3)}/day
                  </td>
                  <td colSpan="6" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Set Reorder Level Modal */}
      <SetReorderModal
        open={!!reorderRow}
        onClose={() => setReorderRow(null)}
        row={reorderRow}
        onSaved={handleReorderSaved}
      />
    </div>
  )
}

// ── Urgency distribution bar (standalone sub-component) ───────────────────────

function UrgencyDistributionBar({ rows }) {
  const counts = {
    Critical:      rows.filter(r => r.urgency === 'Critical').length,
    Warning:       rows.filter(r => r.urgency === 'Warning').length,
    Healthy:       rows.filter(r => r.urgency === 'Healthy').length,
    'No Movement': rows.filter(r => r.urgency === 'No Movement').length,
  }
  const total = rows.length || 1

  return (
    <div style={{
      background: 'var(--surface2)',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
      }}>
        Urgency Distribution — {rows.length} tracked pairs
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {Object.entries(counts).map(([tier, count]) => {
          const pct = (count / total) * 100
          return pct > 0 ? (
            <div
              key={tier}
              title={`${tier}: ${count} (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`,
                height: '100%',
                background: URGENCY[tier].color,
                transition: 'width .4s',
                cursor: 'default',
              }}
            />
          ) : null
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([tier, count]) => {
          const pct = ((count / total) * 100).toFixed(1)
          const cfg = URGENCY[tier]
          return (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span className="material-icons" style={{ fontSize: 13, color: cfg.color }}>{cfg.icon}</span>
              <span style={{ color: 'var(--text-dim)' }}>{tier}:</span>
              <span style={{ fontWeight: 700, color: cfg.color }}>{count}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({pct}%)</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
