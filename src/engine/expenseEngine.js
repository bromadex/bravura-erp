// src/engine/expenseEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Expense Engine — Phase 1 HRMS Expansion
// Manages expense claims, employee advances, GL posting, and approval flows.
//
// Rules:
//   • All functions are pure async — they throw on error, never toast or navigate.
//   • Fire-and-forget: auditLog and pushNotification are always .catch(() => {})
//   • IDs: crypto.randomUUID()
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }               from '../lib/supabase'
import { auditLog }               from './auditEngine'
import { pushNotification }       from './notificationEngine'
import { startWorkflow }          from './workflowEngine'
import { postToGL }               from './accountingEngine'
import { generateTxnCode }        from './transactionEngine'

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the system_user_id for an employee (for notifications).
 * Returns null if not found.
 */
async function getEmployeeUserId(employeeId) {
  const { data } = await supabase
    .from('employees')
    .select('system_user_id, name')
    .eq('id', employeeId)
    .maybeSingle()
  return data || null
}

// ── Expense Claims ────────────────────────────────────────────────────────────

/**
 * Create a new expense claim in Draft status.
 *
 * @param {object} data
 * @param {string} data.employee_id
 * @param {string} data.posting_date           ISO date
 * @param {string} [data.department_id]
 * @param {string} [data.expense_approver_id]
 * @param {string} [data.expense_approver_name]
 * @param {string} [data.remark]
 * @param {Array}  data.lines                  [{expense_type_id, expense_date, description, claimed_amount, receipt_url}]
 * @returns {string} New claim ID
 */
export async function createExpenseClaim(data) {
  const {
    employee_id,
    posting_date,
    department_id        = null,
    expense_approver_id  = null,
    expense_approver_name = null,
    remark               = null,
    lines                = [],
  } = data

  if (!employee_id)      throw new Error('createExpenseClaim: employee_id is required')
  if (!posting_date)     throw new Error('createExpenseClaim: posting_date is required')
  if (!lines.length)     throw new Error('createExpenseClaim: at least one expense line is required')

  const claimNumber         = await generateTxnCode('EXP')
  const totalClaimedAmount  = lines.reduce((sum, l) => sum + (Number(l.claimed_amount) || 0), 0)
  const claimId             = crypto.randomUUID()
  const now                 = new Date().toISOString()

  const { error: claimErr } = await supabase.from('expense_claims').insert([{
    id:                     claimId,
    claim_number:           claimNumber,
    employee_id,
    posting_date,
    department_id,
    expense_approver_id,
    expense_approver_name,
    total_claimed_amount:   totalClaimedAmount,
    total_sanctioned_amount: 0,
    grand_total:            0,
    total_advance_amount:   0,
    total_amount_reimbursed: 0,
    approval_status:        'Draft',
    status:                 'Draft',
    is_paid:                false,
    remark,
    payable_account_code:   null,
    workflow_instance_id:   null,
    gl_entry_id:            null,
    created_by:             data.created_by || null,
    created_at:             now,
    updated_at:             now,
  }])

  if (claimErr) throw new Error(`createExpenseClaim: insert claim — ${claimErr.message}`)

  // Insert detail lines
  const detailRows = lines.map((line, idx) => ({
    id:               crypto.randomUUID(),
    claim_id:         claimId,
    expense_type_id:  line.expense_type_id,
    expense_date:     line.expense_date,
    description:      line.description || null,
    claimed_amount:   Number(line.claimed_amount) || 0,
    sanctioned_amount: 0,
    receipt_url:      line.receipt_url || null,
    seq:              idx + 1,
    created_at:       now,
  }))

  const { error: linesErr } = await supabase.from('expense_claim_details').insert(detailRows)
  if (linesErr) throw new Error(`createExpenseClaim: insert lines — ${linesErr.message}`)

  auditLog({
    module:     'expenses',
    action:     'CREATE',
    entityType: 'expense_claim',
    entityId:   claimId,
    entityName: claimNumber,
    userName:   data.created_by || '',
    newValues:  { claimNumber, employeeId: employee_id, totalClaimedAmount, lineCount: lines.length },
  }).catch(() => {})

  return claimId
}

