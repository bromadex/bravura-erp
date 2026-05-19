-- ============================================================
-- BRAVURA ERP — PHASE 6 MIGRATION
-- Tax & Pay Adjustments — PAYE slabs, exemptions, additional pay,
-- arrears, withholding, corrections, incentives, retention bonuses
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- NOTE: existing `payroll_periods` is for pay runs; this phase adds
-- `tax_years` for tax year tracking (PAYE/NSSA brackets).
-- ============================================================

-- ============================================================
-- SECTION 1: TAX YEARS + INCOME TAX SLABS
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_years (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  year_label  TEXT NOT NULL UNIQUE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  country     TEXT NOT NULL DEFAULT 'Zimbabwe',
  status      TEXT NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active','Closed','Archived')),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_years_dates_chk CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS income_tax_slabs (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  tax_year_id     TEXT NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  slab_from       NUMERIC(14,2) NOT NULL DEFAULT 0,
  slab_to         NUMERIC(14,2),
  rate_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  fixed_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  applies_to      TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (applies_to IN ('monthly','annual','weekly','fortnightly')),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: TAX EXEMPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS tax_exemption_categories (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT,
  max_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'USD',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_exemption_declarations (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  declaration_number  TEXT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tax_year_id         TEXT NOT NULL REFERENCES tax_years(id),
  total_declared      NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Submitted','Approved','Rejected')),
  submitted_at        TIMESTAMPTZ,
  approved_by         TEXT,
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_exemption_declaration_items (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  declaration_id      TEXT NOT NULL REFERENCES tax_exemption_declarations(id) ON DELETE CASCADE,
  category_id         TEXT NOT NULL REFERENCES tax_exemption_categories(id),
  declared_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  proof_url           TEXT,
  proof_status        TEXT NOT NULL DEFAULT 'Pending'
                        CHECK (proof_status IN ('Pending','Submitted','Verified','Rejected')),
  verification_notes  TEXT
);

-- ============================================================
-- SECTION 3: ADDITIONAL SALARY (one-time bonuses, ad-hoc deductions)
-- ============================================================

CREATE TABLE IF NOT EXISTS additional_salary (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number          TEXT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('Earning','Deduction')),
  salary_component_id TEXT REFERENCES salary_components(id),
  component_name      TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  payable_date        DATE NOT NULL,
  is_taxable          BOOLEAN NOT NULL DEFAULT true,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurring_until     DATE,
  payroll_entry_id    TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  salary_slip_id      TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Submitted','Paid','Cancelled')),
  reason              TEXT,
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 4: SALARY ARREARS (back-pay)
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_arrears (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number          TEXT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date           DATE NOT NULL,
  to_date             DATE NOT NULL,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  reason              TEXT,
  payroll_entry_id    TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  salary_slip_id      TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Submitted','Paid','Cancelled')),
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arrears_dates_chk CHECK (to_date >= from_date)
);

-- ============================================================
-- SECTION 5: SALARY WITHHOLDING (withhold + release cycle)
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_withholdings (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number           TEXT,
  employee_id          TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  total_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'USD',
  reason               TEXT,
  withheld_from_date   DATE NOT NULL,
  release_date         DATE,
  status               TEXT NOT NULL DEFAULT 'Withheld'
                         CHECK (status IN ('Withheld','Released','Cancelled')),
  release_payroll_entry_id TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  release_salary_slip_id   TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  notes                TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 6: PAYROLL CORRECTIONS (fix posted slips)
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_corrections (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number          TEXT,
  original_slip_id    TEXT NOT NULL REFERENCES salary_slips(id) ON DELETE RESTRICT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  correction_date     DATE NOT NULL,
  reason              TEXT NOT NULL,
  total_diff          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Submitted','Posted','Cancelled')),
  posted_at           TIMESTAMPTZ,
  posted_by           TEXT,
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_correction_lines (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  correction_id       TEXT NOT NULL REFERENCES payroll_corrections(id) ON DELETE CASCADE,
  component_name      TEXT NOT NULL,
  component_type      TEXT NOT NULL CHECK (component_type IN ('earning','deduction','employer_contribution')),
  original_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  corrected_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  difference          NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order          INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- SECTION 7: EMPLOYEE INCENTIVES (performance/sales)
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_incentives (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number          TEXT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  incentive_type      TEXT NOT NULL DEFAULT 'Performance'
                        CHECK (incentive_type IN ('Performance','Sales','Project','Spot Award','Other')),
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  period              TEXT,
  earned_date         DATE NOT NULL,
  paid_date           DATE,
  payroll_entry_id    TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  salary_slip_id      TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft','Submitted','Approved','Paid','Cancelled')),
  approved_by         TEXT,
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 8: RETENTION BONUSES (sign-on/retention with vesting)
-- ============================================================

CREATE TABLE IF NOT EXISTS retention_bonuses (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  ref_number          TEXT,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bonus_type          TEXT NOT NULL DEFAULT 'Sign-on'
                        CHECK (bonus_type IN ('Sign-on','Retention','Milestone','Long-Service')),
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  signup_date         DATE NOT NULL,
  vesting_date        DATE NOT NULL,
  vesting_status      TEXT NOT NULL DEFAULT 'Pending'
                        CHECK (vesting_status IN ('Pending','Vested','Forfeited')),
  payroll_entry_id    TEXT REFERENCES payroll_entries(id) ON DELETE SET NULL,
  salary_slip_id      TEXT REFERENCES salary_slips(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Pending','Vested','Paid','Forfeited','Cancelled')),
  paid_date           DATE,
  forfeiture_reason   TEXT,
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retention_vesting_chk CHECK (vesting_date >= signup_date)
);

-- ============================================================
-- SECTION 9: SALARY COMPONENT → GL ACCOUNT MAPPING
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_component_accounts (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  component_id    TEXT NOT NULL REFERENCES salary_components(id) ON DELETE CASCADE,
  account_code    TEXT NOT NULL,
  account_label   TEXT,
  department_id   TEXT REFERENCES departments(id),
  is_default      BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 10: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tax_slabs_year             ON income_tax_slabs(tax_year_id);
CREATE INDEX IF NOT EXISTS idx_exempt_decl_employee       ON tax_exemption_declarations(employee_id);
CREATE INDEX IF NOT EXISTS idx_exempt_decl_year           ON tax_exemption_declarations(tax_year_id);
CREATE INDEX IF NOT EXISTS idx_exempt_items_decl          ON tax_exemption_declaration_items(declaration_id);
CREATE INDEX IF NOT EXISTS idx_add_salary_employee        ON additional_salary(employee_id);
CREATE INDEX IF NOT EXISTS idx_add_salary_status          ON additional_salary(status);
CREATE INDEX IF NOT EXISTS idx_add_salary_payable_date    ON additional_salary(payable_date);
CREATE INDEX IF NOT EXISTS idx_arrears_employee           ON salary_arrears(employee_id);
CREATE INDEX IF NOT EXISTS idx_arrears_status             ON salary_arrears(status);
CREATE INDEX IF NOT EXISTS idx_withholdings_employee      ON salary_withholdings(employee_id);
CREATE INDEX IF NOT EXISTS idx_withholdings_status        ON salary_withholdings(status);
CREATE INDEX IF NOT EXISTS idx_corrections_slip           ON payroll_corrections(original_slip_id);
CREATE INDEX IF NOT EXISTS idx_corrections_employee       ON payroll_corrections(employee_id);
CREATE INDEX IF NOT EXISTS idx_correction_lines_corr      ON payroll_correction_lines(correction_id);
CREATE INDEX IF NOT EXISTS idx_incentives_employee        ON employee_incentives(employee_id);
CREATE INDEX IF NOT EXISTS idx_incentives_status          ON employee_incentives(status);
CREATE INDEX IF NOT EXISTS idx_retention_employee         ON retention_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_retention_status           ON retention_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_component_accounts_comp    ON salary_component_accounts(component_id);

-- ============================================================
-- SECTION 11: RLS
-- ============================================================

ALTER TABLE tax_years                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_tax_slabs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_exemption_categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_exemption_declarations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_exemption_declaration_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE additional_salary                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_arrears                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_withholdings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_corrections                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_correction_lines           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_incentives                ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_bonuses                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_component_accounts          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'tax_years','income_tax_slabs',
  'tax_exemption_categories','tax_exemption_declarations','tax_exemption_declaration_items',
  'additional_salary','salary_arrears','salary_withholdings',
  'payroll_corrections','payroll_correction_lines',
  'employee_incentives','retention_bonuses','salary_component_accounts'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
