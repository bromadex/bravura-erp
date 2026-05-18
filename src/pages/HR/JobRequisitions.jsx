// src/pages/HR/JobRequisitions.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const today = () => new Date().toISOString().split('T')[0]
const fmt   = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_COLOR = {
  Pending: 'yellow', Approved: 'green', Rejected: 'red',
  Filled: 'teal', 'On Hold': 'orange', Cancelled: 'gray',
}

const BLANK = {
  designation: '', department_id: '', no_of_positions: 1,
  expected_compensation: '', currency: 'USD',
  posting_date: today(), expected_by: '', requested_by: '',
  description: '', reason: '',
}

export default function JobRequisitions() {
  const { user }    = useAuth()
  const canEdit     = useCanEdit('hr', 'job-postings')
  const canApprove  = useCanApprove('hr', 'job-postings')

  const [reqs,        setReqs]        = useState([])
  const [departments, setDepartments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)

  const [showForm,    setShowForm]    = useState(false)
  const [editReq,     setEditReq]     = useState(null)
  const [form,        setForm]        = useState(BLANK)

  const [confirmApprove,  setConfirmApprove]  = useState(null)
  const [confirmReject,   setConfirmReject]   = useState(null)
  const [confirmDelete,   setConfirmDelete]   = useState(null)
  const [convertReq,      setConvertReq]      = useState(null)
  const [convertForm,     setConvertForm]     = useState({})
  const [converting,      setConverting]      = useState(false)

  const fetchReqs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_requisitions')
      .select('*, departments(name), job_openings(job_title)')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setReqs(data || [])
    setLoading(false)
  }, [])

  const fetchDepts = useCallback(async () => {
    const { data } = await supabase.from('departments').select('id, name').order('name')
    setDepartments(data || [])
  }, [])

  useEffect(() => { fetchReqs(); fetchDepts() }, [fetchReqs, fetchDepts])

  const openNew = () => { setEditReq(null); setForm(BLANK); setShowForm(true) }
  const openEdit = (r) => {
    setEditReq(r)
    setForm({
      designation: r.designation || '', department_id: r.department_id || '',
      no_of_positions: r.no_of_positions || 1,
      expected_compensation: r.expected_compensation || '',
      currency: r.currency || 'USD', posting_date: r.posting_date || today(),
      expected_by: r.expected_by || '', requested_by: r.requested_by || '',
      description: r.description || '', reason: r.reason || '',
    })
    setShowForm(true)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.designation.trim()) { toast.error('Designation is required'); return }
    setSaving(true)
    try {
      const payload = {
        designation: form.designation, department_id: form.department_id || null,
        no_of_positions: parseInt(form.no_of_positions) || 1,
        expected_compensation: form.expected_compensation ? parseFloat(form.expected_compensation) : null,
        currency: form.currency, posting_date: form.posting_date || null,
        expected_by: form.expected_by || null, requested_by: form.requested_by,
        description: form.description, reason: form.reason,
        updated_at: new Date().toISOString(),
      }
      if (editReq) {
        await supabase.from('job_requisitions').update(payload).eq('id', editReq.id)
        toast.success('Requisition updated')
      } else {
        const num = 'HIREQ-' + Date.now().toString().slice(-6)
        await supabase.from('job_requisitions').insert([{
          id: crypto.randomUUID(), requisition_number: num,
          status: 'Pending', created_by: user?.full_name || user?.username || '', ...payload,
        }])
        toast.success('Requisition submitted')
      }
      setShowForm(false)
      await fetchReqs()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleApprove = async () => {
    await supabase.from('job_requisitions').update({ status: 'Approved', updated_at: new Date().toISOString() }).eq('id', confirmApprove.id)
    toast.success('Requisition approved')
    setConfirmApprove(null)
    fetchReqs()
  }

  const handleReject = async () => {
    await supabase.from('job_requisitions').update({ status: 'Rejected', updated_at: new Date().toISOString() }).eq('id', confirmReject.id)
    toast.success('Requisition rejected')
    setConfirmReject(null)
    fetchReqs()
  }

  const handleDelete = async () => {
    await supabase.from('job_requisitions').delete().eq('id', confirmDelete.id)
    toast.success('Requisition deleted')
    setConfirmDelete(null)
    fetchReqs()
  }

  const openConvert = (r) => {
    setConvertReq(r)
    setConvertForm({ job_title: r.designation, department_id: r.department_id || '', headcount: r.no_of_positions || 1, employment_type: 'Full-time', status: 'Open', posted_date: today(), min_salary: r.expected_compensation || '', max_salary: '', currency: r.currency || 'USD' })
  }

  const handleConvert = async () => {
    setConverting(true)
    try {
      const { data: opening, error } = await supabase.from('job_openings').insert([{
        id: crypto.randomUUID(),
        job_title: convertForm.job_title, department_id: convertForm.department_id || null,
        headcount: parseInt(convertForm.headcount) || 1, employment_type: convertForm.employment_type,
        status: convertForm.status, posted_date: convertForm.posted_date,
        min_salary: convertForm.min_salary ? parseFloat(convertForm.min_salary) : null,
        max_salary: convertForm.max_salary ? parseFloat(convertForm.max_salary) : null,
        currency: convertForm.currency, created_by: user?.full_name || '',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]).select().single()
      if (error) throw error
      await supabase.from('job_requisitions').update({ job_opening_id: opening.id, status: 'Filled', updated_at: new Date().toISOString() }).eq('id', convertReq.id)
      toast.success('Converted to job opening')
      setConvertReq(null)
      fetchReqs()
    } catch (err) { toast.error(err.message) }
    finally { setConverting(false) }
  }

  const kpiPending  = reqs.filter(r => r.status === 'Pending').length
  const kpiApproved = reqs.filter(r => r.status === 'Approved').length
  const kpiFilled   = reqs.filter(r => r.status === 'Filled').length

  return (
    <div>
      <PageHeader title="Job Requisitions">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Requisition
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total"    value={reqs.length}  icon="assignment"      color="blue"   />
        <KPICard label="Pending"  value={kpiPending}   icon="hourglass_empty" color="yellow" />
        <KPICard label="Approved" value={kpiApproved}  icon="check_circle"    color="green"  />
        <KPICard label="Filled"   value={kpiFilled}    icon="how_to_reg"      color="teal"   />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : reqs.length === 0 ? (
        <EmptyState icon="assignment" message="No job requisitions yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Req #</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Positions</th>
                <th>Expected By</th>
                <th>Requested By</th>
                <th>Opening</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{r.requisition_number || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{r.designation}</td>
                  <td>{r.departments?.name || '—'}</td>
                  <td>{r.no_of_positions}</td>
                  <td>{r.expected_by || '—'}</td>
                  <td>{r.requested_by || '—'}</td>
                  <td>{r.job_openings?.job_title ? <span style={{ color: 'var(--teal)', fontSize: 12 }}>{r.job_openings.job_title}</span> : '—'}</td>
                  <td>
                    <StatusBadge status={r.status?.toLowerCase().replace(/ /g, '_')} label={r.status} color={STATUS_COLOR[r.status]} />
                  </td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn btn-xs btn-secondary" onClick={() => openEdit(r)} title="Edit">
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                    {canApprove && r.status === 'Pending' && <>
                      <button className="btn btn-xs btn-primary" onClick={() => setConfirmApprove(r)}>Approve</button>
                      <button className="btn btn-xs btn-danger"  onClick={() => setConfirmReject(r)}>Reject</button>
                    </>}
                    {canApprove && r.status === 'Approved' && !r.job_opening_id && (
                      <button className="btn btn-xs btn-primary" onClick={() => openConvert(r)}>
                        <span className="material-icons" style={{ fontSize: 12 }}>work_outline</span> Convert
                      </button>
                    )}
                    {['Pending','Rejected','Cancelled'].includes(r.status) && (
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelete(r)}>
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

      {/* New / Edit Modal */}
      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editReq ? 'Edit Requisition' : 'New Job Requisition'} size="lg">
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Designation / Role *</label>
            <input className="form-control" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Senior Mining Engineer" />
          </div>
          <div className="form-group">
            <label>Department</label>
            <select className="form-control" value={form.department_id} onChange={e => set('department_id', e.target.value)}>
              <option value="">— Select —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>No. of Positions</label>
            <input type="number" className="form-control" min="1" value={form.no_of_positions} onChange={e => set('no_of_positions', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Expected Compensation</label>
            <input type="number" className="form-control" min="0" value={form.expected_compensation} onChange={e => set('expected_compensation', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select className="form-control" value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option>USD</option><option>ZiG</option><option>ZWL</option>
            </select>
          </div>
          <div className="form-group">
            <label>Posting Date</label>
            <input type="date" className="form-control" value={form.posting_date} onChange={e => set('posting_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Expected By</label>
            <input type="date" className="form-control" value={form.expected_by} onChange={e => set('expected_by', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Requested By</label>
            <input className="form-control" value={form.requested_by} onChange={e => set('requested_by', e.target.value)} placeholder="Name of requestor" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Reason for Requisition</label>
            <textarea className="form-control" rows={2} value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Job Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editReq ? 'Save Changes' : 'Submit Requisition'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Convert to Opening Modal */}
      {convertReq && (
        <ModalDialog open={!!convertReq} onClose={() => setConvertReq(null)} title="Convert to Job Opening">
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Job Title *</label>
              <input className="form-control" value={convertForm.job_title || ''} onChange={e => setConvertForm(f => ({ ...f, job_title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <select className="form-control" value={convertForm.department_id || ''} onChange={e => setConvertForm(f => ({ ...f, department_id: e.target.value }))}>
                <option value="">— Select —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Headcount</label>
              <input type="number" className="form-control" min="1" value={convertForm.headcount || 1} onChange={e => setConvertForm(f => ({ ...f, headcount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Employment Type</label>
              <select className="form-control" value={convertForm.employment_type || 'Full-time'} onChange={e => setConvertForm(f => ({ ...f, employment_type: e.target.value }))}>
                <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Casual</option>
              </select>
            </div>
            <div className="form-group">
              <label>Posted Date</label>
              <input type="date" className="form-control" value={convertForm.posted_date || today()} onChange={e => setConvertForm(f => ({ ...f, posted_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Min Salary</label>
              <input type="number" className="form-control" value={convertForm.min_salary || ''} onChange={e => setConvertForm(f => ({ ...f, min_salary: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Max Salary</label>
              <input type="number" className="form-control" value={convertForm.max_salary || ''} onChange={e => setConvertForm(f => ({ ...f, max_salary: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setConvertReq(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleConvert} disabled={converting}>
              {converting ? 'Converting…' : 'Create Opening'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      <ConfirmDialog open={!!confirmApprove} onClose={() => setConfirmApprove(null)} onConfirm={handleApprove}
        title="Approve Requisition" message={`Approve requisition for ${confirmApprove?.designation}?`} confirmLabel="Approve" />
      <ConfirmDialog open={!!confirmReject} onClose={() => setConfirmReject(null)} onConfirm={handleReject}
        title="Reject Requisition" message={`Reject requisition for ${confirmReject?.designation}?`} confirmLabel="Reject" danger />
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete}
        title="Delete Requisition" message={`Permanently delete ${confirmDelete?.requisition_number}?`} confirmLabel="Delete" danger />
    </div>
  )
}
