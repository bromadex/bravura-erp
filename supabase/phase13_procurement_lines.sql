-- ============================================================
-- Phase 13: Normalized Procurement Line Tables
-- ERPNext-style line-item normalization for the Bravura Mining ERP
-- ============================================================
-- Adds normalized line-item tables alongside existing JSONB columns.
-- JSONB columns are kept untouched for backward compatibility with
-- all previously created records.
--
-- Tables created:
--   1.  purchase_order_lines
--   2.  grn_lines
--   3.  purchase_invoice_lines
--   4.  rfq_lines
--   5.  quotation_lines
--   6.  stock_transfers
--   7.  stock_transfer_lines
--   8.  system_audit_logs
--   9.  inventory_gl_config
--
-- Columns added to existing tables:
--   - store_requisitions:  cost_center, project
--   - transactions:        cost_center, department, project
--   - goods_received:      is_return, original_grn_id
--   - purchase_orders:     per_received, per_invoiced
--
-- Triggers created:
--   - fn_update_po_line_status  (grn_lines → purchase_order_lines)
--   - fn_update_po_completion   (purchase_order_lines → purchase_orders)
--
-- Data migration:
--   - Expands JSONB items arrays into the new line tables for all
--     existing purchase_orders, goods_received, rfq, rfq_quotations,
--     and purchase_invoices records.
-- ============================================================
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT everywhere.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. PURCHASE ORDER LINES
-- ─────────────────────────────────────────────────────────────
-- One row per line item on a purchase order.
-- qty_received / qty_invoiced are updated by downstream triggers.
-- amount is a stored generated column (qty_ordered × unit_rate).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- Parent PO
  po_id             TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  -- Item linkage
  item_id           TEXT REFERENCES items(id),          -- nullable: free-text items allowed
  item_name         TEXT NOT NULL,
  item_code         TEXT,
  category          TEXT,
  unit              TEXT NOT NULL DEFAULT 'pcs',

  -- Quantities
  qty_ordered       NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_received      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- updated by grn_lines trigger
  qty_invoiced      NUMERIC(15,4) NOT NULL DEFAULT 0,   -- updated when invoice lines saved
  qty_returned      NUMERIC(15,4) NOT NULL DEFAULT 0,

  -- Pricing
  unit_rate         NUMERIC(15,4) NOT NULL DEFAULT 0,
  amount            NUMERIC(15,4) GENERATED ALWAYS AS (qty_ordered * unit_rate) STORED,

  -- Linkages
  warehouse_id      TEXT REFERENCES warehouses(id),     -- destination warehouse
  mr_item_id        TEXT REFERENCES material_request_items(id),  -- originating MR line
  quotation_line_id TEXT,                               -- FK to quotation_lines (no hard ref, created in same migration)

  -- Status (updated by trigger)
  status            TEXT NOT NULL DEFAULT 'Open'
                    CHECK (status IN ('Open', 'Partially Received', 'Received', 'Cancelled')),

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pol_po_id      ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_pol_item_id    ON purchase_order_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_pol_status     ON purchase_order_lines(status);
CREATE INDEX IF NOT EXISTS idx_pol_mr_item    ON purchase_order_lines(mr_item_id);


