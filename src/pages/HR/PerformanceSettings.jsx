import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  rating_scale_max: 5,
  default_appraisal_cycle_months: 12,
  enable_peer_feedback: false,
  enable_360_feedback: false,
  min_peer_reviewers: 3,
  appraisal_reminder_days_before: 14,
  updated_at: null,
}

const SCALE_OPTIONS = [3, 5, 10, 100]

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

export default function PerformanceSettings() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('hr', 'performance-settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('performance_settings')
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
      const { error } = await supabase.from('performance_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Performance settings saved')
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
        <PageHeader title="Performance Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Performance Settings" subtitle="Configure appraisal cycles, rating scales and feedback">
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
          <FormField label="Rating Scale Max">
            <select
              className="form-control"
              value={settings.rating_scale_max}
              onChange={e => set('rating_scale_max', Number(e.target.value))}
              disabled={!canEdit}
            >
              {SCALE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Default Appraisal Cycle (months)">
            <input
              className="form-control"
              type="number"
              min={1}
              max={60}
              value={settings.default_appraisal_cycle_months}
              onChange={e => set('default_appraisal_cycle_months', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Appraisal Reminder (days before)">
            <input
              className="form-control"
              type="number"
              min={0}
              value={settings.appraisal_reminder_days_before}
              onChange={e => set('appraisal_reminder_days_before', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
          {settings.enable_peer_feedback && (
            <FormField label="Minimum Peer Reviewers">
              <input
                className="form-control"
                type="number"
                min={1}
                value={settings.min_peer_reviewers}
                onChange={e => set('min_peer_reviewers', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <ToggleRow
            label="Enable Peer Feedback"
            description="Allow employees to be reviewed by their peers"
            checked={settings.enable_peer_feedback}
            onChange={v => set('enable_peer_feedback', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Enable 360° Feedback"
            description="Collect feedback from managers, peers, reports and self"
            checked={settings.enable_360_feedback}
            onChange={v => set('enable_360_feedback', v)}
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
