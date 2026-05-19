// src/components/ui/EmptyState.jsx
// Standard empty-state placeholder for tables and lists.
// action: React element OR { label, onClick } shorthand

export function EmptyState({ icon = 'inbox', message = 'No records found', action }) {
  const actionEl = action
    ? (typeof action === 'object' && !('$$typeof' in action) && action.label)
        ? <button className="btn btn-primary btn-sm" onClick={action.onClick}>{action.label}</button>
        : action
    : null

  return (
    <div className="empty-state">
      <span className="material-icons md-36" style={{ opacity: .35 }}>{icon}</span>
      <span className="empty-text">{message}</span>
      {actionEl && <div style={{ marginTop: 8 }}>{actionEl}</div>}
    </div>
  )
}

