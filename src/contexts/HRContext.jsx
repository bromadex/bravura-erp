import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const HRContext = createContext(null)

export function HRProvider({ children }) {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [attendance, setAttendance] = useState([])
  const [skills, setSkills] = useState([])
  const [certifications, setCertifications] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // Helper: log HR actions
  const logHRAction = async (action, entityType, entityId, entityName, oldValues = null, newValues = null) => {
    try {
      const user = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
      await supabase.from('hr_audit_logs').insert([{
        id: generateId(),
        user_name: user?.full_name || user?.username || 'System',
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        old_values: oldValues ? JSON.stringify(oldValues) : null,
        new_values: newValues ? JSON.stringify(newValues) : null,
        created_at: new Date().toISOString()
      }])
    } catch (err) { console.warn('Audit log failed:', err) }
  }

  // Helper: generate employee number
  const generateEmployeeNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('employees')
      .select('employee_number')
      .ilike('employee_number', `EMP-${year}-%`)
      .order('employee_number', { ascending: false })
      .limit(1)
    
    let nextNum = 1
    if (data && data.length > 0) {
      const lastNum = parseInt(data[0].employee_number.split('-')[2])
      nextNum = lastNum + 1
    }
    return `EMP-${year}-${String(nextNum).padStart(4, '0')}`
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        empRes, deptRes, desRes, attRes, skillRes, certRes, auditRes
      ] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('designations').select('*').order('title'),
        supabase.from('employee_attendance').select('*').order('date', { ascending: false }),
        supabase.from('employee_skills').select('*'),
        supabase.from('employee_certifications').select('*'),
        supabase.from('hr_audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      if (empRes.data) setEmployees(empRes.data)
      if (deptRes.data) setDepartments(deptRes.data)
      if (desRes.data) setDesignations(desRes.data)
      if (attRes.data) setAttendance(attRes.data)
      if (skillRes.data) setSkills(skillRes.data)
      if (certRes.data) setCertifications(certRes.data)
      if (auditRes.data) setAuditLogs(auditRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load HR data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Helper: create system account
  const createSystemAccount = async (employeeId, fullName, role = 'viewer') => {
    const username = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    const rawPassword = Math.random().toString(36).slice(-8) + (Math.floor(Math.random() * 90) + 10)
    const { data, error } = await supabase.from('app_users').insert([{
      id: generateId(),
      username,
      full_name: fullName,
      role,
      is_active: true,
      password_plain: rawPassword,
      password_hash: btoa(rawPassword),
      employee_id: employeeId,
      created_at: new Date().toISOString()
    }]).select().single()
    if (error) throw error
    await logHRAction('CREATE_ACCOUNT', 'user', data.id, username, null, { role })
    return { username, password: rawPassword, userId: data.id }
  }

  // ---- Employees CRUD ----
  const addEmployee = async (employee, createAccount = false, accountRole = 'viewer') => {
    const id = generateId()
    const employeeNumber = await generateEmployeeNumber()
    const newEmployee = { 
      id, 
      employee_number: employeeNumber,
      ...employee, 
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    let accountInfo = null
    if (createAccount) {
      accountInfo = await createSystemAccount(id, employee.name, accountRole)
      newEmployee.system_username = accountInfo.username
      newEmployee.system_user_id = accountInfo.userId
    }
    const { error } = await supabase.from('employees').insert([newEmployee])
    if (error) throw error
    await logHRAction('CREATE_EMPLOYEE', 'employee', id, employee.name, null, employee)
    await fetchAll()
    return accountInfo
  }

  const updateEmployee = async (id, updates) => {
    const oldEmployee = employees.find(e => e.id === id)
    const { error } = await supabase
      .from('employees')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await logHRAction('UPDATE_EMPLOYEE', 'employee', id, oldEmployee?.name, oldEmployee, updates)
    await fetchAll()
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.system_user_id) {
      await supabase.from('app_users').delete().eq('id', emp.system_user_id)
    }
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) throw error
    await logHRAction('DELETE_EMPLOYEE', 'employee', id, emp?.name, emp, null)
    await fetchAll()
  }

  // Employee status lifecycle
  const setEmployeeStatus = async (id, newStatus) => {
    const emp = employees.find(e => e.id === id)
    const oldStatus = emp?.status
    if (oldStatus === newStatus) return
    await updateEmployee(id, { status: newStatus })
    await logHRAction('STATUS_CHANGE', 'employee', id, emp?.name, { status: oldStatus }, { status: newStatus })
  }

  // ---- Departments CRUD ----
  const addDepartment = async (dept) => {
    const id = generateId()
    const { error } = await supabase.from('departments').insert([{ id, ...dept, created_at: new Date().toISOString() }])
    if (error) throw error
    await logHRAction('CREATE_DEPARTMENT', 'department', id, dept.name, null, dept)
    await fetchAll()
  }

  const updateDepartment = async (id, updates) => {
    const oldDept = departments.find(d => d.id === id)
    const { error } = await supabase.from('departments').update(updates).eq('id', id)
    if (error) throw error
    await logHRAction('UPDATE_DEPARTMENT', 'department', id, oldDept?.name, oldDept, updates)
    await fetchAll()
  }

  const deleteDepartment = async (id) => {
    const dept = departments.find(d => d.id === id)
    const employeesInDept = employees.filter(e => e.department_id === id)
    if (employeesInDept.length > 0) {
      throw new Error(`Cannot delete department with ${employeesInDept.length} employee(s) assigned`)
    }
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw error
    await logHRAction('DELETE_DEPARTMENT', 'department', id, dept?.name, dept, null)
    await fetchAll()
  }

  // ---- Designations CRUD ----
  const addDesignation = async (des) => {
    const id = generateId()
    const { error } = await supabase.from('designations').insert([{ id, ...des, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateDesignation = async (id, updates) => {
    const { error } = await supabase.from('designations').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteDesignation = async (id) => {
    const { error } = await supabase.from('designations').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---- Attendance Methods ----
  const clockIn = async (employeeId, date, shiftType = 'Day') => {
    const existing = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (existing) throw new Error('Already clocked in for today')
    
    const id = generateId()
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const { error } = await supabase.from('employee_attendance').insert([{
      id, employee_id: employeeId, date, clock_in: time, shift_type: shiftType
    }])
    if (error) throw error
    await fetchAll()
    await logHRAction('CLOCK_IN', 'attendance', id, `${employeeId} on ${date}`, null, { time })
  }

  const clockOut = async (employeeId, date) => {
    const record = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (!record) throw new Error('No open clock‑in record found')
    
    const clockInTime = record.clock_in
    const now = new Date()
    const clockOutTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    
    // Calculate hours worked (simplified – assumes same day)
    const [inH, inM] = clockInTime.split(':').map(Number)
    const [outH, outM] = clockOutTime.split(':').map(Number)
    let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (totalMins < 0) totalMins += 24 * 60
    const totalHours = totalMins / 60
    const overtime = Math.max(0, totalHours - 8)
    
    const { error } = await supabase
      .from('employee_attendance')
      .update({ clock_out: clockOutTime, total_hours: totalHours, overtime_hours: overtime, updated_at: new Date().toISOString() })
      .eq('id', record.id)
    if (error) throw error
    await fetchAll()
    await logHRAction('CLOCK_OUT', 'attendance', record.id, `${employeeId} on ${date}`, null, { totalHours, overtime })
  }

  const addAttendanceRecord = async (record) => {
    const id = generateId()
    const { error } = await supabase.from('employee_attendance').insert([{ id, ...record }])
    if (error) throw error
    await fetchAll()
  }

  // ---- Skills Methods ----
  const addSkill = async (employeeId, skillName, proficiency = 'Intermediate') => {
    const id = generateId()
    const { error } = await supabase.from('employee_skills').insert([{ id, employee_id: employeeId, skill_name: skillName, proficiency }])
    if (error) throw error
    await fetchAll()
  }

  const deleteSkill = async (id) => {
    const { error } = await supabase.from('employee_skills').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---- Certifications Methods ----
  const addCertification = async (cert) => {
    const id = generateId()
    const { error } = await supabase.from('employee_certifications').insert([{ id, ...cert, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateCertification = async (id, updates) => {
    const { error } = await supabase.from('employee_certifications').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteCertification = async (id) => {
    const { error } = await supabase.from('employee_certifications').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Helper: get employees with expiring certifications (within 30 days)
  const getExpiringCertifications = () => {
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    return certifications.filter(cert => {
      if (!cert.expiry_date) return false
      const expiry = new Date(cert.expiry_date)
      return expiry <= thirtyDaysFromNow && expiry >= new Date()
    })
  }

  return (
    <HRContext.Provider value={{
      employees, departments, designations, attendance, skills, certifications, auditLogs, loading,
      addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus,
      addDepartment, updateDepartment, deleteDepartment,
      addDesignation, updateDesignation, deleteDesignation,
      clockIn, clockOut, addAttendanceRecord,
      addSkill, deleteSkill,
      addCertification, updateCertification, deleteCertification,
      getExpiringCertifications,
      logHRAction,
      fetchAll,
    }}>
      {children}
    </HRContext.Provider>
  )
}

export function useHR() {
  const ctx = useContext(HRContext)
  if (!ctx) throw new Error('useHR must be used inside HRProvider')
  return ctx
}
