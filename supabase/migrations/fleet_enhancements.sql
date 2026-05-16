-- supabase/migrations/fleet_enhancements.sql
-- ERPNext-standard fleet additions: PM schedules, work orders, tyre lifecycle, downtime.
-- Run in Supabase SQL editor.

-- ── 1. Maintenance Schedule Templates ─────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id              TEXT NOT NULL,     -- fleet.id / generators.id / earth_movers.id
  asset_reg             TEXT,              -- display reg / code
  asset_type            TEXT NOT NULL,     -- vehicle | generator | earth_mover
  task_name             TEXT NOT NULL,     -- e.g. "Oil Change", "Major Service", "Inspection"
  task_category         TEXT NOT NULL DEFAULT 'service',
  -- engine | brakes | tyres | electrical | hydraulics | bodywork | lubrication | inspection | service | other
  interval_type         TEXT NOT NULL,     -- km | hours | days | date
  interval_value        NUMERIC,           -- e.g. 5000 (km), 250 (hours), 90 (days)
  next_due_date         DATE,
  next_due_km           NUMERIC,
  next_due_hours        NUMERIC,
  last_done_date        DATE,
  last_done_km          NUMERIC,
  last_done_hours       NUMERIC,
  priority              TEXT NOT NULL DEFAULT 'medium',  -- critical | high | medium | low
  estimated_cost        NUMERIC DEFAULT 0,
  assigned_to           TEXT,              -- mechanic / workshop
  instructions          TEXT,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ms_asset    ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_ms_due_date ON maintenance_schedules(next_due_date);

-- ── 2. Maintenance Work Orders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wo_number             TEXT UNIQUE,          -- nullable — set by app via code_sequences
  schedule_id           TEXT REFERENCES maintenance_schedules(id),
  asset_id              TEXT NOT NULL,
  asset_reg             TEXT,
  asset_type            TEXT NOT NULL,
  task_name             TEXT NOT NULL,
  task_category         TEXT NOT NULL DEFAULT 'service',
  priority              TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | critical
  status                TEXT NOT NULL DEFAULT 'open',
  -- open | in_progress | waiting_parts | closed | cancelled
  assigned_to           TEXT,              -- mechanic name
  workshop              TEXT,             -- internal | external workshop name
  description           TEXT,
  findings              TEXT,             -- what was found during work
  planned_start_date    DATE,
  planned_end_date      DATE,
  actual_end_date       DATE,
  odometer_at_wo        NUMERIC,
  odometer_at_service   NUMERIC,          -- final odometer at service completion
  hours_at_wo           NUMERIC,
  hour_meter_at_service NUMERIC,          -- final hour meter at service completion
  parts_used            JSONB DEFAULT '[]', -- [{name, part_number, qty, unit_cost, total}]
  labour_hours          NUMERIC DEFAULT 0,
  labour_rate           NUMERIC DEFAULT 0,
  labour_cost           NUMERIC GENERATED ALWAYS AS (labour_hours * labour_rate) STORED,
  parts_cost            NUMERIC DEFAULT 0,
  actual_cost           NUMERIC DEFAULT 0, -- total actual cost (parts + labour + misc)
  estimated_cost        NUMERIC DEFAULT 0,
  completion_notes      TEXT,
  invoice_number        TEXT,             -- external invoice ref
  approved_by           TEXT,
  notes                 TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wo_asset  ON maintenance_work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_date   ON maintenance_work_orders(planned_start_date);

