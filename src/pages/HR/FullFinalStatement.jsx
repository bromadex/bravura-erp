import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const FNF_STATUSES = ['Draft', 'Submitted', 'Paid', 'Cancelled']

const statusColor = s =>
  s === 'Paid' ? 'var(--green)' :
  s === 'Submitted' ? 'var(--blue)' :
  s === 'Cancelled' ? 'var(--red)' :
  'var(--text-dim)'

const fmt = n => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

const emptyForm = () => ({
  employee_id: '', separation_id: '', transaction_date: new Date().toISOString().split('T')[0],
  status: 'Draft', notes: '',
})

const emptyComponent = () => ({ id: crypto.randomUUID(), description: '', amount: '' })

export default function FullFinalStatement() {
  const { user }   = useAuth()
  const canEdit    = useCanEdit('hr', 'full-final-statement')
  const canApprove = useCanApprove('hr', 'full-final-statement')

  const [statements,  setStatements]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)

  const [employees,   setEmployees]   = useState([])
  const [separations, setSeparations] = useState([])
  const [empSeps,     setEmpSeps]     = useState([])

  const [showModal,   setShowModal]   = useState(false)
  const [editStmt,    setEditStmt]    = useState(null)
  const [form,        setForm]        = useState(emptyForm())
  const [payables,    setPayables]    = useState([emptyComponent()])
  const [receivables, setReceivables] = useState([emptyComponent()])

  const [confirmDel,  setConfirmDel]  = useState(null)

  const fetchStatements = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('full_and_final_statements')
      .select('*, employees(full_name, employee_id), employee_separations(separation_number)')
      .order('created_at', { ascending: false })
    setStatements(data || [])
    setLoading(false)
  }, [])

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id, full_name, employee_id').order('full_name')
    setEmployees(data || [])
  }, [])

  const fetchAllSeparations = useCallback(async () => {
    const { data } = await supabase
      .from('employee_separations')
      .select('id, separation_number, employee_id, status')
      .order('created_at', { ascending: false })
    setSeparations(data || [])
  }, [])

  useEffect(() => {
    fetchStatements()
    fetchEmployees()
    fetchAllSeparations()
  }, [fetchStatements, fetchEmployees, fetchAllSeparations])

  useEffect(() => {
    if (form.employee_id) {
      setEmpSeps(separations.filter(s => s.employee_id === form.employee_id))
    } else {
      setEmpSeps([])
    }
  }, [form.employee_id, separations])

  const kpi = {
    total:     statements.length,
    draft:     statements.filter(s => s.status === 'Draft').length,
    submitted: statements.filter(s => s.status === 'Submitted').length,
    paid:      statements.filter(s => s.status === 'Paid').length,
  }

  const calcTotals = (pays, recs) => {
    const totalPayable    = pays.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
    const totalReceivable = recs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
    const netAmount       = totalReceivable - totalPayable
    return { totalPayable, totalReceivable, netAmount }
  }

  const { totalPayable, totalReceivable, netAmount } = calcTotals(payables, receivables)

  const openNew = () => {
    setEditStmt(null)
    setForm(emptyForm())
    setPayables([emptyComponent()])
    setReceivables([emptyComponent()])
    setShowModal(true)
  }

  const openEdit = async (stmt) => {
    setEditStmt(stmt)
    setForm({
      employee_id: stmt.employee_id || '',
      separation_id: stmt.separation_id || '',
      transaction_date: stmt.transaction_date || '',
      status: stmt.status || 'Draft',
      notes: stmt.notes || '',
    })
    const { data } = await supabase
      .from('fnf_components')
      .select('*')
      .eq('statement_id', stmt.id)
      .order('sort_order')
    const pays = (data || []).filter(c => c.component_type === 'payable').map(c => ({ id: c.id, description: c.description, amount: String(c.amount) }))
    const recs = (data || []).filter(c => c.component_type === 'receivable').map(c => ({ id: c.id, description: c.description, amount: String(c.amount) }))
    setPayables(pays.length > 0 ? pays : [emptyComponent()])
    setReceivables(recs.length > 0 ? recs : [emptyComponent()])
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.employee_id)    { toast.error('Employee is required'); return }
    if (!form.transaction_date) { toast.error('Transaction date is required'); return }
    setSaving(true)
    try {
      const { totalPayable: tp, totalReceivable: tr, netAmount: na } = calcTotals(payables, receivables)
      const payload = {
        employee_id: form.employee_id,
        separation_id: form.separation_id || null,
        transaction_date: form.transaction_date,
        status: form.status,
        total_payable: tp,
        total_receivable: tr,
        net_amount: na,
        notes: form.notes,
      }
      let stmtId
      if (editStmt) {
        await supabase.from('full_and_final_statements').update(payload).eq('id', editStmt.id)
        stmtId = editStmt.id
        await supabase.from('fnf_components').delete().eq('statement_id', stmtId)
        toast.success('Statement updated')
      } else {
        const suffix = String(Date.now()).slice(-6)
        stmtId = crypto.randomUUID()
        await supabase.from('full_and_final_statements').insert([{
          id: stmtId,
          statement_number: `FNF-${suffix}`,
          ...payload,
          created_by: user?.full_name || '',
        }])
        toast.success('Statement created')
      }
      const components = [
        ...payables.filter(c => c.description.trim()).map((c, i) => ({
          id: editStmt ? crypto.randomUUID() : c.id,
          statement_id: stmtId,
          component_type: 'payable',
          description: c.description,
          amount: parseFloat(c.amount) || 0,
          sort_order: i,
        })),
        ...receivables.filter(c => c.description.trim()).map((c, i) => ({
          id: editStmt ? crypto.randomUUID() : c.id,
          statement_id: stmtId,
          component_type: 'receivable',
          description: c.description,
          amount: parseFloat(c.amount) || 0,
          sort_order: i,
        })),
      ]
      if (components.length > 0) {
        await supabase.from('fnf_components').insert(components)
      }
      setShowModal(false)
      fetchStatements()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSubmit = async (stmt) => {
    await supabase.from('full_and_final_statements').update({ status: 'Submitted' }).eq('id', stmt.id)
    toast.success('Statement submitted')
    fetchStatements()
  }

  const handleMarkPaid = async (stmt) => {
    await supabase.from('full_and_final_statements').update({ status: 'Paid' }).eq('id', stmt.id)
    toast.success('Statement marked as Paid')
    fetchStatements()
  }

  const handleDelete = async () => {
    await supabase.from('fnf_components').delete().eq('statement_id', confirmDel.id)
    await supabase.from('full_and_final_statements').delete().eq('id', confirmDel.id)
    toast.success('Statement deleted')
    setConfirmDel(null)
    fetchStatements()
  }

  const updatePayable = (id, field, val) => setPayables(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
  const updateReceivable = (id, field, val) => setReceivables(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
  const removePayable = (id) => setPayables(prev => prev.filter(c => c.id !== id))
  const removeReceivable = (id) => setReceivables(prev => prev.filter(c => c.id !== id))

  return (
    <div>
      <PageHeader title="Full &amp; Final Statement">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Statement
          </button>
        )}
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPICard label="Total"     value={kpi.total}     icon="receipt_long"    />
        <KPICard label="Draft"     value={kpi.draft}     icon="edit_note"       />
        <KPICard label="Submitted" value={kpi.submitted} icon="send"   color="blue"  />
        <KPICard label="Paid"      value={kpi.paid}      icon="payments" color="green" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : statements.length === 0 ? (
        <EmptyState icon="receipt_long" message="No full & final statements yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Transaction Date</th>
                <th style={{ textAlign: 'right' }}>Payable</th>
                <th style={{ textAlign: 'right' }}>Receivable</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {statements.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)', cursor: 'pointer' }} onClick={() => openEdit(s)}>{s.statement_number}</td>
                  <td>{s.employees?.full_name || '—'}</td>
                  <td>{s.transaction_date || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(s.total_payable)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(s.total_receivable)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: Number(s.net_amount) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(s.net_amount)}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${statusColor(s.status)}18`, color: statusColor(s.status), border: `1px solid ${statusColor(s.status)}44` }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-xs btn-secondary" onClick={() => openEdit(s)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                    {canApprove && s.status === 'Draft' && (
                      <button className="btn btn-xs btn-primary" onClick={() => handleSubmit(s)} title="Submit">
                        <span className="material-icons" style={{ fontSize: 13 }}>send</span>
                      </button>
                    )}
                    {canApprove && s.status === 'Submitted' && (
                      <button className="btn btn-xs" style={{ background: 'var(--green)22', color: 'var(--green)', border: '1px solid var(--green)44', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 12 }} onClick={() => handleMarkPaid(s)} title="Mark Paid">
                        <span className="material-icons" style={{ fontSize: 13 }}>payments</span>
                      </button>
                    )}
                    {canEdit && s.status === 'Draft' && (
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(s)}>
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

      <ModalDialog open={showModal} onClose={() => setShowModal(false)} title={editStmt ? `Edit: ${editStmt.statement_number}` : 'New Full & Final Statement'} size="lg">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value, separation_id: '' }))}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Separation</label>
              <select className="form-control" value={form.separation_id} onChange={e => setForm(f => ({ ...f, separation_id: e.target.value }))} disabled={!form.employee_id}>
                <option value="">— None —</option>
                {empSeps.map(s => <option key={s.id} value={s.id}>{s.separation_number}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Transaction Date *</label>
              <input type="date" className="form-control" value={form.transaction_date} onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>Payables</span>
                <button className="btn btn-xs btn-secondary" onClick={() => setPayables(prev => [...prev, emptyComponent()])}>
                  <span className="material-icons" style={{ fontSize: 13 }}>add</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {payables.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="form-control"
                      style={{ flex: 1, fontSize: 12 }}
                      placeholder="Description"
                      value={c.description}
                      onChange={e => updatePayable(c.id, 'description', e.target.value)}
                    />
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: 100, fontSize: 12 }}
                      placeholder="Amount"
                      min="0"
                      value={c.amount}
                      onChange={e => updatePayable(c.id, 'amount', e.target.value)}
                    />
                    {payables.length > 1 && (
                      <button className="btn btn-xs btn-danger" onClick={() => removePayable(c.id)}>
                        <span className="material-icons" style={{ fontSize: 12 }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, color: 'var(--text-dim)' }}>
                Total Payable: <strong style={{ color: 'var(--red)' }}>{fmt(totalPayable)}</strong>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>Receivables</span>
                <button className="btn btn-xs btn-secondary" onClick={() => setReceivables(prev => [...prev, emptyComponent()])}>
                  <span className="material-icons" style={{ fontSize: 13 }}>add</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {receivables.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="form-control"
                      style={{ flex: 1, fontSize: 12 }}
                      placeholder="Description"
                      value={c.description}
                      onChange={e => updateReceivable(c.id, 'description', e.target.value)}
                    />
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: 100, fontSize: 12 }}
                      placeholder="Amount"
                      min="0"
                      value={c.amount}
                      onChange={e => updateReceivable(c.id, 'amount', e.target.value)}
                    />
                    {receivables.length > 1 && (
                      <button className="btn btn-xs btn-danger" onClick={() => removeReceivable(c.id)}>
                        <span className="material-icons" style={{ fontSize: 12 }}>close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, color: 'var(--text-dim)' }}>
                Total Receivable: <strong style={{ color: 'var(--green)' }}>{fmt(totalReceivable)}</strong>
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Net Amount</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: netAmount >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(netAmount)}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {FNF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          {canApprove && editStmt?.status === 'Draft' && (
            <button className="btn btn-secondary" style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => { handleSave().then(() => handleSubmit(editStmt)) }} disabled={saving}>
              Submit
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editStmt ? 'Save Changes' : 'Create'}</button>
          )}
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Statement" message={`Delete statement ${confirmDel?.statement_number}?`} confirmLabel="Delete" danger />
    </div>
  )
}
