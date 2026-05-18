import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const BLANK = {
  employee_id: '', transfer_date: today,
  from_department_id: '', to_department_id: '',
  from_designation_id: '', to_designation_id: '',
  reason: '', reallocate_leaves: false, notes: '', status: 'Draft',
}

const STATUS_COLOR = { Draft: 'yellow', 'Pending Approval': 'blue', Approved: 'green', Rejected: 'red' }

export default function EmployeeTransfers() {
  const { user }   = useAuth()
  const canEdit    = useCanEdit('hr', 'employee-transfers')
  const canApprove = useCanApprove('hr', 'employee-transfers')

  const [transfers,    setTransfers]    = useState([])
  const [employees,    setEmployees]    = useState([])
  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  const [showForm,   setShowForm]   = useState(false)
  const [editTrans,  setEditTrans]  = useState(null)
  const [form,       setForm]       = useState(BLANK)

  const [filterStatus, setFilterStatus] = useState('')

  const [confirmApprove, setConfirmApprove] = useState(null)
  const [confirmReject,  setConfirmReject]  = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const [actioning,      setActioning]      = useState(false)

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_transfers')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setTransfers(data || [])
    setLoading(false)
  }, [])

  const fetchLookups = useCallback(async () => {
    const [{ data: emps }, { data: depts }, { data: desigs }] = await Promise.all([
      supabase.from('employees').select('id, name, employee_number, department_id, designation_id, basic_salary').eq('status', 'Active').order('name'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('designations').select('id, title').order('title'),
    ])
    setEmployees(emps || [])
    setDepartments(depts || [])
    setDesignations(desigs || [])
  }, [])

  useEffect(() => { fetchTransfers(); fetchLookups() }, [fetchTransfers, fetchLookups])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => {
    setEditTrans(null)
    setForm(BLANK)
    setShowForm(true)
  }

  const openEdit = (t) => {
    setEditTrans(t)
    setForm({
      employee_id:         t.employee_id          || '',
      transfer_date:       t.transfer_date         || today,
      from_department_id:  t.from_department_id   || '',
      to_department_id:    t.to_department_id      || '',
      from_designation_id: t.from_designation_id  || '',
      to_designation_id:   t.to_designation_id    || '',
      reason:              t.reason               || '',
      reallocate_leaves:   t.reallocate_leaves     ?? false,
      notes:               t.notes               || '',
      status:              t.status              || 'Draft',
    })
    setShowForm(true)
  }

  const handleEmpChange = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({
      ...f,
      employee_id:         empId,
      from_department_id:  emp?.department_id  || '',
      from_designation_id: emp?.designation_id || '',
      to_department_id:    '',
      to_designation_id:   '',
    }))
  }

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.transfer_date) { toast.error('Transfer date is required'); return }
    if (!form.to_department_id) { toast.error('Destination department is required'); return }
    if (form.to_department_id === form.from_department_id) {
      toast.error('Destination department must differ from current department'); return
    }
    setSaving(true)
    try {
      const payload = {
        employee_id:         form.employee_id,
        transfer_date:       form.transfer_date,
        from_department_id:  form.from_department_id  || null,
        to_department_id:    form.to_department_id    || null,
        from_designation_id: form.from_designation_id || null,
        to_designation_id:   form.to_designation_id   || null,
        reason:              form.reason,
        reallocate_leaves:   form.reallocate_leaves,
        notes:               form.notes,
        status:              form.status,
      }
      if (editTrans) {
        await supabase.from('employee_transfers').update(payload).eq('id', editTrans.id)
        toast.success('Transfer updated')
      } else {
        const num = 'TRAN-' + Date.now().toString().slice(-6)
        await supabase.from('employee_transfers').insert([{
          id: crypto.randomUUID(), transfer_number: num,
          created_by: user?.full_name || user?.username || '', ...payload,
        }])
        toast.success('Transfer created')
      }
      setShowForm(false)
      fetchTransfers()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleApprove = async () => {
    setActioning(true)
    try {
      const t = confirmApprove
      await supabase.from('employee_transfers').update({ status: 'Approved' }).eq('id', t.id)
      const empUpdate = {}
      if (t.to_department_id)  empUpdate.department_id  = t.to_department_id
      if (t.to_designation_id) empUpdate.designation_id = t.to_designation_id
      if (Object.keys(empUpdate).length) {
        await supabase.from('employees').update(empUpdate).eq('id', t.employee_id)
      }
      await supabase.from('employee_property_history').insert([{
        id: crypto.randomUUID(),
        employee_id:  t.employee_id,
        change_type:  'Transfer',
        reference_id: t.id,
        changed_by:   user?.full_name || user?.username || '',
        changed_at:   new Date().toISOString(),
      }])
      toast.success('Transfer approved')
      setConfirmApprove(null)
      fetchTransfers()
    } catch (err) { toast.error(err.message) }
    finally { setActioning(false) }
  }

  const handleReject = async () => {
    setActioning(true)
    await supabase.from('employee_transfers').update({ status: 'Rejected' }).eq('id', confirmReject.id)
    toast.success('Transfer rejected')
    setConfirmReject(null)
    setActioning(false)
    fetchTransfers()
  }

  const handleDelete = async () => {
    setActioning(true)
    await supabase.from('employee_transfers').delete().eq('id', confirmDelete.id)
    toast.success('Transfer deleted')
    setConfirmDelete(null)
    setActioning(false)
    fetchTransfers()
  }

  const empName   = (id) => { const e = employees.find(x => x.id === id); return e ? `${e.name}${e.employee_number ? ` (${e.employee_number})` : ''}` : id || '—' }
  const deptName  = (id) => departments.find(d => d.id === id)?.name || '—'
  const desigName = (id) => designations.find(d => d.id === id)?.title || '—'

  const visible = filterStatus ? transfers.filter(t => t.status === filterStatus) : transfers

  const kpiTotal    = transfers.length
  const kpiPending  = transfers.filter(t => t.status === 'Pending Approval').length
  const kpiApproved = transfers.filter(t => t.status === 'Approved').length
  const kpiRejected = transfers.filter(t => t.status === 'Rejected').length

  return (
    <div>
      <PageHeader title="Employee Transfers">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Transfer
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"    value={kpiTotal}    icon="swap_horiz"      color="blue"   />
        <KPICard label="Pending"  value={kpiPending}  icon="hourglass_empty" color="yellow" />
        <KPICard label="Approved" value={kpiApproved} icon="check_circle"    color="green"  />
        <KPICard label="Rejected" value={kpiRejected} icon="cancel"          color="red"    />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select className="form-control" style={{ width: 200 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option>Draft</option>
          <option>Pending Approval</option>
          <option>Approved</option>
          <option>Rejected</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : visible.length === 0 ? (
        <EmptyState icon="swap_horiz" message="No transfers found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Employee</th>
                <th>From Dept</th>
                <th>To Dept</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{t.transfer_number || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{empName(t.employee_id)}</td>
                  <td>{deptName(t.from_department_id)}</td>
                  <td style={{ color: 'var(--teal)' }}>{deptName(t.to_department_id)}</td>
                  <td>{t.transfer_date || '—'}</td>
                  <td>
                    <StatusBadge status={t.status?.toLowerCase().replace(/ /g, '_')} label={t.status} color={STATUS_COLOR[t.status]} />
                  </td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {canEdit && (t.status === 'Draft' || t.status === 'Pending Approval') && (
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(t)} title="Edit">
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    )}
                    {canApprove && t.status === 'Pending Approval' && <>
                      <button className="btn btn-xs btn-primary" onClick={() => setConfirmApprove(t)}>Approve</button>
                      <button className="btn btn-xs btn-danger"  onClick={() => setConfirmReject(t)}>Reject</button>
                    </>}
                    {canEdit && t.status === 'Draft' && (
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelete(t)} title="Delete">
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

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editTrans ? 'Edit Transfer' : 'New Employee Transfer'} size="lg">
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Employee *</label>
            <select className="form-control" value={form.employee_id} onChange={e => handleEmpChange(e.target.value)}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employee_number ? ` (${e.employee_number})` : ''}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Transfer Date *</label>
            <input type="date" className="form-control" value={form.transfer_date} onChange={e => set('transfer_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
              <option>Draft</option>
              <option>Pending Approval</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
          </div>
          <div className="form-group">
            <label>From Department</label>
            <input className="form-control" readOnly value={deptName(form.from_department_id)} style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }} />
          </div>
          <div className="form-group">
            <label>To Department *</label>
            <select className="form-control" value={form.to_department_id} onChange={e => set('to_department_id', e.target.value)}>
              <option value="">— Select —</option>
              {departments.filter(d => d.id !== form.from_department_id).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>From Designation</label>
            <input className="form-control" readOnly value={desigName(form.from_designation_id)} style={{ background: 'var(--surface2)', color: 'var(--text-dim)' }} />
          </div>
          <div className="form-group">
            <label>To Designation</label>
            <select className="form-control" value={form.to_designation_id} onChange={e => set('to_designation_id', e.target.value)}>
              <option value="">— Select —</option>
              {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Reason</label>
            <textarea className="form-control" rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="realloc_leaves" checked={form.reallocate_leaves} onChange={e => set('reallocate_leaves', e.target.checked)} />
            <label htmlFor="realloc_leaves" style={{ margin: 0, cursor: 'pointer' }}>Reallocate Leaves to New Department</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmApprove} onClose={() => setConfirmApprove(null)} onConfirm={handleApprove}
        title="Approve Transfer"
        message={`Approve transfer ${confirmApprove?.transfer_number} for ${empName(confirmApprove?.employee_id)}? The employee's department and designation will be updated.`}
        confirmLabel={actioning ? 'Approving…' : 'Approve'} loading={actioning}
      />
      <ConfirmDialog
        open={!!confirmReject} onClose={() => setConfirmReject(null)} onConfirm={handleReject}
        title="Reject Transfer"
        message={`Reject transfer ${confirmReject?.transfer_number}?`}
        confirmLabel={actioning ? 'Rejecting…' : 'Reject'} danger loading={actioning}
      />
      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete}
        title="Delete Transfer"
        message={`Permanently delete transfer ${confirmDelete?.transfer_number}? This cannot be undone.`}
        confirmLabel={actioning ? 'Deleting…' : 'Delete'} danger loading={actioning}
      />
    </div>
  )
}
