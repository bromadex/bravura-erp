// src/contexts/HRContext.jsx
//
// CHANGES FROM PREVIOUS VERSION:
//
// 1. setEmployeeStatus — pauses / reactivates app_users.is_active when
//    an employee is Suspended, Terminated, or reverted to Active.
//
// 2. approveLeaveRequest — fixes "Request not found" crash.
//    Supervisors' pending lists are fetched fresh from DB (not from
//    leaveRequests state), so leaveRequests.find() returned undefined.
//    Fix: fall back to a direct Supabase query when find() misses.
//    Also sends a notification to the employee after action.
//
// 3. rejectLeaveRequest — same DB-fallback fix + notification.
//
// 4. addLeaveComment — same DB-fallback fix.
//
// 5. createLeaveRequest — notifies the department HOD when an employee
//    submits a leave request, so it appears in the notification bell.
//
// 6. approveAttendance / rejectAttendance / bulkApproveAttendance
//    remain here (added in Tier 1).

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { calculateDailyOvertime, getWeekStartEnd } from '../utils/attendanceUtils'

const HRContext = createContext(null)

export function HRProvider({ children }) {
  const [employees,      setEmployees]      = useState([])
  const [departments,    setDepartments]    = useState([])
  const [designations,   setDesignations]   = useState([])
  const [attendance,     setAttendance]     = useState([])
  const [skills,         setSkills]         = useState([])
  const [certifications, setCertifications] = useState([])
  const [auditLogs,      setAuditLogs]      = useState([])
  const [leaveTypes,     setLeaveTypes]     = useState([])
  const [leaveBalances,  setLeaveBalances]  = useState([])
  const [leaveRequests,  setLeaveRequests]  = useState([])
  const [loading,        setLoading]        = useState(true)

  const generateId = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // ── Employee number generator ──────────────────────────────────
  const generateEmployeeNumber = async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('employee_number')
      .ilike('employee_number', 'BRA%')
    if (error) return `BRA${Date.now().toString().slice(-6)}`
    let maxNum = 160
    data?.forEach(emp => {
      if (emp.employee_number) {
        const num = parseInt(emp.employee_number.replace(/^BRA/i, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    })
    return `BRA${maxNum + 1}`
  }

  // ── Audit log helper ───────────────────────────────────────────
  const logHRAction = async (action, entityType, entityId, entityName, oldValues = null, newValues = null) => {
    try {
      const user = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
      await supabase.from('hr_audit_logs').insert([{
        id:          generateId(),
        user_name:   user?.full_name || user?.username || 'System',
        action,
        entity_type: entityType,
        entity_id:   entityId,
        entity_name: entityName,
        old_values:  oldValues ? JSON.stringify(oldValues) : null,
        new_values:  newValues ? JSON.stringify(newValues) : null,
        created_at:  new Date().toISOString()
      }])
    } catch (err) { console.warn('Audit log failed:', err) }
  }

  // ── Notification helper (non-fatal) ────────────────────────────
  const sendNotification = async (userId, type, title, message, link = '/module/hr/leave') => {
    try {
      await supabase.from('notifications').insert([{
        id:         generateId(),
        user_id:    userId,
        type,
        title,
        message,
        link,
        is_read:    false,
        created_at: new Date().toISOString()
      }])
    } catch { /* notifications are non-fatal */ }
  }

  // ── System account creation ────────────────────────────────────
  const createSystemAccount = async (employeeId, fullName, roleId = 'role_viewer') => {
    let baseUsername = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    if (!baseUsername) baseUsername = 'user'
    let username = baseUsername
    let counter  = 1
    let exists   = true
    while (exists) {
      const { data, error } = await supabase
        .from('app_users')
        .select('username')
        .eq('username', username)
        .maybeSingle()
      if (error || !data) { exists = false } else { counter++; username = `${baseUsername}${counter}` }
    }
    const rawPassword = Math.random().toString(36).slice(-8) + (Math.floor(Math.random() * 90) + 10)
    const { data, error } = await supabase.from('app_users').insert([{
      id:                   generateId(),
      username,
      full_name:            fullName,
      role_id:              roleId,
      is_active:            true,
      must_change_password: true,
      password_plain:       rawPassword,
      password_hash:        btoa(rawPassword),
      employee_id:          employeeId,
      created_at:           new Date().toISOString()
    }]).select().single()
    if (error) throw error
    await logHRAction('CREATE_ACCOUNT', 'user', data.id, username, null, { roleId })
    return { username, password: rawPassword, userId: data.id }
  }

  // ── Attendance status validation ───────────────────────────────
  const canPerformAttendance = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId)
    if (!employee)                        return { allowed: false, reason: 'Employee not found' }
    if (employee.status === 'Terminated') return { allowed: false, reason: 'Terminated employees cannot clock in' }
    if (employee.status === 'On Leave')   return { allowed: false, reason: 'Employee is on leave' }
    if (employee.status !== 'Active')     return { allowed: false, reason: 'Employee status does not allow attendance' }
    return { allowed: true, reason: null }
  }

  // ── Fetch all data ─────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, deptRes, desRes, attRes, skillRes, certRes, auditRes, ltRes, lbRes, lrRes] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('designations').select('*').order('title'),
        supabase.from('employee_attendance').select('*').order('date', { ascending: false }),
        supabase.from('employee_skills').select('*'),
        supabase.from('employee_certifications').select('*'),
        supabase.from('hr_audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('leave_types').select('*').order('name'),
        supabase.from('leave_balances').select('*'),
        supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
      ])
      if (empRes.data)   setEmployees(empRes.data)
      if (deptRes.data)  setDepartments(deptRes.data)
      if (desRes.data)   setDesignations(desRes.data)
      if (attRes.data)   setAttendance(attRes.data)
      if (skillRes.data) setSkills(skillRes.data)
      if (certRes.data)  setCertifications(certRes.data)
      if (auditRes.data) setAuditLogs(auditRes.data)
      if (ltRes.data)    setLeaveTypes(ltRes.data)
      if (lbRes.data)    setLeaveBalances(lbRes.data)
      if (lrRes.data)    setLeaveRequests(lrRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load HR data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Employees CRUD ─────────────────────────────────────────────
  const addEmployee = async (employee, createAccount = false, accountRoleId = 'role_viewer', initialBalances = []) => {
    const id             = generateId()
    const employeeNumber = await generateEmployeeNumber()
    const { employee_number: _discard, ...employeeData } = employee
    const newEmployee = {
      id,
      created_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
      ...employeeData,
      employee_number: employeeNumber,
    }
    let accountInfo = null
    if (createAccount) {
      accountInfo = await createSystemAccount(id, employee.name, accountRoleId)
      newEmployee.system_username = accountInfo.username
      newEmployee.system_user_id  = accountInfo.userId
    }
    const { error } = await supabase.from('employees').insert([newEmployee])
    if (error) {
      if (accountInfo?.userId) await supabase.from('app_users').delete().eq('id', accountInfo.userId)
      throw new Error(error.message)
    }
    // Grant leave permissions to the new user's account
    if (accountInfo?.userId) {
      const leavePerms = [
        { module: 'hr', page: 'leave',         can_view: true,  can_edit: true,  can_delete: false, can_approve: false },
        { module: 'hr', page: 'leave-balance',  can_view: true,  can_edit: false, can_delete: false, can_approve: false },
      ]
      for (const p of leavePerms) {
        await supabase.from('user_permissions').upsert({
          id: generateId(), user_id: accountInfo.userId,
          module_name: p.module, page_name: p.page,
          can_view: p.can_view, can_edit: p.can_edit,
          can_delete: p.can_delete, can_approve: p.can_approve,
        }, { onConflict: 'user_id,module_name,page_name', ignoreDuplicates: false })
      }
      // Welcome notification
      await sendNotification(
        accountInfo.userId,
        'account_created',
        'Welcome to Bravura ERP',
        'Your account has been created. Please change your password on first login.',
        '/change-password'
      )
    }
    // Leave balances
    const currentYear = new Date().getFullYear()
    const { data: allLeaveTypes } = await supabase.from('leave_types').select('id')
    if (allLeaveTypes?.length) {
      const balanceInserts = []
      for (const lt of allLeaveTypes) {
        const initial   = initialBalances.find(b => b.leave_type_id === lt.id)
        const totalDays = initial?.total_days ?? 0
        balanceInserts.push({ id: generateId(), employee_id: id, leave_type_id: lt.id, total_days: totalDays, used_days: 0, year: currentYear })
        balanceInserts.push({ id: generateId(), employee_id: id, leave_type_id: lt.id, total_days: 0,         used_days: 0, year: currentYear - 1 })
      }
      await supabase.from('leave_balances').insert(balanceInserts)
    }
    await logHRAction('CREATE_EMPLOYEE', 'employee', id, employee.name, null, employeeData)
    await fetchAll()
    return accountInfo
  }

  const updateEmployee = async (id, updates) => {
    const oldEmployee = employees.find(e => e.id === id)
    const { error }   = await supabase.from('employees').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('UPDATE_EMPLOYEE', 'employee', id, oldEmployee?.name, oldEmployee, updates)
    await fetchAll()
  }

  const deleteEmployee = async (id) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.system_user_id) await supabase.from('app_users').delete().eq('id', emp.system_user_id)
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('DELETE_EMPLOYEE', 'employee', id, emp?.name, emp, null)
    await fetchAll()
  }

  // ✅ PATCH 1: pause / reactivate system account on status change
  const setEmployeeStatus = async (id, newStatus) => {
    const emp = employees.find(e => e.id === id)
    if (emp?.status === newStatus) return
    await updateEmployee(id, { status: newStatus })

    // Deactivate account for Suspended/Terminated; reactivate for Active
    if (emp?.system_user_id) {
      const isActive = newStatus === 'Active'
      await supabase
        .from('app_users')
        .update({ is_active: isActive })
        .eq('id', emp.system_user_id)
    }

    await logHRAction('STATUS_CHANGE', 'employee', id, emp?.name, { status: emp?.status }, { status: newStatus })
  }

  // ── Departments CRUD ───────────────────────────────────────────
  const addDepartment = async (dept) => {
    const id        = generateId()
    const { error } = await supabase.from('departments').insert([{ id, ...dept, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await logHRAction('CREATE_DEPARTMENT', 'department', id, dept.name, null, dept)
    await fetchAll()
  }

  const updateDepartment = async (id, updates) => {
    const oldDept   = departments.find(d => d.id === id)
    const { error } = await supabase.from('departments').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('UPDATE_DEPARTMENT', 'department', id, oldDept?.name, oldDept, updates)
    await fetchAll()
  }

  const deleteDepartment = async (id) => {
    const dept            = departments.find(d => d.id === id)
    const employeesInDept = employees.filter(e => e.department_id === id)
    if (employeesInDept.length > 0) throw new Error(`Cannot delete department with ${employeesInDept.length} employee(s) assigned`)
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await logHRAction('DELETE_DEPARTMENT', 'department', id, dept?.name, dept, null)
    await fetchAll()
  }

  // ── Designations CRUD ──────────────────────────────────────────
  const addDesignation = async (des) => {
    const id        = generateId()
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

  // ── Attendance methods ─────────────────────────────────────────
  const clockIn = async (employeeId, date, shiftType = 'Day') => {
    const statusCheck = canPerformAttendance(employeeId)
    if (!statusCheck.allowed) { toast.error(statusCheck.reason); return }
    const existing = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (existing) throw new Error('Already clocked in for today')
    const id   = generateId()
    const now  = new Date()
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const { error } = await supabase.from('employee_attendance').insert([{
      id, employee_id: employeeId, date, clock_in: time, shift_type: shiftType, status: 'pending'
    }])
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('CLOCK_IN', 'attendance', id, `${employeeId} on ${date}`, null, { time })
  }

  const clockOut = async (employeeId, date) => {
    const statusCheck = canPerformAttendance(employeeId)
    if (!statusCheck.allowed) { toast.error(statusCheck.reason); return }
    const record = attendance.find(a => a.employee_id === employeeId && a.date === date && !a.clock_out)
    if (!record) throw new Error('No open clock-in record found')
    const now          = new Date()
    const clockOutTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`
    const totalHours   = (() => {
      const [inH, inM]   = record.clock_in.split(':').map(Number)
      const [outH, outM] = clockOutTime.split(':').map(Number)
      let mins = (outH * 60 + outM) - (inH * 60 + inM)
      if (mins < 0) mins += 24 * 60
      return mins / 60
    })()
    const dailyOvertime = calculateDailyOvertime(record.clock_in, clockOutTime)
    const { error } = await supabase.from('employee_attendance')
      .update({ clock_out: clockOutTime, total_hours: totalHours, overtime_hours: dailyOvertime, updated_at: new Date().toISOString() })
      .eq('id', record.id)
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('CLOCK_OUT', 'attendance', record.id, `${employeeId} on ${date}`, null, { totalHours, dailyOvertime })
  }

  const addAttendanceRecord = async (record) => {
    const id        = generateId()
    const { error } = await supabase.from('employee_attendance').insert([{ id, ...record }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const updateAttendanceRecord = async (recordId, updates, currentStatus) => {
    if (currentStatus === 'approved') throw new Error('Approved attendance records cannot be edited.')
    const willResetStatus = currentStatus === 'rejected'
    const updateData = { ...updates, updated_at: new Date().toISOString() }
    if (willResetStatus) {
      updateData.status           = 'pending'
      updateData.approved_by      = null
      updateData.approved_at      = null
      updateData.rejection_reason = null
    }
    const { error } = await supabase.from('employee_attendance').update(updateData).eq('id', recordId)
    if (error) throw new Error(error.message)
    await fetchAll()
    return { reset: willResetStatus }
  }

  const deleteAttendanceRecord = async (recordId, currentStatus) => {
    if (currentStatus === 'approved') throw new Error('Approved attendance records cannot be deleted.')
    const { error } = await supabase.from('employee_attendance').delete().eq('id', recordId)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── Attendance approval (Tier 1) ───────────────────────────────
  const approveAttendance = async (recordId, approverName, canApprove) => {
    if (!canApprove) throw new Error('You do not have approval permission')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'approved', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', recordId)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('APPROVE_ATTENDANCE', 'attendance', recordId, '', null, { approved_by: approverName })
  }

  const rejectAttendance = async (recordId, approverName, reason, canApprove) => {
    if (!canApprove)           throw new Error('You do not have approval permission')
    if (!reason?.trim())       throw new Error('Rejection reason is required')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'rejected', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: reason.trim() })
      .eq('id', recordId)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('REJECT_ATTENDANCE', 'attendance', recordId, '', null, { reason })
  }

  const bulkApproveAttendance = async (recordIds, approverName, canApprove) => {
    if (!canApprove)                           throw new Error('You do not have approval permission')
    if (!Array.isArray(recordIds) || !recordIds.length) throw new Error('No records selected')
    const { error } = await supabase
      .from('employee_attendance')
      .update({ status: 'approved', approved_by: approverName, approved_at: new Date().toISOString(), rejection_reason: null })
      .in('id', recordIds)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    await fetchAll()
    await logHRAction('BULK_APPROVE_ATTENDANCE', 'attendance', recordIds.join(','), '', null, { count: recordIds.length })
  }

  // ── Skills & Certifications ────────────────────────────────────
  const addSkill = async (employeeId, skillName, proficiency = 'Intermediate') => {
    const id        = generateId()
    const { error } = await supabase.from('employee_skills').insert([{ id, employee_id: employeeId, skill_name: skillName, proficiency }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteSkill = async (id) => {
    const { error } = await supabase.from('employee_skills').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const addCertification = async (cert) => {
    const id        = generateId()
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

  // ── Document helpers ───────────────────────────────────────────
  const getEmployeeDocuments = async (employeeId) => {
    try {
      const { data, error } = await supabase.storage.from('hr-documents').list(`employees/${employeeId}/`, { recursive: true })
      if (error && error.message !== 'The resource was not found') return []
      if (!data || !data.length) return []
      return data.map(file => {
        const pathParts = file.name.split('/')
        const category  = pathParts[pathParts.length - 2] || 'general'
        const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(file.name)
        return { name: file.name.split('/').pop(), path: file.name, category, url: publicUrl, size: file.metadata?.size, created_at: file.created_at }
      })
    } catch { return [] }
  }

  const getExpiringCertifications = () => {
    const threshold = new Date()
    threshold.setDate(threshold.getDate() + 30)
    return certifications.filter(cert => {
      if (!cert.expiry_date) return false
      const expiry = new Date(cert.expiry_date)
      return expiry <= threshold && expiry >= new Date()
    })
  }

  const getWeeklyHours = (employeeId, referenceDate = new Date()) => {
    const { start, end } = getWeekStartEnd(referenceDate)
    const weekRecords = attendance.filter(r =>
      r.employee_id === employeeId &&
      new Date(r.date) >= start &&
      new Date(r.date) <= end &&
      r.clock_out
    )
    return {
      totalHours:    weekRecords.reduce((s, r) => s + (r.total_hours    || 0), 0),
      totalOvertime: weekRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0),
      recordCount:   weekRecords.length,
    }
  }

  // ── Leave Management ───────────────────────────────────────────
  const getEmployeeLeaveBalance = (employeeId, leaveTypeId, year = new Date().getFullYear()) => {
    const b = leaveBalances.find(b => b.employee_id === employeeId && b.leave_type_id === leaveTypeId && b.year === year)
    return {
      total:     b?.total_days || 0,
      used:      b?.used_days  || 0,
      remaining: (b?.total_days || 0) - (b?.used_days || 0)
    }
  }

  const hasDateConflict = (employeeId, startDate, endDate, excludeRequestId = null) => {
    return leaveRequests.some(req => {
      if (req.employee_id !== employeeId) return false
      if (excludeRequestId && req.id === excludeRequestId) return false
      if (req.status === 'cancelled' || req.status === 'rejected') return false
      return new Date(startDate) <= new Date(req.end_date) && new Date(endDate) >= new Date(req.start_date)
    })
  }

  // ✅ PATCH 5: createLeaveRequest notifies the department HOD
  const createLeaveRequest = async (requestData) => {
    const id        = generateId()
    const { error } = await supabase
      .from('leave_requests')
      .insert([{ id, ...requestData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    await logHRAction('CREATE_LEAVE_REQUEST', 'leave_request', id, requestData.employee_id, null, requestData)

    // Notify the HOD of the employee's department
    const emp = employees.find(e => e.id === requestData.employee_id)
    if (emp?.department_id) {
      const { data: dept } = await supabase.from('departments').select('hod_id').eq('id', emp.department_id).maybeSingle()
      if (dept?.hod_id) {
        const { data: hodUser } = await supabase.from('app_users').select('id').eq('employee_id', dept.hod_id).maybeSingle()
        if (hodUser?.id) {
          await sendNotification(hodUser.id, 'leave_request', 'New Leave Request', `${emp.name} has submitted a leave request for your approval.`)
        }
      }
    }
    return id
  }

  const updateLeaveRequest = async (id, updates) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await fetchAll()
    await logHRAction('UPDATE_LEAVE_REQUEST', 'leave_request', id, '', null, updates)
  }

  const deleteLeaveRequest = async (id) => {
    const { error } = await supabase.from('leave_requests').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
    await logHRAction('DELETE_LEAVE_REQUEST', 'leave_request', id, '', null, null)
  }

  const getPendingForSupervisor = async (supervisorEmployeeId) => {
    if (!supervisorEmployeeId) return []
    const { data: dept } = await supabase.from('departments').select('id').eq('hod_id', supervisorEmployeeId).maybeSingle()
    if (!dept) return []
    const { data: deptEmps } = await supabase.from('employees').select('id').eq('department_id', dept.id)
    if (!deptEmps?.length) return []
    const { data: pending } = await supabase
      .from('leave_requests')
      .select('*, leave_types(name), employees!leave_requests_employee_id_fkey(name)')
      .in('employee_id', deptEmps.map(e => e.id))
      .eq('status', 'pending_supervisor')
      .order('created_at', { ascending: false })
    return pending || []
  }

  const getPendingForHR = async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, leave_types(name), employees!leave_requests_employee_id_fkey(name)')
      .eq('status', 'pending_hr')
      .order('created_at', { ascending: false })
    if (error) return []
    return data || []
  }

  // ✅ PATCH 2: approveLeaveRequest — DB fallback + notification
  const approveLeaveRequest = async (requestId, approverEmployeeId, approverName, comment = null) => {
    // Fall back to DB if leaveRequests state doesn't have this record
    // (supervisors see requests from other employees, not in their own state)
    let request = leaveRequests.find(r => r.id === requestId)
    if (!request) {
      const { data, error } = await supabase.from('leave_requests').select('*').eq('id', requestId).single()
      if (error || !data) throw new Error('Leave request not found')
      request = data
    }

    let newStatus
    if (request.status === 'pending_supervisor') newStatus = 'pending_hr'
    else if (request.status === 'pending_hr')    newStatus = 'approved'
    else throw new Error(`Cannot approve a request with status: ${request.status}`)

    if (newStatus === 'approved') {
      const hasClockedIn = attendance.some(a => a.employee_id === request.employee_id && a.date === request.start_date && a.clock_in)
      if (hasClockedIn) throw new Error('Employee has already clocked in on the leave start date.')
      const { remaining } = getEmployeeLeaveBalance(request.employee_id, request.leave_type_id)
      if (remaining < request.days_requested) throw new Error(`Insufficient balance. Available: ${remaining} days`)
      const { data: rpcData, error: fnError } = await supabase.rpc('deduct_leave_balance', {
        p_employee_id:   request.employee_id,
        p_leave_type_id: request.leave_type_id,
        p_days:          request.days_requested,
        p_year:          new Date(request.start_date).getFullYear()
      })
      if (fnError) throw new Error('Failed to deduct leave balance')
      if (rpcData === false) throw new Error('Balance insufficient after re-check')
    }

    const updatedComments = [...(request.approver_comments || []), {
      by:        approverName,
      by_id:     approverEmployeeId,
      role:      request.status === 'pending_supervisor' ? 'supervisor' : 'HR',
      action:    'approved',
      comment:   comment || '',
      timestamp: new Date().toISOString()
    }]

    const { error } = await supabase
      .from('leave_requests')
      .update({
        status:            newStatus,
        approver_comments: updatedComments,
        [request.status === 'pending_supervisor' ? 'assigned_supervisor_id' : 'assigned_hr_id']: approverEmployeeId,
        updated_at:        new Date().toISOString(),
        ...(newStatus === 'approved' ? { approved_at: new Date().toISOString() } : {})
      })
      .eq('id', requestId)
    if (error) throw error

    // Notify the employee
    const { data: empUser } = await supabase.from('app_users').select('id').eq('employee_id', request.employee_id).maybeSingle()
    if (empUser?.id) {
      await sendNotification(
        empUser.id,
        newStatus === 'approved' ? 'leave_approved' : 'leave_forwarded',
        newStatus === 'approved' ? 'Leave Approved' : 'Leave Forwarded to HR',
        newStatus === 'approved' ? 'Your leave request has been approved.' : 'Your leave request has been forwarded to HR for final approval.'
      )
    }

    await fetchAll()
    await logHRAction('APPROVE_LEAVE', 'leave_request', requestId, request.employee_id, null, { newStatus, comment })
  }

  // ✅ PATCH 3: rejectLeaveRequest — DB fallback + notification
  const rejectLeaveRequest = async (requestId, approverEmployeeId, approverName, reason) => {
    let request = leaveRequests.find(r => r.id === requestId)
    if (!request) {
      const { data, error } = await supabase.from('leave_requests').select('*').eq('id', requestId).single()
      if (error || !data) throw new Error('Leave request not found')
      request = data
    }

    if (request.status !== 'pending_supervisor' && request.status !== 'pending_hr')
      throw new Error(`Cannot reject a request with status: ${request.status}`)

    const updatedComments = [...(request.approver_comments || []), {
      by:        approverName,
      by_id:     approverEmployeeId,
      role:      request.status === 'pending_supervisor' ? 'supervisor' : 'HR',
      action:    'rejected',
      comment:   reason,
      timestamp: new Date().toISOString()
    }]

    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'rejected', approver_comments: updatedComments, updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) throw error

    // Notify the employee
    const { data: empUser } = await supabase.from('app_users').select('id').eq('employee_id', request.employee_id).maybeSingle()
    if (empUser?.id) {
      await sendNotification(empUser.id, 'leave_rejected', 'Leave Request Rejected', `Your leave request was rejected. Reason: ${reason}`)
    }

    await fetchAll()
    await logHRAction('REJECT_LEAVE', 'leave_request', requestId, request.employee_id, null, { reason })
  }

  // ✅ PATCH 4: addLeaveComment — DB fallback
  const addLeaveComment = async (requestId, approverEmployeeId, approverName, comment, role) => {
    let request = leaveRequests.find(r => r.id === requestId)
    if (!request) {
      const { data, error } = await supabase.from('leave_requests').select('*').eq('id', requestId).single()
      if (error || !data) throw new Error('Leave request not found')
      request = data
    }

    const updatedComments = [...(request.approver_comments || []), {
      by:        approverName,
      by_id:     approverEmployeeId,
      role,
      action:    'commented',
      comment,
      timestamp: new Date().toISOString()
    }]

    const { error } = await supabase
      .from('leave_requests')
      .update({ approver_comments: updatedComments, updated_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) throw error
    await fetchAll()
  }

  // ── Permissions ────────────────────────────────────────────────
  const setUserPermissions = async (userId, permsList) => {
    await supabase.from('user_permissions').delete().eq('user_id', userId)
    const rows = permsList
      .filter(p => p.can_view || p.can_edit || p.can_delete || p.can_approve)
      .map(p => ({
        id:          generateId(),
        user_id:     userId,
        module_name: p.module,
        page_name:   p.page,
        can_view:    p.can_view    ?? false,
        can_edit:    p.can_edit    ?? false,
        can_delete:  p.can_delete  ?? false,
        can_approve: p.can_approve ?? false,
        created_at:  new Date().toISOString(),
      }))
    if (rows.length) {
      const { error } = await supabase.from('user_permissions').insert(rows)
      if (error) throw new Error(error.message)
    }
    await logHRAction('SET_PERMISSIONS', 'user', userId, userId, null, { count: rows.length })
  }

  // ──────────────────────────────────────────────────────────────
  return (
    <HRContext.Provider value={{
      // State
      employees, departments, designations,
      attendance, skills, certifications, auditLogs,
      leaveTypes, leaveBalances, leaveRequests, loading,

      // Employees
      addEmployee, updateEmployee, deleteEmployee, setEmployeeStatus,

      // Departments
      addDepartment, updateDepartment, deleteDepartment,

      // Designations
      addDesignation, updateDesignation, deleteDesignation,

      // Attendance
      clockIn, clockOut,
      addAttendanceRecord, updateAttendanceRecord, deleteAttendanceRecord,
      approveAttendance, rejectAttendance, bulkApproveAttendance,
      canPerformAttendance,

      // Skills & Certs
      addSkill, deleteSkill,
      addCertification, updateCertification, deleteCertification,

      // Documents & Utilities
      getEmployeeDocuments,
      getExpiringCertifications,
      getWeeklyHours,

      // Leave
      getEmployeeLeaveBalance,
      hasDateConflict,
      createLeaveRequest,
      updateLeaveRequest,
      deleteLeaveRequest,
      getPendingForSupervisor,
      getPendingForHR,
      approveLeaveRequest,
      rejectLeaveRequest,
      addLeaveComment,

      // Permissions
      setUserPermissions,

      // Misc
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
