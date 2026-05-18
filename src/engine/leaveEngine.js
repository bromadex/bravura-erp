// src/engine/leaveEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Leave Engine — Phase 1 HRMS Expansion
// Manages leave ledger, allocations, applications, approvals, holidays, and
// blocked date validation.
//
// Rules:
//   • All functions are pure async — they throw on error, never toast or navigate.
//   • Fire-and-forget: auditLog and pushNotification are always .catch(() => {})
//   • IDs: crypto.randomUUID()
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }                                    from '../lib/supabase'
import { auditLog }                                    from './auditEngine'
import { pushNotification }                            from './notificationEngine'

// ── Ledger ───────────────────────────────────────────────────────────────────

/**
 * Return the running ledger balance for an employee + leave type.
 * Positive = available days remaining.
 *
 * @param {string}  employeeId
 * @param {string}  leaveTypeId
 * @param {string}  [asOfDate]  ISO date string (YYYY-MM-DD). Defaults to today.
 * @returns {number}
 */
export async function getLedgerBalance(employeeId, leaveTypeId, asOfDate = null) {
  const cutoff = asOfDate || new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('leave_ledger_entries')
    .select('leaves')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .lte('from_date', cutoff)

  if (error) throw new Error(`getLedgerBalance: ${error.message}`)

  const total = (data || []).reduce((sum, row) => sum + (row.leaves || 0), 0)
  return total
}

/**
 * Insert a single ledger entry (credit or debit).
 * Positive leaves = credit (e.g. allocation).
 * Negative leaves = debit  (e.g. leave taken).
 *
 * @param {object} data
 * @param {string} data.employeeId
 * @param {string} data.leaveTypeId
 * @param {string} data.transactionType  e.g. 'Allocation', 'Leave Application', 'Adjustment'
 * @param {string} data.transactionName  Human-readable label
 * @param {string} data.fromDate         ISO date
 * @param {string} data.toDate           ISO date
 * @param {number} data.leaves           Positive = credit, negative = debit
 * @param {boolean} [data.isCarryForward]
 * @returns {string} New ledger entry ID
 */
export async function createLedgerEntry({
  employeeId,
  leaveTypeId,
  transactionType,
  transactionName,
  fromDate,
  toDate,
  leaves,
  isCarryForward = false,
}) {
  const id  = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error } = await supabase.from('leave_ledger_entries').insert([{
    id,
    employee_id:      employeeId,
    leave_type_id:    leaveTypeId,
    transaction_type: transactionType,
    transaction_name: transactionName,
    from_date:        fromDate,
    to_date:          toDate,
    leaves,
    is_carry_forward: isCarryForward,
    created_at:       now,
  }])

  if (error) throw new Error(`createLedgerEntry: ${error.message}`)

  auditLog({
    module:     'leave',
    action:     leaves >= 0 ? 'CREATE' : 'UPDATE',
    entityType: 'leave_ledger_entry',
    entityId:   id,
    entityName: `${transactionName} · ${leaves > 0 ? '+' : ''}${leaves} days`,
    newValues:  { employeeId, leaveTypeId, transactionType, leaves, fromDate, toDate },
  }).catch(() => {})

  return id
}

// ── Allocations ──────────────────────────────────────────────────────────────

/**
 * Allocate leaves to an employee based on a leave policy for a given period.
 * For each policy_detail line: creates a leave_allocations record and a
 * positive ledger entry (credit).
 *
 * @param {string} employeeId
 * @param {string} policyId
 * @param {string} periodId
 * @param {string} createdBy  User name of the person running the allocation
 * @returns {string[]} Array of allocation IDs created
 */
