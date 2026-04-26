import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'

export default function MaintenanceAlerts() {
  const navigate = useNavigate()
  const { vehicles, generators, earthMovers, getNextService, getHealthScore, getHealthStatus } = useFleet()

  const allAssets = [
    ...vehicles.map(v => ({ ...v, type: 'vehicle', assetType: 'Vehicle', reg: v.reg, id: v.id })),
    ...generators.map(g => ({ ...g, type: 'generator', assetType: 'Generator', reg: g.gen_code, id: g.id })),
    ...earthMovers.map(e => ({ ...e, type: 'earthmover', assetType: 'Heavy Equipment', reg: e.reg, id: e.id })),
  ]

  const alerts = allAssets.map(asset => {
    const nextService = getNextService(asset)
    const isOverdue = nextService?.type === 'date' && new Date(nextService) < new Date()
    const healthScore = getHealthScore(asset, asset.type)
    const health = getHealthStatus(healthScore)
    return { asset, nextService, isOverdue, health, healthScore }
  }).filter(a => a.isOverdue || a.healthScore < 50)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Maintenance Alerts</h1>
      </div>

      {alerts.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>check_circle</span>
          <div style={{ marginTop: 12 }}>All assets are in good health. No urgent alerts.</div>
        </div>
      ) : (
        alerts.map(({ asset, nextService, isOverdue, health, healthScore }) => (
          <div key={asset.id} className="card" style={{ padding: 16, marginBottom: 16, borderLeft: `4px solid ${isOverdue ? 'var(--red)' : health.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{asset.reg} <span className="badge" style={{ background: health.color + '22', color: health.color }}>{health.label}</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{asset.assetType} · Status: {asset.status}</div>
                {isOverdue && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>🔴 Service overdue since {nextService}</div>}
                {asset.last_service_date && !isOverdue && <div style={{ fontSize: 12 }}>🟢 Next service: {nextService?.type === 'date' ? nextService : `${nextService?.value} km/hours`}</div>}
                <div style={{ marginTop: 4, fontSize: 12 }}>Health Score: <strong>{healthScore}%</strong></div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/module/fleet/${asset.type}s`)}>View Details</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
