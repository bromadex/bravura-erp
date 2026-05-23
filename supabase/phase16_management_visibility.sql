-- ============================================================
-- Phase 16: Management Visibility — Supplier Price Lists
-- ============================================================

-- ── supplier_price_lists ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_price_lists (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  supplier_id    TEXT,
  supplier_name  TEXT NOT NULL,
  item_id        TEXT REFERENCES items(id),
  item_name      TEXT NOT NULL,
  unit           TEXT DEFAULT 'pcs',
  unit_price     NUMERIC(15,4) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'USD',
  min_qty        NUMERIC(15,4) DEFAULT 1,
  valid_from     DATE,
  valid_to       DATE,
  lead_time_days INT DEFAULT 0,
  notes          TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spl_supplier_id  ON supplier_price_lists (supplier_id);
CREATE INDEX IF NOT EXISTS idx_spl_item_id      ON supplier_price_lists (item_id);
CREATE INDEX IF NOT EXISTS idx_spl_item_name    ON supplier_price_lists (item_name);
CREATE INDEX IF NOT EXISTS idx_spl_is_active    ON supplier_price_lists (is_active);

-- ── fn_get_best_price ─────────────────────────────────────────
-- Returns all active, currently-valid prices for an item ordered cheapest first
CREATE OR REPLACE FUNCTION fn_get_best_price(p_item_id TEXT)
RETURNS TABLE(supplier_name TEXT, unit_price NUMERIC, currency TEXT, lead_time_days INT) AS $$
  SELECT supplier_name, unit_price, currency, lead_time_days
  FROM   supplier_price_lists
  WHERE  item_id   = p_item_id
    AND  is_active = TRUE
    AND  (valid_to   IS NULL OR valid_to   >= CURRENT_DATE)
    AND  (valid_from IS NULL OR valid_from <= CURRENT_DATE)
  ORDER BY unit_price ASC;
$$ LANGUAGE sql;

-- ── fn_auto_log_supplier_perf_on_grn ─────────────────────────
-- Fires after a GRN row transitions to 'received' status
CREATE OR REPLACE FUNCTION fn_auto_log_supplier_perf_on_grn()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type  TEXT;
  v_delay_days  INT;
  v_exp_date    DATE;
  v_act_date    DATE;
BEGIN
  -- Only act when status transitions to 'received'
  IF NEW.status = 'received' AND OLD.status <> 'received' THEN

    v_act_date := COALESCE(NEW.actual_delivery_date, CURRENT_DATE);
    v_exp_date := NEW.expected_date;   -- may be NULL

    IF v_exp_date IS NULL OR v_act_date <= v_exp_date THEN
      v_event_type := 'delivery_on_time';
      v_delay_days := 0;
    ELSE
      v_event_type := 'delivery_late';
      v_delay_days := (v_act_date - v_exp_date);
    END IF;

    INSERT INTO supplier_performance_log (
      supplier_id,
      supplier_name,
      po_id,
      grn_id,
      event_type,
      event_date,
      delay_days,
      notes,
      created_at
    ) VALUES (
      NEW.supplier_id,
      COALESCE(NEW.supplier_name, ''),
      NEW.po_id,
      NEW.id,
      v_event_type,
      CURRENT_DATE,
      NULLIF(v_delay_days, 0),
      'Auto-logged on GRN receipt',
      now()
    );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supplier_perf_grn ON goods_received;

CREATE TRIGGER trg_supplier_perf_grn
  AFTER UPDATE ON goods_received
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_log_supplier_perf_on_grn();
