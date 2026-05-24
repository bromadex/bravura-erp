-- supabase/erp_u08_workflow_rules.sql
-- Phase 8: Approval thresholds + conditional workflow rules

-- ── 1. APPROVAL THRESHOLDS ───────────────────────────────────
-- Tiered approval requirements by document type and amount range.
-- Rows are evaluated in ascending order of min_amount.
-- The first row where doc_amount >= min_amount AND (max_amount IS NULL OR doc_amount < max_amount)
-- defines the required approver role.

CREATE TABLE IF NOT EXISTS approval_thresholds (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  document_type  TEXT NOT NULL,   -- purchase_order | purchase_requisition | store_requisition | payment_voucher | purchase_invoice
  min_amount     NUMERIC(15,4) NOT NULL DEFAULT 0,
  max_amount     NUMERIC(15,4),   -- NULL = no upper limit (top tier)
  approver_role  TEXT NOT NULL,   -- hod | finance_manager | ceo | md | board
  approver_label TEXT NOT NULL,   -- Human-readable label shown in UI
  requires_two   BOOLEAN NOT NULL DEFAULT FALSE,  -- require two approvers at this tier?
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_at_doc_type  ON approval_thresholds (document_type);
CREATE INDEX IF NOT EXISTS idx_at_min_amount ON approval_thresholds (min_amount);

-- Seed default thresholds for Purchase Orders (ZMW)
INSERT INTO approval_thresholds (id, document_type, min_amount, max_amount, approver_role, approver_label, notes)
VALUES
  (gen_random_uuid()::text, 'purchase_order',   0,        5000,  'hod',             'Head of Department',  'Standard HOD approval'),
  (gen_random_uuid()::text, 'purchase_order',   5000,     50000, 'finance_manager', 'Finance Manager',     'Finance review required'),
  (gen_random_uuid()::text, 'purchase_order',   50000,    NULL,  'ceo',             'CEO / MD',            'Executive approval required')
ON CONFLICT DO NOTHING;

-- Seed for Purchase Requisitions
INSERT INTO approval_thresholds (id, document_type, min_amount, max_amount, approver_role, approver_label)
VALUES
  (gen_random_uuid()::text, 'purchase_requisition', 0,    10000, 'hod',             'Head of Department'),
  (gen_random_uuid()::text, 'purchase_requisition', 10000, NULL, 'finance_manager', 'Finance Manager')
ON CONFLICT DO NOTHING;

-- Seed for Payment Vouchers
INSERT INTO approval_thresholds (id, document_type, min_amount, max_amount, approver_role, approver_label)
VALUES
  (gen_random_uuid()::text, 'payment_voucher', 0,      10000, 'finance_manager', 'Finance Manager'),
  (gen_random_uuid()::text, 'payment_voucher', 10000,  NULL,  'ceo',             'CEO / MD')
ON CONFLICT DO NOTHING;


-- ── 2. WORKFLOW RULES ────────────────────────────────────────
-- Conditional routing rules evaluated on document submission.
-- Rules fire AFTER threshold evaluation and can override or augment.

CREATE TABLE IF NOT EXISTS erp_workflow_rules (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  rule_name       TEXT NOT NULL,
  document_type   TEXT NOT NULL,  -- purchase_order | goods_received | store_requisition | etc.
  -- Condition
  condition_field TEXT NOT NULL,  -- total_amount | department | category | supplier_id | item_count
  condition_op    TEXT NOT NULL,  -- gt | lt | gte | lte | eq | neq | in | contains
  condition_value TEXT NOT NULL,  -- numeric string or comma-separated values for 'in'
  -- Action when condition is TRUE
  action_type     TEXT NOT NULL DEFAULT 'require_approver',
  -- require_approver | skip_step | block_submission | send_notification | flag_for_review
  action_value    TEXT NOT NULL,  -- role name, step name, or notification target
  action_label    TEXT,           -- Human-readable description of action
  priority        INT  NOT NULL DEFAULT 10,  -- lower number fires first
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wfr_doc_type  ON erp_workflow_rules (document_type);
CREATE INDEX IF NOT EXISTS idx_wfr_priority  ON erp_workflow_rules (priority);
CREATE INDEX IF NOT EXISTS idx_wfr_is_active ON erp_workflow_rules (is_active);

-- Seed example rules
INSERT INTO erp_workflow_rules
  (id, rule_name, document_type, condition_field, condition_op, condition_value,
   action_type, action_value, action_label, priority, notes)
VALUES
  (gen_random_uuid()::text,
   'High-value PO flag', 'purchase_order',
   'total_amount', 'gte', '100000',
   'flag_for_review', 'board', 'Flag for Board Review',
   1, 'POs above 100,000 require board notification'),
  (gen_random_uuid()::text,
   'Foreign supplier escalation', 'purchase_order',
   'supplier_type', 'eq', 'foreign',
   'require_approver', 'finance_manager', 'Finance Manager approval',
   5, 'International purchases always need Finance sign-off'),
  (gen_random_uuid()::text,
   'IT equipment review', 'purchase_order',
   'category', 'eq', 'IT Equipment',
   'require_approver', 'it_manager', 'IT Manager approval',
   10, 'IT equipment needs ICT department sign-off')
ON CONFLICT DO NOTHING;
