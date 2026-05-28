// src/pages/Fleet/FleetDashboard.jsx — enhanced with compliance, PM, fuel KPIs

import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, AlertBanner } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]
const in30  = new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0]

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

  return (
    <div>
      <PageHeader title="Fleet Intelligence Dashboard">
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

      {/* Main KPIs */}
      <div className="kpi-grid">
        <KPICard label="Total Fleet Assets" value={totalFleet}          sub={`Vehicles: ${activeVehicles} active`} icon="directions_car" color="gold" />
        <KPICard label="Generators"         value={generators.length}   sub={`Heavy Equipment: ${earthMovers.length}`} icon="bolt" color="yellow" />
        <KPICard label="Avg Fuel Efficiency" value={`${avgEfficiency.toFixed(1)} km/L`} sub="Fleet average" icon="local_gas_station" color="teal" />
        <KPICard label="Critical Health"    value={criticalHealth}      sub="Assets below 40% health" icon="warning" color="red" />
      </div>

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
