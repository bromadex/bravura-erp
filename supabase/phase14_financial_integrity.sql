-- Phase 14: Landed Cost Vouchers
-- Freight, customs duty, and other charges distributed across GRN line items
-- with Moving Average (MAP) recompute on valuation bins.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS landed_cost_vouchers (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  lcv_number          TEXT UNIQUE NOT NULL,
  grn_id              TEXT REFERENCES goods_received(id),
  grn_number          TEXT,
  supplier_name       TEXT,
  posting_date        DATE NOT NULL,
  status              TEXT DEFAULT 'Draft',            -- Draft | Submitted | Cancelled
  total_landed_cost   NUMERIC(15,4) DEFAULT 0,
  distribution_method TEXT DEFAULT 'By Amount',        -- By Amount | By Qty | By Weight
  notes               TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landed_cost_lines (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  lcv_id       TEXT NOT NULL REFERENCES landed_cost_vouchers(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL,   -- Freight | Customs Duty | Handling | Transport | Insurance | Other
  description  TEXT,
  supplier     TEXT,
  amount       NUMERIC(15,4) NOT NULL DEFAULT 0,
  account_code TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landed_cost_item_allocations (
  id                    TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  lcv_id                TEXT NOT NULL REFERENCES landed_cost_vouchers(id) ON DELETE CASCADE,
  grn_line_id           TEXT REFERENCES grn_lines(id),
  item_id               TEXT REFERENCES items(id),
  item_name             TEXT NOT NULL,
  qty_received          NUMERIC(15,4) DEFAULT 0,
  original_rate         NUMERIC(15,4) DEFAULT 0,
  allocated_cost        NUMERIC(15,4) DEFAULT 0,
  new_valuation_rate    NUMERIC(15,4) GENERATED ALWAYS AS (
                          CASE
                            WHEN qty_received > 0
                            THEN original_rate + allocated_cost / NULLIF(qty_received, 0)
                            ELSE original_rate
                          END
                        ) STORED,
  stock_value_adjustment NUMERIC(15,4) DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- Indexes for child table lookups
CREATE INDEX IF NOT EXISTS idx_landed_cost_lines_lcv_id
  ON landed_cost_lines(lcv_id);

CREATE INDEX IF NOT EXISTS idx_landed_cost_item_allocations_lcv_id
  ON landed_cost_item_allocations(lcv_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed GL config rows for new event types
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO inventory_gl_config (event_type, description, is_active, created_at)
VALUES
  ('landed_cost',    'Landed Cost Voucher — freight/duty/handling spread',   true, now()),
  ('stock_write_off','Stock Write-Off — adjust stock value to zero or lower', true, now())
ON CONFLICT (event_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Function: fn_apply_landed_costs
-- Applies all allocated costs to bins.valuation_rate and items.cost,
-- then marks the LCV as Submitted.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_apply_landed_costs(p_lcv_id TEXT)
RETURNS void AS $$
DECLARE
  v_lcv   landed_cost_vouchers%ROWTYPE;
  v_alloc landed_cost_item_allocations%ROWTYPE;
BEGIN
  SELECT * INTO v_lcv FROM landed_cost_vouchers WHERE id = p_lcv_id;

  IF v_lcv.status != 'Draft' THEN
    RAISE EXCEPTION 'Landed cost voucher % is already %', p_lcv_id, v_lcv.status;
  END IF;

  -- Update bins valuation_rate and stock_value for each allocation
  FOR v_alloc IN
    SELECT * FROM landed_cost_item_allocations WHERE lcv_id = p_lcv_id
  LOOP
    IF v_alloc.item_id IS NOT NULL AND v_alloc.qty_received > 0 THEN
      UPDATE bins
      SET valuation_rate = v_alloc.new_valuation_rate,
          stock_value    = actual_qty * v_alloc.new_valuation_rate,
          updated_at     = now()
      WHERE item_id = v_alloc.item_id;

      -- Update items.cost (Moving Average Price)
      UPDATE items
      SET cost = v_alloc.new_valuation_rate
      WHERE id = v_alloc.item_id;
    END IF;
  END LOOP;

  -- Mark LCV as Submitted
  UPDATE landed_cost_vouchers
  SET status     = 'Submitted',
      updated_at = now()
  WHERE id = p_lcv_id;
END;
$$ LANGUAGE plpgsql;
