-- ============================================================
-- Campsite: camp_maintenance_flags table + column renames
-- Run in Supabase SQL editor
-- ============================================================

-- 1. Create camp_maintenance_flags (replaces room_maintenance)
CREATE TABLE IF NOT EXISTS camp_maintenance_flags (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  txn_code    TEXT,
  room_id     TEXT NOT NULL,
  reason      TEXT,
  flagged_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rename columns on camp_rooms to match design doc
-- Run one at a time if any already exist under the new name.

ALTER TABLE camp_rooms
  RENAME COLUMN maintenance_notes   TO maintenance_reason;

ALTER TABLE camp_rooms
  RENAME COLUMN maintenance_flagged TO maintenance_since;

-- 3. Rename columns on room_assignments to match design doc
ALTER TABLE room_assignments
  RENAME COLUMN check_in_notes  TO checkin_notes;

ALTER TABLE room_assignments
  RENAME COLUMN check_out_notes TO checkout_notes;

-- 4. (Optional) migrate old room_maintenance data
-- INSERT INTO camp_maintenance_flags (id, txn_code, room_id, reason, created_at)
-- SELECT id, txn_code, room_id, notes, created_at FROM room_maintenance;
