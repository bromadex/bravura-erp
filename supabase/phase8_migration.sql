-- ============================================================
-- BRAVURA ERP — PHASE 8 MIGRATION
-- Attendance v2, Shifts v2, Skills v2 & Documents
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: DAILY WORK SUMMARY
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_work_summary_groups (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT,
  send_email_to   TEXT,
  email_subject   TEXT DEFAULT 'Daily Work Summary',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_work_summary_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_daily_work_summary_groups" ON daily_work_summary_groups;
CREATE POLICY "allow_all_daily_work_summary_groups" ON daily_work_summary_groups FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS daily_work_summary_group_members (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  group_id    TEXT NOT NULL REFERENCES daily_work_summary_groups(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE(group_id, employee_id)
);

ALTER TABLE daily_work_summary_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_daily_work_summary_group_members" ON daily_work_summary_group_members;
CREATE POLICY "allow_all_daily_work_summary_group_members" ON daily_work_summary_group_members FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS daily_work_summaries (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  group_id      TEXT REFERENCES daily_work_summary_groups(id),
  summary_date  DATE NOT NULL,
  summary_text  TEXT NOT NULL,
  hours_worked  NUMERIC(5,2),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_work_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_daily_work_summaries" ON daily_work_summaries;
CREATE POLICY "allow_all_daily_work_summaries" ON daily_work_summaries FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_work_summaries_employee_id ON daily_work_summaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_daily_work_summaries_date        ON daily_work_summaries(summary_date);

-- ============================================================
-- SECTION 2: SHIFT REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_requests (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number      TEXT,
  employee_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_type_id   TEXT REFERENCES shift_types(id),
  from_date       DATE NOT NULL,
  to_date         DATE NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft','Submitted','Approved','Rejected','Cancelled')),
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_shift_requests" ON shift_requests;
CREATE POLICY "allow_all_shift_requests" ON shift_requests FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_shift_requests_employee_id ON shift_requests(employee_id);

-- ============================================================
-- SECTION 3: SHIFT SCHEDULES (rotating)
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_schedules (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name               TEXT NOT NULL UNIQUE,
  description        TEXT,
  rotation_pattern   TEXT NOT NULL,
  rotation_days      INTEGER NOT NULL DEFAULT 1,
  start_date         DATE,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_shift_schedules" ON shift_schedules;
CREATE POLICY "allow_all_shift_schedules" ON shift_schedules FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 4: HOLIDAY LIST ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS holiday_list_assignments (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  holiday_list_id TEXT NOT NULL REFERENCES holiday_lists(id) ON DELETE CASCADE,
  department_id   TEXT REFERENCES departments(id) ON DELETE CASCADE,
  branch_name     TEXT,
  effective_from  DATE,
  effective_to    DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE holiday_list_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_holiday_list_assignments" ON holiday_list_assignments;
CREATE POLICY "allow_all_holiday_list_assignments" ON holiday_list_assignments FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 5: DESIGNATION SKILLS
-- ============================================================

CREATE TABLE IF NOT EXISTS designation_skills (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  designation_id    TEXT NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
  skill_id          TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  required_level    TEXT CHECK (required_level IN ('Beginner','Intermediate','Advanced','Expert')),
  is_mandatory      BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(designation_id, skill_id)
);

ALTER TABLE designation_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_designation_skills" ON designation_skills;
CREATE POLICY "allow_all_designation_skills" ON designation_skills FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_designation_skills_designation ON designation_skills(designation_id);
CREATE INDEX IF NOT EXISTS idx_designation_skills_skill       ON designation_skills(skill_id);

-- ============================================================
-- SECTION 6: IDENTIFICATION DOCUMENT TYPES & EMPLOYEE DOCUMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS identification_document_types (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name                TEXT NOT NULL UNIQUE,
  description         TEXT,
  requires_number     BOOLEAN NOT NULL DEFAULT true,
  requires_expiry     BOOLEAN NOT NULL DEFAULT false,
  is_mandatory        BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE identification_document_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_identification_document_types" ON identification_document_types;
CREATE POLICY "allow_all_identification_document_types" ON identification_document_types FOR ALL USING (true) WITH CHECK (true);

INSERT INTO identification_document_types (name, requires_number, requires_expiry, is_mandatory) VALUES
  ('National ID',          true, true,  true),
  ('Passport',             true, true,  false),
  ('Driver''s License',    true, true,  false),
  ('Tax Number',           true, false, false),
  ('NSSA Number',          true, false, false),
  ('Birth Certificate',    true, false, false),
  ('Academic Certificate', false, false, false),
  ('Police Clearance',     true, true,  false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS employee_documents (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type_id    TEXT NOT NULL REFERENCES identification_document_types(id),
  document_number     TEXT,
  issue_date          DATE,
  expiry_date         DATE,
  issuing_authority   TEXT,
  file_url            TEXT,
  notes               TEXT,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  verified_by         TEXT,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_employee_documents" ON employee_documents;
CREATE POLICY "allow_all_employee_documents" ON employee_documents FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry      ON employee_documents(expiry_date);

-- ============================================================
-- SECTION 7: DOCUMENTS SETTINGS (singleton)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  require_document_verification       BOOLEAN NOT NULL DEFAULT false,
  notify_before_expiry_days           INTEGER NOT NULL DEFAULT 30,
  notify_on_document_upload           BOOLEAN NOT NULL DEFAULT true,
  block_payroll_if_missing_mandatory  BOOLEAN NOT NULL DEFAULT false,
  allow_employee_upload               BOOLEAN NOT NULL DEFAULT true,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO documents_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE documents_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_documents_settings" ON documents_settings;
CREATE POLICY "allow_all_documents_settings" ON documents_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 8: EXTEND shift_attendance_settings FOR PHASE 8
-- ============================================================

ALTER TABLE shift_attendance_settings
  ADD COLUMN IF NOT EXISTS enable_daily_summary           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_summary_send_time        TIME    NOT NULL DEFAULT '18:00:00',
  ADD COLUMN IF NOT EXISTS bulk_attendance_default_status TEXT    NOT NULL DEFAULT 'Present',
  ADD COLUMN IF NOT EXISTS enable_shift_requests          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shift_request_advance_days     INTEGER NOT NULL DEFAULT 3;
