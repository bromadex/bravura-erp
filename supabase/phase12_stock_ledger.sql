-- ============================================================
-- Phase 12: ERPNext-Style Stock Ledger, Warehouses & Material Requests
-- ============================================================
-- Run in Supabase SQL Editor (in order).
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards).
-- ============================================================

-- ── 1. WAREHOUSES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'stores'
              CHECK (type IN ('stores','transit','rejected','wip','finished_goods','virtual')),
  parent_id   TEXT REFERENCES warehouses(id),
  is_group    BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default warehouse — all existing stock lives here
INSERT INTO warehouses (id, code, name, type, description)
VALUES ('wh_main_store', 'MAIN', 'Main Store', 'stores', 'Default warehouse for all existing stock')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, code, name, type, description)
VALUES ('wh_rejected', 'REJ', 'Rejected / Quarantine', 'rejected', 'Holds rejected or quarantined goods')
ON CONFLICT (id) DO NOTHING;

INSERT INTO warehouses (id, code, name, type, description)
VALUES ('wh_transit', 'TRANSIT', 'In Transit', 'transit', 'Stock currently in transit between locations')
ON CONFLICT (id) DO NOTHING;

-- ── 2. ITEM MASTER ENHANCEMENTS ───────────────────────────────

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS valuation_method TEXT DEFAULT 'Moving Average'
    CHECK (valuation_method IN ('FIFO', 'Moving Average')),
  ADD COLUMN IF NOT EXISTS lead_time_days    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock      NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_qty     NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_rate NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_warehouse_id TEXT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS is_stock_item     BOOLEAN NOT NULL DEFAULT true;

-- Set default warehouse for all existing items
UPDATE items SET default_warehouse_id = 'wh_main_store'
WHERE default_warehouse_id IS NULL;

-- ── 3. ITEM REORDER LEVELS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS item_reorder_levels (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  item_id               TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id          TEXT NOT NULL REFERENCES warehouses(id),
  reorder_level         NUMERIC(12,4) NOT NULL DEFAULT 0,
  reorder_qty           NUMERIC(12,4) NOT NULL DEFAULT 0,
  material_request_type TEXT NOT NULL DEFAULT 'Purchase'
    CHECK (material_request_type IN ('Purchase', 'Transfer', 'Manufacture')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, warehouse_id)
);

-- ── 4. BINS (item × warehouse balance cache) ──────────────────

CREATE TABLE IF NOT EXISTS bins (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
  actual_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- physical on-hand
  ordered_qty     NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty on open POs
  indented_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty on open MRs
  reserved_qty    NUMERIC(15,4) NOT NULL DEFAULT 0,   -- allocated / reserved
  valuation_rate  NUMERIC(15,4) NOT NULL DEFAULT 0,
  stock_value     NUMERIC(15,4) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, warehouse_id)
);

-- projected_qty as computed column
ALTER TABLE bins
  ADD COLUMN IF NOT EXISTS projected_qty NUMERIC(15,4)
  GENERATED ALWAYS AS (actual_qty + ordered_qty + indented_qty - reserved_qty) STORED;

-- ── 5. STOCK LEDGER ENTRIES (append-only journal) ────────────

