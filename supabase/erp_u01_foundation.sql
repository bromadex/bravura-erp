-- ============================================================
-- ERP Upgrade Phase 1 — SQL Foundation
-- File: erp_u01_foundation.sql
-- Idempotent. Safe to re-run.
--
-- Adds:
--   1.  SLE: transaction_type column
--   2.  Items: item_code, purchase_uom, stock_uom, uom_conversion_factor,
--              subcategory, standard_cost, preferred_supplier_id
--   3.  Warehouses: parent_warehouse_id, warehouse_type
--   4.  Purchase Requisitions: source_mr_id
--   5.  Purchase Orders: pr_id
--   6.  New tables: payment_vouchers, payment_voucher_lines,
--                   purchase_returns, purchase_return_lines,
--                   numbering_series
--   7.  GL config: grir_clearing seed
--   8.  Function: fn_item_balance(item_id)
--   9.  Indexes
-- ============================================================


-- ── 1. STOCK LEDGER ENTRIES — transaction_type ───────────────
-- High-level classification alongside existing voucher_type.
-- Values: 'Receipt' | 'Issue' | 'Transfer' | 'Reconciliation' | 'Adjustment' | 'Opening'
ALTER TABLE stock_ledger_entries
  ADD COLUMN IF NOT EXISTS transaction_type TEXT;

-- Back-fill transaction_type from existing voucher_type for historical rows
UPDATE stock_ledger_entries
SET transaction_type = CASE voucher_type
  WHEN 'StockIn'              THEN 'Receipt'
  WHEN 'PurchaseReceipt'      THEN 'Receipt'
  WHEN 'StockOut'             THEN 'Issue'
  WHEN 'StoreRequisition'     THEN 'Issue'
  WHEN 'StockTransfer'        THEN 'Transfer'
  WHEN 'StockReconciliation'  THEN 'Reconciliation'
  WHEN 'OpeningStock'         THEN 'Opening'
  ELSE 'Adjustment'
END
WHERE transaction_type IS NULL;


-- ── 2. ITEMS — extended master fields ───────────────────────

