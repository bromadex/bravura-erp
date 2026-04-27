import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'

export default function Employees() {
  const { employees, departments, designations, attendance, addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus, loading, fetchAll } = useHR()
  
  // UI state
  const [modalOpen, setModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [editing, setEditing] = useState(null)
  const [accountInfo, setAccountInfo] = useState(null)
  
  // Search, filter, sort
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('ALL')
  const [filterDesignation, setFilterDesignation] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [sortBy, setSortBy] = useState('name-asc')
  
  // Form state
  const [form, setForm] = useState({
    name: '', employee_number: '', designation_id: '', department_id: '',
    phone: '', email: '', hire_date: '', date_of_birth: '',
    residential_address: '', emergency_name: '', emergency_phone: '',
    employment_type: 'Full-time', status: 'Active'
  })
  const [createAccount, setCreateAccount] = useState(false)
  const [accountRole, setAccountRole] = useState('viewer')

  // Helper: calculate hours worked this week for an employee
  const getHoursThisWeek = (employeeId) => {
    const today = new Date()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    const weekAttendance = attendance.filter(a => 
      a.employee_id === employeeId && 
      new Date(a.date) >= startOfWeek &&
      a.clock_out
    )
    return weekAttendance.reduce((sum, a) => sum + (a.total_hours || 0), 0).toFixed(1)
  }

  const openModal = (employee = null) => {
    setAccountInfo(null)
    if (employee) {
      setEditing(employee)
      setForm({
        name: employee.name || '',
        employee_number: employee.employee_number || '',
        designation_id: employee.designation_id || '',
        department_id: employee.department_id || '',
        phone: employee.phone || '',
        email: employee.email || '',
        hire_date: employee.hire_date || '',
        date_of_birth: employee.date_of_birth || '',
        residential_address: employee.residential_address || '',
        emergency_name: employee.emergency_name || '',
        emergency_phone: employee.emergency_phone || '',
        employment_type: employee.employment_type || 'Full-time',
        status: employee.status || 'Active'
      })
      setCreateAccount(false)
    } else {
      setEditing(null)
      setForm({
        name: '', employee_number: '', designation_id: '', department_id: '',
        phone: '', email: '', hire_date: '', date_of_birth: '',
        residential_address: '', emergency_name: '', emergency_phone: '',
        employment_type: 'Full-time', status: 'Active'
      })
      setCreateAccount(false)
    }
    setModalOpen(true)
  }

  const openViewModal = (employee) => {
    setSelectedEmployee(employee)
    setViewModalOpen(true)
  }

  const editFromView = () => {
    setViewModalOpen(false)
    openModal(selectedEmployee)
  }

  const deleteFromView = async () => {
    if (window.confirm(`Delete employee "${selectedEmployee.name}"? System account will also be removed.`)) {
      await deleteEmployee(selectedEmployee.id)
      toast.success('Deleted')
      setViewModalOpen(false)
      await fetchAll()
    }
  }

  const handleStatusChange = async (employee, newStatus) => {
    if (window.confirm(`Change ${employee.name}'s status to ${newStatus}?`)) {
      await setEmployeeStatus(employee.id, newStatus)
      toast.success(`Status changed to ${newStatus}`)
      await fetchAll()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name) return toast.error('Name required')
    
    // Validation
    if (form.phone && !/^[0-9+\-\s()]{9,15}$/.test(form.phone)) {
      return toast.error('Invalid phone number format')
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      return toast.error('Invalid email format')
    }
    
    // Duplicate check
    const duplicate = employees.find(emp => 
      emp.id !== editing?.id && 
      (emp.name.toLowerCase() === form.name.toLowerCase() ||
       (emp.phone && emp.phone === form.phone) ||
       (emp.email && emp.email === form.email))
    )
    if (duplicate) {
      return toast.warning('Possible duplicate: employee with similar name/phone/email exists')
    }
    
    try {
      if (editing) {
        await updateEmployee(editing.id, form)
        toast.success('Employee updated')
      } else {
        let accountResult = null
        if (createAccount) {
          accountResult = await addEmployee(form, true, accountRole)
          setAccountInfo(accountResult)
          toast.success(`Employee added. Username: ${accountResult.username}, Password: ${accountResult.password}`)
        } else {
          await addEmployee(form, false)
          toast.success('Employee added')
        }
        if (!accountResult) setModalOpen(false)
      }
      if (!editing && !accountInfo) setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const getDesignationTitle = (id) => designations.find(d => d.id === id)?.title || '—'
  const getDepartmentName = (id) => departments.find(d => d.id === id)?.name || '—'

  // Filtered and sorted employees
  const filteredEmployees = employees.filter(emp => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchesName = emp.name?.toLowerCase().includes(term)
      const matchesPhone = emp.phone?.toLowerCase().includes(term)
      const matchesDesignation = getDesignationTitle(emp.designation_id).toLowerCase().includes(term)
      const matchesId = emp.employee_number?.toLowerCase().includes(term)
      if (!matchesName && !matchesPhone && !matchesDesignation && !matchesId) return false
    }
    if (filterDepartment !== 'ALL' && emp.department_id !== filterDepartment) return false
    if (filterDesignation !== 'ALL' && emp.designation_id !== filterDesignation) return false
    if (filterStatus !== 'ALL' && emp.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'name-asc') return a.name?.localeCompare(b.name || '') || 0
    if (sortBy === 'name-desc') return b.name?.localeCompare(a.name || '') || 0
    if (sortBy === 'hire-date-asc') return new Date(a.hire_date) - new Date(b.hire_date)
    if (sortBy === 'hire-date-desc') return new Date(b.hire_date) - new Date(a.hire_date)
    return 0
  })

  const statusColors = {
    Active: 'bg-green',
    'On Leave': 'bg-yellow',
    Suspended: 'bg-orange',
    Terminated: 'bg-red'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Employee
        </button>
      </div>

      {/* Search, Filter, Sort Bar */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>search</span> Search</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Name, phone, ID, or designation..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>business</span> Department</label>
            <select className="form-control" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>work</span> Designation</label>
            <select className="form-control" value={filterDesignation} onChange={e => setFilterDesignation(e.target.value)}>
              <option value="ALL">All Designations</option>
              {designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>info</span> Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="ALL">All Status</option>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Suspended">Suspended</option>
              <option value="Terminated">Terminated</option>
            </select>
          </div>
          <div className="form-group">
            <label><span className="material-icons" style={{ fontSize: 14 }}>sort</span> Sort By</label>
            <select className="form-control" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="hire-date-asc">Hire Date (Oldest)</option>
              <option value="hire-date-desc">Hire Date (Newest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div className="emp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {loading ? (
          <div>Loading...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="empty-state">No employees match your filters</div>
        ) : (
          filteredEmployees.map(emp => {
            const hoursThisWeek = getHoursThisWeek(emp.id)
            return (
              <div key={emp.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => openViewModal(emp)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="emp-avatar-lg" style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0b0f1a' }}>
                      {emp.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{emp.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{emp.employee_number || '—'}</div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>{getDesignationTitle(emp.designation_id)}</div>
                    </div>
                  </div>
                  <div>
                    <span className={`badge ${statusColors[emp.status] || 'bg-green'}`}>{emp.status || 'Active'}</span>
                    <div style={{ fontSize: 10, marginTop: 4, color: 'var(--text-dim)' }}>{emp.employment_type || 'Full-time'}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  {emp.department_id && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>business</span> {getDepartmentName(emp.department_id)}</div>}
                  {emp.phone && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>phone</span> {emp.phone}</div>}
                  {emp.email && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>email</span> {emp.email}</div>}
                  {emp.system_username && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>account_circle</span> {emp.system_username}</div>}
                </div>
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>schedule</span> This week: <strong>{hoursThisWeek}h</strong></span>
                  <div>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(emp, emp.status === 'Active' ? 'On Leave' : 'Active') }}
                      style={{ marginRight: 4 }}
                    >
                      <span className="material-icons" style={{ fontSize: 14 }}>swap_horiz</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Detail View Modal (same as before, will be enhanced in 8.5.3) */}
      {viewModalOpen && selectedEmployee && (
        <div className="overlay" onClick={() => setViewModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Employee Details: <span>{selectedEmployee.name}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><span className="text-dim">Employee ID:</span> {selectedEmployee.employee_number || '—'}</div>
              <div><span className="text-dim">Status:</span> <span className={`badge ${statusColors[selectedEmployee.status] || 'bg-green'}`}>{selectedEmployee.status || 'Active'}</span></div>
              <div><span className="text-dim">Employment Type:</span> {selectedEmployee.employment_type || '—'}</div>
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
                <div className="form-group"><label>Employee Number</label><input className="form-control" disabled value={form.employee_number || 'Auto-generated'} /></div>
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
                <div className="form-group"><label>Employment Type</label>
                  <select className="form-control" value={form.employment_type} onChange={e => setForm({...form, employment_type: e.target.value})}>
                    <option>Full-time</option><option>Contract</option><option>Casual</option>
                  </select>
                </div>
                <div className="form-group"><label>Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option>Active</option><option>On Leave</option><option>Suspended</option><option>Terminated</option>
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
