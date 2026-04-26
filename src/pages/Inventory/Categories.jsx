import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// Map category names to Material Icons (you can customize)
const getIconForCategory = (name) => {
  const lower = name.toLowerCase()
  if (lower.includes('construct')) return 'construction'
  if (lower.includes('electrical')) return 'electrical_services'
  if (lower.includes('mechanic')) return 'handyman'
  if (lower.includes('ppe') || lower.includes('safety')) return 'safety_vest'
  if (lower.includes('general')) return 'category'
  return 'category'
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (!error) setCategories(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return toast.error('Name required')
    const icon = getIconForCategory(newName)
    const { error } = await supabase.from('categories').insert([{ name: newName.trim(), icon }])
    if (error) toast.error(error.message)
    else { toast.success('Added'); setNewName(''); setShowAdd(false); fetchCategories() }
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
      {/* Compact header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Categories</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} style={{ gap: 4 }}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add
        </button>
      </div>

      {/* Compact table – minimal padding */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ width: 40, padding: '6px 4px', fontSize: 11 }}>Icon</th>
              <th style={{ padding: '6px 4px', fontSize: 11 }}>Name</th>
              <th style={{ width: 50, padding: '6px 4px', fontSize: 11 }}>Act</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 16 }}>Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center', padding: 16 }}>No categories</td></tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>{cat.icon || getIconForCategory(cat.name)}</span>
                  </td>
                  <td style={{ padding: '4px 4px', fontWeight: 500, fontSize: 13 }}>{cat.name}</td>
                  <td style={{ padding: '4px 4px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat.name)} style={{ padding: '0 6px', minHeight: 28 }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Minimal add modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 320, padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              <span className="material-icons" style={{ fontSize: 18, marginRight: 4 }}>add</span> New Category
            </div>
            <input
              className="form-control"
              placeholder="Category name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ padding: '6px 8px', fontSize: 13, marginBottom: 12 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
