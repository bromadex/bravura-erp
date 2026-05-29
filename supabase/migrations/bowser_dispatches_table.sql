-- Bowser (mobile fuel tank) dispatch records

CREATE TABLE IF NOT EXISTS bowser_dispatches (
  id              text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  dispatch_no     text,
  bowser_id       text    REFERENCES fuel_tanks(id),
  dispatch_date   text    NOT NULL,
  site            text    NOT NULL DEFAULT '',
  dispatched_by   text    DEFAULT '',
  opening_level   numeric DEFAULT 0,
  closing_level   numeric,
  fuel_dispensed  numeric,
  return_date     text,
  status          text    DEFAULT 'dispatched',  -- dispatched | returned
  notes           text,
  created_at      timestamptz DEFAULT now()
);
