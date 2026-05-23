-- ============================================================
-- Phase 18: Governance — Notification Schedules, Policies,
--           Overdue PO View, Audit Summary Function
-- All statements are idempotent.
-- ============================================================

-- ── 1. Notification Schedules ────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_schedules (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  schedule_key     TEXT UNIQUE NOT NULL,
  description      TEXT NOT NULL,
  trigger_type     TEXT NOT NULL,       -- 'threshold' | 'age' | 'status'
  module           TEXT NOT NULL,       -- 'inventory' | 'procurement'
  entity_type      TEXT NOT NULL,       -- 'bin' | 'purchase_order' | 'purchase_invoice'
  condition_field  TEXT,                -- e.g. 'actual_qty', 'expected_date', 'due_date'
  condition_op     TEXT,                -- 'lte' | 'gte' | 'days_overdue'
  condition_value  NUMERIC,             -- e.g. threshold qty, 0 for overdue
  target_roles     TEXT[] DEFAULT '{}',
  is_active        BOOLEAN DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Seed default notification schedules
INSERT INTO notification_schedules
  (schedule_key, description, trigger_type, module, entity_type, condition_field, condition_op, condition_value, target_roles)
VALUES
  (
    'low_stock_daily',
    'Daily alert when bin quantity falls at or below reorder level',
    'threshold', 'inventory', 'bin',
    'actual_qty', 'lte', NULL,
    ARRAY['role_storekeeper', 'role_store_manager']
  ),
  (
    'expiring_batches_weekly',
    'Weekly alert for item batches expiring within 30 days',
    'threshold', 'inventory', 'item_batches',
    'expiry_date', 'lte', 30,
    ARRAY['role_storekeeper']
  ),
  (
    'overdue_po_daily',
    'Daily alert for purchase orders past their expected delivery date',
    'age', 'procurement', 'purchase_order',
    'expected_date', 'days_overdue', 1,
    ARRAY['role_procurement_officer']
  ),
  (
    'unpaid_invoices_weekly',
    'Weekly alert for purchase invoices unpaid 7 or more days past due date',
    'age', 'procurement', 'purchase_invoice',
    'due_date', 'days_overdue', 7,
    ARRAY['role_finance_officer']
  ),
  (
    'pending_requisitions_daily',
    'Daily alert for store requisitions in submitted status for 2 or more days',
    'status', 'procurement', 'store_requisition',
    'status', 'gte', 2,
    ARRAY['role_hod']
  )
ON CONFLICT (schedule_key) DO NOTHING;

-- ── 2. Governance Policies ───────────────────────────────────
CREATE TABLE IF NOT EXISTS governance_policies (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  policy_key    TEXT UNIQUE NOT NULL,
  policy_name   TEXT NOT NULL,
  module        TEXT NOT NULL,
  description   TEXT,
  value_type    TEXT NOT NULL DEFAULT 'boolean', -- 'boolean' | 'number' | 'text'
  value_boolean BOOLEAN,
  value_number  NUMERIC,
  value_text    TEXT,
  is_enforced   BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Seed governance policies
INSERT INTO governance_policies
  (policy_key, policy_name, module, description, value_type, value_boolean, value_number, is_enforced)
VALUES
  (
    'require_po_for_grn',
    'Require Purchase Order before GRN',
    'procurement',
    'A linked and approved Purchase Order must exist before a Goods Received Note can be created.',
    'boolean', TRUE, NULL, TRUE
  ),
  (
    'require_3way_match_before_payment',
    'Require 3-Way Match before Invoice Payment',
    'procurement',
    'Block invoice payment unless PO, GRN, and invoice quantities and amounts are reconciled.',
    'boolean', TRUE, NULL, TRUE
  ),
  (
    'max_po_without_approval',
    'Maximum PO Value without Finance Approval',
    'procurement',
    'Purchase Orders above this value (ZMW) must be approved by the Finance Officer before processing.',
    'number', NULL, 5000, TRUE
  ),
  (
    'stock_out_requires_authorization',
    'Stock Issue Requires Authorization',
    'inventory',
    'All stock issues must carry a valid authorized_by reference before quantities are deducted.',
    'boolean', TRUE, NULL, TRUE
  ),
  (
    'batch_expiry_quarantine_auto',
    'Auto-Quarantine Batches Near Expiry',
    'inventory',
    'Automatically move batches to quarantine status when they are within 7 days of their expiry date.',
    'boolean', FALSE, NULL, TRUE
  ),
  (
    'negative_stock_allowed',
    'Allow Negative Stock',
    'inventory',
    'Permit stock quantities to fall below zero. Disable to enforce strict stock-on-hand controls.',
    'boolean', FALSE, NULL, TRUE
  )
ON CONFLICT (policy_key) DO NOTHING;

-- ── 3. Overdue Purchase Orders View ─────────────────────────
CREATE OR REPLACE VIEW v_overdue_pos AS
  SELECT
    po.id,
    po.po_number,
    po.supplier_name,
    po.order_date,
    po.expected_date,
    po.total_amount,
    po.status,
    po.department,
    CURRENT_DATE - po.expected_date::date AS days_overdue
  FROM purchase_orders po
  WHERE po.expected_date IS NOT NULL
    AND po.expected_date::date < CURRENT_DATE
    AND po.status NOT IN ('Received', 'Cancelled', 'Closed');

-- ── 4. Audit Summary Function ────────────────────────────────
-- Returns a breakdown of audit log events by module and action
-- over the last p_days days (default 30). Used by the dashboard.
CREATE OR REPLACE FUNCTION fn_audit_summary(p_days INT DEFAULT 30)
RETURNS TABLE(module TEXT, action TEXT, event_count BIGINT) AS $$
  SELECT
    module,
    action,
    COUNT(*) AS event_count
  FROM system_audit_logs
  WHERE created_at >= now() - make_interval(days => p_days)
  GROUP BY module, action
  ORDER BY event_count DESC;
$$ LANGUAGE sql;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_schedules_module
  ON notification_schedules (module);

CREATE INDEX IF NOT EXISTS idx_notif_schedules_active
  ON notification_schedules (is_active);

CREATE INDEX IF NOT EXISTS idx_gov_policies_module
  ON governance_policies (module);

CREATE INDEX IF NOT EXISTS idx_gov_policies_key
  ON governance_policies (policy_key);
