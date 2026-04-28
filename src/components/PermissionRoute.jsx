import { usePermission } from '../contexts/PermissionContext'

// Convenience hooks for common permission checks
export const useCanView = (module, page = null) => {
  const { canView } = usePermission()
  return canView(module, page)
}

export const useCanEdit = (module, page = null) => {
  const { canEdit } = usePermission()
  return canEdit(module, page)
}

export const useCanDelete = (module, page = null) => {
  const { canDelete } = usePermission()
  return canDelete(module, page)
}

export const useCanApprove = (module, page = null) => {
  const { canApprove } = usePermission()
  return canApprove(module, page)
}

export const useCanManagePermissions = () => {
  const { canManagePermissions } = usePermission()
  return canManagePermissions()
}

// Default export with all hooks
export default {
  useCanView,
  useCanEdit,
  useCanDelete,
  useCanApprove,
  useCanManagePermissions,
}
