// src/pages/Procurement/PurchaseInvoices.jsx
// Accounts payable — record supplier invoices, track payment status,
// 3-way match verification, aging analysis.

import { useState, useEffect, useMemo } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

function parseItems(raw) {
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return Array.isArray(raw) ? raw : []
}

function isOverdue(inv) {
  if (!inv.due_date) return false
  if (['Paid', 'Cancelled'].includes(inv.status)) return false
  return inv.due_date < today
}

function daysOverdue(dueDate) {
  if (!dueDate) return 0
  const diff = Math.floor((new Date(today) - new Date(dueDate)) / 86400000)
  return Math.max(0, diff)
}

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Mobile Money']

export default function PurchaseInvoices() {
  const {
    purchaseInvoices, purchaseOrders, suppliers,
    createPurchaseInvoice, updatePurchaseInvoice, recordPayment,
    loading,
  } = useProcurement()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState('invoices')

  // Filters
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo,   setFilterDateTo]   = useState('')

  // Modals
  const [createOpen, setCreateOpen] = useState(false)
  const [viewInv,    setViewInv]    = useState(null)
  const [payInv,     setPayInv]     = useState(null)
  const [editInv,    setEditInv]    = useState(null)

  // ── Create Invoice form ───────────────────────────────────
  const emptyForm = () => ({
    supplier_id:     '',
    supplier_name:   '',
    invoice_number:  '',
    po_id:           '',
    grn_id:          '',
    invoice_date:    today,
    due_date:        '',
    payment_terms:   '',
    items: [{ name: '', qty: 1, unit_price: 0, total: 0, tax_rate: 0 }],
    three_way_matched: false,
    notes:           '',
  })
  const [form,    setForm]    = useState(emptyForm())
  const [saving,  setSaving]  = useState(false)

  // ── Payment form ──────────────────────────────────────────
  const emptyPayForm = () => ({
    amount:     '',
    method:     'Bank Transfer',
    reference:  '',
    date:       today,
  })
  const [payForm,    setPayForm]    = useState(emptyPayForm())
  const [payingSave, setPayingSave] = useState(false)

  // ── Edit Invoice form ─────────────────────────────────────
  const [editForm, setEditForm] = useState(null)
  const [editSaving, setEditSaving] = useState(false)

  // ── Reset forms when modals open ──────────────────────────
  useEffect(() => {
    if (createOpen) setForm(emptyForm())
  }, [createOpen])

  useEffect(() => {
    if (payInv) {
      const outstanding = (payInv.total_amount || 0) - (payInv.paid_amount || 0)
      setPayForm({ ...emptyPayForm(), amount: outstanding > 0 ? outstanding.toFixed(2) : '' })
    }
  }, [payInv])

  useEffect(() => {
    if (editInv) {
      setEditForm({
        supplier_id:     editInv.supplier_id || '',
        supplier_name:   editInv.supplier_name || '',
        invoice_number:  editInv.invoice_number || '',
        po_id:           editInv.po_id || '',
        grn_id:          editInv.grn_id || '',
        invoice_date:    editInv.invoice_date || today,
        due_date:        editInv.due_date || '',
        payment_terms:   editInv.payment_terms || '',
        items:           parseItems(editInv.items).length
                           ? parseItems(editInv.items)
                           : [{ name: '', qty: 1, unit_price: 0, total: 0, tax_rate: 0 }],
        three_way_matched: !!editInv.three_way_matched,
        notes:           editInv.notes || '',
        status:          editInv.status || 'Draft',
      })
    }
  }, [editInv])

  // ── Derived data ──────────────────────────────────────────
  const activeInvoices = useMemo(() =>
    purchaseInvoices.filter(i => !['Paid', 'Cancelled'].includes(i.status))
  , [purchaseInvoices])

  const totalOutstanding = useMemo(() =>
    activeInvoices.reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0)
  , [activeInvoices])

  const overdueCount = useMemo(() =>
    activeInvoices.filter(isOverdue).length
  , [activeInvoices])

  const weekFromNow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  }, [])

  const dueThisWeek = useMemo(() =>
    activeInvoices.filter(i => i.due_date && i.due_date >= today && i.due_date <= weekFromNow).length
  , [activeInvoices, weekFromNow])

  const startOfMonth = today.slice(0, 8) + '01'
  const paidThisMonth = useMemo(() =>
    purchaseInvoices
      .filter(i => i.payment_date && i.payment_date >= startOfMonth)
      .reduce((s, i) => s + (i.paid_amount || 0), 0)
  , [purchaseInvoices])

  // ── Filtered invoices ─────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    return purchaseInvoices.filter(inv => {
      if (filterStatus && inv.status !== filterStatus) return false
      if (filterSupplier && !inv.supplier_name?.toLowerCase().includes(filterSupplier.toLowerCase())) return false
      if (filterDateFrom && inv.invoice_date < filterDateFrom) return false
      if (filterDateTo   && inv.invoice_date > filterDateTo)   return false
      return true
    })
  }, [purchaseInvoices, filterStatus, filterSupplier, filterDateFrom, filterDateTo])

  // ── Supplier-filtered POs ─────────────────────────────────
  const supplierPOs = useMemo(() =>
    purchaseOrders.filter(po => po.supplier_id === form.supplier_id)
  , [purchaseOrders, form.supplier_id])

  // ── Item helpers ──────────────────────────────────────────
  const recalcItem = (it) => {
    const total = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0)
    return { ...it, total }
  }

  const setItem = (idx, field, val, items, setFn) => {
    const next = [...items]
    next[idx] = recalcItem({ ...next[idx], [field]: val })
    setFn(f => ({ ...f, items: next }))
  }

  const addItem = (items, setFn) =>
    setFn(f => ({ ...f, items: [...f.items, { name: '', qty: 1, unit_price: 0, total: 0, tax_rate: 0 }] }))

  const removeItem = (idx, items, setFn) =>
    setFn(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const calcTotals = (items) => {
    const subtotal   = items.reduce((s, it) => s + (it.total || 0), 0)
    const tax_amount = items.reduce((s, it) => s + (it.total || 0) * ((parseFloat(it.tax_rate) || 0) / 100), 0)
    return { subtotal, tax_amount, total_amount: subtotal + tax_amount }
  }

  // ── When supplier changes, auto-fill payment terms ────────
  const handleSupplierChange = (id) => {
    const sup = suppliers.find(s => s.id === id)
    setForm(f => ({
      ...f,
      supplier_id:   id,
      supplier_name: sup?.name || '',
      payment_terms: sup?.payment_terms || '',
      due_date:      sup?.payment_terms
        ? (() => {
            const d = new Date(f.invoice_date || today)
            d.setDate(d.getDate() + parseInt(sup.payment_terms) || 0)
            return d.toISOString().split('T')[0]
          })()
        : f.due_date,
    }))
  }

  // When PO selected, auto-populate items
  const handlePOChange = (poId) => {
    if (!poId) { setForm(f => ({ ...f, po_id: '' })); return }
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) { setForm(f => ({ ...f, po_id: poId })); return }
    const poItems = parseItems(po.items).map(it => recalcItem({
      name:       it.name || '',
      qty:        it.ordered_qty || 1,
      unit_price: it.unit_cost || 0,
      total:      (it.ordered_qty || 0) * (it.unit_cost || 0),
      tax_rate:   0,
    }))
    setForm(f => ({ ...f, po_id: poId, items: poItems.length ? poItems : f.items }))
  }

  // When invoice_date changes, recalc due_date
  const handleInvoiceDateChange = (date) => {
    const sup = suppliers.find(s => s.id === form.supplier_id)
    const days = parseInt(form.payment_terms) || (sup?.payment_terms ? parseInt(sup.payment_terms) : 0)
    let due = form.due_date
    if (days > 0 && date) {
      const d = new Date(date); d.setDate(d.getDate() + days)
      due = d.toISOString().split('T')[0]
    }
    setForm(f => ({ ...f, invoice_date: date, due_date: due }))
  }

  // ── Create Invoice ────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (form.items.some(it => !it.name)) return toast.error('Every item needs a name')
    setSaving(true)
    try {
      const { subtotal, tax_amount, total_amount } = calcTotals(form.items)
      const id = await createPurchaseInvoice({
        supplier_id:       form.supplier_id,
        supplier_name:     form.supplier_name,
        invoice_number:    form.invoice_number,
        po_id:             form.po_id || null,
        grn_id:            form.grn_id || null,
        invoice_date:      form.invoice_date,
        due_date:          form.due_date,
        payment_terms:     form.payment_terms,
        items:             form.items,
        subtotal,
        tax_amount,
        total_amount,
        paid_amount:       0,
        three_way_matched: form.three_way_matched,
        notes:             form.notes,
        status:            'Draft',
        created_by:        user?.full_name || user?.username,
      })
      toast.success('Invoice created')
      setCreateOpen(false)

      // Prompt to post
      if (window.confirm('Post invoice now? (Changes status from Draft to Posted)')) {
        await updatePurchaseInvoice(id, { status: 'Posted' })
        toast.success('Invoice posted')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice')
    } finally { setSaving(false) }
  }

  // ── Record Payment ────────────────────────────────────────
  const handlePay = async (e) => {
    e.preventDefault()
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) return toast.error('Enter a valid amount')
    setPayingSave(true)
    try {
      await recordPayment(payInv.id, {
        amount:    parseFloat(payForm.amount),
        method:    payForm.method,
        reference: payForm.reference,
        date:      payForm.date,
      })
      toast.success('Payment recorded')
      setPayInv(null)
    } catch (err) {
      toast.error(err.message || 'Failed to record payment')
    } finally { setPayingSave(false) }
  }

  // ── Edit Invoice ──────────────────────────────────────────
  const handleEdit = async (e) => {
    e.preventDefault()
    if (!editForm.supplier_id) return toast.error('Select a supplier')
    setEditSaving(true)
    try {
      const { subtotal, tax_amount, total_amount } = calcTotals(editForm.items)
      await updatePurchaseInvoice(editInv.id, {
        supplier_id:       editForm.supplier_id,
        supplier_name:     editForm.supplier_name,
        invoice_number:    editForm.invoice_number,
        po_id:             editForm.po_id || null,
        grn_id:            editForm.grn_id || null,
        invoice_date:      editForm.invoice_date,
        due_date:          editForm.due_date,
        payment_terms:     editForm.payment_terms,
        items:             editForm.items,
        subtotal,
        tax_amount,
        total_amount,
        three_way_matched: editForm.three_way_matched,
        notes:             editForm.notes,
        status:            editForm.status,
      })
      toast.success('Invoice updated')
      setEditInv(null)
    } catch (err) {
      toast.error(err.message || 'Failed to update invoice')
    } finally { setEditSaving(false) }
  }

  // ── Cancel Invoice ────────────────────────────────────────
  const handleCancel = async (inv) => {
    if (!window.confirm(`Cancel invoice ${inv.pi_number}?`)) return
    try {
      await updatePurchaseInvoice(inv.id, { status: 'Cancelled' })
      toast.success('Invoice cancelled')
    } catch (err) { toast.error(err.message) }
  }

  // ── Export ────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(filteredInvoices.map(inv => ({
      'PI #':         inv.pi_number,
      'Invoice #':    inv.invoice_number,
      Supplier:       inv.supplier_name,
      'Invoice Date': inv.invoice_date,
      'Due Date':     inv.due_date,
      'PO Ref':       inv.po_id ? (purchaseOrders.find(p => p.id === inv.po_id)?.po_number || '') : '',
      Amount:         parseFloat(inv.total_amount || 0).toFixed(2),
      Paid:           parseFloat(inv.paid_amount || 0).toFixed(2),
      Outstanding:    ((inv.total_amount || 0) - (inv.paid_amount || 0)).toFixed(2),
      '3-Way Match':  inv.three_way_matched ? 'Yes' : 'No',
      Status:         inv.status,
    })), `PurchaseInvoices_${dateTag()}`, 'Purchase Invoices')
    toast.success('Exported')
  }

  // ── Aging Report data ─────────────────────────────────────
  const agingData = useMemo(() => {
    const outstanding = purchaseInvoices.filter(i =>
      !['Paid', 'Cancelled'].includes(i.status) &&
      (i.total_amount || 0) - (i.paid_amount || 0) > 0
    )
    const buckets = { current: [], d30: [], d60: [], d90: [], d90p: [] }
    for (const inv of outstanding) {
      const days = daysOverdue(inv.due_date)
      if (days === 0)        buckets.current.push(inv)
      else if (days <= 30)   buckets.d30.push(inv)
      else if (days <= 60)   buckets.d60.push(inv)
      else if (days <= 90)   buckets.d90.push(inv)
      else                   buckets.d90p.push(inv)
    }
    const sum = (arr) => arr.reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0)
    return {
      buckets,
      current: { amount: sum(buckets.current), count: buckets.current.length },
      d30:     { amount: sum(buckets.d30),     count: buckets.d30.length },
      d60:     { amount: sum(buckets.d60),     count: buckets.d60.length },
      d90:     { amount: sum(buckets.d90),     count: buckets.d90.length },
      d90p:    { amount: sum(buckets.d90p),    count: buckets.d90p.length },
      all: [...buckets.current, ...buckets.d30, ...buckets.d60, ...buckets.d90, ...buckets.d90p]
        .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date)),
    }
  }, [purchaseInvoices])

  const handleExportAging = () => {
    exportXLSX(agingData.all.map(inv => ({
      Supplier:       inv.supplier_name,
      'PI #':         inv.pi_number,
      'Invoice Date': inv.invoice_date,
      'Due Date':     inv.due_date,
      'Days Overdue': daysOverdue(inv.due_date),
      Outstanding:    ((inv.total_amount || 0) - (inv.paid_amount || 0)).toFixed(2),
    })), `AgingReport_${dateTag()}`, 'Aging Report')
    toast.success('Exported')
  }

  // ── Item form renderer ────────────────────────────────────
  const renderItems = (items, setFn) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, idx) => (
        <div key={idx} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>ITEM {idx + 1}</span>
            {items.length > 1 && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx, items, setFn)}>
                <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
              </button>
            )}
          </div>
          <div className="form-group">
            <label>Item Name *</label>
            <input className="form-control" required value={it.name}
              onChange={e => setItem(idx, 'name', e.target.value, items, setFn)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label>Qty *</label>
              <input type="number" min="0" step="0.01" className="form-control" required value={it.qty}
                onChange={e => setItem(idx, 'qty', parseFloat(e.target.value) || 0, items, setFn)} />
            </div>
            <div className="form-group">
              <label>Unit Price *</label>
              <input type="number" min="0" step="0.01" className="form-control" required value={it.unit_price}
                onChange={e => setItem(idx, 'unit_price', parseFloat(e.target.value) || 0, items, setFn)} />
            </div>
            <div className="form-group">
              <label>Tax Rate %</label>
              <input type="number" min="0" step="0.1" className="form-control" value={it.tax_rate}
                onChange={e => setItem(idx, 'tax_rate', parseFloat(e.target.value) || 0, items, setFn)} />
            </div>
            <div className="form-group">
              <label>Total</label>
              <div className="form-control td-mono" style={{ background: 'var(--surface)', color: 'var(--teal)' }}>
                ${fmtNum(it.total)}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => addItem(items, setFn)}>
          <span className="material-icons">add</span> Add Item
        </button>
        {(() => {
          const { subtotal, tax_amount, total_amount } = calcTotals(items)
          return (
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div style={{ color: 'var(--text-dim)' }}>Subtotal: <span className="td-mono">${fmtNum(subtotal)}</span></div>
              <div style={{ color: 'var(--text-dim)' }}>Tax: <span className="td-mono">${fmtNum(tax_amount)}</span></div>
              <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 15, marginTop: 2 }}>Total: ${fmtNum(total_amount)}</div>
            </div>
          )
        })()}
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Purchase Invoices">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <span className="material-icons">add</span> New Invoice
        </button>
      </PageHeader>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[['invoices', 'Invoices'], ['aging', 'Aging Report']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: activeTab === key ? 700 : 400,
              color: activeTab === key ? 'var(--gold)' : 'var(--text-dim)',
              borderBottom: activeTab === key ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: INVOICES ─────────────────────────────── */}
      {activeTab === 'invoices' && (
        <>
          {/* KPI cards */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-label">Total Outstanding</div>
              <div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 20 }}>${fmtNum(totalOutstanding)}</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: overdueCount > 0 ? '3px solid var(--red)' : undefined }}>
              <div className="kpi-label">Overdue Invoices</div>
              <div className="kpi-val" style={{ color: overdueCount > 0 ? 'var(--red)' : 'var(--green)' }}>{overdueCount}</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: dueThisWeek > 0 ? '3px solid var(--yellow)' : undefined }}>
              <div className="kpi-label">Due This Week</div>
              <div className="kpi-val" style={{ color: dueThisWeek > 0 ? 'var(--yellow)' : 'var(--text)' }}>{dueThisWeek}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Paid This Month</div>
              <div className="kpi-val" style={{ color: 'var(--green)', fontSize: 20 }}>${fmtNum(paidThisMonth)}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {['Draft','Posted','Partially Paid','Paid','Overdue','Disputed','Cancelled'].map(s =>
                  <option key={s}>{s}</option>
                )}
              </select>
              <input className="form-control" placeholder="Search supplier…"
                value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} />
              <input type="date" className="form-control" value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)} title="Invoice date from" />
              <input type="date" className="form-control" value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)} title="Invoice date to" />
            </div>
          </div>

          {/* Table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>PI #</th>
                    <th>Invoice #</th>
                    <th>Supplier</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th>PO Ref</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th>3-Way</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? <tr><td colSpan="12" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
                    : filteredInvoices.length === 0
                      ? <tr><td colSpan="12" className="empty-state">No invoices found</td></tr>
                      : filteredInvoices.map(inv => {
                          const outstanding = (inv.total_amount || 0) - (inv.paid_amount || 0)
                          const overdue     = isOverdue(inv)
                          const po          = inv.po_id ? purchaseOrders.find(p => p.id === inv.po_id) : null
                          return (
                            <tr key={inv.id}>
                              <td className="td-mono" style={{ color: 'var(--gold)' }}>{inv.pi_number}</td>
                              <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{inv.invoice_number || '—'}</td>
                              <td style={{ fontWeight: 600 }}>{inv.supplier_name}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.invoice_date)}</td>
                              <td style={{ whiteSpace: 'nowrap', color: overdue ? 'var(--red)' : undefined, fontWeight: overdue ? 700 : undefined }}>
                                {fmtDate(inv.due_date)}
                                {overdue && <span style={{ marginLeft: 4, fontSize: 10 }}>({daysOverdue(inv.due_date)}d)</span>}
                              </td>
                              <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{po?.po_number || '—'}</td>
                              <td className="td-mono" style={{ textAlign: 'right' }}>${fmtNum(inv.total_amount)}</td>
                              <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmtNum(inv.paid_amount)}</td>
                              <td className="td-mono" style={{ textAlign: 'right', color: outstanding > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                                ${fmtNum(outstanding)}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {inv.three_way_matched
                                  ? <span className="material-icons" style={{ color: 'var(--green)', fontSize: 18 }}>check_circle</span>
                                  : <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 18 }}>warning</span>}
                              </td>
                              <td><StatusBadge status={inv.status} /></td>
                              <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setViewInv(inv)}>View</button>
                                {!['Paid','Cancelled'].includes(inv.status) && (
                                  <button className="btn btn-primary btn-sm" onClick={() => setPayInv(inv)}>Pay</button>
                                )}
                                {['Draft','Posted'].includes(inv.status) && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => setEditInv(inv)}>Edit</button>
                                )}
                                {!['Cancelled','Paid'].includes(inv.status) && (
                                  <button className="btn btn-danger btn-sm" onClick={() => handleCancel(inv)}>Cancel</button>
                                )}
                              </td>
                            </tr>
                          )
                        })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB 2: AGING REPORT ─────────────────────────── */}
      {activeTab === 'aging' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-secondary" onClick={handleExportAging}>
              <span className="material-icons">table_chart</span> Export Aging
            </button>
          </div>

          {/* Aging summary */}
          <div className="card" style={{ marginBottom: 20, padding: 20 }}>
            <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
              Aging Summary
            </div>
            {[
              { label: 'Current (not yet due)', data: agingData.current, color: 'var(--green)' },
              { label: '1–30 days overdue',     data: agingData.d30,     color: 'var(--yellow)' },
              { label: '31–60 days overdue',    data: agingData.d60,     color: 'var(--orange, #f97316)' },
              { label: '61–90 days overdue',    data: agingData.d90,     color: 'var(--orange, #f97316)' },
              { label: '> 90 days overdue',     data: agingData.d90p,    color: 'var(--red)' },
            ].map(({ label, data, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 2, fontSize: 14 }}>{label}</div>
                <div style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 700, color, textAlign: 'right', fontSize: 15 }}>
                  ${fmtNum(data.amount)}
                </div>
                <div style={{ flex: 0, minWidth: 60, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textAlign: 'right' }}>
                  {data.count} inv
                </div>
              </div>
            ))}
          </div>

          {/* Aging detail table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>PI #</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Days Overdue</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {agingData.all.length === 0
                    ? <tr><td colSpan="6" className="empty-state">No outstanding invoices</td></tr>
                    : agingData.all.map(inv => {
                        const days = daysOverdue(inv.due_date)
                        const outstanding = (inv.total_amount || 0) - (inv.paid_amount || 0)
                        return (
                          <tr key={inv.id}>
                            <td style={{ fontWeight: 600 }}>{inv.supplier_name}</td>
                            <td className="td-mono" style={{ color: 'var(--gold)' }}>{inv.pi_number}</td>
                            <td>{fmtDate(inv.invoice_date)}</td>
                            <td style={{ color: days > 0 ? 'var(--red)' : undefined }}>{fmtDate(inv.due_date)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: days > 90 ? 'var(--red)' : days > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                              {days > 0 ? days : '—'}
                            </td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>${fmtNum(outstanding)}</td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── CREATE INVOICE MODAL ─────────────────────────── */}
      <ModalDialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Purchase Invoice" size="lg">
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>Supplier *</label>
              <select className="form-control" required value={form.supplier_id}
                onChange={e => handleSupplierChange(e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Supplier Invoice #</label>
              <input className="form-control" placeholder="Their reference number"
                value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>PO Reference</label>
              <select className="form-control" value={form.po_id} onChange={e => handlePOChange(e.target.value)}>
                <option value="">— Optional —</option>
                {supplierPOs.map(po => <option key={po.id} value={po.id}>{po.po_number}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>GRN Reference</label>
              <input className="form-control" placeholder="GRN number (optional)"
                value={form.grn_id} onChange={e => setForm(f => ({ ...f, grn_id: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Invoice Date *</label>
              <input type="date" className="form-control" required value={form.invoice_date}
                onChange={e => handleInvoiceDateChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Due Date *</label>
              <input type="date" className="form-control" required value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Payment Terms</label>
              <input className="form-control" placeholder="e.g. Net 30"
                value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} />
            </div>
          </div>

          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 12px' }}>
            Line Items
          </div>

          {renderItems(form.items, setForm)}

          <div className="form-group" style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.three_way_matched}
                onChange={e => setForm(f => ({ ...f, three_way_matched: e.target.checked }))} />
              <span>Verified against PO and GRN (3-Way Match)</span>
            </label>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows="2" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="material-icons">save</span> {saving ? 'Saving…' : 'Save Invoice'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ── RECORD PAYMENT MODAL ─────────────────────────── */}
      <ModalDialog open={!!payInv} onClose={() => setPayInv(null)}
        title={payInv ? `Record Payment · ${payInv.pi_number}` : ''}>
        {payInv && (
          <form onSubmit={handlePay}>
            <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
              <div>Supplier: <strong>{payInv.supplier_name}</strong></div>
              <div>Total: <span className="td-mono" style={{ color: 'var(--teal)' }}>${fmtNum(payInv.total_amount)}</span></div>
              <div>Paid: <span className="td-mono" style={{ color: 'var(--green)' }}>${fmtNum(payInv.paid_amount)}</span></div>
              <div>Outstanding: <span className="td-mono" style={{ color: 'var(--red)' }}>${fmtNum((payInv.total_amount || 0) - (payInv.paid_amount || 0))}</span></div>
            </div>
            <div className="form-group">
              <label>Amount *</label>
              <input type="number" min="0.01" step="0.01" className="form-control" required
                value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Payment Method *</label>
              <select className="form-control" required value={payForm.method}
                onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Payment Reference</label>
              <input className="form-control" placeholder="Bank ref, cheque #, etc."
                value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Payment Date *</label>
              <input type="date" className="form-control" required value={payForm.date}
                onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setPayInv(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={payingSave}>
                <span className="material-icons">payments</span> {payingSave ? 'Saving…' : 'Record Payment'}
              </button>
            </ModalActions>
          </form>
        )}
      </ModalDialog>

      {/* ── VIEW INVOICE MODAL ───────────────────────────── */}
      <ModalDialog open={!!viewInv} onClose={() => setViewInv(null)}
        title={viewInv ? `${viewInv.pi_number} · ${viewInv.supplier_name}` : ''} size="lg">
        {viewInv && (() => {
          const po          = viewInv.po_id ? purchaseOrders.find(p => p.id === viewInv.po_id) : null
          const outstanding = (viewInv.total_amount || 0) - (viewInv.paid_amount || 0)
          const items       = parseItems(viewInv.items)
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: 'var(--text-dim)' }}>Invoice #:</span> {viewInv.invoice_number || '—'}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <StatusBadge status={viewInv.status} /></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Invoice Date:</span> {fmtDate(viewInv.invoice_date)}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Due Date:</span> <span style={{ color: isOverdue(viewInv) ? 'var(--red)' : undefined }}>{fmtDate(viewInv.due_date)}</span></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Payment Terms:</span> {viewInv.payment_terms || '—'}</div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>3-Way Match:</span>{' '}
                  {viewInv.three_way_matched
                    ? <span style={{ color: 'var(--green)' }}>✓ Verified</span>
                    : <span style={{ color: 'var(--yellow)' }}>⚠ Not verified</span>}
                </div>
                {po && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-dim)' }}>PO Reference:</span>{' '}
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{po.po_number}</span>
                    {' — '}{po.supplier_name}
                  </div>
                )}
                {viewInv.grn_id && (
                  <div><span style={{ color: 'var(--text-dim)' }}>GRN Ref:</span> {viewInv.grn_id}</div>
                )}
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="stock-table">
                    <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Tax %</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{it.name}</td>
                          <td className="td-mono">{it.qty}</td>
                          <td className="td-mono">${fmtNum(it.unit_price)}</td>
                          <td className="td-mono">{it.tax_rate || 0}%</td>
                          <td className="td-mono" style={{ textAlign: 'right' }}>${fmtNum(it.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <div style={{ minWidth: 240, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Subtotal</span>
                    <span className="td-mono">${fmtNum(viewInv.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Tax</span>
                    <span className="td-mono">${fmtNum(viewInv.tax_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700, color: 'var(--teal)', fontSize: 15 }}>
                    <span>Total</span>
                    <span className="td-mono">${fmtNum(viewInv.total_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--green)' }}>
                    <span>Paid</span>
                    <span className="td-mono">${fmtNum(viewInv.paid_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: 600, color: outstanding > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                    <span>Outstanding</span>
                    <span className="td-mono">${fmtNum(outstanding)}</span>
                  </div>
                </div>
              </div>

              {/* Payment history note */}
              {viewInv.status === 'Partially Paid' && viewInv.payment_date && (
                <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, marginBottom: 12, color: 'var(--text-dim)' }}>
                  Last payment: <strong>${fmtNum(viewInv.paid_amount)}</strong> via {viewInv.payment_method} on {fmtDate(viewInv.payment_date)}
                  {viewInv.payment_reference && ` (Ref: ${viewInv.payment_reference})`}
                </div>
              )}
              {viewInv.status === 'Paid' && viewInv.payment_date && (
                <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, marginBottom: 12, color: 'var(--green)' }}>
                  Fully paid on {fmtDate(viewInv.payment_date)} via {viewInv.payment_method}
                  {viewInv.payment_reference && ` (Ref: ${viewInv.payment_reference})`}
                </div>
              )}

              {viewInv.notes && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>Notes: {viewInv.notes}</div>
              )}

              <ModalActions>
                {!['Paid','Cancelled'].includes(viewInv.status) && (
                  <button className="btn btn-primary" onClick={() => { setViewInv(null); setPayInv(viewInv) }}>
                    <span className="material-icons">payments</span> Record Payment
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setViewInv(null)}>Close</button>
              </ModalActions>
            </>
          )
        })()}
      </ModalDialog>

      {/* ── EDIT INVOICE MODAL ───────────────────────────── */}
      <ModalDialog open={!!editInv} onClose={() => setEditInv(null)} title={editInv ? `Edit · ${editInv.pi_number}` : ''} size="lg">
        {editInv && editForm && (
          <form onSubmit={handleEdit}>
            <div className="form-row">
              <div className="form-group">
                <label>Supplier *</label>
                <select className="form-control" required value={editForm.supplier_id}
                  onChange={e => {
                    const sup = suppliers.find(s => s.id === e.target.value)
                    setEditForm(f => ({ ...f, supplier_id: e.target.value, supplier_name: sup?.name || '' }))
                  }}>
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Supplier Invoice #</label>
                <input className="form-control" value={editForm.invoice_number}
                  onChange={e => setEditForm(f => ({ ...f, invoice_number: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Invoice Date *</label>
                <input type="date" className="form-control" required value={editForm.invoice_date}
                  onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Due Date *</label>
                <input type="date" className="form-control" required value={editForm.due_date}
                  onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                  {['Draft','Posted','Partially Paid','Paid','Overdue','Disputed','Cancelled'].map(s =>
                    <option key={s}>{s}</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 12px' }}>
              Line Items
            </div>

            {renderItems(editForm.items, setEditForm)}

            <div className="form-group" style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={editForm.three_way_matched}
                  onChange={e => setEditForm(f => ({ ...f, three_way_matched: e.target.checked }))} />
                <span>Verified against PO and GRN (3-Way Match)</span>
              </label>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows="2" value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setEditInv(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>
                <span className="material-icons">save</span> {editSaving ? 'Saving…' : 'Update Invoice'}
              </button>
            </ModalActions>
          </form>
        )}
      </ModalDialog>
    </div>
  )
}
