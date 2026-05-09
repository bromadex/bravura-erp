// src/engine/auditEngine.js
//
// Centralised audit-log writer. Every module that creates, updates,
// approves or deletes a record should call auditLog() so the Audit
// Trail page shows a complete cross-module history.
//
// Writes to: hr_audit_logs
// Columns:   id, module, action, entity_type, entity_id, entity_name,
//            user_name, txn_code, created_at
//
// Fire-and-forget — never throws. Failures are console.error'd only so
// a bad audit write never breaks the user-facing operation.

import { supabase } from '../lib/supabase'

/**
 * @param {object} entry
 * @param {string} entry.module       - 'accounting' | 'campsite' | 'fuel' | …
 * @param {string} entry.action       - 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | …
 * @param {string} entry.entityType   - table name or domain noun, e.g. 'journal_entry'
 * @param {string} [entry.entityId]   - record id
 * @param {string} [entry.entityName] - human-readable label shown in Audit Trail
 * @param {string} [entry.userName]   - display name of the acting user
 * @param {string} [entry.txnCode]    - e.g. 'JE-2026-00001'
 */
export async function auditLog({
  module,
  action,
  entityType,
  entityId   = '',
  entityName = '',
  userName   = '',
  txnCode    = '',
}) {
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
      created_at:  new Date().toISOString(),
    }])
  } catch (err) {
    console.error('[auditEngine] write failed:', err?.message || err)
  }
}

/**
 * Convenience wrapper — logs a bulk operation (e.g. batch stock import).
 * @param {object[]} entries - array of auditLog param objects
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
        created_at:  new Date().toISOString(),
      }))
    )
  } catch (err) {
    console.error('[auditEngine] batch write failed:', err?.message || err)
  }
}
