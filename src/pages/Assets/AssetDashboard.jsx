// src/pages/Assets/AssetDashboard.jsx
import { useAssetRegistry } from '../../contexts/AssetRegistryContext'
import { useNavigate } from 'react-router-dom'

export default function AssetDashboard() {
  const { assets, categoryConfigs, reclassLogs, loading, getAssetsByCategory, getServiceDueAssets } = useAssetRegistry()
  const navigate = useNavigate()

  const byCategory   = getAssetsByCategory()
  const serviceDue   = getServiceDueAssets()
  const active       = assets.filter(a => a.status === 'Active').length
  const inactive     = assets.filter(a => a.status !== 'Active').length
  const recentReclass = reclassLogs.slice(0, 5)

  const statusCounts = assets.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {})

  const statusColor = (s) => {
    if (s === 'Active')      return 'var(--green)'
    if (s === 'Maintenance') return 'var(--yellow)'
    if (s === 'Grounded')    return 'var(--red)'
    return 'var(--text-dim)'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Asset Dashboard</h1>
        <button className="btn btn-primary" onClick={() => navigate('/module/assets/registry')}>
          <span className="material-icons">inventory_2</span> Asset Registry
        </button>
      </div>

      {/* KPI Strip */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Assets</div>
          <div className="kpi-val">{loading ? '…' : assets.length}</div>
          <div className="kpi-sub">registered</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active</div>
          <div className="kpi-val" style={{ color: 'var(--green)' }}>{active}</div>
          <div className="kpi-sub">operational</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Categories</div>
          <div className="kpi-val" style={{ color: 'var(--gold)' }}>{categoryConfigs.length}</div>
          <div className="kpi-sub">configured</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Service Due</div>
          <div className="kpi-val" style={{ color: serviceDue.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {serviceDue.length}
          </div>
          <div className="kpi-sub">assets</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Category Breakdown */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--gold)' }}>Assets by Category</h3>
          {categoryConfigs.length === 0 && <div className="empty-state">No categories</div>}
          {categoryConfigs.map(cfg => {
            const count = byCategory[cfg.category] || 0
            const pct   = assets.length ? Math.round((count / assets.length) * 100) : 0
            return (
              <div key={cfg.category} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize: 13 }}>{cfg.display_label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Status Breakdown */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--gold)' }}>Status Breakdown</h3>
          {Object.entries(statusCounts).length === 0 && <div className="empty-state">No assets registered yet</div>}
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor(status), display: 'inline-block' }} />
                <span style={{ fontSize: 13 }}>{status}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Service Due */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--red)' }}>
            <span className="material-icons" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
            Service Due / Approaching
          </h3>
          {serviceDue.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <span className="material-icons" style={{ fontSize: 32, color: 'var(--green)', display: 'block', marginBottom: 8 }}>check_circle</span>
              All assets within service schedule
            </div>
          ) : serviceDue.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{a.asset_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.asset_code} · {a.asset_category}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>
                {a.primary_metric_val?.toLocaleString()} {a.measurement_type === 'km' ? 'km' : 'hrs'}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Reclassifications */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>Recent Reclassifications</h3>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => navigate('/module/assets/reclass-log')}>View All</button>
          </div>
          {recentReclass.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>No reclassifications yet</div>
          ) : recentReclass.map(r => (
            <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.asset_name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.txn_code}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {r.from_category} → {r.to_category} · {r.requested_by}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
