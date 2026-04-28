// src/contexts/PermissionContext.jsx
// 🔧 TEMPORARY: All permission checks DISABLED – site will work immediately

import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const PermissionContext = createContext(null)

export function PermissionProvider({ children }) {
  const { user, permissions } = useAuth()
  const [cachedPermissions, setCachedPermissions] = useState({})

  useEffect(() => {
    if (permissions && permissions.length > 0) {
      const cache = {}
      permissions.forEach(p => {
        const key = `${p.module_name}|${p.page_name || ''}`
        cache[key] = {
          view:    p.can_view    ?? false,
          edit:    p.can_edit    ?? false,
          delete:  p.can_delete  ?? false,
          approve: p.can_approve ?? false,
        }
      })
      setCachedPermissions(cache)
    } else {
      setCachedPermissions({})
    }
  }, [permissions])

  // 🔧 TEMPORARY: All functions return TRUE – no restrictions
  const canView = () => true
  const canEdit = () => true
  const canDelete = () => true
  const canApprove = () => true
  const canManagePermissions = () => true

  const getVisiblePages = (moduleName, allPages) => {
    return allPages  // Return all pages, no filtering
  }

  const hasAnyVisiblePage = (moduleName, pages) => {
    return pages.length > 0
  }

  return (
    <PermissionContext.Provider value={{
      canView,
      canEdit,
      canDelete,
      canApprove,
      canManagePermissions,
      getVisiblePages,
      hasAnyVisiblePage,
      permissions: cachedPermissions,
    }}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermission() {
  const ctx = useContext(PermissionContext)
  if (!ctx) {
    throw new Error('usePermission() must be used inside PermissionProvider')
  }
  return ctx
}
