-- ============================================================
-- Connect module: real-time messaging tables
-- Run in Supabase SQL editor
-- ============================================================

-- 1. chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  type        TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  name        TEXT,          -- group chat name
  created_by  TEXT,          -- app_users.id
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. chat_participants
CREATE TABLE IF NOT EXISTS chat_participants (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,   -- app_users.id
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- 3. chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL,   -- app_users.id
  body            TEXT NOT NULL,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_participants_conv ON chat_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv     ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_time     ON chat_messages(created_at);

-- 5. Enable Realtime on chat_messages (run in Supabase dashboard)
-- ALTER publication supabase_realtime ADD TABLE chat_messages;

-- 6. Row Level Security (optional but recommended)
-- ALTER TABLE chat_conversations  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_participants   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;
--
-- Policies: users can only see conversations they are participants of.
-- CREATE POLICY "participants see their convs" ON chat_conversations
--   FOR SELECT USING (
--     id IN (SELECT conversation_id FROM chat_participants WHERE user_id = auth.uid()::TEXT)
--   );
