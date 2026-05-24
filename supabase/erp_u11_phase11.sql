-- erp_u11_phase11.sql
-- Phase 11: Multi-currency, Tax Engine UI tables, Blanket Orders, Putaway Rules
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT everywhere).

-- ═══════════════════════════════════════════════════════════════════════
-- 1. CURRENCY RATES TABLE
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS currency_rates (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  currency_code  TEXT NOT NULL,          -- ISO 4217: USD, ZAR, EUR, GBP, CNY, ZMW ...
  currency_name  TEXT NOT NULL,
  rate_to_base   NUMERIC(14,6) NOT NULL, -- 1 foreign unit = X base (ZMW)
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source         TEXT NOT NULL DEFAULT 'manual',  -- manual | api | import
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (currency_code, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cr_code   ON currency_rates (currency_code);
CREATE INDEX IF NOT EXISTS idx_cr_date   ON currency_rates (effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_cr_active ON currency_rates (is_active) WHERE is_active = TRUE;

-- RLS
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='currency_rates' AND policyname='allow_all_currency_rates') THEN
    CREATE POLICY "allow_all_currency_rates" ON currency_rates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed common currencies (ZMW rates as of mid-2025 approximate)
INSERT INTO currency_rates (id, currency_code, currency_name, rate_to_base, source, notes)
VALUES
  (gen_random_uuid()::text, 'USD', 'US Dollar',              27.50, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'ZAR', 'South African Rand',      1.48, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'EUR', 'Euro',                   30.10, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'GBP', 'British Pound',          35.20, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'CNY', 'Chinese Yuan',            3.82, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'AED', 'UAE Dirham',              7.49, 'manual', 'Approximate rate — update regularly'),
  (gen_random_uuid()::text, 'INR', 'Indian Rupee',            0.33, 'manual', 'Approximate rate — update regularly')
ON CONFLICT (currency_code, effective_date) DO NOTHING;

-- Add currency columns to purchase_orders and purchase_invoices if not already there
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'ZMW',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC(14,6) NOT NULL DEFAULT 1;

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'ZMW',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC(14,6) NOT NULL DEFAULT 1;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. BLANKET ORDERS / CONTRACTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS blanket_orders (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  bo_number        TEXT UNIQUE NOT NULL,

  -- Supplier
  supplier_id      TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name    TEXT NOT NULL,

  -- Contract period
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,

  -- Financial limits
  contract_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  consumed_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Optional item-level contract
  item_id          TEXT REFERENCES items(id),
  item_name        TEXT,
  unit             TEXT,
  contracted_qty   NUMERIC(15,4),
  consumed_qty     NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_rate        NUMERIC(15,4),

  -- Metadata
  department       TEXT,
  cost_center      TEXT,
  description      TEXT,
  terms            TEXT,
  docstatus        SMALLINT NOT NULL DEFAULT 0 CHECK (docstatus IN (0,1,2)),
  -- 0=Draft, 1=Active, 2=Cancelled
  status           TEXT NOT NULL DEFAULT 'Draft',
  -- Draft | Active | Exhausted | Expired | Cancelled
  currency         TEXT NOT NULL DEFAULT 'ZMW',

  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bo_supplier ON blanket_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_bo_status   ON blanket_orders (status);
CREATE INDEX IF NOT EXISTS idx_bo_dates    ON blanket_orders (start_date, end_date);

ALTER TABLE blanket_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blanket_orders' AND policyname='allow_all_blanket_orders') THEN
    CREATE POLICY "allow_all_blanket_orders" ON blanket_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Back-link on purchase_orders so we know which POs drew against which blanket order
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS blanket_order_id TEXT REFERENCES blanket_orders(id);

-- Numbering series entry for blanket orders
INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES ('blanket_orders', 'BO-', 4, 'Blanket Orders')
ON CONFLICT (series_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. PUTAWAY RULES
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS putaway_rules (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  priority         INT NOT NULL DEFAULT 10,     -- lower = evaluated first

  -- Conditions (at least one should be set; all set = AND logic)
  item_id          TEXT REFERENCES items(id),
  item_category    TEXT,
  supplier_id      TEXT REFERENCES suppliers(id),
  min_qty          NUMERIC(15,4),               -- trigger only if qty >= min_qty
  max_qty          NUMERIC(15,4),               -- trigger only if qty <= max_qty

  -- Action: target warehouse + optional location
  warehouse_id     TEXT NOT NULL REFERENCES warehouses(id),
  location_id      TEXT REFERENCES storage_locations(id),

  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_priority   ON putaway_rules (priority);
CREATE INDEX IF NOT EXISTS idx_pr_item       ON putaway_rules (item_id);
CREATE INDEX IF NOT EXISTS idx_pr_category   ON putaway_rules (item_category);
CREATE INDEX IF NOT EXISTS idx_pr_active     ON putaway_rules (is_active) WHERE is_active = TRUE;

ALTER TABLE putaway_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='putaway_rules' AND policyname='allow_all_putaway_rules') THEN
    CREATE POLICY "allow_all_putaway_rules" ON putaway_rules FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. TAX ENGINE — RLS on existing tables (schema already created)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE tax_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_template_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_templates' AND policyname='allow_all_tax_templates') THEN
    CREATE POLICY "allow_all_tax_templates" ON tax_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_template_lines' AND policyname='allow_all_tax_template_lines') THEN
    CREATE POLICY "allow_all_tax_template_lines" ON tax_template_lines FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
