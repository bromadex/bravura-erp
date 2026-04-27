import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'

export default function MaintenanceAlerts() {
  const navigate = useNavigate()
  const { vehicles, generators, earthMovers, assetIssues, getNextService, getHealthScore, getHealthStatus } = useFleet()

  const allAssets = [
    ...vehicles.map(v => ({ ...v, type: 'vehicle', assetType: 'Vehicle', reg: v.reg, id: v.id })),
    ...generators.map(g => ({ ...g, type: 'generator', assetType: 'Generator', reg: g.gen_code, id: g.id })),
    ...earthMovers.map(e => ({ ...e, type: 'earthmover', assetType: 'Heavy Equipment', reg: e.reg, id: e.id })),
  ]

  const assetAlerts = allAssets.map(asset => {
    const nextService = getNextService(asset)
    const isOverdue = nextService?.type === 'date' && new Date(nextService) < new Date()
    const healthScore = getHealthScore(asset, asset.type)
    const health = getHealthStatus(healthScore)
    return { asset, nextService, isOverdue, health, healthScore }
  }).filter(a => a.isOverdue || a.healthScore < 50)

  // Critical open issues (urgency 'critical' and status != 'resolved')
  const criticalIssues = assetIssues.filter(i => i.urgency === 'critical' && i.status !== 'resolved')

  const alerts = [...assetAlerts, ...criticalIssues.map(i => ({
    asset: { reg: i.asset_id, assetType: i.asset_type, ...i },
    isOverdue: false,
    health: { label: 'Critical Issue', color: 'var(--red)', icon: 'error' },
    criticalIssue: true,
    issue: i
  }))]

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
        alerts.map((alert, idx) => (
          <div key={idx} className="card" style={{ padding: 16, marginBottom: 16, borderLeft: `4px solid ${alert.isOverdue ? 'var(--red)' : alert.health?.color || 'var(--red)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {alert.asset.reg || alert.asset.asset_id}
                  {alert.criticalIssue && <span className="badge" style={{ background: 'var(--red)22', color: 'var(--red)', marginLeft: 8 }}>Critical Issue</span>}
                </div>
                {alert.criticalIssue ? (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{alert.issue.issue_description}</div>
                    <div style={{ fontSize: 12 }}>Reported: {alert.issue.reported_date} · Urgency: {alert.issue.urgency}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{alert.asset.assetType} · Status: {alert.asset.status}</div>
                    {alert.isOverdue && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>Service overdue since {alert.nextService}</div>}
                    {!alert.isOverdue && <div style={{ fontSize: 12 }}>Health Score: {alert.healthScore}% · {alert.health.label}</div>}
                  </>
                )}
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/module/fleet/${alert.asset.type || alert.asset.asset_type}s`)}>View</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
