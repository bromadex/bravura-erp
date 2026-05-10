// src/components/ui/SectionCard.jsx
// Card container with optional title and action buttons in the header.

export function SectionCard({ title, actions, children, style, padding = 16, mb = 16 }) {
  return (
    <div className="card" style={{ padding, marginBottom: mb, ...style }}>
      {(title || actions) && (
        <div className="section-card-header">
          {title && <span className="section-title">{title}</span>}
          {actions && <div className="btn-group-sm">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