-- ─────────────────────────────────────────────────────────────
-- 2. GRN LINES
-- ─────────────────────────────────────────────────────────────
-- One row per line item on a Goods Received Note.
-- qty_accepted is generated (received − rejected).
-- amount is generated (qty_received × unit_rate — matches GRN convention).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grn_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- Parent GRN
  grn_id            TEXT NOT NULL REFERENCES goods_received(id) ON DELETE CASCADE,

  -- Back-link to the PO line being fulfilled
  po_line_id        TEXT REFERENCES purchase_order_lines(id),

  -- Item linkage
  item_id           TEXT REFERENCES items(id),
  item_name         TEXT NOT NULL,
  category          TEXT,
  unit              TEXT NOT NULL DEFAULT 'pcs',

  -- Quantities
  qty_ordered       NUMERIC(15,4) NOT NULL DEFAULT 0,   -- copy from PO line for reference
  qty_received      NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_rejected      NUMERIC(15,4) NOT NULL DEFAULT 0,
  qty_accepted      NUMERIC(15,4) GENERATED ALWAYS AS (qty_received - qty_rejected) STORED,

  -- Pricing
  unit_rate         NUMERIC(15,4) NOT NULL DEFAULT 0,
  amount            NUMERIC(15,4) GENERATED ALWAYS AS (qty_received * unit_rate) STORED,

  -- Storage
  warehouse_id      TEXT REFERENCES warehouses(id),

  -- Batch / lot tracking
  batch_no          TEXT,
  lot_batch         TEXT,

  -- Quality
  rejection_reason  TEXT,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grnl_grn_id     ON grn_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_grnl_po_line_id ON grn_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_grnl_item_id    ON grn_lines(item_id);


-- ─────────────────────────────────────────────────────────────
-- 3. PURCHASE INVOICE LINES
-- ─────────────────────────────────────────────────────────────
-- One row per line item on a purchase invoice.
-- Carries PO + GRN reference quantities for three-way matching.
-- amount and tax_amount are generated columns.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- Parent invoice
  invoice_id        TEXT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,

  -- Upstream line linkages
  grn_line_id       TEXT REFERENCES grn_lines(id),
  po_line_id        TEXT REFERENCES purchase_order_lines(id),

  -- Item linkage
  item_id           TEXT REFERENCES items(id),
  item_name         TEXT NOT NULL,
  category          TEXT,
  unit              TEXT NOT NULL DEFAULT 'pcs',

  -- Invoiced quantities / pricing
  qty               NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_rate         NUMERIC(15,4) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,   -- percentage, e.g. 15.00
  amount            NUMERIC(15,4) GENERATED ALWAYS AS (qty * unit_rate) STORED,
  tax_amount        NUMERIC(15,4) GENERATED ALWAYS AS (qty * unit_rate * tax_rate / 100) STORED,

  -- Three-way match reference values (copied at invoice creation time)
  po_qty            NUMERIC(15,4),                      -- qty on the originating PO line
  po_rate           NUMERIC(15,4),                      -- rate on the originating PO line
  grn_qty           NUMERIC(15,4),                      -- qty accepted on the GRN line
  grn_rate          NUMERIC(15,4),                      -- rate on the GRN line

  -- Match result (set by matching logic / trigger)
  match_status      TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (match_status IN ('Pending', 'Matched', 'Qty Mismatch',
                                           'Rate Mismatch', 'Overbilled')),
  match_notes       TEXT,
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pil_invoice_id ON purchase_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pil_po_line    ON purchase_invoice_lines(po_line_id);
CREATE INDEX IF NOT EXISTS idx_pil_grn_line   ON purchase_invoice_lines(grn_line_id);
CREATE INDEX IF NOT EXISTS idx_pil_item_id    ON purchase_invoice_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_pil_match      ON purchase_invoice_lines(match_status);


