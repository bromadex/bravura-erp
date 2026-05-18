import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, TabNav } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  payroll_based_on: 'Attendance',
  consider_unmarked_attendance_as: 'Present',
  include_holidays_in_working_days: true,
  max_working_hours_timesheet: 9,
  daily_wages_fraction_half_day: 0.5,
  disable_rounded_total: false,
  show_leave_balances_in_slip: true,
  email_salary_slip_to_employee: false,
  encrypt_salary_slips: false,
  slip_password_policy: '',
  payroll_sender_email: '',
  payroll_sender_name: '',
  email_template_id: '',
  process_payroll_accounting_per_employee: false,
  mandatory_benefit_application: false,
  auto_create_overtime_slip: false,
  updated_at: null,
}

const TABS = [
  { id: 'working',  label: 'Working Days & Hours',  icon: 'schedule' },
  { id: 'slip',     label: 'Salary Slip Display',   icon: 'description' },
  { id: 'email',    label: 'Email',                 icon: 'mail' },
  { id: 'other',    label: 'Other Settings',        icon: 'settings' },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--green)' : 'var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'left 0.2s',
      }} />
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
      gap: 16,
    }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text)' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SectionCard({ children }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '24px',
      marginTop: 16,
    }}>
      {children}
    </div>
  )
}

export default function PayrollSettings() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('hr', 'payroll-settings')

  const [settings,  setSettings]  = useState(DEFAULTS)
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [activeTab, setActiveTab] = useState('working')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [settingsRes, templatesRes] = await Promise.all([
      supabase.from('payroll_settings').select('*').eq('id', 'singleton').maybeSingle(),
      supabase.from('notification_templates').select('id, event_type, title').eq('enabled', true).order('event_type'),
    ])
    if (settingsRes.error)  toast.error(settingsRes.error.message)
    if (templatesRes.error) toast.error(templatesRes.error.message)
    setSettings(settingsRes.data ? { ...DEFAULTS, ...settingsRes.data } : DEFAULTS)
    setTemplates(templatesRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const set = (field, value) => setSettings(s => ({ ...s, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...settings,
        email_template_id: settings.email_template_id || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('payroll_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Payroll settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : null

  if (loading) {
    return (
      <div>
        <PageHeader title="Payroll Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Payroll Settings" subtitle="Configure salary, slips and payroll processing">
        {canEdit && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'working' && (
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <FormField label="Payroll Based On">
              <select
                className="form-control"
                value={settings.payroll_based_on}
                onChange={e => set('payroll_based_on', e.target.value)}
                disabled={!canEdit}
              >
                <option value="Attendance">Attendance</option>
                <option value="Leave">Leave</option>
                <option value="Timesheet">Timesheet</option>
              </select>
            </FormField>
            <FormField label="Consider Unmarked Attendance As">
              <select
                className="form-control"
                value={settings.consider_unmarked_attendance_as}
                onChange={e => set('consider_unmarked_attendance_as', e.target.value)}
                disabled={!canEdit}
              >
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
              </select>
            </FormField>
            <FormField label="Max Working Hours (Timesheet)">
              <input
                className="form-control"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={settings.max_working_hours_timesheet}
                onChange={e => set('max_working_hours_timesheet', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Daily Wages Fraction for Half Day">
              <input
                className="form-control"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={settings.daily_wages_fraction_half_day}
                onChange={e => set('daily_wages_fraction_half_day', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
          </div>

          <div style={{ marginTop: 12 }}>
            <ToggleRow
              label="Include Holidays in Working Days"
              description="Count public holidays as working days when computing payroll"
              checked={settings.include_holidays_in_working_days}
              onChange={v => set('include_holidays_in_working_days', v)}
              disabled={!canEdit}
            />
          </div>

          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'slip' && (
        <SectionCard>
          <ToggleRow
            label="Disable Rounded Total"
            description="Show exact totals on salary slips without rounding"
            checked={settings.disable_rounded_total}
            onChange={v => set('disable_rounded_total', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Show Leave Balances in Slip"
            description="Display current leave balances on each employee's salary slip"
            checked={settings.show_leave_balances_in_slip}
            onChange={v => set('show_leave_balances_in_slip', v)}
            disabled={!canEdit}
          />
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'email' && (
        <SectionCard>
          <ToggleRow
            label="Email Salary Slip to Employee"
            description="Automatically email salary slips when a payroll cycle is finalized"
            checked={settings.email_salary_slip_to_employee}
            onChange={v => set('email_salary_slip_to_employee', v)}
            disabled={!canEdit}
          />
          {settings.email_salary_slip_to_employee && (
            <>
              <ToggleRow
                label="Encrypt Salary Slips"
                description="Send password-protected PDF slips for added security"
                checked={settings.encrypt_salary_slips}
                onChange={v => set('encrypt_salary_slips', v)}
                disabled={!canEdit}
              />
              <div style={{ marginTop: 16 }}>
                <FormField label="Slip Password Policy">
                  <input
                    className="form-control"
                    value={settings.slip_password_policy}
                    onChange={e => set('slip_password_policy', e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. <first_name><DOB:DDMM>"
                  />
                </FormField>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginTop: 16 }}>
            <FormField label="Payroll Sender Email">
              <input
                className="form-control"
                type="email"
                value={settings.payroll_sender_email}
                onChange={e => set('payroll_sender_email', e.target.value)}
                disabled={!canEdit}
                placeholder="payroll@company.com"
              />
            </FormField>
            <FormField label="Payroll Sender Name">
              <input
                className="form-control"
                value={settings.payroll_sender_name}
                onChange={e => set('payroll_sender_name', e.target.value)}
                disabled={!canEdit}
                placeholder="Acme Payroll"
              />
            </FormField>
            <FormField label="Email Template">
              <select
                className="form-control"
                value={settings.email_template_id || ''}
                onChange={e => set('email_template_id', e.target.value)}
                disabled={!canEdit}
              >
                <option value="">— None —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.event_type} — {t.title}</option>
                ))}
              </select>
            </FormField>
          </div>

          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'other' && (
        <SectionCard>
          <ToggleRow
            label="Process Payroll Accounting Per Employee"
            description="Post a separate accounting entry per employee instead of one consolidated entry"
            checked={settings.process_payroll_accounting_per_employee}
            onChange={v => set('process_payroll_accounting_per_employee', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Mandatory Benefit Application"
            description="Require employees to apply for benefits before payroll inclusion"
            checked={settings.mandatory_benefit_application}
            onChange={v => set('mandatory_benefit_application', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Auto-create Overtime Slip"
            description="Automatically generate overtime slips from attendance records"
            checked={settings.auto_create_overtime_slip}
            onChange={v => set('auto_create_overtime_slip', v)}
            disabled={!canEdit}
          />
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
