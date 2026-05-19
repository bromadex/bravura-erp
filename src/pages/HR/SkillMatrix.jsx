// src/pages/HR/SkillMatrix.jsx
// Cross-employee skills matrix — employees × skills grid with proficiency cells.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

const PROF_BG   = { Beginner: 'var(--surface2)', Intermediate: 'var(--blue)22', Advanced: 'var(--purple)22', Expert: 'var(--green)22' }
const PROF_FG   = { Beginner: 'var(--text-dim)',  Intermediate: 'var(--blue)',   Advanced: 'var(--purple)',   Expert: 'var(--green)' }
const PROF_ABBR = { Beginner: 'B', Intermediate: 'I', Advanced: 'A', Expert: 'E' }

export default function SkillMatrix() {
  const [employees, setEmployees]   = useState([])
  const [skills, setSkills]         = useState([])
  const [skillTypes, setSkillTypes] = useState([])
  const [empSkills, setEmpSkills]   = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading]       = useState(true)

  const [filterDept, setFilterDept] = useState('')
  const [filterType, setFilterType] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: emps }, { data: sk }, { data: st }, { data: depts }, { data: empSk }] = await Promise.all([
      supabase.from('employees').select('id,name,department_id').eq('status','Active').order('name'),
      supabase.from('skills').select('id,name,skill_type_id').eq('is_active', true).order('name'),
      supabase.from('skill_types').select('id,name').order('name'),
      supabase.from('departments').select('id,name').order('name'),
      supabase.from('employee_skills').select('employee_id,skill_id,proficiency'),
    ])
    if (!emps) { toast.error('Failed to load matrix data'); setLoading(false); return }
    setEmployees(emps || []); setSkills(sk || []); setSkillTypes(st || [])
    setDepartments(depts || []); setEmpSkills(empSk || []); setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Build lookup: { employee_id: { skill_id: proficiency } }
  const matrix = empSkills.reduce((acc, r) => {
    if (!acc[r.employee_id]) acc[r.employee_id] = {}
    if (r.skill_id) acc[r.employee_id][r.skill_id] = r.proficiency
    return acc
  }, {})

  const filteredEmps = employees.filter(e => !filterDept || e.department_id === filterDept)
  const filteredSkills = skills.filter(s => !filterType || s.skill_type_id === filterType)

  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]))
  const typeMap = Object.fromEntries(skillTypes.map(t => [t.id, t.name]))

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-dim)' }}>Loading matrix…</div>

  return (
    <div>
      <PageHeader title="Skill Matrix" subtitle="Cross-employee competency overview — B=Beginner I=Intermediate A=Advanced E=Expert" />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input" style={{ minWidth: 200 }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input" style={{ minWidth: 180 }}>
          <option value="">All Skill Types</option>
          {skillTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
          {Object.entries(PROF_ABBR).map(([prof, abbr]) => (
            <span key={prof} style={{ padding: '2px 8px', borderRadius: 4, background: PROF_BG[prof], color: PROF_FG[prof], fontWeight: 700 }}>{abbr} = {prof}</span>
          ))}
        </div>
      </div>

      {filteredEmps.length === 0 || filteredSkills.length === 0 ? (
        <EmptyState icon="grid_on" message="No data to display — add employees and skills first" />
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 14px', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', minWidth: 180 }}>Employee</th>
                {filteredSkills.map(s => (
                  <th key={s.id} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 8px', fontSize: 11, fontWeight: 600, textAlign: 'center', minWidth: 80, maxWidth: 100, overflow: 'hidden' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }} title={s.name}>{s.name}</div>
                    {s.skill_type_id && <div style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 400 }}>{typeMap[s.skill_type_id]}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmps.map((emp, ri) => (
                <tr key={emp.id} style={{ background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', border: '1px solid var(--border)', padding: '6px 14px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                    <div>{emp.name}</div>
                    {emp.department_id && <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>{deptMap[emp.department_id]}</div>}
                  </td>
                  {filteredSkills.map(s => {
                    const prof = matrix[emp.id]?.[s.id]
                    return (
                      <td key={s.id} style={{ border: '1px solid var(--border)', padding: 4, textAlign: 'center' }}>
                        {prof ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 24, borderRadius: 4, background: PROF_BG[prof], color: PROF_FG[prof], fontSize: 12, fontWeight: 800 }} title={prof}>
                            {PROF_ABBR[prof] || prof[0]}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--border)', fontSize: 14 }}>·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Employees', value: filteredEmps.length, icon: 'people' },
          { label: 'Skills tracked', value: filteredSkills.length, icon: 'star' },
          { label: 'Total records', value: empSkills.length, icon: 'grid_on' },
          { label: 'Experts', value: empSkills.filter(r => r.proficiency === 'Expert').length, icon: 'workspace_premium' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
