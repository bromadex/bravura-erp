import { useState, useMemo } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions, ConfirmDialog } from '../../components/ui'

const DEPT_COLORS = [
  '#f87171','#fb923c','#fbbf24','#34d399','#60a5fa',
  '#a78bfa','#f472b6','#06b6d4','#10b981','#64748b',
]

export default function Departments() {
  const { departments, employees, designations, addDepartment, updateDepartment, deleteDepartment, loading, fetchAll } = useHR()
  const canEdit   = useCanEdit('hr', 'departments')
  const canDelete = useCanDelete('hr', 'departments')

  const [modal,     setModal]     = useState(null)  // null | { mode: 'form'|'view', data }
  const [confirm,   setConfirm]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')
  const [form,      setForm]      = useState({
    name: '', description: '', location: '', hod_id: '',
    parent_id: '', color: '#60a5fa', cost_center: '', budget: '',
  })

  const openAdd = () => {
    setForm({ name: '', description: '', location: '', hod_id: '', parent_id: '', color: '#60a5fa', cost_center: '', budget: '' })
    setModal({ mode: 'form', data: null })
  }

  const openEdit = (dept, e) => {
    e?.stopPropagation()
    setForm({
      name:        dept.name        || '',
      description: dept.description || '',
      location:    dept.location    || '',
      hod_id:      dept.hod_id      || '',
      parent_id:   dept.parent_id   || '',
      color:       dept.color       || '#60a5fa',
      cost_center: dept.cost_center || '',
      budget:      dept.budget      || '',
    })
    setModal({ mode: 'form', data: dept })
  }

  const openView = (dept) => setModal({ mode: 'view', data: dept })

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Department name required')
    setSaving(true)
    try {
      const payload = { ...form, budget: form.budget ? parseFloat(form.budget) : null }
      if (modal.data?.id) {
        await updateDepartment(modal.data.id, payload)
        toast.success('Department updated')
      } else {
        await addDepartment(payload)
        toast.success('Department added')
      }
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await deleteDepartment(confirm.id)
      toast.success('Deleted')
      setConfirm(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const getEmployeesInDept  = (id) => employees.filter(e => e.department_id === id)
  const getActiveCount      = (id) => employees.filter(e => e.department_id === id && e.status === 'Active').length
  const getSubDepts         = (id) => departments.filter(d => d.parent_id === id)
  const getEmployeeName     = (id) => employees.find(e => e.id === id)?.name || '—'
  const getDepartmentName   = (id) => departments.find(d => d.id === id)?.name || 'None'
  const getDesignationTitle = (id) => designations.find(d => d.id === id)?.title || '—'

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return departments.filter(d =>
      !q || d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) || d.location?.toLowerCase().includes(q)
    )
  }, [departments, search])

  // Top-level KPIs
  const totalActive = employees.filter(e => e.status === 'Active').length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div>
      <PageHeader title="Departments" subtitle={`${departments.length} departments · ${totalActive} active employees`}>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Department
          </button>
        )}
      </PageHeader>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Departments', value: departments.length,                                 color: 'var(--blue)'   },
          { label: 'Total Employees',   value: employees.length,                                   color: 'var(--green)'  },
          { label: 'Active Employees',  value: totalActive,                                         color: 'var(--teal)'   },
          { label: 'No Assignment',     value: employees.filter(e => !e.department_id).length,     color: 'var(--yellow)' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, fontFamily: 'var(--mono)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input className="form-control" placeholder="Search departments…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {filtered.length === 0
        ? <EmptyState icon="business" message="No departments found" action={!search ? { label: 'Add Department', onClick: openAdd } : undefined} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(dept => {
              const empList   = getEmployeesInDept(dept.id)
              const active    = getActiveCount(dept.id)
              const subDepts  = getSubDepts(dept.id)
              const color     = dept.color || '#60a5fa'
              const hodName   = getEmployeeName(dept.hod_id)
              return (
                <div key={dept.id}
                  onClick={() => openView(dept)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                    overflow: 'hidden', cursor: 'pointer', transition: 'all .2s',
                  }}
                >
                  <div style={{ height: 5, background: color }} />
                  <div style={{ padding: '16px 16px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{dept.name}</div>
                        {dept.parent_id && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>↳ {getDepartmentName(dept.parent_id)}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: 'var(--mono)', lineHeight: 1 }}>{empList.length}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>employees</div>
                      </div>
                    </div>

                    {dept.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {dept.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {dept.hod_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="material-icons" style={{ fontSize: 14, color }}>person</span>
                          <span style={{ color: 'var(--text-dim)' }}>HOD:</span>
                          <span style={{ fontWeight: 600 }}>{hodName}</span>
                        </div>
                      )}
                      {dept.location && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>place</span>
                          <span style={{ color: 'var(--text-dim)' }}>{dept.location}</span>
                        </div>
                      )}
                      {dept.cost_center && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>account_balance</span>
                          <span style={{ color: 'var(--text-dim)' }}>{dept.cost_center}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      {active > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--green)22', color: 'var(--green)', border: '1px solid var(--green)44' }}>
                          {active} active
                        </span>
                      )}
                      {empList.length - active > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'var(--yellow)22', color: 'var(--yellow)', border: '1px solid var(--yellow)44' }}>
                          {empList.length - active} other
                        </span>
                      )}
                      {subDepts.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                          {subDepts.length} sub-depts
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <button className="btn btn-secondary btn-sm" onClick={(e) => openEdit(dept, e)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setConfirm({ id: dept.id, name: dept.name }) }}>
                        <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {/* Department Detail View Modal */}
      <ModalDialog open={modal?.mode === 'view'} onClose={() => setModal(null)}
        title={modal?.data?.name || ''} size="lg">
        {modal?.data && (() => {
          const dept      = modal.data
          const empList   = getEmployeesInDept(dept.id)
          const subDepts  = getSubDepts(dept.id)
          const color     = dept.color || '#60a5fa'
          return (
            <div>
              {/* Header info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Employees', value: empList.length,                                   color },
                  { label: 'Active',          value: empList.filter(e => e.status === 'Active').length, color: 'var(--green)' },
                  { label: 'Sub-Departments', value: subDepts.length,                                   color: 'var(--teal)' },
                  { label: 'HOD',             value: getEmployeeName(dept.hod_id),                      color: 'var(--text)', small: true },
                ].map(kpi => (
                  <div key={kpi.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: kpi.small ? 14 : 22, fontWeight: 700, color: kpi.color, fontFamily: kpi.small ? 'inherit' : 'var(--mono)' }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {dept.description && (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  {dept.description}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, fontSize: 13 }}>
                {dept.location    && <div><span style={{ color: 'var(--text-dim)' }}>Location: </span>{dept.location}</div>}
                {dept.cost_center && <div><span style={{ color: 'var(--text-dim)' }}>Cost Center: </span>{dept.cost_center}</div>}
                {dept.budget      && <div><span style={{ color: 'var(--text-dim)' }}>Budget: </span><strong style={{ color: 'var(--green)' }}>${parseFloat(dept.budget).toLocaleString()}</strong></div>}
                {dept.parent_id   && <div><span style={{ color: 'var(--text-dim)' }}>Parent Dept: </span>{getDepartmentName(dept.parent_id)}</div>}
              </div>

              {/* Sub-departments */}
              {subDepts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Sub-Departments</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {subDepts.map(sd => (
                      <span key={sd.id} style={{ padding: '4px 12px', borderRadius: 20, background: `${sd.color || color}22`, color: sd.color || color, border: `1px solid ${sd.color || color}44`, fontSize: 12, fontWeight: 600 }}>
                        {sd.name} ({getEmployeesInDept(sd.id).length})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Employee list */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Employees ({empList.length})
                </div>
                {empList.length === 0
                  ? <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>No employees assigned</div>
                  : (
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface2)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>ID</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Designation</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empList.map(emp => (
                            <tr key={emp.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{emp.name}</td>
                              <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>{emp.employee_number || '—'}</td>
                              <td style={{ padding: '8px 12px', fontSize: 12 }}>{getDesignationTitle(emp.designation_id)}</td>
                              <td style={{ padding: '8px 12px' }}><StatusBadge status={emp.status || 'Active'} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </div>
            </div>
          )
        })()}
        <ModalActions>
          {canEdit && <button className="btn btn-secondary" onClick={(e) => { openEdit(modal.data, e); }}>
            <span className="material-icons" style={{ fontSize: 15 }}>edit</span> Edit Department
          </button>}
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button>
        </ModalActions>
      </ModalDialog>

      {/* Add/Edit modal */}
      <ModalDialog open={modal?.mode === 'form'} onClose={() => setModal(null)}
        title={modal?.data?.id ? `Edit — ${modal.data.name}` : 'Add Department'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Department Name *</label>
            <input className="form-control" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Engineering" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Location / Site</label>
              <input className="form-control" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Head Office" />
            </div>
            <div className="form-group">
              <label>Cost Center Code</label>
              <input className="form-control" value={form.cost_center} onChange={e => setForm(p => ({ ...p, cost_center: e.target.value }))} placeholder="e.g. CC-001" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Head of Department</label>
              <select className="form-control" value={form.hod_id} onChange={e => setForm(p => ({ ...p, hod_id: e.target.value }))}>
                <option value="">Select HOD</option>
                {employees.filter(e => e.status === 'Active').map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Annual Budget ($)</label>
              <input type="number" min={0} step={100} className="form-control" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="form-group">
            <label>Parent Department</label>
            <select className="form-control" value={form.parent_id} onChange={e => setForm(p => ({ ...p, parent_id: e.target.value }))}>
              <option value="">None (Top Level)</option>
              {departments.filter(d => d.id !== modal?.data?.id).map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Department Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--surface)' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DEPT_COLORS.map(c => (
                  <div key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '2px solid var(--text)' : '2px solid transparent' }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : (modal?.data?.id ? 'Save Changes' : 'Add Department')}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Department"
        message={`Delete "${confirm?.name}"? Employees in this department will lose their assignment.`}
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
