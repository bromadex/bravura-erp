// src/pages/HR/Travel.jsx
//
// Full travel requests + expense claims with 2-level approval.
// Fields: departure_from (origin), destination, purpose, dates,
// transport mode, per diem, advance, expense claims.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

const fmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const TRANSPORT_MODES = [
  { value: 'vehicle',  label: 'Company Vehicle' },
  { value: 'flight',   label: 'Flight'           },
  { value: 'bus',      label: 'Bus / Coach'      },
  { value: 'own_car',  label: 'Own Vehicle'      },
]

const STATUS_BADGE = {
  draft:              'badge-yellow',
  pending_supervisor: 'badge-blue',
  pending_hr:         'badge-blue',
  approved:           'badge-green',
  rejected:           'badge-red',
  cancelled:          'badge-purple',
  completed:          'badge-teal',
}

const genId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

const BLANK_FORM = {
  departure_from:    'Kamativi Mine',   // ← default origin
  destination:       '',
  purpose:           '',
  departure_date:    today,
  return_date:       today,
  transport_mode:    'vehicle',
  estimated_cost:    0,
  per_diem_days:     1,
  per_diem_rate:     50,
  advance_requested: 0,
  attachment_url:    '',
}

export default function Travel() {
  const { user }       = useAuth()
  const { employees }  = useHR()
  const canApprove     = useCanApprove('hr', 'travel')

  const [myEmployeeId,  setMyEmployeeId]  = useState(user?.employee_id || null)
  const [approverEmpId, setApproverEmpId] = useState(null)
  const [isSupervisor,  setIsSupervisor]  = useState(false)

  const [requests,     setRequests]     = useState([])
  const [pendingSupv,  setPendingSupv]  = useState([])
  const [pendingHR,    setPendingHR]    = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('my')

  const [showForm,     setShowForm]     = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const [form,         setForm]         = useState(BLANK_FORM)
  const [submitting,   setSubmitting]   = useState(false)

  const [rejectModal,  setRejectModal]  = useState({ open: false, id: null, reason: '' })
  const [expModal,     setExpModal]     = useState({ open: false, requestId: null })
  const [expForm,      setExpForm]      = useState({ description: '', amount: 0, claim_date: today, receipt_url: '' })

  const perDiem = (form.per_diem_days || 0) * (form.per_diem_rate || 0)

  // ── Resolve employee ID ─────────────────────────────────────
  useEffect(() => {
    if (user?.employee_id) {
      setMyEmployeeId(user.employee_id)
      setApproverEmpId(user.employee_id)
      return
    }
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.employee_id) {
          setMyEmployeeId(data.employee_id)
          setApproverEmpId(data.employee_id)
        }
      })
  }, [user])

  // ── Fetch all data ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
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

      // Supervisor queue
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('hod_id', myEmployeeId)
        .maybeSingle()
      if (dept) {
        setIsSupervisor(true)
        const { data: deptEmps } = await supabase.from('employees').select('id').eq('department_id', dept.id)
        if (deptEmps?.length) {
          const { data: sp } = await supabase
            .from('travel_requests')
            .select('*')
            .in('employee_id', deptEmps.map(e => e.id))
            .eq('status', 'pending_supervisor')
            .order('created_at', { ascending: false })
          setPendingSupv(sp || [])
        }
      }

      // HR queue
      if (canApprove) {
        const { data: hp } = await supabase
          .from('travel_requests')
          .select('*')
          .eq('status', 'pending_hr')
          .order('created_at', { ascending: false })
        setPendingHR(hp || [])
      }
    } finally { setLoading(false) }
  }, [myEmployeeId, canApprove])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Submit / save ───────────────────────────────────────────
  const handleSave = async (status = 'draft') => {
    if (!form.departure_from.trim()) return toast.error('Departure location required')
    if (!form.destination.trim())   return toast.error('Destination required')
    if (!form.purpose.trim())       return toast.error('Purpose required')
    if (form.departure_date > form.return_date) return toast.error('Return date must be on or after departure date')

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        employee_id:    myEmployeeId,
        per_diem_amount: perDiem,
        status,
        updated_at:     new Date().toISOString(),
      }
      if (editingId) {
        const { error } = await supabase.from('travel_requests').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)
        toast.success(status === 'draft' ? 'Draft updated' : 'Submitted for approval')
      } else {
        const { error } = await supabase.from('travel_requests').insert([{ id: genId(), ...payload, created_at: new Date().toISOString() }])
        if (error) throw new Error(error.message)
        toast.success(status === 'draft' ? 'Draft saved' : 'Submitted for approval')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(BLANK_FORM)
      await fetchData()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Edit draft ──────────────────────────────────────────────
  const editRequest = (req) => {
    setEditingId(req.id)
    setForm({
      departure_from:    req.departure_from    || 'Kamativi Mine',
      destination:       req.destination       || '',
      purpose:           req.purpose           || '',
      departure_date:    req.departure_date    || today,
      return_date:       req.return_date       || today,
      transport_mode:    req.transport_mode    || 'vehicle',
      estimated_cost:    req.estimated_cost    || 0,
      per_diem_days:     req.per_diem_days     || 1,
      per_diem_rate:     req.per_diem_rate     || 50,
      advance_requested: req.advance_requested || 0,
      attachment_url:    req.attachment_url    || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Cancel request ──────────────────────────────────────────
  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this travel request?')) return
    const { error } = await supabase.from('travel_requests').update({ status: 'cancelled' }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Request cancelled')
    await fetchData()
  }

  // ── Approve ─────────────────────────────────────────────────
  const handleApprove = async (id, currentStatus) => {
    const newStatus  = currentStatus === 'pending_supervisor' ? 'pending_hr' : 'approved'
    const all        = [...requests, ...pendingSupv, ...pendingHR]
    let req          = all.find(r => r.id === id)
    if (!req) {
      const { data } = await supabase.from('travel_requests').select('*').eq('id', id).single()
      req = data
    }
    const comments = [...(req?.approver_comments || []), {
      by: user?.full_name || user?.username, action: 'approved', timestamp: new Date().toISOString()
    }]
    const { error } = await supabase.from('travel_requests').update({
      status: newStatus, approver_comments: comments,
      [currentStatus === 'pending_supervisor' ? 'assigned_supervisor_id' : 'assigned_hr_id']: approverEmpId,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success(newStatus === 'approved' ? 'Travel approved' : 'Forwarded to HR')
    await fetchData()
  }

  // ── Reject ──────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Reason required')
    const all = [...requests, ...pendingSupv, ...pendingHR]
    let req = all.find(r => r.id === rejectModal.id)
    if (!req) {
      const { data } = await supabase.from('travel_requests').select('*').eq('id', rejectModal.id).single()
      req = data
    }
    const comments = [...(req?.approver_comments || []), {
      by: user?.full_name || user?.username, action: 'rejected', comment: rejectModal.reason, timestamp: new Date().toISOString()
    }]
    const { error } = await supabase.from('travel_requests').update({ status: 'rejected', approver_comments: comments, updated_at: new Date().toISOString() }).eq('id', rejectModal.id)
    if (error) { toast.error(error.message); return }
    toast.success('Rejected')
    setRejectModal({ open: false, id: null, reason: '' })
    await fetchData()
  }

  // ── Expense claim ───────────────────────────────────────────
  const submitExpense = async () => {
    if (!expForm.description.trim() || !expForm.amount) return toast.error('Description and amount required')
    const { error } = await supabase.from('expense_claims').insert([{
      id: genId(), travel_request_id: expModal.requestId, employee_id: myEmployeeId,
      ...expForm, status: 'pending', created_at: new Date().toISOString()
    }])
    if (error) { toast.error(error.message); return }
    toast.success('Expense claim submitted')
    setExpModal({ open: false, requestId: null })
    setExpForm({ description: '', amount: 0, claim_date: today, receipt_url: '' })
    await fetchData()
  }

  const getEmpName  = (id) => employees.find(e => e.id === id)?.name || id
  const showApprovals = isSupervisor || canApprove
  const pendingCount  = pendingSupv.length + pendingHR.length

  // ── Request card ────────────────────────────────────────────
  const RequestCard = ({ req, isApprovalView = false }) => (
    <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          {isApprovalView && (
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{getEmpName(req.employee_id)}</div>
          )}
          {/* ✅ Route: departure_from → destination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
            <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>place</span>
            {req.departure_from || 'Kamativi Mine'}
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--gold)' }}>arrow_forward</span>
            {req.destination}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {fmt(req.departure_date)} → {fmt(req.return_date)}
            {' · '}
            {TRANSPORT_MODES.find(t => t.value === req.transport_mode)?.label || req.transport_mode}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{req.purpose}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className={`badge ${STATUS_BADGE[req.status] || 'badge-gold'}`}>
            {req.status.replace(/_/g, ' ')}
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            Per diem: ${(req.per_diem_amount || 0).toFixed(0)}
          </div>
          {req.advance_requested > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              Advance: ${req.advance_requested}
            </div>
          )}
        </div>
      </div>

      {/* Approval trail */}
      {Array.isArray(req.approver_comments) && req.approver_comments.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {req.approver_comments.map((c, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>
              <strong>{c.by}</strong> — {c.action}{c.comment ? `: ${c.comment}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {isApprovalView && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => handleApprove(req.id, req.status)}>
              <span className="material-icons" style={{ fontSize: 14 }}>check</span> Approve
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ open: true, id: req.id, reason: '' })}>
              <span className="material-icons" style={{ fontSize: 14 }}>close</span> Reject
            </button>
          </>
        )}
        {!isApprovalView && req.status === 'draft' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => editRequest(req)}>
              <span className="material-icons" style={{ fontSize: 13 }}>edit</span> Edit
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => handleCancel(req.id)}>
              <span className="material-icons" style={{ fontSize: 13 }}>delete</span> Delete
            </button>
          </>
        )}
        {!isApprovalView && ['pending_supervisor','pending_hr','approved'].includes(req.status) && (
          <button className="btn btn-danger btn-sm" onClick={() => handleCancel(req.id)}>
            <span className="material-icons" style={{ fontSize: 13 }}>cancel</span> Cancel
          </button>
        )}
        {!isApprovalView && req.status === 'approved' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setExpModal({ open: true, requestId: req.id })}>
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

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Travel &amp; Expenses</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(prev => !prev); setEditingId(null); setForm(BLANK_FORM) }}>
          <span className="material-icons">{showForm ? 'close' : 'add'}</span>
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* ── Request form ──────────────────────────────────── */}
      {showForm && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {editingId ? 'Edit Travel Request' : 'New Travel Request'}
          </h3>

          {/* ✅ Route: From → To on one row */}
          <div className="form-row">
            <div className="form-group">
              <label>Departure From *</label>
              <input className="form-control" value={form.departure_from}
                onChange={e => setForm({ ...form, departure_from: e.target.value })}
                placeholder="e.g. Kamativi Mine" />
            </div>
            <div className="form-group">
              <label>Destination *</label>
              <input className="form-control" value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Harare" />
            </div>
          </div>

          <div className="form-group">
            <label>Purpose *</label>
            <textarea className="form-control" rows="2" value={form.purpose}
              onChange={e => setForm({ ...form, purpose: e.target.value })}
              placeholder="Describe the reason for travel" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Departure Date *</label>
              <input type="date" className="form-control" value={form.departure_date}
                onChange={e => setForm({ ...form, departure_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Return Date *</label>
              <input type="date" className="form-control" value={form.return_date}
                onChange={e => setForm({ ...form, return_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Transport Mode</label>
              <select className="form-control" value={form.transport_mode}
                onChange={e => setForm({ ...form, transport_mode: e.target.value })}>
                {TRANSPORT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Per Diem Days</label>
              <input type="number" min="0" step="0.5" className="form-control"
                value={form.per_diem_days}
                onChange={e => setForm({ ...form, per_diem_days: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Per Diem Rate ($/day)</label>
              <input type="number" min="0" className="form-control"
                value={form.per_diem_rate}
                onChange={e => setForm({ ...form, per_diem_rate: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Per Diem Total</label>
              <div className="form-control" style={{ background: 'var(--surface2)', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--mono)' }}>
                ${perDiem.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Other Estimated Costs ($)</label>
              <input type="number" min="0" className="form-control"
                value={form.estimated_cost}
                onChange={e => setForm({ ...form, estimated_cost: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Cash Advance Requested ($)</label>
              <input type="number" min="0" className="form-control"
                value={form.advance_requested}
                onChange={e => setForm({ ...form, advance_requested: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => handleSave('draft')} disabled={submitting}>
              <span className="material-icons" style={{ fontSize: 14 }}>save</span> Save Draft
            </button>
            <button className="btn btn-primary" onClick={() => handleSave('pending_supervisor')} disabled={submitting}>
              <span className="material-icons" style={{ fontSize: 14 }}>send</span>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { id: 'my',        label: 'My Requests',   icon: 'flight_takeoff'   },
          { id: 'expenses',  label: 'My Expenses',   icon: 'receipt'          },
          ...(showApprovals ? [{ id: 'approvals', label: 'Pending Approvals', icon: 'approval', count: pendingCount }] : []),
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
            {tab.count > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────── */}
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          {activeTab === 'my' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {requests.length === 0 ? (
                <div className="empty-state">
                  <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>flight_takeoff</span>
                  <span>No travel requests yet — click New Request to start</span>
                </div>
              ) : requests.map(req => <RequestCard key={req.id} req={req} />)}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Date</th><th>Trip</th><th>Description</th><th>Amount</th><th>Status</th><th>Receipt</th></tr>
                </thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id}>
                      <td>{exp.claim_date}</td>
                      <td style={{ fontSize: 12 }}>{exp.travel_requests?.destination || '—'}</td>
                      <td>{exp.description}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${exp.amount}</td>
                      <td>
                        <span className={`badge ${exp.status === 'approved' ? 'badge-green' : exp.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                          {exp.status}
                        </span>
                      </td>
                      <td>
                        {exp.receipt_url
                          ? <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><span className="material-icons" style={{ fontSize: 13 }}>receipt</span></a>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && <tr><td colSpan="6" className="empty-state">No expense claims</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'approvals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingSupv.length === 0 && pendingHR.length === 0 ? (
                <div className="empty-state">
                  <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>check_circle</span>
                  <span>No travel requests pending your approval</span>
                </div>
              ) : (
                <>
                  {pendingSupv.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>Supervisor Review</div>
                      {pendingSupv.map(req => <RequestCard key={req.id} req={req} isApprovalView />)}
                    </>
                  )}
                  {pendingHR.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginTop: pendingSupv.length ? 12 : 0 }}>HR Review</div>
                      {pendingHR.map(req => <RequestCard key={req.id} req={req} isApprovalView />)}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Reject modal ──────────────────────────────────── */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject <span>Travel Request</span></div>
            <div className="form-group">
              <label>Reason *</label>
              <textarea className="form-control" rows="3"
                value={rejectModal.reason}
                onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="Explain why this request is being rejected…" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense claim modal ───────────────────────────── */}
      {expModal.open && (
        <div className="overlay" onClick={() => setExpModal({ open: false, requestId: null })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Submit <span>Expense Claim</span></div>
            <div className="form-group"><label>Date</label><input type="date" className="form-control" value={expForm.claim_date} onChange={e => setExpForm({ ...expForm, claim_date: e.target.value })} /></div>
            <div className="form-group"><label>Description *</label><input className="form-control" value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} placeholder="e.g. Accommodation, Meals, Fuel" /></div>
            <div className="form-group"><label>Amount ($) *</label><input type="number" min="0" step="0.01" className="form-control" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setExpModal({ open: false, requestId: null })}>Cancel</button>
              <button className="btn btn-primary" onClick={submitExpense}>Submit Claim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
