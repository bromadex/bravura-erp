-- ============================================================
-- BRAVURA ERP — PHASE 7 ADDENDUM
-- New settings columns + skills_settings singleton
-- Run after phase7_migration.sql
-- ============================================================

-- Extend shift_attendance_settings with Phase 7 biometric controls
ALTER TABLE shift_attendance_settings
  ADD COLUMN IF NOT EXISTS auto_process_checkins   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checkin_match_hours      INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS require_biometric_device BOOLEAN NOT NULL DEFAULT false;

-- Skills & Competency singleton settings
CREATE TABLE IF NOT EXISTS skills_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  skill_review_frequency_months INTEGER NOT NULL DEFAULT 12,
  mandatory_skill_assessment  BOOLEAN NOT NULL DEFAULT false,
  allow_self_assessment        BOOLEAN NOT NULL DEFAULT true,
  notify_upcoming_review       BOOLEAN NOT NULL DEFAULT true,
  review_reminder_days         INTEGER NOT NULL DEFAULT 14,
  track_certifications         BOOLEAN NOT NULL DEFAULT true,
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO skills_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE skills_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_skills_settings" ON skills_settings;
CREATE POLICY "allow_all_skills_settings" ON skills_settings FOR ALL USING (true) WITH CHECK (true);
