-- ══════════════════════════════════════════════════════════════════
-- Fleet Phase F2 — Workshop & Maintenance Intelligence
-- ══════════════════════════════════════════════════════════════════

-- 1. maintenance_schedules — add recurring/reminder columns
ALTER TABLE maintenance_schedules
  ADD COLUMN IF NOT EXISTS is_recurring     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_advance     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_km      NUMERIC,
  ADD COLUMN IF NOT EXISTS reminder_hrs     NUMERIC,
  ADD COLUMN IF NOT EXISTS reminder_days    INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS last_wo_id       TEXT,
  ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMPTZ;

-- 2. maintenance_work_orders — add complaint/diagnosis/linkage columns
ALTER TABLE maintenance_work_orders
  ADD COLUMN IF NOT EXISTS complaint_description TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_notes       TEXT,
  ADD COLUMN IF NOT EXISTS linked_breakdown_id   TEXT,
  ADD COLUMN IF NOT EXISTS started_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS downtime_hours        NUMERIC;

-- 3. breakdown_reports — add severity/response columns
ALTER TABLE breakdown_reports
  ADD COLUMN IF NOT EXISTS severity             TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS response_time_hours  NUMERIC,
  ADD COLUMN IF NOT EXISTS linked_wo_id         TEXT;

-- 4. maintenance_pm_urgency VIEW
CREATE OR REPLACE VIEW maintenance_pm_urgency AS
SELECT
  ms.id,
  ms.asset_id,
  ms.asset_reg,
  ms.asset_type,
  ms.task_name,
  ms.task_category,
  ms.interval_type,
  ms.interval_value,
  ms.next_due_date,
  ms.next_due_km,
  ms.next_due_hours,
  ms.last_done_date,
  ms.last_done_km,
  ms.last_done_hours,
  ms.priority,
  ms.is_active,
  ms.is_recurring,
  ms.auto_advance,
  ms.reminder_days,
  ms.notes,
  ar.current_odometer,
  ar.current_engine_hours,
  ar.asset_name,
  CASE
    WHEN ms.interval_type = 'km' AND ms.next_due_km IS NOT NULL AND ar.current_odometer IS NOT NULL
      THEN ms.next_due_km - ar.current_odometer
    ELSE NULL
  END AS remaining_km,
  CASE
    WHEN ms.interval_type = 'hours' AND ms.next_due_hours IS NOT NULL AND ar.current_engine_hours IS NOT NULL
      THEN ms.next_due_hours - ar.current_engine_hours
    ELSE NULL
  END AS remaining_hrs,
  CASE
    WHEN ms.next_due_date IS NOT NULL
      THEN (ms.next_due_date - CURRENT_DATE)::integer
    ELSE NULL
  END AS remaining_days,
  CASE
    WHEN ms.interval_type = 'km' AND ms.interval_value > 0 AND ms.next_due_km IS NOT NULL AND ar.current_odometer IS NOT NULL
      THEN LEAST(110, GREATEST(0, 100 - ((ms.next_due_km - ar.current_odometer) / ms.interval_value * 100)))::numeric
    WHEN ms.interval_type = 'hours' AND ms.interval_value > 0 AND ms.next_due_hours IS NOT NULL AND ar.current_engine_hours IS NOT NULL
      THEN LEAST(110, GREATEST(0, 100 - ((ms.next_due_hours - ar.current_engine_hours) / ms.interval_value * 100)))::numeric
    WHEN ms.interval_type IN ('days','date') AND ms.interval_value > 0 AND ms.next_due_date IS NOT NULL
      THEN LEAST(110, GREATEST(0, 100 - ((ms.next_due_date - CURRENT_DATE)::numeric / ms.interval_value * 100)))::numeric
    ELSE NULL
  END AS pct_used,
  CASE
    WHEN ms.interval_type = 'km' AND ms.next_due_km IS NOT NULL AND ar.current_odometer IS NOT NULL THEN
      CASE
        WHEN (ms.next_due_km - ar.current_odometer) < -(ms.interval_value * 0.1) THEN 'critical'
        WHEN (ms.next_due_km - ar.current_odometer) < 0                           THEN 'overdue'
        WHEN (ms.next_due_km - ar.current_odometer) <= (ms.interval_value * 0.2)  THEN 'due_soon'
        ELSE 'ok'
      END
    WHEN ms.interval_type = 'hours' AND ms.next_due_hours IS NOT NULL AND ar.current_engine_hours IS NOT NULL THEN
      CASE
        WHEN (ms.next_due_hours - ar.current_engine_hours) < -(ms.interval_value * 0.1) THEN 'critical'
        WHEN (ms.next_due_hours - ar.current_engine_hours) < 0                           THEN 'overdue'
        WHEN (ms.next_due_hours - ar.current_engine_hours) <= (ms.interval_value * 0.2)  THEN 'due_soon'
        ELSE 'ok'
      END
    WHEN ms.next_due_date IS NOT NULL THEN
      CASE
        WHEN (ms.next_due_date - CURRENT_DATE)::integer < -(ms.interval_value * 0.1)::integer THEN 'critical'
        WHEN (ms.next_due_date - CURRENT_DATE)::integer < 0                                    THEN 'overdue'
        WHEN (ms.next_due_date - CURRENT_DATE)::integer <= (ms.interval_value * 0.2)::integer  THEN 'due_soon'
        ELSE 'ok'
      END
    ELSE 'unknown'
  END AS urgency
FROM maintenance_schedules ms
LEFT JOIN asset_registry ar ON ms.asset_id = ar.id
WHERE ms.is_active = true;
