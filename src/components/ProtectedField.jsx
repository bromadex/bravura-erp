// src/components/ProtectedField.jsx
//
// Wraps a field value so it's only visible to users with the right role.
// Usage:
//   <ProtectedField entity="employee" field="basic_salary" fallback="Hidden">
//     ${employee.basic_salary}
//   </ProtectedField>
//
// OR as a hook in table cells:
//   const canSeeSalary = useCanViewField('employee', 'basic_salary')
//   {canSeeSalary ? `$${emp.basic_salary}` : <span className="badge badge-dim">Restricted</span>}

import { usePermission } from '../contexts/PermissionContext'

export default function ProtectedField({ entity, field, children, fallback = null }) {
  const { canViewField } = usePermission()

  if (!canViewField(entity, field)) {
    return fallback ?? (
      <span className="badge badge-dim" title="You don't have permission to view this field">
        <span className="material-icons" style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 2 }}>lock</span>
        Restricted
      </span>
    )
  }

  return children
}
