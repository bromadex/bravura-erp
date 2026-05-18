// src/pages/Expenses/ExpenseAdvances.jsx
// Employee advance management — request, disburse, view linked claims.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import { useExpense } from '../../contexts/ExpenseContext'
import { useHR } from '../../contexts/HRContext'
import {
  createEmployeeAdvance,
  approveAndDisburseAdvance,
} from '../../engine/expenseEngine'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, SectionCard, TabNav,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const today = () => new Date().toISOString().split('T')[0]

const ADVANCE_STATUS_COLOR = {
  draft:                           'yellow',
  unpaid:                          'orange',
  paid:                            'blue',
  claimed:                         'green',
  returned:                        'green',
  'partly claimed and returned':   'teal',
  cancelled:                       'red',
}

const TABS = [
  { id: 'mine',    label: 'My Advances' },
  { id: 'pending', label: 'Pending Approval' },
  { id: 'all',     label: 'All Advances' },
]

export default function ExpenseAdvances() {
  const { user }   = useAuth()
  const canApprove = useCanApprove('expenses', 'advances')
  const { advances, loading, fetchAll, deleteAdvance } = useExpense()
  const { employees } = useHR()

  // ── Current user's employee_id ────────────────────────────────────────────
  const [myEmployeeId, setMyEmployeeId] = useState(user?.employee_id || null)

  useEffect(() => {
    if (!myEmployeeId && user?.id) {
      supabase.from('app_users').select('employee_id').eq('id', user.id).single()
        .then(({ data }) => { if (data?.employee_id) setMyEmployeeId(data.employee_id) })
    }
  }, [user, myEmployeeId])

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('mine')
  const visibleTabs = canApprove ? TABS : TABS.filter(t => t.id === 'mine')

  const filteredAdvances = (() => {
    if (activeTab === 'mine')    return advances.filter(a => a.employee_id === myEmployeeId)
    if (activeTab === 'pending') return advances.filter(a => a.status === 'Draft')
    return advances
  })()

  const empName = (id) => employees.find(e => e.id === id)?.name || '—'
  const fmt     = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Request Advance Modal ─────────────────────────────────────────────────
  const [showModal,  setShowModal]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [form, setForm] = useState({
    employee_id:        '',
    purpose:            '',
    advance_amount:     '',
    posting_date:       today(),
    repay_from_salary:  false,
  })

  const openRequestModal = () => {
    setForm({
      employee_id:       canApprove ? '' : (myEmployeeId || ''),
      purpose:           '',
      advance_amount:    '',
      posting_date:      today(),
      repay_from_salary: false,
    })
    setShowModal(true)
  }

  const handleFormChange = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmitAdvance = async () => {
    if (!form.employee_id) { toast.error('Please select an employee'); return }
    if (!form.purpose.trim())  { toast.error('Purpose is required'); return }
    if (!form.advance_amount || parseFloat(form.advance_amount) <= 0) {
      toast.error('Advance amount must be greater than 0'); return
    }
    setSaving(true)
    try {
      await createEmployeeAdvance({
        employee_id:       form.employee_id,
        purpose:           form.purpose,
        advance_amount:    parseFloat(form.advance_amount),
        posting_date:      form.posting_date,
        repay_from_salary: form.repay_from_salary,
        created_by:        user?.full_name || user?.username || '',
      })
      toast.success('Advance request submitted')
      setShowModal(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to create advance')
    } finally {
      setSaving(false)
    }
  }

  // ── Detail Modal ──────────────────────────────────────────────────────────
  const [detailAdv,    setDetailAdv]    = useState(null)
  const [showDetail,   setShowDetail]   = useState(false)
  const [linkedClaims, setLinkedClaims] = useState([])
  const [loadingLinks, setLoadingLinks] = useState(false)

  const openDetail = async (adv) => {
    setDetailAdv(adv)
    setShowDetail(true)
    setLoadingLinks(true)
    try {
      const { data } = await supabase
        .from('expense_claim_advances')
        .select('*, expense_claims(claim_number, approval_status, grand_total)')
        .eq('advance_id', adv.id)
      setLinkedClaims(data || [])
    } catch {
      setLinkedClaims([])
    } finally {
      setLoadingLinks(false)
    }
  }

  // ── Approve & Disburse ────────────────────────────────────────────────────
  const [disbursing,    setDisbursing]    = useState(false)
  const [showDisburse,  setShowDisburse]  = useState(false)

  const handleDisburse = async () => {
    if (!detailAdv) return
    setDisbursing(true)
    try {
      await approveAndDisburseAdvance(detailAdv.id, {
        approver_name: user?.full_name || user?.username || '',
      })
      toast.success('Advance approved and disbursed')
      setShowDisburse(false)
      setShowDetail(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to disburse advance')
    } finally {
      setDisbursing(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const [showDelete, setShowDelete] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteAdvance(detailAdv.id)
      toast.success('Advance deleted')
      setShowDelete(false)
      setShowDetail(false)
    } catch (err) {
      toast.error(err.message || 'Failed to delete advance')
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <PageHeader title="Employee Advances">
        <button className="btn btn-primary btn-sm" onClick={openRequestModal}>
          <span className="material-icons">add</span> Request Advance
        </button>
      </PageHeader>

      <TabNav tabs={visibleTabs} active={activeTab} onChange={setActiveTab} />

      <SectionCard>
        {filteredAdvances.length === 0 ? (
          <EmptyState icon="account_balance_wallet" message="No advances found." />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Advance #</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Claimed</th>
                  <th>Pending</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map(adv => (
                  <tr key={adv.id}>
                    <td style={{ fontWeight: 600 }}>{adv.advance_number || '—'}</td>
                    <td>{empName(adv.employee_id)}</td>
                    <td>{adv.posting_date || '—'}</td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {adv.purpose || '—'}
                    </td>
                    <td>${fmt(adv.advance_amount)}</td>
                    <td>${fmt(adv.paid_amount)}</td>
                    <td>${fmt(adv.claimed_amount)}</td>
                    <td style={{ fontWeight: 700 }}>${fmt(adv.pending_amount)}</td>
                    <td>
                      <StatusBadge
                        status={(adv.status || '').toLowerCase().replace(/ /g, '_')}
                        label={adv.status}
                      />
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-xs btn-secondary" onClick={() => openDetail(adv)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                      </button>
                      {canApprove && adv.status === 'Draft' && (
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => { setDetailAdv(adv); setShowDisburse(true) }}
                        >
                          Disburse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Request Advance Modal ─────────────────────────────────────────── */}
      <ModalDialog open={showModal} onClose={() => setShowModal(false)} title="Request Employee Advance">
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Employee *</label>
            {canApprove ? (
              <select
                className="form-control"
                value={form.employee_id}
                onChange={e => handleFormChange('employee_id', e.target.value)}
              >
                <option value="">— Select Employee —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            ) : (
              <input className="form-control" value={empName(myEmployeeId)} disabled />
            )}
          </div>

          <div className="form-group">
            <label>Posting Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.posting_date}
              onChange={e => handleFormChange('posting_date', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Purpose *</label>
            <input
              type="text"
              className="form-control"
              value={form.purpose}
              onChange={e => handleFormChange('purpose', e.target.value)}
              placeholder="Purpose of advance…"
            />
          </div>

          <div className="form-group">
            <label>Advance Amount *</label>
            <input
              type="number"
              className="form-control"
              min="0"
              step="0.01"
              value={form.advance_amount}
              onChange={e => handleFormChange('advance_amount', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28 }}>
            <input
              type="checkbox"
              id="repay_salary"
              checked={form.repay_from_salary}
              onChange={e => handleFormChange('repay_from_salary', e.target.checked)}
            />
            <label htmlFor="repay_salary" style={{ margin: 0, cursor: 'pointer' }}>Repay from salary</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmitAdvance} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      {detailAdv && (
        <ModalDialog open={showDetail} onClose={() => setShowDetail(false)} title={`Advance ${detailAdv.advance_number || ''}`} size="lg">
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, fontSize: 13 }}>
              <div><strong>Employee:</strong> {empName(detailAdv.employee_id)}</div>
              <div><strong>Date:</strong> {detailAdv.posting_date}</div>
              <div><strong>Purpose:</strong> {detailAdv.purpose || '—'}</div>
              <div>
                <strong>Status:</strong>{' '}
                <StatusBadge
                  status={(detailAdv.status || '').toLowerCase().replace(/ /g, '_')}
                  label={detailAdv.status}
                />
              </div>
              <div><strong>Advance Amount:</strong> ${fmt(detailAdv.advance_amount)}</div>
              <div><strong>Paid Amount:</strong> ${fmt(detailAdv.paid_amount)}</div>
              <div><strong>Claimed Amount:</strong> ${fmt(detailAdv.claimed_amount)}</div>
              <div><strong>Return Amount:</strong> ${fmt(detailAdv.return_amount)}</div>
              <div><strong>Pending Amount:</strong> <span style={{ fontWeight: 700 }}>${fmt(detailAdv.pending_amount)}</span></div>
              <div><strong>Repay from Salary:</strong> {detailAdv.repay_from_salary ? 'Yes' : 'No'}</div>
            </div>

            {/* Linked Claims */}
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Linked Claims</h4>
            {loadingLinks ? (
              <Spinner />
            ) : linkedClaims.length === 0 ? (
              <EmptyState icon="receipt" message="No claims linked to this advance yet." />
            ) : (
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Claim #</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedClaims.map(link => (
                    <tr key={link.id}>
                      <td>{link.expense_claims?.claim_number || '—'}</td>
                      <td>
                        <StatusBadge status={(link.expense_claims?.approval_status || '').toLowerCase()} />
                      </td>
                      <td>${fmt(link.expense_claims?.grand_total)}</td>
                      <td>${fmt(link.allocated_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ModalActions>
            {canApprove && detailAdv.status === 'Draft' && (
              <button className="btn btn-primary" onClick={() => setShowDisburse(true)}>
                <span className="material-icons" style={{ fontSize: 14 }}>payments</span> Approve & Disburse
              </button>
            )}
            {detailAdv.status === 'Draft' && (
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
                <span className="material-icons" style={{ fontSize: 14 }}>delete</span> Delete
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setShowDetail(false)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── Approve & Disburse Confirm ────────────────────────────────────── */}
      <ConfirmDialog
        open={showDisburse}
        onClose={() => setShowDisburse(false)}
        onConfirm={handleDisburse}
        title="Approve & Disburse Advance"
        message={`Approve and disburse advance ${detailAdv?.advance_number || ''}? This will set status to Paid and record the disbursed amount.`}
        confirmLabel={disbursing ? 'Processing…' : 'Approve & Disburse'}
        loading={disbursing}
      />

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Advance"
        message={`Permanently delete advance ${detailAdv?.advance_number || ''}? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
