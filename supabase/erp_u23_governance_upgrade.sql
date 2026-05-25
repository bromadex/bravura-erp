-- erp_u23_governance_upgrade.sql
-- Governance module upgrade: announcements, memos, policies, code of ethics.
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT).

-- ═══════════════════════════════════════════════════════════════════
-- 1. GOVERNANCE_DOCUMENTS — new columns
-- ═══════════════════════════════════════════════════════════════════

-- Announcements
ALTER TABLE governance_documents
  ADD COLUMN IF NOT EXISTS expiry_date        DATE,
  ADD COLUMN IF NOT EXISTS is_archived        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_pinned          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pin_until          DATE,
  ADD COLUMN IF NOT EXISTS target_roles       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_departments TEXT[] NOT NULL DEFAULT '{}';

-- Memos
ALTER TABLE governance_documents
  ADD COLUMN IF NOT EXISTS visibility         TEXT NOT NULL DEFAULT 'public'
                             CHECK (visibility IN ('public','private','confidential')),
  ADD COLUMN IF NOT EXISTS recipient_ids      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cc_ids             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_ack       BOOLEAN NOT NULL DEFAULT false;

-- Policies
ALTER TABLE governance_documents
  ADD COLUMN IF NOT EXISTS is_mandatory       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledge_by     DATE,
  ADD COLUMN IF NOT EXISTS current_version_id TEXT;

-- All document types (HTML body storage)
ALTER TABLE governance_documents
  ADD COLUMN IF NOT EXISTS body_html          TEXT,   -- rich text (HTML)
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════
-- 2. GOVERNANCE_RESPONSES — new columns
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE governance_responses
  ADD COLUMN IF NOT EXISTS document_version   TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at    TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════
-- 3. GOVERNANCE_DOCUMENT_VERSIONS
--    Immutable snapshots — one row per saved version of a policy/CoE.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS governance_document_versions (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  document_id     TEXT NOT NULL REFERENCES governance_documents(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,          -- '1.0', '1.1', '2.0' …
  body_html       TEXT,                   -- full HTML snapshot
  change_notes    TEXT,                   -- what changed in this version
  changed_by      TEXT,
  changed_by_name TEXT,
  effective_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gdv_document ON governance_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_gdv_created  ON governance_document_versions(document_id, created_at DESC);

ALTER TABLE governance_document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_gov_doc_versions" ON governance_document_versions;
CREATE POLICY "auth_gov_doc_versions"
  ON governance_document_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 4. ETHICS_SIGNATURES
--    Annual Code-of-Ethics signing log.
--    One row per user per year — UNIQUE (user_id, signature_year).
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ethics_signatures (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  user_id        TEXT NOT NULL,
  user_name      TEXT,
  employee_id    TEXT,
  document_id    TEXT REFERENCES governance_documents(id),
  signature_year INT  NOT NULL,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, signature_year)
);

CREATE INDEX IF NOT EXISTS idx_esig_user ON ethics_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_esig_year ON ethics_signatures(signature_year);

ALTER TABLE ethics_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_ethics_signatures" ON ethics_signatures;
CREATE POLICY "auth_ethics_signatures"
  ON ethics_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- 5. ANNOUNCEMENT_READS — ensure index exists
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_ann_reads_doc  ON announcement_reads(document_id);
CREATE INDEX IF NOT EXISTS idx_ann_reads_user ON announcement_reads(user_id);

-- ═══════════════════════════════════════════════════════════════════
-- 6. GOVERNANCE_RESPONSES — ensure index exists
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_gov_resp_doc  ON governance_responses(document_id);
CREATE INDEX IF NOT EXISTS idx_gov_resp_user ON governance_responses(user_id);
