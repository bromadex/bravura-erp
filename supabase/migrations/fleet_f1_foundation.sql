-- ══════════════════════════════════════════════════════════════════
-- Fleet Phase F1 — Foundation & Integrity
-- ══════════════════════════════════════════════════════════════════

-- 1. asset_registry — add missing F1 columns
ALTER TABLE asset_registry
  ADD COLUMN IF NOT EXISTS fleet_number          TEXT,
  ADD COLUMN IF NOT EXISTS cost_centre_id        TEXT,
  ADD COLUMN IF NOT EXISTS assigned_department_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_operator_id  TEXT,
  ADD COLUMN IF NOT EXISTS parent_asset_id       TEXT,
  ADD COLUMN IF NOT EXISTS operational_status    TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS insurance_expiry      DATE,
  ADD COLUMN IF NOT EXISTS license_expiry        DATE,
  ADD COLUMN IF NOT EXISTS fitness_expiry        DATE,
  ADD COLUMN IF NOT EXISTS warranty_expiry       DATE,
  ADD COLUMN IF NOT EXISTS current_odometer      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_engine_hours  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS site_id               TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type          TEXT,
  ADD COLUMN IF NOT EXISTS tare_weight           NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_vehicle_mass    NUMERIC,
  ADD COLUMN IF NOT EXISTS tracker_id            TEXT;

-- 2. meter_readings — add integrity columns
ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS previous_value NUMERIC,
  ADD COLUMN IF NOT EXISTS flagged        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason    TEXT,
  ADD COLUMN IF NOT EXISTS recorded_by   TEXT;

-- 3. asset_operator_assignments — operator assignment ledger
CREATE TABLE IF NOT EXISTS asset_operator_assignments (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_id       TEXT NOT NULL,
  operator_id    TEXT NOT NULL,
  operator_name  TEXT,
  assigned_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to    TIMESTAMPTZ,
  shift          TEXT,
  project_id     TEXT,
  site_id        TEXT,
  hours_logged   NUMERIC,
  km_start       NUMERIC,
  km_end         NUMERIC,
  notes          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 4. asset_attachments — parent/child asset relationships
CREATE TABLE IF NOT EXISTS asset_attachments (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  primary_asset_id  TEXT NOT NULL,
  attached_asset_id TEXT NOT NULL,
  attached_from     DATE,
  detached_on       DATE,
  notes             TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 5. fleet_expiry_alerts — compliance view
CREATE OR REPLACE VIEW fleet_expiry_alerts AS
SELECT
  ar.id                                               AS asset_id,
  COALESCE(ar.plate_number, ar.asset_code)           AS registration_no,
  ar.fleet_number,
  ar.asset_name,
  fd.doc_type                                         AS expiry_type,
  fd.expiry_date,
  (fd.expiry_date - CURRENT_DATE)::int               AS days_until_expiry,
  CASE
    WHEN fd.expiry_date < CURRENT_DATE                           THEN 'expired'
    WHEN fd.expiry_date <= CURRENT_DATE + INTERVAL '7 days'     THEN 'critical'
    WHEN fd.expiry_date <= CURRENT_DATE + INTERVAL '30 days'    THEN 'warning'
    ELSE 'ok'
  END                                                 AS status
FROM fleet_documents fd
JOIN asset_registry ar ON fd.asset_id = ar.id
WHERE fd.is_active = true
ORDER BY fd.expiry_date;

-- 6. Trigger: auto-flag suspicious meter readings and update asset current values
CREATE OR REPLACE FUNCTION validate_meter_reading_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_prev   NUMERIC;
  v_delta  NUMERIC;
BEGIN
  SELECT reading_value INTO v_prev
  FROM meter_readings
  WHERE asset_id = NEW.asset_id
    AND reading_type = NEW.reading_type
    AND id <> NEW.id
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;

  NEW.previous_value := v_prev;

  IF v_prev IS NOT NULL THEN
    v_delta := NEW.reading_value - v_prev;
    IF v_delta < 0 THEN
      NEW.flagged     := true;
      NEW.flag_reason := 'Odometer rollback detected (decreased from ' || v_prev || ' to ' || NEW.reading_value || ')';
    ELSIF NEW.reading_type = 'odometer' AND v_delta > 3500 THEN
      NEW.flagged     := true;
      NEW.flag_reason := 'Unrealistic jump: +' || v_delta || ' km from last reading';
    ELSIF NEW.reading_type = 'engine_hours' AND v_delta > 168 THEN
      NEW.flagged     := true;
      NEW.flag_reason := 'Unrealistic jump: +' || v_delta || ' hours from last reading';
    END IF;
  END IF;

  UPDATE asset_registry
  SET primary_metric_val   = GREATEST(COALESCE(primary_metric_val, 0), NEW.reading_value),
      current_odometer     = CASE WHEN NEW.reading_type = 'odometer'     THEN GREATEST(COALESCE(current_odometer, 0),     NEW.reading_value) ELSE current_odometer     END,
      current_engine_hours = CASE WHEN NEW.reading_type = 'engine_hours' THEN GREATEST(COALESCE(current_engine_hours, 0), NEW.reading_value) ELSE current_engine_hours END,
      updated_at           = NOW()
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_meter_reading ON meter_readings;
CREATE TRIGGER trg_validate_meter_reading
  BEFORE INSERT ON meter_readings
  FOR EACH ROW EXECUTE FUNCTION validate_meter_reading_fn();
