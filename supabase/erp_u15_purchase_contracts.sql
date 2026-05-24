-- erp_u15_purchase_contracts.sql
-- Purchase Contract Register — rate contracts, framework agreements, blanket rate cards.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ═══════════════════════════════════════════════════════════════════
-- 1. PURCHASE CONTRACTS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS purchase_contracts (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,

  -- Identity
  contract_no     TEXT NOT NULL UNIQUE,        -- e.g. PC-0001
  title           TEXT NOT NULL,               -- short description
  contract_type   TEXT NOT NULL DEFAULT 'Rate Contract'
                    CHECK (contract_type IN (
                      'Rate Contract',          -- agreed unit rates for items
                      'Framework Agreement',    -- general terms, price on order
                      'Blanket Order',          -- fixed total value call-off
                      'Fixed Price'             -- lump sum engagement
                    )),

  -- Supplier
  supplier_id     TEXT REFERENCES suppliers(id),
  supplier_name   TEXT,                         -- denormalised for speed / deleted suppliers

  -- Validity
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Draft','Active','Expired','Terminated','Renewed')),

  -- Financial
  currency        TEXT NOT NULL DEFAULT 'USD',
  contract_value  NUMERIC(18,4),               -- NULL = open / framework
  committed_value NUMERIC(18,4) NOT NULL DEFAULT 0,   -- running total of POs raised

  -- Terms
  payment_terms   TEXT,                        -- e.g. "Net 30", "50% advance"
  delivery_terms  TEXT,                        -- e.g. "DDP Harare", "EXW Beitbridge"
  notice_period   INTEGER,                     -- days notice to terminate

  -- Metadata
  renewal_alert_days INTEGER NOT NULL DEFAULT 30,  -- alert N days before expiry
  notes           TEXT,
  document_ref    TEXT,                        -- file reference / scan location
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. CONTRACT LINE ITEMS (rates per item under this contract)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS purchase_contract_lines (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  contract_id     TEXT NOT NULL REFERENCES purchase_contracts(id) ON DELETE CASCADE,

  item_id         TEXT REFERENCES items(id),
  item_name       TEXT NOT NULL,
  item_code       TEXT,
  unit            TEXT NOT NULL DEFAULT 'pcs',
  contracted_rate NUMERIC(15,4) NOT NULL DEFAULT 0,
  min_qty         NUMERIC(15,4),
  max_qty         NUMERIC(15,4),
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pc_supplier  ON purchase_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pc_status    ON purchase_contracts(status);
CREATE INDEX IF NOT EXISTS idx_pc_end_date  ON purchase_contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_pcl_contract ON purchase_contract_lines(contract_id);
CREATE INDEX IF NOT EXISTS idx_pcl_item     ON purchase_contract_lines(item_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. NUMBERING SERIES
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO numbering_series (entity, prefix, padding, description)
VALUES ('purchase_contracts', 'PC-', 4, 'Purchase Contracts')
ON CONFLICT (entity) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 5. RLS — open to authenticated users (inherits org policy)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE purchase_contracts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_contract_lines  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_purchase_contracts"       ON purchase_contracts;
DROP POLICY IF EXISTS "auth_purchase_contract_lines"  ON purchase_contract_lines;

CREATE POLICY "auth_purchase_contracts"
  ON purchase_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_purchase_contract_lines"
  ON purchase_contract_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