/**
 * Submit an expense claim for approval.
 * Starts the configured workflow and notifies the expense approver.
 *
 * @param {string} claimId
 * @param {string} submittedBy  User name
 */
export async function submitExpenseClaim(claimId, submittedBy) {
  const { data: claim, error: fetchErr } = await supabase
    .from('expense_claims')
    .select('id, claim_number, employee_id, expense_approver_id, expense_approver_name, status, approval_status')
    .eq('id', claimId)
    .single()

  if (fetchErr || !claim) throw new Error(`submitExpenseClaim: claim not found — ${fetchErr?.message}`)
  if (claim.status !== 'Draft') throw new Error(`submitExpenseClaim: claim is already ${claim.status}`)

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('expense_claims')
    .update({ status: 'Submitted', approval_status: 'Submitted', updated_at: now })
    .eq('id', claimId)

  if (updateErr) throw new Error(`submitExpenseClaim: update status — ${updateErr.message}`)

  // Resolve submitter identity for workflow actor
  const emp = await getEmployeeUserId(claim.employee_id)
  const actor = {
    id:   emp?.system_user_id || claim.employee_id,
    name: emp?.name || submittedBy,
  }

  // Start workflow (non-fatal if no workflow configured)
  let workflowInstanceId = null
  try {
    const wf = await startWorkflow('expense_claim', claimId, actor, null)
    workflowInstanceId = wf?.instanceId || null
    if (workflowInstanceId) {
      await supabase
        .from('expense_claims')
        .update({ workflow_instance_id: workflowInstanceId, updated_at: now })
        .eq('id', claimId)
    }
  } catch (wfErr) {
    console.warn('[expenseEngine] submitExpenseClaim: workflow start failed —', wfErr?.message)
  }

  // Notify expense approver
  if (claim.expense_approver_id) {
    pushNotification(claim.expense_approver_id, {
      type:     'po_approval_required',
      category: 'approval',
      title:    'Expense Claim Submitted',
      message:  `${emp?.name || submittedBy} submitted expense claim ${claim.claim_number} for your approval.`,
      link:     '/module/hr/expenses',
    }).catch(() => {})
  }

  auditLog({
    module:     'expenses',
    action:     'UPDATE',
    entityType: 'expense_claim',
    entityId:   claimId,
    entityName: claim.claim_number,
    userName:   submittedBy,
    newValues:  { status: 'Submitted', workflowInstanceId },
  }).catch(() => {})
}

/**
 * Approve an expense claim and set sanctioned amounts per line.
 *
 * @param {string} claimId
 * @param {object} approverData
 * @param {object} approverData.sanctioned_amounts  { [lineId]: amount }
 * @param {string} approverData.approver_name
 */
