import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'applications', label: 'Applications', icon: 'assignment' },
  { id: 'claims',       label: 'Claims',        icon: 'receipt_long' },
]

const APP_STATUS  = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled']
const CLM_STATUS  = ['Draft', 'Submitted', 'Approved', 'Paid', 'Rejected', 'Cancelled']

const STATUS_COLOR = {
  Draft: 'var(--text-dim)', Submitted: 'var(--blue)', Approved: 'var(--green)',
  Paid: 'var(--teal)', Rejected: 'var(--red)', Cancelled: 'var(--red)',
}

const emptyApp = {
  employee_id: '', application_date: new Date().toISOString().slice(0, 10),
  max_benefit_amount: '', currency: 'USD', status: 'Draft', notes: '',
}
const emptyClaim = {
  employee_id: '', application_id: '', benefit_type: '',
  claim_date: new Date().toISOString().slice(0, 10),
  amount: '', currency: 'USD', status: 'Draft', notes: '',
}

export default function EmployeeBenefits() {
  const canEdit = useCanEdit('hr', 'employee-benefits')
  const [tab, setTab] = useState('applications')
  const [employees, setEmployees] = useState([])
  const [applications, setApplications] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empRes, appRes, clmRes] = await Promise.all([
      supabase.from('employees').select('id, name').order('name'),
      supabase.from('employee_benefit_applications').select('*, employees(name)').order('created_at', { ascending: false }),
      supabase.from('employee_benefit_claims').select('*, employees(name)').order('created_at', { ascending: false }),
    ])
    if (empRes.error) toast.error(empRes.error.message)
    setEmployees(empRes.data || [])
    setApplications(appRes.data || [])
    setClaims(clmRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openAppModal   = (a = null) => setModal({ mode: 'app',   data: a ? { ...a } : { ...emptyApp } })
  const openClaimModal = (c = null) => setModal({ mode: 'claim', data: c ? { ...c } : { ...emptyClaim } })

  const saveApp = async () => {
    const { id, employees: _e, ...rest } = modal.data
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('employee_benefit_applications').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employee_benefit_applications').insert({ ...rest, id: crypto.randomUUID(), ref_number: `BEN-${Date.now()}` })
        if (error) throw error
      }
      toast.success('Application saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const saveClaim = async () => {
    const { id, employees: _e, ...rest } = modal.data
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('employee_benefit_claims').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employee_benefit_claims').insert({ ...rest, id: crypto.randomUUID(), ref_number: `CLM-${Date.now()}` })
        if (error) throw error
      }
      toast.success('Claim saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from(deleting._table).delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))

  if (loading) return <div><PageHeader title="Employee Benefits" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Employee Benefits" subtitle="Benefit applications and claims management">
        {canEdit && tab === 'applications' && (
          <button className="btn btn-primary btn-sm" onClick={() => openAppModal()}>
            <span className="material-icons">add</span>New Application
          </button>
        )}
        {canEdit && tab === 'claims' && (
          <button className="btn btn-primary btn-sm" onClick={() => openClaimModal()}>
            <span className="material-icons">add</span>New Claim
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'applications' && (
        <div style={{ marginTop: 16 }}>
          {applications.length === 0
            ? <EmptyState icon="assignment" message="No benefit applications" action={canEdit ? { label: 'New Application', onClick: () => openAppModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Ref</th><th>Employee</th><th>Date</th><th>Max Amount</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {applications.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{a.ref_number}</td>
                      <td>{a.employees?.name}</td>
                      <td>{a.application_date}</td>
                      <td>{Number(a.max_benefit_amount).toLocaleString()} {a.currency}</td>
                      <td><span style={{ color: STATUS_COLOR[a.status], fontWeight: 600, fontSize: 12 }}>{a.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openAppModal(a)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...a, _table: 'employee_benefit_applications' })}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {tab === 'claims' && (
        <div style={{ marginTop: 16 }}>
          {claims.length === 0
            ? <EmptyState icon="receipt_long" message="No benefit claims" action={canEdit ? { label: 'New Claim', onClick: () => openClaimModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Ref</th><th>Employee</th><th>Benefit Type</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {claims.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{c.ref_number}</td>
                      <td>{c.employees?.name}</td>
                      <td>{c.benefit_type}</td>
                      <td>{c.claim_date}</td>
                      <td>{Number(c.amount).toLocaleString()} {c.currency}</td>
                      <td><span style={{ color: STATUS_COLOR[c.status], fontWeight: 600, fontSize: 12 }}>{c.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openClaimModal(c)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...c, _table: 'employee_benefit_claims' })}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Application Modal */}
      <ModalDialog open={modal?.mode === 'app'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Application' : 'New Benefit Application'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={modal?.data?.employee_id || ''} onChange={e => setF('employee_id', e.target.value)} disabled={!canEdit}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Application Date</label>
              <input className="form-control" type="date" value={modal?.data?.application_date || ''} onChange={e => setF('application_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={modal?.data?.status || 'Draft'} onChange={e => setF('status', e.target.value)} disabled={!canEdit}>
                {APP_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Max Benefit Amount</label>
              <input className="form-control" type="number" step="0.01" value={modal?.data?.max_benefit_amount || ''} onChange={e => setF('max_benefit_amount', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <input className="form-control" value={modal?.data?.currency || 'USD'} onChange={e => setF('currency', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={modal?.data?.notes || ''} onChange={e => setF('notes', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveApp} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Claim Modal */}
      <ModalDialog open={modal?.mode === 'claim'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Claim' : 'New Benefit Claim'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={modal?.data?.employee_id || ''} onChange={e => setF('employee_id', e.target.value)} disabled={!canEdit}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Benefit Type *</label>
              <input className="form-control" value={modal?.data?.benefit_type || ''} onChange={e => setF('benefit_type', e.target.value)} placeholder="e.g. Medical, Transport, Housing" disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Claim Date</label>
              <input className="form-control" type="date" value={modal?.data?.claim_date || ''} onChange={e => setF('claim_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Amount</label>
              <input className="form-control" type="number" step="0.01" value={modal?.data?.amount || ''} onChange={e => setF('amount', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <input className="form-control" value={modal?.data?.currency || 'USD'} onChange={e => setF('currency', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={modal?.data?.status || 'Draft'} onChange={e => setF('status', e.target.value)} disabled={!canEdit}>
              {CLM_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={modal?.data?.notes || ''} onChange={e => setF('notes', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveClaim} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Confirm Delete"
        message="Delete this record? This cannot be undone."
      />
    </div>
  )
}
