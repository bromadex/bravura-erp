-- ============================================================
-- BRAVURA ERP — PHASE 2 ADDENDUM
-- Missing pieces: Salary Slips, Payroll Entry, Job Requisitions,
-- KRAs, Appraisal Templates, Peer Feedback
-- ALL PKs: TEXT DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: PAYROLL — Salary Slips + Batch Entry
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  entry_number       TEXT,
  posting_date       DATE NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  payroll_frequency  TEXT NOT NULL DEFAULT 'Monthly'
                       CHECK (payroll_frequency IN ('Monthly','Fortnightly','Bimonthly','Weekly','Daily')),
  department_id      TEXT REFERENCES departments(id),
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','Processing','Submitted','Cancelled')),
  total_employees    INTEGER NOT NULL DEFAULT 0,
  total_gross        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_slips (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  slip_number        TEXT,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  payroll_entry_id   TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  structure_id       TEXT REFERENCES salary_structures(id),
  posting_date       DATE NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  working_days       INTEGER NOT NULL DEFAULT 26,
  payment_days       NUMERIC(5,1) NOT NULL DEFAULT 26,
  absent_days        NUMERIC(5,1) NOT NULL DEFAULT 0,
  lwp_days           NUMERIC(5,1) NOT NULL DEFAULT 0,
  basic_salary       NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_pay          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deduction    NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay            NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','Submitted','Cancelled')),
  mode_of_payment    TEXT DEFAULT 'Bank Transfer',
  bank_name          TEXT,
  bank_account_no    TEXT,
  remarks            TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_slip_components (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  slip_id          TEXT NOT NULL REFERENCES salary_slips(id) ON DELETE CASCADE,
  component_id     TEXT REFERENCES salary_components(id),
  component_name   TEXT NOT NULL,
  component_type   TEXT NOT NULL CHECK (component_type IN ('earning','deduction','employer_contribution')),
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_taxable       BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- SECTION 2: RECRUITMENT — Job Requisitions
-- ============================================================

CREATE TABLE IF NOT EXISTS job_requisitions (
  id                     TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  requisition_number     TEXT,
  designation            TEXT NOT NULL,
  department_id          TEXT REFERENCES departments(id),
  no_of_positions        INTEGER NOT NULL DEFAULT 1,
  expected_compensation  NUMERIC(12,2),
  currency               TEXT NOT NULL DEFAULT 'USD',
  status                 TEXT NOT NULL DEFAULT 'Pending'
                           CHECK (status IN ('Pending','Approved','Rejected','Filled','On Hold','Cancelled')),
  requested_by           TEXT,
  requested_by_name      TEXT,
  posting_date           DATE,
  expected_by            DATE,
  description            TEXT,
  reason                 TEXT,
  job_opening_id         TEXT REFERENCES job_openings(id),
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: PERFORMANCE — KRAs + Templates + Peer Feedback
-- ============================================================

CREATE TABLE IF NOT EXISTS kras (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  title       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraisal_templates (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_title  TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appraisal_template_goals (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_id    TEXT NOT NULL REFERENCES appraisal_templates(id) ON DELETE CASCADE,
  kra_id         TEXT REFERENCES kras(id),
  kra_title      TEXT NOT NULL,
  per_weightage  NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS performance_feedback (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id         TEXT REFERENCES employees(id),
  reviewer_name       TEXT,
  review_id           TEXT REFERENCES performance_reviews(id) ON DELETE SET NULL,
  appraisal_period_id TEXT REFERENCES appraisal_periods(id),
  total_score         NUMERIC(5,2),
  feedback            TEXT,
  added_on            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_ratings (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  feedback_id  TEXT NOT NULL REFERENCES performance_feedback(id) ON DELETE CASCADE,
  criteria     TEXT NOT NULL,
  rating       NUMERIC(3,1) CHECK (rating BETWEEN 1 AND 5),
  comments     TEXT
);

-- Add appraisal_template_id to performance_reviews if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='performance_reviews' AND column_name='appraisal_template_id'
  ) THEN
    ALTER TABLE performance_reviews ADD COLUMN appraisal_template_id TEXT REFERENCES appraisal_templates(id);
  END IF;
END $$;

-- Add kra_id to performance_goals if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='performance_goals' AND column_name='kra_id'
  ) THEN
    ALTER TABLE performance_goals ADD COLUMN kra_id TEXT REFERENCES kras(id);
  END IF;
END $$;

-- ============================================================
-- SECTION 4: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payroll_entries_status    ON payroll_entries(status);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_dates     ON payroll_entries(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_salary_slips_employee     ON salary_slips(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_entry        ON salary_slips(payroll_entry_id);
CREATE INDEX IF NOT EXISTS idx_salary_slips_status       ON salary_slips(status);
CREATE INDEX IF NOT EXISTS idx_slip_components_slip      ON salary_slip_components(slip_id);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_dept     ON job_requisitions(department_id);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_status   ON job_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_appraisal_tmpl_goals      ON appraisal_template_goals(template_id);
CREATE INDEX IF NOT EXISTS idx_perf_feedback_employee    ON performance_feedback(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_feedback_review      ON performance_feedback(review_id);
CREATE INDEX IF NOT EXISTS idx_feedback_ratings_feedback ON feedback_ratings(feedback_id);

-- ============================================================
-- SECTION 5: RLS
-- ============================================================

ALTER TABLE payroll_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_slips               ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_slip_components     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requisitions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kras                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appraisal_template_goals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_ratings           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'payroll_entries','salary_slips','salary_slip_components',
  'job_requisitions','kras','appraisal_templates','appraisal_template_goals',
  'performance_feedback','feedback_ratings'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
