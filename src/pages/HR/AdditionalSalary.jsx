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

const CURRENCIES = ['USD', 'ZiG', 'ZWL']
const TYPES = ['Earning', 'Deduction']
const STATUSES = ['Draft', 'Submitted', 'Paid', 'Cancelled']
const pad6 = (n) => String(n).padStart(6, '0')
const todayStr = () => new Date().toISOString().split('T')[0]

const BLANK_FORM = {
  employee_id: '',
  type: 'Earning',
  salary_component_id: '',
  component_name: '',
  amount: '',
  currency: 'USD',
  payable_date: '',
  is_taxable: false,
  is_recurring: false,
  recurring_until: '',
  reason: '',
  notes: '',
}

export default function AdditionalSalary() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'additional-salary')
  const canApprove = useCanApprove('hr', 'additional-salary')

  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterEmp, setFilterEmp] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  const [confirmPaid, setConfirmPaid] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [confirmSubmit, setConfirmSubmit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [acting, setActing] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [aRes, eRes, cRes] = await Promise.all([
      supabase.from('additional_salary')
        .select('*, employees(name, employee_number)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
      supabase.from('salary_components').select('id, name, component_type').order('name'),
    ])
    if (aRes.error) toast.error('Failed to load: ' + aRes.error.message)
    setRows(aRes.data || [])
    setEmployees(eRes.data || [])
    setComponents(cRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextRef = () => {
    const nums = rows.map(r => parseInt((r.ref_number || '').replace('ADS-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `ADS-${pad6(max + 1)}`
  }

  const openNew = () => {
    setEditRow(null)
    setForm({ ...BLANK_FORM, payable_date: todayStr() })
    setShowForm(true)
  }

  const openEdit = (r) => {
    setEditRow(r)
    setForm({
      employee_id: r.employee_id || '',
      type: r.type || 'Earning',
      salary_component_id: r.salary_component_id || '',
      component_name: r.component_name || '',
      amount: r.amount ?? '',
      currency: r.currency || 'USD',
      payable_date: r.payable_date || '',
      is_taxable: !!r.is_taxable,
      is_recurring: !!r.is_recurring,
      recurring_until: r.recurring_until || '',
      reason: r.reason || '',
      notes: r.notes || '',
    })
    setShowForm(true)
  }

  const handleComponentChange = (id) => {
    const c = components.find(x => x.id === id)
    setForm(f => ({
      ...f,
      salary_component_id: id,
      component_name: c?.name || f.component_name,
    }))
  }

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.type) { toast.error('Type is required'); return }
    if (!form.component_name.trim()) { toast.error('Component name is required'); return }
    if (form.amount === '' || isNaN(Number(form.amount)) || Number(form.amount) <= 0) { toast.error('Amount must be > 0'); return }
    if (!form.payable_date) { toast.error('Payable date is required'); return }
    if (form.is_recurring && !form.recurring_until) { toast.error('Recurring until date is required'); return }

    setSaving(true)
    try {
      const payload = {
        employee_id: form.employee_id,
        type: form.type,
        salary_component_id: form.salary_component_id || null,
        component_name: form.component_name.trim(),
        amount: Number(form.amount),
        currency: form.currency || 'USD',
        payable_date: form.payable_date,
        is_taxable: !!form.is_taxable,
        is_recurring: !!form.is_recurring,
        recurring_until: form.is_recurring ? form.recurring_until : null,
        reason: form.reason || null,
        notes: form.notes || null,
      }

      if (editRow) {
        const { error } = await supabase.from('additional_salary').update(payload).eq('id', editRow.id)
        if (error) throw error
        toast.success('Entry updated')
      } else {
        const { error } = await supabase.from('additional_salary').insert([{
          id: crypto.randomUUID(),
          ref_number: nextRef(),
          ...payload,
          status: 'Draft',
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
        toast.success('Entry created')
      }
      setShowForm(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const runStatus = async (row, status) => {
    const { error } = await supabase.from('additional_salary').update({ status }).eq('id', row.id)
    if (error) throw error
  }

  const handleSubmit = async () => {
    if (!confirmSubmit) return
    setActing(true)
    try { await runStatus(confirmSubmit, 'Submitted'); toast.success('Entry submitted'); setConfirmSubmit(null); fetchAll() }
    catch (err) { toast.error(err.message) } finally { setActing(false) }
  }
  const handlePaid = async () => {
    if (!confirmPaid) return
    setActing(true)
    try { await runStatus(confirmPaid, 'Paid'); toast.success('Marked as paid'); setConfirmPaid(null); fetchAll() }
    catch (err) { toast.error(err.message) } finally { setActing(false) }
  }
  const handleCancel = async () => {
    if (!confirmCancel) return
    setActing(true)
    try { await runStatus(confirmCancel, 'Cancelled'); toast.success('Entry cancelled'); setConfirmCancel(null); fetchAll() }
    catch (err) { toast.error(err.message) } finally { setActing(false) }
  }
  const handleDelete = async () => {
    if (!confirmDel) return
    setActing(true)
    try {
      const { error } = await supabase.from('additional_salary').delete().eq('id', confirmDel.id)
      if (error) throw error
      toast.success('Entry deleted')
      setConfirmDel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) } finally { setActing(false) }
  }

  const filtered = rows.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false
    if (filterType && r.type !== filterType) return false
    if (filterStatus && r.status !== filterStatus) return false
    if (filterYear || filterMonth) {
      if (!r.payable_date) return false
      const d = new Date(r.payable_date)
      if (filterYear && String(d.getFullYear()) !== filterYear) return false
      if (filterMonth && String(d.getMonth() + 1).padStart(2, '0') !== filterMonth) return false
    }
    return true
  })

  const kpiTotal = rows.length
  const kpiDraft = rows.filter(r => r.status === 'Draft').length
  const kpiSubmitted = rows.filter(r => r.status === 'Submitted').length
  const kpiPaid = rows.filter(r => r.status === 'Paid').length
  const kpiSubmittedAmt = rows.filter(r => r.status === 'Submitted').reduce((a, r) => a + Number(r.amount || 0), 0)

  const yearOptions = Array.from(new Set(rows.map(r => r.payable_date ? new Date(r.payable_date).getFullYear() : null).filter(Boolean))).sort().reverse()

  return (
    <div>
      <PageHeader title="Additional Salary" subtitle="Manage one-off and recurring earnings or deductions">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Entry
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"               value={kpiTotal}                       icon="receipt_long"  color="blue"   />
        <KPICard label="Draft"               value={kpiDraft}                       icon="edit_note"     color="text-dim" />
        <KPICard label="Submitted"           value={kpiSubmitted}                   icon="outbox"        color="yellow" />
        <KPICard label="Paid"                value={kpiPaid}                        icon="check_circle"  color="green"  />
        <KPICard label="Submitted (Amount)"  value={`$${fmt(kpiSubmittedAmt)}`}     icon="payments"      color="teal"   />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Employee</label>
          <select className="form-control" style={{ width: 200 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Type</label>
          <select className="form-control" style={{ width: 130 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Status</label>
          <select className="form-control" style={{ width: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Year</label>
          <select className="form-control" style={{ width: 110 }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All</option>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 11 }}>Month</label>
          <select className="form-control" style={{ width: 130 }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">All</option>
            {Array.from({ length: 12 }).map((_, i) => {
              const v = String(i + 1).padStart(2, '0')
              return <option key={v} value={v}>{v}</option>
            })}
          </select>
        </div>
        {(filterEmp || filterType || filterStatus || filterYear || filterMonth) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterType(''); setFilterStatus(''); setFilterYear(''); setFilterMonth('') }}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="receipt_long" message="No entries found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Component</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Payable Date</th>
                <th>Status</th>
                <th>Recurring</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace' }}>{r.ref_number}</td>
                  <td>{r.employees?.name || '—'}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: r.type === 'Earning' ? 'var(--green)18' : 'var(--red)18',
                      color: r.type === 'Earning' ? 'var(--green)' : 'var(--red)',
                      border: `1px solid ${r.type === 'Earning' ? 'var(--green)' : 'var(--red)'}44`,
                    }}>
                      {r.type}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.component_name || '—'}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: r.type === 'Earning' ? 'var(--green)' : 'var(--red)',
                  }}>
                    {r.type === 'Earning' ? '+' : '−'}${fmt(r.amount)} {r.currency}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.payable_date || '—'}</td>
                  <td><StatusBadge status={r.status?.toLowerCase()} label={r.status} /></td>
                  <td>
                    {r.is_recurring
                      ? <span style={{ fontSize: 11, color: 'var(--purple)' }}>↻ until {r.recurring_until || '—'}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {canEdit && r.status === 'Draft' && (
                        <>
                          <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-xs btn-primary" onClick={() => setConfirmSubmit(r)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>outbox</span> Submit
                          </button>
                        </>
                      )}
                      {canApprove && r.status === 'Submitted' && (
                        <button className="btn btn-xs btn-primary" onClick={() => setConfirmPaid(r)} style={{ background: 'var(--green)' }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>payments</span> Mark Paid
                        </button>
                      )}
                      {canEdit && (r.status === 'Draft' || r.status === 'Submitted') && (
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmCancel(r)}>
                          Cancel
                        </button>
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

      <ModalDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        size="lg"
        title={editRow ? `Edit Entry · ${editRow.ref_number}` : 'New Additional Salary Entry'}
      >
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Employee *</label>
            <select className="form-control" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Type *</label>
            <select
              className="form-control"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{
                borderColor: form.type === 'Earning' ? 'var(--green)' : 'var(--red)',
                color: form.type === 'Earning' ? 'var(--green)' : 'var(--red)',
                fontWeight: 600,
              }}
            >
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Salary Component</label>
            <select className="form-control" value={form.salary_component_id} onChange={e => handleComponentChange(e.target.value)}>
              <option value="">(Free text)</option>
              {components.map(c => <option key={c.id} value={c.id}>{c.name} · {c.component_type}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Component Name *</label>
            <input className="form-control" value={form.component_name}
              onChange={e => setForm(f => ({ ...f, component_name: e.target.value }))}
              placeholder="e.g. Bonus, Loan Recovery" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Amount *</label>
            <input type="number" step="0.01" min="0" className="form-control"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Currency</label>
            <select className="form-control" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Payable Date *</label>
            <input type="date" className="form-control" value={form.payable_date}
              onChange={e => setForm(f => ({ ...f, payable_date: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_taxable}
                onChange={e => setForm(f => ({ ...f, is_taxable: e.target.checked }))} />
              <span>Taxable</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_recurring}
                onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              <span>Recurring</span>
            </label>
          </div>

          {form.is_recurring && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Recurring Until *</label>
              <input type="date" className="form-control" value={form.recurring_until}
                onChange={e => setForm(f => ({ ...f, recurring_until: e.target.value }))} />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Reason</label>
            <input className="form-control" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create Entry'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmSubmit} onClose={() => setConfirmSubmit(null)} onConfirm={handleSubmit}
        title="Submit Entry"
        message={`Submit ${confirmSubmit?.ref_number} for approval?`}
        confirmLabel={acting ? 'Submitting…' : 'Submit'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmPaid} onClose={() => setConfirmPaid(null)} onConfirm={handlePaid}
        title="Mark as Paid"
        message={`Mark ${confirmPaid?.ref_number} (${confirmPaid?.type} of $${fmt(confirmPaid?.amount)} ${confirmPaid?.currency}) as paid?`}
        confirmLabel={acting ? 'Updating…' : 'Mark Paid'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={handleCancel}
        title="Cancel Entry"
        message={`Cancel ${confirmCancel?.ref_number}? It will be marked as cancelled.`}
        confirmLabel={acting ? 'Cancelling…' : 'Cancel Entry'} danger loading={acting}
      />

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Entry"
        message={`Delete ${confirmDel?.ref_number}? This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />
    </div>
  )
}
