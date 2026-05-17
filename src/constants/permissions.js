// src/constants/permissions.js
//
// Named action-level permissions for RBAC.
// Each key maps to a human-readable label and which roles receive it by default.
// The `action_permissions` table in Supabase is the live source of truth;
// DEFAULT_ROLE_ACTIONS is used to seed that table via migration.

import { ROLES } from './roles'

// ── Action Keys ──────────────────────────────────────────────
export const ACTIONS = {
  // HR — Employees
  CREATE_EMPLOYEE:           'CREATE_EMPLOYEE',
  EDIT_EMPLOYEE:             'EDIT_EMPLOYEE',
  DELETE_EMPLOYEE:           'DELETE_EMPLOYEE',
  VIEW_EMPLOYEE_SALARY:      'VIEW_EMPLOYEE_SALARY',      // field-level gate
  VIEW_EMPLOYEE_BANK:        'VIEW_EMPLOYEE_BANK',        // field-level gate
  VIEW_EMPLOYEE_NATIONAL_ID: 'VIEW_EMPLOYEE_NATIONAL_ID', // field-level gate
  MANAGE_DEPARTMENTS:        'MANAGE_DEPARTMENTS',
  MANAGE_DESIGNATIONS:       'MANAGE_DESIGNATIONS',
  MANAGE_USER_PERMISSIONS:   'MANAGE_USER_PERMISSIONS',

  // HR — Leave & Attendance
  CREATE_LEAVE_REQUEST:      'CREATE_LEAVE_REQUEST',
  APPROVE_LEAVE:             'APPROVE_LEAVE',
  REJECT_LEAVE:              'REJECT_LEAVE',
  VIEW_ALL_LEAVE:            'VIEW_ALL_LEAVE',
  APPROVE_ATTENDANCE:        'APPROVE_ATTENDANCE',
  BULK_APPROVE_ATTENDANCE:   'BULK_APPROVE_ATTENDANCE',
  CREATE_TRAVEL_REQUEST:     'CREATE_TRAVEL_REQUEST',
  APPROVE_TRAVEL:            'APPROVE_TRAVEL',

  // HR — Payroll
  RUN_PAYROLL:               'RUN_PAYROLL',
  VIEW_PAYROLL_AMOUNTS:      'VIEW_PAYROLL_AMOUNTS',      // field-level gate
  APPROVE_PAYROLL:           'APPROVE_PAYROLL',
  EXPORT_PAYROLL:            'EXPORT_PAYROLL',

  // Procurement
  CREATE_STORE_REQUISITION:  'CREATE_STORE_REQUISITION',
  APPROVE_STORE_REQUISITION: 'APPROVE_STORE_REQUISITION',
  FULFILL_STORE_REQUISITION: 'FULFILL_STORE_REQUISITION',
  CREATE_PURCHASE_REQUISITION:'CREATE_PURCHASE_REQUISITION',
  APPROVE_PURCHASE_REQUISITION:'APPROVE_PURCHASE_REQUISITION',
  CREATE_PURCHASE_ORDER:     'CREATE_PURCHASE_ORDER',
  RECEIVE_GOODS:             'RECEIVE_GOODS',
  MANAGE_SUPPLIERS:          'MANAGE_SUPPLIERS',

  // Inventory
  STOCK_IN:                  'STOCK_IN',
  STOCK_OUT:                 'STOCK_OUT',
  CONDUCT_STOCK_TAKE:        'CONDUCT_STOCK_TAKE',
  MANAGE_ITEMS:              'MANAGE_ITEMS',
  MANAGE_CATEGORIES:         'MANAGE_CATEGORIES',

  // Fuel
  ISSUE_FUEL:                'ISSUE_FUEL',
  RECORD_FUEL_DELIVERY:      'RECORD_FUEL_DELIVERY',
  RECORD_DIPSTICK:           'RECORD_DIPSTICK',

  // Fleet
  MANAGE_VEHICLES:           'MANAGE_VEHICLES',
  LOG_VEHICLE_TRIP:          'LOG_VEHICLE_TRIP',
  LOG_MAINTENANCE:           'LOG_MAINTENANCE',
  MANAGE_ASSET_ISSUES:       'MANAGE_ASSET_ISSUES',
  MANAGE_CONTRACTOR_EQUIPMENT: 'MANAGE_CONTRACTOR_EQUIPMENT',
  APPROVE_CONTRACTOR_USAGE:    'APPROVE_CONTRACTOR_USAGE',
  POST_CONTRACTOR_INVOICE:     'POST_CONTRACTOR_INVOICE',

  // Campsite
  ASSIGN_ROOM:               'ASSIGN_ROOM',
  TRANSFER_ROOM:             'TRANSFER_ROOM',
  VACATE_ROOM:               'VACATE_ROOM',
  MANAGE_CAMP_BLOCKS:        'MANAGE_CAMP_BLOCKS',
  MANAGE_CAMP_STOCK:         'MANAGE_CAMP_STOCK',
  ISSUE_PPE:                 'ISSUE_PPE',
  MANAGE_HEADCOUNT:          'MANAGE_HEADCOUNT',

  // Logistics
  RECORD_DELIVERY:           'RECORD_DELIVERY',
  MANAGE_BATCH_PLANT:        'MANAGE_BATCH_PLANT',

  // Accounting
  POST_JOURNAL_ENTRY:        'POST_JOURNAL_ENTRY',
  MANAGE_ACCOUNTS:           'MANAGE_ACCOUNTS',

  // Governance
  CREATE_MEMO:               'CREATE_MEMO',
  PUBLISH_MEMO:              'PUBLISH_MEMO',
  DELETE_MEMO:               'DELETE_MEMO',
  CREATE_ANNOUNCEMENT:       'CREATE_ANNOUNCEMENT',
  PUBLISH_POLICY:            'PUBLISH_POLICY',

  // Projects — Petty Cash
  MANAGE_PETTY_CASH_FUNDS:   'MANAGE_PETTY_CASH_FUNDS',
  RECORD_PETTY_CASH_EXPENSE: 'RECORD_PETTY_CASH_EXPENSE',
  APPROVE_PETTY_CASH:        'APPROVE_PETTY_CASH',
  RECONCILE_PETTY_CASH:      'RECONCILE_PETTY_CASH',
  POST_PETTY_CASH_GL:        'POST_PETTY_CASH_GL',

  // Reports & Settings
  VIEW_AUDIT_LOG:            'VIEW_AUDIT_LOG',
  EXPORT_REPORTS:            'EXPORT_REPORTS',
  MANAGE_MASTER_DATA:        'MANAGE_MASTER_DATA',
  MANAGE_WORKFLOWS:          'MANAGE_WORKFLOWS',
}

