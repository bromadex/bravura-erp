-- erp_u17_vat_imtt.sql
-- Phase 18: IMTT fields on payment_vouchers + ZIMRA VAT Return period tracking
-- Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════
-- 1. IMTT FIELDS ON PAYMENT VOUCHERS
--    Intermediated Money Transfer Tax (Zimbabwe) — 2% on electronic transfers
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS imtt_applicable  BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imtt_amount      NUMERIC(15,4) NOT NULL DEFAULT 0;
  -- imtt_amount = total_amount * 0.02 when applicable

-- ═══════════════════════════════════════════════════════════════════
-- 2. VAT RETURN PERIODS
--    Track monthly VAT return submissions
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vat_return_periods (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  period_label    TEXT NOT NULL,         -- e.g. 'January 2025'
  from_date       DATE NOT NULL,
  to_date         DATE NOT NULL,
  output_vat_manual NUMERIC(15,4) NOT NULL DEFAULT 0,  -- manually entered output VAT
  output_vat_notes TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft','Submitted','Assessed')),
  submitted_at    TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_label)
);

CREATE INDEX IF NOT EXISTS idx_vat_periods_dates ON vat_return_periods(from_date, to_date);

-- RLS
ALTER TABLE vat_return_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_vat_return_periods" ON vat_return_periods;
CREATE POLICY "auth_vat_return_periods"
  ON vat_return_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Numbering for WHT certificates
INSERT INTO numbering_series (entity, prefix, padding, description)
VALUES ('wht_certificates', 'WHT002-', 4, 'WHT Certificates (ZIMRA Form WHT002)')
ON CONFLICT (entity) DO NOTHING;
