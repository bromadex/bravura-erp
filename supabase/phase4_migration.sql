-- ============================================================
-- BRAVURA ERP — PHASE 4 MIGRATION
-- Training Management, Employee Referrals, HR Settings
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: TRAINING MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS training_types (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  type_name      TEXT NOT NULL UNIQUE,
  description    TEXT,
  category       TEXT,
  duration_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  provider       TEXT,
  cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_trainings (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  training_number  TEXT,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id TEXT REFERENCES training_types(id) ON DELETE SET NULL,
  training_date    DATE NOT NULL,
  completion_date  DATE,
  status           TEXT NOT NULL DEFAULT 'Scheduled'
                     CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled','Failed')),
  score            NUMERIC(5,2),
  certificate_no   TEXT,
  notes            TEXT,
  conducted_by     TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: EMPLOYEE REFERRALS
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_programs (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  program_name   TEXT NOT NULL,
  description    TEXT,
  bonus_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  valid_from     DATE,
  valid_to       DATE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_referrals (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  referral_number  TEXT,
  referrer_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  referred_name    TEXT NOT NULL,
  referred_email   TEXT,
  referred_phone   TEXT,
  position         TEXT,
  program_id       TEXT REFERENCES referral_programs(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'Submitted'
                     CHECK (status IN ('Submitted','Screening','Interviewed','Hired','Rejected','Withdrawn')),
  referral_date    DATE NOT NULL,
  hire_date        DATE,
  bonus_paid       BOOLEAN NOT NULL DEFAULT false,
  bonus_paid_date  DATE,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: HR SETTINGS (singleton)
-- ============================================================

CREATE TABLE IF NOT EXISTS hr_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  company_name                TEXT,
  company_address             TEXT,
  payroll_frequency           TEXT NOT NULL DEFAULT 'Monthly'
                                CHECK (payroll_frequency IN ('Monthly','Fortnightly','Bimonthly','Weekly','Daily')),
  currency                    TEXT NOT NULL DEFAULT 'USD',
  working_days_per_month      INTEGER NOT NULL DEFAULT 26,
  working_hours_per_day       NUMERIC(4,2) NOT NULL DEFAULT 8,
  standard_working_hours      NUMERIC(4,2) NOT NULL DEFAULT 8,
  overtime_threshold_hours    NUMERIC(4,2) NOT NULL DEFAULT 8,
  tax_year_start_month        INTEGER NOT NULL DEFAULT 1 CHECK (tax_year_start_month BETWEEN 1 AND 12),
  leave_year_start_month      INTEGER NOT NULL DEFAULT 1 CHECK (leave_year_start_month BETWEEN 1 AND 12),
  probation_period_days       INTEGER NOT NULL DEFAULT 90,
  notice_period_days          INTEGER NOT NULL DEFAULT 30,
  max_leave_carry_forward     INTEGER NOT NULL DEFAULT 10,
  hr_email                    TEXT,
  hr_manager_name             TEXT,
  enable_attendance_auto_mark BOOLEAN NOT NULL DEFAULT false,
  enable_leave_expiry_alerts  BOOLEAN NOT NULL DEFAULT true,
  enable_birthday_alerts      BOOLEAN NOT NULL DEFAULT true,
  enable_contract_expiry_alerts BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default settings row
INSERT INTO hr_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SECTION 4: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_employee_trainings_emp    ON employee_trainings(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_trainings_status ON employee_trainings(status);
CREATE INDEX IF NOT EXISTS idx_employee_trainings_date   ON employee_trainings(training_date);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer        ON employee_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status          ON employee_referrals(status);

-- ============================================================
-- SECTION 5: RLS
-- ============================================================

ALTER TABLE training_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_trainings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_programs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_referrals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_settings         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'training_types','employee_trainings',
  'referral_programs','employee_referrals',
  'hr_settings'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
