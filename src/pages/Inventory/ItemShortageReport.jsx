// src/pages/Inventory/ItemShortageReport.jsx
// Items below or near reorder level with urgency tier and one-click MR creation.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'

// ── Urgency helpers ───────────────────────────────────────────────────────
function computeUrgency(actualQty, reorderLevel) {
  if (actualQty === 0)                          return 'Critical'
  if (actualQty < reorderLevel)                 return 'Low Stock'
  if (actualQty < reorderLevel * 1.25)          return 'Near Reorder'
  return null // should not reach (only show shortfall rows)
}

const URGENCY_STYLE = {
  'Critical':    { bg: 'var(--red)',    color: 'var(--surface)', kpiColor: 'red'  },
  'Low Stock':   { bg: 'var(--yellow)', color: 'var(--surface)', kpiColor: 'yellow' },
  'Near Reorder':{ bg: 'var(--gold)',   color: 'var(--surface)', kpiColor: 'gold' },
}

function UrgencyBadge({ tier }) {
  const s = URGENCY_STYLE[tier] || { bg: 'var(--border)', color: 'var(--text)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: s.bg,
      color: s.color,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {tier}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function ItemShortageReport() {
  const [items,         setItems]         = useState([])
  const [bins,          setBins]          = useState([])
  const [reorderLevels, setReorderLevels] = useState([])
  const [warehouses,    setWarehouses]    = useState([])
  const [loading,       setLoading]       = useState(true)
  const [raisingMR,     setRaisingMR]     = useState(null) // item_id being MR'd

  // Filters
  const [whFilter,      setWhFilter]      = useState('ALL')
  const [urgencyFilter, setUrgencyFilter] = useState('ALL')
  const [search,        setSearch]        = useState('')

  // ── Load ────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const [
        { data: iData, error: iErr },
        { data: bData, error: bErr },
        { data: rlData, error: rlErr },
        { data: wData, error: wErr },
      ] = await Promise.all([
        supabase.from('items').select('id, name, unit, category, item_code'),
        supabase.from('bins').select('item_id, warehouse_id, actual_qty, reserved_qty'),
        supabase.from('item_reorder_levels').select('id, item_id, warehouse_id, reorder_level, reorder_qty, material_request_type'),
        supabase.from('warehouses').select('id, name'),
      ])
      if (iErr) throw iErr
      if (bErr) throw bErr
      if (rlErr) throw rlErr
      if (wErr) throw wErr
      setItems(iData || [])
      setBins(bData || [])
      setReorderLevels(rlData || [])
      setWarehouses(wData || [])
    } catch (err) {
      toast.error('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Derived rows ─────────────────────────────────────────────────────────
  const itemMap = useMemo(() => {
    const m = {}
    items.forEach(i => { m[i.id] = i })
    return m
  }, [items])

  const warehouseMap = useMemo(() => {
    const m = {}
    warehouses.forEach(w => { m[w.id] = w.name })
    return m
  }, [warehouses])

  // Build a quick bin lookup keyed item_id::warehouse_id
  const binMap = useMemo(() => {
    const m = {}
    bins.forEach(b => { m[`${b.item_id}::${b.warehouse_id}`] = b })
    return m
  }, [bins])

  // Items that have no reorder level configured at all
  const noReorderLevelCount = useMemo(() => {
    const idsWithLevel = new Set(reorderLevels.map(r => r.item_id))
    return items.filter(i => !idsWithLevel.has(i.id)).length
  }, [items, reorderLevels])

  // Build shortage rows from item_reorder_levels
  const allShortageRows = useMemo(() => {
    const rows = []
    for (const rl of reorderLevels) {
      const item = itemMap[rl.item_id]
      if (!item) continue

      const bin = binMap[`${rl.item_id}::${rl.warehouse_id}`]
      const actualQty  = Number(bin?.actual_qty  || 0)
      const reorderLvl = Number(rl.reorder_level || 0)

      // Only show rows where there's a shortage or zero stock
      const hasShortfall = actualQty === 0 || actualQty < reorderLvl * 1.25
      if (!hasShortfall) continue

      const shortfall = Math.max(0, reorderLvl - actualQty)
      const urgency   = computeUrgency(actualQty, reorderLvl)
      if (!urgency) continue

      rows.push({
        reorderLevelId: rl.id,
        itemId:         rl.item_id,
        itemCode:       item.item_code || '—',
        itemName:       item.name,
        category:       item.category || '—',
        unit:           item.unit || 'pcs',
        warehouseId:    rl.warehouse_id,
        warehouseName:  warehouseMap[rl.warehouse_id] || rl.warehouse_id,
        reorderLevel:   reorderLvl,
        reorderQty:     Number(rl.reorder_qty || 0),
        mrType:         rl.material_request_type || 'Purchase',
        actualQty,
        shortfall,
        urgency,
      })
    }
    // Sort: Critical first, then Low Stock, then Near Reorder; within tier sort by shortfall desc
    const order = { Critical: 0, 'Low Stock': 1, 'Near Reorder': 2 }
    return rows.sort((a, b) =>
      (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9) || b.shortfall - a.shortfall
    )
  }, [reorderLevels, itemMap, binMap, warehouseMap])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allShortageRows.filter(r => {
      if (whFilter      !== 'ALL' && r.warehouseId !== whFilter) return false
      if (urgencyFilter !== 'ALL' && r.urgency     !== urgencyFilter) return false
      if (q && !r.itemName.toLowerCase().includes(q) && !r.itemCode.toLowerCase().includes(q)) return false
      return true
    })
  }, [allShortageRows, whFilter, urgencyFilter, search])

  // KPIs
  const criticalCount    = useMemo(() => allShortageRows.filter(r => r.urgency === 'Critical').length,     [allShortageRows])
  const lowStockCount    = useMemo(() => allShortageRows.filter(r => r.urgency === 'Low Stock').length,    [allShortageRows])
  const nearReorderCount = useMemo(() => allShortageRows.filter(r => r.urgency === 'Near Reorder').length, [allShortageRows])

  // ── Raise MR ─────────────────────────────────────────────────────────────
  async function handleRaiseMR(row) {
    setRaisingMR(row.itemId)
    try {
      // Resolve series number
      let mrNumber
      const { data: snData } = await supabase.rpc('fn_next_series_number', { p_series_key: 'material_requests' })
      mrNumber = snData || `MR-${Date.now()}`

      // Insert material_request header
      const { data: mrData, error: mrErr } = await supabase
        .from('material_requests')
        .insert({
          mr_number,
          type:     'Purchase',
          status:   'Draft',
          docstatus: 0,
        })
        .select('id')
        .single()
      if (mrErr) throw mrErr

      // Insert material_request_item
      const { error: itemErr } = await supabase
        .from('material_request_items')
        .insert({
          mr_id:      mrData.id,
          mr_number,
          item_id:    row.itemId,
          item_name:  row.itemName,
          qty:        row.reorderQty || row.shortfall || 1,
          unit:       row.unit,
          warehouse_id: row.warehouseId,
        })
      if (itemErr) throw itemErr

      toast.success(`${mrNumber} created`)
    } catch (err) {
      toast.error('Failed to raise MR: ' + err.message)
    } finally {
      setRaisingMR(null)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    if (!filtered.length) { toast.error('Nothing to export'); return }
    exportXLSX(
      filtered.map(r => ({
        'Item Code':     r.itemCode,
        'Item Name':     r.itemName,
        Category:        r.category,
        Unit:            r.unit,
        Warehouse:       r.warehouseName,
        'Reorder Level': r.reorderLevel,
        'On Hand':       r.actualQty,
        Shortfall:       r.shortfall,
        'MR Type':       r.mrType,
        Urgency:         r.urgency,
      })),
      `ItemShortageReport_${dateTag()}`,
      'Shortage Report'
    )
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader
        title="Item Shortage Report"
        subtitle="Items at or below reorder level — sorted by urgency"
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="error"
          label="Critical Items"
          value={criticalCount}
          sub="zero on-hand qty"
          color="red"
          alert={criticalCount > 0}
        />
        <KPICard
          icon="warning"
          label="Low Stock Items"
          value={lowStockCount}
          sub="below reorder level"
          color="yellow"
        />
        <KPICard
          icon="trending_down"
          label="Near Reorder"
          value={nearReorderCount}
          sub="below 125% of reorder level"
          color="gold"
        />
        <KPICard
          icon="playlist_remove"
          label="No Reorder Level"
          value={noReorderLevelCount}
          sub="items without reorder level"
          color=""
        />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="Search item name or code…"
            style={{ maxWidth: 240 }}
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
            style={{ width: 160 }}
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value)}
          >
            <option value="ALL">All Urgency</option>
            <option value="Critical">Critical</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Near Reorder">Near Reorder</option>
          </select>
          {(search || whFilter !== 'ALL' || urgencyFilter !== 'ALL') && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setWhFilter('ALL'); setUrgencyFilter('ALL') }}
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {allShortageRows.length} shortage rows
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th style={{ textAlign: 'right' }}>Reorder Level</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right' }}>Shortfall</th>
                <th>MR Type</th>
                <th>Urgency</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
                    <span className="material-icons" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}>hourglass_empty</span>
                    Loading shortage data…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <EmptyState
                      icon="check_circle"
                      message={search || whFilter !== 'ALL' || urgencyFilter !== 'ALL'
                        ? 'No items match your filters'
                        : 'All items are above reorder levels — great!'}
                    />
                  </td>
                </tr>
              ) : filtered.map((r, idx) => {
                const isCritical = r.urgency === 'Critical'
                return (
                  <tr
                    key={`${r.itemId}-${r.warehouseId}`}
                    style={{ background: isCritical ? 'rgba(239,68,68,0.04)' : '' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = isCritical ? 'rgba(239,68,68,0.04)' : ''}
                  >
                    <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{idx + 1}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>{r.itemCode}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.itemName}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.unit}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>
                        {r.category}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.warehouseName}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                      {fmtNum(r.reorderLevel)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.actualQty === 0 ? 'var(--red)' : 'var(--text)' }}>
                      {fmtNum(r.actualQty)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: r.shortfall > 0 ? 'var(--red)' : 'var(--text-dim)', fontWeight: r.shortfall > 0 ? 700 : 400 }}>
                      {r.shortfall > 0 ? fmtNum(r.shortfall) : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {r.mrType}
                    </td>
                    <td><UrgencyBadge tier={r.urgency} /></td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={raisingMR === r.itemId}
                        onClick={() => handleRaiseMR(r)}
                        title="Create a Purchase Material Request for this item"
                      >
                        {raisingMR === r.itemId
                          ? <span className="material-icons" style={{ fontSize: 14 }}>hourglass_empty</span>
                          : <span className="material-icons" style={{ fontSize: 14 }}>add_shopping_cart</span>
                        }
                        {raisingMR === r.itemId ? ' Creating…' : ' Raise MR'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
