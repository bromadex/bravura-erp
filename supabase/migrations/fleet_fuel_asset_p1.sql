-- ============================================================
-- Fleet / Fuel / Asset Management — Phase 1 Upgrade
-- Run this in the Supabase SQL editor.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── 1. asset_registry: engine_number (make/model/year/vin_serial already exist) ──
ALTER TABLE asset_registry ADD COLUMN IF NOT EXISTS engine_number TEXT;
ALTER TABLE asset_registry ADD COLUMN IF NOT EXISTS fuel_type     TEXT;
ALTER TABLE asset_registry ADD COLUMN IF NOT EXISTS chassis_number TEXT;

-- ── 2. Meter Readings — historical odometer / hour meter log ─────────────────
CREATE TABLE IF NOT EXISTS meter_readings (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id        TEXT NOT NULL REFERENCES asset_registry(id) ON DELETE CASCADE,
  reading_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  reading_value   NUMERIC NOT NULL,
  reading_type    TEXT NOT NULL DEFAULT 'odometer', -- odometer | hour_meter
  reading_source  TEXT NOT NULL DEFAULT 'manual',   -- manual | trip | service | import
  reference_id    TEXT,    -- vehicle_trips.id or work_order id if auto-captured
  fuel_used       NUMERIC, -- litres consumed since last reading (optional)
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mr_asset      ON meter_readings(asset_id);
CREATE INDEX IF NOT EXISTS idx_mr_date       ON meter_readings(reading_date DESC);
CREATE INDEX IF NOT EXISTS idx_mr_asset_date ON meter_readings(asset_id, reading_date DESC);

-- ── 3. Accident Reports ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accident_reports (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  report_number       TEXT UNIQUE,
  asset_id            TEXT REFERENCES asset_registry(id),
  asset_reg           TEXT NOT NULL,
  asset_type          TEXT NOT NULL DEFAULT 'vehicle',
  incident_date       DATE NOT NULL,
  incident_time       TEXT,
  incident_location   TEXT,
  reported_by         TEXT,
  driver_operator     TEXT,
  driver_id           TEXT REFERENCES employees(id),
  incident_type       TEXT NOT NULL DEFAULT 'accident',
  -- accident | theft | vandalism | fire | flood | breakdown | hit_and_run | other
  severity            TEXT NOT NULL DEFAULT 'minor',
  -- minor | moderate | major | total_loss
  description         TEXT NOT NULL,
  third_party_involved BOOLEAN DEFAULT FALSE,
  third_party_details  TEXT,
  police_report_no    TEXT,
  police_station      TEXT,
  estimated_damage    NUMERIC DEFAULT 0,
  actual_repair_cost  NUMERIC DEFAULT 0,
  insurance_claim_no  TEXT,
  insurance_company   TEXT,
  claim_amount        NUMERIC DEFAULT 0,
  claim_status        TEXT DEFAULT 'not_claimed',
  -- not_claimed | submitted | approved | rejected | settled
  vehicle_driveable   BOOLEAN DEFAULT TRUE,
  downtime_days       INTEGER DEFAULT 0,
  photos_url          TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  -- open | under_investigation | resolved | closed
  resolved_date       DATE,
  resolution_notes    TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_asset   ON accident_reports(asset_id);
CREATE INDEX IF NOT EXISTS idx_ar_date    ON accident_reports(incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_ar_status  ON accident_reports(status);

-- ── 4. Fleet Documents — license, insurance, registration, roadworthy ────────
CREATE TABLE IF NOT EXISTS fleet_documents (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id        TEXT NOT NULL REFERENCES asset_registry(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,
  -- vehicle_license | insurance | roadworthy | registration | fitness | permit | other
  doc_number      TEXT,
  issuing_authority TEXT,
  issue_date      DATE,
  expiry_date     DATE,
  coverage_amount NUMERIC,
  insurer         TEXT,
  file_url        TEXT,
  reminder_days   INTEGER DEFAULT 30,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_asset    ON fleet_documents(asset_id);
CREATE INDEX IF NOT EXISTS idx_fd_expiry   ON fleet_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_fd_type     ON fleet_documents(doc_type);

-- ── 5. Enhance vehicle_trips for proper trip management ──────────────────────
-- Change vehicle_id FK: allow asset_registry IDs (not just fleet.id)
ALTER TABLE vehicle_trips
  ADD COLUMN IF NOT EXISTS trip_no          TEXT,
  ADD COLUMN IF NOT EXISTS driver_id        TEXT,
  ADD COLUMN IF NOT EXISTS passenger_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purpose_category TEXT DEFAULT 'operations',
  -- operations | transport | delivery | site_visit | personal | other
  ADD COLUMN IF NOT EXISTS route_from       TEXT,
  ADD COLUMN IF NOT EXISTS route_to         TEXT,
  ADD COLUMN IF NOT EXISTS project_id       TEXT,
  ADD COLUMN IF NOT EXISTS cost_center      TEXT,
  ADD COLUMN IF NOT EXISTS fuel_issued_id   TEXT,
  ADD COLUMN IF NOT EXISTS approval_status  TEXT DEFAULT 'approved',
  -- draft | submitted | approved | rejected
  ADD COLUMN IF NOT EXISTS approved_by      TEXT,
  ADD COLUMN IF NOT EXISTS trip_type        TEXT DEFAULT 'outward',
  -- outward | return | round_trip
  ADD COLUMN IF NOT EXISTS asset_id         TEXT;  -- asset_registry.id (new trips)

CREATE INDEX IF NOT EXISTS idx_vt_asset  ON vehicle_trips(asset_id);
CREATE INDEX IF NOT EXISTS idx_vt_date   ON vehicle_trips(date DESC);

-- ── 6. Enhance fuel_issuance (the proper fuel table) ──────────────────────────
ALTER TABLE fuel_issuance
  ADD COLUMN IF NOT EXISTS txn_code         TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_id       TEXT,
  ADD COLUMN IF NOT EXISTS cost_center      TEXT,
  ADD COLUMN IF NOT EXISTS approval_status  TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by      TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS gl_entry_id      TEXT,
  ADD COLUMN IF NOT EXISTS asset_id         TEXT; -- asset_registry.id

CREATE UNIQUE INDEX IF NOT EXISTS idx_fi_txn ON fuel_issuance(txn_code) WHERE txn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_asset       ON fuel_issuance(asset_id);
CREATE INDEX IF NOT EXISTS idx_fi_date        ON fuel_issuance(date DESC);
CREATE INDEX IF NOT EXISTS idx_fi_tank        ON fuel_issuance(tank_id);

-- ── 7. Enhance fuel_tanks ────────────────────────────────────────────────────
ALTER TABLE fuel_tanks
  ADD COLUMN IF NOT EXISTS tank_code         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS station_name      TEXT,
  ADD COLUMN IF NOT EXISTS tank_type         TEXT DEFAULT 'above_ground',
  -- above_ground | underground | mobile_bowser | ibc
  ADD COLUMN IF NOT EXISTS unit_cost         NUMERIC DEFAULT 0, -- $/L current price
  ADD COLUMN IF NOT EXISTS last_dip_date     DATE,
  ADD COLUMN IF NOT EXISTS last_dip_value    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gl_account_code   TEXT,  -- for GL posting
  ADD COLUMN IF NOT EXISTS expense_account   TEXT;  -- fuel expense account

-- Add tank_id to dipstick_log for multi-tank support
ALTER TABLE dipstick_log
  ADD COLUMN IF NOT EXISTS tank_id TEXT REFERENCES fuel_tanks(id);

CREATE INDEX IF NOT EXISTS idx_dip_tank ON dipstick_log(tank_id);
CREATE INDEX IF NOT EXISTS idx_dip_date ON dipstick_log(date DESC);

-- ── 8. Fuel Requests — approval workflow ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_requests (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_no       TEXT UNIQUE,
  request_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  asset_id         TEXT REFERENCES asset_registry(id),
  asset_reg        TEXT,
  equipment_type   TEXT NOT NULL DEFAULT 'vehicle',
  requested_by     TEXT NOT NULL,
  requested_liters NUMERIC NOT NULL,
  fuel_type        TEXT NOT NULL DEFAULT 'DIESEL',
  tank_id          TEXT REFERENCES fuel_tanks(id),
  purpose          TEXT,
  project_id       TEXT,
  odometer_reading NUMERIC,
  engine_hours     NUMERIC,
  urgency          TEXT NOT NULL DEFAULT 'normal',
  -- normal | urgent | emergency
  status           TEXT NOT NULL DEFAULT 'pending',
  -- pending | approved | rejected | issued | cancelled
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  issued_qty       NUMERIC,
  issuance_id      TEXT REFERENCES fuel_issuance(id),
  notes            TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fr_status ON fuel_requests(status);
CREATE INDEX IF NOT EXISTS idx_fr_date   ON fuel_requests(request_date DESC);
CREATE INDEX IF NOT EXISTS idx_fr_asset  ON fuel_requests(asset_id);

-- ── 9. Work Order Parts — replace JSONB with proper inventory-linked table ────
CREATE TABLE IF NOT EXISTS wo_parts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wo_id           TEXT NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  item_id         TEXT REFERENCES items(id),
  item_code       TEXT,
  part_name       TEXT NOT NULL,
  qty             NUMERIC NOT NULL DEFAULT 1,
  unit_cost       NUMERIC NOT NULL DEFAULT 0,
  total_cost      NUMERIC GENERATED ALWAYS AS (qty * unit_cost) STORED,
  warehouse_id    TEXT REFERENCES warehouses(id),
  sle_id          TEXT,  -- stock_ledger_entries.id after deduction
  issued_at       TIMESTAMPTZ,
  issued_by       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wp_wo   ON wo_parts(wo_id);
CREATE INDEX IF NOT EXISTS idx_wp_item ON wo_parts(item_id);

-- ── 10. Work Order Labour ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wo_labour (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wo_id           TEXT NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  employee_id     TEXT REFERENCES employees(id),
  technician_name TEXT NOT NULL,
  labour_type     TEXT NOT NULL DEFAULT 'internal',
  -- internal | external | contractor
  hours           NUMERIC NOT NULL DEFAULT 0,
  hourly_rate     NUMERIC NOT NULL DEFAULT 0,
  total_cost      NUMERIC GENERATED ALWAYS AS (hours * hourly_rate) STORED,
  work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wl_wo ON wo_labour(wo_id);

-- ── 11. Asset Depreciation Schedules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_schedules (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id          TEXT NOT NULL REFERENCES asset_registry(id) ON DELETE CASCADE,
  asset_code        TEXT NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  -- straight_line | reducing_balance | units_of_production
  purchase_cost     NUMERIC NOT NULL DEFAULT 0,
  salvage_value     NUMERIC NOT NULL DEFAULT 0,
  useful_life_years NUMERIC NOT NULL DEFAULT 5,
  depreciable_value NUMERIC GENERATED ALWAYS AS (purchase_cost - salvage_value) STORED,
  annual_rate       NUMERIC DEFAULT 0,  -- for reducing balance
  start_date        DATE NOT NULL,
  expected_end_date DATE,
  total_depreciated NUMERIC NOT NULL DEFAULT 0,
  book_value        NUMERIC,  -- updated on each depreciation entry
  status            TEXT NOT NULL DEFAULT 'active',
  -- active | suspended | fully_depreciated | disposed
  gl_asset_account     TEXT,   -- Fixed Asset account code
  gl_depreciation_acct TEXT,   -- Depreciation Expense account code
  gl_accum_depr_acct   TEXT,   -- Accumulated Depreciation account code
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_asset  ON asset_depreciation_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON asset_depreciation_schedules(status);

-- ── 12. Asset Depreciation Entries ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_entries (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  schedule_id       TEXT NOT NULL REFERENCES asset_depreciation_schedules(id),
  asset_id          TEXT NOT NULL,
  entry_date        DATE NOT NULL,
  period_label      TEXT NOT NULL,  -- e.g. "2026-01"
  depreciation_amount NUMERIC NOT NULL DEFAULT 0,
  book_value_after  NUMERIC NOT NULL DEFAULT 0,
  journal_entry_id  TEXT,  -- journal_entries.id after GL posting
  status            TEXT NOT NULL DEFAULT 'Draft',
  -- Draft | Posted | Cancelled
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ade_schedule ON asset_depreciation_entries(schedule_id);
CREATE INDEX IF NOT EXISTS idx_ade_asset    ON asset_depreciation_entries(asset_id);
CREATE INDEX IF NOT EXISTS idx_ade_date     ON asset_depreciation_entries(entry_date DESC);

-- ── 13. Notification templates for fleet expiries ───────────────────────────
INSERT INTO notification_templates (id, event_type, type, title, message, link, category, send_email, send_push)
VALUES
  (gen_random_uuid()::text, 'fleet_license_expiry', 'warning',
   'Vehicle License Expiring', 'Vehicle {{asset}} license expires on {{date}}',
   '/module/fleet/vehicles', 'fleet', true, true),
  (gen_random_uuid()::text, 'fleet_insurance_expiry', 'warning',
   'Vehicle Insurance Expiring', 'Vehicle {{asset}} insurance expires on {{date}}',
   '/module/fleet/vehicles', 'fleet', true, true),
  (gen_random_uuid()::text, 'fleet_roadworthy_expiry', 'warning',
   'Roadworthy Certificate Expiring', 'Vehicle {{asset}} roadworthy expires on {{date}}',
   '/module/fleet/vehicles', 'fleet', true, true),
  (gen_random_uuid()::text, 'fuel_request_submitted', 'info',
   'Fuel Request Submitted', 'Fuel request {{request_no}} submitted by {{name}} for {{asset}}',
   '/module/fuel/requests', 'fuel', false, true),
  (gen_random_uuid()::text, 'fuel_request_approved', 'success',
   'Fuel Request Approved', 'Your fuel request {{request_no}} has been approved',
   '/module/fuel/requests', 'fuel', false, true)
ON CONFLICT (event_type) DO NOTHING;

-- ── 14. Numbering series for new documents ───────────────────────────────────
INSERT INTO numbering_series (series_key, prefix, padding, current_val, description)
VALUES
  ('TRIP', 'TRIP', 5, 0, 'Vehicle Trip Numbers'),
  ('MR',   'MR',   5, 0, 'Meter Readings'),
  ('ACC',  'ACC',  5, 0, 'Accident Reports'),
  ('FLR',  'FLR',  5, 0, 'Fuel Requests'),
  ('DEPR', 'DEPR', 5, 0, 'Depreciation Entries')
ON CONFLICT (series_key) DO NOTHING;
