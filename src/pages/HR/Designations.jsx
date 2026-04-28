import { useState } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function Designations() {
  const { designations, addDesignation, updateDesignation, deleteDesignation } = useHR()
  const canEdit = useCanEdit('hr', 'designations')
  const canDelete = useCanDelete('hr', 'designations')
  
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', level: 1 })

  const openModal = (des = null) => {
    if (des) {
      setEditing(des)
      setForm({ title: des.title, level: des.level || 1 })
    } else {
      setEditing(null)
      setForm({ title: '', level: 1 })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title) return toast.error('Designation title required')
    try {
      if (editing) {
        await updateDesignation(editing.id, form)
        toast.success('Designation updated')
      } else {
        await addDesignation(form)
        toast.success('Designation added')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, title) => {
    if (window.confirm(`Delete designation "${title}"?`)) {
      await deleteDesignation(id)
      toast.success('Deleted')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Designations</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            <span className="material-icons">add</span> Add Designation
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Title</th><th>Level</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {designations.map(des => (
              <tr key={des.id}>
                <td style={{ fontWeight: 600 }}>{des.title}</td>
                <td>{des.level || 1}</td>
                <td>
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openModal(des)}>
                      <span className="material-icons">edit</span>
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(des.id, des.title)}>
                      <span className="material-icons">delete</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {designations.length === 0 && (
              <tr>
                <td colSpan="3" className="empty-state">No designations</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Designation</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Title *</label><input className="form-control" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
              <div className="form-group"><label>Level / Grade</label><input type="number" className="form-control" value={form.level} onChange={e => setForm({...form, level: parseInt(e.target.value) || 1})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
