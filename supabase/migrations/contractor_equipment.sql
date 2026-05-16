-- Contractor Equipment Management
-- Tracks externally hired equipment, daily usage logs, billing, and AP integration

-- ── Master register ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_equipment (
  id                   TEXT PRIMARY KEY,
  ce_code              TEXT UNIQUE NOT NULL,
  contractor_name      TEXT NOT NULL,
  equipment_type       TEXT NOT NULL,
  equipment_description TEXT,
  registration         TEXT,
  assigned_project     TEXT,
  rate_type            TEXT NOT NULL DEFAULT 'hourly', -- hourly | daily | monthly
  rate_amount          NUMERIC NOT NULL DEFAULT 0,
  currency             TEXT DEFAULT 'USD',
  contract_start       DATE,
  contract_end         DATE,
  invoice_cycle        TEXT DEFAULT 'monthly',         -- weekly | biweekly | monthly
  status               TEXT DEFAULT 'Active',          -- Active | Suspended | Completed
  contact_person       TEXT,
  contact_phone        TEXT,
  notes                TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ── Daily usage logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractor_usage_logs (
  id                   TEXT PRIMARY KEY,
  cu_code              TEXT UNIQUE NOT NULL,
  equipment_id         TEXT REFERENCES contractor_equipment(id) ON DELETE CASCADE,
  date                 DATE NOT NULL,
  start_hours          NUMERIC DEFAULT 0,
  end_hours            NUMERIC DEFAULT 0,
  hours_worked         NUMERIC,                    -- calculated or manual override
  activity_description TEXT,
  operator_name        TEXT,
  operator_id          TEXT,
  supervisor_name      TEXT,
  supervisor_id        TEXT,
  attachment_url       TEXT,
  daily_charge         NUMERIC DEFAULT 0,          -- auto-calculated from rate
  status               TEXT DEFAULT 'draft',       -- draft | submitted | pending | approved | rejected | cancelled
  workflow_instance_id TEXT,
  rejection_reason     TEXT,
  journal_entry_ref    TEXT,                       -- set when posted to accounts
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cul_equipment ON contractor_usage_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_cul_date      ON contractor_usage_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_cul_status    ON contractor_usage_logs(status);

-- ── Txn-code sequence seeds ───────────────────────────────────────────────────
INSERT INTO code_sequences (prefix, year, last_number)
VALUES
  ('CE', EXTRACT(YEAR FROM now())::int, 0),
  ('CU', EXTRACT(YEAR FROM now())::int, 0),
  ('CI', EXTRACT(YEAR FROM now())::int, 0)
ON CONFLICT (prefix, year) DO NOTHING;
