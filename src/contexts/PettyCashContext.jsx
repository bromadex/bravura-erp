// src/contexts/PettyCashContext.jsx
// Petty Cash Management: funds, top-ups, expenses, receipt lines, exceptions, reconciliations.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../engine/transactionEngine'
import { startWorkflow, approveStep, rejectStep, cancelWorkflow } from '../engine/workflowEngine'
import toast from 'react-hot-toast'

const PettyCashContext = createContext(null)

// ── Utilities ─────────────────────────────────────────────────────────────────

// Safe wrapper: PostgrestBuilder is not a full Promise — never chain .catch() directly.
const safe = (q) => Promise.resolve(q).catch(() => ({ data: [] }))

const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

// ── Provider ──────────────────────────────────────────────────────────────────

export function PettyCashProvider({ children }) {
  const { user } = useAuth()

  const [funds,             setFunds]             = useState([])
  const [transactions,      setTransactions]      = useState([])
  const [topups,            setTopups]            = useState([])
  const [receiptLines,      setReceiptLines]      = useState([])
  const [exceptions,        setExceptions]        = useState([])
  const [reconciliations,   setReconciliations]   = useState([])
  const [loading,           setLoading]           = useState(true)

  const actor = () => ({
    id:      user?.id      || '',
    name:    user?.full_name || user?.username || 'User',
    role_id: user?.role_id  || '',
  })

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        fundsRes,
        txnRes,
        topupRes,
        linesRes,
        exceptRes,
        reconRes,
      ] = await Promise.all([
        safe(supabase.from('petty_cash_funds').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('petty_cash_transactions').select('*').order('date', { ascending: false })),
        safe(supabase.from('petty_cash_topups').select('*').order('date', { ascending: false })),
        safe(supabase.from('petty_cash_receipt_lines').select('*').order('created_at', { ascending: true })),
        safe(supabase.from('petty_cash_exceptions').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('petty_cash_reconciliations').select('*').order('created_at', { ascending: false })),
      ])

      setFunds(fundsRes.data             || [])
      setTransactions(txnRes.data        || [])
      setTopups(topupRes.data            || [])
      setReceiptLines(linesRes.data      || [])
      setExceptions(exceptRes.data       || [])
      setReconciliations(reconRes.data   || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Fund CRUD ─────────────────────────────────────────────────────────────

  const addFund = async (data) => {
    const id       = genId()
    const pcf_code = await Promise.resolve(generateTxnCode('PCF')).catch(() => `PCF-${Date.now()}`)
    const now      = new Date().toISOString()
    const amount   = parseFloat(data.opening_amount || data.amount) || 0

    const { error } = await supabase.from('petty_cash_funds').insert([{
      id,
      pcf_code,
      custodian_id:    data.custodian_id    || null,
      custodian_name:  data.custodian_name,
      project:         data.project         || null,
      department:      data.department      || null,
      opening_balance: amount,
      current_balance: amount,
      currency:        data.currency        || 'USD',
      status:          'active',
      notes:           data.notes           || null,
      created_by:      actor().name,
      created_at:      now,
      updated_at:      now,
    }])
    if (error) throw error

    auditLog({
      module:     'petty_cash',
      action:     'CREATE',
      entityType: 'petty_cash_fund',
      entityId:   id,
      entityName: data.custodian_name,
      txnCode:    pcf_code,
      userName:   actor().name,
    })

    await fetchAll()
    return pcf_code
  }

  const updateFund = async (id, updates) => {
    const { error } = await supabase.from('petty_cash_funds')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    auditLog({
      module:     'petty_cash',
      action:     'UPDATE',
      entityType: 'petty_cash_fund',
      entityId:   id,
      userName:   actor().name,
    })

    await fetchAll()
  }

  const closeFund = async (id) => {
    const { error } = await supabase.from('petty_cash_funds')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    auditLog({
      module:     'petty_cash',
      action:     'UPDATE',
      entityType: 'petty_cash_fund',
      entityId:   id,
      entityName: 'Fund closed',
      userName:   actor().name,
    })

    await fetchAll()
  }

  // ── Top-ups ───────────────────────────────────────────────────────────────

  const addTopup = async (data) => {
    const id       = genId()
    const pct_code = await Promise.resolve(generateTxnCode('PCT')).catch(() => `PCT-${Date.now()}`)
    const now      = new Date().toISOString()
    const amount   = parseFloat(data.amount) || 0

    const { error: tErr } = await supabase.from('petty_cash_topups').insert([{
      id,
      pct_code,
      fund_id:          data.fund_id,
      amount,
      date:             data.date,
      reference:        data.reference        || null,
      notes:            data.notes            || null,
      posted_by:        actor().name,
      journal_entry_ref: data.journal_entry_ref || null,
      created_at:       now,
    }])
    if (tErr) throw tErr

    // Increment fund current_balance
    const fund = funds.find(f => f.id === data.fund_id)
    if (fund) {
      const { error: fErr } = await supabase.from('petty_cash_funds')
        .update({
          current_balance: (parseFloat(fund.current_balance) || 0) + amount,
          updated_at:      now,
        })
        .eq('id', data.fund_id)
      if (fErr) throw fErr
    }

    auditLog({
      module:     'petty_cash',
      action:     'CREATE',
      entityType: 'petty_cash_topup',
      entityId:   id,
      entityName: pct_code,
      txnCode:    pct_code,
      details:    `Top-up ${amount} to fund ${data.fund_id}`,
      userName:   actor().name,
    })

    await fetchAll()
    return pct_code
  }

  // ── Transaction CRUD ──────────────────────────────────────────────────────

  /**
   * addTransaction — inserts expense, optional receipt lines and/or exception.
   * @param {object}   data         - transaction fields
   * @param {Array}    receiptLines - array of { item_description, qty, unit_price, total }
   * @param {object|null} exception - { reason, explanation, approver_name?, approver_id? }
   * @returns {string} pce_code
   */
  const addTransaction = async (data, lines = [], exception = null) => {
    const id       = genId()
    const pce_code = await Promise.resolve(generateTxnCode('PCE')).catch(() => `PCE-${Date.now()}`)
    const now      = new Date().toISOString()
    const amount   = parseFloat(data.amount) || 0

    // 1. Insert transaction
    const { error: txnErr } = await supabase.from('petty_cash_transactions').insert([{
      id,
      pce_code,
      fund_id:              data.fund_id,
      date:                 data.date,
      supplier:             data.supplier             || null,
      category:             data.category,
      purpose:              data.purpose,
      amount,
      has_receipt:          data.has_receipt !== undefined ? data.has_receipt : true,
      attachment_url:       data.attachment_url       || null,
      status:               'draft',
      workflow_instance_id: null,
      rejection_reason:     null,
      journal_entry_ref:    null,
      reconciliation_id:    null,
      created_by:           actor().name,
      created_at:           now,
      updated_at:           now,
    }])
    if (txnErr) throw txnErr

    // 2. Insert receipt lines if provided
    if (lines.length > 0) {
      const lineRows = lines.map(l => ({
        id:               genId(),
        transaction_id:   id,
        item_description: l.item_description,
        qty:              parseFloat(l.qty)        || 1,
        unit_price:       parseFloat(l.unit_price) || 0,
        total:            parseFloat(l.total)      || 0,
        created_at:       now,
      }))
      const { error: lErr } = await supabase.from('petty_cash_receipt_lines').insert(lineRows)
      if (lErr) throw lErr
    }

    // 3. Insert exception if provided
    if (exception) {
      const { error: eErr } = await supabase.from('petty_cash_exceptions').insert([{
        id:             genId(),
        transaction_id: id,
        reason:         exception.reason,
        explanation:    exception.explanation,
        approver_name:  exception.approver_name  || null,
        approver_id:    exception.approver_id    || null,
        acknowledged:   false,
        created_at:     now,
      }])
      if (eErr) throw eErr
    }

    // 4. Deduct from fund current_balance
    const fund = funds.find(f => f.id === data.fund_id)
    if (fund) {
      const { error: fErr } = await supabase.from('petty_cash_funds')
        .update({
          current_balance: (parseFloat(fund.current_balance) || 0) - amount,
          updated_at:      now,
        })
        .eq('id', data.fund_id)
      if (fErr) throw fErr
    }

    auditLog({
      module:     'petty_cash',
      action:     'CREATE',
      entityType: 'petty_cash_transaction',
      entityId:   id,
      entityName: pce_code,
      txnCode:    pce_code,
      details:    `${data.category} — ${data.purpose} — ${amount}`,
      userName:   actor().name,
    })

    await fetchAll()
    return pce_code
  }

  const updateTransaction = async (id, data) => {
    const txn = transactions.find(t => t.id === id)
    if (txn?.status !== 'draft') throw new Error('Only draft transactions can be edited')

    const { error } = await supabase.from('petty_cash_transactions')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    auditLog({
      module:     'petty_cash',
      action:     'UPDATE',
      entityType: 'petty_cash_transaction',
      entityId:   id,
      entityName: txn?.pce_code,
      txnCode:    txn?.pce_code,
      userName:   actor().name,
    })

    await fetchAll()
  }

  const deleteTransaction = async (id) => {
    const txn = transactions.find(t => t.id === id)
    if (!txn) throw new Error('Transaction not found')
    if (txn.status !== 'draft') throw new Error('Only draft transactions can be deleted')

    const now    = new Date().toISOString()
    const amount = parseFloat(txn.amount) || 0

    // Restore balance to fund before deleting
    const fund = funds.find(f => f.id === txn.fund_id)
    if (fund) {
      const { error: fErr } = await supabase.from('petty_cash_funds')
        .update({
          current_balance: (parseFloat(fund.current_balance) || 0) + amount,
          updated_at:      now,
        })
        .eq('id', txn.fund_id)
      if (fErr) throw fErr
    }

    const { error } = await supabase.from('petty_cash_transactions').delete().eq('id', id)
    if (error) throw error

    auditLog({
      module:     'petty_cash',
      action:     'DELETE',
      entityType: 'petty_cash_transaction',
      entityId:   id,
      entityName: txn.pce_code,
      txnCode:    txn.pce_code,
      userName:   actor().name,
    })

    await fetchAll()
  }

  // ── Transaction Workflow ──────────────────────────────────────────────────

  const submitTransaction = async (txnId) => {
    try {
      const result = await startWorkflow('petty_cash_transactions', txnId, actor())
      toast.success(`Submitted — awaiting ${result.currentStep?.step_name || 'review'}`)
    } catch (err) {
      if (err.message?.includes('No active workflow')) {
        await supabase.from('petty_cash_transactions')
          .update({ status: 'submitted', updated_at: new Date().toISOString() })
          .eq('id', txnId)
        toast.success('Expense submitted for review')
      } else {
        throw err
      }
    }
    await fetchAll()
  }

  const approveTransaction = async (txnId, comment = '') => {
    const txn = transactions.find(t => t.id === txnId)
    if (txn?.workflow_instance_id) {
      const result = await approveStep(txn.workflow_instance_id, actor(), comment)
      if (result.completed) {
        toast.success('Expense approved')
      }
    } else {
      await supabase.from('petty_cash_transactions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', txnId)
      toast.success('Expense approved')
    }
    await fetchAll()
  }

  const rejectTransaction = async (txnId, reason) => {
    if (!reason?.trim()) throw new Error('Rejection reason required')
    const txn = transactions.find(t => t.id === txnId)
    if (txn?.workflow_instance_id) {
      await rejectStep(txn.workflow_instance_id, actor(), reason)
    } else {
      await supabase.from('petty_cash_transactions')
        .update({ status: 'rejected', rejection_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', txnId)
    }
    toast.success('Expense rejected')
    await fetchAll()
  }

  const cancelTransaction = async (txnId) => {
    const txn = transactions.find(t => t.id === txnId)
    if (txn?.workflow_instance_id) {
      await cancelWorkflow(txn.workflow_instance_id, actor(), 'Cancelled by user')
    } else {
      await supabase.from('petty_cash_transactions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', txnId)
    }
    await fetchAll()
  }

  // ── Reconciliation Engine ─────────────────────────────────────────────────

  /**
   * createReconciliation — calculates and persists a reconciliation record.
   * @param {string} fundId
   * @param {string} periodStart  - ISO date string 'YYYY-MM-DD'
   * @param {string} periodEnd    - ISO date string 'YYYY-MM-DD'
   * @param {number} actualCash   - physical cash count
   * @param {string} [notes]
   * @returns {string} pcr_code
   */
  const createReconciliation = async ({ fundId, periodStart, periodEnd, actualCash, notes = '' }) => {
    const id       = genId()
    const pcr_code = await Promise.resolve(generateTxnCode('PCR')).catch(() => `PCR-${Date.now()}`)
    const now      = new Date().toISOString()

    // Get fund
    const fund = funds.find(f => f.id === fundId)
    if (!fund) throw new Error('Fund not found')

    // Get top-ups for the period
    const periodTopups = topups.filter(t =>
      t.fund_id === fundId &&
      t.date >= periodStart &&
      t.date <= periodEnd
    )
    const topupsTotal = periodTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)

    // Get approved transactions for the period not yet reconciled
    const periodTxns = transactions.filter(t =>
      t.fund_id === fundId &&
      t.status  === 'approved' &&
      t.date    >= periodStart &&
      t.date    <= periodEnd &&
      !t.reconciliation_id
    )
    const expensesTotal = periodTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)

    // Determine opening balance: use fund.opening_balance as baseline
    // (in production this could look at the last closed reconciliation)
    const opening         = parseFloat(fund.opening_balance) || 0
    const expectedClosing = opening + topupsTotal - expensesTotal
    const cash            = parseFloat(actualCash) || 0
    const variance        = cash - expectedClosing
    const variancePct     = Math.abs(variance) / (Math.abs(expectedClosing) || 1) * 100

    // Insert reconciliation record
    const { error: rErr } = await supabase.from('petty_cash_reconciliations').insert([{
      id,
      pcr_code,
      fund_id:          fundId,
      period_start:     periodStart,
      period_end:       periodEnd,
      opening_balance:  opening,
      topups:           topupsTotal,
      total_expenses:   expensesTotal,
      expected_closing: expectedClosing,
      actual_cash:      cash,
      variance,
      variance_pct:     variancePct,
      status:           'draft',
      notes:            notes || null,
      created_by:       actor().name,
      submitted_by:     null,
      created_at:       now,
      updated_at:       now,
    }])
    if (rErr) throw rErr

    // High-variance warning (> 10%)
    if (variancePct > 10) {
      toast.error(`Warning: reconciliation variance is ${variancePct.toFixed(1)}% — exceeds 10% threshold`)
      console.warn(`[PettyCash] Reconciliation ${pcr_code} variance ${variancePct.toFixed(2)}% exceeds threshold`)
      // Best-effort: insert notification for fund custodian
      try {
        await supabase.from('notifications').insert([{
          id:         genId(),
          user_id:    fund.custodian_id || actor().id,
          type:       'escalation',
          title:      'Petty Cash Variance Alert',
          message:    `Reconciliation ${pcr_code} has a variance of ${variancePct.toFixed(1)}% (${variance.toFixed(2)} ${fund.currency || 'USD'}) — review required.`,
          link:       '/module/petty-cash/reconciliations',
          category:   'escalation',
          is_read:    false,
          created_at: now,
        }])
      } catch (_notifErr) {
        // Notifications table may not have petty cash entries yet — non-fatal
        console.warn('[PettyCash] Could not write variance notification:', _notifErr?.message)
      }
    }

    // Mark transactions with reconciliation_id
    if (periodTxns.length > 0) {
      for (const txn of periodTxns) {
        await supabase.from('petty_cash_transactions')
          .update({ reconciliation_id: id, updated_at: now })
          .eq('id', txn.id)
      }
    }

    auditLog({
      module:     'petty_cash',
      action:     'CREATE',
      entityType: 'petty_cash_reconciliation',
      entityId:   id,
      entityName: pcr_code,
      txnCode:    pcr_code,
      details:    `Period ${periodStart} – ${periodEnd} | Variance: ${variance.toFixed(2)} (${variancePct.toFixed(1)}%)`,
      userName:   actor().name,
    })

    await fetchAll()
    return pcr_code
  }

  const submitReconciliation = async (reconId) => {
    const recon = reconciliations.find(r => r.id === reconId)
    try {
      const result = await startWorkflow('petty_cash_reconciliations', reconId, actor())
      // Mark submitted_by
      await supabase.from('petty_cash_reconciliations')
        .update({ submitted_by: actor().name, updated_at: new Date().toISOString() })
        .eq('id', reconId)
      toast.success(`Reconciliation submitted — awaiting ${result.currentStep?.step_name || 'review'}`)
    } catch (err) {
      if (err.message?.includes('No active workflow')) {
        await supabase.from('petty_cash_reconciliations')
          .update({
            status:       'submitted',
            submitted_by: actor().name,
            updated_at:   new Date().toISOString(),
          })
          .eq('id', reconId)
        toast.success('Reconciliation submitted for review')
      } else {
        throw err
      }
    }
    await fetchAll()
  }

  const approveReconciliation = async (reconId, comment = '') => {
    const recon = reconciliations.find(r => r.id === reconId)
    if (recon?.workflow_instance_id) {
      const result = await approveStep(recon.workflow_instance_id, actor(), comment)
      if (result.completed) {
        toast.success('Reconciliation approved')
      }
    } else {
      await supabase.from('petty_cash_reconciliations')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', reconId)
      toast.success('Reconciliation approved')
    }
    // Post to accounts after approval
    await postReconciliationToAccounts({ reconId })
    await fetchAll()
  }

  const rejectReconciliation = async (reconId, reason) => {
    if (!reason?.trim()) throw new Error('Rejection reason required')
    const recon = reconciliations.find(r => r.id === reconId)
    if (recon?.workflow_instance_id) {
      await rejectStep(recon.workflow_instance_id, actor(), reason)
    } else {
      await supabase.from('petty_cash_reconciliations')
        .update({ status: 'rejected', rejection_reason: reason, updated_at: new Date().toISOString() })
        .eq('id', reconId)
    }
    toast.success('Reconciliation rejected')
    await fetchAll()
  }

  // ── Accounting Post ───────────────────────────────────────────────────────

  /**
   * postReconciliationToAccounts — journal entry for an approved reconciliation.
   * @param {string}  reconId
   * @param {string}  [pettyCashAccountId]  - CR Petty Cash account
   * @param {string}  [expenseAccountId]    - DR Expense account
   * @param {string}  [varianceAccountId]   - DR/CR Variance account
   */
  const postReconciliationToAccounts = async ({
    reconId,
    pettyCashAccountId = null,
    expenseAccountId   = null,
    varianceAccountId  = null,
  }) => {
    const recon = reconciliations.find(r => r.id === reconId)
    if (!recon) throw new Error('Reconciliation not found')
    if (recon.journal_entry_ref) {
      // Already posted — skip silently
      return recon.journal_entry_ref
    }

    const fund = funds.find(f => f.id === recon.fund_id)
    const now  = new Date().toISOString()

    // All transactions linked to this reconciliation
    const reconTxns = transactions.filter(t => t.reconciliation_id === reconId)

    // Group expenses by category
    const byCategory = reconTxns.reduce((acc, t) => {
      const cat = t.category || 'General'
      acc[cat]  = (acc[cat] || 0) + (parseFloat(t.amount) || 0)
      return acc
    }, {})

    const totalExpenses = reconTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const variance      = parseFloat(recon.variance) || 0

    // Generate JE reference code
    const jeRef    = recon.pcr_code ? `JE-${recon.pcr_code}` : `JE-PCR-${Date.now()}`
    const entryId  = genId()

    // Build journal lines
    const jLines = []

    if (expenseAccountId && pettyCashAccountId && totalExpenses > 0) {
      // DR Expense accounts by category
      for (const [cat, amt] of Object.entries(byCategory)) {
        if (amt > 0) {
          jLines.push({
            id:          genId(),
            entry_id:    entryId,
            account_id:  expenseAccountId,
            debit:       amt,
            credit:      0,
            description: `Petty Cash Expense — ${cat} (${recon.pcr_code})`,
            created_at:  now,
          })
        }
      }

      // CR Petty Cash
      jLines.push({
        id:          genId(),
        entry_id:    entryId,
        account_id:  pettyCashAccountId,
        debit:       0,
        credit:      totalExpenses,
        description: `Petty Cash Fund replenishment (${recon.pcr_code})`,
        created_at:  now,
      })
    }

    // Variance line
    if (varianceAccountId && Math.abs(variance) > 0.001) {
      if (variance > 0) {
        // Cash over — CR variance (income)
        jLines.push({
          id:          genId(),
          entry_id:    entryId,
          account_id:  varianceAccountId,
          debit:       0,
          credit:      Math.abs(variance),
          description: `Cash over — ${recon.pcr_code}`,
          created_at:  now,
        })
      } else {
        // Cash short — DR variance (expense)
        jLines.push({
          id:          genId(),
          entry_id:    entryId,
          account_id:  varianceAccountId,
          debit:       Math.abs(variance),
          credit:      0,
          description: `Cash short — ${recon.pcr_code}`,
          created_at:  now,
        })
      }
    }

    // Only insert journal entry if we have accounts configured and lines to post
    if (jLines.length > 0 && expenseAccountId && pettyCashAccountId) {
      const totalDebit  = jLines.reduce((s, l) => s + (l.debit  || 0), 0)
      const totalCredit = jLines.reduce((s, l) => s + (l.credit || 0), 0)

      const { error: jeErr } = await supabase.from('journal_entries').insert([{
        id:           entryId,
        reference:    jeRef,
        description:  `Petty Cash Reconciliation ${recon.pcr_code} — ${recon.period_start} to ${recon.period_end}`,
        entry_date:   recon.period_end,
        total_debit:  totalDebit,
        total_credit: totalCredit,
        status:       'posted',
        created_by:   actor().name,
        created_at:   now,
      }])
      if (jeErr) throw jeErr

      const { error: lErr } = await supabase.from('journal_lines').insert(jLines)
      if (lErr) throw lErr
    }

    // Mark reconciliation with journal_entry_ref regardless (even if no account IDs)
    const { error: uErr } = await supabase.from('petty_cash_reconciliations')
      .update({ journal_entry_ref: jeRef, updated_at: now })
      .eq('id', reconId)
    if (uErr) throw uErr

    auditLog({
      module:     'petty_cash',
      action:     'POST',
      entityType: 'petty_cash_reconciliation',
      entityId:   reconId,
      entityName: recon.pcr_code,
      txnCode:    jeRef,
      details:    `Total expenses: ${totalExpenses.toFixed(2)} | Variance: ${variance.toFixed(2)} | Fund: ${fund?.pcf_code || recon.fund_id}`,
      userName:   actor().name,
    })

    await fetchAll()
    return jeRef
  }

  // ── Derived Helpers ───────────────────────────────────────────────────────

  /** Current balance from in-memory state */
  const getFundBalance = (fundId) => {
    const fund = funds.find(f => f.id === fundId)
    return parseFloat(fund?.current_balance) || 0
  }

  /** All transactions for a given fund */
  const getFundTransactions = (fundId) =>
    transactions.filter(t => t.fund_id === fundId)

  /** Draft or submitted expenses (not yet approved/rejected) */
  const getPendingExpenses = (fundId) =>
    transactions.filter(t =>
      t.fund_id === fundId &&
      ['draft', 'submitted'].includes(t.status)
    )

  /** Approved expenses with no reconciliation yet */
  const getUnreconciledExpenses = (fundId) =>
    transactions.filter(t =>
      t.fund_id === fundId &&
      t.status  === 'approved' &&
      !t.reconciliation_id
    )

  /** Summary object for a fund */
  const getFundSummary = (fundId) => {
    const fundTxns     = getFundTransactions(fundId)
    const fundTopups   = topups.filter(t => t.fund_id === fundId)
    const totalExpenses = fundTxns
      .filter(t => !['cancelled', 'rejected', 'draft'].includes(t.status))
      .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const totalTopups   = fundTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const balance       = getFundBalance(fundId)
    const pendingCount  = getPendingExpenses(fundId).length

    return { totalExpenses, totalTopups, balance, pendingCount }
  }

  // ── Context Value ─────────────────────────────────────────────────────────

  return (
    <PettyCashContext.Provider value={{
      // State
      funds,
      transactions,
      topups,
      receiptLines,
      exceptions,
      reconciliations,
      loading,
      fetchAll,

      // Fund CRUD
      addFund,
      updateFund,
      closeFund,

      // Top-ups
      addTopup,

      // Transaction CRUD
      addTransaction,
      updateTransaction,
      deleteTransaction,

      // Transaction workflow
      submitTransaction,
      approveTransaction,
      rejectTransaction,
      cancelTransaction,

      // Reconciliation
      createReconciliation,
      submitReconciliation,
      approveReconciliation,
      rejectReconciliation,

      // Accounting
      postReconciliationToAccounts,

      // Helpers
      getFundBalance,
      getFundTransactions,
      getPendingExpenses,
      getUnreconciledExpenses,
      getFundSummary,
    }}>
      {children}
    </PettyCashContext.Provider>
  )
}

export function usePettyCash() {
  const ctx = useContext(PettyCashContext)
  if (!ctx) throw new Error('usePettyCash must be used inside PettyCashProvider')
  return ctx
}
