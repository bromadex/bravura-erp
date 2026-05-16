import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useFleet } from '../../contexts/FleetContext'
import {
  PageHeader, KPICard, ModalDialog, ModalActions, TabNav, EmptyState, Spinner,
} from '../../components/ui'

const CAUSE_CATEGORIES = [
  { value: 'mechanical',     label: 'Mechanical',      color: '#f87171' },
  { value: 'electrical',     label: 'Electrical',      color: '#fbbf24' },
  { value: 'tyre',           label: 'Tyre',            color: '#34d399' },
  { value: 'accident',       label: 'Accident',        color: '#f43f5e' },
  { value: 'scheduled',      label: 'Scheduled',       color: '#60a5fa' },
  { value: 'operator_error', label: 'Operator Error',  color: '#a78bfa' },
  { value: 'other',          label: 'Other',           color: '#94a3b8' },
]

const causeColor = (cat) => CAUSE_CATEGORIES.find(c => c.value === cat)?.color || '#94a3b8'

const fmt = (n, dec = 1) => (n == null || isNaN(n)) ? '—' : Number(n).toFixed(dec)
const fmtMoney = (n) => (n == null || isNaN(n)) ? '—' : `K${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function monthKey(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
}

const BLANK_LOG = {
  asset_id: '', asset_type: 'vehicle',
  breakdown_date: new Date().toISOString().slice(0, 16),
  cause_category: 'mechanical',
  description: '',
  odometer_at_breakdown: '',
  breakdown_location: '',
  initial_notes: '',
}

const BLANK_CLOSE = {
  closed_at: new Date().toISOString().slice(0, 16),
  repair_cost: '',
  resolution_notes: '',
}

export default function DowntimeAnalytics() {
  const {
    vehicles, generators, earthMovers,
    downtimeLogs, addDowntimeLog, closeDowntimeLog, getAssetReliability, loading,
  } = useFleet()

  const [tab, setTab] = useState(0)

  // ── Breakdown Log filters ──────────────────────────────
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterAsset, setFilterAsset] = useState('')
  const [filterCause, setFilterCause] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── Log Breakdown modal ──────────────────────────────
  const [logOpen, setLogOpen] = useState(false)
  const [logForm, setLogForm] = useState(BLANK_LOG)
  const [logSaving, setLogSaving] = useState(false)

  // ── Close Downtime modal ──────────────────────────────
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeTarget, setCloseTarget] = useState(null)
  const [closeForm, setCloseForm] = useState(BLANK_CLOSE)
  const [closeSaving, setCloseSaving] = useState(false)

  // ── MTBF expanded rows ──────────────────────────────
  const [expandedAsset, setExpandedAsset] = useState(null)

  // ── Cause Analysis month toggle ──────────────────────
  const [causeByMonth, setCauseByMonth] = useState(false)

  useEffect(() => {
    if (logOpen) setLogForm(BLANK_LOG)
  }, [logOpen])

  useEffect(() => {
    if (closeOpen) setCloseForm(BLANK_CLOSE)
  }, [closeOpen])

  // ── All assets flat list ──────────────────────────────
  const allAssets = useMemo(() => [
    ...vehicles.map(v => ({ id: v.id, label: v.reg, type: 'vehicle' })),
    ...generators.map(g => ({ id: g.id, label: g.gen_code, type: 'generator' })),
    ...earthMovers.map(e => ({ id: e.id, label: e.reg, type: 'earthmover' })),
  ], [vehicles, generators, earthMovers])

  const assetLabel = (id) => allAssets.find(a => a.id === id)?.label || id

  // ── Summary KPIs ──────────────────────────────────────
  const kpis = useMemo(() => {
    const total = downtimeLogs.length
    const open = downtimeLogs.filter(d => d.status === 'open').length
    const resolved = downtimeLogs.filter(d => d.status === 'resolved' && d.downtime_hours > 0)
    const avgMttr = resolved.length
      ? resolved.reduce((s, d) => s + d.downtime_hours, 0) / resolved.length
      : null
    // Fleet availability: aggregate across all assets
    const assetIds = [...new Set(downtimeLogs.map(d => d.asset_id))]
    let totalAvail = 0, countAvail = 0
    assetIds.forEach(id => {
      const r = getAssetReliability(id)
      if (r.breakdowns > 0) { totalAvail += r.availability; countAvail++ }
    })
    const fleetAvail = countAvail > 0 ? totalAvail / countAvail : 100
    return { total, open, avgMttr, fleetAvail }
  }, [downtimeLogs, getAssetReliability])

  // ── Tab 1: filtered logs ──────────────────────────────
  const filteredLogs = useMemo(() => {
    return downtimeLogs.filter(d => {
      if (filterFrom && d.breakdown_date < filterFrom) return false
      if (filterTo && d.breakdown_date > filterTo + 'T23:59') return false
      if (filterAsset && d.asset_id !== filterAsset) return false
      if (filterCause && d.cause_category !== filterCause) return false
      if (filterStatus && d.status !== filterStatus) return false
      return true
    })
  }, [downtimeLogs, filterFrom, filterTo, filterAsset, filterCause, filterStatus])

  // ── Tab 2: per-asset reliability ──────────────────────
  const assetReliability = useMemo(() => {
    const rows = allAssets.map(a => {
      const r = getAssetReliability(a.id)
      const totalCost = downtimeLogs
        .filter(d => d.asset_id === a.id)
        .reduce((s, d) => s + (d.repair_cost || 0), 0)
      return { ...a, ...r, totalCost }
    }).filter(r => r.breakdowns > 0)
    rows.sort((a, b) => b.breakdowns - a.breakdowns)
    return rows
  }, [allAssets, downtimeLogs, getAssetReliability])

  const assetBreakdowns = (assetId) =>
    downtimeLogs.filter(d => d.asset_id === assetId)
      .sort((a, b) => new Date(a.breakdown_date) - new Date(b.breakdown_date))

  // ── Tab 3: cause analysis ──────────────────────────────
  const causeAnalysis = useMemo(() => {
    const map = {}
    CAUSE_CATEGORIES.forEach(c => { map[c.value] = { cause: c.value, count: 0, totalHours: 0, totalCost: 0 } })
    downtimeLogs.forEach(d => {
      const cat = d.cause_category || 'other'
      if (!map[cat]) map[cat] = { cause: cat, count: 0, totalHours: 0, totalCost: 0 }
      map[cat].count++
      map[cat].totalHours += d.downtime_hours || 0
      map[cat].totalCost += d.repair_cost || 0
    })
    const total = downtimeLogs.length || 1
    return Object.values(map)
      .filter(c => c.count > 0)
      .map(c => ({
        ...c,
        pct: (c.count / total * 100).toFixed(1),
        avgMttr: c.count > 0 ? c.totalHours / c.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [downtimeLogs])

  const causeByMonthData = useMemo(() => {
    const monthMap = {}
    downtimeLogs.forEach(d => {
      const mk = monthKey(d.breakdown_date)
      if (!mk) return
      if (!monthMap[mk]) monthMap[mk] = {}
      const cat = d.cause_category || 'other'
      monthMap[mk][cat] = (monthMap[mk][cat] || 0) + 1
    })
    return Object.keys(monthMap).sort().slice(-12).map(mk => ({
      month: mk,
      label: monthLabel(mk),
      ...monthMap[mk],
    }))
  }, [downtimeLogs])

  // ── Tab 4: monthly trend ──────────────────────────────
  const trendData = useMemo(() => {
    const map = {}
    downtimeLogs.forEach(d => {
      const mk = monthKey(d.breakdown_date)
      if (!mk) return
      if (!map[mk]) map[mk] = { events: 0, totalHours: 0, totalCost: 0 }
      map[mk].events++
      map[mk].totalHours += d.downtime_hours || 0
      map[mk].totalCost += d.repair_cost || 0
    })
    // Build rolling 12-month window relative to today
    const months = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      months.push({ mk, label: monthLabel(mk), ...(map[mk] || { events: 0, totalHours: 0, totalCost: 0 }) })
    }
    // Fleet availability per month (rough: downtime / available_hours=730)
    months.forEach(m => {
      const avail = m.totalHours > 0
        ? Math.max(0, (1 - m.totalHours / (allAssets.length * 730)) * 100)
        : 100
      m.fleetAvail = +avail.toFixed(1)
    })
    return months
  }, [downtimeLogs, allAssets])

  const worstMonthIdx = useMemo(() => {
    if (!trendData.length) return -1
    let worst = 0
    trendData.forEach((m, i) => { if (m.totalCost > trendData[worst].totalCost) worst = i })
    return worst
  }, [trendData])

  // ── Handlers ──────────────────────────────────────────
  const handleLogSubmit = async (e) => {
    e.preventDefault()
    if (!logForm.asset_id) return toast.error('Select an asset')
    setLogSaving(true)
    try {
      await addDowntimeLog({
        asset_id: logForm.asset_id,
        asset_type: logForm.asset_type,
        breakdown_date: logForm.breakdown_date,
        cause_category: logForm.cause_category,
        description: logForm.description,
        odometer_at_breakdown: logForm.odometer_at_breakdown ? +logForm.odometer_at_breakdown : null,
        breakdown_location: logForm.breakdown_location,
        resolution_notes: logForm.initial_notes || null,
        status: 'open',
        downtime_hours: null,
        repair_cost: null,
        closed_at: null,
      })
      toast.success('Breakdown logged')
      setLogOpen(false)
    } catch (err) {
      toast.error(err.message || 'Failed to log breakdown')
    } finally {
      setLogSaving(false)
    }
  }

  const openCloseModal = (log) => {
    setCloseTarget(log)
    setCloseOpen(true)
  }

  const handleCloseSubmit = async (e) => {
    e.preventDefault()
    if (!closeForm.closed_at) return toast.error('Closed date/time required')
    setCloseSaving(true)
    try {
      await closeDowntimeLog(closeTarget.id, {
        closed_at: closeForm.closed_at,
        repair_cost: closeForm.repair_cost ? +closeForm.repair_cost : null,
        resolution_notes: closeForm.resolution_notes || null,
      })
      toast.success('Downtime event closed')
      setCloseOpen(false)
      setCloseTarget(null)
    } catch (err) {
      toast.error(err.message || 'Failed to close event')
    } finally {
      setCloseSaving(false)
    }
  }

  const availColor = (pct) => {
    if (pct >= 90) return 'var(--green)'
    if (pct >= 75) return 'var(--yellow)'
    return 'var(--red)'
  }

  const tabs = ['Breakdown Log', 'MTBF / MTTR', 'Cause Analysis', 'Trend Analysis']

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <PageHeader title="Vehicle Downtime Analytics">
        <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
          <span className="material-icons">add</span> Log Breakdown
        </button>
      </PageHeader>

      {/* ── KPI Bar ── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))' }}>
        <KPICard label="Total Breakdowns" value={kpis.total} sub="All time" icon="build" color="gold" />
        <KPICard label="Open Breakdowns" value={kpis.open} sub="Active events" icon="warning" color="red" />
        <KPICard label="Avg MTTR" value={kpis.avgMttr != null ? `${fmt(kpis.avgMttr)} h` : '—'} sub="Mean time to repair" icon="timer" color="yellow" />
        <KPICard label="Fleet Availability" value={`${fmt(kpis.fleetAvail)}%`} sub="Avg across assets" icon="check_circle" color="green" />
      </div>

      {/* ── Tabs ── */}
      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* ════════════════════════════════════════════════
          TAB 1 — BREAKDOWN LOG
      ════════════════════════════════════════════════ */}
      {tab === 0 && (
        <div>
          {/* Filters */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
              <div className="form-group">
                <label>From Date</label>
                <input type="date" className="form-control" value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)} />
              </div>
              <div className="form-group">
                <label>To Date</label>
                <input type="date" className="form-control" value={filterTo}
                  onChange={e => setFilterTo(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Asset</label>
                <select className="form-control" value={filterAsset} onChange={e => setFilterAsset(e.target.value)}>
                  <option value="">All Assets</option>
                  {allAssets.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Cause</label>
                <select className="form-control" value={filterCause} onChange={e => setFilterCause(e.target.value)}>
                  <option value="">All Causes</option>
                  {CAUSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <label style={{ visibility: 'hidden' }}>.</label>
                <button className="btn btn-secondary" onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterAsset(''); setFilterCause(''); setFilterStatus('') }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>clear</span> Clear
                </button>
              </div>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <EmptyState icon="build" message="No breakdown events match filters" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Date</th>
                    <th>Location</th>
                    <th>Cause</th>
                    <th>Description</th>
                    <th>Downtime (h)</th>
                    <th>Repair Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(d => (
                    <tr key={d.id} style={{
                      borderLeft: d.status === 'open'
                        ? '3px solid var(--yellow)'
                        : '3px solid var(--green)',
                    }}>
                      <td style={{ fontWeight: 600 }}>{assetLabel(d.asset_id)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {fmtDate(d.breakdown_date)}
                      </td>
                      <td style={{ color: 'var(--text-mid)', fontSize: 12 }}>{d.breakdown_location || '—'}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
                          color: causeColor(d.cause_category),
                        }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: causeColor(d.cause_category), flexShrink: 0,
                          }} />
                          {CAUSE_CATEGORIES.find(c => c.value === d.cause_category)?.label || d.cause_category}
                        </span>
                      </td>
                      <td style={{ maxWidth: 220, color: 'var(--text-mid)', fontSize: 12 }}>{d.description || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
                        {d.downtime_hours != null ? fmt(d.downtime_hours) : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>
                        {fmtMoney(d.repair_cost)}
                      </td>
                      <td>
                        <span className={`badge ${d.status === 'open' ? 'badge-yellow' : 'badge-green'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td>
                        {d.status === 'open' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openCloseModal(d)}>
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 2 — MTBF / MTTR ANALYSIS
      ════════════════════════════════════════════════ */}
      {tab === 1 && (
        <div>
          {assetReliability.length === 0 ? (
            <EmptyState icon="analytics" message="No downtime data available" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Breakdowns</th>
                    <th style={{ textAlign: 'right' }}>MTBF (hrs)</th>
                    <th style={{ textAlign: 'right' }}>MTTR (hrs)</th>
                    <th style={{ textAlign: 'right' }}>Availability %</th>
                    <th style={{ textAlign: 'right' }}>Total Repair Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {assetReliability.map(row => (
                    <>
                      <tr
                        key={row.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedAsset(expandedAsset === row.id ? null : row.id)}
                      >
                        <td style={{ fontWeight: 600 }}>
                          <span className="material-icons" style={{ fontSize: 14, marginRight: 6, verticalAlign: 'middle', color: 'var(--text-dim)' }}>
                            {expandedAsset === row.id ? 'expand_less' : 'expand_more'}
                          </span>
                          {row.label}
                        </td>
                        <td style={{ color: 'var(--text-mid)', fontSize: 12, textTransform: 'capitalize' }}>{row.type}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{row.breakdowns}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {row.mtbf != null ? fmt(row.mtbf) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(row.mttr)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: availColor(row.availability), fontWeight: 700 }}>
                          {fmt(row.availability)}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(row.totalCost)}</td>
                      </tr>
                      {expandedAsset === row.id && (
                        <tr key={`${row.id}-exp`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10, letterSpacing: 1 }}>
                                BREAKDOWN TIMELINE — {row.label}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {assetBreakdowns(row.id).map((bd, i) => (
                                  <div key={bd.id} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 12,
                                    padding: '8px 12px', background: 'var(--surface)', borderRadius: 8,
                                    borderLeft: `3px solid ${causeColor(bd.cause_category)}`,
                                  }}>
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', minWidth: 90 }}>
                                      {fmtDate(bd.breakdown_date)}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                                        {CAUSE_CATEGORIES.find(c => c.value === bd.cause_category)?.label || bd.cause_category}
                                        {bd.breakdown_location && <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>· {bd.breakdown_location}</span>}
                                      </div>
                                      {bd.description && <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 2 }}>{bd.description}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: 11, fontFamily: 'var(--mono)' }}>
                                      <div style={{ color: bd.downtime_hours ? 'var(--yellow)' : 'var(--text-dim)' }}>
                                        {bd.downtime_hours ? `${fmt(bd.downtime_hours)} h` : 'open'}
                                      </div>
                                      {bd.repair_cost > 0 && <div style={{ color: 'var(--text-mid)' }}>{fmtMoney(bd.repair_cost)}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {/* Summary totals */}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2} style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)' }}>TOTALS / AVERAGES</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {assetReliability.reduce((s, r) => s + r.breakdowns, 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {fmt(assetReliability.filter(r => r.mtbf).reduce((s, r) => s + r.mtbf, 0) / (assetReliability.filter(r => r.mtbf).length || 1))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {fmt(assetReliability.reduce((s, r) => s + r.mttr, 0) / (assetReliability.length || 1))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: availColor(assetReliability.reduce((s, r) => s + r.availability, 0) / (assetReliability.length || 1)) }}>
                      {fmt(assetReliability.reduce((s, r) => s + r.availability, 0) / (assetReliability.length || 1))}%
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {fmtMoney(assetReliability.reduce((s, r) => s + r.totalCost, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 3 — CAUSE ANALYSIS
      ════════════════════════════════════════════════ */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button
              className={causeByMonth ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setCauseByMonth(v => !v)}
            >
              <span className="material-icons" style={{ fontSize: 15 }}>calendar_month</span>
              {causeByMonth ? 'By Month: ON' : 'By Month'}
            </button>
          </div>

          {!causeByMonth ? (
            causeAnalysis.length === 0 ? (
              <EmptyState icon="pie_chart" message="No downtime data to analyse" />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Cause</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                      <th>% of Total</th>
                      <th style={{ textAlign: 'right' }}>Total Downtime (h)</th>
                      <th style={{ textAlign: 'right' }}>Total Repair Cost</th>
                      <th style={{ textAlign: 'right' }}>Avg MTTR (h)</th>
                      <th style={{ minWidth: 140 }}>Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {causeAnalysis.map(row => {
                      const maxCount = causeAnalysis[0]?.count || 1
                      const barW = ((row.count / maxCount) * 100).toFixed(1)
                      return (
                        <tr key={row.cause}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 10, height: 10, borderRadius: '50%', background: causeColor(row.cause), flexShrink: 0 }} />
                              <span style={{ fontWeight: 600 }}>
                                {CAUSE_CATEGORIES.find(c => c.value === row.cause)?.label || row.cause}
                              </span>
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{row.count}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{row.pct}%</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(row.totalHours)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(row.totalCost)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(row.avgMttr)}</td>
                          <td>
                            <div style={{ height: 14, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${barW}%`,
                                background: causeColor(row.cause),
                                borderRadius: 4, transition: 'width .4s',
                              }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* By-month breakdown table */
            causeByMonthData.length === 0 ? (
              <EmptyState icon="calendar_month" message="No monthly data available" />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      {CAUSE_CATEGORIES.map(c => <th key={c.value} style={{ textAlign: 'right', color: c.color }}>{c.label}</th>)}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {causeByMonthData.map(row => {
                      const total = CAUSE_CATEGORIES.reduce((s, c) => s + (row[c.value] || 0), 0)
                      return (
                        <tr key={row.month}>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{row.label}</td>
                          {CAUSE_CATEGORIES.map(c => (
                            <td key={c.value} style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row[c.value] ? c.color : 'var(--text-dim)' }}>
                              {row[c.value] || '—'}
                            </td>
                          ))}
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 4 — TREND ANALYSIS
      ════════════════════════════════════════════════ */}
      {tab === 3 && (
        <div>
          {trendData.every(m => m.events === 0) ? (
            <EmptyState icon="trending_up" message="No trend data for the past 12 months" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Events</th>
                    <th style={{ textAlign: 'right' }}>Total Downtime (h)</th>
                    <th style={{ textAlign: 'right' }}>Total Repair Cost</th>
                    <th style={{ textAlign: 'right' }}>Fleet Availability %</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.map((row, i) => {
                    const isWorst = i === worstMonthIdx && row.events > 0
                    return (
                      <tr key={row.mk} style={isWorst ? { background: 'rgba(248,113,113,.08)' } : {}}>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: isWorst ? 700 : 400 }}>
                          {row.label}
                          {isWorst && (
                            <span className="badge badge-red" style={{ marginLeft: 8 }}>Worst</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.events > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                          {row.events || '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.totalHours > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                          {row.totalHours > 0 ? fmt(row.totalHours) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.totalCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                          {row.totalCost > 0 ? fmtMoney(row.totalCost) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: availColor(row.fleetAvail), fontWeight: 700 }}>
                          {fmt(row.fleetAvail)}%
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals */}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)' }}>12-MONTH TOTAL</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{trendData.reduce((s, m) => s + m.events, 0)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(trendData.reduce((s, m) => s + m.totalHours, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(trendData.reduce((s, m) => s + m.totalCost, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          MODAL — LOG BREAKDOWN
      ════════════════════════════════════════════════ */}
      <ModalDialog open={logOpen} onClose={() => setLogOpen(false)} title="Log Breakdown Event" size="lg">
        <form onSubmit={handleLogSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Asset Type</label>
              <select className="form-control" value={logForm.asset_type}
                onChange={e => setLogForm({ ...logForm, asset_type: e.target.value, asset_id: '' })}>
                <option value="vehicle">Vehicle</option>
                <option value="generator">Generator</option>
                <option value="earthmover">Heavy Equipment</option>
              </select>
            </div>
            <div className="form-group">
              <label>Asset *</label>
              <select className="form-control" required value={logForm.asset_id}
                onChange={e => setLogForm({ ...logForm, asset_id: e.target.value })}>
                <option value="">Select asset…</option>
                {allAssets.filter(a => a.type === logForm.asset_type).map(a => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Breakdown Date &amp; Time *</label>
              <input type="datetime-local" className="form-control" required
                value={logForm.breakdown_date}
                onChange={e => setLogForm({ ...logForm, breakdown_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Cause Category *</label>
              <select className="form-control" required value={logForm.cause_category}
                onChange={e => setLogForm({ ...logForm, cause_category: e.target.value })}>
                {CAUSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Odometer at Breakdown (km)</label>
              <input type="number" className="form-control" placeholder="e.g. 123456"
                value={logForm.odometer_at_breakdown}
                onChange={e => setLogForm({ ...logForm, odometer_at_breakdown: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Breakdown Location</label>
              <input type="text" className="form-control" placeholder="e.g. North Haul Road – Km 14"
                value={logForm.breakdown_location}
                onChange={e => setLogForm({ ...logForm, breakdown_location: e.target.value })} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 4 }}>
            <label>Description *</label>
            <textarea className="form-control" rows={3} required placeholder="Brief description of the breakdown…"
              value={logForm.description}
              onChange={e => setLogForm({ ...logForm, description: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginTop: 4 }}>
            <label>Initial Notes</label>
            <textarea className="form-control" rows={2} placeholder="Initial observations, actions taken…"
              value={logForm.initial_notes}
              onChange={e => setLogForm({ ...logForm, initial_notes: e.target.value })} />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setLogOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={logSaving}>
              {logSaving ? 'Saving…' : 'Log Breakdown'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ════════════════════════════════════════════════
          MODAL — CLOSE DOWNTIME
      ════════════════════════════════════════════════ */}
      <ModalDialog open={closeOpen} onClose={() => { setCloseOpen(false); setCloseTarget(null) }}
        title="Close Downtime Event">
        {closeTarget && (
          <form onSubmit={handleCloseSubmit}>
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <strong>{assetLabel(closeTarget.asset_id)}</strong>
              <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>
                · {fmtDate(closeTarget.breakdown_date)}
                · {CAUSE_CATEGORIES.find(c => c.value === closeTarget.cause_category)?.label}
              </span>
              {closeTarget.description && (
                <div style={{ color: 'var(--text-mid)', fontSize: 12, marginTop: 4 }}>{closeTarget.description}</div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Closed At *</label>
                <input type="datetime-local" className="form-control" required
                  value={closeForm.closed_at}
                  onChange={e => setCloseForm({ ...closeForm, closed_at: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Repair Cost (K)</label>
                <input type="number" min="0" step="0.01" className="form-control" placeholder="0.00"
                  value={closeForm.repair_cost}
                  onChange={e => setCloseForm({ ...closeForm, repair_cost: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 4 }}>
              <label>Resolution Notes</label>
              <textarea className="form-control" rows={3} placeholder="What was done to resolve the issue…"
                value={closeForm.resolution_notes}
                onChange={e => setCloseForm({ ...closeForm, resolution_notes: e.target.value })} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setCloseOpen(false); setCloseTarget(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={closeSaving}>
                {closeSaving ? 'Saving…' : 'Close Event'}
              </button>
            </ModalActions>
          </form>
        )}
      </ModalDialog>
    </div>
  )
}
