// src/components/ui/EmptyState.jsx
// Standard empty-state placeholder for tables and lists.

export function EmptyState({ icon = 'inbox', message = 'No records found', action }) {
  return (
    <div className="empty-state">
      <span className="material-icons md-36" style={{ opacity: .35 }}>{icon}</span>
      <span className="empty-text">{message}</span>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
