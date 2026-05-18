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
const fmt   = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

const BLANK = {
  employee_id: '', promotion_date: today, department_id: '',
  current_ctc: '', revised_ctc: '', notes: '', status: 'Draft',
}

const STATUS_COLOR = { Draft: 'yellow', 'Pending Approval': 'blue', Approved: 'green', Rejected: 'red' }

export default function EmployeePromotions() {
  const { user }   = useAuth()
  const canEdit    = useCanEdit('hr', 'employee-promotions')
  const canApprove = useCanApprove('hr', 'employee-promotions')

  const [promos,       setPromos]       = useState([])
  const [employees,    setEmployees]    = useState([])
  const [departments,  setDepartments]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  const [showForm,     setShowForm]     = useState(false)
  const [editPromo,    setEditPromo]    = useState(null)
  const [form,         setForm]         = useState(BLANK)
  const [details,      setDetails]      = useState([])

  const [filterStatus, setFilterStatus] = useState('')
  const [filterEmp,    setFilterEmp]    = useState('')

  const [confirmApprove, setConfirmApprove] = useState(null)
  const [confirmReject,  setConfirmReject]  = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const [actioning,      setActioning]      = useState(false)

  const fetchPromos = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employee_promotions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setPromos(data || [])
    setLoading(false)
  }, [])

  const fetchLookups = useCallback(async () => {
    const [{ data: emps }, { data: depts }] = await Promise.all([
      supabase.from('employees').select('id, name, employee_number, department_id, designation_id, basic_salary').eq('status', 'Active').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    setEmployees(emps || [])
    setDepartments(depts || [])
  }, [])

  useEffect(() => { fetchPromos(); fetchLookups() }, [fetchPromos, fetchLookups])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => {
    setEditPromo(null)
    setForm(BLANK)
    setDetails([])
    setShowForm(true)
  }

  const openEdit = (p) => {
    setEditPromo(p)
    setForm({
      employee_id:    p.employee_id    || '',
      promotion_date: p.promotion_date || today,
      department_id:  p.department_id  || '',
      current_ctc:    p.current_ctc    ?? '',
      revised_ctc:    p.revised_ctc    ?? '',
      notes:          p.notes          || '',
      status:         p.status         || 'Draft',
    })
    loadDetails(p.id)
    setShowForm(true)
  }

  const loadDetails = async (promoId) => {
    const { data } = await supabase
      .from('employee_promotion_details')
      .select('*')
      .eq('promotion_id', promoId)
    setDetails(data || [])
  }

  const handleEmpChange = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({
      ...f,
      employee_id:   empId,
      department_id: emp?.department_id || '',
      current_ctc:   emp?.basic_salary ?? '',
    }))
  }

  const addDetailRow = () => setDetails(d => [...d, { _key: crypto.randomUUID(), property: '', current_value: '', new_value: '' }])

  const updateDetail = (idx, field, val) =>
    setDetails(d => d.map((r, i) => i === idx ? { ...r, [field]: val } : r))

  const removeDetail = (idx) => setDetails(d => d.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.promotion_date) { toast.error('Promotion date is required'); return }
    setSaving(true)
    try {
      const promoId = editPromo ? editPromo.id : crypto.randomUUID()
      const payload = {
        employee_id:    form.employee_id,
        promotion_date: form.promotion_date,
        department_id:  form.department_id || null,
        current_ctc:    form.current_ctc !== '' ? parseFloat(form.current_ctc) : null,
        revised_ctc:    form.revised_ctc  !== '' ? parseFloat(form.revised_ctc)  : null,
        notes:          form.notes,
        status:         form.status,
        promoted_by:    user?.full_name || user?.username || '',
      }
      if (editPromo) {
        await supabase.from('employee_promotions').update(payload).eq('id', promoId)
        await supabase.from('employee_promotion_details').delete().eq('promotion_id', promoId)
        toast.success('Promotion updated')
      } else {
        const num = 'PROM-' + Date.now().toString().slice(-6)
        await supabase.from('employee_promotions').insert([{
          id: promoId, promotion_number: num,
          created_by: user?.full_name || user?.username || '', ...payload,
        }])
        toast.success('Promotion created')
      }
      if (details.length) {
        await supabase.from('employee_promotion_details').insert(
          details.filter(d => d.property?.trim()).map(d => ({
            id: crypto.randomUUID(),
            promotion_id:  promoId,
            property:      d.property,
            current_value: d.current_value,
            new_value:     d.new_value,
          }))
        )
      }
      setShowForm(false)
      fetchPromos()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleApprove = async () => {
    setActioning(true)
    try {
      const p = confirmApprove
      await supabase.from('employee_promotions').update({ status: 'Approved' }).eq('id', p.id)
      if (p.department_id) {
        await supabase.from('employees').update({ department_id: p.department_id }).eq('id', p.employee_id)
      }
      await supabase.from('employee_property_history').insert([{
        id: crypto.randomUUID(),
        employee_id:  p.employee_id,
        change_type:  'Promotion',
        reference_id: p.id,
        changed_by:   user?.full_name || user?.username || '',
        changed_at:   new Date().toISOString(),
      }])
      toast.success('Promotion approved')
      setConfirmApprove(null)
      fetchPromos()
    } catch (err) { toast.error(err.message) }
    finally { setActioning(false) }
  }

  const handleReject = async () => {
    setActioning(true)
    await supabase.from('employee_promotions').update({ status: 'Rejected' }).eq('id', confirmReject.id)
    toast.success('Promotion rejected')
    setConfirmReject(null)
    setActioning(false)
    fetchPromos()
  }

  const handleDelete = async () => {
    setActioning(true)
    await supabase.from('employee_promotion_details').delete().eq('promotion_id', confirmDelete.id)
    await supabase.from('employee_promotions').delete().eq('id', confirmDelete.id)
    toast.success('Promotion deleted')
    setConfirmDelete(null)
    setActioning(false)
    fetchPromos()
  }

  const empName  = (id) => { const e = employees.find(x => x.id === id); return e ? `${e.name}${e.employee_number ? ` (${e.employee_number})` : ''}` : id || '—' }
  const deptName = (id) => departments.find(d => d.id === id)?.name || '—'

  const visible = promos.filter(p =>
    (!filterStatus || p.status === filterStatus) &&
    (!filterEmp    || p.employee_id === filterEmp)
  )

  const kpiTotal    = promos.length
  const kpiDraft    = promos.filter(p => p.status === 'Draft').length
  const kpiPending  = promos.filter(p => p.status === 'Pending Approval').length
  const kpiApproved = promos.filter(p => p.status === 'Approved').length

  return (
    <div>
      <PageHeader title="Employee Promotions">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Promotion
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"            value={kpiTotal}   icon="workspace_premium" color="blue"   />
        <KPICard label="Draft"            value={kpiDraft}   icon="edit_note"         color="yellow" />
        <KPICard label="Pending Approval" value={kpiPending} icon="hourglass_empty"   color="blue"   />
        <KPICard label="Approved"         value={kpiApproved} icon="check_circle"     color="green"  />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option>Draft</option>
          <option>Pending Approval</option>
          <option>Approved</option>
          <option>Rejected</option>
        </select>
        <select className="form-control" style={{ width: 220 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employee_number ? ` (${e.employee_number})` : ''}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : visible.length === 0 ? (
        <EmptyState icon="workspace_premium" message="No promotions found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Promo #</th>
                <th>Employee</th>
                <th>Department</th>
                <th>Date</th>
                <th>Current CTC</th>
                <th>Revised CTC</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{p.promotion_number || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{empName(p.employee_id)}</td>
                  <td>{deptName(p.department_id)}</td>
                  <td>{p.promotion_date || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{fmt(p.current_ctc)}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(p.revised_ctc)}</td>
                  <td>
                    <StatusBadge status={p.status?.toLowerCase().replace(/ /g, '_')} label={p.status} color={STATUS_COLOR[p.status]} />
                  </td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {canEdit && (p.status === 'Draft' || p.status === 'Pending Approval') && (
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(p)} title="Edit">
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    )}
                    {canApprove && p.status === 'Pending Approval' && <>
                      <button className="btn btn-xs btn-primary" onClick={() => setConfirmApprove(p)}>Approve</button>
                      <button className="btn btn-xs btn-danger"  onClick={() => setConfirmReject(p)}>Reject</button>
                    </>}
                    {canEdit && p.status === 'Draft' && (
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelete(p)} title="Delete">
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

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editPromo ? 'Edit Promotion' : 'New Employee Promotion'} size="lg">
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Employee *</label>
            <select className="form-control" value={form.employee_id} onChange={e => handleEmpChange(e.target.value)}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.employee_number ? ` (${e.employee_number})` : ''}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Promotion Date *</label>
            <input type="date" className="form-control" value={form.promotion_date} onChange={e => set('promotion_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Department</label>
            <select className="form-control" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
              <option value="">— Select —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Current CTC</label>
            <input type="number" className="form-control" min="0" value={form.current_ctc} onChange={e => set('current_ctc', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Revised CTC</label>
            <input type="number" className="form-control" min="0" value={form.revised_ctc} onChange={e => set('revised_ctc', e.target.value)} />
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
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Promotion Details</span>
              <button type="button" className="btn btn-xs btn-secondary" onClick={addDetailRow}>
                <span className="material-icons" style={{ fontSize: 13 }}>add</span> Add Row
              </button>
            </div>
            {details.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 600 }}>Property</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 600 }}>Current Value</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 600 }}>New Value</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((d, i) => (
                    <tr key={d.id || d._key}>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" style={{ padding: '3px 6px', fontSize: 12 }} value={d.property} onChange={e => updateDetail(i, 'property', e.target.value)} placeholder="e.g. Job Title" />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" style={{ padding: '3px 6px', fontSize: 12 }} value={d.current_value} onChange={e => updateDetail(i, 'current_value', e.target.value)} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" style={{ padding: '3px 6px', fontSize: 12 }} value={d.new_value} onChange={e => updateDetail(i, 'new_value', e.target.value)} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <button type="button" className="btn btn-xs btn-danger" onClick={() => removeDetail(i)}>
                          <span className="material-icons" style={{ fontSize: 12 }}>close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {details.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No detail rows yet — click Add Row.</div>
            )}
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmApprove} onClose={() => setConfirmApprove(null)} onConfirm={handleApprove}
        title="Approve Promotion"
        message={`Approve promotion ${confirmApprove?.promotion_number} for ${empName(confirmApprove?.employee_id)}? The employee's department will be updated.`}
        confirmLabel={actioning ? 'Approving…' : 'Approve'} loading={actioning}
      />
      <ConfirmDialog
        open={!!confirmReject} onClose={() => setConfirmReject(null)} onConfirm={handleReject}
        title="Reject Promotion"
        message={`Reject promotion ${confirmReject?.promotion_number}?`}
        confirmLabel={actioning ? 'Rejecting…' : 'Reject'} danger loading={actioning}
      />
      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete}
        title="Delete Promotion"
        message={`Permanently delete promotion ${confirmDelete?.promotion_number}? This cannot be undone.`}
        confirmLabel={actioning ? 'Deleting…' : 'Delete'} danger loading={actioning}
      />
    </div>
  )
}