-- item_code: unique SKU / short code distinct from item name.
-- Nullable so existing rows are unaffected until manually assigned.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_code              TEXT,
  ADD COLUMN IF NOT EXISTS purchase_uom           TEXT DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS stock_uom              TEXT DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS uom_conversion_factor  NUMERIC(15,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS subcategory            TEXT,
  ADD COLUMN IF NOT EXISTS standard_cost          NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_supplier_id  TEXT;

-- Unique constraint on item_code (partial: only where not null)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_items_item_code
  ON items (item_code)
  WHERE item_code IS NOT NULL;

-- FK to suppliers (soft — no hard reference to avoid circular deps)
CREATE INDEX IF NOT EXISTS idx_items_preferred_supplier
  ON items (preferred_supplier_id)
  WHERE preferred_supplier_id IS NOT NULL;


-- ── 3. WAREHOUSES — hierarchy and type ──────────────────────
-- parent_warehouse_id is the new canonical FK column going forward.
-- (phase12 added parent_id; we keep both for backward compat.)
-- warehouse_type extends the existing type CHECK column with a
-- freeform column used by Phase 2+ logic.
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS parent_warehouse_id  TEXT REFERENCES warehouses(id),
  ADD COLUMN IF NOT EXISTS warehouse_type       TEXT DEFAULT 'store';
--   store | transit | virtual | scrap | rejected | finished_goods | wip

-- Sync parent_warehouse_id from existing parent_id for rows that have it
UPDATE warehouses
SET parent_warehouse_id = parent_id
WHERE parent_id IS NOT NULL AND parent_warehouse_id IS NULL;

-- Back-fill warehouse_type from existing type column
UPDATE warehouses
SET warehouse_type = CASE type
  WHEN 'stores'         THEN 'store'
  WHEN 'transit'        THEN 'transit'
  WHEN 'rejected'       THEN 'rejected'
  WHEN 'wip'            THEN 'wip'
  WHEN 'finished_goods' THEN 'finished_goods'
  WHEN 'virtual'        THEN 'virtual'
  ELSE 'store'
END
WHERE warehouse_type IS NULL OR warehouse_type = 'store';

CREATE INDEX IF NOT EXISTS idx_wh_parent_warehouse_id
  ON warehouses (parent_warehouse_id)
  WHERE parent_warehouse_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wh_warehouse_type
  ON warehouses (warehouse_type);


-- ── 4. PURCHASE REQUISITIONS — MR origin link ───────────────
-- Traces which Material Request originated this Purchase Requisition.
ALTER TABLE purchase_requisitions
  ADD COLUMN IF NOT EXISTS source_mr_id TEXT REFERENCES material_requests(id);

CREATE INDEX IF NOT EXISTS idx_pr_source_mr_id
  ON purchase_requisitions (source_mr_id)
  WHERE source_mr_id IS NOT NULL;


-- ── 5. PURCHASE ORDERS — PR origin link ─────────────────────
-- Traces which Purchase Requisition was converted to this PO.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS pr_id TEXT REFERENCES purchase_requisitions(id);

CREATE INDEX IF NOT EXISTS idx_po_pr_id
  ON purchase_orders (pr_id)
  WHERE pr_id IS NOT NULL;


-- ── 6. PAYMENT VOUCHERS ─────────────────────────────────────
-- Records actual payment against one or more purchase invoices.
-- Posts: DR Accounts Payable / CR Bank or Cash

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pv_number       TEXT UNIQUE NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'Bank Transfer',
  -- Bank Transfer | Cheque | Cash | Mobile Money
  bank_account    TEXT,
  cheque_no       TEXT,
  cheque_date     DATE,
  supplier_id     TEXT,
  supplier_name   TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'ZMW',
  total_amount    NUMERIC(15,4) NOT NULL DEFAULT 0,
  exchange_rate   NUMERIC(10,6) NOT NULL DEFAULT 1,
  reference_no    TEXT,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft',
  -- Draft | Posted | Cancelled
  posted_by       TEXT,
  posted_at       TIMESTAMPTZ,
  cancelled_by    TEXT,
  cancelled_at    TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_status       ON payment_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_pv_supplier_id  ON payment_vouchers (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pv_payment_date ON payment_vouchers (payment_date);


-- ── 7. PAYMENT VOUCHER LINES ─────────────────────────────────
-- Each line allocates a portion of the payment to one invoice.

CREATE TABLE IF NOT EXISTS payment_voucher_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pv_id           TEXT NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
  invoice_id      TEXT NOT NULL REFERENCES purchase_invoices(id),
  pi_number       TEXT,
  invoice_date    DATE,
  invoice_total   NUMERIC(15,4) NOT NULL DEFAULT 0,
  outstanding     NUMERIC(15,4) NOT NULL DEFAULT 0,
  -- amount allocated from this payment against this invoice
  amount_paid     NUMERIC(15,4) NOT NULL DEFAULT 0,
  discount_taken  NUMERIC(15,4) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvl_pv_id      ON payment_voucher_lines (pv_id);
CREATE INDEX IF NOT EXISTS idx_pvl_invoice_id ON payment_voucher_lines (invoice_id);


-- ── 8. PURCHASE RETURNS ─────────────────────────────────────
-- Reverses a GRN: negative SLE + GL reversal.
-- One purchase return per GRN (can be partial).

CREATE TABLE IF NOT EXISTS purchase_returns (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  pr_number       TEXT UNIQUE NOT NULL,    -- e.g. PRET-0001
  original_grn_id TEXT NOT NULL REFERENCES goods_received(id),
  original_grn_no TEXT,
  supplier_id     TEXT,
  supplier_name   TEXT NOT NULL,
  return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reason          TEXT NOT NULL,
  -- Damaged | Wrong Item | Over-delivery | Quality Rejection | Other
  total_returned_value NUMERIC(15,4) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Draft',
  -- Draft | Submitted | Dispatched | Cancelled
  credit_note_no  TEXT,     -- supplier's credit note reference
  notes           TEXT,
  submitted_by    TEXT,
  submitted_at    TIMESTAMPTZ,
  cancelled_by    TEXT,
  cancelled_at    TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pret_status         ON purchase_returns (status);
CREATE INDEX IF NOT EXISTS idx_pret_original_grn   ON purchase_returns (original_grn_id);
CREATE INDEX IF NOT EXISTS idx_pret_supplier_id    ON purchase_returns (supplier_id);


-- ── 9. PURCHASE RETURN LINES ─────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  purchase_return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  grn_line_id     TEXT REFERENCES grn_lines(id),
  item_id         TEXT NOT NULL REFERENCES items(id),
  item_name       TEXT NOT NULL,
  warehouse_id    TEXT NOT NULL REFERENCES warehouses(id),
  qty_received    NUMERIC(15,4) NOT NULL DEFAULT 0,   -- original received qty
  qty_returned    NUMERIC(15,4) NOT NULL DEFAULT 0,   -- qty being returned
  unit_rate       NUMERIC(15,4) NOT NULL DEFAULT 0,
  return_value    NUMERIC(15,4) GENERATED ALWAYS AS (qty_returned * unit_rate) STORED,
  batch_no        TEXT,
  reason          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pretl_return_id  ON purchase_return_lines (purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_pretl_item_id    ON purchase_return_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_pretl_grn_line   ON purchase_return_lines (grn_line_id);


-- ── 10. NUMBERING SERIES ────────────────────────────────────
-- Configurable auto-increment prefix per document type.

CREATE TABLE IF NOT EXISTS numbering_series (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  series_key   TEXT UNIQUE NOT NULL,   -- e.g. 'material_requests'
  prefix       TEXT NOT NULL,          -- e.g. 'MR-'
  padding      INT  NOT NULL DEFAULT 4,
  current_val  INT  NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default series for all document types
INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES
  ('material_requests',      'MR-',   4, 'Material Requests'),
  ('purchase_requisitions',  'PR-',   4, 'Purchase Requisitions'),
  ('purchase_orders',        'PO-',   4, 'Purchase Orders'),
  ('goods_received',         'GRN-',  4, 'Goods Received Notes'),
  ('purchase_invoices',      'PI-',   4, 'Purchase Invoices'),
  ('payment_vouchers',       'PV-',   4, 'Payment Vouchers'),
  ('store_requisitions',     'SR-',   4, 'Store Requisitions'),
  ('purchase_returns',       'PRET-', 4, 'Purchase Returns'),
  ('stock_transfers',        'ST-',   4, 'Stock Transfers'),
  ('landed_cost_vouchers',   'LCV-',  4, 'Landed Cost Vouchers')
ON CONFLICT (series_key) DO NOTHING;


-- ── 11. GL CONFIG — GRIR clearing account seed ─────────────
-- Goods Received But Not Invoiced clearing account.
-- GRN posts: DR Stock / CR GRIR
-- Invoice posts: DR GRIR  / CR Accounts Payable
INSERT INTO inventory_gl_config (event_type, description, is_active, created_at)
VALUES
  ('grir_clearing',
   'Goods Received But Not Invoiced (GRIR) clearing account — GRN → Invoice settlement',
   true, now()),
  ('purchase_return',
   'Purchase Return — reversal of GRN stock and GRIR entries',
   true, now()),
  ('payment_voucher',
   'Payment Voucher — AP settlement on posting',
   true, now())
ON CONFLICT (event_type) DO NOTHING;


-- ── 12. FUNCTION: fn_item_balance ───────────────────────────
-- Single source of truth for item on-hand balance.
-- Reads from bins (which are maintained exclusively by the SLE trigger).
-- Phase 2 will remove all direct items.balance writes and route through here.

CREATE OR REPLACE FUNCTION fn_item_balance(p_item_id TEXT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(actual_qty), 0)
  FROM   bins
  WHERE  item_id = p_item_id;
$$;

-- fn_item_balance_in_warehouse: scoped to one warehouse
CREATE OR REPLACE FUNCTION fn_item_balance_in_warehouse(
  p_item_id      TEXT,
  p_warehouse_id TEXT
)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(actual_qty, 0)
  FROM   bins
  WHERE  item_id      = p_item_id
    AND  warehouse_id = p_warehouse_id;
$$;


-- ── 13. FUNCTION: fn_next_series_number ─────────────────────
-- Atomically increments and returns the next formatted document number.
-- Example: fn_next_series_number('purchase_orders') → 'PO-0042'

CREATE OR REPLACE FUNCTION fn_next_series_number(p_series_key TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_prefix  TEXT;
  v_padding INT;
  v_next    INT;
BEGIN
  UPDATE numbering_series
  SET    current_val = current_val + 1,
         updated_at  = now()
  WHERE  series_key = p_series_key
    AND  is_active  = TRUE
  RETURNING prefix, padding, current_val
  INTO v_prefix, v_padding, v_next;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numbering series "%" not found or inactive', p_series_key;
  END IF;

  RETURN v_prefix || LPAD(v_next::TEXT, v_padding, '0');
END;
$$;


-- ── 14. INDEXES ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sle_transaction_type
  ON stock_ledger_entries (transaction_type);

CREATE INDEX IF NOT EXISTS idx_items_subcategory
  ON items (subcategory)
  WHERE subcategory IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_standard_cost
  ON items (standard_cost);

CREATE INDEX IF NOT EXISTS idx_pv_created_at
  ON payment_vouchers (created_at);

CREATE INDEX IF NOT EXISTS idx_pret_created_at
  ON purchase_returns (created_at);

CREATE INDEX IF NOT EXISTS idx_numbering_series_key
  ON numbering_series (series_key);


-- ============================================================
-- ERP Upgrade Phase 1 — Addendum
-- docstatus / amendment_no / cancel_reason, quality_inspections,
-- tax configuration tables
-- ============================================================


-- ── 15. DOCSTATUS — ERPNext document lifecycle ──────────────
-- 0 = Draft      (mutable, no financial/stock impact posted)
-- 1 = Submitted  (immutable, all impacts live)
-- 2 = Cancelled  (reversed, immutable)
-- Separate from the workflow status field (Draft/Pending/Approved/…).
-- amendment_no: increments each time a cancelled doc is re-created as an amendment.
-- cancel_reason: free-text reason captured at cancellation time.

ALTER TABLE material_requests
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE purchase_requisitions
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- purchase_orders already has cancellation_reason from procurement_enhancements.sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0;

ALTER TABLE goods_received
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE store_requisitions
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE landed_cost_vouchers
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- payment_vouchers already has cancellation_reason from Phase 1 CREATE TABLE above
ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0;

ALTER TABLE purchase_returns
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- rfq already has cancellation_reason
ALTER TABLE rfq
  ADD COLUMN IF NOT EXISTS docstatus    SMALLINT NOT NULL DEFAULT 0
    CHECK (docstatus IN (0, 1, 2)),
  ADD COLUMN IF NOT EXISTS amendment_no INT NOT NULL DEFAULT 0;

-- Indexes for docstatus on the highest-volume tables
CREATE INDEX IF NOT EXISTS idx_mr_docstatus   ON material_requests    (docstatus);
CREATE INDEX IF NOT EXISTS idx_pr_docstatus   ON purchase_requisitions (docstatus);
CREATE INDEX IF NOT EXISTS idx_po_docstatus   ON purchase_orders       (docstatus);
CREATE INDEX IF NOT EXISTS idx_grn_docstatus  ON goods_received        (docstatus);
CREATE INDEX IF NOT EXISTS idx_pi_docstatus   ON purchase_invoices     (docstatus);
CREATE INDEX IF NOT EXISTS idx_sr_docstatus   ON store_requisitions    (docstatus);
CREATE INDEX IF NOT EXISTS idx_pv_docstatus   ON payment_vouchers      (docstatus);
CREATE INDEX IF NOT EXISTS idx_pret_docstatus ON purchase_returns       (docstatus);


-- ── 16. QUALITY INSPECTIONS ──────────────────────────────────
-- One inspection per GRN line (or per purchase return line for returns).
-- Inspectors fill in per-parameter actual values; the row is Accepted
-- when all critical parameters pass.

CREATE TABLE IF NOT EXISTS quality_inspections (
  id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  qi_number           TEXT UNIQUE NOT NULL,
  inspection_type     TEXT NOT NULL DEFAULT 'Incoming',
  -- Incoming | Outgoing | In-Process
  status              TEXT NOT NULL DEFAULT 'Pending',
  -- Pending | Accepted | Rejected | Partially Accepted
  docstatus           SMALLINT NOT NULL DEFAULT 0,
  amendment_no        INT NOT NULL DEFAULT 0,
  cancel_reason       TEXT,

  -- Source links
  grn_id              TEXT REFERENCES goods_received(id),
  grn_line_id         TEXT REFERENCES grn_lines(id),
  purchase_return_id  TEXT REFERENCES purchase_returns(id),

  -- Item
  item_id             TEXT NOT NULL REFERENCES items(id),
  item_name           TEXT NOT NULL,
  batch_no            TEXT,
  warehouse_id        TEXT REFERENCES warehouses(id),

  -- Quantities
  inspection_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  inspector_name      TEXT,
  inspector_id        TEXT,
  sample_qty          NUMERIC(15,4) NOT NULL DEFAULT 0,
  accepted_qty        NUMERIC(15,4) NOT NULL DEFAULT 0,
  rejected_qty        NUMERIC(15,4) NOT NULL DEFAULT 0,

  -- Parameter results — [{name, min_value, max_value, actual_value, uom, pass}]
  parameters          JSONB NOT NULL DEFAULT '[]',

  acceptance_criteria TEXT,
  rejection_reason    TEXT,
  corrective_action   TEXT,
  remarks             TEXT,
  report_url          TEXT,

  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qi_status      ON quality_inspections (status);
CREATE INDEX IF NOT EXISTS idx_qi_docstatus   ON quality_inspections (docstatus);
CREATE INDEX IF NOT EXISTS idx_qi_item_id     ON quality_inspections (item_id);
CREATE INDEX IF NOT EXISTS idx_qi_grn_id      ON quality_inspections (grn_id);
CREATE INDEX IF NOT EXISTS idx_qi_grn_line_id ON quality_inspections (grn_line_id);
CREATE INDEX IF NOT EXISTS idx_qi_date        ON quality_inspections (inspection_date);

-- Back-link: grn_lines gets a quality_inspection_id for direct lookup
ALTER TABLE grn_lines
  ADD COLUMN IF NOT EXISTS quality_inspection_id TEXT REFERENCES quality_inspections(id);


-- ── 17. TAX CONFIGURATION ────────────────────────────────────

-- ── 17a. Tax categories (VAT groupings) ─────────────────────
CREATE TABLE IF NOT EXISTS tax_categories (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tax_categories (name, description, is_default)
VALUES
  ('Standard Rate',  'Standard rate VAT at the applicable national rate', TRUE),
  ('Zero-rated',     'Taxable at 0% — input VAT claimable by registered suppliers', FALSE),
  ('Exempt',         'Not subject to VAT — no input tax claimable', FALSE),
  ('Reverse Charge', 'Buyer accounts for VAT — typically imported services', FALSE)
ON CONFLICT (name) DO NOTHING;

-- ── 17b. Tax templates (named multi-row tax schedules) ───────
CREATE TABLE IF NOT EXISTS tax_templates (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name          TEXT UNIQUE NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'Purchase',
  -- Purchase | Sales | Both
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  description   TEXT,
  company       TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 17c. Tax template lines (rows within a template) ─────────
CREATE TABLE IF NOT EXISTS tax_template_lines (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_id       TEXT NOT NULL REFERENCES tax_templates(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  charge_type       TEXT NOT NULL DEFAULT 'On Net Total',
  -- On Net Total | On Previous Row Amount | Actual Amount
  description       TEXT,
  account_head      TEXT,     -- GL account code, e.g. 'VAT-INPUT', 'WITHHOLDING-TAX'
  rate              NUMERIC(10,4) NOT NULL DEFAULT 0,    -- percentage
  tax_amount        NUMERIC(15,4) NOT NULL DEFAULT 0,   -- used when charge_type = 'Actual Amount'
  included_in_price BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ttl_template_id ON tax_template_lines (template_id);
CREATE INDEX IF NOT EXISTS idx_tt_type         ON tax_templates (template_type);
CREATE INDEX IF NOT EXISTS idx_tt_is_default   ON tax_templates (is_default) WHERE is_default = TRUE;

-- ── 17d. Item-level tax template overrides ───────────────────
CREATE TABLE IF NOT EXISTS item_tax_templates (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tax_category_id TEXT REFERENCES tax_categories(id),
  tax_template_id TEXT REFERENCES tax_templates(id),
  valid_from      DATE,
  valid_to        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, tax_category_id)
);

CREATE INDEX IF NOT EXISTS idx_itt_item_id     ON item_tax_templates (item_id);
CREATE INDEX IF NOT EXISTS idx_itt_category_id ON item_tax_templates (tax_category_id);

-- ── 17e. Seed: Zambia VAT 16% default purchase template ──────
INSERT INTO tax_templates (name, template_type, is_default, description)
VALUES
  ('Zambia VAT 16%',       'Purchase', TRUE,  'Standard Zambian VAT at 16% on net total'),
  ('Zero-rated Purchase',  'Purchase', FALSE, 'Zero-rated purchase — 0% VAT, input claimable'),
  ('Exempt Purchase',      'Purchase', FALSE, 'VAT-exempt purchase — no input tax')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tax_template_lines (template_id, sort_order, charge_type, description, account_head, rate)
SELECT id, 1, 'On Net Total', 'VAT @ 16%', 'VAT-INPUT', 16
FROM   tax_templates
WHERE  name = 'Zambia VAT 16%'
  AND  NOT EXISTS (
    SELECT 1 FROM tax_template_lines
    WHERE template_id = (SELECT id FROM tax_templates WHERE name = 'Zambia VAT 16%')
  );

-- Add tax_template_id to procurement documents for per-document tax override
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS tax_template_id TEXT REFERENCES tax_templates(id),
  ADD COLUMN IF NOT EXISTS tax_amount      NUMERIC(15,4) DEFAULT 0;

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS tax_template_id TEXT REFERENCES tax_templates(id);

ALTER TABLE goods_received
  ADD COLUMN IF NOT EXISTS tax_template_id TEXT REFERENCES tax_templates(id);
