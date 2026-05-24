-- erp_u14_zimra_paye_brackets.sql
-- Seed ZIMRA 2024/2025 Tax Year and Monthly USD PAYE brackets.
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- Source: ZIMRA Finance Act 2024 (Chapter 23:06) — USD brackets effective 01 Jan 2024.

-- ═══════════════════════════════════════════════════════════════════
-- 1. TAX YEAR 2024/2025
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO tax_years
  (id, year_label, start_date, end_date, country, status, is_default, notes, created_by)
VALUES (
  gen_random_uuid()::text,
  'ZIMRA 2024/2025',
  '2024-01-01',
  '2025-12-31',
  'Zimbabwe',
  'Active',
  true,
  'ZIMRA Finance Act 2024 — USD PAYE progressive brackets. Source: ZIMRA efiling portal.',
  'system'
)
ON CONFLICT (year_label) DO UPDATE
  SET status     = 'Active',
      is_default = true,
      notes      = EXCLUDED.notes;

-- ═══════════════════════════════════════════════════════════════════
-- 2. MONTHLY PAYE BRACKETS (USD) — applies_to = 'monthly'
--    Based on ZIMRA Finance Act Chapter 23:06
--
--    Monthly Taxable Income  │  Rate
--    ────────────────────────┼───────
--    $0.00   – $100.00       │    0%
--    $100.01 – $300.00       │   20%
--    $300.01 – $1,000.00     │   25%
--    $1,000.01 – $2,000.00   │   30%
--    $2,000.01 – $5,000.00   │   35%
--    Over $5,000.00          │   40%
--
--    Note: slab_to NULL means "and above" (no upper limit).
-- ═══════════════════════════════════════════════════════════════════

-- Delete existing slabs for this tax year to allow re-seed
DELETE FROM income_tax_slabs
WHERE tax_year_id = (
  SELECT id FROM tax_years WHERE year_label = 'ZIMRA 2024/2025' LIMIT 1
);

INSERT INTO income_tax_slabs
  (id, tax_year_id, slab_from, slab_to, rate_pct, fixed_amount, currency, applies_to, sort_order)
SELECT
  gen_random_uuid()::text,
  ty.id,
  v.slab_from,
  v.slab_to,
  v.rate_pct,
  0,
  'USD',
  'monthly',
  v.sort_order
FROM tax_years ty
CROSS JOIN (VALUES
  (0,       100,     0.00,  1),
  (100,     300,     20.00, 2),
  (300,     1000,    25.00, 3),
  (1000,    2000,    30.00, 4),
  (2000,    5000,    35.00, 5),
  (5000,    NULL,    40.00, 6)
) AS v(slab_from, slab_to, rate_pct, sort_order)
WHERE ty.year_label = 'ZIMRA 2024/2025';

-- ═══════════════════════════════════════════════════════════════════
-- 3. NSSA CONTRIBUTION RATES (informational — handled in JS)
--    Employee:  3% of gross, max insurable earnings = $600/month → max $18.00/month
--    Employer:  3.5% of gross, max insurable earnings = $700/month → max $24.50/month
--    Source: NSSA Act Chapter 17:04, SI 393 of 1993 (as amended)
-- ═══════════════════════════════════════════════════════════════════
-- No table change needed — handled in Payroll.jsx calcPAYEProgressive + NSSA cap logic.

-- ═══════════════════════════════════════════════════════════════════
-- 4. AIDS LEVY
--    3% of PAYE — per Finance Act Chapter 23:06
--    Collected together with PAYE and remitted to ZIMRA on Form P6
-- ═══════════════════════════════════════════════════════════════════
-- No table change needed — handled in Payroll.jsx (aids_levy = paye * 0.03)

-- Done. Run once against your Supabase project.
-- After running, verify in Settings → Tax Years that "ZIMRA 2024/2025" is Active and Default.
