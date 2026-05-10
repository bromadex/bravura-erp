// src/components/PermissionRoute.jsx
import { Navigate } from 'react-router-dom'
import { usePermission } from '../contexts/PermissionContext'
import { useAuth } from '../contexts/AuthContext'

export default function PermissionRoute({ children, module, page, redirectTo = '/access-denied' }) {
  const { user, loading } = useAuth()
  const { canView } = usePermission()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Super admin bypasses all route guards
  if (user.role_id === 'role_super_admin') return children

  // If no module specified, just require authentication
  if (!module) return children

  if (!canView(module, page || null)) {
    return <Navigate to={redirectTo} replace />
  }

  return children
}
