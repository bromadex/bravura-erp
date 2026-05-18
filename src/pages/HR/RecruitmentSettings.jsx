import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, TabNav } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  check_vacancies_on_offer: true,
  send_interview_reminder: true,
  interview_reminder_template_id: '',
  send_interview_feedback_reminder: true,
  feedback_reminder_template_id: '',
  remind_before_minutes: 60,
  hiring_sender_email: '',
  hiring_sender_name: '',
  default_offer_validity_days: 14,
  updated_at: null,
}

const TABS = [
  { id: 'hiring',     label: 'Hiring',                icon: 'work_outline' },
  { id: 'reminders',  label: 'Interview Reminders',   icon: 'notifications' },
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

export default function RecruitmentSettings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('hiring')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [settingsRes, templatesRes] = await Promise.all([
      supabase.from('recruitment_settings').select('*').eq('id', 'singleton').maybeSingle(),
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
      const payload = { ...settings, updated_at: new Date().toISOString() }
      if (payload.interview_reminder_template_id === '') payload.interview_reminder_template_id = null
      if (payload.feedback_reminder_template_id === '') payload.feedback_reminder_template_id = null
      const { error } = await supabase.from('recruitment_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : null

  const renderTemplateOptions = () => (
    <>
      <option value="">— Select template —</option>
      {templates.map(t => (
        <option key={t.id} value={t.id}>
          {t.event_type} — {t.title}
        </option>
      ))}
    </>
  )

  if (loading) {
    return (
      <div>
        <PageHeader title="Recruitment Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Recruitment Settings" subtitle="Hiring workflow and interview reminder preferences">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'hiring' && (
        <SectionCard>
          <ToggleRow
            label="Check Vacancies on Offer"
            description="Verify an open vacancy exists before generating an offer letter"
            checked={settings.check_vacancies_on_offer}
            onChange={v => set('check_vacancies_on_offer', v)}
            disabled={!canEdit}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginTop: 20 }}>
            <FormField label="Default Offer Validity (days)">
              <input
                className="form-control"
                type="number"
                min={1}
                value={settings.default_offer_validity_days}
                onChange={e => set('default_offer_validity_days', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Hiring Sender Email">
              <input
                className="form-control"
                type="email"
                value={settings.hiring_sender_email}
                onChange={e => set('hiring_sender_email', e.target.value)}
                disabled={!canEdit}
                placeholder="hiring@company.com"
              />
            </FormField>
            <FormField label="Hiring Sender Name">
              <input
                className="form-control"
                value={settings.hiring_sender_name}
                onChange={e => set('hiring_sender_name', e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. Talent Acquisition"
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

      {activeTab === 'reminders' && (
        <SectionCard>
          <ToggleRow
            label="Send Interview Reminder"
            description="Email candidates and interviewers ahead of scheduled interviews"
            checked={settings.send_interview_reminder}
            onChange={v => set('send_interview_reminder', v)}
            disabled={!canEdit}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginTop: 20 }}>
            <FormField label="Interview Reminder Template">
              <select
                className="form-control"
                value={settings.interview_reminder_template_id || ''}
                onChange={e => set('interview_reminder_template_id', e.target.value)}
                disabled={!canEdit || !settings.send_interview_reminder}
              >
                {renderTemplateOptions()}
              </select>
            </FormField>
            <FormField label="Remind Before (minutes)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.remind_before_minutes}
                onChange={e => set('remind_before_minutes', Number(e.target.value))}
                disabled={!canEdit || !settings.send_interview_reminder}
              />
            </FormField>
          </div>
          <div style={{ marginTop: 8 }}>
            <ToggleRow
              label="Send Interview Feedback Reminder"
              description="Remind interviewers to submit feedback after interviews"
              checked={settings.send_interview_feedback_reminder}
              onChange={v => set('send_interview_feedback_reminder', v)}
              disabled={!canEdit}
            />
          </div>
          <div style={{ marginTop: 20, maxWidth: 480 }}>
            <FormField label="Feedback Reminder Template">
              <select
                className="form-control"
                value={settings.feedback_reminder_template_id || ''}
                onChange={e => set('feedback_reminder_template_id', e.target.value)}
                disabled={!canEdit || !settings.send_interview_feedback_reminder}
              >
                {renderTemplateOptions()}
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
    </div>
  )
}
