// src/pages/Expenses/ExpenseClaims.jsx
// Full expense claim management — list, multi-step new claim modal, detail view.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import { useExpense } from '../../contexts/ExpenseContext'
import { useHR } from '../../contexts/HRContext'
import {
  createExpenseClaim,
  submitExpenseClaim,
  approveExpenseClaim,
  rejectExpenseClaim,
  markExpenseClaimPaid,
} from '../../engine/expenseEngine'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, SectionCard, TabNav,
  ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const today = () => new Date().toISOString().split('T')[0]

const emptyLine = () => ({
  _key:          Math.random().toString(36).slice(2),
  expense_type_id: '',
  expense_date:  today(),
  description:   '',
  claimed_amount: '',
  receipt_url:   '',
})

const TABS = [
  { id: 'mine',     label: 'My Claims' },
  { id: 'pending',  label: 'Pending Approval' },
  { id: 'all',      label: 'All Claims' },
]

export default function ExpenseClaims() {
  const { user }   = useAuth()
  const canApprove = useCanApprove('expenses', 'claims')
  const { claims, expenseTypes, loading, fetchAll, deleteClaim } = useExpense()
  const { employees } = useHR()

  // ── Current user's employee_id ────────────────────────────────────────────
  const [myEmployeeId, setMyEmployeeId] = useState(user?.employee_id || null)
  const [appUsers,     setAppUsers]     = useState([])

  useEffect(() => {
    // Resolve employee_id
    if (!myEmployeeId && user?.id) {
      supabase.from('app_users').select('employee_id').eq('id', user.id).single()
        .then(({ data }) => { if (data?.employee_id) setMyEmployeeId(data.employee_id) })
    }
    // Load app_users for approver selector
    supabase.from('app_users').select('id, full_name, employee_id').eq('is_active', true)
      .then(({ data }) => setAppUsers(data || []))
  }, [user, myEmployeeId])

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('mine')

  const visibleTabs = canApprove ? TABS : TABS.filter(t => t.id === 'mine')

  const filteredClaims = (() => {
    if (activeTab === 'mine')    return claims.filter(c => c.employee_id === myEmployeeId)
    if (activeTab === 'pending') return claims.filter(c => c.approval_status === 'Submitted')
    return claims
  })()

  // ── Employee name lookup ──────────────────────────────────────────────────
  const empName = (id) => employees.find(e => e.id === id)?.name || '—'

  // ── New Claim Modal state ─────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [step,      setStep]      = useState(1)  // 1=header, 2=lines, 3=review
  const [saving,    setSaving]    = useState(false)

  const [header, setHeader] = useState({
    employee_id:            '',
    posting_date:           today(),
    expense_approver_id:    '',
    expense_approver_name:  '',
    remark:                 '',
  })
  const [lines, setLines] = useState([emptyLine()])

  const openNewClaimModal = () => {
    setHeader({
      employee_id:           canApprove ? '' : (myEmployeeId || ''),
      posting_date:          today(),
      expense_approver_id:   '',
      expense_approver_name: '',
      remark:                '',
    })
    setLines([emptyLine()])
    setStep(1)
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setStep(1) }

  const handleHeaderChange = (field, value) => setHeader(h => ({ ...h, [field]: value }))

  const handleApproverChange = (userId) => {
    const u = appUsers.find(a => a.id === userId)
    setHeader(h => ({ ...h, expense_approver_id: userId, expense_approver_name: u?.full_name || '' }))
  }

  // Line management
  const addLine    = () => setLines(ls => [...ls, emptyLine()])
  const removeLine = (key) => setLines(ls => ls.filter(l => l._key !== key))
  const setLine    = (key, field, value) =>
    setLines(ls => ls.map(l => l._key === key ? { ...l, [field]: value } : l))

  const totalClaimed = lines.reduce((s, l) => s + (parseFloat(l.claimed_amount) || 0), 0)

  const handleSubmitClaim = async (saveAsDraft) => {
    if (!header.employee_id) { toast.error('Please select an employee'); return }
    if (lines.every(l => !l.expense_type_id)) { toast.error('Add at least one expense line'); return }
    setSaving(true)
    try {
      const claimData = {
        employee_id:           header.employee_id,
        posting_date:          header.posting_date,
        expense_approver_id:   header.expense_approver_id || null,
        expense_approver_name: header.expense_approver_name || null,
        remark:                header.remark || null,
        lines: lines
          .filter(l => l.expense_type_id)
          .map((l, idx) => ({
            expense_type_id: l.expense_type_id,
            expense_date:    l.expense_date,
            description:     l.description,
            claimed_amount:  parseFloat(l.claimed_amount) || 0,
            receipt_url:     l.receipt_url || null,
            seq:             idx + 1,
          })),
      }
      const { id } = await createExpenseClaim(claimData)
      if (!saveAsDraft) {
        await submitExpenseClaim(id, user?.full_name || user?.username || '')
        toast.success('Claim submitted for approval')
      } else {
        toast.success('Claim saved as draft')
      }
      closeModal()
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to save claim')
    } finally {
      setSaving(false)
    }
  }

  // ── Detail / approval modal ───────────────────────────────────────────────
  const [detailClaim,   setDetailClaim]   = useState(null)
  const [showDetail,    setShowDetail]    = useState(false)

  // Sanction modal (per-line sanctioning)
  const [showSanction,  setShowSanction]  = useState(false)
  const [sanctionLines, setSanctionLines] = useState([])
  const [sanctioning,   setSanctioning]   = useState(false)

  // Reject modal
  const [showReject,    setShowReject]    = useState(false)
  const [rejectReason,  setRejectReason]  = useState('')
  const [rejecting,     setRejecting]     = useState(false)

  // Mark paid confirm
  const [showMarkPaid,  setShowMarkPaid]  = useState(false)
  const [markingPaid,   setMarkingPaid]   = useState(false)

  // Delete confirm
  const [showDelete,    setShowDelete]    = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  const openDetail = (claim) => {
    setDetailClaim(claim)
    setShowDetail(true)
  }

  const openSanction = (claim) => {
    setSanctionLines(
      (claim.expense_claim_details || []).map(d => ({
        ...d,
        sanctioned_amount: d.sanctioned_amount ?? d.claimed_amount,
      }))
    )
    setShowSanction(true)
  }

  const handleApprove = async () => {
    if (!detailClaim) return
    setSanctioning(true)
    try {
      await approveExpenseClaim(detailClaim.id, {
        approver_name: user?.full_name || user?.username || '',
        lines: sanctionLines.map(l => ({
          id:                l.id,
          sanctioned_amount: parseFloat(l.sanctioned_amount) || 0,
        })),
      })
      toast.success('Claim approved')
      setShowSanction(false)
      setShowDetail(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to approve claim')
    } finally {
      setSanctioning(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Please enter a rejection reason'); return }
    setRejecting(true)
    try {
      await rejectExpenseClaim(detailClaim.id, {
        reason:        rejectReason,
        approver_name: user?.full_name || user?.username || '',
      })
      toast.success('Claim rejected')
      setShowReject(false)
      setShowDetail(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to reject claim')
    } finally {
      setRejecting(false)
    }
  }

  const handleMarkPaid = async () => {
    setMarkingPaid(true)
    try {
      await markExpenseClaimPaid(detailClaim.id, { paid_by: user?.full_name || user?.username || '' })
      toast.success('Claim marked as paid')
      setShowMarkPaid(false)
      setShowDetail(false)
      await fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to mark claim as paid')
    } finally {
      setMarkingPaid(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteClaim(detailClaim.id)
      toast.success('Claim deleted')
      setShowDelete(false)
      setShowDetail(false)
    } catch (err) {
      toast.error(err.message || 'Failed to delete claim')
    } finally {
      setDeleting(false)
    }
  }

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <PageHeader title="Expense Claims">
        <button className="btn btn-primary btn-sm" onClick={openNewClaimModal}>
          <span className="material-icons">add</span> New Claim
        </button>
      </PageHeader>

      <TabNav tabs={visibleTabs} active={activeTab} onChange={setActiveTab} />

      <SectionCard>
        {filteredClaims.length === 0 ? (
          <EmptyState icon="receipt_long" message="No claims found." />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Lines</th>
                  <th>Claimed</th>
                  <th>Sanctioned</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map(claim => (
                  <tr key={claim.id}>
                    <td style={{ fontWeight: 600 }}>{claim.claim_number || '—'}</td>
                    <td>{empName(claim.employee_id)}</td>
                    <td>{claim.posting_date || '—'}</td>
                    <td>{(claim.expense_claim_details || []).length}</td>
                    <td>${fmt(claim.total_claimed_amount)}</td>
                    <td>${fmt(claim.total_sanctioned_amount)}</td>
                    <td><StatusBadge status={(claim.approval_status || '').toLowerCase()} /></td>
                    <td>
                      <button className="btn btn-xs btn-secondary" onClick={() => openDetail(claim)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>visibility</span> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── New Claim Multi-Step Modal ────────────────────────────────────── */}
      <ModalDialog open={showModal} onClose={closeModal} title={`New Expense Claim — Step ${step} of 3`} size="lg">
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          {['Header', 'Lines', 'Review'].map((label, i) => (
            <span
              key={i}
              style={{
                padding: '4px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: step === i + 1 ? 'var(--blue)' : 'var(--surface2)',
                color:      step === i + 1 ? '#fff' : 'var(--text-dim)',
              }}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* Step 1: Header */}
          {step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ gridColumn: canApprove ? '1' : '1 / -1' }}>
                <label>Employee *</label>
                {canApprove ? (
                  <select
                    className="form-control"
                    value={header.employee_id}
                    onChange={e => handleHeaderChange('employee_id', e.target.value)}
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
                  value={header.posting_date}
                  onChange={e => handleHeaderChange('posting_date', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Expense Approver</label>
                <select
                  className="form-control"
                  value={header.expense_approver_id}
                  onChange={e => handleApproverChange(e.target.value)}
                >
                  <option value="">— Select Approver —</option>
                  {appUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Remark</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={header.remark}
                  onChange={e => handleHeaderChange('remark', e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>
            </div>
          )}

          {/* Step 2: Lines */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={addLine}>
                  <span className="material-icons">add</span> Add Line
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {lines.map((line, idx) => (
                  <div
                    key={line._key}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, position: 'relative' }}
                  >
                    <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                      Line {idx + 1}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Expense Type *</label>
                        <select
                          className="form-control"
                          value={line.expense_type_id}
                          onChange={e => setLine(line._key, 'expense_type_id', e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {expenseTypes.map(et => (
                            <option key={et.id} value={et.id}>{et.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Date *</label>
                        <input
                          type="date"
                          className="form-control"
                          value={line.expense_date}
                          onChange={e => setLine(line._key, 'expense_date', e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Claimed Amount *</label>
                        <input
                          type="number"
                          className="form-control"
                          min="0"
                          step="0.01"
                          value={line.claimed_amount}
                          onChange={e => setLine(line._key, 'claimed_amount', e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / 3' }}>
                        <label>Description</label>
                        <input
                          type="text"
                          className="form-control"
                          value={line.description}
                          onChange={e => setLine(line._key, 'description', e.target.value)}
                          placeholder="Brief description…"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Receipt URL</label>
                        <input
                          type="text"
                          className="form-control"
                          value={line.receipt_url}
                          onChange={e => setLine(line._key, 'receipt_url', e.target.value)}
                          placeholder="https://…"
                        />
                      </div>
                    </div>
                    {lines.length > 1 && (
                      <button
                        className="btn btn-danger btn-xs"
                        style={{ marginTop: 8 }}
                        onClick={() => removeLine(line._key)}
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>delete</span> Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, textAlign: 'right', fontWeight: 700 }}>
                Total Claimed: ${fmt(totalClaimed)}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <strong>Employee:</strong> {empName(header.employee_id) || header.employee_id}<br />
                <strong>Date:</strong> {header.posting_date}<br />
                {header.expense_approver_name && <><strong>Approver:</strong> {header.expense_approver_name}<br /></>}
                {header.remark && <><strong>Remark:</strong> {header.remark}<br /></>}
              </div>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.filter(l => l.expense_type_id).map((l, idx) => (
                    <tr key={l._key}>
                      <td>{idx + 1}</td>
                      <td>{expenseTypes.find(et => et.id === l.expense_type_id)?.name || l.expense_type_id}</td>
                      <td>{l.expense_date}</td>
                      <td>{l.description || '—'}</td>
                      <td>${fmt(l.claimed_amount)}</td>
                      <td>{l.receipt_url ? <a href={l.receipt_url} target="_blank" rel="noreferrer">View</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>${fmt(totalClaimed)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <ModalActions>
          {step > 1 && (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
          {step < 3 && (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
              Next
            </button>
          )}
          {step === 3 && (
            <>
              <button className="btn btn-secondary" onClick={() => handleSubmitClaim(true)} disabled={saving}>
                Save as Draft
              </button>
              <button className="btn btn-primary" onClick={() => handleSubmitClaim(false)} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit Claim'}
              </button>
            </>
          )}
        </ModalActions>
      </ModalDialog>

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      {detailClaim && (
        <ModalDialog open={showDetail} onClose={() => setShowDetail(false)} title={`Claim ${detailClaim.claim_number || ''}`} size="lg">
          <div style={{ padding: 20 }}>
            {/* Status timeline */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
              {['Draft', 'Submitted', 'Approved', 'Paid'].map((s, i, arr) => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    background: detailClaim.approval_status === s || (s === 'Paid' && detailClaim.is_paid)
                      ? 'var(--green)' : 'var(--surface2)',
                    color: detailClaim.approval_status === s || (s === 'Paid' && detailClaim.is_paid)
                      ? '#fff' : 'var(--text-dim)',
                  }}>{s}</span>
                  {i < arr.length - 1 && <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>chevron_right</span>}
                </span>
              ))}
              {['Rejected', 'Cancelled'].includes(detailClaim.approval_status) && (
                <StatusBadge status={detailClaim.approval_status.toLowerCase()} />
              )}
            </div>

            {/* Header info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
              <div><strong>Employee:</strong> {empName(detailClaim.employee_id)}</div>
              <div><strong>Date:</strong> {detailClaim.posting_date}</div>
              <div><strong>Approver:</strong> {detailClaim.expense_approver_name || '—'}</div>
              <div><strong>Remark:</strong> {detailClaim.remark || '—'}</div>
              <div><strong>Claimed:</strong> ${fmt(detailClaim.total_claimed_amount)}</div>
              <div><strong>Sanctioned:</strong> ${fmt(detailClaim.total_sanctioned_amount)}</div>
            </div>

            {/* Lines table */}
            <table className="stock-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Claimed</th>
                  <th>Sanctioned</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(detailClaim.expense_claim_details || []).map((d, idx) => (
                  <tr key={d.id}>
                    <td>{idx + 1}</td>
                    <td>{expenseTypes.find(et => et.id === d.expense_type_id)?.name || '—'}</td>
                    <td>{d.expense_date}</td>
                    <td>{d.description || '—'}</td>
                    <td>${fmt(d.claimed_amount)}</td>
                    <td>${fmt(d.sanctioned_amount)}</td>
                    <td>{d.receipt_url ? <a href={d.receipt_url} target="_blank" rel="noreferrer">View</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ModalActions>
            {/* Approve (opens sanction modal) */}
            {canApprove && detailClaim.approval_status === 'Submitted' && (
              <button className="btn btn-primary" onClick={() => { openSanction(detailClaim); setShowDetail(false) }}>
                <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span> Approve
              </button>
            )}
            {/* Reject */}
            {canApprove && detailClaim.approval_status === 'Submitted' && (
              <button className="btn btn-danger" onClick={() => setShowReject(true)}>
                <span className="material-icons" style={{ fontSize: 14 }}>cancel</span> Reject
              </button>
            )}
            {/* Mark Paid */}
            {canApprove && detailClaim.approval_status === 'Approved' && !detailClaim.is_paid && (
              <button className="btn btn-secondary" onClick={() => setShowMarkPaid(true)}>
                <span className="material-icons" style={{ fontSize: 14 }}>payments</span> Mark Paid
              </button>
            )}
            {/* Delete (Draft only) */}
            {detailClaim.status === 'Draft' && (
              <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
                <span className="material-icons" style={{ fontSize: 14 }}>delete</span> Delete
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setShowDetail(false)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── Sanction Modal ────────────────────────────────────────────────── */}
      <ModalDialog open={showSanction} onClose={() => { setShowSanction(false); setShowDetail(true) }} title="Approve & Sanction Claim" size="lg">
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--text-dim)' }}>
            Review and set sanctioned amounts per line. These may differ from claimed amounts.
          </p>
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Description</th>
                <th>Claimed</th>
                <th>Sanctioned</th>
              </tr>
            </thead>
            <tbody>
              {sanctionLines.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td>{idx + 1}</td>
                  <td>{expenseTypes.find(et => et.id === line.expense_type_id)?.name || '—'}</td>
                  <td>{line.description || '—'}</td>
                  <td>${fmt(line.claimed_amount)}</td>
                  <td>
                    <input
                      type="number"
                      className="form-control"
                      style={{ width: 120 }}
                      min="0"
                      step="0.01"
                      value={line.sanctioned_amount}
                      onChange={e =>
                        setSanctionLines(ls =>
                          ls.map((l, i) => i === idx ? { ...l, sanctioned_amount: e.target.value } : l)
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total Sanctioned</td>
                <td />
                <td style={{ fontWeight: 700 }}>
                  ${fmt(sanctionLines.reduce((s, l) => s + (parseFloat(l.sanctioned_amount) || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => { setShowSanction(false); setShowDetail(true) }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApprove} disabled={sanctioning}>
            {sanctioning ? 'Approving…' : 'Approve Claim'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Reject Modal ─────────────────────────────────────────────────── */}
      <ModalDialog open={showReject} onClose={() => setShowReject(false)} title="Reject Claim">
        <div style={{ padding: 20 }}>
          <div className="form-group">
            <label>Rejection Reason *</label>
            <textarea
              className="form-control"
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Explain why this claim is being rejected…"
            />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowReject(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={rejecting}>
            {rejecting ? 'Rejecting…' : 'Reject Claim'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Mark Paid Confirm ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showMarkPaid}
        onClose={() => setShowMarkPaid(false)}
        onConfirm={handleMarkPaid}
        title="Mark Claim as Paid"
        message={`Mark claim ${detailClaim?.claim_number || ''} as paid? This records full reimbursement.`}
        confirmLabel={markingPaid ? 'Processing…' : 'Mark Paid'}
        loading={markingPaid}
      />

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Claim"
        message={`Permanently delete claim ${detailClaim?.claim_number || ''}? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        loading={deleting}
      />
    </div>
  )
}
