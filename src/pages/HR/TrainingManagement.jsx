import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard, ModalDialog, ModalActions,
  ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const today = () => new Date().toISOString().split('T')[0]
const currentYear = new Date().getFullYear()

const TABS = [
  { id: 'log',   label: 'Training Log' },
  { id: 'types', label: 'Training Types' },
]

const STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'Failed']
const CURRENCIES = ['USD', 'ZiG', 'ZWL']

const trnNumber = () => `TRN-${String(Date.now()).slice(-6)}`

const emptyLog = () => ({
  employee_id: '',
  training_type_id: '',
  training_date: today(),
  completion_date: '',
  status: 'Scheduled',
  score: '',
  certificate_no: '',
  conducted_by: '',
  notes: '',
})

const emptyType = () => ({
  type_name: '',
  description: '',
  category: '',
  duration_hours: '',
  provider: '',
  cost: '',
  currency: 'USD',
  is_active: true,
})

export default function TrainingManagement() {
  const { user }     = useAuth()
  const canEdit      = useCanEdit('hr', 'training')
  const canApprove   = useCanApprove('hr', 'training')

  const [activeTab, setActiveTab] = useState('log')

  const [employees,      setEmployees]      = useState([])
  const [trainingTypes,  setTrainingTypes]  = useState([])
  const [logs,           setLogs]           = useState([])
  const [loadingLog,     setLoadingLog]     = useState(true)
  const [loadingTypes,   setLoadingTypes]   = useState(true)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterYear,     setFilterYear]     = useState(String(currentYear))

  const [showLogForm,  setShowLogForm]  = useState(false)
  const [editLog,      setEditLog]      = useState(null)
  const [logForm,      setLogForm]      = useState(emptyLog())
  const [savingLog,    setSavingLog]    = useState(false)
  const [confirmDelLog, setConfirmDelLog] = useState(null)
  const [deletingLog,  setDeletingLog]  = useState(false)

  const [showTypeForm,  setShowTypeForm]  = useState(false)
  const [editType,      setEditType]      = useState(null)
  const [typeForm,      setTypeForm]      = useState(emptyType())
  const [savingType,    setSavingType]    = useState(false)
  const [confirmDelType, setConfirmDelType] = useState(null)
  const [deletingType,  setDeletingType]  = useState(false)

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    setEmployees(data || [])
  }, [])

  const fetchTypes = useCallback(async () => {
    setLoadingTypes(true)
    const { data, error } = await supabase
      .from('training_types')
      .select('*')
      .order('type_name')
    if (error) toast.error(error.message)
    setTrainingTypes(data || [])
    setLoadingTypes(false)
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoadingLog(true)
    let q = supabase
      .from('employee_trainings')
      .select('*')
      .order('training_date', { ascending: false })
    if (filterEmployee) q = q.eq('employee_id', filterEmployee)
    if (filterStatus)   q = q.eq('status', filterStatus)
    if (filterYear) {
      q = q.gte('training_date', `${filterYear}-01-01`)
            .lte('training_date', `${filterYear}-12-31`)
    }
    const { data, error } = await q
    if (error) toast.error(error.message)
    setLogs(data || [])
    setLoadingLog(false)
  }, [filterEmployee, filterStatus, filterYear])

  useEffect(() => {
    fetchEmployees()
    fetchTypes()
  }, [fetchEmployees, fetchTypes])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const empName   = (id) => employees.find(e => e.id === id)?.name || '—'
  const typeName  = (id) => trainingTypes.find(t => t.id === id)?.type_name || '—'
  const typeMeta  = (id) => trainingTypes.find(t => t.id === id) || null

  const kpiTotal     = logs.length
  const kpiScheduled = logs.filter(l => l.status === 'Scheduled').length
  const kpiCompleted = logs.filter(l => l.status === 'Completed').length
  const kpiFailed    = logs.filter(l => l.status === 'Failed').length

  const openNewLog = () => {
    setEditLog(null)
    setLogForm(emptyLog())
    setShowLogForm(true)
  }

  const openEditLog = (row) => {
    setEditLog(row)
    setLogForm({
      employee_id:      row.employee_id || '',
      training_type_id: row.training_type_id || '',
      training_date:    row.training_date || today(),
      completion_date:  row.completion_date || '',
      status:           row.status || 'Scheduled',
      score:            row.score ?? '',
      certificate_no:   row.certificate_no || '',
      conducted_by:     row.conducted_by || '',
      notes:            row.notes || '',
    })
    setShowLogForm(true)
  }

  const handleLogTypeChange = (typeId) => {
    setLogForm(f => ({ ...f, training_type_id: typeId }))
  }

  const handleSaveLog = async () => {
    if (!logForm.employee_id)      { toast.error('Employee is required'); return }
    if (!logForm.training_type_id) { toast.error('Training type is required'); return }
    if (!logForm.training_date)    { toast.error('Training date is required'); return }
    setSavingLog(true)
    try {
      const payload = {
        employee_id:      logForm.employee_id,
        training_type_id: logForm.training_type_id,
        training_date:    logForm.training_date,
        completion_date:  logForm.completion_date || null,
        status:           logForm.status,
        score:            logForm.score !== '' ? parseFloat(logForm.score) : null,
        certificate_no:   logForm.certificate_no || null,
        conducted_by:     logForm.conducted_by || null,
        notes:            logForm.notes || null,
        updated_at:       new Date().toISOString(),
      }
      if (editLog) {
        const { error } = await supabase.from('employee_trainings').update(payload).eq('id', editLog.id)
        if (error) throw error
        toast.success('Training record updated')
      } else {
        const { error } = await supabase.from('employee_trainings').insert([{
          id:              crypto.randomUUID(),
          training_number: trnNumber(),
          created_by:      user?.full_name || '',
          created_at:      new Date().toISOString(),
          ...payload,
        }])
        if (error) throw error
        toast.success('Training record created')
      }
      setShowLogForm(false)
      fetchLogs()
    } catch (err) { toast.error(err.message) }
    finally { setSavingLog(false) }
  }

  const handleDeleteLog = async () => {
    setDeletingLog(true)
    const { error } = await supabase.from('employee_trainings').delete().eq('id', confirmDelLog.id)
    if (error) { toast.error(error.message); setDeletingLog(false); return }
    toast.success('Training record deleted')
    setConfirmDelLog(null)
    setDeletingLog(false)
    fetchLogs()
  }

  const handleMarkComplete = async (row) => {
    const { error } = await supabase.from('employee_trainings').update({
      status:         'Completed',
      completion_date: row.completion_date || today(),
      updated_at:     new Date().toISOString(),
    }).eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Marked as completed')
    fetchLogs()
  }

  const openNewType = () => {
    setEditType(null)
    setTypeForm(emptyType())
    setShowTypeForm(true)
  }

  const openEditType = (t) => {
    setEditType(t)
    setTypeForm({
      type_name:      t.type_name || '',
      description:    t.description || '',
      category:       t.category || '',
      duration_hours: t.duration_hours ?? '',
      provider:       t.provider || '',
      cost:           t.cost ?? '',
      currency:       t.currency || 'USD',
      is_active:      t.is_active !== false,
    })
    setShowTypeForm(true)
  }

  const handleSaveType = async () => {
    if (!typeForm.type_name.trim()) { toast.error('Type name is required'); return }
    setSavingType(true)
    try {
      const payload = {
        type_name:      typeForm.type_name.trim(),
        description:    typeForm.description || null,
        category:       typeForm.category || null,
        duration_hours: typeForm.duration_hours !== '' ? parseFloat(typeForm.duration_hours) : null,
        provider:       typeForm.provider || null,
        cost:           typeForm.cost !== '' ? parseFloat(typeForm.cost) : null,
        currency:       typeForm.currency || 'USD',
        is_active:      typeForm.is_active,
      }
      if (editType) {
        const { error } = await supabase.from('training_types').update(payload).eq('id', editType.id)
        if (error) throw error
        toast.success('Training type updated')
      } else {
        const { error } = await supabase.from('training_types').insert([{
          id:         crypto.randomUUID(),
          created_by: user?.full_name || '',
          created_at: new Date().toISOString(),
          ...payload,
        }])
        if (error) throw error
        toast.success('Training type created')
      }
      setShowTypeForm(false)
      fetchTypes()
    } catch (err) { toast.error(err.message) }
    finally { setSavingType(false) }
  }

  const handleDeleteType = async () => {
    setDeletingType(true)
    const { error } = await supabase.from('training_types').delete().eq('id', confirmDelType.id)
    if (error) { toast.error(error.message); setDeletingType(false); return }
    toast.success('Training type deleted')
    setConfirmDelType(null)
    setDeletingType(false)
    fetchTypes()
  }

  const toggleTypeActive = async (t) => {
    const { error } = await supabase.from('training_types').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) { toast.error(error.message); return }
    fetchTypes()
  }

  const statusColor = (s) => {
    if (s === 'Completed')   return 'var(--green)'
    if (s === 'In Progress') return 'var(--blue)'
    if (s === 'Scheduled')   return 'var(--yellow)'
    if (s === 'Failed')      return 'var(--red)'
    if (s === 'Cancelled')   return 'var(--text-dim)'
    return 'var(--text-dim)'
  }

  const selectedTypeMeta = typeMeta(logForm.training_type_id)

  return (
    <div>
      <PageHeader title="Training Management">
        {canEdit && activeTab === 'log' && (
          <button className="btn btn-primary btn-sm" onClick={openNewLog}>
            <span className="material-icons">add</span> New Training
          </button>
        )}
        {canEdit && activeTab === 'types' && (
          <button className="btn btn-primary btn-sm" onClick={openNewType}>
            <span className="material-icons">add</span> New Type
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'log' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '16px 0' }}>
            <KPICard label="Total"     value={kpiTotal}     icon="school"        />
            <KPICard label="Scheduled" value={kpiScheduled} icon="event"         color="yellow" />
            <KPICard label="Completed" value={kpiCompleted} icon="check_circle"  color="green"  />
            <KPICard label="Failed"    value={kpiFailed}    icon="cancel"        color="red"    />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label style={{ fontSize: 12 }}>Employee</label>
              <select
                className="form-control"
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
              >
                <option value="">All Employees</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
              <label style={{ fontSize: 12 }}>Status</label>
              <select
                className="form-control"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 100 }}>
              <label style={{ fontSize: 12 }}>Year</label>
              <input
                type="number"
                className="form-control"
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                placeholder="Year"
                min="2000"
                max="2100"
              />
            </div>
          </div>

          {loadingLog ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : logs.length === 0 ? (
            <EmptyState icon="school" message="No training records found." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employee</th>
                    <th>Training Type</th>
                    <th>Date</th>
                    <th>Duration (hrs)</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(row => {
                    const meta = typeMeta(row.training_type_id)
                    const canDel = row.status === 'Scheduled' || row.status === 'Cancelled'
                    const canComplete = canApprove && (row.status === 'In Progress' || row.status === 'Scheduled')
                    return (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{row.training_number || '—'}</td>
                        <td>{empName(row.employee_id)}</td>
                        <td>{typeName(row.training_type_id)}</td>
                        <td>{row.training_date || '—'}</td>
                        <td>{meta?.duration_hours ?? '—'}</td>
                        <td>{row.score != null ? row.score : '—'}</td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: `${statusColor(row.status)}18`,
                            color: statusColor(row.status),
                            border: `1px solid ${statusColor(row.status)}44`,
                          }}>
                            {row.status}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {canEdit && (
                            <button className="btn btn-xs btn-secondary" onClick={() => openEditLog(row)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            </button>
                          )}
                          {canComplete && (
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => handleMarkComplete(row)}
                              title="Mark Complete"
                              style={{ color: 'var(--green)' }}
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>
                            </button>
                          )}
                          {canEdit && canDel && (
                            <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelLog(row)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'types' && (
        <div>
          {loadingTypes ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          ) : trainingTypes.length === 0 ? (
            <EmptyState icon="category" message="No training types defined yet." />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Duration (hrs)</th>
                    <th>Provider</th>
                    <th>Cost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingTypes.map(t => (
                    <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.55 }}>
                      <td style={{ fontWeight: 600 }}>{t.type_name}</td>
                      <td>{t.category || '—'}</td>
                      <td>{t.duration_hours ?? '—'}</td>
                      <td>{t.provider || '—'}</td>
                      <td>
                        {t.cost != null
                          ? `${t.currency || 'USD'} ${Number(t.cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: t.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                          color: t.is_active ? 'var(--green)' : 'var(--text-dim)',
                          border: `1px solid ${t.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                        }}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <>
                            <button className="btn btn-xs btn-secondary" onClick={() => openEditType(t)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            </button>
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => toggleTypeActive(t)}
                              title={t.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>
                                {t.is_active ? 'toggle_on' : 'toggle_off'}
                              </span>
                            </button>
                            <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelType(t)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </>
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

      <ModalDialog
        open={showLogForm}
        onClose={() => setShowLogForm(false)}
        title={editLog ? 'Edit Training Record' : 'New Training Record'}
        size="lg"
      >
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Employee *</label>
            <select
              className="form-control"
              value={logForm.employee_id}
              onChange={e => setLogForm(f => ({ ...f, employee_id: e.target.value }))}
            >
              <option value="">— Select Employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Training Type *</label>
            <select
              className="form-control"
              value={logForm.training_type_id}
              onChange={e => handleLogTypeChange(e.target.value)}
            >
              <option value="">— Select Type —</option>
              {trainingTypes.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.type_name}</option>
              ))}
            </select>
            {selectedTypeMeta && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 16 }}>
                {selectedTypeMeta.duration_hours != null && (
                  <span><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>schedule</span> {selectedTypeMeta.duration_hours} hrs</span>
                )}
                {selectedTypeMeta.provider && (
                  <span><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>business</span> {selectedTypeMeta.provider}</span>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Training Date *</label>
            <input
              type="date"
              className="form-control"
              value={logForm.training_date}
              onChange={e => setLogForm(f => ({ ...f, training_date: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Completion Date</label>
            <input
              type="date"
              className="form-control"
              value={logForm.completion_date}
              onChange={e => setLogForm(f => ({ ...f, completion_date: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              className="form-control"
              value={logForm.status}
              onChange={e => setLogForm(f => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Score (0–100)</label>
            <input
              type="number"
              className="form-control"
              min="0"
              max="100"
              step="0.1"
              value={logForm.score}
              onChange={e => setLogForm(f => ({ ...f, score: e.target.value }))}
              placeholder="e.g. 85"
            />
          </div>

          <div className="form-group">
            <label>Certificate No.</label>
            <input
              type="text"
              className="form-control"
              value={logForm.certificate_no}
              onChange={e => setLogForm(f => ({ ...f, certificate_no: e.target.value }))}
              placeholder="e.g. CERT-2024-001"
            />
          </div>

          <div className="form-group">
            <label>Conducted By</label>
            <input
              type="text"
              className="form-control"
              value={logForm.conducted_by}
              onChange={e => setLogForm(f => ({ ...f, conducted_by: e.target.value }))}
              placeholder="Instructor / facilitator name"
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea
              className="form-control"
              rows={3}
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowLogForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveLog} disabled={savingLog}>
            {savingLog ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog
        open={showTypeForm}
        onClose={() => setShowTypeForm(false)}
        title={editType ? 'Edit Training Type' : 'New Training Type'}
      >
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Type Name *</label>
            <input
              type="text"
              className="form-control"
              value={typeForm.type_name}
              onChange={e => setTypeForm(f => ({ ...f, type_name: e.target.value }))}
              placeholder="e.g. Fire Safety"
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea
              className="form-control"
              rows={2}
              value={typeForm.description}
              onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Category</label>
            <input
              type="text"
              className="form-control"
              value={typeForm.category}
              onChange={e => setTypeForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Safety, Technical, Soft Skills"
            />
          </div>

          <div className="form-group">
            <label>Duration (hours)</label>
            <input
              type="number"
              className="form-control"
              min="0"
              step="0.5"
              value={typeForm.duration_hours}
              onChange={e => setTypeForm(f => ({ ...f, duration_hours: e.target.value }))}
              placeholder="e.g. 8"
            />
          </div>

          <div className="form-group">
            <label>Provider</label>
            <input
              type="text"
              className="form-control"
              value={typeForm.provider}
              onChange={e => setTypeForm(f => ({ ...f, provider: e.target.value }))}
              placeholder="e.g. Red Cross Zimbabwe"
            />
          </div>

          <div className="form-group">
            <label>Cost</label>
            <input
              type="number"
              className="form-control"
              min="0"
              step="0.01"
              value={typeForm.cost}
              onChange={e => setTypeForm(f => ({ ...f, cost: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          <div className="form-group">
            <label>Currency</label>
            <select
              className="form-control"
              value={typeForm.currency}
              onChange={e => setTypeForm(f => ({ ...f, currency: e.target.value }))}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
            <input
              type="checkbox"
              id="type_active"
              checked={typeForm.is_active}
              onChange={e => setTypeForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            <label htmlFor="type_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowTypeForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveType} disabled={savingType}>
            {savingType ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDelLog}
        onClose={() => setConfirmDelLog(null)}
        onConfirm={handleDeleteLog}
        title="Delete Training Record"
        message={`Delete training record ${confirmDelLog?.training_number || ''}? This cannot be undone.`}
        confirmLabel={deletingLog ? 'Deleting…' : 'Delete'}
        danger
        loading={deletingLog}
      />

      <ConfirmDialog
        open={!!confirmDelType}
        onClose={() => setConfirmDelType(null)}
        onConfirm={handleDeleteType}
        title="Delete Training Type"
        message={`Delete "${confirmDelType?.type_name}"? This cannot be undone.`}
        confirmLabel={deletingType ? 'Deleting…' : 'Delete'}
        danger
        loading={deletingType}
      />
    </div>
  )
}
