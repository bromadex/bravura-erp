// src/pages/Campsite/CampStock.jsx — Camp & site stock levels
import { useState, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

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

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filteredItems.map(i => ({
      Name: i.name, Category: i.category, Unit: i.unit,
      Balance: i.balance, 'Reorder Level': i.reorder_level, 'Used 30d': getUsed30d(i.id),
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Camp Stock')
    XLSX.writeFile(wb, `CampStock_${TODAY}.xlsx`)
    toast.success('Exported')
  }

  const badge = (isOut, isLow) => {
    if (isOut)  return { label: 'Out',  bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.3)',   color: 'var(--red)'    }
    if (isLow)  return { label: 'Low',  bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  color: 'var(--yellow)' }
    return              { label: 'OK',   bg: 'rgba(52,211,153,.1)', border: 'rgba(52,211,153,.3)', color: 'var(--green)'  }
  }

  const modalWrap  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500 }
  const modalBox   = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 460, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }
  const modalHead  = { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }
  const modalBody  = { padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }
  const grid2      = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
  const modalFoot  = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Stock Levels</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Camp &amp; site supplies inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportXLSX}>
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
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={canEdit ? 7 : 6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No items found</td></tr>
              ) : filteredItems.map(i => {
                const isLow = i.balance <= (i.reorder_level || 0) && i.reorder_level > 0
                const isOut = i.balance <= 0
                const b     = badge(isOut, isLow)
                const used  = getUsed30d(i.id)
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i.category}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: b.color }}>{i.balance} {i.unit}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i.reorder_level || '—'}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 20, background: b.bg, border: `1px solid ${b.border}`, color: b.color, fontSize: 11, fontWeight: 700 }}>{b.label}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{used > 0 ? used : '—'}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => { setEditingItem(i); setItemForm({ name: i.name, category: i.category, unit: i.unit, reorder_level: i.reorder_level, unit_cost: i.unit_cost, notes: i.notes || '' }); setItemModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button className="btn btn-danger btn-sm"
                            onClick={async () => { if (!window.confirm(`Delete "${i.name}"?`)) return; await deleteItem(i.id); toast.success('Deleted') }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Item modal ── */}
      {itemModal && (
        <>
          <div onClick={() => { setItemModal(false); setEditingItem(null) }} style={modalWrap} />
          <div style={modalBox}>
            <div style={modalHead}>
              <span className="material-icons" style={{ color: 'var(--blue)' }}>inventory_2</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{editingItem ? 'Edit' : 'Add'} Item</div>
            </div>
            <form onSubmit={handleSaveItem} style={modalBody}>
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
              <div style={modalFoot}>
                <button type="button" className="btn btn-secondary" onClick={() => { setItemModal(false); setEditingItem(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Stock In modal ── */}
      {siModal && (
        <>
          <div onClick={() => setSiModal(false)} style={modalWrap} />
          <div style={modalBox}>
            <div style={modalHead}>
              <span className="material-icons" style={{ color: 'var(--green)' }}>add_circle</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Stock In</div>
            </div>
            <form onSubmit={handleStockIn} style={modalBody}>
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
              <div style={modalFoot}>
                <button type="button" className="btn btn-secondary" onClick={() => setSiModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Stock In</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Issue Out modal ── */}
      {soModal && (
        <>
          <div onClick={() => setSoModal(false)} style={modalWrap} />
          <div style={modalBox}>
            <div style={modalHead}>
              <span className="material-icons" style={{ color: 'var(--gold)' }}>remove_circle</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Issue Out</div>
            </div>
            <form onSubmit={handleStockOut} style={modalBody}>
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
              <div style={modalFoot}>
                <button type="button" className="btn btn-secondary" onClick={() => setSoModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-danger">Issue</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
