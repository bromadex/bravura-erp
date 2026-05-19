import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner, TabNav } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  allow_multiple_shift_assignments: false,
  allow_employee_checkin_mobile: true,
  allow_geolocation_tracking: false,
  geolocation_radius_meters: 100,
  auto_mark_absent_after_hours: 4,
  late_entry_grace_minutes: 15,
  early_exit_grace_minutes: 15,
  // Phase 7 biometric additions
  auto_process_checkins: false,
  checkin_match_hours: 12,
  require_biometric_device: false,
  updated_at: null,
}

const TABS = [
  { id: 'shifts',     label: 'Shifts',              icon: 'schedule' },
  { id: 'checkin',    label: 'Check-in',            icon: 'login' },
  { id: 'biometric',  label: 'Biometric',           icon: 'fingerprint' },
  { id: 'attendance', label: 'Attendance Marking',  icon: 'fact_check' },
]

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

export default function ShiftAttendanceSettings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('shifts')

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shift_attendance_settings')
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
      const { error } = await supabase.from('shift_attendance_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, updated_at: payload.updated_at }))
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : null

  if (loading) {
    return (
      <div>
        <PageHeader title="Shift & Attendance Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Shift & Attendance Settings" subtitle="Shifts, check-in and attendance marking rules">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'shifts' && (
        <SectionCard>
          <ToggleRow
            label="Allow Multiple Shift Assignments"
            description="Permit an employee to be assigned to more than one shift simultaneously"
            checked={settings.allow_multiple_shift_assignments}
            onChange={v => set('allow_multiple_shift_assignments', v)}
            disabled={!canEdit}
          />
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'checkin' && (
        <SectionCard>
          <ToggleRow
            label="Allow Employee Check-in via Mobile"
            description="Enable employees to check in/out using the mobile app"
            checked={settings.allow_employee_checkin_mobile}
            onChange={v => {
              set('allow_employee_checkin_mobile', v)
              if (!v) {
                set('allow_geolocation_tracking', false)
              }
            }}
            disabled={!canEdit}
          />
          {settings.allow_employee_checkin_mobile && (
            <ToggleRow
              label="Allow Geolocation Tracking"
              description="Record device GPS coordinates when employees check in"
              checked={settings.allow_geolocation_tracking}
              onChange={v => set('allow_geolocation_tracking', v)}
              disabled={!canEdit}
            />
          )}
          {settings.allow_employee_checkin_mobile && settings.allow_geolocation_tracking && (
            <div style={{ marginTop: 20, maxWidth: 320 }}>
              <FormField label="Geolocation Radius (meters)">
                <input
                  className="form-control"
                  type="number"
                  min={1}
                  value={settings.geolocation_radius_meters}
                  onChange={e => set('geolocation_radius_meters', Number(e.target.value))}
                  disabled={!canEdit}
                />
              </FormField>
            </div>
          )}
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'biometric' && (
        <SectionCard>
          <ToggleRow
            label="Auto-Process Check-ins to Attendance"
            description="Automatically convert matched IN/OUT check-in pairs into attendance records"
            checked={settings.auto_process_checkins}
            onChange={v => set('auto_process_checkins', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Require Biometric Device"
            description="Only allow check-ins from registered biometric devices (no manual entries)"
            checked={settings.require_biometric_device}
            onChange={v => set('require_biometric_device', v)}
            disabled={!canEdit}
          />
          <div style={{ marginTop: 20, maxWidth: 320 }}>
            <FormField label="Match IN/OUT Within (hours)">
              <input
                className="form-control"
                type="number"
                min={1}
                max={24}
                value={settings.checkin_match_hours}
                onChange={e => set('checkin_match_hours', Number(e.target.value))}
                disabled={!canEdit}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Maximum hours between an IN and its matching OUT check-in
              </div>
            </FormField>
          </div>
          {settings.updated_at && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === 'attendance' && (
        <SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <FormField label="Auto-Mark Absent After (hours)">
              <input
                className="form-control"
                type="number"
                min={0}
                step={0.5}
                value={settings.auto_mark_absent_after_hours}
                onChange={e => set('auto_mark_absent_after_hours', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Late Entry Grace (minutes)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.late_entry_grace_minutes}
                onChange={e => set('late_entry_grace_minutes', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label="Early Exit Grace (minutes)">
              <input
                className="form-control"
                type="number"
                min={0}
                value={settings.early_exit_grace_minutes}
                onChange={e => set('early_exit_grace_minutes', Number(e.target.value))}
                disabled={!canEdit}
              />
            </FormField>
          </div>
          {settings.updated_at && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
              Last updated: {fmtDate(settings.updated_at)}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
