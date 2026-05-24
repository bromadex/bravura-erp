-- erp_u13_zimbabwe_localisation.sql
-- Switch base currency to USD (Zimbabwe context).
-- Seed ZAR, BWP, ZiG exchange rates.
-- Seed ZIMRA-compliant tax templates.
-- Safe to re-run (ON CONFLICT DO NOTHING / DO UPDATE).

-- ═══════════════════════════════════════════════════════════════════
-- 1. CLEAR OLD ZMW RATES (Zambian Kwacha no longer applicable)
-- ═══════════════════════════════════════════════════════════════════
DELETE FROM currency_rates WHERE currency_code = 'ZMW';

-- ═══════════════════════════════════════════════════════════════════
-- 2. SEED ZIMBABWE-RELEVANT EXCHANGE RATES
--    Base = USD.  rate_to_base = "1 FCY = X USD"
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO currency_rates
  (id, currency_code, currency_name, rate_to_base, effective_date, source, notes, is_active, created_at, updated_at)
VALUES
  -- South African Rand (major cross-border trade currency)
  (gen_random_uuid()::text, 'ZAR', 'South African Rand',    0.0545, CURRENT_DATE, 'manual',
   '1 ZAR ≈ 0.055 USD (approx. 18.35 ZAR/USD as at May 2026)', true, now(), now()),

  -- Botswana Pula (used in cross-border with Botswana)
  (gen_random_uuid()::text, 'BWP', 'Botswana Pula',         0.0726, CURRENT_DATE, 'manual',
   '1 BWP ≈ 0.073 USD (approx. 13.77 BWP/USD as at May 2026)', true, now(), now()),

  -- Zimbabwe Gold (ZiG) — new structured currency introduced April 2024
  (gen_random_uuid()::text, 'ZiG', 'Zimbabwe Gold',         0.0357, CURRENT_DATE, 'manual',
   '1 ZiG ≈ 0.036 USD (approx. 28 ZiG/USD as at May 2026)', true, now(), now()),

  -- Euro
  (gen_random_uuid()::text, 'EUR', 'Euro',                  1.0820, CURRENT_DATE, 'manual',
   '1 EUR ≈ 1.082 USD (May 2026)', true, now(), now()),

  -- British Pound
  (gen_random_uuid()::text, 'GBP', 'British Pound Sterling',1.2650, CURRENT_DATE, 'manual',
   '1 GBP ≈ 1.265 USD (May 2026)', true, now(), now()),

  -- Chinese Yuan (China is Zimbabwe''s major trading partner)
  (gen_random_uuid()::text, 'CNY', 'Chinese Yuan',          0.1380, CURRENT_DATE, 'manual',
   '1 CNY ≈ 0.138 USD (May 2026)', true, now(), now()),

  -- UAE Dirham (freight & imports from UAE)
  (gen_random_uuid()::text, 'AED', 'UAE Dirham',            0.2723, CURRENT_DATE, 'manual',
   '1 AED ≈ 0.272 USD (May 2026)', true, now(), now())

ON CONFLICT (currency_code, effective_date) DO UPDATE
  SET rate_to_base = EXCLUDED.rate_to_base,
      currency_name = EXCLUDED.currency_name,
      notes = EXCLUDED.notes,
      updated_at = now();

-- ═══════════════════════════════════════════════════════════════════
-- 3. ZIMRA TAX TEMPLATES
--    Zimbabwe Revenue Authority (ZIMRA) — VAT Act Chapter 23:12
-- ═══════════════════════════════════════════════════════════════════

-- Template 1: Standard VAT 15% (most goods and services)
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA Standard VAT 15%',
  'Both',
  true,
  true,
  'Zimbabwe VAT at 15% standard rate — applicable to most goods and services (VAT Act Chapter 23:12)'
)
ON CONFLICT (name) DO UPDATE
  SET is_default = true, is_active = true,
      description = EXCLUDED.description;

-- Template 2: VAT Zero-Rated (exports, basic food items)
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA Zero-Rated VAT 0%',
  'Both',
  false,
  true,
  'Zero-rated VAT — exports, basic food items, agricultural inputs, prescribed drugs (VAT Act Sec 11)'
)
ON CONFLICT (name) DO NOTHING;

-- Template 3: VAT Exempt (financial services, land, education)
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA VAT Exempt',
  'Both',
  false,
  true,
  'VAT exempt supplies — financial services, residential land, medical services, educational services'
)
ON CONFLICT (name) DO NOTHING;

