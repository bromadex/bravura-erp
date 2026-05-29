-- ══════════════════════════════════════════════════════════════════
-- Fleet / Fuel / Asset Cross-Module Integration
-- Workflows, notifications, permissions, GL config, fleet settings
-- ══════════════════════════════════════════════════════════════════

-- 1. Fleet-specific roles
INSERT INTO roles (id, name, created_at) VALUES
  ('role_fleet_manager',       'Fleet Manager',        NOW()),
  ('role_fuel_manager',        'Fuel Manager',         NOW()),
  ('role_workshop_supervisor', 'Workshop Supervisor',  NOW()),
  ('role_finance_manager',     'Finance Manager',      NOW()),
  ('role_operations_manager',  'Operations Manager',   NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Add workflow_instance_id to fuel/fleet entities + status to fuel_deliveries
ALTER TABLE fuel_requests           ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT;
ALTER TABLE maintenance_work_orders ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT;
ALTER TABLE fuel_deliveries         ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received';
ALTER TABLE fuel_deliveries         ADD COLUMN IF NOT EXISTS workflow_instance_id TEXT;

-- 3. Fuel Request Approval workflow
DO $$
DECLARE v_wf_id TEXT := gen_random_uuid()::text;
BEGIN
  INSERT INTO workflows (id, name, module, entity_type, description, priority, is_active, created_at, updated_at)
  VALUES (v_wf_id, 'Fuel Request Approval', 'fuel', 'fuel_requests',
          'Multi-step approval for fuel requests above threshold', 10, true, NOW(), NOW());
  INSERT INTO workflow_steps (id, workflow_id, step_order, step_name, required_role, approval_type,
    status_on_entry, status_on_pass, status_on_fail, is_final, description, created_at)
  VALUES
    (gen_random_uuid()::text, v_wf_id, 1, 'Department Head Approval', 'role_dept_manager', 'any',
     'pending', 'pending', 'rejected', false, 'Department head reviews the fuel request', NOW()),
    (gen_random_uuid()::text, v_wf_id, 2, 'Fuel Manager Approval', 'role_fuel_manager', 'any',
     'pending', 'approved', 'rejected', true, 'Fuel manager gives final approval', NOW());
  INSERT INTO workflow_assignments (id, workflow_id, entity_type, department_id, is_active, created_at)
  VALUES (gen_random_uuid()::text, v_wf_id, 'fuel_requests', NULL, true, NOW());
END $$;

-- 4. Maintenance Work Order Approval workflow
DO $$
DECLARE v_wf_id TEXT := gen_random_uuid()::text;
BEGIN
  INSERT INTO workflows (id, name, module, entity_type, description, priority, is_active, created_at, updated_at)
  VALUES (v_wf_id, 'Maintenance WO Approval', 'fleet', 'maintenance_work_orders',
          'Approval for high-cost work orders', 10, true, NOW(), NOW());
  INSERT INTO workflow_steps (id, workflow_id, step_order, step_name, required_role, approval_type,
    status_on_entry, status_on_pass, status_on_fail, is_final, description, created_at)
  VALUES
    (gen_random_uuid()::text, v_wf_id, 1, 'Workshop Supervisor', 'role_workshop_supervisor', 'any',
     'pending', 'pending', 'rejected', false, 'Workshop supervisor reviews the work order', NOW()),
    (gen_random_uuid()::text, v_wf_id, 2, 'Fleet Manager Approval', 'role_fleet_manager', 'any',
     'pending', 'open', 'rejected', true, 'Fleet manager approves to proceed', NOW());
  INSERT INTO workflow_assignments (id, workflow_id, entity_type, department_id, is_active, created_at)
  VALUES (gen_random_uuid()::text, v_wf_id, 'maintenance_work_orders', NULL, true, NOW());
END $$;

-- 5. Fuel Delivery Approval workflow
DO $$
DECLARE v_wf_id TEXT := gen_random_uuid()::text;
BEGIN
  INSERT INTO workflows (id, name, module, entity_type, description, priority, is_active, created_at, updated_at)
  VALUES (v_wf_id, 'Fuel Delivery Approval', 'fuel', 'fuel_deliveries',
          'Approval for high-value fuel deliveries', 10, true, NOW(), NOW());
  INSERT INTO workflow_steps (id, workflow_id, step_order, step_name, required_role, approval_type,
    status_on_entry, status_on_pass, status_on_fail, is_final, description, created_at)
  VALUES
    (gen_random_uuid()::text, v_wf_id, 1, 'Fuel Manager Review', 'role_fuel_manager', 'any',
     'pending', 'pending', 'rejected', false, 'Fuel manager reviews delivery details', NOW()),
    (gen_random_uuid()::text, v_wf_id, 2, 'Finance Manager Approval', 'role_finance_manager', 'any',
     'pending', 'approved', 'rejected', true, 'Finance manager approves payment', NOW());
  INSERT INTO workflow_assignments (id, workflow_id, entity_type, department_id, is_active, created_at)
  VALUES (gen_random_uuid()::text, v_wf_id, 'fuel_deliveries', NULL, true, NOW());
END $$;

-- 6. Notification templates for fleet/fuel events
INSERT INTO notification_templates
  (id, event_type, type, title, message, link, category, enabled, send_email, send_push, created_at)
VALUES
  (gen_random_uuid(), 'fuel_issued', 'fuel_issued', 'Fuel Issued',
   '{{quantity}}L {{fuel_type}} issued to {{equipment_name}}',
   '/module/fuel/issuance', 'fuel', true, false, false, NOW()),
  (gen_random_uuid(), 'fuel_low_stock', 'fuel_low_stock', 'Fuel Tank Low Alert',
   'Tank {{tank_name}} is critically low: {{current_level}}L (threshold: {{threshold}}L)',
   '/module/fuel/tanks', 'fuel', true, true, true, NOW()),
  (gen_random_uuid(), 'fuel_delivery_received', 'fuel_delivery_received', 'Fuel Delivery Received',
   '{{quantity}}L delivered from {{supplier}}',
   '/module/fuel/deliveries', 'fuel', true, false, false, NOW()),
  (gen_random_uuid(), 'work_order_created', 'work_order_created', 'Work Order Created',
   'WO {{wo_number}} for {{asset_name}}: {{task_name}} — assigned to {{assigned_to}}',
   '/module/fleet/workshop', 'fleet', true, false, false, NOW()),
  (gen_random_uuid(), 'work_order_closed', 'work_order_closed', 'Work Order Closed',
   'WO {{wo_number}} closed. Actual cost: ${{actual_cost}}',
   '/module/fleet/workshop', 'fleet', true, false, false, NOW()),
  (gen_random_uuid(), 'accident_reported', 'accident_reported', 'Accident Report Filed',
   'ACCIDENT: {{report_number}} — {{vehicle_reg}} on {{incident_date}}. Driver: {{driver}}',
   '/module/fleet/accidents', 'fleet', true, true, true, NOW()),
  (gen_random_uuid(), 'breakdown_reported', 'breakdown_reported', 'Breakdown Reported',
   'BREAKDOWN: {{asset_name}} — {{severity}} severity at {{location}}',
   '/module/fleet/workshop', 'fleet', true, true, true, NOW()),
  (gen_random_uuid(), 'tyre_scrapped', 'tyre_scrapped', 'Tyre Scrapped',
   'Tyre {{tyre_code}} scrapped from {{vehicle}}. KM accumulated: {{km_accumulated}}',
   '/module/fleet/tyres', 'fleet', true, false, false, NOW()),
  (gen_random_uuid(), 'asset_condition_alert', 'asset_condition_alert', 'Asset Condition Alert',
   'Asset {{asset_name}} ({{asset_code}}) verified as: {{condition}}',
   '/module/assets/asset-verification', 'assets', true, true, false, NOW()),
  (gen_random_uuid(), 'pm_service_due', 'pm_service_due', 'Service Due Soon',
   '{{asset_name}} — service "{{task_name}}" due in {{days_until_due}} days',
   '/module/fleet/maintenance-alerts', 'fleet', true, false, false, NOW()),
  (gen_random_uuid(), 'fuel_reconciliation_variance', 'fuel_reconciliation_variance', 'Fuel Variance Alert',
   'Reconciliation variance: {{variance_pct}}% ({{variance_litres}}L). Threshold: {{threshold_pct}}%',
   '/module/fuel/reconciliation', 'fuel', true, true, false, NOW())
ON CONFLICT DO NOTHING;

-- 7. Role permissions for fleet/fuel/assets pages
INSERT INTO role_permissions
  (id, role_id, module_name, page_name, can_view, can_edit, can_delete, can_approve, created_at)
VALUES
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'maintenance',       true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'drivers',           true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'inspections',       true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'tyres',             true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'workshop',          true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'accidents',         true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'gl-config',         true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fleet', 'settings',          true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fuel',  'requests',          true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fuel',  'reconciliation',    true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'fuel',  'shifts',            true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'assets','registry',          true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'assets','depreciation',      true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_super_admin', 'assets','asset-verification',true,true,true,true,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','dashboard',         true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','vehicles',          true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','maintenance',       true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','workshop',          true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','drivers',           true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','accidents',         true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','inspections',       true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','tyres',             true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','generators',        true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fleet_manager','fleet','heavy-equipment',   true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'tanks',             true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'issuance',          true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'deliveries',        true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'requests',          true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'reconciliation',    true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'reports',           true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'dipstick',          true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_manager', 'fuel', 'shifts',            true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_workshop_supervisor','fleet','workshop',    true,true,false,true,NOW()),
  (gen_random_uuid(), 'role_workshop_supervisor','fleet','maintenance',  true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_workshop_supervisor','fleet','vehicles',    true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_workshop_supervisor','fleet','tyres',       true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_attendant','fuel','requests',          true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_attendant','fuel','shifts',            true,true,false,false,NOW()),
  (gen_random_uuid(), 'role_fuel_attendant','fuel','reconciliation',    true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','fleet','workshop',                 true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','fleet','drivers',                  true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','fleet','inspections',              true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','fleet','tyres',                    true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','assets','registry',                true,false,false,false,NOW()),
  (gen_random_uuid(), 'role_viewer','assets','depreciation',            true,false,false,false,NOW())
ON CONFLICT DO NOTHING;

-- 8. fleet_gl_config table
CREATE TABLE IF NOT EXISTS fleet_gl_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT UNIQUE NOT NULL,
  config_value TEXT,
  description  TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO fleet_gl_config (config_key, config_value, description) VALUES
  ('fuel_expense_account',         NULL, 'Fuel consumption expense (DR on issue)'),
  ('fuel_inventory_account',       NULL, 'Fuel inventory asset (DR on delivery, CR on issue)'),
  ('fuel_payable_account',         NULL, 'Accounts payable for fuel deliveries (CR)'),
  ('maintenance_expense_account',  NULL, 'Maintenance expense (DR on WO close)'),
  ('maintenance_payable_account',  NULL, 'Accounts payable for maintenance (CR on WO close)'),
  ('fixed_asset_account',          NULL, 'Fixed assets account (DR on acquisition)'),
  ('accum_depreciation_account',   NULL, 'Accumulated depreciation (CR on depreciation run)'),
  ('depreciation_expense_account', NULL, 'Depreciation expense (DR on depreciation run)')
ON CONFLICT (config_key) DO NOTHING;

-- 9. fleet_settings table
CREATE TABLE IF NOT EXISTS fleet_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type  TEXT DEFAULT 'number',
  description   TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO fleet_settings (setting_key, setting_value, setting_type, description) VALUES
  ('fuel_variance_threshold_pct',        '5',     'number', 'Fuel reconciliation variance % threshold for alert'),
  ('meter_jump_threshold_km_day',        '500',   'number', 'Max km/day — flags suspicious odometer reading'),
  ('meter_jump_threshold_hrs_day',       '20',    'number', 'Max hours/day — flags suspicious hour meter'),
  ('pm_reminder_lead_km',                '200',   'number', 'KM before service due to send PM reminder'),
  ('pm_reminder_lead_hrs',               '20',    'number', 'Hours before service due to send PM reminder'),
  ('pm_reminder_lead_days',              '7',     'number', 'Days before service due to send PM reminder'),
  ('default_fuel_unit_cost',             '0',     'number', 'Default fuel unit cost per litre ($)'),
  ('fuel_approval_threshold_liters',     '200',   'number', 'Fuel request qty above this triggers approval'),
  ('fuel_approval_threshold_value',      '500',   'number', 'Fuel request value above this triggers approval ($)'),
  ('wo_approval_threshold_cost',         '1000',  'number', 'WO cost above this requires supervisor approval ($)'),
  ('wo_fleet_mgr_approval_cost',         '5000',  'number', 'WO cost above this requires Fleet Manager approval ($)'),
  ('asset_acquisition_approval_threshold','10000','number', 'Asset purchase cost above this requires Finance approval ($)'),
  ('fuel_delivery_approval_threshold',   '5000',  'number', 'Fuel delivery value above this requires approval ($)')
ON CONFLICT (setting_key) DO NOTHING;
