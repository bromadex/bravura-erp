-- Fuel attendant shift management table

CREATE TABLE IF NOT EXISTS fuel_shifts (
  id              text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  shift_no        text,
  shift_date      text    NOT NULL,
  attendant_name  text    DEFAULT '',
  tank_id         text    REFERENCES fuel_tanks(id),
  opening_level   numeric DEFAULT 0,
  closing_level   numeric,
  opening_meter   numeric DEFAULT 0,
  closing_meter   numeric,
  issuances_count integer DEFAULT 0,
  total_issued    numeric DEFAULT 0,
  variance        numeric,
  status          text    DEFAULT 'open',  -- open | closed | reconciled
  opened_by       text    DEFAULT '',
  closed_by       text    DEFAULT '',
  opened_at       timestamptz,
  closed_at       timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- Allow shift_id reference on fuel_issuance
ALTER TABLE fuel_issuance ADD COLUMN IF NOT EXISTS shift_id text REFERENCES fuel_shifts(id);
