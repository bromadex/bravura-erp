import { useState } from 'react'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'

export default function Departments() {
  const { departments, addDepartment, updateDepartment, deleteDepartment, employees } = useHR()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', manager_id: '', location: '' })
  const [viewDept, setViewDept] = useState(null)

  const openModal = (dept = null) => {
    if (dept) {
      setEditing(dept)
      setForm({ name: dept.name, description: dept.description || '', manager_id: dept.manager_id || '', location: dept.location || '' })
    } else {
      setEditing(null)
      setForm({ name: '', description: '', manager_id: '', location: '' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) return toast.error('Name required')
    try {
      if (editing) {
        await updateDepartment(editing.id, form)
        toast.success('Department updated')
      } else {
        await addDepartment(form)
        toast.success('Department added')
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete department "${name}"? Employees in this department will lose assignment.`)) {
      await deleteDepartment(id)
      toast.success('Deleted')
    }
  }

  const getEmployeeCount = (deptId) => employees.filter(e => e.department_id === deptId).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Departments</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Department
        </button>
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr><th>Name</th><th>Description</th><th>Employees</th><th>Location</th><th></th></tr>
          </thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setViewDept(d)}>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td>{d.description || '—'}</td>
                <td><span className="badge bg-blue">{getEmployeeCount(d.id)}</span></td>
                <td>{d.location || '—'}</td>
                <td> onClick={e => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openModal(d)}><span className="material-icons">edit</span></button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id, d.name)}><span className="material-icons">delete</span></button>
                </td>
              </tr>
            ))}
            {departments.length === 0 && <tr><td colSpan="5" className="empty-state">No departments</td></tr>}
          </tbody>
        </table>
      </div>

      {viewDept && (
        <div className="overlay" onClick={() => setViewDept(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewDept.name} <span>Department</span></div>
            <div className="info-box" style={{ marginBottom: 12 }}>{viewDept.description || 'No description'}</div>
            <div className="section-label">Employees in this department</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Name</th><th>Position</th><th>Phone</th></tr></thead>
                <tbody>
                  {employees.filter(e => e.department_id === viewDept.id).map(emp => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600 }}>{emp.name}</td>
                      <td>{emp.designation_id ? designations.find(d => d.id === emp.designation_id)?.title : '—'}</td>
                      <td>{emp.phone || '—'}</td>
                    </tr>
                  ))}
                  {employees.filter(e => e.department_id === viewDept.id).length === 0 && (
                    <tr><td colSpan="3" className="empty-state">No employees in this department</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setViewDept(null)}>Close</button></div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Department</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="form-group"><label>Description</label><textarea className="form-control" rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div className="form-group"><label>Location</label><input className="form-control" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
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
