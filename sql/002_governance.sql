-- ============================================================
-- Governance module: unified governance_documents table
-- + announcement_reads + governance_responses
-- Run in Supabase SQL editor
-- ============================================================

-- 1. governance_documents — unified document store
CREATE TABLE IF NOT EXISTS governance_documents (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  doc_type                 TEXT NOT NULL CHECK (doc_type IN ('announcement','memo','policy','code_of_ethics')),
  txn_code                 TEXT,                    -- for memos (MO-XXXX)
  title                    TEXT NOT NULL,
  body                     TEXT,
  priority                 TEXT DEFAULT 'normal',   -- announcements: normal/important/urgent
  category                 TEXT,                    -- memos/policies: department/topic
  version                  TEXT,                    -- policies: version number
  is_mandatory_onboarding  BOOLEAN DEFAULT FALSE,   -- code_of_ethics gate
  published_by             TEXT,                    -- references app_users.id (TEXT)
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ
);

-- 2. announcement_reads — tracks who read what (announcements + memos)
CREATE TABLE IF NOT EXISTS announcement_reads (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  document_id TEXT NOT NULL REFERENCES governance_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  read_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

-- 3. governance_responses — policy accept / reject
CREATE TABLE IF NOT EXISTS governance_responses (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  document_id  TEXT NOT NULL REFERENCES governance_documents(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  response     TEXT NOT NULL CHECK (response IN ('accepted','rejected','consulted')),
  comments     TEXT,
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_gov_docs_type     ON governance_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_gov_reads_user    ON announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_gov_responses_doc ON governance_responses(document_id);

-- 5. Migrate existing announcements (optional)
-- INSERT INTO governance_documents (id, doc_type, title, body, priority, published_by, created_at)
-- SELECT id, 'announcement', title, body, priority, posted_by, created_at FROM announcements;

-- 6. Migrate existing policies (optional)
-- INSERT INTO governance_documents (id, doc_type, title, body, version, published_by, created_at)
-- SELECT id, 'policy', title, description, version, NULL, created_at FROM policies;
