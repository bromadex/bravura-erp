-- erp_u20_job_costing.sql
-- Phase 21: Job Costing — jobs register, cost entries, SR job tagging
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ═══════════════════════════════════════════════════════════════════
-- 1. JOBS REGISTER
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_number        TEXT NOT NULL UNIQUE,          -- JOB-0001
  title             TEXT NOT NULL,
  client_name       TEXT,                          -- external client or internal dept
  status            TEXT NOT NULL DEFAULT 'Open'
                      CHECK (status IN ('Open','In Progress','On Hold','Completed','Cancelled')),
  start_date        DATE,
  end_date          DATE,
  department        TEXT,
  cost_center       TEXT,
  project_manager   TEXT,

  -- Budget
  budget_materials  NUMERIC(18,4) NOT NULL DEFAULT 0,
  budget_labour     NUMERIC(18,4) NOT NULL DEFAULT 0,
  budget_overhead   NUMERIC(18,4) NOT NULL DEFAULT 0,
  budget_other      NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Contract / Revenue
  contract_value    NUMERIC(18,4),                -- agreed client contract amount (optional)

  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_dept     ON jobs(department);

-- ═══════════════════════════════════════════════════════════════════
-- 2. JOB COST ENTRIES
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_cost_entries (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  cost_type     TEXT NOT NULL DEFAULT 'Material'
                  CHECK (cost_type IN ('Material','Labour','Overhead','Subcontractor','Other')),

  -- Source tracing
  source_type   TEXT     -- 'StoreRequisition' | 'PayrollRecord' | 'PurchaseInvoice' | 'Manual'
                  CHECK (source_type IN ('StoreRequisition','PayrollRecord','PurchaseInvoice','Manual',NULL)),
  source_ref    TEXT,    -- SR number / payroll period / PI number

  -- Line detail
  description   TEXT NOT NULL,
  qty           NUMERIC(15,4) NOT NULL DEFAULT 1,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  rate          NUMERIC(15,4) NOT NULL DEFAULT 0,
  amount        NUMERIC(15,4) GENERATED ALWAYS AS (qty * rate) STORED,

  posting_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jce_job      ON job_cost_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_jce_type     ON job_cost_entries(cost_type);
CREATE INDEX IF NOT EXISTS idx_jce_date     ON job_cost_entries(posting_date);

-- ═══════════════════════════════════════════════════════════════════
-- 3. TAG JOB ON STORE REQUISITIONS
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE store_requisitions
  ADD COLUMN IF NOT EXISTS job_id     TEXT,    -- FK jobs(id) — TEXT
  ADD COLUMN IF NOT EXISTS job_number TEXT;    -- denormalised for speed

-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cost_entries   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_jobs"             ON jobs;
DROP POLICY IF EXISTS "auth_job_cost_entries" ON job_cost_entries;

CREATE POLICY "auth_jobs"
  ON jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_job_cost_entries"
  ON job_cost_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 5. NUMBERING SERIES
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO numbering_series (series_key, prefix, padding, description)
VALUES ('jobs', 'JOB-', 4, 'Job Costing')
ON CONFLICT (series_key) DO NOTHING;
