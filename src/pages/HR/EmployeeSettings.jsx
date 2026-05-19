import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  emp_numbering_scheme: 'naming_series',
  naming_series_prefix: 'EMP-',
  retirement_age: 65,
  standard_working_hours: 8,
  date_of_joining_required: true,
  enable_employee_self_service: true,
  updated_at: null,
}

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

export default function EmployeeSettings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_settings')
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
      const { error } = await supabase.from('employee_settings').upsert(payload, { onConflict: 'id' })
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
        <PageHeader title="Employee Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Employee Settings" subtitle="Numbering, retirement and self-service">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <FormField label="Employee Numbering Scheme">
            <select
              className="form-control"
              value={settings.emp_numbering_scheme}
              onChange={e => set('emp_numbering_scheme', e.target.value)}
              disabled={!canEdit}
            >
              <option value="naming_series">Naming Series</option>
              <option value="full_name">Full Name</option>
              <option value="employee_number">Employee Number</option>
            </select>
          </FormField>
          <FormField label="Naming Series Prefix">
            <input
              className="form-control"
              value={settings.naming_series_prefix}
              onChange={e => set('naming_series_prefix', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. EMP-"
            />
          </FormField>
          <FormField label="Retirement Age">
            <input
              className="form-control"
              type="number"
              min={1}
              max={120}
              value={settings.retirement_age}
              onChange={e => set('retirement_age', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
          <FormField label="Standard Working Hours (per day)">
            <input
              className="form-control"
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={settings.standard_working_hours}
              onChange={e => set('standard_working_hours', Number(e.target.value))}
              disabled={!canEdit}
            />
          </FormField>
        </div>
        <div style={{ marginTop: 8 }}>
          <ToggleRow
            label="Date of Joining Required"
            description="Make date of joining mandatory on employee records"
            checked={settings.date_of_joining_required}
            onChange={v => set('date_of_joining_required', v)}
            disabled={!canEdit}
          />
          <ToggleRow
            label="Enable Employee Self-Service"
            description="Allow employees to view and manage their profile and requests"
            checked={settings.enable_employee_self_service}
            onChange={v => set('enable_employee_self_service', v)}
            disabled={!canEdit}
          />
        </div>
        {settings.updated_at && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-dim)' }}>
            Last updated: {fmtDate(settings.updated_at)}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
