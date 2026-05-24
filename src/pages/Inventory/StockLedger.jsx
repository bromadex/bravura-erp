// src/pages/Inventory/StockLedger.jsx
// Complete SLE audit trail — every stock movement with running balance per item+warehouse

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Defaults ─────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().split('T')[0]
const d30ago   = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
const PAGE_SIZE = 200

// ── Voucher type → badge config ───────────────────────────────────────────────
const VOUCHER_BADGE = {
  PurchaseReceipt:    { color: 'var(--teal)',     bg: 'rgba(45,212,191,.12)',  italic: false },
  GRN:                { color: 'var(--teal)',     bg: 'rgba(45,212,191,.12)',  italic: false },
  StoreRequisition:   { color: 'var(--purple)',   bg: 'rgba(167,139,250,.12)', italic: false },
  StockOut:           { color: 'var(--red)',      bg: 'rgba(248,113,113,.12)', italic: false },
  StockTransfer:      { color: 'var(--blue)',     bg: 'rgba(96,165,250,.12)',  italic: false },
  StockReconciliation:{ color: 'var(--yellow)',   bg: 'rgba(251,191,36,.12)',  italic: false },
  OpeningStock:       { color: 'var(--gold)',     bg: 'rgba(184,50,50,.12)',   italic: false },
  LandedCostVoucher:  { color: 'var(--teal)',     bg: 'rgba(45,212,191,.12)',  italic: true  },
}

function VoucherBadge({ type }) {
  const cfg = VOUCHER_BADGE[type] || { color: 'var(--text-dim)', bg: 'rgba(255,255,255,.06)', italic: false }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
      borderRadius: 20, fontSize: 10, fontWeight: 700,
      fontFamily: 'var(--mono)', letterSpacing: '.5px',
      color: cfg.color, background: cfg.bg,
      fontStyle: cfg.italic ? 'italic' : 'normal',
      whiteSpace: 'nowrap',
    }}>
      {type || '—'}
    </span>
  )
}

// ── Type filter tabs ──────────────────────────────────────────────────────────
const TYPE_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'receipts',         label: 'Receipts' },
  { key: 'issues',           label: 'Issues' },
  { key: 'transfers',        label: 'Transfers' },
  { key: 'revaluations',     label: 'Revaluations' },
  { key: 'reconciliations',  label: 'Reconciliations' },
]

function matchesTypeTab(tab, row) {
  if (tab === 'all')             return true
  if (tab === 'receipts')        return row.actual_qty > 0
  if (tab === 'issues')          return row.actual_qty < 0
  if (tab === 'transfers')       return row.voucher_type === 'StockTransfer'
  if (tab === 'revaluations')    return row.voucher_type === 'LandedCostVoucher'
  if (tab === 'reconciliations') return row.voucher_type === 'StockReconciliation'
  return true
}

// ── Running balance computation ───────────────────────────────────────────────
function addRunningBalance(rows) {
  // rows must be sorted ASC by posting_datetime before calling this
  const balMap = {}
  return rows.map(r => {
    const key = `${r.item_id}__${r.warehouse_id}`
    balMap[key] = (balMap[key] || 0) + (r.actual_qty || 0)
    return { ...r, running_balance: balMap[key] }
  })
}

// ── Row styling ───────────────────────────────────────────────────────────────
function rowStyle(row) {
  const base = { borderLeft: '3px solid transparent' }
  if (row.is_cancelled) return { ...base, opacity: 0.4, textDecoration: 'line-through' }
  if (row.actual_qty > 0)  return { ...base, borderLeft: '3px solid var(--green)' }
  if (row.actual_qty < 0)  return { ...base, borderLeft: '3px solid var(--red)' }
  if (row.actual_qty === 0) return { ...base, borderLeft: '3px solid var(--blue)' }
  return base
}

