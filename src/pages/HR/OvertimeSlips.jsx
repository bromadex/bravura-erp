import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner, TabNav,
} from '../../components/ui'

const SLIP_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled']

const BLANK_SLIP = {
  employee_id: '',
  overtime_type_id: '',
  posting_date: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  total_hours: '',
  hourly_rate: '',
  total_amount: '',
  notes: '',
}

const BLANK_TYPE = {
  overtime_name: '',
  rate_type: 'Multiplier',
  rate_value: '',
  description: '',
  is_active: true,
}

function pad(n) { return String(n).padStart(6, '0') }

function calcHours(startTime, endTime) {
  if (!startTime || !endTime) return ''
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) return ''
  return (mins / 60).toFixed(2)
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtAmt(n) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function OvertimeSlips() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'overtime')
  const canApprove = useCanApprove('hr', 'overtime')

  const [activeTab, setActiveTab] = useState('slips')

  const [slips, setSlips] = useState([])
  const [employees, setEmployees] = useState([])
  const [overtimeTypes, setOvertimeTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const [showSlipModal, setShowSlipModal] = useState(false)
  const [editSlip, setEditSlip] = useState(null)
  const [slipForm, setSlipForm] = useState(BLANK_SLIP)

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editType, setEditType] = useState(null)
  const [typeForm, setTypeForm] = useState(BLANK_TYPE)
  const [confirmDelType, setConfirmDelType] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: slipData }, { data: empData }, { data: typeData }] = await Promise.all([
      supabase.from('overtime_slips').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, basic_salary').eq('status', 'Active').order('name'),
      supabase.from('overtime_types').select('*').order('overtime_name'),
    ])
    setSlips(slipData || [])
    setEmployees(empData || [])
    setOvertimeTypes(typeData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextSlipNumber = (existing) => {
    const nums = existing.map(s => parseInt((s.slip_number || '').replace('OTS-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `OTS-${pad(max + 1)}`
  }

  const openNewSlip = () => {
    setEditSlip(null)
    setSlipForm(BLANK_SLIP)
    setShowSlipModal(true)
  }

  const openEditSlip = (s) => {
    setEditSlip(s)
    setSlipForm({
      employee_id: s.employee_id || '',
      overtime_type_id: s.overtime_type_id || '',
      posting_date: s.posting_date || '',
      start_date: s.start_date || '',
      end_date: s.end_date || '',
      start_time: s.start_time || '',
      end_time: s.end_time || '',
      total_hours: s.total_hours ?? '',
      hourly_rate: s.hourly_rate ?? '',
      total_amount: s.total_amount ?? '',
      notes: s.notes || '',
    })
    setShowSlipModal(true)
  }

  const slipField = (key) => (e) => {
    const val = e.target.value
    setSlipForm(f => {
      const updated = { ...f, [key]: val }
      if (key === 'start_time' || key === 'end_time') {
        const st = key === 'start_time' ? val : f.start_time
        const et = key === 'end_time' ? val : f.end_time
        const hrs = calcHours(st, et)
        if (hrs !== '') {
          updated.total_hours = hrs
          const ot = overtimeTypes.find(t => t.id === f.overtime_type_id)
          if (ot && f.hourly_rate) {
            const rate = parseFloat(f.hourly_rate)
            const rateVal = parseFloat(ot.rate_value)
            if (!isNaN(rate) && !isNaN(rateVal)) {
              const hrsNum = parseFloat(hrs)
              updated.total_amount = ot.rate_type === 'Fixed'
                ? (hrsNum * rateVal).toFixed(2)
                : (hrsNum * rate * rateVal).toFixed(2)
            }
          }
        }
      }
      if (key === 'employee_id') {
        const emp = employees.find(e => e.id === val)
        if (emp && emp.basic_salary) {
          const rate = (parseFloat(emp.basic_salary) / 26 / 8).toFixed(4)
          updated.hourly_rate = rate
          recalcAmount(updated)
        }
      }
      if (key === 'overtime_type_id' || key === 'hourly_rate' || key === 'total_hours') {
        recalcAmount(updated)
      }
      return updated
    })
  }

  function recalcAmount(f) {
    const ot = overtimeTypes.find(t => t.id === f.overtime_type_id)
    if (!ot) return
    const hrs = parseFloat(f.total_hours)
    const rate = parseFloat(f.hourly_rate)
    const rateVal = parseFloat(ot.rate_value)
    if (!isNaN(hrs) && !isNaN(rateVal)) {
      f.total_amount = ot.rate_type === 'Fixed'
        ? (hrs * rateVal).toFixed(2)
        : (!isNaN(rate) ? (hrs * rate * rateVal).toFixed(2) : f.total_amount)
    }
  }

  const handleSaveSlip = async () => {
    if (!slipForm.employee_id) { toast.error('Employee is required'); return }
    if (!slipForm.overtime_type_id) { toast.error('Overtime type is required'); return }
    if (!slipForm.posting_date) { toast.error('Posting date is required'); return }
    setSaving(true)
    try {
      if (editSlip) {
        const { error } = await supabase.from('overtime_slips').update({
          employee_id: slipForm.employee_id,
          overtime_type_id: slipForm.overtime_type_id,
          posting_date: slipForm.posting_date,
          start_date: slipForm.start_date || null,
          end_date: slipForm.end_date || null,
          start_time: slipForm.start_time || null,
          end_time: slipForm.end_time || null,
          total_hours: slipForm.total_hours ? parseFloat(slipForm.total_hours) : null,
          hourly_rate: slipForm.hourly_rate ? parseFloat(slipForm.hourly_rate) : null,
          total_amount: slipForm.total_amount ? parseFloat(slipForm.total_amount) : null,
          notes: slipForm.notes || null,
        }).eq('id', editSlip.id)
        if (error) throw error
        toast.success('Overtime slip updated')
      } else {
        const { error } = await supabase.from('overtime_slips').insert([{
          id: crypto.randomUUID(),
          slip_number: nextSlipNumber(slips),
          employee_id: slipForm.employee_id,
          overtime_type_id: slipForm.overtime_type_id,
          posting_date: slipForm.posting_date,
          start_date: slipForm.start_date || null,
          end_date: slipForm.end_date || null,
          start_time: slipForm.start_time || null,
          end_time: slipForm.end_time || null,
          total_hours: slipForm.total_hours ? parseFloat(slipForm.total_hours) : null,
          hourly_rate: slipForm.hourly_rate ? parseFloat(slipForm.hourly_rate) : null,
          total_amount: slipForm.total_amount ? parseFloat(slipForm.total_amount) : null,
          notes: slipForm.notes || null,
          status: 'Draft',
          created_by: user?.full_name || '',
        }])
        if (error) throw error
        toast.success('Overtime slip created')
      }
      setShowSlipModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleStatusChange = async (slip, newStatus) => {
    const { error } = await supabase.from('overtime_slips').update({ status: newStatus }).eq('id', slip.id)
    if (error) { toast.error(error.message); return }
    toast.success(`Slip ${newStatus.toLowerCase()}`)
    fetchAll()
  }

  const openNewType = () => { setEditType(null); setTypeForm(BLANK_TYPE); setShowTypeModal(true) }
  const openEditType = (t) => {
    setEditType(t)
    setTypeForm({ overtime_name: t.overtime_name, rate_type: t.rate_type, rate_value: t.rate_value ?? '', description: t.description || '', is_active: t.is_active })
    setShowTypeModal(true)
  }

  const handleSaveType = async () => {
    if (!typeForm.overtime_name.trim()) { toast.error('Name is required'); return }
    if (typeForm.rate_value === '') { toast.error('Rate value is required'); return }
    setSaving(true)
    try {
      if (editType) {
        const { error } = await supabase.from('overtime_types').update({
          overtime_name: typeForm.overtime_name.trim(),
          rate_type: typeForm.rate_type,
          rate_value: parseFloat(typeForm.rate_value),
          description: typeForm.description || null,
          is_active: typeForm.is_active,
        }).eq('id', editType.id)
        if (error) throw error
        toast.success('Overtime type updated')
      } else {
        const { error } = await supabase.from('overtime_types').insert([{
          id: crypto.randomUUID(),
          overtime_name: typeForm.overtime_name.trim(),
          rate_type: typeForm.rate_type,
          rate_value: parseFloat(typeForm.rate_value),
          description: typeForm.description || null,
          is_active: typeForm.is_active,
          created_by: user?.full_name || '',
        }])
        if (error) throw error
        toast.success('Overtime type created')
      }
      setShowTypeModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleTypeActive = async (t) => {
    await supabase.from('overtime_types').update({ is_active: !t.is_active }).eq('id', t.id)
    fetchAll()
  }

  const handleDeleteType = async () => {
    setDeleting(true)
    await supabase.from('overtime_types').delete().eq('id', confirmDelType.id)
    toast.success('Overtime type deleted')
    setConfirmDelType(null)
    setDeleting(false)
    fetchAll()
  }

  const filteredSlips = slips.filter(s => {
    if (filterEmployee && s.employee_id !== filterEmployee) return false
    if (filterStatus && s.status !== filterStatus) return false
    if (filterMonth && s.posting_date && !s.posting_date.startsWith(filterMonth)) return false
    return true
  })

  const kpiTotal = slips.length
  const kpiDraft = slips.filter(s => s.status === 'Draft').length
  const kpiApproved = slips.filter(s => s.status === 'Approved').length
  const kpiHours = slips.filter(s => s.status === 'Approved').reduce((acc, s) => acc + (parseFloat(s.total_hours) || 0), 0)

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
  const typeMap = Object.fromEntries(overtimeTypes.map(t => [t.id, t]))

  const tabs = [
    { id: 'slips', label: 'Overtime Slips' },
    { id: 'types', label: 'Overtime Types' },
  ]

  return (
    <div>
      <PageHeader title="Overtime Slips">
        {canEdit && activeTab === 'slips' && (
          <button className="btn btn-primary btn-sm" onClick={openNewSlip}>
            <span className="material-icons">add</span> New Slip
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

          {activeTab === 'slips' && (
            <div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
                <KPICard label="Total Slips" value={kpiTotal} icon="receipt_long" />
                <KPICard label="Draft" value={kpiDraft} icon="edit_note" color="yellow" />
                <KPICard label="Approved" value={kpiApproved} icon="check_circle" color="green" />
                <KPICard label="Approved Hours" value={kpiHours.toFixed(1)} icon="schedule" color="blue" />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <select className="form-control" style={{ width: 'auto', minWidth: 180 }}
                  value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                  <option value="">All Employees</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <select className="form-control" style={{ width: 'auto', minWidth: 140 }}
                  value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  {SLIP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="month" className="form-control" style={{ width: 'auto' }}
                  value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
                {(filterEmployee || filterStatus || filterMonth) && (
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => { setFilterEmployee(''); setFilterStatus(''); setFilterMonth('') }}>
                    Clear
                  </button>
                )}
              </div>

              {filteredSlips.length === 0 ? (
                <EmptyState icon="receipt_long" message="No overtime slips found." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Slip #</th>
                        <th>Employee</th>
                        <th>Date Range</th>
                        <th>Hours</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSlips.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{s.slip_number}</td>
                          <td>{empMap[s.employee_id] || '—'}</td>
                          <td style={{ fontSize: 12 }}>
                            {s.start_date && s.end_date
                              ? `${fmtDate(s.start_date)} – ${fmtDate(s.end_date)}`
                              : fmtDate(s.posting_date)}
                          </td>
                          <td>{s.total_hours ?? '—'}</td>
                          <td>{fmtAmt(s.total_amount)}</td>
                          <td>
                            <StatusBadge status={s.status?.toLowerCase()} label={s.status} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {canEdit && s.status === 'Draft' && (
                                <>
                                  <button className="btn btn-xs btn-secondary" onClick={() => openEditSlip(s)}>
                                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                  </button>
                                  <button className="btn btn-xs btn-primary" onClick={() => handleStatusChange(s, 'Submitted')}>
                                    Submit
                                  </button>
                                </>
                              )}
                              {canApprove && s.status === 'Submitted' && (
                                <>
                                  <button className="btn btn-xs btn-primary" onClick={() => handleStatusChange(s, 'Approved')}>
                                    Approve
                                  </button>
                                  <button className="btn btn-xs btn-danger" onClick={() => handleStatusChange(s, 'Rejected')}>
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
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
              {overtimeTypes.length === 0 ? (
                <EmptyState icon="more_time" message="No overtime types defined." />
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Rate Type</th>
                        <th>Rate Value</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overtimeTypes.map(t => (
                        <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.55 }}>
                          <td style={{ fontWeight: 600 }}>{t.overtime_name}</td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: t.rate_type === 'Multiplier' ? 'var(--blue)18' : 'var(--teal)18',
                              color: t.rate_type === 'Multiplier' ? 'var(--blue)' : 'var(--teal)',
                              border: `1px solid ${t.rate_type === 'Multiplier' ? 'var(--blue)' : 'var(--teal)'}44`,
                            }}>
                              {t.rate_type}
                            </span>
                          </td>
                          <td>{t.rate_value}</td>
                          <td style={{ maxWidth: 200, fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      <ModalDialog open={showSlipModal} onClose={() => setShowSlipModal(false)}
        title={editSlip ? 'Edit Overtime Slip' : 'New Overtime Slip'} size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={slipForm.employee_id} onChange={slipField('employee_id')}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Overtime Type *</label>
            <select className="form-control" value={slipForm.overtime_type_id} onChange={slipField('overtime_type_id')}>
              <option value="">Select type…</option>
              {overtimeTypes.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.overtime_name} ({t.rate_type})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Posting Date *</label>
            <input type="date" className="form-control" value={slipForm.posting_date} onChange={slipField('posting_date')} />
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" className="form-control" value={slipForm.start_date} onChange={slipField('start_date')} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" className="form-control" value={slipForm.end_date} onChange={slipField('end_date')} />
          </div>
          <div className="form-group">
            <label>Start Time (HH:MM)</label>
            <input type="time" className="form-control" value={slipForm.start_time} onChange={slipField('start_time')} />
          </div>
          <div className="form-group">
            <label>End Time (HH:MM)</label>
            <input type="time" className="form-control" value={slipForm.end_time} onChange={slipField('end_time')} />
          </div>
          <div className="form-group">
            <label>Total Hours</label>
            <input type="number" step="0.01" className="form-control" value={slipForm.total_hours}
              onChange={slipField('total_hours')} placeholder="Auto-calculated from times" />
          </div>
          <div className="form-group">
            <label>Hourly Rate</label>
            <input type="number" step="0.0001" className="form-control" value={slipForm.hourly_rate}
              onChange={slipField('hourly_rate')} placeholder="Auto-filled from salary" />
          </div>
          <div className="form-group">
            <label>Total Amount</label>
            <input type="number" step="0.01" className="form-control" value={slipForm.total_amount}
              onChange={slipField('total_amount')} placeholder="Auto-calculated" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={slipForm.notes} onChange={slipField('notes')} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowSlipModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveSlip} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={showTypeModal} onClose={() => setShowTypeModal(false)}
        title={editType ? 'Edit Overtime Type' : 'New Overtime Type'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={typeForm.overtime_name}
              onChange={e => setTypeForm(f => ({ ...f, overtime_name: e.target.value }))}
              placeholder="e.g. Weekend OT" />
          </div>
          <div className="form-group">
            <label>Rate Type</label>
            <select className="form-control" value={typeForm.rate_type}
              onChange={e => setTypeForm(f => ({ ...f, rate_type: e.target.value }))}>
              <option value="Multiplier">Multiplier (× hourly rate)</option>
              <option value="Fixed">Fixed (per hour)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Rate Value *</label>
            <input type="number" step="0.01" className="form-control" value={typeForm.rate_value}
              onChange={e => setTypeForm(f => ({ ...f, rate_value: e.target.value }))}
              placeholder={typeForm.rate_type === 'Multiplier' ? 'e.g. 1.5' : 'e.g. 25.00'} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={typeForm.description}
              onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="ot_active" checked={typeForm.is_active}
              onChange={e => setTypeForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="ot_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
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
        title="Delete Overtime Type"
        message={`Delete "${confirmDelType?.overtime_name}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
