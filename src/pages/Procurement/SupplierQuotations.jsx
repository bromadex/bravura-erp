// src/pages/Procurement/SupplierQuotations.jsx
import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { fmtDate, fmtNum, dateTag, exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

export default function SupplierQuotations() {
  const { rfqs, rfqQuotations, suppliers, addQuotation, selectQuotation, deleteQuotation, loading } = useProcurement()
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlRfqId = searchParams.get('rfq_id') || ''

  // ── filters ───────────────────────────────────────────────────
  const [filterRfqId,  setFilterRfqId]  = useState(urlRfqId)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm,   setSearchTerm]   = useState('')

  // ── modals ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [viewQuot,  setViewQuot]  = useState(null)

  // ── add form ──────────────────────────────────────────────────
  const emptyForm = () => ({
    rfq_id:         urlRfqId,
    supplier_id:    '',
    supplier_name:  '',
    submitted_date: today,
    valid_until:    '',
    delivery_days:  '',
    payment_terms:  '',
    items:          [],
    notes:          '',
  })
  const [form, setForm] = useState(emptyForm())

  const parseItems = (raw) =>
    Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : [])

  // When RFQ is selected in the form, auto-populate items
  const handleFormRfqChange = (rfqId) => {
    const rfq = rfqs.find(r => r.id === rfqId)
    const rfqItems = rfq ? parseItems(rfq.items).map(it => ({
      name:       it.name,
      qty:        it.qty,
      unit:       it.unit,
      unit_price: 0,
      total:      0,
      notes:      '',
    })) : []
    setForm(f => ({ ...f, rfq_id: rfqId, items: rfqItems }))
  }

  const setFormItem = (idx, field, val) => {
    const items = [...form.items]
    const item  = { ...items[idx], [field]: val }
    if (field === 'unit_price') {
      item.total = (parseFloat(item.qty) || 0) * (parseFloat(val) || 0)
    }
    items[idx] = item
    setForm(f => ({ ...f, items }))
  }

  const totalAmount = form.items.reduce((s, it) => s + (parseFloat(it.total) || 0), 0)

  // ── filtered list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rfqQuotations.filter(q => {
      const matchRfq    = !filterRfqId || q.rfq_id === filterRfqId
      const matchStatus = filterStatus === 'all' || q.status === filterStatus
      const t = searchTerm.toLowerCase()
      const matchSearch = !searchTerm
        || q.supplier_name?.toLowerCase().includes(t)
        || rfqs.find(r => r.id === q.rfq_id)?.rfq_number?.toLowerCase().includes(t)
      return matchRfq && matchStatus && matchSearch
    })
  }, [rfqQuotations, filterRfqId, filterStatus, searchTerm, rfqs])

  // Active filter chip
  const filterRfq = filterRfqId ? rfqs.find(r => r.id === filterRfqId) : null

  const clearRfqFilter = () => {
    setFilterRfqId('')
    setSearchParams({})
  }

  // ── save quotation ────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.rfq_id)            return toast.error('Select an RFQ')
    if (!form.supplier_name.trim()) return toast.error('Supplier name is required')
    if (!form.submitted_date)    return toast.error('Submitted date is required')
    if (form.items.length === 0) return toast.error('No items to quote — select an RFQ first')
    if (form.items.some(it => it.unit_price <= 0)) {
      if (!window.confirm('Some items have $0 unit price. Continue?')) return
    }
    try {
      await addQuotation({
        rfq_id:         form.rfq_id,
        supplier_id:    form.supplier_id || null,
        supplier_name:  form.supplier_name.trim(),
        submitted_date: form.submitted_date,
        valid_until:    form.valid_until || null,
        delivery_days:  form.delivery_days ? parseInt(form.delivery_days) : null,
        payment_terms:  form.payment_terms,
        currency:       'USD',
        items:          form.items,
        total_amount:   totalAmount,
        notes:          form.notes,
        status:         'Received',
      })
      toast.success('Quotation recorded')
      setModalOpen(false)
      setForm(emptyForm())
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── select quotation ──────────────────────────────────────────
  const handleSelect = async (quot) => {
    const reason = window.prompt('Reason for selecting this quotation (optional):') ?? ''
    if (reason === null) return
    try {
      await selectQuotation(quot.id, quot.rfq_id, reason)
      toast.success('Quotation selected. RFQ closed.')
      setViewQuot(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── delete quotation ──────────────────────────────────────────
  const handleDelete = async (quot) => {
    if (!window.confirm(`Delete quotation from ${quot.supplier_name}?`)) return
    try {
      await deleteQuotation(quot.id)
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── export ────────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(filtered.map(q => {
      const rfq = rfqs.find(r => r.id === q.rfq_id)
      return {
        'RFQ #':        rfq?.rfq_number || '—',
        Supplier:       q.supplier_name,
        Submitted:      q.submitted_date,
        'Valid Until':  q.valid_until || '—',
        'Del. Days':    q.delivery_days || '—',
        'Pay Terms':    q.payment_terms || '—',
        Total:          parseFloat(q.total_amount || 0).toFixed(2),
        Status:         q.status,
      }
    }), `SupplierQuotations_${dateTag()}`, 'Quotations')
    toast.success('Exported')
  }

  const openRfqs = rfqs.filter(r => r.status === 'Open')

  return (
    <div>
      <PageHeader
        title="Supplier Quotations"
        subtitle="Record and manage supplier responses to RFQs"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button
          className="btn btn-primary"
          onClick={() => { setForm(emptyForm()); setModalOpen(true) }}
        >
          <span className="material-icons">add</span> Record Quote
        </button>
      </PageHeader>

      {/* Active RFQ filter chip */}
      {filterRfq && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 6 }}>Showing:</span>
          <span
            className="badge badge-blue"
            style={{ cursor: 'pointer', padding: '4px 10px' }}
            onClick={clearRfqFilter}
            title="Clear filter"
          >
            {filterRfq.rfq_number}: {filterRfq.title} ×
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="form-control"
          style={{ maxWidth: 220 }}
          value={filterRfqId}
          onChange={e => {
            setFilterRfqId(e.target.value)
            if (e.target.value) setSearchParams({ rfq_id: e.target.value })
            else setSearchParams({})
          }}
        >
          <option value="">All RFQs</option>
          {rfqs.map(r => (
            <option key={r.id} value={r.id}>{r.rfq_number}: {r.title}</option>
          ))}
        </select>

        {['all', 'Received', 'Selected', 'Rejected'].map(s => (
          <button
            key={s}
            className={`btn btn-secondary btn-sm ${filterStatus === s ? 'active' : ''}`}
            onClick={() => setFilterStatus(s)}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}

        <input
          className="form-control"
          style={{ marginLeft: 'auto', maxWidth: 240 }}
          placeholder="Search supplier, RFQ…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>RFQ #</th>
                <th>Supplier</th>
                <th>Submitted</th>
                <th>Valid Until</th>
                <th>Total Amount</th>
                <th>Del. Days</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No quotations found</td></tr>
              ) : (
                filtered.map(q => {
                  const rfq = rfqs.find(r => r.id === q.rfq_id)
                  return (
                    <tr key={q.id}>
                      <td className="td-mono" style={{ color: 'var(--gold)' }}>
                        {rfq?.rfq_number || '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{q.supplier_name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(q.submitted_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(q.valid_until)}</td>
                      <td className="td-mono" style={{ color: 'var(--teal)' }}>
                        ${fmtNum(q.total_amount)}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>
                        {q.delivery_days != null ? `${q.delivery_days}d` : '—'}
                      </td>
                      <td><StatusBadge status={q.status} /></td>
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewQuot(q)}>
                          View
                        </button>
                        {q.status === 'Received' && rfq?.status === 'Open' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate(`/module/procurement/quotation-comparison?rfq_id=${q.rfq_id}`)}
                          >
                            Compare
                          </button>
                        )}
                        {q.status === 'Received' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q)}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── View Quotation Modal ── */}
      <ModalDialog
        open={!!viewQuot}
        onClose={() => setViewQuot(null)}
        title={viewQuot ? `Quotation — ${viewQuot.supplier_name}` : ''}
        size="lg"
      >
        {viewQuot && (() => {
          const items = parseItems(viewQuot.items)
          const rfq   = rfqs.find(r => r.id === viewQuot.rfq_id)
          const canSelect = viewQuot.status === 'Received' && rfq?.status === 'Open'
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: 'var(--text-dim)' }}>RFQ:</span> <span className="badge badge-gold">{rfq?.rfq_number || '—'}</span> {rfq?.title}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <StatusBadge status={viewQuot.status} /></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Submitted:</span> {fmtDate(viewQuot.submitted_date)}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Valid Until:</span> {fmtDate(viewQuot.valid_until)}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Delivery Days:</span> {viewQuot.delivery_days != null ? `${viewQuot.delivery_days} days` : '—'}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Payment Terms:</span> {viewQuot.payment_terms || '—'}</div>
                {viewQuot.notes && (
                  <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>{viewQuot.notes}</div>
                )}
              </div>

              <div className="table-wrap" style={{ marginBottom: 12 }}>
                <table className="stock-table">
                  <thead>
                    <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.qty}</td>
                        <td>{it.unit || '—'}</td>
                        <td className="td-mono">${fmtNum(it.unit_price)}</td>
                        <td className="td-mono" style={{ color: 'var(--teal)' }}>${fmtNum(it.total)}</td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{it.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ textAlign: 'right', fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--teal)', marginBottom: 8 }}>
                Total: ${fmtNum(viewQuot.total_amount)}
              </div>

              <ModalActions>
                {canSelect && (
                  <button className="btn btn-primary" onClick={() => handleSelect(viewQuot)}>
                    <span className="material-icons">check_circle</span> Select This Quotation
                  </button>
                )}
                {viewQuot.status === 'Received' && rfq?.status === 'Open' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setViewQuot(null)
                      navigate(`/module/procurement/quotation-comparison?rfq_id=${viewQuot.rfq_id}`)
                    }}
                  >
                    <span className="material-icons">compare</span> Compare
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setViewQuot(null)}>Close</button>
              </ModalActions>
            </>
          )
        })()}
      </ModalDialog>

      {/* ── Record Quotation Modal ── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Supplier Quotation"
        size="xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>RFQ *</label>
              <select
                className="form-control"
                required
                value={form.rfq_id}
                onChange={e => handleFormRfqChange(e.target.value)}
              >
                <option value="">— Select RFQ —</option>
                {openRfqs.map(r => (
                  <option key={r.id} value={r.id}>{r.rfq_number}: {r.title}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Supplier *</label>
              {suppliers.length > 0 ? (
                <select
                  className="form-control"
                  value={form.supplier_id}
                  onChange={e => {
                    const sup = suppliers.find(s => s.id === e.target.value)
                    setForm(f => ({ ...f, supplier_id: e.target.value, supplier_name: sup?.name || '' }))
                  }}
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-control"
                  placeholder="Supplier name"
                  required
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                />
              )}
              {/* Show text field for supplier name override when using dropdown */}
              {suppliers.length > 0 && (
                <input
                  className="form-control"
                  style={{ marginTop: 6 }}
                  placeholder="Or type supplier name directly"
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value, supplier_id: '' }))}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Submitted Date *</label>
              <input
                type="date"
                className="form-control"
                required
                value={form.submitted_date}
                onChange={e => setForm(f => ({ ...f, submitted_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Valid Until</label>
              <input
                type="date"
                className="form-control"
                value={form.valid_until}
                onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Delivery Days</label>
              <input
                type="number"
                min="0"
                className="form-control"
                placeholder="e.g. 14"
                value={form.delivery_days}
                onChange={e => setForm(f => ({ ...f, delivery_days: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Payment Terms</label>
              <input
                className="form-control"
                placeholder="Net 30, Net 60…"
                value={form.payment_terms}
                onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
              />
            </div>
          </div>

          {/* Items */}
          {form.rfq_id && form.items.length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 10px' }}>
                Line Items
              </div>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit Price ($)</th><th>Total</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, minWidth: 140 }}>{it.name}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.qty}</td>
                        <td>{it.unit}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            style={{ width: 110 }}
                            value={it.unit_price}
                            onChange={e => setFormItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="td-mono" style={{ color: 'var(--teal)' }}>
                          ${fmtNum(it.total)}
                        </td>
                        <td>
                          <input
                            className="form-control"
                            style={{ width: 140 }}
                            placeholder="Notes…"
                            value={it.notes}
                            onChange={e => setFormItem(idx, 'notes', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: 'var(--teal)', marginTop: 10, marginBottom: 4 }}>
                Total: ${fmtNum(totalAmount)}
              </div>
            </>
          ) : form.rfq_id ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 12 }}>No items on this RFQ.</div>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 12 }}>Select an RFQ above to load items.</div>
          )}

          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Notes</label>
            <textarea
              className="form-control"
              rows="2"
              placeholder="Additional remarks…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <span className="material-icons">save</span> Save Quotation
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
