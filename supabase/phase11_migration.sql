-- Phase 11: Schema consistency fixes
-- Run in Supabase SQL editor

-- 1. Add departure_from to travel_requests (was missing from schema)
ALTER TABLE travel_requests ADD COLUMN IF NOT EXISTS departure_from TEXT;

-- 2. Allow password_plain to be NULL (cleared after bcrypt migration)
ALTER TABLE app_users ALTER COLUMN password_plain DROP NOT NULL;

-- 3. Clear stored plaintext passwords once bcrypt hashes are in place
--    Run this AFTER deploying the updated auth code and verifying login works:
-- UPDATE app_users SET password_plain = NULL WHERE password_plain IS NOT NULL;
