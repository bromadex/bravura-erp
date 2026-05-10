-- supabase/migrations/audit_log_enhancements.sql
-- Adds status, details columns to hr_audit_logs for failed-action tracking.
-- Run in Supabase SQL editor.

ALTER TABLE hr_audit_logs
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  ADD COLUMN IF NOT EXISTS details    TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Index for filtering by status and action
CREATE INDEX IF NOT EXISTS idx_audit_status ON hr_audit_logs (status);
CREATE INDEX IF NOT EXISTS idx_audit_action ON hr_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_module ON hr_audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON hr_audit_logs (user_name);

COMMENT ON COLUMN hr_audit_logs.status  IS 'success or failed';
COMMENT ON COLUMN hr_audit_logs.details IS 'Error message or context for failed actions';
