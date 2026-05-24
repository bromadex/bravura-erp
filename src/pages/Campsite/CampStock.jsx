// src/pages/Campsite/CampStock.jsx — Camp & site stock levels
import { useState, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'

const TODAY = new Date().toISOString().split('T')[0]
const CATS  = ['Food', 'PPE', 'Consumables', 'General']

export default function CampStock() {
  const { items, transactions, headcounts, addItem, updateItem, deleteItem, stockIn, stockOut, loading } = useLogistics()
  const { user }  = useAuth()
  const canEdit   = useCanEdit('campsite', 'camp-stock')

  const [filterCat,   setFilterCat]   = useState('ALL')
  const [searchTerm,  setSearchTerm]  = useState('')
  const [siModal,     setSiModal]     = useState(false)
  const [soModal,     setSoModal]     = useState(false)
  const [itemModal,   setItemModal]   = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const [siForm, setSiForm] = useState({ item_id: '', qty: 1, date: TODAY, supplier: '', reference: '', unit_cost: 0, notes: '' })
  const [soForm, setSoForm] = useState({ item_id: '', qty: 1, date: TODAY, issued_to: '', authorized_by: '', notes: '' })
  const [itemForm, setItemForm] = useState({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' })

  // ── Store Requisition (Request from Store / Procurement) ─────────────────────
  const [srModal,  setSrModal]  = useState(false)
  const [srItem,   setSrItem]   = useState(null)      // the camp item triggering the request
  const [srSaving, setSrSaving] = useState(false)
  const [srForm,   setSrForm]   = useState({
    qty_required: '',
    required_date: '',
    notes: '',
  })

  const todayHC = headcounts.find(h => h.date === TODAY)?.count || 0

  const last30Str = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()
  const getUsed30d = (itemId) =>
    transactions.filter(t => t.item_id === itemId && t.type === 'OUT' && t.date >= last30Str)
      .reduce((s, t) => s + (t.qty || 0), 0)

  const filteredItems = useMemo(() => items.filter(i => {
    if (i.category === 'Batch Plant') return false
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  }), [items, filterCat, searchTerm])

  const byName = user?.full_name || user?.username || ''

  const handleStockIn = async (e) => {
    e.preventDefault()
    if (!siForm.item_id || siForm.qty <= 0) return toast.error('Select item and quantity')
    try {
      await stockIn(siForm.item_id, siForm.qty, siForm.date, siForm.supplier, siForm.reference, siForm.notes, siForm.unit_cost, byName)
      toast.success('Stocked in')
      setSiModal(false)
      setSiForm({ item_id: '', qty: 1, date: TODAY, supplier: '', reference: '', unit_cost: 0, notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleStockOut = async (e) => {
    e.preventDefault()
    if (!soForm.item_id || soForm.qty <= 0) return toast.error('Select item and quantity')
    try {
      await stockOut(soForm.item_id, soForm.qty, soForm.date, soForm.issued_to, soForm.authorized_by, soForm.notes, null, null, byName)
      toast.success('Issued')
      setSoModal(false)
      setSoForm({ item_id: '', qty: 1, date: TODAY, issued_to: '', authorized_by: '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const handleSaveItem = async (e) => {
    e.preventDefault()
    try {
      if (editingItem) { await updateItem(editingItem.id, itemForm); toast.success('Updated') }
      else             { await addItem(itemForm);                     toast.success('Added')   }
      setItemModal(false); setEditingItem(null)
    } catch (err) { toast.error(err.message) }
  }

  // ── Open SR modal pre-filled with a camp item ────────────────────────────────
  const openSrModal = (item) => {
    setSrItem(item)
    setSrForm({
      qty_required: Math.max((item.reorder_level || 0) - (item.balance || 0), 1),
      required_date: '',
      notes: `Camp stock replenishment for: ${item.name}. Current balance: ${item.balance} ${item.unit}. Reorder level: ${item.reorder_level} ${item.unit}.`,
    })
    setSrModal(true)
  }

  const handleStoreRequisition = async (e) => {
    e.preventDefault()
    if (!srItem || !srForm.qty_required || Number(srForm.qty_required) <= 0) {
      return toast.error('Enter required quantity')
    }
    setSrSaving(true)
    try {
      const srNumber = await generateTxnCode('SR')
      const id = crypto.randomUUID()
      const itemsPayload = [{
        item_id:       null,   // camp item — no main inventory id
        name:          srItem.name,
        category:      srItem.category || 'General',
        qty:           Number(srForm.qty_required),
        unit:          srItem.unit || 'pcs',
        notes:         `Camp stock replenishment request`,
        is_returnable: false,
      }]
      const { error } = await supabase.from('store_requisitions').insert([{
        id,
        req_number:     srNumber,
        sr_number:      srNumber,
        docstatus:      0,           // Draft
        status:         'draft',
        date:           TODAY,
        department:     'Campsite',
        priority:       'normal',
        requester_name: byName || 'Camp Manager',
        items:          itemsPayload,
        required_date:  srForm.required_date || null,
        notes:          srForm.notes || null,
        created_by:     byName || '',
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      }])
      if (error) throw error
      toast.success(`Store requisition ${srNumber} created as Draft — go to Procurement → Store Requisitions to submit.`)
      setSrModal(false)
      setSrItem(null)
    } catch (err) {
      toast.error(err.message || 'Failed to create store requisition')
    } finally {
      setSrSaving(false)
    }
  }

  const handleExport = () => {
    exportXLSX(filteredItems.map(i => ({
      Name: i.name, Category: i.category, Unit: i.unit,
      Balance: i.balance, 'Reorder Level': i.reorder_level, 'Used 30d': getUsed30d(i.id),
    })), `CampStock_${TODAY}`, 'Camp Stock')
    toast.success('Exported')
  }

  const badge = (isOut, isLow) => {
    if (isOut)  return { label: 'Out',  bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.3)',   color: 'var(--red)'    }
    if (isLow)  return { label: 'Low',  bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  color: 'var(--yellow)' }
    return              { label: 'OK',   bg: 'rgba(52,211,153,.1)', border: 'rgba(52,211,153,.3)', color: 'var(--green)'  }
  }

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Stock Levels</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Camp &amp; site supplies inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleExport}>
            <span className="material-icons" style={{ fontSize: 16 }}>table_chart</span> Export
          </button>
          {canEdit && <>
            <button className="btn btn-secondary" onClick={() => { setEditingItem(null); setItemForm({ name: '', category: 'General', unit: 'pcs', reorder_level: 0, unit_cost: 0, notes: '' }); setItemModal(true) }}>
              <span className="material-icons" style={{ fontSize: 16 }}>add</span> Item
            </button>
            <button className="btn btn-secondary" onClick={() => setSiModal(true)}>
              <span className="material-icons" style={{ fontSize: 16 }}>add_circle</span> Stock In
            </button>
            <button className="btn btn-primary" onClick={() => setSoModal(true)}>
              <span className="material-icons" style={{ fontSize: 16 }}>remove_circle</span> Issue
            </button>
          </>}
        </div>
      </div>

      {/* Headcount strip */}
      <div style={{ padding: '10px 16px', borderRadius: 10, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="material-icons" style={{ fontSize: 20, color: 'var(--teal)' }}>people</span>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>HEADCOUNT TODAY</div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: todayHC > 0 ? 'var(--teal)' : 'var(--text-dim)' }}>
          {todayHC > 0 ? todayHC : '—'}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-control" placeholder="Search items…" style={{ maxWidth: 200 }}
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {['ALL', ...CATS].map(c => (
          <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setFilterCat(c)}>{c === 'ALL' ? 'All' : c}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Balance</th>
                <th>Reorder</th>
                <th>Status</th>
                <th>Used 30d</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No items found</td></tr>
              ) : filteredItems.map(i => {
                const isLow = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
                const isOut = i.balance <= 0
                const b     = badge(isOut, isLow)
                const used  = getUsed30d(i.id)
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i.category}</td>
                    <td className="td-mono" style={{ color: b.color }}>{i.balance} {i.unit}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i.reorder_level || '—'}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>{b.label}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{used > 0 ? used : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {/* Request from Store — shown for low/out items */}
                        {(isLow || isOut) && (
                          <button
                            className="btn btn-sm"
                            title="Request from Store (raise Store Requisition)"
                            onClick={() => openSrModal(i)}
                            style={{
                              background: 'rgba(10,132,255,.12)', color: 'var(--blue)',
                              border: '1px solid rgba(10,132,255,.3)', fontSize: 11, padding: '3px 8px',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span className="material-icons" style={{ fontSize: 13 }}>shopping_cart</span>
                            Request
                          </button>
                        )}
                        {canEdit && <>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => { setEditingItem(i); setItemForm({ name: i.name, category: i.category, unit: i.unit, reorder_level: i.reorder_level, unit_cost: i.unit_cost, notes: i.notes || '' }); setItemModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-danger btn-sm"
                            onClick={async () => { if (!window.confirm(`Delete "${i.name}"?`)) return; await deleteItem(i.id); toast.success('Deleted') }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Item modal ── */}
      <ModalDialog open={itemModal} onClose={() => { setItemModal(false); setEditingItem(null) }} title={`${editingItem ? 'Edit' : 'Add'} Item`}>
        <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input required className="form-control" value={itemForm.name}
              onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={itemForm.category}
                onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <input className="form-control" placeholder="kg, L, pcs…" value={itemForm.unit}
                onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Reorder Level</label>
              <input type="number" min="0" className="form-control" value={itemForm.reorder_level}
                onChange={e => setItemForm(f => ({ ...f, reorder_level: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit Cost ($)</label>
              <input type="number" min="0" step="0.01" className="form-control" value={itemForm.unit_cost}
                onChange={e => setItemForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => { setItemModal(false); setEditingItem(null) }}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ── Stock In modal ── */}
      <ModalDialog open={siModal} onClose={() => setSiModal(false)} title="Stock In">
        <form onSubmit={handleStockIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select required className="form-control" value={siForm.item_id}
              onChange={e => setSiForm(f => ({ ...f, item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {items.filter(i => i.category !== 'Batch Plant').map(i => (
                <option key={i.id} value={i.id}>{i.name} — {i.balance} {i.unit}</option>
              ))}
            </select>
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input type="number" min="0.01" step="0.01" required className="form-control"
                value={siForm.qty} onChange={e => setSiForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-control" value={siForm.date}
                onChange={e => setSiForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Supplier</label>
              <input className="form-control" value={siForm.supplier}
                onChange={e => setSiForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Unit Cost ($)</label>
              <input type="number" min="0" step="0.01" className="form-control" value={siForm.unit_cost}
                onChange={e => setSiForm(f => ({ ...f, unit_cost: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setSiModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Stock In</button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ── Store Requisition modal ── */}
      <ModalDialog
        open={srModal}
        onClose={() => { setSrModal(false); setSrItem(null) }}
        title="Request from Store"
      >
        {srItem && (
          <form onSubmit={handleStoreRequisition} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Item info strip */}
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{srItem.name}</div>
              <div style={{ display: 'flex', gap: 16, color: 'var(--text-dim)', fontSize: 12 }}>
                <span>Category: <strong style={{ color: 'var(--text)' }}>{srItem.category}</strong></span>
                <span>Balance: <strong style={{ color: srItem.balance <= 0 ? 'var(--red)' : 'var(--yellow)', fontFamily: 'var(--mono)' }}>{srItem.balance} {srItem.unit}</strong></span>
                <span>Reorder: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{srItem.reorder_level} {srItem.unit}</strong></span>
              </div>
            </div>

            {/* Callout */}
            <div style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 12,
              background: 'rgba(10,132,255,.08)', border: '1px solid rgba(10,132,255,.25)',
              color: 'var(--blue)', display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <span className="material-icons" style={{ fontSize: 15, marginTop: 1 }}>info</span>
              <span>A Store Requisition (SR) will be created as a <strong>Draft</strong> in Procurement. Submit it there for HOD approval to trigger a purchase.</span>
            </div>

            <div style={grid2}>
              <div className="form-group">
                <label className="form-label">Qty Required *</label>
                <input
                  type="number" min="0.01" step="0.01" required
                  className="form-control"
                  value={srForm.qty_required}
                  onChange={e => setSrForm(f => ({ ...f, qty_required: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Required By Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={srForm.required_date}
                  onChange={e => setSrForm(f => ({ ...f, required_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-control"
                rows={3}
                value={srForm.notes}
                onChange={e => setSrForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional details for the store manager…"
              />
            </div>

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setSrModal(false); setSrItem(null) }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={srSaving}>
                <span className="material-icons" style={{ fontSize: 15, marginRight: 4 }}>shopping_cart</span>
                {srSaving ? 'Creating…' : 'Create Store Requisition'}
              </button>
            </ModalActions>
          </form>
        )}
      </ModalDialog>

      {/* ── Issue Out modal ── */}
      <ModalDialog open={soModal} onClose={() => setSoModal(false)} title="Issue Out">
        <form onSubmit={handleStockOut} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Item *</label>
            <select required className="form-control" value={soForm.item_id}
              onChange={e => setSoForm(f => ({ ...f, item_id: e.target.value }))}>
              <option value="">Select item…</option>
              {items.filter(i => i.category !== 'Batch Plant' && i.balance > 0).map(i => (
                <option key={i.id} value={i.id}>{i.name} — {i.balance} {i.unit}</option>
              ))}
            </select>
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input type="number" min="0.01" step="0.01" required className="form-control"
                value={soForm.qty} onChange={e => setSoForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-control" value={soForm.date}
                onChange={e => setSoForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div style={grid2}>
            <div className="form-group">
              <label className="form-label">Issued To</label>
              <input className="form-control" value={soForm.issued_to}
                onChange={e => setSoForm(f => ({ ...f, issued_to: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Authorized By</label>
              <input className="form-control" value={soForm.authorized_by}
                onChange={e => setSoForm(f => ({ ...f, authorized_by: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setSoModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger">Issue</button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
