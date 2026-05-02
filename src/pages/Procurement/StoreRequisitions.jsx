// src/pages/Procurement/StoreRequisitions.jsx
//
// FULL REWRITE — fixes all issues from screenshots:
//
// 1. Approval flow: Draft → HOD Approves → Storekeeper Fulfills → Done
// 2. Employee selector for "Requested By" (super admin only can override)
// 3. Items selected from inventory catalogue with auto-filled category
// 4. Department pulled from HR departments list
// 5. Stacked item cards (no tiny grid columns)
// 6. KPIs, search, status filter, Excel export
// 7. Full view modal with approval trail

import { useState, useEffect } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

const STATUS_CONFIG = {
  draft:                { cls: 'badge-blue',   label: 'Draft',                icon: 'edit_note'     },
  submitted:            { cls: 'badge-yellow', label: 'Pending HOD Approval', icon: 'pending'       },
  approved:             { cls: 'badge-gold',   label: 'Approved — Awaiting Issue', icon: 'approval' },
  fulfilled:            { cls: 'badge-green',  label: 'Fulfilled',            icon: 'check_circle'  },
  partially_fulfilled:  { cls: 'badge-yellow', label: 'Partially Fulfilled',  icon: 'warning'       },
  rejected:             { cls: 'badge-red',    label: 'Rejected',             icon: 'cancel'        },
}

const PRIORITIES      = ['low', 'normal', 'high', 'critical']
const PRIORITY_COLORS = { low: 'var(--text-dim)', normal: 'var(--blue)', high: 'var(--yellow)', critical: 'var(--red)' }

