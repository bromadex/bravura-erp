// src/pages/HR/KPITemplates.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, ModalDialog, ModalActions, Spinner
} from '../../components/ui'

const BLANK_FORM = {
  name: '', description: '', category: '',
  department_id: '', default_weight: 10,
  unit: '%', is_active: true,
}

export default function KPITemplates() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'kpi_templates')

  const [templates,   setTemplates]   = useState([])
  const [departments, setDepartments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [form,        setForm]        = useState(BLANK_FORM)

  // ── Fetch ───────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('kpi_templates')
        .select('*, departments(name)')
        .order('category')
        .order('name')
      if (error) throw error
      setTemplates(data || [])
    } catch (err) {
      toast.error('Failed to load templates: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase
      .from('departments').select('id, name').order('name')
    setDepartments(data || [])
  }, [])

  useEffect(() => {
    fetchTemplates()
    fetchDepartments()
  }, [fetchTemplates, fetchDepartments])

  // ── Modal helpers ────────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (tpl) => {
    setEditing(tpl)
    setForm({
      name:           tpl.name,
      description:    tpl.description    || '',
      category:       tpl.category       || '',
      department_id:  tpl.department_id  || '',
      default_weight: tpl.default_weight ?? 10,
      unit:           tpl.unit           || '%',
      is_active:      tpl.is_active      !== false,
    })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim())     return toast.error('Name is required')
    if (!form.category.trim()) return toast.error('Category is required')

    setSaving(true)
    try {
      const payload = {
        name:           form.name.trim(),
        description:    form.description.trim() || null,
        category:       form.category.trim(),
        department_id:  form.department_id || null,
        default_weight: Number(form.default_weight) || 10,
        unit:           form.unit.trim() || '%',
        is_active:      form.is_active,
      }

      if (editing) {
        const { error } = await supabase
          .from('kpi_templates').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Template updated')
      } else {
        const { error } = await supabase
          .from('kpi_templates').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Template created')
      }

      closeModal()
      await fetchTemplates()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active inline ──────────────────────────────────────
  const handleToggleActive = async (tpl) => {
    try {
      const { error } = await supabase
        .from('kpi_templates')
        .update({ is_active: !tpl.is_active })
        .eq('id', tpl.id)
      if (error) throw error
      toast.success(tpl.is_active ? 'Template deactivated' : 'Template activated')
      await fetchTemplates()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (tpl) => {
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return
    try {
      const { error } = await supabase
        .from('kpi_templates').delete().eq('id', tpl.id)
      if (error) throw error
      toast.success('Deleted')
      await fetchTemplates()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Group by category for display ────────────────────────────
  const grouped = templates.reduce((acc, tpl) => {
    const cat = tpl.category || 'Uncategorised'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tpl)
    return acc
  }, {})
  const categories = Object.keys(grouped).sort()

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="KPI Templates">
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons">add</span> New Template
          </button>
        )}
      </PageHeader>

      {loading ? (
        <Spinner text="Loading templates…" />
      ) : templates.length === 0 ? (
        <EmptyState icon="bar_chart" message="No KPI templates yet" />
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div style={{
              fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: 1,
              textTransform: 'uppercase', color: 'var(--text-dim)',
              marginBottom: 8, paddingLeft: 2,
            }}>
              {cat}
              <span style={{
                marginLeft: 8, fontSize: 10,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '1px 6px', color: 'var(--text-dim)',
              }}>
                {grouped[cat].length}
              </span>
            </div>

            <div className="table-wrap" style={{ marginBottom: 0 }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Department</th>
                    <th>Default Weight</th>
                    <th>Unit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map(tpl => (
                    <tr key={tpl.id} style={{ opacity: tpl.is_active ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{tpl.name}</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                        {tpl.description || '—'}
                      </td>
                      <td>{tpl.departments?.name || <span style={{ color: 'var(--text-dim)' }}>All</span>}</td>
                      <td style={{ textAlign: 'center' }}>{tpl.default_weight ?? '—'}</td>
                      <td>{tpl.unit || '—'}</td>
                      <td>
                        <span className={`badge ${tpl.is_active ? 'badge-green' : 'badge-dim'}`}>
                          {tpl.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="btn-group-sm">
                          {canEdit && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEdit(tpl)}
                              title="Edit"
                            >
                              <span className="material-icons" style={{ fontSize: 15 }}>edit</span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleToggleActive(tpl)}
                              title={tpl.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <span className="material-icons" style={{ fontSize: 15 }}>
                                {tpl.is_active ? 'toggle_on' : 'toggle_off'}
                              </span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(tpl)}
                              title="Delete"
                            >
                              <span className="material-icons" style={{ fontSize: 15 }}>delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* New / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit · ${editing.name}` : 'New KPI Template'}
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Name *</label>
            <input
              className="form-control"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Revenue Growth"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Category *</label>
            <input
              className="form-control"
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="e.g. Sales, Finance"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            rows="2"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="What does this KPI measure?"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <select
              className="form-control"
              value={form.department_id}
              onChange={e => setForm({ ...form, department_id: e.target.value })}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Default Weight (%)</label>
            <input
              type="number" min="1" max="100"
              className="form-control"
              value={form.default_weight}
              onChange={e => setForm({ ...form, default_weight: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Unit</label>
            <input
              className="form-control"
              value={form.unit}
              onChange={e => setForm({ ...form, unit: e.target.value })}
              placeholder="%, #, $…"
            />
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Active (available for use in performance reviews)</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
