-- ============================================================
-- Phase 17: Strategic Intelligence — Forecast & Reorder Analytics
-- ============================================================
-- All functions are idempotent (CREATE OR REPLACE). No new tables.

-- ── fn_consumption_rate ──────────────────────────────────────
-- Returns average daily consumption for an item in a warehouse
-- over the last N days. Only counts outgoing SLEs (actual_qty < 0),
-- excluding StockReconciliation and OpeningStock voucher types.
CREATE OR REPLACE FUNCTION fn_consumption_rate(
  p_item_id      TEXT,
  p_warehouse_id TEXT,
  p_days         INT DEFAULT 90
) RETURNS NUMERIC AS $$
DECLARE
  v_total_out NUMERIC;
BEGIN
  SELECT COALESCE(ABS(SUM(actual_qty)), 0) INTO v_total_out
  FROM stock_ledger_entries
  WHERE item_id      = p_item_id
    AND warehouse_id = p_warehouse_id
    AND actual_qty   < 0
    AND voucher_type NOT IN ('StockReconciliation', 'OpeningStock')
    AND is_cancelled  = FALSE
    AND posting_datetime >= (now() - make_interval(days => p_days));
  RETURN ROUND(v_total_out / p_days, 6);
END;
$$ LANGUAGE plpgsql;

-- ── fn_days_to_stockout ──────────────────────────────────────
-- Returns projected days until stockout based on current bin
-- quantity and the 90-day consumption rate.
-- Returns NULL if consumption rate is zero (no movement).
CREATE OR REPLACE FUNCTION fn_days_to_stockout(
  p_item_id      TEXT,
  p_warehouse_id TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_actual NUMERIC;
  v_rate   NUMERIC;
BEGIN
  SELECT COALESCE(actual_qty, 0) INTO v_actual
  FROM bins
  WHERE item_id = p_item_id AND warehouse_id = p_warehouse_id;

  v_rate := fn_consumption_rate(p_item_id, p_warehouse_id, 90);

  IF v_rate <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN ROUND(v_actual / v_rate, 1);
END;
$$ LANGUAGE plpgsql;

-- ── fn_suggested_reorder_point ───────────────────────────────
-- Suggested reorder point = (lead_time_days * daily_rate) + safety_stock
-- Defaults: lead_time_days = 14, safety_stock = 0 when NULL.
CREATE OR REPLACE FUNCTION fn_suggested_reorder_point(
  p_item_id      TEXT,
  p_warehouse_id TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_rate        NUMERIC;
  v_lead_time   INT;
  v_safety      NUMERIC;
BEGIN
  v_rate := fn_consumption_rate(p_item_id, p_warehouse_id, 90);

  SELECT COALESCE(lead_time_days, 14), COALESCE(safety_stock, 0)
  INTO v_lead_time, v_safety
  FROM items
  WHERE id = p_item_id;

  RETURN ROUND(v_rate * v_lead_time + v_safety, 2);
END;
$$ LANGUAGE plpgsql;
