// src/pages/Inventory/StockValuationReport.jsx
// Stock Valuation Report — AVCO-based inventory value by category/warehouse.
// Designed for balance sheet reconciliation.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import * as XLSX from 'xlsx'

// ── Data fetcher ─────────────────────────────────────────────────────────────
async function fetchBins() {
  const { data, error } = await supabase
    .from('bins')
    .select(`
      item_id, warehouse_id, actual_qty, valuation_rate, stock_value,
      items(id, name, unit, category, item_code),
      warehouses(id, name)
    `)
    .gt('actual_qty', 0)
    .order('item_id', { ascending: true })

  if (error) throw error

  return (data || []).map(row => ({
    item_id:        row.item_id,
    item_name:      row.items?.name        ?? row.item_id,
    item_code:      row.items?.item_code   ?? '—',
    unit:           row.items?.unit        ?? 'pcs',
    category:       row.items?.category    || 'Uncategorised',
    warehouse_id:   row.warehouse_id,
    warehouse_name: row.warehouses?.name   ?? row.warehouse_id,
    qty:            row.actual_qty,
    valuation_rate: row.valuation_rate     || 0,
    stock_value:    row.actual_qty * (row.valuation_rate || 0),
  }))
}

// ── Value colour helper ───────────────────────────────────────────────────────
function valueColor(v) {
  if (v > 5000) return 'var(--gold)'
  if (v > 1000) return 'var(--green)'
  return 'var(--text)'
}

