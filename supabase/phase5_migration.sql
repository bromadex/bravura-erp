-- ============================================================
-- BRAVURA ERP — PHASE 5 MIGRATION
-- Settings & Configuration Hub — per-module singleton settings
-- ALL PKs: TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text
-- ALL FK cols: TEXT (never UUID)
-- ============================================================

-- ============================================================
-- SECTION 1: PER-MODULE SETTINGS (singletons)
-- ============================================================

-- Employee Settings
CREATE TABLE IF NOT EXISTS employee_settings (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  emp_numbering_scheme        TEXT NOT NULL DEFAULT 'naming_series'
                                CHECK (emp_numbering_scheme IN ('naming_series','full_name','employee_number')),
  naming_series_prefix        TEXT NOT NULL DEFAULT 'BRA',
  retirement_age              INTEGER NOT NULL DEFAULT 65,
  standard_working_hours      NUMERIC(4,2) NOT NULL DEFAULT 8,
  date_of_joining_required    BOOLEAN NOT NULL DEFAULT true,
  enable_employee_self_service BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leave Settings
CREATE TABLE IF NOT EXISTS leave_settings (
  id                                       TEXT PRIMARY KEY DEFAULT 'singleton',
  auto_leave_encashment                    BOOLEAN NOT NULL DEFAULT false,
  leave_approver_mandatory                 BOOLEAN NOT NULL DEFAULT true,
  prevent_self_leave_approval              BOOLEAN NOT NULL DEFAULT true,
  show_all_dept_leaves_in_calendar         BOOLEAN NOT NULL DEFAULT false,
  send_leave_notification                  BOOLEAN NOT NULL DEFAULT true,
  leave_approval_template_id               TEXT REFERENCES notification_templates(id),
  leave_status_template_id                 TEXT REFERENCES notification_templates(id),
  restrict_backdated_leave_application     BOOLEAN NOT NULL DEFAULT false,
  backdated_allowed_role                   TEXT,
  default_leave_balance_alert_days         INTEGER NOT NULL DEFAULT 7,
  updated_at                               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense Settings
CREATE TABLE IF NOT EXISTS expense_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  expense_approver_mandatory          BOOLEAN NOT NULL DEFAULT true,
  prevent_self_expense_approval       BOOLEAN NOT NULL DEFAULT true,
  unlink_payment_on_advance_cancel    BOOLEAN NOT NULL DEFAULT true,
  require_receipt_attachment          BOOLEAN NOT NULL DEFAULT true,
  default_currency                    TEXT NOT NULL DEFAULT 'USD',
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shift & Attendance Settings
CREATE TABLE IF NOT EXISTS shift_attendance_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  allow_multiple_shift_assignments    BOOLEAN NOT NULL DEFAULT false,
  allow_employee_checkin_mobile       BOOLEAN NOT NULL DEFAULT false,
  allow_geolocation_tracking          BOOLEAN NOT NULL DEFAULT false,
  geolocation_radius_meters           INTEGER NOT NULL DEFAULT 100,
  auto_mark_absent_after_hours        INTEGER NOT NULL DEFAULT 4,
  late_entry_grace_minutes            INTEGER NOT NULL DEFAULT 15,
  early_exit_grace_minutes            INTEGER NOT NULL DEFAULT 15,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recruitment Settings
CREATE TABLE IF NOT EXISTS recruitment_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  check_vacancies_on_offer            BOOLEAN NOT NULL DEFAULT true,
  send_interview_reminder             BOOLEAN NOT NULL DEFAULT true,
  interview_reminder_template_id      TEXT REFERENCES notification_templates(id),
  send_interview_feedback_reminder    BOOLEAN NOT NULL DEFAULT true,
  feedback_reminder_template_id       TEXT REFERENCES notification_templates(id),
  remind_before_minutes               INTEGER NOT NULL DEFAULT 60,
  hiring_sender_email                 TEXT,
  hiring_sender_name                  TEXT,
  default_offer_validity_days         INTEGER NOT NULL DEFAULT 14,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenure Settings (separation/exit)
CREATE TABLE IF NOT EXISTS tenure_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  exit_questionnaire_url              TEXT,
  exit_notification_template_id       TEXT REFERENCES notification_templates(id),
  separation_notice_period_days       INTEGER NOT NULL DEFAULT 30,
  send_exit_reminder                  BOOLEAN NOT NULL DEFAULT true,
  remind_before_last_day_days         INTEGER NOT NULL DEFAULT 7,
  auto_create_fnf_on_separation       BOOLEAN NOT NULL DEFAULT false,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Settings
CREATE TABLE IF NOT EXISTS performance_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  rating_scale_max                    INTEGER NOT NULL DEFAULT 5
                                        CHECK (rating_scale_max IN (3,5,10,100)),
  default_appraisal_cycle_months      INTEGER NOT NULL DEFAULT 12,
  enable_peer_feedback                BOOLEAN NOT NULL DEFAULT true,
  enable_360_feedback                 BOOLEAN NOT NULL DEFAULT false,
  min_peer_reviewers                  INTEGER NOT NULL DEFAULT 3,
  appraisal_reminder_days_before      INTEGER NOT NULL DEFAULT 14,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payroll Settings (separate from generic hr_settings)
CREATE TABLE IF NOT EXISTS payroll_settings (
  id                                  TEXT PRIMARY KEY DEFAULT 'singleton',
  payroll_based_on                    TEXT NOT NULL DEFAULT 'Attendance'
                                        CHECK (payroll_based_on IN ('Attendance','Leave','Timesheet')),
  consider_unmarked_attendance_as     TEXT NOT NULL DEFAULT 'Present'
                                        CHECK (consider_unmarked_attendance_as IN ('Present','Absent')),
  include_holidays_in_working_days    BOOLEAN NOT NULL DEFAULT true,
  max_working_hours_timesheet         NUMERIC(4,2) NOT NULL DEFAULT 9,
  daily_wages_fraction_half_day       NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  disable_rounded_total               BOOLEAN NOT NULL DEFAULT false,
  show_leave_balances_in_slip         BOOLEAN NOT NULL DEFAULT true,
  email_salary_slip_to_employee       BOOLEAN NOT NULL DEFAULT false,
  encrypt_salary_slips                BOOLEAN NOT NULL DEFAULT false,
  slip_password_policy                TEXT,
  payroll_sender_email                TEXT,
  payroll_sender_name                 TEXT,
  email_template_id                   TEXT REFERENCES notification_templates(id),
  process_payroll_accounting_per_employee BOOLEAN NOT NULL DEFAULT false,
  mandatory_benefit_application       BOOLEAN NOT NULL DEFAULT false,
  auto_create_overtime_slip           BOOLEAN NOT NULL DEFAULT false,
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email Configuration (provider/sender)
CREATE TABLE IF NOT EXISTS email_configuration (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  provider                    TEXT NOT NULL DEFAULT 'none'
                                CHECK (provider IN ('none','resend','sendgrid','smtp','postmark')),
  api_key_ref                 TEXT,
  smtp_host                   TEXT,
  smtp_port                   INTEGER,
  smtp_user                   TEXT,
  smtp_password_ref           TEXT,
  smtp_secure                 BOOLEAN NOT NULL DEFAULT true,
  default_from_email          TEXT,
  default_from_name           TEXT,
  default_reply_to            TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT false,
  test_email_sent_at          TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed singletons
INSERT INTO employee_settings        (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO leave_settings           (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO expense_settings         (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO shift_attendance_settings(id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO recruitment_settings     (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO tenure_settings          (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO performance_settings     (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO payroll_settings         (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;
INSERT INTO email_configuration      (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SECTION 2: RLS
-- ============================================================

ALTER TABLE employee_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenure_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_configuration       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbls TEXT[] := ARRAY[
  'employee_settings','leave_settings','expense_settings',
  'shift_attendance_settings','recruitment_settings','tenure_settings',
  'performance_settings','payroll_settings','email_configuration'
];
t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
