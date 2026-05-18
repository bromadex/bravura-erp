import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const BLANK = { employment_type_name: '', description: '', is_active: true }

export default function EmploymentTypes() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'employment-types')

  const [types,     setTypes]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [editType,  setEditType]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  const fetchTypes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('employment_types').select('*').order('employment_type_name')
    if (error) toast.error(error.message)
    setTypes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTypes() }, [fetchTypes])

  const openNew  = () => { setEditType(null); setForm(BLANK); setShowForm(true) }
  const openEdit = (t) => {
    setEditType(t)
    setForm({
      employment_type_name: t.employment_type_name || '',
      description: t.description || '',
      is_active: t.is_active,
    })
    setShowForm(true)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.employment_type_name.trim()) { toast.error('Employment Type Name is required'); return }
    setSaving(true)
    try {
      const payload = {
        employment_type_name: form.employment_type_name.trim(),
        description: form.description,
        is_active: form.is_active,
      }
      if (editType) {
        await supabase.from('employment_types').update(payload).eq('id', editType.id)
        toast.success('Employment type updated')
      } else {
        await supabase.from('employment_types').insert([{
          id: crypto.randomUUID(),
          ...payload,
          created_by: user?.full_name || user?.username || '',
        }])
        toast.success('Employment type created')
      }
      setShowForm(false)
      fetchTypes()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (t) => {
    await supabase.from('employment_types').update({ is_active: !t.is_active }).eq('id', t.id)
    fetchTypes()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('employment_types').delete().eq('id', confirmDel.id)
    toast.success('Employment type deleted')
    setConfirmDel(null)
    setDeleting(false)
    fetchTypes()
  }

  return (
    <div>
      <PageHeader title="Employment Types">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Type
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : types.length === 0 ? (
        <EmptyState icon="work_outline" message="No employment types defined yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{t.employment_type_name}</td>
                  <td style={{ maxWidth: 340, fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description || '—'}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: t.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                      color: t.is_active ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${t.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                    }}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {canEdit && <>
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(t)} title="Edit">
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      <button className="btn btn-xs btn-secondary" onClick={() => toggleActive(t)} title={t.is_active ? 'Deactivate' : 'Activate'}>
                        <span className="material-icons" style={{ fontSize: 13 }}>{t.is_active ? 'toggle_on' : 'toggle_off'}</span>
                      </button>
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(t)} title="Delete">
                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                      </button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editType ? 'Edit Employment Type' : 'New Employment Type'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Employment Type Name *</label>
            <input className="form-control" value={form.employment_type_name} onChange={e => set('employment_type_name', e.target.value)} placeholder="e.g. Full-time" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="type_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <label htmlFor="type_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Employment Type" message={`Delete "${confirmDel?.employment_type_name}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'} danger loading={deleting}
      />
    </div>
  )
}