export async function approveExpenseClaim(claimId, approverData) {
  const { sanctioned_amounts = {}, approver_name } = approverData || {}

  const { data: claim, error: fetchErr } = await supabase
    .from('expense_claims')
    .select('id, claim_number, employee_id, expense_claim_details(*)')
    .eq('id', claimId)
    .single()

  if (fetchErr || !claim) throw new Error(`approveExpenseClaim: claim not found — ${fetchErr?.message}`)

  const now = new Date().toISOString()

  // Update sanctioned amounts on each detail line
  const lines = claim.expense_claim_details || []
  await Promise.all(lines.map(line => {
    const sanctioned = sanctioned_amounts[line.id] !== undefined
      ? Number(sanctioned_amounts[line.id])
      : Number(line.claimed_amount)
    return supabase
      .from('expense_claim_details')
      .update({ sanctioned_amount: sanctioned })
      .eq('id', line.id)
  }))

  // Recalculate totals
  const totalSanctioned = lines.reduce((sum, line) => {
    const sanctioned = sanctioned_amounts[line.id] !== undefined
      ? Number(sanctioned_amounts[line.id])
      : Number(line.claimed_amount)
    return sum + sanctioned
  }, 0)

  // Fetch current advance total to compute grand_total
  const { data: updatedClaim } = await supabase
    .from('expense_claims')
    .select('total_advance_amount')
    .eq('id', claimId)
    .single()

  const advanceTotal = Number(updatedClaim?.total_advance_amount || 0)
  const grandTotal   = Math.max(0, totalSanctioned - advanceTotal)

  const { error: updateErr } = await supabase
    .from('expense_claims')
    .update({
      total_sanctioned_amount: totalSanctioned,
      grand_total:             grandTotal,
      approval_status:         'Approved',
      status:                  'Unpaid',
      updated_at:              now,
    })
    .eq('id', claimId)

  if (updateErr) throw new Error(`approveExpenseClaim: update claim — ${updateErr.message}`)

  // Notify employee
  const emp = await getEmployeeUserId(claim.employee_id)
  if (emp?.system_user_id) {
    pushNotification(emp.system_user_id, {
      type:     'requisition_approved',
      category: 'approval',
      title:    'Expense Claim Approved',
      message:  `Your expense claim ${claim.claim_number} has been approved by ${approver_name || 'HR'}. Sanctioned: ${totalSanctioned.toFixed(2)}.`,
      link:     '/module/hr/expenses',
    }).catch(() => {})
  }

  auditLog({
    module:     'expenses',
    action:     'APPROVE',
    entityType: 'expense_claim',
    entityId:   claimId,
    entityName: claim.claim_number,
    userName:   approver_name || '',
    newValues:  { approval_status: 'Approved', totalSanctioned, grandTotal },
  }).catch(() => {})
}

/**
 * Reject an expense claim.
 *
 * @param {string} claimId
 * @param {string} reason
 * @param {string} rejectedBy  User name
 */
