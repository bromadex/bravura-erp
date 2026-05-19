-- ============================================================
-- BRAVURA ERP — PHASE 7B MIGRATION
-- Gratuity, Employee Benefits, Appointment Letters,
-- Interview Types, Job Applicant Sources & Offer Templates
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: GRATUITY RULES (master + slabs)
-- ============================================================

CREATE TABLE IF NOT EXISTS gratuity_rules (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name                  TEXT NOT NULL UNIQUE,
  currency              TEXT NOT NULL DEFAULT 'USD',
  applicable_from_date  DATE,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gratuity_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_gratuity_rules" ON gratuity_rules;
CREATE POLICY "allow_all_gratuity_rules" ON gratuity_rules FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS gratuity_rule_slabs (
  id                              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  rule_id                         TEXT NOT NULL REFERENCES gratuity_rules(id) ON DELETE CASCADE,
  from_year                       NUMERIC(4,1) NOT NULL DEFAULT 0,
  to_year                         NUMERIC(4,1),
  fraction_of_applicable_earnings NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  sort_order                      INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE gratuity_rule_slabs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_gratuity_rule_slabs" ON gratuity_rule_slabs;
CREATE POLICY "allow_all_gratuity_rule_slabs" ON gratuity_rule_slabs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gratuity_rule_slabs_rule_id ON gratuity_rule_slabs (rule_id);

-- ============================================================
-- SECTION 2: GRATUITY RECORDS
-- ============================================================

CREATE TABLE IF NOT EXISTS gratuity (
  id                          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number                  TEXT,
  employee_id                 TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  gratuity_rule_id            TEXT REFERENCES gratuity_rules(id),
  date_of_joining             DATE,
  last_working_day            DATE,
  years_of_service            NUMERIC(6,2),
  current_applicable_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount                      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  status                      TEXT NOT NULL DEFAULT 'Draft'
                                CHECK (status IN ('Draft','Submitted','Approved','Paid','Cancelled')),
  payment_date                DATE,
  payroll_entry_id            TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  notes                       TEXT,
  created_by                  TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gratuity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_gratuity" ON gratuity;
CREATE POLICY "allow_all_gratuity" ON gratuity FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gratuity_employee_id      ON gratuity (employee_id);
CREATE INDEX IF NOT EXISTS idx_gratuity_gratuity_rule_id ON gratuity (gratuity_rule_id);

-- ============================================================
-- SECTION 3: EMPLOYEE BENEFIT APPLICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_benefit_applications (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number         TEXT,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_period_id  TEXT REFERENCES payroll_periods(id),
  max_benefit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','Submitted','Approved','Rejected','Cancelled')),
  application_date   DATE NOT NULL,
  approved_by        TEXT,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_benefit_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_employee_benefit_applications" ON employee_benefit_applications;
CREATE POLICY "allow_all_employee_benefit_applications" ON employee_benefit_applications FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_employee_benefit_applications_employee_id ON employee_benefit_applications (employee_id);

-- ============================================================
-- SECTION 4: EMPLOYEE BENEFIT CLAIMS
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_benefit_claims (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number     TEXT,
  employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES employee_benefit_applications(id),
  benefit_type   TEXT NOT NULL,
  claim_date     DATE NOT NULL,
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  receipt_url    TEXT,
  status         TEXT NOT NULL DEFAULT 'Draft'
                   CHECK (status IN ('Draft','Submitted','Approved','Paid','Rejected','Cancelled')),
  approved_by    TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employee_benefit_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_employee_benefit_claims" ON employee_benefit_claims;
CREATE POLICY "allow_all_employee_benefit_claims" ON employee_benefit_claims FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_employee_benefit_claims_employee_id    ON employee_benefit_claims (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_benefit_claims_application_id ON employee_benefit_claims (application_id);

-- ============================================================
-- SECTION 5: APPOINTMENT LETTER TEMPLATES & LETTERS
-- ============================================================

CREATE TABLE IF NOT EXISTS appointment_letter_templates (
  id         TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name       TEXT NOT NULL UNIQUE,
  intro      TEXT,
  body       TEXT NOT NULL,
  outro      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointment_letter_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_appointment_letter_templates" ON appointment_letter_templates;
CREATE POLICY "allow_all_appointment_letter_templates" ON appointment_letter_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS appointment_letters (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number        TEXT,
  employee_id       TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  template_id       TEXT REFERENCES appointment_letter_templates(id),
  letter_date       DATE NOT NULL,
  designation       TEXT,
  department        TEXT,
  joining_date      DATE,
  salary_text       TEXT,
  generated_content TEXT,
  status            TEXT NOT NULL DEFAULT 'Draft'
                      CHECK (status IN ('Draft','Issued','Accepted','Declined')),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointment_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_appointment_letters" ON appointment_letters;
CREATE POLICY "allow_all_appointment_letters" ON appointment_letters FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_appointment_letters_employee_id ON appointment_letters (employee_id);
CREATE INDEX IF NOT EXISTS idx_appointment_letters_template_id ON appointment_letters (template_id);

-- ============================================================
-- SECTION 6: INTERVIEW TYPES
-- ============================================================

CREATE TABLE IF NOT EXISTS interview_types (
  id                       TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name                     TEXT NOT NULL UNIQUE,
  description              TEXT,
  default_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE interview_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_interview_types" ON interview_types;
CREATE POLICY "allow_all_interview_types" ON interview_types FOR ALL USING (true) WITH CHECK (true);

-- Seed interview types
INSERT INTO interview_types (name, default_duration_minutes) VALUES
  ('HR Round',           60),
  ('Technical Round',    90),
  ('Panel Interview',    90),
  ('Aptitude Test',      60),
  ('Skills Assessment',  60),
  ('Final Interview',    60)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SECTION 7: JOB APPLICANT SOURCES
-- ============================================================

CREATE TABLE IF NOT EXISTS job_applicant_sources (
  id         TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_applicant_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_job_applicant_sources" ON job_applicant_sources;
CREATE POLICY "allow_all_job_applicant_sources" ON job_applicant_sources FOR ALL USING (true) WITH CHECK (true);

-- Seed applicant sources
INSERT INTO job_applicant_sources (name) VALUES
  ('Company Website'),
  ('LinkedIn'),
  ('Referral'),
  ('Walk-in'),
  ('Job Board'),
  ('Recruitment Agency'),
  ('Social Media')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SECTION 8: JOB OFFER TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS job_offer_templates (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name          TEXT NOT NULL UNIQUE,
  designation   TEXT,
  body          TEXT NOT NULL,
  offer_terms   TEXT,
  validity_days INTEGER NOT NULL DEFAULT 14,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_offer_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_job_offer_templates" ON job_offer_templates;
CREATE POLICY "allow_all_job_offer_templates" ON job_offer_templates FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SECTION 9: EXTEND EXISTING TABLES (safe — skips if not present)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'applicants'
  ) THEN
    ALTER TABLE applicants ADD COLUMN IF NOT EXISTS source_id TEXT REFERENCES job_applicant_sources(id);
    CREATE INDEX IF NOT EXISTS idx_applicants_source_id ON applicants (source_id);
  END IF;

  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'interviews'
  ) THEN
    ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interview_type_id TEXT REFERENCES interview_types(id);
    CREATE INDEX IF NOT EXISTS idx_interviews_interview_type_id ON interviews (interview_type_id);
  END IF;
END $$;
