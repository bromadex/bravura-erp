// src/contexts/LeaveContext.jsx
//
// Loads ALL currently-active approved leave once on mount.
// Builds an indexed cache { [employeeId]: [{start, end}] } so every
// module can call isOnLeave(employeeId) with zero additional DB queries.
//
// Cache is refreshed:
//  - automatically on mount
//  - manually via refreshLeaves() — called after any leave approval /
//    cancellation in Leave.jsx
//
// USAGE in any component:
//   import { useLeave } from '../../contexts/LeaveContext'
//   const { isOnLeave } = useLeave()
//   if (isOnLeave(employeeId)) { ... }

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LeaveContext = createContext(null)

export function LeaveProvider({ children }) {
  // Indexed: { [employeeId]: [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }] }
  const [activeLeaves, setActiveLeaves] = useState({})
  const [leaveLoading, setLeaveLoading] = useState(true)

  const refreshLeaves = useCallback(async () => {
    setLeaveLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Only fetch approved leaves that haven't ended yet
      // This keeps the cache small regardless of how many historical requests exist
      const { data, error } = await supabase
        .from('leave_requests')
        .select('employee_id, start_date, end_date')
        .eq('status', 'approved')
        .gte('end_date', today)   // end_date >= today → still active or future

      if (error) {
        console.error('LeaveContext: failed to load active leaves', error)
        setActiveLeaves({})
        return
      }

      // Build the O(1) lookup index
      const index = {}
      ;(data || []).forEach(({ employee_id, start_date, end_date }) => {
        if (!index[employee_id]) index[employee_id] = []
        index[employee_id].push({ start: start_date, end: end_date })
      })

      setActiveLeaves(index)
    } finally {
      setLeaveLoading(false)
    }
  }, [])

  useEffect(() => { refreshLeaves() }, [refreshLeaves])

  /**
   * Returns true if the given employee is on approved leave on the given date.
   * Defaults to today if no date is passed.
   * Uses only the in-memory cache — zero DB calls.
   *
   * @param {string} employeeId
   * @param {string|Date} [date]  — ISO date string 'YYYY-MM-DD' or Date object
   * @returns {boolean}
   */
  const isOnLeave = (employeeId, date) => {
    if (!employeeId) return false
    const ranges = activeLeaves[employeeId]
    if (!ranges || ranges.length === 0) return false

    const check = date
      ? (typeof date === 'string' ? date : date.toISOString().split('T')[0])
      : new Date().toISOString().split('T')[0]

    return ranges.some(({ start, end }) => check >= start && check <= end)
  }

  /**
   * Returns the active leave range for an employee on a given date, or null.
   * Useful for showing "On Leave until {date}" in UI.
   */
  const getLeaveRange = (employeeId, date) => {
    if (!employeeId) return null
    const ranges = activeLeaves[employeeId]
    if (!ranges || ranges.length === 0) return null

    const check = date
      ? (typeof date === 'string' ? date : date.toISOString().split('T')[0])
      : new Date().toISOString().split('T')[0]

    return ranges.find(({ start, end }) => check >= start && check <= end) || null
  }

  return (
    <LeaveContext.Provider value={{ activeLeaves, leaveLoading, isOnLeave, getLeaveRange, refreshLeaves }}>
      {children}
    </LeaveContext.Provider>
  )
}

export function useLeave() {
  const ctx = useContext(LeaveContext)
  if (!ctx) throw new Error('useLeave() must be used inside <LeaveProvider>')
  return ctx
}
