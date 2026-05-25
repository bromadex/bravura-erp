-- erp_u16_payroll_compliance.sql
-- Phase 17 Zimbabwe Payroll Compliance II additions.
-- Safe to re-run (IF NOT EXISTS / ALTER TABLE ... ADD COLUMN IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════
-- 1. WHT ON SUPPLIER PAYMENTS
--    Add WHT fields to payment_vouchers table
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS wht_applicable  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wht_type        TEXT,           -- 'Services 10%' | 'Contractors 15%'
  ADD COLUMN IF NOT EXISTS wht_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- percentage
  ADD COLUMN IF NOT EXISTS wht_amount      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- computed: gross × rate/100
  ADD COLUMN IF NOT EXISTS gross_amount    NUMERIC(15,4) NOT NULL DEFAULT 0,   -- pre-WHT amount
  ADD COLUMN IF NOT EXISTS net_payment     NUMERIC(15,4) NOT NULL DEFAULT 0;   -- gross - wht_amount

-- Index for WHT return queries
CREATE INDEX IF NOT EXISTS idx_pv_wht_applicable ON payment_vouchers (wht_applicable);
CREATE INDEX IF NOT EXISTS idx_pv_payment_date   ON payment_vouchers (payment_date);

-- ═══════════════════════════════════════════════════════════════════
-- 2. PAYROLL PERIOD CURRENCY
--    Support ZiG-denominated payroll runs
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC(10,6) NOT NULL DEFAULT 1.0000;
  -- exchange_rate: if currency = 'ZiG', rate is ZiG/USD for reporting conversion

-- ═══════════════════════════════════════════════════════════════════
-- 3. EMPLOYEE PENSION / PROVIDENT FUND
--    Voluntary defined-contribution pension deductions
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pension_fund          TEXT,               -- e.g. 'POSB', 'Old Mutual', 'ZIMNAT', 'LAPF'
  ADD COLUMN IF NOT EXISTS employee_pension_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,  -- % of gross (employee contribution)
  ADD COLUMN IF NOT EXISTS employer_pension_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,  -- % of gross (employer contribution)
  ADD COLUMN IF NOT EXISTS pension_fixed_amount  NUMERIC(15,4) NOT NULL DEFAULT 0; -- fixed monthly amount alternative

-- ═══════════════════════════════════════════════════════════════════
-- 4. PAYROLL RECORDS — PENSION & CURRENCY
--    Track pension deduction per payroll record
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS pension_deduction     NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_pension      NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency              TEXT NOT NULL DEFAULT 'USD';

-- ═══════════════════════════════════════════════════════════════════
-- 5. NATIONAL ID ON EMPLOYEES (required for ITF16)
--    Employees need national ID / passport for ZIMRA tax certificates
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS national_id    TEXT,   -- Zimbabwe national ID (e.g. 63-123456X01)
  ADD COLUMN IF NOT EXISTS tin_number     TEXT,   -- ZIMRA Tax Identification Number (TIN)
  ADD COLUMN IF NOT EXISTS bp_number      TEXT;   -- ZIMRA Business Partner number

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_emp_national_id ON employees (national_id);
CREATE INDEX IF NOT EXISTS idx_emp_tin         ON employees (tin_number);
