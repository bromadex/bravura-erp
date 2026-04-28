import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

function getStatus(balance, threshold) {
  if (balance <= 0) return { label: 'OUT', color: 'var(--red)', bg: 'rgba(248,113,113,.15)' }
  if (balance <= threshold * 0.2) return { label: 'CRITICAL', color: '#fb923c', bg: 'rgba(249,115,22,.15)' }
  if (balance <= threshold) return { label: 'LOW', color: 'var(--yellow)', bg: 'rgba(251,191,36,.15)' }
  return { label: 'GOOD', color: 'var(--green)', bg: 'rgba(52,211,153,.15)' }
}

export default function StockBalance() {
  const { items, loading, deleteItem } = useInventory()
  const canEdit = useCanEdit('inventory', 'stock-balance')
  const canDelete = useCanDelete('inventory', 'stock-balance')

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
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowAddModal(true) }}>
            <span className="material-icons">add</span> Add Item
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Item Name</th><th>Category</th><th>Unit</th>
              <th>In</th><th>Out</th><th>Balance</th><th>Status</th><th>Threshold</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={canEdit ? 10 : 9} style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan={canEdit ? 10 : 9} style={{ textAlign: 'center', padding: 40 }}>No items found</td></tr>
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
                    <td>
                      <span className="badge" style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                    <td>{item.threshold || 5}</td>

                    {canEdit && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(item)}>
                          <span className="material-icons">edit</span>
                        </button>

                        {canDelete && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>
                            <span className="material-icons">delete</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
