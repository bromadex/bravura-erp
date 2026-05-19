import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const empty = {
  name: '', description: '',
  requires_number: true, requires_expiry: false,
  is_mandatory: false, is_active: true,
}

export default function IdentificationDocumentTypes() {
  const canEdit = useCanEdit('hr', 'identification-document-types')
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('identification_document_types').select('*').order('name')
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
        const { error } = await supabase.from('identification_document_types').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('identification_document_types').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetch()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('identification_document_types').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetch()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="ID Document Types" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Identification Document Types" subtitle="Master list of identification document types employees can submit">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Type
          </button>
        )}
      </PageHeader>

      {types.length === 0
        ? <EmptyState icon="badge" message="No document types defined" action={canEdit ? { label: 'New Type', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Description</th><th>Number</th><th>Expiry</th><th>Mandatory</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {types.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{t.description || '—'}</td>
                    <td>{t.requires_number ? '✓' : '—'}</td>
                    <td>{t.requires_expiry ? '✓' : '—'}</td>
                    <td>{t.is_mandatory ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>YES</span> : '—'}</td>
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

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Document Type' : 'New Document Type'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={modal?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={modal?.description || ''} onChange={e => setF('description', e.target.value)} disabled={!canEdit} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={modal?.requires_number ?? true} onChange={e => setF('requires_number', e.target.checked)} disabled={!canEdit} />
              <span>Requires Number</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={modal?.requires_expiry ?? false} onChange={e => setF('requires_expiry', e.target.checked)} disabled={!canEdit} />
              <span>Requires Expiry</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={modal?.is_mandatory ?? false} onChange={e => setF('is_mandatory', e.target.checked)} disabled={!canEdit} />
              <span>Mandatory</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={modal?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
              <span>Active</span>
            </label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete Document Type" message={`Delete "${deleting?.name}"?`} />
    </div>
  )
}
