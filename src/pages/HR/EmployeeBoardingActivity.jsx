import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, Spinner, ModalDialog, ModalActions, ConfirmDialog } from '../../components/ui'

const ONBOARDING_TEMPLATE = [
  { activity: 'Create system account & email',       category: 'IT',      sort_order: 1 },
  { activity: 'Issue access card / biometric enrol', category: 'Security', sort_order: 2 },
  { activity: 'Complete HR documentation',            category: 'HR',      sort_order: 3 },
  { activity: 'Payroll & bank details setup',         category: 'Finance', sort_order: 4 },
  { activity: 'NSSA registration',                    category: 'Finance', sort_order: 5 },
  { activity: 'Equipment handover (laptop/tools)',    category: 'IT',      sort_order: 6 },
  { activity: 'Orientation & induction session',      category: 'HR',      sort_order: 7 },
  { activity: 'Introduce to team & assign buddy',     category: 'HR',      sort_order: 8 },
  { activity: 'Review job description & KPIs',        category: 'HR',      sort_order: 9 },
  { activity: 'Sign employment contract',             category: 'Legal',   sort_order: 10 },
]

const OFFBOARDING_TEMPLATE = [
  { activity: 'Accept resignation / termination letter', category: 'HR',      sort_order: 1 },
  { activity: 'Revoke system access & email',           category: 'IT',      sort_order: 2 },
  { activity: 'Collect access card / biometric removal', category: 'Security', sort_order: 3 },
  { activity: 'Equipment return (laptop/tools)',         category: 'IT',      sort_order: 4 },
  { activity: 'Knowledge transfer & handover notes',    category: 'HR',      sort_order: 5 },
  { activity: 'Clearance form signed',                  category: 'Finance', sort_order: 6 },
  { activity: 'Final payslip & FNF settlement',         category: 'Finance', sort_order: 7 },
  { activity: 'Exit interview conducted',               category: 'HR',      sort_order: 8 },
  { activity: 'Reference letter issued',                category: 'HR',      sort_order: 9 },
  { activity: 'NSSA cessation notification',            category: 'Finance', sort_order: 10 },
]

const STATUS_COLOR = {
  'Pending':     'var(--yellow)',
  'In Progress': 'var(--blue)',
  'Completed':   'var(--green)',
  'Skipped':     'var(--text-dim)',
}

const CATEGORY_COLORS = {
  'IT': 'var(--teal)', 'HR': 'var(--blue)', 'Finance': 'var(--green)',
  'Security': 'var(--red)', 'Legal': 'var(--purple)',
}

const BLANK = { activity: '', category: '', activity_type: 'onboarding', assigned_to: '', due_date: '', notes: '', sort_order: 0 }

function isOverdue(due) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toISOString().split('T')[0])
}
function isDueSoon(due) {
  if (!due) return false
  const d = new Date(due); const now = new Date()
  const diff = (d - now) / 86400000
  return diff >= 0 && diff <= 3
}

