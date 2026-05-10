-- supabase/migrations/notification_templates.sql
-- Run in Supabase SQL editor to enable DB-driven notification templates.

CREATE TABLE IF NOT EXISTS notification_templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_type  TEXT NOT NULL UNIQUE,  -- machine key e.g. 'sr_submitted'
  type        TEXT NOT NULL,         -- maps to NOTIFICATION_ICONS in TopBar
  title       TEXT NOT NULL,         -- supports {{variable}} interpolation
  message     TEXT NOT NULL,         -- supports {{variable}} interpolation
  link        TEXT,                  -- route, e.g. '/module/procurement/store-requisitions'
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed with all current hardcoded notification messages
INSERT INTO notification_templates (event_type, type, title, message, link) VALUES
  -- Procurement
  ('sr_submitted',        'requisition_submitted',  'Store Requisition Pending Approval',
   '{{requester_name}} submitted {{req_number}} and it requires your approval.',
   '/module/procurement/store-requisitions'),

  ('sr_ready_to_fulfil',  'requisition_approved',   'Store Requisition Ready to Fulfil',
   'SR {{req_number}} has been approved by HOD and is ready to fulfil from store.',
   '/module/procurement/store-requisitions'),

  ('sr_fulfilled',        'requisition_fulfilled',  'Store Requisition Fulfilled',
   'Your requisition {{req_number}} has been fulfilled by the storekeeper.',
   '/module/procurement/store-requisitions'),

  ('pr_submitted',        'requisition_submitted',  'Purchase Requisition Pending Approval',
   '{{requester_name}} submitted purchase requisition {{req_number}} for {{total_amount}}.',
   '/module/procurement/purchase-requisitions'),

  ('po_approval_required','po_approval_required',   'Purchase Order Requires Approval',
   'Purchase Order {{po_number}} for {{supplier_name}} ({{total_amount}}) requires your approval.',
   '/module/procurement/purchase-orders'),

  -- HR — Leave
  ('leave_submitted',     'leave_request',          'Leave Request Pending',
   '{{employee_name}} submitted a {{leave_type}} leave request from {{start_date}} to {{end_date}}.',
   '/module/hr/leave'),

  ('leave_approved',      'leave_approved',         'Leave Request Approved',
   'Your {{leave_type}} leave from {{start_date}} to {{end_date}} has been approved.',
   '/module/hr/leave'),

  ('leave_rejected',      'leave_rejected',         'Leave Request Rejected',
   'Your {{leave_type}} leave request has been rejected. Reason: {{reason}}.',
   '/module/hr/leave'),

  -- HR — Travel
  ('travel_submitted',    'leave_request',          'Travel Request Pending',
   '{{employee_name}} submitted a travel request to {{destination}} from {{start_date}} to {{end_date}}.',
   '/module/hr/travel'),

  ('travel_approved',     'leave_approved',         'Travel Request Approved',
   'Your travel request to {{destination}} has been approved.',
   '/module/hr/travel'),

  -- HR — Attendance
  ('attendance_alert',    'attendance_alert',       'Attendance Flagged',
   '{{employee_name}} was marked {{status}} on {{date}}.',
   '/module/hr/attendance'),

  ('ot_request',          'ot_request',             'Overtime Request Pending',
   '{{employee_name}} submitted an OT request for {{date}} ({{hours}} hours).',
   '/module/hr/attendance'),

  -- Payroll
  ('payroll_run',         'payroll',                'Payroll Processed',
   'Payroll for {{period}} has been processed. {{employee_count}} employees, total {{total_amount}}.',
   '/module/hr/payroll'),

  -- Account / System
  ('account_created',     'account_created',        'System Account Created',
   'A system account has been created for {{full_name}}. Username: {{username}}.',
   '/module/hr/permissions'),

  -- Campsite
  ('room_assigned',       'room_assigned',          'Room Assigned',
   '{{employee_name}} has been assigned to Room {{room_code}} in Block {{block_name}}.',
   '/module/campsite/assignments'),

  ('room_transferred',    'room_transferred',       'Room Transferred',
   '{{employee_name}} has been transferred from {{old_room}} to {{new_room}}.',
   '/module/campsite/assignments'),

  ('room_vacated',        'room_vacated',           'Room Vacated',
   '{{employee_name}} has vacated Room {{room_code}}.',
   '/module/campsite/assignments'),

  -- Camp operations
  ('camp_occupancy_high', 'camp_occupancy_high',    'Camp Occupancy High',
   'Camp occupancy has reached {{pct}}% ({{occupied}} of {{total}} beds).',
   '/module/campsite/overview'),

  ('ppe_return_required', 'ppe_return_required',    'PPE Return Required',
   '{{employee_name}} has PPE items pending return: {{items}}.',
   '/module/campsite/ppe-register'),

  -- Governance
  ('memo_published',      'memo_published',         'New Memo Published',
   '{{author}} published a memo: "{{title}}".',
   '/module/governance/memos'),

  ('policy_pending',      'policy_pending',         'Policy Pending Review',
   '{{author}} submitted a policy for review: "{{title}}".',
   '/module/governance/policies')

ON CONFLICT (event_type) DO NOTHING;
