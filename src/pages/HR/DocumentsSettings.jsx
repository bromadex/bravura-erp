import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

const DEFAULTS = {
  id: 'singleton',
  require_document_verification: false,
  notify_before_expiry_days: 30,
  notify_on_document_upload: true,
  block_payroll_if_missing_mandatory: false,
  allow_employee_upload: true,
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

export default function DocumentsSettings() {
  const canEdit = useCanEdit('hr', 'settings')
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('documents_settings').select('*').eq('id', 'singleton').maybeSingle()
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
      const { error } = await supabase.from('documents_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div><PageHeader title="Documents Settings" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Documents Settings" subtitle="Configure employee document verification and expiry policies">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Verification & Upload</h3>
        <ToggleRow label="Require Verification" description="Documents must be verified by HR before they count as valid" checked={settings.require_document_verification} onChange={v => set('require_document_verification', v)} disabled={!canEdit} />
        <ToggleRow label="Allow Employee Upload" description="Employees can upload their own documents via ESS" checked={settings.allow_employee_upload} onChange={v => set('allow_employee_upload', v)} disabled={!canEdit} />
        <ToggleRow label="Notify on Upload" description="Send notification when a new document is uploaded" checked={settings.notify_on_document_upload} onChange={v => set('notify_on_document_upload', v)} disabled={!canEdit} />

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>Expiry & Compliance</h3>
        <ToggleRow label="Block Payroll if Missing Mandatory Docs" description="Prevent payroll processing for employees missing required documents" checked={settings.block_payroll_if_missing_mandatory} onChange={v => set('block_payroll_if_missing_mandatory', v)} disabled={!canEdit} />

        <div style={{ marginTop: 16, maxWidth: 280 }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Notify Before Expiry (days)</label>
            <input className="form-control" type="number" min={1} max={365} value={settings.notify_before_expiry_days} onChange={e => set('notify_before_expiry_days', Number(e.target.value))} disabled={!canEdit} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Alert HR and the employee this many days before a document expires</div>
          </div>
        </div>

        {settings.updated_at && (
          <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-dim)' }}>
            Last updated: {new Date(settings.updated_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  )
}
