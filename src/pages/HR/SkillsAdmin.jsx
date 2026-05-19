// src/pages/HR/SkillsAdmin.jsx
// 2-tab page: Skill Types master + Skills master.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, TabNav, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'types',  label: 'Skill Types' },
  { id: 'skills', label: 'Skills' },
]

export default function SkillsAdmin() {
  const canEdit = useCanEdit('hr', 'skills-admin')
  const [tab, setTab] = useState('types')

  // ── Skill Types ──────────────────────────────────────────────
  const [types, setTypes]           = useState([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [typeModal, setTypeModal]   = useState(false)
  const [typeForm, setTypeForm]     = useState({ name: '', description: '', is_active: true })
  const [typeEditing, setTypeEditing] = useState(null)
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeConfirm, setTypeConfirm] = useState(null)

  // ── Skills ────────────────────────────────────────────────────
  const [skills, setSkills]         = useState([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const [skillModal, setSkillModal] = useState(false)
  const [skillForm, setSkillForm]   = useState({ skill_type_id: '', name: '', description: '', is_active: true })
  const [skillEditing, setSkillEditing] = useState(null)
  const [skillSaving, setSkillSaving] = useState(false)
  const [skillConfirm, setSkillConfirm] = useState(null)
  const [skillFilter, setSkillFilter] = useState('')

  const typeMap = Object.fromEntries(types.map(t => [t.id, t.name]))

  const fetchTypes = useCallback(async () => {
    setTypesLoading(true)
    const { data, error } = await supabase.from('skill_types').select('*').order('name')
    if (error) { toast.error(error.message); setTypesLoading(false); return }
    setTypes(data || []); setTypesLoading(false)
  }, [])

  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true)
    let q = supabase.from('skills').select('*').order('name')
    if (skillFilter) q = q.eq('skill_type_id', skillFilter)
    const { data, error } = await q
    if (error) { toast.error(error.message); setSkillsLoading(false); return }
    setSkills(data || []); setSkillsLoading(false)
  }, [skillFilter])

  useEffect(() => { fetchTypes() }, [fetchTypes])
  useEffect(() => { fetchSkills() }, [fetchSkills])

  // ── Type CRUD ─────────────────────────────────────────────────
  const openNewType  = () => { setTypeEditing(null); setTypeForm({ name: '', description: '', is_active: true }); setTypeModal(true) }
  const openEditType = r  => { setTypeEditing(r.id); setTypeForm({ name: r.name, description: r.description || '', is_active: r.is_active }); setTypeModal(true) }

  const saveType = async () => {
    if (!typeForm.name.trim()) return toast.error('Name is required')
    setTypeSaving(true)
    const payload = { name: typeForm.name.trim(), description: typeForm.description.trim() || null, is_active: typeForm.is_active }
    let error
    if (typeEditing) {
      ;({ error } = await supabase.from('skill_types').update(payload).eq('id', typeEditing))
    } else {
      ;({ error } = await supabase.from('skill_types').insert(payload))
    }
    setTypeSaving(false)
    if (error) return toast.error(error.message)
    toast.success(typeEditing ? 'Type updated' : 'Type created'); setTypeModal(false); fetchTypes()
  }

  const delType = async id => {
    const { error } = await supabase.from('skill_types').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Deleted'); fetchTypes(); setTypeConfirm(null)
  }

  // ── Skill CRUD ────────────────────────────────────────────────
  const openNewSkill  = () => { setSkillEditing(null); setSkillForm({ skill_type_id: '', name: '', description: '', is_active: true }); setSkillModal(true) }
  const openEditSkill = r  => { setSkillEditing(r.id); setSkillForm({ skill_type_id: r.skill_type_id || '', name: r.name, description: r.description || '', is_active: r.is_active }); setSkillModal(true) }

  const saveSkill = async () => {
    if (!skillForm.name.trim()) return toast.error('Skill name is required')
    setSkillSaving(true)
    const payload = { name: skillForm.name.trim(), skill_type_id: skillForm.skill_type_id || null, description: skillForm.description.trim() || null, is_active: skillForm.is_active }
    let error
    if (skillEditing) {
      ;({ error } = await supabase.from('skills').update(payload).eq('id', skillEditing))
    } else {
      ;({ error } = await supabase.from('skills').insert(payload))
    }
    setSkillSaving(false)
    if (error) return toast.error(error.message)
    toast.success(skillEditing ? 'Skill updated' : 'Skill created'); setSkillModal(false); fetchSkills()
  }

  const delSkill = async id => {
    const { error } = await supabase.from('skills').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Deleted'); fetchSkills(); setSkillConfirm(null)
  }

  const chipStyle = isActive => ({ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: isActive ? 'var(--green)22' : 'var(--surface2)', color: isActive ? 'var(--green)' : 'var(--text-dim)' })

  return (
    <div>
      <PageHeader title="Skills Administration" subtitle="Manage skill types and the skills master list">
        {canEdit && tab === 'types'  && <button className="btn btn-primary" onClick={openNewType}>+ New Type</button>}
        {canEdit && tab === 'skills' && <button className="btn btn-primary" onClick={openNewSkill}>+ New Skill</button>}
      </PageHeader>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {/* Skill Types Tab */}
      {tab === 'types' && (
        typesLoading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
        : types.length === 0 ? <EmptyState icon="category" message="No skill types defined" />
        : (
          <table className="table">
            <thead><tr><th>Name</th><th>Description</th><th>Status</th>{canEdit && <th>Actions</th>}</tr></thead>
            <tbody>
              {types.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{r.description || '—'}</td>
                  <td><span style={chipStyle(r.is_active)}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                  {canEdit && (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditType(r)}>Edit</button>
                        <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setTypeConfirm({ id: r.id, name: r.name })}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Skills Tab */}
      {tab === 'skills' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <select value={skillFilter} onChange={e => setSkillFilter(e.target.value)} className="input" style={{ minWidth: 200 }}>
              <option value="">All Skill Types</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {skillsLoading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
          : skills.length === 0 ? <EmptyState icon="star" message="No skills defined" />
          : (
            <table className="table">
              <thead><tr><th>Skill</th><th>Type</th><th>Description</th><th>Status</th>{canEdit && <th>Actions</th>}</tr></thead>
              <tbody>
                {skills.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontSize: 12 }}>{r.skill_type_id ? (typeMap[r.skill_type_id] || '—') : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                    <td><span style={chipStyle(r.is_active)}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEditSkill(r)}>Edit</button>
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setSkillConfirm({ id: r.id, name: r.name })}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Type modal */}
      <ModalDialog open={typeModal} onClose={() => setTypeModal(false)} title={typeEditing ? 'Edit Skill Type' : 'New Skill Type'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Name *</label>
            <input className="input" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Technical" />
          </div>
          <div>
            <label className="field-label">Description</label>
            <input className="input" value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="type_active" checked={typeForm.is_active} onChange={e => setTypeForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="type_active" style={{ cursor: 'pointer', fontSize: 13 }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setTypeModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveType} disabled={typeSaving}>{typeSaving ? 'Saving…' : typeEditing ? 'Update' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Skill modal */}
      <ModalDialog open={skillModal} onClose={() => setSkillModal(false)} title={skillEditing ? 'Edit Skill' : 'New Skill'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Skill Name *</label>
            <input className="input" value={skillForm.name} onChange={e => setSkillForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Python, First Aid, Blasting" />
          </div>
          <div>
            <label className="field-label">Skill Type</label>
            <select className="input" value={skillForm.skill_type_id} onChange={e => setSkillForm(f => ({ ...f, skill_type_id: e.target.value }))}>
              <option value="">No type</option>
              {types.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Description</label>
            <input className="input" value={skillForm.description} onChange={e => setSkillForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="skill_active" checked={skillForm.is_active} onChange={e => setSkillForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="skill_active" style={{ cursor: 'pointer', fontSize: 13 }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setSkillModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveSkill} disabled={skillSaving}>{skillSaving ? 'Saving…' : skillEditing ? 'Update' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!typeConfirm} title="Delete Skill Type" danger
        message={`Delete skill type "${typeConfirm?.name}"? Skills of this type will be unlinked.`} confirmLabel="Delete"
        onConfirm={() => delType(typeConfirm.id)} onClose={() => setTypeConfirm(null)} />
      <ConfirmDialog open={!!skillConfirm} title="Delete Skill" danger
        message={`Delete skill "${skillConfirm?.name}"?`} confirmLabel="Delete"
        onConfirm={() => delSkill(skillConfirm.id)} onClose={() => setSkillConfirm(null)} />
    </div>
  )
}
