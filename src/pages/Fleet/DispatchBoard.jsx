// src/pages/Fleet/DispatchBoard.jsx — Live operational command centre for fleet dispatch

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState, KPICard } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const STATUS_CONFIG = {
  active:       { label: 'Active',       icon: 'check_circle',   color: 'var(--green)'  },
  in_workshop:  { label: 'In Workshop',  icon: 'engineering',    color: 'var(--blue)'   },
  broken_down:  { label: 'Broken Down',  icon: 'report_problem', color: 'var(--red)'    },
  idle:         { label: 'Idle',         icon: 'pause_circle',   color: 'var(--yellow)' },
  available:    { label: 'Available',    icon: 'local_parking',  color: 'var(--teal)'   },
}

function statusPill(s) {
  const cfg = STATUS_CONFIG[s?.toLowerCase()] || { label: s || 'Unknown', color: 'var(--text-dim)' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: `color-mix(in srgb,${cfg.color} 15%,var(--surface2))`,
      color: cfg.color,
      border: `1px solid color-mix(in srgb,${cfg.color} 30%,transparent)`,
    }}>{cfg.label}</span>
  )
}

export default function DispatchBoard() {
  const navigate   = useNavigate()
  const timerRef   = useRef(null)

  const [statusCounts,    setStatusCounts]    = useState({})
  const [statusFilter,    setStatusFilter]    = useState('')
  const [assets,          setAssets]          = useState([])
  const [assetsLoading,   setAssetsLoading]   = useState(true)
  const [activeTrips,     setActiveTrips]     = useState([])
  const [tripsLoading,    setTripsLoading]    = useState(true)
  const [pmAlerts,        setPmAlerts]        = useState([])
  const [brkAlerts,       setBrkAlerts]       = useState([])
  const [openBreakdowns,  setOpenBreakdowns]  = useState(0)
  const [openWOs,         setOpenWOs]         = useState(0)
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set())
  const [selectedAsset,   setSelectedAsset]   = useState(null)
  const [assetDetail,     setAssetDetail]     = useState(null)
  const [detailLoading,   setDetailLoading]   = useState(false)
  const [lastRefresh,     setLastRefresh]     = useState(new Date())

  // ── data loaders ─────────────────────────────────────────────────────────────

  const loadStatusCounts = useCallback(async () => {
    const { data } = await supabase
      .from('asset_registry')
      .select('operational_status')
      .catch(() => ({ data: [] }))
    const counts = {}
    ;(data || []).forEach(a => {
      const s = (a.operational_status || 'unknown').toLowerCase()
      counts[s] = (counts[s] || 0) + 1
    })
    setStatusCounts(counts)
  }, [])

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    let q = supabase
      .from('asset_registry')
      .select('id,fleet_number,asset_code,asset_name,plate_number,operational_status,assigned_to,current_odometer,current_engine_hours')
      .order('asset_name')
    if (statusFilter) q = q.eq('operational_status', statusFilter)
    const { data } = await q.catch(() => ({ data: [] }))
    setAssets(data || [])
    setAssetsLoading(false)
  }, [statusFilter])

  const loadActiveTrips = useCallback(async () => {
    setTripsLoading(true)
    // Trips from today with trip_status in_progress OR no trip_status set
    const { data } = await supabase
      .from('vehicle_trips')
      .select('id,trip_no,asset_id,driver_name,route_from,route_to,start_odometer,distance,fuel_used,trip_status,date,created_at')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(20)
      .catch(() => ({ data: [] }))

    // Prefer in_progress trips; fall back to all today's trips
    const inProgress = (data || []).filter(t => t.trip_status === 'in_progress')
    setActiveTrips(inProgress.length > 0 ? inProgress : (data || []).slice(0, 10))
    setTripsLoading(false)
  }, [])

  const loadAlerts = useCallback(async () => {
    const [pmRes, brkRes, woCnt, brkCnt] = await Promise.all([
      supabase.from('maintenance_pm_urgency').select('asset_name,asset_reg,task_name,urgency').in('urgency', ['critical', 'overdue']).limit(5).catch(() => ({ data: [] })),
      supabase.from('breakdown_reports').select('id,breakdown_no,asset_name,description,severity,reported_at').eq('status', 'open').limit(5).catch(() => ({ data: [] })),
      supabase.from('maintenance_work_orders').select('id', { count: 'exact' }).eq('status', 'open').catch(() => ({ count: 0 })),
      supabase.from('breakdown_reports').select('id', { count: 'exact' }).eq('status', 'open').catch(() => ({ count: 0 })),
    ])
    setPmAlerts(pmRes.data || [])
    setBrkAlerts(brkRes.data || [])
    setOpenWOs(woCnt.count || 0)
    setOpenBreakdowns(brkCnt.count || 0)
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatusCounts(), loadAssets(), loadActiveTrips(), loadAlerts()])
    setLastRefresh(new Date())
  }, [loadStatusCounts, loadAssets, loadActiveTrips, loadAlerts])

  useEffect(() => { loadAll() }, [loadAll])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => loadAll(), 60000)
    return () => clearInterval(timerRef.current)
  }, [loadAll])

  // Asset detail panel
  const loadAssetDetail = useCallback(async (asset) => {
    if (!asset) { setAssetDetail(null); return }
    setSelectedAsset(asset)
    setDetailLoading(true)
    const [tripsRes, fuelRes, woRes, pmRes] = await Promise.all([
      supabase.from('vehicle_trips').select('id,trip_no,date,driver_name,route_from,route_to,distance').eq('asset_id', asset.id).order('date', { ascending: false }).limit(5).catch(() => ({ data: [] })),
      supabase.from('fuel_issuance').select('id,date,quantity,driver_operator,odometer_reading').eq('asset_id', asset.id).order('date', { ascending: false }).limit(1).catch(() => ({ data: [] })),
      supabase.from('maintenance_work_orders').select('id,wo_number,status,task_name,planned_end_date').eq('asset_id', asset.id).neq('status', 'closed').order('created_at', { ascending: false }).limit(3).catch(() => ({ data: [] })),
      supabase.from('maintenance_pm_urgency').select('task_name,urgency,next_due_date,next_due_km').eq('asset_id', asset.id).limit(3).catch(() => ({ data: [] })),
    ])
    setAssetDetail({
      recentTrips: tripsRes.data || [],
      lastFuel:    (fuelRes.data || [])[0] || null,
      openWOs:     woRes.data || [],
      upcomingPM:  pmRes.data || [],
    })
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    if (statusFilter) loadAssets()
  }, [statusFilter, loadAssets])

  const totalAssets = Object.values(statusCounts).reduce((s, v) => s + v, 0)

  const visiblePmAlerts  = pmAlerts.filter(a => !dismissedAlerts.has('pm-' + a.asset_reg + a.task_name))
  const visibleBrkAlerts = brkAlerts.filter(a => !dismissedAlerts.has('brk-' + a.id))

  const dismiss = (key) => setDismissedAlerts(prev => new Set([...prev, key]))

  return (
    <div>
      <PageHeader title="Dispatch Board">
        <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>
          <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }}>refresh</span>
          Refreshed {lastRefresh.toLocaleTimeString()}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={loadAll}>
          <span className="material-icons" style={{ fontSize: 14 }}>refresh</span> Refresh
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/module/fleet/trips')}>
          <span className="material-icons">route</span> Trips
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/module/fleet/operator-assignments')}>
          <span className="material-icons">person_pin</span> Assign Operator
        </button>
      </PageHeader>

      {/* ── Open Alerts Strip ──────────────────────────────────────────────── */}
      {(visiblePmAlerts.length > 0 || visibleBrkAlerts.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4, color: 'var(--red)' }}>notifications_active</span>
            Open Alerts
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {visiblePmAlerts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                borderRadius: 20, fontSize: 11, flexShrink: 0,
                background: a.urgency === 'critical' ? 'color-mix(in srgb,var(--red) 12%,var(--surface))' : 'color-mix(in srgb,var(--yellow) 12%,var(--surface))',
                border: `1px solid ${a.urgency === 'critical' ? 'color-mix(in srgb,var(--red) 30%,transparent)' : 'color-mix(in srgb,var(--yellow) 30%,transparent)'}`,
              }}>
                <span className="material-icons" style={{ fontSize: 13, color: a.urgency === 'critical' ? 'var(--red)' : 'var(--yellow)' }}>build</span>
                <strong>{a.asset_name || a.asset_reg}</strong>
                <span style={{ color: 'var(--text-dim)' }}>PM: {a.task_name}</span>
                <span className={`badge ${a.urgency === 'critical' ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 9 }}>{a.urgency}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, lineHeight: 1, padding: 0 }}
                  onClick={() => dismiss('pm-' + a.asset_reg + a.task_name)}>×</button>
              </div>
            ))}
            {visibleBrkAlerts.map((a) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
                borderRadius: 20, fontSize: 11, flexShrink: 0,
                background: 'color-mix(in srgb,var(--red) 12%,var(--surface))',
                border: '1px solid color-mix(in srgb,var(--red) 30%,transparent)',
              }}>
                <span className="material-icons" style={{ fontSize: 13, color: 'var(--red)' }}>report_problem</span>
                <strong>{a.asset_name || '—'}</strong>
                <span style={{ color: 'var(--text-dim)' }}>Breakdown open</span>
                {a.severity && <span className="badge badge-red" style={{ fontSize: 9 }}>{a.severity}</span>}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, lineHeight: 1, padding: 0 }}
                  onClick={() => dismiss('brk-' + a.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI summary row ──────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Fleet Assets" value={totalAssets}            sub="all assets"             color="gold"   icon="directions_car" />
        <KPICard label="Active Today"        value={activeTrips.length}    sub="trips recorded today"   color="green"  icon="route" />
        <KPICard label="Open Breakdowns"     value={openBreakdowns}        sub="pending resolution"     color={openBreakdowns > 0 ? 'red' : 'teal'}    icon="report_problem" />
        <KPICard label="Open Work Orders"    value={openWOs}               sub="maintenance WOs"        color={openWOs > 0 ? 'yellow' : 'teal'}        icon="build" />
      </div>

      {/* ── Live Fleet Status Grid ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Live Fleet Status — click to filter
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div
            onClick={() => setStatusFilter('')}
            style={{
              cursor: 'pointer', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 100,
              background: !statusFilter ? 'color-mix(in srgb,var(--primary) 15%,var(--surface))' : 'var(--surface)',
              border: `1px solid ${!statusFilter ? 'var(--primary)' : 'var(--border)'}`,
              transition: 'all .2s',
            }}>
            <span className="material-icons" style={{ color: !statusFilter ? 'var(--primary)' : 'var(--text-dim)', fontSize: 20, display: 'block', marginBottom: 4 }}>grid_view</span>
            <div style={{ fontSize: 22, fontWeight: 800, color: !statusFilter ? 'var(--primary)' : 'var(--text-dim)', lineHeight: 1.1 }}>{totalAssets}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textTransform: 'uppercase', letterSpacing: .5 }}>All</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] || 0
            const active = statusFilter === key
            return (
              <div key={key} onClick={() => setStatusFilter(active ? '' : key)} style={{
                cursor: 'pointer', borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 100,
                background: active ? `color-mix(in srgb,${cfg.color} 15%,var(--surface))` : count > 0 ? `color-mix(in srgb,${cfg.color} 8%,var(--surface))` : 'var(--surface)',
                border: `1px solid ${active ? cfg.color : count > 0 ? `color-mix(in srgb,${cfg.color} 25%,transparent)` : 'var(--border)'}`,
                transition: 'all .2s',
              }}>
                <span className="material-icons" style={{ color: count > 0 ? cfg.color : 'var(--text-dim)', fontSize: 20, display: 'block', marginBottom: 4 }}>{cfg.icon}</span>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? cfg.color : 'var(--text-dim)', lineHeight: 1.1 }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textTransform: 'uppercase', letterSpacing: .5 }}>{cfg.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main grid: Active Trips + Asset Table ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedAsset ? '1fr 1fr 320px' : '1fr 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>

        {/* Active Trips Panel */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--green)' }}>route</span>
              Active / Today's Trips
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fleet/trips')}>All Trips</button>
          </div>
          {tripsLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</div>
          ) : activeTrips.length === 0 ? (
            <EmptyState icon="route" message="No trips recorded today" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeTrips.map(t => (
                <div key={t.id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: t.trip_status === 'in_progress' ? 'color-mix(in srgb,var(--green) 8%,var(--surface2))' : 'var(--surface2)',
                  border: `1px solid ${t.trip_status === 'in_progress' ? 'color-mix(in srgb,var(--green) 25%,transparent)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {t.trip_no || t.asset_id || '—'}
                    </span>
                    {t.trip_status && (
                      <span className={`badge ${t.trip_status === 'in_progress' ? 'badge-green' : t.trip_status === 'completed' ? 'badge-teal' : 'badge-yellow'}`} style={{ fontSize: 9 }}>
                        {t.trip_status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    <span className="material-icons" style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 3 }}>person</span>
                    {t.driver_name || '—'}
                  </div>
                  {(t.route_from || t.route_to) && (
                    <div style={{ fontSize: 11, marginTop: 3 }}>
                      <span style={{ color: 'var(--text-dim)' }}>{t.route_from || '?'}</span>
                      <span className="material-icons" style={{ fontSize: 11, verticalAlign: 'middle', margin: '0 4px', color: 'var(--teal)' }}>arrow_forward</span>
                      <span style={{ color: 'var(--teal)' }}>{t.route_to || '?'}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {t.distance > 0 && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 600 }}>{t.distance} km</span>}
                    {t.fuel_used > 0 && <span style={{ fontSize: 10, color: 'var(--yellow)' }}>{t.fuel_used} L</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asset Status Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--blue)' }}>directions_car</span>
              Asset Status {statusFilter && `— ${STATUS_CONFIG[statusFilter]?.label}`}
            </h3>
            {statusFilter && (
              <button className="btn btn-secondary btn-sm" onClick={() => setStatusFilter('')}>
                <span className="material-icons" style={{ fontSize: 12 }}>close</span> Clear filter
              </button>
            )}
          </div>
          {assetsLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</div>
          ) : assets.length === 0 ? (
            <EmptyState icon="directions_car" message="No assets match the filter" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Fleet No</th>
                    <th>Asset</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th style={{ textAlign: 'right' }}>Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id} onClick={() => loadAssetDetail(selectedAsset?.id === a.id ? null : a)}
                      style={{ cursor: 'pointer', background: selectedAsset?.id === a.id ? 'color-mix(in srgb,var(--primary) 8%,var(--surface))' : '' }}>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{a.fleet_number || a.asset_code || '—'}</td>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{a.asset_name || a.plate_number || '—'}</td>
                      <td>{statusPill(a.operational_status)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.assigned_to || '—'}
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', fontSize: 11 }}>
                        {a.current_odometer ? `${Number(a.current_odometer).toLocaleString()} km` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Asset Detail Panel (shown when row clicked) */}
        {selectedAsset && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {selectedAsset.asset_name || selectedAsset.plate_number}
              </span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18 }}
                onClick={() => { setSelectedAsset(null); setAssetDetail(null) }}>×</button>
            </div>
            <div style={{ marginBottom: 10 }}>
              {statusPill(selectedAsset.operational_status)}
              {selectedAsset.fleet_number && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>#{selectedAsset.fleet_number}</span>
              )}
            </div>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>Loading…</div>
            ) : assetDetail ? (
              <>
                {/* Recent Trips */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Recent Trips</div>
                  {assetDetail.recentTrips.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No trips recorded</div>
                  ) : assetDetail.recentTrips.map(t => (
                    <div key={t.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-dim)' }}>{t.date}</span>
                      <span>{t.route_from && t.route_to ? `${t.route_from} → ${t.route_to}` : t.route_from || t.route_to || t.driver_name || '—'}</span>
                      <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{t.distance ? `${t.distance} km` : ''}</span>
                    </div>
                  ))}
                </div>

                {/* Last Fuel */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Last Fuel Fill</div>
                  {assetDetail.lastFuel ? (
                    <div style={{ fontSize: 11 }}>
                      <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{assetDetail.lastFuel.quantity} L</span>
                      <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{assetDetail.lastFuel.date}</span>
                      {assetDetail.lastFuel.odometer_reading && (
                        <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>@{Number(assetDetail.lastFuel.odometer_reading).toLocaleString()} km</span>
                      )}
                    </div>
                  ) : <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No fuel records</div>}
                </div>

                {/* Open WOs */}
                {assetDetail.openWOs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Open Work Orders</div>
                    {assetDetail.openWOs.map(w => (
                      <div key={w.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{w.wo_number}</span>
                        <span style={{ color: 'var(--text-dim)', flex: 1 }}>{w.task_name}</span>
                        <span className={`badge ${w.status === 'open' ? 'badge-yellow' : 'badge-teal'}`} style={{ fontSize: 9 }}>{w.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upcoming PM */}
                {assetDetail.upcomingPM.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Next PM Due</div>
                    {assetDetail.upcomingPM.map((pm, i) => (
                      <div key={i} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ flex: 1 }}>{pm.task_name}</span>
                        <span className={`badge ${pm.urgency === 'critical' ? 'badge-red' : pm.urgency === 'overdue' ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 9 }}>
                          {pm.urgency}
                        </span>
                        {pm.next_due_date && <span style={{ color: 'var(--text-dim)' }}>{pm.next_due_date}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}

            <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }}
              onClick={() => navigate(`/module/fleet/vehicle/${selectedAsset.id}`)}>
              <span className="material-icons" style={{ fontSize: 12 }}>open_in_new</span> Full Vehicle Detail
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
