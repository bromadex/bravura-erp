import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const GRIEVANCE_STATUSES = ['Open', 'In Progress', 'Resolved', 'Dismissed', 'Withdrawn']

const BLANK_GRIEVANCE = {
  raised_by: '',
  date: '',
  subject: '',
  description: '',
  grievance_type_id: '',
  against_employee_id: '',
  against_party: '',
  cause_of_grievance: '',
}

const BLANK_RESOLUTION = {
  status: '',
  resolved_by: '',
  resolution_date: '',
  resolution_detail: '',
}

const BLANK_TYPE = {
  grievance_type: '',
  description: '',
  is_active: true,
}

function pad(n) { return String(n).padStart(6, '0') }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EmployeeGrievances() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'grievances')
  const canApprove = useCanApprove('hr', 'grievances')

  const [activeTab, setActiveTab] = useState('grievances')

  const [grievances, setGrievances] = useState([])
  const [employees, setEmployees] = useState([])
  const [grievanceTypes, setGrievanceTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterStatus, setFilterStatus] = useState('')
  const [filterRaisedBy, setFilterRaisedBy] = useState('')

  const [showNewModal, setShowNewModal] = useState(false)
  const [grievanceForm, setGrievanceForm] = useState(BLANK_GRIEVANCE)

  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedGrievance, setSelectedGrievance] = useState(null)
  const [resolutionForm, setResolutionForm] = useState(BLANK_RESOLUTION)

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editType, setEditType] = useState(null)
  const [typeForm, setTypeForm] = useState(BLANK_TYPE)
  const [confirmDelType, setConfirmDelType] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: gData }, { data: empData }, { data: tData }] = await Promise.all([
      supabase.from('employee_grievances').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
      supabase.from('grievance_types').select('*').order('grievance_type'),
    ])
    setGrievances(gData || [])
    setEmployees(empData || [])
    setGrievanceTypes(tData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextNumber = (existing) => {
    const nums = existing.map(g => parseInt((g.grievance_number || '').replace('GRV-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `GRV-${pad(max + 1)}`
  }

  const openNewGrievance = () => {
    setGrievanceForm(BLANK_GRIEVANCE)
    setShowNewModal(true)
  }

  const openDetail = (g) => {
    setSelectedGrievance(g)
    setResolutionForm({
      status: g.status || '',
      resolved_by: g.resolved_by || '',
      resolution_date: g.resolution_date || '',
      resolution_detail: g.resolution_detail || '',
    })
    setShowDetailModal(true)
  }

  const handleSaveGrievance = async () => {
    if (!grievanceForm.raised_by) { toast.error('Raised by is required'); return }
    if (!grievanceForm.subject.trim()) { toast.error('Subject is required'); return }
    if (!grievanceForm.date) { toast.error('Date is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('employee_grievances').insert([{
        id: crypto.randomUUID(),
        grievance_number: nextNumber(grievances),
        raised_by: grievanceForm.raised_by,
        date: grievanceForm.date,
        subject: grievanceForm.subject.trim(),
        description: grievanceForm.description || null,
        grievance_type_id: grievanceForm.grievance_type_id || null,
        against_employee_id: grievanceForm.against_employee_id || null,
        against_party: grievanceForm.against_party || null,
        cause_of_grievance: grievanceForm.cause_of_grievance || null,
        status: 'Open',
        created_by: user?.full_name || '',
      }])
      if (error) throw error
      toast.success('Grievance submitted')
      setShowNewModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSaveResolution = async () => {
    if (!selectedGrievance) return
    setSaving(true)
    try {
      const { error } = await supabase.from('employee_grievances').update({
        status: resolutionForm.status || selectedGrievance.status,
        resolved_by: resolutionForm.resolved_by || null,
        resolution_date: resolutionForm.resolution_date || null,
        resolution_detail: resolutionForm.resolution_detail || null,
      }).eq('id', selectedGrievance.id)
      if (error) throw error
      toast.success('Grievance updated')
      setShowDetailModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const openNewType = () => { setEditType(null); setTypeForm(BLANK_TYPE); setShowTypeModal(true) }
  const openEditType = (t) => {
    setEditType(t)
    setTypeForm({ grievance_type: t.grievance_type, description: t.description || '', is_active: t.is_active })
    setShowTypeModal(true)
  }

  const handleSaveType = async () => {
    if (!typeForm.grievance_type.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editType) {
        const { error } = await supabase.from('grievance_types').update({
          grievance_type: typeForm.grievance_type.trim(),
          description: typeForm.description || null,
          is_active: typeForm.is_active,
        }).eq('id', editType.id)
        if (error) throw error
        toast.success('Grievance type updated')
      } else {
        const { error } = await supabase.from('grievance_types').insert([{
          id: crypto.randomUUID(),
          grievance_type: typeForm.grievance_type.trim(),
          description: typeForm.description || null,
          is_active: typeForm.is_active,
          created_by: user?.full_name || '',
        }])
        if (error) throw error
        toast.success('Grievance type created')
      }
      setShowTypeModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleTypeActive = async (t) => {
    await supabase.from('grievance_types').update({ is_active: !t.is_active }).eq('id', t.id)
    fetchAll()
  }

  const handleDeleteType = async () => {
    setDeleting(true)
    await supabase.from('grievance_types').delete().eq('id', confirmDelType.id)
    toast.success('Grievance type deleted')
    setConfirmDelType(null)
    setDeleting(false)
    fetchAll()
  }

  const filteredGrievances = grievances.filter(g => {
    if (filterStatus && g.status !== filterStatus) return false
    if (filterRaisedBy && g.raised_by !== filterRaisedBy) return false
    return true
  })

  const kpiTotal = grievances.length
  const kpiOpen = grievances.filter(g => g.status === 'Open').length
  const kpiInProgress = grievances.filter(g => g.status === 'In Progress').length
  const kpiResolved = grievances.filter(g => g.status === 'Resolved').length

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
  const typeMap = Object.fromEntries(grievanceTypes.map(t => [t.id, t.grievance_type]))

  const tabs = [
    { id: 'grievances', label: 'Grievances' },
    { id: 'types', label: 'Grievance Types' },
  ]

  const resolutionStatuses = ['Open', 'In Progress', 'Resolved', 'Dismissed', 'Withdrawn']

  return (
    <div>
      <PageHeader title="Employee Grievances">
        {canEdit && activeTab === 'grievances' && (
          <button className="btn btn-primary btn-sm" onClick={openNewGrievance}>
            <span className="material-icons">add</span> New Grievance
          </button>
        )}
        {canEdit && activeTab === 'types' && (
          <button className="btn btn-primary btn-sm" onClick={openNewType}>
            <span className="material-icons">add</span> New Type
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {activeTab === 'grievances' && (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
                <KPICard label="Total" value={kpiTotal} icon="report_problem" />
                <KPICard label="Open" value={kpiOpen} icon="help_outline" color="yellow" />
                <KPICard label="In Progress" value={kpiInProgress} icon="pending" color="blue" />
                <KPICard label="Resolved" value={kpiResolved} icon="check_circle" color="green" />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <select className="form-control" style={{ width: 'auto', minWidth: 140 }}
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  {GRIEVANCE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="form-control" style={{ width: 'auto', minWidth: 180 }}
                  value={filterRaisedBy} onChange={e => setFilterRaisedBy(e.target.value)}>
                  <option value="">All Employees</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {(filterStatus || filterRaisedBy) && (
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => { setFilterStatus(''); setFilterRaisedBy('') }}>
                    Clear
                  </button>
                )}
              </div>

              {filteredGrievances.length === 0 ? (
                <EmptyState icon="report_problem" message="No grievances found." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Raised By</th>
                        <th>Subject</th>
                        <th>Type</th>
                        <th>Against</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGrievances.map(g => (
                        <tr key={g.id}>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{g.grievance_number}</td>
                          <td>{empMap[g.raised_by] || '—'}</td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.subject}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{typeMap[g.grievance_type_id] || '—'}</td>
                          <td style={{ fontSize: 12 }}>
                            {g.against_employee_id ? empMap[g.against_employee_id] : (g.against_party || '—')}
                          </td>
                          <td style={{ fontSize: 12 }}>{fmtDate(g.date)}</td>
                          <td>
                            <StatusBadge status={g.status === 'In Progress' ? 'in_progress' : g.status?.toLowerCase()} label={g.status} />
                          </td>
                          <td>
                            <button className="btn btn-xs btn-secondary" onClick={() => openDetail(g)}
                              title="View / Update">
                              <span className="material-icons" style={{ fontSize: 13 }}>visibility</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'types' && (
            <div style={{ marginTop: 16 }}>
              {grievanceTypes.length === 0 ? (
                <EmptyState icon="category" message="No grievance types defined." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grievanceTypes.map(t => (
                        <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.55 }}>
                          <td style={{ fontWeight: 600 }}>{t.grievance_type}</td>
                          <td style={{ maxWidth: 300, fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.description || '—'}
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
                                <button className="btn btn-xs btn-secondary" onClick={() => toggleTypeActive(t)}
                                  title={t.is_active ? 'Deactivate' : 'Activate'}>
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
        </>
      )}

      <ModalDialog open={showNewModal} onClose={() => setShowNewModal(false)} title="New Grievance" size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          <div className="form-group">
            <label>Raised By *</label>
            <select className="form-control" value={grievanceForm.raised_by}
              onChange={e => setGrievanceForm(f => ({ ...f, raised_by: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date *</label>
            <input type="date" className="form-control" value={grievanceForm.date}
              onChange={e => setGrievanceForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Subject *</label>
            <input className="form-control" value={grievanceForm.subject}
              onChange={e => setGrievanceForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief subject of grievance" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea className="form-control" rows={3} value={grievanceForm.description}
              onChange={e => setGrievanceForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Grievance Type</label>
            <select className="form-control" value={grievanceForm.grievance_type_id}
              onChange={e => setGrievanceForm(f => ({ ...f, grievance_type_id: e.target.value }))}>
              <option value="">Select type…</option>
              {grievanceTypes.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.grievance_type}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Against Employee (optional)</label>
            <select className="form-control" value={grievanceForm.against_employee_id}
              onChange={e => setGrievanceForm(f => ({ ...f, against_employee_id: e.target.value }))}>
              <option value="">None</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {!grievanceForm.against_employee_id && (
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Against Party (if not specific employee)</label>
              <input className="form-control" value={grievanceForm.against_party}
                onChange={e => setGrievanceForm(f => ({ ...f, against_party: e.target.value }))}
                placeholder="e.g. Management, Department, Policy" />
            </div>
          )}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Cause of Grievance</label>
            <textarea className="form-control" rows={2} value={grievanceForm.cause_of_grievance}
              onChange={e => setGrievanceForm(f => ({ ...f, cause_of_grievance: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveGrievance} disabled={saving}>
            {saving ? 'Saving…' : 'Submit Grievance'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={showDetailModal} onClose={() => setShowDetailModal(false)}
        title={`Grievance: ${selectedGrievance?.grievance_number || ''}`} size="lg">
        {selectedGrievance && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 20,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Raised By</div>
                <div style={{ fontWeight: 600 }}>{empMap[selectedGrievance.raised_by] || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Date</div>
                <div>{fmtDate(selectedGrievance.date)}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Subject</div>
                <div style={{ fontWeight: 600 }}>{selectedGrievance.subject}</div>
              </div>
              {selectedGrievance.description && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Description</div>
                  <div style={{ fontSize: 13 }}>{selectedGrievance.description}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Type</div>
                <div>{typeMap[selectedGrievance.grievance_type_id] || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Against</div>
                <div>
                  {selectedGrievance.against_employee_id
                    ? empMap[selectedGrievance.against_employee_id]
                    : (selectedGrievance.against_party || '—')}
                </div>
              </div>
              {selectedGrievance.cause_of_grievance && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Cause</div>
                  <div style={{ fontSize: 13 }}>{selectedGrievance.cause_of_grievance}</div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, color: 'var(--text-dim)' }}>
                RESOLUTION
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={resolutionForm.status}
                    onChange={e => setResolutionForm(f => ({ ...f, status: e.target.value }))}
                    disabled={!canApprove}>
                    {resolutionStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Resolved By</label>
                  <input className="form-control" value={resolutionForm.resolved_by}
                    onChange={e => setResolutionForm(f => ({ ...f, resolved_by: e.target.value }))}
                    disabled={!canApprove} placeholder="Name of resolver" />
                </div>
                <div className="form-group">
                  <label>Resolution Date</label>
                  <input type="date" className="form-control" value={resolutionForm.resolution_date}
                    onChange={e => setResolutionForm(f => ({ ...f, resolution_date: e.target.value }))}
                    disabled={!canApprove} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Resolution Detail</label>
                  <textarea className="form-control" rows={3} value={resolutionForm.resolution_detail}
                    onChange={e => setResolutionForm(f => ({ ...f, resolution_detail: e.target.value }))}
                    disabled={!canApprove} />
                </div>
              </div>
            </div>
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
          {canApprove && (
            <button className="btn btn-primary" onClick={handleSaveResolution} disabled={saving}>
              {saving ? 'Saving…' : 'Save Update'}
            </button>
          )}
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={showTypeModal} onClose={() => setShowTypeModal(false)}
        title={editType ? 'Edit Grievance Type' : 'New Grievance Type'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Type Name *</label>
            <input className="form-control" value={typeForm.grievance_type}
              onChange={e => setTypeForm(f => ({ ...f, grievance_type: e.target.value }))}
              placeholder="e.g. Harassment, Pay Dispute" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={3} value={typeForm.description}
              onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="gt_active" checked={typeForm.is_active}
              onChange={e => setTypeForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="gt_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowTypeModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveType} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDelType}
        onClose={() => setConfirmDelType(null)}
        onConfirm={handleDeleteType}
        title="Delete Grievance Type"
        message={`Delete "${confirmDelType?.grievance_type}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
