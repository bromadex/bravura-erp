// src/pages/Settings/InventoryGLConfig.jsx
// Settings page: map stock events to GL accounts for automatic inventory-to-GL posting.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

// ── Event definitions ────────────────────────────────────────────────────────

const EVENT_DEFINITIONS = [
  {
    event_type:   'grn_receipt',
    label:        'GRN Receipt',
    icon:         'local_shipping',
    color:        'var(--green)',
    description:  'When goods are received from supplier',
    debit_label:  'Inventory Account (Asset)',
    credit_label: 'GRIR Clearing / Goods Received Account',
    example:      'DR: Inventory  CR: GRIR Clearing',
  },
  {
    event_type:   'stock_issue',
    label:        'Stock Issue',
    icon:         'remove_circle',
    color:        'var(--red)',
    description:  'When stock is issued to departments/projects (SR fulfillment, StockOut)',
    debit_label:  'Department Expense / COGS Account',
    credit_label: 'Inventory Account (Asset)',
    example:      'DR: Materials Expense  CR: Inventory',
  },
  {
    event_type:   'stock_adjustment_loss',
    label:        'Stock Adjustment — Loss',
    icon:         'trending_down',
    color:        'var(--yellow)',
    description:  'When stock count shows loss (negative variance on stock take)',
    debit_label:  'Stock Loss / Shrinkage Expense',
    credit_label: 'Inventory Account (Asset)',
    example:      'DR: Stock Shrinkage  CR: Inventory',
  },
  {
    event_type:   'stock_adjustment_gain',
    label:        'Stock Adjustment — Gain',
    icon:         'trending_up',
    color:        'var(--teal)',
    description:  'When stock count shows surplus (positive variance on stock take)',
    debit_label:  'Inventory Account (Asset)',
    credit_label: 'Stock Gain / Other Income',
    example:      'DR: Inventory  CR: Stock Gain',
  },
  {
    event_type:   'purchase_invoice',
    label:        'Purchase Invoice',
    icon:         'receipt',
    color:        'var(--blue)',
    description:  'When a supplier purchase invoice is posted',
    debit_label:  'GRIR Clearing Account',
    credit_label: 'Accounts Payable',
    example:      'DR: GRIR Clearing  CR: Accounts Payable',
  },
  {
    event_type:   'payment_voucher',
    label:        'Payment Voucher',
    icon:         'payments',
    color:        'var(--purple)',
    description:  'When supplier payment is made',
    debit_label:  'Accounts Payable',
    credit_label: 'Bank / Cash Account',
    example:      'DR: Accounts Payable  CR: Bank',
  },
  {
    event_type:   'landed_cost',
    label:        'Landed Cost Uplift',
    icon:         'local_airport',
    color:        'var(--gold)',
    description:  'When landed costs (freight, duty) are allocated to inventory',
    debit_label:  'Inventory Account (Asset)',
    credit_label: 'Freight / Duty Payable',
    example:      'DR: Inventory  CR: Freight Payable',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByType(accounts) {
  const groups = {}
  for (const acc of accounts) {
    const t = acc.account_type || 'Other'
    if (!groups[t]) groups[t] = []
    groups[t].push(acc)
  }
  return groups
}

function isConfigured(cfg) {
  return !!(cfg?.debit_account_code && cfg?.credit_account_code)
}

// ── AccountSelect ─────────────────────────────────────────────────────────────

function AccountSelect({ value, onChange, groups, placeholder }) {
  return (
    <select
      className="form-control"
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
    >
      <option value="">{placeholder}</option>
      {Object.entries(groups).map(([type, accs]) => (
        <optgroup key={type} label={type}>
          {accs.map(acc => (
            <option key={acc.id} value={acc.code}>
              {acc.code} — {acc.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ── StatusDot ─────────────────────────────────────────────────────────────────

function StatusDot({ cfg }) {
  const configured = isConfigured(cfg)
  const active     = cfg?.is_active

  let color, label
  if (!configured) {
    color = 'var(--red)'
    label = 'Not configured'
  } else if (active) {
    color = 'var(--green)'
    label = 'Configured & Active'
  } else {
    color = 'var(--yellow)'
    label = 'Configured (inactive)'
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, display: 'inline-block', flexShrink: 0,
      }} />
      {label}
    </span>
  )
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ def, cfg, groups, saving, onSave, onToggleActive }) {
  const configured = isConfigured(cfg)
  const active     = cfg?.is_active ?? true

  const [debit,  setDebit]  = useState(cfg?.debit_account_code  || '')
  const [credit, setCredit] = useState(cfg?.credit_account_code || '')
  const [active2, setActive2] = useState(active)

  // Sync if parent cfg changes (e.g. after save-all)
  useEffect(() => {
    setDebit(cfg?.debit_account_code  || '')
    setCredit(cfg?.credit_account_code || '')
    setActive2(cfg?.is_active ?? true)
  }, [cfg])

  // Border colour
  let borderColor
  if (!configured) borderColor = 'var(--red)'
  else if (active2) borderColor = 'var(--green)'
  else borderColor = 'var(--border2)'

  const cardStyle = {
    background:   'var(--surface)',
    border:       `1px solid var(--border)`,
    borderLeft:   `4px solid ${borderColor}`,
    borderStyle:  configured ? 'solid' : 'dashed',
    borderRadius: 8,
    overflow:     'hidden',
  }

  // Fix: keep left border dashed appearance only on left side
  const outerStyle = {
    borderRadius: 8,
    overflow:     'hidden',
    border:       `1px solid var(--border)`,
    borderLeft:   configured ? `4px solid ${borderColor}` : `4px dashed ${borderColor}`,
    background:   'var(--surface)',
  }

  const headerBg = `color-mix(in srgb, ${def.color} 8%, var(--surface))`

  return (
    <div style={outerStyle}>
      {/* Card header */}
      <div style={{
        background:    headerBg,
        borderBottom:  '1px solid var(--border)',
        padding:       '12px 16px',
        display:       'flex',
        alignItems:    'flex-start',
        gap:           10,
      }}>
        <span className="material-icons" style={{ color: def.color, fontSize: 22, marginTop: 1, flexShrink: 0 }}>
          {def.icon}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{def.label}</span>
            <StatusDot cfg={cfg} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>
            {def.description}
          </div>
          <div style={{
            fontSize:     11,
            color:        'var(--text-mid)',
            marginTop:    4,
            fontFamily:   'var(--mono)',
            background:   'color-mix(in srgb, var(--surface2) 70%, transparent)',
            display:      'inline-block',
            padding:      '2px 7px',
            borderRadius: 4,
            border:       '1px solid var(--border)',
          }}>
            {def.example}
          </div>
        </div>

        {/* Active toggle */}
        <label style={{
          display:    'flex',
          alignItems: 'center',
          gap:        6,
          cursor:     'pointer',
          fontSize:   12,
          color:      active2 ? 'var(--green)' : 'var(--text-dim)',
          flexShrink: 0,
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={active2}
            onChange={e => setActive2(e.target.checked)}
            style={{ accentColor: 'var(--green)' }}
          />
          {active2 ? 'Active' : 'Inactive'}
        </label>
      </div>

      {/* Card body */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <span style={{ color: 'var(--green)', marginRight: 4 }}>DR</span>{def.debit_label}
            </label>
            <AccountSelect
              value={debit}
              onChange={setDebit}
              groups={groups}
              placeholder="— Select debit account —"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <span style={{ color: 'var(--red)', marginRight: 4 }}>CR</span>{def.credit_label}
            </label>
            <AccountSelect
              value={credit}
              onChange={setCredit}
              groups={groups}
              placeholder="— Select credit account —"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => onSave(def.event_type, debit, credit, active2)}
          >
            <span className="material-icons" style={{ fontSize: 14 }}>save</span>
            Save this event
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryGLConfig() {
  const [configs,   setConfigs]   = useState([])   // rows from inventory_gl_config
  const [accounts,  setAccounts]  = useState([])   // rows from chart_of_accounts
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)

  // Per-card local state mirrors — keyed by event_type
  // We use one piece of state to drive "save all" snapshots
  const [cardState, setCardState] = useState({})  // { event_type: { debit, credit, active } }

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    const [cfgRes, accRes] = await Promise.all([
      supabase.from('inventory_gl_config').select('*'),
      supabase.from('chart_of_accounts').select('id, code, name, account_type').order('code'),
    ])
    if (cfgRes.error) toast.error('Failed to load GL config: ' + cfgRes.error.message)
    else setConfigs(cfgRes.data || [])
    if (accRes.error) toast.error('Failed to load chart of accounts: ' + accRes.error.message)
    else setAccounts(accRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Initialise cardState from DB after load
  useEffect(() => {
    if (!configs.length && !accounts.length) return
    const initial = {}
    for (const def of EVENT_DEFINITIONS) {
      const cfg = configs.find(c => c.event_type === def.event_type)
      initial[def.event_type] = {
        debit:  cfg?.debit_account_code  || '',
        credit: cfg?.credit_account_code || '',
        active: cfg?.is_active ?? true,
      }
    }
    setCardState(initial)
  }, [configs])

  // ── Derived ────────────────────────────────────────────────────────────────

  const configMap = {}
  for (const c of configs) configMap[c.event_type] = c

  const accountGroups = groupByType(accounts)

  const configuredCount = EVENT_DEFINITIONS.filter(def => {
    const cfg = configMap[def.event_type]
    return isConfigured(cfg) && cfg?.is_active
  }).length

  // ── Save single event ──────────────────────────────────────────────────────

  const handleSaveOne = async (eventType, debit, credit, active) => {
    setSaving(true)
    try {
      const def = EVENT_DEFINITIONS.find(d => d.event_type === eventType)
      const { error } = await supabase
        .from('inventory_gl_config')
        .upsert(
          {
            event_type:          eventType,
            debit_account_code:  debit  || null,
            credit_account_code: credit || null,
            description:         def?.description || '',
            is_active:           active,
          },
          { onConflict: 'event_type' }
        )
      if (error) { toast.error('Save failed: ' + error.message); return }
      toast.success(`Saved: ${def?.label || eventType}`)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  // ── Save All ───────────────────────────────────────────────────────────────

  const handleSaveAll = async () => {
    setSaving(true)
    try {
      const rows = EVENT_DEFINITIONS.map(def => {
        const st = cardState[def.event_type] || {}
        return {
          event_type:          def.event_type,
          debit_account_code:  st.debit  || null,
          credit_account_code: st.credit || null,
          description:         def.description,
          is_active:           st.active ?? true,
        }
      })
      const { error } = await supabase
        .from('inventory_gl_config')
        .upsert(rows, { onConflict: 'event_type' })
      if (error) { toast.error('Save all failed: ' + error.message); return }
      toast.success('All event mappings saved')
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const allConfigured = configuredCount === EVENT_DEFINITIONS.length

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Inventory GL Configuration"
        subtitle="Map stock events to general ledger accounts — required for automatic GL posting"
      >
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={handleSaveAll}
        >
          <span className="material-icons">save</span>
          Save All
        </button>
      </PageHeader>

      {/* Status banner */}
      {!loading && (
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          padding:      '10px 16px',
          borderRadius: 8,
          marginBottom: 24,
          background:   allConfigured
            ? 'color-mix(in srgb, var(--green) 10%, var(--surface))'
            : 'color-mix(in srgb, var(--yellow) 10%, var(--surface))',
          border: `1px solid ${allConfigured ? 'color-mix(in srgb, var(--green) 35%, transparent)' : 'color-mix(in srgb, var(--yellow) 35%, transparent)'}`,
          color: allConfigured ? 'var(--green)' : 'var(--yellow)',
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span className="material-icons" style={{ fontSize: 18 }}>
            {allConfigured ? 'check_circle' : 'warning'}
          </span>
          {allConfigured
            ? `All ${EVENT_DEFINITIONS.length} event types are configured`
            : `Only ${configuredCount} of ${EVENT_DEFINITIONS.length} events are configured — inventory movements won't post to GL`
          }
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 40, opacity: .25, display: 'block', marginBottom: 12 }}>
            account_tree
          </span>
          Loading configuration…
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="account_balance"
          message="No chart of accounts found — please configure your chart of accounts first"
        />
      ) : (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))',
          gap:                 20,
        }}>
          {EVENT_DEFINITIONS.map(def => (
            <EventCard
              key={def.event_type}
              def={def}
              cfg={configMap[def.event_type]}
              groups={accountGroups}
              saving={saving}
              onSave={handleSaveOne}
            />
          ))}
        </div>
      )}
    </div>
  )
}
