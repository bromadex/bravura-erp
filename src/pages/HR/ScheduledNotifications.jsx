import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, ModalDialog, ModalActions, Spinner,
} from '../../components/ui'

const NOTIFICATION_TYPES = [
  { value: 'birthday', label: 'Birthday', color: 'var(--purple)' },
  { value: 'holiday', label: 'Holiday', color: 'var(--blue)' },
  { value: 'leave_expiry', label: 'Leave Expiry', color: 'var(--yellow)' },
  { value: 'work_anniversary', label: 'Work Anniversary', color: 'var(--teal)' },
  { value: 'contract_expiry', label: 'Contract Expiry', color: 'var(--red)' },
]

const SEND_TO_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'all', label: 'All' },
]

const BLANK_FORM = {
  notification_type: 'birthday',
  trigger_days_before: 1,
  send_to: 'hr',
  message_template: '',
  is_active: true,
}

function TypeBadge({ type }) {
  const meta = NOTIFICATION_TYPES.find(t => t.value === type)
  if (!meta) return <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{type}</span>
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: meta.color + '18',
      color: meta.color,
      border: `1px solid ${meta.color}44`,
    }}>
      {meta.label}
    </span>
  )
}

export default function ScheduledNotifications() {
  const canEdit = useCanEdit('hr', 'scheduled-notifications')

  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .order('notification_type')
    if (error) toast.error(error.message)
    setRules(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const openNew = () => {
    setEditRule(null)
    setForm(BLANK_FORM)
    setShowModal(true)
  }

  const openEdit = (r) => {
    setEditRule(r)
    setForm({
      notification_type: r.notification_type,
      trigger_days_before: r.trigger_days_before ?? 1,
      send_to: r.send_to || 'hr',
      message_template: r.message_template || '',
      is_active: r.is_active,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.message_template.trim()) { toast.error('Message template is required'); return }
    setSaving(true)
    try {
      if (editRule) {
        const { error } = await supabase.from('scheduled_notifications').update({
          notification_type: form.notification_type,
          trigger_days_before: parseInt(form.trigger_days_before, 10),
          send_to: form.send_to,
          message_template: form.message_template.trim(),
          is_active: form.is_active,
        }).eq('id', editRule.id)
        if (error) throw error
        toast.success('Notification rule updated')
      } else {
        const { error } = await supabase.from('scheduled_notifications').insert([{
          id: crypto.randomUUID(),
          notification_type: form.notification_type,
          trigger_days_before: parseInt(form.trigger_days_before, 10),
          send_to: form.send_to,
          message_template: form.message_template.trim(),
          is_active: form.is_active,
        }])
        if (error) throw error
        toast.success('Notification rule created')
      }
      setShowModal(false)
      fetchRules()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (r) => {
    await supabase.from('scheduled_notifications').update({ is_active: !r.is_active }).eq('id', r.id)
    fetchRules()
  }

  const handleRunNow = (r) => {
    toast.success(`Notification queued: ${NOTIFICATION_TYPES.find(t => t.value === r.notification_type)?.label || r.notification_type}`)
  }

  return (
    <div>
      <PageHeader title="Scheduled Notifications">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Rule
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : rules.length === 0 ? (
        <EmptyState icon="notifications" message="No notification rules configured." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Trigger (days before)</th>
                <th>Send To</th>
                <th>Template Preview</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                  <td><TypeBadge type={r.notification_type} /></td>
                  <td style={{ textAlign: 'center' }}>{r.trigger_days_before}</td>
                  <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{r.send_to}</td>
                  <td style={{
                    maxWidth: 280, fontSize: 12, color: 'var(--text-dim)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.message_template || '—'}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: r.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                      color: r.is_active ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${r.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                    }}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {canEdit && (
                        <>
                          <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-xs btn-secondary" onClick={() => toggleActive(r)}
                            title={r.is_active ? 'Deactivate' : 'Activate'}>
                            <span className="material-icons" style={{ fontSize: 13 }}>
                              {r.is_active ? 'toggle_on' : 'toggle_off'}
                            </span>
                          </button>
                        </>
                      )}
                      <button className="btn btn-xs btn-primary" onClick={() => handleRunNow(r)} title="Run Now">
                        <span className="material-icons" style={{ fontSize: 13 }}>play_arrow</span> Run Now
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={showModal} onClose={() => setShowModal(false)}
        title={editRule ? 'Edit Notification Rule' : 'New Notification Rule'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Notification Type</label>
            <select className="form-control" value={form.notification_type}
              onChange={e => setForm(f => ({ ...f, notification_type: e.target.value }))}>
              {NOTIFICATION_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Trigger Days Before</label>
            <input type="number" min={0} className="form-control" value={form.trigger_days_before}
              onChange={e => setForm(f => ({ ...f, trigger_days_before: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Send To</label>
            <select className="form-control" value={form.send_to}
              onChange={e => setForm(f => ({ ...f, send_to: e.target.value }))}>
              {SEND_TO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Message Template *</label>
            <textarea className="form-control" rows={4} value={form.message_template}
              onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
              placeholder="e.g. Happy Birthday {employee_name}! Wishing you a great year." />
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Available placeholders: <code>{'{employee_name}'}</code>, <code>{'{years}'}</code>, <code>{'{days}'}</code>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="sn_active" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="sn_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
