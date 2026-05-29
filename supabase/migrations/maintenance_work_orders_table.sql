-- Maintenance work orders for fleet / equipment

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id                    text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  wo_number             text,
  schedule_id           text,
  asset_id              text    NOT NULL,
  asset_reg             text,
  asset_name            text,
  asset_type            text    NOT NULL,
  task_name             text    NOT NULL,
  task_category         text    NOT NULL DEFAULT 'service',  -- service | repair | inspection | tyre | other
  priority              text    NOT NULL DEFAULT 'normal',   -- low | normal | high | critical
  status                text    NOT NULL DEFAULT 'open',     -- open | in_progress | completed | cancelled
  assigned_to           text,
  workshop              text,
  description           text,
  findings              text,
  completion_notes      text,
  planned_start_date    date,
  planned_end_date      date,
  actual_end_date       date,
  odometer_at_wo        numeric,
  odometer_at_service   numeric,
  hours_at_wo           numeric,
  hour_meter_at_service numeric,
  parts_used            jsonb   DEFAULT '[]',
  labour_hours          numeric DEFAULT 0,
  labour_rate           numeric DEFAULT 0,
  labour_cost           numeric,
  parts_cost            numeric DEFAULT 0,
  actual_cost           numeric DEFAULT 0,
  estimated_cost        numeric DEFAULT 0,
  invoice_number        text,
  approved_by           text,
  source                text,
  source_ref            text,
  notes                 text,
  created_by            text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
