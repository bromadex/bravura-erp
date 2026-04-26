import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// Map category names to Material Icons
const getIcon = (name) => {
  const n = name.toLowerCase()
  if (n.includes('construct')) return 'construction'
  if (n.includes('electrical')) return 'electrical_services'
  if (n.includes('mechanic') || n.includes('maintenar')) return 'handyman'
  if (n.includes('ppe') || n.includes('safe')) return 'safety_vest'
  return 'category'
}

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => { fetch() }, [])
  const fetch = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    if (data) setCategories(data)
    setLoading(false)
  }

  const add = async () => {
    if (!newName.trim()) return toast.error('Enter name')
    const icon = getIcon(newName)
    const { error } = await supabase.from('categories').insert([{ name: newName.trim(), icon }])
    if (error) toast.error(error.message)
    else { toast.success('Added'); setNewName(''); setShowAdd(false); fetch() }
  }

  const del = async (name) => {
    if (confirm(`Delete "${name}"?`)) {
      await supabase.from('categories').delete().eq('name', name)
      toast.success('Deleted'); fetch()
    }
  }

  return (
    <div style={{ padding: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Categories</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Category
        </button>
      </div>

      {/* Table – ultra compact */}
      <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ width: 40, padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Icon</th>
              <th style={{ padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Category Name</th>
              <th style={{ width: 40, padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ padding: 16, textAlign: 'center' }}>Loading...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="3" style={{ padding: 16, textAlign: 'center' }}>No categories</td></tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 2px' }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>
                      {cat.icon || getIcon(cat.name)}
                    </span>
                   </td>
                  <td style={{ padding: '4px 2px', fontWeight: 500 }}>{cat.name}</td>
                  <td style={{ padding: '4px 2px' }}>
                    <button onClick={() => del(cat.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <span className="material-icons" style={{ fontSize: 16, color: 'var(--red)' }}>delete</span>
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
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Add Category</div>
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
              <button className="btn btn-primary btn-sm" onClick={add}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
