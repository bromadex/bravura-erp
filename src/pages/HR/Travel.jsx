// src/pages/HR/Travel.jsx
//
// Travel requests + expense claims with 2-level approval (Supervisor → HR)
// Per diem auto-calculated from days × rate (default $50/day)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../utils/dateUtils'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const TRANSPORT_MODES = [
  { value: 'vehicle',   label: 'Company Vehicle' },
  { value: 'flight',    label: 'Flight'           },
  { value: 'bus',       label: 'Bus'              },
  { value: 'own_car',   label: 'Own Vehicle'      },
]

const statusBadge = (s) => {
  const map = {
    draft:              'badge-yellow',
    pending_supervisor: 'badge-blue',
    pending_hr:         'badge-blue',
    approved:           'badge-green',
    rejected:           'badge-red',
    cancelled:          'badge-purple',
    completed:          'badge-teal',
  }
  return <span className={`badge ${map[s] || 'badge-gold'}`}>{(s || '').replace(/_/g, ' ')}</span>
}

export default function Travel() {
  const { user } = useAuth()
  const { employees } = useHR()
  const canApprove = useCanApprove('hr', 'travel')

  const [myEmployeeId,  setMyEmployeeId]  = useState(user?.employee_id || null)
  const [requests,      setRequests]      = useState([])
  const [pendingSuperv, setPendingSuperv] = useState([])
  const [pendingHR,     setPendingHR]     = useState([])
  const [expenses,      setExpenses]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [isSupervisor,  setIsSupervisor]  = useState(false)
  const [approverEmpId, setApproverEmpId] = useState(null)

  const [activeTab, setActiveTab] = useState('my')

  // Form state
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [form, setForm] = useState({
    destination: '', purpose: '', departure_date: formatDate(new Date()),
    return_date: formatDate(new Date()), transport_mode: 'vehicle',
    estimated_cost: 0, per_diem_days: 1, per_diem_rate: 50,
    advance_requested: 0, attachment_url: ''
  })

  const [rejectModal,  setRejectModal]  = useState({ open: false, requestId: null, reason: '' })
  const [expenseModal, setExpenseModal] = useState({ open: false, requestId: null })
  const [expenseForm,  setExpenseForm]  = useState({ description: '', amount: 0, claim_date: formatDate(new Date()), receipt_url: '' })

  const perDiem = (form.per_diem_days || 0) * (form.per_diem_rate || 0)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // Resolve employee ID
  useEffect(() => {
    if (user?.employee_id) { setMyEmployeeId(user.employee_id); setApproverEmpId(user.employee_id); return }
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => { if (data?.employee_id) { setMyEmployeeId(data.employee_id); setApproverEmpId(data.employee_id) } })
  }, [user])

  const fetchRequests = useCallback(async () => {
    if (!myEmployeeId) return
    setLoading(true)
    try {
      // My requests
      const { data: myReqs } = await supabase
        .from('travel_requests')
        .select('*')
        .eq('employee_id', myEmployeeId)
        .order('created_at', { ascending: false })
      setRequests(myReqs || [])

      // My expenses
      const { data: myExp } = await supabase
        .from('expense_claims')
        .select('*, travel_requests(destination)')
        .eq('employee_id', myEmployeeId)
        .order('created_at', { ascending: false })
      setExpenses(myExp || [])

      // Supervisor pending
      const { data: dept } = await supabase.from('departments').select('id').eq('hod_id', myEmployeeId).maybeSingle()
      if (dept) {
        setIsSupervisor(true)
        const { data: deptEmps } = await supabase.from('employees').select('id').eq('department_id', dept.id)
        if (deptEmps?.length) {
          const { data: supvPending } = await supabase
            .from('travel_requests')
            .select('*')
            .in('employee_id', deptEmps.map(e => e.id))
            .eq('status', 'pending_supervisor')
            .order('created_at', { ascending: false })
          setPendingSuperv(supvPending || [])
        }
      }

      // HR pending
      if (canApprove) {
        const { data: hrPending } = await supabase
          .from('travel_requests')
          .select('*')
          .eq('status', 'pending_hr')
          .order('created_at', { ascending: false })
        setPendingHR(hrPending || [])
      }
    } finally { setLoading(false) }
  }, [myEmployeeId, canApprove])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleSubmit = async (status = 'draft') => {
    if (!form.destination || !form.purpose) return toast.error('Destination and purpose are required')
    if (form.departure_date > form.return_date) return toast.error('Return date must be after departure date')
    try {
      const data = { ...form, employee_id: myEmployeeId, status, per_diem_amount: perDiem, updated_at: new Date().toISOString() }
      if (editingId) {
        const { error } = await supabase.from('travel_requests').update(data).eq('id', editingId)
        if (error) throw new Error(error.message)
        toast.success(status === 'draft' ? 'Draft updated' : 'Request submitted for approval')
      } else {
        const { error } = await supabase.from('travel_requests').insert([{ id: generateId(), ...data, created_at: new Date().toISOString() }])
        if (error) throw new Error(error.message)
        toast.success(status === 'draft' ? 'Draft saved' : 'Request submitted for approval')
      }
      setShowForm(false); setEditingId(null)
      setForm({ destination: '', purpose: '', departure_date: formatDate(new Date()), return_date: formatDate(new Date()), transport_mode: 'vehicle', estimated_cost: 0, per_diem_days: 1, per_diem_rate: 50, advance_requested: 0, attachment_url: '' })
      await fetchRequests()
    } catch (err) { toast.error(err.message) }
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this request?')) return
    const { error } = await supabase.from('travel_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Cancelled'); await fetchRequests()
  }

  const handleApprove = async (requestId, currentStatus) => {
    let request = [...requests, ...pendingSuperv, ...pendingHR].find(r => r.id === requestId)
    if (!request) {
      const { data } = await supabase.from('travel_requests').select('*').eq('id', requestId).single()
      request = data
    }
    const newStatus = currentStatus === 'pending_supervisor' ? 'pending_hr' : 'approved'
    const comments  = [...(request.approver_comments || []), { by: user?.full_name || user?.username, action: 'approved', timestamp: new Date().toISOString() }]
    const { error } = await supabase.from('travel_requests')
      .update({ status: newStatus, approver_comments: comments, [currentStatus === 'pending_supervisor' ? 'assigned_supervisor_id' : 'assigned_hr_id']: approverEmpId, updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) { toast.error(error.message); return }
    toast.success(newStatus === 'approved' ? 'Travel request approved' : 'Forwarded to HR')
    await fetchRequests()
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Reason required')
    let request = [...requests, ...pendingSuperv, ...pendingHR].find(r => r.id === rejectModal.requestId)
    if (!request) {
      const { data } = await supabase.from('travel_requests').select('*').eq('id', rejectModal.requestId).single()
      request = data
    }
    const comments = [...(request.approver_comments || []), { by: user?.full_name || user?.username, action: 'rejected', comment: rejectModal.reason, timestamp: new Date().toISOString() }]
    const { error } = await supabase.from('travel_requests')
      .update({ status: 'rejected', approver_comments: comments, updated_at: new Date().toISOString() })
      .eq('id', rejectModal.requestId)
    if (error) { toast.error(error.message); return }
    toast.success('Rejected'); setRejectModal({ open: false, requestId: null, reason: '' }); await fetchRequests()
  }

  const submitExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return toast.error('Description and amount required')
    const { error } = await supabase.from('expense_claims').insert([{
      id: generateId(), travel_request_id: expenseModal.requestId, employee_id: myEmployeeId,
      ...expenseForm, status: 'pending', created_at: new Date().toISOString()
    }])
    if (error) { toast.error(error.message); return }
    toast.success('Expense claim submitted'); setExpenseModal({ open: false, requestId: null }); setExpenseForm({ description: '', amount: 0, claim_date: formatDate(new Date()), receipt_url: '' }); await fetchRequests()
  }

  const getEmployeeName = (id) => employees.find(e => e.id === id)?.name || id

  const RequestCard = ({ req, showApprove = false, role = 'supervisor' }) => (
    <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          {showApprove && <div style={{ fontWeight: 700, marginBottom: 2 }}>{getEmployeeName(req.employee_id)}</div>}
          <div style={{ fontWeight: showApprove ? 600 : 700 }}>{req.destination}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{req.departure_date} → {req.return_date}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{req.purpose}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {statusBadge(req.status)}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            Per diem: ${(req.per_diem_amount || 0).toFixed(0)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {showApprove && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => handleApprove(req.id, req.status)}>
              <span className="material-icons" style={{ fontSize: 14 }}>check</span> Approve
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ open: true, requestId: req.id, reason: '' })}>
              <span className="material-icons" style={{ fontSize: 14 }}>close</span> Reject
            </button>
          </>
        )}
        {!showApprove && req.status === 'draft' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(req.id); setForm({ destination: req.destination, purpose: req.purpose, departure_date: req.departure_date, return_date: req.return_date, transport_mode: req.transport_mode, estimated_cost: req.estimated_cost, per_diem_days: req.per_diem_days, per_diem_rate: req.per_diem_rate, advance_requested: req.advance_requested, attachment_url: req.attachment_url || '' }); setShowForm(true) }}>
              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => handleCancel(req.id)}>
              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
            </button>
          </>
        )}
        {!showApprove && ['pending_supervisor','pending_hr','approved'].includes(req.status) && (
          <button className="btn btn-danger btn-sm" onClick={() => handleCancel(req.id)}>
            <span className="material-icons" style={{ fontSize: 13 }}>cancel</span> Cancel
          </button>
        )}
        {!showApprove && req.status === 'approved' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setExpenseModal({ open: true, requestId: req.id })}>
            <span className="material-icons" style={{ fontSize: 13 }}>receipt</span> Add Expense
          </button>
        )}
        {req.attachment_url && (
          <a href={req.attachment_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            <span className="material-icons" style={{ fontSize: 13 }}>attachment</span>
          </a>
        )}
      </div>
    </div>
  )

  const showApprovalColumn = isSupervisor || canApprove

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Travel & Expenses</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null) }}>
          <span className="material-icons">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {editingId ? 'Edit Travel Request' : 'New Travel Request'}
          </h3>
          <div className="form-row">
            <div className="form-group"><label>Destination *</label><input className="form-control" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="e.g. Harare, Zimbabwe" /></div>
            <div className="form-group"><label>Transport Mode</label><select className="form-control" value={form.transport_mode} onChange={e => setForm({ ...form, transport_mode: e.target.value })}>{TRANSPORT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          </div>
          <div className="form-group"><label>Purpose *</label><textarea className="form-control" rows="2" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="Describe the purpose of travel" /></div>
          <div className="form-row">
            <div className="form-group"><label>Departure Date *</label><input type="date" className="form-control" value={form.departure_date} onChange={e => setForm({ ...form, departure_date: e.target.value })} /></div>
            <div className="form-group"><label>Return Date *</label><input type="date" className="form-control" value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Per Diem Days</label><input type="number" className="form-control" min="0" step="0.5" value={form.per_diem_days} onChange={e => setForm({ ...form, per_diem_days: parseFloat(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>Per Diem Rate ($/day)</label><input type="number" className="form-control" min="0" value={form.per_diem_rate} onChange={e => setForm({ ...form, per_diem_rate: parseFloat(e.target.value) || 0 })} /></div>
            <div className="form-group">
              <label>Per Diem Total</label>
              <div className="form-control" style={{ background: 'var(--surface2)', fontWeight: 700, color: 'var(--teal)' }}>${perDiem.toFixed(2)}</div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Estimated Other Costs ($)</label><input type="number" className="form-control" min="0" value={form.estimated_cost} onChange={e => setForm({ ...form, estimated_cost: parseFloat(e.target.value) || 0 })} /></div>
            <div className="form-group"><label>Cash Advance Requested ($)</label><input type="number" className="form-control" min="0" value={form.advance_requested} onChange={e => setForm({ ...form, advance_requested: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn btn-secondary" onClick={() => handleSubmit('draft')}>
              <span className="material-icons" style={{ fontSize: 14 }}>save</span> Save Draft
            </button>
            <button className="btn btn-primary" onClick={() => handleSubmit('pending_supervisor')}>
              <span className="material-icons" style={{ fontSize: 14 }}>send</span> Submit for Approval
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { id: 'my',       label: 'My Requests',    icon: 'flight_takeoff', count: null },
          { id: 'expenses', label: 'My Expenses',    icon: 'receipt',        count: null },
          ...(showApprovalColumn ? [{ id: 'approvals', label: 'Pending Approvals', icon: 'approval', count: pendingSuperv.length + pendingHR.length }] : []),
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
            {tab.count > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {loading ? <div className="empty-state">Loading…</div> : (
        <>
          {activeTab === 'my' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {requests.length === 0 ? (
                <div className="empty-state">
                  <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>flight_takeoff</span>
                  <span>No travel requests yet</span>
                </div>
              ) : requests.map(req => <RequestCard key={req.id} req={req} />)}
            </div>
          )}
          {activeTab === 'expenses' && (
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Travel</th><th>Description</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id}>
                      <td>{exp.claim_date}</td>
                      <td style={{ fontSize: 12 }}>{exp.travel_requests?.destination || '—'}</td>
                      <td>{exp.description}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${exp.amount}</td>
                      <td><span className={`badge ${exp.status === 'approved' ? 'badge-green' : exp.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>{exp.status}</span></td>
                      <td>{exp.receipt_url ? <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><span className="material-icons" style={{ fontSize: 13 }}>receipt</span></a> : '—'}</td>
                    </tr>
                  ))}
                  {expenses.length === 0 && <tr><td colSpan="6" className="empty-state">No expense claims</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'approvals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingSuperv.length === 0 && pendingHR.length === 0 ? (
                <div className="empty-state">
                  <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>check_circle</span>
                  <span>No requests pending your approval</span>
                </div>
              ) : (
                <>
                  {pendingSuperv.length > 0 && <><div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Supervisor Review</div>{pendingSuperv.map(req => <RequestCard key={req.id} req={req} showApprove role="supervisor" />)}</>}
                  {pendingHR.length > 0 && <><div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12 }}>HR Review</div>{pendingHR.map(req => <RequestCard key={req.id} req={req} showApprove role="hr" />)}</>}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Reject modal */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject <span>Travel Request</span></div>
            <div className="form-group"><label>Reason *</label><textarea className="form-control" rows="3" value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} /></div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, requestId: null, reason: '' })}>Cancel</button><button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button></div>
          </div>
        </div>
      )}

      {/* Expense claim modal */}
      {expenseModal.open && (
        <div className="overlay" onClick={() => setExpenseModal({ open: false, requestId: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Submit <span>Expense Claim</span></div>
            <div className="form-group"><label>Date</label><input type="date" className="form-control" value={expenseForm.claim_date} onChange={e => setExpenseForm({ ...expenseForm, claim_date: e.target.value })} /></div>
            <div className="form-group"><label>Description *</label><input className="form-control" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="e.g. Fuel, Accommodation, Meals" /></div>
            <div className="form-group"><label>Amount ($) *</label><input type="number" min="0" step="0.01" className="form-control" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setExpenseModal({ open: false, requestId: null })}>Cancel</button><button className="btn btn-primary" onClick={submitExpense}>Submit Claim</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
