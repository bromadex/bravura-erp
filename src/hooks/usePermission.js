// src/hooks/usePermission.js
//
// Convenience wrapper hooks around PermissionContext.
//
// ✅ Each hook returns a BOOLEAN (true/false), never an object.
//    This is the key fix for React Error #130 ("Objects are not valid as a
//    React child").  The root cause was calling useCanView() and then
//    placing the result directly in JSX without calling it as a function.
//
// CORRECT USAGE IN A COMPONENT:
//
//   import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
//
//   export default function MyPage() {
//     const canEdit   = useCanEdit('inventory', 'stock-balance')   // ← boolean
//     const canDelete = useCanDelete('inventory', 'stock-balance')  // ← boolean
//     return (
//       <div>
//         {canEdit && <button>Edit</button>}     // ✅ renders button or nothing
//         {canDelete && <button>Delete</button>} // ✅ renders button or nothing
//       </div>
//     )
//   }
//
// WRONG USAGE (causes React Error #130):
//
//   const canView = useCanView()           // ❌ returns boolean, not a function
//   return <div>{canView}</div>            // ❌ boolean is fine BUT…
//
//   const { canView } = useCanView(...)    // ❌ destructuring a boolean = undefined
//
// Always import usePermission() directly from PermissionContext if you need
// the full context object (canView, canEdit, canDelete, canApprove as functions).

import { usePermission } from '../contexts/PermissionContext'

/**
 * Returns true if the current user can VIEW the given module / page.
 * @param {string}      module  - e.g. 'inventory'
 * @param {string|null} page    - e.g. 'stock-balance'  (optional)
 * @returns {boolean}
 */
export const useCanView = (module, page = null) => {
  const { canView } = usePermission()
  return canView(module, page)   // ← explicit boolean return
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