export default function EmployeeBoardingActivity() {
  const { employees } = useHR()
  const [activities,   setActivities]   = useState([])
  const [loading,      setLoading]      = useState(false)
  const [selectedEmp,  setSelectedEmp]  = useState('')
  const [boardingType, setBoardingType] = useState('onboarding')
  const [modal,        setModal]        = useState(null)
  const [confirm,      setConfirm]      = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [form,         setForm]         = useState(BLANK)
  const [showTemplate, setShowTemplate] = useState(false)
  const [applying,     setApplying]     = useState(false)

  const activeEmps = employees.filter(e => e.status === 'Active')

  const fetchActivities = useCallback(async () => {
    if (!selectedEmp) { setActivities([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_boarding_activities')
      .select('*')
      .eq('employee_id', selectedEmp)
      .eq('activity_type', boardingType)
      .order('sort_order')
      .order('created_at')
    if (error) toast.error(error.message)
    else setActivities(data || [])
    setLoading(false)
  }, [selectedEmp, boardingType])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  const openAdd = () => {
    setForm({ ...BLANK, activity_type: boardingType })
    setModal({ mode: 'add' })
  }

  const openEdit = (act) => {
    setForm({
      activity:      act.activity     || '',
      category:      act.category     || '',
      activity_type: act.activity_type || boardingType,
      assigned_to:   act.assigned_to  || '',
      due_date:      act.due_date     || '',
      notes:         act.notes        || '',
      sort_order:    act.sort_order   || 0,
    })
    setModal({ mode: 'edit', id: act.id })
  }

  const save = async () => {
    if (!form.activity.trim()) return toast.error('Activity is required')
    if (!selectedEmp) return toast.error('Select an employee first')
    setSaving(true)
    try {
      if (modal.mode === 'edit') {
        const { error } = await supabase.from('employee_boarding_activities').update({ ...form }).eq('id', modal.id)
        if (error) throw error
        toast.success('Updated')
      } else {
        const { error } = await supabase.from('employee_boarding_activities').insert([{
          id: crypto.randomUUID(), employee_id: selectedEmp, ...form,
        }])
        if (error) throw error
        toast.success('Activity added')
      }
      setModal(null)
      fetchActivities()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    const patch = { status }
    if (status === 'Completed') patch.completed_date = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('employee_boarding_activities').update(patch).eq('id', id)
    if (error) toast.error(error.message)
    else fetchActivities()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('employee_boarding_activities').delete().eq('id', confirm.id)
    if (error) toast.error(error.message)
    else { toast.success('Deleted'); fetchActivities() }
    setConfirm(null)
  }

  const applyTemplate = async (type) => {
    if (!selectedEmp) return toast.error('Select an employee first')
    setApplying(true)
    const template = type === 'onboarding' ? ONBOARDING_TEMPLATE : OFFBOARDING_TEMPLATE
    try {
      const rows = template.map(t => ({
        id: crypto.randomUUID(), employee_id: selectedEmp,
        activity_type: type, activity: t.activity, category: t.category,
        sort_order: t.sort_order, status: 'Pending',
      }))
      const { error } = await supabase.from('employee_boarding_activities').insert(rows)
      if (error) throw error
      toast.success(`${template.length} activities added from template`)
      setShowTemplate(false)
      fetchActivities()
    } catch (err) { toast.error(err.message) }
    finally { setApplying(false) }
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  // Group by status
  const grouped = {
    'Pending':     activities.filter(a => a.status === 'Pending'),
    'In Progress': activities.filter(a => a.status === 'In Progress'),
    'Completed':   activities.filter(a => a.status === 'Completed'),
    'Skipped':     activities.filter(a => a.status === 'Skipped'),
  }
  const doneCount  = activities.filter(a => a.status === 'Completed').length
  const totalCount = activities.length
  const pct        = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div>
      <PageHeader title="Employee Boarding Activities"
        subtitle="Manage onboarding and offboarding checklists per employee">
        {selectedEmp && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowTemplate(true)}>
              <span className="material-icons">auto_fix_high</span> Apply Template
            </button>
            <button className="btn btn-primary" onClick={openAdd}>
              <span className="material-icons">add</span> Add Activity
            </button>
          </div>
        )}
      </PageHeader>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-control" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">Select Employee…</option>
          {activeEmps.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {['onboarding','offboarding'].map(t => (
            <button key={t} onClick={() => setBoardingType(t)} style={{
              padding: '7px 16px', fontSize: 13, fontWeight: boardingType === t ? 700 : 400,
              background: boardingType === t ? 'var(--gold)' : 'transparent',
              color: boardingType === t ? '#0b0f1a' : 'var(--text)',
              border: 'none', cursor: 'pointer', textTransform: 'capitalize', transition: 'all .15s',
            }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>
                {t === 'onboarding' ? 'login' : 'logout'}
              </span>{t}
            </button>
          ))}
        </div>
      </div>

      {!selectedEmp
        ? <EmptyState icon="assignment" message="Select an employee to view their boarding activities" />
        : loading
          ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          : (
            <>
              {/* Progress bar */}
              {totalCount > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', minWidth: 120 }}>
                    {doneCount} of {totalCount} completed
                  </div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green)' : 'var(--gold)', borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: pct === 100 ? 'var(--green)' : 'var(--gold)', minWidth: 48 }}>{pct}%</div>
                </div>
              )}

              {totalCount === 0
                ? <EmptyState icon={boardingType === 'onboarding' ? 'login' : 'logout'}
                    message={`No ${boardingType} activities yet`}
                    action={{ label: 'Apply Template', onClick: () => setShowTemplate(true) }} />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {Object.entries(grouped).map(([status, items]) => {
                      if (items.length === 0) return null
                      const sc = STATUS_COLOR[status]
                      return (
                        <div key={status}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: 1 }}>{status}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({items.length})</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {items.map(act => {
                              const cc     = CATEGORY_COLORS[act.category] || 'var(--text-dim)'
                              const over   = isOverdue(act.due_date) && status !== 'Completed'
                              const soon   = isDueSoon(act.due_date) && status !== 'Completed'
                              return (
                                <div key={act.id} style={{ background: 'var(--surface)', border: `1px solid ${over ? 'var(--red)' : 'var(--border)'}`, borderRadius: 10, padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{act.activity}</div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(act)} style={{ padding: '2px 6px' }}>
                                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                      </button>
                                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: act.id, name: act.activity })} style={{ padding: '2px 6px' }}>
                                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                                    {act.category && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8, background: `${cc}22`, color: cc, border: `1px solid ${cc}44` }}>
                                        {act.category}
                                      </span>
                                    )}
                                    {act.assigned_to && (
                                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>→ {act.assigned_to}</span>
                                    )}
                                    {act.due_date && (
                                      <span style={{ fontSize: 11, fontWeight: 600, color: over ? 'var(--red)' : soon ? 'var(--yellow)' : 'var(--text-dim)' }}>
                                        {over ? '⚠ ' : soon ? '⏰ ' : ''}{act.due_date}
                                      </span>
                                    )}
                                  </div>
                                  {act.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{act.notes}</div>}
                                  <select value={act.status} onChange={e => updateStatus(act.id, e.target.value)}
                                    style={{ width: '100%', padding: '5px 8px', fontSize: 12, background: `${sc}18`, border: `1px solid ${sc}44`, borderRadius: 6, color: sc, fontWeight: 600, cursor: 'pointer' }}>
                                    <option>Pending</option>
                                    <option>In Progress</option>
                                    <option>Completed</option>
                                    <option>Skipped</option>
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </>
          )
      }

      {/* Add/Edit modal */}
      <ModalDialog open={modal !== null} onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? 'Edit Activity' : 'Add Activity'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Activity *</label>
            <input className="form-control" value={form.activity} onChange={f('activity')} placeholder="e.g. Create system account" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Category</label>
              <input className="form-control" value={form.category} onChange={f('category')} placeholder="IT, HR, Finance…" />
            </div>
            <div className="form-group">
              <label>Activity Type</label>
              <select className="form-control" value={form.activity_type} onChange={f('activity_type')}>
                <option value="onboarding">Onboarding</option>
                <option value="offboarding">Offboarding</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Assigned To</label>
              <input className="form-control" value={form.assigned_to} onChange={f('assigned_to')} placeholder="Person responsible" />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input type="date" className="form-control" value={form.due_date} onChange={f('due_date')} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={f('notes')} />
          </div>
          <div className="form-group">
            <label>Sort Order</label>
            <input type="number" min={0} className="form-control" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} style={{ width: 100 }} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (modal?.mode === 'edit' ? 'Save Changes' : 'Add Activity')}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Template picker */}
      <ModalDialog open={showTemplate} onClose={() => setShowTemplate(false)} title="Apply Template" size="md">
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
          This will add all template activities to the selected employee. Existing activities are not affected.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { type: 'onboarding',  label: 'New Employee Onboarding', icon: 'login',  desc: `${ONBOARDING_TEMPLATE.length} activities — IT, HR, Finance, Legal setup`, color: 'var(--green)' },
            { type: 'offboarding', label: 'Employee Offboarding',     icon: 'logout', desc: `${OFFBOARDING_TEMPLATE.length} activities — Access, Equipment, FNF, Exit`, color: 'var(--red)'   },
          ].map(tmpl => (
            <div key={tmpl.type} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, cursor: 'pointer' }}
              onClick={() => !applying && applyTemplate(tmpl.type)}
              onMouseEnter={e => e.currentTarget.style.borderColor = tmpl.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `${tmpl.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-icons" style={{ fontSize: 22, color: tmpl.color }}>{tmpl.icon}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{tmpl.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{tmpl.desc}</div>
                </div>
                {applying && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>Applying…</span>}
              </div>
            </div>
          ))}
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowTemplate(false)}>Close</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Activity"
        message={`Delete "${confirm?.name}"?`}
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
