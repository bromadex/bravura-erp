// src/contexts/HRContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { calculateDailyOvertime, getWeekStartEnd } from '../utils/attendanceUtils'

const HRContext = createContext(null)

export function HRProvider({ children }) {
  // ========== Core State ==========
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [attendance, setAttendance] = useState([])
  const [skills, setSkills] = useState([])
  const [certifications, setCertifications] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)

  // ========== Leave Management State (Stage 10.1) ==========
  const [leaveTypes, setLeaveTypes] = useState([])
  const [leaveBalances, setLeaveBalances] = useState([])
  const [leaveRequests, setLeaveRequests] = useState([])

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // ========== Employee Number Generation ==========
  const generateEmployeeNumber = async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('employee_number')
      .ilike('employee_number', 'BRA%')

    if (error) {
      console.error('Error fetching employee numbers:', error)
      return `BRA${Date.now().toString().slice(-6)}`
    }

    let maxNum = 160
    data?.forEach(emp => {
      if (emp.employee_number) {
        const num = parseInt(emp.employee_number.replace(/^BRA/i, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })

    return `BRA${maxNum + 1}`
  }

  // ========== Audit Log Helper ==========
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

  // ========== Create System Account ==========
  const createSystemAccount = async (employeeId, fullName, roleId = 'role_viewer') => {
    let baseUsername = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    if (!baseUsername) baseUsername = 'user'

    let username = baseUsername
    let counter = 1
    let exists = true

    while (exists) {
      const { data, error } = await supabase
        .from('app_users')
        .select('username')
        .eq('username', username)
        .maybeSingle()
      if (error || !data) {
        exists = false
      } else {
        counter++
        username = `${baseUsername}${counter}`
      }
    }

    const rawPassword = Math.random().toString(36).slice(-8) + (Math.floor(Math.random() * 90) + 10)

    const { data, error } = await supabase.from('app_users').insert([{
      id: generateId(),
      username,
      full_name: fullName,
      role_id: roleId,
      is_active: true,
      must_change_password: true,
      password_plain: rawPassword,
      password_hash: btoa(rawPassword),
      employee_id: employeeId,
      created_at: new Date().toISOString()
    }]).select().single()

    if (error) throw error
    await logHRAction('CREATE_ACCOUNT', 'user', data.id, username, null, { roleId })
    return { username, password: rawPassword, userId: data.id }
  }

  // ========== Attendance Status Validation ==========
  const canPerformAttendance = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId)
    if (!employee) return { allowed: false, reason: 'Employee not found' }
    if (employee.status === 'Terminated') return { allowed: false, reason: 'Terminated employees cannot clock in' }
    if (employee.status === 'On Leave') return { allowed: false, reason: 'Employee is on leave' }
    if (employee.status !== 'Active') return { allowed: false, reason: 'Employee status does not allow attendance' }
    return { allowed: true, reason: null }
  }

  // ========== Fetch All Data (including leave) ==========
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        empRes, deptRes, desRes, attRes, skillRes, certRes, auditRes,
        leaveTypesRes, leaveBalancesRes, leaveRequestsRes
      ] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('designations').select('*').order('title'),
        supabase.from('employee_attendance').select('*').order('date', { ascending: false }),
        supabase.from('employee_skills').select('*'),
        supabase.from('employee_certifications').select('*'),
        supabase.from('hr_audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('leave_types').select('*').order('name'),
        supabase.from('leave_balances').select('*, leave_types(name)'),
        supabase.from('leave_requests').select('*, leave_types(name), employees(name)').order('created_at', { ascending: false })
      ])

      if (empRes.data) setEmployees(empRes.data)
      if (deptRes.data) setDepartments(deptRes.data)
      if (desRes.data) setDesignations(desRes.data)
      if (attRes.data) setAttendance(attRes.data)
      if (skillRes.data) setSkills(skillRes.data)
      if (certRes.data) setCertifications(certRes.data)
      if (auditRes.data) setAuditLogs(auditRes.data)
      if (leaveTypesRes.data) setLeaveTypes(leaveTypesRes.data)
      if (leaveBalancesRes.data) setLeaveBalances(leaveBalancesRes.data)
      if (leaveRequestsRes.data) setLeaveRequests(leaveRequestsRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load HR data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ========== Auto‑create leave balances for new employee ==========
  const createLeaveBalancesForEmployee = async (employeeId) => {
    const { data: leaveTypeList } = await supabase.from('leave_types').select('id')
    if (!leaveTypeList?.length) return

    const currentYear = new Date().getFullYear()
    const balanceInserts = []
    for (const lt of leaveTypeList) {
      balanceInserts.push({
        id: generateId(),
        employee_id: employeeId,
        leave_type_id: lt.id,
        total_days: 0,
        used_days: 0,
        year: currentYear
      })
      balanceInserts.push({
        id: generateId(),
        employee_id: employeeId,
        leave_type_id: lt.id,
        total_days: 0,
        used_days: 0,
        year: currentYear - 1
      })
    }
    if (balanceInserts.length) {
      await supabase.from('leave_balances').insert(balanceInserts)
    }
  }

  // ========== Employees CRUD ==========
  const addEmployee = async (employee, createAccount = false, accountRoleId = 'role_viewer') => {
    const id = generateId()
    const employeeNumber = await generateEmployeeNumber()

    const { employee_number: _discard, ...employeeData } = employee

    const newEmployee = {
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...employeeData,
      employee_number: employeeNumber,
    }

    let accountInfo = null
    if (createAccount) {
      accountInfo = await createSystemAccount(id, employee.name, accountRoleId)
      newEmployee.system_username = accountInfo.username
      newEmployee.system_user_id = accountInfo.userId
    }

    const { error } = await supabase.from('employees').insert([newEmployee])
    if (error) {
      if (accountInfo?.userId) {
        await supabase.from('app_users').delete().eq('id', accountInfo.userId)
      }
      throw new Error(error.message)
    }

    // ✅ Create leave balances for this new employee
    await createLeaveBalancesForEmployee(id)

    await logHRAction('CREATE_EMPLOYEE', 'employee', id, employee.name, null, employeeData)
    await fetchAll()
    return accountInfo
  }

  const updateEmployee = async (id, updates) => {
    const oldEmployee = employees.find(e => e.id === id)
    const { error } = await supabase.from('employees').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('UPDATE_EMPLOYEE', 'employee', id, oldEmployee?.name, oldEmployee, updates)
    await fetchAll()
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.system_user_id) {
      await supabase.from('app_users').delete().eq('id', emp.system_user_id)
    }
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('DELETE_EMPLOYEE', 'employee', id, emp?.name, emp, null)
    await fetchAll()
  }

  const setEmployeeStatus = async (id, newStatus) => {
    const emp = employees.find(e => e.id === id)
    const oldStatus = emp?.status
    if (oldStatus === newStatus) return
    await updateEmployee(id, { status: newStatus })
    await logHRAction('STATUS_CHANGE', 'employee', id, emp?.name, { status: oldStatus }, { status: newStatus })
  }

  // ========== Departments CRUD ==========
  const addDepartment = async (dept) => {
    const id = generateId()
    const { error } = await supabase.from('departments').insert([{ id, ...dept, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await logHRAction('CREATE_DEPARTMENT', 'department', id, dept.name, null, dept)
    await fetchAll()
  }

  const updateDepartment = async (id, updates) => {
    const oldDept = departments.find(d => d.id === id)
    const { error } = await supabase.from('departments').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
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
    if (error) throw new Error(error.message)
    await logHRAction('DELETE_DEPARTMENT', 'department', id, dept?.name, dept, null)
    await fetchAll()
  }

  // ========== Designations CRUD ==========
  const addDesignation = async (des) => {
    const id = generateId()
    const { error } = await supabase.from('designations').insert([{ id, ...des, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const updateDesignation = async (id, updates) => {
    const { error } = await supabase.from('designations').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteDesignation = async (id) => {
    const { error } = await supabase.from('designations').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ========== Attendance Methods ==========
  const clockIn = async (employeeId, date, shiftType = 'Day') => {
    const statusCheck = canPerformAttendance(employeeId)
    if (!statusCheck.allowed) { toast.error(statusCheck.reason); return }
    const existing = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (existing) throw new Error('Already clocked in for today')
    const id = generateId()
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const { error } = await supabase.from('employee_attendance').insert([{ id, employee_id: employeeId, date, clock_in: time, shift_type: shiftType }])
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('CLOCK_IN', 'attendance', id, `${employeeId} on ${date}`, null, { time })
  }

  const clockOut = async (employeeId, date) => {
    const statusCheck = canPerformAttendance(employeeId)
    if (!statusCheck.allowed) { toast.error(statusCheck.reason); return }
    const record = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (!record) throw new Error('No open clock-in record found')
    const now = new Date()
    const clockOutTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const [inH, inM] = record.clock_in.split(':').map(Number)
    const [outH, outM] = clockOutTime.split(':').map(Number)
    let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
    if (totalMins < 0) totalMins += 24 * 60
    const totalHours = totalMins / 60
    const dailyOvertime = calculateDailyOvertime(record.clock_in, clockOutTime)
    const { error } = await supabase.from('employee_attendance')
      .update({ clock_out: clockOutTime, total_hours: totalHours, overtime_hours: dailyOvertime, updated_at: new Date().toISOString() })
      .eq('id', record.id)
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('CLOCK_OUT', 'attendance', record.id, `${employeeId} on ${date}`, null, { totalHours, dailyOvertime })
  }

  const addAttendanceRecord = async (record) => {
    const id = generateId()
    const { error } = await supabase.from('employee_attendance').insert([{ id, ...record }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ========== Skills Methods ==========
  const addSkill = async (employeeId, skillName, proficiency = 'Intermediate') => {
    const id = generateId()
    const { error } = await supabase.from('employee_skills').insert([{ id, employee_id: employeeId, skill_name: skillName, proficiency }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteSkill = async (id) => {
    const { error } = await supabase.from('employee_skills').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ========== Certifications Methods ==========
  const addCertification = async (cert) => {
    const id = generateId()
    const { error } = await supabase.from('employee_certifications').insert([{ id, ...cert, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const updateCertification = async (id, updates) => {
    const { error } = await supabase.from('employee_certifications').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteCertification = async (id) => {
    const { error } = await supabase.from('employee_certifications').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ========== Timesheet Approval Methods ==========
  const approveAttendance = async (recordId, approverName, canApprove) => {
    if (!canApprove) throw new Error('Unauthorized: you do not have approval permission')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'approved', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', recordId)
      .eq('status', 'pending')
    if (error) throw error
    await fetchAll()
    await logHRAction('APPROVE_ATTENDANCE', 'attendance', recordId)
  }

  const rejectAttendance = async (recordId, approverName, reason, canApprove) => {
    if (!canApprove) throw new Error('Unauthorized: you do not have approval permission')
    if (!reason || reason.trim() === '') throw new Error('Rejection reason is required')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'rejected', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: reason })
      .eq('id', recordId)
      .eq('status', 'pending')
    if (error) throw error
    await fetchAll()
    await logHRAction('REJECT_ATTENDANCE', 'attendance', recordId)
  }

  const bulkApproveAttendance = async (recordIds, approverName, canApprove) => {
    if (!canApprove) throw new Error('Unauthorized: you do not have approval permission')
    if (!recordIds || recordIds.length === 0) throw new Error('No records selected')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'approved', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: null })
      .in('id', recordIds)
      .eq('status', 'pending')
    if (error) throw error
    await fetchAll()
  }

  const updateAttendanceRecord = async (recordId, updates, currentStatus) => {
    if (currentStatus === 'approved') throw new Error('Approved attendance records cannot be edited. Please contact HR.')
    const willResetStatus = currentStatus === 'rejected'
    const updateData = { ...updates, updated_at: new Date().toISOString() }
    if (willResetStatus) {
      updateData.status = 'pending'
      updateData.approved_by = null
      updateData.approved_at = null
      updateData.rejection_reason = null
    }
    const { error } = await supabase.from('employee_attendance').update(updateData).eq('id', recordId)
    if (error) throw error
    await fetchAll()
    return { reset: willResetStatus }
  }

  const deleteAttendanceRecord = async (recordId, currentStatus) => {
    if (currentStatus === 'approved') throw new Error('Approved attendance records cannot be deleted. Please contact HR.')
    const { error } = await supabase.from('employee_attendance').delete().eq('id', recordId)
    if (error) throw error
    await fetchAll()
  }

  // ========== Document Storage Helpers ==========
  const getEmployeeDocuments = async (employeeId) => {
    try {
      const { data, error } = await supabase.storage
        .from('hr-documents')
        .list(`employees/${employeeId}/`, { recursive: true })
      if (error && error.message !== 'The resource was not found') {
        console.error('Error fetching documents:', error)
        return []
      }
      if (!data || !data.length) return []
      return data.map(file => {
        const pathParts = file.name.split('/')
        const category = pathParts[pathParts.length - 2] || 'general'
        const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(file.name)
        return {
          name: file.name.split('/').pop(),
          path: file.name,
          category,
          url: publicUrl,
          size: file.metadata?.size,
          created_at: file.created_at
        }
      })
    } catch (err) {
      console.error('Error:', err)
      return []
    }
  }

  const getExpiringCertifications = () => {
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    return certifications.filter(cert => {
      if (!cert.expiry_date) return false
      const expiry = new Date(cert.expiry_date)
      return expiry <= thirtyDaysFromNow && expiry >= new Date()
    })
  }

  const getWeeklyHours = (employeeId, referenceDate = new Date()) => {
    const { start, end } = getWeekStartEnd(referenceDate)
    const weekRecords = attendance.filter(record =>
      record.employee_id === employeeId &&
      new Date(record.date) >= start &&
      new Date(record.date) <= end &&
      record.clock_out
    )
    const totalHours = weekRecords.reduce((sum, record) => sum + (record.total_hours || 0), 0)
    const totalOvertime = weekRecords.reduce((sum, record) => sum + (record.overtime_hours || 0), 0)
    return { totalHours, totalOvertime, recordCount: weekRecords.length }
  }

  // ========== Permissions Helper ==========
  const setUserPermissions = async (userId, permsList) => {
    await supabase.from('user_permissions').delete().eq('user_id', userId)
    const rows = permsList
      .filter(p => p.can_view || p.can_edit || p.can_delete || p.can_approve)
      .map(p => ({
        id: generateId(),
        user_id: userId,
        module_name: p.module,
        page_name: p.page,
        can_view: p.can_view ?? false,
        can_edit: p.can_edit ?? false,
        can_delete: p.can_delete ?? false,
        can_approve: p.can_approve ?? false,
        created_at: new Date().toISOString(),
      }))
    if (rows.length > 0) {
      const { error } = await supabase.from('user_permissions').insert(rows)
      if (error) throw new Error(error.message)
    }
    await logHRAction('SET_PERMISSIONS', 'user', userId, userId, null, { count: rows.length })
  }

  // ========== Leave Management Helper (balance for a specific employee) ==========
  const getEmployeeLeaveBalance = (employeeId, leaveTypeId, year = new Date().getFullYear()) => {
    return leaveBalances.find(b => b.employee_id === employeeId && b.leave_type_id === leaveTypeId && b.year === year)
  }

  // ========== Provider Value ==========
  return (
    <HRContext.Provider value={{
      // Core
      employees, departments, designations, attendance, skills, certifications, auditLogs, loading,
      // Leave
      leaveTypes, leaveBalances, leaveRequests,
      getEmployeeLeaveBalance,
      // Employees
      addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus,
      // Departments
      addDepartment, updateDepartment, deleteDepartment,
      // Designations
      addDesignation, updateDesignation, deleteDesignation,
      // Attendance
      clockIn, clockOut, addAttendanceRecord,
      approveAttendance, rejectAttendance, bulkApproveAttendance,
      updateAttendanceRecord, deleteAttendanceRecord,
      // Skills & Certifications
      addSkill, deleteSkill,
      addCertification, updateCertification, deleteCertification,
      // Helpers
      getExpiringCertifications,
      getEmployeeDocuments,
      getWeeklyHours,
      canPerformAttendance,
      setUserPermissions,
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
