// src/utils/dateUtils.js

// Check if a date is a weekend (Saturday or Sunday)
export const isWeekend = (date) => {
  const day = date.getDay()
  return day === 0 || day === 6
}

// Calculate working days between two dates (excluding weekends)
export const getWorkingDays = (startDate, endDate) => {
  let start = new Date(startDate)
  let end = new Date(endDate)
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    if (!isWeekend(current)) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

// Format date for display
export const formatDate = (date) => {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}
