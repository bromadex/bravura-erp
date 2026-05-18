-- supabase/phase1_migration.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 HRMS Expansion — Full DDL
-- Creates all new tables for Leave, Shift, and Expense engines.
-- Adds new columns to existing tables (employees, leave_types, leave_requests,
-- employee_attendance).
-- Run in Supabase SQL Editor or via CLI: psql -f phase1_migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — ALTER EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1a. employees ─────────────────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_list_id         UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade_id                UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type_id      UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth           DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender                  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality             TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status          TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group             TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notice_period_days      INT DEFAULT 30;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_leaving         DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS relieving_date          DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reason_for_leaving      TEXT;

-- ── 1b. leave_types ───────────────────────────────────────────────────────────
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_leaves_allowed       INT     DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_continuous_days      INT     DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_carry_forward         BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_carry_forward_days   INT     DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_lwp                   BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_compensatory          BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_earned_leave          BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS earned_leave_frequency   TEXT    DEFAULT 'Monthly';
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS allow_negative           BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS include_holiday          BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS allow_encashment         BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS max_encashable_days      INT     DEFAULT 0;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS color                    TEXT    DEFAULT '#3B82F6';

-- ── 1c. leave_requests ────────────────────────────────────────────────────────
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day         BOOLEAN    DEFAULT FALSE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS half_day_date    DATE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS total_leave_days NUMERIC(4,1);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_balance    NUMERIC(6,2);

-- ── 1d. employee_attendance ───────────────────────────────────────────────────
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS attendance_type        TEXT    DEFAULT 'Present';
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS shift_type_id          UUID;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS late_entry             BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS early_exit             BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS late_entry_mins        INT     DEFAULT 0;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS early_exit_mins        INT     DEFAULT 0;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS leave_type_id          UUID;
ALTER TABLE employee_attendance ADD COLUMN IF NOT EXISTS attendance_request_id  UUID;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — LEAVE ENGINE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 2a. holiday_lists ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holiday_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  from_date   DATE        NOT NULL,
  to_date     DATE        NOT NULL,
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_lists_is_default ON holiday_lists(is_default);

-- ── 2b. holiday_list_dates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holiday_list_dates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_list_id  UUID        NOT NULL REFERENCES holiday_lists(id) ON DELETE CASCADE,
  holiday_date     DATE        NOT NULL,
  description      TEXT,
  weekly_off       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holiday_list_dates_list_id ON holiday_list_dates(holiday_list_id);
CREATE INDEX IF NOT EXISTS idx_holiday_list_dates_date    ON holiday_list_dates(holiday_date);

