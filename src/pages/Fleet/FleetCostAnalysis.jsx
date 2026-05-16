import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useFleet } from '../../contexts/FleetContext'
import {
  PageHeader, KPICard, TabNav, EmptyState, Spinner,
} from '../../components/ui'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, dec = 0) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtMoney = (n, sym = 'K') =>
  n == null || isNaN(n) ? '—' : `${sym}${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const pct = (part, whole) =>
  whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0'

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

const inRange = (dateStr, from, to) => {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (from && d < new Date(from)) return false
  if (to && d > new Date(to + 'T23:59:59')) return false
  return true
}

const BUDGET_CATS = [
  { key: 'fuel',       label: 'Fuel' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'tyres',      label: 'Tyres' },
  { key: 'downtime',   label: 'Downtime / Repairs' },
  { key: 'total',      label: 'Total' },
]

const ASSET_COLORS = ['#f4a261', '#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf']

export default function FleetCostAnalysis() {
  const {
    vehicles, generators, earthMovers,
    fuelLogs, workOrders, downtimeLogs, tyreInventory,
    getFleetCosts, loading,
  } = useFleet()

  // ── Date range – default current year ──────────────────
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate]     = useState(new Date().toISOString().split('T')[0])

  const [tab, setTab] = useState(0)
  const [expandedRow, setExpandedRow] = useState(null)

  // ── Budget state – localStorage keyed by year ──────────
  const budgetKey = `fleet_cost_budget_${thisYear}`
  const loadBudget = () => {
    try {
      const raw = localStorage.getItem(budgetKey)
      return raw ? JSON.parse(raw) : { fuel: '', maintenance: '', tyres: '', downtime: '', total: '' }
    } catch {
      return { fuel: '', maintenance: '', tyres: '', downtime: '', total: '' }
    }
  }
  const [budget, setBudget] = useState(loadBudget)

  const saveBudget = (updated) => {
    setBudget(updated)
    try { localStorage.setItem(budgetKey, JSON.stringify(updated)) } catch {}
  }

  // ── Summary costs from context ─────────────────────────
  const summary = useMemo(
    () => getFleetCosts(fromDate, toDate),
    [getFleetCosts, fromDate, toDate]
  )

  const activeVehicleCount = useMemo(
    () => [...vehicles, ...generators, ...earthMovers].filter(a => a.status !== 'scrapped' && a.status !== 'disposed').length,
    [vehicles, generators, earthMovers]
  )
  const costPerVehicle = activeVehicleCount > 0 ? summary.total / activeVehicleCount : 0

  // ── Per-asset cost computation ─────────────────────────
  const perAssetCosts = useMemo(() => {
    const allAssets = [
      ...vehicles.map(v => ({ id: v.id, label: v.reg || v.id, type: 'vehicle', assetRef: v.reg, make: v.make, model: v.model, odometer: v.odometer_km, acquisition: v.acquisition_cost })),
      ...generators.map(g => ({ id: g.id, label: g.gen_code || g.id, type: 'generator', assetRef: g.gen_code, make: g.make, model: g.model, odometer: null, hour_meter: g.hour_meter, acquisition: g.acquisition_cost })),
      ...earthMovers.map(e => ({ id: e.id, label: e.reg || e.id, type: 'earthmover', assetRef: e.reg, make: e.make, model: e.model, odometer: null, hour_meter: e.hour_meter, acquisition: e.acquisition_cost })),
    ]

    return allAssets.map(a => {
      // Fuel cost: match by reg (vehicle/earthmover) or gen_code
      const fuelCost = fuelLogs
        .filter(f => inRange(f.date, fromDate, toDate) && f.vehicle === a.assetRef)
        .reduce((s, f) => {
          const tc = f.total_cost > 0 ? f.total_cost : (f.amount || 0) * (f.unit_price || 0)
          return s + tc
        }, 0)

      // Maintenance cost: closed WOs by asset_id
      const maintenanceCost = workOrders
        .filter(wo => wo.asset_id === a.id && wo.status === 'closed' && inRange(wo.actual_end_date, fromDate, toDate))
        .reduce((s, wo) => s + (wo.actual_cost || 0), 0)

      // Downtime cost: repair_cost from downtime_logs by asset_id
      const downtimeCost = downtimeLogs
        .filter(d => d.asset_id === a.id && inRange(d.breakdown_date, fromDate, toDate))
        .reduce((s, d) => s + (d.repair_cost || 0), 0)

      // Tyre cost: purchase_cost where current_vehicle matches asset id
      const tyreCost = tyreInventory
        .filter(t => t.current_vehicle === a.id)
        .reduce((s, t) => s + (t.purchase_cost || 0), 0)

      const total = fuelCost + maintenanceCost + downtimeCost + tyreCost

      // Cost per unit
      let costPerUnit = null
      let unitLabel = null
      if (a.type === 'vehicle' && a.odometer > 0) {
        costPerUnit = total / a.odometer
        unitLabel = '/km'
      } else if ((a.type === 'generator' || a.type === 'earthmover') && a.hour_meter > 0) {
        costPerUnit = total / a.hour_meter
        unitLabel = '/hr'
      }

      return { ...a, fuelCost, maintenanceCost, downtimeCost, tyreCost, total, costPerUnit, unitLabel }
    }).sort((a, b) => b.total - a.total)
  }, [vehicles, generators, earthMovers, fuelLogs, workOrders, downtimeLogs, tyreInventory, fromDate, toDate])

  // ── Monthly cost breakdown (12 months) ─────────────────
  const monthlyCosts = useMemo(() => {
    const now = new Date()
    const months = []
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      const mFrom = mk + '-01'
      const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
      const mTo = `${mk}-${String(lastDay).padStart(2, '0')}`
      const c = getFleetCosts(mFrom, mTo)
      months.push({ mk, label: monthLabel(mk), ...c })
    }
    return months
  }, [getFleetCosts])

  const highestMonthIdx = useMemo(() => {
    if (!monthlyCosts.length) return -1
    let idx = 0
    monthlyCosts.forEach((m, i) => { if (m.total > monthlyCosts[idx].total) idx = i })
    return idx
  }, [monthlyCosts])

  // ── Benchmarking: avg cost per km by type/make ─────────
  const benchmarkByType = useMemo(() => {
    const map = {}
    perAssetCosts.forEach(a => {
      const key = `${a.type}|${a.make || 'Unknown'}`
      if (!map[key]) map[key] = { type: a.type, make: a.make || 'Unknown', total: 0, count: 0, totalKm: 0 }
      map[key].total += a.total
      map[key].count++
      if (a.type === 'vehicle' && a.odometer) map[key].totalKm += a.odometer
    })
    return Object.values(map).map(g => ({
      ...g,
      avgCostPerKm: g.type === 'vehicle' && g.totalKm > 0 ? g.total / g.totalKm : null,
      avgTotal: g.count > 0 ? g.total / g.count : 0,
    })).sort((a, b) => b.avgTotal - a.avgTotal)
  }, [perAssetCosts])

  // ── This year vs last year ─────────────────────────────
  const yearComparison = useMemo(() => {
    const ty = getFleetCosts(`${thisYear}-01-01`, `${thisYear}-12-31`)
    const ly = getFleetCosts(`${thisYear - 1}-01-01`, `${thisYear - 1}-12-31`)
    return [
      { label: 'Fuel',        thisYear: ty.fuelCost,        lastYear: ly.fuelCost },
      { label: 'Maintenance', thisYear: ty.maintenanceCost, lastYear: ly.maintenanceCost },
      { label: 'Downtime',    thisYear: ty.downtimeCost,    lastYear: ly.downtimeCost },
      { label: 'Total',       thisYear: ty.total,           lastYear: ly.total },
    ]
  }, [getFleetCosts, thisYear])

  // ── CSS cost-bar breakdown ─────────────────────────────
  const costBar = useMemo(() => {
    const t = summary.total || 1
    return [
      { label: 'Fuel',        value: summary.fuelCost,        color: '#f4a261', pct: (summary.fuelCost / t * 100).toFixed(1) },
      { label: 'Maintenance', value: summary.maintenanceCost, color: '#60a5fa', pct: (summary.maintenanceCost / t * 100).toFixed(1) },
      { label: 'Downtime',    value: summary.downtimeCost,    color: '#f87171', pct: (summary.downtimeCost / t * 100).toFixed(1) },
    ]
  }, [summary])

  // ── Budget tab tyre cost ───────────────────────────────
  const actualTyreCost = useMemo(
    () => tyreInventory
      .filter(t => {
        const fy = t.created_at ? new Date(t.created_at).getFullYear() : 0
        return fy === thisYear
      })
      .reduce((s, t) => s + (t.purchase_cost || 0), 0),
    [tyreInventory, thisYear]
  )

  const tabs = ['Fleet Overview', 'Per-Vehicle TCO', 'Cost Benchmarking', 'Budget vs Actual']

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <PageHeader title="Fleet Cost Analysis — TCO" />

      {/* ── Date Range Filter ── */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label>From Date</label>
            <input type="date" className="form-control" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label>To Date</label>
            <input type="date" className="form-control" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => { setFromDate(`${thisYear}-01-01`); setToDate(new Date().toISOString().split('T')[0]) }}>
            <span className="material-icons" style={{ fontSize: 15 }}>refresh</span> This Year
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setFromDate(`${thisYear - 1}-01-01`); setToDate(`${thisYear - 1}-12-31`) }}>
            Last Year
          </button>
        </div>
      </div>

      {/* ── KPI Bar ── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))' }}>
        <KPICard label="Total Fleet Cost" value={fmtMoney(summary.total)} sub={`${fromDate} – ${toDate}`} icon="payments" color="gold" />
        <KPICard label="Fuel Cost" value={fmtMoney(summary.fuelCost)} sub={`${pct(summary.fuelCost, summary.total)}% of total`} icon="local_gas_station" color="yellow" />
        <KPICard label="Maintenance Cost" value={fmtMoney(summary.maintenanceCost)} sub={`${pct(summary.maintenanceCost, summary.total)}% of total`} icon="build" color="blue" />
        <KPICard label="Downtime / Repair" value={fmtMoney(summary.downtimeCost)} sub={`${pct(summary.downtimeCost, summary.total)}% of total`} icon="warning" color="red" />
        <KPICard label="Cost per Active Asset" value={fmtMoney(costPerVehicle)} sub={`${activeVehicleCount} active assets`} icon="directions_car" color="teal" />
      </div>

      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* ════════════════════════════════════════════════
          TAB 1 — FLEET OVERVIEW
      ════════════════════════════════════════════════ */}
      {tab === 0 && (
        <div>
          {/* Cost breakdown bar */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 14 }}>
              COST BREAKDOWN
            </div>
            {/* Segmented bar */}
            <div style={{ height: 28, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 14 }}>
              {costBar.map(seg => (
                <div
                  key={seg.label}
                  style={{ width: `${seg.pct}%`, background: seg.color, transition: 'width .4s', minWidth: seg.value > 0 ? 2 : 0 }}
                  title={`${seg.label}: ${fmtMoney(seg.value)} (${seg.pct}%)`}
                />
              ))}
              {summary.total === 0 && <div style={{ width: '100%', background: 'var(--surface2)' }} />}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {costBar.map(seg => (
                <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12 }}>
                    <strong>{seg.label}</strong>
                    <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>{fmtMoney(seg.value)} ({seg.pct}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly cost table */}
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Fuel</th>
                  <th style={{ textAlign: 'right' }}>Maintenance</th>
                  <th style={{ textAlign: 'right' }}>Downtime</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {monthlyCosts.map((m, i) => {
                  const isHighest = i === highestMonthIdx && m.total > 0
                  return (
                    <tr key={m.mk} style={isHighest ? { background: 'rgba(244,162,97,.08)' } : {}}>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: isHighest ? 700 : 400 }}>
                        {m.label}
                        {isHighest && <span className="badge badge-gold" style={{ marginLeft: 8 }}>Highest</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: m.fuelCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                        {m.fuelCost > 0 ? fmtMoney(m.fuelCost) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: m.maintenanceCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                        {m.maintenanceCost > 0 ? fmtMoney(m.maintenanceCost) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: m.downtimeCost > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                        {m.downtimeCost > 0 ? fmtMoney(m.downtimeCost) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {m.total > 0 ? fmtMoney(m.total) : '—'}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>12-MONTH TOTAL</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtMoney(monthlyCosts.reduce((s, m) => s + m.fuelCost, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtMoney(monthlyCosts.reduce((s, m) => s + m.maintenanceCost, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtMoney(monthlyCosts.reduce((s, m) => s + m.downtimeCost, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {fmtMoney(monthlyCosts.reduce((s, m) => s + m.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 2 — PER-VEHICLE TCO
      ════════════════════════════════════════════════ */}
      {tab === 1 && (
        <div>
          {perAssetCosts.every(a => a.total === 0) ? (
            <EmptyState icon="payments" message="No cost data for the selected period" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Reg / ID</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Fuel</th>
                    <th style={{ textAlign: 'right' }}>Maintenance</th>
                    <th style={{ textAlign: 'right' }}>Downtime</th>
                    <th style={{ textAlign: 'right' }}>Tyres</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {perAssetCosts.map(a => (
                    <>
                      <tr
                        key={a.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedRow(expandedRow === a.id ? null : a.id)}
                      >
                        <td style={{ fontWeight: 600 }}>
                          <span className="material-icons" style={{ fontSize: 14, marginRight: 6, verticalAlign: 'middle', color: 'var(--text-dim)' }}>
                            {expandedRow === a.id ? 'expand_less' : 'expand_more'}
                          </span>
                          {a.label}
                        </td>
                        <td style={{ color: 'var(--text-mid)', fontSize: 12, textTransform: 'capitalize' }}>{a.type}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: a.fuelCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                          {a.fuelCost > 0 ? fmtMoney(a.fuelCost) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: a.maintenanceCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                          {a.maintenanceCost > 0 ? fmtMoney(a.maintenanceCost) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: a.downtimeCost > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {a.downtimeCost > 0 ? fmtMoney(a.downtimeCost) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: a.tyreCost > 0 ? 'var(--text)' : 'var(--text-dim)' }}>
                          {a.tyreCost > 0 ? fmtMoney(a.tyreCost) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: a.total > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>
                          {a.total > 0 ? fmtMoney(a.total) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-mid)' }}>
                          {a.costPerUnit != null
                            ? `K${a.costPerUnit.toFixed(3)}${a.unitLabel}`
                            : '—'}
                        </td>
                      </tr>
                      {expandedRow === a.id && (
                        <tr key={`${a.id}-exp`}>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                                {[
                                  { label: 'Make / Model', value: [a.make, a.model].filter(Boolean).join(' ') || '—' },
                                  { label: 'Acquisition Cost', value: a.acquisition ? fmtMoney(a.acquisition) : '—' },
                                  { label: a.type === 'vehicle' ? 'Odometer' : 'Hour Meter', value: a.type === 'vehicle' ? (a.odometer ? `${fmt(a.odometer)} km` : '—') : (a.hour_meter ? `${fmt(a.hour_meter)} h` : '—') },
                                  { label: 'Fuel Cost', value: fmtMoney(a.fuelCost), color: 'var(--yellow)' },
                                  { label: 'Maintenance Cost', value: fmtMoney(a.maintenanceCost), color: 'var(--blue)' },
                                  { label: 'Downtime Cost', value: fmtMoney(a.downtimeCost), color: 'var(--red)' },
                                  { label: 'Tyre Cost', value: fmtMoney(a.tyreCost), color: 'var(--green)' },
                                  { label: 'Total Cost', value: fmtMoney(a.total), color: 'var(--gold)' },
                                ].map(item => (
                                  <div key={item.label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 14px' }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                                      {item.label.toUpperCase()}
                                    </div>
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: item.color || 'var(--text)' }}>
                                      {item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {/* Mini cost bar for this asset */}
                              {a.total > 0 && (
                                <div style={{ marginTop: 14 }}>
                                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>COST MIX</div>
                                  <div style={{ height: 16, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                                    {[
                                      { v: a.fuelCost, c: '#f4a261' },
                                      { v: a.maintenanceCost, c: '#60a5fa' },
                                      { v: a.downtimeCost, c: '#f87171' },
                                      { v: a.tyreCost, c: '#34d399' },
                                    ].map((seg, idx) => (
                                      <div key={idx} style={{
                                        width: `${(seg.v / a.total * 100).toFixed(1)}%`,
                                        background: seg.c,
                                        minWidth: seg.v > 0 ? 2 : 0,
                                      }} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {/* Grand total row */}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={2} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>FLEET TOTAL</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(perAssetCosts.reduce((s, a) => s + a.fuelCost, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(perAssetCosts.reduce((s, a) => s + a.maintenanceCost, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(perAssetCosts.reduce((s, a) => s + a.downtimeCost, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(perAssetCosts.reduce((s, a) => s + a.tyreCost, 0))}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{fmtMoney(perAssetCosts.reduce((s, a) => s + a.total, 0))}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 3 — COST BENCHMARKING
      ════════════════════════════════════════════════ */}
      {tab === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Avg cost per km by type/make */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Average Cost per KM — by Vehicle Type / Make</div>
            {benchmarkByType.length === 0 ? (
              <EmptyState icon="bar_chart" message="No data" />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Make</th>
                      <th style={{ textAlign: 'right' }}>Assets</th>
                      <th style={{ textAlign: 'right' }}>Avg Total Cost</th>
                      <th style={{ textAlign: 'right' }}>Avg Cost / km</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkByType.map((row, i) => (
                      <tr key={`${row.type}-${row.make}`}>
                        <td style={{ textTransform: 'capitalize', color: 'var(--text-mid)', fontSize: 12 }}>{row.type}</td>
                        <td style={{ fontWeight: 600 }}>{row.make}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{row.count}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(row.avgTotal)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: row.avgCostPerKm != null ? 'var(--yellow)' : 'var(--text-dim)' }}>
                          {row.avgCostPerKm != null ? `K${row.avgCostPerKm.toFixed(3)}/km` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top 5 most expensive assets */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Top 5 Most Expensive Assets</div>
            {perAssetCosts.slice(0, 5).filter(a => a.total > 0).length === 0 ? (
              <EmptyState icon="bar_chart" message="No cost data" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {perAssetCosts.slice(0, 5).filter(a => a.total > 0).map((a, i) => {
                  const maxTotal = perAssetCosts[0]?.total || 1
                  const barW = ((a.total / maxTotal) * 100).toFixed(1)
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: ASSET_COLORS[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#0b0f1a', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--gold)' }}>{fmtMoney(a.total)}</span>
                        </div>
                        <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barW}%`, background: ASSET_COLORS[i], borderRadius: 5, transition: 'width .4s' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Year comparison */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              {thisYear} vs {thisYear - 1} Cost Comparison
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>{thisYear - 1}</th>
                    <th style={{ textAlign: 'right' }}>{thisYear}</th>
                    <th style={{ textAlign: 'right' }}>Change</th>
                    <th style={{ textAlign: 'right' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {yearComparison.map(row => {
                    const change = row.thisYear - row.lastYear
                    const changePct = row.lastYear > 0 ? (change / row.lastYear * 100) : null
                    const isTotal = row.label === 'Total'
                    return (
                      <tr key={row.label} style={isTotal ? { background: 'var(--surface2)', fontWeight: 700 } : {}}>
                        <td style={{ fontWeight: isTotal ? 700 : 500 }}>{row.label}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(row.lastYear)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(row.thisYear)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: change > 0 ? 'var(--red)' : change < 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                          {change !== 0 ? `${change > 0 ? '+' : ''}${fmtMoney(change)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: changePct > 0 ? 'var(--red)' : changePct < 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                          {changePct != null ? `${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 4 — BUDGET VS ACTUAL
      ════════════════════════════════════════════════ */}
      {tab === 3 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Budget vs Actual — {thisYear}</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Budgets are saved per-browser</span>
          </div>

          {/* Derive actuals */}
          {(() => {
            const actuals = {
              fuel:        getFleetCosts(`${thisYear}-01-01`, `${thisYear}-12-31`).fuelCost,
              maintenance: getFleetCosts(`${thisYear}-01-01`, `${thisYear}-12-31`).maintenanceCost,
              tyres:       actualTyreCost,
              downtime:    getFleetCosts(`${thisYear}-01-01`, `${thisYear}-12-31`).downtimeCost,
            }
            actuals.total = actuals.fuel + actuals.maintenance + actuals.tyres + actuals.downtime

            return (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Budgeted (K)</th>
                      <th style={{ textAlign: 'right' }}>Actual (K)</th>
                      <th style={{ textAlign: 'right' }}>Variance (K)</th>
                      <th style={{ textAlign: 'right' }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BUDGET_CATS.map(cat => {
                      const budgeted = parseFloat(budget[cat.key]) || 0
                      const actual = actuals[cat.key] || 0
                      const variance = actual - budgeted
                      const variancePct = budgeted > 0 ? (variance / budgeted * 100).toFixed(1) : null
                      const overBudget = budgeted > 0 && actual > budgeted
                      const underBudget = budgeted > 0 && actual <= budgeted
                      const isTotal = cat.key === 'total'

                      return (
                        <tr key={cat.key} style={isTotal ? { background: 'var(--surface2)', fontWeight: 700 } : {}}>
                          <td style={{ fontWeight: isTotal ? 700 : 500 }}>{cat.label}</td>
                          <td style={{ textAlign: 'right', padding: '6px 12px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="form-control"
                              style={{
                                width: 120, textAlign: 'right', fontFamily: 'var(--mono)',
                                padding: '6px 10px', fontSize: 13,
                                background: isTotal ? 'var(--surface3)' : undefined,
                              }}
                              value={budget[cat.key]}
                              readOnly={isTotal}
                              placeholder="0.00"
                              onChange={e => {
                                if (isTotal) return
                                const updated = { ...budget, [cat.key]: e.target.value }
                                // Auto-compute total budget
                                const sum = ['fuel', 'maintenance', 'tyres', 'downtime']
                                  .reduce((s, k) => s + (parseFloat(updated[k]) || 0), 0)
                                updated.total = sum > 0 ? sum.toFixed(2) : ''
                                saveBudget(updated)
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: isTotal ? 700 : 400 }}>
                            {fmtMoney(actual)}
                          </td>
                          <td style={{
                            textAlign: 'right', fontFamily: 'var(--mono)',
                            color: overBudget ? 'var(--red)' : underBudget ? 'var(--green)' : 'var(--text-dim)',
                            fontWeight: variance !== 0 ? 600 : 400,
                          }}>
                            {budgeted > 0
                              ? `${variance > 0 ? '+' : ''}${fmtMoney(variance)}`
                              : '—'}
                          </td>
                          <td style={{
                            textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12,
                            color: overBudget ? 'var(--red)' : underBudget ? 'var(--green)' : 'var(--text-dim)',
                          }}>
                            {variancePct != null
                              ? <span>
                                  <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>
                                    {overBudget ? 'arrow_upward' : 'arrow_downward'}
                                  </span>
                                  {Math.abs(+variancePct)}%
                                </span>
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>info</span>
            Enter budget values in the Budgeted column. Values are saved automatically to your browser. Tyre cost reflects year-to-date purchase costs from tyre inventory.
          </div>
        </div>
      )}
    </div>
  )
}
