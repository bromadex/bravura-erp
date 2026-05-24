-- erp_u09_procurement_budgets_and_cross_module.sql
-- Phase 9 migrations: procurement_budgets table + cross-module columns
-- Creates the procurement_budgets table used by Budget vs Actual analytics.
-- Safe to re-run (IF NOT EXISTS everywhere).

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_budgets (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  department       TEXT NOT NULL,
  cost_center      TEXT,
  fiscal_year      INT  NOT NULL,
  -- period: 'annual' | 'Q1'..'Q4' | '2026-01'..'2026-12'
  period           TEXT NOT NULL,
  -- category: general | capex | opex | maintenance
  category         TEXT NOT NULL DEFAULT 'general',
  budget_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  alert_threshold  NUMERIC(5,2)  NOT NULL DEFAULT 80,  -- alert when spend % > this
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department, fiscal_year, period, category)
);

CREATE INDEX IF NOT EXISTS idx_budget_dept_year
  ON procurement_budgets(department, fiscal_year);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE procurement_budgets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'procurement_budgets'
      AND policyname = 'allow_all_procurement_budgets'
  ) THEN
    CREATE POLICY "allow_all_procurement_budgets"
      ON procurement_budgets FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. Seed demo budgets for 2026 ─────────────────────────────────────────────
INSERT INTO procurement_budgets
  (id, department, cost_center, fiscal_year, period, category, budget_amount, alert_threshold, notes)
SELECT
  gen_random_uuid()::text, dept, cc, 2026, 'annual', cat, amt, 80, note
FROM (VALUES
  ('Operations',       'OPS-001', 'opex',        450000, 'Annual operational supplies & consumables'),
  ('Maintenance',      'MNT-001', 'maintenance',  320000, 'Fleet and equipment maintenance budget'),
  ('IT',               'IT-001',  'capex',         80000, 'IT equipment and software licences'),
  ('Administration',   'ADM-001', 'opex',          60000, 'Office supplies and admin expenses'),
  ('Safety & Health',  'SHE-001', 'opex',          45000, 'PPE, safety equipment, training'),
  ('Human Resources',  'HR-001',  'opex',          30000, 'HR-related procurement'),
  ('Finance',          'FIN-001', 'opex',          25000, 'Finance department procurement')
) AS t(dept, cc, cat, amt, note)
WHERE NOT EXISTS (SELECT 1 FROM procurement_budgets WHERE fiscal_year = 2026 LIMIT 1);

-- Quarterly breakdown for Operations
INSERT INTO procurement_budgets
  (id, department, cost_center, fiscal_year, period, category, budget_amount, alert_threshold)
SELECT
  gen_random_uuid()::text, 'Operations', 'OPS-001', 2026, qtr, 'opex', 112500, 80
FROM (VALUES ('Q1'),('Q2'),('Q3'),('Q4')) AS q(qtr)
WHERE NOT EXISTS (
  SELECT 1 FROM procurement_budgets
  WHERE department = 'Operations' AND fiscal_year = 2026 AND period = 'Q1'
);

-- ── 4. Cross-Module: store_requisitions additions ─────────────────────────────
-- Adds optional columns used by the Campsite → Procurement integration.
ALTER TABLE store_requisitions
  ADD COLUMN IF NOT EXISTS required_date DATE,
  ADD COLUMN IF NOT EXISTS priority      TEXT NOT NULL DEFAULT 'normal';

-- ── 5. Cross-Module: maintenance_work_orders additions ───────────────────────
-- Adds parts_used JSONB column so CloseWOModal can persist inventory-linked parts.
ALTER TABLE maintenance_work_orders
  ADD COLUMN IF NOT EXISTS parts_used JSONB;

CREATE INDEX IF NOT EXISTS idx_wo_parts_used
  ON maintenance_work_orders USING gin(parts_used)
  WHERE parts_used IS NOT NULL;

