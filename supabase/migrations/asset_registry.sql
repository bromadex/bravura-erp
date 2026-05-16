-- supabase/migrations/asset_registry.sql
-- Unified Asset Registry & Reclassification Engine
-- Run in Supabase SQL editor

-- ── 1. Category Configuration (no hardcoded categories in app code) ───────
CREATE TABLE IF NOT EXISTS asset_category_config (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category               TEXT UNIQUE NOT NULL,
  display_label          TEXT NOT NULL,
  icon                   TEXT NOT NULL DEFAULT 'inventory_2',
  color                  TEXT NOT NULL DEFAULT '#94a3b8',
  measurement_type       TEXT NOT NULL DEFAULT 'hours',   -- km | hours | fixed
  primary_metric         TEXT NOT NULL DEFAULT 'hour_meter',
  service_interval_basis TEXT NOT NULL DEFAULT 'hours',   -- km | hours | days
  show_odometer          BOOLEAN NOT NULL DEFAULT FALSE,
  show_hour_meter        BOOLEAN NOT NULL DEFAULT TRUE,
  enable_trips           BOOLEAN NOT NULL DEFAULT FALSE,
  enable_run_logs        BOOLEAN NOT NULL DEFAULT FALSE,
  enable_fuel            BOOLEAN NOT NULL DEFAULT TRUE,
  enable_tyre_module     BOOLEAN NOT NULL DEFAULT FALSE,
  depreciation_method    TEXT NOT NULL DEFAULT 'straight_line',
  useful_life_years      INT  NOT NULL DEFAULT 5,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order             INT  NOT NULL DEFAULT 99,
  created_by             TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- Default category seeds
INSERT INTO asset_category_config
  (category, display_label, icon, color,
   measurement_type, primary_metric, service_interval_basis,
   show_odometer, show_hour_meter, enable_trips, enable_run_logs,
   enable_fuel, enable_tyre_module, sort_order)
VALUES
  ('Vehicle',         'Vehicle',         'directions_car', '#34d399',
   'km',    'odometer_km', 'km',    TRUE,  FALSE, TRUE,  FALSE, TRUE,  TRUE,  1),
  ('Generator',       'Generator',       'bolt',           '#fbbf24',
   'hours', 'hour_meter',  'hours', FALSE, TRUE,  FALSE, TRUE,  TRUE,  FALSE, 2),
  ('Heavy Equipment', 'Heavy Equipment', 'construction',   '#f97316',
   'hours', 'hour_meter',  'hours', FALSE, TRUE,  FALSE, FALSE, TRUE,  FALSE, 3),
  ('Light Equipment', 'Light Equipment', 'build',          '#60a5fa',
   'hours', 'hour_meter',  'hours', FALSE, TRUE,  FALSE, FALSE, TRUE,  FALSE, 4),
  ('Water Pump',      'Water Pump',      'water',          '#38bdf8',
   'hours', 'hour_meter',  'hours', FALSE, TRUE,  FALSE, TRUE,  TRUE,  FALSE, 5),
  ('Compressor',      'Compressor',      'air',            '#a78bfa',
   'hours', 'hour_meter',  'hours', FALSE, TRUE,  FALSE, TRUE,  FALSE, FALSE, 6),
  ('Fixed Plant',     'Fixed Plant',     'factory',        '#6b7280',
   'fixed', 'unit_count',  'days',  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 7)
ON CONFLICT (category) DO NOTHING;

-- ── 2. Unified Asset Registry ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_registry (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_code           TEXT UNIQUE NOT NULL,           -- AS-2026-00001
  asset_name           TEXT NOT NULL,
  asset_category       TEXT NOT NULL REFERENCES asset_category_config(category),
  asset_subtype        TEXT,                           -- Truck | Pickup | Excavator…
  measurement_type     TEXT NOT NULL DEFAULT 'hours',  -- km | hours | fixed
  primary_metric_val   NUMERIC NOT NULL DEFAULT 0,     -- current odometer / hour meter
  service_interval     NUMERIC,
  service_interval_basis TEXT DEFAULT 'hours',         -- km | hours | days
  last_service_date    DATE,
  last_service_val     NUMERIC,                        -- km or hours at last service

  -- Identity
  make                 TEXT,
  model                TEXT,
  year                 INT,
  vin_serial           TEXT,
  plate_number         TEXT,
  colour               TEXT,

  -- Operational
  status               TEXT NOT NULL DEFAULT 'Active',
  assigned_project     TEXT,
  assigned_to          TEXT,
  department           TEXT,
  location             TEXT,

  -- Financial
  purchase_date        DATE,
  purchase_cost        NUMERIC DEFAULT 0,
  salvage_value        NUMERIC DEFAULT 0,
  useful_life_years    INT DEFAULT 5,
  depreciation_method  TEXT DEFAULT 'straight_line',

  -- Source link (back-reference to original table)
  source_table         TEXT,                           -- vehicles | earth_movers | generators
  source_id            TEXT,

  -- Incompatible fields archived across reclassifications
  archived_fields      JSONB DEFAULT '{}',

  notes                TEXT,
  metadata             JSONB DEFAULT '{}',
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ar_category ON asset_registry(asset_category);
CREATE INDEX IF NOT EXISTS idx_ar_status   ON asset_registry(status);
CREATE INDEX IF NOT EXISTS idx_ar_source   ON asset_registry(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_ar_project  ON asset_registry(assigned_project);

-- ── 3. Reclassification Audit Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_reclassification_log (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  txn_code             TEXT UNIQUE NOT NULL,           -- AR-2026-00001
  asset_id             TEXT NOT NULL REFERENCES asset_registry(id),
  asset_code           TEXT NOT NULL,
  asset_name           TEXT NOT NULL,
  from_category        TEXT NOT NULL,
  to_category          TEXT NOT NULL,
  from_measurement_type TEXT,
  to_measurement_type  TEXT,
  reason               TEXT NOT NULL,
  archived_fields      JSONB DEFAULT '{}',
  migrated_fields      JSONB DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'Completed',
  requested_by         TEXT,
  approved_by          TEXT,
  approved_at          TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reclass_asset  ON asset_reclassification_log(asset_id);
CREATE INDEX IF NOT EXISTS idx_reclass_status ON asset_reclassification_log(status);

-- ── 4. Asset Timeline ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_timeline (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id    TEXT NOT NULL REFERENCES asset_registry(id),
  event_type  TEXT NOT NULL,
  -- registered | reclassified | service | issue | downtime |
  -- metric_update | status_change | assignment | note
  event_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  title       TEXT NOT NULL,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_asset ON asset_timeline(asset_id, event_date DESC);

-- ── 5. Seed txn-code sequence prefixes ────────────────────────────────────
INSERT INTO code_sequences (prefix, year, last_number)
VALUES
  ('AS', EXTRACT(YEAR FROM now())::int, 0),
  ('AR', EXTRACT(YEAR FROM now())::int, 0)
ON CONFLICT (prefix, year) DO NOTHING;
