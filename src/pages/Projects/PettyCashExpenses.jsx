// src/pages/Projects/PettyCashExpenses.jsx
// Petty cash expense entry, receipt line items, no-receipt declarations, workflow actions.

import { useState, useMemo } from 'react'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const CATEGORIES = [
  'Office Supplies', 'Stationery', 'Meals & Entertainment', 'Transport', 'Fuel',
  'Maintenance & Repairs', 'Cleaning', 'Communication', 'Medical', 'Security',
  'Utilities', 'Hardware & Tools', 'Site Consumables', 'Miscellaneous',
]

const NO_RECEIPT_REASONS = ['Lost', 'Never Received', 'Emergency Purchase', 'Petty Amount < $5', 'Other']

const BLANK_TXN = {
  fund_id: '', date: new Date().toISOString().split('T')[0],
  supplier: '', category: '', purpose: '', amount: '',
  has_receipt: true, attachment_url: '',
}

const BLANK_EXCEPTION = {
  reason: '', explanation: '', approver_name: '', approver_id: '',
}

function newLineItem() { return { _key: Date.now() + Math.random(), item_description: '', qty: '1', unit_price: '', total: '' } }

export default function PettyCashExpenses() {
  const {
    funds, transactions, exceptions, receiptLines, loading,
    addTransaction, deleteTransaction,
    submitTransaction, approveTransaction, rejectTransaction,
  } = usePettyCash()

  const canEdit   = useCanEdit('projects', 'petty-cash-expenses')
  const canDelete = useCanDelete('projects', 'petty-cash-expenses')

  const [tab, setTab]           = useState('expenses')
  const [showModal, setShowModal] = useState(false)
  const [editingTxn, setEditingTxn] = useState(null)
  const [form, setForm]           = useState(BLANK_TXN)
  const [exception, setException] = useState(BLANK_EXCEPTION)
  const [lineItems, setLineItems] = useState([newLineItem()])
  const [saving, setSaving]       = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  // Filters
  const [filterFund,   setFilterFund]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const openAdd = () => {
    setEditingTxn(null)
    setForm(BLANK_TXN)
    setException(BLANK_EXCEPTION)
    setLineItems([newLineItem()])
    setShowModal(true)
  }

  const updateLine = (key, field, val) => {
    setLineItems(prev => prev.map(li => {
      if (li._key !== key) return li
      const next = { ...li, [field]: val }
      if (field === 'qty' || field === 'unit_price') {
        const q = parseFloat(field === 'qty' ? val : li.qty) || 0
        const p = parseFloat(field === 'unit_price' ? val : li.unit_price) || 0
        next.total = (q * p).toFixed(2)
      }
      return next
    }))
  }

  const lineTotal = lineItems.reduce((s, li) => s + (parseFloat(li.total) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.fund_id)   return toast.error('Select a fund')
    if (!form.category)  return toast.error('Select a category')
    if (!form.purpose)   return toast.error('Purpose is required')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (!form.has_receipt && !exception.reason)   return toast.error('Provide a reason for missing receipt')
    if (!form.has_receipt && !exception.explanation) return toast.error('Provide an explanation')

    const lines = form.has_receipt
      ? lineItems.filter(li => li.item_description.trim())
      : []
    const exc = !form.has_receipt ? {
      reason:       exception.reason,
      explanation:  exception.explanation,
      approver_name: exception.approver_name,
      approver_id:  exception.approver_id || null,
    } : null

    setSaving(true)
    try {
      const code = await addTransaction({
        fund_id:       form.fund_id,
        date:          form.date,
        supplier:      form.supplier,
        category:      form.category,
        purpose:       form.purpose,
        amount:        parseFloat(form.amount),
        has_receipt:   form.has_receipt,
        attachment_url: form.attachment_url || null,
      }, lines, exc)
      toast.success(`Expense recorded — ${code}`)
      setShowModal(false)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (txn) => {
    if (!window.confirm(`Delete expense ${txn.pce_code}?`)) return
    try {
      await deleteTransaction(txn.id)
      toast.success('Expense deleted')
    } catch (err) { toast.error(err.message) }
  }

  const handleSubmitToWorkflow = async (txnId) => {
    try {
      await submitTransaction(txnId)
    } catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (txnId) => {
    try {
      await approveTransaction(txnId, '')
      toast.success('Expense approved')
    } catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return toast.error('Rejection reason required')
    try {
      await rejectTransaction(rejectTarget, rejectReason)
      setRejectTarget(null)
      setRejectReason('')
    } catch (err) { toast.error(err.message) }
  }

  const filtered = useMemo(() => transactions.filter(t => {
    if (filterFund   && t.fund_id !== filterFund)   return false
    if (filterStatus && t.status !== filterStatus)   return false
    if (filterCat    && t.category !== filterCat)    return false
    if (filterFrom   && t.date < filterFrom)         return false
    if (filterTo     && t.date > filterTo)           return false
    return true
  }), [transactions, filterFund, filterStatus, filterCat, filterFrom, filterTo])

  const allExceptions = exceptions.map(ex => {
    const txn = transactions.find(t => t.id === ex.transaction_id)
    const fund = funds.find(f => f.id === txn?.fund_id)
    return { ...ex, txn, fund }
  })

  return (
    <div>
      <PageHeader title="Petty Cash Expenses">
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Expense
          </button>
        )}
      </PageHeader>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {[{ id: 'expenses', label: 'Expenses' }, { id: 'exceptions', label: `No-Receipt Declarations (${exceptions.length})` }].map(t => (
          <button key={t.id} className={`tab-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters (expenses tab) */}
      {tab === 'expenses' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <select className="form-control" style={{ width: 'auto', minWidth: 160 }}
            value={filterFund} onChange={e => setFilterFund(e.target.value)}>
            <option value="">All Funds</option>
            {funds.map(f => <option key={f.id} value={f.id}>{f.pcf_code} — {f.custodian_name}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto' }}
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {['draft','submitted','pending','approved','rejected','cancelled'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select className="form-control" style={{ width: 'auto', minWidth: 160 }}
            value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" className="form-control" style={{ width: 'auto' }}
            value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          <input type="date" className="form-control" style={{ width: 'auto' }}
            value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          {(filterFund || filterStatus || filterCat || filterFrom || filterTo) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterFund(''); setFilterStatus(''); setFilterCat(''); setFilterFrom(''); setFilterTo('') }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Expenses Table */}
      {tab === 'expenses' && (
        loading ? <EmptyState icon="hourglass_empty" message="Loading…" /> :
        filtered.length === 0 ? <EmptyState icon="receipt_long" message="No expenses found" /> : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Code</th><th>Date</th><th>Fund</th><th>Category</th>
                  <th>Supplier</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Receipt</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(txn => {
                  const fund = funds.find(f => f.id === txn.fund_id)
                  const hasExc = exceptions.some(ex => ex.transaction_id === txn.id)
                  const txnLines = receiptLines.filter(l => l.transaction_id === txn.id)
                  return (
                    <tr key={txn.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>{txn.pce_code}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(txn.date)}</td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{fund?.pcf_code || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fund?.custodian_name}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{txn.category}</td>
                      <td style={{ fontSize: 12 }}>{txn.supplier || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 200 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.purpose}
                        </span>
                        {txnLines.length > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{txnLines.length} item{txnLines.length !== 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {fund?.currency || 'USD'} {fmtNum(txn.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {txn.has_receipt
                          ? <span className="material-icons" style={{ fontSize: 16, color: 'var(--green)' }}>receipt</span>
                          : <span title="No receipt" className="material-icons" style={{ fontSize: 16, color: 'var(--red)' }}>{hasExc ? 'warning' : 'do_not_disturb'}</span>
                        }
                      </td>
                      <td><StatusBadge status={txn.status} /></td>
                      <td>
                        <div className="btn-group-sm">
                          {canEdit && txn.status === 'draft' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleSubmitToWorkflow(txn.id)} title="Submit for approval">
                              <span className="material-icons">send</span>
                            </button>
                          )}
                          {canEdit && (txn.status === 'submitted' || txn.status === 'pending') && (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => handleApprove(txn.id)}>
                                <span className="material-icons">check</span>
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => { setRejectTarget(txn.id); setRejectReason('') }}>
                                <span className="material-icons">close</span>
                              </button>
                            </>
                          )}
                          {canDelete && txn.status === 'draft' && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(txn)}>
                              <span className="material-icons">delete</span>
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
        )
      )}

      {/* Exceptions Tab */}
      {tab === 'exceptions' && (
        allExceptions.length === 0
          ? <EmptyState icon="do_not_disturb" message="No no-receipt declarations" />
          : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Expense</th><th>Date</th><th>Fund</th><th>Amount</th>
                    <th>Reason</th><th>Explanation</th><th>Approver</th><th>Acknowledged</th>
                  </tr>
                </thead>
                <tbody>
                  {allExceptions.map(ex => (
                    <tr key={ex.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)' }}>{ex.txn?.pce_code || '—'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(ex.txn?.date)}</td>
                      <td style={{ fontSize: 12 }}>{ex.fund?.pcf_code} — {ex.fund?.custodian_name}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {ex.fund?.currency || 'USD'} {fmtNum(ex.txn?.amount)}
                      </td>
                      <td><span className="badge badge-yellow" style={{ fontSize: 10 }}>{ex.reason}</span></td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ex.explanation}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{ex.approver_name || '—'}</td>
                      <td>
                        {ex.acknowledged
                          ? <span className="badge badge-green" style={{ fontSize: 10 }}>Yes</span>
                          : <span className="badge badge-red" style={{ fontSize: 10 }}>Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {/* Add Expense Modal */}
      <ModalDialog open={showModal} onClose={() => setShowModal(false)} title="Add Petty Cash Expense">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Fund *</label>
              <select className="form-control" required value={form.fund_id}
                onChange={e => setForm(f => ({ ...f, fund_id: e.target.value }))}>
                <option value="">— Select fund —</option>
                {funds.filter(f => f.status === 'active').map(f => (
                  <option key={f.id} value={f.id}>{f.pcf_code} — {f.custodian_name} (bal: {fmtNum(f.current_balance)})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input type="date" className="form-control" required value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Category *</label>
              <select className="form-control" required value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">— Select —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Supplier</label>
              <input className="form-control" value={form.supplier}
                onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                placeholder="e.g. Pick n Pay, Total Service Station" />
            </div>
          </div>
          <div className="form-group">
            <label>Purpose *</label>
            <textarea className="form-control" rows={2} required value={form.purpose}
              onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
              placeholder="Describe what the money was spent on" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount *</label>
              <input type="number" step="0.01" min="0.01" className="form-control" required value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 8 }}>
                <input type="checkbox" checked={form.has_receipt}
                  onChange={e => setForm(f => ({ ...f, has_receipt: e.target.checked }))} />
                Has Receipt
              </label>
            </div>
          </div>

          {/* Receipt Line Items */}
          {form.has_receipt && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>RECEIPT LINE ITEMS</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Item</th>
                    <th style={{ textAlign: 'center', width: 60, padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Qty</th>
                    <th style={{ textAlign: 'right', width: 90, padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Unit Price</th>
                    <th style={{ textAlign: 'right', width: 90, padding: '4px 6px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Total</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(li => (
                    <tr key={li._key}>
                      <td style={{ padding: '3px 4px' }}>
                        <input className="form-control" style={{ padding: '4px 6px', fontSize: 12 }}
                          value={li.item_description}
                          onChange={e => updateLine(li._key, 'item_description', e.target.value)}
                          placeholder="Item description" />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input type="number" min="1" step="0.01" className="form-control"
                          style={{ padding: '4px 6px', fontSize: 12, textAlign: 'center' }}
                          value={li.qty}
                          onChange={e => updateLine(li._key, 'qty', e.target.value)} />
                      </td>
                      <td style={{ padding: '3px 4px' }}>
                        <input type="number" step="0.01" min="0" className="form-control"
                          style={{ padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                          value={li.unit_price}
                          onChange={e => updateLine(li._key, 'unit_price', e.target.value)} />
                      </td>
                      <td style={{ padding: '3px 4px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {li.total || '—'}
                      </td>
                      <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                        {lineItems.length > 1 && (
                          <button type="button" className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }}
                            onClick={() => setLineItems(prev => prev.filter(x => x._key !== li._key))}>
                            <span className="material-icons" style={{ fontSize: 12 }}>remove</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>Line Total:</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: Math.abs(lineTotal - parseFloat(form.amount || 0)) > 0.01 ? 'var(--yellow)' : 'var(--green)' }}>
                      {fmtNum(lineTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }}
                onClick={() => setLineItems(prev => [...prev, newLineItem()])}>
                <span className="material-icons" style={{ fontSize: 13 }}>add</span> Add Item
              </button>
              {Math.abs(lineTotal - parseFloat(form.amount || 0)) > 0.01 && form.amount && (
                <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 6 }}>
                  ⚠ Line total ({fmtNum(lineTotal)}) differs from expense amount ({fmtNum(parseFloat(form.amount))})
                </div>
              )}
            </div>
          )}

          {/* No Receipt Declaration */}
          {!form.has_receipt && (
            <div style={{ border: '1px solid rgba(248,113,113,.4)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'rgba(248,113,113,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>
                <span className="material-icons" style={{ fontSize: 18 }}>warning</span>
                No Receipt Declaration
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
                This expense will be flagged for manager acknowledgment. All no-receipt entries are tracked separately.
              </div>
              <div className="form-group">
                <label>Reason *</label>
                <select className="form-control" value={exception.reason}
                  onChange={e => setException(x => ({ ...x, reason: e.target.value }))}>
                  <option value="">— Select reason —</option>
                  {NO_RECEIPT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Explanation *</label>
                <textarea className="form-control" rows={3} value={exception.explanation}
                  onChange={e => setException(x => ({ ...x, explanation: e.target.value }))}
                  placeholder="Provide a detailed explanation…" />
              </div>
              <div className="form-group">
                <label>Acknowledging Manager</label>
                <input className="form-control" value={exception.approver_name}
                  onChange={e => setException(x => ({ ...x, approver_name: e.target.value }))}
                  placeholder="Name of manager who acknowledged this" />
              </div>
            </div>
          )}

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Record Expense'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* Reject Modal */}
      <ModalDialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Expense">
        <div className="form-group">
          <label>Rejection Reason *</label>
          <textarea className="form-control" rows={3} value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Explain why this expense is being rejected…" />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject}>Reject Expense</button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
