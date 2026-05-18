// src/contexts/ShiftContext.jsx
// Provides shift management state and actions:
//   shiftTypes, shiftLocations, shiftAssignments, holidayLists, attendanceRequests
// All mutations refresh the full dataset via fetchAll().

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'
import { startWorkflow } from '../engine/workflowEngine'
import { pushNotificationToRole } from '../engine/notificationEngine'

const ShiftContext = createContext(null)

export function ShiftProvider({ children }) {
  const [shiftTypes,          setShiftTypes]          = useState([])
  const [shiftLocations,      setShiftLocations]      = useState([])
  const [shiftAssignments,    setShiftAssignments]    = useState([])
  const [holidayLists,        setHolidayLists]        = useState([])
  const [holidayListDates,    setHolidayListDates]    = useState([])
  const [attendanceRequests,  setAttendanceRequests]  = useState([])
  const [loading,             setLoading]             = useState(true)

  const generateId = () => crypto.randomUUID()

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [stRes, slRes, saRes, hlRes, hldRes, arRes] = await Promise.all([
        supabase.from('shift_types').select('*').order('name'),
        supabase.from('shift_locations').select('*').order('name'),
        supabase.from('shift_assignments').select('*').order('created_at', { ascending: false }),
        supabase.from('holiday_lists').select('*').order('name'),
        supabase.from('holiday_list_dates').select('*').order('holiday_date'),
        supabase.from('attendance_requests').select('*').order('created_at', { ascending: false }),
      ])
      if (stRes.data)  setShiftTypes(stRes.data)
      if (slRes.data)  setShiftLocations(slRes.data)
      if (saRes.data)  setShiftAssignments(saRes.data)
      if (hlRes.data)  setHolidayLists(hlRes.data)
      if (hldRes.data) setHolidayListDates(hldRes.data)
      if (arRes.data)  setAttendanceRequests(arRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load shift data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Shift Types ─────────────────────────────────────────────────────────────
  const addShiftType = async (data) => {
    const id = generateId()
    const { error } = await supabase.from('shift_types').insert([{ id, ...data, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await auditLog({ module: 'hr', action: 'CREATE', entityType: 'shift_type', entityId: id, entityName: data.name, newValues: data }).catch(() => {})
    await fetchAll()
  }

  const updateShiftType = async (id, updates) => {
    const old = shiftTypes.find(s => s.id === id)
    const { error } = await supabase.from('shift_types').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await auditLog({ module: 'hr', action: 'UPDATE', entityType: 'shift_type', entityId: id, entityName: old?.name, oldValues: old, newValues: updates }).catch(() => {})
    await fetchAll()
  }

  const deleteShiftType = async (id) => {
    const old = shiftTypes.find(s => s.id === id)
    const { error } = await supabase.from('shift_types').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await auditLog({ module: 'hr', action: 'DELETE', entityType: 'shift_type', entityId: id, entityName: old?.name, oldValues: old }).catch(() => {})
    await fetchAll()
  }

  // ── Shift Locations ─────────────────────────────────────────────────────────
  const addShiftLocation = async (data) => {
    const id = generateId()
    const { error } = await supabase.from('shift_locations').insert([{ id, ...data, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteShiftLocation = async (id) => {
    const { error } = await supabase.from('shift_locations').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── Shift Assignments ───────────────────────────────────────────────────────
  const assignShift = async (data) => {
    // data: { employee_id, shift_type_id, shift_location_id, start_date, end_date, created_by }
    const id = generateId()
    const { error } = await supabase.from('shift_assignments').insert([{
      id,
      ...data,
      status: 'Active',
      created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    await auditLog({ module: 'hr', action: 'CREATE', entityType: 'shift_assignment', entityId: id, entityName: data.employee_id, newValues: data }).catch(() => {})
    await fetchAll()
  }

  const updateShiftAssignment = async (id, updates) => {
    const { error } = await supabase.from('shift_assignments').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const endShiftAssignment = async (id) => {
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('shift_assignments')
      .update({ status: 'Inactive', end_date: today })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── Holiday Lists ───────────────────────────────────────────────────────────
  const addHolidayList = async (data) => {
    const id = generateId()
    const { error } = await supabase.from('holiday_lists').insert([{ id, ...data, created_at: new Date().toISOString() }])
    if (error) throw new Error(error.message)
    await fetchAll()
    return id
  }

  const deleteHolidayList = async (id) => {
    // Delete child dates first (cascade may not be set in all environments)
    await supabase.from('holiday_list_dates').delete().eq('holiday_list_id', id)
    const { error } = await supabase.from('holiday_lists').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const addHolidayDate = async (holidayListId, data) => {
    // data: { holiday_date, description, weekly_off }
    const id = generateId()
    const { error } = await supabase.from('holiday_list_dates').insert([{
      id,
      holiday_list_id: holidayListId,
      ...data,
      created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteHolidayDate = async (id) => {
    const { error } = await supabase.from('holiday_list_dates').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── Attendance Requests (Regularization) ────────────────────────────────────
  const createAttendanceRequest = async (data) => {
    // data: { employee_id, from_date, to_date, half_day, half_day_date, reason, explanation, shift_type_id }
    const id = generateId()
    const { error } = await supabase.from('attendance_requests').insert([{
      id,
      ...data,
      status: 'pending',
      created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)

    // Start workflow (non-fatal if no workflow configured for attendance_requests)
    let workflowInstanceId = null
    try {
      const instance = await startWorkflow('attendance_requests', id, data.employee_id)
      workflowInstanceId = instance?.id || null
      if (workflowInstanceId) {
        await supabase.from('attendance_requests').update({ workflow_instance_id: workflowInstanceId }).eq('id', id)
      }
    } catch { /* workflow not configured — continue */ }

    // Notify HR role
    await pushNotificationToRole('role_hr_manager', {
      type: 'attendance_request',
      title: 'New Attendance Regularization Request',
      message: `An employee has submitted an attendance regularization request for ${data.from_date}${data.to_date !== data.from_date ? ` – ${data.to_date}` : ''}.`,
      link: '/module/hr/attendance-requests',
    }).catch(() => {})

    await fetchAll()
    return id
  }

  const approveAttendanceRequest = async (id, approverName) => {
    const req = attendanceRequests.find(r => r.id === id)
    if (!req) throw new Error('Request not found')

    const { error } = await supabase
      .from('attendance_requests')
      .update({ status: 'approved', approved_by: approverName, approved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)

    // Upsert employee_attendance for each date in range as Present
    try {
      const start = new Date(req.from_date)
      const end   = new Date(req.to_date)
      const rows  = []
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        rows.push({
          id:          generateId(),
          employee_id: req.employee_id,
          date:        dateStr,
          status:      req.half_day && req.half_day_date === dateStr ? 'Half Day' : 'Present',
          shift_type:  'Day',
          source:      'regularization',
          created_at:  new Date().toISOString(),
        })
      }
      if (rows.length) {
        await supabase.from('employee_attendance').upsert(rows, { onConflict: 'employee_id,date', ignoreDuplicates: false })
      }
    } catch { /* non-fatal */ }

    // Notify employee
    try {
      const { data: empUser } = await supabase.from('app_users').select('id').eq('employee_id', req.employee_id).maybeSingle()
      if (empUser?.id) {
        const { pushNotification } = await import('../engine/notificationEngine')
        await pushNotification(empUser.id, {
          type: 'attendance_approved',
          title: 'Attendance Request Approved',
          message: `Your attendance regularization request for ${req.from_date} has been approved.`,
          link: '/module/hr/attendance-requests',
        })
      }
    } catch { /* non-fatal */ }

    await auditLog({ module: 'hr', action: 'APPROVE', entityType: 'attendance_request', entityId: id, newValues: { approverName } }).catch(() => {})
    await fetchAll()
  }

  const rejectAttendanceRequest = async (id, reason, approverName) => {
    const req = attendanceRequests.find(r => r.id === id)
    const { error } = await supabase
      .from('attendance_requests')
      .update({ status: 'rejected', rejection_reason: reason, approved_by: approverName, approved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)

    // Notify employee
    try {
      if (req?.employee_id) {
        const { data: empUser } = await supabase.from('app_users').select('id').eq('employee_id', req.employee_id).maybeSingle()
        if (empUser?.id) {
          const { pushNotification } = await import('../engine/notificationEngine')
          await pushNotification(empUser.id, {
            type: 'attendance_rejected',
            title: 'Attendance Request Rejected',
            message: `Your attendance regularization request was rejected. Reason: ${reason}`,
            link: '/module/hr/attendance-requests',
          })
        }
      }
    } catch { /* non-fatal */ }

    await auditLog({ module: 'hr', action: 'REJECT', entityType: 'attendance_request', entityId: id, newValues: { reason, approverName } }).catch(() => {})
    await fetchAll()
  }

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <ShiftContext.Provider value={{
      // State
      shiftTypes,
      shiftLocations,
      shiftAssignments,
      holidayLists,
      holidayListDates,
      attendanceRequests,
      loading,

      // Shift Types
      addShiftType,
      updateShiftType,
      deleteShiftType,

      // Shift Locations
      addShiftLocation,
      deleteShiftLocation,

      // Shift Assignments
      assignShift,
      updateShiftAssignment,
      endShiftAssignment,

      // Holiday Lists
      addHolidayList,
      deleteHolidayList,
      addHolidayDate,
      deleteHolidayDate,

      // Attendance Requests
      createAttendanceRequest,
      approveAttendanceRequest,
      rejectAttendanceRequest,

      // Utilities
      fetchAll,
    }}>
      {children}
    </ShiftContext.Provider>
  )
}

export function useShift() {
  const ctx = useContext(ShiftContext)
  if (!ctx) throw new Error('useShift must be used inside ShiftProvider')
  return ctx
}
