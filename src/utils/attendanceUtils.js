// src/utils/attendanceUtils.js
//
// Bravura Kamativi work schedule:
//   Mon–Fri  07:00 → 16:00  (lunch 12:00–13:00 = 8 productive hours)
//   Saturday 07:00 → 12:00  (5 hours, treated as OT at 1.5×)
//   Sunday   — not a work day
//
// Overtime rates:
//   Weekday OT (>8h/day Mon–Fri):  1.5× hourly rate
//   Saturday hours:                1.5× hourly rate
//   Public holiday hours:           2.0× hourly rate
//
// Payroll period: 23rd of previous month → 22nd of current month

// ── Constants ────────────────────────────────────────────────────
export const WORK_SCHEDULE = {
  weekday: { start: '07:00', end: '16:00', lunchStart: '12:00', lunchEnd: '13:00', productiveHours: 8 },
  saturday: { start: '07:00', end: '12:00', productiveHours: 5 },
  overtimeRate:     1.5,
  publicHolidayRate: 2.0,
}

// ── Week boundary (Mon–Sun) ──────────────────────────────────────
export const getWeekStartEnd = (date = new Date()) => {
  const d   = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? 6 : day - 1)
  const start = new Date(d)
  start.setDate(d.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// ── Payroll period boundaries ────────────────────────────────────
// Period runs from 23rd of the previous month to 22nd of current month
export const getPayrollPeriod = (referenceDate = new Date()) => {
  const d = new Date(referenceDate)
  let periodStart, periodEnd, label

  if (d.getDate() >= 23) {
    // We are in the period that ends on the 22nd of next month
    periodStart = new Date(d.getFullYear(), d.getMonth(), 23)
    periodEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 22)
    const endMonth = periodEnd.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    label = endMonth
  } else {
    // We are in the period that started on the 23rd of last month
    periodStart = new Date(d.getFullYear(), d.getMonth() - 1, 23)
    periodEnd   = new Date(d.getFullYear(), d.getMonth(), 22)
    const endMonth = periodEnd.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    label = endMonth
  }

  return {
    start: periodStart.toISOString().split('T')[0],
    end:   periodEnd.toISOString().split('T')[0],
    label,
  }
}

