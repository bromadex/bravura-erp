import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/ui'

const SETTING_GROUPS = [
  {
    id:          'fuel_monitoring',
    title:       'Fuel Monitoring',
    icon:        'local_gas_station',
    color:       'var(--yellow)',
    description: 'Thresholds for variance alerts, suspicious meter readings, and default pricing',
    settings: [
      {
        key:   'fuel_variance_threshold_pct',
        label: 'Reconciliation Variance Alert',
        unit:  '%',
        hint:  'Notify finance when fuel reconciliation variance exceeds this percentage',
        type:  'number', min: 0, max: 100, step: 0.1,
      },
      {
        key:   'meter_jump_threshold_km_day',
        label: 'Max Plausible KM / Day',
        unit:  'km',
        hint:  'Flag odometer readings that jump more than this in a single day',
        type:  'number', min: 0, step: 10,
      },
      {
        key:   'meter_jump_threshold_hrs_day',
        label: 'Max Plausible Hours / Day',
        unit:  'h',
        hint:  'Flag hour-meter readings that jump more than this in a single day (max 24)',
        type:  'number', min: 0, max: 24, step: 0.5,
      },
      {
        key:   'default_fuel_unit_cost',
        label: 'Default Fuel Unit Cost',
        unit:  '$/L',
        hint:  'Used when no unit cost is specified on fuel issuance',
        type:  'number', min: 0, step: 0.01,
      },
    ],
  },
  {
    id:          'pm_reminders',
    title:       'PM Service Reminders',
    icon:        'build_circle',
    color:       'var(--blue)',
    description: 'Lead times before a scheduled service is due — alerts are sent when ANY threshold is crossed',
    settings: [
      {
        key:   'pm_reminder_lead_days',
        label: 'Remind Before (Days)',
        unit:  'days',
        hint:  'Send PM reminder when this many calendar days remain until service date',
        type:  'number', min: 0, step: 1,
      },
      {
        key:   'pm_reminder_lead_km',
        label: 'Remind Before (KM)',
        unit:  'km',
        hint:  'Send PM reminder when this many KM remain until next service distance',
        type:  'number', min: 0, step: 50,
      },
      {
        key:   'pm_reminder_lead_hrs',
        label: 'Remind Before (Hours)',
        unit:  'h',
        hint:  'Send PM reminder when this many engine hours remain until next service',
        type:  'number', min: 0, step: 5,
      },
    ],
  },
  {
    id:          'approval_thresholds',
    title:       'Approval Thresholds',
    icon:        'approval',
    color:       'var(--teal)',
    description: 'Transactions above these limits are routed through the approval workflow automatically',
    settings: [
      {
        key:   'fuel_approval_threshold_liters',
        label: 'Fuel Request — Qty Threshold',
        unit:  'L',
        hint:  'Fuel requests above this litre volume require multi-step approval',
        type:  'number', min: 0, step: 10,
      },
      {
        key:   'fuel_approval_threshold_value',
        label: 'Fuel Request — Value Threshold',
        unit:  '$',
        hint:  'Fuel requests above this $ value require multi-step approval',
        type:  'number', min: 0, step: 50,
      },
      {
        key:   'fuel_delivery_approval_threshold',
        label: 'Fuel Delivery Approval Threshold',
        unit:  '$',
        hint:  'Fuel deliveries above this value require Fuel Manager + Finance approval',
        type:  'number', min: 0, step: 100,
      },
      {
        key:   'wo_approval_threshold_cost',
        label: 'Work Order — Supervisor Threshold',
        unit:  '$',
        hint:  'WOs with estimated cost above this require Workshop Supervisor approval',
        type:  'number', min: 0, step: 100,
      },
      {
        key:   'wo_fleet_mgr_approval_cost',
        label: 'Work Order — Fleet Manager Threshold',
        unit:  '$',
        hint:  'WOs with estimated cost above this also require Fleet Manager approval',
        type:  'number', min: 0, step: 500,
      },
      {
        key:   'asset_acquisition_approval_threshold',
        label: 'Asset Acquisition Threshold',
        unit:  '$',
        hint:  'Asset purchases above this value require Finance Manager approval',
        type:  'number', min: 0, step: 1000,
      },
    ],
  },
]

const ALL_SETTINGS = SETTING_GROUPS.flatMap(g => g.settings)

// ── Sub-components ─────────────────────────────────────────────────────────────

