
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', icon: 'category' })

  const fetchCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (error) {
      toast.error('Failed to load categories')
    } else {
      setCategories(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleAdd = async () => {
    if (!newCategory.name.trim()) return toast.error('Category name required')
    const iconName = newCategory.icon.trim() || 'category'
    const { error } = await supabase.from('categories').insert([{ name: newCategory.name, icon: iconName }])
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Category added')
      setNewCategory({ name: '', icon: 'category' })
      setShowAddModal(false)
      fetchCategories()
    }
  }

  const handleDelete = async (name) => {
    if (window.confirm(`Delete category "${name}"? Items in this category will lose their category assignment.`)) {
      const { error } = await supabase.from('categories').delete().eq('name', name)
      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Category deleted')
        fetchCategories()
      }
    }
  }

  // Function to get valid icon name (fallback to 'category')
  const getIconName = (icon) => {
    if (!icon) return 'category'
    // List of valid Material Icon names (common ones)
    const validIcons = ['construction', 'electrical_services', 'category', 'build', 'safety_vest', 'plumbing', 'inventory', 'warehouse', 'local_shipping', 'factory']
    if (validIcons.includes(icon)) return icon
    return 'category'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Categories</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <span className="material-icons" style={{ fontSize: 18 }}>add</span> Add Category
        </button>
      </div>

      <div className="table-wrap">
        <table className="categories-table">
          <thead>
            <tr>
              <th>Icon</th>
              <th>Category Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 40 }}>Loading...<\/td><\/tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 40 }}>No categories found<\/td><\/tr>
            ) : (
              categories.map((cat) => (
                <tr key={cat.name}>
                  <td style={{ textAlign: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 28, color: 'var(--gold)' }}>
                      {getIconName(cat.icon)}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{cat.name}<\/td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.name)}>
                      <span className="material-icons" style={{ fontSize: 16 }}>delete<\/span>
                    </button>
                  <\/td>
                <\/tr>
              ))
            )}
          <\/tbody>
        <\/table>
      <\/div>

      {showAddModal && (
        <div className="overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>add<\/span>
              Add <span>Category<\/span>
            <\/div>
            <div className="form-group">
              <label>
                <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>category<\/span>
                Category Name
              <\/label>
              <input 
                className="form-control" 
                placeholder="e.g. Plumbing Supplies" 
                value={newCategory.name} 
                onChange={e => setNewCategory({...newCategory, name: e.target.value})} 
              />
            <\/div>
            <div className="form-group">
              <label>
                <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>style<\/span>
                Material Icon
              <\/label>
              <input 
                className="form-control" 
                placeholder="e.g. plumbing, electrical_services, build" 
                value={newCategory.icon} 
                onChange={e => setNewCategory({...newCategory, icon: e.target.value})} 
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>Preview: <span className="material-icons" style={{ fontSize: 18, verticalAlign: 'middle' }}>{newCategory.icon || 'category'}<\/span><\/span>
                <span>Common icons: <code>category<\/code>, <code>build<\/code>, <code>plumbing<\/code>, <code>electrical_services<\/code>, <code>construction<\/code>, <code>safety_vest<\/code><\/span>
              <\/div>
            <\/div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel<\/button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Category<\/button>
            <\/div>
          <\/div>
        <\/div>
      )}
    <\/div>
  )
}
