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

const STATUS_COLOR = { Draft: 'yellow', Submitted: 'blue', Posted: 'green', Cancelled: 'text-dim' }

const COMP_TYPE_COLOR = { earning: 'green', deduction: 'red', employer_contribution: 'purple' }
const COMP_TYPE_LABEL = { earning: 'Earning', deduction: 'Deduction', employer_contribution: 'Employer Contrib.' }

const BLANK_FORM = {
  employee_id: '',
  original_slip_id: '',
  correction_date: '',
  reason: '',
  currency: 'USD',
  notes: '',
}

const todayStr = () => new Date().toISOString().split('T')[0]
const pad6 = (n) => String(n).padStart(6, '0')

export default function PayrollCorrections() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'payroll-corrections')
  const canApprove = useCanApprove('hr', 'payroll-corrections')

  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [form, setForm] = useState(BLANK_FORM)
  const [lines, setLines] = useState([])
  const [slipsForEmp, setSlipsForEmp] = useState([])
  const [loadingSlip, setLoadingSlip] = useState(false)

  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [confirmSubmit, setConfirmSubmit] = useState(null)
  const [confirmPost, setConfirmPost] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cData, error: cErr }, { data: eData }] = await Promise.all([
      supabase
        .from('payroll_corrections')
        .select('*, employees(name, employee_number), salary_slips:original_slip_id(slip_number)')
        .order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
    ])
    if (cErr) toast.error('Failed to load: ' + cErr.message)
    setRows(cData || [])
    setEmployees(eData || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const nextRef = (existing) => {
    const nums = existing.map(r => parseInt((r.ref_number || '').replace('PCR-', ''), 10)).filter(n => !isNaN(n))
    const max = nums.length ? Math.max(...nums) : 0
    return `PCR-${pad6(max + 1)}`
  }

  const fetchSlipsForEmp = useCallback(async (empId) => {
    if (!empId) { setSlipsForEmp([]); return }
    const { data } = await supabase
      .from('salary_slips')
      .select('id, slip_number, start_date, end_date, net_pay, currency')
      .eq('employee_id', empId)
      .eq('status', 'Submitted')
      .order('start_date', { ascending: false })
    setSlipsForEmp(data || [])
  }, [])

  const loadSlipComponents = useCallback(async (slipId) => {
    if (!slipId) { setLines([]); return }
    setLoadingSlip(true)
    const { data: slip } = await supabase
      .from('salary_slips')
      .select('basic_salary, currency')
      .eq('id', slipId)
      .maybeSingle()
    const { data: comps } = await supabase
      .from('salary_slip_components')
      .select('*')
      .eq('slip_id', slipId)
      .order('sort_order')

    const baseLines = []
    if (slip && Number(slip.basic_salary) > 0) {
      baseLines.push({
        id: crypto.randomUUID(),
        component_name: 'Basic Salary',
        component_type: 'earning',
        original_amount: Number(slip.basic_salary),
        corrected_amount: Number(slip.basic_salary),
        sort_order: -1,
      })
    }
    for (const c of (comps || [])) {
      baseLines.push({
        id: crypto.randomUUID(),
        component_name: c.component_name,
        component_type: c.component_type,
        original_amount: Number(c.amount || 0),
        corrected_amount: Number(c.amount || 0),
        sort_order: c.sort_order ?? 0,
      })
    }
    setLines(baseLines)
    if (slip?.currency) setForm(f => ({ ...f, currency: slip.currency }))
    setLoadingSlip(false)
  }, [])

  const loadEditLines = useCallback(async (correctionId) => {
    setLoadingSlip(true)
    const { data } = await supabase
      .from('payroll_correction_lines')
      .select('*')
      .eq('correction_id', correctionId)
      .order('sort_order')
    setLines((data || []).map(l => ({
      id: l.id,
      component_name: l.component_name,
      component_type: l.component_type,
      original_amount: Number(l.original_amount || 0),
      corrected_amount: Number(l.corrected_amount || 0),
      sort_order: l.sort_order ?? 0,
    })))
    setLoadingSlip(false)
  }, [])

  const openNew = () => {
    setEditRow(null)
    setForm({ ...BLANK_FORM, correction_date: todayStr() })
    setLines([])
    setSlipsForEmp([])
    setShowForm(true)
  }

  const openEdit = async (r) => {
    setEditRow(r)
    setForm({
      employee_id: r.employee_id || '',
      original_slip_id: r.original_slip_id || '',
      correction_date: r.correction_date || '',
      reason: r.reason || '',
      currency: r.currency || 'USD',
      notes: r.notes || '',
    })
    await fetchSlipsForEmp(r.employee_id)
    await loadEditLines(r.id)
    setShowForm(true)
  }

  const onEmployeeChange = async (empId) => {
    setForm(f => ({ ...f, employee_id: empId, original_slip_id: '' }))
    setLines([])
    await fetchSlipsForEmp(empId)
  }

  const onSlipChange = async (slipId) => {
    setForm(f => ({ ...f, original_slip_id: slipId }))
    if (slipId) await loadSlipComponents(slipId)
    else setLines([])
  }

  const updateLineAmount = (id, val) => {
    setLines(ls => ls.map(l => l.id === id ? { ...l, corrected_amount: val } : l))
  }

  const totalDiff = lines.reduce((a, l) => {
    const diff = Number(l.corrected_amount || 0) - Number(l.original_amount || 0)
    return a + diff
  }, 0)

  const handleSave = async () => {
    if (!form.employee_id) { toast.error('Employee is required'); return }
    if (!form.original_slip_id) { toast.error('Original slip is required'); return }
    if (!form.correction_date) { toast.error('Correction date is required'); return }
    if (!form.reason.trim()) { toast.error('Reason is required'); return }
    if (lines.length === 0) { toast.error('No lines to correct'); return }

    setSaving(true)
    try {
      if (editRow) {
        const { error: uErr } = await supabase.from('payroll_corrections').update({
          employee_id: form.employee_id,
          original_slip_id: form.original_slip_id,
          correction_date: form.correction_date,
          reason: form.reason.trim(),
          currency: form.currency,
          total_diff: totalDiff,
          notes: form.notes || null,
        }).eq('id', editRow.id)
        if (uErr) throw uErr

        await supabase.from('payroll_correction_lines').delete().eq('correction_id', editRow.id)
        const linePayload = lines.map(l => ({
          id: crypto.randomUUID(),
          correction_id: editRow.id,
          component_name: l.component_name,
          component_type: l.component_type,
          original_amount: Number(l.original_amount || 0),
          corrected_amount: Number(l.corrected_amount || 0),
          difference: Number(l.corrected_amount || 0) - Number(l.original_amount || 0),
          sort_order: l.sort_order ?? 0,
        }))
        if (linePayload.length) {
          const { error: lErr } = await supabase.from('payroll_correction_lines').insert(linePayload)
          if (lErr) throw lErr
        }
        toast.success('Correction updated')
      } else {
        const correctionId = crypto.randomUUID()
        const { error: iErr } = await supabase.from('payroll_corrections').insert([{
          id: correctionId,
          ref_number: nextRef(rows),
          original_slip_id: form.original_slip_id,
          employee_id: form.employee_id,
          correction_date: form.correction_date,
          reason: form.reason.trim(),
          total_diff: totalDiff,
          currency: form.currency,
          status: 'Draft',
          notes: form.notes || null,
          created_by: user?.full_name || user?.username || '',
        }])
        if (iErr) throw iErr

        const linePayload = lines.map(l => ({
          id: crypto.randomUUID(),
          correction_id: correctionId,
          component_name: l.component_name,
          component_type: l.component_type,
          original_amount: Number(l.original_amount || 0),
          corrected_amount: Number(l.corrected_amount || 0),
          difference: Number(l.corrected_amount || 0) - Number(l.original_amount || 0),
          sort_order: l.sort_order ?? 0,
        }))
        if (linePayload.length) {
          const { error: lErr } = await supabase.from('payroll_correction_lines').insert(linePayload)
          if (lErr) throw lErr
        }
        toast.success('Correction created')
      }
      setShowForm(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSubmit = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('payroll_corrections').update({ status: 'Submitted' }).eq('id', confirmSubmit.id)
      if (error) throw error
      toast.success('Correction submitted')
      setConfirmSubmit(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handlePost = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('payroll_corrections').update({
        status: 'Posted',
        posted_at: new Date().toISOString(),
        posted_by: user?.full_name || user?.username || '',
      }).eq('id', confirmPost.id)
      if (error) throw error
      toast.success('Correction posted')
      setConfirmPost(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleCancel = async () => {
    setActing(true)
    try {
      const { error } = await supabase.from('payroll_corrections').update({ status: 'Cancelled' }).eq('id', confirmCancel.id)
      if (error) throw error
      toast.success('Correction cancelled')
      setConfirmCancel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleDelete = async () => {
    setActing(true)
    try {
      await supabase.from('payroll_correction_lines').delete().eq('correction_id', confirmDel.id)
      const { error } = await supabase.from('payroll_corrections').delete().eq('id', confirmDel.id)
      if (error) throw error
      toast.success('Correction deleted')
      setConfirmDel(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const kpiTotal = rows.length
  const kpiDraft = rows.filter(r => r.status === 'Draft').length
  const kpiPosted = rows.filter(r => r.status === 'Posted').length
  const kpiNetDiff = rows.filter(r => r.status === 'Posted').reduce((a, r) => a + Number(r.total_diff || 0), 0)

  return (
    <div>
      <PageHeader title="Payroll Corrections">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Correction
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"    value={kpiTotal}                              icon="rule"            color="blue"   />
        <KPICard label="Draft"    value={kpiDraft}                              icon="drafts"          color="yellow" />
        <KPICard label="Posted"   value={kpiPosted}                             icon="task_alt"        color="green"  />
        <KPICard label="Net Diff" value={`$${fmt(kpiNetDiff)}`}                 icon="trending_up"     color={kpiNetDiff >= 0 ? 'green' : 'red'} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="rule" message="No payroll corrections yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Original Slip</th>
                <th>Correction Date</th>
                <th>Diff</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)', fontFamily: 'monospace' }}>{r.ref_number}</td>
                  <td>{r.employees?.name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.salary_slips?.slip_number || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.correction_date || '—'}</td>
                  <td style={{ fontWeight: 700, color: Number(r.total_diff || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {Number(r.total_diff || 0) >= 0 ? '+' : ''}${fmt(r.total_diff)} {r.currency}
                  </td>
                  <td><StatusBadge status={r.status?.toLowerCase()} label={r.status} color={STATUS_COLOR[r.status]} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {canEdit && r.status === 'Draft' && (
                        <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canEdit && r.status === 'Draft' && (
                        <button className="btn btn-xs btn-primary" onClick={() => setConfirmSubmit(r)}>
                          Submit
                        </button>
                      )}
                      {canApprove && r.status === 'Submitted' && (
                        <button className="btn btn-xs btn-primary" onClick={() => setConfirmPost(r)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>task_alt</span> Post
                        </button>
                      )}
                      {canEdit && (r.status === 'Draft' || r.status === 'Submitted') && (
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

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editRow ? 'Edit Payroll Correction' : 'New Payroll Correction'} size="lg">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Employee *</label>
              <select className="form-control" value={form.employee_id} onChange={e => onEmployeeChange(e.target.value)} disabled={!!editRow}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Original Slip *</label>
              <select className="form-control" value={form.original_slip_id} onChange={e => onSlipChange(e.target.value)} disabled={!form.employee_id || !!editRow}>
                <option value="">Select slip…</option>
                {slipsForEmp.map(s => (
                  <option key={s.id} value={s.id}>{s.slip_number} ({s.start_date} – {s.end_date}) — ${fmt(s.net_pay)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Correction Date *</label>
              <input type="date" className="form-control" value={form.correction_date}
                onChange={e => setForm(f => ({ ...f, correction_date: e.target.value }))} />
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
            <textarea className="form-control" rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why is this correction needed?" />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Component Adjustments</div>
              {loadingSlip && <Spinner />}
            </div>
            {lines.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: 13 }}>
                Select an original slip to load its components.
              </div>
            ) : (
              <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="stock-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Type</th>
                      <th style={{ width: 120 }}>Original</th>
                      <th style={{ width: 140 }}>Corrected</th>
                      <th style={{ width: 120 }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => {
                      const diff = Number(l.corrected_amount || 0) - Number(l.original_amount || 0)
                      const color = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text-dim)'
                      return (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600 }}>{l.component_name}</td>
                          <td>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: `var(--${COMP_TYPE_COLOR[l.component_type]})18`,
                              color: `var(--${COMP_TYPE_COLOR[l.component_type]})`,
                              border: `1px solid var(--${COMP_TYPE_COLOR[l.component_type]})44`,
                            }}>
                              {COMP_TYPE_LABEL[l.component_type] || l.component_type}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'monospace' }}>${fmt(l.original_amount)}</td>
                          <td>
                            <input type="number" step="0.01" className="form-control" style={{ height: 30, fontSize: 13 }}
                              value={l.corrected_amount}
                              onChange={e => updateLineAmount(l.id, e.target.value)} />
                          </td>
                          <td style={{ fontWeight: 700, color, fontFamily: 'monospace' }}>
                            {diff >= 0 ? '+' : ''}${fmt(diff)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, padding: '10px 8px' }}>Total Difference:</td>
                      <td style={{ fontWeight: 800, fontSize: 15, color: totalDiff >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'monospace', padding: '10px 8px' }}>
                        {totalDiff >= 0 ? '+' : ''}${fmt(totalDiff)} {form.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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

      <ConfirmDialog
        open={!!confirmSubmit} onClose={() => setConfirmSubmit(null)} onConfirm={handleSubmit}
        title="Submit Correction"
        message={`Submit correction ${confirmSubmit?.ref_number} for approval?`}
        confirmLabel={acting ? 'Submitting…' : 'Submit'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmPost} onClose={() => setConfirmPost(null)} onConfirm={handlePost}
        title="Post Correction"
        message={`Post correction ${confirmPost?.ref_number}? Net difference: ${Number(confirmPost?.total_diff || 0) >= 0 ? '+' : ''}$${fmt(confirmPost?.total_diff)} ${confirmPost?.currency || ''}.`}
        confirmLabel={acting ? 'Posting…' : 'Post'} loading={acting}
      />

      <ConfirmDialog
        open={!!confirmCancel} onClose={() => setConfirmCancel(null)} onConfirm={handleCancel}
        title="Cancel Correction"
        message={`Cancel correction ${confirmCancel?.ref_number}?`}
        confirmLabel={acting ? 'Cancelling…' : 'Cancel Correction'} danger loading={acting}
      />

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Correction"
        message={`Delete correction ${confirmDel?.ref_number}? This cannot be undone.`}
        confirmLabel={acting ? 'Deleting…' : 'Delete'} danger loading={acting}
      />
    </div>
  )
}
