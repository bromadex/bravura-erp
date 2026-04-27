// src/utils/attendanceUtils.js

// Week boundary: Monday to Sunday
export const getWeekStartEnd = (date = new Date()) => {
  const d = new Date(date)
  const day = d.getDay() // 0 = Sunday, 1 = Monday, etc.
  // Adjust so week starts on Monday
  const diff = (day === 0 ? 6 : day - 1)
  const start = new Date(d)
  start.setDate(d.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export const calculateWeeklyHours = (attendanceRecords, employeeId, referenceDate = new Date()) => {
  const { start, end } = getWeekStartEnd(referenceDate)
  const weekRecords = attendanceRecords.filter(record => 
    record.employee_id === employeeId &&
    new Date(record.date) >= start &&
    new Date(record.date) <= end &&
    record.clock_out
  )
  const totalHours = weekRecords.reduce((sum, record) => sum + (record.total_hours || 0), 0)
  const totalOvertime = weekRecords.reduce((sum, record) => sum + (record.overtime_hours || 0), 0)
  return { totalHours, totalOvertime, recordCount: weekRecords.length }
}

// Daily overtime rule: >8 hours per day
export const calculateDailyOvertime = (clockIn, clockOut) => {
  // returns overtime hours for a single day
  const [inH, inM] = clockIn.split(':').map(Number)
  const [outH, outM] = clockOut.split(':').map(Number)
  let totalMins = (outH * 60 + outM) - (inH * 60 + inM)
  if (totalMins < 0) totalMins += 24 * 60
  const totalHours = totalMins / 60
  return Math.max(0, totalHours - 8)
}

// Weekly overtime threshold (default 40 hours)
export const hasWeeklyOvertimeAlert = (weeklyHours, threshold = 40) => {
  return weeklyHours > threshold
}
