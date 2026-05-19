// src/pages/HR/SalaryArrears.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, Pagination,
} from '../../components/ui'
import toast from 'react-hot-toast'

const PAGE_SIZE = 20
const STATUS_COLORS = { Draft: 'yellow', Submitted: 'blue', Paid: 'green', Cancelled: 'red' }
const EMPTY = { employee_id: '', from_date: '', to_date: '', total_amount: '', currency: 'USD', reason: '', notes: '' }

export default function SalaryArrears() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'salary-arrears')

  const [rows, setRows]           = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading]     = useState(true)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [filterEmp, setFilterEmp]         = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
  const fmt = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id,name').eq('status', 'Active').order('name')
    setEmployees(data || [])
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('salary_arrears').select('*', { count: 'exact' })
    if (filterEmp)    q = q.eq('employee_id', filterEmp)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) { toast.error('Failed to load arrears: ' + error.message); setLoading(false); return }
    setRows(data || []); setTotal(count || 0); setLoading(false)
  }, [filterEmp, filterStatus, page])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => {
    setEditing(r.id)
    setForm({ employee_id: r.employee_id, from_date: r.from_date, to_date: r.to_date, total_amount: r.total_amount, currency: r.currency, reason: r.reason || '', notes: r.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.employee_id)  return toast.error('Select an employee')
    if (!form.from_date || !form.to_date) return toast.error('Both dates are required')
    if (form.to_date < form.from_date)    return toast.error('To date must be after from date')
    if (!form.total_amount || Number(form.total_amount) <= 0) return toast.error('Amount must be > 0')
    setSaving(true)
    const payload = { ...form, total_amount: Number(form.total_amount), updated_at: new Date().toISOString() }
    let error
    if (editing) {
      ;({ error } = await supabase.from('salary_arrears').update(payload).eq('id', editing))
    } else {
      payload.created_by = user?.id; payload.ref_number = 'ARR-' + Date.now()
      ;({ error } = await supabase.from('salary_arrears').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Arrears updated' : 'Arrears entry created')
    setModal(false); fetchRows()
  }

  const changeStatus = async (id, status) => {
    const { error } = await supabase.from('salary_arrears').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success(`Marked as ${status}`); fetchRows(); setConfirm(null)
  }

  const del = async id => {
    const { error } = await supabase.from('salary_arrears').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Deleted'); fetchRows(); setConfirm(null)
  }

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title="Salary Arrears" subtitle="Back-pay entries for employees">
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ New Arrears Entry</button>}
      </PageHeader>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filterEmp} onChange={e => { setFilterEmp(e.target.value); setPage(0) }} className="input" style={{ minWidth: 200 }}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }} className="input" style={{ minWidth: 150 }}>
          <option value="">All Statuses</option>
          {['Draft','Submitted','Paid','Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="receipt" message="No arrears entries found" />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Ref #</th><th>Employee</th><th>Period</th>
                  <th>Amount</th><th>Reason</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.ref_number || '—'}</span></td>
                    <td>{empMap[r.employee_id] || r.employee_id}</td>
                    <td style={{ fontSize: 12 }}>{r.from_date} → {r.to_date}</td>
                    <td style={{ fontWeight: 700 }}>{r.currency} {fmt(r.total_amount)}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{r.reason || '—'}</td>
                    <td><StatusBadge status={r.status} color={STATUS_COLORS[r.status]} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {canEdit && r.status === 'Draft' && <>
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>Edit</button>
                          <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'submit', id: r.id, name: empMap[r.employee_id] })}>Submit</button>
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ type: 'delete', id: r.id, name: empMap[r.employee_id] })}>Delete</button>
                        </>}
                        {canEdit && r.status === 'Submitted' && <>
                          <button className="btn btn-sm btn-primary" style={{ background: 'var(--green)' }} onClick={() => setConfirm({ type: 'pay', id: r.id, name: empMap[r.employee_id] })}>Mark Paid</button>
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ type: 'cancel', id: r.id, name: empMap[r.employee_id] })}>Cancel</button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}

      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Arrears Entry' : 'New Arrears Entry'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Employee *</label>
            <select className="input" value={form.employee_id} onChange={e => fld('employee_id', e.target.value)} disabled={!!editing}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">From Date *</label>
              <input type="date" className="input" value={form.from_date} onChange={e => fld('from_date', e.target.value)} />
            </div>
            <div>
              <label className="field-label">To Date *</label>
              <input type="date" className="input" value={form.to_date} onChange={e => fld('to_date', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Total Amount *</label>
              <input type="number" className="input" min="0" step="0.01" value={form.total_amount} onChange={e => fld('total_amount', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Currency</label>
              <select className="input" value={form.currency} onChange={e => fld('currency', e.target.value)}>
                {['USD','ZWL','ZAR','GBP','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Reason</label>
            <input className="input" value={form.reason} onChange={e => fld('reason', e.target.value)} placeholder="e.g. Salary correction Q3 2024" />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={confirm?.type === 'submit'} title="Submit Arrears"
        message={`Submit arrears entry for ${confirm?.name}?`} confirmLabel="Submit"
        onConfirm={() => changeStatus(confirm.id, 'Submitted')} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'pay'} title="Mark as Paid"
        message={`Confirm arrears payment for ${confirm?.name}?`} confirmLabel="Mark Paid"
        onConfirm={() => changeStatus(confirm.id, 'Paid')} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'cancel'} title="Cancel Arrears"
        message={`Cancel this arrears entry for ${confirm?.name}?`} confirmLabel="Cancel Entry"
        onConfirm={() => changeStatus(confirm.id, 'Cancelled')} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'delete'} title="Delete Arrears" danger
        message={`Permanently delete this arrears entry for ${confirm?.name}?`} confirmLabel="Delete"
        onConfirm={() => del(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
