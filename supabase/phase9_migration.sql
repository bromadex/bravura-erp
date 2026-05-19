-- Phase 9 Migration: Lifecycle & Performance Refinements
-- Run in Supabase Dashboard → SQL Editor.

-- ── 1. exit_interviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_interviews (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id           TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  separation_id         TEXT REFERENCES employee_separations(id) ON DELETE SET NULL,
  interview_date        DATE,
  interviewer_id        TEXT REFERENCES employees(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending','Scheduled','Completed','Cancelled')),
  rating                INT  CHECK (rating BETWEEN 1 AND 5),
  reason_for_leaving    TEXT,
  overall_satisfaction  TEXT
                          CHECK (overall_satisfaction IN
                            ('Very Satisfied','Satisfied','Neutral','Dissatisfied','Very Dissatisfied')),
  feedback_on_manager   TEXT,
  feedback_on_company   TEXT,
  suggestions           TEXT,
  would_rejoin          BOOLEAN,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_interviews_employee ON exit_interviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_interviews_status   ON exit_interviews(status);

ALTER TABLE exit_interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_exit_interviews" ON exit_interviews;
CREATE POLICY "allow_all_exit_interviews" ON exit_interviews FOR ALL USING (true) WITH CHECK (true);

-- ── 2. appraisal_cycles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        TEXT NOT NULL,
  year        INT  NOT NULL,
  frequency   TEXT NOT NULL DEFAULT 'Annual'
                CHECK (frequency IN ('Annual','Semi-Annual','Quarterly','Monthly')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Active','Closed')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraisal_cycle_periods (
  id        TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  cycle_id  TEXT NOT NULL REFERENCES appraisal_cycles(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES appraisal_periods(id) ON DELETE CASCADE,
  UNIQUE (cycle_id, period_id)
);

ALTER TABLE appraisal_cycles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_cycle_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_appraisal_cycles"         ON appraisal_cycles;
DROP POLICY IF EXISTS "allow_all_appraisal_cycle_periods"  ON appraisal_cycle_periods;
CREATE POLICY "allow_all_appraisal_cycles"         ON appraisal_cycles        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_appraisal_cycle_periods"  ON appraisal_cycle_periods FOR ALL USING (true) WITH CHECK (true);

-- ── 3. department_approvers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS department_approvers (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  department_id   TEXT NOT NULL REFERENCES departments(id)  ON DELETE CASCADE,
  approval_type   TEXT NOT NULL
                    CHECK (approval_type IN ('leave','expense','overtime','travel','general')),
  level           INT  NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  approver_id     TEXT NOT NULL REFERENCES employees(id)    ON DELETE CASCADE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, approval_type, level)
);

CREATE INDEX IF NOT EXISTS idx_dept_approvers_dept ON department_approvers(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_approvers_type ON department_approvers(approval_type);

ALTER TABLE department_approvers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_department_approvers" ON department_approvers;
CREATE POLICY "allow_all_department_approvers" ON department_approvers FOR ALL USING (true) WITH CHECK (true);

-- ── 4. purpose_of_travel ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purpose_of_travel (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name              TEXT NOT NULL,
  description       TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default purposes
INSERT INTO purpose_of_travel (id, name, description, requires_approval)
SELECT gen_random_uuid()::text, name, descr, req_approval
FROM (VALUES
  ('Business Meeting',       'External or internal business meetings',         true),
  ('Training & Development', 'Staff training, workshops and conferences',      true),
  ('Site Visit',             'Operational site or client site visits',         true),
  ('Equipment Delivery',     'Transportation of equipment or materials',       false),
  ('Procurement',            'Purchasing trips and supplier visits',           true),
  ('Audit',                  'Internal or external audit',                     true),
  ('Medical',                'Employee medical visit or referral',             false),
  ('Other',                  'Any other approved official purpose',            true)
) AS t(name, descr, req_approval)
WHERE NOT EXISTS (SELECT 1 FROM purpose_of_travel LIMIT 1);

ALTER TABLE purpose_of_travel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_purpose_of_travel" ON purpose_of_travel;
CREATE POLICY "allow_all_purpose_of_travel" ON purpose_of_travel FOR ALL USING (true) WITH CHECK (true);

-- ── 5. employee_boarding_activities ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_boarding_activities (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  activity_type   TEXT NOT NULL DEFAULT 'onboarding'
                    CHECK (activity_type IN ('onboarding','offboarding')),
  activity        TEXT NOT NULL,
  category        TEXT,
  assigned_to     TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','In Progress','Completed','Skipped')),
  due_date        DATE,
  completed_date  DATE,
  notes           TEXT,
  sort_order      INT  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_boarding_activities_employee ON employee_boarding_activities(employee_id);
CREATE INDEX IF NOT EXISTS idx_boarding_activities_type     ON employee_boarding_activities(activity_type);

ALTER TABLE employee_boarding_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_boarding_activities" ON employee_boarding_activities;
CREATE POLICY "allow_all_boarding_activities" ON employee_boarding_activities FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Leave block list enhancements ─────────────────────────────────────────
ALTER TABLE leave_block_lists ADD COLUMN IF NOT EXISTS description TEXT;

-- ── 7. RLS on tables that may be missing it ──────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['leave_block_lists','leave_block_list_dates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'DO $inner$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = %L) THEN CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true); END IF; END $inner$',
      tbl, 'allow_all_' || tbl, 'allow_all_' || tbl, tbl
    );
  END LOOP;
END $$;