// ── Category group component ─────────────────────────────────────────────────
function CategoryGroup({ groupKey, rows, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const subtotal = rows.reduce((s, r) => s + r.stock_value, 0)
  const itemCount = new Set(rows.map(r => r.item_id)).size

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => b.stock_value - a.stock_value),
  [rows])

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Category header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface2)',
          padding: '10px 14px',
          borderRadius: open ? '6px 6px 0 0' : 6,
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <span
          className="material-icons"
          style={{
            fontSize: 16,
            color: 'var(--text-dim)',
            transform: open ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 0.18s',
          }}
        >
          chevron_right
        </span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>
          {groupKey}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 16 }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
          ${fmtNum(subtotal)}
        </span>
      </div>

      {/* Rows */}
      {open && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 6px 6px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Item Code</th>
                <th style={thStyle}>Item Name</th>
                <th style={thStyle}>Warehouse</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                <th style={thStyle}>Unit</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>AVCO Rate ($/unit)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => (
                <tr
                  key={`${row.item_id}-${row.warehouse_id}-${idx}`}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                    {row.item_code}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.item_name}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 12 }}>{row.warehouse_name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    {fmtNum(row.qty)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-dim)', fontSize: 12 }}>{row.unit}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)' }}>
                    {row.valuation_rate > 0 ? `$${fmtNum(row.valuation_rate)}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      color: valueColor(row.stock_value),
                    }}
                  >
                    ${fmtNum(row.stock_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle = {
  padding: '7px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '8px 12px',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StockValuationReport() {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [viewMode,   setViewMode]   = useState('category') // 'category' | 'warehouse'
  const [whFilter,   setWhFilter]   = useState('ALL')
  const [catFilter,  setCatFilter]  = useState('ALL')
  const [hideZero,   setHideZero]   = useState(true)

  const load = () => {
    setLoading(true)
    fetchBins()
      .then(data => { setRows(data); setLoading(false) })
      .catch(err => { toast.error('Failed to load: ' + err.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  // ── Filter options ────────────────────────────────────────────────────────
  const warehouses = useMemo(() => {
    const seen = new Map()
    for (const r of rows) seen.set(r.warehouse_id, r.warehouse_name)
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const categories = useMemo(() =>
    [...new Set(rows.map(r => r.category).filter(Boolean))].sort(),
  [rows])

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (whFilter  !== 'ALL' && r.warehouse_id !== whFilter) return false
      if (catFilter !== 'ALL' && r.category     !== catFilter) return false
      if (hideZero  && r.stock_value === 0)                    return false
      return true
    })
  }, [rows, whFilter, catFilter, hideZero])

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalValue        = useMemo(() => filtered.reduce((s, r) => s + r.stock_value, 0), [filtered])
  const distinctItems     = useMemo(() => new Set(filtered.map(r => r.item_id)).size,       [filtered])
  const distinctWarehouses = useMemo(() => new Set(filtered.map(r => r.warehouse_id)).size, [filtered])
  const avgValuePerSku    = distinctItems > 0 ? totalValue / distinctItems : 0

  // ── Group by category or warehouse ───────────────────────────────────────
  const groups = useMemo(() => {
    const groupKey = viewMode === 'category' ? 'category' : 'warehouse_name'
    const map = new Map()
    for (const r of filtered) {
      const key = r[groupKey] || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    // Sort groups by subtotal desc
    return [...map.entries()]
      .map(([key, rws]) => ({ key, rows: rws, subtotal: rws.reduce((s, r) => s + r.stock_value, 0) }))
      .sort((a, b) => b.subtotal - a.subtotal)
  }, [filtered, viewMode])

  const grandTotal = useMemo(() => groups.reduce((s, g) => s + g.subtotal, 0), [groups])

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!filtered.length) { toast.error('Nothing to export'); return }

    const detailRows = filtered.map(r => ({
      Category:            r.category,
      'Item Code':         r.item_code,
      'Item Name':         r.item_name,
      Warehouse:           r.warehouse_name,
      Qty:                 +r.qty.toFixed(4),
      Unit:                r.unit,
      'AVCO Rate ($/unit)': +r.valuation_rate.toFixed(4),
      'Stock Value ($)':   +r.stock_value.toFixed(2),
    }))

    const summaryRows = groups.map(g => ({
      Group:              g.key,
      'Total Value ($)':  +g.subtotal.toFixed(2),
      '% of Total':       grandTotal > 0 ? `${((g.subtotal / grandTotal) * 100).toFixed(1)}%` : '0.0%',
    }))

    const wb = XLSX.utils.book_new()

    const ws1 = XLSX.utils.json_to_sheet(detailRows)
    XLSX.utils.book_append_sheet(wb, ws1, 'By Category')

    const ws2 = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary')

    XLSX.writeFile(wb, `StockValuationReport_${dateTag()}.xlsx`)
    toast.success('Exported 2-sheet XLSX')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const hasFilters = whFilter !== 'ALL' || catFilter !== 'ALL' || !hideZero

  return (
    <div>
      <PageHeader
        title="Stock Valuation Report"
        subtitle="Inventory value at AVCO (Moving Average Cost) — use for balance sheet reconciliation"
      >
        <button
          className="btn btn-secondary"
          onClick={load}
          disabled={loading}
          title="Refresh data"
        >
          <span className="material-icons">refresh</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleExport}
          disabled={loading || !filtered.length}
        >
          <span className="material-icons">table_chart</span>
          Export XLSX
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="account_balance_wallet"
          label="Total Inventory Value"
          value={`$${fmtNum(totalValue)}`}
          sub="sum of qty × AVCO rate"
          color="gold"
        />
        <KPICard
          icon="inventory_2"
          label="Total Items (SKUs)"
          value={distinctItems}
          sub="distinct items in stock"
          color="teal"
        />
        <KPICard
          icon="warehouse"
          label="Total Warehouses"
          value={distinctWarehouses}
          sub="warehouses with stock"
          color="blue"
        />
        <KPICard
          icon="trending_up"
          label="Avg Value per SKU"
          value={`$${fmtNum(avgValuePerSku)}`}
          sub="total value ÷ distinct SKUs"
          color="purple"
        />
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Warehouse dropdown */}
          <select
            className="form-control"
            style={{ width: 180 }}
            value={whFilter}
            onChange={e => setWhFilter(e.target.value)}
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {/* Category dropdown */}
          <select
            className="form-control"
            style={{ width: 160 }}
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Hide zero-value toggle */}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-mid)', userSelect: 'none' }}
          >
            <input
              type="checkbox"
              checked={hideZero}
              onChange={e => setHideZero(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }}
            />
            Hide zero-value items
          </label>

          {/* View mode toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              className={`btn btn-sm ${viewMode === 'category' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('category')}
            >
              <span className="material-icons" style={{ fontSize: 15 }}>category</span>
              By Category
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'warehouse' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('warehouse')}
            >
              <span className="material-icons" style={{ fontSize: 15 }}>warehouse</span>
              By Warehouse
            </button>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setWhFilter('ALL'); setCatFilter('ALL'); setHideZero(true) }}
              title="Clear filters"
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>

        {/* As-at note */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons" style={{ fontSize: 13 }}>schedule</span>
          Live — based on current bin values
          {filtered.length !== rows.length && (
            <span style={{ marginLeft: 8 }}>
              · Showing {filtered.length} of {rows.length} bin records
            </span>
          )}
        </div>
      </div>

      {/* Main grouped view */}
      {loading ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 64,
            textAlign: 'center',
            color: 'var(--text-dim)',
          }}
        >
          <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 10, opacity: 0.35 }}>
            hourglass_empty
          </span>
          Loading stock valuation…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="inventory"
            message={hasFilters ? 'No items match your filters' : 'No positive-stock bins found'}
          />
        </div>
      ) : (
        <>
          {/* Group sections */}
          {groups.map(g => (
            <CategoryGroup
              key={g.key}
              groupKey={g.key}
              rows={g.rows}
              defaultOpen={true}
            />
          ))}

          {/* Grand total row */}
          <div
            style={{
              borderTop: '2px solid var(--gold)',
              padding: '16px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface2)',
              borderRadius: '0 0 8px 8px',
              marginTop: 4,
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Total Inventory Value
              </span>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                at AVCO · {groups.length} {viewMode === 'category' ? 'categories' : 'warehouses'} · {distinctItems} SKUs
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)', letterSpacing: '-0.02em' }}>
              ${fmtNum(grandTotal)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
