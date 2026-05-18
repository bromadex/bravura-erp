// src/engine/shiftEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Shift Engine — Phase 1 HRMS Expansion
// Manages shift assignments, employee check-ins/check-outs, geofencing,
// automatic attendance processing, late entry / early exit detection.
//
// Rules:
//   • All functions are pure async — they throw on error, never toast or navigate.
//   • Fire-and-forget: auditLog and pushNotification are always .catch(() => {})
//   • IDs: crypto.randomUUID()
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }        from '../lib/supabase'
import { auditLog }        from './auditEngine'
import { pushNotification } from './notificationEngine'

// ── Shift Assignment ─────────────────────────────────────────────────────────

/**
 * Return the active shift assignment (and linked shift type) for an employee on a given date.
 *
 * @param {string} employeeId
 * @param {string} date  ISO date string (YYYY-MM-DD)
 * @returns {{ shiftAssignment: object, shiftType: object } | null}
 */
export async function getActiveShiftForEmployee(employeeId, date) {
  const { data: assignment, error } = await supabase
    .from('shift_assignments')
    .select('*, shift_type:shift_types(*), shift_location:shift_locations(*)')
    .eq('employee_id', employeeId)
    .eq('status', 'Active')
    .lte('start_date', date)
    .or(`end_date.is.null,end_date.gte.${date}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`getActiveShiftForEmployee: ${error.message}`)
  if (!assignment) return null

  return {
    shiftAssignment: assignment,
    shiftType:       assignment.shift_type || null,
    shiftLocation:   assignment.shift_location || null,
  }
}

// ── Geofencing ───────────────────────────────────────────────────────────────

/**
 * Calculate distance between two lat/lon coordinates using the Haversine formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in metres
 */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R    = 6371000 // Earth radius in metres
  const toRad = deg => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ── Check-in Processing ──────────────────────────────────────────────────────

/**
 * Record an employee check-in or check-out.
 *
 * @param {string} employeeId
 * @param {'IN'|'OUT'} logType
 * @param {string} time  ISO timestamp (YYYY-MM-DDTHH:mm:ssZ)
 * @param {object} [options]
 * @param {number} [options.lat]
 * @param {number} [options.lng]
 * @param {string} [options.deviceId]
 * @returns {object} Created employee_checkins record
 */
export async function processCheckin(employeeId, logType, time, options = {}) {
  const { lat, lng, deviceId } = options

  if (!['IN', 'OUT'].includes(logType)) {
    throw new Error(`processCheckin: logType must be 'IN' or 'OUT', got '${logType}'`)
  }

  // Derive the date from the checkin time
  const dateString = new Date(time).toISOString().split('T')[0]

  // Fetch active shift (may be null if no shift configured)
  const shiftData = await getActiveShiftForEmployee(employeeId, dateString)

  let shiftAssignmentId = null
  let offshift          = false

  if (shiftData) {
    shiftAssignmentId = shiftData.shiftAssignment.id

    // Validate geofence if shift has a location and coordinates are provided
    if (shiftData.shiftLocation && lat != null && lng != null) {
      const loc      = shiftData.shiftLocation
      const distance = getDistanceMeters(lat, lng, loc.latitude, loc.longitude)
      if (distance > loc.radius_meters) {
        throw new Error(
          `Check-in rejected: you are ${Math.round(distance)}m from the designated shift ` +
          `location "${loc.name}" (allowed radius: ${loc.radius_meters}m).`
        )
      }
    }
  } else {
    // Allow checkin but flag it as off-shift
    offshift = true
  }

  const checkinId = crypto.randomUUID()
  const now       = new Date().toISOString()

  const { data: checkin, error } = await supabase
    .from('employee_checkins')
    .insert([{
      id:                  checkinId,
      employee_id:         employeeId,
      log_type:            logType,
      time:                time,
      shift_assignment_id: shiftAssignmentId,
      attendance_id:       null,
      latitude:            lat  ?? null,
      longitude:           lng  ?? null,
      device_id:           deviceId ?? null,
      skip_auto_attendance: false,
      offshift,
      created_at:          now,
    }])
    .select()
    .single()

  if (error) throw new Error(`processCheckin: ${error.message}`)

  // If checking out, attempt to auto-process attendance for the day
  if (logType === 'OUT') {
    tryProcessAutoAttendance(employeeId, dateString).catch(err => {
      console.warn('[shiftEngine] tryProcessAutoAttendance failed silently:', err?.message)
    })
  }

  auditLog({
    module:     'shift',
    action:     'CREATE',
    entityType: 'employee_checkin',
    entityId:   checkinId,
    entityName: `Employee ${employeeId} checked ${logType} at ${time}`,
    newValues:  { employeeId, logType, time, lat, lng, offshift },
  }).catch(() => {})

  return checkin
}

// ── Late / Early Detection ────────────────────────────────────────────────────

/**
 * Determine whether a check-in time is late given the shift type settings.
 *
 * @param {object} shiftType
 * @param {string} checkInTime  ISO timestamp
 * @returns {{ isLate: boolean, lateMins: number }}
 */
export function detectLateEntry(shiftType, checkInTime) {
  if (!shiftType?.start_time) return { isLate: false, lateMins: 0 }

  const graceMins = shiftType.grace_period_after_start_mins ?? shiftType.late_entry_grace_mins ?? 0

  // Build a comparable Date on an arbitrary fixed date so we can diff times
  const baseDate  = checkInTime.split('T')[0] // YYYY-MM-DD from checkin
  const shiftStart = new Date(`${baseDate}T${shiftType.start_time}`)
  const graceEnd   = new Date(shiftStart.getTime() + graceMins * 60000)
  const actual     = new Date(checkInTime)

  if (actual <= graceEnd) return { isLate: false, lateMins: 0 }

  const lateMins = Math.round((actual.getTime() - shiftStart.getTime()) / 60000)
  return { isLate: true, lateMins }
}

/**
 * Determine whether a check-out time is early given the shift type settings.
 *
 * @param {object} shiftType
 * @param {string} checkOutTime  ISO timestamp
 * @returns {{ isEarly: boolean, earlyMins: number }}
 */
export function detectEarlyExit(shiftType, checkOutTime) {
  if (!shiftType?.end_time) return { isEarly: false, earlyMins: 0 }

  const graceMins = shiftType.early_exit_grace_mins ?? 0

  const baseDate = checkOutTime.split('T')[0]
  const shiftEnd  = new Date(`${baseDate}T${shiftType.end_time}`)
  const graceStart = new Date(shiftEnd.getTime() - graceMins * 60000)
  const actual     = new Date(checkOutTime)

  if (actual >= graceStart) return { isEarly: false, earlyMins: 0 }

  const earlyMins = Math.round((shiftEnd.getTime() - actual.getTime()) / 60000)
  return { isEarly: true, earlyMins }
}

// ── Auto Attendance ──────────────────────────────────────────────────────────

/**
 * Attempt to derive and upsert an attendance record from paired IN/OUT checkins.
 * Called automatically after every OUT checkin, and can be called manually.
 *
 * @param {string} employeeId
 * @param {string} dateString  ISO date (YYYY-MM-DD)
 * @returns {object|null}  Upserted employee_attendance record, or null if no IN checkin
 */
export async function tryProcessAutoAttendance(employeeId, dateString) {
  const dayStart = `${dateString}T00:00:00.000Z`
  const dayEnd   = `${dateString}T23:59:59.999Z`

  // Fetch all checkins for this employee on this date, ordered by time
  const { data: checkins, error: ciErr } = await supabase
    .from('employee_checkins')
    .select('id, log_type, time, shift_assignment_id, skip_auto_attendance')
    .eq('employee_id', employeeId)
    .gte('time', dayStart)
    .lte('time', dayEnd)
    .eq('skip_auto_attendance', false)
    .order('time', { ascending: true })

  if (ciErr) throw new Error(`tryProcessAutoAttendance: fetch checkins — ${ciErr.message}`)

  const inCheckins  = checkins?.filter(c => c.log_type === 'IN')  || []
  const outCheckins = checkins?.filter(c => c.log_type === 'OUT') || []

  if (!inCheckins.length) return null // Cannot determine attendance without IN

  const firstIn  = new Date(inCheckins[0].time)
  const lastOut  = outCheckins.length ? new Date(outCheckins.at(-1).time) : null

  // Total hours worked
  const totalHours = lastOut
    ? (lastOut.getTime() - firstIn.getTime()) / 3600000
    : 0

  // Fetch shift type for thresholds
  let shiftType = null
  const assignmentId = inCheckins[0].shift_assignment_id
  if (assignmentId) {
    const { data: sa } = await supabase
      .from('shift_assignments')
      .select('shift_type:shift_types(*)')
      .eq('id', assignmentId)
      .maybeSingle()
    shiftType = sa?.shift_type || null
  }

  const halfDayThreshold = shiftType?.working_hours_threshold_for_half_day ?? 4
  const absentThreshold  = shiftType?.working_hours_threshold_for_absent   ?? 2

  let attendanceType = 'Present'
  if (totalHours < absentThreshold) {
    attendanceType = 'Absent'
  } else if (totalHours < halfDayThreshold) {
    attendanceType = 'Half Day'
  }

  // Detect late entry and early exit
  const { isLate, lateMins }   = shiftType ? detectLateEntry(shiftType, inCheckins[0].time)   : { isLate: false, lateMins: 0 }
  const { isEarly, earlyMins } = (shiftType && lastOut) ? detectEarlyExit(shiftType, outCheckins.at(-1).time) : { isEarly: false, earlyMins: 0 }

  const attendanceId = crypto.randomUUID()
  const now          = new Date().toISOString()

  // Upsert based on employee_id + date
  const { data: existingAtt } = await supabase
    .from('employee_attendance')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('date', dateString)
    .maybeSingle()

  let attendanceRecord
  if (existingAtt?.id) {
    // Update existing
    const { data: updated, error: upErr } = await supabase
      .from('employee_attendance')
      .update({
        clock_in:          firstIn.toISOString(),
        clock_out:         lastOut ? lastOut.toISOString() : null,
        total_hours:       parseFloat(totalHours.toFixed(2)),
        attendance_type:   attendanceType,
        shift_type_id:     shiftType?.id || null,
        late_entry:        isLate,
        late_entry_mins:   lateMins,
        early_exit:        isEarly,
        early_exit_mins:   earlyMins,
        updated_at:        now,
      })
      .eq('id', existingAtt.id)
      .select()
      .single()
    if (upErr) throw new Error(`tryProcessAutoAttendance: update attendance — ${upErr.message}`)
    attendanceRecord = updated

    // Link checkins to attendance record
    await supabase.from('employee_checkins')
      .update({ attendance_id: existingAtt.id })
      .eq('employee_id', employeeId)
      .gte('time', dayStart)
      .lte('time', dayEnd)
  } else {
    // Insert new
    const { data: inserted, error: inErr } = await supabase
      .from('employee_attendance')
      .insert([{
        id:              attendanceId,
        employee_id:     employeeId,
        date:            dateString,
        clock_in:        firstIn.toISOString(),
        clock_out:       lastOut ? lastOut.toISOString() : null,
        total_hours:     parseFloat(totalHours.toFixed(2)),
        overtime_hours:  0,
        status:          'present',
        attendance_type: attendanceType,
        shift_type_id:   shiftType?.id || null,
        late_entry:      isLate,
        late_entry_mins: lateMins,
        early_exit:      isEarly,
        early_exit_mins: earlyMins,
        created_at:      now,
      }])
      .select()
      .single()
    if (inErr) throw new Error(`tryProcessAutoAttendance: insert attendance — ${inErr.message}`)
    attendanceRecord = inserted

    // Link checkins to new attendance record
    await supabase.from('employee_checkins')
      .update({ attendance_id: attendanceId })
      .eq('employee_id', employeeId)
      .gte('time', dayStart)
      .lte('time', dayEnd)
  }

  return attendanceRecord
}

// ── Attendance Summary ────────────────────────────────────────────────────────

/**
 * Summarise attendance records for an employee for a given month/year.
 *
 * @param {string} employeeId
 * @param {number} month  1–12
 * @param {number} year   e.g. 2026
 * @returns {{ present: number, absent: number, halfDay: number, onLeave: number, total: number }}
 */
export async function getAttendanceSummaryForMonth(employeeId, month, year) {
  const monthStr    = String(month).padStart(2, '0')
  const fromDate    = `${year}-${monthStr}-01`
  // Last day of month
  const lastDay     = new Date(year, month, 0).getDate()
  const toDate      = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('employee_attendance')
    .select('date, status, attendance_type')
    .eq('employee_id', employeeId)
    .gte('date', fromDate)
    .lte('date', toDate)

  if (error) throw new Error(`getAttendanceSummaryForMonth: ${error.message}`)

  const records = data || []

  const summary = {
    present:  0,
    absent:   0,
    halfDay:  0,
    onLeave:  0,
    total:    records.length,
  }

  for (const rec of records) {
    const type = (rec.attendance_type || rec.status || '').toLowerCase()
    if (type === 'present')            summary.present++
    else if (type === 'absent')        summary.absent++
    else if (type === 'half day' || type === 'half_day') summary.halfDay++
    else if (type === 'on leave' || type === 'on_leave' || type === 'leave') summary.onLeave++
    else                               summary.present++ // default to present for unknown types
  }

  return summary
}
