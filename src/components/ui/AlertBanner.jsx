// src/components/ui/AlertBanner.jsx
// Inline alert/notice banner with icon and message.

const ICON_MAP = {
  info:    'info',
  success: 'check_circle',
  warning: 'warning',
  danger:  'error',
}

export function AlertBanner({ type = 'info', icon, message, children, onDismiss }) {
  const iconName = icon || ICON_MAP[type] || 'info'
  return (
    <div className={`alert alert-${type}`}>
      <span className="material-icons md-18">{iconName}</span>
      <div style={{ flex: 1 }}>{message || children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
        >
          <span className="material-icons md-16">close</span>
        </button>
      )}
    </div>
  )
}
