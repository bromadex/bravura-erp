-- Fuel consumption benchmarks per vehicle / equipment type

CREATE TABLE IF NOT EXISTS fuel_benchmarks (
  id                  text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  vehicle             text    NOT NULL,
  target_l_per_100km  numeric,
  target_l_per_hr     numeric,
  measurement_type    text    DEFAULT 'km',  -- km | hours
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
