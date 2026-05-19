import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  exit_questionnaire_url: '',
  exit_notification_template_id: '',
  separation_notice_period_days: 30,
  send_exit_reminder: false,
  remind_before_last_day_days: 7,
  auto_create_fnf_on_separation: false,
  updated_at: null,
}

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

export default function TenureSettings() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('hr', 'tenure-settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [templates, setTemplates] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [settingsRes, templatesRes] = await Promise.all([
      supabase.from('tenure_settings').select('*').eq('id', 'singleton').maybeSingle(),
      supabase.from('notification_templates').select('id, event_type, title').eq('enabled', true).order('event_type'),
    ])
    if (settingsRes.error) toast.error(settingsRes.error.message)
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
        exit_notification_template_id: settings.exit_notification_template_id || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('tenure_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Tenure settings saved')
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
        <PageHeader title="Tenure Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Tenure Settings" subtitle="Configure separation, exit and FnF preferences">
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

      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <FormField label="Exit Questionnaire URL (external override)">
            <input
              className="form-control"
              type="url"
              value={settings.exit_questionnaire_url}
              onChange={e => set('exit_questionnaire_url', e.target.value)}
              disabled={!canEdit}
              placeholder="Leave empty to use built-in form"
            />
            <small style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginTop: 4 }}>
              Or use the built-in exit questionnaire at{' '}
              <a href="/module/hr/exit-questionnaire" style={{ color: 'var(--gold)' }}>HR → Exit Questionnaire</a>
            </small>
          </FormField>
          <FormField label="Exit Notification Template">
            <select
              className="form-control"
              value={settings.exit_notification_template_id || ''}
              onChange={e => set('exit_notification_template_id', e.target.value)}
              disabled={!canEdit}
            >
              <option value="">— None —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.event_type} — {t.title}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Separation Notice Period (days)">
            <input
              className="form-control"
              type="number"
              min={0}
              value={settings.separation_notice_period_days}
              onChange={e => set('separation_notice_period_days', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Remind Before Last Day (days)">
            <input
              className="form-control"
              type="number"
              min={0}
              value={settings.remind_before_last_day_days}
              onChange={e => set('remind_before_last_day_days', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
        </div>

        <div style={{ marginTop: 12 }}>
          <ToggleRow
            label="Send Exit Reminder"
            description="Send an automated reminder before the employee's last day"
            checked={settings.send_exit_reminder}
            onChange={v => set('send_exit_reminder', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Auto-create Full & Final on Separation"
            description="Automatically generate FnF statement when a separation is finalized"
            checked={settings.auto_create_fnf_on_separation}
            onChange={v => set('auto_create_fnf_on_separation', v)}
            disabled={!canEdit}
          />
        </div>

        {settings.updated_at && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
            Last updated: {fmtDate(settings.updated_at)}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
