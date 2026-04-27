import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'

export default function Employees() {
  const { employees, departments, designations, attendance, skills, certifications, auditLogs, addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus, loading, fetchAll } = useHR()
  
  // UI state
  const [modalOpen, setModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [editing, setEditing] = useState(null)
  const [accountInfo, setAccountInfo] = useState(null)
  const [activeTab, setActiveTab] = useState('profile')
  
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

  // Get employee's attendance records
  const getEmployeeAttendance = (employeeId) => {
    return attendance.filter(a => a.employee_id === employeeId).sort((a,b) => new Date(b.date) - new Date(a.date))
  }

  // Get employee's skills
  const getEmployeeSkills = (employeeId) => {
    return skills.filter(s => s.employee_id === employeeId)
  }

  // Get employee's certifications
  const getEmployeeCertifications = (employeeId) => {
    return certifications.filter(c => c.employee_id === employeeId)
  }

  // Get employee's audit history
  const getEmployeeHistory = (employeeId) => {
    return auditLogs.filter(log => log.entity_id === employeeId).slice(0, 20)
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
    setActiveTab('profile')
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
    
    if (form.phone && !/^[0-9+\-\s()]{9,15}$/.test(form.phone)) {
      return toast.error('Invalid phone number format')
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      return toast.error('Invalid email format')
    }
    
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
        setModalOpen(false)
      } else {
        let accountResult = null
        if (createAccount) {
          accountResult = await addEmployee(form, true, accountRole)
          setAccountInfo(accountResult)
          toast.success(`Employee added. Username: ${accountResult.username}, Password: ${accountResult.password}`)
        } else {
          await addEmployee(form, false)
          toast.success('Employee added')
          setModalOpen(false)
        }
      }
      await fetchAll()
    } catch (err) { 
      toast.error(err.message) 
    }
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

  // Tab content components
  const ProfileTab = ({ employee }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div><span className="text-dim">Employee ID:</span> {employee.employee_number || '—'}</div>
      <div><span className="text-dim">Status:</span> <span className={`badge ${statusColors[employee.status] || 'bg-green'}`}>{employee.status || 'Active'}</span></div>
      <div><span className="text-dim">Employment Type:</span> {employee.employment_type || '—'}</div>
      <div><span className="text-dim">Designation:</span> {getDesignationTitle(employee.designation_id)}</div>
      <div><span className="text-dim">Department:</span> {getDepartmentName(employee.department_id)}</div>
      <div><span className="text-dim">Phone:</span> {employee.phone || '—'}</div>
      <div><span className="text-dim">Email:</span> {employee.email || '—'}</div>
      <div><span className="text-dim">Hire Date:</span> {employee.hire_date || '—'}</div>
      <div><span className="text-dim">Date of Birth:</span> {employee.date_of_birth || '—'}</div>
      <div style={{ gridColumn: 'span 2' }}><span className="text-dim">Residential Address:</span> {employee.residential_address || '—'}</div>
      <div><span className="text-dim">Emergency Contact Name:</span> {employee.emergency_name || '—'}</div>
      <div><span className="text-dim">Emergency Contact Phone:</span> {employee.emergency_phone || '—'}</div>
      {employee.system_username && (
        <div style={{ gridColumn: 'span 2' }}><span className="text-dim">System Username:</span> {employee.system_username}</div>
      )}
    </div>
  )

  const AttendanceTab = ({ employee }) => {
    const empAttendance = getEmployeeAttendance(employee.id)
    const totalHours = empAttendance.reduce((sum, a) => sum + (a.total_hours || 0), 0)
    const totalOvertime = empAttendance.reduce((sum, a) => sum + (a.overtime_hours || 0), 0)
    return (
      <div>
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi-card"><div className="kpi-label">Total Hours</div><div className="kpi-val">{totalHours.toFixed(1)}</div><div className="kpi-sub">All time</div></div>
          <div className="kpi-card"><div className="kpi-label">Overtime</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{totalOvertime.toFixed(1)}</div><div className="kpi-sub">All time</div></div>
          <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">{getHoursThisWeek(employee.id)}</div><div className="kpi-sub">hours</div></div>
          <div className="kpi-card"><div className="kpi-label">Records</div><div className="kpi-val">{empAttendance.length}</div><div className="kpi-sub">entries</div></div>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Date</th><th>Clock In</th><th>Clock Out</th><th>Shift</th><th>Hours</th><th>Overtime</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {empAttendance.map(att => (
                <tr key={att.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{att.date}</td>
                  <td>{att.clock_in}</td>
                  <td>{att.clock_out || '—'}</td>
                  <td><span className="badge bg-blue">{att.shift_type}</span></td>
                  <td>{att.total_hours?.toFixed(1) || '—'}</td>
                  <td>{att.overtime_hours?.toFixed(1) || '—'}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{att.notes || '—'}</td>
                </tr>
              ))}
              {empAttendance.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">No attendance records</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const PerformanceTab = ({ employee }) => {
    const empSkills = getEmployeeSkills(employee.id)
    const empCerts = getEmployeeCertifications(employee.id)
    const isExpiring = (expiryDate) => {
      if (!expiryDate) return false
      const expiry = new Date(expiryDate)
      const thirtyDays = new Date()
      thirtyDays.setDate(thirtyDays.getDate() + 30)
      return expiry <= thirtyDays && expiry >= new Date()
    }
    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Skills</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {empSkills.map(skill => (
              <span key={skill.id} className="badge bg-purple">{skill.skill_name} ({skill.proficiency})</span>
            ))}
            {empSkills.length === 0 && <span className="text-dim">No skills added</span>}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Certifications</h4>
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Certification</th><th>Issuing Body</th><th>Issue Date</th><th>Expiry Date</th><th>Status</th></tr>
              </thead>
              <tbody>
                {empCerts.map(cert => {
                  const expiring = isExpiring(cert.expiry_date)
                  const expired = cert.expiry_date && new Date(cert.expiry_date) < new Date()
                  return (
                    <tr key={cert.id}>
                      <td style={{ fontWeight: 600 }}>{cert.certification_name}</td>
                      <td>{cert.issuing_body || '—'}</td>
                      <td>{cert.issue_date || '—'}</td>
                      <td>{cert.expiry_date || '—'}</td>
                      <td>
                        {expired ? <span className="badge bg-red">Expired</span> : expiring ? <span className="badge bg-yellow">Expiring Soon</span> : <span className="badge bg-green">Valid</span>}
                      </td>
                    </tr>
                  )
                })}
                {empCerts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-state">No certifications</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const HistoryTab = ({ employee }) => {
    const history = getEmployeeHistory(employee.id)
    const getActionColor = (action) => {
      if (action.includes('CREATE')) return 'var(--green)'
      if (action.includes('UPDATE')) return 'var(--blue)'
      if (action.includes('DELETE')) return 'var(--red)'
      return 'var(--text-dim)'
    }
    return (
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Timestamp</th><th>Action</th><th>User</th><th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {history.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ color: getActionColor(log.action) }}>{log.action}</td>
                <td>{log.user_name || 'System'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {log.new_values ? Object.keys(log.new_values).slice(0, 2).join(', ') : '—'}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan="4" className="empty-state">No history records</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )
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
            <input type="text" className="form-control" placeholder="Name, phone, ID, or designation..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
                  <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleStatusChange(emp, emp.status === 'Active' ? 'On Leave' : 'Active') }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>swap_horiz</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Tabbed Detail View Modal */}
      {viewModalOpen && selectedEmployee && (
        <div className="overlay" onClick={() => setViewModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Employee Details: <span style={{ color: 'var(--gold)' }}>{selectedEmployee.name}</span></span>
              <div>
                <button className="btn btn-secondary btn-sm" onClick={editFromView} style={{ marginRight: 8 }}><span className="material-icons">edit</span> Edit</button>
                <button className="btn btn-danger btn-sm" onClick={deleteFromView}><span className="material-icons">delete</span> Delete</button>
              </div>
            </div>
            
            {/* Tab Headers */}
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {['profile', 'attendance', 'performance', 'history'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
                    color: activeTab === tab ? 'var(--gold)' : 'var(--text-mid)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}
                >
                  <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>
                    {tab === 'profile' ? 'person' : tab === 'attendance' ? 'schedule' : tab === 'performance' ? 'trending_up' : 'history'}
                  </span>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
              {activeTab === 'profile' && <ProfileTab employee={selectedEmployee} />}
              {activeTab === 'attendance' && <AttendanceTab employee={selectedEmployee} />}
              {activeTab === 'performance' && <PerformanceTab employee={selectedEmployee} />}
              {activeTab === 'history' && <HistoryTab employee={selectedEmployee} />}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setViewModalOpen(false)}>Close</button>
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
