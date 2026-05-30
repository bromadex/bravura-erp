import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

// ── Account groups with accounting direction context ─────────────────────────

const ACCOUNT_GROUPS = [
  {
    id:          'fuel',
    title:       'Fuel Transactions',
    icon:        'local_gas_station',
    color:       'var(--yellow)',
    description: 'Accounts posted when fuel is issued from tanks or delivered by supplier',
    flow:        'Delivery: DR Fuel Inventory → CR Accounts Payable\nIssuance: DR Fuel Expense → CR Fuel Inventory',
    accounts: [
      {
        key:       'fuel_expense_account',
        label:     'Fuel Expense Account',
        direction: 'DR',
        dirColor:  'var(--red)',
        hint:      'Debited when fuel is issued to vehicles / equipment',
        example:   'e.g. 5100 — Fuel & Oil Expense',
      },
      {
        key:       'fuel_inventory_account',
        label:     'Fuel Inventory Account',
        direction: 'DR / CR',
        dirColor:  'var(--text-dim)',
        hint:      'Debited on fuel delivery, Credited on fuel issuance',
        example:   'e.g. 1310 — Fuel Inventory (Asset)',
      },
      {
        key:       'fuel_payable_account',
        label:     'Fuel Payables Account',
        direction: 'CR',
        dirColor:  'var(--green)',
        hint:      'Credited when a fuel delivery is recorded',
        example:   'e.g. 2100 — Accounts Payable',
      },
    ],
  },
  {
    id:          'maintenance',
    title:       'Maintenance & Repairs',
    icon:        'build',
    color:       'var(--blue)',
    description: 'Accounts posted when a maintenance Work Order is closed',
    flow:        'WO Close: DR Maintenance Expense → CR Accounts Payable',
    accounts: [
      {
        key:       'maintenance_expense_account',
        label:     'Maintenance Expense Account',
        direction: 'DR',
        dirColor:  'var(--red)',
        hint:      'Debited on WO close for labour + parts cost',
        example:   'e.g. 5200 — Repairs & Maintenance Expense',
      },
      {
        key:       'maintenance_payable_account',
        label:     'Maintenance Payables Account',
        direction: 'CR',
        dirColor:  'var(--green)',
        hint:      'Credited on WO close (supplier invoice / cash payment)',
        example:   'e.g. 2100 — Accounts Payable',
      },
    ],
  },
  {
    id:          'assets',
    title:       'Fixed Assets & Depreciation',
    icon:        'corporate_fare',
    color:       'var(--teal)',
    description: 'Accounts used when assets are acquired and when depreciation is run monthly',
    flow:        'Acquisition: DR Fixed Asset → CR Accounts Payable\nDepreciation: DR Dep. Expense → CR Accum. Depreciation',
    accounts: [
      {
        key:       'fixed_asset_account',
        label:     'Fixed Asset Account',
        direction: 'DR',
        dirColor:  'var(--red)',
        hint:      'Debited when a new asset is acquired / capitalised',
        example:   'e.g. 1500 — Property, Plant & Equipment',
      },
      {
        key:       'accum_depreciation_account',
        label:     'Accumulated Depreciation Account',
        direction: 'CR',
        dirColor:  'var(--green)',
        hint:      'Credited each depreciation period (contra-asset)',
        example:   'e.g. 1510 — Accumulated Depreciation',
      },
      {
        key:       'depreciation_expense_account',
        label:     'Depreciation Expense Account',
        direction: 'DR',
        dirColor:  'var(--red)',
        hint:      'Debited each depreciation period',
        example:   'e.g. 5300 — Depreciation Expense',
      },
    ],
  },
  {
    id:          'disposal',
    title:       'Asset Disposal',
    icon:        'delete_forever',
    color:       'var(--red)',
    description: 'Account for recording gain or loss when a fleet asset is disposed or written off',
    flow:        'Disposal Gain: CR Gain on Disposal\nDisposal Loss: DR Loss on Disposal',
    accounts: [
      {
        key:       'disposal_gain_loss_account',
        label:     'Asset Disposal Gain / Loss Account',
        direction: 'DR / CR',
        dirColor:  'var(--text-dim)',
        hint:      'Debited on disposal loss, Credited on disposal gain',
        example:   'e.g. 5400 — Loss on Disposal / 4200 — Gain on Disposal',
      },
    ],
  },
]