// ── Format datetime ───────────────────────────────────────────────────────────
function fmtDT(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StockLedger() {
  const [rows,        setRows]        = useState([])
  const [warehouses,  setWarehouses]  = useState([])
  const [loading,     setLoading]     = useState(true)

  // Filters
  const [search,           setSearch]           = useState('')
  const [warehouseId,      setWarehouseId]       = useState('')
  const [dateFrom,         setDateFrom]          = useState(d30ago)
  const [dateTo,           setDateTo]            = useState(today)
  const [typeTab,          setTypeTab]           = useState('all')
  const [includeCancelled, setIncludeCancelled]  = useState(false)

  // Pagination
  const [page, setPage] = useState(1)

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: wData }, { data: sData, error }] = await Promise.all([
        supabase.from('warehouses').select('id, name').order('name'),
        supabase
          .from('stock_ledger_entries')
          .select(`
            id, item_id, warehouse_id, posting_datetime,
            voucher_type, transaction_type, voucher_no,
            actual_qty, incoming_rate, outgoing_rate, valuation_rate,
            created_by, is_cancelled,
            items:item_id ( id, name, unit, category, item_code ),
            warehouses:warehouse_id ( id, name )
          `)
          .gte('posting_datetime', dateFrom + 'T00:00:00')
          .lte('posting_datetime', dateTo   + 'T23:59:59')
          .order('posting_datetime', { ascending: false })
          .limit(2000),
      ])

      if (error) throw error
      if (wData) setWarehouses(wData)
      if (sData) setRows(sData)
    } catch (err) {
      toast.error('Failed to load stock ledger: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, warehouseId, typeTab, includeCancelled])

  // ── Filter → balance → display ──────────────────────────────────────────────
  const displayRows = useMemo(() => {
    // 1. Apply filters
    let filtered = rows.filter(r => {
      if (!includeCancelled && r.is_cancelled) return false
      if (warehouseId && r.warehouse_id !== warehouseId) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const name = r.items?.name?.toLowerCase() || ''
        const code = r.items?.item_code?.toLowerCase() || ''
        if (!name.includes(q) && !code.includes(q)) return false
      }
      if (!matchesTypeTab(typeTab, r)) return false
      return true
    })

    // 2. Sort ASC for balance computation
    const sorted = [...filtered].sort((a, b) =>
      new Date(a.posting_datetime) - new Date(b.posting_datetime)
    )

    // 3. Compute running balance
    const withBalance = addRunningBalance(sorted)

    // 4. Reverse for display (most recent first)
    return withBalance.reverse()
  }, [rows, search, warehouseId, typeTab, includeCancelled])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalEntries  = displayRows.length
    const totalReceipts = displayRows.reduce((s, r) => r.actual_qty > 0 ? s + r.actual_qty : s, 0)
    const totalIssues   = displayRows.reduce((s, r) => r.actual_qty < 0 ? s + Math.abs(r.actual_qty) : s, 0)
    const netMovement   = totalReceipts - totalIssues
    return { totalEntries, totalReceipts, totalIssues, netMovement }
  }, [displayRows])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages    = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pagedRows     = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!displayRows.length) return toast.error('Nothing to export')
    exportXLSX(
      displayRows.map(r => ({
        'Date & Time':    fmtDT(r.posting_datetime),
        'Voucher Type':   r.voucher_type || '',
        'Voucher No':     r.voucher_no || '',
        'Item Code':      r.items?.item_code || '',
        'Item':           r.items?.name || r.item_id,
        'Unit':           r.items?.unit || '',
        'Warehouse':      r.warehouses?.name || r.warehouse_id,
        'In Qty':         r.actual_qty > 0  ? r.actual_qty  : '',
        'Out Qty':        r.actual_qty < 0  ? Math.abs(r.actual_qty) : '',
        'Balance':        r.running_balance,
        'Rate':           r.valuation_rate ?? r.incoming_rate ?? '',
        'Value':          r.actual_qty !== 0
                            ? Math.abs(r.actual_qty) * (r.valuation_rate ?? r.incoming_rate ?? 0)
                            : '',
        'Posted By':      r.created_by || '',
        'Cancelled':      r.is_cancelled ? 'Yes' : 'No',
      })),
      `StockLedger_${dateTag()}`,
      'Stock Ledger'
    )
    toast.success('Exported')
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Stock Ledger"
        subtitle="Complete SLE audit trail — every stock movement in chronological order"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
        <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
          <span className="material-icons">{loading ? 'hourglass_empty' : 'refresh'}</span>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </PageHeader>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          label="Total Entries"
          value={kpi.totalEntries.toLocaleString()}
          icon="list_alt"
        />
        <KPICard
          label="Total Receipts"
          value={fmtNum(kpi.totalReceipts)}
          sub="units received"
          color="green"
          icon="arrow_downward"
        />
        <KPICard
          label="Total Issues"
          value={fmtNum(kpi.totalIssues)}
          sub="units issued"
          color="red"
          icon="arrow_upward"
        />
        <KPICard
          label="Net Movement"
          value={fmtNum(kpi.netMovement)}
          sub={kpi.netMovement >= 0 ? 'net receipt' : 'net issue'}
          color={kpi.netMovement >= 0 ? 'teal' : 'yellow'}
          icon="swap_vert"
        />
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Item search */}
          <div style={{ position: 'relative' }}>
            <span className="material-icons" style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 16, color: 'var(--text-dim)', pointerEvents: 'none',
            }}>search</span>
            <input
              className="form-control"
              placeholder="Search item…"
              style={{ maxWidth: 200, paddingLeft: 32 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Warehouse */}
          <select
            className="form-control"
            style={{ maxWidth: 180 }}
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
          >
            <option value="">All Warehouses</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date"
            className="form-control"
            style={{ width: 140 }}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span>
          <input
            type="date"
            className="form-control"
            style={{ width: 140 }}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />

          {/* Include Cancelled toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 12, color: 'var(--text-mid)', userSelect: 'none', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={e => setIncludeCancelled(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Include Cancelled
          </label>

          {/* Clear */}
          {(search || warehouseId) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setWarehouseId('') }}
            >
              <span className="material-icons">clear</span> Clear
            </button>
          )}

          {/* Result count */}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {displayRows.length.toLocaleString()} entries
            {displayRows.length > rows.length && ''}
            {rows.length >= 2000 && (
              <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>(showing first 2 000 from DB)</span>
            )}
          </span>
        </div>

        {/* Type Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
          {TYPE_TABS.map(t => (
            <button
              key={t.key}
              className="btn btn-sm"
              style={{
                background: typeTab === t.key ? 'var(--gold)' : 'var(--surface2)',
                color:      typeTab === t.key ? '#fff' : 'var(--text-mid)',
                border:     `1px solid ${typeTab === t.key ? 'var(--gold)' : 'var(--border2)'}`,
              }}
              onClick={() => setTypeTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>
                hourglass_empty
              </span>
              Loading stock ledger…
            </div>
          ) : pagedRows.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              message="No ledger entries match the current filters"
            />
          ) : (
            <table className="stock-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Date &amp; Time</th>
                  <th>Voucher Type</th>
                  <th>Voucher No</th>
                  <th>Item</th>
                  <th>Warehouse</th>
                  <th style={{ textAlign: 'right' }}>In Qty</th>
                  <th style={{ textAlign: 'right' }}>Out Qty</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th>Posted By</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, idx) => {
                  const rate  = r.valuation_rate ?? r.incoming_rate ?? r.outgoing_rate ?? 0
                  const qty   = r.actual_qty || 0
                  const value = Math.abs(qty) * rate
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1
                  return (
                    <tr key={r.id} style={rowStyle(r)}>
                      <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {rowNum}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {fmtDT(r.posting_datetime)}
                      </td>
                      <td>
                        <VoucherBadge type={r.voucher_type} />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)' }}>
                        {r.voucher_no || '—'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.items?.name || r.item_id}</div>
                        {r.items?.item_code && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {r.items.item_code}
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-mid)' }}>
                        {r.warehouses?.name || r.warehouse_id}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {qty > 0 ? (
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                            +{fmtNum(qty)}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {qty < 0 ? (
                          <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                            {fmtNum(Math.abs(qty))}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        <span style={{
                          color: r.running_balance > 0
                            ? 'var(--text)'
                            : r.running_balance < 0
                              ? 'var(--red)'
                              : 'var(--text-dim)',
                        }}>
                          {fmtNum(r.running_balance)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-mid)' }}>
                        {rate ? fmtNum(rate) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {qty !== 0 && rate ? fmtNum(value) : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {r.created_by || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && displayRows.length > PAGE_SIZE && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              Page {page} of {totalPages} &nbsp;·&nbsp; {displayRows.length.toLocaleString()} entries
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <span className="material-icons">chevron_left</span> Prev
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next <span className="material-icons">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
