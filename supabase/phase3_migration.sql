-- ============================================================
-- BRAVURA ERP — PHASE 3 MIGRATION
-- Employee Management v2, Lifecycle, Overtime, Grievances,
-- Scheduled Notifications
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: EMPLOYEE MANAGEMENT v2 — Grades, Types
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_grades (
  id                       TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  grade_name               TEXT NOT NULL UNIQUE,
  description              TEXT,
  default_salary_structure TEXT REFERENCES salary_structures(id) ON DELETE SET NULL,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  default_base_pay         NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_by               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employment_types (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employment_type_name TEXT NOT NULL UNIQUE,
  description          TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK constraints to employees (columns already added in phase1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_employees_grade' AND table_name = 'employees'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT fk_employees_grade
      FOREIGN KEY (grade_id) REFERENCES employee_grades(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_employees_emp_type' AND table_name = 'employees'
  ) THEN
    -- employment_type_id may not exist; add it first if needed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='employment_type_id') THEN
      ALTER TABLE employees ADD COLUMN employment_type_id TEXT;
    END IF;
    ALTER TABLE employees ADD CONSTRAINT fk_employees_emp_type
      FOREIGN KEY (employment_type_id) REFERENCES employment_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- SECTION 2: PROMOTIONS & TRANSFERS
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_promotions (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  promotion_number TEXT,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  promotion_date   DATE NOT NULL,
  department_id    TEXT REFERENCES departments(id),
  status           TEXT NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft','Pending Approval','Approved','Rejected')),
  current_ctc      NUMERIC(12,2) NOT NULL DEFAULT 0,
  revised_ctc      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  promoted_by      TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_promotion_details (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  promotion_id     TEXT NOT NULL REFERENCES employee_promotions(id) ON DELETE CASCADE,
  property         TEXT NOT NULL,
  current_value    TEXT,
  new_value        TEXT
);

CREATE TABLE IF NOT EXISTS employee_transfers (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  transfer_number    TEXT,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  transfer_date      DATE NOT NULL,
  from_department_id TEXT REFERENCES departments(id),
  to_department_id   TEXT REFERENCES departments(id),
  from_designation_id TEXT REFERENCES designations(id),
  to_designation_id   TEXT REFERENCES designations(id),
  status             TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','Pending Approval','Approved','Rejected')),
  reason             TEXT,
  reallocate_leaves  BOOLEAN NOT NULL DEFAULT true,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_property_history (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id   TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  property_name TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  effective_date DATE,
  changed_by    TEXT,
  change_type   TEXT NOT NULL DEFAULT 'Manual'
                  CHECK (change_type IN ('Promotion','Transfer','Manual','Onboarding','Separation')),
  reference_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 3: ONBOARDING & SEPARATION
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_templates (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_title TEXT NOT NULL,
  department_id  TEXT REFERENCES departments(id),
  designation_id TEXT REFERENCES designations(id),
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_template_activities (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_id  TEXT NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  activity     TEXT NOT NULL,
  role         TEXT,
  required     BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employee_onboardings (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  onboarding_number TEXT,
  employee_id       TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  template_id       TEXT REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  date_of_joining   DATE NOT NULL,
  boarding_begins_on DATE,
  status            TEXT NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending','In Progress','Completed','Cancelled')),
  progress          INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_activities (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  onboarding_id   TEXT NOT NULL REFERENCES employee_onboardings(id) ON DELETE CASCADE,
  activity        TEXT NOT NULL,
  assigned_to     TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','In Progress','Completed')),
  completion_date DATE,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS separation_templates (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_title TEXT NOT NULL,
  department_id  TEXT REFERENCES departments(id),
  designation_id TEXT REFERENCES designations(id),
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS separation_template_activities (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_id  TEXT NOT NULL REFERENCES separation_templates(id) ON DELETE CASCADE,
  activity     TEXT NOT NULL,
  role         TEXT,
  required     BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employee_separations (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  separation_number     TEXT,
  employee_id           TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  template_id           TEXT REFERENCES separation_templates(id) ON DELETE SET NULL,
  resignation_date      DATE,
  last_working_day      DATE,
  status                TEXT NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending','In Progress','Completed','Cancelled')),
  exit_interview        TEXT,
  final_settlement_date DATE,
  reason                TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS separation_activities (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  separation_id  TEXT NOT NULL REFERENCES employee_separations(id) ON DELETE CASCADE,
  activity       TEXT NOT NULL,
  assigned_to    TEXT,
  status         TEXT NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending','In Progress','Completed')),
  completion_date DATE,
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS full_and_final_statements (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  statement_number TEXT,
  employee_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  separation_id    TEXT REFERENCES employee_separations(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft','Submitted','Paid','Cancelled')),
  total_payable    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_receivable NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fnf_components (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  statement_id   TEXT NOT NULL REFERENCES full_and_final_statements(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('payable','receivable')),
  description    TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- SECTION 4: OVERTIME
-- ============================================================

CREATE TABLE IF NOT EXISTS overtime_types (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  overtime_name TEXT NOT NULL UNIQUE,
  rate_type     TEXT NOT NULL DEFAULT 'Multiplier'
                  CHECK (rate_type IN ('Fixed','Multiplier')),
  rate_value    NUMERIC(6,2) NOT NULL DEFAULT 1.5,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS overtime_slips (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  slip_number        TEXT,
  employee_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  overtime_type_id   TEXT REFERENCES overtime_types(id),
  posting_date       DATE NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  start_time         TIME,
  end_time           TIME,
  total_hours        NUMERIC(6,2) NOT NULL DEFAULT 0,
  hourly_rate        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft','Submitted','Approved','Rejected','Cancelled')),
  salary_slip_id     TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 5: GRIEVANCES
-- ============================================================

CREATE TABLE IF NOT EXISTS grievance_types (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  grievance_type TEXT NOT NULL UNIQUE,
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_grievances (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  grievance_number    TEXT,
  raised_by           TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  subject             TEXT NOT NULL,
  description         TEXT,
  grievance_type_id   TEXT REFERENCES grievance_types(id),
  against_employee_id TEXT REFERENCES employees(id),
  against_party       TEXT,
  status              TEXT NOT NULL DEFAULT 'Open'
                        CHECK (status IN ('Open','In Progress','Resolved','Dismissed','Withdrawn')),
  cause_of_grievance  TEXT,
  resolved_by         TEXT,
  resolution_date     DATE,
  resolution_detail   TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 6: SCHEDULED NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  notification_type TEXT NOT NULL
                      CHECK (notification_type IN ('birthday','holiday','leave_expiry','work_anniversary','contract_expiry')),
  trigger_days_before INTEGER NOT NULL DEFAULT 0,
  message_template  TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  send_to           TEXT NOT NULL DEFAULT 'hr'
                      CHECK (send_to IN ('employee','manager','hr','all')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default scheduled notification rules
INSERT INTO scheduled_notifications (id, notification_type, trigger_days_before, message_template, is_active, send_to)
VALUES
  ((gen_random_uuid())::text, 'birthday',         0,  'Today is {employee_name}''s birthday! Wish them well.', true, 'hr'),
  ((gen_random_uuid())::text, 'work_anniversary',  0, '{employee_name} completes {years} year(s) today. Congratulations!', true, 'hr'),
  ((gen_random_uuid())::text, 'leave_expiry',      7, '{employee_name}''s leave balance expires in 7 days.', true, 'hr'),
  ((gen_random_uuid())::text, 'contract_expiry',  30, '{employee_name}''s contract expires in 30 days.', true, 'hr')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SECTION 7: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_promotions_employee     ON employee_promotions(employee_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status       ON employee_promotions(status);
CREATE INDEX IF NOT EXISTS idx_transfers_employee      ON employee_transfers(employee_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status        ON employee_transfers(status);
CREATE INDEX IF NOT EXISTS idx_prop_history_employee   ON employee_property_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_onboardings_employee    ON employee_onboardings(employee_id);
CREATE INDEX IF NOT EXISTS idx_separations_employee    ON employee_separations(employee_id);
CREATE INDEX IF NOT EXISTS idx_fnf_employee            ON full_and_final_statements(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_slips_employee ON overtime_slips(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_slips_status   ON overtime_slips(status);
CREATE INDEX IF NOT EXISTS idx_grievances_raised_by    ON employee_grievances(raised_by);
CREATE INDEX IF NOT EXISTS idx_grievances_status       ON employee_grievances(status);

-- ============================================================
-- SECTION 8: RLS
-- ============================================================

ALTER TABLE employee_grades                ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_types               ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_promotions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_promotion_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_transfers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_property_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_onboardings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_activities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE separation_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE separation_template_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_separations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE separation_activities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE full_and_final_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnf_components                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_types                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_slips                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievance_types                ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_grievances            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'employee_grades','employment_types',
  'employee_promotions','employee_promotion_details',
  'employee_transfers','employee_property_history',
  'onboarding_templates','onboarding_template_activities',
  'employee_onboardings','onboarding_activities',
  'separation_templates','separation_template_activities',
  'employee_separations','separation_activities',
  'full_and_final_statements','fnf_components',
  'overtime_types','overtime_slips',
  'grievance_types','employee_grievances',
  'scheduled_notifications'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
