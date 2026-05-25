-- erp_u18_bank_reconciliation.sql
-- Phase 19: Bank accounts + bank statement lines for bank reconciliation
-- Safe to re-run (IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════
-- 1. BANK ACCOUNTS (company bank accounts)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  account_name    TEXT NOT NULL,           -- e.g. 'FBC USD Operating Account'
  bank_name       TEXT NOT NULL,           -- e.g. 'FBC Bank'
  account_number  TEXT,                    -- masked: e.g. '****1234'
  currency        TEXT NOT NULL DEFAULT 'USD',
  gl_account_id   TEXT REFERENCES accounts(id),  -- linked GL account
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);

-- ═══════════════════════════════════════════════════════════════════
-- 2. BANK STATEMENT LINES (imported from bank CSV/manual entry)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  bank_account_id   TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,

  transaction_date  DATE NOT NULL,
  value_date        DATE,
  description       TEXT NOT NULL,          -- from bank statement
  reference         TEXT,                   -- bank reference number
  debit             NUMERIC(18,4) NOT NULL DEFAULT 0,   -- money out (from company's view)
  credit            NUMERIC(18,4) NOT NULL DEFAULT 0,   -- money in
  running_balance   NUMERIC(18,4),          -- statement balance after this line

  -- Matching
  match_status      TEXT NOT NULL DEFAULT 'unmatched'
                      CHECK (match_status IN ('unmatched','matched','partial','excluded')),
  matched_voucher_id    TEXT,               -- payment_voucher id if matched
  matched_journal_id    TEXT,               -- journal_entry id if matched
  match_notes           TEXT,

  -- Import tracking
  import_batch_id   TEXT,                   -- groups lines from one CSV import
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsl_account  ON bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bsl_date     ON bank_statement_lines(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bsl_match    ON bank_statement_lines(match_status);
CREATE INDEX IF NOT EXISTS idx_bsl_batch    ON bank_statement_lines(import_batch_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. RLS
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE bank_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_lines  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_bank_accounts"        ON bank_accounts;
DROP POLICY IF EXISTS "auth_bank_statement_lines" ON bank_statement_lines;

CREATE POLICY "auth_bank_accounts"
  ON bank_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_bank_statement_lines"
  ON bank_statement_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
