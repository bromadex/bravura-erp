// src/pages/Procurement/PurchaseOrders.jsx
//
// Phase 11 additions:
//  • Currency selector — auto-fetches live rate from currency_rates; shows ZMW equivalent
//  • Tax template selector — live tax breakdown from tax_template_lines; grand total includes tax
//
// Earlier fixes preserved:
//  1. Stacked item rows (no crammed columns)
//  2. Receive → GRN navigation via URL param
//  3. View PO modal, status badges, total calc, search, Excel export

import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt   = (n, dp = 2) => Number(n || 0).toLocaleString('en-ZM', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const fmtCur = (n, code, dp = 2) => `${code} ${fmt(n, dp)}`

export default function PurchaseOrders() {
  const { purchaseOrders, suppliers, createPurchaseOrder, updatePurchaseOrderStatus, loading, fetchAll } = useProcurement()
  const { user }    = useAuth()
  const canEdit     = useCanEdit('procurement', 'purchase-orders')
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillRef  = useRef(false)

  // ── ui state ──────────────────────────────────────────────────────────────
  const [modalOpen,  setModalOpen]  = useState(false)
  const [viewPO,     setViewPO]     = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [mrBanner,   setMrBanner]   = useState('')

  // ── currency & tax data ───────────────────────────────────────────────────
  const [currencyRates, setCurrencyRates] = useState([])   // rows from currency_rates
  const [taxTemplates,  setTaxTemplates]  = useState([])   // rows from tax_templates (with lines)
  const [rateLoading,   setRateLoading]   = useState(false) // spinner while fetching rate

  useEffect(() => {
    // currency rates (latest per code)
    supabase.from('currency_rates')
      .select('*').eq('is_active', true)
      .order('effective_date', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        // deduplicate: keep first (most recent) per code
        const seen = new Set()
        const deduped = data.filter(r => { if (seen.has(r.currency_code)) return false; seen.add(r.currency_code); return true })
        setCurrencyRates([{ currency_code: 'ZMW', currency_name: 'Zambian Kwacha', rate_to_base: 1 }, ...deduped.filter(r => r.currency_code !== 'ZMW')])
      })

    // tax templates with their lines
    supabase.from('tax_templates')
      .select('*, tax_template_lines(*)')
      .eq('is_active', true)
      .in('template_type', ['Purchase', 'Both'])
      .order('name')
      .then(({ data }) => { if (data) setTaxTemplates(data) })
  }, [])

  // ── form ──────────────────────────────────────────────────────────────────
  const emptyForm = () => ({
    supplier_id:     '',
    supplier_name:   '',
    order_date:      today,
    delivery_date:   '',
    source_mr_id:    '',
    pr_id:           '',
    items:           [{ name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0 }],
    notes:           '',
    currency:        'ZMW',
    exchange_rate:   1,
    tax_template_id: '',
  })
  const [form, setForm] = useState(emptyForm())

  // Pre-fill from MR → PO URL params (?source_mr_id=XXX&mr_number=YYY)
  useEffect(() => {
    const sourceMrId = searchParams.get('source_mr_id')
    const mrNumber   = searchParams.get('mr_number')
    if (sourceMrId && !prefillRef.current) {
      prefillRef.current = true
      setForm(f => ({ ...f, source_mr_id: sourceMrId }))
      setMrBanner(mrNumber ? `MR: ${mrNumber}` : `From MR ${sourceMrId.slice(-6)}`)
      setModalOpen(true)
    }
  }, [searchParams])

  // ── item helpers ──────────────────────────────────────────────────────────
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const setItem    = (idx, field, val) => {
    const items = [...form.items]
    items[idx]  = { ...items[idx], [field]: val }
    setForm({ ...form, items })
  }

  const subtotal = form.items.reduce((s, it) => s + ((it.ordered_qty || 0) * (it.unit_cost || 0)), 0)

  // ── currency handler ───────────────────────────────────────────────────────
  const handleCurrencyChange = async (code) => {
    if (code === 'ZMW') {
      setForm(f => ({ ...f, currency: 'ZMW', exchange_rate: 1 }))
      return
    }
    const local = currencyRates.find(r => r.currency_code === code)
    if (local) {
      setForm(f => ({ ...f, currency: code, exchange_rate: parseFloat(local.rate_to_base) || 1 }))
      return
    }
    // fallback: hit DB
    setRateLoading(true)
    const { data } = await supabase.from('currency_rates')
      .select('rate_to_base').eq('currency_code', code).eq('is_active', true)
      .order('effective_date', { ascending: false }).limit(1).single()
    setRateLoading(false)
    setForm(f => ({ ...f, currency: code, exchange_rate: data ? parseFloat(data.rate_to_base) : 1 }))
  }

  // ── tax computation ────────────────────────────────────────────────────────
  const selectedTemplate = useMemo(
    () => taxTemplates.find(t => t.id === form.tax_template_id) || null,
    [taxTemplates, form.tax_template_id]
  )

  const computedTaxLines = useMemo(() => {
    if (!selectedTemplate?.tax_template_lines?.length) return []
    const lines = [...selectedTemplate.tax_template_lines].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const results = []
    let prevAmount = subtotal
    lines.forEach((line) => {
      let amount = 0
      if (line.charge_type === 'Actual Amount') {
        amount = parseFloat(line.tax_amount || 0)
      } else if (line.charge_type === 'On Previous Row Amount') {
        amount = prevAmount * (parseFloat(line.rate || 0) / 100)
      } else {
        // On Net Total (default)
        amount = subtotal * (parseFloat(line.rate || 0) / 100)
      }
      results.push({ ...line, computed_amount: amount })
      prevAmount = amount
    })
    return results
  }, [selectedTemplate, subtotal])

  const taxAmount  = computedTaxLines.reduce((s, l) => s + l.computed_amount, 0)
  const grandTotal = subtotal + taxAmount
  const grandInZMW = grandTotal * (form.exchange_rate || 1)

  // ── approval thresholds ───────────────────────────────────────────────────
  const [poThresholds, setPoThresholds] = useState([])
  useEffect(() => {
    supabase.from('approval_thresholds')
      .select('*').eq('document_type', 'purchase_order').eq('is_active', true)
      .order('min_amount')
      .then(({ data }) => { if (data) setPoThresholds(data) })
  }, [])

  const approvalTier = useMemo(() => {
    if (!poThresholds.length || grandTotal <= 0) return null
    return [...poThresholds]
      .sort((a, b) => b.min_amount - a.min_amount)
      .find(t => grandTotal >= t.min_amount && (t.max_amount == null || grandTotal < t.max_amount)) || null
  }, [poThresholds, grandTotal])

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (form.items.some(it => !it.name || !it.ordered_qty)) return toast.error('Every item needs a name and quantity')
    const supplier = suppliers.find(s => s.id === form.supplier_id)
    try {
      await createPurchaseOrder({
        supplier_id:     form.supplier_id,
        supplier_name:   supplier?.name || '',
        order_date:      form.order_date,
        delivery_date:   form.delivery_date,
        items:           form.items,
        total_amount:    grandTotal,
        tax_amount:      taxAmount || null,
        notes:           form.notes,
        currency:        form.currency,
        exchange_rate:   form.exchange_rate,
        tax_template_id: form.tax_template_id || null,
        created_by_id:   user?.id,
        created_by_name: user?.full_name || user?.username,
        status:          'draft',
        rfq_id:          form.rfq_id       || null,
        quotation_id:    form.quotation_id  || null,
        budget_code:     form.budget_code   || '',
        department:      form.department    || '',
        source_mr_id:    form.source_mr_id  || null,
        pr_id:           form.pr_id         || null,
      })
      toast.success('Purchase order created')
      setModalOpen(false)
      setMrBanner('')
      setForm(emptyForm())
    } catch (err) { toast.error(err.message) }
  }

  // ── receive → GRN ─────────────────────────────────────────────────────────
  const handleReceive = (po) => {
    navigate(`/module/procurement/goods-received?po_id=${encodeURIComponent(po.id)}`)
    toast.success(`Opening GRN for ${po.po_number}`)
  }

  // ── table helpers ─────────────────────────────────────────────────────────
  const filtered = purchaseOrders.filter(po => {
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return po.po_number?.toLowerCase().includes(t) || po.supplier_name?.toLowerCase().includes(t)
  })

  const totalPOs  = purchaseOrders.length
  const draftPOs  = purchaseOrders.filter(p => p.status === 'draft').length
  const totalVal  = purchaseOrders.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0)

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(po => ({
      'PO #': po.po_number, Supplier: po.supplier_name,
      Currency: po.currency || 'ZMW',
      'Order Date': po.order_date, 'Delivery Date': po.delivery_date,
      Items: (typeof po.items === 'string' ? JSON.parse(po.items || '[]') : po.items || []).length,
      Total: parseFloat(po.total_amount || 0).toFixed(2), Status: po.status
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Purchase Orders')
    XLSX.writeFile(wb, `PurchaseOrders_${today}.xlsx`); toast.success('Exported')
  }

  const statusBadge = (s) => {
    const map = { draft: 'badge-yellow', confirmed: 'badge-blue', partially_received: 'badge-gold', completed: 'badge-green', cancelled: 'badge-red' }
    return <span className={`badge ${map[s] || 'badge-gold'}`}>{(s || '').replace(/_/g, ' ')}</span>
  }

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])

  const currCode   = form.currency || 'ZMW'
  const isForeign  = currCode !== 'ZMW'

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Purchase Orders</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setModalOpen(true) }}>
              <span className="material-icons">add</span> Create PO
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total POs</div><div className="kpi-val">{totalPOs}</div></div>
        <div className="kpi-card" style={{ borderLeft: draftPOs > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">Pending / Draft</div>
          <div className="kpi-val" style={{ color: draftPOs > 0 ? 'var(--yellow)' : 'var(--green)' }}>{draftPOs}</div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Total Value (ZMW)</div><div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 20 }}>ZMW {fmt(totalVal, 0)}</div></div>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <input className="form-control" placeholder="Search by PO number or supplier…"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>PO #</th><th>Supplier</th><th>Order Date</th><th>Delivery Date</th><th>Currency</th><th>Total</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan="8" className="empty-state">No purchase orders</td></tr>
              : filtered.map(po => {
                const items = parseItems(po.items)
                const poCur  = po.currency || 'ZMW'
                return (
                  <tr key={po.id} onClick={() => setViewPO(po)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e  => e.currentTarget.style.background = ''}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{po.po_number}</td>
                    <td style={{ fontWeight: 600 }}>{po.supplier_name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{po.order_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{po.delivery_date || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '2px 6px',
                        background: poCur !== 'ZMW' ? 'rgba(59,130,246,.12)' : 'var(--surface2)',
                        color: poCur !== 'ZMW' ? 'var(--blue)' : 'var(--text-dim)',
                        borderRadius: 4, fontWeight: 700 }}>{poCur}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>
                      {fmtCur(po.total_amount, poCur)}
                    </td>
                    <td>{statusBadge(po.status)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {canEdit && po.status !== 'completed' && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleReceive(po)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>move_to_inbox</span> Receive
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

      {/* ═══════════════════════ VIEW PO MODAL ═══════════════════════════ */}
      {viewPO && (() => {
        const poCur = viewPO.currency || 'ZMW'
        const poRate = parseFloat(viewPO.exchange_rate || 1)
        const poTotal = parseFloat(viewPO.total_amount || 0)
        return (
          <div className="overlay" onClick={() => setViewPO(null)}>
            <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
              <div className="modal-title">{viewPO.po_number} — <span>{viewPO.supplier_name}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: 'var(--text-dim)' }}>Order Date:</span> {viewPO.order_date}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Delivery Date:</span> {viewPO.delivery_date || '—'}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> {statusBadge(viewPO.status)}</div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Currency:</span>{' '}
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700,
                    color: poCur !== 'ZMW' ? 'var(--blue)' : 'var(--text-dim)' }}>{poCur}</span>
                  {poCur !== 'ZMW' && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>
                      @ {poRate} ZMW
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Total:</span>{' '}
                  <strong style={{ color: 'var(--teal)' }}>{fmtCur(poTotal, poCur)}</strong>
                  {poCur !== 'ZMW' && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
                      ≈ ZMW {fmt(poTotal * poRate)}
                    </span>
                  )}
                </div>
                {viewPO.department && <div><span style={{ color: 'var(--text-dim)' }}>Department:</span> {viewPO.department}</div>}
                {viewPO.budget_code && <div><span style={{ color: 'var(--text-dim)' }}>Budget Code:</span> <code style={{ color: 'var(--gold)' }}>{viewPO.budget_code}</code></div>}
                <div><span style={{ color: 'var(--text-dim)' }}>Finance:</span>
                  {viewPO.finance_approved
                    ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Approved by {viewPO.finance_approver}</span>
                    : <span style={{ color: 'var(--text-dim)' }}>Pending finance approval</span>}
                </div>
                {viewPO.notes && <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>{viewPO.notes}</div>}
              </div>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead>
                  <tbody>
                    {parseItems(viewPO.items).map((it, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td>{it.category}</td>
                        <td>{it.unit || 'pcs'}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.ordered_qty}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{fmtCur(it.unit_cost, poCur)}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                          {fmtCur((it.ordered_qty || 0) * (it.unit_cost || 0), poCur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                {user?.role_id === 'role_super_admin' && viewPO.status === 'approved' && !viewPO.finance_approved && (
                  <button className="btn btn-secondary" onClick={async () => {
                    await supabase.from('purchase_orders').update({
                      finance_approved: true,
                      finance_approver: user.full_name || user.username,
                      finance_approved_at: new Date().toISOString(),
                    }).eq('id', viewPO.id)
                    await fetchAll()
                    setViewPO(null)
                    toast.success('Finance approved')
                  }}>
                    <span className="material-icons" style={{ fontSize: 16 }}>account_balance</span> Finance Approve
                  </button>
                )}
                {canEdit && viewPO.status !== 'completed' && (
                  <button className="btn btn-primary" onClick={() => { handleReceive(viewPO); setViewPO(null) }}>
                    <span className="material-icons">move_to_inbox</span> Create GRN
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setViewPO(null)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══════════════════════ CREATE PO MODAL ═════════════════════════ */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create <span>Purchase Order</span></div>

            {mrBanner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 8, fontSize: 12, color: 'var(--blue)' }}>
                <span className="material-icons" style={{ fontSize: 15 }}>link</span>
                Converting from <strong>{mrBanner}</strong>
              </div>
            )}

            <form onSubmit={handleSubmit}>

              {/* ── Supplier + Order Date ── */}
              <div className="form-row">
                <div className="form-group">
                  <label>Supplier *</label>
                  <select className="form-control" required value={form.supplier_id}
                    onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Order Date</label>
                  <input type="date" className="form-control" value={form.order_date}
                    onChange={e => setForm({ ...form, order_date: e.target.value })} />
                </div>
              </div>

              {/* ── Delivery Date ── */}
              <div className="form-group">
                <label>Expected Delivery Date</label>
                <input type="date" className="form-control" value={form.delivery_date}
                  onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
              </div>

              {/* ── Currency & Exchange Rate ─────────────────────────────── */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                  Currency &amp; Exchange Rate
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Currency</label>
                    <select className="form-control" value={form.currency}
                      onChange={e => handleCurrencyChange(e.target.value)}>
                      {currencyRates.length === 0
                        ? <option value="ZMW">ZMW — Zambian Kwacha (base)</option>
                        : currencyRates.map(r => (
                            <option key={r.currency_code} value={r.currency_code}>
                              {r.currency_code} — {r.currency_name}
                            </option>
                          ))
                      }
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Exchange Rate (1 {currCode} = ? ZMW)
                      {rateLoading && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>fetching…</span>}
                      {!rateLoading && isForeign && (
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3,
                          background: 'rgba(45,212,191,.12)', color: 'var(--teal)' }}>live</span>
                      )}
                    </label>
                    <input type="number" min="0.000001" step="0.000001" className="form-control"
                      value={form.exchange_rate} readOnly={!isForeign}
                      style={{ fontFamily: 'var(--mono)', color: isForeign ? 'var(--blue)' : 'var(--text-dim)',
                        background: !isForeign ? 'var(--surface)' : undefined }}
                      onChange={e => setForm(f => ({ ...f, exchange_rate: parseFloat(e.target.value) || 1 }))} />
                  </div>
                </div>
                {isForeign && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                    ℹ Rate sourced from Currency Exchange master — override if needed before saving.
                  </div>
                )}
              </div>

              {/* ── Items ──────────────────────────────────────────────────── */}
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '4px 0 12px' }}>
                Items to Order
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {form.items.map((it, idx) => (
                  <div key={idx} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>ITEM {idx + 1}</span>
                      {form.items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Item Name *</label>
                        <input className="form-control" placeholder="e.g. Portland Cement 50kg" required
                          value={it.name} onChange={e => setItem(idx, 'name', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Category</label>
                        <input className="form-control" placeholder="e.g. Construction, Electrical"
                          value={it.category} onChange={e => setItem(idx, 'category', e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                      <div className="form-group">
                        <label>Quantity *</label>
                        <input type="number" min="1" className="form-control" required
                          value={it.ordered_qty} onChange={e => setItem(idx, 'ordered_qty', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className="form-group">
                        <label>Unit</label>
                        <select className="form-control" value={it.unit} onChange={e => setItem(idx, 'unit', e.target.value)}>
                          {['pcs','kg','L','bags','boxes','m','rolls','sets','pairs','drums'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Unit Cost ({currCode})</label>
                        <input type="number" min="0" step="0.01" className="form-control"
                          value={it.unit_cost} onChange={e => setItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="form-group">
                        <label>Line Total</label>
                        <div className="form-control" style={{ background: 'var(--surface)', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                          {fmtCur((it.ordered_qty || 0) * (it.unit_cost || 0), currCode)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={addItem}>
                <span className="material-icons">add</span> Add Item
              </button>

              {/* ── Tax Template ────────────────────────────────────────── */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 16 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                  Tax Template
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Apply Tax Template</label>
                  <select className="form-control" value={form.tax_template_id}
                    onChange={e => setForm(f => ({ ...f, tax_template_id: e.target.value }))}>
                    <option value="">— None (no tax) —</option>
                    {taxTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tax breakdown */}
                {computedTaxLines.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Account Head','Charge Type','Rate / Amount','Tax Amount'].map(h => (
                            <th key={h} style={{ padding: '4px 8px', color: 'var(--text-dim)', fontWeight: 600, textAlign: 'left', fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {computedTaxLines.map((line, i) => (
                          <tr key={line.id || i} style={{ borderBottom: '1px solid var(--border2)' }}>
                            <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--purple)' }}>
                              {line.account_head || line.description || '—'}
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)' }}>
                              {line.charge_type}
                            </td>
                            <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 11 }}>
                              {line.charge_type === 'Actual Amount'
                                ? fmtCur(line.tax_amount, currCode)
                                : `${parseFloat(line.rate || 0).toFixed(2)}%`}
                            </td>
                            <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                              {fmtCur(line.computed_amount, currCode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Totals summary ──────────────────────────────────────── */}
              <div style={{ margin: '16px 0', padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-dim)' }}>Subtotal</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, minWidth: 140, textAlign: 'right' }}>
                      {fmtCur(subtotal, currCode)}
                    </span>
                  </div>
                  {taxAmount !== 0 && (
                    <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-dim)' }}>Tax</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--gold)', minWidth: 140, textAlign: 'right' }}>
                        + {fmtCur(taxAmount, currCode)}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 24, fontSize: 16, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
                    <span style={{ fontWeight: 700 }}>Grand Total</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--teal)', minWidth: 140, textAlign: 'right' }}>
                      {fmtCur(grandTotal, currCode)}
                    </span>
                  </div>
                  {isForeign && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                      ≈ ZMW {fmt(grandInZMW)} @ {form.exchange_rate} ZMW/{currCode}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Approval tier ───────────────────────────────────────── */}
              {approvalTier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px',
                  background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 8 }}>
                  <span className="material-icons" style={{ fontSize: 16, color: 'var(--gold)' }}>policy</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Approval required:</span>
                  <strong style={{ fontSize: 12, color: 'var(--gold)' }}>{approvalTier.approver_label}</strong>
                  {approvalTier.requires_two && (
                    <span style={{ fontSize: 11, color: 'var(--gold)', background: 'rgba(251,191,36,.15)',
                      padding: '1px 6px', borderRadius: 4 }}>2 approvers</span>
                  )}
                  {approvalTier.notes && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>— {approvalTier.notes}</span>
                  )}
                </div>
              )}

              {/* ── Notes ───────────────────────────────────────────────── */}
              <div className="form-group">
                <label>Notes / Special Instructions</label>
                <textarea className="form-control" rows="2" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <span className="material-icons">shopping_bag</span> Create PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
