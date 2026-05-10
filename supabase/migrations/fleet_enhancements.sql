-- supabase/migrations/fleet_enhancements.sql
-- ERPNext-standard fleet additions: PM schedules, work orders, tyre lifecycle, downtime.
-- Run in Supabase SQL editor.

-- ── 1. Maintenance Schedule Templates ─────────────────────────────────
-- Defines what maintenance tasks are due at what intervals for each asset.
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id              TEXT NOT NULL,     -- fleet.id / generators.id / earth_movers.id
  asset_reg             TEXT NOT NULL,     -- display reg / code
  asset_type            TEXT NOT NULL,     -- vehicle | generator | earth_mover
  task_name             TEXT NOT NULL,     -- e.g. "Oil Change", "Major Service", "Inspection"
  task_category         TEXT NOT NULL DEFAULT 'service',
  -- service | inspection | lubrication | tyre_rotation | calibration | statutory
  interval_type         TEXT NOT NULL,     -- km | hours | days | date
  interval_value        NUMERIC,           -- e.g. 5000 (km), 250 (hours), 90 (days)
  next_due_date         DATE,
  next_due_km           NUMERIC,
  next_due_hours        NUMERIC,
  last_done_date        DATE,
  last_done_km          NUMERIC,
  last_done_hours       NUMERIC,
  estimated_cost        NUMERIC DEFAULT 0,
  assigned_to           TEXT,             -- mechanic / workshop
  instructions          TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ms_asset    ON maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_ms_due_date ON maintenance_schedules(next_due_date);

-- ── 2. Maintenance Work Orders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wo_number         TEXT UNIQUE NOT NULL,
  schedule_id       TEXT REFERENCES maintenance_schedules(id),
  asset_id          TEXT NOT NULL,
  asset_reg         TEXT NOT NULL,
  asset_type        TEXT NOT NULL,
  task_name         TEXT NOT NULL,
  task_category     TEXT NOT NULL DEFAULT 'service',
  priority          TEXT NOT NULL DEFAULT 'normal', -- low | normal | high | critical
  status            TEXT NOT NULL DEFAULT 'Open',
  -- Open | In Progress | Waiting Parts | Completed | Cancelled
  odometer_at_wo    NUMERIC,
  hours_at_wo       NUMERIC,
  opened_date       DATE NOT NULL,
  scheduled_date    DATE,
  started_date      DATE,
  completed_date    DATE,
  assigned_to       TEXT,              -- mechanic name
  workshop          TEXT,             -- internal | external workshop name
  description       TEXT,
  findings          TEXT,             -- what was found during work
  parts_used        JSONB DEFAULT '[]', -- [{name, part_number, qty, unit_cost, total}]
  labour_hours      NUMERIC DEFAULT 0,
  labour_rate       NUMERIC DEFAULT 0,
  parts_cost        NUMERIC DEFAULT 0,
  labour_cost       NUMERIC GENERATED ALWAYS AS (labour_hours * labour_rate) STORED,
  total_cost        NUMERIC DEFAULT 0,
  invoice_number    TEXT,             -- external invoice ref
  approved_by       TEXT,
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wo_asset  ON maintenance_work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_status ON maintenance_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_date   ON maintenance_work_orders(opened_date);

-- ── 3. Tyre Inventory (master records) ────────────────────────────────
CREATE TABLE IF NOT EXISTS tyre_inventory (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tyre_code        TEXT UNIQUE NOT NULL,  -- e.g. TYR-2026-00001
  serial_number    TEXT,
  brand            TEXT NOT NULL,
  size             TEXT NOT NULL,         -- e.g. "315/80R22.5"
  type             TEXT NOT NULL DEFAULT 'radial', -- radial | bias | solid
  ply_rating       TEXT,                 -- e.g. "20PR"
  load_index       TEXT,
  speed_rating     TEXT,
  tread_depth_new  NUMERIC DEFAULT 12,   -- mm when new (DOT standard ~12mm)
  tread_depth_min  NUMERIC DEFAULT 2,    -- mm minimum legal/safety limit
  rated_km         NUMERIC,             -- manufacturer's rated lifespan in km
  purchase_date    DATE,
  purchase_cost    NUMERIC DEFAULT 0,
  supplier         TEXT,
  condition        TEXT NOT NULL DEFAULT 'New',
  -- New | In Service | Retreaded | Removed | Scraped
  current_vehicle  TEXT,               -- vehicle reg if in service
  current_position TEXT,               -- FL | FR | RL | RR | RL2 | RR2 | Spare | Store
  km_accumulated   NUMERIC DEFAULT 0,   -- km run to date
  retreads         INT DEFAULT 0,       -- number of times retreaded
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tyre_vehicle ON tyre_inventory(current_vehicle);
CREATE INDEX IF NOT EXISTS idx_tyre_cond    ON tyre_inventory(condition);

-- ── 4. Tyre Movements (fitment history) ───────────────────────────────
CREATE TABLE IF NOT EXISTS tyre_movements (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tyre_id          TEXT NOT NULL REFERENCES tyre_inventory(id),
  tyre_code        TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  -- fit | remove | rotate | rotate_in | retread | inspect | scrap | store
  event_date       DATE NOT NULL,
  vehicle_reg      TEXT,
  position         TEXT,               -- position after this event
  odometer_at_event NUMERIC,
  tread_depth      NUMERIC,            -- measured tread depth at event (mm)
  performed_by     TEXT,
  reason           TEXT,               -- removal reason / rotation reason
  cost             NUMERIC DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tm_tyre    ON tyre_movements(tyre_id);
CREATE INDEX IF NOT EXISTS idx_tm_vehicle ON tyre_movements(vehicle_reg);

-- ── 5. Enhance downtime_logs ──────────────────────────────────────────
ALTER TABLE downtime_logs
  ADD COLUMN IF NOT EXISTS cause_category   TEXT DEFAULT 'mechanical',
  -- mechanical | electrical | tyre | accident | scheduled | operator_error | unknown
  ADD COLUMN IF NOT EXISTS repair_cost      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by        TEXT,
  ADD COLUMN IF NOT EXISTS wo_id            TEXT,  -- link to work order
  ADD COLUMN IF NOT EXISTS odometer_at_breakdown NUMERIC,
  ADD COLUMN IF NOT EXISTS breakdown_location TEXT;

-- ── 6. Enhance fleet table ────────────────────────────────────────────
ALTER TABLE fleet
  ADD COLUMN IF NOT EXISTS tare_weight       NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_vehicle_mass NUMERIC,
  ADD COLUMN IF NOT EXISTS licence_expiry    DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry  DATE,
  ADD COLUMN IF NOT EXISTS roadworthy_expiry DATE,
  ADD COLUMN IF NOT EXISTS tracker_id        TEXT,
  ADD COLUMN IF NOT EXISTS assigned_driver   TEXT,
  ADD COLUMN IF NOT EXISTS department        TEXT,
  ADD COLUMN IF NOT EXISTS cost_center       TEXT,
  ADD COLUMN IF NOT EXISTS acquisition_cost  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acquisition_date  DATE,
  ADD COLUMN IF NOT EXISTS salvage_value     NUMERIC DEFAULT 0;
