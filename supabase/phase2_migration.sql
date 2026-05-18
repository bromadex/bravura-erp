-- ============================================================
-- BRAVURA ERP — PHASE 2 MIGRATION
-- Recruitment + Performance + Payroll v2
-- ALL PKs: TEXT DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: PAYROLL v2 — Salary Structures
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_structures (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name         TEXT NOT NULL,
  description  TEXT,
  currency     TEXT NOT NULL DEFAULT 'USD',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_components (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  structure_id     TEXT NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  component_type   TEXT NOT NULL CHECK (component_type IN ('earning','deduction','employer_contribution')),
  amount_type      TEXT NOT NULL CHECK (amount_type IN ('fixed','percent_of_basic','formula')),
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_taxable       BOOLEAN NOT NULL DEFAULT true,
  is_statutory     BOOLEAN NOT NULL DEFAULT false,  -- PAYE, NSSA, AIDS levy
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_salary_assignments (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  structure_id     TEXT NOT NULL REFERENCES salary_structures(id),
  basic_salary     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  effective_date   DATE NOT NULL,
  end_date         DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: RECRUITMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS job_openings (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_title          TEXT NOT NULL,
  department_id      TEXT REFERENCES departments(id),
  location           TEXT,
  employment_type    TEXT NOT NULL DEFAULT 'Full-time'
                        CHECK (employment_type IN ('Full-time','Part-time','Contract','Casual','Internship')),
  headcount          INTEGER NOT NULL DEFAULT 1,
  min_salary         NUMERIC(12,2),
  max_salary         NUMERIC(12,2),
  currency           TEXT NOT NULL DEFAULT 'USD',
  description        TEXT,
  requirements       TEXT,
  status             TEXT NOT NULL DEFAULT 'Open'
                        CHECK (status IN ('Draft','Open','On Hold','Closed','Cancelled')),
  posted_date        DATE,
  closing_date       DATE,
  filled_count       INTEGER NOT NULL DEFAULT 0,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_applicants (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_opening_id     TEXT NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT,
  phone              TEXT,
  current_employer   TEXT,
  current_title      TEXT,
  years_experience   NUMERIC(4,1),
  cv_url             TEXT,
  cover_letter       TEXT,
  source             TEXT DEFAULT 'Direct',  -- Direct, Referral, LinkedIn, etc.
  stage              TEXT NOT NULL DEFAULT 'Applied'
                        CHECK (stage IN ('Applied','Screening','Interview','Assessment','Offer','Hired','Rejected','Withdrawn')),
  rating             INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes              TEXT,
  referred_by        TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_schedules (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  applicant_id       TEXT NOT NULL REFERENCES job_applicants(id) ON DELETE CASCADE,
  job_opening_id     TEXT NOT NULL REFERENCES job_openings(id),
  interviewer_id     TEXT REFERENCES employees(id),
  interviewer_name   TEXT,  -- fallback if no employee record
  interview_type     TEXT NOT NULL DEFAULT 'Phone Screen'
                        CHECK (interview_type IN ('Phone Screen','Video','In-person','Panel','Technical','HR Final')),
  scheduled_date     TIMESTAMPTZ,
  duration_minutes   INTEGER DEFAULT 60,
  location_or_link   TEXT,
  status             TEXT NOT NULL DEFAULT 'Scheduled'
                        CHECK (status IN ('Scheduled','Completed','Cancelled','No Show')),
  outcome            TEXT CHECK (outcome IN ('Pass','Fail','On Hold',NULL)),
  feedback           TEXT,
  score              INTEGER CHECK (score BETWEEN 1 AND 10),
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_offers (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  applicant_id       TEXT NOT NULL REFERENCES job_applicants(id) ON DELETE CASCADE,
  job_opening_id     TEXT NOT NULL REFERENCES job_openings(id),
  offered_title      TEXT NOT NULL,
  offered_salary     NUMERIC(12,2),
  currency           TEXT NOT NULL DEFAULT 'USD',
  start_date         DATE,
  expiry_date        DATE,
  status             TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Sent','Accepted','Declined','Expired','Revoked')),
  offer_letter_text  TEXT,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: PERFORMANCE MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS appraisal_periods (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name             TEXT NOT NULL,
  period_type      TEXT NOT NULL DEFAULT 'Annual'
                      CHECK (period_type IN ('Annual','Semi-Annual','Quarterly','Monthly')),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Draft'
                      CHECK (status IN ('Draft','Active','Closed','Archived')),
  description      TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_templates (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  default_weight   NUMERIC(5,2) NOT NULL DEFAULT 100,
  unit             TEXT DEFAULT '%',
  department_id    TEXT REFERENCES departments(id),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  period_id        TEXT NOT NULL REFERENCES appraisal_periods(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id      TEXT REFERENCES employees(id),
  reviewer_name    TEXT,
  status           TEXT NOT NULL DEFAULT 'Draft'
                      CHECK (status IN ('Draft','Self Review','Manager Review','HR Review','Completed','Cancelled')),
  overall_rating   NUMERIC(3,1) CHECK (overall_rating BETWEEN 1 AND 5),
  self_rating      NUMERIC(3,1) CHECK (self_rating BETWEEN 1 AND 5),
  manager_comments TEXT,
  employee_comments TEXT,
  strengths        TEXT,
  development_areas TEXT,
  submitted_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);

CREATE TABLE IF NOT EXISTS performance_goals (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  review_id        TEXT NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  kpi_template_id  TEXT REFERENCES kpi_templates(id),
  goal_title       TEXT NOT NULL,
  description      TEXT,
  weight           NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_value     TEXT,
  actual_value     TEXT,
  score            NUMERIC(3,1) CHECK (score BETWEEN 1 AND 5),
  manager_score    NUMERIC(3,1) CHECK (manager_score BETWEEN 1 AND 5),
  comments         TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 4: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_salary_components_structure   ON salary_components(structure_id);
CREATE INDEX IF NOT EXISTS idx_emp_salary_employee           ON employee_salary_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_salary_active             ON employee_salary_assignments(employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_job_applicants_opening        ON job_applicants(job_opening_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_stage          ON job_applicants(stage);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant          ON interview_schedules(applicant_id);
CREATE INDEX IF NOT EXISTS idx_interviews_opening            ON interview_schedules(job_opening_id);
CREATE INDEX IF NOT EXISTS idx_job_offers_applicant          ON job_offers(applicant_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_period           ON performance_reviews(period_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_employee         ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_goals_review             ON performance_goals(review_id);
CREATE INDEX IF NOT EXISTS idx_kpi_templates_dept            ON kpi_templates(department_id);

-- ============================================================
-- SECTION 5: RLS (match existing pattern — permissive for now)
-- ============================================================

ALTER TABLE salary_structures             ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_components             ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_openings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applicants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_schedules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_offers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_periods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_templates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_goals             ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'salary_structures','salary_components','employee_salary_assignments',
  'job_openings','job_applicants','interview_schedules','job_offers',
  'appraisal_periods','kpi_templates','performance_reviews','performance_goals'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
