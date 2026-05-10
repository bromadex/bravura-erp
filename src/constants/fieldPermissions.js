// src/constants/fieldPermissions.js
//
// Defines which fields are restricted to specific roles.
// If a field has no rule, it is visible to all authenticated users.
// super_admin always sees everything.

import { ROLES } from './roles'

export const FIELD_RULES = {
  employee: {
    basic_salary:    { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    allowances:      { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    paye_rate:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    nssa_rate:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    other_deductions:{ allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    bank_name:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    bank_account:    { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    nssa_number:     { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    national_id:     { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    medical_info:    { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
  },
  payroll: {
    basic_salary:    { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    gross_pay:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    net_pay:         { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    paye:            { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    nssa:            { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    aids_levy:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
    total_deductions:{ allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER] },
  },
  purchase_order: {
    total_amount:    { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.DEPT_MANAGER] },
    unit_cost:       { allowedRoles: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER, ROLES.DEPT_MANAGER] },
  },
}
