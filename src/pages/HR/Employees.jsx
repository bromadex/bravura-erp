import { useState } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function Employees() {
  const { employees, departments, designations, addEmployee, updateEmployee, deleteEmployee, loading, fetchAll } = useHR()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)         // Add/Edit modal
  const [viewModalOpen, setViewModalOpen] = useState(false) // Detail view modal
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [editing, setEditing] = useState(null)
  const [accountInfo, setAccountInfo] = useState(null)
  const [form, setForm] = useState({
    name: '', emp_id: '', designation_id: '', department_id: '',
    phone: '', email: '', hire_date: '', date_of_birth: '',
    residential_address: '', emergency_name: '', emergency_phone: '',
    status: 'Active'
  })
  const [createAccount, setCreateAccount] = useState(false)
  const [accountRole, setAccountRole] = useState('viewer')

  // Open Add/Edit modal
  const openModal = (employee = null) => {
    setAccountInfo(null)
    if (employee) {
      setEditing(employee)
      setForm({
        name: employee.name,
        emp_id: employee.emp_id || '',
        designation_id: employee.designation_id || '',
        department_id: employee.department_id || '',
        phone: employee.phone || '',
        email: employee.email || '',
        hire_date: employee.hire_date || '',
        date_of_birth: employee.date_of_birth || '',
        residential_address: employee.residential_address || '',
        emergency_name: employee.emergency_name || '',
        emergency_phone: employee.emergency_phone || '',
        status: employee.status || 'Active'
      })
      setCreateAccount(false)
    } else {
      setEditing(null)
      setForm({
        name: '', emp_id: '', designation_id: '', department_id: '',
        phone: '', email: '', hire_date: '', date_of_birth: '',
        residential_address: '', emergency_name: '', emergency_phone: '',
        status: 'Active'
      })
      setCreateAccount(false)
    }
    setModalOpen(true)
  }

  // View details (click on card)
  const openViewModal = (employee) => {
    setSelectedEmployee(employee)
    setViewModalOpen(true)
  }

  // Edit from view modal
  const editFromView = () => {
    setViewModalOpen(false)
    openModal(selectedEmployee)
  }

  // Delete from view modal
  const deleteFromView = async () => {
    if (window.confirm(`Delete employee "${selectedEmployee.name}"? System account will also be removed.`)) {
      await deleteEmployee(selectedEmployee.id)
      toast.success('Deleted')
      setViewModalOpen(false)
      await fetchAll()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) return toast.error('Name required')
    try {
      let accountResult = null
      if (!editing && createAccount) {
        accountResult = await addEmployee(form, true, accountRole)
        setAccountInfo(accountResult)
        toast.success(`Employee added. Username: ${accountResult.username}, Password: ${accountResult.password}`)
      } else if (editing) {
        await updateEmployee(editing.id, form)
        toast.success('Employee updated')
      } else {
        await addEmployee(form, false)
        toast.success('Employee added (no system account)')
      }
      if (!editing) {
        setForm({
          name: '', emp_id: '', designation_id: '', department_id: '',
          phone: '', email: '', hire_date: '', date_of_birth: '',
          residential_address: '', emergency_name: '', emergency_phone: '',
          status: 'Active'
        })
        setCreateAccount(false)
        if (!accountResult) setModalOpen(false)
      } else {
        setModalOpen(false)
      }
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (employee) => {
    if (window.confirm(`Delete employee "${employee.name}"? System account will also be removed.`)) {
      await deleteEmployee(employee.id)
      toast.success('Deleted')
      await fetchAll()
    }
  }

  const getDesignationTitle = (id) => designations.find(d => d.id === id)?.title || '—'
  const getDepartmentName = (id) => departments.find(d => d.id === id)?.name || '—'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Employee
        </button>
      </div>

      {/* Employee Cards Grid */}
      <div className="emp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {loading ? <div>Loading...</div> : employees.length === 0 ? <div className="empty-state">No employees</div> : employees.map(emp => (
          <div key={emp.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => openViewModal(emp)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="emp-avatar-lg" style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0b0f1a' }}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{emp.emp_id || '—'}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>{getDesignationTitle(emp.designation_id)}</div>
                </div>
              </div>
              <span className={`badge ${emp.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{emp.status}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              {emp.department_id && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>business</span> {getDepartmentName(emp.department_id)}</div>}
              {emp.phone && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>phone</span> {emp.phone}</div>}
              {emp.email && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>email</span> {emp.email}</div>}
              {emp.system_username && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>account_circle</span> {emp.system_username}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Detail View Modal (click on card) */}
      {viewModalOpen && selectedEmployee && (
        <div className="overlay" onClick={() => setViewModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Employee Details: <span>{selectedEmployee.name}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><span className="text-dim">Employee ID:</span> {selectedEmployee.emp_id || '—'}</div>
              <div><span className="text-dim">Status:</span> <span className={`badge ${selectedEmployee.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{selectedEmployee.status}</span></div>
              <div><span className="text-dim">Designation:</span> {getDesignationTitle(selectedEmployee.designation_id)}</div>
              <div><span className="text-dim">Department:</span> {getDepartmentName(selectedEmployee.department_id)}</div>
              <div><span className="text-dim">Phone:</span> {selectedEmployee.phone || '—'}</div>
              <div><span className="text-dim">Email:</span> {selectedEmployee.email || '—'}</div>
              <div><span className="text-dim">Hire Date:</span> {selectedEmployee.hire_date || '—'}</div>
              <div><span className="text-dim">Date of Birth:</span> {selectedEmployee.date_of_birth || '—'}</div>
              <div style={{ gridColumn: 'span 2' }}><span className="text-dim">Residential Address:</span> {selectedEmployee.residential_address || '—'}</div>
              <div><span className="text-dim">Emergency Contact Name:</span> {selectedEmployee.emergency_name || '—'}</div>
              <div><span className="text-dim">Emergency Contact Phone:</span> {selectedEmployee.emergency_phone || '—'}</div>
              {selectedEmployee.system_username && (
                <div style={{ gridColumn: 'span 2' }}><span className="text-dim">System Username:</span> {selectedEmployee.system_username}</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setViewModalOpen(false)}>Close</button>
              <button className="btn btn-primary" onClick={editFromView}><span className="material-icons">edit</span> Edit</button>
              <button className="btn btn-danger" onClick={deleteFromView}><span className="material-icons">delete</span> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Employee</span></div>
            {accountInfo && (
              <div className="info-box" style={{ marginBottom: 16, background: 'rgba(52,211,153,.1)', borderColor: 'rgba(52,211,153,.3)' }}>
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle' }}>check_circle</span> Account created!<br />
                <strong>Username:</strong> {accountInfo.username}<br />
                <strong>Password:</strong> {accountInfo.password}<br />
                <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(`Username: ${accountInfo.username}\nPassword: ${accountInfo.password}`)}>Copy Credentials</button>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Full Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
                <div className="form-group"><label>Employee ID</label><input className="form-control" value={form.emp_id} onChange={e => setForm({...form, emp_id: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Designation</label>
                  <select className="form-control" value={form.designation_id} onChange={e => setForm({...form, designation_id: e.target.value})}>
                    <option value="">Select</option>
                    {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Department</label>
                  <select className="form-control" value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value})}>
                    <option value="">Select</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div className="form-group"><label>Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Hire Date</label><input type="date" className="form-control" value={form.hire_date} onChange={e => setForm({...form, hire_date: e.target.value})} /></div>
                <div className="form-group"><label>Date of Birth</label><input type="date" className="form-control" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Residential Address</label><textarea className="form-control" rows="2" value={form.residential_address} onChange={e => setForm({...form, residential_address: e.target.value})} /></div>
              <div className="form-row">
                <div className="form-group"><label>Emergency Contact Name</label><input className="form-control" value={form.emergency_name} onChange={e => setForm({...form, emergency_name: e.target.value})} /></div>
                <div className="form-group"><label>Emergency Contact Phone</label><input className="form-control" value={form.emergency_phone} onChange={e => setForm({...form, emergency_phone: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option>Active</option><option>Inactive</option>
                  </select>
                </div>
              </div>
              {!editing && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)} />
                    <span>Create system account (username + password)</span>
                  </label>
                  {createAccount && (
                    <div style={{ marginTop: 8 }}>
                      <label>System Role</label>
                      <select className="form-control" value={accountRole} onChange={e => setAccountRole(e.target.value)}>
                        <option value="viewer">Viewer</option>
                        <option value="storekeeper">Storekeeper</option>
                        <option value="fuel_attendant">Fuel Attendant</option>
                        <option value="hr_officer">HR Officer</option>
                        <option value="requisition_officer">Requisition Officer</option>
                        <option value="manager">Manager</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Save' : (createAccount ? 'Add & Create Account' : 'Add Employee')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
