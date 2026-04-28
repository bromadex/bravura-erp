import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

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
  const canEdit = useCanEdit('inventory', 'categories')
  const canDelete = useCanDelete('inventory', 'categories')

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
      <div className="page-header">
        <h1 className="page-title">Categories</h1>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <span className="material-icons">add</span> Add Category
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ width: 40, padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Icon</th>
              <th style={{ padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Category Name</th>
              {canDelete && <th style={{ width: 40, padding: '4px 2px', textAlign: 'left', fontSize: 10 }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canDelete ? 3 : 2} style={{ padding: 16, textAlign: 'center' }}>Loading...<\/td><\/tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={canDelete ? 3 : 2} style={{ padding: 16, textAlign: 'center' }}>No categories<\/td><\/tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 2px' }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>
                      {cat.icon || getMaterialIcon(cat.name)}
                    </span>
                  <\/td>
                  <td style={{ padding: '4px 2px', fontWeight: 500 }}>{cat.name}<\/td>
                  {canDelete && (
                    <td style={{ padding: '4px 2px' }}>
                      <button onClick={() => handleDelete(cat.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <span className="material-icons" style={{ fontSize: 16, color: 'var(--red)' }}>delete<\/span>
                      <\/button>
                    <\/td>
                  )}
                <\/tr>
              ))
            )}
          <\/tbody>
        <\/table>
      <\/div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 320, padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Add Category<\/div>
            <input className="form-control" placeholder="Category name" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, marginBottom: 12 }} autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel<\/button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add<\/button>
            <\/div>
          <\/div>
        <\/div>
      )}
    <\/div>
  )
}
