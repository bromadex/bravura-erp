// src/pages/Inventory/AutoMRScheduler.jsx
// Phase 20 — Auto-MR Scheduler
// Scans all items below reorder level (via fn_items_below_reorder) and
// bulk-generates Material Requests in one action.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WAREHOUSE = 'wh_main_store'

const today = () => new Date().toISOString().split('T')[0]

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function urgencyLabel(row) {
  if (row.actual_qty <= 0) return 'Out of Stock'
  if (row.shortage > row.reorder_qty * 0.5) return 'Critical'
  return 'Low'
}

function UrgencyBadge({ row }) {
  const label = urgencyLabel(row)
  const cls =
    label === 'Out of Stock' ? 'badge-red'
    : label === 'Critical'  ? 'badge-red'
    : 'badge-yellow'
  return <span className={`badge ${cls}`}>{label}</span>
}

function MrStatusBadge({ status }) {
  const cls =
    status === 'Draft'     ? 'badge-yellow'
    : status === 'Submitted' ? 'badge-blue'
    : status === 'Ordered'   ? 'badge-green'
    : status === 'Cancelled' ? 'badge-red'
    : 'badge-dim'
  return <span className={`badge ${cls}`}>{status || '—'}</span>
}

const fmt = v => (v != null ? String(v).slice(0, 10) : '—')

// ── Get next MR number ───────────────────────────────────────────────────────

