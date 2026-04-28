 // src/hooks/usePermission.js
// 🔧 TEMPORARY: All permission checks DISABLED

import { usePermission } from '../contexts/PermissionContext'

export const useCanView = (module, page = null) => {
  const { canView } = usePermission()
  return canView(module, page)  // Always returns true
}

export const useCanEdit = (module, page = null) => {
  const { canEdit } = usePermission()
  return canEdit(module, page)  // Always returns true
}

export const useCanDelete = (module, page = null) => {
  const { canDelete } = usePermission()
  return canDelete(module, page)  // Always returns true
}

export const useCanApprove = (module, page = null) => {
  const { canApprove } = usePermission()
  return canApprove(module, page)  // Always returns true
}

export const useCanManagePermissions = () => {
  const { canManagePermissions } = usePermission()
  return canManagePermissions()  // Always returns true
}

export default {
  useCanView,
  useCanEdit,
  useCanDelete,
  useCanApprove,
  useCanManagePermissions,
}
