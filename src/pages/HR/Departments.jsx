import { useState } from 'react'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'

export default function Departments() {
  const { departments, employees, designations, addDepartment, updateDepartment, deleteDepartment, loading, fetchAll } = useHR()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewEmployeesDept, setViewEmployeesDept] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', location: '', hod: '' })

  const openModal = (dept = null) => {
    if (dept) {
      setEditing(dept)
      setForm({ name: dept.name, description: dept.description || '', location: dept.location || '', hod: dept.hod || '' })
    } else {
      setEditing(null)
      setForm({ name: '', description: '', location: '', hod: '' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) return toast.error('Department name required')
    try {
      if (editing) {
        await updateDepartment(editing.id, form)
        toast.success('Department updated')
      } else {
        await addDepartment(form)
        toast.success('Department added')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (window.confirm(`Delete department "${name}"? Employees will lose assignment.`)) {
      await deleteDepartment(id)
      toast.success('Deleted')
      await fetchAll()
    }
  }

  const getEmployeesInDept = (deptId) => employees.filter(e => e.department_id === deptId)

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
            <tr>
              <th>Name</th><th>Description</th><th>Location</th><th>HOD</th><th>Employees</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map(dept => {
              const empList = getEmployeesInDept(dept.id)
              return (
                <tr key={dept.id} style={{ cursor: 'pointer' }} onClick={() => setViewEmployeesDept(dept)}>
                  <td style={{ fontWeight: 600 }}>{dept.name}</td>
                  <td>{dept.description || '—'}</td>
                  <td>{dept.location || '—'}</td>
                  <td>{dept.hod || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{empList.length} <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle' }}>people</span></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); openModal(dept) }}><span className="material-icons">edit</span></button>
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(dept.id, dept.name) }}><span className="material-icons">delete</span></button>
                  </td>
                </tr>
              )
            })}
            {departments.length === 0 && <tr><td colSpan="6" className="empty-state">No departments</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal to show employees in department */}
      {viewEmployeesDept && (
        <div className="overlay" onClick={() => setViewEmployeesDept(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Employees in <span>{viewEmployeesDept.name}</span></div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Name</th><th>Employee ID</th><th>Designation</th><th>Status</th></tr></thead>
                <tbody>
                  {getEmployeesInDept(viewEmployeesDept.id).map(emp => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 600 }}>{emp.name}</td>
                      <td>{emp.emp_id || '—'}</td>
                      <td>{designations.find(d => d.id === emp.designation_id)?.title || '—'}</td>
                      <td><span className={`badge ${emp.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{emp.status || 'Active'}</span></td>
                    </tr>
                  ))}
                  {getEmployeesInDept(viewEmployeesDept.id).length === 0 && <tr><td colSpan="4">No employees in this department</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setViewEmployeesDept(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Department</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Department Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div className="form-group"><label>Description</label><textarea className="form-control" rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label>Location</label><input className="form-control" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
                <div className="form-group"><label>Head of Department</label><input className="form-control" value={form.hod} onChange={e => setForm({...form, hod: e.target.value})} /></div>
              </div>
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
