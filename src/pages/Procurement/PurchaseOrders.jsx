// src/pages/Procurement/PurchaseOrders.jsx
//
// FIXES:
// 1. Fields too small — grid columns were crammed. Now uses stacked rows per item.
// 2. "Receive" button did nothing — now navigates to GRN page with PO pre-filled
//    (uses sessionStorage to pass PO data to GoodsReceived).
// 3. Added: view PO modal, status badges, total calculation, search, Excel export.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function PurchaseOrders() {
  const { purchaseOrders, suppliers, createPurchaseOrder, updatePurchaseOrderStatus, loading } = useProcurement()
  const { user }    = useAuth()
  const canEdit     = useCanEdit('procurement', 'purchase-orders')
  const navigate    = useNavigate()

  const [modalOpen,  setModalOpen]  = useState(false)
  const [viewPO,     setViewPO]     = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const emptyForm = () => ({
    supplier_id:   '',
    supplier_name: '',
    order_date:    today,
    delivery_date: '',
    items: [{ name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0 }],
    notes: '',
  })
  const [form, setForm] = useState(emptyForm())

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const setItem    = (idx, field, val) => {
    const items = [...form.items]
    items[idx]  = { ...items[idx], [field]: val }
    setForm({ ...form, items })
  }

  const totalAmount = form.items.reduce((s, it) => s + ((it.ordered_qty || 0) * (it.unit_cost || 0)), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (form.items.some(it => !it.name || !it.ordered_qty)) return toast.error('Every item needs a name and quantity')
    const supplier = suppliers.find(s => s.id === form.supplier_id)
    try {
      await createPurchaseOrder({
        supplier_id:   form.supplier_id,
        supplier_name: supplier?.name || '',
        order_date:    form.order_date,
        delivery_date: form.delivery_date,
        items:         form.items,
        total_amount:  totalAmount,
        notes:         form.notes,
        created_by_id: user?.id,
        created_by_name: user?.full_name || user?.username,
        status: 'draft',
      })
      toast.success('Purchase order created')
      setModalOpen(false)
      setForm(emptyForm())
    } catch (err) { toast.error(err.message) }
  }

  // Navigate to GRN page with PO data pre-loaded via sessionStorage
  const handleReceive = (po) => {
    sessionStorage.setItem('grn_from_po', JSON.stringify({
      po_id:         po.id,
      po_number:     po.po_number,
      supplier_name: po.supplier_name,
      items:         typeof po.items === 'string' ? JSON.parse(po.items || '[]') : (po.items || []),
    }))
    navigate('/module/procurement/goods-received')
    toast.success(`Opening GRN for ${po.po_number}`)
  }

  const filtered = purchaseOrders.filter(po => {
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return po.po_number?.toLowerCase().includes(t) || po.supplier_name?.toLowerCase().includes(t)
  })

  // KPIs
  const totalPOs  = purchaseOrders.length
  const draftPOs  = purchaseOrders.filter(p => p.status === 'draft').length
  const totalVal  = purchaseOrders.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0)

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(po => ({
      'PO #': po.po_number, Supplier: po.supplier_name,
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
        <div className="kpi-card"><div className="kpi-label">Total Value</div><div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 20 }}>${totalVal.toFixed(0)}</div></div>
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
              <tr><th>PO #</th><th>Supplier</th><th>Order Date</th><th>Delivery Date</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan="8" className="empty-state">No purchase orders</td></tr>
              : filtered.map(po => {
                const items = parseItems(po.items)
                return (
                  <tr key={po.id} onClick={() => setViewPO(po)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e  => e.currentTarget.style.background = ''}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{po.po_number}</td>
                    <td style={{ fontWeight: 600 }}>{po.supplier_name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{po.order_date}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{po.delivery_date || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>${parseFloat(po.total_amount || 0).toFixed(2)}</td>
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

      {/* View PO modal */}
      {viewPO && (
        <div className="overlay" onClick={() => setViewPO(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewPO.po_number} — <span>{viewPO.supplier_name}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Order Date:</span> {viewPO.order_date}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Delivery Date:</span> {viewPO.delivery_date || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> {statusBadge(viewPO.status)}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Total:</span> <strong style={{ color: 'var(--teal)' }}>${parseFloat(viewPO.total_amount || 0).toFixed(2)}</strong></div>
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
                      <td style={{ fontFamily: 'var(--mono)' }}>${(it.unit_cost || 0).toFixed(2)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${((it.ordered_qty || 0) * (it.unit_cost || 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              {canEdit && viewPO.status !== 'completed' && (
                <button className="btn btn-primary" onClick={() => { handleReceive(viewPO); setViewPO(null) }}>
                  <span className="material-icons">move_to_inbox</span> Create GRN
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewPO(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create <span>Purchase Order</span></div>
            <form onSubmit={handleSubmit}>
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
              <div className="form-group">
                <label>Expected Delivery Date</label>
                <input type="date" className="form-control" value={form.delivery_date}
                  onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '16px 0 12px' }}>
                Items to Order
              </div>

              {/* ✅ FIX: Stacked layout per item — no tiny columns */}
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
                        <label>Unit Cost ($)</label>
                        <input type="number" min="0" step="0.01" className="form-control"
                          value={it.unit_cost} onChange={e => setItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="form-group">
                        <label>Line Total</label>
                        <div className="form-control" style={{ background: 'var(--surface)', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                          ${((it.ordered_qty || 0) * (it.unit_cost || 0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
                  <span className="material-icons">add</span> Add Item
                </button>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--teal)' }}>
                  Total: ${totalAmount.toFixed(2)}
                </div>
              </div>

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
