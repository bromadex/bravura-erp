// src/pages/Procurement/StoreRequisitions.jsx
//
// FIXES:
// 1. Item fields too small / invisible — replaced cramped grid with stacked card per item
// 2. Added proper approval workflow UI (approve/reject with reason)
// 3. Added KPIs, search, status filter, Excel export
// 4. View requisition modal with full details

import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

const STATUS_CONFIG = {
  draft:     { cls: 'badge-blue',   label: 'Draft'     },
  submitted: { cls: 'badge-yellow', label: 'Submitted' },
  approved:  { cls: 'badge-green',  label: 'Approved'  },
  rejected:  { cls: 'badge-red',    label: 'Rejected'  },
  fulfilled: { cls: 'badge-purple', label: 'Fulfilled' },
}

const PRIORITIES = ['low', 'normal', 'high', 'critical']
const PRIORITY_COLORS = { low: 'var(--text-dim)', normal: 'var(--blue)', high: 'var(--yellow)', critical: 'var(--red)' }

export default function StoreRequisitions() {
  const { storeRequisitions, createStoreRequisition, updateStoreRequisition, approveStoreRequisition, rejectStoreRequisition, loading } = useProcurement()
  const { user } = useAuth()
  const canEdit    = useCanEdit('procurement', 'store-requisitions')
  const canApprove = useCanApprove('procurement', 'store-requisitions')

  const [modalOpen,     setModalOpen]     = useState(false)
  const [editing,       setEditing]       = useState(null)
  const [viewReq,       setViewReq]       = useState(null)
  const [rejectModal,   setRejectModal]   = useState({ open: false, id: null, reason: '' })
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [searchTerm,    setSearchTerm]    = useState('')

  const emptyForm = () => ({
    date:           today,
    department:     '',
    priority:       'normal',
    requester_name: user?.full_name || user?.username || '',
    items:          [{ name: '', category: '', qty: 1, unit: 'pcs', notes: '' }],
    notes:          '',
  })
  const [form, setForm] = useState(emptyForm())

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', qty: 1, unit: 'pcs', notes: '' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setItem    = (i, field, val) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [field]: val }; return { ...f, items } })

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit   = (r) => { setEditing(r); setForm({ ...r, items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.department.trim()) return toast.error('Department required')
    if (form.items.some(it => !it.name.trim() || !it.qty || it.qty < 1)) return toast.error('All items need a name and quantity')
    try {
      if (editing) {
        await updateStoreRequisition(editing.id, { ...form })
        toast.success('Requisition updated')
      } else {
        await createStoreRequisition({ ...form, status: 'draft', requester_id: user?.id })
        toast.success('Requisition saved as draft')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const submitForApproval = async (id) => {
    try { await updateStoreRequisition(id, { status: 'submitted' }); toast.success('Submitted for approval') }
    catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (id) => {
    try { await approveStoreRequisition(id, user?.full_name || user?.username); toast.success('Approved') }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Reason required')
    try { await rejectStoreRequisition(rejectModal.id, rejectModal.reason); toast.success('Rejected'); setRejectModal({ open: false, id: null, reason: '' }) }
    catch (err) { toast.error(err.message) }
  }

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])

  const filtered = storeRequisitions.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      if (!(r.department?.toLowerCase().includes(t) || r.requester_name?.toLowerCase().includes(t) || r.sr_number?.toLowerCase().includes(t))) return false
    }
    return true
  })

  // KPIs
  const pending   = storeRequisitions.filter(r => r.status === 'submitted').length
  const approved  = storeRequisitions.filter(r => r.status === 'approved').length
  const totalReqs = storeRequisitions.length

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'SR #': r.sr_number, Date: r.date, Department: r.department, Priority: r.priority,
      'Requested By': r.requester_name, Items: parseItems(r.items).length, Status: r.status, Notes: r.notes
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Store Requisitions')
    XLSX.writeFile(wb, `StoreRequisitions_${today}.xlsx`); toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Store Requisitions</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate}>
              <span className="material-icons">add</span> New Requisition
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total</div><div className="kpi-val">{totalReqs}</div></div>
        <div className="kpi-card" style={{ borderLeft: pending > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">Pending Approval</div>
          <div className="kpi-val" style={{ color: pending > 0 ? 'var(--yellow)' : 'var(--green)' }}>{pending}</div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Approved</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{approved}</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="Search department, requester, SR #…" style={{ maxWidth: 260 }}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select className="form-control" style={{ width: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr><th>SR #</th><th>Date</th><th>Department</th><th>Priority</th><th>Requested By</th><th>Items</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan="8" className="empty-state">No requisitions found</td></tr>
            : filtered.map(r => {
              const items = parseItems(r.items)
              const sc    = STATUS_CONFIG[r.status] || { cls: 'badge-gold', label: r.status }
              return (
                <tr key={r.id} onClick={() => setViewReq(r)} style={{ cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e  => e.currentTarget.style.background = ''}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{r.sr_number || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontWeight: 600 }}>{r.department}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[r.priority] || 'var(--text-dim)', textTransform: 'uppercase' }}>{r.priority}</span></td>
                  <td>{r.requester_name || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                  <td><span className={`badge ${sc.cls}`}>{sc.label}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {canEdit && r.status === 'draft' && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => submitForApproval(r.id)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>send</span> Submit
                        </button>
                      </>
                    )}
                    {canApprove && r.status === 'submitted' && (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r.id)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>check</span>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setRejectModal({ open: true, id: r.id, reason: '' })}>
                          <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* View modal */}
      {viewReq && (
        <div className="overlay" onClick={() => setViewReq(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewReq.sr_number || 'Requisition'} — <span>{viewReq.department}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Date:</span> {viewReq.date}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Priority:</span> <span style={{ fontWeight: 700, color: PRIORITY_COLORS[viewReq.priority] }}>{viewReq.priority?.toUpperCase()}</span></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Requested By:</span> {viewReq.requester_name}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <span className={`badge ${STATUS_CONFIG[viewReq.status]?.cls || 'badge-gold'}`}>{STATUS_CONFIG[viewReq.status]?.label || viewReq.status}</span></div>
              {viewReq.notes && <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>Notes: {viewReq.notes}</div>}
              {viewReq.rejection_reason && <div style={{ gridColumn: 'span 2', color: 'var(--red)', fontSize: 12 }}>Rejection reason: {viewReq.rejection_reason}</div>}
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Notes</th></tr></thead>
                <tbody>
                  {parseItems(viewReq.items).map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{it.name}</td>
                      <td>{it.category}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{it.qty}</td>
                      <td>{it.unit || 'pcs'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{it.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              {canApprove && viewReq.status === 'submitted' && (
                <>
                  <button className="btn btn-primary" onClick={() => { handleApprove(viewReq.id); setViewReq(null) }}>
                    <span className="material-icons">check_circle</span> Approve
                  </button>
                  <button className="btn btn-danger" onClick={() => { setRejectModal({ open: true, id: viewReq.id, reason: '' }); setViewReq(null) }}>
                    <span className="material-icons">cancel</span> Reject
                  </button>
                </>
              )}
              {canEdit && viewReq.status === 'draft' && (
                <button className="btn btn-secondary" onClick={() => { openEdit(viewReq); setViewReq(null) }}>
                  <span className="material-icons">edit</span> Edit
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewReq(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'New'} Store <span>Requisition</span></div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Department *</label>
                  <input className="form-control" required placeholder="e.g. Engineering, Mining" value={form.department}
                    onChange={e => setForm({ ...form, department: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select className="form-control" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Requested By</label>
                <input className="form-control" value={form.requester_name} onChange={e => setForm({ ...form, requester_name: e.target.value })} />
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 10px' }}>
                Items Requested
              </div>

              {/* ✅ FIX: Stacked layout — every field fully visible */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {form.items.map((it, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>ITEM {i + 1}</span>
                      {form.items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Item Name *</label>
                        <input className="form-control" required placeholder="Describe what you need"
                          value={it.name} onChange={e => setItem(i, 'name', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Category</label>
                        <input className="form-control" placeholder="e.g. Electrical, PPE, Tools"
                          value={it.category} onChange={e => setItem(i, 'category', e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
                      <div className="form-group">
                        <label>Quantity *</label>
                        <input type="number" min="1" className="form-control" required
                          value={it.qty} onChange={e => setItem(i, 'qty', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className="form-group">
                        <label>Unit</label>
                        <select className="form-control" value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}>
                          {['pcs','kg','L','bags','boxes','m','rolls','sets','pairs','drums'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Notes / Specification</label>
                        <input className="form-control" placeholder="Brand, size, spec…"
                          value={it.notes} onChange={e => setItem(i, 'notes', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginTop: 10, marginBottom: 16 }}>
                <span className="material-icons">add</span> Add Item
              </button>

              <div className="form-group">
                <label>Notes / Justification</label>
                <textarea className="form-control" rows="2" placeholder="Reason for request, urgency, project code…"
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-secondary">
                  <span className="material-icons">save</span> Save Draft
                </button>
                <button type="button" className="btn btn-primary"
                  onClick={async (e) => { e.preventDefault(); if (form.items.some(it => !it.name.trim() || it.qty < 1)) { toast.error('All items need a name and quantity'); return } if (!form.department.trim()) { toast.error('Department required'); return } const payload = { ...form, status: 'submitted', requester_id: user?.id }; try { if (editing) { await updateStoreRequisition(editing.id, payload); toast.success('Updated & submitted') } else { await createStoreRequisition(payload); toast.success('Submitted for approval') } setModalOpen(false) } catch (err) { toast.error(err.message) } }}>
                  <span className="material-icons">send</span> Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal.open && (
        <div className="overlay" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Reject <span>Requisition</span></div>
            <div className="form-group">
              <label>Reason for rejection *</label>
              <textarea className="form-control" rows="3" placeholder="Explain why this requisition is being rejected…"
                value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRejectModal({ open: false, id: null, reason: '' })}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
