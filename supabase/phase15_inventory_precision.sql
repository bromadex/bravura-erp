-- ============================================================
-- Phase 15: Inventory Precision — Batch/Serial Tracking Tables
-- ============================================================

-- ── item_templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_templates (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT,
  unit                TEXT DEFAULT 'pcs',
  variant_attributes  TEXT[] DEFAULT '{}',
  has_variants        BOOLEAN DEFAULT TRUE,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── item_variants ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_variants (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_id TEXT NOT NULL REFERENCES item_templates(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES items(id),
  attributes  JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (template_id, item_id)
);

-- ── item_batches ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_batches (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  batch_no            TEXT NOT NULL,
  item_id             TEXT NOT NULL REFERENCES items(id),
  item_name           TEXT NOT NULL,
  supplier            TEXT,
  supplier_lot        TEXT,
  source_grn_id       TEXT,
  source_grn_number   TEXT,
  manufacturing_date  DATE,
  expiry_date         DATE,
  qty_received        NUMERIC(15,4) DEFAULT 0,
  qty_available       NUMERIC(15,4) DEFAULT 0,
  qty_consumed        NUMERIC(15,4) DEFAULT 0,
  warehouse_id        TEXT REFERENCES warehouses(id),
  status              TEXT DEFAULT 'Active',   -- Active, Exhausted, Expired, Quarantine
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (batch_no, item_id)
);

-- ── item_serials ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_serials (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  serial_no             TEXT UNIQUE NOT NULL,
  item_id               TEXT NOT NULL REFERENCES items(id),
  item_name             TEXT NOT NULL,
  warehouse_id          TEXT REFERENCES warehouses(id),
  status                TEXT DEFAULT 'In Stock',  -- In Stock, Issued, In Repair, Scrapped, Returned, Transferred
  source_grn_id         TEXT,
  source_grn_number     TEXT,
  issued_to             TEXT,
  issued_to_department  TEXT,
  issued_date           DATE,
  returned_date         DATE,
  warranty_expiry       DATE,
  purchase_date         DATE,
  purchase_rate         NUMERIC(15,4) DEFAULT 0,
  asset_code            TEXT,
  notes                 TEXT,
  history               JSONB DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── stock_reservations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_reservations (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  item_id           TEXT NOT NULL REFERENCES items(id),
  item_name         TEXT NOT NULL,
  warehouse_id      TEXT NOT NULL REFERENCES warehouses(id),
  reserved_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
  consumed_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
  available_reserved NUMERIC(15,4) GENERATED ALWAYS AS (reserved_qty - consumed_qty) STORED,
  voucher_type      TEXT NOT NULL,  -- 'Store Requisition', 'Material Request'
  voucher_no        TEXT NOT NULL,
  voucher_id        TEXT NOT NULL,
  reserved_by       TEXT,
  reserved_by_name  TEXT,
  status            TEXT DEFAULT 'Active',  -- Active, Partially Consumed, Consumed, Released
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── Alter existing tables ─────────────────────────────────────

-- items: batch/serial tracking flags + template link
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS has_serial_no    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_batch_no     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS item_template_id TEXT;

-- transactions: capture batch/serial on stock movements
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS batch_no    TEXT,
  ADD COLUMN IF NOT EXISTS serial_nos  TEXT[];

-- grn_lines: serial_nos array
ALTER TABLE grn_lines
  ADD COLUMN IF NOT EXISTS serial_nos TEXT[];

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_item_batches_item_id      ON item_batches (item_id);
CREATE INDEX IF NOT EXISTS idx_item_batches_status       ON item_batches (status);
CREATE INDEX IF NOT EXISTS idx_item_batches_expiry_date  ON item_batches (expiry_date);
CREATE INDEX IF NOT EXISTS idx_item_batches_warehouse_id ON item_batches (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_item_serials_item_id      ON item_serials (item_id);
CREATE INDEX IF NOT EXISTS idx_item_serials_status       ON item_serials (status);
CREATE INDEX IF NOT EXISTS idx_item_serials_warehouse_id ON item_serials (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_res_item_wh    ON stock_reservations (item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_res_status     ON stock_reservations (status);
CREATE INDEX IF NOT EXISTS idx_stock_res_voucher_id ON stock_reservations (voucher_id);

CREATE INDEX IF NOT EXISTS idx_item_variants_template_id ON item_variants (template_id);
CREATE INDEX IF NOT EXISTS idx_item_variants_item_id     ON item_variants (item_id);

-- ── DB function: fn_get_available_qty ────────────────────────
CREATE OR REPLACE FUNCTION fn_get_available_qty(p_item_id TEXT, p_warehouse_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_actual   NUMERIC := 0;
  v_reserved NUMERIC := 0;
BEGIN
  SELECT COALESCE(actual_qty, 0) INTO v_actual
  FROM bins WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id;

  SELECT COALESCE(SUM(reserved_qty - consumed_qty), 0) INTO v_reserved
  FROM stock_reservations
  WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id AND status = 'Active';

  RETURN GREATEST(v_actual - v_reserved, 0);
END;
$$ LANGUAGE plpgsql;

-- ── Trigger: auto-expire batches past expiry_date ─────────────
CREATE OR REPLACE FUNCTION fn_check_batch_expiry() RETURNS trigger AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL AND NEW.expiry_date < CURRENT_DATE AND NEW.status = 'Active' THEN
    NEW.status := 'Expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_batch_expiry ON item_batches;
CREATE TRIGGER trg_batch_expiry
  BEFORE INSERT OR UPDATE ON item_batches
  FOR EACH ROW EXECUTE FUNCTION fn_check_batch_expiry();

-- ── DB function: fn_increment_bin_reserved ────────────────────
-- Safely increments/decrements bins.reserved_qty without going below 0
CREATE OR REPLACE FUNCTION fn_increment_bin_reserved(
  p_item_id      TEXT,
  p_warehouse_id TEXT,
  p_qty_delta    NUMERIC
) RETURNS void AS $$
BEGIN
  UPDATE bins
     SET reserved_qty = GREATEST(COALESCE(reserved_qty, 0) + p_qty_delta, 0),
         updated_at   = now()
   WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id;
END;
$$ LANGUAGE plpgsql;
