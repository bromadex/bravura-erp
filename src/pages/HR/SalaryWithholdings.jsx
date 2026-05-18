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

const STATUS_COLOR = { Withheld: 'red', Released: 'green', Cancelled: 'text-dim' }

const BLANK_FORM = {
  employee_id: '',
  total_amount: '',
  currency: 'USD',
  reason: '',
  withheld_from_date: '',
  notes: '',
}

const todayStr = () => new Date().toISOString().split('T')[0]

function pad6(n) { return String(n).padStart(6, '0') }

export default function SalaryWithholdings() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'salary-withholdings')
  const canApprove = useCanApprove('hr', 'salary-withholdings')

  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [filterEmp, setFilterEmp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)

  const [releaseRow, setReleaseRow] = useState(null)
  const [releaseForm, setReleaseForm] = useState({ release_date: todayStr(), notes: '' })
  const [releasing, setReleasing] = useState(false)

  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [acting, setActing] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: wData, error: wErr }, { data: eData }] = await Promise.all([
      supabase
        .from('salary_withholdings')
        .select('*, employees(name, employee_number)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
    ])
    if (wErr) toast.error('Failed to load: ' + wErr.message)
    setRows(wData || [])
    setEmployees(eData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextRef = (existing) => {
    const nums = existing.map(r => parseInt((r.ref_number || '').replace('SWH-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `SWH-${pad6(max + 1)}`
  }

  const openNew = () => { setEditRow(null); setForm({ ...BLANK_FORM, withheld_from_date: todayStr() }); setShowForm(true) }

  const openEdit = (r) => {
    setEditRow(r)
    setForm({
      employee_id: r.employee_id || '',
      total_amount: r.total_amount ?? '',
      currency: r.currency || 'USD',
      reason: r.reason || '',
      withheld_from_date: r.withheld_from_date || '',
      notes: r.notes || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.total_amount || Number(form.total_amount) <= 0) { toast.error('Amount must be greater than 0'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (!form.withheld_from_date) { toast.error('Withheld from date is required'); return }
    setSaving(true)
    try {
      if (editRow) {
        const { error } = await supabase.from('salary_withholdings').update({
          employee_id: form.employee_id,
          total_amount: Number(form.total_amount),
          currency: form.currency,
          reason: form.reason.trim(),
          withheld_from_date: form.withheld_from_date,
          notes: form.notes || null,
        }).eq('id', editRow.id)
        if (error) throw error
        toast.success('Withholding updated')
      } else {
        const { error } = await supabase.from('salary_withholdings').insert([{
          id: crypto.randomUUID(),
          ref_number: nextRef(rows),
          employee_id: form.employee_id,
          total_amount: Number(form.total_amount),
          currency: form.currency,
          reason: form.reason.trim(),
          withheld_from_date: form.withheld_from_date,
          notes: form.notes || null,
          status: 'Withheld',
          created_by: user?.full_name || user?.username || '',
        }])
        if (error) throw error
        toast.success('Withholding created')
      }
      setShowForm(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const openRelease = (r) => {
    setReleaseRow(r)
    setReleaseForm({ release_date: todayStr(), notes: r.notes || '' })
  }

  const handleRelease = async () => {
    if (!releaseForm.release_date) { toast.error('Release date is required'); return }
    setReleasing(true)
    try {
      const { error } = await supabase.from('salary_withholdings').update({
        status: 'Released',
        release_date: releaseForm.release_date,
        notes: releaseForm.notes || null,
      }).eq('id', releaseRow.id)
      if (error) throw error
      toast.success('Withholding released')
      setReleaseRow(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setReleasing(false) }
  }

  const handleCancel = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('salary_withholdings').update({ status: 'Cancelled' }).eq('id', confirmCancel.id)
      if (error) throw error
      toast.success('Withholding cancelled')
      setConfirmCancel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleDelete = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('salary_withholdings').delete().eq('id', confirmDel.id)
      if (error) throw error
      toast.success('Withholding deleted')
      setConfirmDel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const filtered = rows.filter(r => {
    if (filterEmp && r.employee_id !== filterEmp) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  const kpiTotal = rows.length
  const kpiWithheld = rows.filter(r => r.status === 'Withheld').length
  const kpiReleased = rows.filter(r => r.status === 'Released').length
  const kpiHeldAmt = rows.filter(r => r.status === 'Withheld').reduce((a, r) => a + Number(r.total_amount || 0), 0)

  return (
    <div>
      <PageHeader title="Salary Withholdings">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Withholding
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"             value={kpiTotal}              icon="account_balance"  color="blue"   />
        <KPICard label="Withheld"          value={kpiWithheld}           icon="lock"             color="red"    />
        <KPICard label="Released"          value={kpiReleased}           icon="lock_open"        color="green"  />
        <KPICard label="Total Held Amount" value={`$${fmt(kpiHeldAmt)}`} icon="payments"         color="teal"   />
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
          <label style={{ fontSize: 11 }}>Status</label>
          <select className="form-control" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option>Withheld</option><option>Released</option><option>Cancelled</option>
          </select>
        </div>
        {(filterEmp || filterStatus) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEmp(''); setFilterStatus('') }}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="account_balance" message="No withholdings found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Withheld From</th>
                <th>Release Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: 'monospace' }}>{r.ref_number}</td>
                  <td>{r.employees?.name || '—'}</td>
                  <td style={{ fontWeight: 700 }}>${fmt(r.total_amount)} {r.currency}</td>
                  <td style={{ maxWidth: 240, fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
                  <td style={{ fontSize: 12 }}>{r.withheld_from_date || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.release_date || '—'}</td>
                  <td><StatusBadge status={r.status?.toLowerCase()} label={r.status} color={STATUS_COLOR[r.status]} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {canEdit && r.status === 'Withheld' && (
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canApprove && r.status === 'Withheld' && (
                        <button className="btn btn-xs btn-primary" onClick={() => openRelease(r)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>lock_open</span> Release
                        </button>
                      )}
                      {canEdit && r.status === 'Withheld' && (
                        <button className="btn btn-xs btn-danger" onClick={() => setConfirmCancel(r)}>
                          Cancel
                        </button>
                      )}
                      {canEdit && r.status !== 'Released' && (
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

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editRow ? 'Edit Withholding' : 'New Withholding'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Total Amount *</label>
              <input type="number" step="0.01" min="0" className="form-control"
                value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Currency</label>
              <select className="form-control" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                <option>USD</option><option>ZWL</option><option>ZAR</option><option>EUR</option><option>GBP</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Reason *</label>
            <textarea className="form-control" rows={3} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why is this salary being withheld?" />
          </div>
          <div className="form-group">
            <label>Withheld From Date *</label>
            <input type="date" className="form-control" value={form.withheld_from_date} onChange={e => setForm(f => ({ ...f, withheld_from_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ModalDialog open={!!releaseRow} onClose={() => setReleaseRow(null)} title="Release Withholding">
        {releaseRow && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
              <div><strong>Employee:</strong> {releaseRow.employees?.name}</div>
              <div><strong>Amount:</strong> ${fmt(releaseRow.total_amount)} {releaseRow.currency}</div>
              <div><strong>Reason:</strong> {releaseRow.reason}</div>
            </div>
            <div className="form-group">
              <label>Release Date *</label>
              <input type="date" className="form-control" value={releaseForm.release_date}
                onChange={e => setReleaseForm(f => ({ ...f, release_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={releaseForm.notes}
                onChange={e => setReleaseForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setReleaseRow(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleRelease} disabled={releasing}>
            {releasing ? 'Releasing…' : 'Confirm Release'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={handleCancel}
        title="Cancel Withholding"
        message={`Cancel withholding ${confirmCancel?.ref_number}? It will be marked as cancelled.`}
        confirmLabel={acting ? 'Cancelling…' : 'Cancel Withholding'} danger loading={acting}
      />

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Withholding"
        message={`Delete withholding ${confirmDel?.ref_number}? This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />
    </div>
  )
}
