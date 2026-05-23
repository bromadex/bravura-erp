// src/pages/Procurement/PaymentVouchers.jsx
// AP Payment Voucher engine — create, post, and cancel supplier payments
// with multi-invoice allocation and AP aging analysis.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, fmtDate } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, StatusBadge, EmptyState } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const PAYMENT_METHODS = ['Bank Transfer', 'Cheque', 'Cash', 'Mobile Money']

const STATUS_COLORS = {
  Draft:     'var(--text-dim)',
  Posted:    'var(--green)',
  Cancelled: 'var(--red)',
}

function daysDiff(dateStr) {
  if (!dateStr) return 0
  return Math.floor((new Date(today) - new Date(dateStr)) / 86400000)
}

function ageBucket(dueDate) {
  const d = daysDiff(dueDate)
  if (d <= 0)  return 'Current'
  if (d <= 30) return '1–30 days'
  if (d <= 60) return '31–60 days'
  if (d <= 90) return '61–90 days'
  return '90+ days'
}

const AGE_BUCKETS = ['Current', '1–30 days', '31–60 days', '61–90 days', '90+ days']
const AGE_COLORS  = ['var(--green)', 'var(--text-dim)', 'var(--yellow)', 'var(--gold)', 'var(--red)']

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function PaymentVouchers() {
  const {
    paymentVouchers, pvLines, purchaseInvoices, purchaseOrders, suppliers,
    createPaymentVoucher, postPaymentVoucher, cancelPaymentVoucher,
    loading,
  } = useProcurement()
  const { user } = useAuth()
  const canEdit = useCanEdit('procurement', 'payment-vouchers')
  const [searchParams] = useSearchParams()
  const prefillRef = useRef(false)

  // ── Filters ───────────────────────────────────────────────
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')

  // ── Modals ────────────────────────────────────────────────
  const [createOpen,  setCreateOpen]  = useState(false)
  const [viewPV,      setViewPV]      = useState(null)
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason,setCancelReason]= useState('')
  const [posting,     setPosting]     = useState(false)
  const [cancelling,  setCancelling]  = useState(false)

  // ── Create form ───────────────────────────────────────────
  const emptyForm = () => ({
    supplier_id:    '',
    supplier_name:  '',
    payment_date:   today,
    payment_method: 'Bank Transfer',
    bank_account:   '',
    cheque_no:      '',
    cheque_date:    '',
    reference_no:   '',
    remarks:        '',
  })
  const [form,       setForm]       = useState(emptyForm())
  const [allocations,setAllocations]= useState([])  // {invoice_id, pi_number, invoice_date, invoice_total, outstanding, amount_paid, discount_taken}
  const [saving,     setSaving]     = useState(false)

  // ── URL param pre-fill (Invoice → PV chain) ───────────────
  useEffect(() => {
    const supplierId = searchParams.get('supplier_id')
    if (supplierId && !prefillRef.current) {
      prefillRef.current = true
      const sup = suppliers.find(s => s.id === supplierId)
      setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: sup?.name || '' }))
      setCreateOpen(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Outstanding invoices for selected supplier ────────────
  const supplierInvoices = useMemo(() => {
    if (!form.supplier_id) return []
    return purchaseInvoices.filter(inv =>
      inv.supplier_id === form.supplier_id &&
      !['Paid', 'Cancelled'].includes(inv.status) &&
      (inv.total_amount || 0) > (inv.paid_amount || 0)
    ).sort((a, b) => (a.due_date || a.invoice_date) < (b.due_date || b.invoice_date) ? -1 : 1)
  }, [form.supplier_id, purchaseInvoices])

  // Sync allocations when supplier changes
  useEffect(() => {
    setAllocations(supplierInvoices.map(inv => ({
      invoice_id:    inv.id,
      pi_number:     inv.pi_number || inv.invoice_number || '',
      invoice_date:  inv.invoice_date || '',
      invoice_total: inv.total_amount || 0,
      outstanding:   (inv.total_amount || 0) - (inv.paid_amount || 0),
      amount_paid:   '',
      discount_taken: 0,
      notes:         '',
    })))
  }, [form.supplier_id, supplierInvoices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSupplierChange = (supplierId) => {
    const sup = suppliers.find(s => s.id === supplierId)
    setForm(f => ({ ...f, supplier_id: supplierId, supplier_name: sup?.name || '' }))
  }

  const setAlloc = (idx, field, val) =>
    setAllocations(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a))

  const allocatedTotal = allocations.reduce((s, a) => s + (parseFloat(a.amount_paid) || 0), 0)
  const filledLines    = allocations.filter(a => parseFloat(a.amount_paid) > 0)

  const handleCreate = async () => {
    if (!form.supplier_id)        return toast.error('Select a supplier')
    if (!form.payment_date)       return toast.error('Enter payment date')
    if (filledLines.length === 0) return toast.error('Allocate at least one invoice')
    if (!window.confirm(`Create payment voucher for ${form.supplier_name} — ${filledLines.length} invoice(s), total ${fmt(allocatedTotal)}?`)) return
    setSaving(true)
    try {
      const lines = filledLines.map(a => ({
        invoice_id:    a.invoice_id,
        pi_number:     a.pi_number,
        invoice_date:  a.invoice_date || null,
        invoice_total: a.invoice_total,
        outstanding:   a.outstanding,
        amount_paid:   parseFloat(a.amount_paid) || 0,
        discount_taken: parseFloat(a.discount_taken) || 0,
        notes:         a.notes || null,
      }))
      await createPaymentVoucher({
        ...form,
        total_amount: allocatedTotal,
        created_by:   user?.full_name || user?.username || '',
      }, lines)
      toast.success('Payment voucher created as Draft')
      setCreateOpen(false)
      setForm(emptyForm())
      setAllocations([])
      prefillRef.current = false
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handlePost = async (pvId) => {
    if (!window.confirm('Post this payment voucher? This will mark invoices as paid and cannot be easily reversed.')) return
    setPosting(true)
    try {
      await postPaymentVoucher(pvId, user?.full_name || user?.username || '')
      toast.success('Payment voucher posted — invoices updated')
      setViewPV(null)
    } catch (err) { toast.error(err.message) }
    finally { setPosting(false) }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) return toast.error('Enter a cancellation reason')
    setCancelling(true)
    try {
      await cancelPaymentVoucher(cancelModal.id, cancelReason.trim(), user?.full_name || user?.username || '')
      toast.success('Payment voucher cancelled')
      setCancelModal(null)
      setCancelReason('')
      setViewPV(null)
    } catch (err) { toast.error(err.message) }
    finally { setCancelling(false) }
  }

  // ── Reset create form on open ─────────────────────────────
  useEffect(() => {
    if (createOpen && !prefillRef.current) {
      setForm(emptyForm())
      setAllocations([])
    }
  }, [createOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: AP Aging ────────────────────────────────────
  const outstandingInvoices = useMemo(() =>
    purchaseInvoices.filter(i => !['Paid', 'Cancelled'].includes(i.status) && (i.total_amount || 0) > (i.paid_amount || 0))
  , [purchaseInvoices])

  const agingByBucket = useMemo(() => {
    const map = {}
    AGE_BUCKETS.forEach(b => { map[b] = { count: 0, amount: 0 } })
    outstandingInvoices.forEach(inv => {
      const b = ageBucket(inv.due_date || inv.invoice_date)
      map[b].count  += 1
      map[b].amount += (inv.total_amount || 0) - (inv.paid_amount || 0)
    })
    return map
  }, [outstandingInvoices])

  const totalOutstanding = outstandingInvoices.reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0)

  const startOfMonth = today.slice(0, 8) + '01'
  const postedThisMonth = useMemo(() =>
    paymentVouchers
      .filter(pv => pv.status === 'Posted' && pv.payment_date >= startOfMonth)
      .reduce((s, pv) => s + (pv.total_amount || 0), 0)
  , [paymentVouchers])

  const draftCount = paymentVouchers.filter(p => p.status === 'Draft').length

  // ── Filtered list ─────────────────────────────────────────
  const filteredPVs = useMemo(() => paymentVouchers.filter(pv => {
    if (filterStatus   && pv.status !== filterStatus) return false
    if (filterSupplier && !pv.supplier_name?.toLowerCase().includes(filterSupplier.toLowerCase())) return false
    if (filterDateFrom && pv.payment_date < filterDateFrom) return false
    if (filterDateTo   && pv.payment_date > filterDateTo)   return false
    return true
  }), [paymentVouchers, filterStatus, filterSupplier, filterDateFrom, filterDateTo])

  const getPvLines = (pvId) => pvLines.filter(l => l.pv_id === pvId)

  const handleExport = () => {
    exportXLSX(filteredPVs.map(pv => ({
      'PV Number':      pv.pv_number,
      'Date':           pv.payment_date,
      'Supplier':       pv.supplier_name,
      'Method':         pv.payment_method,
      'Total Amount':   pv.total_amount,
      'Status':         pv.status,
      'Reference':      pv.reference_no || '',
      'Remarks':        pv.remarks || '',
      'Posted By':      pv.posted_by || '',
    })), `PaymentVouchers_${today}`, 'Payment Vouchers')
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader title="Payment Vouchers">
        <button className="btn btn-secondary" onClick={handleExport}><span className="material-icons">table_chart</span> Export</button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <span className="material-icons">add</span> New Payment Voucher
          </button>
        )}
      </PageHeader>

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'AP Outstanding',  value: `$${fmt(totalOutstanding)}`, icon: 'account_balance_wallet', color: 'var(--red)'   },
          { label: 'Paid This Month', value: `$${fmt(postedThisMonth)}`,  icon: 'payments',               color: 'var(--green)' },
          { label: 'Drafts Pending',  value: draftCount,                   icon: 'pending',                color: 'var(--yellow)'},
          { label: 'Overdue Invoices',value: (agingByBucket['1–30 days']?.count || 0) + (agingByBucket['31–60 days']?.count || 0) + (agingByBucket['61–90 days']?.count || 0) + (agingByBucket['90+ days']?.count || 0),
            icon: 'warning', color: 'var(--gold)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="material-icons" style={{ color: c.color, fontSize: 28 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: c.color }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── AP Aging ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 13 }}>AP Aging Analysis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {AGE_BUCKETS.map((b, i) => (
            <div key={b} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', borderTop: `3px solid ${AGE_COLORS[i]}` }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{b}</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: AGE_COLORS[i], fontSize: 16 }}>
                ${fmt(agingByBucket[b]?.amount || 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{agingByBucket[b]?.count || 0} invoice{agingByBucket[b]?.count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
          <label>Status</label>
          <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option>Draft</option><option>Posted</option><option>Cancelled</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
          <label>Supplier</label>
          <input className="form-control" placeholder="Search supplier…" value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Date From</label>
          <input type="date" className="form-control" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Date To</label>
          <input type="date" className="form-control" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setFilterStatus(''); setFilterSupplier(''); setFilterDateFrom(''); setFilterDateTo('') }}>
          Clear
        </button>
      </div>

      {/* ── PV List ─────────────────────────────────────────── */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>PV Number</th><th>Date</th><th>Supplier</th><th>Method</th>
                <th style={{ textAlign: 'right' }}>Amount</th><th>Reference</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filteredPVs.length === 0 ? (
                <tr><td colSpan="8"><EmptyState icon="payments" message='No payment vouchers found. Click "New Payment Voucher" to begin.' /></td></tr>
              ) : filteredPVs.map(pv => (
                <tr key={pv.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{pv.pv_number}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{pv.payment_date}</td>
                  <td style={{ fontWeight: 600 }}>{pv.supplier_name}</td>
                  <td style={{ fontSize: 12 }}>{pv.payment_method}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 600 }}>${fmt(pv.total_amount)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{pv.reference_no || '—'}</td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: 12, color: STATUS_COLORS[pv.status] || 'var(--text-dim)' }}>
                      {pv.status}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-secondary btn-sm" onClick={() => setViewPV(pv)}>View</button>
                      {canEdit && pv.status === 'Draft' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handlePost(pv.id)} disabled={posting}>
                          Post
                        </button>
                      )}
                      {canEdit && pv.status !== 'Cancelled' && (
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }}
                          onClick={() => { setCancelModal(pv); setCancelReason('') }}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CREATE MODAL ────────────────────────────────────── */}
      {createOpen && (
        <ModalDialog title="New Payment Voucher" onClose={() => { setCreateOpen(false); prefillRef.current = false }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Supplier *</label>
              <select className="form-control" value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Payment Date *</label>
              <input type="date" className="form-control" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select className="form-control" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Reference No</label>
              <input className="form-control" placeholder="Bank ref / EFT no" value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))} />
            </div>
            {form.payment_method === 'Bank Transfer' && (
              <div className="form-group">
                <label>Bank Account</label>
                <input className="form-control" placeholder="Account name / number" value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} />
              </div>
            )}
            {form.payment_method === 'Cheque' && (<>
              <div className="form-group">
                <label>Cheque No</label>
                <input className="form-control" value={form.cheque_no} onChange={e => setForm(f => ({ ...f, cheque_no: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Cheque Date</label>
                <input type="date" className="form-control" value={form.cheque_date} onChange={e => setForm(f => ({ ...f, cheque_date: e.target.value }))} />
              </div>
            </>)}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Remarks</label>
              <input className="form-control" placeholder="Optional remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>

          {/* Invoice allocation table */}
          {form.supplier_id && (
            allocations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>check_circle</span>
                No outstanding invoices for this supplier.
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Invoice Allocation
                </div>
                <div className="table-wrap" style={{ marginBottom: 10 }}>
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Invoice</th><th>Date</th><th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Outstanding</th>
                        <th>Amount to Pay</th><th>Discount</th><th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((a, idx) => {
                        const overdue = (() => {
                          const inv = purchaseInvoices.find(i => i.id === a.invoice_id)
                          return inv?.due_date && inv.due_date < today
                        })()
                        return (
                          <tr key={a.invoice_id} style={{ background: parseFloat(a.amount_paid) > 0 ? 'rgba(52,211,153,.04)' : 'transparent' }}>
                            <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              {a.pi_number}
                              {overdue && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>OVERDUE</span>}
                            </td>
                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{a.invoice_date || '—'}</td>
                            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${fmt(a.invoice_total)}</td>
                            <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>${fmt(a.outstanding)}</td>
                            <td>
                              <input
                                type="number" min="0" step="0.01"
                                placeholder="0.00"
                                value={a.amount_paid}
                                onChange={e => setAlloc(idx, 'amount_paid', e.target.value)}
                                className="form-control"
                                style={{ maxWidth: 110, padding: '5px 8px', fontFamily: 'var(--mono)', fontWeight: 700,
                                  background: parseFloat(a.amount_paid) > 0 ? 'rgba(52,211,153,.1)' : 'var(--surface2)',
                                  borderColor: parseFloat(a.amount_paid) > 0 ? 'rgba(52,211,153,.3)' : 'var(--border2)' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number" min="0" step="0.01"
                                placeholder="0.00"
                                value={a.discount_taken}
                                onChange={e => setAlloc(idx, 'discount_taken', e.target.value)}
                                className="form-control"
                                style={{ maxWidth: 90, padding: '5px 8px', fontFamily: 'var(--mono)' }}
                              />
                            </td>
                            <td>
                              <input
                                placeholder="Optional"
                                value={a.notes}
                                onChange={e => setAlloc(idx, 'notes', e.target.value)}
                                className="form-control"
                                style={{ maxWidth: 160, padding: '5px 8px', fontSize: 12 }}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {filledLines.length > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, fontSize: 13 }}>
                    <strong>{filledLines.length}</strong> invoice{filledLines.length !== 1 ? 's' : ''} selected ·
                    Total payment: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>${fmt(allocatedTotal)}</strong>
                  </div>
                )}
              </>
            )
          )}

          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setCreateOpen(false); prefillRef.current = false }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || filledLines.length === 0}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : `Save as Draft (${filledLines.length} invoice${filledLines.length !== 1 ? 's' : ''})`}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── VIEW MODAL ──────────────────────────────────────── */}
      {viewPV && (() => {
        const lines = getPvLines(viewPV.id)
        return (
          <ModalDialog title={`Payment Voucher — ${viewPV.pv_number}`} onClose={() => setViewPV(null)} size="lg">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                ['Supplier',        viewPV.supplier_name],
                ['Payment Date',    viewPV.payment_date],
                ['Method',          viewPV.payment_method],
                ['Reference',       viewPV.reference_no || '—'],
                ['Bank Account',    viewPV.bank_account || '—'],
                ['Cheque No',       viewPV.cheque_no ? `${viewPV.cheque_no} (${viewPV.cheque_date || '—'})` : '—'],
                ['Total Amount',    `$${fmt(viewPV.total_amount)}`],
                ['Status',          viewPV.status],
                ['Posted By',       viewPV.posted_by || '—'],
                ['Remarks',         viewPV.remarks || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                  <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Invoice Lines</div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Invoice</th><th>Date</th>
                    <th style={{ textAlign: 'right' }}>Invoice Total</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th style={{ textAlign: 'right' }}>Amount Paid</th>
                    <th style={{ textAlign: 'right' }}>Discount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>No lines</td></tr>
                  ) : lines.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{l.pi_number || '—'}</td>
                      <td style={{ fontSize: 12 }}>{l.invoice_date || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${fmt(l.invoice_total)}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--red)' }}>${fmt(l.outstanding)}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>${fmt(l.amount_paid)}</td>
                      <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{l.discount_taken > 0 ? `$${fmt(l.discount_taken)}` : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{l.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewPV.cancellation_reason && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                <strong>Cancellation reason:</strong> {viewPV.cancellation_reason}
              </div>
            )}

            <ModalActions>
              {canEdit && viewPV.status === 'Draft' && (
                <button className="btn btn-primary" onClick={() => handlePost(viewPV.id)} disabled={posting}>
                  <span className="material-icons">check_circle</span>
                  {posting ? 'Posting…' : 'Post Voucher'}
                </button>
              )}
              {canEdit && viewPV.status !== 'Cancelled' && (
                <button className="btn btn-secondary" style={{ color: 'var(--red)' }}
                  onClick={() => { setCancelModal(viewPV); setCancelReason('') }}>
                  <span className="material-icons">cancel</span> Cancel Voucher
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewPV(null)}>Close</button>
            </ModalActions>
          </ModalDialog>
        )
      })()}

      {/* ── CANCEL MODAL ────────────────────────────────────── */}
      {cancelModal && (
        <ModalDialog title="Cancel Payment Voucher" onClose={() => setCancelModal(null)}>
          <p style={{ marginBottom: 12 }}>
            Cancel <strong>{cancelModal.pv_number}</strong>?
            {cancelModal.status === 'Posted' && (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}> This will reverse all invoice payment allocations.</span>
            )}
          </p>
          <div className="form-group">
            <label>Cancellation Reason *</label>
            <textarea className="form-control" rows={3} placeholder="Enter reason for cancellation…"
              value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setCancelModal(null)}>Back</button>
            <button className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
