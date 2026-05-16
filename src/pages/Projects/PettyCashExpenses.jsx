// src/pages/Projects/PettyCashExpenses.jsx
// Petty Cash — Expense entry and management (Expenses + Exceptions tabs)

import { useState, useMemo, useCallback } from 'react'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import {
  PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions, TabNav,
} from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const TODAY = new Date().toISOString().split('T')[0]

const CATEGORIES = [
  'Office Supplies', 'Stationery', 'Meals & Entertainment', 'Transport', 'Fuel',
  'Maintenance & Repairs', 'Cleaning', 'Communication', 'Medical', 'Security',
  'Utilities', 'Hardware & Tools', 'Site Consumables', 'Miscellaneous',
]

const NO_RECEIPT_REASONS = ['Lost', 'Never Received', 'Emergency Purchase', 'Other']

const WORKFLOW_STATUSES = ['draft', 'submitted', 'approved', 'rejected']

const EMPTY_EXPENSE = {
  fund_id: '', date: TODAY, supplier: '', category: '', purpose: '', amount: '',
  has_receipt: true, receipt_lines: [],
  no_receipt_reason: '', no_receipt_explanation: '', approver_name: '',
}

function newLine() {
  return { _k: Date.now() + Math.random(), item_description: '', qty: '1', unit_price: '', total: 0 }
}

