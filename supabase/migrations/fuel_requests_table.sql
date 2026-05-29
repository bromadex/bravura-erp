-- Fuel request / approval workflow table

CREATE TABLE IF NOT EXISTS fuel_requests (
  id              text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  request_no      text,
  request_date    date    NOT NULL DEFAULT CURRENT_DATE,
  asset_id        text,
  asset_reg       text,
  equipment_type  text    NOT NULL DEFAULT 'vehicle',
  requested_by    text    NOT NULL,
  requested_liters numeric NOT NULL,
  fuel_type       text    NOT NULL DEFAULT 'DIESEL',
  tank_id         text    REFERENCES fuel_tanks(id),
  purpose         text,
  project_id      text,
  odometer_reading numeric,
  engine_hours    numeric,
  urgency         text    NOT NULL DEFAULT 'normal',  -- normal | urgent | critical
  status          text    NOT NULL DEFAULT 'pending', -- pending | approved | rejected | issued
  approved_by     text,
  approved_at     timestamptz,
  rejection_reason text,
  issued_qty      numeric,
  issuance_id     text,
  notes           text,
  created_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Additional columns added during development
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS requester_name   text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS department       text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS driver_operator  text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS equipment_name   text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS requested_qty    numeric;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS required_date    date;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS cost_center      text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS approved_qty     numeric;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS requester_id     text;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS issued_at        timestamptz;
ALTER TABLE fuel_requests ADD COLUMN IF NOT EXISTS issued_by        text;
