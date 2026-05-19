import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog, StatusBadge,
} from '../../components/ui'

const TYPE_OPTIONS = [
  { value: 'info',    label: 'Info',    color: 'var(--blue)' },
  { value: 'success', label: 'Success', color: 'var(--green)' },
  { value: 'warning', label: 'Warning', color: 'var(--yellow)' },
  { value: 'error',   label: 'Error',   color: 'var(--red)' },
]

const CATEGORY_SUGGESTIONS = [
  'leave', 'expense', 'payroll', 'attendance', 'recruitment', 'performance', 'general',
]

const COMMON_VARS = [
  '{{employee_name}}',
  '{{date}}',
  '{{amount}}',
  '{{days}}',
  '{{period}}',
  '{{id}}',
]

const BLANK_FORM = {
  event_type: '',
  category: 'general',
  type: 'info',
  title: '',
  message: '',
  link: '',
  enabled: true,
}

function TypeBadge({ type }) {
  const meta = TYPE_OPTIONS.find(t => t.value === type)
  const color = meta?.color || 'var(--text-dim)'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      textTransform: 'capitalize',
    }}>
      {meta?.label || type}
    </span>
  )
}

export default function NotificationTemplates() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'notification-templates')

  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const [categoryFilter, setCategoryFilter] = useState('')
  const [enabledFilter,  setEnabledFilter]  = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [editRow,   setEditRow]   = useState(null)
  const [form,      setForm]      = useState(BLANK_FORM)

  const [confirmDelete, setConfirmDelete] = useState(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('event_type', { ascending: true })
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (categoryFilter && !(r.category || '').toLowerCase().includes(categoryFilter.toLowerCase())) return false
      if (enabledFilter === 'enabled'  && !r.enabled) return false
      if (enabledFilter === 'disabled' &&  r.enabled) return false
      return true
    })
  }, [rows, categoryFilter, enabledFilter])

  const openNew = () => {
    setEditRow(null)
    setForm(BLANK_FORM)
    setShowModal(true)
  }

  const openEdit = (r) => {
    setEditRow(r)
    setForm({
      event_type: r.event_type || '',
      category:   r.category   || 'general',
      type:       r.type       || 'info',
      title:      r.title      || '',
      message:    r.message    || '',
      link:       r.link       || '',
      enabled:    !!r.enabled,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.event_type.trim()) { toast.error('Event type is required'); return }
    if (!form.title.trim())      { toast.error('Title is required');      return }

    const eventTypeKey = form.event_type.trim()
    const duplicate = rows.find(r =>
      r.event_type === eventTypeKey && (!editRow || r.id !== editRow.id)
    )
    if (duplicate) {
      toast.error(`Event type "${eventTypeKey}" already exists`)
      return
    }

    setSaving(true)
    try {
      const payload = {
        event_type: eventTypeKey,
        category:   form.category.trim() || 'general',
        type:       form.type,
        title:      form.title.trim(),
        message:    form.message,
        link:       form.link.trim() || null,
        enabled:    form.enabled,
      }
      if (editRow) {
        const { error } = await supabase
          .from('notification_templates')
          .update(payload)
          .eq('id', editRow.id)
        if (error) throw error
        toast.success('Template updated')
      } else {
        const { error } = await supabase
          .from('notification_templates')
          .insert([{ id: crypto.randomUUID(), ...payload }])
        if (error) throw error
        toast.success('Template created')
      }
      setShowModal(false)
      fetchRows()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (r) => {
    const { error } = await supabase
      .from('notification_templates')
      .update({ enabled: !r.enabled })
      .eq('id', r.id)
    if (error) { toast.error(error.message); return }
    toast.success(r.enabled ? 'Template disabled' : 'Template enabled')
    fetchRows()
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', confirmDelete.id)
    if (error) { toast.error(error.message); return }
    toast.success('Template deleted')
    setConfirmDelete(null)
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Notification Templates"
        subtitle="Manage system notification messages and routing rules"
      >
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Template
          </button>
        )}
      </PageHeader>

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        marginTop: 16,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
            Filter by Category
          </label>
          <input
            className="form-control"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            placeholder="e.g. leave, payroll…"
            list="nt-category-suggestions"
          />
          <datalist id="nt-category-suggestions">
            {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div style={{ flex: '0 0 180px' }}>
          <label style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>
            Status
          </label>
          <select
            className="form-control"
            value={enabledFilter}
            onChange={e => setEnabledFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="notifications_none"
            message={rows.length === 0
              ? 'No notification templates configured yet.'
              : 'No templates match the current filters.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th style={{ width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.6 }}>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--text)' }}>{r.event_type}</code>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                      {r.category || '—'}
                    </td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </td>
                    <td><TypeBadge type={r.type} /></td>
                    <td>
                      <StatusBadge
                        status={r.enabled ? 'active' : 'inactive'}
                        label={r.enabled ? 'Enabled' : 'Disabled'}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => openEdit(r)}
                              title="Edit"
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            </button>
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => handleToggle(r)}
                              title={r.enabled ? 'Disable' : 'Enable'}
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>
                                {r.enabled ? 'toggle_on' : 'toggle_off'}
                              </span>
                            </button>
                            <button
                              className="btn btn-xs btn-danger"
                              onClick={() => setConfirmDelete(r)}
                              title="Delete"
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalDialog
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editRow ? 'Edit Notification Template' : 'New Notification Template'}
        size="lg"
      >
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label>Event Type *</label>
              <input
                className="form-control"
                value={form.event_type}
                onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
                placeholder="e.g. leave.approved"
                disabled={!!editRow}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Unique key. Use dot.notation, lowercase.
              </div>
            </div>
            <div className="form-group">
              <label>Category</label>
              <input
                className="form-control"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. leave, payroll"
                list="nt-modal-category-suggestions"
              />
              <datalist id="nt-modal-category-suggestions">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="form-group">
            <label>Type</label>
            <select
              className="form-control"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ maxWidth: 240 }}
            >
              {TYPE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input
              className="form-control"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Leave Approved for {{employee_name}}"
            />
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea
              className="form-control"
              rows={4}
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Your leave from {{date}} for {{days}} day(s) has been approved."
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label>Link (relative URL)</label>
            <input
              className="form-control"
              value={form.link}
              onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
              placeholder="/module/hr/leave/{{id}}"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="nt_enabled"
              checked={form.enabled}
              onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
            />
            <label htmlFor="nt_enabled" style={{ margin: 0, cursor: 'pointer' }}>Enabled</label>
          </div>

          <div style={{
            marginTop: 4,
            padding: 12,
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              <span className="material-icons md-16" style={{ verticalAlign: 'middle', marginRight: 4 }}>info</span>
              Common Variables
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMMON_VARS.map(v => (
                <code
                  key={v}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--gold)',
                  }}
                >
                  {v}
                </code>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              These are substituted at send time. You can use them in the title, message and link fields.
            </div>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Template"
        message={confirmDelete
          ? `Are you sure you want to delete the template "${confirmDelete.event_type}"? This cannot be undone.`
          : ''}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}
