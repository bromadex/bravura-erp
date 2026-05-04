// src/pages/Procurement/GoodsReceived.jsx
//
// The GRN already writes to inventory (createGoodsReceived in ProcurementContext
// upserts items and records transactions). This version improves:
// 1. Clear confirmation after saving: shows which items were stocked in and at what qty
// 2. Partial receipt highlighting: yellow when received < ordered
// 3. Over-receipt warning: yellow when received > ordered
// 4. GRN status badge on list
// 5. Better view modal layout
// 6. Stock impact summary on the new GRN form (live total value, items count)

import { useState, useEffect } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function GoodsReceived() {
  const { goodsReceived, purchaseOrders, createGoodsReceived, loading } = useProcurement()
  const { user }   = useAuth()
  const canEdit    = useCanEdit('procurement', 'goods-received')

  const [modalOpen, setModalOpen]   = useState(false)
  const [viewGRN,   setViewGRN]     = useState(null)
  const [saving,    setSaving]      = useState(false)
  const [stockedIn, setStockedIn]   = useState(null)   // confirmation summary
  const [searchTerm, setSearchTerm] = useState('')

  const emptyForm = () => ({
    date: new Date().toISOString().split('T')[0],
    po_id: '',
    supplier_name: '',
    driver: '',
    vehicle: '',
    received_by: user?.full_name || user?.username || '',
    items: [{ name: '', category: '', unit: 'pcs', ordered: 0, received: 0, unit_cost: 0, lot_batch: '', notes: '' }],
    notes: '',
  })

  const [form, setForm] = useState(emptyForm)

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', unit: 'pcs', ordered: 0, received: 0, unit_cost: 0, lot_batch: '', notes: '' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setItem    = (i, field, val) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [field]: val }; return { ...f, items } })

  const totalValue   = form.items.reduce((s, it) => s + ((it.received || 0) * (it.unit_cost || 0)), 0)
  const itemsWithQty = form.items.filter(it => it.name && it.received > 0)

  const handlePOSelect = (poId) => {
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) { setForm(f => ({ ...f, po_id: '' })); return }
    const poItems = typeof po.items === 'string' ? JSON.parse(po.items || '[]') : (po.items || [])
    setForm(f => ({
      ...f,
      po_id: poId,
      supplier_name: po.supplier_name || '',
      items: poItems.map(it => ({
        name: it.name || '', category: it.category || '',
        unit: it.unit || 'pcs', ordered: it.ordered_qty || 0,
        received: it.ordered_qty || 0, unit_cost: it.unit_cost || 0,
        lot_batch: '', notes: '',
      })),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date) return toast.error('Enter a date')
    if (form.items.some(it => !it.name)) return toast.error('All items need a name')
    if (itemsWithQty.length === 0) return toast.error('At least one item must have received qty > 0')

    setSaving(true)
    try {
      await createGoodsReceived({
        ...form,
        items: itemsWithQty,
        total_value: totalValue,
        created_by: user?.full_name || user?.username,
      })

      // Show stock-in confirmation
      setStockedIn({
        items: itemsWithQty,
        totalValue,
        supplier: form.supplier_name,
        date: form.date,
      })
      setForm(emptyForm())
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const filtered = goodsReceived.filter(grn => {
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return grn.supplier_name?.toLowerCase().includes(t) || grn.grn_number?.toLowerCase().includes(t) || grn.received_by?.toLowerCase().includes(t)
  })

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])

  // Determine GRN status for display
  const grnStatus = (grn) => {
    const items = parseItems(grn.items)
    const anyShort = items.some(it => it.received < it.ordered && it.ordered > 0)
    if (anyShort) return { label: 'Partial', cls: 'badge-yellow' }
    return { label: 'Complete', cls: 'badge-green' }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Goods Received</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setModalOpen(true) }}>
            <span className="material-icons">add</span> New GRN
          </button>
        )}
      </div>

      {/* ── Stock-in confirmation banner ──────────────────────── */}
      {stockedIn && (
        <div style={{ padding: 16, borderRadius: 12, marginBottom: 20, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}>
                <span className="material-icons" style={{ color: 'var(--green)' }}>check_circle</span>
                GRN saved — {stockedIn.items.length} item{stockedIn.items.length !== 1 ? 's' : ''} added to Inventory
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {stockedIn.items.map((it, i) => (
                  <div key={i} style={{ background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: '4px 10px', fontSize: 12 }}>
                    <strong>+{it.received}</strong> {it.unit} {it.name}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                Total value received: <strong style={{ color: 'var(--teal)' }}>${stockedIn.totalValue.toFixed(2)}</strong>
                {' · '}Supplier: {stockedIn.supplier || '—'}
                {' · '}Date: {stockedIn.date}
              </div>
            </div>
            <button onClick={() => setStockedIn(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
              <span className="material-icons" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <input className="form-control" placeholder="Search by supplier, GRN number, or received by…" value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total GRNs</div>
          <div className="kpi-val">{goodsReceived.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">This Month</div>
          <div className="kpi-val">
            {goodsReceived.filter(g => g.date?.startsWith(new Date().toISOString().slice(0, 7))).length}
          </div>
          <div className="kpi-sub">GRNs received</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Value</div>
          <div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 20 }}>
            ${goodsReceived.reduce((s, g) => s + (parseItems(g.items).reduce((ss, it) => ss + (it.received || 0) * (it.unit_cost || 0), 0)), 0).toFixed(0)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>GRN #</th><th>Date</th><th>Supplier</th><th>Items</th>
              <th>Total Value</th><th>Received By</th><th>Status</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="8" className="empty-state">No GRNs found</td></tr>
            ) : filtered.map(grn => {
              const items = parseItems(grn.items)
              const total = items.reduce((s, it) => s + ((it.received || 0) * (it.unit_cost || 0)), 0)
              const status = grnStatus(grn)
              return (
                <tr key={grn.id} style={{ cursor: 'pointer' }} onClick={() => setViewGRN(grn)}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{grn.grn_number}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{grn.date}</td>
                  <td style={{ fontWeight: 600 }}>{grn.supplier_name || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>${total.toFixed(2)}</td>
                  <td>{grn.received_by || '—'}</td>
                  <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{grn.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* New GRN modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>move_to_inbox</span>
              New Goods Received <span>Note</span>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>DATE *</label>
                  <input type="date" className="form-control" required value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>LINK TO PURCHASE ORDER (optional)</label>
                  <select className="form-control" value={form.po_id}
                    onChange={e => handlePOSelect(e.target.value)}>
                    <option value="">— None (direct delivery) —</option>
                    {purchaseOrders.filter(po => po.status !== 'completed').map(po => (
                      <option key={po.id} value={po.id}>{po.po_number} — {po.supplier_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>SUPPLIER</label>
                  <input className="form-control" value={form.supplier_name}
                    onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>DRIVER / VEHICLE</label>
                  <input className="form-control" placeholder="Driver name / vehicle reg" value={form.driver}
                    onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>RECEIVED BY</label>
                <select className="form-control" value={form.received_by}
                  onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))}>
                  <option value="">— Select employee —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name} ({emp.employee_number})</option>)}
                </select>
              </div>

              <div style={{ margin: '16px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)' }}>ITEMS RECEIVED</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {itemsWithQty.length} item{itemsWithQty.length !== 1 ? 's' : ''} · Value: <strong style={{ color: 'var(--teal)' }}>${totalValue.toFixed(2)}</strong>
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.8fr 0.8fr 0.9fr 1fr auto', gap: 6, minWidth: 700, marginBottom: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  <span>ITEM NAME</span><span>CATEGORY</span><span>UNIT</span>
                  <span>ORDERED</span><span>RECEIVED</span><span>UNIT COST ($)</span>
                  <span>LOT/BATCH #</span><span></span>
                </div>
                {form.items.map((it, i) => {
                  const isShort   = it.ordered > 0 && it.received < it.ordered
                  const isOver    = it.ordered > 0 && it.received > it.ordered
                  const borderCol = isShort ? 'var(--yellow)' : isOver ? 'var(--red)' : ''
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.8fr 0.8fr 0.9fr 1fr auto', gap: 6, marginBottom: 6, minWidth: 700 }}>
                      <input className="form-control" placeholder="Item name" value={it.name}
                        onChange={e => setItem(i, 'name', e.target.value)} />
                      <input className="form-control" placeholder="Category" value={it.category}
                        onChange={e => setItem(i, 'category', e.target.value)} />
                      <input className="form-control" placeholder="pcs" value={it.unit}
                        onChange={e => setItem(i, 'unit', e.target.value)} />
                      <input type="number" className="form-control" min="0" value={it.ordered}
                        onChange={e => setItem(i, 'ordered', parseInt(e.target.value) || 0)} />
                      <input type="number" className="form-control" min="0" value={it.received}
                        onChange={e => setItem(i, 'received', parseInt(e.target.value) || 0)}
                        style={{ border: borderCol ? `1.5px solid ${borderCol}` : '' }}
                        title={isShort ? 'Short delivery' : isOver ? 'Over-delivered' : ''} />
                      <input type="number" className="form-control" min="0" step="0.01" placeholder="0.00"
                        value={it.unit_cost} onChange={e => setItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} />
                      <input className="form-control" placeholder="Lot/Batch #" value={it.lot_batch}
                        onChange={e => setItem(i, 'lot_batch', e.target.value)} />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>
                        <span className="material-icons">close</span>
                      </button>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
                  <span className="material-icons">add</span> Add Item
                </button>
                {form.items.some(it => it.ordered > 0 && it.received < it.ordered) && (
                  <div style={{ fontSize: 11, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>warning</span>
                    Some items received less than ordered — partial delivery will be recorded
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>NOTES</label>
                <textarea className="form-control" rows="2" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{ background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', color: 'var(--green)', marginRight: 6 }}>inventory</span>
                Saving this GRN will <strong>automatically update Inventory</strong> — items will be added to or created in the stock list. No separate Stock In entry is needed.
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || itemsWithQty.length === 0}>
                  <span className="material-icons">move_to_inbox</span>
                  {saving ? 'Saving…' : `Save GRN & Stock In ${itemsWithQty.length} Item${itemsWithQty.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View GRN modal */}
      {viewGRN && (
        <div className="overlay" onClick={() => setViewGRN(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 4 }}>{viewGRN.grn_number}</div>
                <span className={`badge ${grnStatus(viewGRN).cls}`}>{grnStatus(viewGRN).label}</span>
              </div>
              <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
                <span className="material-icons" style={{ fontSize: 14 }}>print</span> Print
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Date:</span> <strong>{viewGRN.date}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Supplier:</span> <strong>{viewGRN.supplier_name || '—'}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Driver / Vehicle:</span> {viewGRN.driver || '—'}{viewGRN.vehicle ? ` / ${viewGRN.vehicle}` : ''}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Received By:</span> {viewGRN.received_by || '—'}</div>
              {viewGRN.notes && <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>{viewGRN.notes}</div>}
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Item</th><th>Category</th><th>Unit</th><th>Ordered</th><th>Received</th><th>Unit Cost</th><th>Total</th><th>Lot/Batch</th></tr>
                </thead>
                <tbody>
                  {parseItems(viewGRN.items).map((it, i) => {
                    const isShort = it.ordered > 0 && it.received < it.ordered
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td>{it.category}</td>
                        <td>{it.unit || 'pcs'}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.ordered || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                          <span style={{ color: isShort ? 'var(--yellow)' : 'var(--green)' }}>{it.received}</span>
                          {isShort && <span style={{ fontSize: 10, color: 'var(--yellow)', marginLeft: 4 }}>short</span>}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)' }}>${(it.unit_cost || 0).toFixed(2)}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${((it.received || 0) * (it.unit_cost || 0)).toFixed(2)}</td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{it.lot_batch || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setViewGRN(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
