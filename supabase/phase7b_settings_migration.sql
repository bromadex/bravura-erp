-- ============================================================
-- BRAVURA ERP — PHASE 7B SETTINGS MIGRATION
-- Benefits & Gratuity singleton settings table
-- Run after phase7b_migration.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS benefits_settings (
  id                               TEXT PRIMARY KEY DEFAULT 'singleton',
  max_benefit_amount               NUMERIC(12,2) NOT NULL DEFAULT 50000,
  currency                         TEXT NOT NULL DEFAULT 'USD',
  require_receipt                  BOOLEAN NOT NULL DEFAULT true,
  allow_claims_without_application BOOLEAN NOT NULL DEFAULT false,
  gratuity_minimum_years           NUMERIC(4,1) NOT NULL DEFAULT 1,
  gratuity_pay_with_payroll        BOOLEAN NOT NULL DEFAULT false,
  notify_on_application            BOOLEAN NOT NULL DEFAULT true,
  notify_on_claim_approval         BOOLEAN NOT NULL DEFAULT true,
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO benefits_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE benefits_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_benefits_settings" ON benefits_settings;
CREATE POLICY "allow_all_benefits_settings" ON benefits_settings FOR ALL USING (true) WITH CHECK (true);