export async function rejectExpenseClaim(claimId, reason, rejectedBy) {
  if (!reason?.trim()) throw new Error('rejectExpenseClaim: rejection reason is required')

  const { data: claim, error: fetchErr } = await supabase
    .from('expense_claims')
    .select('id, claim_number, employee_id, approval_status')
    .eq('id', claimId)
    .single()

  if (fetchErr || !claim) throw new Error(`rejectExpenseClaim: claim not found — ${fetchErr?.message}`)
  if (['Rejected', 'Cancelled'].includes(claim.approval_status)) {
    throw new Error(`rejectExpenseClaim: claim is already ${claim.approval_status}`)
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('expense_claims')
    .update({ approval_status: 'Rejected', status: 'Rejected', updated_at: now })
    .eq('id', claimId)

  if (updateErr) throw new Error(`rejectExpenseClaim: update — ${updateErr.message}`)

  // Notify employee
  const emp = await getEmployeeUserId(claim.employee_id)
  if (emp?.system_user_id) {
    pushNotification(emp.system_user_id, {
      type:     'leave_rejected',
      category: 'approval',
      title:    'Expense Claim Rejected',
      message:  `Your expense claim ${claim.claim_number} was rejected by ${rejectedBy || 'HR'}: "${reason}"`,
      link:     '/module/hr/expenses',
    }).catch(() => {})
  }

  auditLog({
    module:     'expenses',
    action:     'REJECT',
    entityType: 'expense_claim',
    entityId:   claimId,
    entityName: claim.claim_number,
    userName:   rejectedBy || '',
    newValues:  { approval_status: 'Rejected', reason },
  }).catch(() => {})
}

/**
 * Mark an approved expense claim as paid and post to the GL.
 *
 * @param {string} claimId
 * @param {string} paidBy  User name
 * @returns {object} Updated claim record
 */
export async function markExpenseClaimPaid(claimId, paidBy) {
  const { data: claim, error: fetchErr } = await supabase
    .from('expense_claims')
    .select('id, claim_number, grand_total, approval_status, status')
    .eq('id', claimId)
    .single()

  if (fetchErr || !claim) throw new Error(`markExpenseClaimPaid: claim not found — ${fetchErr?.message}`)
  if (claim.approval_status !== 'Approved') {
    throw new Error(`markExpenseClaimPaid: claim must be Approved before marking as Paid (current: ${claim.approval_status})`)
  }

  const now = new Date().toISOString()

  const { data: updatedClaim, error: updateErr } = await supabase
    .from('expense_claims')
    .update({
      is_paid:                true,
      status:                 'Paid',
      total_amount_reimbursed: claim.grand_total,
      updated_at:             now,
    })
    .eq('id', claimId)
    .select()
    .single()

  if (updateErr) throw new Error(`markExpenseClaimPaid: update — ${updateErr.message}`)

  // Post to GL
  const glEntryId = await postExpenseClaimToGL(claimId)

  // Store GL entry reference
  if (glEntryId) {
    await supabase
      .from('expense_claims')
      .update({ gl_entry_id: glEntryId, updated_at: now })
      .eq('id', claimId)
  }

  auditLog({
    module:     'expenses',
    action:     'UPDATE',
    entityType: 'expense_claim',
    entityId:   claimId,
    entityName: claim.claim_number,
    userName:   paidBy || '',
    newValues:  { status: 'Paid', glEntryId },
  }).catch(() => {})

  return updatedClaim
}

/**
 * Post an expense claim to the General Ledger.
 * DR each expense account (expense_type.default_account_code)
 * CR the payable account (code 6200 by default, or claim.payable_account_code)
 *
 * @param {string} claimId
 * @returns {string} GL entry ID
 */
export async function postExpenseClaimToGL(claimId) {
  const { data: claim, error: fetchErr } = await supabase
    .from('expense_claims')
    .select(`
      id, claim_number, grand_total, employee_id, posting_date,
      payable_account_code, created_by,
      expense_claim_details(
        id, sanctioned_amount, description,
        expense_types(id, name, default_account_code)
      )
    `)
    .eq('id', claimId)
    .single()

  if (fetchErr || !claim) throw new Error(`postExpenseClaimToGL: claim not found — ${fetchErr?.message}`)

  const lines       = claim.expense_claim_details || []
  const payableCode = claim.payable_account_code || '6200'

  // Build GL lines: DR expense accounts, CR payable
  const glLines = []

  for (const detail of lines) {
    const amount       = Number(detail.sanctioned_amount || 0)
    if (amount <= 0) continue

    const expenseCode = detail.expense_types?.default_account_code
    if (!expenseCode) throw new Error(`postExpenseClaimToGL: expense type "${detail.expense_types?.name}" has no default account code`)

    glLines.push({
      account_code: expenseCode,
      debit:        amount,
      credit:       0,
      description:  detail.description || detail.expense_types?.name || 'Expense',
    })
  }

  if (!glLines.length) throw new Error('postExpenseClaimToGL: no billable lines to post')

  // Sum for CR line
  const totalDebit = glLines.reduce((s, l) => s + l.debit, 0)
  glLines.push({
    account_code: payableCode,
    debit:        0,
    credit:       totalDebit,
    description:  `Expense reimbursable — ${claim.claim_number}`,
  })

  const entryId = await postToGL({
    sourceModule: 'expenses',
    sourceType:   'expense_claim',
    sourceId:     claimId,
    entryDate:    claim.posting_date || new Date().toISOString().split('T')[0],
    description:  `Expense Claim ${claim.claim_number}`,
    reference:    `EXP-${claimId}`,
    lines:        glLines,
    postedBy:     claim.created_by || '',
  })

  return entryId
}

// ── Employee Advances ─────────────────────────────────────────────────────────

/**
 * Create an employee advance in Draft status.
 *
 * @param {object} data
 * @param {string} data.employee_id
 * @param {string} data.posting_date  ISO date
 * @param {string} data.purpose
 * @param {number} data.advance_amount
 * @param {string} [data.created_by]
 * @returns {string} New advance ID
 */
export async function createEmployeeAdvance(data) {
  const {
    employee_id,
    posting_date,
    purpose,
    advance_amount,
    created_by = null,
  } = data

  if (!employee_id)    throw new Error('createEmployeeAdvance: employee_id is required')
  if (!posting_date)   throw new Error('createEmployeeAdvance: posting_date is required')
  if (!purpose?.trim()) throw new Error('createEmployeeAdvance: purpose is required')
  if (!advance_amount || Number(advance_amount) <= 0) {
    throw new Error('createEmployeeAdvance: advance_amount must be greater than zero')
  }

  const advanceNumber = await generateTxnCode('ADV')
  const advanceId     = crypto.randomUUID()
  const now           = new Date().toISOString()

  const { error } = await supabase.from('employee_advances').insert([{
    id:                advanceId,
    advance_number:    advanceNumber,
    employee_id,
    posting_date,
    purpose,
    advance_amount:    Number(advance_amount),
    paid_amount:       0,
    claimed_amount:    0,
    return_amount:     0,
    pending_amount:    0,
    repay_from_salary: false,
    status:            'Draft',
    workflow_instance_id: null,
    created_by,
    created_at:        now,
    updated_at:        now,
  }])

  if (error) throw new Error(`createEmployeeAdvance: ${error.message}`)

  auditLog({
    module:     'expenses',
    action:     'CREATE',
    entityType: 'employee_advance',
    entityId:   advanceId,
    entityName: advanceNumber,
    userName:   created_by || '',
    newValues:  { advanceNumber, employeeId: employee_id, advanceAmount: advance_amount },
  }).catch(() => {})

  return advanceId
}

/**
 * Approve and disburse an employee advance.
 * Sets status to 'Paid' and records paid_amount / pending_amount.
 *
 * @param {string} advanceId
 * @param {object} approverData
 * @param {string} approverData.approver_name
 */
export async function approveAndDisburseAdvance(advanceId, approverData) {
  const { approver_name } = approverData || {}

  const { data: advance, error: fetchErr } = await supabase
    .from('employee_advances')
    .select('id, advance_number, employee_id, advance_amount, status')
    .eq('id', advanceId)
    .single()

  if (fetchErr || !advance) throw new Error(`approveAndDisburseAdvance: advance not found — ${fetchErr?.message}`)
  if (advance.status !== 'Draft' && advance.status !== 'Unpaid') {
    throw new Error(`approveAndDisburseAdvance: advance must be in Draft or Unpaid status (current: ${advance.status})`)
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('employee_advances')
    .update({
      status:         'Paid',
      paid_amount:    advance.advance_amount,
      pending_amount: advance.advance_amount,
      updated_at:     now,
    })
    .eq('id', advanceId)

  if (updateErr) throw new Error(`approveAndDisburseAdvance: update — ${updateErr.message}`)

  // Notify employee
  const emp = await getEmployeeUserId(advance.employee_id)
  if (emp?.system_user_id) {
    pushNotification(emp.system_user_id, {
      type:     'requisition_approved',
      category: 'general',
      title:    'Advance Disbursed',
      message:  `Your advance ${advance.advance_number} of ${advance.advance_amount.toFixed(2)} has been approved and disbursed by ${approver_name || 'Finance'}.`,
      link:     '/module/hr/expenses',
    }).catch(() => {})
  }

  auditLog({
    module:     'expenses',
    action:     'APPROVE',
    entityType: 'employee_advance',
    entityId:   advanceId,
    entityName: advance.advance_number,
    userName:   approver_name || '',
    newValues:  { status: 'Paid', paid_amount: advance.advance_amount },
  }).catch(() => {})
}

/**
 * Settle one or more advances against an expense claim.
 * Updates claim's total_advance_amount and grand_total.
 *
 * @param {string} claimId
 * @param {Array}  advances  [{ advanceId: string, allocatedAmount: number }]
 */
export async function settleAdvanceAgainstClaim(claimId, advances = []) {
  if (!advances.length) throw new Error('settleAdvanceAgainstClaim: no advances provided')

  const now = new Date().toISOString()
  let totalAllocated = 0

  for (const { advanceId, allocatedAmount } of advances) {
    const amount = Number(allocatedAmount)
    if (amount <= 0) continue

    // Fetch advance
    const { data: advance, error: advFetchErr } = await supabase
      .from('employee_advances')
      .select('id, advance_number, advance_amount, claimed_amount, pending_amount, status')
      .eq('id', advanceId)
      .single()

    if (advFetchErr || !advance) throw new Error(`settleAdvanceAgainstClaim: advance ${advanceId} not found`)

    const unclaimed = Number(advance.pending_amount || 0)
    if (amount > unclaimed) {
      throw new Error(
        `settleAdvanceAgainstClaim: allocated amount (${amount}) exceeds unclaimed balance (${unclaimed}) for advance ${advance.advance_number}`
      )
    }

    // Insert expense_claim_advances row
    const { error: linkErr } = await supabase.from('expense_claim_advances').insert([{
      id:               crypto.randomUUID(),
      claim_id:         claimId,
      advance_id:       advanceId,
      allocated_amount: amount,
      unclaimed_amount: unclaimed - amount,
      created_at:       now,
    }])
    if (linkErr) throw new Error(`settleAdvanceAgainstClaim: link advance — ${linkErr.message}`)

    // Update advance claimed_amount
    const newClaimed  = Number(advance.claimed_amount || 0) + amount
    const newPending  = Number(advance.advance_amount || 0) - newClaimed
    await supabase.from('employee_advances').update({
      claimed_amount: newClaimed,
      pending_amount: Math.max(0, newPending),
      updated_at:     now,
    }).eq('id', advanceId)

    await recalculateAdvanceStatus(advanceId)

    totalAllocated += amount
  }

  // Update claim advance total and recalculate grand_total
  const { data: claim, error: claimFetchErr } = await supabase
    .from('expense_claims')
    .select('total_advance_amount, total_sanctioned_amount')
    .eq('id', claimId)
    .single()

  if (claimFetchErr) throw new Error(`settleAdvanceAgainstClaim: fetch claim — ${claimFetchErr.message}`)

  const newAdvTotal  = Number(claim.total_advance_amount || 0) + totalAllocated
  const newGrandTotal = Math.max(0, Number(claim.total_sanctioned_amount || 0) - newAdvTotal)

  const { error: claimUpdateErr } = await supabase
    .from('expense_claims')
    .update({
      total_advance_amount: newAdvTotal,
      grand_total:          newGrandTotal,
      updated_at:           now,
    })
    .eq('id', claimId)

  if (claimUpdateErr) throw new Error(`settleAdvanceAgainstClaim: update claim — ${claimUpdateErr.message}`)
}

/**
 * Recalculate and update the status of an employee advance based on
 * how much has been claimed vs. the total advance amount.
 *
 * @param {string} advanceId
 */
export async function recalculateAdvanceStatus(advanceId) {
  const { data: advance, error: fetchErr } = await supabase
    .from('employee_advances')
    .select('id, advance_amount, return_amount, status')
    .eq('id', advanceId)
    .single()

  if (fetchErr || !advance) throw new Error(`recalculateAdvanceStatus: advance not found — ${fetchErr?.message}`)

  // Sum all claimed amounts from expense_claim_advances
  const { data: linkRows, error: linkErr } = await supabase
    .from('expense_claim_advances')
    .select('allocated_amount')
    .eq('advance_id', advanceId)

  if (linkErr) throw new Error(`recalculateAdvanceStatus: fetch links — ${linkErr.message}`)

  const totalClaimed  = (linkRows || []).reduce((sum, r) => sum + Number(r.allocated_amount || 0), 0)
  const advanceAmount = Number(advance.advance_amount || 0)
  const returnAmount  = Number(advance.return_amount || 0)
  const pendingAmount = Math.max(0, advanceAmount - totalClaimed - returnAmount)

  let newStatus = advance.status
  if (advance.status === 'Cancelled') {
    // Don't change cancelled status
  } else if (totalClaimed >= advanceAmount) {
    newStatus = 'Claimed'
  } else if (totalClaimed > 0 && returnAmount > 0) {
    newStatus = 'Partly Claimed and Returned'
  } else if (returnAmount >= pendingAmount && returnAmount > 0) {
    newStatus = 'Returned'
  }

  const now = new Date().toISOString()

  await supabase.from('employee_advances').update({
    claimed_amount: totalClaimed,
    pending_amount: pendingAmount,
    status:         newStatus,
    updated_at:     now,
  }).eq('id', advanceId)
}
