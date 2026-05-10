-- supabase/migrations/notifications_category.sql
-- Add category to notifications and notification_templates tables.
-- Run in Supabase SQL editor.

-- 1. Add category to notifications (existing rows default to 'general')
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (user_id, category);

-- 2. Add category to notification_templates
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- 3. Backfill categories on notification_templates
UPDATE notification_templates SET category = 'approval' WHERE event_type IN (
  'sr_submitted', 'pr_submitted', 'po_approval_required',
  'leave_request', 'ot_request', 'policy_pending', 'exit_checklist',
  'travel_request'
);

UPDATE notification_templates SET category = 'reminder' WHERE event_type IN (
  'sr_overdue', 'requisition_overdue', 'attendance_alert',
  'camp_maintenance', 'pr_overdue', 'po_overdue'
);

UPDATE notification_templates SET category = 'announcement' WHERE event_type IN (
  'memo_published', 'policy_published', 'leave_approved', 'leave_rejected',
  'leave_forwarded', 'account_created', 'payroll', 'payroll_processed',
  'sr_fulfilled', 'sr_ready_to_fulfil', 'pr_approved', 'po_approved',
  'room_assigned', 'room_transferred', 'room_vacated', 'travel_approved'
);

UPDATE notification_templates SET category = 'escalation' WHERE event_type IN (
  'sr_escalated', 'pr_escalated', 'po_escalated', 'leave_escalated',
  'approval_overdue'
);
