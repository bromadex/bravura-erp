import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// Map category name to a Material Icon name
const getMaterialIcon = (name) => {
  const n = name.toLowerCase()
  if (n.includes('construct')) return 'construction'
  if (n.includes('electrical')) return 'electrical_services'
  if (n.includes('mechanic') || n.includes('maintenar')) return 'handyman'
  if (n.includes('ppe') || n.includes('safe')) return 'safety_vest'
  if (n.includes('general')) return 'category'
  return 'category'
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (!error) setCategories(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Enter category name')
    const icon = getMaterialIcon(newName)
    const { error } = await supabase.from('categories').insert([{ name: newName.trim(), icon }])
    if (error) toast.error(error.message)
    else {
      toast.success('Category added')
      setNewName('')
      setShowModal(false)
      fetchCategories()
    }
  }

  const handleDelete = async (name) => {
    if (window.confirm(`Delete "${name}"?`)) {
      const { error } = await supabase.from('categories').delete().eq('name', name)
      if (error) toast.error(error.message)
      else { toast.success('Deleted'); fetchCategories() }
    }
  }

  return (
    <div>
      {/* Header – compact */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Categories</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add
        </button>
      </div>

      {/* Table – narrow, left-aligned icon column */}
      <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ width: 40, padding: '6px 4px', textAlign: 'left', fontSize: 11 }}>Icon</th>
              <th style={{ padding: '6px 4px', textAlign: 'left', fontSize: 11 }}>Name</th>
              <th style={{ width: 50, padding: '6px 4px', textAlign: 'left', fontSize: 11 }}>Act</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 20 }}>No categories</td></tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 4px', textAlign: 'left' }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>
                      {cat.icon || getMaterialIcon(cat.name)}
                    </span>
                  </td>
                  <td style={{ padding: '4px 4px', fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ padding: '4px 4px' }}>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(cat.name)}
                      style={{ padding: '0 6px', minHeight: 28 }}
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal – tiny */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 320, padding: 20 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              <span className="material-icons" style={{ fontSize: 18, marginRight: 4 }}>add</span> New Category
            </div>
            <input
              className="form-control"
              placeholder="Category name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ padding: '6px 8px', fontSize: 13, marginBottom: 16 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
