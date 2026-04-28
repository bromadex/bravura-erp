// src/contexts/PermissionContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const PermissionContext = createContext(null)

export function PermissionProvider({ children }) {
  const { user, permissions } = useAuth()
  const [cachedPermissions, setCachedPermissions] = useState({})

  // Build a fast lookup cache whenever the permissions array changes
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

  // ── IMPORTANT: every function below returns a plain boolean (true/false).
  //    Never return an object – doing so causes React Error #130 when the
  //    result is rendered inside JSX { ... }.

  /** Check if the user can VIEW a module or a specific page within a module. */
  const canView = (moduleName, pageName = null) => {
    if (!user) return false
    // Super Admin bypasses all permission checks
    if (user.role_id === 'role_super_admin') return true

    // Page-level check first (more specific wins)
    if (pageName) {
      const pageKey = `${moduleName}|${pageName}`
      if (cachedPermissions[pageKey]?.view === true) return true
    }

    // Fallback to module-level permission
    const moduleKey = `${moduleName}|`
    return cachedPermissions[moduleKey]?.view === true
  }

  /** Check if the user can EDIT (add/update) on a module or page. */
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

  /** Check if the user can DELETE on a module or page. */
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

  /** Check if the user can APPROVE on a module or page. */
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

  /** Check if the user can manage permissions (HR admin special flag). */
  const canManagePermissions = () => {
    if (!user) return false
    return user.can_manage_permissions === true || user.role_id === 'role_super_admin'
  }

  /**
   * Return only the pages of a module that the user can view.
   * @param {string}   moduleName
   * @param {Array}    allPages   – array of page objects with an `id` field
   */
  const getVisiblePages = (moduleName, allPages) => {
    return allPages.filter(page => canView(moduleName, page.id))
  }

  /** Returns true if the user can see at least one page in the module. */
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

/**
 * Hook to consume the PermissionContext.
 * USAGE:   const { canView, canEdit, canDelete, canApprove } = usePermission()
 * Then call as functions:  canView('inventory', 'stock-balance')  → boolean
 *
 * ⚠️  Do NOT destructure the return value of canView() itself into JSX –
 *     the functions return booleans, not components.
 */
export function usePermission() {
  const ctx = useContext(PermissionContext)
  if (!ctx) {
    throw new Error(
      'usePermission() must be called inside a <PermissionProvider>. ' +
      'Check that PermissionProvider wraps your app in App.jsx.'
    )
  }
  return ctx
}
