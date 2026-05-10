-- supabase/migrations/scheduled_reports.sql
-- Scheduled Reports: stores configuration for automated report delivery.

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  report_type   TEXT NOT NULL,   -- e.g. 'hr_headcount', 'fuel_consumption', etc.
  frequency     TEXT NOT NULL,   -- 'daily' | 'weekly' | 'monthly'
  day_of_week   INT,             -- 0=Sun … 6=Sat (for weekly)
  day_of_month  INT,             -- 1–31 (for monthly)
  filters       JSONB NOT NULL DEFAULT '{}',  -- { department, status, dateRange }
  recipients    JSONB NOT NULL DEFAULT '{}',  -- { roles: [], userIds: [] }
  format        TEXT NOT NULL DEFAULT 'excel', -- 'excel' | 'csv' | 'pdf'
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled ON scheduled_reports (enabled, next_run_at);

-- ── Seed data ───────────────────────────────────────────────────────────────

INSERT INTO scheduled_reports (id, name, report_type, frequency, day_of_week, format, enabled)
VALUES (
  gen_random_uuid()::text,
  'Weekly Fuel Report',
  'fuel_consumption',
  'weekly',
  1,         -- Monday
  'excel',
  TRUE
)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_reports (id, name, report_type, frequency, day_of_month, format, enabled)
VALUES (
  gen_random_uuid()::text,
  'Monthly HR Headcount',
  'hr_headcount',
  'monthly',
  1,         -- 1st of month
  'pdf',
  TRUE
)
ON CONFLICT DO NOTHING;

INSERT INTO scheduled_reports (id, name, report_type, frequency, format, enabled)
VALUES (
  gen_random_uuid()::text,
  'Daily Audit Log',
  'audit_log',
  'daily',
  'csv',
  FALSE
)
ON CONFLICT DO NOTHING;
