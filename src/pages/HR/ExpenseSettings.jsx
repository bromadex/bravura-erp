import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, Spinner } from '../../components/ui'

const DEFAULTS = {
  id: 'singleton',
  expense_approver_mandatory: true,
  prevent_self_expense_approval: true,
  unlink_payment_on_advance_cancel: false,
  require_receipt_attachment: true,
  default_currency: 'USD',
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

export default function ExpenseSettings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'settings')

  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expense_settings')
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
      const { error } = await supabase.from('expense_settings').upsert(payload, { onConflict: 'id' })
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
        <PageHeader title="Expense Settings" />
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Expense Settings" subtitle="Approval, attachments and currency defaults">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            <span className="material-icons">save</span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </PageHeader>

      <SectionCard>
        <ToggleRow
          label="Expense Approver Mandatory"
          description="Require an approver to be assigned before submitting expenses"
          checked={settings.expense_approver_mandatory}
          onChange={v => set('expense_approver_mandatory', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Prevent Self Expense Approval"
          description="Disallow employees from approving their own expense claims"
          checked={settings.prevent_self_expense_approval}
          onChange={v => set('prevent_self_expense_approval', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Unlink Payment on Advance Cancel"
          description="Remove the linked payment when cancelling an employee advance"
          checked={settings.unlink_payment_on_advance_cancel}
          onChange={v => set('unlink_payment_on_advance_cancel', v)}
          disabled={!canEdit}
        />
        <ToggleRow
          label="Require Receipt Attachment"
          description="Force users to attach a receipt when claiming an expense"
          checked={settings.require_receipt_attachment}
          onChange={v => set('require_receipt_attachment', v)}
          disabled={!canEdit}
        />
        <div style={{ marginTop: 20, maxWidth: 320 }}>
          <FormField label="Default Currency">
            <select
              className="form-control"
              value={settings.default_currency}
              onChange={e => set('default_currency', e.target.value)}
              disabled={!canEdit}
            >
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
              <option value="ZWL">ZWL</option>
            </select>
          </FormField>
        </div>
        {settings.updated_at && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            Last updated: {fmtDate(settings.updated_at)}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
