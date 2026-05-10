// src/engine/auditEngine.js
//
// Centralised audit-log writer. Every module that creates, updates,
// approves, deletes, or fails a record operation should call auditLog().
//
// Writes to: hr_audit_logs
// Schema requires these columns (run migration if new ones are missing):
//   id, module, action, entity_type, entity_id, entity_name,
//   user_name, txn_code, old_values, new_values, status, details, ip_address, created_at

import { supabase } from '../lib/supabase'

/**
 * Write a single audit log entry. Fire-and-forget — never throws.
 *
 * @param {object} entry
 * @param {string}  entry.module       - 'accounting' | 'campsite' | 'fuel' | 'system' | …
 * @param {string}  entry.action       - 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT'
 *                                       'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'ACCESS_DENIED'
 *                                       'EXPORT' | 'FAILED' | 'LOG'
 * @param {string}  entry.entityType   - table name or domain noun, e.g. 'journal_entry'
 * @param {string}  [entry.entityId]
 * @param {string}  [entry.entityName]
 * @param {string}  [entry.userName]
 * @param {string}  [entry.txnCode]
 * @param {object}  [entry.oldValues]  - snapshot before change (plain object, will be JSON-stringified)
 * @param {object}  [entry.newValues]  - snapshot after change
 * @param {'success'|'failed'} [entry.status] - defaults to 'success'
 * @param {string}  [entry.details]    - free-text context (e.g. error message on failure)
 */
export async function auditLog({
  module,
  action,
  entityType,
  entityId   = '',
  entityName = '',
  userName   = '',
  txnCode    = '',
  oldValues  = null,
  newValues  = null,
  status     = 'success',
  details    = '',
}) {
  // Resolve userName from session if not supplied
  if (!userName) {
    try {
      const raw = localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session')
      if (raw) {
        const s = JSON.parse(raw)
        userName = s.full_name || s.username || ''
      }
    } catch {}
  }

  try {
    await supabase.from('hr_audit_logs').insert([{
      id:          crypto.randomUUID(),
      module,
      action,
      entity_type: entityType,
      entity_id:   entityId,
      entity_name: entityName,
      user_name:   userName,
      txn_code:    txnCode,
      old_values:  oldValues ? JSON.stringify(oldValues) : null,
      new_values:  newValues ? JSON.stringify(newValues) : null,
      status,
      details,
      created_at:  new Date().toISOString(),
    }])
  } catch (err) {
    console.error('[auditEngine] write failed:', err?.message || err)
  }
}

/**
 * Log a failed action (e.g. permission denied, DB error).
 * Convenience wrapper around auditLog with status='failed'.
 */
export async function auditFailure({ module, action, entityType, entityId = '', entityName = '', userName = '', details = '' }) {
  return auditLog({ module, action, entityType, entityId, entityName, userName, status: 'failed', details })
}

/**
 * Log a login attempt (success or failure).
 */
export async function auditLoginAttempt({ username, success, details = '', userId = '' }) {
  return auditLog({
    module:     'system',
    action:     success ? 'LOGIN' : 'LOGIN_FAILED',
    entityType: 'app_user',
    entityId:   userId,
    entityName: username,
    userName:   username,
    status:     success ? 'success' : 'failed',
    details,
  })
}

/**
 * Log a logout event.
 */
export async function auditLogout({ userName = '', userId = '' }) {
  return auditLog({
    module:     'system',
    action:     'LOGOUT',
    entityType: 'app_user',
    entityId:   userId,
    entityName: userName,
    userName,
  })
}

/**
 * Convenience wrapper — logs a bulk operation (e.g. batch stock import).
 */
export async function auditLogBatch(entries) {
  if (!entries?.length) return
  try {
    await supabase.from('hr_audit_logs').insert(
      entries.map(e => ({
        id:          crypto.randomUUID(),
        module:      e.module      || '',
        action:      e.action      || '',
        entity_type: e.entityType  || '',
        entity_id:   e.entityId    || '',
        entity_name: e.entityName  || '',
        user_name:   e.userName    || '',
        txn_code:    e.txnCode     || '',
        old_values:  e.oldValues   ? JSON.stringify(e.oldValues) : null,
        new_values:  e.newValues   ? JSON.stringify(e.newValues) : null,
        status:      e.status      || 'success',
        details:     e.details     || '',
        created_at:  new Date().toISOString(),
      }))
    )
  } catch (err) {
    console.error('[auditEngine] batch write failed:', err?.message || err)
  }
}
