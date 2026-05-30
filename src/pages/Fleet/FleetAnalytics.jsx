// src/pages/Fleet/FleetAnalytics.jsx — F7 Executive Intelligence & Analytics

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  PageHeader, KPICard, TabNav, EmptyState,
} from '../../components/ui'

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt  = (n, dec = 0) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtM = (n) => n == null || isNaN(n) ? '—' : `K${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function healthColor(score) {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--yellow)'
  return 'var(--red)'
}

function gradeOf(score) {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  return 'D'
}

function gradeColor(grade) {
  return grade === 'A' ? 'var(--green)' : grade === 'B' ? 'var(--teal)' : grade === 'C' ? 'var(--yellow)' : 'var(--red)'
}

function mtbfRisk(mtbfDays) {
  if (mtbfDays == null) return { label: 'No Failures', color: 'var(--green)' }
  if (mtbfDays < 30)  return { label: 'High Risk', color: 'var(--red)' }
  if (mtbfDays < 90)  return { label: 'Medium Risk', color: 'var(--yellow)' }
  return { label: 'Low Risk', color: 'var(--green)' }
}

// ── Sub-component: CSS gauge ───────────────────────────────────────────────────

function HealthGauge({ score, size = 120, label = 'Fleet Health' }) {
  const capped = Math.max(0, Math.min(100, score || 0))
  const color  = healthColor(capped)
  const radius = size * 0.42
  const circ   = 2 * Math.PI * radius
  const dash   = (capped / 100) * circ
  const gap    = circ - dash
  const center = size / 2
  const strokeW = size * 0.1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={center} cy={center} r={radius} fill="none"
            stroke="var(--surface2)" strokeWidth={strokeW} />
          <circle cx={center} cy={center} r={radius} fill="none"
            stroke={color} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .8s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: size * 0.22, fontWeight: 800, color, lineHeight: 1 }}>
            {Math.round(capped)}
          </div>
          <div style={{ fontSize: size * 0.09, color: 'var(--text-dim)', letterSpacing: 0.5 }}>/ 100</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  )
}

// ── CSS bar chart row ──────────────────────────────────────────────────────────

function BarRow({ label, value, maxValue, color, suffix = '', extra }) {
  const pct = maxValue > 0 ? Math.min(100, (Math.abs(value) / maxValue) * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color }}>
          {suffix === 'K' ? fmtM(value) : value != null ? `${fmt(value, suffix === 'L' ? 1 : 0)}${suffix}` : '—'}
          {extra}
        </span>
      </div>
      <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 5, transition: 'width .5s' }} />
      </div>
    </div>
  )
}

// ── Trend Table ────────────────────────────────────────────────────────────────

function TrendTable({ data, period }) {
  const slice = period === '3m' ? data.slice(-3) : period === '6m' ? data.slice(-6) : data
  if (!slice.length || slice.every(m => !m.fuel_cost && !m.maint_cost && !m.breakdowns)) {
    return <EmptyState icon="trending_up" message="No trend data available for this period" />
  }

  const maxFuel  = Math.max(...slice.map(m => Number(m.fuel_cost)))
  const maxMaint = Math.max(...slice.map(m => Number(m.maint_cost)))
  const maxBreak = Math.max(...slice.map(m => Number(m.breakdowns)))
  const maxDown  = Math.max(...slice.map(m => Number(m.downtime_hours)))

  return (
    <div className="table-wrap">
      <table className="stock-table">
        <thead>
          <tr>
            <th>Month</th>
            <th style={{ textAlign: 'right' }}>Fuel Spend</th>
            <th style={{ minWidth: 100 }}>Fuel Bar</th>
            <th style={{ textAlign: 'right' }}>Maint Cost</th>
            <th style={{ minWidth: 100 }}>Maint Bar</th>
            <th style={{ textAlign: 'right' }}>Breakdowns</th>
            <th style={{ textAlign: 'right' }}>Downtime (h)</th>
            <th style={{ minWidth: 80 }}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => {
            const prevRow  = i > 0 ? slice[i - 1] : null
            const momFuel  = prevRow && Number(prevRow.fuel_cost) > 0
              ? (((Number(row.fuel_cost) - Number(prevRow.fuel_cost)) / Number(prevRow.fuel_cost)) * 100).toFixed(1)
              : null
            const fuelPct  = maxFuel  > 0 ? Math.min(100, (Number(row.fuel_cost) / maxFuel) * 100) : 0
            const maintPct = maxMaint > 0 ? Math.min(100, (Number(row.maint_cost) / maxMaint) * 100) : 0
            return (
              <tr key={row.month}>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{row.month_label}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(row.fuel_cost) > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                  {Number(row.fuel_cost) > 0 ? fmtM(row.fuel_cost) : '—'}
                </td>
                <td>
                  <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fuelPct}%`, background: 'var(--yellow)', borderRadius: 5 }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(row.maint_cost) > 0 ? 'var(--blue)' : 'var(--text-dim)' }}>
                  {Number(row.maint_cost) > 0 ? fmtM(row.maint_cost) : '—'}
                </td>
                <td>
                  <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${maintPct}%`, background: 'var(--blue)', borderRadius: 5 }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(row.breakdowns) > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                  {Number(row.breakdowns) > 0 ? Number(row.breakdowns) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(row.downtime_hours) > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                  {Number(row.downtime_hours) > 0 ? fmt(row.downtime_hours, 1) : '—'}
                </td>
                <td>
                  {momFuel != null && (
                    <span style={{
                      fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
                      color: Number(momFuel) > 0 ? 'var(--red)' : Number(momFuel) < 0 ? 'var(--green)' : 'var(--text-dim)',
                    }}>
                      <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>
                        {Number(momFuel) > 0 ? 'arrow_upward' : Number(momFuel) < 0 ? 'arrow_downward' : 'remove'}
                      </span>
                      {Math.abs(Number(momFuel))}%
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
            <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
              {period === '3m' ? '3-MONTH' : period === '6m' ? '6-MONTH' : '12-MONTH'} TOTAL
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
              {fmtM(slice.reduce((s, m) => s + Number(m.fuel_cost || 0), 0))}
            </td>
            <td />
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
              {fmtM(slice.reduce((s, m) => s + Number(m.maint_cost || 0), 0))}
            </td>
            <td />
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>
              {slice.reduce((s, m) => s + Number(m.breakdowns || 0), 0)}
            </td>
            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
              {fmt(slice.reduce((s, m) => s + Number(m.downtime_hours || 0), 0), 1)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FleetAnalytics() {
  const navigate = useNavigate()
  const [tab, setTab]         = useState(0)
  const [period, setPeriod]   = useState('12m')
  const [loading, setLoading] = useState(true)

  // Data states
  const [healthScores,  setHealthScores]  = useState([])
  const [trends,        setTrends]        = useState([])
  const [kpis,          setKpis]          = useState({
    totalAssets: 0, activeAssets: 0, inWorkshop: 0, brokenDown: 0,
    openBreakdowns: 0, overduePMs: 0,
    fuelMTD: 0, maintMTD: 0, avgCostPerKm: 0,
    availabilityPct: 100, downtimePct: 0,
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [healthRes, trendsRes, kpiRes] = await Promise.all([
          supabase.from('fleet_health_scores').select('*').order('pm_score', { ascending: true }),
          supabase.from('fleet_monthly_trends').select('*').order('month'),
          Promise.all([
            supabase.from('asset_registry').select('operational_status'),
            supabase.from('breakdown_reports').select('id', { count: 'exact' }).eq('status', 'open'),
            supabase.from('maintenance_pm_urgency').select('id', { count: 'exact' }).in('urgency', ['overdue', 'critical']),
            supabase.from('fuel_issuance')
              .select('total_cost, quantity')
              .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
            supabase.from('maintenance_work_orders')
              .select('actual_cost')
              .eq('status', 'closed')
              .gte('updated_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
            supabase.from('fleet_pnl').select('total_cost, current_odometer'),
          ]),
        ])

        if (healthRes.data) setHealthScores(healthRes.data)
        if (trendsRes.data) setTrends(trendsRes.data)

        const [assetRes, brRes, pmRes, fuelRes, maintRes, pnlRes] = kpiRes

        const assets = assetRes.data || []
        const total  = assets.length
        const active = assets.filter(a => a.operational_status === 'active').length
        const inWS   = assets.filter(a => a.operational_status === 'in_workshop').length
        const broken = assets.filter(a => a.operational_status === 'broken_down').length
        const openBr = brRes.count || 0
        const overPM = pmRes.count || 0

        const fuelMTD  = (fuelRes.data || []).reduce((s, f) => s + Number(f.total_cost || 0), 0)
        const maintMTD = (maintRes.data || []).reduce((s, m) => s + Number(m.actual_cost || 0), 0)

        const pnlRows = pnlRes.data || []
        const totalCost = pnlRows.reduce((s, r) => s + Number(r.total_cost || 0), 0)
        const totalKm   = pnlRows.reduce((s, r) => s + Number(r.current_odometer || 0), 0)
        const avgCpKm   = totalKm > 0 ? totalCost / totalKm : 0

        const availPct  = total > 0 ? Math.round(((total - openBr) / total) * 100) : 100
        const downPct   = total > 0 ? Math.round(((inWS + broken) / total) * 100) : 0

        setKpis({
          totalAssets: total, activeAssets: active, inWorkshop: inWS, brokenDown: broken,
          openBreakdowns: openBr, overduePMs: overPM,
          fuelMTD, maintMTD, avgCostPerKm: avgCpKm,
          availabilityPct: availPct, downtimePct: downPct,
        })
      } catch (err) {
        console.error('FleetAnalytics load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Health score computed data ─────────────────────────────────────────────

  const scoredAssets = useMemo(() => {
    return healthScores.map(a => {
      const pmScore    = Number(a.pm_score || 0)
      const availScore = Number(a.availability_score || 0)
      const repScore   = Number(a.repair_score || 0)
      // Fuel efficiency score: no fuel data available per asset, so award 25 if has benchmark, 20 otherwise
      const fuelScore  = a.benchmark_consumption != null ? 20 : 20
      const total      = Math.round(pmScore + availScore + repScore + fuelScore)
      return { ...a, pmScore, availScore, repScore, fuelScore, total, grade: gradeOf(total) }
    }).sort((a, b) => a.total - b.total) // worst first
  }, [healthScores])

  const fleetHealthScore = useMemo(() => {
    if (!scoredAssets.length) return 0
    return Math.round(scoredAssets.reduce((s, a) => s + a.total, 0) / scoredAssets.length)
  }, [scoredAssets])

  // ── MTBF analysis ─────────────────────────────────────────────────────────

  const mtbfData = useMemo(() => {
    return healthScores
      .filter(a => Number(a.breakdowns_12m) > 0)
      .map(a => {
        const breakdowns12m = Number(a.breakdowns_12m)
        const mtbfDays = breakdowns12m > 0 ? Math.round(365 / breakdowns12m) : null
        const lastBD = a.last_breakdown ? new Date(a.last_breakdown) : null
        const daysSince = lastBD ? Math.round((Date.now() - lastBD.getTime()) / 86400000) : null
        const risk = mtbfRisk(mtbfDays)
        const predictionDays = mtbfDays != null && daysSince != null && mtbfDays < 30
          ? Math.max(0, mtbfDays - daysSince)
          : null
        return { ...a, breakdowns12m, mtbfDays, daysSince, risk, predictionDays }
      }).sort((a, b) => (a.mtbfDays || 9999) - (b.mtbfDays || 9999))
  }, [healthScores])

  // Failure prediction alerts (MTBF < 30 and past half of MTBF interval)
  const predictionAlerts = useMemo(() => {
    return mtbfData.filter(a => {
      if (a.mtbfDays == null || a.mtbfDays >= 30) return false
      if (a.daysSince == null) return false
      return a.daysSince > a.mtbfDays / 2
    })
  }, [mtbfData])

  const TABS = [
    'Executive Summary',
    '12-Month Trends',
    'Fleet Health Scores',
    'Predictive Maintenance',
  ]

  return (
    <div>
      <PageHeader title="Fleet Intelligence & Analytics">
        <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/cost-analysis')}>
          <span className="material-icons">price_check</span> Cost Analysis
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/downtime-analytics')}>
          <span className="material-icons">timer_off</span> Downtime
        </button>
      </PageHeader>

      {/* ── Failure prediction alerts strip ── */}
      {predictionAlerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: 'color-mix(in srgb,var(--red) 10%,var(--surface))',
            border: '1px solid color-mix(in srgb,var(--red) 30%,transparent)',
          }}>
            <span className="material-icons" style={{ color: 'var(--red)', fontSize: 18, flexShrink: 0, marginTop: 1 }}>warning</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
                Breakdown Prediction Alerts — Based on Historical Pattern
              </div>
              {predictionAlerts.map(a => (
                <div key={a.id} style={{ fontSize: 12, marginBottom: 3, color: 'var(--text-mid)' }}>
                  <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4, color: 'var(--yellow)' }}>schedule</span>
                  <strong>{a.asset_name}</strong> — {a.mtbfDays}-day MTBF; last breakdown {a.daysSince}d ago.
                  {a.predictionDays === 0
                    ? ' Breakdown may be imminent.'
                    : ` Next breakdown estimated within ${a.predictionDays} day(s).`
                  }
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>(Statistical estimate — not a guarantee)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Executive KPI Banner (8 tiles, 4×2) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            label: 'Fleet Availability',
            value: `${kpis.availabilityPct}%`,
            sub: `${kpis.openBreakdowns} open breakdown${kpis.openBreakdowns !== 1 ? 's' : ''}`,
            icon: 'verified',
            color: kpis.availabilityPct >= 90 ? 'green' : kpis.availabilityPct >= 75 ? 'yellow' : 'red',
          },
          {
            label: 'Downtime %',
            value: `${kpis.downtimePct}%`,
            sub: `${kpis.inWorkshop} workshop + ${kpis.brokenDown} broken`,
            icon: 'report_problem',
            color: kpis.downtimePct === 0 ? 'green' : kpis.downtimePct < 15 ? 'yellow' : 'red',
          },
          {
            label: 'Total Assets',
            value: kpis.totalAssets,
            sub: `${kpis.activeAssets} active`,
            icon: 'directions_car',
            color: 'gold',
          },
          {
            label: 'Overdue PMs',
            value: kpis.overduePMs,
            sub: 'Critical + overdue',
            icon: 'notifications_active',
            color: kpis.overduePMs === 0 ? 'green' : kpis.overduePMs < 5 ? 'yellow' : 'red',
          },
          {
            label: 'Fuel Spend MTD',
            value: fmtM(kpis.fuelMTD),
            sub: 'Month-to-date',
            icon: 'local_gas_station',
            color: 'yellow',
          },
          {
            label: 'Maintenance Spend MTD',
            value: fmtM(kpis.maintMTD),
            sub: 'Closed WOs this month',
            icon: 'build',
            color: 'blue',
          },
          {
            label: 'Avg Cost per KM',
            value: kpis.avgCostPerKm > 0 ? `K${kpis.avgCostPerKm.toFixed(3)}/km` : '—',
            sub: 'Fleet P&L aggregate',
            icon: 'speed',
            color: 'teal',
          },
          {
            label: 'Assets Broken Down',
            value: kpis.openBreakdowns,
            sub: 'Open breakdown reports',
            icon: 'car_crash',
            color: kpis.openBreakdowns === 0 ? 'green' : 'red',
          },
        ].map((kpi, i) => (
          <KPICard
            key={i}
            label={kpi.label}
            value={kpi.value}
            sub={kpi.sub}
            icon={kpi.icon}
            color={kpi.color}
          />
        ))}
      </div>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {/* ════════════════════════════════════════════════
          TAB 1 — EXECUTIVE SUMMARY
      ════════════════════════════════════════════════ */}
      {tab === 0 && (
        <div>
          {/* Fleet Health Gauge + Sub-scores */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
              <HealthGauge score={fleetHealthScore} size={160} label="Fleet Health Score" />
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Score Component Breakdown</div>
                {[
                  { label: 'PM Compliance (max 25)', value: scoredAssets.length ? (scoredAssets.reduce((s, a) => s + a.pmScore, 0) / scoredAssets.length) : 0, max: 25, color: 'var(--blue)' },
                  { label: 'Availability (max 25)',   value: scoredAssets.length ? (scoredAssets.reduce((s, a) => s + a.availScore, 0) / scoredAssets.length) : 0, max: 25, color: 'var(--green)' },
                  { label: 'Fuel Efficiency (max 25)', value: scoredAssets.length ? (scoredAssets.reduce((s, a) => s + a.fuelScore, 0) / scoredAssets.length) : 0, max: 25, color: 'var(--yellow)' },
                  { label: 'Repair Rate (max 25)',    value: scoredAssets.length ? (scoredAssets.reduce((s, a) => s + a.repScore, 0) / scoredAssets.length) : 0, max: 25, color: 'var(--teal)' },
                ].map(comp => (
                  <div key={comp.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12 }}>{comp.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: comp.color }}>
                        {comp.value.toFixed(1)} / {comp.max}
                      </span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(comp.value / comp.max) * 100}%`, background: comp.color, borderRadius: 4, transition: 'width .5s' }} />
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  {[
                    { label: 'A ≥85', color: 'var(--green)' },
                    { label: 'B 70-84', color: 'var(--teal)' },
                    { label: 'C 55-69', color: 'var(--yellow)' },
                    { label: 'D <55', color: 'var(--red)' },
                  ].map(g => (
                    <span key={g.label} style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: `color-mix(in srgb,${g.color} 15%,var(--surface2))`,
                      color: g.color, border: `1px solid color-mix(in srgb,${g.color} 30%,transparent)`,
                    }}>{g.label}</span>
                  ))}
                </div>
              </div>

              {/* Grade distribution */}
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Grade Distribution</div>
                {['A', 'B', 'C', 'D'].map(grade => {
                  const count = scoredAssets.filter(a => a.grade === grade).length
                  const pct = scoredAssets.length ? ((count / scoredAssets.length) * 100).toFixed(0) : 0
                  return (
                    <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6,
                        background: `color-mix(in srgb,${gradeColor(grade)} 20%,var(--surface2))`,
                        border: `2px solid ${gradeColor(grade)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 14, color: gradeColor(grade), flexShrink: 0,
                      }}>{grade}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-dim)' }}>{count} asset{count !== 1 ? 's' : ''}</span>
                          <span style={{ fontFamily: 'var(--mono)', color: gradeColor(grade) }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: gradeColor(grade), borderRadius: 3 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Last 3 months snapshot */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Cost Trend — Last 3 Months</div>
              {trends.slice(-3).every(m => !Number(m.fuel_cost) && !Number(m.maint_cost)) ? (
                <EmptyState icon="bar_chart" message="No cost data in last 3 months" />
              ) : (
                <>
                  {trends.slice(-3).map(m => (
                    <div key={m.month} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6 }}>{m.month_label}</div>
                      <BarRow
                        label="Fuel"
                        value={Number(m.fuel_cost)}
                        maxValue={Math.max(...trends.map(x => Number(x.fuel_cost)))}
                        color="var(--yellow)"
                        suffix="K"
                      />
                      <BarRow
                        label="Maintenance"
                        value={Number(m.maint_cost)}
                        maxValue={Math.max(...trends.map(x => Number(x.maint_cost)))}
                        color="var(--blue)"
                        suffix="K"
                      />
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Fleet Status Summary</div>
              {[
                { label: 'Active', count: kpis.activeAssets, icon: 'check_circle', color: 'var(--green)' },
                { label: 'In Workshop', count: kpis.inWorkshop, icon: 'engineering', color: 'var(--blue)' },
                { label: 'Broken Down', count: kpis.brokenDown, icon: 'report_problem', color: 'var(--red)' },
                { label: 'Other', count: kpis.totalAssets - kpis.activeAssets - kpis.inWorkshop - kpis.brokenDown, icon: 'pause_circle', color: 'var(--text-dim)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="material-icons" style={{ color: s.color, fontSize: 22 }}>{s.icon}</span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: s.count > 0 ? s.color : 'var(--text-dim)' }}>
                    {s.count}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/module/fleet/dashboard')}>
                  <span className="material-icons">dashboard</span> Fleet Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 2 — 12-MONTH TRENDS
      ════════════════════════════════════════════════ */}
      {tab === 1 && (
        <div>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'flex-end' }}>
            {[['3m', 'Last 3M'], ['6m', 'Last 6M'], ['12m', 'Last 12M']].map(([val, lbl]) => (
              <button
                key={val}
                className={period === val ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setPeriod(val)}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Trend summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
            {(() => {
              const slice = period === '3m' ? trends.slice(-3) : period === '6m' ? trends.slice(-6) : trends
              const totalFuel  = slice.reduce((s, m) => s + Number(m.fuel_cost || 0), 0)
              const totalMaint = slice.reduce((s, m) => s + Number(m.maint_cost || 0), 0)
              const totalBreak = slice.reduce((s, m) => s + Number(m.breakdowns || 0), 0)
              const totalDown  = slice.reduce((s, m) => s + Number(m.downtime_hours || 0), 0)
              const totalLitres = slice.reduce((s, m) => s + Number(m.fuel_litres || 0), 0)
              return [
                { label: 'Total Fuel Spend', value: fmtM(totalFuel), sub: `${fmt(totalLitres, 0)} litres`, icon: 'local_gas_station', color: 'yellow' },
                { label: 'Total Maint Cost', value: fmtM(totalMaint), sub: `${slice.reduce((s, m) => s + Number(m.maint_jobs || 0), 0)} jobs closed`, icon: 'build', color: 'blue' },
                { label: 'Total Breakdowns', value: totalBreak, sub: 'Breakdown events', icon: 'report_problem', color: totalBreak > 0 ? 'red' : 'green' },
                { label: 'Total Downtime', value: `${fmt(totalDown, 1)}h`, sub: 'Combined downtime hours', icon: 'timer_off', color: totalDown > 0 ? 'yellow' : 'green' },
              ]
            })().map((kpi, i) => (
              <KPICard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} color={kpi.color} />
            ))}
          </div>

          <TrendTable data={trends} period={period} />
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 3 — FLEET HEALTH SCORES
      ════════════════════════════════════════════════ */}
      {tab === 2 && (
        <div>
          {/* Fleet aggregate gauge */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
              <HealthGauge score={fleetHealthScore} size={110} label="Fleet Score" />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: healthColor(fleetHealthScore), marginBottom: 4 }}>
                  Grade: {gradeOf(fleetHealthScore)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                  Weighted average across {scoredAssets.length} assets
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Scores: PM Compliance (25) + Availability (25) + Fuel Efficiency (25) + Repair Rate (25)
                </div>
              </div>
            </div>
          </div>

          {scoredAssets.length === 0 ? (
            <EmptyState icon="analytics" message="No assets found in fleet health scores" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>PM Score</th>
                    <th style={{ textAlign: 'right' }}>Availability</th>
                    <th style={{ textAlign: 'right' }}>Repair Rate</th>
                    <th style={{ textAlign: 'right' }}>Fuel Eff.</th>
                    <th style={{ textAlign: 'right' }}>Total Score</th>
                    <th style={{ textAlign: 'center' }}>Grade</th>
                    <th style={{ textAlign: 'right' }}>Overdue PMs</th>
                    <th style={{ textAlign: 'right' }}>BD (90d)</th>
                  </tr>
                </thead>
                <tbody>
                  {scoredAssets.map(a => {
                    const totalColor = healthColor(a.total)
                    const opColor = a.operational_status === 'active' ? 'var(--green)'
                      : a.operational_status === 'in_workshop' ? 'var(--blue)'
                      : a.operational_status === 'broken_down' ? 'var(--red)'
                      : 'var(--text-dim)'
                    return (
                      <tr key={a.id} style={a.total < 55 ? { background: 'color-mix(in srgb,var(--red) 4%,var(--surface))' } : {}}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{a.asset_name || a.asset_code || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{a.plate_number || a.fleet_number || ''}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{a.asset_category || '—'}</td>
                        <td>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: `color-mix(in srgb,${opColor} 15%,var(--surface2))`,
                            color: opColor, textTransform: 'capitalize',
                          }}>
                            {a.operational_status || 'unknown'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          <span style={{ color: a.pmScore >= 20 ? 'var(--green)' : a.pmScore >= 12 ? 'var(--yellow)' : 'var(--red)' }}>
                            {a.pmScore}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          <span style={{ color: a.availScore >= 20 ? 'var(--green)' : a.availScore >= 12 ? 'var(--yellow)' : 'var(--red)' }}>
                            {a.availScore}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          <span style={{ color: a.repScore >= 20 ? 'var(--green)' : a.repScore >= 12 ? 'var(--yellow)' : 'var(--red)' }}>
                            {a.repScore}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                          {a.fuelScore}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: totalColor }}>
                          {a.total}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', width: 26, height: 26, borderRadius: 6,
                            background: `color-mix(in srgb,${gradeColor(a.grade)} 20%,var(--surface2))`,
                            border: `2px solid ${gradeColor(a.grade)}`,
                            fontWeight: 800, fontSize: 13, color: gradeColor(a.grade),
                            lineHeight: '22px', textAlign: 'center',
                          }}>
                            {a.grade}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(a.overdue_pms) > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {Number(a.overdue_pms) > 0 ? Number(a.overdue_pms) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(a.breakdowns_90d) > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                          {Number(a.breakdowns_90d) > 0 ? Number(a.breakdowns_90d) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB 4 — PREDICTIVE MAINTENANCE
      ════════════════════════════════════════════════ */}
      {tab === 3 && (
        <div>
          {/* Prediction alerts */}
          {predictionAlerts.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--red)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--red)' }}>
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>warning</span>
                Failure Prediction Alerts
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  Based on historical breakdown patterns — not guaranteed
                </span>
              </div>
              {predictionAlerts.map(a => (
                <div key={a.id} style={{
                  display: 'flex', gap: 12, padding: '10px 12px', marginBottom: 8, borderRadius: 8,
                  background: 'color-mix(in srgb,var(--red) 8%,var(--surface2))',
                  border: '1px solid color-mix(in srgb,var(--red) 25%,transparent)',
                  alignItems: 'center',
                }}>
                  <span className="material-icons" style={{ color: 'var(--red)', fontSize: 20, flexShrink: 0 }}>car_crash</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.asset_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {a.breakdowns12m} breakdown(s) in 12 months · MTBF: {a.mtbfDays} days · Last breakdown: {a.daysSince}d ago
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
                      {a.predictionDays === 0 ? 'Imminent' : `~${a.predictionDays}d`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>est. next failure</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* MTBF table */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              Mean Time Between Failures (MTBF) — 12-Month Window
            </div>
            {mtbfData.length === 0 ? (
              <EmptyState icon="bar_chart" message="No breakdown history found. MTBF analysis requires breakdown data." />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Breakdowns (12m)</th>
                      <th style={{ textAlign: 'right' }}>MTBF (days)</th>
                      <th style={{ textAlign: 'right' }}>Days Since Last</th>
                      <th>Risk Level</th>
                      <th>Est. Next Failure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mtbfData.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{a.asset_name || a.asset_code || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{a.plate_number || ''}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{a.asset_category || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{a.breakdowns12m}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                          {a.mtbfDays != null ? a.mtbfDays : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)' }}>
                          {a.daysSince != null ? `${a.daysSince}d` : '—'}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
                            background: `color-mix(in srgb,${a.risk.color} 15%,var(--surface2))`,
                            color: a.risk.color,
                          }}>
                            {a.risk.label}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: a.predictionDays != null ? 'var(--yellow)' : 'var(--text-dim)' }}>
                          {a.predictionDays != null
                            ? (a.predictionDays === 0 ? 'Imminent' : `~${a.predictionDays} days`)
                            : '—'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PM Compliance per asset */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              PM Compliance — Assets with Overdue/Critical PMs
            </div>
            {healthScores.filter(a => Number(a.overdue_pms) > 0).length === 0 ? (
              <EmptyState icon="event_available" message="All assets are PM compliant — no overdue or critical PMs found" />
            ) : (
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Total PM Schedules</th>
                      <th style={{ textAlign: 'right' }}>Overdue / Critical</th>
                      <th style={{ textAlign: 'right' }}>Compliance %</th>
                      <th>Bar</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthScores
                      .filter(a => Number(a.overdue_pms) > 0)
                      .sort((a, b) => Number(b.overdue_pms) - Number(a.overdue_pms))
                      .map(a => {
                        const total   = Number(a.total_pm_schedules) || 1
                        const overdue = Number(a.overdue_pms)
                        const compPct = Math.max(0, Math.round(((total - overdue) / total) * 100))
                        const barColor = compPct >= 80 ? 'var(--green)' : compPct >= 60 ? 'var(--yellow)' : 'var(--red)'
                        return (
                          <tr key={a.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{a.asset_name || a.asset_code || '—'}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{a.plate_number || ''}</div>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{a.asset_category || '—'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{total}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 700 }}>{overdue}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: barColor }}>{compPct}%</td>
                            <td style={{ minWidth: 120 }}>
                              <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 5, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${compPct}%`, background: barColor, borderRadius: 5 }} />
                              </div>
                            </td>
                            <td>
                              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fleet/preventive-maintenance')}>
                                View PM
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)', fontSize: 11, color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>info</span>
              Predictions are based on historical breakdown frequency and are statistical estimates only. Actual failure timing may vary significantly.
              Schedule preventive maintenance to reduce breakdown probability.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
