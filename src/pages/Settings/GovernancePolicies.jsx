// src/pages/Settings/GovernancePolicies.jsx
//
// Phase 18 — Governance: manage system-wide governance policies and
// notification schedule configuration for Inventory and Procurement.
// Phase 19 — Added Governance Configuration section (top) with
// persistent settings stored in governance_policies table.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, Spinner } from '../../components/ui'

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)   return 'Just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  return `${days}d ago`
}

function moduleBadge(module) {
  const color = module === 'inventory' ? 'var(--teal)' : 'var(--blue)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      textTransform: 'capitalize',
    }}>
      {module}
    </span>
  )
}

// ── Toggle Switch ─────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: checked ? 'var(--green)' : 'var(--surface2)',
        border: '1px solid var(--border)', position: 'relative', transition: 'background .2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 22 : 3, width: 16, height: 16,
        borderRadius: '50%', background: checked ? '#fff' : 'var(--text-dim)',
        transition: 'left .2s',
      }} />
    </div>
  )
}

// ── Policy Row ────────────────────────────────────────────────
function PolicyRow({ policy, onSaved }) {
  const [localBool,   setLocalBool]   = useState(policy.value_boolean ?? false)
  const [localNumber, setLocalNumber] = useState(policy.value_number ?? 0)
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = {
        updated_by: 'admin',
        updated_at: new Date().toISOString(),
      }
      if (policy.value_type === 'boolean') {
        updates.value_boolean = localBool
      } else if (policy.value_type === 'number') {
        updates.value_number = Number(localNumber)
      }
      const { error } = await supabase
        .from('governance_policies')
        .update(updates)
        .eq('id', policy.id)
      if (error) throw error
      toast.success(`"${policy.policy_name}" updated`)
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const enforced = policy.is_enforced
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 0', borderBottom: '1px solid var(--border)',
    }}>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{policy.policy_name}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
            background: enforced ? 'var(--green)22' : 'var(--red)22',
            color: enforced ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${enforced ? 'var(--green)' : 'var(--red)'}44`,
          }}>
            {enforced ? 'Active' : 'Disabled'}
          </span>
        </div>
        {policy.description && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {policy.description}
          </div>
        )}
      </div>

      {/* Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {policy.value_type === 'boolean' && (
          <Toggle checked={localBool} onChange={() => setLocalBool(v => !v)} />
        )}
        {policy.value_type === 'number' && (
          <input
            type="number"
            min={0}
            value={localNumber}
            onChange={e => setLocalNumber(e.target.value)}
            style={{
              width: 100, padding: '4px 8px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', textAlign: 'right',
            }}
          />
        )}
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Schedule Row ──────────────────────────────────────────────
function ScheduleRow({ schedule, onToggled }) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      const { error } = await supabase
        .from('notification_schedules')
        .update({ is_active: !schedule.is_active, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)
      if (error) throw error
      toast.success(`Schedule "${schedule.schedule_key}" ${!schedule.is_active ? 'activated' : 'deactivated'}`)
      onToggled()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setToggling(false)
    }
  }

  const handleRunNow = () => {
    toast.success('Schedule triggered — results will appear in notification center')
  }

  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      {/* Schedule */}
      <td style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
          {schedule.schedule_key}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>
          {schedule.description}
        </div>
      </td>
      {/* Module */}
      <td style={{ padding: '10px 12px' }}>
        {moduleBadge(schedule.module)}
      </td>
      {/* Trigger */}
      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)' }}>
        <div style={{ fontFamily: 'var(--mono)', marginBottom: 2 }}>
          {schedule.trigger_type}
        </div>
        {schedule.condition_field && (
          <div>
            {schedule.condition_field}
            {schedule.condition_op && ` ${schedule.condition_op}`}
            {schedule.condition_value != null && ` ${schedule.condition_value}`}
          </div>
        )}
      </td>
      {/* Target Roles */}
      <td style={{ padding: '10px 12px' }}>
        {(schedule.target_roles || []).map(r => (
          <span
            key={r}
            style={{
              display: 'inline-block', marginRight: 4, marginBottom: 2,
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
              background: 'var(--purple)22', color: 'var(--purple)',
              border: '1px solid var(--purple)44',
            }}
          >
            {r.replace('role_', '')}
          </span>
        ))}
      </td>
      {/* Last Run */}
      <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
        {timeAgo(schedule.last_run_at)}
      </td>
      {/* Active toggle + Run Now */}
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle
            checked={!!schedule.is_active}
            onChange={!toggling ? handleToggle : undefined}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRunNow}
            title="Trigger this schedule now"
          >
            <span className="material-icons" style={{ fontSize: 13 }}>play_arrow</span>
            Run Now
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Governance Configuration Section ─────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const GOV_SETTING_KEYS = [
  'gov_auto_archive_days',
  'gov_ethics_annual_resign',
  'gov_policy_mandatory_default',
  'gov_reminder_days',
  'gov_ethics_resign_month',
  'gov_require_checkbox_ack',
]

function GovernanceConfig({ allPolicies, onSaved }) {
  // Derive initial values from policies already loaded (setting_key column)
  const findVal = (key, fallback) => {
    const row = allPolicies.find(p => p.setting_key === key)
    if (!row) return fallback
    if (row.value_type === 'boolean') return row.value_boolean ?? fallback
    if (row.value_type === 'number')  return row.value_number  ?? fallback
    return row.value_text ?? fallback
  }

  const [archiveDays,      setArchiveDays]      = useState(() => findVal('gov_auto_archive_days', 90))
  const [annualResign,     setAnnualResign]      = useState(() => findVal('gov_ethics_annual_resign', true))
  const [resignMonth,      setResignMonth]       = useState(() => findVal('gov_ethics_resign_month', 'January'))
  const [mandatoryDefault, setMandatoryDefault]  = useState(() => findVal('gov_policy_mandatory_default', false))
  const [requireCheckbox,  setRequireCheckbox]   = useState(() => findVal('gov_require_checkbox_ack', true))
  const [reminderDays,     setReminderDays]       = useState(() => findVal('gov_reminder_days', 3))
  const [saving,           setSaving]             = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const rows = [
        { setting_key: 'gov_auto_archive_days',       value_type: 'number',  value_number: Number(archiveDays),  value_boolean: null, value_text: null, updated_at: now },
        { setting_key: 'gov_ethics_annual_resign',     value_type: 'boolean', value_boolean: annualResign,        value_number: null,  value_text: null, updated_at: now },
        { setting_key: 'gov_ethics_resign_month',      value_type: 'text',    value_text: resignMonth,            value_boolean: null, value_number: null, updated_at: now },
        { setting_key: 'gov_policy_mandatory_default', value_type: 'boolean', value_boolean: mandatoryDefault,    value_number: null,  value_text: null, updated_at: now },
        { setting_key: 'gov_require_checkbox_ack',     value_type: 'boolean', value_boolean: requireCheckbox,     value_number: null,  value_text: null, updated_at: now },
        { setting_key: 'gov_reminder_days',            value_type: 'number',  value_number: Number(reminderDays), value_boolean: null, value_text: null, updated_at: now },
      ]

      const { error } = await supabase
        .from('governance_policies')
        .upsert(rows, { onConflict: 'setting_key' })

      if (error) throw error
      toast.success('Governance configuration saved')
      onSaved()
    } catch (err) {
      toast.error('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 0', borderBottom: '1px solid var(--border)',
    gap: 16,
  }
  const labelStyle = { flex: 1, minWidth: 0 }
  const labelTitle = { fontSize: 13, fontWeight: 600, marginBottom: 2 }
  const labelDesc  = { fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 24px', marginTop: 20,
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span className="material-icons" style={{ fontSize: 20, color: 'var(--gold)' }}>
          settings
        </span>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Governance Configuration</h2>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
          background: 'var(--gold)22', color: 'var(--gold)',
          border: '1px solid var(--gold)44', marginLeft: 4,
        }}>
          System-wide defaults
        </span>
      </div>

      {/* 1. Auto-archive announcements */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <div style={labelTitle}>Auto-archive announcements</div>
          <div style={labelDesc}>Archive announcements after this many days</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <input
            type="number"
            min={1}
            value={archiveDays}
            onChange={e => setArchiveDays(e.target.value)}
            style={{
              width: 80, padding: '4px 8px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', textAlign: 'right',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>days</span>
        </div>
      </div>

      {/* 2. Ethics re-sign frequency */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <div style={labelTitle}>Annual re-signing of Code of Ethics</div>
          <div style={labelDesc}>Require employees to re-sign the Code of Ethics each year</div>
        </div>
        <Toggle checked={annualResign} onChange={() => setAnnualResign(v => !v)} />
      </div>

      {annualResign && (
        <div style={{ ...rowStyle, paddingLeft: 16 }}>
          <div style={labelStyle}>
            <div style={labelTitle}>Re-sign month</div>
            <div style={labelDesc}>Month in which the annual re-signing prompt is triggered</div>
          </div>
          <select
            value={resignMonth}
            onChange={e => setResignMonth(e.target.value)}
            style={{
              padding: '4px 8px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', flexShrink: 0,
            }}
          >
            {MONTHS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {/* 3. Policy defaults */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <div style={labelTitle}>New policies mandatory by default</div>
          <div style={labelDesc}>Newly created policies require acknowledgement from all employees by default</div>
        </div>
        <Toggle checked={mandatoryDefault} onChange={() => setMandatoryDefault(v => !v)} />
      </div>

      {/* 4. Signature method */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <div style={labelTitle}>Require checkbox acknowledgement</div>
          <div style={labelDesc}>Employees must tick a checkbox to confirm they have read each policy</div>
        </div>
        <Toggle checked={requireCheckbox} onChange={() => setRequireCheckbox(v => !v)} />
      </div>

      {/* 5. Reminder schedule */}
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <div style={labelStyle}>
          <div style={labelTitle}>Reminder schedule</div>
          <div style={labelDesc}>Send reminders for unacknowledged items after this many days</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <input
            type="number"
            min={1}
            value={reminderDays}
            onChange={e => setReminderDays(e.target.value)}
            style={{
              width: 80, padding: '4px 8px', fontSize: 13, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', textAlign: 'right',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>days</span>
        </div>
      </div>

      {/* Save button */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Governance Config'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function GovernancePolicies() {
  const [policies,   setPolicies]   = useState([])
  const [schedules,  setSchedules]  = useState([])
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p, error: pe }, { data: s, error: se }] = await Promise.all([
      supabase.from('governance_policies').select('*').order('module').order('policy_name'),
      supabase.from('notification_schedules').select('*').order('module').order('schedule_key'),
    ])
    if (pe) toast.error(`Policies: ${pe.message}`)
    if (se) toast.error(`Schedules: ${se.message}`)
    setPolicies(p || [])
    setSchedules(s || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Separate governance config settings from operational policies
  const configPolicies = policies.filter(p => p.setting_key && p.setting_key.startsWith('gov_'))
  const opPolicies     = policies.filter(p => !p.setting_key || !p.setting_key.startsWith('gov_'))

  // Group operational policies by module
  const policyGroups = opPolicies.reduce((acc, pol) => {
    const mod = pol.module || 'other'
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(pol)
    return acc
  }, {})

  if (loading) {
    return (
      <div>
        <PageHeader title="Governance Policies" subtitle="Configure system-wide rules and controls" />
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Governance Policies"
        subtitle="Configure system-wide rules and controls"
      >
        <button className="btn btn-secondary" onClick={load}>
          <span className="material-icons">refresh</span> Refresh
        </button>
      </PageHeader>

      {/* ── Section 0: Governance Configuration (new) ── */}
      <GovernanceConfig allPolicies={policies} onSaved={load} />

      {/* ── Section 1: Policy Controls ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px', marginTop: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span className="material-icons" style={{ fontSize: 20, color: 'var(--gold)' }}>
            policy
          </span>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Policy Controls</h2>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
            {opPolicies.length} polic{opPolicies.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        {opPolicies.length === 0 ? (
          <EmptyState icon="policy" message="No governance policies found" />
        ) : (
          Object.entries(policyGroups).map(([mod, group]) => (
            <div key={mod} style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                paddingBottom: 6, borderBottom: '2px solid var(--border)',
              }}>
                {moduleBadge(mod)}
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {mod} Policies
                </span>
              </div>
              {group.map(pol => (
                <PolicyRow key={pol.id} policy={pol} onSaved={load} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Section 2: Notification Schedules ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 24px', marginTop: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span className="material-icons" style={{ fontSize: 20, color: 'var(--blue)' }}>
            schedule_send
          </span>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Notification Schedules</h2>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
            {schedules.filter(s => s.is_active).length} active
          </span>
        </div>

        {schedules.length === 0 ? (
          <EmptyState icon="schedule_send" message="No notification schedules configured" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['Schedule', 'Module', 'Trigger', 'Target Roles', 'Last Run', 'Active'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <ScheduleRow key={s.id} schedule={s} onToggled={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