export async function allocateLeavesByPolicy(employeeId, policyId, periodId, createdBy) {
  // Fetch policy details
  const { data: details, error: detailErr } = await supabase
    .from('leave_policy_details')
    .select('id, leave_type_id, annual_allocation')
    .eq('policy_id', policyId)

  if (detailErr) throw new Error(`allocateLeavesByPolicy: fetch policy details — ${detailErr.message}`)
  if (!details?.length) throw new Error(`No policy details found for policy ${policyId}`)

  // Fetch leave period
  const { data: period, error: periodErr } = await supabase
    .from('leave_periods')
    .select('id, name, from_date, to_date')
    .eq('id', periodId)
    .single()

  if (periodErr || !period) throw new Error(`allocateLeavesByPolicy: leave period not found — ${periodErr?.message}`)

  const allocationIds = []
  const now           = new Date().toISOString()

  for (const detail of details) {
    const allocationId = crypto.randomUUID()

    const { error: allocErr } = await supabase.from('leave_allocations').insert([{
      id:                      allocationId,
      employee_id:             employeeId,
      leave_type_id:           detail.leave_type_id,
      leave_period_id:         periodId,
      from_date:               period.from_date,
      to_date:                 period.to_date,
      new_leaves_allocated:    detail.annual_allocation,
      carry_forward:           false,
      carry_forwarded_leaves:  0,
      total_leaves_allocated:  detail.annual_allocation,
      status:                  'Active',
      created_at:              now,
    }])

    if (allocErr) throw new Error(`allocateLeavesByPolicy: insert allocation — ${allocErr.message}`)

    // Credit the ledger
    await createLedgerEntry({
      employeeId,
      leaveTypeId:     detail.leave_type_id,
      transactionType: 'Allocation',
      transactionName: `Leave Allocation — ${period.name}`,
      fromDate:        period.from_date,
      toDate:          period.to_date,
      leaves:          detail.annual_allocation,
      isCarryForward:  false,
    })

    allocationIds.push(allocationId)
  }

  auditLog({
    module:     'leave',
    action:     'CREATE',
    entityType: 'leave_allocation',
    entityName: `Policy allocation for employee ${employeeId}`,
    userName:   createdBy,
    newValues:  { employeeId, policyId, periodId, allocations: allocationIds.length },
  }).catch(() => {})

  return allocationIds
}

// ── Leave Application ─────────────────────────────────────────────────────────

/**
 * Validate and prepare a leave application.
 * Does NOT insert the leave_request record — the caller should do that after
 * receiving a clean result here (so UI can still show the employee a preview).
 *
 * Checks:
 *  1. Sufficient ledger balance
 *  2. No overlapping pending/approved leave for the same employee
 *
 * @param {object} requestData
 * @param {string} requestData.employee_id
 * @param {string} requestData.leave_type_id
 * @param {string} requestData.start_date    ISO date
 * @param {string} requestData.end_date      ISO date
 * @param {boolean} [requestData.half_day]
 * @param {string} [requestData.employee_name]
 * @param {string} [requestData.created_by]
 * @returns {{ leave_days: number, balance_after: number }}
 */
export async function applyLeave(requestData) {
  const {
    employee_id,
    leave_type_id,
    start_date,
    end_date,
    half_day = false,
  } = requestData

  // 1. Calculate business days (MVP: simple date diff excluding weekends)
  const leaveDays = half_day
    ? 0.5
    : countBusinessDays(start_date, end_date)

  if (leaveDays <= 0) throw new Error('Leave days must be greater than zero')

  // 2. Check ledger balance
  const balance = await getLedgerBalance(employee_id, leave_type_id)
  if (balance < leaveDays) {
    throw new Error(
      `Insufficient leave balance. Available: ${balance} day(s), Requested: ${leaveDays} day(s).`
    )
  }

  // 3. Check for overlapping active leave requests
  const { data: conflicts, error: confErr } = await supabase
    .from('leave_requests')
    .select('id, start_date, end_date, status')
    .eq('employee_id', employee_id)
    .not('status', 'in', '("cancelled","rejected")')
    .lte('start_date', end_date)
    .gte('end_date', start_date)

  if (confErr) throw new Error(`applyLeave: conflict check — ${confErr.message}`)
  if (conflicts?.length) {
    throw new Error(
      `Leave dates overlap with an existing ${conflicts[0].status} leave request ` +
      `(${conflicts[0].start_date} → ${conflicts[0].end_date}).`
    )
  }

  return {
    leave_days:    leaveDays,
    balance_after: balance - leaveDays,
  }
}

/**
 * Approve a leave request and debit the ledger.
 * Also notifies the employee.
 *
 * @param {string} requestId  leave_requests.id
 * @param {object} approverData
 * @param {string} approverData.approver_name
 * @param {string} [approverData.approver_user_id]   app_users.id of the approver
 */
