import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_COLOR = { Draft: 'yellow', Submitted: 'blue', Approved: 'teal', Paid: 'green', Cancelled: 'text-dim' }
const TYPES = ['Performance', 'Sales', 'Project', 'Spot Award', 'Other']

const BLANK_FORM = {
  employee_id: '',
  incentive_type: 'Performance',
  amount: '',
  currency: 'USD',
  period: '',
  earned_date: '',
  notes: '',
}

const todayStr = () => new Date().toISOString().split('T')[0]
const pad6 = (n) => String(n).padStart(6, '0')

export default function EmployeeIncentives() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'employee-incentives')
  const canApprove = useCanApprove('hr', 'employee-incentives')

  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)

  const [filterEmp, setFilterEmp] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  const [payRow, setPayRow] = useState(null)
  const [payDate, setPayDate] = useState(todayStr())

  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [confirmSubmit, setConfirmSubmit] = useState(null)
  const [confirmApprove, setConfirmApprove] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: iData, error: iErr }, { data: eData }] = await Promise.all([
      supabase
        .from('employee_incentives')
        .select('*, employees(name, employee_number)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
    ])
    if (iErr) toast.error('Failed to load: ' + iErr.message)
    setRows(iData || [])
    setEmployees(eData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextRef = (existing) => {
    const nums = existing.map(r => parseInt((r.ref_number || '').replace('INC-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `INC-${pad6(max + 1)}`
  }

  const openNew = () => {
    setEditRow(null)
    setForm({ ...BLANK_FORM, earned_date: todayStr() })
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditRow(r)
    setForm({
      employee_id: r.employee_id || '',
      incentive_type: r.incentive_type || 'Performance',
      amount: r.amount ?? '',
      currency: r.currency || 'USD',
      period: r.period || '',
      earned_date: r.earned_date || '',
      notes: r.notes || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Amount must be greater than 0'); return }
    if (!form.earned_date) { toast.error('Earned date is required'); return }
    setSaving(true)
    try {
      if (editRow) {
        const { error } = await supabase.from('employee_incentives').update({
          employee_id: form.employee_id,
          incentive_type: form.incentive_type,
          amount: Number(form.amount),
          currency: form.currency,
          period: form.period || null,
          earned_date: form.earned_date,
          notes: form.notes || null,
        }).eq('id', editRow.id)
        if (error) throw error
        toast.success('Incentive updated')
      } else {
        const { error } = await supabase.from('employee_incentives').insert([{
          id: crypto.randomUUID(),
          ref_number: nextRef(rows),
          employee_id: form.employee_id,
          incentive_type: form.incentive_type,
          amount: Number(form.amount),
          currency: form.currency,
          period: form.period || null,
          earned_date: form.earned_date,
          notes: form.notes || null,
          status: 'Draft',
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
        toast.success('Incentive created')
      }
      setShowForm(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSubmit = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('employee_incentives').update({ status: 'Submitted' }).eq('id', confirmSubmit.id)
      if (error) throw error
      toast.success('Incentive submitted')
      setConfirmSubmit(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleApprove = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('employee_incentives').update({
        status: 'Approved',
        approved_by: user?.full_name || user?.username || '',
      }).eq('id', confirmApprove.id)
      if (error) throw error
      toast.success('Incentive approved')
      setConfirmApprove(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const openPay = (r) => { setPayRow(r); setPayDate(todayStr()) }

  const handlePay = async () => {
    if (!payDate) { toast.error('Paid date is required'); return }
    setActing(true)
    try {
      const { error } = await supabase.from('employee_incentives').update({
        status: 'Paid',
        paid_date: payDate,
      }).eq('id', payRow.id)
      if (error) throw error
      toast.success('Incentive marked as paid')
      setPayRow(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleCancel = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('employee_incentives').update({ status: 'Cancelled' }).eq('id', confirmCancel.id)
      if (error) throw error
      toast.success('Incentive cancelled')
      setConfirmCancel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleDelete = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('employee_incentives').delete().eq('id', confirmDel.id)
      if (error) throw error
      toast.success('Incentive deleted')
      setConfirmDel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const filtered = rows.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false
    if (filterType && r.incentive_type !== filterType) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const kpiTotal = rows.length
  const kpiPending = rows.filter(r => r.status === 'Submitted').length
  const kpiApproved = rows.filter(r => r.status === 'Approved').length
  const kpiPaidYear = rows.filter(r => r.status === 'Paid' && (r.paid_date || '') >= yearStart).length
  const kpiPaidAmt = rows.filter(r => r.status === 'Paid').reduce((a, r) => a + Number(r.amount || 0), 0)

  return (
    <div>
      <PageHeader title="Employee Incentives">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Incentive
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"             value={kpiTotal}              icon="emoji_events"  color="blue"   />
        <KPICard label="Pending Approval"  value={kpiPending}            icon="hourglass_top" color="yellow" />
        <KPICard label="Approved"          value={kpiApproved}           icon="check_circle"  color="teal"   />
        <KPICard label="Paid (This Year)"  value={kpiPaidYear}           icon="paid"          color="green"  />
        <KPICard label="Total Paid Amount" value={`$${fmt(kpiPaidAmt)}`} icon="payments"      color="gold"   />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Employee</label>
          <select className="form-control" style={{ width: 220 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Type</label>
          <select className="form-control" style={{ width: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Status</label>
          <select className="form-control" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option>Draft</option><option>Submitted</option><option>Approved</option><option>Paid</option><option>Cancelled</option>
          </select>
        </div>
        {(filterEmp || filterType || filterStatus) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterType(''); setFilterStatus('') }}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="emoji_events" message="No incentives found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Period</th>
                <th>Earned Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: 'monospace' }}>{r.ref_number}</td>
                  <td>{r.employees?.name || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.incentive_type}</td>
                  <td style={{ fontWeight: 700 }}>${fmt(r.amount)} {r.currency}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.period || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.earned_date || '—'}</td>
                  <td><StatusBadge status={r.status?.toLowerCase()} label={r.status} color={STATUS_COLOR[r.status]} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {canEdit && r.status === 'Draft' && (
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canEdit && r.status === 'Draft' && (
                        <button className="btn btn-xs btn-primary" onClick={() => setConfirmSubmit(r)}>Submit</button>
                      )}
                      {canApprove && r.status === 'Submitted' && (
                        <button className="btn btn-xs btn-primary" onClick={() => setConfirmApprove(r)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>check</span> Approve
                        </button>
                      )}
                      {canApprove && r.status === 'Approved' && (
                        <button className="btn btn-xs btn-primary" onClick={() => openPay(r)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>paid</span> Mark Paid
                        </button>
                      )}
                      {canEdit && ['Draft', 'Submitted', 'Approved'].includes(r.status) && (
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmCancel(r)}>Cancel</button>
                      )}
                      {canEdit && r.status === 'Draft' && (
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(r)} title="Delete">
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editRow ? 'Edit Incentive' : 'New Incentive'}>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Employee *</label>
            <select className="form-control" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Incentive Type *</label>
            <select className="form-control" value={form.incentive_type} onChange={e => setForm(f => ({ ...f, incentive_type: e.target.value }))}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Period</label>
            <input className="form-control" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="e.g. Q1 2026" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Amount *</label>
            <input type="number" step="0.01" min="0" className="form-control"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Currency</label>
            <select className="form-control" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              <option>USD</option><option>ZWL</option><option>ZAR</option><option>EUR</option><option>GBP</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Earned Date *</label>
            <input type="date" className="form-control" value={form.earned_date}
              onChange={e => setForm(f => ({ ...f, earned_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={!!payRow} onClose={() => setPayRow(null)} title="Mark Incentive as Paid">
        {payRow && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
              <div><strong>Employee:</strong> {payRow.employees?.name}</div>
              <div><strong>Amount:</strong> ${fmt(payRow.amount)} {payRow.currency}</div>
              <div><strong>Period:</strong> {payRow.period || '—'}</div>
            </div>
            <div className="form-group">
              <label>Paid Date *</label>
              <input type="date" className="form-control" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setPayRow(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handlePay} disabled={acting}>{acting ? 'Saving…' : 'Confirm Payment'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmSubmit} onClose={() => setConfirmSubmit(null)} onConfirm={handleSubmit}
        title="Submit Incentive"
        message={`Submit incentive ${confirmSubmit?.ref_number} for approval?`}
        confirmLabel={acting ? 'Submitting…' : 'Submit'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmApprove} onClose={() => setConfirmApprove(null)} onConfirm={handleApprove}
        title="Approve Incentive"
        message={`Approve incentive ${confirmApprove?.ref_number} for $${fmt(confirmApprove?.amount)} ${confirmApprove?.currency || ''}?`}
        confirmLabel={acting ? 'Approving…' : 'Approve'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={handleCancel}
        title="Cancel Incentive"
        message={`Cancel incentive ${confirmCancel?.ref_number}?`}
        confirmLabel={acting ? 'Cancelling…' : 'Cancel Incentive'} danger loading={acting}
      />

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Incentive"
        message={`Delete incentive ${confirmDel?.ref_number}? This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />
    </div>
  )
}
