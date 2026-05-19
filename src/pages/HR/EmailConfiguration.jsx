import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, AlertBanner } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  provider: 'none',
  api_key_ref: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password_ref: '',
  smtp_secure: true,
  default_from_email: '',
  default_from_name: '',
  default_reply_to: '',
  is_active: false,
  test_email_sent_at: null,
  updated_at: null,
}

const PROVIDERS = [
  { value: 'none',     label: 'None (disabled)' },
  { value: 'resend',   label: 'Resend' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'smtp',     label: 'SMTP' },
  { value: 'postmark', label: 'Postmark' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

function FormField({ label, hint, children }) {
  return (
    <div className="form-group" style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</div>}
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

export default function EmailConfiguration() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('hr', 'email-configuration')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('email_configuration')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (error) toast.error(error.message)
    if (data) {
      const merged = { ...DEFAULTS }
      Object.entries(data).forEach(([k, v]) => {
        merged[k] = (v === null && typeof DEFAULTS[k] === 'string') ? '' : v
      })
      setSettings(merged)
    } else {
      setSettings(DEFAULTS)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const set = (field, value) => setSettings(s => ({ ...s, [field]: value }))

  const validate = () => {
    if (settings.provider !== 'none') {
      if (!settings.default_from_email.trim()) {
        toast.error('Default From Email is required')
        return false
      }
      if (!EMAIL_RE.test(settings.default_from_email.trim())) {
        toast.error('Default From Email is not a valid email address')
        return false
      }
      if (settings.default_reply_to && !EMAIL_RE.test(settings.default_reply_to.trim())) {
        toast.error('Reply-To is not a valid email address')
        return false
      }
    }
    if (['resend', 'sendgrid', 'postmark'].includes(settings.provider)) {
      if (!settings.api_key_ref.trim()) {
        toast.error('API key reference is required for this provider')
        return false
      }
    }
    if (settings.provider === 'smtp') {
      if (!settings.smtp_host.trim()) { toast.error('SMTP host is required'); return false }
      if (!settings.smtp_port)        { toast.error('SMTP port is required'); return false }
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        ...settings,
        smtp_port: settings.smtp_port ? Number(settings.smtp_port) : null,
        default_reply_to: settings.default_reply_to.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('email_configuration').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Email configuration saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendTest = async () => {
    setTesting(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        ...settings,
        smtp_port: settings.smtp_port ? Number(settings.smtp_port) : null,
        default_reply_to: settings.default_reply_to.trim() || null,
        test_email_sent_at: now,
        updated_at: now,
      }
      const { error } = await supabase.from('email_configuration').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, test_email_sent_at: now, updated_at: now }))
      toast.success('Test email queued (provider integration coming in Phase 10)')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setTesting(false)
    }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : null

  const showApiKey  = ['resend', 'sendgrid', 'postmark'].includes(settings.provider)
  const showSmtp    = settings.provider === 'smtp'
  const showCreds   = settings.provider !== 'none'

  if (loading) {
    return (
      <div>
        <PageHeader title="Email Configuration" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Email Configuration" subtitle="Configure outbound email provider for HR notifications">
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && settings.provider !== 'none' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSendTest}
              disabled={testing || saving}
            >
              <span className="material-icons">send</span>
              {testing ? 'Sending…' : 'Send Test Email'}
            </button>
          )}
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
        </div>
      </PageHeader>

      <div style={{ marginTop: 16 }}>
        <AlertBanner
          type="warning"
          message="Email provider integration requires Phase 10 (engines). This page configures the credentials only; actual sending will be activated later."
        />
      </div>

      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <FormField label="Provider">
            <select
              className="form-control"
              value={settings.provider}
              onChange={e => set('provider', e.target.value)}
              disabled={!canEdit}
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </FormField>

          {showApiKey && (
            <FormField
              label="API Key Reference"
              hint="Reference name for the secret stored in your vault (do not paste the key itself)."
            >
              <input
                className="form-control"
                value={settings.api_key_ref}
                onChange={e => set('api_key_ref', e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. resend.api_key"
              />
            </FormField>
          )}
        </div>

        {showSmtp && (
          <>
            <div style={{
              marginTop: 8,
              padding: '12px 0 8px',
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              SMTP Settings
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <FormField label="SMTP Host">
                <input
                  className="form-control"
                  value={settings.smtp_host}
                  onChange={e => set('smtp_host', e.target.value)}
                  disabled={!canEdit}
                  placeholder="smtp.example.com"
                />
              </FormField>
              <FormField label="SMTP Port">
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.smtp_port}
                  onChange={e => set('smtp_port', Number(e.target.value))}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField label="SMTP User">
                <input
                  className="form-control"
                  value={settings.smtp_user}
                  onChange={e => set('smtp_user', e.target.value)}
                  disabled={!canEdit}
                  placeholder="username"
                />
              </FormField>
              <FormField
                label="SMTP Password Reference"
                hint="Reference name for the SMTP password stored in your vault."
              >
                <input
                  className="form-control"
                  value={settings.smtp_password_ref}
                  onChange={e => set('smtp_password_ref', e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g. smtp.password"
                />
              </FormField>
            </div>
            <div style={{ marginTop: 4 }}>
              <ToggleRow
                label="Use Secure Connection (TLS/SSL)"
                description="Enable for ports 465 (SSL) and 587 (STARTTLS)"
                checked={settings.smtp_secure}
                onChange={v => set('smtp_secure', v)}
                disabled={!canEdit}
              />
            </div>
          </>
        )}

        {showCreds && (
          <>
            <div style={{
              marginTop: 8,
              padding: '12px 0 8px',
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}>
              Sender Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <FormField label="Default From Email">
                <input
                  className="form-control"
                  type="email"
                  value={settings.default_from_email}
                  onChange={e => set('default_from_email', e.target.value)}
                  disabled={!canEdit}
                  placeholder="no-reply@company.com"
                />
              </FormField>
              <FormField label="Default From Name">
                <input
                  className="form-control"
                  value={settings.default_from_name}
                  onChange={e => set('default_from_name', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Acme HR"
                />
              </FormField>
              <FormField label="Default Reply-To (optional)">
                <input
                  className="form-control"
                  type="email"
                  value={settings.default_reply_to}
                  onChange={e => set('default_reply_to', e.target.value)}
                  disabled={!canEdit}
                  placeholder="hr@company.com"
                />
              </FormField>
            </div>
          </>
        )}

        <div style={{ marginTop: 8 }}>
          <ToggleRow
            label="Configuration Active"
            description="Master switch — when off, no outbound emails will be sent regardless of provider"
            checked={settings.is_active}
            onChange={v => set('is_active', v)}
            disabled={!canEdit}
          />
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
          {settings.test_email_sent_at && (
            <div>Last test email queued: {fmtDate(settings.test_email_sent_at)}</div>
          )}
          {settings.updated_at && (
            <div>Last updated: {fmtDate(settings.updated_at)}</div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
