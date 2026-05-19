// src/pages/HR/EmployeeSkillMap.jsx
// Per-employee skill assignment with proficiency tracking.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import toast from 'react-hot-toast'

const PROFICIENCY = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const PROF_COLORS = { Beginner: 'var(--text-dim)', Intermediate: 'var(--blue)', Advanced: 'var(--purple)', Expert: 'var(--green)' }

const EMPTY_SKILL = { skill_id: '', proficiency: 'Beginner', years_of_experience: 0, evaluation_date: '', certified: false, notes: '' }

export default function EmployeeSkillMap() {
  const canEdit = useCanEdit('hr', 'employee-skills')

  const [employees, setEmployees] = useState([])
  const [skills, setSkills]       = useState([])
  const [selEmp, setSelEmp]       = useState('')
  const [empSkills, setEmpSkills] = useState([])
  const [loading, setLoading]     = useState(false)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY_SKILL)
  const [saving, setSaving]       = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)

  const skillMap = Object.fromEntries(skills.map(s => [s.id, s]))

  const fetchMeta = useCallback(async () => {
    const [{ data: emps }, { data: sk }] = await Promise.all([
      supabase.from('employees').select('id,name').eq('status','Active').order('name'),
      supabase.from('skills').select('id,name,skill_type_id').eq('is_active', true).order('name').then(r => r).catch(() => ({ data: [] })),
    ])
    setEmployees(emps || []); setSkills(sk || [])
  }, [])

  const fetchEmpSkills = useCallback(async () => {
    if (!selEmp) { setEmpSkills([]); return }
    setLoading(true)
    const { data, error } = await supabase.from('employee_skills').select('*').eq('employee_id', selEmp).order('id')
    if (error) { toast.error(error.message); setLoading(false); return }
    setEmpSkills(data || []); setLoading(false)
  }, [selEmp])

  useEffect(() => { fetchMeta() }, [fetchMeta])
  useEffect(() => { fetchEmpSkills() }, [fetchEmpSkills])

  const openNew  = () => { setEditing(null); setForm({ ...EMPTY_SKILL, evaluation_date: new Date().toISOString().split('T')[0] }); setModal(true) }
  const openEdit = r => {
    setEditing(r.id)
    setForm({ skill_id: r.skill_id || '', proficiency: r.proficiency || 'Beginner', years_of_experience: r.years_of_experience || 0, evaluation_date: r.evaluation_date || '', certified: r.certified || false, notes: r.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.skill_id) return toast.error('Select a skill')
    setSaving(true)
    const skillName = skillMap[form.skill_id]?.name || ''
    const payload = {
      employee_id: selEmp, skill_id: form.skill_id, skill: skillName,
      proficiency: form.proficiency, years_of_experience: Number(form.years_of_experience) || 0,
      evaluation_date: form.evaluation_date || null, certified: form.certified,
      notes: form.notes || null, updated_at: new Date().toISOString(),
    }
    let error
    if (editing) {
      ;({ error } = await supabase.from('employee_skills').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('employee_skills').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Skill updated' : 'Skill added'); setModal(false); fetchEmpSkills()
  }

  const del = async id => {
    const { error } = await supabase.from('employee_skills').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Skill removed'); fetchEmpSkills(); setConfirm(null)
  }

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const selectedEmployee = employees.find(e => e.id === selEmp)

  return (
    <div>
      <PageHeader title="Employee Skills" subtitle="Assign and track individual employee skill proficiencies">
        {canEdit && selEmp && <button className="btn btn-primary" onClick={openNew}>+ Add Skill</button>}
      </PageHeader>

      {/* Employee picker */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <label className="field-label" style={{ marginBottom: 8, display: 'block' }}>Select Employee</label>
        <select value={selEmp} onChange={e => setSelEmp(e.target.value)} className="input" style={{ maxWidth: 340 }}>
          <option value="">Choose an employee…</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {!selEmp ? (
        <EmptyState icon="manage_accounts" message="Select an employee to view and manage their skills" />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{selectedEmployee?.name} — {empSkills.length} skill{empSkills.length !== 1 ? 's' : ''}</h3>
          </div>

          {empSkills.length === 0 ? (
            <EmptyState icon="star_outline" message="No skills recorded for this employee" action={canEdit ? { label: 'Add First Skill', onClick: openNew } : null} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {empSkills.map(r => {
                const sk = r.skill_id ? skillMap[r.skill_id] : null
                const prof = r.proficiency || 'Beginner'
                return (
                  <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{sk?.name || r.skill || '—'}</div>
                        {r.certified && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--gold)22', color: 'var(--gold)', fontWeight: 700 }}>Certified</span>}
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: `${PROF_COLORS[prof]}22`, color: PROF_COLORS[prof] }}>{prof}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                      {r.years_of_experience > 0 && <span>{r.years_of_experience}yr experience</span>}
                      {r.evaluation_date && <span>Evaluated: {r.evaluation_date}</span>}
                      {r.notes && <span style={{ fontStyle: 'italic' }}>{r.notes}</span>}
                    </div>
                    {/* Proficiency bar */}
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)', marginBottom: 10 }}>
                      <div style={{ height: 4, borderRadius: 2, background: PROF_COLORS[prof], width: `${(['Beginner','Intermediate','Advanced','Expert'].indexOf(prof)+1) * 25}%`, transition: 'width .3s' }} />
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)} style={{ flex: 1 }}>Edit</button>
                        <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ id: r.id, name: sk?.name || r.skill })}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Skill' : `Add Skill — ${selectedEmployee?.name || ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Skill *</label>
            <select className="input" value={form.skill_id} onChange={e => fld('skill_id', e.target.value)} disabled={!!editing}>
              <option value="">Select skill…</option>
              {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Proficiency</label>
              <select className="input" value={form.proficiency} onChange={e => fld('proficiency', e.target.value)}>
                {PROFICIENCY.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Years of Experience</label>
              <input type="number" className="input" min="0" step="0.5" value={form.years_of_experience} onChange={e => fld('years_of_experience', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Evaluation Date</label>
            <input type="date" className="input" value={form.evaluation_date} onChange={e => fld('evaluation_date', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="certified" checked={form.certified} onChange={e => fld('certified', e.target.checked)} />
            <label htmlFor="certified" style={{ cursor: 'pointer', fontSize: 13 }}>Employee holds certification for this skill</label>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <input className="input" value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Skill'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirm} title="Remove Skill" danger
        message={`Remove "${confirm?.name}" from ${selectedEmployee?.name}?`} confirmLabel="Remove"
        onConfirm={() => del(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
