// src/contexts/PermissionContext.jsx
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
          view: p.can_view ?? false,
          edit: p.can_edit ?? false,
          delete: p.can_delete ?? false,
          approve: p.can_approve ?? false,
        }
      })
      setCachedPermissions(cache)
    }
  }, [permissions])

  const canView = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.view === true) return true
    }
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.view === true
  }

  const canEdit = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.edit === true) return true
    }
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.edit === true
  }

  const canDelete = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.delete === true) return true
    }
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.delete === true
  }

  const canApprove = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.approve === true) return true
    }
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.approve === true
  }

  const canManagePermissions = () => {
    if (!user) return false
    return user.can_manage_permissions === true || user.role_id === 'role_super_admin'
  }

  const getVisiblePages = (moduleName, allPages) => {
    return allPages.filter(page => canView(moduleName, page.id))
  }

  const hasAnyVisiblePage = (moduleName, pages) => {
    return pages.some(page => canView(moduleName, page.id))
  }

  return (
    <PermissionContext.Provider value={{
      canView, canEdit, canDelete, canApprove, canManagePermissions,
      getVisiblePages, hasAnyVisiblePage, permissions: cachedPermissions,
    }}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermission() {
  const ctx = useContext(PermissionContext)
  if (!ctx) throw new Error('usePermission() must be used inside PermissionProvider')
  return ctx
}