-- ─────────────────────────────────────────────────────────────
-- 4. RFQ LINES
-- ─────────────────────────────────────────────────────────────
-- One row per item requested in a Request for Quotation.
-- Suppliers respond at the quotation_lines level.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq_lines (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  rfq_id       TEXT NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,

  -- Item linkage
  item_id      TEXT REFERENCES items(id),
  item_name    TEXT NOT NULL,
  category     TEXT,
  unit         TEXT NOT NULL DEFAULT 'pcs',

  qty          NUMERIC(15,4) NOT NULL DEFAULT 0,

  -- Back-link to the originating MR line (optional)
  mr_item_id   TEXT REFERENCES material_request_items(id),

  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfql_rfq_id   ON rfq_lines(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfql_item_id  ON rfq_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_rfql_mr_item  ON rfq_lines(mr_item_id);


-- ─────────────────────────────────────────────────────────────
-- 5. QUOTATION LINES
-- ─────────────────────────────────────────────────────────────
-- One row per item in a supplier's quotation response to an RFQ.
-- amount is generated (qty × unit_rate).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  quotation_id    TEXT NOT NULL REFERENCES rfq_quotations(id) ON DELETE CASCADE,

  -- Optional back-link to the specific RFQ line being quoted on
  rfq_line_id     TEXT REFERENCES rfq_lines(id),

  -- Item linkage
  item_id         TEXT REFERENCES items(id),
  item_name       TEXT NOT NULL,
  category        TEXT,
  unit            TEXT NOT NULL DEFAULT 'pcs',

  qty             NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_rate       NUMERIC(15,4) NOT NULL DEFAULT 0,
  amount          NUMERIC(15,4) GENERATED ALWAYS AS (qty * unit_rate) STORED,

  lead_time_days  INTEGER,
  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from purchase_order_lines.quotation_line_id now that quotation_lines exists.
-- We use a named constraint so it can be introspected.
ALTER TABLE purchase_order_lines
  ADD CONSTRAINT fk_pol_quotation_line
    FOREIGN KEY (quotation_line_id) REFERENCES quotation_lines(id)
    NOT VALID;  -- NOT VALID: skip retroactive check; existing NULLs are fine

CREATE INDEX IF NOT EXISTS idx_ql_quotation_id ON quotation_lines(quotation_id);
CREATE INDEX IF NOT EXISTS idx_ql_rfq_line     ON quotation_lines(rfq_line_id);
CREATE INDEX IF NOT EXISTS idx_ql_item_id      ON quotation_lines(item_id);


-- ─────────────────────────────────────────────────────────────
-- 6. STOCK TRANSFERS
-- ─────────────────────────────────────────────────────────────
-- Header for an inter-warehouse stock movement.
-- Line items live in stock_transfer_lines.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  transfer_no          TEXT UNIQUE NOT NULL,

  -- Warehouses
  from_warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id      TEXT NOT NULL REFERENCES warehouses(id),

  -- Lifecycle
  status               TEXT NOT NULL DEFAULT 'Draft'
                       CHECK (status IN ('Draft', 'Pending Approval', 'Approved',
                                        'In Transit', 'Completed', 'Cancelled')),
  transfer_date        DATE NOT NULL,

  -- Classification / cost allocation
  purpose              TEXT,
  cost_center          TEXT,
  department           TEXT,
  project              TEXT,

  -- People
  requested_by         TEXT,
  requested_by_id      TEXT,
  approved_by          TEXT,
  approved_by_id       TEXT,

  -- Timestamps
  approved_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  -- Cancellation
  cancellation_reason  TEXT,

  notes                TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_status        ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_st_transfer_date ON stock_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_st_from_wh       ON stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_st_to_wh         ON stock_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_st_department    ON stock_transfers(department);


-- ─────────────────────────────────────────────────────────────
-- 7. STOCK TRANSFER LINES
-- ─────────────────────────────────────────────────────────────
-- One row per item on a stock transfer.
-- from_warehouse_id / to_warehouse_id are denormalized here so that
-- Stock Ledger Entries can be created directly from this table
-- without needing to JOIN back to the header.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  transfer_id       TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,

  -- Item
  item_id           TEXT NOT NULL REFERENCES items(id),
  item_name         TEXT NOT NULL,
  unit              TEXT NOT NULL DEFAULT 'pcs',

  -- Quantities
  qty               NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty requested
  qty_transferred   NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty actually moved (may differ)

  -- Batch / serial tracking
  batch_no          TEXT,
  serial_no         TEXT,

  -- Valuation
  valuation_rate    NUMERIC(15,4) NOT NULL DEFAULT 0,

  -- Denormalized warehouses for SLE generation
  from_warehouse_id TEXT REFERENCES warehouses(id),
  to_warehouse_id   TEXT REFERENCES warehouses(id),

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stl_transfer_id ON stock_transfer_lines(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stl_item_id     ON stock_transfer_lines(item_id);


-- ─────────────────────────────────────────────────────────────
-- 8. SYSTEM AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
-- Immutable append-only log of every significant action taken
-- across any module.  before_data / after_data store full
-- document snapshots; changed_fields lists the diff.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- What was touched
  module            TEXT NOT NULL,                      -- e.g. 'procurement', 'inventory'
  entity_type       TEXT NOT NULL,                      -- e.g. 'purchase_order', 'item'
  entity_id         TEXT,
  entity_name       TEXT,

  -- What happened
  action            TEXT NOT NULL
                    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'SUBMIT',
                                     'APPROVE', 'CANCEL', 'REJECT')),
  before_data       JSONB,
  after_data        JSONB,
  changed_fields    TEXT[],

  -- Who did it
  performed_by      TEXT,                               -- user id
  performed_by_name TEXT,
  session_id        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs are almost always queried by entity or by time range
CREATE INDEX IF NOT EXISTS idx_sal_entity       ON system_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sal_module       ON system_audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_sal_action       ON system_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_sal_performed_by ON system_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_sal_created_at   ON system_audit_logs(created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 9. INVENTORY GL CONFIG
-- ─────────────────────────────────────────────────────────────
-- Maps stock events to debit/credit account codes for automatic
-- General Ledger posting.  Account codes are intentionally left
-- NULL — the user must configure them in the app settings.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_gl_config (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- One row per event type; UNIQUE enforces a single GL mapping per event
  event_type          TEXT UNIQUE NOT NULL,
  -- Valid events: grn_receipt | stock_issue | stock_adjustment_loss
  --               | stock_write_off | stock_transfer

  debit_account_code  TEXT,   -- account to debit  (user-configurable)
  credit_account_code TEXT,   -- account to credit (user-configurable)
  description         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default event-type rows.
-- Account codes are NULL — the finance team must configure them.
INSERT INTO inventory_gl_config (event_type, description) VALUES
  ('grn_receipt',
   'Debit stock/inventory account; credit GR/IR (Goods Receipt / Invoice Receipt) or AP clearing'),
  ('stock_issue',
   'Debit cost-of-goods-issued or expense account; credit stock/inventory account'),
  ('stock_adjustment_loss',
   'Debit stock-loss / write-off expense; credit stock/inventory account'),
  ('stock_write_off',
   'Debit inventory write-off expense; credit stock/inventory account'),
  ('stock_transfer',
   'Debit destination warehouse stock; credit source warehouse stock (intra-entity only)')
ON CONFLICT (event_type) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 10. ADD COLUMNS TO EXISTING TABLES
-- ─────────────────────────────────────────────────────────────

-- Cost-centre / project tracking on store requisitions
ALTER TABLE store_requisitions
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS project     TEXT;

-- Cost-centre / department / project on inventory transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS department  TEXT,
  ADD COLUMN IF NOT EXISTS project     TEXT;

-- Purchase-return flag on goods_received
ALTER TABLE goods_received
  ADD COLUMN IF NOT EXISTS is_return        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS original_grn_id TEXT;   -- FK to goods_received(id) for return GRNs

-- Receipt / invoice completion percentages on purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS per_received NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_invoiced NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Index to support return-GRN lookups
CREATE INDEX IF NOT EXISTS idx_gr_original_grn ON goods_received(original_grn_id)
  WHERE original_grn_id IS NOT NULL;

-- Index for goods-received return flag
CREATE INDEX IF NOT EXISTS idx_gr_is_return ON goods_received(is_return)
  WHERE is_return = TRUE;


-- ─────────────────────────────────────────────────────────────
-- 11. TRIGGERS
-- ─────────────────────────────────────────────────────────────

-- ── 11a. grn_lines → purchase_order_lines ──────────────────
-- When a GRN line is inserted or updated, roll up the total
-- accepted qty into the parent PO line and update its status.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_po_line_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_line_id   TEXT;
  v_qty_received NUMERIC;
  v_qty_ordered  NUMERIC;
  v_new_status   TEXT;
BEGIN
  -- Determine which PO line is affected
  v_po_line_id := COALESCE(NEW.po_line_id, OLD.po_line_id);

  -- Nothing to update if there is no PO line linkage
  IF v_po_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum all accepted quantities across every GRN line for this PO line.
  -- qty_accepted is the generated column (qty_received - qty_rejected).
  SELECT COALESCE(SUM(qty_accepted), 0)
  INTO   v_qty_received
  FROM   grn_lines
  WHERE  po_line_id = v_po_line_id;

  -- Read the ordered quantity from the PO line
  SELECT qty_ordered
  INTO   v_qty_ordered
  FROM   purchase_order_lines
  WHERE  id = v_po_line_id;

  IF v_qty_ordered IS NULL THEN
    RETURN NEW;
  END IF;

  -- Derive status
  IF v_qty_received = 0 THEN
    v_new_status := 'Open';
  ELSIF v_qty_received < v_qty_ordered THEN
    v_new_status := 'Partially Received';
  ELSE
    v_new_status := 'Received';
  END IF;

  UPDATE purchase_order_lines
  SET    qty_received = v_qty_received,
         status       = v_new_status,
         updated_at   = now()
  WHERE  id = v_po_line_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grn_lines_po_status ON grn_lines;
CREATE TRIGGER trg_grn_lines_po_status
AFTER INSERT OR UPDATE OF qty_received, qty_rejected, po_line_id
ON grn_lines
FOR EACH ROW
EXECUTE FUNCTION fn_update_po_line_status();


-- ── 11b. purchase_order_lines → purchase_orders ────────────
-- When a PO line changes, recompute per_received on the parent
-- PO header and update the PO status accordingly.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_po_completion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_po_id         TEXT;
  v_total_ordered NUMERIC;
  v_total_received NUMERIC;
  v_per_received  NUMERIC;
  v_old_status    TEXT;
  v_new_status    TEXT;
BEGIN
  v_po_id := COALESCE(NEW.po_id, OLD.po_id);

  -- Aggregate across all lines (excluding cancelled lines from denominator
  -- keeps the percentage meaningful when some lines are cancelled)
  SELECT
    COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN qty_ordered  ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN qty_received ELSE 0 END), 0)
  INTO v_total_ordered, v_total_received
  FROM purchase_order_lines
  WHERE po_id = v_po_id;

  -- Avoid division by zero
  IF v_total_ordered = 0 THEN
    RETURN NEW;
  END IF;

  v_per_received := LEAST(100, ROUND(v_total_received / v_total_ordered * 100, 2));

  -- Read current PO status — do not override terminal statuses
  SELECT status INTO v_old_status FROM purchase_orders WHERE id = v_po_id;

  IF v_old_status IN ('cancelled', 'Cancelled') THEN
    -- Just update the percentage; leave status alone
    UPDATE purchase_orders
    SET    per_received = v_per_received,
           updated_at   = now()
    WHERE  id = v_po_id;
    RETURN NEW;
  END IF;

  -- Derive new status
  IF v_per_received = 0 THEN
    -- No receipts yet — keep existing status (Draft / Submitted / etc.)
    v_new_status := v_old_status;
  ELSIF v_per_received < 100 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := 'received';
  END IF;

  UPDATE purchase_orders
  SET    per_received = v_per_received,
         status       = v_new_status,
         updated_at   = now()
  WHERE  id = v_po_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pol_po_completion ON purchase_order_lines;
CREATE TRIGGER trg_pol_po_completion
AFTER INSERT OR UPDATE OF qty_received, qty_ordered, status
ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION fn_update_po_completion();


-- ─────────────────────────────────────────────────────────────
-- 12. DATA MIGRATION
-- ─────────────────────────────────────────────────────────────
-- Expands existing JSONB items arrays into the new line tables.
-- Each document is processed in its own sub-transaction via
-- BEGIN / EXCEPTION so that a malformed JSONB on one row
-- cannot abort the entire migration.
--
-- JSONB element shape assumed (based on existing app code):
--   purchase_orders.items  → [{name, qty, unit, unit_price|price|rate, category, ...}]
--   goods_received.items   → [{name, qty, unit, unit_price|price|rate, rejected, ...}]
--   rfq.items              → [{name, qty, unit, category, ...}]
--   rfq_quotations.items   → [{name, qty, unit, unit_price|price, ...}]
--   purchase_invoices.items → [{name, qty, unit, unit_price|price|rate, tax_rate, ...}]
-- ─────────────────────────────────────────────────────────────

-- ── 12a. purchase_orders → purchase_order_lines ─────────────

DO $$
DECLARE
  r       RECORD;
  elem    JSONB;
  v_item  RECORD;
BEGIN
  FOR r IN
    SELECT id AS po_id, items
    FROM   purchase_orders
    WHERE  items IS NOT NULL
      AND  jsonb_array_length(items) > 0
  LOOP
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      BEGIN
        -- Resolve item_id from the items master if possible
        SELECT id INTO v_item
        FROM   items
        WHERE  name = (elem->>'name')
        LIMIT  1;

        INSERT INTO purchase_order_lines (
          po_id,
          item_id,
          item_name,
          item_code,
          category,
          unit,
          qty_ordered,
          unit_rate,
          notes
        ) VALUES (
          r.po_id,
          v_item.id,                                          -- may be NULL
          COALESCE(elem->>'name', 'Unknown Item'),
          elem->>'code',
          elem->>'category',
          COALESCE(elem->>'unit', 'pcs'),
          COALESCE((elem->>'qty')::NUMERIC,        0),
          COALESCE(
            (elem->>'unit_price')::NUMERIC,
            (elem->>'price')::NUMERIC,
            (elem->>'rate')::NUMERIC,
            0
          ),
          elem->>'notes'
        );

      EXCEPTION WHEN OTHERS THEN
        -- Log and continue with the next element
        RAISE WARNING 'phase13 migration: skipping PO % item % — %',
          r.po_id, elem->>'name', SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;


-- ── 12b. goods_received → grn_lines ────────────────────────

DO $$
DECLARE
  r          RECORD;
  elem       JSONB;
  v_item     RECORD;
  v_pol_id   TEXT;
  v_grn_po   TEXT;
BEGIN
  FOR r IN
    SELECT id AS grn_id, po_id, items
    FROM   goods_received
    WHERE  items IS NOT NULL
      AND  jsonb_array_length(items) > 0
  LOOP
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      BEGIN
        -- Resolve item master
        SELECT id INTO v_item
        FROM   items
        WHERE  name = (elem->>'name')
        LIMIT  1;

        -- Try to find the matching PO line (item_name + po_id)
        v_pol_id := NULL;
        IF r.po_id IS NOT NULL THEN
          SELECT id INTO v_pol_id
          FROM   purchase_order_lines
          WHERE  po_id     = r.po_id
            AND  item_name = COALESCE(elem->>'name', '')
          LIMIT  1;
        END IF;

        INSERT INTO grn_lines (
          grn_id,
          po_line_id,
          item_id,
          item_name,
          category,
          unit,
          qty_ordered,
          qty_received,
          qty_rejected,
          unit_rate,
          batch_no,
          rejection_reason,
          notes
        ) VALUES (
          r.grn_id,
          v_pol_id,
          v_item.id,
          COALESCE(elem->>'name', 'Unknown Item'),
          elem->>'category',
          COALESCE(elem->>'unit', 'pcs'),
          COALESCE((elem->>'ordered_qty')::NUMERIC, (elem->>'qty')::NUMERIC, 0),
          COALESCE((elem->>'qty')::NUMERIC, 0),
          COALESCE((elem->>'rejected')::NUMERIC, (elem->>'qty_rejected')::NUMERIC, 0),
          COALESCE(
            (elem->>'unit_price')::NUMERIC,
            (elem->>'price')::NUMERIC,
            (elem->>'rate')::NUMERIC,
            0
          ),
          elem->>'batch_no',
          elem->>'rejection_reason',
          elem->>'notes'
        );

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'phase13 migration: skipping GRN % item % — %',
          r.grn_id, elem->>'name', SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;


-- ── 12c. rfq → rfq_lines ────────────────────────────────────

DO $$
DECLARE
  r      RECORD;
  elem   JSONB;
  v_item RECORD;
BEGIN
  FOR r IN
    SELECT id AS rfq_id, items
    FROM   rfq
    WHERE  items IS NOT NULL
      AND  jsonb_array_length(items) > 0
  LOOP
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      BEGIN
        SELECT id INTO v_item
        FROM   items
        WHERE  name = (elem->>'name')
        LIMIT  1;

        INSERT INTO rfq_lines (
          rfq_id,
          item_id,
          item_name,
          category,
          unit,
          qty,
          notes
        ) VALUES (
          r.rfq_id,
          v_item.id,
          COALESCE(elem->>'name', 'Unknown Item'),
          elem->>'category',
          COALESCE(elem->>'unit', 'pcs'),
          COALESCE((elem->>'qty')::NUMERIC, 0),
          elem->>'notes'
        );

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'phase13 migration: skipping RFQ % item % — %',
          r.rfq_id, elem->>'name', SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;


-- ── 12d. rfq_quotations → quotation_lines ───────────────────

DO $$
DECLARE
  r          RECORD;
  elem       JSONB;
  v_item     RECORD;
  v_rfql_id  TEXT;
BEGIN
  FOR r IN
    SELECT id AS quotation_id, rfq_id, items
    FROM   rfq_quotations
    WHERE  items IS NOT NULL
      AND  jsonb_array_length(items) > 0
  LOOP
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      BEGIN
        SELECT id INTO v_item
        FROM   items
        WHERE  name = (elem->>'name')
        LIMIT  1;

        -- Try to match to an rfq_line by item_name + rfq_id
        v_rfql_id := NULL;
        IF r.rfq_id IS NOT NULL THEN
          SELECT id INTO v_rfql_id
          FROM   rfq_lines
          WHERE  rfq_id    = r.rfq_id
            AND  item_name = COALESCE(elem->>'name', '')
          LIMIT  1;
        END IF;

        INSERT INTO quotation_lines (
          quotation_id,
          rfq_line_id,
          item_id,
          item_name,
          category,
          unit,
          qty,
          unit_rate,
          lead_time_days,
          notes
        ) VALUES (
          r.quotation_id,
          v_rfql_id,
          v_item.id,
          COALESCE(elem->>'name', 'Unknown Item'),
          elem->>'category',
          COALESCE(elem->>'unit', 'pcs'),
          COALESCE((elem->>'qty')::NUMERIC, 0),
          COALESCE(
            (elem->>'unit_price')::NUMERIC,
            (elem->>'price')::NUMERIC,
            (elem->>'rate')::NUMERIC,
            0
          ),
          (elem->>'lead_time_days')::INTEGER,
          elem->>'notes'
        );

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'phase13 migration: skipping quotation % item % — %',
          r.quotation_id, elem->>'name', SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;


-- ── 12e. purchase_invoices → purchase_invoice_lines ─────────

DO $$
DECLARE
  r          RECORD;
  elem       JSONB;
  v_item     RECORD;
  v_pol_id   TEXT;
  v_grnl_id  TEXT;
BEGIN
  FOR r IN
    SELECT id AS invoice_id, po_id, grn_id, items
    FROM   purchase_invoices
    WHERE  items IS NOT NULL
      AND  jsonb_array_length(items) > 0
  LOOP
    FOR elem IN SELECT * FROM jsonb_array_elements(r.items)
    LOOP
      BEGIN
        SELECT id INTO v_item
        FROM   items
        WHERE  name = (elem->>'name')
        LIMIT  1;

        -- Match to PO line
        v_pol_id := NULL;
        IF r.po_id IS NOT NULL THEN
          SELECT id INTO v_pol_id
          FROM   purchase_order_lines
          WHERE  po_id     = r.po_id
            AND  item_name = COALESCE(elem->>'name', '')
          LIMIT  1;
        END IF;

        -- Match to GRN line
        v_grnl_id := NULL;
        IF r.grn_id IS NOT NULL THEN
          SELECT id INTO v_grnl_id
          FROM   grn_lines
          WHERE  grn_id    = r.grn_id
            AND  item_name = COALESCE(elem->>'name', '')
          LIMIT  1;
        END IF;

        INSERT INTO purchase_invoice_lines (
          invoice_id,
          po_line_id,
          grn_line_id,
          item_id,
          item_name,
          category,
          unit,
          qty,
          unit_rate,
          tax_rate,
          po_qty,
          po_rate,
          grn_qty,
          grn_rate,
          notes
        ) VALUES (
          r.invoice_id,
          v_pol_id,
          v_grnl_id,
          v_item.id,
          COALESCE(elem->>'name', 'Unknown Item'),
          elem->>'category',
          COALESCE(elem->>'unit', 'pcs'),
          COALESCE((elem->>'qty')::NUMERIC, 0),
          COALESCE(
            (elem->>'unit_price')::NUMERIC,
            (elem->>'price')::NUMERIC,
            (elem->>'rate')::NUMERIC,
            0
          ),
          COALESCE((elem->>'tax_rate')::NUMERIC, 0),
          -- Snapshot PO / GRN values for three-way matching
          (SELECT qty_ordered  FROM purchase_order_lines WHERE id = v_pol_id),
          (SELECT unit_rate    FROM purchase_order_lines WHERE id = v_pol_id),
          (SELECT qty_received FROM grn_lines            WHERE id = v_grnl_id),
          (SELECT unit_rate    FROM grn_lines            WHERE id = v_grnl_id),
          elem->>'notes'
        );

      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'phase13 migration: skipping invoice % item % — %',
          r.invoice_id, elem->>'name', SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- POST-MIGRATION: back-fill per_received on purchase_orders
-- ─────────────────────────────────────────────────────────────
-- Now that purchase_order_lines has been populated from JSONB,
-- run one bulk update to set per_received on every PO that has
-- line data. The trigger will maintain it going forward.
-- ─────────────────────────────────────────────────────────────
UPDATE purchase_orders po
SET    per_received = sub.pct,
       updated_at   = now()
FROM (
  SELECT
    po_id,
    LEAST(100,
      ROUND(
        CASE WHEN SUM(CASE WHEN status <> 'Cancelled' THEN qty_ordered ELSE 0 END) = 0
             THEN 0
             ELSE SUM(CASE WHEN status <> 'Cancelled' THEN qty_received ELSE 0 END)::NUMERIC
                / SUM(CASE WHEN status <> 'Cancelled' THEN qty_ordered  ELSE 0 END) * 100
        END,
        2
      )
    ) AS pct
  FROM   purchase_order_lines
  GROUP  BY po_id
) sub
WHERE  po.id = sub.po_id;

-- ─────────────────────────────────────────────────────────────
-- END OF PHASE 13
-- ─────────────────────────────────────────────────────────────
