-- supabase/migrations/rbac_enhancements.sql
-- Run this in the Supabase SQL editor to enable action-level RBAC.

-- 1. Action permissions table
CREATE TABLE IF NOT EXISTS action_permissions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('role', 'user', 'designation')),
  scope_id   TEXT NOT NULL,
  action_key TEXT NOT NULL,
  granted    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (scope_type, scope_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_action_perms_scope ON action_permissions (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_action_perms_key   ON action_permissions (action_key);

-- 2. RLS: only admins and the user themselves can manage action permissions
ALTER TABLE action_permissions ENABLE ROW LEVEL SECURITY;

-- 3. Seed default role actions (role_super_admin gets everything by omission — checked in code)
-- role_hr_manager
INSERT INTO action_permissions (scope_type, scope_id, action_key, granted) VALUES
  ('role','role_hr_manager','CREATE_EMPLOYEE',true),
  ('role','role_hr_manager','EDIT_EMPLOYEE',true),
  ('role','role_hr_manager','DELETE_EMPLOYEE',true),
  ('role','role_hr_manager','VIEW_EMPLOYEE_SALARY',true),
  ('role','role_hr_manager','VIEW_EMPLOYEE_BANK',true),
  ('role','role_hr_manager','VIEW_EMPLOYEE_NATIONAL_ID',true),
  ('role','role_hr_manager','MANAGE_DEPARTMENTS',true),
  ('role','role_hr_manager','MANAGE_DESIGNATIONS',true),
  ('role','role_hr_manager','MANAGE_USER_PERMISSIONS',true),
  ('role','role_hr_manager','CREATE_LEAVE_REQUEST',true),
  ('role','role_hr_manager','APPROVE_LEAVE',true),
  ('role','role_hr_manager','REJECT_LEAVE',true),
  ('role','role_hr_manager','VIEW_ALL_LEAVE',true),
  ('role','role_hr_manager','APPROVE_ATTENDANCE',true),
  ('role','role_hr_manager','BULK_APPROVE_ATTENDANCE',true),
  ('role','role_hr_manager','CREATE_TRAVEL_REQUEST',true),
  ('role','role_hr_manager','APPROVE_TRAVEL',true),
  ('role','role_hr_manager','RUN_PAYROLL',true),
  ('role','role_hr_manager','VIEW_PAYROLL_AMOUNTS',true),
  ('role','role_hr_manager','APPROVE_PAYROLL',true),
  ('role','role_hr_manager','EXPORT_PAYROLL',true),
  ('role','role_hr_manager','VIEW_AUDIT_LOG',true),
  ('role','role_hr_manager','EXPORT_REPORTS',true)
ON CONFLICT (scope_type, scope_id, action_key) DO NOTHING;

-- role_dept_manager
INSERT INTO action_permissions (scope_type, scope_id, action_key, granted) VALUES
  ('role','role_dept_manager','CREATE_LEAVE_REQUEST',true),
  ('role','role_dept_manager','APPROVE_LEAVE',true),
  ('role','role_dept_manager','REJECT_LEAVE',true),
  ('role','role_dept_manager','VIEW_ALL_LEAVE',true),
  ('role','role_dept_manager','APPROVE_ATTENDANCE',true),
  ('role','role_dept_manager','CREATE_TRAVEL_REQUEST',true),
  ('role','role_dept_manager','APPROVE_TRAVEL',true),
  ('role','role_dept_manager','CREATE_STORE_REQUISITION',true),
  ('role','role_dept_manager','CREATE_PURCHASE_REQUISITION',true),
  ('role','role_dept_manager','APPROVE_STORE_REQUISITION',true),
  ('role','role_dept_manager','APPROVE_PURCHASE_REQUISITION',true),
  ('role','role_dept_manager','CREATE_MEMO',true),
  ('role','role_dept_manager','CREATE_ANNOUNCEMENT',true)
ON CONFLICT (scope_type, scope_id, action_key) DO NOTHING;

-- role_storekeeper
INSERT INTO action_permissions (scope_type, scope_id, action_key, granted) VALUES
  ('role','role_storekeeper','STOCK_IN',true),
  ('role','role_storekeeper','STOCK_OUT',true),
  ('role','role_storekeeper','CONDUCT_STOCK_TAKE',true),
  ('role','role_storekeeper','FULFILL_STORE_REQUISITION',true),
  ('role','role_storekeeper','RECEIVE_GOODS',true),
  ('role','role_storekeeper','MANAGE_CAMP_STOCK',true),
  ('role','role_storekeeper','ISSUE_PPE',true),
  ('role','role_storekeeper','MANAGE_HEADCOUNT',true)
ON CONFLICT (scope_type, scope_id, action_key) DO NOTHING;

-- role_fuel_attendant
INSERT INTO action_permissions (scope_type, scope_id, action_key, granted) VALUES
  ('role','role_fuel_attendant','ISSUE_FUEL',true),
  ('role','role_fuel_attendant','RECORD_FUEL_DELIVERY',true),
  ('role','role_fuel_attendant','RECORD_DIPSTICK',true)
ON CONFLICT (scope_type, scope_id, action_key) DO NOTHING;

-- role_viewer (minimal)
INSERT INTO action_permissions (scope_type, scope_id, action_key, granted) VALUES
  ('role','role_viewer','CREATE_LEAVE_REQUEST',true),
  ('role','role_viewer','CREATE_TRAVEL_REQUEST',true)
ON CONFLICT (scope_type, scope_id, action_key) DO NOTHING;

-- 4. Field permissions are enforced in code (FIELD_RULES in fieldPermissions.js)
--    No additional table needed for the initial implementation.

COMMENT ON TABLE action_permissions IS 'Granular named-action RBAC. scope_type: role|user|designation. User overrides win.';