// Human-readable labels for the admin UI
export const ACTION_LABELS = {
  [ACTIONS.CREATE_EMPLOYEE]:            { label: 'Create Employee',              module: 'HR' },
  [ACTIONS.EDIT_EMPLOYEE]:              { label: 'Edit Employee',                module: 'HR' },
  [ACTIONS.DELETE_EMPLOYEE]:            { label: 'Delete Employee',              module: 'HR' },
  [ACTIONS.VIEW_EMPLOYEE_SALARY]:       { label: 'View Employee Salary',         module: 'HR' },
  [ACTIONS.VIEW_EMPLOYEE_BANK]:         { label: 'View Bank Account Details',    module: 'HR' },
  [ACTIONS.VIEW_EMPLOYEE_NATIONAL_ID]:  { label: 'View National ID',             module: 'HR' },
  [ACTIONS.MANAGE_DEPARTMENTS]:         { label: 'Manage Departments',           module: 'HR' },
  [ACTIONS.MANAGE_DESIGNATIONS]:        { label: 'Manage Designations',          module: 'HR' },
  [ACTIONS.MANAGE_USER_PERMISSIONS]:    { label: 'Manage User Permissions',      module: 'HR' },
  [ACTIONS.CREATE_LEAVE_REQUEST]:       { label: 'Create Leave Request',         module: 'HR' },
  [ACTIONS.APPROVE_LEAVE]:              { label: 'Approve Leave',                module: 'HR' },
  [ACTIONS.REJECT_LEAVE]:               { label: 'Reject Leave',                 module: 'HR' },
  [ACTIONS.VIEW_ALL_LEAVE]:             { label: 'View All Leave Records',       module: 'HR' },
  [ACTIONS.APPROVE_ATTENDANCE]:         { label: 'Approve Attendance',           module: 'HR' },
  [ACTIONS.BULK_APPROVE_ATTENDANCE]:    { label: 'Bulk Approve Attendance',      module: 'HR' },
  [ACTIONS.CREATE_TRAVEL_REQUEST]:      { label: 'Create Travel Request',        module: 'HR' },
  [ACTIONS.APPROVE_TRAVEL]:             { label: 'Approve Travel Request',       module: 'HR' },
  [ACTIONS.RUN_PAYROLL]:                { label: 'Run Payroll',                  module: 'HR' },
  [ACTIONS.VIEW_PAYROLL_AMOUNTS]:       { label: 'View Payroll Amounts',         module: 'HR' },
  [ACTIONS.APPROVE_PAYROLL]:            { label: 'Approve Payroll',              module: 'HR' },
  [ACTIONS.EXPORT_PAYROLL]:             { label: 'Export Payroll',               module: 'HR' },
  [ACTIONS.CREATE_STORE_REQUISITION]:   { label: 'Create Store Requisition',     module: 'Procurement' },
  [ACTIONS.APPROVE_STORE_REQUISITION]:  { label: 'Approve Store Requisition',    module: 'Procurement' },
  [ACTIONS.FULFILL_STORE_REQUISITION]:  { label: 'Fulfill Store Requisition',    module: 'Procurement' },
  [ACTIONS.CREATE_PURCHASE_REQUISITION]:{ label: 'Create Purchase Requisition',  module: 'Procurement' },
  [ACTIONS.APPROVE_PURCHASE_REQUISITION]:{ label: 'Approve Purchase Requisition', module: 'Procurement' },
  [ACTIONS.CREATE_PURCHASE_ORDER]:      { label: 'Create Purchase Order',        module: 'Procurement' },
  [ACTIONS.RECEIVE_GOODS]:              { label: 'Receive Goods (GRN)',          module: 'Procurement' },
  [ACTIONS.MANAGE_SUPPLIERS]:           { label: 'Manage Suppliers',             module: 'Procurement' },
  [ACTIONS.STOCK_IN]:                   { label: 'Stock In',                     module: 'Inventory' },
  [ACTIONS.STOCK_OUT]:                  { label: 'Stock Out',                    module: 'Inventory' },
  [ACTIONS.CONDUCT_STOCK_TAKE]:         { label: 'Conduct Stock Take',           module: 'Inventory' },
  [ACTIONS.MANAGE_ITEMS]:               { label: 'Manage Inventory Items',       module: 'Inventory' },
  [ACTIONS.MANAGE_CATEGORIES]:          { label: 'Manage Categories',            module: 'Inventory' },
  [ACTIONS.ISSUE_FUEL]:                 { label: 'Issue Fuel',                   module: 'Fuel' },
  [ACTIONS.RECORD_FUEL_DELIVERY]:       { label: 'Record Fuel Delivery',         module: 'Fuel' },
  [ACTIONS.RECORD_DIPSTICK]:            { label: 'Record Dipstick Reading',      module: 'Fuel' },
  [ACTIONS.MANAGE_VEHICLES]:               { label: 'Manage Vehicles & Equipment',   module: 'Fleet' },
  [ACTIONS.LOG_VEHICLE_TRIP]:              { label: 'Log Vehicle Trip',              module: 'Fleet' },
  [ACTIONS.LOG_MAINTENANCE]:               { label: 'Log Maintenance',               module: 'Fleet' },
  [ACTIONS.MANAGE_ASSET_ISSUES]:           { label: 'Manage Asset Issues',           module: 'Fleet' },
  [ACTIONS.MANAGE_CONTRACTOR_EQUIPMENT]:   { label: 'Manage Contractor Equipment',   module: 'Fleet' },
  [ACTIONS.APPROVE_CONTRACTOR_USAGE]:      { label: 'Approve Contractor Usage Logs', module: 'Fleet' },
  [ACTIONS.POST_CONTRACTOR_INVOICE]:       { label: 'Post Contractor Invoice to GL', module: 'Fleet' },
  [ACTIONS.ASSIGN_ROOM]:                { label: 'Assign Room',                  module: 'Campsite' },
  [ACTIONS.TRANSFER_ROOM]:              { label: 'Transfer Room Assignment',     module: 'Campsite' },
  [ACTIONS.VACATE_ROOM]:                { label: 'Vacate Room',                  module: 'Campsite' },
  [ACTIONS.MANAGE_CAMP_BLOCKS]:         { label: 'Manage Camp Blocks & Rooms',   module: 'Campsite' },
  [ACTIONS.MANAGE_CAMP_STOCK]:          { label: 'Manage Camp Stock',            module: 'Campsite' },
  [ACTIONS.ISSUE_PPE]:                  { label: 'Issue PPE',                    module: 'Campsite' },
  [ACTIONS.MANAGE_HEADCOUNT]:           { label: 'Manage Headcount Records',     module: 'Logistics' },
  [ACTIONS.RECORD_DELIVERY]:            { label: 'Record Logistics Delivery',    module: 'Logistics' },
  [ACTIONS.MANAGE_BATCH_PLANT]:         { label: 'Manage Batch Plant',           module: 'Logistics' },
  [ACTIONS.POST_JOURNAL_ENTRY]:         { label: 'Post Journal Entry',           module: 'Accounting' },
  [ACTIONS.MANAGE_ACCOUNTS]:            { label: 'Manage Chart of Accounts',     module: 'Accounting' },
  [ACTIONS.CREATE_MEMO]:                { label: 'Create Memo',                  module: 'Governance' },
  [ACTIONS.PUBLISH_MEMO]:               { label: 'Publish / Approve Memo',       module: 'Governance' },
  [ACTIONS.DELETE_MEMO]:                { label: 'Delete Memo',                  module: 'Governance' },
  [ACTIONS.CREATE_ANNOUNCEMENT]:        { label: 'Create Announcement',          module: 'Governance' },
  [ACTIONS.PUBLISH_POLICY]:             { label: 'Publish Policy',               module: 'Governance' },
  [ACTIONS.MANAGE_PETTY_CASH_FUNDS]:    { label: 'Manage Petty Cash Funds',      module: 'Projects' },
  [ACTIONS.RECORD_PETTY_CASH_EXPENSE]:  { label: 'Record Petty Cash Expense',    module: 'Projects' },
  [ACTIONS.APPROVE_PETTY_CASH]:         { label: 'Approve Petty Cash Expenses',  module: 'Projects' },
  [ACTIONS.RECONCILE_PETTY_CASH]:       { label: 'Create/Submit Reconciliation', module: 'Projects' },
  [ACTIONS.POST_PETTY_CASH_GL]:         { label: 'Post Petty Cash to GL',        module: 'Projects' },
  [ACTIONS.VIEW_AUDIT_LOG]:             { label: 'View Audit Log',               module: 'Reports' },
  [ACTIONS.EXPORT_REPORTS]:             { label: 'Export Reports',               module: 'Reports' },
  [ACTIONS.MANAGE_MASTER_DATA]:         { label: 'Manage Master Data',           module: 'Settings' },
  [ACTIONS.MANAGE_WORKFLOWS]:           { label: 'Manage Workflows',             module: 'Settings' },
}

