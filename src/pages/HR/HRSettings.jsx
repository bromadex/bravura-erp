import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, TabNav } from '../../components/ui'

const MONTHS = [
  { value: 1,  label: 'January' },
  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },
  { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },
  { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const DEFAULTS = {
  id: 'singleton',
  company_name: '',
  company_address: '',
  payroll_frequency: 'Monthly',
  currency: 'USD',
  working_days_per_month: 26,
  working_hours_per_day: 8,
  standard_working_hours: 8,
  overtime_threshold_hours: 8,
  tax_year_start_month: 1,
  leave_year_start_month: 1,
  probation_period_days: 90,
  notice_period_days: 30,
  max_leave_carry_forward: 10,
  hr_email: '',
  hr_manager_name: '',
  enable_attendance_auto_mark: false,
  enable_leave_expiry_alerts: true,
  enable_birthday_alerts: true,
  enable_contract_expiry_alerts: true,
  updated_at: null,
}

const TABS = [
  { id: 'company',      label: 'Company',            icon: 'business' },
  { id: 'payroll',      label: 'Payroll',             icon: 'payments' },
  { id: 'leave',        label: 'Leave & Attendance',  icon: 'event_note' },
  { id: 'notifications',label: 'Notifications',       icon: 'notifications' },
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

export default function HRSettings() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [activeTab, setActiveTab] = useState('company')

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('hr_settings')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) toast.error(error.message)
    setSettings(data ? { ...DEFAULTS, ...data } : DEFAULTS)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const set = (field, value) => setSettings(s => ({ ...s, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...settings, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('hr_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fmtDate = (iso) => {
    if (!iso) return null
    return new Date(iso).toLocaleString()
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="HR Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="HR Settings" subtitle="Configure company-wide HR preferences">
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

      {activeTab === 'company' && (
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <FormField label="Company Name">
              <input
                className="form-control"
                value={settings.company_name}
                onChange={e => set('company_name', e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. Acme Corporation"
              />
            </FormField>
            <FormField label="HR Manager Name">
              <input
                className="form-control"
                value={settings.hr_manager_name}
                onChange={e => set('hr_manager_name', e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. Jane Smith"
              />
            </FormField>
            <FormField label="HR Email">
              <input
                className="form-control"
                type="email"
                value={settings.hr_email}
                onChange={e => set('hr_email', e.target.value)}
                disabled={!canEdit}
                placeholder="hr@company.com"
              />
            </FormField>
          </div>
          <FormField label="Company Address">
            <textarea
              className="form-control"
              rows={3}
              value={settings.company_address}
              onChange={e => set('company_address', e.target.value)}
              disabled={!canEdit}
              placeholder="Full company address"
              style={{ resize: 'vertical' }}
            />
          </FormField>
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'payroll' && (
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <FormField label="Payroll Frequency">
              <select
                className="form-control"
                value={settings.payroll_frequency}
                onChange={e => set('payroll_frequency', e.target.value)}
                disabled={!canEdit}
              >
                <option value="Monthly">Monthly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Bimonthly">Bimonthly</option>
                <option value="Weekly">Weekly</option>
              </select>
            </FormField>
            <FormField label="Currency">
              <select
                className="form-control"
                value={settings.currency}
                onChange={e => set('currency', e.target.value)}
                disabled={!canEdit}
              >
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
                <option value="ZWL">ZWL</option>
              </select>
            </FormField>
            <FormField label="Working Days per Month">
              <input
                className="form-control"
                type="number"
                min={1}
                max={31}
                value={settings.working_days_per_month}
                onChange={e => set('working_days_per_month', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Working Hours per Day">
              <input
                className="form-control"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={settings.working_hours_per_day}
                onChange={e => set('working_hours_per_day', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Overtime Threshold (hours/day)">
              <input
                className="form-control"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={settings.overtime_threshold_hours}
                onChange={e => set('overtime_threshold_hours', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Tax Year Start Month">
              <select
                className="form-control"
                value={settings.tax_year_start_month}
                onChange={e => set('tax_year_start_month', Number(e.target.value))}
                disabled={!canEdit}
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FormField>
          </div>
          {settings.updated_at && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'leave' && (
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <FormField label="Leave Year Start Month">
              <select
                className="form-control"
                value={settings.leave_year_start_month}
                onChange={e => set('leave_year_start_month', Number(e.target.value))}
                disabled={!canEdit}
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Max Leave Carry Forward (days)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.max_leave_carry_forward}
                onChange={e => set('max_leave_carry_forward', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Probation Period (days)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.probation_period_days}
                onChange={e => set('probation_period_days', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Notice Period (days)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.notice_period_days}
                onChange={e => set('notice_period_days', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
          </div>
          <div style={{ marginTop: 8 }}>
            <ToggleRow
              label="Enable Attendance Auto-Mark"
              checked={settings.enable_attendance_auto_mark}
              onChange={v => set('enable_attendance_auto_mark', v)}
              disabled={!canEdit}
            />
            <ToggleRow
              label="Enable Leave Expiry Alerts"
              checked={settings.enable_leave_expiry_alerts}
              onChange={v => set('enable_leave_expiry_alerts', v)}
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

      {activeTab === 'notifications' && (
        <SectionCard>
          <div style={{ marginBottom: 8 }}>
            <ToggleRow
              label="Birthday Alerts"
              description="Send notifications when employees have upcoming birthdays"
              checked={settings.enable_birthday_alerts}
              onChange={v => set('enable_birthday_alerts', v)}
              disabled={!canEdit}
            />
            <ToggleRow
              label="Contract Expiry Alerts"
              description="Notify HR when employee contracts are nearing expiry"
              checked={settings.enable_contract_expiry_alerts}
              onChange={v => set('enable_contract_expiry_alerts', v)}
              disabled={!canEdit}
            />
          </div>
          <div style={{ marginTop: 20 }}>
            <FormField label="Standard Working Hours (per day)">
              <input
                className="form-control"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={settings.standard_working_hours}
                onChange={e => set('standard_working_hours', Number(e.target.value))}
                disabled={!canEdit}
                style={{ maxWidth: 160 }}
              />
            </FormField>
          </div>
          {settings.updated_at && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
