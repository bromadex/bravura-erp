import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, TabNav } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  auto_leave_encashment: false,
  leave_approver_mandatory: true,
  prevent_self_leave_approval: true,
  show_all_dept_leaves_in_calendar: true,
  send_leave_notification: true,
  leave_approval_template_id: '',
  leave_status_template_id: '',
  restrict_backdated_leave_application: false,
  backdated_allowed_role: '',
  default_leave_balance_alert_days: 7,
  updated_at: null,
}

const TABS = [
  { id: 'approval',      label: 'Approval Rules',         icon: 'rule' },
  { id: 'notifications', label: 'Notifications',          icon: 'notifications' },
  { id: 'calendar',      label: 'Calendar & Encashment',  icon: 'event' },
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

export default function LeaveSettings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('approval')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [settingsRes, templatesRes] = await Promise.all([
      supabase.from('leave_settings').select('*').eq('id', 'singleton').maybeSingle(),
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
      if (payload.leave_approval_template_id === '') payload.leave_approval_template_id = null
      if (payload.leave_status_template_id === '') payload.leave_status_template_id = null
      const { error } = await supabase.from('leave_settings').upsert(payload, { onConflict: 'id' })
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
        <PageHeader title="Leave Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Leave Settings" subtitle="Approval workflow, notifications and calendar preferences">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'approval' && (
        <SectionCard>
          <ToggleRow
            label="Leave Approver Mandatory"
            description="Require an approver to be assigned before leave can be submitted"
            checked={settings.leave_approver_mandatory}
            onChange={v => set('leave_approver_mandatory', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Prevent Self Leave Approval"
            description="Disallow employees from approving their own leave requests"
            checked={settings.prevent_self_leave_approval}
            onChange={v => set('prevent_self_leave_approval', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Restrict Backdated Leave Applications"
            description="Block leave requests for dates in the past"
            checked={settings.restrict_backdated_leave_application}
            onChange={v => set('restrict_backdated_leave_application', v)}
            disabled={!canEdit}
          />
          <div style={{ marginTop: 20 }}>
            <FormField label="Backdated Allowed Role">
              <input
                className="form-control"
                value={settings.backdated_allowed_role}
                onChange={e => set('backdated_allowed_role', e.target.value)}
                disabled={!canEdit || !settings.restrict_backdated_leave_application}
                placeholder="e.g. HR Manager"
              />
            </FormField>
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
          <ToggleRow
            label="Send Leave Notification"
            description="Send email notifications for leave events"
            checked={settings.send_leave_notification}
            onChange={v => set('send_leave_notification', v)}
            disabled={!canEdit}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginTop: 20 }}>
            <FormField label="Leave Approval Template">
              <select
                className="form-control"
                value={settings.leave_approval_template_id || ''}
                onChange={e => set('leave_approval_template_id', e.target.value)}
                disabled={!canEdit || !settings.send_leave_notification}
              >
                {renderTemplateOptions()}
              </select>
            </FormField>
            <FormField label="Leave Status Template">
              <select
                className="form-control"
                value={settings.leave_status_template_id || ''}
                onChange={e => set('leave_status_template_id', e.target.value)}
                disabled={!canEdit || !settings.send_leave_notification}
              >
                {renderTemplateOptions()}
              </select>
            </FormField>
            <FormField label="Default Leave Balance Alert (days)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.default_leave_balance_alert_days}
                onChange={e => set('default_leave_balance_alert_days', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
          </div>
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'calendar' && (
        <SectionCard>
          <ToggleRow
            label="Show All Department Leaves in Calendar"
            description="Display every department's leaves in the leave calendar"
            checked={settings.show_all_dept_leaves_in_calendar}
            onChange={v => set('show_all_dept_leaves_in_calendar', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Auto Leave Encashment"
            description="Automatically encash remaining leave at year-end"
            checked={settings.auto_leave_encashment}
            onChange={v => set('auto_leave_encashment', v)}
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
