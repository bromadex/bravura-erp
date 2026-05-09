// src/engine/workflowEngine.js
// ============================================================
// Workflow Engine v2 — Dynamic, department-aware, configurable
// ============================================================

import { supabase } from '../lib/supabase'
import { auditLog } from './auditEngine'

// ── Internal helpers ─────────────────────────────────────────

/**
 * Find the best matching workflow for an entity.
 * Priority: department-specific > global (NULL department)
 * Higher priority number wins when multiple match.
 */
async function getWorkflowForEntity(entityType, departmentId = null) {
  // 1. Try department-specific assignment first
  if (departmentId) {
    const { data: specific } = await supabase
      .from('workflow_assignments')
      .select('workflow_id, workflows(*)')
      .eq('entity_type', entityType)
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .single()
    if (specific?.workflows?.is_active) return specific.workflows
  }

  // 2. Fall back to global assignment (NULL department)
  const { data: global } = await supabase
    .from('workflow_assignments')
    .select('workflow_id, workflows(*)')
    .eq('entity_type', entityType)
    .is('department_id', null)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1)
    .single()

  if (global?.workflows?.is_active) return global.workflows

  // 3. Final fallback: direct entity_type match on workflows table
  const { data: direct, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1)
    .single()

  if (error || !direct) throw new Error(`No active workflow configured for "${entityType}"`)
  return direct
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
    .select('*, current_step:workflow_steps(*), workflow:workflows(*)')
    .eq('id', instanceId)
    .single()
  if (error) throw error
  return data
}

async function getInstanceForEntity(entityType, entityId) {
  const { data } = await supabase
    .from('workflow_instances')
    .select('*, current_step:workflow_steps(*), workflow:workflows(*)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .not('status', 'in', '("cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data || null
}

const TABLE_MAP = {
  leave_requests:        'leave_requests',
  travel_requests:       'travel_requests',
  employee_attendance:   'employee_attendance',
  store_requisitions:    'store_requisitions',
  purchase_requisitions: 'purchase_requisitions',
  purchase_orders:       'purchase_orders',
}

// Valid statuses per DB CHECK constraints (from schema analysis)
const VALID_STATUSES = {
  leave_requests:        ['draft','pending','pending_supervisor','pending_hr','approved','rejected','cancelled'],
  travel_requests:       ['draft','pending','pending_supervisor','pending_hr','approved','rejected','cancelled'],
  employee_attendance:   ['pending','approved','rejected','cancelled'],
  store_requisitions:    ['draft','submitted','pending','approved','rejected','cancelled','fulfilled'],
  purchase_requisitions: ['draft','submitted','pending','approved','rejected','cancelled'],
  purchase_orders:       ['draft','pending','approved','rejected','cancelled','partially_received','received'],
}

function validateStatus(entityType, status) {
  const valid = VALID_STATUSES[entityType]
  if (!valid) return status  // unknown entity — pass through
  if (valid.includes(status)) return status
  console.warn(`Status "${status}" not valid for "${entityType}". Falling back to "pending".`)
  return 'pending'
}

async function mirrorStatusToEntity(entityType, entityId, status) {
  const table = TABLE_MAP[entityType]
  if (!table) return
  const safeStatus = validateStatus(entityType, status)
  await supabase.from(table).update({
    status: safeStatus, updated_at: new Date().toISOString()
  }).eq('id', entityId)
}

async function writeAuditLog(instanceId, stepId, actor, action, comment) {
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('workflow_actions').insert([{
      id: crypto.randomUUID(), instance_id: instanceId, step_id: stepId,
      actor_id: actor.id, actor_name: actor.name || '',
      actor_role: actor.role_id || '', action, comment: comment || null,
      created_at: now,
    }]),
    auditLog({
      module:     'workflow',
      action:     `WORKFLOW_${action.toUpperCase()}`,
      entityType: 'workflow_instance',
      entityId:   instanceId,
      entityName: `${action} by ${actor.name}`,
      userName:   actor.name || '',
    }),
  ])
}

// ── PUBLIC API ───────────────────────────────────────────────

/**
 * START — Attach correct workflow to a record and begin.
 * Automatically resolves the right workflow based on
 * entity type + optional department.
 */
