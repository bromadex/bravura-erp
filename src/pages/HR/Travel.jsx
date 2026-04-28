import { useCanView } from '../../hooks/usePermission'

export default function Travel() {
  const canView = useCanView('hr', 'travel')

  if (!canView) {
    return (
      <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>lock</span>
        <p>You don't have permission to view this page.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Travel & Expenses</h1>
      </div>
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <span className="material-icons" style={{ fontSize: 64, opacity: 0.3, marginBottom: 16 }}>flight</span>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Travel & Expenses</h3>
        <p style={{ color: 'var(--text-dim)' }}>This module is currently under development.</p>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>Features coming soon: travel requests, expense claims, approvals, reimbursement.</p>
      </div>
    </div>
  )
}
