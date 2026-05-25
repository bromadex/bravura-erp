-- erp_u19_cycle_count_consignment.sql
-- Phase 20: Cycle Count sessions + Consignment stock tracking
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════
-- 1. CYCLE COUNT SESSIONS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cycle_count_sessions (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  session_no      TEXT NOT NULL UNIQUE,          -- e.g. CC-0001
  warehouse_id    TEXT REFERENCES warehouses(id),
  warehouse_name  TEXT,                          -- denormalised
  category        TEXT,                          -- item category filter, NULL = all
  count_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  counted_by      TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft','In Progress','Completed','Posted','Cancelled')),
  total_items     INTEGER NOT NULL DEFAULT 0,
  items_counted   INTEGER NOT NULL DEFAULT 0,
  items_variance  INTEGER NOT NULL DEFAULT 0,    -- count of lines with non-zero variance
  total_variance_value NUMERIC(18,4) NOT NULL DEFAULT 0,
  notes           TEXT,
  posted_at       TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_session_date   ON cycle_count_sessions(count_date);
CREATE INDEX IF NOT EXISTS idx_cc_session_status ON cycle_count_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cc_session_wh     ON cycle_count_sessions(warehouse_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. CYCLE COUNT LINES
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cycle_count_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  session_id      TEXT NOT NULL REFERENCES cycle_count_sessions(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL,                 -- FK items(id) — TEXT
  item_name       TEXT NOT NULL,
  item_code       TEXT,
  category        TEXT,
  unit            TEXT,
  warehouse_id    TEXT NOT NULL,                 -- FK warehouses(id) — TEXT
  system_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty from bins at session creation
  counted_qty     NUMERIC(15,4),                       -- NULL = not yet counted
  variance        NUMERIC(15,4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  valuation_rate  NUMERIC(15,4) NOT NULL DEFAULT 0,
  variance_value  NUMERIC(15,4) GENERATED ALWAYS AS ((counted_qty - system_qty) * valuation_rate) STORED,
  sle_id          TEXT,                          -- populated after posting
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccl_session  ON cycle_count_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_ccl_item     ON cycle_count_lines(item_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. CONSIGNMENT STOCK
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS consignment_stock (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  consignment_no    TEXT NOT NULL UNIQUE,        -- e.g. CON-0001
  supplier_id       TEXT,                        -- FK suppliers(id) — TEXT
  supplier_name     TEXT NOT NULL,
  item_id           TEXT NOT NULL,               -- FK items(id) — TEXT
  item_name         TEXT NOT NULL,
  item_code         TEXT,
  warehouse_id      TEXT NOT NULL,               -- FK warehouses(id) — TEXT
  warehouse_name    TEXT,
  unit              TEXT NOT NULL DEFAULT 'pcs',
  qty_received      NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_consumed      NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_returned      NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_balance       NUMERIC(15,4) GENERATED ALWAYS AS (qty_received - qty_consumed - qty_returned) STORED,
  unit_cost         NUMERIC(15,4) NOT NULL DEFAULT 0,    -- agreed consignment price
  receipt_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  review_date       DATE,                                -- next scheduled review
  status            TEXT NOT NULL DEFAULT 'Active'
                      CHECK (status IN ('Active','Partially Consumed','Consumed','Returned','Expired')),
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_con_supplier  ON consignment_stock(supplier_id);
CREATE INDEX IF NOT EXISTS idx_con_item      ON consignment_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_con_status    ON consignment_stock(status);

-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE cycle_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_count_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_stock    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_cycle_count_sessions" ON cycle_count_sessions;
DROP POLICY IF EXISTS "auth_cycle_count_lines"    ON cycle_count_lines;
DROP POLICY IF EXISTS "auth_consignment_stock"    ON consignment_stock;

CREATE POLICY "auth_cycle_count_sessions"
  ON cycle_count_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_cycle_count_lines"
  ON cycle_count_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_consignment_stock"
  ON consignment_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 5. NUMBERING SERIES
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES
  ('cycle_count_sessions', 'CC-',  4, 'Cycle Count Sessions'),
  ('consignment_stock',    'CON-', 4, 'Consignment Stock')
ON CONFLICT (series_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 4. SERIAL REPAIR LOG (append to erp_u19)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS serial_repair_logs (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  serial_no       TEXT NOT NULL,           -- FK item_serials(serial_no)
  item_id         TEXT NOT NULL,
  item_name       TEXT NOT NULL,

  -- Repair event
  fault_description TEXT NOT NULL,
  repair_vendor   TEXT,
  date_sent       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_returned   DATE,
  repair_cost     NUMERIC(15,4) NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL DEFAULT 'Repaired'
                    CHECK (outcome IN ('Repaired','Scrapped','Under Warranty','Pending','Unrepairable')),
  technician_notes TEXT,

  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srl_serial ON serial_repair_logs(serial_no);
CREATE INDEX IF NOT EXISTS idx_srl_item   ON serial_repair_logs(item_id);

ALTER TABLE serial_repair_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_serial_repair_logs" ON serial_repair_logs;
CREATE POLICY "auth_serial_repair_logs"
  ON serial_repair_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
