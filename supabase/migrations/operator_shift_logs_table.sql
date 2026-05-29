-- Equipment operator shift logs (SMU tracking)

CREATE TABLE IF NOT EXISTS operator_shift_logs (
  id           text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  shift_no     text,
  asset_id     text    NOT NULL,
  driver_id    text,
  driver_name  text,
  shift_date   date    NOT NULL,
  shift_start  timestamptz,
  shift_end    timestamptz,
  smu_start    numeric DEFAULT 0,
  smu_end      numeric,
  hours_worked numeric,
  fuel_used    numeric,
  notes        text,
  created_by   text,
  created_at   timestamptz DEFAULT now()
);
