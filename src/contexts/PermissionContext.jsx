import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const PermissionContext = createContext(null)

export function PermissionProvider({ children }) {
  const { user, permissions, hasPermission: authHasPermission } = useAuth()
  const [cachedPermissions, setCachedPermissions] = useState({})

  // Cache permissions for faster lookups
  useEffect(() => {
    if (permissions && permissions.length > 0) {
      const cache = {}
      permissions.forEach(p => {
        const key = `${p.module_name}|${p.page_name || ''}`
        cache[key] = {
          view: p.can_view,
          edit: p.can_edit,
          delete: p.can_delete,
          approve: p.can_approve
        }
      })
      setCachedPermissions(cache)
    }
  }, [permissions])

  // Check if user can view a module or page
  const canView = (moduleName, pageName = null) => {
    if (!user) return false
    
    // Super Admin bypass
    if (user.role_id === 'role_super_admin') return true
    
    // Check page-specific permission first
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.view) return true
    }
    
    // Fallback to module-level permission
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.view || false
  }

  // Check if user can edit
  const canEdit = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.edit) return true
    }
    
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.edit || false
  }

  // Check if user can delete
  const canDelete = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.delete) return true
    }
    
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.delete || false
  }

  // Check if user can approve
  const canApprove = (moduleName, pageName = null) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.approve) return true
    }
    
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.approve || false
  }

  // Check if user can manage permissions (special flag)
  const canManagePermissions = () => {
    return user?.can_manage_permissions === true || user?.role_id === 'role_super_admin'
  }

  // Get all visible pages for a module (for sidebar filtering)
  const getVisiblePages = (moduleName, allPages) => {
    return allPages.filter(page => canView(moduleName, page.id))
  }

  // Check if module has any visible page
  const hasAnyVisiblePage = (moduleName, pages) => {
    return pages.some(page => canView(moduleName, page.id))
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
  if (!ctx) throw new Error('usePermission must be used inside PermissionProvider')
  return ctx
}