CREATE TABLE IF NOT EXISTS stock_ledger_entries (
  id                     TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  item_id                TEXT NOT NULL REFERENCES items(id),
  warehouse_id           TEXT NOT NULL REFERENCES warehouses(id),
  posting_datetime       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- voucher types: 'StockIn', 'StockOut', 'PurchaseReceipt', 'StoreRequisition',
  --               'StockReconciliation', 'OpeningStock', 'StockTransfer', 'Adjustment'
  voucher_type           TEXT NOT NULL,
  voucher_no             TEXT NOT NULL,
  voucher_detail_no      TEXT,
  actual_qty             NUMERIC(15,4) NOT NULL,         -- signed: + = in, − = out
  qty_after_transaction  NUMERIC(15,4),                  -- running balance (trigger-maintained)
  incoming_rate          NUMERIC(15,4) DEFAULT 0,        -- unit cost for inbound
  outgoing_rate          NUMERIC(15,4) DEFAULT 0,        -- unit cost for outbound (valuation at time of issue)
  valuation_rate         NUMERIC(15,4) DEFAULT 0,        -- running average/FIFO rate after entry
  stock_value            NUMERIC(15,4) DEFAULT 0,        -- running total value after entry
  stock_value_difference NUMERIC(15,4) DEFAULT 0,        -- value delta from this entry
  stock_queue            JSONB DEFAULT '[]'::jsonb,       -- FIFO queue [[qty, rate], ...]
  batch_no               TEXT,
  serial_no              TEXT,
  is_cancelled           BOOLEAN NOT NULL DEFAULT false,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sle_item_wh_dt
  ON stock_ledger_entries (item_id, warehouse_id, posting_datetime)
  WHERE is_cancelled = false;

CREATE INDEX IF NOT EXISTS idx_sle_voucher
  ON stock_ledger_entries (voucher_type, voucher_no);

-- ── 6. TRIGGER: maintain bins from SLE ───────────────────────

CREATE OR REPLACE FUNCTION fn_update_bin_from_sle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_old_qty    NUMERIC;
  v_old_rate   NUMERIC;
  v_old_value  NUMERIC;
  v_new_qty    NUMERIC;
  v_new_rate   NUMERIC;
  v_new_value  NUMERIC;
BEGIN
  -- Ensure a bin row exists
  INSERT INTO bins (item_id, warehouse_id)
  VALUES (NEW.item_id, NEW.warehouse_id)
  ON CONFLICT (item_id, warehouse_id) DO NOTHING;

  -- Read current bin state
  SELECT actual_qty, valuation_rate, stock_value
  INTO v_old_qty, v_old_rate, v_old_value
  FROM bins
  WHERE item_id = NEW.item_id AND warehouse_id = NEW.warehouse_id;

  -- Compute new qty
  v_new_qty := COALESCE(v_old_qty, 0) + NEW.actual_qty;
  NEW.qty_after_transaction := v_new_qty;

  -- Valuation: Moving Average (FIFO extended later per item setting)
  IF NEW.actual_qty > 0 THEN
    -- Inbound: weighted average
    IF COALESCE(v_old_qty, 0) + NEW.actual_qty > 0 AND NEW.incoming_rate > 0 THEN
      v_new_rate := (COALESCE(v_old_qty, 0) * COALESCE(v_old_rate, 0)
                     + NEW.actual_qty * NEW.incoming_rate)
                   / (COALESCE(v_old_qty, 0) + NEW.actual_qty);
    ELSE
      v_new_rate := GREATEST(NEW.incoming_rate, COALESCE(v_old_rate, 0));
    END IF;
  ELSE
    -- Outbound: keep existing rate
    v_new_rate := COALESCE(v_old_rate, 0);
    NEW.outgoing_rate := v_new_rate;
  END IF;

  v_new_rate  := GREATEST(v_new_rate, 0);
  v_new_value := v_new_qty * v_new_rate;

  NEW.valuation_rate         := v_new_rate;
  NEW.stock_value            := v_new_value;
  NEW.stock_value_difference := v_new_value - COALESCE(v_old_value, 0);

  -- Update bin
  UPDATE bins SET
    actual_qty     = v_new_qty,
    valuation_rate = v_new_rate,
    stock_value    = v_new_value,
    updated_at     = now()
  WHERE item_id = NEW.item_id AND warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sle_update_bin ON stock_ledger_entries;
CREATE TRIGGER trg_sle_update_bin
BEFORE INSERT ON stock_ledger_entries
FOR EACH ROW
WHEN (NOT NEW.is_cancelled)
EXECUTE FUNCTION fn_update_bin_from_sle();

-- ── 7. FUNCTION: get stock balance at a point in time ─────────

CREATE OR REPLACE FUNCTION fn_stock_balance(
  p_item_id      TEXT,
  p_warehouse_id TEXT,
  p_as_of        TIMESTAMPTZ DEFAULT now()
)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT qty_after_transaction
     FROM   stock_ledger_entries
     WHERE  item_id = p_item_id
       AND  warehouse_id = p_warehouse_id
       AND  is_cancelled = false
       AND  posting_datetime <= p_as_of
     ORDER BY posting_datetime DESC, created_at DESC
     LIMIT 1),
    0
  );
