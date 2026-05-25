-- erp_u24b_connect_seed_fix.sql
-- Run this INSTEAD of re-running the full erp_u24_connect_upgrade.sql if you
-- hit: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Root cause: the original script used a partial unique index
-- (WHERE channel_slug IS NOT NULL) which PostgreSQL requires you to mirror in the
-- ON CONFLICT clause.  Switching to a regular unique index is simpler — Postgres
-- already treats NULLs as distinct in any unique index, so DM/group rows
-- (channel_slug IS NULL) will never conflict with each other.

-- 1. Replace partial index → regular unique index
DROP INDEX IF EXISTS idx_chat_conv_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conv_slug ON chat_conversations(channel_slug);

-- 2. Seed default channels (safe to re-run)
INSERT INTO chat_conversations
  (id, type, name, channel_slug, description, is_announcement_only, created_by, created_at, updated_at)
VALUES
  ((gen_random_uuid())::text, 'channel', '# general',      'general',      'Company-wide general discussion', false, 'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# announcements','announcements','Official company announcements',  true,  'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# procurement',  'procurement',  'Procurement team discussion',     false, 'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# safety-alerts','safety-alerts','Safety notices and alerts',       true,  'system', now(), now())
ON CONFLICT (channel_slug) DO NOTHING;
