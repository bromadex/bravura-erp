// src/pages/Inventory/StockBalance.jsx
//
// ROOT CAUSE FIX: ItemModal was called but never defined — blank screen on "Add Item".
// Complete rewrite with:
// - ItemModal fully defined in same file
// - KPI cards: total items, low stock count, out of stock, total value
// - Category filter chips
// - Value column (balance × cost)
// - Stock level gauge bars
// - Edit item with all fields
// - Reorder level alerts

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

function getStatus(balance, threshold) {
  const t = threshold || 5
  if (balance <= 0)   return { label: 'OUT OF STOCK', cls: 'badge-red',    color: 'var(--red)'    }
  if (balance <= t)   return { label: 'LOW STOCK',    cls: 'badge-yellow', color: 'var(--yellow)' }
  return                     { label: 'IN STOCK',     cls: 'badge-green',  color: 'var(--green)'  }
}

// ── Item Add/Edit Modal ──────────────────────────────────────────────────
function ItemModal({ item, categories, onClose, onSave }) {
  const { addItem, updateItem } = useInventory()
  const isEdit = !!item

  const [form, setForm] = useState({
    name:         item?.name         || '',
    category:     item?.category     || (categories[0] || ''),
    unit:         item?.unit         || 'pcs',
    cost:         item?.cost         || 0,
    threshold:    item?.threshold    || 5,
    openingStock: item?.balance      || 0,
    notes:        item?.notes        || '',
  })
  const [newCategory, setNewCategory] = useState('')
  const [addingCat,   setAddingCat]   = useState(false)
  const [saving,      setSaving]      = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim())     return toast.error('Item name required')
    if (!form.category.trim()) return toast.error('Category required')
    setSaving(true)
    try {
      if (isEdit) {
        await updateItem(item.id, {
          name:      form.name,
          category:  form.category,
          unit:      form.unit,
          cost:      parseFloat(form.cost) || 0,
          threshold: parseInt(form.threshold) || 5,
          notes:     form.notes,
        })
        toast.success(`${form.name} updated`)
      } else {
        await addItem({
          name:         form.name,
          category:     form.category,
          unit:         form.unit,
          cost:         parseFloat(form.cost) || 0,
          threshold:    parseInt(form.threshold) || 5,
          openingStock: parseInt(form.openingStock) || 0,
          notes:        form.notes,
        })
        toast.success(`${form.name} added to inventory`)
      }
      onSave()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const allCats = [...new Set([...categories.filter(c => c !== 'ALL'), form.category].filter(Boolean))]

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {isEdit ? 'Edit' : 'Add New'} <span>Inventory Item</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Item Name *</label>
            <input className="form-control" required placeholder="e.g. Portland Cement, Safety Boots"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category *</label>
              {addingCat ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-control" placeholder="New category name" autoFocus
                    value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newCategory.trim()) { setForm({ ...form, category: newCategory.trim() }); setAddingCat(false); setNewCategory('') } } }} />
                  <button type="button" className="btn btn-primary btn-sm"
                    onClick={() => { if (newCategory.trim()) { setForm({ ...form, category: newCategory.trim() }); setAddingCat(false); setNewCategory('') } }}>
                    OK
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddingCat(false)}>×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-control" required value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })} style={{ flex: 1 }}>
                    <option value="">Select category</option>
                    {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" title="Add new category"
                    onClick={() => setAddingCat(true)}>
                    <span className="material-icons" style={{ fontSize: 16 }}>add</span>
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Unit of Measure</label>
              <select className="form-control" value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}>
                {['pcs','kg','g','L','mL','m','cm','bags','boxes','rolls','pairs','sets','drums','tons'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Unit Cost ($/unit)</label>
              <input type="number" min="0" step="0.01" className="form-control"
                value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Reorder Level (Low stock alert)</label>
              <input type="number" min="0" className="form-control"
                value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} />
              <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Alert fires when balance ≤ this number</small>
            </div>
          </div>

          {!isEdit && (
            <div className="form-group">
              <label>Opening Stock Quantity</label>
              <input type="number" min="0" className="form-control"
                value={form.openingStock} onChange={e => setForm({ ...form, openingStock: e.target.value })} />
              <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Starting balance (will appear as a Stock In transaction)</small>
            </div>
          )}

          <div className="form-group">
            <label>Notes / Description</label>
            <textarea className="form-control" rows="2" placeholder="Storage location, specifications, etc."
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="material-icons">{isEdit ? 'save' : 'add'}</span>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function StockBalance() {
  const { items, loading, deleteItem, categories } = useInventory()
  const canEdit   = useCanEdit('inventory', 'stock-balance')
  const canDelete = useCanDelete('inventory', 'stock-balance')

  const [search,        setSearch]        = useState('')
  const [catFilter,     setCatFilter]     = useState('ALL')
  const [statusFilter,  setStatusFilter]  = useState('ALL')
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [editingItem,   setEditingItem]   = useState(null)
  const [viewItem,      setViewItem]      = useState(null)

  const allCategories = ['ALL', ...new Set(items.map(i => i.category).filter(Boolean))]

  const filtered = items.filter(item => {
    if (catFilter !== 'ALL' && item.category !== catFilter) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    const s = getStatus(item.balance, item.threshold).label
    if (statusFilter === 'LOW'  && s !== 'LOW STOCK')    return false
    if (statusFilter === 'OUT'  && s !== 'OUT OF STOCK') return false
    if (statusFilter === 'GOOD' && s !== 'IN STOCK')     return false
    return true
  })

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    try { await deleteItem(item.id); toast.success(`${item.name} deleted`) }
    catch (err) { toast.error(err.message) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(i => ({
      Name: i.name, Category: i.category, Unit: i.unit,
      'Balance': i.balance, 'Total In': i.total_in, 'Total Out': i.total_out,
      'Unit Cost': i.cost, 'Total Value': ((i.balance || 0) * (i.cost || 0)).toFixed(2),
      'Reorder Level': i.threshold, Status: getStatus(i.balance, i.threshold).label,
      Notes: i.notes
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Balance')
    XLSX.writeFile(wb, `StockBalance_${today}.xlsx`)
    toast.success('Exported')
  }

  // KPIs
  const totalItems   = items.length
  const outOfStock   = items.filter(i => i.balance <= 0).length
  const lowStock     = items.filter(i => i.balance > 0 && i.balance <= (i.threshold || 5)).length
  const totalValue   = items.reduce((s, i) => s + ((i.balance || 0) * (i.cost || 0)), 0)

  const catList = categories?.length ? categories.map(c => c.name || c) : allCategories.filter(c => c !== 'ALL')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Balance</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}>
            <span className="material-icons">table_chart</span> Export
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddModal(true) }}>
              <span className="material-icons">add</span> Add Item
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Items</div>
          <div className="kpi-val">{totalItems}</div>
          <div className="kpi-sub">in inventory</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: outOfStock > 0 ? '3px solid var(--red)' : undefined }}
          onClick={() => setStatusFilter(statusFilter === 'OUT' ? 'ALL' : 'OUT')} style={{ cursor: 'pointer', borderLeft: outOfStock > 0 ? '3px solid var(--red)' : undefined }}>
          <div className="kpi-label">Out of Stock</div>
          <div className="kpi-val" style={{ color: outOfStock > 0 ? 'var(--red)' : 'var(--green)' }}>{outOfStock}</div>
          <div className="kpi-sub">{outOfStock > 0 ? 'needs restock' : 'none'}</div>
        </div>
        <div className="kpi-card" onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'ALL' : 'LOW')} style={{ cursor: 'pointer', borderLeft: lowStock > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">Low Stock</div>
          <div className="kpi-val" style={{ color: lowStock > 0 ? 'var(--yellow)' : 'var(--green)' }}>{lowStock}</div>
          <div className="kpi-sub">below reorder level</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Stock Value</div>
          <div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 20 }}>${totalValue.toFixed(0)}</div>
          <div className="kpi-sub">at cost price</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-control" placeholder="Search items…" style={{ maxWidth: 220 }}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-control" style={{ width: 130 }} value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="GOOD">In Stock</option>
            <option value="LOW">Low Stock</option>
            <option value="OUT">Out of Stock</option>
          </select>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['ALL', ...new Set(items.map(i => i.category).filter(Boolean))].map(cat => (
              <button key={cat}
                className={catFilter === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setCatFilter(cat)}>
                {cat === 'ALL' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
          {(search || catFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setCatFilter('ALL'); setStatusFilter('ALL') }}>
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {totalItems} items
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Stock In</th>
                <th>Stock Out</th>
                <th>Balance</th>
                <th>Reorder At</th>
                <th>Unit Cost</th>
                <th>Value</th>
                <th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="12">
                    <div className="empty-state">
                      <span className="material-icons" style={{ fontSize: 40, opacity: 0.3 }}>inventory_2</span>
                      <span>{search || catFilter !== 'ALL' || statusFilter !== 'ALL' ? 'No items match your filters' : 'No items yet — click Add Item to get started'}</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((item, idx) => {
                const s    = getStatus(item.balance, item.threshold)
                const val  = (item.balance || 0) * (item.cost || 0)
                const maxL = Math.max(item.total_in || 0, 1)
                const pct  = Math.min(100, ((item.balance || 0) / maxL) * 100)
                return (
                  <tr key={item.id} onClick={() => setViewItem(item)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = ''}>
                    <td>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.name}</div>
                      {item.notes && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{item.notes}</div>}
                    </td>
                    <td><span className="badge badge-blue" style={{ fontSize: 9 }}>{item.category}</span></td>
                    <td style={{ color: 'var(--text-dim)' }}>{item.unit || 'pcs'}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{item.total_in || 0}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{item.total_out || 0}</td>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: s.color }}>{item.balance}</div>
                      <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2, marginTop: 4, width: 48, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 2, transition: 'width .4s' }} />
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{item.threshold || 5}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>${(item.cost || 0).toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>${val.toFixed(2)}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    {(canEdit || canDelete) && (
                      <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => { setEditingItem(item); setShowAddModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                        )}
                        {canDelete && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item detail modal */}
      {viewItem && (
        <div className="overlay" onClick={() => setViewItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewItem.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Category:</span> {viewItem.category}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Unit:</span> {viewItem.unit || 'pcs'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Balance:</span> <strong style={{ color: getStatus(viewItem.balance, viewItem.threshold).color }}>{viewItem.balance}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Reorder at:</span> {viewItem.threshold || 5}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Total In:</span> <span style={{ color: 'var(--green)' }}>{viewItem.total_in || 0}</span></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Total Out:</span> <span style={{ color: 'var(--red)' }}>{viewItem.total_out || 0}</span></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Unit Cost:</span> ${(viewItem.cost || 0).toFixed(2)}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Total Value:</span> <strong style={{ color: 'var(--teal)' }}>${((viewItem.balance || 0) * (viewItem.cost || 0)).toFixed(2)}</strong></div>
            </div>
            {viewItem.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>{viewItem.notes}</div>}
            <div className="modal-actions">
              {canEdit && <button className="btn btn-secondary" onClick={() => { setEditingItem(viewItem); setShowAddModal(true); setViewItem(null) }}><span className="material-icons">edit</span> Edit</button>}
              <button className="btn btn-secondary" onClick={() => setViewItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showAddModal && (
        <ItemModal
          item={editingItem}
          categories={catList}
          onClose={() => { setShowAddModal(false); setEditingItem(null) }}
          onSave={() => { setShowAddModal(false); setEditingItem(null) }}
        />
      )}
    </div>
  )
}
