import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'
import { useCanView } from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'

export default function FleetDashboard() {
  const navigate = useNavigate()
  const { vehicles, generators, earthMovers, getOverdueAlerts, getVehicleFuelEfficiency, getHealthScore, getHealthStatus } = useFleet()
  const canViewVehicles = useCanView('fleet', 'vehicles')
  const canViewGenerators = useCanView('fleet', 'generators')
  const canViewHeavyEquipment = useCanView('fleet', 'heavy-equipment')
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
      <PageHeader title="Fleet Intelligence Dashboard">
        <button className="btn btn-primary" onClick={() => navigate('/module/fleet/maintenance-alerts')}>
          <span className="material-icons">notifications_active</span> Alerts ({alerts.length})
        </button>
      </PageHeader>

      <div className="kpi-grid">
        <KPICard label="Total Vehicles" value={totalVehicles} sub={`Active: ${activeVehicles}`} icon="directions_car" color="gold" />
        <KPICard label="Generators" value={totalGenerators} sub={`Heavy Equipment: ${totalEquipment}`} icon="bolt" color="yellow" />
        <KPICard label="Avg Fuel Efficiency" value={`${avgVehicleEfficiency.toFixed(1)} km/L`} sub="Fleet average" icon="local_gas_station" color="teal" />
        <KPICard label="Critical Health" value={criticalHealth} sub="Assets needing attention" icon="warning" color="red" />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>🔔 Overdue Maintenance Alerts</h3>
        {alerts.length === 0 ? (
          <EmptyState icon="check_circle" message="No overdue maintenance" />
        ) : alerts.map((a, i) => (
          <div key={i} style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><span className="material-icons" style={{ color: 'var(--red)', fontSize: 16 }}>warning</span> {a.asset} – {a.message}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/module/fleet/${a.type}s`)}>View</button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚙️ Quick Actions</h3>
        <div className="btn-group" style={{ flexWrap: 'wrap' }}>
          {canViewVehicles && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/vehicles')}>Manage Vehicles</button>}
          {canViewGenerators && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/generators')}>Manage Generators</button>}
          {canViewHeavyEquipment && <button className="btn btn-primary" onClick={() => navigate('/module/fleet/heavy-equipment')}>Manage Heavy Equipment</button>}
        </div>
      </div>
    </div>
  )
}