-- ── 2c. leave_periods ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_periods (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  from_date   DATE        NOT NULL,
  to_date     DATE        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_periods_is_active ON leave_periods(is_active);

-- ── 2d. leave_policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2e. leave_policy_details ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policy_details (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID        NOT NULL REFERENCES leave_policies(id) ON DELETE CASCADE,
  leave_type_id       UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  annual_allocation   NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_policy_details_policy_id     ON leave_policy_details(policy_id);
CREATE INDEX IF NOT EXISTS idx_leave_policy_details_leave_type_id ON leave_policy_details(leave_type_id);

-- ── 2f. leave_policy_assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policy_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_policy_id   UUID        NOT NULL REFERENCES leave_policies(id) ON DELETE RESTRICT,
  leave_period_id   UUID        NOT NULL REFERENCES leave_periods(id) ON DELETE RESTRICT,
  effective_from    DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_policy_assignments_employee ON leave_policy_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_policy_assignments_policy   ON leave_policy_assignments(leave_policy_id);
CREATE INDEX IF NOT EXISTS idx_leave_policy_assignments_period   ON leave_policy_assignments(leave_period_id);

-- ── 2g. leave_allocations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_allocations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id           UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  leave_period_id         UUID        NOT NULL REFERENCES leave_periods(id) ON DELETE RESTRICT,
  from_date               DATE        NOT NULL,
  to_date                 DATE        NOT NULL,
  new_leaves_allocated    NUMERIC(6,2) NOT NULL DEFAULT 0,
  carry_forward           BOOLEAN     NOT NULL DEFAULT FALSE,
  carry_forwarded_leaves  NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_leaves_allocated  NUMERIC(6,2) NOT NULL DEFAULT 0,
  status                  TEXT        NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired', 'Cancelled')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_allocations_employee    ON leave_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_allocations_leave_type ON leave_allocations(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_allocations_period     ON leave_allocations(leave_period_id);
CREATE INDEX IF NOT EXISTS idx_leave_allocations_status     ON leave_allocations(status);

-- ── 2h. leave_ledger_entries ──────────────────────────────────────────────────
-- Positive leaves = credit (allocation), Negative leaves = debit (leave taken)
CREATE TABLE IF NOT EXISTS leave_ledger_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id     UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  transaction_type  TEXT        NOT NULL,  -- 'Allocation' | 'Leave Application' | 'Adjustment' | 'Carry Forward'
  transaction_name  TEXT        NOT NULL,
  from_date         DATE        NOT NULL,
  to_date           DATE        NOT NULL,
  leaves            NUMERIC(6,2) NOT NULL, -- positive = credit, negative = debit
  is_carry_forward  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee      ON leave_ledger_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_leave_type    ON leave_ledger_entries(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_from_date     ON leave_ledger_entries(from_date);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_emp_type_date ON leave_ledger_entries(employee_id, leave_type_id, from_date);

-- ── 2i. leave_block_lists ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_block_lists (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT        NOT NULL,
  applies_to_all_departments BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2j. leave_block_list_dates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_block_list_dates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_list_id   UUID        NOT NULL REFERENCES leave_block_lists(id) ON DELETE CASCADE,
  block_date      DATE        NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_block_list_dates_list ON leave_block_list_dates(block_list_id);
CREATE INDEX IF NOT EXISTS idx_leave_block_list_dates_date ON leave_block_list_dates(block_date);

-- ── 2k. compensatory_leave_requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compensatory_leave_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id         UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  work_from_date        DATE        NOT NULL,
  work_end_date         DATE        NOT NULL,
  half_day              BOOLEAN     NOT NULL DEFAULT FALSE,
  reason                TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled')),
  leave_allocation_id   UUID        REFERENCES leave_allocations(id),
  workflow_instance_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_leave_employee ON compensatory_leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_comp_leave_status   ON compensatory_leave_requests(status);

-- ── 2l. leave_encashments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_encashments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id     UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  leave_period_id   UUID        NOT NULL REFERENCES leave_periods(id) ON DELETE RESTRICT,
  leave_balance     NUMERIC(6,2) NOT NULL DEFAULT 0,
  encashment_days   NUMERIC(6,2) NOT NULL DEFAULT 0,
  encashment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  encashment_date   DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled')),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_encashments_employee ON leave_encashments(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_encashments_status   ON leave_encashments(status);

-- ── 2m. leave_adjustments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_adjustments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id    UUID        NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  adjustment_days  NUMERIC(6,2) NOT NULL,  -- positive = add, negative = deduct
  reason           TEXT        NOT NULL,
  effective_date   DATE        NOT NULL,
  adjusted_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_adjustments_employee ON leave_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_adjustments_date     ON leave_adjustments(effective_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — SHIFT ENGINE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 3a. shift_types ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_types (
  id                                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                                    TEXT        NOT NULL UNIQUE,
  start_time                              TIME        NOT NULL,
  end_time                                TIME        NOT NULL,
  is_night_shift                          BOOLEAN     NOT NULL DEFAULT FALSE,
  color                                   TEXT                 DEFAULT '#6366F1',
  grace_period_after_start_mins           INT         NOT NULL DEFAULT 0,
  late_entry_grace_mins                   INT         NOT NULL DEFAULT 0,
  early_exit_grace_mins                   INT         NOT NULL DEFAULT 0,
  working_hours_threshold_for_half_day    NUMERIC(4,2) NOT NULL DEFAULT 4.0,
  working_hours_threshold_for_absent      NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  max_working_hours                       NUMERIC(4,2)         DEFAULT 12.0,
  process_attendance_after_hrs            NUMERIC(4,2)         DEFAULT 8.0,
  enable_auto_attendance                  BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active                               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_types_is_active ON shift_types(is_active);

-- ── 3b. shift_locations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_locations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  latitude       NUMERIC(10,7) NOT NULL,
  longitude      NUMERIC(10,7) NOT NULL,
  radius_meters  INT         NOT NULL DEFAULT 200,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3c. shift_assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_type_id     UUID        NOT NULL REFERENCES shift_types(id) ON DELETE RESTRICT,
  shift_location_id UUID                 REFERENCES shift_locations(id) ON DELETE SET NULL,
  start_date        DATE        NOT NULL,
  end_date          DATE,
  status            TEXT        NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Expired')),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee   ON shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift_type ON shift_assignments(shift_type_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_status     ON shift_assignments(status);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_dates      ON shift_assignments(start_date, end_date);

-- ── 3d. employee_checkins ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_checkins (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  log_type              TEXT        NOT NULL CHECK (log_type IN ('IN', 'OUT')),
  time                  TIMESTAMPTZ NOT NULL,
  shift_assignment_id   UUID                 REFERENCES shift_assignments(id) ON DELETE SET NULL,
  attendance_id         UUID                 REFERENCES employee_attendance(id) ON DELETE SET NULL,
  latitude              NUMERIC(10,7),
  longitude             NUMERIC(10,7),
  device_id             TEXT,
  skip_auto_attendance  BOOLEAN     NOT NULL DEFAULT FALSE,
  offshift              BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_checkins_employee ON employee_checkins(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_checkins_time     ON employee_checkins(time);
CREATE INDEX IF NOT EXISTS idx_employee_checkins_log_type ON employee_checkins(log_type);
CREATE INDEX IF NOT EXISTS idx_employee_checkins_emp_time ON employee_checkins(employee_id, time);

-- ── 3e. attendance_requests ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date             DATE        NOT NULL,
  to_date               DATE        NOT NULL,
  half_day              BOOLEAN     NOT NULL DEFAULT FALSE,
  half_day_date         DATE,
  reason                TEXT        NOT NULL,
  explanation           TEXT,
  shift_type_id         UUID                 REFERENCES shift_types(id) ON DELETE SET NULL,
  include_holidays      BOOLEAN     NOT NULL DEFAULT FALSE,
  status                TEXT        NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled')),
  workflow_instance_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_requests_employee ON attendance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_status   ON attendance_requests(status);
CREATE INDEX IF NOT EXISTS idx_attendance_requests_dates    ON attendance_requests(from_date, to_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — EXPENSE ENGINE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 4a. expense_types ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_types (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL UNIQUE,
  description           TEXT,
  default_account_code  TEXT        NOT NULL,
  max_claim_amount      NUMERIC(12,2)        DEFAULT 0,
  requires_receipt      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_types_is_active ON expense_types(is_active);

-- ── 4b. expense_claims ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_claims (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number            TEXT        NOT NULL UNIQUE,
  employee_id             UUID        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  posting_date            DATE        NOT NULL,
  department_id           UUID,
  expense_approver_id     TEXT,
  expense_approver_name   TEXT,
  total_claimed_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_sanctioned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total             NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_advance_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount_reimbursed NUMERIC(14,2) NOT NULL DEFAULT 0,
  approval_status         TEXT        NOT NULL DEFAULT 'Draft'
    CHECK (approval_status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled')),
  status                  TEXT        NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Submitted', 'Unpaid', 'Paid', 'Rejected', 'Cancelled')),
  is_paid                 BOOLEAN     NOT NULL DEFAULT FALSE,
  remark                  TEXT,
  payable_account_code    TEXT,
  workflow_instance_id    UUID,
  gl_entry_id             UUID,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_employee        ON expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_approval_status ON expense_claims(approval_status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_status          ON expense_claims(status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_posting_date    ON expense_claims(posting_date);

-- ── 4c. expense_claim_details ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_claim_details (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          UUID        NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  expense_type_id   UUID        NOT NULL REFERENCES expense_types(id) ON DELETE RESTRICT,
  expense_date      DATE        NOT NULL,
  description       TEXT,
  claimed_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  sanctioned_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_url       TEXT,
  seq               INT         NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claim_details_claim        ON expense_claim_details(claim_id);
CREATE INDEX IF NOT EXISTS idx_expense_claim_details_expense_type ON expense_claim_details(expense_type_id);

-- ── 4d. employee_advances ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_advances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_number        TEXT        NOT NULL UNIQUE,
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  posting_date          DATE        NOT NULL,
  purpose               TEXT        NOT NULL,
  advance_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  claimed_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  return_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  repay_from_salary     BOOLEAN     NOT NULL DEFAULT FALSE,
  status                TEXT        NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Unpaid', 'Paid', 'Claimed', 'Returned', 'Partly Claimed and Returned', 'Cancelled')),
  workflow_instance_id  UUID,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_advances_employee ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_advances_status   ON employee_advances(status);

-- ── 4e. expense_claim_advances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_claim_advances (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          UUID        NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  advance_id        UUID        NOT NULL REFERENCES employee_advances(id) ON DELETE RESTRICT,
  allocated_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  unclaimed_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_claim_advances_claim   ON expense_claim_advances(claim_id);
CREATE INDEX IF NOT EXISTS idx_expense_claim_advances_advance ON expense_claim_advances(advance_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — FK BACK-REFERENCES (deferred to avoid forward-reference issues)
-- ═══════════════════════════════════════════════════════════════════════════════

-- employees.holiday_list_id → holiday_lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_employees_holiday_list'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT fk_employees_holiday_list
      FOREIGN KEY (holiday_list_id) REFERENCES holiday_lists(id) ON DELETE SET NULL;
  END IF;
END $$;

-- employee_attendance.shift_type_id → shift_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_attendance_shift_type'
  ) THEN
    ALTER TABLE employee_attendance
      ADD CONSTRAINT fk_attendance_shift_type
      FOREIGN KEY (shift_type_id) REFERENCES shift_types(id) ON DELETE SET NULL;
  END IF;
END $$;

-- employee_attendance.attendance_request_id → attendance_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_attendance_request_id'
  ) THEN
    ALTER TABLE employee_attendance
      ADD CONSTRAINT fk_attendance_request_id
      FOREIGN KEY (attendance_request_id) REFERENCES attendance_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Phase 1 migration complete
