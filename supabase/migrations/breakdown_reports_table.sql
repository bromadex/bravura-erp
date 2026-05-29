-- Vehicle / equipment breakdown reports

CREATE TABLE IF NOT EXISTS breakdown_reports (
  id                  text    PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  breakdown_no        text,
  asset_id            text,
  asset_name          text,
  asset_code          text,
  reported_at         timestamptz DEFAULT now(),
  reported_by         text,
  description         text    NOT NULL,
  breakdown_category  text    DEFAULT 'mechanical',  -- mechanical | electrical | tyres | accident | other
  root_cause          text,
  corrective_action   text,
  downtime_hours      numeric DEFAULT 0,
  status              text    DEFAULT 'open',        -- open | in_progress | resolved | closed
  wo_number           text,
  resolved_at         timestamptz,
  resolved_by         text,
  resolution_notes    text,
  estimated_cost      numeric DEFAULT 0,
  actual_cost         numeric DEFAULT 0,
  created_by          text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