export async function startWorkflow(entityType, entityId, actor, departmentId = null) {
  // Prevent duplicate instances
  const existing = await getInstanceForEntity(entityType, entityId)
  if (existing && ['pending', 'in_progress'].includes(existing.status)) {
    return { instanceId: existing.id, status: existing.status, currentStep: existing.current_step }
  }

  const workflow = await getWorkflowForEntity(entityType, departmentId)
  const steps    = await getStepsForWorkflow(workflow.id)
  if (!steps.length) throw new Error(`Workflow "${workflow.name}" has no steps — please configure steps first`)

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

  // Link instance to entity + set entry status
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
 * APPROVE — Advance one step or complete workflow.
 */
export async function approveStep(instanceId, actor, comment = null) {
  const instance    = await getInstance(instanceId)
  if (!instance)             throw new Error('Workflow instance not found')
  if (instance.status === 'approved') throw new Error('Already approved')
  if (instance.status === 'rejected') throw new Error('Already rejected')

  const currentStep = instance.current_step
  if (!currentStep) throw new Error('No active step found')

  // Role validation — super admin always passes
  if (actor.role_id !== 'role_super_admin') {
    // Check specific user override first
    if (currentStep.specific_user_id && currentStep.specific_user_id !== actor.id) {
      throw new Error(`This step is assigned to a specific user`)
    }
    if (!currentStep.specific_user_id && actor.role_id !== currentStep.required_role) {
      throw new Error(`This step requires role "${currentStep.required_role}"`)
    }
  }

  // Prevent duplicate
  const { data: dup } = await supabase.from('workflow_actions')
    .select('id').eq('instance_id', instanceId)
    .eq('step_id', currentStep.id).eq('action', 'approved').limit(1)
  if (dup?.length) throw new Error('This step has already been approved')

  const now = new Date().toISOString()

  if (currentStep.is_final) {
    await supabase.from('workflow_instances').update({
      status: 'approved', completed_at: now, updated_at: now,
    }).eq('id', instanceId)
    await mirrorStatusToEntity(instance.entity_type, instance.entity_id, currentStep.status_on_pass)
    await writeAuditLog(instanceId, currentStep.id, actor, 'approved', comment)
    return { status: currentStep.status_on_pass, completed: true, currentStep: null }
  }

  const steps    = await getStepsForWorkflow(instance.workflow_id)
  const nextStep = steps.find(s => s.step_order === currentStep.step_order + 1)
  if (!nextStep) throw new Error('No next step defined — check workflow configuration')

  await supabase.from('workflow_instances').update({
    current_step_id: nextStep.id, status: 'pending', updated_at: now,
  }).eq('id', instanceId)
  await mirrorStatusToEntity(instance.entity_type, instance.entity_id, nextStep.status_on_entry)
  await writeAuditLog(instanceId, currentStep.id, actor, 'approved', comment)
  return { status: nextStep.status_on_entry, completed: false, currentStep: nextStep }
}

/**
 * REJECT — Stop workflow immediately.
 */
export async function rejectStep(instanceId, actor, reason) {
  if (!reason?.trim()) throw new Error('Rejection reason is required')
  const instance = await getInstance(instanceId)
  if (!instance) throw new Error('Workflow instance not found')
  if (['approved', 'rejected', 'cancelled'].includes(instance.status))
    throw new Error(`Cannot reject — workflow is already "${instance.status}"`)

  const currentStep = instance.current_step
  if (!currentStep) throw new Error('No active step')
  if (actor.role_id !== 'role_super_admin' && actor.role_id !== currentStep.required_role)
    throw new Error(`This step requires role "${currentStep.required_role}"`)

  const now = new Date().toISOString()
  await supabase.from('workflow_instances').update({
    status: 'rejected', completed_at: now, updated_at: now,
  }).eq('id', instanceId)
  await mirrorStatusToEntity(instance.entity_type, instance.entity_id, 'rejected')
  await writeAuditLog(instanceId, currentStep.id, actor, 'rejected', reason)
  return { status: 'rejected' }
}

/**
 * CANCEL — Submitter withdraws.
 */
export async function cancelWorkflow(instanceId, actor, reason = 'Cancelled by submitter') {
  const instance = await getInstance(instanceId)
  if (!instance) throw new Error('Instance not found')
  if (['approved', 'rejected', 'cancelled'].includes(instance.status))
    throw new Error('Cannot cancel a completed workflow')

  const now = new Date().toISOString()
  await supabase.from('workflow_instances').update({
    status: 'cancelled', completed_at: now, updated_at: now,
  }).eq('id', instanceId)
  await mirrorStatusToEntity(instance.entity_type, instance.entity_id, 'cancelled')
  if (instance.current_step)
    await writeAuditLog(instanceId, instance.current_step.id, actor, 'cancelled', reason)
  return { status: 'cancelled' }
}

/**
 * GET STATE — Full workflow state for a record (used by ApprovalPanel).
 */
export async function getWorkflowState(entityType, entityId) {
  const instance = await getInstanceForEntity(entityType, entityId)
  if (!instance) return null

  const [steps, actions] = await Promise.all([
    getStepsForWorkflow(instance.workflow_id),
    supabase.from('workflow_actions')
      .select('*').eq('instance_id', instance.id)
      .order('created_at', { ascending: true })
      .then(r => r.data || []),
  ])

  const stepIndex = steps.findIndex(s => s.id === instance.current_step_id)
  return {
    instance,
    steps,
    actions,
    currentStep:   instance.current_step,
    isCompleted:   ['approved', 'rejected', 'cancelled'].includes(instance.status),
    isFinalStep:   instance.current_step?.is_final || false,
    stepProgress:  stepIndex + 1,
    totalSteps:    steps.length,
    workflowName:  instance.workflow?.name || '',
  }
}

/**
 * CAN ACT — Role + user override check.
 */
export function canActOnStep(step, actor) {
  if (!step || !actor) return false
  if (actor.role_id === 'role_super_admin') return true
  if (step.specific_user_id) return step.specific_user_id === actor.id
  return actor.role_id === step.required_role
}

/**
 * GET ALL WORKFLOWS — for the builder UI.
 */
export async function getAllWorkflows() {
  const { data, error } = await supabase
    .from('workflows')
    .select('*, workflow_steps(*), workflow_assignments(*)')
    .order('module')
  if (error) throw error
  return data || []
}

/**
 * SAVE WORKFLOW — create or update (used by WorkflowBuilder UI).
 */
export async function saveWorkflow(workflow, steps) {
  const now = new Date().toISOString()
  const isNew = !workflow.id

  // Upsert workflow
  const wfPayload = {
    name:              workflow.name,
    module:            workflow.module,
    entity_type:       workflow.entity_type,
    description:       workflow.description || '',
    department_filter: workflow.department_filter || null,
    priority:          workflow.priority || 0,
    is_active:         workflow.is_active !== false,
    updated_at:        now,
  }

  let workflowId = workflow.id
  if (isNew) {
    workflowId = crypto.randomUUID()
    const { error } = await supabase.from('workflows')
      .insert([{ ...wfPayload, id: workflowId, created_at: now }])
    if (error) throw error
  } else {
    const { error } = await supabase.from('workflows')
      .update(wfPayload).eq('id', workflowId)
    if (error) throw error
    // Delete existing steps to replace with new ones
    await supabase.from('workflow_steps').delete().eq('workflow_id', workflowId)
  }

  // Insert steps in order
  if (steps.length) {
    const stepRows = steps.map((s, i) => ({
      id:               crypto.randomUUID(),
      workflow_id:      workflowId,
      step_order:       i + 1,
      step_name:        s.step_name,
      required_role:    s.required_role,
      approval_type:    s.approval_type || 'any',
      specific_user_id: s.specific_user_id || null,
      description:      s.description || '',
      status_on_entry:  s.status_on_entry,
      status_on_pass:   s.status_on_pass,
      status_on_fail:   s.status_on_fail || 'rejected',
      is_final:         i === steps.length - 1,
      created_at:       now,
    }))
    const { error } = await supabase.from('workflow_steps').insert(stepRows)
    if (error) throw error
  }

  // Upsert assignment
  if (workflow.entity_type) {
    await supabase.from('workflow_assignments')
      .upsert([{
        id:             crypto.randomUUID(),
        workflow_id:    workflowId,
        entity_type:    workflow.entity_type,
        department_id:  workflow.department_filter || null,
        department_name: workflow.department_name || null,
        is_active:      workflow.is_active !== false,
        created_at:     now,
      }], { onConflict: 'entity_type,department_id' })
  }

  return workflowId
}

/**
 * DELETE WORKFLOW — hard delete (admin only).
 */
export async function deleteWorkflow(workflowId) {
  const { error } = await supabase.from('workflows').delete().eq('id', workflowId)
  if (error) throw error
}
