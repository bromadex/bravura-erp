// src/pages/Procurement/RequestForQuotation.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useMasterData } from '../../contexts/MasterDataContext'
import toast from 'react-hot-toast'
import { fmtDate, dateTag, exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const emptyItem = () => ({ name: '', qty: 1, unit: 'pcs', specs: '' })

const emptyForm = () => ({
  title: '',
  description: '',
  department: '',
  deadline: '',
  pr_id: '',
  items: [emptyItem()],
})

export default function RequestForQuotation() {
  const { rfqs, rfqQuotations, purchaseRequisitions, createRFQ, updateRFQ, loading } = useProcurement()
  const { user } = useAuth()
  const { departments } = useMasterData()
  const navigate = useNavigate()

  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm, setSearchTerm]     = useState('')
  const [modalOpen, setModalOpen]       = useState(false)
  const [viewRFQ, setViewRFQ]           = useState(null)
  const [form, setForm]                 = useState(emptyForm())

  // ── helpers ──────────────────────────────────────────────────
  const parseItems = (raw) =>
    Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : [])

  const quoteCount = (rfqId) =>
    rfqQuotations.filter(q => q.rfq_id === rfqId).length

  const isDeadlinePast = (deadline, status) =>
    status === 'Open' && deadline && new Date(deadline) < new Date()

  // ── filtering ─────────────────────────────────────────────────
  const filtered = rfqs.filter(r => {
    const matchStatus = filterStatus === 'all' || r.status === filterStatus
    const t = searchTerm.toLowerCase()
    const matchSearch = !searchTerm
      || r.rfq_number?.toLowerCase().includes(t)
      || r.title?.toLowerCase().includes(t)
      || r.department?.toLowerCase().includes(t)
    return matchStatus && matchSearch
  })

  // ── form item helpers ─────────────────────────────────────────
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const setItem = (idx, field, val) => {
    const items = [...form.items]
    items[idx] = { ...items[idx], [field]: val }
    setForm(f => ({ ...f, items }))
  }

  // ── submit ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim())    return toast.error('Title is required')
    if (!form.deadline)        return toast.error('Deadline is required')
    if (form.items.some(it => !it.name.trim())) return toast.error('All items need a name')
    try {
      await createRFQ({
        title:        form.title.trim(),
        description:  form.description.trim(),
        department:   form.department,
        deadline:     form.deadline,
        pr_id:        form.pr_id || null,
        items:        form.items,
        status:       'Open',
        created_by:   user?.full_name || user?.username || '',
      })
      toast.success('RFQ created')
      setModalOpen(false)
      setForm(emptyForm())
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── close / cancel ────────────────────────────────────────────
  const handleClose = async (rfq) => {
    if (!window.confirm(`Close RFQ ${rfq.rfq_number}? No more quotations will be accepted.`)) return
    try {
      await updateRFQ(rfq.id, { status: 'Closed' })
      toast.success('RFQ closed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleCancel = async (rfq) => {
    const reason = window.prompt(`Cancel RFQ ${rfq.rfq_number}?\nEnter reason (optional):`)
    if (reason === null) return // user pressed Cancel on the prompt
    try {
      await updateRFQ(rfq.id, { status: 'Cancelled', cancellation_reason: reason || null })
      toast.success('RFQ cancelled')
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── export ────────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(filtered.map(r => ({
      'RFQ #':       r.rfq_number,
      Title:         r.title,
      Department:    r.department || '—',
      Items:         parseItems(r.items).length,
      Deadline:      r.deadline,
      Status:        r.status,
      'Quotes Recv': quoteCount(r.id),
    })), `RFQ_${dateTag()}`, 'RFQs')
    toast.success('Exported')
  }

  return (
    <div>
      <PageHeader
        title="Request for Quotation"
        subtitle="Send RFQs to multiple suppliers and track responses"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setModalOpen(true) }}>
          <span className="material-icons">add</span> Create RFQ
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {['all', 'Open', 'Closed', 'Cancelled'].map(s => (
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
          style={{ marginLeft: 'auto', maxWidth: 260 }}
          placeholder="Search RFQ #, title, department…"
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
                <th>Title</th>
                <th>Department</th>
                <th>Items</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Quotes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="empty-state">No RFQs found</td></tr>
              ) : (
                filtered.map(rfq => {
                  const items    = parseItems(rfq.items)
                  const past     = isDeadlinePast(rfq.deadline, rfq.status)
                  const qCount   = quoteCount(rfq.id)
                  return (
                    <tr key={rfq.id}>
                      <td className="td-mono" style={{ color: 'var(--gold)' }}>{rfq.rfq_number}</td>
                      <td style={{ fontWeight: 600 }}>{rfq.title}</td>
                      <td>
                        {rfq.department
                          ? <span className="badge badge-dim">{rfq.department}</span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</td>
                      <td style={{ color: past ? 'var(--red)' : undefined, whiteSpace: 'nowrap' }}>
                        {fmtDate(rfq.deadline)}
                        {past && <span title="Deadline passed" style={{ marginLeft: 4, fontSize: 12 }}>⚠</span>}
                      </td>
                      <td><StatusBadge status={rfq.status} /></td>
                      <td style={{ fontFamily: 'var(--mono)' }}>
                        {qCount > 0
                          ? <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{qCount}</span>
                          : <span style={{ color: 'var(--text-dim)' }}>0</span>}
                      </td>
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewRFQ(rfq)}>
                          View
                        </button>
                        {rfq.status === 'Open' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate(`/module/procurement/quotations?rfq_id=${rfq.id}`)}
                          >
                            Add Quote
                          </button>
                        )}
                        {rfq.status === 'Open' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleClose(rfq)}>
                            Close
                          </button>
                        )}
                        {rfq.status === 'Open' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleCancel(rfq)}>
                            Cancel
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

      {/* ── View RFQ Modal ── */}
      <ModalDialog
        open={!!viewRFQ}
        onClose={() => setViewRFQ(null)}
        title={viewRFQ ? `${viewRFQ.rfq_number} — ${viewRFQ.title}` : ''}
        size="lg"
      >
        {viewRFQ && (() => {
          const items = parseItems(viewRFQ.items)
          const linkedPR = purchaseRequisitions.find(p => p.id === viewRFQ.pr_id)
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
                <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <StatusBadge status={viewRFQ.status} /></div>
                <div><span style={{ color: 'var(--text-dim)' }}>Department:</span> {viewRFQ.department || '—'}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Deadline:</span> {fmtDate(viewRFQ.deadline)}</div>
                <div><span style={{ color: 'var(--text-dim)' }}>Created by:</span> {viewRFQ.created_by || '—'}</div>
                {linkedPR && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Linked PR:</span>{' '}
                    <span className="badge badge-blue">{linkedPR.pr_number}</span>{' '}
                    {linkedPR.title || ''}
                  </div>
                )}
                {viewRFQ.description && (
                  <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>
                    {viewRFQ.description}
                  </div>
                )}
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                Items ({items.length})
              </div>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr><th>#</th><th>Item Name</th><th>Qty</th><th>Unit</th><th>Specifications</th></tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan="5" className="empty-state">No items</td></tr>
                    ) : items.map((it, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.qty}</td>
                        <td>{it.unit || '—'}</td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{it.specs || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ModalActions>
                {viewRFQ.status === 'Open' && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setViewRFQ(null)
                      navigate(`/module/procurement/supplier-quotations?rfq_id=${viewRFQ.id}`)
                    }}
                  >
                    <span className="material-icons">add_circle</span> Add Quotation →
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setViewRFQ(null)}>Close</button>
              </ModalActions>
            </>
          )
        })()}
      </ModalDialog>

      {/* ── Create RFQ Modal ── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Request for Quotation"
        size="xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Title *</label>
              <input
                className="form-control"
                placeholder="e.g. Office Supplies Q3 2026"
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Deadline *</label>
              <input
                type="date"
                className="form-control"
                required
                min={today}
                value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Department</label>
              {departments.length > 0 ? (
                <select
                  className="form-control"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                >
                  <option value="">— Select department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-control"
                  placeholder="e.g. Operations"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                />
              )}
            </div>
            <div className="form-group">
              <label>Linked Purchase Requisition</label>
              <select
                className="form-control"
                value={form.pr_id}
                onChange={e => setForm(f => ({ ...f, pr_id: e.target.value }))}
              >
                <option value="">— None —</option>
                {purchaseRequisitions.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.pr_number} — {pr.title || pr.department || ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              className="form-control"
              rows="2"
              placeholder="Additional details or instructions for suppliers…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Items */}
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 12px' }}>
            Items to Quote
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 10 }}>
                  <div className="form-group">
                    <label>Item Name *</label>
                    <input
                      className="form-control"
                      placeholder="e.g. A4 Copy Paper"
                      required
                      value={it.name}
                      onChange={e => setItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      required
                      value={it.qty}
                      onChange={e => setItem(idx, 'qty', parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <select
                      className="form-control"
                      value={it.unit}
                      onChange={e => setItem(idx, 'unit', e.target.value)}
                    >
                      {['pcs', 'kg', 'L', 'bags', 'boxes', 'm', 'rolls', 'sets', 'pairs', 'drums', 'reams'].map(u => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Specifications</label>
                    <input
                      className="form-control"
                      placeholder="Brand, model, grade…"
                      value={it.specs}
                      onChange={e => setItem(idx, 'specs', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addItem}>
            <span className="material-icons">add</span> Add Item
          </button>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              <span className="material-icons">send</span> Create RFQ
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
