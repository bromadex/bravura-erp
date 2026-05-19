import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, Spinner } from '../../components/ui'
import toast from 'react-hot-toast'

const DEFAULTS = {
  id: 'singleton',
  max_benefit_amount: 50000,
  currency: 'USD',
  require_receipt: true,
  allow_claims_without_application: false,
  gratuity_minimum_years: 1,
  gratuity_pay_with_payroll: false,
  notify_on_application: true,
  notify_on_claim_approval: true,
  updated_at: null,
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, background: checked ? 'var(--green)' : 'var(--border)', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
    >
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

export default function BenefitsSettings() {
  const canEdit = useCanEdit('hr', 'settings')
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('benefits_settings').select('*').eq('id', 'singleton').maybeSingle()
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
      const { error } = await supabase.from('benefits_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div><PageHeader title="Benefits Settings" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Benefits & Gratuity Settings" subtitle="Configure employee benefit policies and gratuity calculation defaults">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Benefit Claims</h3>

        <ToggleRow
          label="Require Receipt"
          description="Claims must include a receipt URL or attachment reference"
          checked={settings.require_receipt}
          onChange={v => set('require_receipt', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Allow Claims Without Application"
          description="Employees can submit claims without a prior approved benefit application"
          checked={settings.allow_claims_without_application}
          onChange={v => set('allow_claims_without_application', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Notify on Application Submitted"
          description="Send HR notification when a new benefit application is submitted"
          checked={settings.notify_on_application}
          onChange={v => set('notify_on_application', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Notify on Claim Approval"
          description="Notify the employee when their benefit claim is approved"
          checked={settings.notify_on_claim_approval}
          onChange={v => set('notify_on_claim_approval', v)}
          disabled={!canEdit}
        />

        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', maxWidth: 520 }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Default Max Benefit Amount</label>
            <input className="form-control" type="number" step="0.01" value={settings.max_benefit_amount} onChange={e => set('max_benefit_amount', Number(e.target.value))} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Default Currency</label>
            <input className="form-control" value={settings.currency} onChange={e => set('currency', e.target.value)} disabled={!canEdit} />
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 28, marginBottom: 8 }}>Gratuity</h3>

        <ToggleRow
          label="Pay Gratuity with Payroll Run"
          description="Include gratuity payments in the regular payroll run rather than separately"
          checked={settings.gratuity_pay_with_payroll}
          onChange={v => set('gratuity_pay_with_payroll', v)}
          disabled={!canEdit}
        />

        <div style={{ marginTop: 16, maxWidth: 280 }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 500, color: 'var(--text-dim)' }}>Minimum Years for Eligibility</label>
            <input className="form-control" type="number" min={0} max={10} step={0.5} value={settings.gratuity_minimum_years} onChange={e => set('gratuity_minimum_years', Number(e.target.value))} disabled={!canEdit} />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Employees must have served at least this many years to qualify for gratuity</div>
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
