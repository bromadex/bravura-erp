// src/engine/accountingEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// Central GL Posting Engine.
// ALL modules must post through postToGL() — never insert directly into
// journal_entries or journal_lines. This guarantees:
//   • Debit = Credit validation before any DB write
//   • Duplicate prevention via reference dedup
//   • Consistent account balance updates (parallel, handles type/account_type)
//   • Full audit trail
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }               from '../lib/supabase'
import { auditLog }               from './auditEngine'
import { pushNotificationToRole } from './notificationEngine'

// ── Internal helpers ─────────────────────────────────────────────────────────

async function resolveAccounts(lines) {
  const codesToLookup = lines.filter(l => l.account_code && !l.account_id).map(l => l.account_code)
  if (!codesToLookup.length) return lines

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name')
    .in('code', codesToLookup)
    .eq('is_active', true)

  return lines.map(l => {
    if (l.account_id) return l
    const found = accounts?.find(a => a.code === l.account_code)
    if (!found) throw new Error(`GL account not found for code "${l.account_code}". Set up the Chart of Accounts first.`)
    return { ...l, account_id: found.id }
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a GL journal entry already exists for a given reference string.
 */
export async function hasGLEntry(reference) {
  const { data } = await supabase
    .from('journal_entries')
    .select('id, entry_date, description')
    .eq('reference', reference)
    .maybeSingle()
  return { exists: !!data, entry: data || null }
}

/**
 * Return the full chart of active accounts, ordered by code.
 * Used by GL posting modals to populate account selectors.
 */
export async function getChartOfAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, code, name, type, account_type, balance')
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return (data || []).map(a => ({ ...a, acctType: a.type || a.account_type || '' }))
}

/**
 * Post a balanced journal entry to the General Ledger.
 *
 * @param {object}   p
 * @param {string}   p.sourceModule  'payroll' | 'procurement' | 'petty_cash' | ...
 * @param {string}   p.sourceType    'payroll_period' | 'goods_received' | ...
 * @param {string}   p.sourceId      UUID of the originating record
 * @param {string}   p.entryDate     ISO date (YYYY-MM-DD)
 * @param {string}   p.description   Human-readable description
 * @param {string}   p.reference     Unique dedup key (e.g. "PAYROLL-{id}")
 * @param {Array}    p.lines         [{ account_id?, account_code?, debit, credit, description }]
 * @param {string}   p.postedBy      User display name
 * @returns {string} New journal entry UUID
 */
export async function postToGL({ sourceModule, sourceType, sourceId, entryDate, description, reference, lines, postedBy }) {
  const ref = reference || `${(sourceModule || 'UNKNOWN').toUpperCase()}-${sourceId}`

  // 1. Dedup check
  const { exists } = await hasGLEntry(ref)
  if (exists) throw new Error(`A GL entry already exists for this record (ref: ${ref}). Contact an accountant to reverse it.`)

  // 2. Resolve account_code → account_id where needed
  const resolved = await resolveAccounts(lines)

  // 3. Reject lines with no account
  const missingAcct = resolved.filter(l => !l.account_id)
  if (missingAcct.length) throw new Error(`${missingAcct.length} line(s) have no account selected. Please assign all accounts before posting.`)

  // 4. Drop zero-amount lines
  const active = resolved.filter(l => (l.debit || 0) + (l.credit || 0) > 0.001)
  if (!active.length) throw new Error('All lines have zero amounts — nothing to post.')

  // 5. Balance check
  const totalDebit  = active.reduce((s, l) => s + (l.debit  || 0), 0)
  const totalCredit = active.reduce((s, l) => s + (l.credit || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    throw new Error(`Entry does not balance. DR: $${totalDebit.toFixed(2)}  CR: $${totalCredit.toFixed(2)}`)

  const entryId = crypto.randomUUID()
  const now     = new Date().toISOString()

  // 6. Insert journal entry header
  const { error: ee } = await supabase.from('journal_entries').insert([{
    id: entryId, entry_date: entryDate, description,
    reference: ref, total_debit: totalDebit, total_credit: totalCredit,
    status: 'posted', created_by: postedBy || null, created_at: now,
  }])
  if (ee) throw new Error(ee.message)

  // 7. Insert journal lines
  const { error: le } = await supabase.from('journal_lines').insert(
    active.map(l => ({
      id: crypto.randomUUID(), entry_id: entryId,
      account_id: l.account_id, debit: l.debit || 0, credit: l.credit || 0,
      description: l.description || null, created_at: now,
    }))
  )
  if (le) throw new Error(le.message)

  // 8. Update account balances (parallel)
  const { data: acctRows } = await supabase
    .from('accounts')
    .select('id, type, account_type, balance')
    .in('id', active.map(l => l.account_id))

  await Promise.all(active.map(l => {
    const acct = acctRows?.find(a => a.id === l.account_id)
    if (!acct) return Promise.resolve()
    const acctType      = acct.type || acct.account_type || ''
    const isDebitNormal = ['Asset', 'Expense'].includes(acctType)
    const delta         = isDebitNormal
      ? (l.debit || 0) - (l.credit || 0)
      : (l.credit || 0) - (l.debit || 0)
    return supabase.from('accounts').update({ balance: (acct.balance || 0) + delta }).eq('id', acct.id)
  }))

  // 9. Audit
  await auditLog({
    module: sourceModule, action: 'POST_TO_GL',
    entityType: sourceType || 'journal_entry', entityId: sourceId || entryId,
    entityName: description, userName: postedBy || '', txnCode: ref,
  })

  // 10. Notify finance team (non-blocking)
  pushNotificationToRole('role_finance_manager', {
    type:     'success',
    title:    `GL Entry Posted — ${(sourceModule || '').toUpperCase()}`,
    message:  `${description} · $${totalDebit.toFixed(2)} DR/CR (Ref: ${ref})`,
    link:     '/module/accounting',
    category: 'general',
    metadata: { sourceModule, sourceType, sourceId, reference: ref },
  }).catch(() => {})

  return entryId
}

/**
 * Reverse an existing GL entry by posting an equal-and-opposite journal.
 */
export async function reverseGLEntry(originalEntryId, reason, postedBy) {
  const { data: orig, error } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*)')
    .eq('id', originalEntryId)
    .single()
  if (error || !orig) throw new Error('Original entry not found')

  const reversalRef = `REV-${orig.reference || orig.id}`
  const { exists }  = await hasGLEntry(reversalRef)
  if (exists) throw new Error('This entry has already been reversed')

  const reversalLines = (orig.journal_lines || []).map(l => ({
    account_id:  l.account_id,
    debit:       l.credit  || 0,
    credit:      l.debit   || 0,
    description: `REVERSAL: ${l.description || ''}`,
  }))

  return postToGL({
    sourceModule: 'accounting', sourceType: 'reversal',
    sourceId:     originalEntryId,
    entryDate:    new Date().toISOString().split('T')[0],
    description:  `REVERSAL: ${orig.description} — ${reason}`,
    reference:    reversalRef, lines: reversalLines, postedBy,
  })
}