-- ── 3. Tyre Inventory (master records) ────────────────────────────────
CREATE TABLE IF NOT EXISTS tyre_inventory (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tyre_code         TEXT UNIQUE,           -- e.g. TYR-2026-00001 (app-generated, nullable)
  serial_number     TEXT,
  brand             TEXT NOT NULL,
  size              TEXT NOT NULL,         -- e.g. "315/80R22.5"
  tyre_type         TEXT NOT NULL DEFAULT 'drive', -- steer | drive | trailer | spare
  ply_rating        TEXT,                  -- e.g. "20PR"
  load_index        TEXT,
  speed_rating      TEXT,
  tread_depth_new   NUMERIC DEFAULT 12,   -- mm when new (~12mm DOT standard)
  tread_depth_min   NUMERIC DEFAULT 2,    -- mm minimum legal/safety limit
  tread_depth_current NUMERIC,            -- last measured tread depth (mm)
  rated_km          NUMERIC,             -- manufacturer's rated lifespan in km
  purchase_date     DATE,
  purchase_cost     NUMERIC DEFAULT 0,
  supplier          TEXT,
  status            TEXT NOT NULL DEFAULT 'in_stock',
  -- in_stock | fitted | retreaded | scrapped
  current_vehicle   TEXT,               -- vehicle id if fitted
  current_position  TEXT,               -- FL | FR | RL | RR | spare | null
  km_accumulated    NUMERIC DEFAULT 0,  -- km run to date
  fitted_odometer   NUMERIC,            -- odometer reading when last fitted
  retread_count     INT DEFAULT 0,      -- number of times retreaded
  last_event        TEXT,               -- last movement event type
  last_event_date   DATE,
  scrapped_at       TIMESTAMPTZ,
  scrap_notes       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tyre_vehicle ON tyre_inventory(current_vehicle);
CREATE INDEX IF NOT EXISTS idx_tyre_status  ON tyre_inventory(status);

-- ── 4. Tyre Movements (fitment history) ───────────────────────────────
CREATE TABLE IF NOT EXISTS tyre_movements (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tyre_id          TEXT NOT NULL REFERENCES tyre_inventory(id),
  tyre_code        TEXT,
  event_type       TEXT NOT NULL,
  -- fit | remove | rotate | retread | inspect | scrap
  event_date       DATE NOT NULL,
  vehicle_id       TEXT,               -- fleet.id / earth_movers.id
  position         TEXT,              -- position after this event (FL/FR/RL/RR/spare)
  km_at_event      NUMERIC,           -- odometer / hour_meter at time of event
  tread_depth      NUMERIC,           -- measured tread depth at event (mm)
  condition_notes  TEXT,
  performed_by     TEXT,
  cost             NUMERIC DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tm_tyre    ON tyre_movements(tyre_id);
CREATE INDEX IF NOT EXISTS idx_tm_vehicle ON tyre_movements(vehicle_id);

-- ── 5. Enhance downtime_logs ──────────────────────────────────────────
ALTER TABLE downtime_logs
  ADD COLUMN IF NOT EXISTS cause_category      TEXT DEFAULT 'mechanical',
  -- mechanical | electrical | tyre | accident | scheduled | operator_error | other
  ADD COLUMN IF NOT EXISTS repair_cost         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'open',
  -- open | resolved
  ADD COLUMN IF NOT EXISTS closed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by           TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes    TEXT,
  ADD COLUMN IF NOT EXISTS wo_id               TEXT,
  ADD COLUMN IF NOT EXISTS odometer_at_breakdown NUMERIC,
  ADD COLUMN IF NOT EXISTS breakdown_location  TEXT;

-- ── 6. Enhance fleet table ────────────────────────────────────────────
ALTER TABLE fleet
  ADD COLUMN IF NOT EXISTS tare_weight         NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_vehicle_mass  NUMERIC,
  ADD COLUMN IF NOT EXISTS licence_expiry      DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry    DATE,
  ADD COLUMN IF NOT EXISTS roadworthy_expiry   DATE,
  ADD COLUMN IF NOT EXISTS tracker_id          TEXT,
  ADD COLUMN IF NOT EXISTS assigned_driver     TEXT,
  ADD COLUMN IF NOT EXISTS department          TEXT,
  ADD COLUMN IF NOT EXISTS cost_center         TEXT,
  ADD COLUMN IF NOT EXISTS acquisition_cost    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acquisition_date    DATE,
  ADD COLUMN IF NOT EXISTS salvage_value       NUMERIC DEFAULT 0;
