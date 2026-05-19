import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const STATUS_COLOR = {
  Draft: 'var(--text-dim)', Submitted: 'var(--blue)', Approved: 'var(--green)',
  Rejected: 'var(--red)', Cancelled: 'var(--red)',
}

const empty = {
  employee_id: '', shift_type_id: '',
  from_date: new Date().toISOString().slice(0, 10),
  to_date: new Date().toISOString().slice(0, 10),
  reason: '', status: 'Submitted',
}

export default function ShiftRequests() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'shift-requests')
  const canApprove = useCanApprove('hr', 'shift-requests')
  const [requests, setRequests] = useState([])
  const [employees, setEmployees] = useState([])
  const [shiftTypes, setShiftTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [filter, setFilter] = useState('All')
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [reqRes, empRes, stRes] = await Promise.all([
      supabase.from('shift_requests').select('*, employees(name), shift_types(name)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
      supabase.from('shift_types').select('id, name').order('name'),
    ])
    if (reqRes.error) toast.error(reqRes.error.message)
    setRequests(reqRes.data || [])
    setEmployees(empRes.data || [])
    setShiftTypes(stRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openModal = (r = null) => setModal(r ? { ...r } : { ...empty })

  const save = async () => {
    const { id, employees: _e, shift_types: _s, ...rest } = modal
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('shift_requests').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('shift_requests').insert({ ...rest, id: crypto.randomUUID(), ref_number: `SHR-${Date.now()}` })
        if (error) throw error
      }
      toast.success('Request saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const updateStatus = async (req, newStatus) => {
    const payload = {
      status: newStatus,
      approved_by: ['Approved', 'Rejected'].includes(newStatus) ? user?.id : null,
      approved_at: ['Approved', 'Rejected'].includes(newStatus) ? new Date().toISOString() : null,
    }
    const { error } = await supabase.from('shift_requests').update(payload).eq('id', req.id)
    if (error) { toast.error(error.message); return }
    toast.success(`Request ${newStatus.toLowerCase()}`)
    fetchAll()
  }

  const doDelete = async () => {
    const { error } = await supabase.from('shift_requests').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  const filtered = filter === 'All' ? requests : requests.filter(r => r.status === filter)

  if (loading) return <div><PageHeader title="Shift Requests" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Shift Requests" subtitle="Employee-initiated requests to change assigned shifts">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Request
          </button>
        )}
      </PageHeader>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 8 }}>
        {['All', 'Submitted', 'Approved', 'Rejected', 'Draft', 'Cancelled'].map(s => (
          <button key={s} className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'} btn-xs`} onClick={() => setFilter(s)}>
            {s}
            {s !== 'All' && (
              <span style={{ marginLeft: 4, opacity: .7 }}>
                ({requests.filter(r => r.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <EmptyState icon="schedule" message="No shift requests" action={canEdit ? { label: 'New Request', onClick: () => openModal() } : null} />
        : (
          <table className="data-table">
            <thead>
              <tr><th>Ref</th><th>Employee</th><th>Shift</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.ref_number}</td>
                  <td>{r.employees?.name}</td>
                  <td>{r.shift_types?.name || '—'}</td>
                  <td>{r.from_date}</td>
                  <td>{r.to_date}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 12 }}>{r.reason || '—'}</td>
                  <td><span style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: 12 }}>{r.status}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {canApprove && r.status === 'Submitted' && <button className="btn btn-xs" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => updateStatus(r, 'Approved')}>Approve</button>}
                      {canApprove && r.status === 'Submitted' && <button className="btn btn-xs" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => updateStatus(r, 'Rejected')}>Reject</button>}
                      {canEdit && r.status === 'Draft' && <button className="btn btn-secondary btn-xs" onClick={() => openModal(r)}>Edit</button>}
                      {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(r)}>Del</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Request' : 'New Shift Request'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={modal?.employee_id || ''} onChange={e => setF('employee_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Requested Shift</label>
              <select className="form-control" value={modal?.shift_type_id || ''} onChange={e => setF('shift_type_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select shift…</option>
                {shiftTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>From Date *</label>
              <input className="form-control" type="date" value={modal?.from_date || ''} onChange={e => setF('from_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>To Date *</label>
              <input className="form-control" type="date" value={modal?.to_date || ''} onChange={e => setF('to_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Reason</label>
            <textarea className="form-control" rows={3} value={modal?.reason || ''} onChange={e => setF('reason', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={modal?.status || 'Submitted'} onChange={e => setF('status', e.target.value)} disabled={!canEdit}>
              {['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete Request" message="Delete this shift request?" />
    </div>
  )
}
