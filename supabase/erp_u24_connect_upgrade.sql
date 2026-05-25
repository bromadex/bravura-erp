-- erp_u24_connect_upgrade.sql
-- Connect module full upgrade: C1→C4 features.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT).

-- ═══════════════════════════════════════════════════════════════════
-- 1. CHAT_PARTICIPANTS — unread tracking
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS last_read_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_read_at          TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════
-- 2. CHAT_MESSAGES — replies, edits, pins, attachments
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id      TEXT,   -- FK handled in app (avoids self-ref issues)
  ADD COLUMN IF NOT EXISTS is_edited        BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_body    TEXT,        -- stored before first edit
  ADD COLUMN IF NOT EXISTS is_pinned        BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_url   TEXT,        -- Supabase Storage public URL
  ADD COLUMN IF NOT EXISTS attachment_type  TEXT,        -- 'image' | 'file'
  ADD COLUMN IF NOT EXISTS attachment_name  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size  INTEGER;     -- bytes

CREATE INDEX IF NOT EXISTS idx_chat_msg_reply  ON chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_pinned ON chat_messages(conversation_id, is_pinned) WHERE is_pinned = true;

-- ═══════════════════════════════════════════════════════════════════
-- 3. CHAT_CONVERSATIONS — channels support + group rename
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS description           TEXT,
  ADD COLUMN IF NOT EXISTS is_announcement_only  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_slug          TEXT;   -- e.g. 'procurement', 'safety-alerts'

-- Widen type CHECK to allow 'channel'
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_type_check;
ALTER TABLE chat_conversations
  ADD CONSTRAINT chat_conversations_type_check
  CHECK (type IN ('direct', 'group', 'channel'));

-- Regular (non-partial) unique index: PostgreSQL allows multiple NULLs naturally,
-- so non-channel rows (channel_slug IS NULL) never conflict with each other.
-- A regular index also satisfies ON CONFLICT (channel_slug) without a WHERE clause.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conv_slug ON chat_conversations(channel_slug);

-- ═══════════════════════════════════════════════════════════════════
-- 4. APP_USERS — online presence
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_users_last_seen ON app_users(last_seen_at);

-- ═══════════════════════════════════════════════════════════════════
-- 5. MESSAGE_READS — per-message read receipts
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS message_reads (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  message_id  TEXT NOT NULL,   -- references chat_messages(id)
  user_id     TEXT NOT NULL,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_reads_msg  ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_reads_user ON message_reads(user_id);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_message_reads" ON message_reads;
CREATE POLICY "auth_message_reads"
  ON message_reads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 6. MESSAGE_REACTIONS — emoji reactions
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS message_reactions (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  message_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)   -- one reaction per user per message (can change emoji)
);

CREATE INDEX IF NOT EXISTS idx_msg_react_msg  ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_react_user ON message_reactions(user_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_message_reactions" ON message_reactions;
CREATE POLICY "auth_message_reactions"
  ON message_reactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 7. MESSAGE_STARS — bookmarked messages
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS message_stars (
  id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  message_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_stars_user ON message_stars(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_stars_msg  ON message_stars(message_id);

ALTER TABLE message_stars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_message_stars" ON message_stars;
CREATE POLICY "auth_message_stars"
  ON message_stars FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 8. SEED: Default channels
--    #general and #announcements created as system channels.
--    These are inserted only once; the app will look them up by slug.
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO chat_conversations (id, type, name, channel_slug, description, is_announcement_only, created_by, created_at, updated_at)
VALUES
  ((gen_random_uuid())::text, 'channel', '# general',      'general',      'Company-wide general discussion', false, 'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# announcements','announcements','Official company announcements',  true,  'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# procurement',  'procurement',  'Procurement team discussion',     false, 'system', now(), now()),
  ((gen_random_uuid())::text, 'channel', '# safety-alerts','safety-alerts','Safety notices and alerts',       true,  'system', now(), now())
ON CONFLICT (channel_slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- NOTES FOR SUPABASE DASHBOARD:
-- Create a Storage bucket named "chat-attachments" with:
--   Public: true (for image previews)
--   File size limit: 25MB
--   Allowed MIME types: image/*, application/pdf, application/msword,
--     application/vnd.openxmlformats-officedocument.*, text/plain
-- ═══════════════════════════════════════════════════════════════════
