-- supabase/migrations/procurement_enhancements.sql
-- Full ERPNext-standard procurement schema additions.
-- Run in Supabase SQL editor.

-- ── 1. Request for Quotation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rfq_number           TEXT UNIQUE NOT NULL,
  pr_id                TEXT,
  title                TEXT NOT NULL,
  description          TEXT,
  deadline             DATE NOT NULL,
  status               TEXT NOT NULL DEFAULT 'Open', -- Open | Closed | Cancelled
  items                JSONB NOT NULL DEFAULT '[]',
  department           TEXT,
  created_by           TEXT,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfq_status ON rfq(status);
CREATE INDEX IF NOT EXISTS idx_rfq_pr     ON rfq(pr_id);
-- Add column if table already exists in live DB
ALTER TABLE rfq ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ── 2. Supplier Quotations (responses to RFQ) ──────────────────────────
CREATE TABLE IF NOT EXISTS rfq_quotations (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rfq_id          TEXT NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  supplier_id     TEXT,
  supplier_name   TEXT NOT NULL,
  submitted_date  DATE,
  valid_until     DATE,
  delivery_days   INT,
  payment_terms   TEXT,
  currency        TEXT NOT NULL DEFAULT 'USD',
  items           JSONB NOT NULL DEFAULT '[]', -- [{name,qty,unit,unit_price,total,notes}]
  total_amount    NUMERIC NOT NULL DEFAULT 0,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'Received', -- Received | Selected | Rejected
  selected_reason TEXT,
  rejected_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfq_quot_rfq ON rfq_quotations(rfq_id);

-- ── 3. Purchase Invoices (Accounts Payable) ────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pi_number         TEXT UNIQUE NOT NULL,   -- our internal PI number
  invoice_number    TEXT,                   -- supplier's invoice number
  po_id             TEXT,
  grn_id            TEXT,
  supplier_id       TEXT,
  supplier_name     TEXT NOT NULL,
  invoice_date      DATE NOT NULL,
  due_date          DATE NOT NULL,
  payment_terms     TEXT,
  items             JSONB NOT NULL DEFAULT '[]', -- [{name,qty,unit_price,total,tax_rate}]
  subtotal          NUMERIC NOT NULL DEFAULT 0,
  tax_amount        NUMERIC NOT NULL DEFAULT 0,
  total_amount      NUMERIC NOT NULL DEFAULT 0,
  paid_amount       NUMERIC NOT NULL DEFAULT 0,
  outstanding       NUMERIC GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  status            TEXT NOT NULL DEFAULT 'Draft',
  -- Draft | Posted | Partially Paid | Paid | Overdue | Disputed | Cancelled
  payment_reference TEXT,
  payment_date      DATE,
  payment_method    TEXT,   -- Cash | Bank Transfer | Cheque
  three_way_matched BOOLEAN NOT NULL DEFAULT FALSE,
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pi_status   ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_pi_supplier ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pi_due_date ON purchase_invoices(due_date);

-- ── 4. Department / Cost-Center Budgets ───────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_budgets (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  department       TEXT NOT NULL,
  cost_center      TEXT,
  fiscal_year      INT  NOT NULL,
  period           TEXT NOT NULL,   -- 'annual' | 'Q1'..'Q4' | '2026-01'..'2026-12'
  category         TEXT NOT NULL DEFAULT 'general', -- general | capex | opex | maintenance
  budget_amount    NUMERIC NOT NULL DEFAULT 0,
  alert_threshold  NUMERIC NOT NULL DEFAULT 80,  -- alert when spent % > this
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department, fiscal_year, period, category)
);
CREATE INDEX IF NOT EXISTS idx_budget_dept ON procurement_budgets(department, fiscal_year);

-- ── 5. Supplier Performance Log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_performance_log (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id         TEXT NOT NULL,
  supplier_name       TEXT NOT NULL,
  po_id               TEXT,
  grn_id              TEXT,
  pi_id               TEXT,
  event_type          TEXT NOT NULL,
  -- delivery_on_time | delivery_late | item_rejected | price_variance |
  -- quality_issue | payment_dispute | partial_delivery
  event_date          DATE NOT NULL,
  expected_date       DATE,
  actual_date         DATE,
  delay_days          INT,
  ordered_qty         NUMERIC,
  received_qty        NUMERIC,
  rejected_qty        NUMERIC,
  rejection_reason    TEXT,
  po_unit_price       NUMERIC,
  invoice_unit_price  NUMERIC,
  price_variance_pct  NUMERIC,
  quality_score       INT CHECK (quality_score BETWEEN 1 AND 5),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spl_supplier ON supplier_performance_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spl_event    ON supplier_performance_log(event_type);

-- ── 6. Enhance existing tables ────────────────────────────────────────

-- Add actual_delivery_date to purchase_orders (track delivery vs expected)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS rfq_id             TEXT,
  ADD COLUMN IF NOT EXISTS quotation_id       TEXT,
  ADD COLUMN IF NOT EXISTS budget_code        TEXT,
  ADD COLUMN IF NOT EXISTS department         TEXT,
  ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS finance_approved   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS finance_approver   TEXT,
  ADD COLUMN IF NOT EXISTS finance_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add fields to goods_received
ALTER TABLE goods_received
  ADD COLUMN IF NOT EXISTS pi_id             TEXT,
  ADD COLUMN IF NOT EXISTS actual_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS quality_score     INT,
  ADD COLUMN IF NOT EXISTS rejected_items    JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS supplier_id       TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name     TEXT,
  ADD COLUMN IF NOT EXISTS total_value       NUMERIC DEFAULT 0;

-- Add fulfilment tracking columns to store_requisitions
ALTER TABLE store_requisitions
  ADD COLUMN IF NOT EXISTS issued_by      TEXT,
  ADD COLUMN IF NOT EXISTS issued_by_id   TEXT,
  ADD COLUMN IF NOT EXISTS issued_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issued_items   JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS not_issued     JSONB DEFAULT '[]';

-- Add source link + approval fields to purchase_requisitions (if not already present)
ALTER TABLE purchase_requisitions
  ADD COLUMN IF NOT EXISTS source_req_id  TEXT,
  ADD COLUMN IF NOT EXISTS approver_id    TEXT,
  ADD COLUMN IF NOT EXISTS approver_name  TEXT,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add performance fields to suppliers
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS tax_id            TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms     TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS lead_time_days    INT DEFAULT 14,
  ADD COLUMN IF NOT EXISTS credit_limit      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account      TEXT,
  ADD COLUMN IF NOT EXISTS rating            NUMERIC DEFAULT 0,  -- 0–5
  ADD COLUMN IF NOT EXISTS on_time_pct       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score_avg NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_pos         INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_preferred      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blacklisted       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS blacklist_reason  TEXT;
