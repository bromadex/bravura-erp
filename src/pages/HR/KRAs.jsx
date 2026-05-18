// src/pages/HR/KRAs.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

export default function KRAs() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'performance-reviews')

  const [kras,    setKras]    = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const [showForm,   setShowForm]   = useState(false)
  const [editKra,    setEditKra]    = useState(null)
  const [form,       setForm]       = useState({ title: '', description: '', is_active: true })
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  const fetchKRAs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('kras').select('*').order('title')
    if (error) toast.error(error.message)
    setKras(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchKRAs() }, [fetchKRAs])

  const openNew  = () => { setEditKra(null); setForm({ title: '', description: '', is_active: true }); setShowForm(true) }
  const openEdit = (k) => { setEditKra(k); setForm({ title: k.title, description: k.description || '', is_active: k.is_active }); setShowForm(true) }

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      if (editKra) {
        await supabase.from('kras').update({ title: form.title, description: form.description, is_active: form.is_active }).eq('id', editKra.id)
        toast.success('KRA updated')
      } else {
        await supabase.from('kras').insert([{ id: crypto.randomUUID(), title: form.title, description: form.description, is_active: form.is_active, created_by: user?.full_name || '' }])
        toast.success('KRA created')
      }
      setShowForm(false)
      fetchKRAs()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (k) => {
    await supabase.from('kras').update({ is_active: !k.is_active }).eq('id', k.id)
    fetchKRAs()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('kras').delete().eq('id', confirmDel.id)
    toast.success('KRA deleted')
    setConfirmDel(null)
    setDeleting(false)
    fetchKRAs()
  }

  return (
    <div>
      <PageHeader title="Key Result Areas (KRAs)">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New KRA
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : kras.length === 0 ? (
        <EmptyState icon="flag" message="No KRAs defined yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {kras.map(k => (
                <tr key={k.id} style={{ opacity: k.is_active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{k.title}</td>
                  <td style={{ maxWidth: 300, fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {k.description || '—'}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: k.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                      color: k.is_active ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${k.is_active ? 'var(--green)' : 'var(--text-dim)'}44` }}>
                      {k.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {canEdit && <>
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(k)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      <button className="btn btn-xs btn-secondary" onClick={() => toggleActive(k)} title={k.is_active ? 'Deactivate' : 'Activate'}>
                        <span className="material-icons" style={{ fontSize: 13 }}>{k.is_active ? 'toggle_on' : 'toggle_off'}</span>
                      </button>
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(k)}>
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

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editKra ? 'Edit KRA' : 'New KRA'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Title *</label>
            <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Safety Compliance" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="kra_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="kra_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete KRA" message={`Delete "${confirmDel?.title}"? This cannot be undone.`} confirmLabel={deleting ? 'Deleting…' : 'Delete'} danger loading={deleting} />
    </div>
  )
}
