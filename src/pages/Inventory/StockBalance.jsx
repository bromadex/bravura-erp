// src/pages/Inventory/StockBalance.jsx

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

function getStatus(balance, threshold) {
  const t = threshold || 5
  if (balance <= 0) return { label: 'OUT OF STOCK', cls: 'badge-red',    color: 'var(--red)'    }
  if (balance <= t) return { label: 'LOW STOCK',    cls: 'badge-yellow', color: 'var(--yellow)' }
  return               { label: 'IN STOCK',     cls: 'badge-green',  color: 'var(--green)'  }
}

// ── Item Add/Edit Modal ──────────────────────────────────────────────────
function ItemModal({ item, categories, warehouses, onClose, onSave }) {
  const { addItem, updateItem } = useInventory()
  const isEdit = !!item

  const [form, setForm] = useState({
    name:               item?.name               || '',
    category:           item?.category           || (categories[0] || ''),
    unit:               item?.unit               || 'pcs',
    cost:               item?.cost               || 0,
    threshold:          item?.threshold          || 5,
    openingStock:       item?.balance            || 0,
    notes:              item?.notes              || '',
    default_warehouse_id: item?.default_warehouse_id || 'wh_main_store',
    valuation_method:   item?.valuation_method   || 'Moving Average',
    lead_time_days:     item?.lead_time_days     || '',
    safety_stock:       item?.safety_stock       || '',
    min_order_qty:      item?.min_order_qty      || '',
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
      const payload = {
        name:                 form.name,
        category:             form.category,
        unit:                 form.unit,
        cost:                 parseFloat(form.cost) || 0,
        threshold:            parseInt(form.threshold) || 5,
        notes:                form.notes,
        default_warehouse_id: form.default_warehouse_id,
        valuation_method:     form.valuation_method,
        lead_time_days:       form.lead_time_days ? parseInt(form.lead_time_days) : null,
        safety_stock:         form.safety_stock   ? parseFloat(form.safety_stock) : null,
        min_order_qty:        form.min_order_qty  ? parseFloat(form.min_order_qty) : null,
      }
      if (isEdit) {
        await updateItem(item.id, payload)
        toast.success(`${form.name} updated`)
      } else {
        await addItem({ ...payload, openingStock: parseInt(form.openingStock) || 0 })
        toast.success(`${form.name} added to inventory`)
      }
      onSave()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const allCats = [...new Set([...categories.filter(c => c !== 'ALL'), form.category].filter(Boolean))]

  return (
    <ModalDialog open onClose={onClose} title={`${isEdit ? 'Edit' : 'Add New'} Inventory Item`} size="lg">
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
              <div className="btn-group-sm">
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
              <div className="btn-group-sm">
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
            <label>Default Warehouse</label>
            <select className="form-control" value={form.default_warehouse_id}
              onChange={e => setForm({ ...form, default_warehouse_id: e.target.value })}>
              {(warehouses.length ? warehouses : [{ id: 'wh_main_store', name: 'Main Store' }]).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Valuation Method</label>
            <select className="form-control" value={form.valuation_method}
              onChange={e => setForm({ ...form, valuation_method: e.target.value })}>
              <option value="Moving Average">Moving Average</option>
              <option value="FIFO">FIFO</option>
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
            <label>Reorder Level (alert threshold)</label>
            <input type="number" min="0" className="form-control"
              value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Safety Stock</label>
            <input type="number" min="0" step="0.01" className="form-control" placeholder="0"
              value={form.safety_stock} onChange={e => setForm({ ...form, safety_stock: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Min Order Qty</label>
            <input type="number" min="0" step="0.01" className="form-control" placeholder="0"
              value={form.min_order_qty} onChange={e => setForm({ ...form, min_order_qty: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Lead Time (days)</label>
            <input type="number" min="0" className="form-control" placeholder="0"
              value={form.lead_time_days} onChange={e => setForm({ ...form, lead_time_days: e.target.value })} />
          </div>
        </div>

        {!isEdit && (
          <div className="form-group">
            <label>Opening Stock Quantity</label>
            <input type="number" min="0" className="form-control"
              value={form.openingStock} onChange={e => setForm({ ...form, openingStock: e.target.value })} />
            <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Starting balance (will create an opening Stock Ledger Entry)</small>
          </div>
        )}

        <div className="form-group">
          <label>Notes / Description</label>
          <textarea className="form-control" rows="2" placeholder="Storage location, specifications, etc."
            value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <span className="material-icons">{isEdit ? 'save' : 'add'}</span>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Inventory'}
          </button>
        </ModalActions>
      </form>
    </ModalDialog>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function StockBalance() {
  const { items, bins, warehouses, loading, deleteItem, categories, getBin } = useInventory()
  const canEdit   = useCanEdit('inventory', 'stock-balance')
  const canDelete = useCanDelete('inventory', 'stock-balance')

  const [search,       setSearch]       = useState('')
  const [catFilter,    setCatFilter]    = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [whFilter,     setWhFilter]     = useState('ALL')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem,  setEditingItem]  = useState(null)
  const [viewItem,     setViewItem]     = useState(null)

  // Bin-based helpers with fallback to items.balance
  const getBalance = (item, whId = null) => {
    if (whId && whId !== 'ALL') return getBin(item.id, whId)?.actual_qty ?? 0
    const itemBins = bins.filter(b => b.item_id === item.id)
    if (itemBins.length > 0) return itemBins.reduce((s, b) => s + (b.actual_qty || 0), 0)
    return item.balance ?? 0
  }
  const getProjected = (item, whId = null) => {
    if (whId && whId !== 'ALL') return getBin(item.id, whId)?.projected_qty ?? getBalance(item, whId)
    const itemBins = bins.filter(b => b.item_id === item.id)
    if (itemBins.length > 0) return itemBins.reduce((s, b) => s + (b.projected_qty || 0), 0)
    return item.balance ?? 0
  }
  const getRate = (item, whId = null) => {
    const b = whId && whId !== 'ALL' ? getBin(item.id, whId) : bins.find(b => b.item_id === item.id)
    return b?.valuation_rate ?? item.cost ?? 0
  }

  const effectiveWh = whFilter !== 'ALL' ? whFilter : null

  const filtered = items.filter(item => {
    if (catFilter !== 'ALL' && item.category !== catFilter) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    if (whFilter !== 'ALL' && !getBin(item.id, whFilter)) return false
    const bal = getBalance(item, effectiveWh)
    const s = getStatus(bal, item.threshold).label
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

  const handleExport = () => {
    exportXLSX(filtered.map(i => {
      const bal  = getBalance(i, effectiveWh)
      const rate = getRate(i, effectiveWh)
      const proj = getProjected(i, effectiveWh)
      return {
        Name: i.name, Category: i.category, Unit: i.unit || 'pcs',
        'Actual Qty': bal, 'Projected Qty': proj,
        'Total In': i.total_in || 0, 'Total Out': i.total_out || 0,
        'Valuation Rate': rate.toFixed(2),
        'Stock Value': (bal * rate).toFixed(2),
        'Reorder Level': i.threshold || 5,
        'Valuation Method': i.valuation_method || 'Moving Average',
        Status: getStatus(bal, i.threshold).label,
        Notes: i.notes,
      }
    }), `StockBalance_${today}`, 'Stock Balance')
    toast.success('Exported')
  }

  // KPIs — use bin-based totals
  const totalItems  = items.length
  const outOfStock  = items.filter(i => getBalance(i) <= 0).length
  const lowStock    = items.filter(i => { const b = getBalance(i); return b > 0 && b <= (i.threshold || 5) }).length
  const totalValue  = items.reduce((s, i) => s + getBalance(i) * getRate(i), 0)

  const catList = categories?.length ? categories.map(c => c.name || c) : [...new Set(items.map(i => i.category).filter(Boolean))]
  const whList  = warehouses.length ? warehouses : [{ id: 'wh_main_store', name: 'Main Store' }]

  return (
    <div>
      <PageHeader title="Stock Balance">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddModal(true) }}>
            <span className="material-icons">add</span> Add Item
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Items" value={totalItems} sub="in inventory" color="teal" />
        <KPICard label="Out of Stock" value={outOfStock}
          sub={outOfStock > 0 ? 'needs restock' : 'all stocked'}
          color={outOfStock > 0 ? 'red' : 'green'}
          onClick={() => setStatusFilter(statusFilter === 'OUT' ? 'ALL' : 'OUT')} />
        <KPICard label="Low Stock" value={lowStock} sub="below reorder level"
          color={lowStock > 0 ? 'yellow' : 'green'}
          onClick={() => setStatusFilter(statusFilter === 'LOW' ? 'ALL' : 'LOW')} />
        <KPICard label="Total Stock Value" value={`$${totalValue.toFixed(0)}`} sub="at valuation rate" color="teal" />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-control" placeholder="Search items…" style={{ maxWidth: 220 }}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-control" style={{ width: 145 }} value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="GOOD">In Stock</option>
            <option value="LOW">Low Stock</option>
            <option value="OUT">Out of Stock</option>
          </select>
          <select className="form-control" style={{ width: 155 }} value={whFilter}
            onChange={e => setWhFilter(e.target.value)}>
            <option value="ALL">All Warehouses</option>
            {whList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['ALL', ...new Set(items.map(i => i.category).filter(Boolean))].map(cat => (
              <button key={cat}
                className={catFilter === cat ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setCatFilter(cat)}>
                {cat === 'ALL' ? 'All' : cat}
              </button>
            ))}
          </div>
          {(search || catFilter !== 'ALL' || statusFilter !== 'ALL' || whFilter !== 'ALL') && (
            <button className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setCatFilter('ALL'); setStatusFilter('ALL'); setWhFilter('ALL') }}>
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} of {totalItems} items
          {whFilter !== 'ALL' && ` · Warehouse: ${whList.find(w => w.id === whFilter)?.name}`}
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
                <th>Actual Qty</th>
                <th>Projected</th>
                <th>Reorder At</th>
                <th>Val. Rate</th>
                <th>Stock Value</th>
                <th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="13">
                    <EmptyState icon="inventory_2"
                      message={search || catFilter !== 'ALL' || statusFilter !== 'ALL' || whFilter !== 'ALL'
                        ? 'No items match your filters'
                        : 'No items yet — click Add Item to get started'} />
                  </td>
                </tr>
              ) : filtered.map((item, idx) => {
                const bal  = getBalance(item, effectiveWh)
                const proj = getProjected(item, effectiveWh)
                const rate = getRate(item, effectiveWh)
                const val  = bal * rate
                const s    = getStatus(bal, item.threshold)
                const maxL = Math.max(item.total_in || bal || 1, 1)
                const pct  = Math.min(100, (bal / maxL) * 100)
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
                      <div className="td-mono" style={{ fontSize: 15, color: s.color }}>{bal}</div>
                      <div style={{ height: 3, background: 'var(--border2)', borderRadius: 2, marginTop: 4, width: 48, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 2, transition: 'width .4s' }} />
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: proj < bal ? 'var(--red)' : 'var(--teal)', fontSize: 12 }}>
                      {typeof proj === 'number' ? proj.toFixed(1) : proj}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{item.threshold || 5}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>${rate.toFixed(2)}</td>
                    <td className="td-mono" style={{ color: 'var(--teal)' }}>${val.toFixed(2)}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    {(canEdit || canDelete) && (
                      <td onClick={e => e.stopPropagation()} className="td-actions">
                        <div className="btn-group-sm">
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

      {/* Item detail modal */}
      {viewItem && <ItemDetailModal item={viewItem} bins={bins} warehouses={whList}
        getBalance={getBalance} getProjected={getProjected} getRate={getRate}
        canEdit={canEdit} onEdit={() => { setEditingItem(viewItem); setShowAddModal(true); setViewItem(null) }}
        onClose={() => setViewItem(null)} />}

      {/* Add/Edit modal */}
      {showAddModal && (
        <ItemModal
          item={editingItem}
          categories={catList}
          warehouses={whList}
          onClose={() => { setShowAddModal(false); setEditingItem(null) }}
          onSave={() => { setShowAddModal(false); setEditingItem(null) }}
        />
      )}
    </div>
  )
}

// ── Item Detail Modal ────────────────────────────────────────────────────
function ItemDetailModal({ item, bins, warehouses, getBalance, getProjected, getRate, canEdit, onEdit, onClose }) {
  const itemBins = bins.filter(b => b.item_id === item.id)
  const totalBal = getBalance(item)
  const totalVal = totalBal * getRate(item)
  const s = getStatus(totalBal, item.threshold)

  return (
    <ModalDialog open onClose={onClose} title={item.name} size="lg">
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total On Hand',   value: totalBal,                  color: s.color },
          { label: 'Stock Value',     value: `$${totalVal.toFixed(2)}`, color: 'var(--teal)' },
          { label: 'Status',          value: s.label,                   color: s.color },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Item properties */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 16 }}>
        <div><span style={{ color: 'var(--text-dim)' }}>Category:</span> {item.category}</div>
        <div><span style={{ color: 'var(--text-dim)' }}>Unit:</span> {item.unit || 'pcs'}</div>
        <div><span style={{ color: 'var(--text-dim)' }}>Reorder Level:</span> {item.threshold || 5}</div>
        <div><span style={{ color: 'var(--text-dim)' }}>Valuation Method:</span> {item.valuation_method || 'Moving Average'}</div>
        <div><span style={{ color: 'var(--text-dim)' }}>Total In:</span> <span style={{ color: 'var(--green)' }}>{item.total_in || 0}</span></div>
        <div><span style={{ color: 'var(--text-dim)' }}>Total Out:</span> <span style={{ color: 'var(--red)' }}>{item.total_out || 0}</span></div>
        {item.lead_time_days && <div><span style={{ color: 'var(--text-dim)' }}>Lead Time:</span> {item.lead_time_days} days</div>}
        {item.safety_stock   && <div><span style={{ color: 'var(--text-dim)' }}>Safety Stock:</span> {item.safety_stock}</div>}
        {item.min_order_qty  && <div><span style={{ color: 'var(--text-dim)' }}>Min Order Qty:</span> {item.min_order_qty}</div>}
      </div>

      {/* Per-warehouse breakdown */}
      {itemBins.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Warehouse Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {itemBins.map(bin => {
              const wh = warehouses.find(w => w.id === bin.warehouse_id)
              const bs = getStatus(bin.actual_qty, item.threshold)
              return (
                <div key={bin.warehouse_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 12, alignItems: 'center', background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{wh?.name || bin.warehouse_id}</div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Actual:</span> <strong style={{ color: bs.color }}>{bin.actual_qty ?? 0}</strong></div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Projected:</span> <strong style={{ color: 'var(--teal)' }}>{bin.projected_qty ?? bin.actual_qty ?? 0}</strong></div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Val. Rate:</span> <strong>${(bin.valuation_rate ?? 0).toFixed(2)}</strong></div>
                  <div><span style={{ color: 'var(--text-dim)' }}>Value:</span> <strong style={{ color: 'var(--teal)' }}>${((bin.actual_qty || 0) * (bin.valuation_rate || 0)).toFixed(2)}</strong></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {item.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>{item.notes}</div>}

      <ModalActions>
        {canEdit && (
          <button className="btn btn-secondary" onClick={onEdit}>
            <span className="material-icons">edit</span> Edit
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </ModalActions>
    </ModalDialog>
  )
}
