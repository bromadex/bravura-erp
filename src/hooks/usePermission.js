// src/hooks/usePermission.js
//
// Convenience wrapper hooks around PermissionContext.
//
// ✅ Each hook returns a BOOLEAN (true/false), never an object.
//    This prevents React Error #130 ("Objects are not valid as a React child").
//
// USAGE:
//   import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
//
//   const canEdit   = useCanEdit('hr', 'employees')   // boolean
//   const canDelete = useCanDelete('hr', 'employees') // boolean
//
//   return (
//     <div>
//       {canEdit && <button>Edit</button>}
//       {canDelete && <button>Delete</button>}
//     </div>
//   )

import { usePermission } from '../contexts/PermissionContext'

/**
 * Returns true if the current user can VIEW the given module / page.
 * @param {string}      module  - e.g. 'inventory'
 * @param {string|null} page    - e.g. 'stock-balance' (optional)
 * @returns {boolean}
 */
export const useCanView = (module, page = null) => {
  const { canView } = usePermission()
  return canView(module, page)
}

/**
 * Returns true if the current user can EDIT (add/update) in the given module / page.
 * @returns {boolean}
 */
export const useCanEdit = (module, page = null) => {
  const { canEdit } = usePermission()
  return canEdit(module, page)
}

/**
 * Returns true if the current user can DELETE in the given module / page.
 * @returns {boolean}
 */
export const useCanDelete = (module, page = null) => {
  const { canDelete } = usePermission()
  return canDelete(module, page)
}

/**
 * Returns true if the current user can APPROVE records in the given module / page.
 * @returns {boolean}
 */
export const useCanApprove = (module, page = null) => {
  const { canApprove } = usePermission()
  return canApprove(module, page)
}

/**
 * Returns true if the current user can manage permissions (HR admin flag).
 * @returns {boolean}
 */
export const useCanManagePermissions = () => {
  const { canManagePermissions } = usePermission()
  return canManagePermissions()
}

// Named default export for convenience
export default {
  useCanView,
  useCanEdit,
  useCanDelete,
  useCanApprove,
  useCanManagePermissions,
}