async function getNextMRNumber() {
  const { data } = await supabase
    .from('material_requests')
    .select('mr_number')
    .ilike('mr_number', 'MR-%')
    .order('created_at', { ascending: false })
    .limit(1)

  const last = data?.[0]?.mr_number || 'MR-0000'
  const num = parseInt(last.replace('MR-', ''), 10) || 0
  return `MR-${String(num + 1).padStart(4, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AutoMRScheduler() {
  const [belowReorder, setBelowReorder] = useState([])
  const [recentMRs, setRecentMRs]       = useState([])
  const [itemMap, setItemMap]           = useState({})
  const [whMap, setWhMap]               = useState({})
  const [selected, setSelected]         = useState(new Set())
  const [loading, setLoading]           = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [tab, setTab]                   = useState('below')
  const [groupBy, setGroupBy]           = useState('warehouse')
  const [form, setForm]                 = useState({
    requiredBy: addDays(today(), 14),
    department: '',
  })

  const { user } = useAuth()

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Items below reorder level
      const { data: belowData, error: belowErr } = await supabase.rpc('fn_items_below_reorder')
      if (belowErr) throw belowErr

      const rows = belowData || []

      // 2. Enrich with item details
      const itemIds = [...new Set(rows.map(r => r.item_id))]
      let iMap = {}
      if (itemIds.length > 0) {
        const { data: itemDetails } = await supabase
          .from('items')
          .select('id, item_code, category, unit')
          .in('id', itemIds)
        iMap = Object.fromEntries((itemDetails || []).map(i => [i.id, i]))
      }

      // 3. Warehouse name lookup
      const { data: whData } = await supabase.from('warehouses').select('id, name')
      const wMap = Object.fromEntries((whData || []).map(w => [w.id, w.name]))

      // 4. Recent auto-generated MRs
      const { data: mrData } = await supabase
        .from('material_requests')
        .select('id, mr_number, status, transaction_date, required_by_date, department, notes, created_at')
        .eq('created_by', 'Auto-MR Scheduler')
        .order('created_at', { ascending: false })
        .limit(50)

      setBelowReorder(rows)
      setItemMap(iMap)
      setWhMap(wMap)
      setRecentMRs(mrData || [])
    } catch (e) {
      toast.error('Failed to load data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => ({
    belowCount:  belowReorder.length,
    criticalCount: belowReorder.filter(r => r.actual_qty <= 0).length,
    totalReorderQty: belowReorder.reduce((s, r) => s + (r.reorder_qty || 0), 0),
    autoMrsCount: recentMRs.length,
  }), [belowReorder, recentMRs])

  // ── Selection helpers ─────────────────────────────────────────────────────

  const allSelected = belowReorder.length > 0 && selected.size === belowReorder.length

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(belowReorder.map(r => r.item_id)))
    }
  }

  const toggleRow = (itemId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  // ── Generate MRs ─────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const selectedRows = belowReorder.filter(r => selected.has(r.item_id))
    if (selectedRows.length === 0) return

    setGenerating(true)
    try {
      const requiredByDate = form.requiredBy

      if (groupBy === 'warehouse') {
        // One MR per warehouse
        const byWarehouse = {}
        selectedRows.forEach(r => {
          if (!byWarehouse[r.warehouse_id]) byWarehouse[r.warehouse_id] = []
          byWarehouse[r.warehouse_id].push(r)
        })

        for (const [warehouseId, rows] of Object.entries(byWarehouse)) {
          const mrId = crypto.randomUUID()
          const mrNumber = await getNextMRNumber()
          const whName = whMap[warehouseId] || warehouseId

          const { error: mrErr } = await supabase.from('material_requests').insert({
            id: mrId,
            mr_number: mrNumber,
            type: 'Purchase',
            status: 'Draft',
            transaction_date: today(),
            required_by_date: requiredByDate,
            department: form.department || null,
            requested_by: user?.full_name || 'Auto-MR Scheduler',
            set_warehouse_id: warehouseId,
            notes: `Auto-generated by MR Scheduler for ${whName}. Items below reorder level.`,
            created_by: 'Auto-MR Scheduler',
            per_ordered: 0,
            per_received: 0,
          })
          if (mrErr) throw mrErr

          const mrItems = rows.map(r => {
            const item = itemMap[r.item_id] || {}
            return {
              id: crypto.randomUUID(),
              mr_id: mrId,
              item_id: r.item_id,
              item_name: r.item_name,
              qty: r.reorder_qty || r.shortage,
              ordered_qty: 0,
              received_qty: 0,
              warehouse_id: warehouseId,
              unit: item.unit || 'pcs',
              rate: 0,
              schedule_date: requiredByDate,
              notes: `Reorder level: ${r.reorder_level}, Current qty: ${r.actual_qty}`,
            }
          })

          const { error: itemErr } = await supabase.from('material_request_items').insert(mrItems)
          if (itemErr) throw itemErr
        }
      } else {
        // Single consolidated MR
        const mrId = crypto.randomUUID()
        const mrNumber = await getNextMRNumber()

        const { error: mrErr } = await supabase.from('material_requests').insert({
          id: mrId,
          mr_number: mrNumber,
          type: 'Purchase',
          status: 'Draft',
          transaction_date: today(),
          required_by_date: requiredByDate,
          department: form.department || null,
          requested_by: user?.full_name || 'Auto-MR Scheduler',
          set_warehouse_id: selectedRows[0]?.warehouse_id || null,
          notes: `Auto-generated consolidated MR. ${selectedRows.length} items below reorder level.`,
          created_by: 'Auto-MR Scheduler',
          per_ordered: 0,
          per_received: 0,
        })
        if (mrErr) throw mrErr

        const mrItems = selectedRows.map(r => {
          const item = itemMap[r.item_id] || {}
          return {
            id: crypto.randomUUID(),
            mr_id: mrId,
            item_id: r.item_id,
            item_name: r.item_name,
            qty: r.reorder_qty || r.shortage,
            ordered_qty: 0,
            received_qty: 0,
            warehouse_id: r.warehouse_id,
            unit: item.unit || 'pcs',
            rate: 0,
            schedule_date: requiredByDate,
            notes: `Reorder level: ${r.reorder_level}, Current qty: ${r.actual_qty}`,
          }
        })

        const { error: itemErr } = await supabase.from('material_request_items').insert(mrItems)
        if (itemErr) throw itemErr
      }

      toast.success(`Generated MRs for ${selectedRows.length} items`)
      setSelected(new Set())
      await loadData()
    } catch (e) {
      toast.error('Failed to generate MRs: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!belowReorder.length) return
    const rows = belowReorder.map(r => {
      const item = itemMap[r.item_id] || {}
      return {
        'Item Code':      item.item_code || '',
        'Item Name':      r.item_name,
        'Category':       item.category || '',
        'Warehouse':      whMap[r.warehouse_id] || r.warehouse_id,
        'System Qty':     r.actual_qty,
        'Reorder Level':  r.reorder_level,
        'Shortage':       r.shortage,
        'Suggest Order':  r.reorder_qty,
        'Urgency':        urgencyLabel(r),
      }
    })
    exportXLSX(rows, `BelowReorder_${today()}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageHeader
        title="Auto-MR Scheduler"
        subtitle="Scan items below reorder level and bulk-generate Material Requests"
      >
        <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={!belowReorder.length}>
          <span className="material-icons md-18">download</span> Export
        </button>
        <button className="btn btn-ghost btn-sm" onClick={loadData} disabled={loading}>
          <span className="material-icons md-18">refresh</span>
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard
          label="Items Below Reorder Level"
          value={kpis.belowCount}
          icon="inventory_2"
          color="red"
        />
        <KPICard
          label="Critical (0 Stock)"
          value={kpis.criticalCount}
          icon="error"
          color="red"
        />
        <KPICard
          label="Total Reorder Qty Needed"
          value={fmtNum(kpis.totalReorderQty, 0)}
          icon="shopping_cart"
          color="blue"
        />
        <KPICard
          label="Auto-MRs Generated"
          value={kpis.autoMrsCount}
          icon="assignment"
          color="green"
        />
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn${tab === 'below' ? ' active' : ''}`}
          onClick={() => setTab('below')}
        >
          <span className="material-icons md-18">warning</span>
          Below Reorder Level
          {belowReorder.length > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 6 }}>{belowReorder.length}</span>
          )}
        </button>
        <button
          className={`tab-btn${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          <span className="material-icons md-18">history</span>
          Auto-MR History
        </button>
      </div>

      {/* ── Below Reorder Level tab ── */}
      {tab === 'below' && (
        <>
          {/* Alert banner */}
          {belowReorder.length > 0 && (
            <div className="alert-banner alert-gold" style={{ marginBottom: 16 }}>
              <span className="material-icons md-18">info</span>
              <span>
                <strong>{belowReorder.length}</strong> items are below their reorder level.
                Select items and click <strong>Generate MRs</strong>.
              </span>
            </div>
          )}

          {/* Toolbar */}
          <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleAll}
              disabled={belowReorder.length === 0}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Group By:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="groupBy"
                  value="warehouse"
                  checked={groupBy === 'warehouse'}
                  onChange={() => setGroupBy('warehouse')}
                />
                By Warehouse
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="radio"
                  name="groupBy"
                  value="single"
                  checked={groupBy === 'single'}
                  onChange={() => setGroupBy('single')}
                />
                Single MR
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Required By:</label>
              <input
                type="date"
                className="input input-sm"
                value={form.requiredBy}
                onChange={e => setForm(f => ({ ...f, requiredBy: e.target.value }))}
                style={{ width: 140 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Department:</label>
              <input
                type="text"
                className="input input-sm"
                placeholder="Optional"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                style={{ width: 140 }}
              />
            </div>

            <button
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--gold)', color: '#000', marginLeft: 'auto' }}
              onClick={handleGenerate}
              disabled={selected.size === 0 || generating}
            >
              {generating
                ? <><span className="material-icons md-18 spin">autorenew</span> Generating…</>
                : <><span className="material-icons md-18">add_task</span> Generate MRs ({selected.size})</>
              }
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="empty-state">
              <span className="material-icons md-36 spin" style={{ opacity: .4 }}>autorenew</span>
              <span className="empty-text">Loading…</span>
            </div>
          ) : belowReorder.length === 0 ? (
            <EmptyState
              icon="check_circle"
              message="All items are above their reorder levels. No action needed."
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Warehouse</th>
                    <th className="text-right">System Qty</th>
                    <th className="text-right">Reorder Level</th>
                    <th className="text-right">Shortage</th>
                    <th className="text-right">Suggest Order Qty</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {belowReorder.map(row => {
                    const item = itemMap[row.item_id] || {}
                    const isSel = selected.has(row.item_id)
                    return (
                      <tr
                        key={`${row.item_id}-${row.warehouse_id}`}
                        className={isSel ? 'row-selected' : ''}
                        onClick={() => toggleRow(row.item_id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleRow(row.item_id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td>
                          <span className="mono">{item.item_code || '—'}</span>
                        </td>
                        <td>{row.item_name}</td>
                        <td>{item.category || '—'}</td>
                        <td>{whMap[row.warehouse_id] || row.warehouse_id}</td>
                        <td
                          className="text-right"
                          style={{ color: row.actual_qty <= 0 ? 'var(--red)' : 'inherit', fontWeight: row.actual_qty <= 0 ? 600 : 400 }}
                        >
                          {fmtNum(row.actual_qty, 2)}
                        </td>
                        <td className="text-right">{fmtNum(row.reorder_level, 2)}</td>
                        <td className="text-right" style={{ color: 'var(--red)' }}>
                          {fmtNum(row.shortage, 2)}
                        </td>
                        <td className="text-right" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                          {fmtNum(row.reorder_qty, 2)}
                        </td>
                        <td><UrgencyBadge row={row} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Auto-MR History tab ── */}
      {tab === 'history' && (
        <>
          {loading ? (
            <div className="empty-state">
              <span className="material-icons md-36 spin" style={{ opacity: .4 }}>autorenew</span>
              <span className="empty-text">Loading…</span>
            </div>
          ) : recentMRs.length === 0 ? (
            <EmptyState
              icon="history"
              message="No auto-generated MRs yet. Use the 'Below Reorder Level' tab to generate them."
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>MR Number</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Required By</th>
                    <th>Department</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMRs.map(mr => (
                    <tr key={mr.id}>
                      <td>
                        <span className="mono" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                          {mr.mr_number}
                        </span>
                      </td>
                      <td><MrStatusBadge status={mr.status} /></td>
                      <td>{fmt(mr.transaction_date)}</td>
                      <td>{fmt(mr.required_by_date)}</td>
                      <td>{mr.department || '—'}</td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mr.notes || '—'}
                      </td>
                      <td>
                        <a
                          href={`/inventory/material-requests`}
                          className="btn btn-ghost btn-xs"
                          style={{ fontSize: 11 }}
                        >
                          <span className="material-icons md-14">open_in_new</span> View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