const ALL_KEYS = ACCOUNT_GROUPS.flatMap(g => g.accounts.map(a => a.key))

// ── Sub-components ─────────────────────────────────────────────────────────────

function AccountSelect({ value, onChange, accounts, placeholder }) {
  const byType = {}
  accounts.forEach(a => {
    const t = a.account_type || 'Other'
    if (!byType[t]) byType[t] = []
    byType[t].push(a)
  })
  return (
    <select
      className="form-control"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{ fontFamily: 'var(--mono, monospace)', fontSize: 13 }}
    >
      <option value="">{placeholder}</option>
      {Object.entries(byType).map(([type, accs]) => (
        <optgroup key={type} label={type}>
          {accs.map(a => (
            <option key={a.id} value={a.code}>{a.code} — {a.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function StatusPill({ value }) {
  const ok = !!value
  return (
    <span style={{
      display:      'inline-flex', alignItems: 'center', gap: 4,
      fontSize:     11, fontWeight: 600,
      color:        ok ? 'var(--green)' : 'var(--text-dim)',
      background:   ok ? 'color-mix(in srgb, var(--green) 12%, var(--surface2))' : 'var(--surface2)',
      border:       `1px solid ${ok ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`,
      borderRadius: 20, padding: '2px 8px',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--border2)',
        flexShrink: 0,
      }} />
      {ok ? 'Set' : 'Not set'}
    </span>
  )
}

function GroupCard({ group, config, accounts, saving, onSave }) {
  const configuredCount = group.accounts.filter(a => !!config[a.key]).length
  const allConfigured   = configuredCount === group.accounts.length
  const borderColor     = allConfigured ? 'var(--green)' : configuredCount > 0 ? 'var(--yellow)' : 'var(--border2)'

  return (
    <div style={{
      borderRadius: 10,
      overflow:     'hidden',
      border:       `1px solid var(--border)`,
      borderLeft:   `4px solid ${borderColor}`,
      background:   'var(--surface)',
    }}>
      {/* Header */}
      <div style={{
        background:   `color-mix(in srgb, ${group.color} 8%, var(--surface2))`,
        borderBottom: '1px solid var(--border)',
        padding:      '14px 18px',
        display:      'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span className="material-icons"
          style={{ color: group.color, fontSize: 24, marginTop: 2, flexShrink: 0 }}>
          {group.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{group.title}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: allConfigured
                ? 'color-mix(in srgb, var(--green) 12%, transparent)'
                : 'color-mix(in srgb, var(--yellow) 12%, transparent)',
              color:  allConfigured ? 'var(--green)' : 'var(--yellow)',
              border: `1px solid ${allConfigured
                ? 'color-mix(in srgb, var(--green) 30%, transparent)'
                : 'color-mix(in srgb, var(--yellow) 30%, transparent)'}`,
            }}>
              {configuredCount}/{group.accounts.length} accounts set
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
            {group.description}
          </div>
          {/* Journal entry flow */}
          <div style={{
            fontSize: 11, fontFamily: 'var(--mono, monospace)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 10px', display: 'inline-block',
            color: 'var(--text-mid)', whiteSpace: 'pre', lineHeight: 1.6,
          }}>
            {group.flow}
          </div>
        </div>
      </div>

      {/* Account rows */}
      <div style={{ padding: '6px 0' }}>
        {group.accounts.map((acct, i) => (
          <div key={acct.key} style={{
            padding:      '12px 18px',
            borderBottom: i < group.accounts.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: 'color-mix(in srgb, ' + acct.dirColor + ' 12%, var(--surface2))',
                color:      acct.dirColor, border: `1px solid color-mix(in srgb, ${acct.dirColor} 25%, transparent)`,
                fontFamily: 'var(--mono, monospace)', letterSpacing: '.05em',
              }}>
                {acct.direction}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{acct.label}</span>
              <StatusPill value={config[acct.key]} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
              <AccountSelect
                value={config[acct.key] || ''}
                onChange={val => onSave(acct.key, val)}
                accounts={accounts}
                placeholder={`— ${acct.example} —`}
              />
              {config[acct.key] && (
                <button
                  className="btn btn-ghost btn-sm"
                  title="Clear"
                  onClick={() => onSave(acct.key, '')}
                  style={{ color: 'var(--text-dim)', padding: '4px 6px' }}
                >
                  <span className="material-icons" style={{ fontSize: 16 }}>close</span>
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{acct.hint}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FleetGLConfig() {
  const { user } = useAuth()
  const [config,   setConfig]   = useState({})
  const [accounts, setAccounts] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [cfgRes, acctRes] = await Promise.all([
      supabase.from('fleet_gl_config').select('config_key, config_value'),
      supabase.from('accounts').select('id, code, name, account_type').eq('is_active', true).order('code'),
    ])
    const map = {}
    cfgRes.data?.forEach(r => { map[r.config_key] = r.config_value || '' })
    setConfig(map)
    setAccounts(acctRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-save a single account when changed
  const handleChange = async (key, value) => {
    setConfig(c => ({ ...c, [key]: value }))
    try {
      const { error } = await supabase.from('fleet_gl_config')
        .upsert({ config_key: key, config_value: value || null, updated_by: user?.name || '', updated_at: new Date().toISOString() },
          { onConflict: 'config_key' })
      if (error) throw error
    } catch (err) {
      toast.error('Auto-save failed: ' + err.message)
    }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const rows = ALL_KEYS.map(key => ({
        config_key:   key,
        config_value: config[key] || null,
        updated_by:   user?.name || '',
        updated_at:   new Date().toISOString(),
      }))
      const { error } = await supabase.from('fleet_gl_config')
        .upsert(rows, { onConflict: 'config_key' })
      if (error) throw error
      toast.success('All GL accounts saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const configuredCount = ALL_KEYS.filter(k => !!config[k]).length
  const allConfigured   = configuredCount === ALL_KEYS.length

  return (
    <div className="page-container">
      <PageHeader
        title="Fleet GL Account Mapping"
        subtitle="Link fleet & fuel events to General Ledger accounts for automatic posting"
        icon="account_tree"
      >
        <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving}>
          <span className="material-icons" style={{ fontSize: 18 }}>save</span>
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </PageHeader>

      {/* Status banner */}
      {!loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 8, marginBottom: 24,
          background: allConfigured
            ? 'color-mix(in srgb, var(--green) 10%, var(--surface))'
            : 'color-mix(in srgb, var(--yellow) 10%, var(--surface))',
          border: `1px solid ${allConfigured
            ? 'color-mix(in srgb, var(--green) 30%, transparent)'
            : 'color-mix(in srgb, var(--yellow) 30%, transparent)'}`,
          color:    allConfigured ? 'var(--green)' : 'var(--yellow)',
          fontSize: 13, fontWeight: 600,
        }}>
          <span className="material-icons" style={{ fontSize: 18 }}>
            {allConfigured ? 'check_circle' : 'info'}
          </span>
          {allConfigured
            ? `All ${ALL_KEYS.length} GL accounts are mapped — automatic posting is fully active`
            : `${configuredCount} of ${ALL_KEYS.length} accounts mapped — unmapped events will not post to GL`
          }
          <span style={{
            marginLeft: 'auto', fontSize: 12, fontWeight: 400,
            color: 'var(--text-dim)',
          }}>
            Changes auto-save when you select an account
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 40, opacity: .25, display: 'block', marginBottom: 10 }}>
            account_tree
          </span>
          Loading configuration…
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="account_balance"
          message="No chart of accounts found — set up your Chart of Accounts first before mapping GL accounts"
        />
      ) : (
        <div style={{ display: 'grid', gap: 20, maxWidth: 860 }}>
          {ACCOUNT_GROUPS.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              config={config}
              accounts={accounts}
              saving={saving}
              onSave={handleChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
