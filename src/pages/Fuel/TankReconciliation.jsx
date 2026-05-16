// src/pages/Fuel/TankReconciliation.jsx
// Per-period reconciliation: opening balance + deliveries − issuances = theoretical close.
// Variance = theoretical vs actual dipstick reading.

import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { exportXLSX, exportCSV, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

// ─── helpers ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0]
const firstOfMonth = today.slice(0, 8) + '01'

/** Returns YYYY-MM-DD strings for every calendar day between start and end inclusive. */
function eachDay(start, end) {
  const days = []
  const cur = new Date(start)
  const last = new Date(end)
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/** ISO week label: "2026-W19" */
function isoWeekLabel(dateStr) {
  const d = new Date(dateStr)
  const dayOfWeek = d.getUTCDay() || 7            // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek)   // Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** "YYYY-MM" */
function monthLabel(dateStr) {
  return dateStr.slice(0, 7)
}

/** Group dates into buckets based on grouping mode.
 *  Returns [{label, dates:[...]}] sorted ascending by first date. */
function buildBuckets(start, end, grouping) {
  const days = eachDay(start, end)
  if (grouping === 'Daily') return days.map(d => ({ label: d, dates: [d] }))

  const map = new Map()
  for (const d of days) {
    const key = grouping === 'Weekly' ? isoWeekLabel(d) : monthLabel(d)
    if (!map.has(key)) map.set(key, { label: key, dates: [] })
    map.get(key).dates.push(d)
  }
  return Array.from(map.values())
}

/** Extract closing-level (litres) from a dipstick row, handling both column names. */
function dipLevel(row) {
  if (!row) return null
  const v = row.fuel_end != null ? row.fuel_end : row.end_litres != null ? row.end_litres : null
  return v != null ? Number(v) : null
}

/** Variance colour based on absolute percentage. */
function variantColor(pct) {
  const abs = Math.abs(pct)
  if (abs <= 2) return 'var(--green, #22c55e)'
  if (abs <= 5) return 'var(--yellow, #eab308)'
  return 'var(--red, #ef4444)'
}

function StatusBadge({ pct, noDip }) {
  if (noDip) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
        background: 'rgba(148,163,184,.15)', color: 'var(--text-dim, #94a3b8)',
        border: '1px solid rgba(148,163,184,.3)',
      }}>No dipstick</span>
    )
  }
  const abs = Math.abs(pct)
  const col = variantColor(pct)
  const label = abs <= 2 ? 'Normal' : abs <= 5 ? 'Warning' : 'Investigate'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
      background: `${col}18`, color: col, border: `1px solid ${col}44`,
    }}>{label}</span>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export default function TankReconciliation() {
  const [dateFrom,   setDateFrom]   = useState(firstOfMonth)
  const [dateTo,     setDateTo]     = useState(today)
  const [grouping,   setGrouping]   = useState('Daily')
  const [rows,       setRows]       = useState(null)   // null = not yet fetched
  const [loading,    setLoading]    = useState(false)

  // ── fetch & compute ────────────────────────────────────────────────────────

  const run = useCallback(async () => {
    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      toast.error('Set a valid date range first')
      return
    }
    setLoading(true)
    setRows(null)

    try {
      // We need dipstick records from before range start too (for opening balance)
      const [iRes, dRes, dipRes, dipBeforeRes] = await Promise.all([
        supabase.from('fuel_log')
          .select('date, amount')
          .gte('date', dateFrom)
          .lte('date', dateTo),
        supabase.from('fuel_deliveries')
          .select('date, qty')
          .gte('date', dateFrom)
          .lte('date', dateTo),
        supabase.from('dipstick_log')
          .select('date, fuel_end, end_litres')
          .gte('date', dateFrom)
          .lte('date', dateTo)
          .order('date', { ascending: true }),
        // For opening balance: latest dipstick strictly before range start
        supabase.from('dipstick_log')
          .select('date, fuel_end, end_litres')
          .lt('date', dateFrom)
          .order('date', { ascending: false })
          .limit(1),
      ])

      if (iRes.error)        throw iRes.error
      if (dRes.error)        throw dRes.error
      if (dipRes.error)      throw dipRes.error
      if (dipBeforeRes.error) throw dipBeforeRes.error

      const issuances  = iRes.data  || []
      const deliveries = dRes.data  || []
      const dipsticks  = dipRes.data || []
      const dipBefore  = dipBeforeRes.data || []

      const deliveryLitres = (row) => {
        const v = Number(row.qty)
        return isNaN(v) ? 0 : v
      }

      // Build lookup maps keyed by date
      const issuanceByDate = {}
      for (const r of issuances) {
        issuanceByDate[r.date] = (issuanceByDate[r.date] || 0) + Number(r.amount || 0)
      }

      const deliveryByDate = {}
      for (const r of deliveries) {
        deliveryByDate[r.date] = (deliveryByDate[r.date] || 0) + deliveryLitres(r)
      }

      // Dipstick lookup: for each date, keep the last (highest-date) reading
      // dipsticks is already sorted ascending; later entries overwrite earlier ones for same date
      const dipByDate = {}
      for (const r of dipsticks) {
        const lvl = dipLevel(r)
        if (lvl != null) dipByDate[r.date] = lvl
      }

      // Opening balance = latest dipstick before range, or 0 if none
      const priorDip = dipBefore[0]
      const initialOpening = priorDip ? (dipLevel(priorDip) ?? 0) : 0

      // Build period buckets
      const buckets = buildBuckets(dateFrom, dateTo, grouping)

      // Compute reconciliation rows
      let opening = initialOpening
      const computed = []

      for (const bucket of buckets) {
        const { label, dates } = bucket

        const delivered = dates.reduce((s, d) => s + (deliveryByDate[d] || 0), 0)
        const issued    = dates.reduce((s, d) => s + (issuanceByDate[d] || 0), 0)
        const theoretical = opening + delivered - issued

        // Actual close = last dipstick in bucket's dates (dates are sorted asc)
        let actualClose = null
        for (const d of [...dates].reverse()) {
          if (dipByDate[d] != null) { actualClose = dipByDate[d]; break }
        }

        const hasDip = actualClose != null
        let variance = null
        let variancePct = null
        if (hasDip) {
          variance    = theoretical - actualClose
          const denom = Math.max(opening + delivered, 1)
          variancePct = (variance / denom) * 100
        }

        computed.push({
          label,
          opening,
          delivered,
          issued,
          theoretical,
          actualClose,
          hasDip,
          variance,
          variancePct,
        })

        // Next period's opening = this period's actual close (if available) else theoretical
        opening = hasDip ? actualClose : theoretical
      }

      setRows(computed)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load data: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, grouping])

  // ── summary stats ─────────────────────────────────────────────────────────

  const summary = rows
    ? {
        totalDelivered: rows.reduce((s, r) => s + r.delivered, 0),
        totalIssued:    rows.reduce((s, r) => s + r.issued,    0),
        netChange:      rows.reduce((s, r) => s + r.delivered - r.issued, 0),
        highVariance:   rows.filter(r => r.hasDip && Math.abs(r.variancePct) > 5).length,
      }
    : null

  // ── export helpers ────────────────────────────────────────────────────────

  const exportRows = () => {
    if (!rows?.length) return []
    return rows.map(r => ({
      Period:            r.label,
      'Opening (L)':     r.opening.toFixed(2),
      'Delivered (L)':   r.delivered.toFixed(2),
      'Issued (L)':      r.issued.toFixed(2),
      'Theoretical (L)': r.theoretical.toFixed(2),
      'Actual (L)':      r.hasDip ? r.actualClose.toFixed(2) : '',
      'Variance (L)':    r.hasDip ? r.variance.toFixed(2) : '',
      'Variance %':      r.hasDip ? r.variancePct.toFixed(2) + '%' : '',
      Status:            r.hasDip
        ? (Math.abs(r.variancePct) <= 2 ? 'Normal' : Math.abs(r.variancePct) <= 5 ? 'Warning' : 'Investigate')
        : 'No dipstick',
    }))
  }

  const handleExcelExport = () => {
    const data = exportRows()
    if (!data.length) { toast.error('No data to export'); return }
    exportXLSX(data, `TankReconciliation_${dateFrom}_${dateTo}_${dateTag()}`, 'Reconciliation')
    toast.success('Excel exported')
  }

  const handleCSVExport = () => {
    const data = exportRows()
    if (!data.length) { toast.error('No data to export'); return }
    exportCSV(data, `TankReconciliation_${dateFrom}_${dateTo}_${dateTag()}`)
    toast.success('CSV exported')
  }

  // ── render ────────────────────────────────────────────────────────────────

  const hasData = rows && rows.length > 0

  return (
    <div>
      <PageHeader
        title="Tank Reconciliation"
        subtitle="Opening balance + deliveries − issuances = closing. Variance = theoretical vs actual dipstick."
      >
        <button className="btn btn-secondary" onClick={handleExcelExport} disabled={!hasData}>
          <span className="material-icons">table_view</span> Export Excel
        </button>
        <button className="btn btn-secondary" onClick={handleCSVExport} disabled={!hasData}>
          <span className="material-icons">download</span> Export CSV
        </button>
      </PageHeader>

      {/* ── filter bar ── */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Grouping</label>
            <select
              className="form-control"
              value={grouping}
              onChange={e => setGrouping(e.target.value)}
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          <button
            className="btn btn-primary"
            onClick={run}
            disabled={loading}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading
              ? <><span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>refresh</span> Loading…</>
              : <><span className="material-icons">play_arrow</span> Run</>
            }
          </button>
        </div>
      </div>

      {/* ── summary cards (only after fetch) ── */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          <KPICard
            label="Total Delivered"
            value={fmtNum(summary.totalDelivered) + ' L'}
            icon="local_shipping"
            color="blue"
          />
          <KPICard
            label="Total Issued"
            value={fmtNum(summary.totalIssued) + ' L'}
            icon="local_gas_station"
          />
          <KPICard
            label="Net Change"
            value={(summary.netChange >= 0 ? '+' : '') + fmtNum(summary.netChange) + ' L'}
            icon="swap_vert"
            color={summary.netChange >= 0 ? 'green' : ''}
          />
          <KPICard
            label="Periods with Variance > 5%"
            value={summary.highVariance}
            icon="warning"
            color={summary.highVariance === 0 ? 'green' : 'red'}
          />
        </div>
      )}

      {/* ── table ── */}
      {rows === null && !loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.2 }}>balance</span>
          <p style={{ marginTop: 12, color: 'var(--text-dim)' }}>
            Set a date range and press <strong>Run</strong> to compute reconciliation.
          </p>
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>hourglass_empty</span>
          <p>Computing reconciliation…</p>
        </div>
      )}

      {rows !== null && !loading && !hasData && (
        <EmptyState icon="balance" message="No data in range — try a wider date range." />
      )}

      {hasData && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th style={{ textAlign: 'right' }}>Opening (L)</th>
                <th style={{ textAlign: 'right' }}>Delivered (L)</th>
                <th style={{ textAlign: 'right' }}>Issued (L)</th>
                <th style={{ textAlign: 'right' }}>Theoretical (L)</th>
                <th style={{ textAlign: 'right' }}>Actual (L)</th>
                <th style={{ textAlign: 'right' }}>Variance (L)</th>
                <th style={{ textAlign: 'right' }}>Var %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const col = r.hasDip ? variantColor(r.variancePct) : undefined
                return (
                  <tr key={r.label}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(r.opening)}</td>
                    <td style={{ textAlign: 'right', color: r.delivered > 0 ? 'var(--teal, #2dd4bf)' : undefined }}>
                      {r.delivered > 0 ? '+' : ''}{fmtNum(r.delivered)}
                    </td>
                    <td style={{ textAlign: 'right', color: r.issued > 0 ? 'var(--gold, #f4a261)' : undefined }}>
                      {r.issued > 0 ? '−' : ''}{fmtNum(r.issued)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.theoretical)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.hasDip ? fmtNum(r.actualClose) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', color: r.hasDip ? col : undefined, fontWeight: r.hasDip ? 600 : undefined }}>
                      {r.hasDip
                        ? <>{r.variance >= 0 ? '+' : ''}{fmtNum(r.variance)}</>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.hasDip
                        ? (
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: `${col}18`, color: col, border: `1px solid ${col}44`,
                          }}>
                            {r.variancePct >= 0 ? '+' : ''}{r.variancePct.toFixed(2)}%
                          </span>
                        )
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>
                      }
                    </td>
                    <td>
                      <StatusBadge pct={r.variancePct} noDip={!r.hasDip} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {rows.length > 1 && summary && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border, #334155)' }}>
                  <td>Totals</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(rows[0].opening)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(summary.totalDelivered)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(summary.totalIssued)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
