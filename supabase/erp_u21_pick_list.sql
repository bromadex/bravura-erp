-- erp_u21_pick_list.sql
-- Pick List workflow: warehouse picker collects items before SR fulfillment
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS pick_lists (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pick_no         TEXT NOT NULL UNIQUE,               -- PK-0001
  warehouse_id    TEXT,                               -- FK warehouses(id)
  warehouse_name  TEXT,
  assigned_to     TEXT,                               -- picker name
  status          TEXT NOT NULL DEFAULT 'Draft'
                    CHECK (status IN ('Draft','Picking','Completed','Cancelled')),
  pick_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pick_list_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pick_list_id    TEXT NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,

  -- Source SR
  sr_id           TEXT NOT NULL,                      -- FK store_requisitions(id)
  sr_number       TEXT NOT NULL,
  department      TEXT,

  -- Item
  item_id         TEXT NOT NULL,                      -- FK items(id)
  item_name       TEXT NOT NULL,
  item_code       TEXT,
  unit            TEXT NOT NULL DEFAULT 'pcs',

  -- Quantities
  requested_qty   NUMERIC(15,4) NOT NULL DEFAULT 0,   -- from SR line
  system_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- bin qty at pick creation
  picked_qty      NUMERIC(15,4),                      -- filled by picker; NULL = not picked yet

  -- Location hint
  warehouse_id    TEXT,
  storage_location TEXT,

  -- Status
  pick_status     TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (pick_status IN ('Pending','Picked','Short Pick','Skipped')),
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pl_status     ON pick_lists(status);
CREATE INDEX IF NOT EXISTS idx_pll_pick_list ON pick_list_lines(pick_list_id);
CREATE INDEX IF NOT EXISTS idx_pll_sr        ON pick_list_lines(sr_id);

ALTER TABLE pick_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick_list_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_pick_lists"      ON pick_lists;
DROP POLICY IF EXISTS "auth_pick_list_lines" ON pick_list_lines;
CREATE POLICY "auth_pick_lists"      ON pick_lists      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_pick_list_lines" ON pick_list_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES ('pick_lists', 'PK-', 4, 'Pick Lists')
ON CONFLICT (series_key) DO NOTHING;
