// src/components/ui/PageHeader.jsx
// Consistent page title row with optional subtitle and action buttons.

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="btn-group">{children}</div>}
    </div>
  )
}
