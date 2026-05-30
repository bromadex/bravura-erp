-- F3: Fleet Intelligence Dashboard & Cost Analytics
-- Applied: 2026-05-30

-- asset_registry: fuel tank capacity and benchmark consumption
ALTER TABLE asset_registry
  ADD COLUMN IF NOT EXISTS fuel_tank_capacity   NUMERIC,
  ADD COLUMN IF NOT EXISTS benchmark_consumption NUMERIC;  -- L/100km or L/hr depending on asset type

-- vehicle_trips: per-trip fuel cost estimate
ALTER TABLE vehicle_trips
  ADD COLUMN IF NOT EXISTS fuel_cost_estimate NUMERIC;

-- vehicle_inspections: numeric score and linked WO
ALTER TABLE vehicle_inspections
  ADD COLUMN IF NOT EXISTS overall_score NUMERIC,   -- 0-100, computed from checklist pass/total
  ADD COLUMN IF NOT EXISTS linked_wo_id  TEXT;

-- fleet_asset_tco: total cost of ownership view per asset
-- Aggregates closed work order costs + breakdown costs from asset_registry
CREATE OR REPLACE VIEW fleet_asset_tco AS
SELECT
  ar.id,
  ar.asset_name,
  ar.asset_code,
  ar.plate_number,
  ar.fleet_number,
  ar.asset_category,
  ar.vehicle_type,
  ar.make,
  ar.model,
  ar.current_odometer,
  ar.current_engine_hours,
  ar.purchase_cost              AS acquisition_cost,
  ar.fuel_tank_capacity,
  ar.benchmark_consumption,
  ar.operational_status,
  ar.status,
  COALESCE(SUM(mwo.actual_cost) FILTER (WHERE mwo.status = 'closed'), 0) AS maintenance_cost,
  COALESCE(SUM(br.actual_cost), 0)                                        AS breakdown_cost,
  COALESCE(SUM(mwo.actual_cost) FILTER (WHERE mwo.status = 'closed'), 0) +
  COALESCE(SUM(br.actual_cost), 0)                                        AS tco_tracked
FROM asset_registry ar
LEFT JOIN maintenance_work_orders mwo ON mwo.asset_id = ar.id
LEFT JOIN breakdown_reports       br  ON br.asset_id  = ar.id
GROUP BY
  ar.id, ar.asset_name, ar.asset_code, ar.plate_number, ar.fleet_number,
  ar.asset_category, ar.vehicle_type, ar.make, ar.model,
  ar.current_odometer, ar.current_engine_hours, ar.purchase_cost,
  ar.fuel_tank_capacity, ar.benchmark_consumption,
  ar.operational_status, ar.status;

GRANT SELECT ON fleet_asset_tco TO authenticated;
GRANT SELECT ON fleet_asset_tco TO anon;