export default function StoreRequisitions() {
  const {
    storeRequisitions, createStoreRequisition, updateStoreRequisition,
    approveStoreRequisition, rejectStoreRequisition, fulfillStoreRequisition, loading,
  } = useProcurement()
  const { user } = useAuth()
  const canEdit    = useCanEdit('procurement', 'store-requisitions')
  const canApprove = useCanApprove('procurement', 'store-requisitions')

  // Is this user a super admin?
  const isSuperAdmin = user?.role_id === 'role_super_admin'

  // Live data from other modules
  const [inventoryItems, setInventoryItems] = useState([])
  const [departments,    setDepartments]    = useState([])
  const [employees,      setEmployees]      = useState([])
  const [storageLocations, setStorageLocations] = useState([])

  useEffect(() => {
    // Fetch inventory items (for item picker)
    supabase.from('items').select('id, name, category, unit, balance, item_code').order('name')
      .then(({ data }) => { if (data) setInventoryItems(data) })
    // Fetch departments (for dept picker)
    supabase.from('departments').select('id, name').order('name')
      .then(({ data }) => { if (data) setDepartments(data) })
    // Fetch employees (super admin can select on behalf of others)
    supabase.from('employees').select('id, name, department_id').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [viewReq,      setViewReq]      = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm,   setSearchTerm]   = useState('')
  const [rejectModal,  setRejectModal]  = useState({ open: false, id: null, reason: '' })
  const [fulfilling,   setFulfilling]   = useState(null)   // req being fulfilled

  // ── Form ──────────────────────────────────────────────────
  const emptyForm = () => ({
    date:           today,
    department:     '',
    priority:       'normal',
    requester_name: user?.full_name || user?.username || '',
    requester_id:   user?.id || '',
    items: [{ item_id: '', name: '', category: '', qty: 1, unit: 'pcs', notes: '' }],
    notes: '',
  })
  const [form, setForm] = useState(emptyForm())

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit   = (r) => {
    setEditing(r)
    setForm({
      date:           r.date,
      department:     r.department,
      priority:       r.priority || 'normal',
      requester_name: r.requester_name,
      requester_id:   r.requester_id,
      items:          typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
      notes:          r.notes || '',
    })
    setModalOpen(true)
  }

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { item_id: '', name: '', category: '', qty: 1, unit: 'pcs', notes: '' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setItem    = (i, field, val) => setForm(f => {
    const items = [...f.items]
    items[i]    = { ...items[i], [field]: val }
    return { ...f, items }
  })

  // When an inventory item is selected, auto-fill name/category/unit
  const selectInventoryItem = (idx, itemId) => {
    const inv = inventoryItems.find(it => it.id === itemId)
    if (inv) {
      setForm(f => {
        const items = [...f.items]
        items[idx]  = { ...items[idx], item_id: inv.id, name: inv.name, category: inv.category, unit: inv.unit || 'pcs' }
        return { ...f, items }
      })
    }
  }

  // When employee selected, auto-fill dept
  const selectRequester = (empId) => {
    const emp  = employees.find(e => e.id === empId)
    const dept = departments.find(d => d.id === emp?.department_id)
    setForm(f => ({
      ...f,
      requester_id:   empId,
      requester_name: emp?.name || '',
      department:     dept?.name || f.department,
    }))
  }

  const handleSubmit = async (status = 'draft') => {
    if (!form.department.trim()) return toast.error('Select a department')
    if (form.items.some(it => !it.name.trim() || it.qty < 1)) return toast.error('All items need a name and quantity > 0')
    try {
      if (editing) {
        await updateStoreRequisition(editing.id, { ...form, items: form.items, status: editing.status })
        toast.success('Requisition updated')
      } else {
        await createStoreRequisition({ ...form, items: form.items, status })
        toast.success(status === 'draft' ? 'Draft saved' : 'Submitted for HOD approval')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleApprove = async (id) => {
    try { await approveStoreRequisition(id, user?.full_name || user?.username, user?.id); toast.success('Requisition approved') }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) return toast.error('Rejection reason required')
    try {
      await rejectStoreRequisition(rejectModal.id, rejectModal.reason, user?.full_name || user?.username, user?.id)
      toast.success('Rejected')
      setRejectModal({ open: false, id: null, reason: '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleFulfill = async (req) => {
    if (!window.confirm(`Fulfill "${req.sr_number || req.req_number}"? This will issue items from stock.`)) return
    setFulfilling(req.id)
    try {
      const result = await fulfillStoreRequisition(req.id, user?.full_name || user?.username, user?.id)
      if (result.issued.length > 0) toast.success(`${result.issued.length} item(s) issued from stock`)
    } catch (err) { toast.error(err.message) }
    finally { setFulfilling(null) }
  }

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])

  const filtered = storeRequisitions.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      if (!(r.department?.toLowerCase().includes(t) || r.requester_name?.toLowerCase().includes(t) || (r.sr_number || r.req_number)?.toLowerCase().includes(t))) return false
    }
    return true
  })

  // KPIs
  const pending   = storeRequisitions.filter(r => r.status === 'submitted').length
  const approved  = storeRequisitions.filter(r => r.status === 'approved').length
  const fulfilled = storeRequisitions.filter(r => r.status === 'fulfilled').length
  const rejected  = storeRequisitions.filter(r => r.status === 'rejected').length

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'SR #': r.sr_number || r.req_number, Date: r.date, Department: r.department,
      Priority: r.priority, 'Requested By': r.requester_name,
      Items: parseItems(r.items).length, Status: r.status,
      'Approved By': r.approver_name || '—', 'Issued By': r.issued_by || '—',
      Notes: r.notes,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Store Requisitions')
    XLSX.writeFile(wb, `StoreRequisitions_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Store Requisitions</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}>
            <span className="material-icons">table_chart</span> Export
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate}>
              <span className="material-icons">add</span> New Requisition
            </button>
          )}
        </div>
      </div>

      {/* Approval workflow guide */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, overflowX: 'auto' }}>
        {[
          { step: '1', label: 'Request',   sub: 'Requester creates', icon: 'edit_note',    color: 'var(--blue)'  },
          { step: '2', label: 'HOD Review',sub: 'HOD approves/rejects', icon: 'approval', color: 'var(--yellow)'},
          { step: '3', label: 'Issue',     sub: 'Storekeeper fulfills', icon: 'inventory', color: 'var(--teal)' },
          { step: '4', label: 'Done',      sub: 'Items received', icon: 'check_circle',    color: 'var(--green)'},
        ].map((s, i, arr) => (
          <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 100 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: i === 0 ? '10px 0 0 10px' : i === arr.length-1 ? '0 10px 10px 0' : 0, borderLeft: i > 0 ? 'none' : undefined }}>
              <span className="material-icons" style={{ fontSize: 20, color: s.color }}>{s.icon}</span>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.3 }}>{s.sub}</div>
            </div>
            {i < arr.length - 1 && <span className="material-icons" style={{ fontSize: 18, color: 'var(--border2)', flexShrink: 0, marginLeft: -1 }}>chevron_right</span>}
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total</div><div className="kpi-val">{storeRequisitions.length}</div></div>
        <div className="kpi-card" onClick={() => setFilterStatus('submitted')} style={{ cursor: 'pointer', borderLeft: pending > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">Pending HOD</div>
          <div className="kpi-val" style={{ color: pending > 0 ? 'var(--yellow)' : 'var(--green)' }}>{pending}</div>
        </div>
        <div className="kpi-card" onClick={() => setFilterStatus('approved')} style={{ cursor: 'pointer', borderLeft: approved > 0 ? '3px solid var(--gold)' : undefined }}>
          <div className="kpi-label">Ready to Issue</div>
          <div className="kpi-val" style={{ color: approved > 0 ? 'var(--gold)' : 'var(--green)' }}>{approved}</div>
          <div className="kpi-sub">storekeeper action needed</div>
        </div>
        <div className="kpi-card"><div className="kpi-label">Fulfilled</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{fulfilled}</div></div>
        <div className="kpi-card"><div className="kpi-label">Rejected</div><div className="kpi-val" style={{ color: rejected > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{rejected}</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="Search department, requester, SR #…" style={{ maxWidth: 280 }}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          <select className="form-control" style={{ width: 180 }} value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(searchTerm || filterStatus !== 'all') && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearchTerm(''); setFilterStatus('all') }}>
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>SR #</th><th>Date</th><th>Department</th><th>Priority</th>
              <th>Requested By</th><th>Items</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan="8" className="empty-state">No requisitions found</td></tr>
            : filtered.map(r => {
              const items = parseItems(r.items)
              const sc    = STATUS_CONFIG[r.status] || { cls: 'badge-gold', label: r.status }
              const srNum = r.sr_number || r.req_number
              return (
                <tr key={r.id} onClick={() => setViewReq(r)} style={{ cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e  => e.currentTarget.style.background = ''}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{srNum || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontWeight: 600 }}>{r.department}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLORS[r.priority] || 'var(--text-dim)', textTransform: 'uppercase' }}>{r.priority}</span></td>
                  <td>{r.requester_name || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                  <td><span className={`badge ${sc.cls}`}><span className="material-icons" style={{ fontSize: 10, marginRight: 3 }}>{sc.icon}</span>{sc.label}</span></td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* HOD/Manager approves submitted requests */}
                    {canApprove && r.status === 'submitted' && (
                      <>
                        <button className="btn btn-primary btn-sm" title="Approve" onClick={() => handleApprove(r.id)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>check</span>
                        </button>
                        <button className="btn btn-danger btn-sm" title="Reject" onClick={() => setRejectModal({ open: true, id: r.id, reason: '' })}>
                          <span className="material-icons" style={{ fontSize: 14 }}>close</span>
                        </button>
                      </>
                    )}
                    {/* Storekeeper fulfills approved requests */}
                    {canEdit && r.status === 'approved' && (
                      <button className="btn btn-primary btn-sm" disabled={fulfilling === r.id}
                        title="Issue from stock" onClick={() => handleFulfill(r)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>inventory</span>
                        {fulfilling === r.id ? 'Issuing…' : 'Issue'}
                      </button>
                    )}
                    {/* Edit own draft */}
                    {canEdit && r.status === 'draft' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── View Modal ──────────────────────────────────────── */}
      {viewReq && (
        <div className="overlay" onClick={() => setViewReq(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 4 }}>
                  {viewReq.sr_number || viewReq.req_number || '—'} — <span>{viewReq.department}</span>
                </div>
                <span className={`badge ${STATUS_CONFIG[viewReq.status]?.cls || 'badge-gold'}`}>
                  {STATUS_CONFIG[viewReq.status]?.label || viewReq.status}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Date:</span> {viewReq.date}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Priority:</span> <span style={{ fontWeight: 700, color: PRIORITY_COLORS[viewReq.priority] }}>{viewReq.priority?.toUpperCase()}</span></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Requested By:</span> {viewReq.requester_name}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Department:</span> {viewReq.department}</div>
              {viewReq.approver_name && <div><span style={{ color: 'var(--text-dim)' }}>Approved By:</span> {viewReq.approver_name}</div>}
              {viewReq.approved_at && <div><span style={{ color: 'var(--text-dim)' }}>Approved At:</span> {new Date(viewReq.approved_at).toLocaleString()}</div>}
              {viewReq.issued_by && <div><span style={{ color: 'var(--text-dim)' }}>Issued By:</span> {viewReq.issued_by}</div>}
              {viewReq.issued_at && <div><span style={{ color: 'var(--text-dim)' }}>Issued At:</span> {new Date(viewReq.issued_at).toLocaleString()}</div>}
              {viewReq.rejection_reason && <div style={{ gridColumn: 'span 2', color: 'var(--red)', padding: '8px 12px', background: 'rgba(248,113,113,.08)', borderRadius: 6 }}>
                <strong>Rejection reason:</strong> {viewReq.rejection_reason}
              </div>}
              {viewReq.notes && <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>Notes: {viewReq.notes}</div>}
            </div>

            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Stock Available</th><th>Notes</th></tr></thead>
                <tbody>
                  {parseItems(viewReq.items).map((it, i) => {
                    const invItem = inventoryItems.find(inv => inv.name.toLowerCase() === it.name.toLowerCase())
                    const sufficient = invItem ? invItem.balance >= it.qty : null
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td>{it.category}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{it.qty}</td>
                        <td>{it.unit || 'pcs'}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: sufficient === null ? 'var(--text-dim)' : sufficient ? 'var(--green)' : 'var(--red)' }}>
                          {invItem ? `${invItem.balance} ${invItem.unit || 'pcs'}` : '—'}
                          {invItem && !sufficient && <span style={{ fontSize: 9, marginLeft: 4 }}>⚠ short</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{it.notes || '—'}</td>
                      </tr>
                    )
                  })}
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
              {canEdit && viewReq.status === 'approved' && (
                <button className="btn btn-primary" disabled={fulfilling === viewReq.id}
                  onClick={() => { handleFulfill(viewReq); setViewReq(null) }}>
                  <span className="material-icons">inventory</span> Issue Stock Now
                </button>
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

      {/* ── Create / Edit Modal ──────────────────────────────── */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'New'} Store <span>Requisition</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-control" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>

              <div className="form-group">
                <label>Department *</label>
                <select className="form-control" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                  <option value="">— Select Department —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>Priority</label>
                <select className="form-control" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>
                Requested By
                {isSuperAdmin && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>(Super Admin: can request on behalf of any employee)</span>}
              </label>
              {isSuperAdmin ? (
                <select className="form-control" value={form.requester_id} onChange={e => selectRequester(e.target.value)}>
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              ) : (
                <input className="form-control" value={form.requester_name} readOnly
                  style={{ background: 'var(--surface2)', color: 'var(--text-dim)', cursor: 'not-allowed' }} />
              )}
            </div>

            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              Items Requested
            </div>

            {/* Items — stacked card per item, select from inventory */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {form.items.map((it, i) => {
                const invItem = inventoryItems.find(inv => inv.id === it.item_id)
                return (
                  <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>ITEM {i + 1}</span>
                      {form.items.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                    </div>

                    {/* Select from inventory */}
                    <div className="form-group" style={{ marginBottom: 10 }}>
                      <label>Select from Inventory *</label>
                      <select className="form-control" value={it.item_id}
                        onChange={e => selectInventoryItem(i, e.target.value)}>
                        <option value="">— Select item from store —</option>
                        {inventoryItems.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.item_code ? `[${inv.item_code}] ` : ''}{inv.name} — {inv.balance} {inv.unit || 'pcs'} available
                          </option>
                        ))}
                      </select>
                    </div>

                    {invItem && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, padding: '6px 10px', background: 'rgba(45,212,191,.06)', borderRadius: 6, border: '1px solid rgba(45,212,191,.15)' }}>
                        <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', color: 'var(--teal)', marginRight: 4 }}>inventory_2</span>
                        Category: <strong>{invItem.category}</strong> ·
                        Unit: <strong>{invItem.unit || 'pcs'}</strong> ·
                        In Stock: <strong style={{ color: invItem.balance > 0 ? 'var(--green)' : 'var(--red)' }}>{invItem.balance}</strong>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10 }}>
                      <div className="form-group">
                        <label>Quantity *</label>
                        <input type="number" min="1" className="form-control" value={it.qty}
                          onChange={e => setItem(i, 'qty', parseInt(e.target.value) || 1)}
                          style={{ border: invItem && parseInt(it.qty) > invItem.balance ? '1.5px solid var(--yellow)' : '' }} />
                        {invItem && parseInt(it.qty) > invItem.balance && (
                          <small style={{ fontSize: 10, color: 'var(--yellow)' }}>⚠ Exceeds stock — PR will be auto-created for {parseInt(it.qty) - invItem.balance} {invItem.unit}</small>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Unit</label>
                        <input className="form-control" value={it.unit} readOnly style={{ background: 'var(--surface)', color: 'var(--text-dim)' }} />
                      </div>
                      <div className="form-group">
                        <label>Notes / Specification</label>
                        <input className="form-control" placeholder="Purpose, project code, etc." value={it.notes}
                          onChange={e => setItem(i, 'notes', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginBottom: 16 }}>
              <span className="material-icons">add</span> Add Item
            </button>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Notes / Justification</label>
              <textarea className="form-control" rows="2" placeholder="Reason for request, project reference…"
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              {!editing && (
                <button type="button" className="btn btn-secondary" onClick={() => handleSubmit('draft')}>
                  <span className="material-icons">save</span> Save Draft
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => handleSubmit(editing ? editing.status : 'submitted')}>
                <span className="material-icons">send</span>
                {editing ? 'Save Changes' : 'Submit for Approval'}
              </button>
            </div>
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
              <textarea className="form-control" rows="3" autoFocus
                placeholder="Explain why this is being rejected…"
                value={rejectModal.reason}
                onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })} />
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
