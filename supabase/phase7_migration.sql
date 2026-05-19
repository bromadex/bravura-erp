-- ============================================================
-- BRAVURA ERP — PHASE 7 MIGRATION
-- Attendance v2 (Biometric Check-ins, Devices) & Skills Management
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- NOTE: employee_checkins and employee_skills already exist in DB.
--       We extend them safely with ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- SECTION 1: SKILL TYPES & SKILLS MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_types (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  skill_type_id TEXT REFERENCES skill_types(id) ON DELETE SET NULL,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: ATTENDANCE DEVICES (biometric device registry)
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_devices (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  device_name   TEXT NOT NULL,
  device_serial TEXT UNIQUE,
  location      TEXT,
  branch        TEXT,
  ip_address    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_sync_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: EXTEND EXISTING TABLES SAFELY
-- ============================================================

-- Extend employee_skills with structured skill_id FK + proficiency
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS skill_id            TEXT REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS proficiency         TEXT NOT NULL DEFAULT 'Beginner';
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1) NOT NULL DEFAULT 0;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS evaluation_date     DATE;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS certified           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE employee_skills ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- Extend employee_checkins with device FK + attendance link
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS device_id         TEXT REFERENCES attendance_devices(id) ON DELETE SET NULL;
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS is_processed       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS processed_at       TIMESTAMPTZ;
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS attendance_id      TEXT REFERENCES attendance(id) ON DELETE SET NULL;
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS skip_auto          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employee_checkins ADD COLUMN IF NOT EXISTS notes              TEXT;

-- ============================================================
-- SECTION 4: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_skills_type        ON skills(skill_type_id);
CREATE INDEX IF NOT EXISTS idx_emp_skills_emp     ON employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_skills_skill   ON employee_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_checkins_emp       ON employee_checkins(employee_id);
CREATE INDEX IF NOT EXISTS idx_checkins_device    ON employee_checkins(device_id);
CREATE INDEX IF NOT EXISTS idx_checkins_processed ON employee_checkins(is_processed);

-- ============================================================
-- SECTION 5: RLS
-- ============================================================

ALTER TABLE skill_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills               ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_devices   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY['skill_types','skills','attendance_devices'];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- SECTION 6: SEED DEFAULT SKILL TYPES
-- ============================================================

INSERT INTO skill_types (name, description) VALUES
  ('Technical',      'Engineering, IT and technical skills'),
  ('Operational',    'Plant operations, mining and field work skills'),
  ('Safety',         'Health, safety and environmental skills'),
  ('Managerial',     'Leadership and management capabilities'),
  ('Communication',  'Language and interpersonal skills'),
  ('Financial',      'Accounting, budgeting and financial analysis')
ON CONFLICT (name) DO NOTHING;
