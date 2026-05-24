// src/pages/Inventory/StockReservations.jsx
// View all active stock reservations — reserved qty, consuming document,
// and Available-to-Promise (ATP) qty computed from bin data.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, AlertBanner } from '../../components/ui'

const TODAY_STR = new Date().toISOString().split('T')[0]

// ── Status badge styles ───────────────────────────────────────────────────
const STATUS_STYLE = {
  'Active':             { bg: 'var(--green)',    color: 'var(--surface)' },
  'Partially Consumed': { bg: 'var(--yellow)',   color: 'var(--surface)' },
  'Consumed':           { bg: 'var(--blue)',     color: 'var(--surface)' },
  'Released':           { bg: 'var(--text-dim)', color: 'var(--surface)' },
}

function StatusBadge({ status }) {
  const style = STATUS_STYLE[status] ?? { bg: 'var(--border)', color: 'var(--text)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: style.bg,
      color: style.color,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ── ATP panel helpers ─────────────────────────────────────────────────────
function atpColor(available, actual) {
  if (actual === 0 && available <= 0) return 'var(--text-dim)'
  if (available <= 0) return 'var(--red)'
  if (actual > 0 && available / actual <= 0.2) return 'var(--yellow)'
  return 'var(--green)'
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function StockReservations() {
  const [reservations, setReservations] = useState([])
  const [bins,         setBins]         = useState([])
  const [warehouses,   setWarehouses]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [releasing,    setReleasing]    = useState(null) // id of row being released

  // Filters
  const [search,    setSearch]    = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [whFilter,  setWhFilter]  = useState('ALL')

  // ── Load ────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const [
        { data: rData, error: rErr },
        { data: bData, error: bErr },
        { data: wData, error: wErr },
      ] = await Promise.all([
        supabase.from('stock_reservations').select('*').order('created_at', { ascending: false }),
        supabase.from('bins').select('item_id, warehouse_id, actual_qty, reserved_qty'),
        supabase.from('warehouses').select('id, name'),
      ])
      if (rErr) throw rErr
      if (bErr) throw bErr
      if (wErr) throw wErr
      setReservations(rData || [])
      setBins(bData || [])
      setWarehouses(wData || [])
    } catch (err) {
      toast.error('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Release action ───────────────────────────────────────────────────────
  async function handleRelease(row) {
    if (!window.confirm(`Release reservation ${row.id} for "${row.item_name}"?`)) return
    setReleasing(row.id)
    try {
      // Update reservation status
      const { error: upErr } = await supabase
        .from('stock_reservations')
        .update({ status: 'Released', consumed_qty: 0 })
        .eq('id', row.id)
      if (upErr) throw upErr

      // Decrement bins.reserved_qty via RPC (negative delta to reduce)
      const delta = -(row.available_reserved ?? (row.reserved_qty - row.consumed_qty))
      if (delta < 0) {
        const { error: rpcErr } = await supabase.rpc('fn_increment_bin_reserved', {
          p_item_id:      row.item_id,
          p_warehouse_id: row.warehouse_id,
          p_delta:        delta,
        })
        if (rpcErr) {
          // Non-fatal: reservation is already released, just warn
          console.warn('fn_increment_bin_reserved:', rpcErr.message)
        }
      }

      toast.success('Reservation released')
      await load()
    } catch (err) {
      toast.error('Release failed: ' + err.message)
    } finally {
      setReleasing(null)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const warehouseMap = useMemo(() => {
    const m = {}
    warehouses.forEach(w => { m[w.id] = w.name })
    return m
  }, [warehouses])

  // ATP: aggregate bins by item_id
  const atpByItem = useMemo(() => {
    const m = {}
    bins.forEach(b => {
      if (!m[b.item_id]) m[b.item_id] = { actual: 0, reserved: 0 }
      m[b.item_id].actual   += Number(b.actual_qty   || 0)
      m[b.item_id].reserved += Number(b.reserved_qty || 0)
    })
    return m
  }, [bins])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return reservations.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (whFilter !== 'ALL' && r.warehouse_id !== whFilter)   return false
      if (q && !r.item_name?.toLowerCase().includes(q) && !r.voucher_no?.toLowerCase().includes(q)) return false
      return true
    })
  }, [reservations, statusFilter, whFilter, search])

  // KPIs
  const activeCount   = useMemo(() => reservations.filter(r => r.status === 'Active').length, [reservations])
  const totalReserved = useMemo(() =>
    reservations.filter(r => r.status === 'Active' || r.status === 'Partially Consumed')
      .reduce((s, r) => s + Number(r.available_reserved ?? (r.reserved_qty - r.consumed_qty) ?? 0), 0),
  [reservations])
  const itemsWithRes  = useMemo(() => new Set(reservations.filter(r => r.status === 'Active').map(r => r.item_id)).size, [reservations])
  const releasedToday = useMemo(() =>
    reservations.filter(r => r.status === 'Released' && r.created_at?.startsWith(TODAY_STR)).length,
  [reservations])

  // Unique warehouse list from reservations
  const whOptions = useMemo(() => {
    const seen = new Map()
    reservations.forEach(r => {
      if (r.warehouse_id) seen.set(r.warehouse_id, warehouseMap[r.warehouse_id] || r.warehouse_id)
    })
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [reservations, warehouseMap])

  // ATP summary panel rows — unique items in filtered view
  const atpRows = useMemo(() => {
    const seen = new Map()
    filtered.forEach(r => {
      if (!seen.has(r.item_id)) {
        const atp = atpByItem[r.item_id] || { actual: 0, reserved: 0 }
        seen.set(r.item_id, {
          itemId:   r.item_id,
          itemName: r.item_name,
          actual:   atp.actual,
          reserved: atp.reserved,
          available: atp.actual - atp.reserved,
        })
      }
    })
    return [...seen.values()]
  }, [filtered, atpByItem])

  // Export
  function handleExport() {
    if (!filtered.length) { toast.error('Nothing to export'); return }
    exportXLSX(
      filtered.map(r => ({
        Item:           r.item_name,
        Warehouse:      warehouseMap[r.warehouse_id] || r.warehouse_id,
        'Reserved Qty': r.reserved_qty,
        'Consumed Qty': r.consumed_qty,
        'Available Reserved': r.available_reserved ?? (r.reserved_qty - r.consumed_qty),
        'Voucher Type': r.voucher_type,
        'Voucher No':   r.voucher_no,
        'Reserved By':  r.reserved_by_name || r.reserved_by,
        Status:         r.status,
        Notes:          r.notes || '',
        Created:        r.created_at?.split('T')[0] || '',
      })),
      `StockReservations_${dateTag()}`,
      'Reservations'
    )
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader
        title="Stock Reservations"
        subtitle="Active reservations, consumed quantities, and available-to-promise by item"
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="bookmark"
          label="Active Reservations"
          value={activeCount}
          sub="status = Active"
          color="blue"
        />
        <KPICard
          icon="inventory"
          label="Total Reserved Qty"
          value={fmtNum(totalReserved)}
          sub="active + partially consumed"
          color="teal"
        />
        <KPICard
          icon="category"
          label="Items with Reservations"
          value={itemsWithRes}
          sub="distinct items"
          color="purple"
        />
        <KPICard
          icon="check_circle"
          label="Released Today"
          value={releasedToday}
          sub={TODAY_STR}
          color={releasedToday > 0 ? 'green' : ''}
        />
      </div>

      {/* ATP Panel */}
      {!loading && atpRows.length > 0 && (
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Available-to-Promise (ATP) — Current Filter
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {atpRows.map(row => {
              const color = atpColor(row.available, row.actual)
              return (
                <div key={row.itemId} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  minWidth: 160,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                    {row.itemName}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                    <div>
                      <div style={{ color: 'var(--text-dim)' }}>On Hand</div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtNum(row.actual)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-dim)' }}>Reserved</div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtNum(row.reserved)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-dim)' }}>ATP</div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color }}>{fmtNum(row.available)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="Search item or voucher no…"
            style={{ maxWidth: 240 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 190 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Partially Consumed">Partially Consumed</option>
            <option value="Consumed">Consumed</option>
            <option value="Released">Released</option>
          </select>
          <select
            className="form-control"
            style={{ width: 170 }}
            value={whFilter}
            onChange={e => setWhFilter(e.target.value)}
          >
            <option value="ALL">All Warehouses</option>
            {whOptions.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {(search || statusFilter !== 'ALL' || whFilter !== 'ALL') && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setStatusFilter('ALL'); setWhFilter('ALL') }}
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {reservations.length} reservations
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
                <th>Warehouse</th>
                <th style={{ textAlign: 'right' }}>Reserved Qty</th>
                <th style={{ textAlign: 'right' }}>Consumed</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th>Voucher</th>
                <th>Reserved By</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
                    <span className="material-icons" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}>hourglass_empty</span>
                    Loading reservations…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <EmptyState
                      icon="bookmark_border"
                      message={search || statusFilter !== 'ALL' || whFilter !== 'ALL'
                        ? 'No reservations match your filters'
                        : 'No stock reservations found'}
                    />
                  </td>
                </tr>
              ) : filtered.map((r, idx) => {
                const avail = r.available_reserved ?? (Number(r.reserved_qty || 0) - Number(r.consumed_qty || 0))
                const isActive = r.status === 'Active'
                return (
                  <tr
                    key={r.id}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.item_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.item_id}</div>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {warehouseMap[r.warehouse_id] || r.warehouse_id || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                      {fmtNum(r.reserved_qty)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)' }}>
                      {fmtNum(r.consumed_qty)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: avail > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtNum(avail)}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>{r.voucher_no || '—'}</div>
                      {r.voucher_type && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.voucher_type}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.reserved_by_name || r.reserved_by || '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                      {r.created_at?.split('T')[0] || '—'}
                    </td>
                    <td>
                      {isActive && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={releasing === r.id}
                          onClick={() => handleRelease(r)}
                          title="Release this reservation"
                        >
                          {releasing === r.id
                            ? <span className="material-icons" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>refresh</span>
                            : <span className="material-icons" style={{ fontSize: 14 }}>lock_open</span>
                          }
                          {releasing === r.id ? ' Releasing…' : ' Release'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td colSpan="3" style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px' }}>
                    Totals ({filtered.length} rows)
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', padding: '8px 12px' }}>
                    {fmtNum(filtered.reduce((s, r) => s + Number(r.reserved_qty || 0), 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', padding: '8px 12px' }}>
                    {fmtNum(filtered.reduce((s, r) => s + Number(r.consumed_qty || 0), 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', padding: '8px 12px', color: 'var(--green)' }}>
                    {fmtNum(filtered.reduce((s, r) => s + Number(r.available_reserved ?? (r.reserved_qty - r.consumed_qty) ?? 0), 0))}
                  </td>
                  <td colSpan="5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