export async function approveLeaveAndDeductLedger(requestId, approverData) {
  const { approver_name, approver_user_id } = approverData || {}

  // Fetch the leave request
  const { data: request, error: reqErr } = await supabase
    .from('leave_requests')
    .select('id, employee_id, leave_type_id, start_date, end_date, total_leave_days, status')
    .eq('id', requestId)
    .single()

  if (reqErr || !request) throw new Error(`approveLeaveAndDeductLedger: request not found — ${reqErr?.message}`)
  if (request.status === 'approved') throw new Error('Leave request is already approved')
  if (request.status === 'cancelled') throw new Error('Cannot approve a cancelled leave request')

  const leaveDays = request.total_leave_days || countBusinessDays(request.start_date, request.end_date)

  // Debit the ledger (negative = debit)
  await createLedgerEntry({
    employeeId:      request.employee_id,
    leaveTypeId:     request.leave_type_id,
    transactionType: 'Leave Application',
    transactionName: `Leave Approved — ${request.start_date} to ${request.end_date}`,
    fromDate:        request.start_date,
    toDate:          request.end_date,
    leaves:          -leaveDays,
    isCarryForward:  false,
  })

  // Update leave request status
  const { error: updateErr } = await supabase
    .from('leave_requests')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateErr) throw new Error(`approveLeaveAndDeductLedger: status update — ${updateErr.message}`)

  // Resolve employee system_user_id for notification
  const { data: emp } = await supabase
    .from('employees')
    .select('system_user_id, name')
    .eq('id', request.employee_id)
    .maybeSingle()

  if (emp?.system_user_id) {
    pushNotification(emp.system_user_id, {
      type:     'leave_approved',
      title:    'Leave Request Approved',
      message:  `Your leave from ${request.start_date} to ${request.end_date} has been approved by ${approver_name || 'HR'}.`,
      link:     '/module/hr/leave',
      category: 'leave',
    }).catch(() => {})
  }

  auditLog({
    module:     'leave',
    action:     'APPROVE',
    entityType: 'leave_request',
    entityId:   requestId,
    entityName: `Leave approved for ${emp?.name || request.employee_id}`,
    userName:   approver_name || '',
    newValues:  { status: 'approved', leaveDays },
  }).catch(() => {})

  return { requestId, leaveDays, status: 'approved' }
}

// ── Holidays & Blocked Dates ──────────────────────────────────────────────────

/**
 * Count the number of holidays (non-weekly-off) in a date range.
 *
 * @param {string}  fromDate       ISO date
 * @param {string}  toDate         ISO date
 * @param {string}  [holidayListId]  If omitted, queries the default list
 * @returns {number}  Count of holiday dates
 */
export async function calculateHolidaysInRange(fromDate, toDate, holidayListId = null) {
  let query = supabase
    .from('holiday_list_dates')
    .select('holiday_date', { count: 'exact', head: true })
    .gte('holiday_date', fromDate)
    .lte('holiday_date', toDate)
    .eq('weekly_off', false)

  if (holidayListId) {
    query = query.eq('holiday_list_id', holidayListId)
  } else {
    // Use the default holiday list
    const { data: defaultList } = await supabase
      .from('holiday_lists')
      .select('id')
      .eq('is_default', true)
      .maybeSingle()

    if (defaultList?.id) {
      query = query.eq('holiday_list_id', defaultList.id)
    }
  }

  const { count, error } = await query
  if (error) throw new Error(`calculateHolidaysInRange: ${error.message}`)
  return count || 0
}

/**
 * Return all blocked dates in a range.
 * If departmentId is provided, only block lists that apply to all departments
 * or that are linked to that department are included.
 *
 * @param {string}  fromDate
 * @param {string}  toDate
 * @param {string}  [departmentId]
 * @returns {Array<{ block_date: string, reason: string, block_list_id: string }>}
 */
export async function getBlockedDates(fromDate, toDate, departmentId = null) {
  // Fetch block lists (all-department ones; department filtering can be extended)
  const blockListQuery = supabase
    .from('leave_block_lists')
    .select('id')
    .eq('applies_to_all_departments', true)

  const { data: lists, error: listErr } = await blockListQuery
  if (listErr) throw new Error(`getBlockedDates: fetch block lists — ${listErr.message}`)

  if (!lists?.length) return []

  const listIds = lists.map(l => l.id)

  const { data: blockedDates, error: dateErr } = await supabase
    .from('leave_block_list_dates')
    .select('block_date, reason, block_list_id')
    .in('block_list_id', listIds)
    .gte('block_date', fromDate)
    .lte('block_date', toDate)
    .order('block_date', { ascending: true })

  if (dateErr) throw new Error(`getBlockedDates: fetch dates — ${dateErr.message}`)
  return blockedDates || []
}

// ── Internal utility ─────────────────────────────────────────────────────────

/**
 * Count business days (Mon–Fri) between two ISO date strings, inclusive.
 * MVP: does not exclude public holidays (use calculateHolidaysInRange for that).
 *
 * @param {string} startDate  ISO date
 * @param {string} endDate    ISO date
 * @returns {number}
 */
function countBusinessDays(startDate, endDate) {
  let count = 0
  const current = new Date(startDate)
  const end     = new Date(endDate)

  // Ensure we only compare dates, not times
  current.setUTCHours(0, 0, 0, 0)
  end.setUTCHours(0, 0, 0, 0)

  while (current <= end) {
    const dow = current.getUTCDay()
    if (dow !== 0 && dow !== 6) count++ // Skip Sunday (0) and Saturday (6)
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return count
}