// Default action grants per role (used to seed the DB and as fallback)
export const DEFAULT_ROLE_ACTIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(ACTIONS), // all actions

  [ROLES.HR_MANAGER]: [
    ACTIONS.CREATE_EMPLOYEE, ACTIONS.EDIT_EMPLOYEE, ACTIONS.DELETE_EMPLOYEE,
    ACTIONS.VIEW_EMPLOYEE_SALARY, ACTIONS.VIEW_EMPLOYEE_BANK, ACTIONS.VIEW_EMPLOYEE_NATIONAL_ID,
    ACTIONS.MANAGE_DEPARTMENTS, ACTIONS.MANAGE_DESIGNATIONS, ACTIONS.MANAGE_USER_PERMISSIONS,
    ACTIONS.CREATE_LEAVE_REQUEST, ACTIONS.APPROVE_LEAVE, ACTIONS.REJECT_LEAVE, ACTIONS.VIEW_ALL_LEAVE,
    ACTIONS.APPROVE_ATTENDANCE, ACTIONS.BULK_APPROVE_ATTENDANCE,
    ACTIONS.CREATE_TRAVEL_REQUEST, ACTIONS.APPROVE_TRAVEL,
    ACTIONS.RUN_PAYROLL, ACTIONS.VIEW_PAYROLL_AMOUNTS, ACTIONS.APPROVE_PAYROLL, ACTIONS.EXPORT_PAYROLL,
    ACTIONS.VIEW_AUDIT_LOG, ACTIONS.EXPORT_REPORTS,
    ACTIONS.MANAGE_PETTY_CASH_FUNDS, ACTIONS.APPROVE_PETTY_CASH, ACTIONS.RECONCILE_PETTY_CASH, ACTIONS.POST_PETTY_CASH_GL,
    ACTIONS.MANAGE_CONTRACTOR_EQUIPMENT, ACTIONS.APPROVE_CONTRACTOR_USAGE, ACTIONS.POST_CONTRACTOR_INVOICE,
  ],

  [ROLES.DEPT_MANAGER]: [
    ACTIONS.CREATE_LEAVE_REQUEST, ACTIONS.APPROVE_LEAVE, ACTIONS.REJECT_LEAVE, ACTIONS.VIEW_ALL_LEAVE,
    ACTIONS.APPROVE_ATTENDANCE, ACTIONS.CREATE_TRAVEL_REQUEST, ACTIONS.APPROVE_TRAVEL,
    ACTIONS.CREATE_STORE_REQUISITION, ACTIONS.CREATE_PURCHASE_REQUISITION,
    ACTIONS.APPROVE_STORE_REQUISITION, ACTIONS.APPROVE_PURCHASE_REQUISITION,
    ACTIONS.CREATE_MEMO, ACTIONS.CREATE_ANNOUNCEMENT,
    ACTIONS.MANAGE_PETTY_CASH_FUNDS, ACTIONS.APPROVE_PETTY_CASH, ACTIONS.RECONCILE_PETTY_CASH,
    ACTIONS.APPROVE_CONTRACTOR_USAGE,
  ],

  [ROLES.STOREKEEPER]: [
    ACTIONS.STOCK_IN, ACTIONS.STOCK_OUT, ACTIONS.CONDUCT_STOCK_TAKE,
    ACTIONS.FULFILL_STORE_REQUISITION, ACTIONS.RECEIVE_GOODS,
    ACTIONS.MANAGE_CAMP_STOCK, ACTIONS.ISSUE_PPE, ACTIONS.MANAGE_HEADCOUNT,
    ACTIONS.RECORD_PETTY_CASH_EXPENSE,
  ],

  [ROLES.FUEL_ATTENDANT]: [
    ACTIONS.ISSUE_FUEL, ACTIONS.RECORD_FUEL_DELIVERY, ACTIONS.RECORD_DIPSTICK,
    ACTIONS.RECORD_PETTY_CASH_EXPENSE,
  ],



  [ROLES.VIEWER]: [
    ACTIONS.CREATE_LEAVE_REQUEST, ACTIONS.CREATE_TRAVEL_REQUEST,
    ACTIONS.RECORD_PETTY_CASH_EXPENSE,
  ],
}
