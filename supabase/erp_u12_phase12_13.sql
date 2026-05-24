-- erp_u12_phase12_13.sql
-- Phase 12: Integrity fixes schema additions
-- Phase 13: Inventory completeness — Item Variants UI, UOM Conversion, Reservations, Shortage, Expiry
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT everywhere).

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 12 — SCHEMA ADDITIONS
-- ═══════════════════════════════════════════════════════════════════════

-- 1. quality_inspections: stock_posted flag so we never double-post SLEs
ALTER TABLE quality_inspections
  ADD COLUMN IF NOT EXISTS stock_posted       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stock_posted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS item_id            TEXT REFERENCES items(id),
  ADD COLUMN IF NOT EXISTS warehouse_id       TEXT REFERENCES warehouses(id);

-- 2. GL config rows for invoice and payment_voucher events
-- (inventory_gl_config already exists from earlier migration)
INSERT INTO inventory_gl_config (id, event_type, description, is_active)
VALUES
  (gen_random_uuid()::text, 'purchase_invoice',  'Purchase Invoice: DR GRIR Clearing / CR Accounts Payable', true),
  (gen_random_uuid()::text, 'payment_voucher',   'Payment Voucher: DR Accounts Payable / CR Bank/Cash',     true)
ON CONFLICT (event_type) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 13 — UOM CONVERSION TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- 3. UOM Categories (Weight, Volume, Length, Quantity)
CREATE TABLE IF NOT EXISTS uom_categories (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE uom_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='uom_categories' AND policyname='allow_all_uom_categories') THEN
    CREATE POLICY "allow_all_uom_categories" ON uom_categories FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed standard categories
INSERT INTO uom_categories (id, name, description) VALUES
  (gen_random_uuid()::text, 'Weight',   'Mass units — kg, g, ton, lb'),
  (gen_random_uuid()::text, 'Volume',   'Volume units — L, mL, m³, gallon, drum'),
  (gen_random_uuid()::text, 'Length',   'Length units — m, cm, mm, ft, inch'),
  (gen_random_uuid()::text, 'Quantity', 'Count units — pcs, carton, box, dozen, pair, set'),
  (gen_random_uuid()::text, 'Area',     'Area units — m², ft²')
ON CONFLICT (name) DO NOTHING;

-- 4. UOM Conversion Rules
CREATE TABLE IF NOT EXISTS uom_conversions (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  from_uom     TEXT NOT NULL,             -- e.g. 'bag'
  to_uom       TEXT NOT NULL,             -- e.g. 'kg'
  factor       NUMERIC(15,6) NOT NULL,    -- 1 from_uom = factor × to_uom
  uom_category TEXT,                      -- link to uom_categories.name
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_uom, to_uom)
);

CREATE INDEX IF NOT EXISTS idx_uom_conv_from ON uom_conversions (from_uom);
CREATE INDEX IF NOT EXISTS idx_uom_conv_to   ON uom_conversions (to_uom);

ALTER TABLE uom_conversions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='uom_conversions' AND policyname='allow_all_uom_conversions') THEN
    CREATE POLICY "allow_all_uom_conversions" ON uom_conversions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed common conversions for mining/construction context
INSERT INTO uom_conversions (id, from_uom, to_uom, factor, uom_category, description) VALUES
  (gen_random_uuid()::text, 'bag',    'kg',   50,       'Weight',   '1 cement bag = 50 kg'),
  (gen_random_uuid()::text, 'ton',    'kg',   1000,     'Weight',   '1 metric ton = 1000 kg'),
  (gen_random_uuid()::text, 'lb',     'kg',   0.453592, 'Weight',   '1 pound = 0.4536 kg'),
  (gen_random_uuid()::text, 'drum',   'L',    200,      'Volume',   '1 drum = 200 litres'),
  (gen_random_uuid()::text, 'carton', 'pcs',  12,       'Quantity', '1 carton = 12 pieces'),
  (gen_random_uuid()::text, 'dozen',  'pcs',  12,       'Quantity', '1 dozen = 12 pieces'),
  (gen_random_uuid()::text, 'pair',   'pcs',  2,        'Quantity', '1 pair = 2 pieces'),
  (gen_random_uuid()::text, 'box',    'pcs',  100,      'Quantity', '1 box = 100 pieces (default)'),
  (gen_random_uuid()::text, 'roll',   'm',    50,       'Length',   '1 roll = 50 metres'),
  (gen_random_uuid()::text, 'ft',     'm',    0.3048,   'Length',   '1 foot = 0.3048 m'),
  (gen_random_uuid()::text, 'm3',     'L',    1000,     'Volume',   '1 m³ = 1000 litres'),
  (gen_random_uuid()::text, 'gallon', 'L',    3.785,    'Volume',   '1 US gallon = 3.785 litres')
ON CONFLICT (from_uom, to_uom) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 13 — RLS ON EXISTING TABLES (item_templates, item_variants)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE item_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='item_templates' AND policyname='allow_all_item_templates') THEN
    CREATE POLICY "allow_all_item_templates" ON item_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE item_variants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='item_variants' AND policyname='allow_all_item_variants') THEN
    CREATE POLICY "allow_all_item_variants" ON item_variants FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 13 — NUMBERING SERIES FOR NEW DOCUMENT TYPES
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES
  ('material_requests', 'MR-', 4, 'Material Requests')
ON CONFLICT (series_key) DO NOTHING;
