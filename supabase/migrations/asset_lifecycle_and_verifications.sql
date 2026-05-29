-- Phase 6: Asset lifecycle columns, verifications table, dipstick source column

-- 1. dipstick_log.source column
ALTER TABLE dipstick_log
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
-- possible values: manual | opening | shift | reconciliation | import

-- 2. asset_registry lifecycle columns
ALTER TABLE asset_registry
  ADD COLUMN IF NOT EXISTS commissioning_date DATE,
  ADD COLUMN IF NOT EXISTS disposal_date      DATE,
  ADD COLUMN IF NOT EXISTS disposal_method    TEXT,
  ADD COLUMN IF NOT EXISTS disposal_amount    NUMERIC DEFAULT 0;

-- 3. asset_verifications table
CREATE TABLE IF NOT EXISTS asset_verifications (
  id                  TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  verification_no     TEXT    UNIQUE,
  session_id          TEXT,
  verification_date   DATE    NOT NULL DEFAULT CURRENT_DATE,
  asset_id            TEXT    NOT NULL REFERENCES asset_registry(id) ON DELETE CASCADE,
  asset_code          TEXT,
  asset_name          TEXT,
  verified_condition  TEXT    NOT NULL DEFAULT 'verified',
  -- verified | damaged | missing | excess | needs_repair
  location_confirmed  TEXT,
  expected_location   TEXT,
  odometer_reading    NUMERIC,
  hour_meter          NUMERIC,
  tread_depth         NUMERIC,
  last_known_value    NUMERIC,
  notes               TEXT,
  photo_url           TEXT,
  verified_by         TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_av_asset    ON asset_verifications(asset_id);
CREATE INDEX IF NOT EXISTS idx_av_date     ON asset_verifications(verification_date DESC);
CREATE INDEX IF NOT EXISTS idx_av_session  ON asset_verifications(session_id);
CREATE INDEX IF NOT EXISTS idx_av_cond     ON asset_verifications(verified_condition);

-- 4. Numbering series for asset verification
INSERT INTO numbering_series (series_key, prefix, padding, current_val, description)
VALUES ('AV', 'AV', 5, 0, 'Asset Verification Records')
ON CONFLICT (series_key) DO NOTHING;
