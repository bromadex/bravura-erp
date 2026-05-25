-- erp_u22_master_data_tables.sql
-- Creates cost_centers and sites tables used by MasterDataContext.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ═══════════════════════════════════════════════════════════════════
-- 1. COST CENTERS
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cost_centers (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON cost_centers(code);

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_cost_centers" ON cost_centers;
CREATE POLICY "auth_cost_centers"
  ON cost_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 2. SITES
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  location    TEXT,
  manager     TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_sites" ON sites;
CREATE POLICY "auth_sites"
  ON sites FOR ALL TO authenticated USING (true) WITH CHECK (true);
