import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'

export default function FleetDashboard() {
  const navigate = useNavigate()
  const { vehicles, generators, earthMovers, getOverdueAlerts, getVehicleFuelEfficiency, getHealthScore, getHealthStatus } = useFleet()
  const alerts = getOverdueAlerts()

  const totalVehicles = vehicles.length
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length
  const totalGenerators = generators.length
  const totalEquipment = earthMovers.length

  const avgVehicleEfficiency = vehicles.reduce((sum, v) => {
    const eff = getVehicleFuelEfficiency(v.reg)
    return sum + (eff?.kmPerLiter || 0)
  }, 0) / (vehicles.length || 1)

  const criticalHealth = [...vehicles, ...generators, ...earthMovers].filter(a => getHealthScore(a, a.reg ? 'vehicle' : 'generator') < 40).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fleet Intelligence Dashboard</h1>
        <button className="btn btn-primary" onClick={() => navigate('/module/fleet/maintenance-alerts')}>
          <span className="material-icons">notifications_active</span> Alerts ({alerts.length})
        </button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Total Vehicles</div><div className="kpi-val">{totalVehicles}</div><div className="kpi-sub">Active: {activeVehicles}</div></div>
        <div className="kpi-card"><div className="kpi-label">Generators</div><div className="kpi-val">{totalGenerators}</div><div className="kpi-sub">Heavy Equipment: {totalEquipment}</div></div>
        <div className="kpi-card"><div className="kpi-label">Avg Fuel Efficiency</div><div className="kpi-val">{avgVehicleEfficiency.toFixed(1)} km/L</div><div className="kpi-sub">Fleet average</div></div>
        <div className="kpi-card"><div className="kpi-label">Critical Health</div><div className="kpi-val">{criticalHealth}</div><div className="kpi-sub">Assets needing attention</div></div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔔 Overdue Maintenance Alerts</h3>
        {alerts.length === 0 ? <div className="empty-state">No overdue maintenance</div> : alerts.map((a, i) => (
          <div key={i} style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><span className="material-icons" style={{ color: 'var(--red)', fontSize: 16 }}>warning</span> {a.asset} – {a.message}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/module/fleet/${a.type}s`)}>View</button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚙️ Quick Actions</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/module/fleet/vehicles')}>Manage Vehicles</button>
          <button className="btn btn-primary" onClick={() => navigate('/module/fleet/generators')}>Manage Generators</button>
          <button className="btn btn-primary" onClick={() => navigate('/module/fleet/heavy-equipment')}>Manage Heavy Equipment</button>
        </div>
      </div>
    </div>
  )
}