$$;

-- ── 8. MATERIAL REQUESTS ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_requests (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  mr_number         TEXT UNIQUE NOT NULL,
  type              TEXT NOT NULL DEFAULT 'Purchase'
    CHECK (type IN ('Purchase', 'Transfer', 'Issue', 'Manufacture')),
  status            TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Submitted', 'Pending',
                      'Partially Ordered', 'Ordered',
                      'Partially Received', 'Received',
                      'Cancelled', 'Stopped')),
  transaction_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  required_by_date  DATE,
  department        TEXT,
  requested_by      TEXT,
  set_warehouse_id  TEXT REFERENCES warehouses(id),
  per_ordered       NUMERIC(5,2) NOT NULL DEFAULT 0,
  per_received      NUMERIC(5,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_request_items (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  mr_id            TEXT NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  item_id          TEXT NOT NULL REFERENCES items(id),
  item_name        TEXT NOT NULL,
  qty              NUMERIC(12,4) NOT NULL,
  ordered_qty      NUMERIC(12,4) NOT NULL DEFAULT 0,
  received_qty     NUMERIC(12,4) NOT NULL DEFAULT 0,
  warehouse_id     TEXT REFERENCES warehouses(id),
  from_warehouse_id TEXT REFERENCES warehouses(id),
  unit             TEXT,
  rate             NUMERIC(15,4) DEFAULT 0,
  schedule_date    DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: update material_requests.per_ordered and per_received when items change
CREATE OR REPLACE FUNCTION fn_update_mr_per_ordered()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_qty    NUMERIC;
  v_ordered_qty  NUMERIC;
  v_received_qty NUMERIC;
  v_new_status   TEXT;
  v_old_status   TEXT;
BEGIN
  SELECT SUM(qty), SUM(ordered_qty), SUM(received_qty)
  INTO v_total_qty, v_ordered_qty, v_received_qty
  FROM material_request_items
  WHERE mr_id = COALESCE(NEW.mr_id, OLD.mr_id);

  IF v_total_qty IS NULL OR v_total_qty = 0 THEN RETURN NEW; END IF;

  SELECT status INTO v_old_status FROM material_requests
  WHERE id = COALESCE(NEW.mr_id, OLD.mr_id);

  IF v_old_status NOT IN ('Cancelled', 'Stopped') THEN
    IF v_received_qty >= v_total_qty THEN
      v_new_status := 'Received';
    ELSIF v_received_qty > 0 THEN
      v_new_status := 'Partially Received';
    ELSIF v_ordered_qty >= v_total_qty THEN
      v_new_status := 'Ordered';
    ELSIF v_ordered_qty > 0 THEN
      v_new_status := 'Partially Ordered';
    ELSE
      v_new_status := v_old_status;
    END IF;

    UPDATE material_requests SET
      per_ordered  = LEAST(100, ROUND(v_ordered_qty  / v_total_qty * 100, 2)),
      per_received = LEAST(100, ROUND(v_received_qty / v_total_qty * 100, 2)),
      status       = v_new_status,
      updated_at   = now()
    WHERE id = COALESCE(NEW.mr_id, OLD.mr_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mr_items_per_ordered ON material_request_items;
CREATE TRIGGER trg_mr_items_per_ordered
AFTER INSERT OR UPDATE OR DELETE ON material_request_items
FOR EACH ROW EXECUTE FUNCTION fn_update_mr_per_ordered();

-- ── 9. MIGRATE EXISTING DATA ──────────────────────────────────

-- Seed bins from current items.balance → Main Store
INSERT INTO bins (item_id, warehouse_id, actual_qty, valuation_rate, stock_value)
SELECT
  id,
  'wh_main_store',
  GREATEST(COALESCE(balance, 0), 0),
  COALESCE(cost, 0),
  GREATEST(COALESCE(balance, 0), 0) * COALESCE(cost, 0)
FROM items
WHERE is_stock_item = true OR is_stock_item IS NULL
ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
  actual_qty     = EXCLUDED.actual_qty,
  valuation_rate = EXCLUDED.valuation_rate,
  stock_value    = EXCLUDED.stock_value,
  updated_at     = now();

-- Seed opening SLEs from existing transactions (one-time migration)
-- Maps old transaction types to SLE voucher_type
INSERT INTO stock_ledger_entries (
  id, item_id, warehouse_id, posting_datetime,
  voucher_type, voucher_no, actual_qty,
  incoming_rate, is_cancelled, created_by, created_at
)
SELECT
  t.id,
  i.id,
  'wh_main_store',
  COALESCE(t.created_at, now()),
  CASE t.type
    WHEN 'IN'         THEN 'StockIn'
    WHEN 'GRN'        THEN 'PurchaseReceipt'
    WHEN 'OUT'        THEN 'StoreRequisition'
    WHEN 'ADJUSTMENT' THEN 'StockReconciliation'
    ELSE t.type
  END,
  COALESCE(t.reference, t.id),
  CASE WHEN t.type IN ('IN','GRN') THEN ABS(t.qty) ELSE -ABS(t.qty) END,
  CASE WHEN t.type IN ('IN','GRN') THEN COALESCE(i.cost, 0) ELSE 0 END,
  false,
  t.user_name,
  COALESCE(t.created_at, now())
FROM transactions t
JOIN items i ON i.name = t.item_name
ON CONFLICT (id) DO NOTHING;

-- ── 10. PO bins integration — update ordered_qty on submit ────
-- When a PO is submitted, increment bins.ordered_qty for each item.
-- This function is called from the frontend (Supabase RPC).

CREATE OR REPLACE FUNCTION fn_po_update_bin_ordered(
  p_item_id      TEXT,
  p_warehouse_id TEXT,
  p_qty_delta    NUMERIC  -- positive = add to ordered, negative = remove
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO bins (item_id, warehouse_id, ordered_qty)
  VALUES (p_item_id, p_warehouse_id, GREATEST(p_qty_delta, 0))
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
    ordered_qty = GREATEST(bins.ordered_qty + p_qty_delta, 0),
    updated_at  = now();
END;
$$;

CREATE OR REPLACE FUNCTION fn_mr_update_bin_indented(
  p_item_id      TEXT,
  p_warehouse_id TEXT,
  p_qty_delta    NUMERIC
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO bins (item_id, warehouse_id, indented_qty)
  VALUES (p_item_id, p_warehouse_id, GREATEST(p_qty_delta, 0))
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET
    indented_qty = GREATEST(bins.indented_qty + p_qty_delta, 0),
    updated_at   = now();
END;
$$;

-- ── 11. HELPER: items below reorder level ─────────────────────

CREATE OR REPLACE FUNCTION fn_items_below_reorder()
RETURNS TABLE (
  item_id      TEXT,
  item_name    TEXT,
  warehouse_id TEXT,
  actual_qty   NUMERIC,
  projected_qty NUMERIC,
  reorder_level NUMERIC,
  reorder_qty  NUMERIC,
  shortage     NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    irl.item_id,
    i.name AS item_name,
    irl.warehouse_id,
    COALESCE(b.actual_qty, 0),
    COALESCE(b.projected_qty, 0),
    irl.reorder_level,
    irl.reorder_qty,
    irl.reorder_level - COALESCE(b.projected_qty, 0) AS shortage
  FROM item_reorder_levels irl
  JOIN items i ON i.id = irl.item_id
  LEFT JOIN bins b ON b.item_id = irl.item_id AND b.warehouse_id = irl.warehouse_id
  WHERE COALESCE(b.projected_qty, 0) <= irl.reorder_level;
$$;