-- Template 4: WHT on Services 10% (professional services rendered by non-residents)
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA WHT Services 10%',
  'Purchase',
  false,
  true,
  'Withholding Tax 10% on professional/management services — deducted at source (ITA Chapter 23:06)'
)
ON CONFLICT (name) DO NOTHING;

-- Template 5: WHT on Contractors 15%
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA WHT Contractors 15%',
  'Purchase',
  false,
  true,
  'Withholding Tax 15% on payments to contractors/sub-contractors (ITA Chapter 23:06, 3rd Schedule)'
)
ON CONFLICT (name) DO NOTHING;

-- Template 6: VAT 15% + WHT 10% (combined for professional services with VAT)
INSERT INTO tax_templates (id, name, template_type, is_default, is_active, description)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA VAT 15% + WHT 10%',
  'Purchase',
  false,
  true,
  'VAT 15% on invoice + WHT 10% withheld at payment — for VAT-registered professional service providers'
)
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 4. SEED TAX TEMPLATE LINES
--    Insert lines for the templates above.
--    We reference templates by name subquery (idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- Lines for "ZIMRA Standard VAT 15%"
INSERT INTO tax_template_lines
  (id, template_id, sort_order, charge_type, description, account_head, rate, tax_amount, included_in_price, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  1,
  'On Net Total',
  'VAT 15% — ZIMRA Standard Rate',
  'VAT Output (15%)',
  15.00,
  NULL,
  false,
  true
FROM tax_templates t
WHERE t.name = 'ZIMRA Standard VAT 15%'
  AND NOT EXISTS (
    SELECT 1 FROM tax_template_lines l
    WHERE l.template_id = t.id AND l.description = 'VAT 15% — ZIMRA Standard Rate'
  );

-- Lines for "ZIMRA WHT Services 10%"
INSERT INTO tax_template_lines
  (id, template_id, sort_order, charge_type, description, account_head, rate, tax_amount, included_in_price, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  1,
  'On Net Total',
  'WHT 10% — Professional Services (deduct at source)',
  'WHT Payable (10%)',
  10.00,
  NULL,
  false,
  true
FROM tax_templates t
WHERE t.name = 'ZIMRA WHT Services 10%'
  AND NOT EXISTS (
    SELECT 1 FROM tax_template_lines l
    WHERE l.template_id = t.id AND l.description = 'WHT 10% — Professional Services (deduct at source)'
  );

-- Lines for "ZIMRA WHT Contractors 15%"
INSERT INTO tax_template_lines
  (id, template_id, sort_order, charge_type, description, account_head, rate, tax_amount, included_in_price, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  1,
  'On Net Total',
  'WHT 15% — Contractors/Sub-contractors (deduct at source)',
  'WHT Payable (15%)',
  15.00,
  NULL,
  false,
  true
FROM tax_templates t
WHERE t.name = 'ZIMRA WHT Contractors 15%'
  AND NOT EXISTS (
    SELECT 1 FROM tax_template_lines l
    WHERE l.template_id = t.id AND l.description = 'WHT 15% — Contractors/Sub-contractors (deduct at source)'
  );

-- Lines for "ZIMRA VAT 15% + WHT 10%" (two lines)
INSERT INTO tax_template_lines
  (id, template_id, sort_order, charge_type, description, account_head, rate, tax_amount, included_in_price, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  1,
  'On Net Total',
  'VAT 15% — ZIMRA Standard Rate',
  'VAT Output (15%)',
  15.00,
  NULL,
  false,
  true
FROM tax_templates t
WHERE t.name = 'ZIMRA VAT 15% + WHT 10%'
  AND NOT EXISTS (
    SELECT 1 FROM tax_template_lines l
    WHERE l.template_id = t.id AND l.sort_order = 1
  );

INSERT INTO tax_template_lines
  (id, template_id, sort_order, charge_type, description, account_head, rate, tax_amount, included_in_price, is_active)
SELECT
  gen_random_uuid()::text,
  t.id,
  2,
  'On Net Total',
  'WHT 10% — Withheld at payment',
  'WHT Payable (10%)',
  10.00,
  NULL,
  false,
  true
FROM tax_templates t
WHERE t.name = 'ZIMRA VAT 15% + WHT 10%'
  AND NOT EXISTS (
    SELECT 1 FROM tax_template_lines l
    WHERE l.template_id = t.id AND l.sort_order = 2
  );

-- ═══════════════════════════════════════════════════════════════════
-- 5. UPDATE NUMBERING SERIES PREFIX (optional — use ZW prefix)
-- ═══════════════════════════════════════════════════════════════════
-- No changes needed — series keys are internal and prefix is configurable
-- per organisation in the Numbering Series UI.

-- Done. Run this once against your Supabase project.
