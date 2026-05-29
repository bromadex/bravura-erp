import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/ui'

const SETTING_GROUPS = [
  {
    title: 'Fuel Monitoring',
    icon: 'local_gas_station',
    settings: [
      { key: 'fuel_variance_threshold_pct',   label: 'Reconciliation Variance Alert (%)', unit: '%',  hint: 'Notify finance when fuel variance exceeds this %' },
      { key: 'meter_jump_threshold_km_day',   label: 'Max Plausible KM / Day',            unit: 'km', hint: 'Flag odometer readings above this daily jump' },
      { key: 'meter_jump_threshold_hrs_day',  label: 'Max Plausible Hours / Day',          unit: 'h',  hint: 'Flag hour-meter readings above this daily jump' },
      { key: 'default_fuel_unit_cost',        label: 'Default Fuel Unit Cost',             unit: '$',  hint: 'Used when unit cost is not specified on issuance' },
    ],
  },
  {
    title: 'PM Service Reminders',
    icon: 'build_circle',
    settings: [
      { key: 'pm_reminder_lead_km',   label: 'Remind Before (KM)',   unit: 'km', hint: 'Send PM reminder when this many KM remain until service' },
      { key: 'pm_reminder_lead_hrs',  label: 'Remind Before (Hours)', unit: 'h',  hint: 'Send PM reminder when this many hours remain until service' },
      { key: 'pm_reminder_lead_days', label: 'Remind Before (Days)',  unit: 'days', hint: 'Send PM reminder when this many days remain until service' },
    ],
  },
  {
    title: 'Approval Thresholds',
    icon: 'approval',
    settings: [
      { key: 'fuel_approval_threshold_liters',     label: 'Fuel Request — Qty Threshold',         unit: 'L',  hint: 'Fuel requests above this litre amount require approval' },
      { key: 'fuel_approval_threshold_value',      label: 'Fuel Request — Value Threshold',        unit: '$',  hint: 'Fuel requests above this value require approval' },
      { key: 'wo_approval_threshold_cost',         label: 'Work Order — Supervisor Threshold',     unit: '$',  hint: 'WOs above this cost require Workshop Supervisor approval' },
      { key: 'wo_fleet_mgr_approval_cost',         label: 'Work Order — Fleet Manager Threshold',  unit: '$',  hint: 'WOs above this cost also require Fleet Manager approval' },
      { key: 'asset_acquisition_approval_threshold','label': 'Asset Acquisition Threshold',        unit: '$',  hint: 'Asset purchases above this value require Finance approval' },
      { key: 'fuel_delivery_approval_threshold',   label: 'Fuel Delivery Approval Threshold',      unit: '$',  hint: 'Fuel deliveries above this value require approval' },
    ],
  },
]

// Flatten for easy lookup
const ALL_SETTINGS = SETTING_GROUPS.flatMap(g => g.settings)

export default function FleetSettings() {
  const { user } = useAuth()
  const [values, setValues]   = useState({})
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('fleet_settings').select('setting_key, setting_value')
      .then(({ data }) => {
        const map = {}
        data?.forEach(r => { map[r.setting_key] = r.setting_value ?? '' })
        setValues(map)
        setLoading(false)
      })
  }, [])

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
      toast.success('Fleet settings saved')
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
        title="Fleet & Fuel Settings"
        subtitle="Operational thresholds, approval limits, and reminder settings"
        icon="settings"
      />

      <div style={{ maxWidth: 780, margin: '0 auto', display: 'grid', gap: 24 }}>
        {SETTING_GROUPS.map(group => (
          <div key={group.title} className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 20 }}>{group.icon}</span>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{group.title}</h3>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 16 }}>
                {group.settings.map(({ key, label, unit, hint }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, alignItems: 'start' }}>
                    <div>
                      <label className="form-label" style={{ marginBottom: 2 }}>{label}</label>
                      <small className="text-muted" style={{ display: 'block' }}>{hint}</small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ textAlign: 'right', fontFamily: 'monospace' }}
                        value={values[key] ?? ''}
                        onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                        min="0"
                      />
                      <span className="text-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 32 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <span className="material-icons" style={{ fontSize: 18, marginRight: 6 }}>save</span>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
