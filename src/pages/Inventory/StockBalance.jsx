
import { useState } from 'react'
import { useInventory } from '../../hooks/useInventory'
import toast from 'react-hot-toast'

function getStatus(balance, threshold) {
  if (balance <= 0) return { label: 'OUT', color: 'var(--red)', bg: 'rgba(248,113,113,.15)' }
  if (balance <= threshold) return { label: 'LOW', color: 'var(--yellow)', bg: 'rgba(251,191,36,.15)' }
  if (balance <= threshold * 0.2) return { label: 'CRITICAL', color: '#fb923c', bg: 'rgba(249,115,22,.15)' }
  return { label: 'GOOD', color: 'var(--green)', bg: 'rgba(52,211,153,.15)' }
}

export default function StockBalance() {
  const { items, loading, deleteItem } = useInventory()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  const categories = ['ALL', ...new Set(items.map(i => i.category))]

  const filteredItems = items.filter(item => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    const status = getStatus(item.balance, item.threshold).label
    if (statusFilter !== 'ALL' && status !== statusFilter) return false
    return true
  })

  const handleDelete = async (item) => {
    if (window.confirm(`Delete "${item.name}"? This will also remove all its transactions.`)) {
      await deleteItem(item.id)
      toast.success(`${item.name} deleted`)
    }
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setShowAddModal(true)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Balance</h1>
        <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddModal(true) }}>
          <span className="material-icons" style={{ fontSize: 18 }}>add</span> Add Item
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 250 }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-dim)' }}>search</span>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 36px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="form-control"
          style={{ width: 140 }}
        >
          {categories.map(cat => <option key={cat} value={cat}>{cat === 'ALL' ? 'All Categories' : cat}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-control"
          style={{ width: 120 }}
        >
          <option value="ALL">All Status</option>
          <option value="GOOD">Good</option>
          <option value="LOW">Low</option>
          <option value="CRITICAL">Critical</option>
          <option value="OUT">Out of Stock</option>
        </select>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>#</th><th>Item Name</th><th>Category</th><th>Unit</th>
              <th>In</th><th>Out</th><th>Balance</th><th>Status</th><th>Threshold</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan="10" style={{ textAlign: 'center', padding: 40 }}>No items found</td></tr>
            ) : (
              filteredItems.map((item, idx) => {
                const status = getStatus(item.balance, item.threshold)
                return (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>{item.category}</td>
                    <td>{item.unit || 'pcs'}</td>
                    <td style={{ color: 'var(--green)' }}>{item.total_in || 0}</td>
                    <td style={{ color: 'var(--red)' }}>{item.total_out || 0}</td>
                    <td style={{ fontWeight: 700, color: status.color }}>{item.balance}</td>
                    <td><span className="badge" style={{ background: status.bg, color: status.color }}>{status.label}</span></td>
                    <td>{item.threshold || 5}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(item)}>
                        <span className="material-icons" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                        <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <ItemModal
          item={editingItem}
          categories={categories.filter(c => c !== 'ALL')}
          onClose={() => { setShowAddModal(false); setEditingItem(null) }}
          onSave={() => { setShowAddModal(false); setEditingItem(null) }}
        />
      )}
    </div>
  )
}

function ItemModal({ item, categories, onClose, onSave }) {
  const { addItem, updateItem } = useInventory()
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || categories[0] || '',
    unit: item?.unit || 'pcs',
    cost: item?.cost || 0,
    threshold: item?.threshold || 5,
    openingStock: 0,
    notes: item?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (item) {
        await updateItem(item.id, {
          name: form.name,
          category: form.category,
          unit: form.unit,
          cost: form.cost,
          threshold: form.threshold,
          notes: form.notes,
        })
        toast.success(`${form.name} updated`)
      } else {
        await addItem(form)
        toast.success(`${form.name} added`)
      }
      onSave()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>{item ? 'edit' : 'add'}</span>
          {item ? 'Edit' : 'Add'} <span>Item</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>inventory</span> Item Name *</label>
            <input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>category</span> Category</label>
              <select className="form-control" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>straighten</span> Unit</label>
              <input className="form-control" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>attach_money</span> Unit Cost (USD)</label>
              <input type="number" step="0.01" className="form-control" value={form.cost} onChange={e => setForm({...form, cost: parseFloat(e.target.value) || 0})} />
            </div>
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>warning</span> Low Stock Threshold</label>
              <input type="number" className="form-control" value={form.threshold} onChange={e => setForm({...form, threshold: parseInt(e.target.value) || 5})} />
            </div>
          </div>
          {!item && (
            <div className="form-group">
              <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>add_circle</span> Opening Stock</label>
              <input type="number" className="form-control" value={form.openingStock} onChange={e => setForm({...form, openingStock: parseInt(e.target.value) || 0})} />
            </div>
          )}
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>description</span> Notes</label>
            <textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : (item ? 'Save Changes' : 'Add Item')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
