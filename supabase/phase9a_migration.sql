-- Phase 9A Migration: HR Setup Overhaul
-- Run this in the Supabase Dashboard → SQL Editor.
-- Adds missing columns to leave_types, departments, designations tables.

-- ── 1. leave_types additions ─────────────────────────────────────────────────
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS code                TEXT;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS description         TEXT;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS applicable_gender   TEXT    NOT NULL DEFAULT 'all'   CHECK (applicable_gender IN ('all','male','female'));
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_approval   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_document   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS min_notice_days     INT     NOT NULL DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active           BOOLEAN NOT NULL DEFAULT TRUE;

-- Seed example leave types if table is empty
INSERT INTO leave_types (id, name, code, max_leaves_allowed, is_carry_forward, max_carry_forward_days, allow_encashment, max_encashable_days, color, is_active, requires_approval, description)
SELECT
  gen_random_uuid()::text, name, code, max_days, carry_fwd, max_carry, encash, max_encash, color, true, true, descr
FROM (VALUES
  ('Annual Leave',       'AL',  21, true,  5,  true,  5,  '#60a5fa', 'Standard annual leave entitlement'),
  ('Sick Leave',         'SL',  10, false, 0,  false, 0,  '#f87171', 'Medical / illness leave'),
  ('Maternity Leave',    'ML',  98, false, 0,  false, 0,  '#f472b6', 'Maternity leave entitlement'),
  ('Paternity Leave',    'PL',  10, false, 0,  false, 0,  '#34d399', 'Paternity leave entitlement'),
  ('Compassionate Leave','CL',  3,  false, 0,  false, 0,  '#fbbf24', 'Bereavement or family emergency'),
  ('Study Leave',        'STL', 5,  false, 0,  false, 0,  '#a78bfa', 'Examinations or professional study')
) AS t(name, code, max_days, carry_fwd, max_carry, encash, max_encash, color, descr)
WHERE NOT EXISTS (SELECT 1 FROM leave_types LIMIT 1);

-- ── 2. departments additions ──────────────────────────────────────────────────
ALTER TABLE departments ADD COLUMN IF NOT EXISTS color       TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS cost_center TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS budget      NUMERIC(15,2);

-- ── 3. designations additions ─────────────────────────────────────────────────
ALTER TABLE designations ADD COLUMN IF NOT EXISTS description   TEXT;
ALTER TABLE designations ADD COLUMN IF NOT EXISTS pay_grade_min NUMERIC(12,2);
ALTER TABLE designations ADD COLUMN IF NOT EXISTS pay_grade_max NUMERIC(12,2);

-- ── 4. RLS passthrough (if not already set) ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_types' AND policyname = 'allow_all_leave_types') THEN
    ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "allow_all_leave_types" ON leave_types FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
