import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const ONBOARDING_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled']
const ACTIVITY_STATUSES   = ['Pending', 'In Progress', 'Completed']

const statusColor = s => s === 'Completed' ? 'var(--green)' : s === 'In Progress' ? 'var(--blue)' : s === 'Cancelled' ? 'var(--red)' : 'var(--yellow)'

const emptyNewForm = () => ({
  employee_id: '', template_id: '', date_of_joining: '', boarding_begins_on: '', notes: '',
})

const emptyTmplForm = () => ({
  template_title: '', department_id: '', designation_id: '', description: '', is_active: true,
})

const emptyActivityForm = () => ({
  activity: '', role: '', required: false, sort_order: 0,
})

export default function EmployeeOnboarding() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'employee-onboarding')

  const [mainTab, setMainTab] = useState('onboardings')

  const [employees,    setEmployees]    = useState([])
  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])

  const [onboardings, setOnboardings] = useState([])
  const [loadingOB,   setLoadingOB]   = useState(true)

  const [templates,     setTemplates]     = useState([])
  const [loadingTmpls,  setLoadingTmpls]  = useState(true)

  const [saving, setSaving] = useState(false)

  const [showNew,    setShowNew]    = useState(false)
  const [newForm,    setNewForm]    = useState(emptyNewForm())
  const [newActivities, setNewActivities] = useState([])

  const [detail,          setDetail]          = useState(null)
  const [detailActivities, setDetailActivities] = useState([])
  const [loadingDetail,   setLoadingDetail]   = useState(false)

  const [showTmplModal, setShowTmplModal] = useState(false)
  const [editTmpl,      setEditTmpl]      = useState(null)
  const [tmplForm,      setTmplForm]      = useState(emptyTmplForm())
  const [tmplActivities, setTmplActivities] = useState([])
  const [tmplActForm,   setTmplActForm]   = useState(emptyActivityForm())
  const [editTmplAct,   setEditTmplAct]   = useState(null)

  const [confirmDelOB,   setConfirmDelOB]   = useState(null)
  const [confirmDelTmpl, setConfirmDelTmpl] = useState(null)

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id, full_name, employee_id, status').eq('status', 'Active').order('full_name')
    setEmployees(data || [])
  }, [])

  const fetchDepts = useCallback(async () => {
    const { data } = await supabase.from('departments').select('id, name').order('name')
    setDepartments(data || [])
  }, [])

  const fetchDesignations = useCallback(async () => {
    const { data } = await supabase.from('designations').select('id, title').order('title')
    setDesignations(data || [])
  }, [])

  const fetchOnboardings = useCallback(async () => {
    setLoadingOB(true)
    const { data } = await supabase
      .from('employee_onboardings')
      .select('*, employees(full_name, employee_id), onboarding_templates(template_title)')
      .order('created_at', { ascending: false })
    setOnboardings(data || [])
    setLoadingOB(false)
  }, [])

  const fetchTemplates = useCallback(async () => {
    setLoadingTmpls(true)
    const { data } = await supabase
      .from('onboarding_templates')
      .select('*, departments(name), designations(title), onboarding_template_activities(id)')
      .order('template_title')
    setTemplates(data || [])
    setLoadingTmpls(false)
  }, [])

  useEffect(() => {
    fetchEmployees()
    fetchDepts()
    fetchDesignations()
    fetchOnboardings()
    fetchTemplates()
  }, [fetchEmployees, fetchDepts, fetchDesignations, fetchOnboardings, fetchTemplates])

  const kpi = {
    total:      onboardings.length,
    pending:    onboardings.filter(o => o.status === 'Pending').length,
    inProgress: onboardings.filter(o => o.status === 'In Progress').length,
    completed:  onboardings.filter(o => o.status === 'Completed').length,
  }

  const handleTemplateSelect = async (templateId) => {
    setNewForm(f => ({ ...f, template_id: templateId }))
    if (!templateId) { setNewActivities([]); return }
    const { data } = await supabase
      .from('onboarding_template_activities')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order')
    setNewActivities((data || []).map(a => ({
      id: crypto.randomUUID(),
      activity: a.activity,
      assigned_to: '',
      status: 'Pending',
      completion_date: '',
      notes: '',
      sort_order: a.sort_order,
    })))
  }

  const handleCreateOnboarding = async () => {
    if (!newForm.employee_id) { toast.error('Employee is required'); return }
    if (!newForm.date_of_joining) { toast.error('Date of Joining is required'); return }
    setSaving(true)
    try {
      const suffix = String(Date.now()).slice(-6)
      const onboardingId = crypto.randomUUID()
      await supabase.from('employee_onboardings').insert([{
        id: onboardingId,
        onboarding_number: `ON-${suffix}`,
        employee_id: newForm.employee_id,
        template_id: newForm.template_id || null,
        date_of_joining: newForm.date_of_joining,
        boarding_begins_on: newForm.boarding_begins_on || null,
        status: 'Pending',
        progress: 0,
        notes: newForm.notes,
        created_by: user?.full_name || '',
      }])
      if (newActivities.length > 0) {
        await supabase.from('onboarding_activities').insert(
          newActivities.map((a, i) => ({
            id: a.id,
            onboarding_id: onboardingId,
            activity: a.activity,
            assigned_to: a.assigned_to,
            status: 'Pending',
            completion_date: null,
            notes: '',
            sort_order: a.sort_order ?? i,
          }))
        )
      }
      toast.success('Onboarding created')
      setShowNew(false)
      setNewForm(emptyNewForm())
      setNewActivities([])
      fetchOnboardings()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const openDetail = async (ob) => {
    setDetail(ob)
    setLoadingDetail(true)
    const { data } = await supabase
      .from('onboarding_activities')
      .select('*')
      .eq('onboarding_id', ob.id)
      .order('sort_order')
    setDetailActivities(data || [])
    setLoadingDetail(false)
  }

  const handleActivityStatus = async (actId, newStatus) => {
    const completionDate = newStatus === 'Completed' ? new Date().toISOString().split('T')[0] : null
    await supabase.from('onboarding_activities').update({ status: newStatus, completion_date: completionDate }).eq('id', actId)
    const updated = detailActivities.map(a => a.id === actId ? { ...a, status: newStatus, completion_date: completionDate } : a)
    setDetailActivities(updated)
    const total = updated.length
    const done  = updated.filter(a => a.status === 'Completed').length
    const progress = total > 0 ? Math.round((done / total) * 100) : 0
    const obStatus = progress === 100 ? 'Completed' : done > 0 ? 'In Progress' : 'Pending'
    await supabase.from('employee_onboardings').update({ progress, status: obStatus }).eq('id', detail.id)
    setDetail(d => ({ ...d, progress, status: obStatus }))
    fetchOnboardings()
  }

  const handleSaveDetailNotes = async (notes) => {
    await supabase.from('employee_onboardings').update({ notes }).eq('id', detail.id)
    setDetail(d => ({ ...d, notes }))
    toast.success('Notes saved')
    fetchOnboardings()
  }

  const handleDeleteOnboarding = async () => {
    await supabase.from('onboarding_activities').delete().eq('onboarding_id', confirmDelOB.id)
    await supabase.from('employee_onboardings').delete().eq('id', confirmDelOB.id)
    toast.success('Onboarding deleted')
    setConfirmDelOB(null)
    fetchOnboardings()
  }

  const openTmplModal = async (tmpl) => {
    setEditTmpl(tmpl || null)
    setTmplForm(tmpl ? {
      template_title: tmpl.template_title,
      department_id: tmpl.department_id || '',
      designation_id: tmpl.designation_id || '',
      description: tmpl.description || '',
      is_active: tmpl.is_active,
    } : emptyTmplForm())
    setTmplActForm(emptyActivityForm())
    setEditTmplAct(null)
    if (tmpl) {
      const { data } = await supabase
        .from('onboarding_template_activities')
        .select('*')
        .eq('template_id', tmpl.id)
        .order('sort_order')
      setTmplActivities(data || [])
    } else {
      setTmplActivities([])
    }
    setShowTmplModal(true)
  }

  const handleSaveTmpl = async () => {
    if (!tmplForm.template_title.trim()) { toast.error('Template title is required'); return }
    setSaving(true)
    try {
      const payload = {
        template_title: tmplForm.template_title,
        department_id: tmplForm.department_id || null,
        designation_id: tmplForm.designation_id || null,
        description: tmplForm.description,
        is_active: tmplForm.is_active,
      }
      if (editTmpl) {
        await supabase.from('onboarding_templates').update(payload).eq('id', editTmpl.id)
        toast.success('Template updated')
      } else {
        const newId = crypto.randomUUID()
        await supabase.from('onboarding_templates').insert([{
          id: newId, ...payload, created_by: user?.full_name || '',
        }])
        toast.success('Template created')
      }
      setShowTmplModal(false)
      fetchTemplates()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSaveTmplAct = async () => {
    if (!tmplActForm.activity.trim()) { toast.error('Activity name is required'); return }
    if (!editTmpl) { toast.error('Save the template first'); return }
    const payload = {
      activity: tmplActForm.activity,
      role: tmplActForm.role,
      required: tmplActForm.required,
      sort_order: parseInt(tmplActForm.sort_order) || 0,
    }
    if (editTmplAct) {
      await supabase.from('onboarding_template_activities').update(payload).eq('id', editTmplAct.id)
    } else {
      await supabase.from('onboarding_template_activities').insert([{
        id: crypto.randomUUID(), template_id: editTmpl.id, ...payload,
      }])
    }
    setEditTmplAct(null)
    setTmplActForm(emptyActivityForm())
    const { data } = await supabase
      .from('onboarding_template_activities').select('*').eq('template_id', editTmpl.id).order('sort_order')
    setTmplActivities(data || [])
    fetchTemplates()
  }

  const handleDeleteTmplAct = async (actId) => {
    await supabase.from('onboarding_template_activities').delete().eq('id', actId)
    setTmplActivities(prev => prev.filter(a => a.id !== actId))
    fetchTemplates()
  }

  const handleDeleteTmpl = async () => {
    await supabase.from('onboarding_template_activities').delete().eq('template_id', confirmDelTmpl.id)
    await supabase.from('onboarding_templates').delete().eq('id', confirmDelTmpl.id)
    toast.success('Template deleted')
    setConfirmDelTmpl(null)
    fetchTemplates()
  }

  const MAIN_TABS = [
    { id: 'onboardings', label: 'Onboardings' },
    { id: 'templates',   label: 'Templates' },
  ]

  return (
    <div>
      <PageHeader title="Employee Onboarding">
        {canEdit && mainTab === 'onboardings' && (
          <button className="btn btn-primary btn-sm" onClick={() => { setNewForm(emptyNewForm()); setNewActivities([]); setShowNew(true) }}>
            <span className="material-icons">add</span> New Onboarding
          </button>
        )}
        {canEdit && mainTab === 'templates' && (
          <button className="btn btn-primary btn-sm" onClick={() => openTmplModal(null)}>
            <span className="material-icons">add</span> New Template
          </button>
        )}
      </PageHeader>

      <TabNav tabs={MAIN_TABS} active={mainTab} onChange={setMainTab} />

      {mainTab === 'onboardings' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <KPICard label="Total"       value={kpi.total}      icon="group"            />
            <KPICard label="Pending"     value={kpi.pending}    icon="schedule"   color="yellow" />
            <KPICard label="In Progress" value={kpi.inProgress} icon="autorenew"  color="blue"   />
            <KPICard label="Completed"   value={kpi.completed}  icon="check_circle" color="green" />
          </div>

          {loadingOB ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : onboardings.length === 0 ? (
            <EmptyState icon="waving_hand" message="No onboardings yet." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>Date of Joining</th>
                    <th>Template</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {onboardings.map(ob => (
                    <tr key={ob.id}>
                      <td style={{ fontWeight: 600, color: 'var(--gold)', cursor: 'pointer' }} onClick={() => openDetail(ob)}>{ob.onboarding_number}</td>
                      <td>{ob.employees?.full_name || '—'}</td>
                      <td>{ob.date_of_joining || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{ob.onboarding_templates?.template_title || '—'}</td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${ob.progress || 0}%`, height: '100%', background: 'var(--green)', borderRadius: 3, transition: 'width .3s' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', minWidth: 30 }}>{ob.progress || 0}%</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${statusColor(ob.status)}18`, color: statusColor(ob.status), border: `1px solid ${statusColor(ob.status)}44` }}>
                          {ob.status}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-xs btn-secondary" onClick={() => openDetail(ob)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>visibility</span>
                        </button>
                        {canEdit && (
                          <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelOB(ob)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mainTab === 'templates' && (
        <div style={{ marginTop: 16 }}>
          {loadingTmpls ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : templates.length === 0 ? (
            <EmptyState icon="description" message="No onboarding templates yet." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Department</th>
                    <th>Designation</th>
                    <th>Activities</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--gold)' }} onClick={() => openTmplModal(t)}>{t.template_title}</td>
                      <td style={{ fontSize: 12 }}>{t.departments?.name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{t.designations?.title || '—'}</td>
                      <td>{t.onboarding_template_activities?.length || 0}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: t.is_active ? 'var(--green)18' : 'var(--text-dim)18', color: t.is_active ? 'var(--green)' : 'var(--text-dim)', border: `1px solid ${t.is_active ? 'var(--green)' : 'var(--text-dim)'}44` }}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-xs btn-secondary" onClick={() => openTmplModal(t)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                        {canEdit && (
                          <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelTmpl(t)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ModalDialog open={showNew} onClose={() => setShowNew(false)} title="New Onboarding" size="lg">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={newForm.employee_id} onChange={e => setNewForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Date of Joining *</label>
              <input type="date" className="form-control" value={newForm.date_of_joining} onChange={e => setNewForm(f => ({ ...f, date_of_joining: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Boarding Begins On</label>
              <input type="date" className="form-control" value={newForm.boarding_begins_on} onChange={e => setNewForm(f => ({ ...f, boarding_begins_on: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Template</label>
            <select className="form-control" value={newForm.template_id} onChange={e => handleTemplateSelect(e.target.value)}>
              <option value="">— No template —</option>
              {templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.template_title}</option>)}
            </select>
          </div>
          {newActivities.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>Activities from template ({newActivities.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {newActivities.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, flex: 1 }}>{a.activity}</span>
                    <input
                      className="form-control"
                      style={{ width: 160, fontSize: 12, padding: '2px 6px' }}
                      placeholder="Assigned to"
                      value={a.assigned_to}
                      onChange={e => setNewActivities(prev => prev.map((x, idx) => idx === i ? { ...x, assigned_to: e.target.value } : x))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreateOnboarding} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      {detail && (
        <ModalDialog open={!!detail} onClose={() => setDetail(null)} title={`${detail.onboarding_number} · ${detail.employees?.full_name || ''}`} size="lg">
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-dim)' }}>Date of Joining:</span> <strong>{detail.date_of_joining || '—'}</strong></div>
              <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-dim)' }}>Boarding Begins:</span> <strong>{detail.boarding_begins_on || '—'}</strong></div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)' }}>Status:</span>{' '}
                <span style={{ fontWeight: 700, color: statusColor(detail.status) }}>{detail.status}</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Progress</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{detail.progress || 0}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${detail.progress || 0}%`, height: '100%', background: 'var(--green)', borderRadius: 4, transition: 'width .3s' }} />
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Activities</div>
            {loadingDetail ? <Spinner /> : detailActivities.length === 0 ? (
              <EmptyState icon="checklist" message="No activities for this onboarding." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {detailActivities.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{a.activity}</span>
                    {a.assigned_to && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.assigned_to}</span>}
                    {canEdit && (
                      <select
                        className="form-control"
                        style={{ width: 130, fontSize: 12, padding: '2px 6px' }}
                        value={a.status}
                        onChange={e => handleActivityStatus(a.id, e.target.value)}
                      >
                        {ACTIVITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {!canEdit && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(a.status) }}>{a.status}</span>
                    )}
                    {a.completion_date && <span style={{ fontSize: 11, color: 'var(--green)' }}>{a.completion_date}</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="form-group">
              <label style={{ fontSize: 12 }}>Notes</label>
              <textarea
                className="form-control"
                rows={2}
                defaultValue={detail.notes || ''}
                onBlur={e => { if (e.target.value !== detail.notes) handleSaveDetailNotes(e.target.value) }}
              />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}

      <ModalDialog open={showTmplModal} onClose={() => setShowTmplModal(false)} title={editTmpl ? `Edit: ${editTmpl.template_title}` : 'New Onboarding Template'} size="lg">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Template Title *</label>
            <input className="form-control" value={tmplForm.template_title} onChange={e => setTmplForm(f => ({ ...f, template_title: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Department</label>
              <select className="form-control" value={tmplForm.department_id} onChange={e => setTmplForm(f => ({ ...f, department_id: e.target.value }))}>
                <option value="">— Any —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Designation</label>
              <select className="form-control" value={tmplForm.designation_id} onChange={e => setTmplForm(f => ({ ...f, designation_id: e.target.value }))}>
                <option value="">— Any —</option>
                {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={tmplForm.description} onChange={e => setTmplForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="ob_tmpl_active" checked={tmplForm.is_active} onChange={e => setTmplForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="ob_tmpl_active" style={{ margin: 0 }}>Active</label>
          </div>

          {editTmpl && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Activities</span>
                {!editTmplAct && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setEditTmplAct({}); setTmplActForm(emptyActivityForm()) }}>
                    <span className="material-icons">add</span> Add Activity
                  </button>
                )}
              </div>

              {editTmplAct !== null && (
                <div style={{ padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 8, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>Activity *</label>
                    <input className="form-control" value={tmplActForm.activity} onChange={e => setTmplActForm(f => ({ ...f, activity: e.target.value }))} placeholder="Activity name" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
                    <label style={{ fontSize: 11 }}>Role</label>
                    <input className="form-control" value={tmplActForm.role} onChange={e => setTmplActForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. HR, IT" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 70 }}>
                    <label style={{ fontSize: 11 }}>Order</label>
                    <input type="number" className="form-control" min="0" value={tmplActForm.sort_order} onChange={e => setTmplActForm(f => ({ ...f, sort_order: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 2 }}>
                    <input type="checkbox" id="act_req" checked={tmplActForm.required} onChange={e => setTmplActForm(f => ({ ...f, required: e.target.checked }))} />
                    <label htmlFor="act_req" style={{ margin: 0, fontSize: 12 }}>Required</label>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveTmplAct}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditTmplAct(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {tmplActivities.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '12px 0' }}>No activities yet.</div>
              ) : (
                <table className="stock-table">
                  <thead><tr><th>Order</th><th>Activity</th><th>Role</th><th>Required</th><th>Actions</th></tr></thead>
                  <tbody>
                    {tmplActivities.sort((a, b) => a.sort_order - b.sort_order).map(a => (
                      <tr key={a.id}>
                        <td style={{ color: 'var(--text-dim)', width: 48 }}>{a.sort_order}</td>
                        <td style={{ fontWeight: 600 }}>{a.activity}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.role || '—'}</td>
                        <td>
                          {a.required ? <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>Yes</span> : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No</span>}
                        </td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => { setEditTmplAct(a); setTmplActForm({ activity: a.activity, role: a.role || '', required: a.required, sort_order: a.sort_order }) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-xs btn-danger" onClick={() => handleDeleteTmplAct(a.id)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowTmplModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveTmpl} disabled={saving}>{saving ? 'Saving…' : editTmpl ? 'Save Changes' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirmDelOB} onClose={() => setConfirmDelOB(null)} onConfirm={handleDeleteOnboarding}
        title="Delete Onboarding" message={`Delete onboarding ${confirmDelOB?.onboarding_number}?`} confirmLabel="Delete" danger />
      <ConfirmDialog open={!!confirmDelTmpl} onClose={() => setConfirmDelTmpl(null)} onConfirm={handleDeleteTmpl}
        title="Delete Template" message={`Delete "${confirmDelTmpl?.template_title}"?`} confirmLabel="Delete" danger />
    </div>
  )
}
