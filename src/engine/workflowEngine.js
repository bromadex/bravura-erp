// src/engine/workflowEngine.js
// ============================================================
// STAGE 3 — Core Workflow Engine
// Single source of truth for all approval logic.
// All modules call these functions — nothing hardcoded in pages.
// ============================================================

import { supabase } from '../lib/supabase'

// ── Internal helpers ─────────────────────────────────────────

async function getWorkflowForEntity(entityType) {
  const { data, error } = await supabase
    .from('workflows')
    .select('id, name, module, entity_type')
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .single()
  if (error) throw new Error(`No active workflow for "${entityType}": ${error.message}`)
  return data
}

async function getStepsForWorkflow(workflowId) {
  const { data, error } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_order', { ascending: true })
  if (error) throw error
  return data || []
}

async function getInstance(instanceId) {
  const { data, error } = await supabase
    .from('workflow_instances')
    .select('*, current_step:workflow_steps(*)')
    .eq('id', instanceId)
    .single()
  if (error) throw error
  return data
}

async function getInstanceForEntity(entityType, entityId) {
  const { data } = await supabase
    .from('workflow_instances')
    .select('*, current_step:workflow_steps(*)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data || null
}

async function mirrorStatusToEntity(entityType, entityId, status) {
  // Keeps the existing status column in sync so old queries still work
  const TABLE_MAP = {
    leave_requests:       'leave_requests',
    travel_requests:      'travel_requests',
    employee_attendance:  'employee_attendance',
    store_requisitions:   'store_requisitions',
    purchase_requisitions:'purchase_requisitions',
    purchase_orders:      'purchase_orders',
  }
  const table = TABLE_MAP[entityType]
  if (!table) return
  await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', entityId)
}

async function writeAuditLog(instanceId, stepId, actor, action, comment) {
  await supabase.from('workflow_actions').insert([{
    id:         crypto.randomUUID(),
    instance_id: instanceId,
    step_id:    stepId,
    actor_id:   actor.id,
    actor_name: actor.name || '',
    actor_role: actor.role_id || '',
    action,
    comment:    comment || null,
    created_at: new Date().toISOString(),
  }])
  // Also write to hr_audit_logs for global audit trail
  await supabase.from('hr_audit_logs').insert([{
    id:          crypto.randomUUID(),
    module:      'workflow',
    action:      `WORKFLOW_${action.toUpperCase()}`,
    entity_type: 'workflow_instance',
    entity_id:   instanceId,
    entity_name: `${action} by ${actor.name}`,
    user_name:   actor.name || '',
    created_at:  new Date().toISOString(),
  }])
}

// ── PUBLIC API ───────────────────────────────────────────────

/**
 * START — Call when a record is submitted for approval.
 * Creates a workflow instance, sets first step, mirrors status.
 *
 * @param {string} entityType  e.g. 'leave_requests'
 * @param {string} entityId    UUID of the record
 * @param {object} actor       { id, name, role_id }
 * @returns {object}           { instanceId, status, currentStep }
 */
export async function startWorkflow(entityType, entityId, actor) {
  // Check if an active instance already exists
  const existing = await getInstanceForEntity(entityType, entityId)
  if (existing && ['pending', 'in_progress'].includes(existing.status)) {
    return { instanceId: existing.id, status: existing.status, currentStep: existing.current_step }
  }

  const workflow = await getWorkflowForEntity(entityType)
  const steps    = await getStepsForWorkflow(workflow.id)
  if (!steps.length) throw new Error('Workflow has no steps defined')

  const firstStep  = steps[0]
  const instanceId = crypto.randomUUID()
  const now        = new Date().toISOString()

  const { error } = await supabase.from('workflow_instances').insert([{
    id:                instanceId,
    workflow_id:       workflow.id,
    entity_type:       entityType,
    entity_id:         entityId,
    current_step_id:   firstStep.id,
    status:            'pending',
    initiated_by:      actor.id,
    initiated_by_name: actor.name || '',
    started_at:        now,
    created_at:        now,
    updated_at:        now,
  }])
  if (error) throw error

  // Link instance back to the entity record
  const TABLE_MAP = {
    leave_requests: 'leave_requests', travel_requests: 'travel_requests',
    employee_attendance: 'employee_attendance', store_requisitions: 'store_requisitions',
    purchase_requisitions: 'purchase_requisitions', purchase_orders: 'purchase_orders',
  }
  if (TABLE_MAP[entityType]) {
    await supabase.from(TABLE_MAP[entityType]).update({
      workflow_instance_id: instanceId,
      status:               firstStep.status_on_entry,
      updated_at:           now,
    }).eq('id', entityId)
  }

  await writeAuditLog(instanceId, firstStep.id, actor, 'submitted', null)

  return { instanceId, status: firstStep.status_on_entry, currentStep: firstStep }
}

/**
 * APPROVE — Advance the workflow one step.
 * If final step → mark completed and status = approved.
 * If more steps → move to next step and mirror its entry status.
 *
 * @param {string} instanceId  workflow_instances.id
 * @param {object} actor       { id, name, role_id }
 * @param {string} comment     optional comment
 * @returns {object}           { status, completed, currentStep }
 */
export async function approveStep(instanceId, actor, comment = null) {
  const instance = await getInstance(instanceId)
  if (!instance) throw new Error('Workflow instance not found')
  if (instance.status === 'approved') throw new Error('Already approved')
  if (instance.status === 'rejected') throw new Error('Already rejected — cannot approve')

  const currentStep = instance.current_step
  if (!currentStep) throw new Error('No active step found')

  // Validate actor has the required role
  if (actor.role_id !== 'role_super_admin' && actor.role_id !== currentStep.required_role) {
    throw new Error(`This step requires role "${currentStep.required_role}". You have "${actor.role_id}"`)
  }

  // Check for duplicate approval at this step
  const { data: existingAction } = await supabase
    .from('workflow_actions')
    .select('id')
    .eq('instance_id', instanceId)
    .eq('step_id', currentStep.id)
    .eq('action', 'approved')
    .limit(1)
  if (existingAction?.length) throw new Error('This step has already been approved')

  const now = new Date().toISOString()

  if (currentStep.is_final) {
    // ── FINAL STEP APPROVED → complete the workflow ──────────
    await supabase.from('workflow_instances').update({
      status:       'approved',
      completed_at: now,
      updated_at:   now,
    }).eq('id', instanceId)

    await mirrorStatusToEntity(instance.entity_type, instance.entity_id, currentStep.status_on_pass)
    await writeAuditLog(instanceId, currentStep.id, actor, 'approved', comment)

    return { status: currentStep.status_on_pass, completed: true, currentStep: null }
  } else {
    // ── INTERMEDIATE STEP — advance to next ──────────────────
    const steps   = await getStepsForWorkflow(instance.workflow_id)
    const nextStep = steps.find(s => s.step_order === currentStep.step_order + 1)
    if (!nextStep) throw new Error('No next step defined')

    await supabase.from('workflow_instances').update({
      current_step_id: nextStep.id,
      status:          'pending',
      updated_at:      now,
    }).eq('id', instanceId)

    await mirrorStatusToEntity(instance.entity_type, instance.entity_id, nextStep.status_on_entry)
    await writeAuditLog(instanceId, currentStep.id, actor, 'approved', comment)

    return { status: nextStep.status_on_entry, completed: false, currentStep: nextStep }
  }
}

/**
 * REJECT — Stop the workflow immediately.
 *
 * @param {string} instanceId
 * @param {object} actor      { id, name, role_id }
 * @param {string} reason     required
 * @returns {object}          { status: 'rejected' }
 */
export async function rejectStep(instanceId, actor, reason) {
  if (!reason?.trim()) throw new Error('Rejection reason is required')

  const instance = await getInstance(instanceId)
  if (!instance) throw new Error('Workflow instance not found')
  if (['approved', 'rejected', 'cancelled'].includes(instance.status)) {
    throw new Error(`Cannot reject — workflow is already "${instance.status}"`)
  }

  const currentStep = instance.current_step
  if (!currentStep) throw new Error('No active step found')

  if (actor.role_id !== 'role_super_admin' && actor.role_id !== currentStep.required_role) {
    throw new Error(`This step requires role "${currentStep.required_role}"`)
  }

  const now = new Date().toISOString()

  await supabase.from('workflow_instances').update({
    status:       'rejected',
    completed_at: now,
    updated_at:   now,
  }).eq('id', instanceId)

  await mirrorStatusToEntity(instance.entity_type, instance.entity_id, 'rejected')
  await writeAuditLog(instanceId, currentStep.id, actor, 'rejected', reason)

  return { status: 'rejected' }
}

/**
 * CANCEL — Withdraw a record from the workflow (by submitter).
 */
export async function cancelWorkflow(instanceId, actor, reason = 'Cancelled by submitter') {
  const instance = await getInstance(instanceId)
  if (!instance) throw new Error('Instance not found')
  if (['approved', 'rejected', 'cancelled'].includes(instance.status)) {
    throw new Error('Cannot cancel a completed workflow')
  }

  const now = new Date().toISOString()
  await supabase.from('workflow_instances').update({
    status: 'cancelled', completed_at: now, updated_at: now,
  }).eq('id', instanceId)

  await mirrorStatusToEntity(instance.entity_type, instance.entity_id, 'cancelled')
  if (instance.current_step) {
    await writeAuditLog(instanceId, instance.current_step.id, actor, 'cancelled', reason)
  }
  return { status: 'cancelled' }
}

/**
 * GET INSTANCE — Load full workflow state for a record.
 * Used by the ApprovalPanel UI component.
 */
export async function getWorkflowState(entityType, entityId) {
  const instance = await getInstanceForEntity(entityType, entityId)
  if (!instance) return null

  const [steps, actions] = await Promise.all([
    getStepsForWorkflow(instance.workflow_id),
    supabase.from('workflow_actions')
      .select('*')
      .eq('instance_id', instance.id)
      .order('created_at', { ascending: true })
      .then(r => r.data || []),
  ])

  return {
    instance,
    steps,
    actions,
    currentStep:  instance.current_step,
    isCompleted:  ['approved', 'rejected', 'cancelled'].includes(instance.status),
    isFinalStep:  instance.current_step?.is_final || false,
    stepProgress: steps.findIndex(s => s.id === instance.current_step_id) + 1,
    totalSteps:   steps.length,
  }
}

/**
 * CAN ACT — Check if a user can approve/reject the current step.
 */
export function canActOnStep(step, actor) {
  if (!step || !actor) return false
  if (actor.role_id === 'role_super_admin') return true
  return actor.role_id === step.required_role
}
