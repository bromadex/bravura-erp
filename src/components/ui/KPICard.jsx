// src/components/ui/KPICard.jsx
// Consistent metric card for KPI grids.

export function KPICard({ label, value, sub, icon, color = '', onClick, alert }) {
  return (
    <div
      className={`kpi-card${color ? ` kpi-${color}` : ''}${onClick ? ' clickable' : ''}${alert ? ' kpi-alert' : ''}`}
      onClick={onClick}
      title={onClick ? 'Click to filter' : undefined}
    >
      {icon && <div className="kpi-icon"><span className="material-icons md-18">{icon}</span></div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-val">{value ?? '—'}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
