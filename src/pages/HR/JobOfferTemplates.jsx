import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const VARS = ['{{candidate_name}}', '{{designation}}', '{{salary}}', '{{joining_date}}', '{{validity_date}}', '{{company_name}}']

const empty = { name: '', designation: '', body: '', offer_terms: '', validity_days: 14, is_active: true }

export default function JobOfferTemplates() {
  const canEdit = useCanEdit('hr', 'job-offer-templates')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('job_offer_templates').select('*').order('name')
    if (error) toast.error(error.message)
    setTemplates(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openModal = (t = null) => setModal(t ? { ...t } : { ...empty })

  const save = async () => {
    const { id, ...rest } = modal
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('job_offer_templates').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('job_offer_templates').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetch()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('job_offer_templates').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetch()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="Job Offer Templates" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Job Offer Templates" subtitle="Create and manage job offer letter templates">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Template
          </button>
        )}
      </PageHeader>

      {templates.length === 0
        ? <EmptyState icon="description" message="No offer templates defined" action={canEdit ? { label: 'New Template', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    {t.designation && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.designation}</div>}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: t.is_active ? 'var(--green)22' : 'var(--border)', color: t.is_active ? 'var(--green)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                  Offer validity: {t.validity_days} days
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => openModal(t)} style={{ flex: 1 }}>Edit</button>
                    <button className="btn btn-danger btn-xs" onClick={() => setDeleting(t)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Template' : 'New Offer Template'} size="lg">
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Variables:{' '}
          {VARS.map(v => (
            <code key={v} style={{ background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px', margin: '0 2px', fontSize: 11 }}>{v}</code>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Template Name *</label>
              <input className="form-control" value={modal?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Designation (optional)</label>
              <input className="form-control" value={modal?.designation || ''} onChange={e => setF('designation', e.target.value)} disabled={!canEdit} placeholder="Specific role this template is for" />
            </div>
          </div>
          <div className="form-group">
            <label>Offer Body *</label>
            <textarea className="form-control" rows={7} value={modal?.body || ''} onChange={e => setF('body', e.target.value)} disabled={!canEdit} placeholder="Main offer letter content…" />
          </div>
          <div className="form-group">
            <label>Terms & Conditions</label>
            <textarea className="form-control" rows={3} value={modal?.offer_terms || ''} onChange={e => setF('offer_terms', e.target.value)} disabled={!canEdit} placeholder="Standard offer terms and conditions…" />
          </div>
          <div className="form-group" style={{ maxWidth: 200 }}>
            <label>Validity (days)</label>
            <input className="form-control" type="number" min={1} value={modal?.validity_days ?? 14} onChange={e => setF('validity_days', Number(e.target.value))} disabled={!canEdit} />
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
        title="Delete Template"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  )
}
