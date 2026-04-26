import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// Predefined Material Icons that work well for categories
const MATERIAL_ICONS = [
  'category', 'build', 'electrical_services', 'construction', 'safety_vest',
  'plumbing', 'inventory', 'warehouse', 'local_shipping', 'factory',
  'agriculture', 'handyman', 'home_repair_service', 'cleaning_services',
  'pest_control', 'grass', 'water', 'fire_extinguisher', 'medical_services',
  'restaurant', 'computer', 'shopping_cart', 'luggage', 'sports_baseball'
]

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', icon: 'category' })

  const fetchCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (!error) setCategories(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchCategories() }, [])

  const handleAdd = async () => {
    if (!newCategory.name.trim()) return toast.error('Category name required')
    const { error } = await supabase.from('categories').insert([{
      name: newCategory.name.trim(),
      icon: newCategory.icon
    }])
    if (error) toast.error(error.message)
    else {
      toast.success('Category added')
      setNewCategory({ name: '', icon: 'category' })
      setShowAddModal(false)
      fetchCategories()
    }
  }

  const handleDelete = async (name) => {
    if (window.confirm(`Delete "${name}"? Items in this category will lose assignment.`)) {
      const { error } = await supabase.from('categories').delete().eq('name', name)
      if (error) toast.error(error.message)
      else { toast.success('Deleted'); fetchCategories() }
    }
  }

  return (
    <div style={{ padding: 0 }}>  {/* Remove outer padding */}
      {/* Header – compact */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Categories</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ gap: 4 }}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add
        </button>
      </div>

      {/* Table – dense rows */}
      <div className="table-wrap">
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Icon</th>
              <th>Name</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 24 }}>Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 24 }}>No categories</td></tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.name}>
                  <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                    <span className="material-icons" style={{ fontSize: 20, color: 'var(--gold)' }}>{cat.icon || 'category'}</span>
                  </td>
                  <td style={{ fontWeight: 500, padding: '6px 8px' }}>{cat.name}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.name)} style={{ padding: '2px 8px', minHeight: 28 }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal – compact, Material Icon picker */}
      {showAddModal && (
        <div className="overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 420, padding: 20 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize: 16, marginBottom: 16 }}>
              <span className="material-icons" style={{ fontSize: 18, marginRight: 6 }}>add</span> Add <span>Category</span>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10 }}>CATEGORY NAME</label>
              <input
                className="form-control"
                placeholder="e.g. Plumbing Supplies"
                value={newCategory.name}
                onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                style={{ padding: '6px 10px', fontSize: 13 }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10 }}>MATERIAL ICON NAME</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={newCategory.icon}
                  onChange={e => setNewCategory({...newCategory, icon: e.target.value})}
                  className="form-control"
                  style={{ flex: 2, padding: '6px 8px', fontSize: 13 }}
                >
                  {MATERIAL_ICONS.map(ic => (
                    <option key={ic} value={ic}>{ic}</option>
                  ))}
                </select>
                <div style={{ background: 'var(--surface2)', padding: '4px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-icons" style={{ fontSize: 20, color: 'var(--gold)' }}>{newCategory.icon}</span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>preview</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                Material icon names: {MATERIAL_ICONS.slice(0, 6).join(', ')}…
              </div>
            </div>
            <div className="modal-actions" style={{ marginTop: 12, gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
