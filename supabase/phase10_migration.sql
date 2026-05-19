-- Phase 10 Migration: Cross-Cutting Engines
-- PWA Push Notifications, Email Engine, Web Forms (Exit Questionnaire), Workflow Assignments
-- Run in Supabase Dashboard → SQL Editor.

-- ============================================================
-- 1. push_subscriptions — per-user web push endpoints
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  user_id       TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  p256dh_key    TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  user_agent    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "allow_all_push_subscriptions" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. email_logs — track every outbound email
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  to_email             TEXT NOT NULL,
  to_name              TEXT,
  cc_emails            TEXT,
  from_email           TEXT,
  from_name            TEXT,
  subject              TEXT,
  body_html            TEXT,
  body_text            TEXT,
  template_id          TEXT,
  event_type           TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sent','failed','bounced')),
  provider             TEXT,
  provider_message_id  TEXT,
  error_message        TEXT,
  related_entity_type  TEXT,
  related_entity_id    TEXT,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_status     ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email   ON email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_event_type ON email_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_email_logs" ON email_logs;
CREATE POLICY "allow_all_email_logs" ON email_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. push_logs — track every push notification delivered
-- ============================================================
CREATE TABLE IF NOT EXISTS push_logs (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  subscription_id      TEXT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  user_id              TEXT NOT NULL,
  title                TEXT,
  body                 TEXT,
  link                 TEXT,
  event_type           TEXT,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','sent','failed')),
  error_message        TEXT,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_push_logs" ON push_logs;
CREATE POLICY "allow_all_push_logs" ON push_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 4. exit_questionnaire_tokens & responses
-- ============================================================
CREATE TABLE IF NOT EXISTS exit_questionnaire_tokens (
  id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  employee_id       TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  exit_interview_id TEXT REFERENCES exit_interviews(id) ON DELETE SET NULL,
  token             TEXT NOT NULL UNIQUE,
  expires_at        TIMESTAMPTZ,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_exit_q_tokens_token    ON exit_questionnaire_tokens(token);
CREATE INDEX IF NOT EXISTS idx_exit_q_tokens_employee ON exit_questionnaire_tokens(employee_id);

CREATE TABLE IF NOT EXISTS exit_questionnaire_responses (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  token_id     TEXT NOT NULL REFERENCES exit_questionnaire_tokens(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL,
  question     TEXT NOT NULL,
  answer       TEXT,
  rating       INT CHECK (rating BETWEEN 1 AND 5),
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_q_resp_token ON exit_questionnaire_responses(token_id);

ALTER TABLE exit_questionnaire_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_questionnaire_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_exit_q_tokens"    ON exit_questionnaire_tokens;
DROP POLICY IF EXISTS "allow_all_exit_q_responses" ON exit_questionnaire_responses;
CREATE POLICY "allow_all_exit_q_tokens"    ON exit_questionnaire_tokens    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_exit_q_responses" ON exit_questionnaire_responses FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. notification_templates — add email & push channels
-- ============================================================
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS send_email     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS send_push      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS email_subject  TEXT;
ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS email_body     TEXT;

-- ============================================================
-- 6. Workflow tables — IF NOT EXISTS guards (defensive)
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id                 TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  name               TEXT NOT NULL,
  module             TEXT NOT NULL,
  entity_type        TEXT NOT NULL,
  description        TEXT,
  department_filter  TEXT,
  priority           INT NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id               TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  workflow_id      TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order       INT NOT NULL,
  step_name        TEXT NOT NULL,
  required_role    TEXT,
  approval_type    TEXT DEFAULT 'any',
  sla_hours        INT,
  specific_user_id TEXT,
  description      TEXT,
  status_on_entry  TEXT,
  status_on_pass   TEXT,
  status_on_fail   TEXT DEFAULT 'rejected',
  is_final         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_assignments (
  id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  workflow_id     TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  department_id   TEXT,
  department_name TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  priority        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, department_id)
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id                   TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  workflow_id          TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  entity_type          TEXT NOT NULL,
  entity_id            TEXT NOT NULL,
  current_step_id      TEXT REFERENCES workflow_steps(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  initiated_by         TEXT,
  initiated_by_name    TEXT,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_actions (
  id           TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  instance_id  TEXT REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_id      TEXT REFERENCES workflow_steps(id) ON DELETE SET NULL,
  actor_id     TEXT,
  actor_name   TEXT,
  actor_role   TEXT,
  action       TEXT NOT NULL,
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow         ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_assignments_entity     ON workflow_assignments(entity_type);
CREATE INDEX IF NOT EXISTS idx_workflow_assignments_dept       ON workflow_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity       ON workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status       ON workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_actions_instance       ON workflow_actions(instance_id);

ALTER TABLE workflows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_actions     ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workflows'            AND policyname='allow_all_workflows')            THEN CREATE POLICY "allow_all_workflows"            ON workflows            FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workflow_steps'       AND policyname='allow_all_workflow_steps')       THEN CREATE POLICY "allow_all_workflow_steps"       ON workflow_steps       FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workflow_assignments' AND policyname='allow_all_workflow_assignments') THEN CREATE POLICY "allow_all_workflow_assignments" ON workflow_assignments FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workflow_instances'   AND policyname='allow_all_workflow_instances')   THEN CREATE POLICY "allow_all_workflow_instances"   ON workflow_instances   FOR ALL USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workflow_actions'     AND policyname='allow_all_workflow_actions')     THEN CREATE POLICY "allow_all_workflow_actions"     ON workflow_actions     FOR ALL USING (true) WITH CHECK (true); END IF;
END $$;

-- ============================================================
-- 7. exit_questionnaire_settings — singleton config
-- ============================================================
CREATE TABLE IF NOT EXISTS exit_questionnaire_settings (
  id                  TEXT PRIMARY KEY DEFAULT 'singleton',
  is_enabled          BOOLEAN NOT NULL DEFAULT true,
  default_expiry_days INT NOT NULL DEFAULT 30,
  intro_text          TEXT DEFAULT 'Thank you for your service. Please share your honest feedback to help us improve.',
  thank_you_text      TEXT DEFAULT 'Thank you for your feedback. Your responses have been recorded.',
  questions           JSONB DEFAULT '[
    {"order":1,"question":"What is the primary reason for your departure?","type":"text","required":true},
    {"order":2,"question":"How would you rate your overall experience working here?","type":"rating","required":true},
    {"order":3,"question":"How would you rate the management and leadership?","type":"rating","required":true},
    {"order":4,"question":"How would you rate the work-life balance?","type":"rating","required":true},
    {"order":5,"question":"How would you rate compensation and benefits?","type":"rating","required":false},
    {"order":6,"question":"What did you like most about working here?","type":"text","required":false},
    {"order":7,"question":"What could be improved?","type":"text","required":false},
    {"order":8,"question":"Would you recommend us as an employer to others?","type":"yesno","required":true},
    {"order":9,"question":"Any other comments or suggestions?","type":"text","required":false}
  ]'::jsonb,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exit_questionnaire_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE exit_questionnaire_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_exit_q_settings" ON exit_questionnaire_settings;
CREATE POLICY "allow_all_exit_q_settings" ON exit_questionnaire_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 8. VAPID keys singleton (server-side, for push)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_config (
  id          TEXT PRIMARY KEY DEFAULT 'singleton',
  vapid_public_key  TEXT,
  vapid_private_key TEXT,
  vapid_subject     TEXT DEFAULT 'mailto:admin@bravura.local',
  is_enabled        BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO push_config (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

ALTER TABLE push_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_push_config" ON push_config;
CREATE POLICY "allow_all_push_config" ON push_config FOR ALL USING (true) WITH CHECK (true);
