import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const LEVEL_COLOR = { Beginner: 'var(--blue)', Intermediate: 'var(--teal)', Advanced: 'var(--gold)', Expert: 'var(--purple)' }

const emptyLink = { designation_id: '', skill_id: '', required_level: 'Intermediate', is_mandatory: false, notes: '' }

export default function DesignationSkills() {
  const canEdit = useCanEdit('hr', 'designation-skills')
  const [designations, setDesignations] = useState([])
  const [skills, setSkills] = useState([])
  const [links, setLinks] = useState([])
  const [selectedDes, setSelectedDes] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [desRes, skRes, linkRes] = await Promise.all([
      supabase.from('designations').select('id, title').order('title'),
      supabase.from('skills').select('id, name, skill_type_id').order('name').then(r => r).catch(() => ({ data: [] })),
      supabase.from('designation_skills').select('*, designations(title), skills(name)').order('created_at'),
    ])
    setDesignations(desRes.data || [])
    setSkills(skRes.data || [])
    setLinks(linkRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openModal = (l = null) => setModal(l ? { ...l } : { ...emptyLink, designation_id: selectedDes })

  const save = async () => {
    const { id, designations: _d, skills: _s, ...rest } = modal
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('designation_skills').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('designation_skills').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('designation_skills').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  const filtered = selectedDes ? links.filter(l => l.designation_id === selectedDes) : links
  const desgName = selectedDes ? designations.find(d => d.id === selectedDes)?.title : null

  if (loading) return <div><PageHeader title="Designation Skills" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Designation Skills" subtitle="Define required skills and proficiency levels per role">
        {canEdit && selectedDes && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>Add Required Skill
          </button>
        )}
      </PageHeader>

      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <div style={{ width: 260, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, maxHeight: 600, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, padding: '4px 8px' }}>Designations</div>
          <button onClick={() => setSelectedDes('')} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: !selectedDes ? 'var(--gold)22' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: !selectedDes ? 'var(--gold)' : 'var(--text)', fontWeight: !selectedDes ? 700 : 400, fontSize: 13 }}>
            All ({links.length})
          </button>
          {designations.map(d => {
            const count = links.filter(l => l.designation_id === d.id).length
            return (
              <button key={d.id} onClick={() => setSelectedDes(d.id)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: selectedDes === d.id ? 'var(--gold)22' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: selectedDes === d.id ? 'var(--gold)' : 'var(--text)', fontWeight: selectedDes === d.id ? 700 : 400, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{d.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{count}</span>
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1 }}>
          {desgName && (
            <div style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{desgName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{filtered.length} required skill(s)</div>
            </div>
          )}

          {filtered.length === 0
            ? <EmptyState icon="star" message={selectedDes ? 'No required skills defined for this designation' : 'Pick a designation to manage its required skills'} action={canEdit && selectedDes ? { label: 'Add Required Skill', onClick: () => openModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr>{!selectedDes && <th>Designation</th>}<th>Skill</th><th>Required Level</th><th>Mandatory</th><th>Notes</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id}>
                      {!selectedDes && <td>{l.designations?.title}</td>}
                      <td style={{ fontWeight: 600 }}>{l.skills?.name}</td>
                      <td><span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: `${LEVEL_COLOR[l.required_level]}22`, color: LEVEL_COLOR[l.required_level], fontWeight: 600 }}>{l.required_level || '—'}</span></td>
                      <td>{l.is_mandatory ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>YES</span> : '—'}</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{l.notes || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openModal(l)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(l)}>Del</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Required Skill' : 'Add Required Skill'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Designation *</label>
              <select className="form-control" value={modal?.designation_id || ''} onChange={e => setF('designation_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Skill *</label>
              <select className="form-control" value={modal?.skill_id || ''} onChange={e => setF('skill_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Required Level</label>
              <select className="form-control" value={modal?.required_level || 'Intermediate'} onChange={e => setF('required_level', e.target.value)} disabled={!canEdit}>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', alignSelf: 'flex-end', paddingBottom: 8 }}>
              <input type="checkbox" checked={modal?.is_mandatory ?? false} onChange={e => setF('is_mandatory', e.target.checked)} disabled={!canEdit} />
              <span>Mandatory</span>
            </label>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={modal?.notes || ''} onChange={e => setF('notes', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Remove Required Skill" message="Remove this required skill from the designation?" />
    </div>
  )
}
