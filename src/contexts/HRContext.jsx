import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const HRContext = createContext(null)

export function HRProvider({ children }) {
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [permissions, setPermissions] = useState([])
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])
  const [certifications, setCertifications] = useState([])
  const [empCertifications, setEmpCertifications] = useState([])
  const [travelRequests, setTravelRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, deptRes, desRes, permRes, ltRes, lrRes, certRes, empCertRes, travelRes] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('designations').select('*').order('title'),
        supabase.from('user_permissions').select('*'),
        supabase.from('leave_types').select('*'),
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('certifications').select('*').order('name'),
        supabase.from('employee_certifications').select('*'),
        supabase.from('travel_requests').select('*').order('created_at', { ascending: false }),
      ])
      if (empRes.data) setEmployees(empRes.data)
      if (deptRes.data) setDepartments(deptRes.data)
      if (desRes.data) setDesignations(desRes.data)
      if (permRes.data) setPermissions(permRes.data)
      if (ltRes.data) setLeaveTypes(ltRes.data)
      if (lrRes.data) setLeaveRequests(lrRes.data)
      if (certRes.data) setCertifications(certRes.data)
      if (empCertRes.data) setEmpCertifications(empCertRes.data)
      if (travelRes.data) setTravelRequests(travelRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load HR data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Helper: generate unique username from full name
  const generateUsername = (fullName) => {
    const base = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    let username = base
    let i = 1
    const existingUsernames = employees.flatMap(e => e.system_username ? [e.system_username] : [])
    while (existingUsernames.includes(username)) {
      username = `${base}${i}`
      i++
    }
    return username
  }

  // Create system account for employee
  const createSystemAccount = async (employeeId, fullName, role = 'viewer') => {
    const username = generateUsername(fullName)
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
    return { username, password: rawPassword, userId: data.id }
  }

  // ---- Employees CRUD ----
  const addEmployee = async (employee, createAccount = false, accountRole = 'viewer') => {
    const id = generateId()
    const newEmployee = { id, ...employee, created_at: new Date().toISOString() }
    let accountInfo = null
    if (createAccount) {
      accountInfo = await createSystemAccount(id, employee.name, accountRole)
      newEmployee.system_username = accountInfo.username
      newEmployee.system_user_id = accountInfo.userId
    }
    const { error } = await supabase.from('employees').insert([newEmployee])
    if (error) throw error
    await fetchAll()
    return accountInfo
  }

  const updateEmployee = async (id, updates) => {
    const { error } = await supabase.from('employees').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.system_user_id) {
      await supabase.from('app_users').delete().eq('id', emp.system_user_id)
    }
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---- Departments CRUD ----
  const addDepartment = async (dept) => {
    const id = generateId()
    const { error } = await supabase.from('departments').insert([{ id, ...dept, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateDepartment = async (id, updates) => {
    const { error } = await supabase.from('departments').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteDepartment = async (id) => {
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw error
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

  // ---- Permissions ----
  const setUserPermissions = async (userId, permissionsList) => {
    for (const perm of permissionsList) {
      const { error } = await supabase.from('user_permissions').upsert({
        user_id: userId,
        module_name: perm.module,
        page_name: perm.page,
        can_view: perm.can_view,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
        can_approve: perm.can_approve,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, module_name, page_name' })
      if (error) throw error
    }
    await fetchAll()
  }

  const getUserPermissions = (userId) => {
    return permissions.filter(p => p.user_id === userId)
  }

  // ---- Leave Requests ----
  const addLeaveRequest = async (request) => {
    const id = generateId()
    const { error } = await supabase.from('leave_requests').insert([{ id, ...request, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateLeaveRequest = async (id, updates) => {
    const { error } = await supabase.from('leave_requests').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---- Travel Requests ----
  const addTravelRequest = async (travel) => {
    const id = generateId()
    const { error } = await supabase.from('travel_requests').insert([{ id, ...travel, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateTravelRequest = async (id, updates) => {
    const { error } = await supabase.from('travel_requests').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  return (
    <HRContext.Provider value={{
      employees, departments, designations, permissions, leaveTypes, leaveRequests,
      certifications, empCertifications, travelRequests, loading,
      addEmployee, updateEmployee, deleteEmployee,
      addDepartment, updateDepartment, deleteDepartment,
      addDesignation, updateDesignation, deleteDesignation,
      setUserPermissions, getUserPermissions,
      addLeaveRequest, updateLeaveRequest,
      addTravelRequest, updateTravelRequest,
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
