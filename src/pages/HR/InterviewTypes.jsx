import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const empty = { name: '', description: '', default_duration_minutes: 60, is_active: true }

export default function InterviewTypes() {
  const canEdit = useCanEdit('hr', 'interview-types')
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('interview_types').select('*').order('name')
    if (error) toast.error(error.message)
    setTypes(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openModal = (t = null) => setModal(t ? { ...t } : { ...empty })

  const save = async () => {
    const { id, ...rest } = modal
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('interview_types').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('interview_types').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetch()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('interview_types').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetch()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="Interview Types" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Interview Types" subtitle="Define interview formats used in the recruitment process">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Type
          </button>
        )}
      </PageHeader>

      {types.length === 0
        ? <EmptyState icon="event_note" message="No interview types defined" action={canEdit ? { label: 'New Type', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Description</th><th>Duration (min)</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{t.description || '—'}</td>
                    <td>{t.default_duration_minutes}</td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: t.is_active ? 'var(--green)22' : 'var(--border)', color: t.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openModal(t)}>Edit</button>}
                        {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(t)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Interview Type' : 'New Interview Type'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={modal?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={modal?.description || ''} onChange={e => setF('description', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Default Duration (minutes)</label>
            <input className="form-control" type="number" value={modal?.default_duration_minutes ?? 60} onChange={e => setF('default_duration_minutes', Number(e.target.value))} disabled={!canEdit} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={modal?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
            <span>Active</span>
          </label>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Delete Interview Type"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}