export default function PettyCashExpenses() {
  const {
    funds, transactions, exceptions, receiptLines, loading,
    addTransaction, updateTransaction, deleteTransaction,
    submitTransaction, approveTransaction, rejectTransaction,
  } = usePettyCash()

  const { user } = useAuth()
  const canEdit   = useCanEdit('projects', 'petty-cash-expenses')
  const canDelete = useCanDelete('projects', 'petty-cash-expenses')

  const [tab, setTab] = useState('expenses')

  // ── Expense modal state ───────────────────────────────────────────────────
  const [showModal,  setShowModal]  = useState(false)
  const [editingTxn, setEditingTxn] = useState(null)
  const [form,       setForm]       = useState(EMPTY_EXPENSE)
  const [lineItems,  setLineItems]  = useState([newLine()])
  const [saving,     setSaving]     = useState(false)

  // ── Reject modal ──────────────────────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting,    setRejecting]    = useState(false)

  // ── Acknowledge exception modal ───────────────────────────────────────────
  const [ackTarget, setAckTarget] = useState(null)
  const [acking,    setAcking]    = useState(false)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterFund,   setFilterFund]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [search,       setSearch]       = useState('')

  // ── Form helpers ──────────────────────────────────────────────────────────
  const setF = useCallback((field, val) => setForm(f => ({ ...f, [field]: val })), [])

  const openAdd = () => {
    setEditingTxn(null)
    setForm(EMPTY_EXPENSE)
    setLineItems([newLine()])
    setShowModal(true)
  }

  const openEdit = (txn) => {
    setEditingTxn(txn)
    setForm({
      fund_id:                txn.fund_id                || '',
      date:                   txn.date                   || TODAY,
      supplier:               txn.supplier               || '',
      category:               txn.category               || '',
      purpose:                txn.purpose                || '',
      amount:                 txn.amount                 || '',
      has_receipt:            txn.has_receipt            ?? true,
      receipt_lines:          [],
      no_receipt_reason:      txn.no_receipt_reason      || '',
      no_receipt_explanation: txn.no_receipt_explanation || '',
      approver_name:          txn.approver_name          || '',
    })
    // Map stored receipt lines
    const stored = receiptLines.filter(l => l.transaction_id === txn.id)
    setLineItems(stored.length > 0
      ? stored.map(l => ({ _k: l.id, item_description: l.item_description || '', qty: String(l.qty || 1), unit_price: String(l.unit_price || ''), total: parseFloat(l.total) || 0 }))
      : [newLine()])
    setShowModal(true)
  }

  // ── Receipt line helpers ──────────────────────────────────────────────────
  const updateLine = useCallback((k, field, val) => {
    setLineItems(prev => prev.map(li => {
      if (li._k !== k) return li
      const next = { ...li, [field]: val }
      const q = parseFloat(field === 'qty'        ? val : li.qty)        || 0
      const p = parseFloat(field === 'unit_price' ? val : li.unit_price) || 0
      next.total = parseFloat((q * p).toFixed(2))
      return next
    }))
  }, [])

  const lineTotal = lineItems.reduce((s, li) => s + (parseFloat(li.total) || 0), 0)

  // ── Save expense ──────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.fund_id)                                   return toast.error('Select a fund')
    if (!form.category)                                  return toast.error('Select a category')
    if (!form.purpose.trim())                            return toast.error('Purpose is required')
    if (!form.amount || parseFloat(form.amount) <= 0)   return toast.error('Enter a valid amount')
    if (!form.has_receipt) {
      if (!form.no_receipt_reason)                       return toast.error('Provide a reason for missing receipt')
      if (!form.no_receipt_explanation.trim())           return toast.error('Explanation is required')
      if (!form.approver_name.trim())                    return toast.error('Acknowledging manager name is required')
    }

    const lines = form.has_receipt
      ? lineItems.filter(li => li.item_description.trim())
      : []

    const payload = {
      fund_id:                form.fund_id,
      date:                   form.date,
      supplier:               form.supplier.trim()  || null,
      category:               form.category,
      purpose:                form.purpose.trim(),
      amount:                 parseFloat(form.amount),
      has_receipt:            form.has_receipt,
      receipt_lines:          lines,
      no_receipt_reason:      !form.has_receipt ? form.no_receipt_reason          : null,
      no_receipt_explanation: !form.has_receipt ? form.no_receipt_explanation     : null,
      approver_name:          !form.has_receipt ? form.approver_name              : null,
      entered_by:             user?.full_name || user?.username || null,
    }

    setSaving(true)
    try {
      if (editingTxn) {
        await updateTransaction(editingTxn.id, payload)
        toast.success('Expense updated')
      } else {
        await addTransaction({ ...payload, status: 'draft' }, lines,
          !form.has_receipt ? { reason: form.no_receipt_reason, explanation: form.no_receipt_explanation, approver_name: form.approver_name } : null)
        toast.success('Expense recorded')
      }
      setShowModal(false)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  const handleSubmitTxn = async (txn) => {
    try { await submitTransaction(txn.id); toast.success('Submitted for approval') }
    catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (txn) => {
    try { await approveTransaction(txn.id, user?.full_name || user?.username || ''); toast.success('Expense approved') }
    catch (err) { toast.error(err.message) }
  }

  const openReject = (txn) => { setRejectTarget(txn); setRejectReason('') }

  const handleReject = async () => {
    setRejecting(true)
    try {
      await rejectTransaction(rejectTarget.id, rejectReason, user?.full_name || user?.username)
      toast.success('Expense rejected')
      setRejectTarget(null)
    } catch (err) { toast.error(err.message) }
    finally { setRejecting(false) }
  }

  const handleDelete = async (txn) => {
    if (!window.confirm(`Delete expense ${txn.pce_code || ''}?`)) return
    try { await deleteTransaction(txn.id); toast.success('Expense deleted') }
    catch (err) { toast.error(err.message) }
  }

  // ── Acknowledge exception ─────────────────────────────────────────────────
  const handleAcknowledge = async () => {
    if (!ackTarget) return
    setAcking(true)
    try {
      await updateTransaction(ackTarget.transaction_id || ackTarget.id, {
        no_receipt_acknowledged: true,
        acknowledged_by:         user?.full_name || user?.username || null,
        acknowledged_at:         new Date().toISOString(),
      })
      toast.success('Exception acknowledged')
      setAckTarget(null)
    } catch (err) { toast.error(err.message) }
    finally { setAcking(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeFunds = useMemo(() =>
    funds.filter(f => (f.status || '').toLowerCase() === 'active'), [funds])

  const hasFilters = filterFund || filterStatus || filterCat || filterFrom || filterTo || search

  const filtered = useMemo(() => {
    return [...transactions]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .filter(t => {
        if (filterFund   && t.fund_id  !== filterFund)                        return false
        if (filterStatus && (t.status  || '').toLowerCase() !== filterStatus) return false
        if (filterCat    && t.category !== filterCat)                         return false
        if (filterFrom   && (t.date    || '') < filterFrom)                   return false
        if (filterTo     && (t.date    || '') > filterTo)                     return false
        if (search) {
          const q = search.toLowerCase()
          const hit = [t.pce_code, t.supplier, t.purpose, t.category]
            .some(v => (v || '').toLowerCase().includes(q))
          if (!hit) return false
        }
        return true
      })
      .map(t => {
        const fund = funds.find(f => f.id === t.fund_id)
        return { ...t, fundLabel: fund?.pcf_code || '—', custodian: fund?.custodian_name || '—', fundCurrency: fund?.currency || 'USD' }
      })
  }, [transactions, funds, filterFund, filterStatus, filterCat, filterFrom, filterTo, search])

  const allExceptions = useMemo(() =>
    exceptions.map(ex => {
      const txn  = transactions.find(t => t.id === ex.transaction_id)
      const fund = funds.find(f => f.id === txn?.fund_id)
      return { ...ex, txn, fund }
    }),
    [exceptions, transactions, funds]
  )

  const pendingExcCount = allExceptions.filter(e => !e.acknowledged && !e.no_receipt_acknowledged).length

  const tabs = [
    { id: 'expenses',   label: 'Expenses',   icon: 'receipt_long', count: transactions.length },
    { id: 'exceptions', label: 'Exceptions', icon: 'warning',      count: pendingExcCount || undefined },
  ]

  return (
    <div>
      <PageHeader
        title="Petty Cash Expenses"
        subtitle="Record, review and approve petty cash expenditures"
      >
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span>
            Add Expense
          </button>
        )}
      </PageHeader>

      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* ═══════════════════ EXPENSES TAB ═══════════════════ */}
      {tab === 'expenses' && (
        <>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <input
              className="form-control"
              placeholder="Search code, supplier, purpose…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <select className="form-control" value={filterFund} onChange={e => setFilterFund(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">All Funds</option>
              {funds.map(f => <option key={f.id} value={f.id}>{f.pcf_code || f.custodian_name}</option>)}
            </select>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ maxWidth: 150 }}>
              <option value="">All Statuses</option>
              {WORKFLOW_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <select className="form-control" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="form-control" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ width: 145 }} title="From" />
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>→</span>
            <input className="form-control" type="date" value={filterTo}   onChange={e => setFilterTo(e.target.value)}   style={{ width: 145 }} title="To" />
            {hasFilters && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setFilterFund(''); setFilterStatus(''); setFilterCat('')
                setFilterFrom(''); setFilterTo(''); setSearch('')
              }}>
                <span className="material-icons" style={{ fontSize: 14 }}>close</span> Clear
              </button>
            )}
          </div>

          {loading ? (
            <EmptyState icon="hourglass_empty" message="Loading expenses…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              message={hasFilters ? 'No expenses match your filters' : 'No expenses recorded yet'}
              action={canEdit && !hasFilters && <button className="btn btn-primary btn-sm" onClick={openAdd}>Add First Expense</button>}
            />
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Date</th>
                      <th>Fund / Custodian</th>
                      <th>Supplier</th>
                      <th>Category</th>
                      <th>Purpose</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'center' }}>Receipt</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(txn => {
                      const status    = (txn.status || '').toLowerCase()
                      const hasExc    = exceptions.some(ex => ex.transaction_id === txn.id)
                      const txnLines  = receiptLines.filter(l => l.transaction_id === txn.id)
                      return (
                        <tr key={txn.id}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)' }}>{txn.pce_code || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDate(txn.date)}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{txn.fundLabel}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{txn.custodian}</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{txn.supplier || '—'}</td>
                          <td><span className="badge badge-dim" style={{ fontSize: 10 }}>{txn.category || '—'}</span></td>
                          <td style={{ maxWidth: 180 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-dim)' }}>
                              {txn.purpose || '—'}
                            </span>
                            {txnLines.length > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{txnLines.length} line{txnLines.length !== 1 ? 's' : ''}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', fontSize: 13 }}>
                            {txn.fundCurrency} {fmtNum(txn.amount)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {txn.has_receipt
                              ? <span className="material-icons" style={{ fontSize: 16, color: 'var(--green)' }} title="Receipt">receipt</span>
                              : <span className="material-icons" style={{ fontSize: 16, color: hasExc ? 'var(--red)' : 'var(--text-dim)' }} title="No receipt">no_transfer</span>
                            }
                          </td>
                          <td><StatusBadge status={txn.status} /></td>
                          <td>
                            <div className="btn-group-sm">
                              {canEdit && status === 'draft' && (
                                <>
                                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(txn)} title="Edit">
                                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                  </button>
                                  <button className="btn btn-success btn-sm" onClick={() => handleSubmitTxn(txn)} title="Submit">
                                    <span className="material-icons" style={{ fontSize: 13 }}>send</span>
                                  </button>
                                  {canDelete && (
                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(txn)} title="Delete">
                                      <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                    </button>
                                  )}
                                </>
                              )}
                              {canEdit && (status === 'submitted' || status === 'pending') && (
                                <>
                                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(txn)} title="Approve">
                                    <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>
                                  </button>
                                  <button className="btn btn-danger btn-sm" onClick={() => openReject(txn)} title="Reject">
                                    <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>
                                  </button>
                                </>
                              )}
                              {status === 'rejected' && canEdit && (
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(txn)} title="Edit & resubmit">
                                  <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '7px 16px', fontSize: 11, color: 'var(--text-dim)', borderTop: '1px solid var(--border)' }}>
                Showing {filtered.length} of {transactions.length} expenses
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ EXCEPTIONS TAB ═══════════════════ */}
      {tab === 'exceptions' && (
        <>
          {pendingExcCount > 0 && (
            <div style={{
              marginBottom: 16, padding: '10px 16px', borderRadius: 8,
              background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.3)',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
            }}>
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--red)' }}>warning</span>
              <span style={{ color: 'var(--text-dim)' }}>
                <strong style={{ color: 'var(--red)' }}>{pendingExcCount} exception{pendingExcCount !== 1 ? 's' : ''}</strong>
                {' '}awaiting manager acknowledgment.
              </span>
            </div>
          )}

          {loading ? (
            <EmptyState icon="hourglass_empty" message="Loading…" />
          ) : allExceptions.length === 0 ? (
            <EmptyState icon="warning_amber" message="No no-receipt declarations on record" />
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)' }}>
                All expenses without a receipt require manager acknowledgment before final approval.
              </div>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Code</th>
                      <th>Fund</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Reason</th>
                      <th>Explanation</th>
                      <th>Manager</th>
                      <th>Acknowledged</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allExceptions.map(ex => {
                      const acked = ex.acknowledged || ex.no_receipt_acknowledged
                      return (
                        <tr key={ex.id} style={!acked ? { background: 'rgba(248,113,113,.04)' } : {}}>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDate(ex.txn?.date)}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--teal)' }}>{ex.txn?.pce_code || '—'}</td>
                          <td style={{ fontSize: 12 }}>{ex.fund?.pcf_code || '—'}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>
                            {ex.fund?.currency || 'USD'} {fmtNum(ex.txn?.amount)}
                          </td>
                          <td><span className="badge badge-yellow" style={{ fontSize: 10 }}>{ex.reason || ex.no_receipt_reason || '—'}</span></td>
                          <td style={{ maxWidth: 220 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-dim)' }}>
                              {ex.explanation || ex.no_receipt_explanation || '—'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>{ex.approver_name || '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {acked
                              ? <span className="badge badge-green" style={{ fontSize: 10 }}>Yes</span>
                              : <span className="badge badge-red"   style={{ fontSize: 10 }}>Pending</span>
                            }
                          </td>
                          <td>
                            {!acked && canEdit && (
                              <button className="btn btn-warning btn-sm" onClick={() => setAckTarget(ex)}>
                                <span className="material-icons" style={{ fontSize: 13 }}>how_to_reg</span>
                                Acknowledge
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ ADD / EDIT EXPENSE MODAL ═══════════════════ */}
      <ModalDialog
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingTxn ? `Edit Expense · ${editingTxn.pce_code || ''}` : 'Add Petty Cash Expense'}
        size="xl"
      >
        <form onSubmit={handleSave}>
          <div className="form-section">
            <div className="form-section-title">Expense Details</div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>FUND *</label>
                <select className="form-control" required value={form.fund_id}
                  onChange={e => setF('fund_id', e.target.value)}>
                  <option value="">— Select Active Fund —</option>
                  {activeFunds.map(f => (
                    <option key={f.id} value={f.id}>{f.pcf_code ? `${f.pcf_code} — ` : ''}{f.custodian_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>DATE *</label>
                <input type="date" className="form-control" required value={form.date}
                  onChange={e => setF('date', e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label>SUPPLIER / VENDOR</label>
                <input className="form-control" value={form.supplier}
                  onChange={e => setF('supplier', e.target.value)}
                  placeholder="e.g. ABC Hardware Store" />
              </div>
              <div className="form-group">
                <label>CATEGORY *</label>
                <select className="form-control" required value={form.category}
                  onChange={e => setF('category', e.target.value)}>
                  <option value="">— Select Category —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>PURPOSE *</label>
              <textarea className="form-control" rows={2} required value={form.purpose}
                onChange={e => setF('purpose', e.target.value)}
                placeholder="Describe what this expense was for…"
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-row" style={{ alignItems: 'flex-start' }}>
              <div className="form-group">
                <label>AMOUNT *</label>
                <input type="number" step="0.01" min="0.01" className="form-control" required
                  value={form.amount}
                  onChange={e => setF('amount', e.target.value)}
                  placeholder="0.00" />
              </div>
              <div className="form-group">
                <label style={{ marginBottom: 8 }}>RECEIPT</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8 }}>
                  <input type="checkbox" checked={form.has_receipt}
                    onChange={e => setF('has_receipt', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--green)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Has Receipt?</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {form.has_receipt ? 'Receipt available — itemise below (optional)' : 'No receipt — declaration required'}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Receipt line items */}
          {form.has_receipt && (
            <div className="form-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="form-section-title" style={{ marginBottom: 0 }}>
                  Receipt Line Items <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 10 }}>optional</span>
                </div>
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => setLineItems(prev => [...prev, newLine()])}>
                  <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Item
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                  No line items. Click "Add Item" to itemise the receipt.
                </div>
              ) : (
                <>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)' }}>DESCRIPTION</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)', width: 70 }}>QTY</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)', width: 100 }}>UNIT PRICE</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600, fontSize: 10, fontFamily: 'var(--mono)', width: 100 }}>TOTAL</th>
                          <th style={{ width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map(li => (
                          <tr key={li._k} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '3px 5px' }}>
                              <input className="form-control" value={li.item_description}
                                onChange={e => updateLine(li._k, 'item_description', e.target.value)}
                                placeholder="Item description"
                                style={{ padding: '5px 8px', fontSize: 12 }} />
                            </td>
                            <td style={{ padding: '3px 5px' }}>
                              <input type="number" min="0" step="any" className="form-control"
                                value={li.qty}
                                onChange={e => updateLine(li._k, 'qty', e.target.value)}
                                placeholder="1"
                                style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '3px 5px' }}>
                              <input type="number" min="0" step="0.01" className="form-control"
                                value={li.unit_price}
                                onChange={e => updateLine(li._k, 'unit_price', e.target.value)}
                                placeholder="0.00"
                                style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right' }} />
                            </td>
                            <td style={{ padding: '3px 12px 3px 5px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>
                              {fmtNum(li.total)}
                            </td>
                            <td style={{ padding: '3px 5px', textAlign: 'center' }}>
                              <button type="button" className="btn btn-danger btn-sm btn-icon"
                                onClick={() => setLineItems(prev => prev.filter(x => x._k !== li._k))}>
                                <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--surface2)' }}>
                          <td colSpan={3} style={{ padding: '7px 10px', fontWeight: 700, fontSize: 12 }}>Lines Total</td>
                          <td style={{
                            padding: '7px 12px 7px 5px', textAlign: 'right',
                            fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14,
                            color: Math.abs(lineTotal - parseFloat(form.amount || 0)) < 0.01 ? 'var(--green)' : 'var(--yellow)',
                          }}>
                            {fmtNum(lineTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {parseFloat(form.amount || 0) > 0 && Math.abs(lineTotal - parseFloat(form.amount)) > 0.01 && (
                    <div style={{ fontSize: 11, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-icons" style={{ fontSize: 13 }}>info</span>
                      Lines total ({fmtNum(lineTotal)}) does not match expense amount ({fmtNum(parseFloat(form.amount))})
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* No-receipt declaration */}
          {!form.has_receipt && (
            <div className="form-section" style={{ border: '2px solid rgba(248,113,113,.4)', background: 'rgba(248,113,113,.05)', borderRadius: 8, padding: 16, marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="material-icons" style={{ fontSize: 20, color: 'var(--red)' }}>warning</span>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  No Receipt Declaration
                </div>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-dim)', marginBottom: 14,
                padding: '8px 12px', background: 'rgba(248,113,113,.08)',
                borderRadius: 6, border: '1px solid rgba(248,113,113,.25)',
                display: 'flex', gap: 6,
              }}>
                <span className="material-icons" style={{ fontSize: 14, color: 'var(--red)', flexShrink: 0, marginTop: 1 }}>info</span>
                This requires manager acknowledgment before the expense can be approved.
              </div>
              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label>REASON FOR NO RECEIPT *</label>
                  <select className="form-control" value={form.no_receipt_reason}
                    onChange={e => setF('no_receipt_reason', e.target.value)}
                    style={{ borderColor: 'rgba(248,113,113,.4)' }}>
                    <option value="">— Select Reason —</option>
                    {NO_RECEIPT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>ACKNOWLEDGING MANAGER *</label>
                  <input className="form-control" value={form.approver_name}
                    onChange={e => setF('approver_name', e.target.value)}
                    placeholder="Full name of acknowledging manager"
                    style={{ borderColor: 'rgba(248,113,113,.4)' }} />
                </div>
              </div>
              <div className="form-group">
                <label>DETAILED EXPLANATION *</label>
                <textarea className="form-control" rows={3} value={form.no_receipt_explanation}
                  onChange={e => setF('no_receipt_explanation', e.target.value)}
                  placeholder="Provide a clear explanation of why no receipt is available…"
                  style={{ resize: 'vertical', borderColor: 'rgba(248,113,113,.4)' }} />
              </div>
            </div>
          )}

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingTxn ? 'Update Expense' : 'Record Expense'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ═══════════════════ REJECT MODAL ═══════════════════ */}
      <ModalDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={`Reject Expense · ${rejectTarget?.pce_code || ''}`}
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
          Provide a reason for rejecting. The custodian will see this when editing the expense.
        </div>
        <div className="form-group" style={{ marginBottom: 4 }}>
          <label>REASON FOR REJECTION</label>
          <textarea className="form-control" rows={3} value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="e.g. Amount does not match receipt, insufficient documentation…"
            style={{ resize: 'vertical' }} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={rejecting}>
            {rejecting ? 'Rejecting…' : 'Reject Expense'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ═══════════════════ ACKNOWLEDGE MODAL ═══════════════════ */}
      <ModalDialog
        open={!!ackTarget}
        onClose={() => setAckTarget(null)}
        title="Acknowledge No-Receipt Exception"
      >
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
          You are acknowledging the following no-receipt expense as the responsible manager:
        </div>
        {ackTarget && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--surface2)', marginBottom: 16, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-dim)' }}>Code</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{ackTarget.txn?.pce_code || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-dim)' }}>Amount</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>
                {ackTarget.fund?.currency || 'USD'} {fmtNum(ackTarget.txn?.amount)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--text-dim)' }}>Reason</span>
              <span>{ackTarget.reason || ackTarget.no_receipt_reason || '—'}</span>
            </div>
            {(ackTarget.explanation || ackTarget.no_receipt_explanation) && (
              <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--surface)', borderRadius: 6, color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.5 }}>
                {ackTarget.explanation || ackTarget.no_receipt_explanation}
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px', background: 'rgba(251,191,36,.07)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 6 }}>
          <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>info</span>
          By acknowledging, you confirm awareness of this expense and accept responsibility for its approval without a receipt.
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setAckTarget(null)}>Cancel</button>
          <button className="btn btn-success" onClick={handleAcknowledge} disabled={acking}>
            {acking ? 'Saving…' : 'Acknowledge Exception'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
