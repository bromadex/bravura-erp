// src/components/PermissionRoute.jsx
// 🔧 TEMPORARY: All permission checks DISABLED – always renders children

import { Navigate } from 'react-router-dom'
import { usePermission } from '../contexts/PermissionContext'
import { useAuth } from '../contexts/AuthContext'

export default function PermissionRoute({ children, module, page, redirectTo = '/access-denied' }) {
  const { user, loading } = useAuth()

  // 🔧 TEMPORARY: No permission checks – just auth check
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-dim)',
      }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Always render children – no permission check
  return children
}