// ── Time string → minutes since midnight ────────────────────────
const timeToMins = (t) => {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ── Check if a date string is a public holiday ───────────────────
// publicHolidays = array of { date: 'YYYY-MM-DD' } from DB
export const isPublicHoliday = (dateStr, publicHolidays = []) => {
  return publicHolidays.some(ph => ph.date === dateStr)
}

// ── Day type for a given date ────────────────────────────────────
export const getDayType = (dateStr, publicHolidays = []) => {
  if (isPublicHoliday(dateStr, publicHolidays)) return 'public_holiday'
  const d   = new Date(dateStr)
  const day = d.getDay()
  if (day === 0) return 'sunday'
  if (day === 6) return 'saturday'
  return 'weekday'
}

// ── Core: calculate hours and pay multipliers for one attendance record ──
//
// Returns:
//  {
//    rawHours,          total time between clock-in and clock-out
//    productiveHours,   time minus lunch (weekdays only)
//    regularHours,      hours at base rate
//    overtimeHours,     hours at 1.5×
//    publicHolidayHours, hours at 2×
//    saturdayHours,     hours at 1.5×
//    dayType            'weekday'|'saturday'|'sunday'|'public_holiday'
//  }
export const calculateAttendanceHours = (clockIn, clockOut, dateStr, publicHolidays = []) => {
  if (!clockIn || !clockOut) {
    return { rawHours: 0, productiveHours: 0, regularHours: 0, overtimeHours: 0, publicHolidayHours: 0, saturdayHours: 0, dayType: 'weekday' }
  }

  const inMins  = timeToMins(clockIn)
  const outMins = timeToMins(clockOut)
  let totalMins = outMins - inMins
  if (totalMins < 0) totalMins += 24 * 60
  const rawHours = totalMins / 60

  const dayType = getDayType(dateStr, publicHolidays)

  // PUBLIC HOLIDAY — all hours at 2× regardless of count
  if (dayType === 'public_holiday') {
    return { rawHours, productiveHours: rawHours, regularHours: 0, overtimeHours: 0, publicHolidayHours: rawHours, saturdayHours: 0, dayType }
  }

  // SATURDAY — all hours at 1.5× (up to 5h, anything over is still 1.5×)
  if (dayType === 'saturday') {
    return { rawHours, productiveHours: rawHours, regularHours: 0, overtimeHours: 0, publicHolidayHours: 0, saturdayHours: rawHours, dayType }
  }

  // SUNDAY — not a scheduled day, treat as OT at 1.5× if worked
  if (dayType === 'sunday') {
    return { rawHours, productiveHours: rawHours, regularHours: 0, overtimeHours: rawHours, publicHolidayHours: 0, saturdayHours: 0, dayType }
  }

  // WEEKDAY — deduct lunch hour if the window spans 12:00–13:00
  const lunchStart = timeToMins(WORK_SCHEDULE.weekday.lunchStart) // 720
  const lunchEnd   = timeToMins(WORK_SCHEDULE.weekday.lunchEnd)   // 780
  let lunchDeduct  = 0
  if (inMins < lunchEnd && outMins > lunchStart) {
    const overlapStart = Math.max(inMins, lunchStart)
    const overlapEnd   = Math.min(outMins, lunchEnd)
    lunchDeduct = Math.max(0, overlapEnd - overlapStart) / 60
  }
  const productiveHours = rawHours - lunchDeduct
  const regularHours    = Math.min(productiveHours, WORK_SCHEDULE.weekday.productiveHours)
  const overtimeHours   = Math.max(0, productiveHours - WORK_SCHEDULE.weekday.productiveHours)

  return { rawHours, productiveHours, regularHours, overtimeHours, publicHolidayHours: 0, saturdayHours: 0, dayType }
}

// ── Calculate pay for one attendance record ──────────────────────
export const calculateAttendancePay = (hoursSummary, hourlyRate) => {
  const { regularHours, overtimeHours, saturdayHours, publicHolidayHours } = hoursSummary
  const regularPay        = regularHours        * hourlyRate
  const overtimePay       = overtimeHours       * hourlyRate * WORK_SCHEDULE.overtimeRate
  const saturdayPay       = saturdayHours       * hourlyRate * WORK_SCHEDULE.overtimeRate
  const publicHolidayPay  = publicHolidayHours  * hourlyRate * WORK_SCHEDULE.publicHolidayRate
  return { regularPay, overtimePay, saturdayPay, publicHolidayPay, totalPay: regularPay + overtimePay + saturdayPay + publicHolidayPay }
}

// ── Monthly timesheet summary for one employee ───────────────────
// Returns aggregated totals across all approved records in a period
export const buildTimesheetSummary = (attendanceRecords, employeeId, periodStart, periodEnd, publicHolidays = []) => {
  const pStart = new Date(periodStart)
  const pEnd   = new Date(periodEnd)

  const records = attendanceRecords.filter(r =>
    r.employee_id === employeeId &&
    r.status      === 'approved' &&
    new Date(r.date) >= pStart  &&
    new Date(r.date) <= pEnd
  )

  const summary = {
    totalDays:          0,
    regularDays:        0,
    saturdayDays:       0,
    publicHolidayDays:  0,
    regularHours:       0,
    overtimeHours:      0,
    saturdayHours:      0,
    publicHolidayHours: 0,
    totalHours:         0,
    absentWeekdays:     0,
    leaveDays:          0,
  }

  records.forEach(r => {
    const hours = calculateAttendanceHours(r.clock_in, r.clock_out, r.date, publicHolidays)
    summary.totalDays++
    summary.regularHours       += hours.regularHours
    summary.overtimeHours      += hours.overtimeHours
    summary.saturdayHours      += hours.saturdayHours
    summary.publicHolidayHours += hours.publicHolidayHours
    summary.totalHours         += hours.productiveHours
    if (hours.dayType === 'saturday')       summary.saturdayDays++
    else if (hours.dayType === 'public_holiday') summary.publicHolidayDays++
    else summary.regularDays++
  })

  // Count weekdays in period not worked (absent)
  const current = new Date(pStart)
  while (current <= pEnd) {
    const dayStr  = current.toISOString().split('T')[0]
    const dayType = getDayType(dayStr, publicHolidays)
    if (dayType === 'weekday') {
      const worked = records.some(r => r.date === dayStr)
      if (!worked) summary.absentWeekdays++
    }
    current.setDate(current.getDate() + 1)
  }

  return summary
}

// ── Legacy: daily overtime (kept for backward compatibility) ─────
export const calculateDailyOvertime = (clockIn, clockOut, dateStr = null, publicHolidays = []) => {
  if (dateStr) {
    const hours = calculateAttendanceHours(clockIn, clockOut, dateStr, publicHolidays)
    return hours.overtimeHours + hours.saturdayHours + hours.publicHolidayHours
  }
  // Fallback (no date context) — old logic
  const [inH, inM]   = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
  if (totalMins < 0) totalMins += 24 * 60
  return Math.max(0, totalMins / 60 - 8)
}

export const calculateWeeklyHours = (attendanceRecords, employeeId, referenceDate = new Date()) => {
  const { start, end } = getWeekStartEnd(referenceDate)
  const weekRecords = attendanceRecords.filter(r =>
    r.employee_id === employeeId &&
    new Date(r.date) >= start   &&
    new Date(r.date) <= end     &&
    r.clock_out
  )
  return {
    totalHours:    weekRecords.reduce((s, r) => s + (r.total_hours    || 0), 0),
    totalOvertime: weekRecords.reduce((s, r) => s + (r.overtime_hours || 0), 0),
    recordCount:   weekRecords.length,
  }
}

export const hasWeeklyOvertimeAlert = (weeklyHours, threshold = 40) => weeklyHours > threshold

// ── Working days (Mon–Sat, excluding public holidays) ────────────
export const getWorkingDays = (startDate, endDate, publicHolidays = []) => {
  const start   = new Date(startDate)
  const end     = new Date(endDate)
  let   count   = 0
  const current = new Date(start)
  while (current <= end) {
    const dayType = getDayType(current.toISOString().split('T')[0], publicHolidays)
    if (dayType !== 'sunday') count++  // Mon–Sat + public holidays count as requested days
    current.setDate(current.getDate() + 1)
  }
  return count
}
