// src/pages/HR/SkillsSettings.jsx
// Singleton settings for the Skills & Competency module.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

const DEFAULTS = {
  id: 'singleton',
  skill_review_frequency_months: 12,
  mandatory_skill_assessment: false,
  allow_self_assessment: true,
  notify_upcoming_review: true,
  review_reminder_days: 14,
  track_certifications: true,
  updated_at: null,
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <div onClick={() => !disabled && onChange(!checked)} style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: checked ? 'var(--green)' : 'var(--border)', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s' }} />
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export default function SkillsSettings() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('skills_settings').select('*').eq('id', 'singleton').maybeSingle()
    if (error && error.code !== 'PGRST116') toast.error(error.message)
    setSettings(data ? { ...DEFAULTS, ...data } : DEFAULTS)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...settings, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('skills_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div><PageHeader title="Skills Settings" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Skills & Competency Settings" subtitle="Configure skill assessment, review cycles and notifications">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Assessment & Reviews</h3>
        <ToggleRow label="Mandatory Skill Assessment" description="Require managers to complete skill assessments for direct reports" checked={settings.mandatory_skill_assessment} onChange={v => set('mandatory_skill_assessment', v)} disabled={!canEdit} />
        <ToggleRow label="Allow Self-Assessment" description="Employees can submit their own skill proficiency ratings" checked={settings.allow_self_assessment} onChange={v => set('allow_self_assessment', v)} disabled={!canEdit} />
        <ToggleRow label="Track Certifications" description="Record and display certification status on employee skill cards" checked={settings.track_certifications} onChange={v => set('track_certifications', v)} disabled={!canEdit} />

        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', maxWidth: 520 }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Review Frequency (months)</label>
            <input className="form-control" type="number" min={1} max={36} value={settings.skill_review_frequency_months} onChange={e => set('skill_review_frequency_months', Number(e.target.value))} disabled={!canEdit} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>How often skill assessments are due per employee</div>
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>Notifications</h3>
        <ToggleRow label="Notify Upcoming Reviews" description="Send reminders before a skill review is due" checked={settings.notify_upcoming_review} onChange={v => set('notify_upcoming_review', v)} disabled={!canEdit} />

        {settings.notify_upcoming_review && (
          <div style={{ marginTop: 16, maxWidth: 260 }}>
            <div className="form-group">
              <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Remind Before (days)</label>
              <input className="form-control" type="number" min={1} max={90} value={settings.review_reminder_days} onChange={e => set('review_reminder_days', Number(e.target.value))} disabled={!canEdit} />
            </div>
          </div>
        )}

        {settings.updated_at && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}
