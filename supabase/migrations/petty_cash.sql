-- supabase/migrations/petty_cash.sql
-- Petty Cash Management module schema
-- Run in Supabase SQL editor.

-- ── Petty Cash Funds ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_funds (
  id                TEXT PRIMARY KEY,
  pcf_code          TEXT UNIQUE NOT NULL,
  custodian_id      TEXT,
  custodian_name    TEXT NOT NULL,
  project           TEXT,
  department        TEXT,
  opening_balance   NUMERIC DEFAULT 0,
  current_balance   NUMERIC DEFAULT 0,
  currency          TEXT DEFAULT 'USD',
  status            TEXT DEFAULT 'active',   -- active | suspended | closed
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Petty Cash Top-ups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_topups (
  id                TEXT PRIMARY KEY,
  pct_code          TEXT UNIQUE NOT NULL,
  fund_id           TEXT REFERENCES petty_cash_funds(id) ON DELETE CASCADE,
  amount            NUMERIC NOT NULL,
  date              DATE NOT NULL,
  reference         TEXT,
  notes             TEXT,
  posted_by         TEXT,
  journal_entry_ref TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Petty Cash Transactions (Expenses) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id                    TEXT PRIMARY KEY,
  pce_code              TEXT UNIQUE NOT NULL,
  fund_id               TEXT REFERENCES petty_cash_funds(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  supplier              TEXT,
  category              TEXT NOT NULL,
  purpose               TEXT NOT NULL,
  amount                NUMERIC NOT NULL DEFAULT 0,
  has_receipt           BOOLEAN DEFAULT true,
  attachment_url        TEXT,
  status                TEXT DEFAULT 'draft',  -- draft | submitted | approved | rejected | cancelled
  workflow_instance_id  TEXT,
  rejection_reason      TEXT,
  journal_entry_ref     TEXT,
  reconciliation_id     TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pct_fund_id ON petty_cash_transactions(fund_id);
CREATE INDEX IF NOT EXISTS idx_pct_date    ON petty_cash_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_pct_status  ON petty_cash_transactions(status);

-- ── Petty Cash Receipt Lines ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_receipt_lines (
  id               TEXT PRIMARY KEY,
  transaction_id   TEXT REFERENCES petty_cash_transactions(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  qty              NUMERIC DEFAULT 1,
  unit_price       NUMERIC DEFAULT 0,
  total            NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Petty Cash Exceptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_exceptions (
  id               TEXT PRIMARY KEY,
  transaction_id   TEXT REFERENCES petty_cash_transactions(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  explanation      TEXT NOT NULL,
  approver_name    TEXT,
  approver_id      TEXT,
  acknowledged     BOOLEAN DEFAULT false,
  acknowledged_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Petty Cash Reconciliations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_reconciliations (
  id                   TEXT PRIMARY KEY,
  pcr_code             TEXT UNIQUE NOT NULL,
  fund_id              TEXT REFERENCES petty_cash_funds(id),
  period_start         DATE NOT NULL,
  period_end           DATE NOT NULL,
  opening_balance      NUMERIC DEFAULT 0,
  topups               NUMERIC DEFAULT 0,
  total_expenses       NUMERIC DEFAULT 0,
  expected_closing     NUMERIC DEFAULT 0,
  actual_cash          NUMERIC DEFAULT 0,
  variance             NUMERIC DEFAULT 0,
  variance_pct         NUMERIC DEFAULT 0,
  status               TEXT DEFAULT 'draft',  -- draft | submitted | pending | approved | rejected
  workflow_instance_id TEXT,
  rejection_reason     TEXT,
  notes                TEXT,
  journal_entry_ref    TEXT,
  submitted_by         TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcr_fund_id ON petty_cash_reconciliations(fund_id);
CREATE INDEX IF NOT EXISTS idx_pcr_date    ON petty_cash_reconciliations(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_status  ON petty_cash_reconciliations(status);

-- ── Txn-code sequence seeds ───────────────────────────────────────────────────
INSERT INTO code_sequences (prefix, year, last_number)
VALUES
  ('PCF', EXTRACT(YEAR FROM now())::int, 0),
  ('PCT', EXTRACT(YEAR FROM now())::int, 0),
  ('PCE', EXTRACT(YEAR FROM now())::int, 0),
  ('PCR', EXTRACT(YEAR FROM now())::int, 0)
ON CONFLICT (prefix, year) DO NOTHING;
