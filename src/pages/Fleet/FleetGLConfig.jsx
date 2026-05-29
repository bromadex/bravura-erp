import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/ui'

const GL_KEYS = [
  { key: 'fuel_expense_account',         label: 'Fuel Expense Account',         hint: 'DR when fuel is issued (e.g. 5100)' },
  { key: 'fuel_inventory_account',       label: 'Fuel Inventory Account',        hint: 'DR on delivery, CR on issuance (e.g. 1310)' },
  { key: 'fuel_payable_account',         label: 'Fuel Payables Account',         hint: 'CR when fuel delivery is recorded (e.g. 2100)' },
  { key: 'maintenance_expense_account',  label: 'Maintenance Expense Account',   hint: 'DR when work order is closed (e.g. 5200)' },
  { key: 'maintenance_payable_account',  label: 'Maintenance Payables Account',  hint: 'CR when work order is closed (e.g. 2100)' },
  { key: 'fixed_asset_account',          label: 'Fixed Asset Account',           hint: 'DR on asset acquisition (e.g. 1500)' },
  { key: 'accum_depreciation_account',   label: 'Accumulated Depreciation Account', hint: 'CR on depreciation run (e.g. 1510)' },
  { key: 'depreciation_expense_account', label: 'Depreciation Expense Account',  hint: 'DR on depreciation run (e.g. 5300)' },
]

export default function FleetGLConfig() {
  const { user } = useAuth()
  const [config, setConfig]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [cfgRes, acctRes] = await Promise.all([
        supabase.from('fleet_gl_config').select('config_key, config_value'),
        supabase.from('accounts').select('id, code, name').eq('is_active', true).order('code'),
      ])
      const map = {}
      cfgRes.data?.forEach(r => { map[r.config_key] = r.config_value || '' })
      setConfig(map)
      setAccounts(acctRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const rows = GL_KEYS.map(({ key }) => ({
        config_key:   key,
        config_value: config[key] || null,
        updated_by:   user?.name || user?.email || '',
        updated_at:   new Date().toISOString(),
      }))
      const { error } = await supabase.from('fleet_gl_config')
        .upsert(rows, { onConflict: 'config_key' })
      if (error) throw error
      toast.success('GL configuration saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-container"><p className="text-muted">Loading…</p></div>

  return (
    <div className="page-container">
      <PageHeader
        title="Fleet GL Configuration"
        subtitle="Map fleet & fuel events to General Ledger accounts"
        icon="account_tree"
      />

      <div className="card" style={{ maxWidth: 780, margin: '0 auto' }}>
        <div className="card-body">
          <div style={{ background: 'var(--yellow-faint,rgba(250,204,21,.08))', border: '1px solid var(--yellow)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13 }}>
            <strong style={{ color: 'var(--yellow)' }}>Note:</strong> Enter the GL account <em>code</em> (e.g.&nbsp;5100). Leave blank to skip automatic GL posting for that event. Accounts must already exist in the Chart of Accounts.
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            {GL_KEYS.map(({ key, label, hint }) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-control"
                    style={{ width: 160, fontFamily: 'monospace' }}
                    placeholder="e.g. 5100"
                    value={config[key] || ''}
                    onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                  />
                  {accounts.length > 0 && (
                    <select
                      className="form-control"
                      style={{ flex: 1 }}
                      value={config[key] || ''}
                      onChange={e => setConfig(c => ({ ...c, [key]: e.target.value }))}
                    >
                      <option value="">— Select from chart of accounts —</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <small className="text-muted">{hint}</small>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons" style={{ fontSize: 18, marginRight: 6 }}>save</span>
              {saving ? 'Saving…' : 'Save GL Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
