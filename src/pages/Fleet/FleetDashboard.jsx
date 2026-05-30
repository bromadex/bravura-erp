// src/pages/Fleet/FleetDashboard.jsx — enhanced with compliance, PM, fuel KPIs + F7 Executive Intelligence

import { useState, useEffect, useMemo } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, AlertBanner } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]
const in30  = new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0]

// ── F7 helpers ────────────────────────────────────────────────────────────────

const fmtM = (n) => n == null || isNaN(n) || n === 0 ? 'K0.00'
  : `K${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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

function HealthGaugeMini({ score }) {
  const capped = Math.max(0, Math.min(100, score || 0))
  const color  = healthColor(capped)
  const size = 90
  const radius = size * 0.42
  const circ   = 2 * Math.PI * radius
  const dash   = (capped / 100) * circ
  const gap    = circ - dash
  const center = size / 2
  const strokeW = size * 0.1
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--surface2)" strokeWidth={strokeW} />
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
        <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{Math.round(capped)}</div>
        <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>/ 100</div>
      </div>
    </div>
  )
}

function expiryColor(dateStr) {
  if (!dateStr) return 'var(--text-dim)'
  const d = new Date(dateStr)
  const now = new Date()
  if (d < now) return 'var(--red)'
  if (d <= new Date(Date.now() + 30 * 86400_000)) return 'var(--yellow)'
  return 'var(--green)'
}

export default function FleetDashboard() {
  const navigate = useNavigate()
  const {
    vehicles, generators, earthMovers,
    getOverdueAlerts, getVehicleFuelEfficiency, getHealthScore,
    getExpiringDocuments, getAssetExpiryWarnings,
  } = useFleet()

  const canViewVehicles   = useCanView('fleet', 'vehicles')
  const canViewGenerators = useCanView('fleet', 'generators')
  const canViewHeavy      = useCanView('fleet', 'heavy-equipment')

  const [fuelTanks,      setFuelTanks]      = useState([])
  const [overdueWOs,     setOverdueWOs]     = useState(0)
  const [upcomingPM,     setUpcomingPM]     = useState([])
  const [recentTrips,    setRecentTrips]    = useState([])
  const [openAccidents,  setOpenAccidents]  = useState(0)
  const [docWarnings,    setDocWarnings]    = useState([])
  const [statusCounts,   setStatusCounts]   = useState({})
  const [openBreakdowns, setOpenBreakdowns] = useState(0)
  const [urgentAlerts,   setUrgentAlerts]   = useState([])
  const [recentActivity, setRecentActivity] = useState([])

  // F7 — Executive intelligence state
  const [execKpis,       setExecKpis]       = useState({ fuelMTD: 0, maintMTD: 0, avgCostPerKm: 0, overduePMs: 0 })
  const [healthScores,   setHealthScores]   = useState([])

  useEffect(() => {
    // Fetch supplementary data not in FleetContext
    Promise.all([
      supabase.from('fuel_tanks').select('id,name,capacity,current_level,fuel_type,alert_threshold').order('name'),
      supabase.from('maintenance_work_orders').select('id', { count: 'exact' }).eq('status', 'open').lte('planned_end_date', today),
      supabase.from('maintenance_schedules').select('id,asset_reg,task_name,next_due_date,priority').lte('next_due_date', in30).eq('is_active', true).order('next_due_date').limit(5),
      supabase.from('vehicle_trips').select('id,date,driver_name,purpose,asset_id').order('date', { ascending: false }).limit(5),
      supabase.from('accident_reports').select('id', { count: 'exact' }).neq('status', 'closed'),
      supabase.from('fleet_documents').select('id,asset_id,doc_type,expiry_date').lte('expiry_date', in30).gte('expiry_date', today).eq('is_active', true).order('expiry_date').limit(10),
    ]).then(([tankRes, woRes, pmRes, tripRes, accRes, docRes]) => {
      if (tankRes.data)  setFuelTanks(tankRes.data)
      if (woRes.count)   setOverdueWOs(woRes.count)
      if (pmRes.data)    setUpcomingPM(pmRes.data)
      if (tripRes.data)  setRecentTrips(tripRes.data)
      if (accRes.count)  setOpenAccidents(accRes.count)
      if (docRes.data)   setDocWarnings(docRes.data)
    }).catch(console.error)

    // getExpiringDocuments is synchronous — merge with DB results
    if (getExpiringDocuments) {
      const docs = getExpiringDocuments(30)
      if (docs?.length) setDocWarnings(prev => {
        const ids = new Set(prev.map(d => d.id))
        return [...prev, ...docs.filter(d => !ids.has(d.id))]
      })
    }
  }, [getExpiringDocuments])

  // F7 — load executive intelligence data
  useEffect(() => {
    const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const mtdStartTS = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    Promise.all([
      // Fuel MTD
      supabase.from('fuel_issuance').select('total_cost').gte('date', mtdStart),
      // Maintenance MTD
      supabase.from('maintenance_work_orders').select('actual_cost').eq('status', 'closed').gte('updated_at', mtdStartTS),
      // Fleet P&L for avg cost/km
      supabase.from('fleet_pnl').select('total_cost,current_odometer'),
      // Overdue PMs
      supabase.from('maintenance_pm_urgency').select('id', { count: 'exact' }).in('urgency', ['overdue', 'critical']),
      // Health scores
      supabase.from('fleet_health_scores').select('id,asset_name,asset_code,plate_number,asset_category,operational_status,pm_score,availability_score,repair_score,overdue_pms,breakdowns_90d'),
    ]).then(([fuelRes, maintRes, pnlRes, pmRes, hsRes]) => {
      const fuelMTD  = (fuelRes.data || []).reduce((s, f) => s + Number(f.total_cost || 0), 0)
      const maintMTD = (maintRes.data || []).reduce((s, m) => s + Number(m.actual_cost || 0), 0)
      const pnlRows  = pnlRes.data || []
      const totalCost = pnlRows.reduce((s, r) => s + Number(r.total_cost || 0), 0)
      const totalKm   = pnlRows.reduce((s, r) => s + Number(r.current_odometer || 0), 0)
      const avgCostPerKm = totalKm > 0 ? totalCost / totalKm : 0
      const overduePMs = pmRes.count || 0
      setExecKpis({ fuelMTD, maintMTD, avgCostPerKm, overduePMs })
      setHealthScores(hsRes.data || [])
    }).catch(console.error)
  }, [])

  useEffect(() => {
    supabase.from('asset_registry').select('operational_status')
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(a => {
          const s = (a.operational_status || 'unknown').toLowerCase()
          counts[s] = (counts[s] || 0) + 1
        })
        setStatusCounts(counts)
      }).catch(console.error)

    supabase.from('breakdown_reports').select('id', { count: 'exact' }).eq('status', 'open')
      .then(({ count }) => setOpenBreakdowns(count || 0)).catch(console.error)

    supabase.from('maintenance_pm_urgency').select('asset_name,asset_reg,task_name,urgency')
      .in('urgency', ['critical', 'overdue']).limit(8)
      .then(({ data }) => setUrgentAlerts(data || [])).catch(console.error)

    Promise.all([
      supabase.from('maintenance_work_orders').select('id,wo_number,asset_name,updated_at,task_name').eq('status', 'closed').order('updated_at', { ascending: false }).limit(4),
      supabase.from('breakdown_reports').select('id,breakdown_no,asset_name,reported_at,severity').order('reported_at', { ascending: false }).limit(4),
      supabase.from('meter_readings').select('id,reading_date,reading_type,reading_value,created_at').order('created_at', { ascending: false }).limit(4),
    ]).then(([woRes, brRes, mrRes]) => {
      const items = [
        ...(woRes.data || []).map(w => ({ icon: 'build', color: 'var(--green)', ts: w.updated_at, label: `WO ${w.wo_number || '—'} closed`, sub: w.asset_name || '' })),
        ...(brRes.data || []).map(b => ({ icon: 'report_problem', color: 'var(--red)', ts: b.reported_at, label: `Breakdown: ${b.asset_name || '—'}`, sub: b.severity || '' })),
        ...(mrRes.data || []).map(m => ({ icon: 'speed', color: 'var(--blue)', ts: m.created_at, label: 'Meter reading', sub: `${m.reading_type || 'odometer'}: ${m.reading_value != null ? Number(m.reading_value).toLocaleString() : ''}` })),
      ]
      items.sort((a, b) => new Date(b.ts) - new Date(a.ts))
      setRecentActivity(items.slice(0, 10))
    }).catch(console.error)
  }, [])

  const STATUS_TILES = [
    { key: 'active',       label: 'Active',       icon: 'check_circle',   color: 'var(--green)'  },
    { key: 'in_workshop',  label: 'In Workshop',  icon: 'engineering',    color: 'var(--blue)'   },
    { key: 'broken_down',  label: 'Broken Down',  icon: 'report_problem', color: 'var(--red)'    },
    { key: 'idle',         label: 'Idle',         icon: 'pause_circle',   color: 'var(--yellow)' },
    { key: 'available',    label: 'Available',    icon: 'local_parking',  color: 'var(--teal)'   },
  ]

  const alerts = getOverdueAlerts()

  const totalFleet    = vehicles.length + generators.length + earthMovers.length
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length

  // Compliance: count assets with expired or expiring compliance docs
  const assetExpiries = getAssetExpiryWarnings ? getAssetExpiryWarnings(30) : []
  const expiredCount  = assetExpiries.filter(a => a.expired).length
  const expiringCount = assetExpiries.filter(a => !a.expired).length

  const avgEfficiency = vehicles.reduce((s, v) => {
    const eff = getVehicleFuelEfficiency(v.reg)
    return s + (eff?.kmPerLiter || 0)
  }, 0) / (vehicles.length || 1)

  const criticalHealth = [...vehicles, ...generators, ...earthMovers]
    .filter(a => getHealthScore(a, a.reg ? 'vehicle' : 'generator') < 40).length

  const totalFleetAssets = Object.values(statusCounts).reduce((s, v) => s + v, 0) || totalFleet
  const availabilityPct  = totalFleetAssets > 0
    ? Math.round(((totalFleetAssets - openBreakdowns) / totalFleetAssets) * 100)
    : 100

  // F7 — fleet health score computed
  const fleetHealthScore = useMemo(() => {
    if (!healthScores.length) return 75 // default until data loads
    const scores = healthScores.map(a => {
      const pm   = Number(a.pm_score || 0)
      const av   = Number(a.availability_score || 0)
      const rep  = Number(a.repair_score || 0)
      const fuel = 20 // default fuel efficiency score
      return pm + av + rep + fuel
    })
    return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
  }, [healthScores])

  const inWorkshopCount = statusCounts['in_workshop'] || 0
  const brokenDownCount = statusCounts['broken_down'] || 0
  const downtimePct = totalFleetAssets > 0
    ? Math.round(((inWorkshopCount + brokenDownCount) / totalFleetAssets) * 100)
    : 0

  return (
    <div>
      <PageHeader title="Fleet Intelligence Dashboard">
        <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/analytics')}>
          <span className="material-icons">insights</span> Analytics
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/trips')}>
          <span className="material-icons">route</span> Trips
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/module/fleet/maintenance-alerts')}>
          <span className="material-icons">notifications_active</span> Alerts ({alerts.length})
        </button>
      </PageHeader>

      {/* Compliance & critical alerts */}
      {expiredCount > 0 && (
        <AlertBanner type="danger" message={`${expiredCount} asset(s) have EXPIRED compliance documents — immediate action required`} />
      )}
      {openAccidents > 0 && (
        <AlertBanner type="warning" message={
          <span>{openAccidents} open accident report(s) pending resolution — <a href="#" onClick={e => { e.preventDefault(); navigate('/module/fleet/accidents') }} style={{ color: 'inherit', textDecoration: 'underline' }}>View Reports</a></span>
        } />
      )}

      {/* ── F7: Executive KPI Banner (8-tile 4×2 grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            label: 'Fleet Availability',
            value: `${availabilityPct}%`,
            sub: `${openBreakdowns} open breakdown${openBreakdowns !== 1 ? 's' : ''}`,
            icon: 'verified',
            color: availabilityPct >= 90 ? 'green' : availabilityPct >= 75 ? 'yellow' : 'red',
          },
          {
            label: 'Downtime %',
            value: `${downtimePct}%`,
            sub: `${inWorkshopCount} workshop + ${brokenDownCount} broken`,
            icon: 'report_problem',
            color: downtimePct === 0 ? 'green' : downtimePct < 15 ? 'yellow' : 'red',
          },
          {
            label: 'Overdue PMs',
            value: execKpis.overduePMs,
            sub: 'Critical + overdue',
            icon: 'notifications_active',
            color: execKpis.overduePMs === 0 ? 'green' : execKpis.overduePMs < 5 ? 'yellow' : 'red',
          },
          {
            label: 'Assets Broken Down',
            value: openBreakdowns,
            sub: 'Open breakdown reports',
            icon: 'car_crash',
            color: openBreakdowns === 0 ? 'green' : 'red',
          },
          {
            label: 'Fuel Spend MTD',
            value: fmtM(execKpis.fuelMTD),
            sub: 'Month-to-date',
            icon: 'local_gas_station',
            color: 'yellow',
          },
          {
            label: 'Maintenance Spend MTD',
            value: fmtM(execKpis.maintMTD),
            sub: 'Closed WOs this month',
            icon: 'build',
            color: 'blue',
          },
          {
            label: 'Avg Cost per KM',
            value: execKpis.avgCostPerKm > 0 ? `K${execKpis.avgCostPerKm.toFixed(3)}/km` : '—',
            sub: 'Fleet P&L aggregate',
            icon: 'speed',
            color: 'teal',
          },
          {
            label: 'Total Fleet Assets',
            value: totalFleetAssets || totalFleet,
            sub: `${activeVehicles} vehicles active`,
            icon: 'directions_car',
            color: 'gold',
          },
        ].map((kpi, i) => (
          <KPICard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} color={kpi.color} />
        ))}
      </div>

      {/* ── F7.4: Fleet Health Score Gauge ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <HealthGaugeMini score={fleetHealthScore} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: healthColor(fleetHealthScore), marginBottom: 2 }}>
              Fleet Health Score: {fleetHealthScore}/100 — Grade {gradeOf(fleetHealthScore)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
              Composite score across {healthScores.length} assets (PM Compliance + Availability + Fuel Efficiency + Repair Rate)
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'PM Compliance', val: healthScores.length ? (healthScores.reduce((s, a) => s + Number(a.pm_score || 0), 0) / healthScores.length).toFixed(1) : '—', color: 'var(--blue)', max: 25 },
                { label: 'Availability',  val: healthScores.length ? (healthScores.reduce((s, a) => s + Number(a.availability_score || 0), 0) / healthScores.length).toFixed(1) : '—', color: 'var(--green)', max: 25 },
                { label: 'Repair Rate',   val: healthScores.length ? (healthScores.reduce((s, a) => s + Number(a.repair_score || 0), 0) / healthScores.length).toFixed(1) : '—', color: 'var(--teal)', max: 25 },
                { label: 'Fuel Eff.',     val: '20.0', color: 'var(--yellow)', max: 25 },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: `color-mix(in srgb,${s.color} 12%,var(--surface2))`,
                  border: `1px solid color-mix(in srgb,${s.color} 25%,transparent)`,
                  color: s.color,
                }}>
                  {s.label}: {s.val}/{s.max}
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/module/fleet/analytics')}>
            <span className="material-icons" style={{ fontSize: 15 }}>insights</span> Full Analytics
          </button>
        </div>
      </div>

      {/* Live Fleet Status Grid */}
      {Object.keys(statusCounts).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 12, marginBottom: 20 }}>
          {STATUS_TILES.map(tile => {
            const count = statusCounts[tile.key] || 0
            return (
              <div key={tile.key} style={{
                background: count > 0 ? `color-mix(in srgb,${tile.color} 10%,var(--surface))` : 'var(--surface)',
                border: `1px solid ${count > 0 ? `color-mix(in srgb,${tile.color} 30%,transparent)` : 'var(--border)'}`,
                borderRadius: 10, padding: '14px 12px', textAlign: 'center',
              }}>
                <span className="material-icons" style={{ color: count > 0 ? tile.color : 'var(--text-dim)', fontSize: 24, display: 'block', marginBottom: 4 }}>{tile.icon}</span>
                <div style={{ fontSize: 26, fontWeight: 800, color: count > 0 ? tile.color : 'var(--text-dim)', lineHeight: 1.1 }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textTransform: 'uppercase', letterSpacing: .5 }}>{tile.label}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Main KPIs */}
      <div className="kpi-grid">
        <KPICard label="Total Fleet Assets" value={totalFleet}          sub={`Vehicles: ${activeVehicles} active`} icon="directions_car" color="gold" />
        <KPICard label="Generators"         value={generators.length}   sub={`Heavy Equipment: ${earthMovers.length}`} icon="bolt" color="yellow" />
        <KPICard label="Avg Fuel Efficiency" value={`${avgEfficiency.toFixed(1)} km/L`} sub="Fleet average" icon="local_gas_station" color="teal" />
        <KPICard label="Critical Health"    value={criticalHealth}      sub="Assets below 40% health" icon="warning" color="red" />
        <KPICard label="Availability"       value={`${availabilityPct}%`} sub={`${openBreakdowns} broken down`} icon="verified" color={availabilityPct >= 90 ? 'green' : availabilityPct >= 70 ? 'yellow' : 'red'} />
      </div>

      {/* Critical Alert Strip */}
      {urgentAlerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4, color: 'var(--red)' }}>notifications_active</span>
            Critical / Overdue PM Alerts
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {urgentAlerts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 20, flexShrink: 0, fontSize: 12,
                background: a.urgency === 'critical' ? 'color-mix(in srgb,var(--red) 12%,var(--surface))' : 'color-mix(in srgb,var(--yellow) 12%,var(--surface))',
                border: `1px solid ${a.urgency === 'critical' ? 'color-mix(in srgb,var(--red) 30%,transparent)' : 'color-mix(in srgb,var(--yellow) 30%,transparent)'}`,
              }}>
                <span className="material-icons" style={{ fontSize: 14, color: a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)' }}>
                  {a.urgency === 'critical' ? 'error' : 'warning'}
                </span>
                <span style={{ fontWeight: 600 }}>{a.asset_name || a.asset_reg || '—'}</span>
                <span style={{ color: 'var(--text-dim)' }}>— {a.task_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance + Fuel row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Compliance Status */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Compliance Status</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fleet/vehicles')}>
              View All
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: 'var(--surface2)', border: `1px solid ${expiredCount > 0 ? 'var(--red)' : 'var(--border)'}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: expiredCount > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{expiredCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Expired</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: 'var(--surface2)', border: `1px solid ${expiringCount > 0 ? 'var(--yellow)' : 'var(--border)'}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: expiringCount > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>{expiringCount}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Expiring Soon</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, borderRadius: 8, background: 'var(--surface2)' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
                {Math.max(0, vehicles.length - expiredCount - expiringCount)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Compliant</div>
            </div>
          </div>
          {docWarnings.slice(0, 4).map((d, i) => (
            <div key={d.id || i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>{d.doc_type?.replace(/_/g, ' ')} — {d.asset_id}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: expiryColor(d.expiry_date), fontWeight: 700 }}>{d.expiry_date}</span>
            </div>
          ))}
          {docWarnings.length === 0 && <EmptyState icon="check_circle" message="All compliance docs current" />}
        </div>

        {/* Fuel Tank Status */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Fuel Tank Status</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fuel/tanks')}>
              Fuel Module
            </button>
          </div>
          {fuelTanks.length === 0 ? (
            <EmptyState icon="local_gas_station" message="No fuel tanks configured" />
          ) : fuelTanks.map(tank => {
            const pct = tank.capacity > 0 ? ((tank.current_level || 0) / tank.capacity) * 100 : 0
            const col = pct < 10 ? 'var(--red)' : pct < 20 ? 'var(--yellow)' : 'var(--teal)'
            return (
              <div key={tank.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{tank.name}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: col, fontWeight: 700 }}>
                    {(tank.current_level || 0).toLocaleString()} L &nbsp;
                    <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: col, borderRadius: 6, transition: 'width .6s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming PM + Overdue Maintenance row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Upcoming PM (next 30 days)</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fleet/preventive-maintenance')}>View</button>
          </div>
          {upcomingPM.length === 0 ? (
            <EmptyState icon="event_available" message="No PM due in next 30 days" />
          ) : upcomingPM.map(pm => (
            <div key={pm.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{pm.asset_reg}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{pm.task_name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${pm.priority === 'critical' ? 'badge-red' : pm.priority === 'high' ? 'badge-yellow' : 'badge-green'}`} style={{ fontSize: 9 }}>
                  {pm.priority}
                </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: expiryColor(pm.next_due_date) }}>{pm.next_due_date}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Overdue Maintenance Alerts</h3>
            {overdueWOs > 0 && (
              <span className="badge badge-red">{overdueWOs} overdue WOs</span>
            )}
          </div>
          {alerts.length === 0 ? (
            <EmptyState icon="check_circle" message="No overdue maintenance" />
          ) : alerts.slice(0, 5).map((a, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ color: 'var(--red)', fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
                {a.asset} — {a.message}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/module/fleet/${a.type}s`)}>View</button>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Trips */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Recent Trips</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fleet/trips')}>All Trips</button>
        </div>
        {recentTrips.length === 0 ? (
          <EmptyState icon="route" message="No trip records yet" />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Date</th><th>Driver</th><th>Purpose</th><th>Asset</th></tr></thead>
              <tbody>
                {recentTrips.map(t => (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td>{t.driver_name || '—'}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.purpose || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.asset_id || t.vehicle_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Recent Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentActivity.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="material-icons" style={{ color: item.color, fontSize: 18, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{item.sub}</div>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                  {item.ts ? new Date(item.ts).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h3>
        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
          {canViewVehicles   && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/vehicles')}>Manage Vehicles</button>}
          {canViewGenerators && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/generators')}>Generators</button>}
          {canViewHeavy      && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/heavy-equipment')}>Heavy Equipment</button>}
          <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/trips')}>Trip Log</button>
          <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/accidents')}>Accident Reports</button>
          <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/preventive-maintenance')}>Schedule PM</button>
        </div>
      </div>
    </div>
  )
}
