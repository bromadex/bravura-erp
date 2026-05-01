// src/pages/HR/Employees.jsx
//
// ADDED: "Compensation" tab in the employee view modal.
// Stores: basic_salary, allowances, paye_rate, nssa_rate, aids_levy_rate,
// medical_aid, other_deductions, bank_name, bank_account, nssa_number.
// These fields are read by Payroll.jsx generateRecords() to pre-fill
// every payroll record automatically — HR only needs to review.
//
// Zimbabwe statutory rates (pre-filled as defaults, editable):
//   NSSA:       4.5% of gross (employee contribution)
//   Aids Levy:  3% of PAYE
//   PAYE:       progressive — stored as a percentage for simplicity

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { useLeave } from '../../contexts/LeaveContext'

export default function Employees() {
  const {
    employees, departments, designations, attendance, skills, certifications, auditLogs,
    addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus, addSkill, deleteSkill,
    addCertification, updateCertification, deleteCertification, getWeeklyHours,
    loading: hrLoading, fetchAll
  } = useHR()

  const canEdit   = useCanEdit('hr', 'employees')
  const canDelete = useCanDelete('hr', 'employees')
  const { isOnLeave } = useLeave()

  const [modalOpen,         setModalOpen]         = useState(false)
  const [viewModalOpen,     setViewModalOpen]      = useState(false)
  const [selectedEmployee,  setSelectedEmployee]   = useState(null)
  const [editing,           setEditing]            = useState(null)
  const [activeTab,         setActiveTab]          = useState('profile')
  const [documents,         setDocuments]          = useState([])
  const [uploading,         setUploading]          = useState(false)
  const [activeDocCategory, setActiveDocCategory]  = useState('general')
  const [manualEmployeeId,  setManualEmployeeId]   = useState(false)

  // Credential popup
  const [credentialModal, setCredentialModal] = useState({ open: false, username: '', password: '', employeeName: '' })
  // System account data for ProfileTab
  const [systemAccountData, setSystemAccountData] = useState(null)

  // Leave balances
  const [leaveTypesList,  setLeaveTypesList]  = useState([])
  const [initialBalances, setInitialBalances] = useState([])

  const [searchTerm,        setSearchTerm]        = useState('')
  const [filterDepartment,  setFilterDepartment]  = useState('ALL')
  const [filterDesignation, setFilterDesignation] = useState('ALL')
  const [filterStatus,      setFilterStatus]      = useState('ALL')
  const [sortBy,            setSortBy]            = useState('name-asc')

  const [newSkill,      setNewSkill]      = useState({ name: '', proficiency: 'Intermediate' })
  const [certForm,      setCertForm]      = useState({ id: null, certification_name: '', issuing_body: '', issue_date: '', expiry_date: '', document_url: '', notes: '' })
  const [showCertModal, setShowCertModal] = useState(false)
  const [editingCert,   setEditingCert]   = useState(null)

  // ✅ Compensation state for view/edit
  const [compForm, setCompForm] = useState({
    basic_salary: 0, allowances: 0,
    paye_rate: 25, nssa_rate: 4.5, aids_levy_rate: 3,
    medical_aid: 0, other_deductions: 0,
    bank_name: '', bank_account: '', nssa_number: ''
  })
  const [savingComp, setSavingComp] = useState(false)

  const [form, setForm] = useState({
    name: '', employee_number: '', designation_id: '', department_id: '',
    phone: '', email: '', hire_date: '', date_of_birth: '',
    residential_address: '', emergency_name: '', emergency_phone: '',
    employment_type: 'Full-time', status: 'Active'
  })
  const [createAccount, setCreateAccount] = useState(false)
  const [accountRoleId, setAccountRoleId] = useState('role_viewer')

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('leave_types').select('id, name').order('name')
      if (data) setLeaveTypesList(data)
    }
    fetch()
  }, [])

  const docCategories = [
    { id: 'passport',       label: 'Passport Photo', icon: 'photo_camera', accept: 'image/*' },
    { id: 'identification', label: 'Identification', icon: 'badge',        accept: 'image/*,application/pdf' },
    { id: 'certifications', label: 'Certifications', icon: 'verified',     accept: 'image/*,application/pdf' },
    { id: 'general',        label: 'General',        icon: 'description',  accept: '*' }
  ]

  const fetchDocuments = async (employeeId) => {
    try {
      const { data, error } = await supabase.storage.from('hr-documents').list(`employees/${employeeId}/`, { recursive: true })
      if (error && error.message !== 'The resource was not found') return
      if (data?.length) {
        setDocuments(data.map(file => {
          const category = file.name.split('/').slice(-2)[0] || 'general'
          const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(file.name)
          return { name: file.name.split('/').pop(), path: file.name, category, url: publicUrl, size: file.metadata?.size, created_at: file.created_at }
        }))
      } else setDocuments([])
    } catch { setDocuments([]) }
  }

  const fetchSystemAccount = async (employee) => {
    if (!employee.system_user_id) { setSystemAccountData(null); return }
    const { data } = await supabase.from('app_users').select('username, must_change_password, password_plain').eq('id', employee.system_user_id).single()
    setSystemAccountData(data || null)
  }

  const loadCompensation = (employee) => {
    setCompForm({
      basic_salary:      employee.basic_salary      || 0,
      allowances:        employee.allowances         || 0,
      paye_rate:         employee.paye_rate          ?? 25,
      nssa_rate:         employee.nssa_rate          ?? 4.5,
      aids_levy_rate:    employee.aids_levy_rate     ?? 3,
      medical_aid:       employee.medical_aid        || 0,
      other_deductions:  employee.other_deductions   || 0,
      bank_name:         employee.bank_name          || '',
      bank_account:      employee.bank_account       || '',
      nssa_number:       employee.nssa_number        || '',
    })
  }

  const saveCompensation = async () => {
    if (!selectedEmployee) return
    setSavingComp(true)
    try {
      await updateEmployee(selectedEmployee.id, compForm)
      toast.success('Compensation details saved')
      // Refresh selected employee data
      const updated = employees.find(e => e.id === selectedEmployee.id)
      if (updated) setSelectedEmployee({ ...updated, ...compForm })
    } catch (err) { toast.error(err.message) }
    finally { setSavingComp(false) }
  }

  const handleUpload = async (file, category) => {
    if (!selectedEmployee || !file) return
    setUploading(true)
    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `employees/${selectedEmployee.id}/${category}/${Date.now()}_${safeFileName}`
      const { error } = await supabase.storage.from('hr-documents').upload(filePath, file, { cacheControl: '3600', upsert: false })
      if (error) { toast.error(`Upload failed: ${error.message}`); return }
      const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(filePath)
      setDocuments(prev => [...prev, { name: safeFileName, path: filePath, category, url: publicUrl, size: file.size, created_at: new Date().toISOString() }])
      toast.success('Uploaded')
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  const handleDeleteDocument = async (path) => {
    if (!window.confirm('Delete this document?')) return
    const { error } = await supabase.storage.from('hr-documents').remove([path])
    if (error) toast.error(error.message)
    else { toast.success('Deleted'); setDocuments(prev => prev.filter(d => d.path !== path)) }
  }

  const getEmployeeAttendance = (id) => attendance.filter(a => a.employee_id === id).sort((a, b) => new Date(b.date) - new Date(a.date))
  const getEmployeeSkills         = (id) => skills.filter(s => s.employee_id === id)
  const getEmployeeCertifications = (id) => certifications.filter(c => c.employee_id === id)
  const getEmployeeHistory        = (id) => auditLogs.filter(l => l.entity_id === id).slice(0, 20)
  const getDesignationTitle       = (id) => designations.find(d => d.id === id)?.title || '—'
  const getDepartmentName         = (id) => departments.find(d => d.id === id)?.name  || '—'

  const statusColors = { Active: 'badge-green', 'On Leave': 'badge-yellow', Suspended: 'badge-yellow', Terminated: 'badge-red' }
  const getStatusBadge = (emp) => {
    if (isOnLeave(emp.id)) return { cls: 'badge-yellow', label: 'ON LEAVE' }
    return { cls: statusColors[emp.status] || 'badge-green', label: emp.status || 'Active' }
  }

  const handleAddSkill = async () => {
    if (!newSkill.name.trim()) return toast.error('Skill name required')
    try { await addSkill(selectedEmployee.id, newSkill.name, newSkill.proficiency); toast.success('Skill added'); setNewSkill({ name: '', proficiency: 'Intermediate' }); await fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const handleDeleteSkill = async (skillId) => {
    if (!window.confirm('Remove this skill?')) return
    await deleteSkill(skillId); toast.success('Removed'); await fetchAll()
  }

  const openCertModal = (cert = null) => {
    if (cert) { setEditingCert(cert); setCertForm({ id: cert.id, certification_name: cert.certification_name, issuing_body: cert.issuing_body || '', issue_date: cert.issue_date || '', expiry_date: cert.expiry_date || '', document_url: cert.document_url || '', notes: cert.notes || '' }) }
    else { setEditingCert(null); setCertForm({ id: null, certification_name: '', issuing_body: '', issue_date: '', expiry_date: '', document_url: '', notes: '' }) }
    setShowCertModal(true)
  }

  const handleSaveCertification = async () => {
    if (!certForm.certification_name) return toast.error('Certification name required')
    try {
      if (editingCert) { await updateCertification(editingCert.id, { ...certForm, employee_id: selectedEmployee.id }); toast.success('Updated') }
      else { await addCertification({ ...certForm, employee_id: selectedEmployee.id }); toast.success('Added') }
      setShowCertModal(false); await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDeleteCertification = async (certId, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    await deleteCertification(certId); toast.success('Deleted'); await fetchAll()
  }

  const openModal = (employee = null) => {
    setManualEmployeeId(false); setInitialBalances([])
    if (employee) { setEditing(employee); setForm({ name: employee.name || '', employee_number: employee.employee_number || '', designation_id: employee.designation_id || '', department_id: employee.department_id || '', phone: employee.phone || '', email: employee.email || '', hire_date: employee.hire_date || '', date_of_birth: employee.date_of_birth || '', residential_address: employee.residential_address || '', emergency_name: employee.emergency_name || '', emergency_phone: employee.emergency_phone || '', employment_type: employee.employment_type || 'Full-time', status: employee.status || 'Active' }); setCreateAccount(false) }
    else { setEditing(null); setForm({ name: '', employee_number: '', designation_id: '', department_id: '', phone: '', email: '', hire_date: '', date_of_birth: '', residential_address: '', emergency_name: '', emergency_phone: '', employment_type: 'Full-time', status: 'Active' }); setCreateAccount(false) }
    setModalOpen(true)
  }

  const openViewModal = (employee) => {
    setSelectedEmployee(employee)
    setActiveTab('profile')
    setActiveDocCategory('general')
    setDocuments([])
    setSystemAccountData(null)
    setViewModalOpen(true)
    fetchDocuments(employee.id)
    fetchSystemAccount(employee)
    loadCompensation(employee)
  }

  const editFromView   = () => { setViewModalOpen(false); openModal(selectedEmployee) }
  const deleteFromView = async () => {
    if (!window.confirm(`Delete "${selectedEmployee.name}"? System account will also be removed.`)) return
    await deleteEmployee(selectedEmployee.id); toast.success('Deleted'); setViewModalOpen(false); await fetchAll()
  }

  const handleStatusChange = async (employee, newStatus) => {
    if (!window.confirm(`Change ${employee.name}'s status to ${newStatus}?`)) return
    await setEmployeeStatus(employee.id, newStatus); toast.success(`Status changed`); await fetchAll()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name?.trim())   return toast.error('Full Name required')
    if (!form.department_id)  return toast.error('Select Department')
    if (!form.designation_id) return toast.error('Select Designation')
    if (!form.hire_date)      return toast.error('Hire Date required')
    if (form.phone && !/^[0-9+\-\s()]{9,15}$/.test(form.phone)) return toast.error('Invalid phone')
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email))        return toast.error('Invalid email')
    if (!editing && manualEmployeeId) {
      if (!form.employee_number?.match(/^BRA\d+$/)) return toast.error('Must be BRA followed by digits')
      if (employees.some(e => e.employee_number === form.employee_number && e.id !== editing?.id)) return toast.error('Employee number already exists')
    }
    const submitData = { ...form }
    if (!editing && !manualEmployeeId) submitData.employee_number = ''
    try {
      if (editing) { await updateEmployee(editing.id, submitData); toast.success('Updated'); setModalOpen(false) }
      else {
        if (createAccount) {
          const result = await addEmployee(submitData, true, accountRoleId, initialBalances)
          setModalOpen(false)
          setCredentialModal({ open: true, username: result.username, password: result.password, employeeName: submitData.name })
        } else { await addEmployee(submitData, false, accountRoleId, initialBalances); toast.success('Employee added'); setModalOpen(false) }
      }
      await fetchAll()
    } catch (err) { toast.error(err.message || 'Failed to save') }
  }

  const credentialText = () => `Employee: ${credentialModal.employeeName}\nUsername: ${credentialModal.username}\nPassword: ${credentialModal.password}\n\nNote: Employee must change password on first login.`
  const handleCopyCredentials = () => { navigator.clipboard.writeText(credentialText()); toast.success('Copied'); setCredentialModal({ open: false, username: '', password: '', employeeName: '' }) }
  const handleDownloadCredentials = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([credentialText()], { type: 'text/plain' })), download: `${credentialModal.employeeName.replace(/\s+/g, '_')}_credentials.txt` })
    a.click(); URL.revokeObjectURL(a.href)
    setCredentialModal({ open: false, username: '', password: '', employeeName: '' })
  }

  const filteredEmployees = employees.filter(emp => {
    if (searchTerm) { const t = searchTerm.toLowerCase(); if (!(emp.name?.toLowerCase().includes(t) || emp.phone?.toLowerCase().includes(t) || getDesignationTitle(emp.designation_id).toLowerCase().includes(t) || emp.employee_number?.toLowerCase().includes(t))) return false }
    if (filterDepartment  !== 'ALL' && emp.department_id  !== filterDepartment)  return false
    if (filterDesignation !== 'ALL' && emp.designation_id !== filterDesignation) return false
    if (filterStatus      !== 'ALL' && emp.status         !== filterStatus)       return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'name-asc')  return a.name?.localeCompare(b.name || '') || 0
    if (sortBy === 'name-desc') return b.name?.localeCompare(a.name || '') || 0
    if (sortBy === 'hire-date-asc')  return new Date(a.hire_date) - new Date(b.hire_date)
    if (sortBy === 'hire-date-desc') return new Date(b.hire_date) - new Date(a.hire_date)
    return 0
  })

  // ── Tab components ────────────────────────────────────────────

  const ProfileTab = ({ employee }) => {
    const filteredDocs = documents.filter(d => d.category === activeDocCategory)
    const { cls, label } = getStatusBadge(employee)
    const showPassword = systemAccountData?.must_change_password === true && systemAccountData?.password_plain
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div><span className="text-dim">Employee ID:</span> {employee.employee_number || '—'}</div>
          <div><span className="text-dim">Status:</span> <span className={`badge ${cls}`}>{label}</span></div>
          <div><span className="text-dim">Employment Type:</span> {employee.employment_type || '—'}</div>
          <div><span className="text-dim">Designation:</span> {getDesignationTitle(employee.designation_id)}</div>
          <div><span className="text-dim">Department:</span> {getDepartmentName(employee.department_id)}</div>
          <div><span className="text-dim">Phone:</span> {employee.phone || '—'}</div>
          <div><span className="text-dim">Email:</span> {employee.email || '—'}</div>
          <div><span className="text-dim">Hire Date:</span> {employee.hire_date || '—'}</div>
          <div><span className="text-dim">Date of Birth:</span> {employee.date_of_birth || '—'}</div>
          <div style={{ gridColumn: 'span 2' }}><span className="text-dim">Address:</span> {employee.residential_address || '—'}</div>
          <div><span className="text-dim">Emergency Name:</span> {employee.emergency_name || '—'}</div>
          <div><span className="text-dim">Emergency Phone:</span> {employee.emergency_phone || '—'}</div>
          {employee.system_username && (
            <div style={{ gridColumn: 'span 2', background: 'var(--surface2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>System Account</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><span className="text-dim">Username: </span><strong style={{ fontFamily: 'var(--mono)' }}>{employee.system_username}</strong></div>
                {showPassword ? (
                  <div><span className="text-dim">Temp Password: </span><strong style={{ fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>{systemAccountData.password_plain}</strong><span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>(not yet changed)</span></div>
                ) : employee.system_user_id ? (
                  <div><span className="text-dim">Password: </span><span style={{ color: 'var(--green)', fontSize: 12 }}><span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>Changed by employee</span></div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}><span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>folder</span>Documents</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {docCategories.map(cat => (
              <button key={cat.id} onClick={() => setActiveDocCategory(cat.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)', background: activeDocCategory === cat.id ? 'var(--gold)' : 'transparent', color: activeDocCategory === cat.id ? '#0b0f1a' : 'var(--text-mid)', cursor: 'pointer', fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>{cat.icon}</span>{cat.label}
              </button>
            ))}
          </div>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>upload</span> Upload {docCategories.find(c => c.id === activeDocCategory)?.label}
            <input type="file" hidden accept={docCategories.find(c => c.id === activeDocCategory)?.accept} disabled={uploading} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0], activeDocCategory); e.target.value = '' }} />
          </label>
          {uploading && <span style={{ fontSize: 12, marginLeft: 8 }}>Uploading…</span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredDocs.length === 0 && <div className="empty-state" style={{ padding: 20 }}>No documents in this category</div>}
            {filteredDocs.map(doc => {
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.name)
              return (
                <div key={doc.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span className="material-icons" style={{ fontSize: 22, color: isImage ? 'var(--teal)' : 'var(--blue)' }}>{isImage ? 'image' : 'description'}</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{doc.name}</div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}</div></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span></a>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDocument(doc.path)}><span className="material-icons" style={{ fontSize: 14 }}>delete</span></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ✅ NEW: Compensation tab
  const CompensationTab = ({ employee }) => {
    const gross = compForm.basic_salary + compForm.allowances
    const payeAmount  = gross * (compForm.paye_rate / 100)
    const nssaAmount  = gross * (compForm.nssa_rate / 100)
    const aidsAmount  = payeAmount * (compForm.aids_levy_rate / 100)
    const totalDeduct = payeAmount + nssaAmount + aidsAmount + compForm.medical_aid + compForm.other_deductions
    const netPay      = gross - totalDeduct

    return (
      <div>
        {/* Summary banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Basic Salary',      value: `$${(compForm.basic_salary || 0).toFixed(2)}`,  color: 'var(--teal)'   },
            { label: 'Gross Pay',         value: `$${gross.toFixed(2)}`,                          color: 'var(--blue)'   },
            { label: 'Total Deductions',  value: `$${totalDeduct.toFixed(2)}`,                    color: 'var(--red)'    },
            { label: 'Est. Net Pay',      value: `$${netPay.toFixed(2)}`,                         color: 'var(--green)'  },
          ].map(item => (
            <div key={item.label} className="kpi-card" style={{ padding: 12 }}>
              <div className="kpi-label">{item.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: item.color, fontFamily: 'var(--mono)' }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Pay components */}
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Pay Components</div>
            <div className="form-group"><label>Basic Salary ($/month) *</label><input type="number" step="0.01" min="0" className="form-control" value={compForm.basic_salary} onChange={e => setCompForm(p => ({ ...p, basic_salary: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="form-group"><label>Fixed Allowances ($/month)</label><input type="number" step="0.01" min="0" className="form-control" value={compForm.allowances} onChange={e => setCompForm(p => ({ ...p, allowances: parseFloat(e.target.value) || 0 }))} /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Housing, transport, or other fixed monthly allowances</small></div>
          </div>

          {/* Deductions */}
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Statutory Deductions</div>
            <div className="form-group"><label>PAYE Rate (%)</label><input type="number" step="0.1" min="0" max="100" className="form-control" value={compForm.paye_rate} onChange={e => setCompForm(p => ({ ...p, paye_rate: parseFloat(e.target.value) || 0 }))} /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>= ${payeAmount.toFixed(2)}/month · Progressive — adjust per tax bracket</small></div>
            <div className="form-group"><label>NSSA Rate (%) <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Zimbabwe std 4.5%</span></label><input type="number" step="0.1" min="0" className="form-control" value={compForm.nssa_rate} onChange={e => setCompForm(p => ({ ...p, nssa_rate: parseFloat(e.target.value) || 0 }))} /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>= ${nssaAmount.toFixed(2)}/month</small></div>
            <div className="form-group"><label>Aids Levy Rate (% of PAYE) <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Std 3%</span></label><input type="number" step="0.1" min="0" className="form-control" value={compForm.aids_levy_rate} onChange={e => setCompForm(p => ({ ...p, aids_levy_rate: parseFloat(e.target.value) || 0 }))} /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>= ${aidsAmount.toFixed(2)}/month</small></div>
          </div>

          {/* Other deductions */}
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Other Deductions</div>
            <div className="form-group"><label>Medical Aid ($/month)</label><input type="number" step="0.01" min="0" className="form-control" value={compForm.medical_aid} onChange={e => setCompForm(p => ({ ...p, medical_aid: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="form-group"><label>Other Deductions ($/month)</label><input type="number" step="0.01" min="0" className="form-control" value={compForm.other_deductions} onChange={e => setCompForm(p => ({ ...p, other_deductions: parseFloat(e.target.value) || 0 }))} /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loans, salary advances, etc.</small></div>
          </div>

          {/* Banking */}
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Banking & Compliance</div>
            <div className="form-group"><label>Bank Name</label><input className="form-control" value={compForm.bank_name} onChange={e => setCompForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. CBZ, Steward Bank" /></div>
            <div className="form-group"><label>Bank Account Number</label><input className="form-control" value={compForm.bank_account} onChange={e => setCompForm(p => ({ ...p, bank_account: e.target.value }))} /></div>
            <div className="form-group"><label>NSSA Number</label><input className="form-control" value={compForm.nssa_number} onChange={e => setCompForm(p => ({ ...p, nssa_number: e.target.value }))} /></div>
          </div>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-primary" onClick={saveCompensation} disabled={savingComp}>
              <span className="material-icons">save</span>
              {savingComp ? 'Saving…' : 'Save Compensation Details'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const AttendanceTab = ({ employee }) => {
    const ea = getEmployeeAttendance(employee.id)
    const ws = getWeeklyHours(employee.id)
    const th = ea.reduce((s, a) => s + (a.total_hours    || 0), 0)
    const to = ea.reduce((s, a) => s + (a.overtime_hours || 0), 0)
    return (
      <div>
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi-card"><div className="kpi-label">Total Hours</div><div className="kpi-val">{th.toFixed(1)}</div><div className="kpi-sub">all time</div></div>
          <div className="kpi-card"><div className="kpi-label">Overtime</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{to.toFixed(1)}</div><div className="kpi-sub">all time</div></div>
          <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-val">{ws.totalHours.toFixed(1)}</div><div className="kpi-sub">hrs ({ws.totalOvertime.toFixed(1)} OT)</div></div>
          <div className="kpi-card"><div className="kpi-label">Records</div><div className="kpi-val">{ea.length}</div><div className="kpi-sub">entries</div></div>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Shift</th><th>Hours</th><th>OT</th><th>Description</th></tr></thead>
            <tbody>
              {ea.map(att => (
                <tr key={att.id}>
                  <td>{att.date}</td><td>{att.clock_in}</td><td>{att.clock_out || '—'}</td>
                  <td><span className="badge badge-blue">{att.shift_type}</span></td>
                  <td>{att.total_hours?.toFixed(1) || '—'}</td>
                  <td>{att.overtime_hours?.toFixed(1) || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 160 }}>{att.work_description || '—'}</td>
                </tr>
              ))}
              {ea.length === 0 && <tr><td colSpan="7" className="empty-state">No attendance records</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const PerformanceTab = ({ employee }) => {
    const empSkills = getEmployeeSkills(employee.id)
    const empCerts  = getEmployeeCertifications(employee.id)
    const isExpiring = (d) => { if (!d) return false; const e = new Date(d), t = new Date(); t.setDate(t.getDate() + 30); return e <= t && e >= new Date() }
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Skills</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {empSkills.map(s => (
              <div key={s.id} className="badge badge-purple" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.skill_name} ({s.proficiency})
                <button onClick={() => handleDeleteSkill(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>close</span>
                </button>
              </div>
            ))}
            {empSkills.length === 0 && <span className="text-dim">No skills added</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" placeholder="New skill" value={newSkill.name} onChange={e => setNewSkill({ ...newSkill, name: e.target.value })} style={{ flex: 2 }} />
            <select className="form-control" value={newSkill.proficiency} onChange={e => setNewSkill({ ...newSkill, proficiency: e.target.value })} style={{ width: 130 }}>
              <option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Expert</option>
            </select>
            <button className="btn btn-primary btn-sm" onClick={handleAddSkill}>Add</button>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700 }}>Certifications</h4>
            <button className="btn btn-primary btn-sm" onClick={() => openCertModal()}><span className="material-icons">add</span> Add</button>
          </div>
          <div className="table-wrap">
            <table className="stock-table">
              <thead><tr><th>Certification</th><th>Issuing Body</th><th>Issue Date</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {empCerts.map(cert => {
                  const expiring = isExpiring(cert.expiry_date)
                  const expired  = cert.expiry_date && new Date(cert.expiry_date) < new Date()
                  return (
                    <tr key={cert.id}>
                      <td style={{ fontWeight: 600 }}>{cert.certification_name}</td>
                      <td>{cert.issuing_body || '—'}</td>
                      <td>{cert.issue_date   || '—'}</td>
                      <td>{cert.expiry_date  || '—'}</td>
                      <td>{expired ? <span className="badge badge-red">Expired</span> : expiring ? <span className="badge badge-yellow">Expiring</span> : <span className="badge badge-green">Valid</span>}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openCertModal(cert)}><span className="material-icons">edit</span></button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCertification(cert.id, cert.certification_name)}><span className="material-icons">delete</span></button>
                      </td>
                    </tr>
                  )
                })}
                {empCerts.length === 0 && <tr><td colSpan="6" className="empty-state">No certifications</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const HistoryTab = ({ employee }) => {
    const history = getEmployeeHistory(employee.id)
    const color   = (a) => a?.includes('CREATE') ? 'var(--green)' : a?.includes('UPDATE') ? 'var(--blue)' : a?.includes('DELETE') ? 'var(--red)' : 'var(--text-dim)'
    return (
      <div className="table-wrap">
        <table className="stock-table">
          <thead><tr><th>Timestamp</th><th>Action</th><th>User</th><th>Changes</th></tr></thead>
          <tbody>
            {history.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ color: color(log.action) }}>{log.action}</td>
                <td>{log.user_name || 'System'}</td>
                <td style={{ fontSize: 12 }}>{log.new_values ? Object.keys(log.new_values).slice(0, 2).join(', ') : '—'}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan="4" className="empty-state">No history</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  const TABS = [
    { id: 'profile',      icon: 'person',          label: 'Profile'      },
    { id: 'compensation', icon: 'payments',         label: 'Compensation' },  // ✅ NEW
    { id: 'attendance',   icon: 'schedule',         label: 'Attendance'   },
    { id: 'performance',  icon: 'trending_up',      label: 'Performance'  },
    { id: 'history',      icon: 'history',          label: 'History'      },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Employees</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => openModal()}><span className="material-icons">add</span> Add Employee</button>}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group"><label>Search</label><input className="form-control" placeholder="Name, phone, ID…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
          <div className="form-group"><label>Department</label><select className="form-control" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}><option value="ALL">All Departments</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className="form-group"><label>Designation</label><select className="form-control" value={filterDesignation} onChange={e => setFilterDesignation(e.target.value)}><option value="ALL">All Designations</option>{designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
          <div className="form-group"><label>Status</label><select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="ALL">All Status</option><option>Active</option><option>On Leave</option><option>Suspended</option><option>Terminated</option></select></div>
          <div className="form-group"><label>Sort</label><select className="form-control" value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="name-asc">Name A-Z</option><option value="name-desc">Name Z-A</option><option value="hire-date-asc">Hire (Oldest)</option><option value="hire-date-desc">Hire (Newest)</option></select></div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {hrLoading ? <div>Loading…</div> : filteredEmployees.length === 0 ? <div className="empty-state">No employees match your filters</div> : filteredEmployees.map(emp => {
          const ws = getWeeklyHours(emp.id)
          const { cls, label } = getStatusBadge(emp)
          return (
            <div key={emp.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => openViewModal(emp)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0b0f1a', flexShrink: 0 }}>{emp.name?.charAt(0).toUpperCase() || '?'}</div>
                  <div><div style={{ fontSize: 16, fontWeight: 700 }}>{emp.name}</div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{emp.employee_number || '—'}</div><div style={{ fontSize: 12 }}>{getDesignationTitle(emp.designation_id)}</div></div>
                </div>
                <div><span className={`badge ${cls}`}>{label}</span><div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{emp.employment_type || 'Full-time'}</div></div>
              </div>
              <div style={{ marginTop: 12 }}>
                {emp.department_id   && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>business</span> {getDepartmentName(emp.department_id)}</div>}
                {emp.phone           && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>phone</span> {emp.phone}</div>}
                {emp.basic_salary > 0 && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>payments</span> ${emp.basic_salary.toLocaleString()}/mo</div>}
                {emp.system_username  && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>account_circle</span> {emp.system_username}</div>}
              </div>
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>schedule</span> This week: <strong>{ws.totalHours.toFixed(1)}h</strong> (OT: {ws.totalOvertime.toFixed(1)}h)</span>
                {canEdit && <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); handleStatusChange(emp, emp.status === 'Active' ? 'On Leave' : 'Active') }}><span className="material-icons" style={{ fontSize: 14 }}>swap_horiz</span></button>}
              </div>
            </div>
          )
        })}
      </div>

      {/* View modal */}
      {viewModalOpen && selectedEmployee && (
        <div className="overlay" onClick={() => setViewModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Employee: <span style={{ color: 'var(--gold)' }}>{selectedEmployee.name}</span></span>
              <div>{canEdit && <button className="btn btn-secondary btn-sm" onClick={editFromView} style={{ marginRight: 8 }}><span className="material-icons">edit</span> Edit</button>}{canDelete && <button className="btn btn-danger btn-sm" onClick={deleteFromView}><span className="material-icons">delete</span> Delete</button>}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="material-icons" style={{ fontSize: 15 }}>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>
            <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 8 }}>
              {activeTab === 'profile'      && <ProfileTab      employee={selectedEmployee} />}
              {activeTab === 'compensation' && <CompensationTab employee={selectedEmployee} />}
              {activeTab === 'attendance'   && <AttendanceTab   employee={selectedEmployee} />}
              {activeTab === 'performance'  && <PerformanceTab  employee={selectedEmployee} />}
              {activeTab === 'history'      && <HistoryTab      employee={selectedEmployee} />}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setViewModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Cert modal */}
      {showCertModal && (
        <div className="overlay" onClick={() => setShowCertModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingCert ? 'Edit' : 'Add'} <span>Certification</span></div>
            <div className="form-group"><label>Name *</label><input className="form-control" required value={certForm.certification_name} onChange={e => setCertForm({ ...certForm, certification_name: e.target.value })} /></div>
            <div className="form-group"><label>Issuing Body</label><input className="form-control" value={certForm.issuing_body} onChange={e => setCertForm({ ...certForm, issuing_body: e.target.value })} /></div>
            <div className="form-row"><div className="form-group"><label>Issue Date</label><input type="date" className="form-control" value={certForm.issue_date} onChange={e => setCertForm({ ...certForm, issue_date: e.target.value })} /></div><div className="form-group"><label>Expiry Date</label><input type="date" className="form-control" value={certForm.expiry_date} onChange={e => setCertForm({ ...certForm, expiry_date: e.target.value })} /></div></div>
            <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={certForm.notes} onChange={e => setCertForm({ ...certForm, notes: e.target.value })} /></div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowCertModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSaveCertification}>Save</button></div>
          </div>
        </div>
      )}

      {/* Credential popup */}
      {credentialModal.open && (
        <div className="overlay" onClick={() => setCredentialModal({ open: false, username: '', password: '', employeeName: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(52,211,153,.15)', border: '2px solid rgba(52,211,153,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <span className="material-icons" style={{ fontSize: 26, color: 'var(--green)' }}>check_circle</span>
              </div>
              <div className="modal-title">Employee <span>Added</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{credentialModal.employeeName}'s account is ready</div>
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Login Credentials</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Username</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>{credentialModal.username}</span></div>
              <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Password</span><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>{credentialModal.password}</span></div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', color: 'var(--yellow)', marginRight: 4 }}>info</span>Must change password on first login</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleCopyCredentials} style={{ width: '100%', justifyContent: 'center' }}><span className="material-icons" style={{ fontSize: 16 }}>content_copy</span> Copy & Close</button>
              <button className="btn btn-secondary" onClick={handleDownloadCredentials} style={{ width: '100%', justifyContent: 'center' }}><span className="material-icons" style={{ fontSize: 16 }}>download</span> Download .txt & Close</button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, color: 'var(--text-dim)' }} onClick={() => setCredentialModal({ open: false, username: '', password: '', employeeName: '' })}>Close without saving</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Employee</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row"><div className="form-group"><label>Full Name *</label><input className="form-control" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div><div className="form-group"><label>Employee Number</label><input className="form-control" disabled value={form.employee_number || (manualEmployeeId ? 'Enter manually' : 'Auto-generated')} /></div></div>
              {!editing && (<div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={manualEmployeeId} onChange={e => setManualEmployeeId(e.target.checked)} /><span>Manually enter existing BRA number</span></label>{manualEmployeeId ? (<div style={{ marginTop: 8 }}><input className="form-control" value={form.employee_number} onChange={e => setForm({ ...form, employee_number: e.target.value.toUpperCase() })} placeholder="BRA185" /><small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Must start with BRA followed by digits</small></div>) : (<div style={{ marginTop: 8, background: 'var(--surface2)', padding: 8, borderRadius: 8, fontSize: 12 }}>Auto-generate next BRA number</div>)}</div>)}
              <div className="form-row"><div className="form-group"><label>Designation *</label><select className="form-control" required value={form.designation_id} onChange={e => setForm({ ...form, designation_id: e.target.value })}><option value="">Select Designation</option>{designations.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div><div className="form-group"><label>Department *</label><select className="form-control" required value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}><option value="">Select Department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div></div>
              <div className="form-row"><div className="form-group"><label>Employment Type</label><select className="form-control" value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}><option>Full-time</option><option>Contract</option><option>Casual</option></select></div><div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>Active</option><option>On Leave</option><option>Suspended</option><option>Terminated</option></select></div></div>
              <div className="form-row"><div className="form-group"><label>Phone</label><input className="form-control" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div><div className="form-group"><label>Email</label><input type="email" className="form-control" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div></div>
              <div className="form-row"><div className="form-group"><label>Hire Date *</label><input type="date" className="form-control" required value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} /></div><div className="form-group"><label>Date of Birth</label><input type="date" className="form-control" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div></div>
              <div className="form-group"><label>Residential Address</label><textarea className="form-control" rows="2" value={form.residential_address} onChange={e => setForm({ ...form, residential_address: e.target.value })} /></div>
              <div className="form-row"><div className="form-group"><label>Emergency Contact Name</label><input className="form-control" value={form.emergency_name} onChange={e => setForm({ ...form, emergency_name: e.target.value })} /></div><div className="form-group"><label>Emergency Contact Phone</label><input className="form-control" value={form.emergency_phone} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} /></div></div>
              {!editing && leaveTypesList.length > 0 && (<div className="card" style={{ marginTop: 16, padding: 16, background: 'var(--surface2)' }}><h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Leave Balances (Initial)</h4><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>{leaveTypesList.map(lt => { const cur = initialBalances.find(b => b.leave_type_id === lt.id); return (<div key={lt.id} className="form-group"><label>{lt.name}</label><input type="number" step="0.5" min="0" className="form-control" value={cur?.total_days ?? 0} onChange={e => { const val = parseFloat(e.target.value) || 0; setInitialBalances(prev => { const ex = prev.find(b => b.leave_type_id === lt.id); if (ex) return prev.map(b => b.leave_type_id === lt.id ? { ...b, total_days: val } : b); return [...prev, { leave_type_id: lt.id, total_days: val }] }) }} /></div>) })}</div></div>)}
              {!editing && (<div className="form-group" style={{ marginTop: 16 }}><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)} /><span>Create system account (username + password)</span></label>{createAccount && (<div style={{ marginTop: 8 }}><label>System Role</label><select className="form-control" value={accountRoleId} onChange={e => setAccountRoleId(e.target.value)}><option value="role_super_admin">Super Admin</option><option value="role_hr_manager">HR Manager</option><option value="role_dept_manager">Department Manager</option><option value="role_storekeeper">Storekeeper</option><option value="role_fuel_attendant">Fuel Attendant</option><option value="role_viewer">Viewer</option></select></div>)}</div>)}
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">{editing ? 'Save' : (createAccount ? 'Add & Create Account' : 'Add Employee')}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
