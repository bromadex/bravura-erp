import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const empty = { name: '', is_active: true }

export default function ApplicantSources() {
  const canEdit = useCanEdit('hr', 'applicant-sources')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('job_applicant_sources').select('*').order('name')
    if (error) toast.error(error.message)
    setSources(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openModal = (s = null) => setModal(s ? { ...s } : { ...empty })

  const save = async () => {
    const { id, ...rest } = modal
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('job_applicant_sources').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('job_applicant_sources').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetch()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('job_applicant_sources').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetch()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="Applicant Sources" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Applicant Sources" subtitle="Configure recruitment channels and applicant source tracking">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Source
          </button>
        )}
      </PageHeader>

      {sources.length === 0
        ? <EmptyState icon="hub" message="No applicant sources defined" action={canEdit ? { label: 'New Source', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {sources.map(s => (
              <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-icons" style={{ color: s.is_active ? 'var(--blue)' : 'var(--text-dim)', fontSize: 22 }}>hub</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.is_active ? 'Active' : 'Inactive'}</div>
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => openModal(s)}>Edit</button>
                    <button className="btn btn-danger btn-xs" onClick={() => setDeleting(s)}>Del</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Source' : 'New Applicant Source'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Source Name *</label>
            <input className="form-control" value={modal?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
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
        title="Delete Source"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}
