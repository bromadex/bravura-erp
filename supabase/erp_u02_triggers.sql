-- ============================================================
-- ERP Upgrade Phase 2 — DB Enforcement Triggers
-- File: erp_u02_triggers.sql
-- Idempotent. Safe to re-run.
--
-- Triggers:
--   1. trg_grn_qty_check     — GRN qty cannot exceed open PO line qty
--   2. trg_invoice_qty_check — Invoice qty cannot exceed GRN accepted qty
-- ============================================================


-- ── 1. GRN QTY ENFORCEMENT ──────────────────────────────────
-- Fires BEFORE INSERT OR UPDATE on grn_lines.
-- If a po_line_id is supplied, the total received across all
-- submitted GRNs for that PO line must not exceed qty_ordered.

CREATE OR REPLACE FUNCTION fn_check_grn_qty_vs_po()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_line          purchase_order_lines%ROWTYPE;
  v_already_received NUMERIC;
BEGIN
  -- Skip if no PO line reference (free-form GRN without a PO)
  IF NEW.po_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_po_line
  FROM purchase_order_lines
  WHERE id = NEW.po_line_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Sum accepted qty on all OTHER non-cancelled GRN lines for this PO line
  SELECT COALESCE(SUM(gl.qty_received - gl.qty_rejected), 0)
  INTO   v_already_received
  FROM   grn_lines gl
  JOIN   goods_received gr ON gr.id = gl.grn_id
  WHERE  gl.po_line_id = NEW.po_line_id
    AND  gl.id         <> COALESCE(NEW.id, '')   -- exclude self on UPDATE
    AND  gr.docstatus  <> 2;                       -- exclude cancelled GRNs

  IF (v_already_received + NEW.qty_received) > v_po_line.qty_ordered THEN
    RAISE EXCEPTION
      'GRN over-receipt: qty_received (%) would exceed PO line qty_ordered (%). Already received: %. '
      'Remaining: %',
      NEW.qty_received,
      v_po_line.qty_ordered,
      v_already_received,
      v_po_line.qty_ordered - v_already_received;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_qty_check ON grn_lines;
CREATE TRIGGER trg_grn_qty_check
  BEFORE INSERT OR UPDATE OF qty_received ON grn_lines
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_grn_qty_vs_po();


-- ── 2. INVOICE QTY ENFORCEMENT ──────────────────────────────
-- Fires BEFORE INSERT OR UPDATE on purchase_invoice_lines.
-- If a grn_line_id is supplied, the total invoiced qty across all
-- submitted invoices for that GRN line must not exceed qty_accepted.

CREATE OR REPLACE FUNCTION fn_check_invoice_qty_vs_grn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_grn_line         grn_lines%ROWTYPE;
  v_already_invoiced NUMERIC;
BEGIN
  IF NEW.grn_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_grn_line
  FROM grn_lines
  WHERE id = NEW.grn_line_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Sum invoiced qty on all OTHER non-cancelled invoice lines for this GRN line
  SELECT COALESCE(SUM(pil.qty), 0)
  INTO   v_already_invoiced
  FROM   purchase_invoice_lines pil
  JOIN   purchase_invoices pi ON pi.id = pil.invoice_id
  WHERE  pil.grn_line_id = NEW.grn_line_id
    AND  pil.id          <> COALESCE(NEW.id, '')
    AND  pi.docstatus    <> 2;

  -- qty_accepted is a generated column: qty_received - qty_rejected
  IF (v_already_invoiced + NEW.qty) > v_grn_line.qty_accepted THEN
    RAISE EXCEPTION
      'Invoice over-billing: qty (%) would exceed GRN accepted qty (%). Already invoiced: %. '
      'Remaining billable: %',
      NEW.qty,
      v_grn_line.qty_accepted,
      v_already_invoiced,
      v_grn_line.qty_accepted - v_already_invoiced;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_qty_check ON purchase_invoice_lines;
CREATE TRIGGER trg_invoice_qty_check
  BEFORE INSERT OR UPDATE OF qty ON purchase_invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_invoice_qty_vs_grn();


-- ── 3. AUTO-SET docstatus ON SUBMIT/CANCEL HELPERS ──────────
-- These are convenience functions called from the JS context
-- when submitting or cancelling a document.

-- fn_submit_document: marks docstatus=1 on any table row
-- Usage: SELECT fn_submit_document('goods_received', '<id>')
CREATE OR REPLACE FUNCTION fn_submit_document(p_table TEXT, p_id TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET docstatus = 1, updated_at = now() WHERE id = $1',
    p_table
  ) USING p_id;
END;
$$;

-- fn_cancel_document: marks docstatus=2 + records reason
CREATE OR REPLACE FUNCTION fn_cancel_document(
  p_table  TEXT,
  p_id     TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_reason IS NOT NULL THEN
    EXECUTE format(
      'UPDATE %I SET docstatus = 2, cancel_reason = $2, updated_at = now() WHERE id = $1',
      p_table
    ) USING p_id, p_reason;
  ELSE
    EXECUTE format(
      'UPDATE %I SET docstatus = 2, updated_at = now() WHERE id = $1',
      p_table
    ) USING p_id;
  END IF;
END;
$$;