function UnitBadge({ unit }) {
  return (
    <span style={{
      display:       'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth:      36, padding:      '0 8px', height: 34,
      background:    'var(--surface2)', border: '1px solid var(--border)',
      borderLeft:    'none', borderRadius: '0 6px 6px 0',
      fontSize:      12, fontWeight: 600, color: 'var(--text-dim)',
      fontFamily:    'var(--mono, monospace)', flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      {unit}
    </span>
  )
}

function SettingRow({ setting, value, onChange }) {
  const hasValue = value !== '' && value !== undefined && value !== null
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 180px',
      gap: 16, alignItems: 'center',
      padding: '12px 0',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{setting.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{setting.hint}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type={setting.type}
          className="form-control"
          style={{
            textAlign:    'right',
            fontFamily:   'var(--mono, monospace)',
            fontSize:     13,
            borderRadius: '6px 0 0 6px',
            flex:         1,
            minWidth:     0,
            borderRight:  'none',
            color:        hasValue ? 'var(--text)' : 'var(--text-dim)',
          }}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          min={setting.min}
          max={setting.max}
          step={setting.step}
        />
        <UnitBadge unit={setting.unit} />
      </div>
    </div>
  )
}

function SettingGroupCard({ group, values, onChange }) {
  const configured = group.settings.filter(s => {
    const v = values[s.key]
    return v !== '' && v !== undefined && v !== null
  }).length
  const all = group.settings.length

  return (
    <div style={{
      borderRadius: 10,
      overflow:     'hidden',
      border:       '1px solid var(--border)',
      borderLeft:   `4px solid ${configured === all ? group.color : configured > 0 ? 'var(--border2)' : 'var(--border2)'}`,
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
          style={{ color: group.color, fontSize: 22, marginTop: 1, flexShrink: 0 }}>
          {group.icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{group.title}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: `color-mix(in srgb, ${group.color} 12%, transparent)`,
              color:      group.color,
              border:     `1px solid color-mix(in srgb, ${group.color} 30%, transparent)`,
            }}>
              {all} {all === 1 ? 'setting' : 'settings'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{group.description}</div>
        </div>
      </div>

      {/* Setting rows */}
      <div style={{ padding: '0 18px' }}>
        {group.settings.map((s, i) => (
          <div key={s.key} style={{
            borderBottom: i < group.settings.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <SettingRow
              setting={s}
              value={values[s.key]}
              onChange={val => onChange(s.key, val)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FleetSettings() {
  const { user }                    = useAuth()
  const [values,    setValues]      = useState({})
  const [original,  setOriginal]    = useState({})
  const [saving,    setSaving]      = useState(false)
  const [loading,   setLoading]     = useState(true)
  const [savedAt,   setSavedAt]     = useState(null)

  useEffect(() => {
    supabase.from('fleet_settings').select('setting_key, setting_value, updated_at')
      .then(({ data }) => {
        const map = {}
        let latest = null
        data?.forEach(r => {
          map[r.setting_key] = r.setting_value ?? ''
          if (r.updated_at && (!latest || r.updated_at > latest)) latest = r.updated_at
        })
        setValues(map)
        setOriginal(map)
        if (latest) setSavedAt(new Date(latest))
        setLoading(false)
      })
  }, [])

  const handleChange = (key, val) => {
    setValues(v => ({ ...v, [key]: val }))
  }

  const isDirty = ALL_SETTINGS.some(({ key }) => (values[key] ?? '') !== (original[key] ?? ''))

  const handleSave = async () => {
    setSaving(true)
    try {
      const rows = ALL_SETTINGS.map(({ key }) => ({
        setting_key:   key,
        setting_value: values[key] ?? '',
        updated_by:    user?.name || user?.email || '',
        updated_at:    new Date().toISOString(),
      }))
      const { error } = await supabase.from('fleet_settings')
        .upsert(rows, { onConflict: 'setting_key' })
      if (error) throw error
      setOriginal({ ...values })
      setSavedAt(new Date())
      toast.success('Fleet settings saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setValues({ ...original })
    toast('Changes discarded', { icon: '↩' })
  }

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 40, opacity: .25, display: 'block', marginBottom: 10 }}>
            settings
          </span>
          Loading settings…
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Fleet & Fuel Settings"
        subtitle="Operational thresholds, approval limits, and reminder lead-times"
        icon="settings"
      >
        {isDirty && (
          <button className="btn btn-ghost" onClick={handleReset} disabled={saving}
            style={{ color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 16 }}>undo</span>
            Discard
          </button>
        )}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !isDirty}>
          <span className="material-icons" style={{ fontSize: 18 }}>save</span>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </PageHeader>

      {/* Status / last-saved bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderRadius: 8, marginBottom: 24,
        background: isDirty
          ? 'color-mix(in srgb, var(--yellow) 10%, var(--surface))'
          : 'color-mix(in srgb, var(--green)  10%, var(--surface))',
        border: `1px solid ${isDirty
          ? 'color-mix(in srgb, var(--yellow) 30%, transparent)'
          : 'color-mix(in srgb, var(--green)  30%, transparent)'}`,
        color:    isDirty ? 'var(--yellow)' : 'var(--green)',
        fontSize: 13, fontWeight: 600,
      }}>
        <span className="material-icons" style={{ fontSize: 18 }}>
          {isDirty ? 'edit_note' : 'check_circle'}
        </span>
        {isDirty ? 'You have unsaved changes' : 'All settings are saved'}
        {savedAt && !isDirty && (
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, color: 'var(--text-dim)' }}>
            Last saved {savedAt.toLocaleString()}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20, maxWidth: 860 }}>
        {SETTING_GROUPS.map(group => (
          <SettingGroupCard
            key={group.id}
            group={group}
            values={values}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Sticky save bar when dirty */}
      {isDirty && (
        <div style={{
          position:   'sticky', bottom: 24, marginTop: 24,
          display:    'flex', justifyContent: 'flex-end', gap: 10,
          maxWidth:   860,
        }}>
          <div style={{
            display:      'flex', gap: 10,
            background:   'var(--surface)',
            border:       '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px',
            boxShadow:    '0 4px 16px color-mix(in srgb, var(--text) 12%, transparent)',
          }}>
            <button className="btn btn-ghost" onClick={handleReset} disabled={saving}
              style={{ color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 16 }}>undo</span>
              Discard
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons" style={{ fontSize: 18 }}>save</span>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
