// src/contexts/ContractorContext.jsx
// Manages contractor (hired) equipment, daily usage logs, and billing.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../engine/transactionEngine'
import { startWorkflow, approveStep, rejectStep, cancelWorkflow } from '../engine/workflowEngine'
import toast from 'react-hot-toast'

const ContractorContext = createContext(null)

const safe = (q) => Promise.resolve(q).catch(() => ({ data: [] }))

const genId = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

// ── Rate calculation ──────────────────────────────────────────────────────────
export function calcDailyCharge(rateType, rateAmount, hoursWorked, date) {
  const rate = parseFloat(rateAmount) || 0
  if (rateType === 'hourly') return +(rate * (parseFloat(hoursWorked) || 0)).toFixed(2)
  if (rateType === 'daily')  return rate
  if (rateType === 'monthly') {
    const d = new Date(date || Date.now())
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return +(rate / days).toFixed(2)
  }
  return 0
}

export function ContractorProvider({ children }) {
  const { user } = useAuth()
  const [equipment, setEquipment]   = useState([])
  const [usageLogs, setUsageLogs]   = useState([])
  const [loading, setLoading]       = useState(true)

  const actor = () => ({
    id:      user?.id || '',
    name:    user?.full_name || user?.username || 'User',
    role_id: user?.role_id || '',
  })

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [eqRes, logRes] = await Promise.all([
        safe(supabase.from('contractor_equipment').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('contractor_usage_logs').select('*').order('date', { ascending: false })),
      ])
      setEquipment(eqRes.data || [])
      setUsageLogs(logRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Equipment CRUD ────────────────────────────────────────────────────────
  const addEquipment = async (data) => {
    const id      = genId()
    const ce_code = await generateTxnCode('CE').catch(() => `CE-${Date.now()}`)
    const { error } = await supabase.from('contractor_equipment')
      .insert([{ id, ce_code, ...data, created_by: actor().name, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'contractor_equipment', entityId: id, entityName: data.contractor_name, txnCode: ce_code, userName: actor().name })
    await fetchAll()
    return ce_code
  }

  const updateEquipment = async (id, updates) => {
    const { error } = await supabase.from('contractor_equipment')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'contractor_equipment', entityId: id, userName: actor().name })
    await fetchAll()
  }

  const deleteEquipment = async (id) => {
    const eq = equipment.find(e => e.id === id)
    const { error } = await supabase.from('contractor_equipment').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'contractor_equipment', entityId: id, entityName: eq?.contractor_name, userName: actor().name })
    await fetchAll()
  }

  // ── Usage Log CRUD ────────────────────────────────────────────────────────
  const addUsageLog = async (data) => {
    const eq = equipment.find(e => e.id === data.equipment_id)
    if (!eq) throw new Error('Equipment not found')
    const id      = genId()
    const cu_code = await generateTxnCode('CU').catch(() => `CU-${Date.now()}`)
    const hoursWorked = data.hours_worked != null
      ? parseFloat(data.hours_worked)
      : Math.max(0, (parseFloat(data.end_hours) || 0) - (parseFloat(data.start_hours) || 0))
    const daily_charge = calcDailyCharge(eq.rate_type, eq.rate_amount, hoursWorked, data.date)
    const { error } = await supabase.from('contractor_usage_logs').insert([{
      id, cu_code, ...data,
      hours_worked: hoursWorked,
      daily_charge,
      status: 'draft',
      created_by: actor().name,
      created_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'contractor_usage_log', entityId: id, entityName: cu_code, txnCode: cu_code, userName: actor().name })
    await fetchAll()
    return cu_code
  }

  const updateUsageLog = async (id, data) => {
    const log = usageLogs.find(l => l.id === id)
    const eq  = equipment.find(e => e.id === (data.equipment_id || log?.equipment_id))
    const hoursWorked = data.hours_worked != null
      ? parseFloat(data.hours_worked)
      : Math.max(0, (parseFloat(data.end_hours) || 0) - (parseFloat(data.start_hours) || 0))
    const daily_charge = eq ? calcDailyCharge(eq.rate_type, eq.rate_amount, hoursWorked, data.date || log?.date) : log?.daily_charge
    const { error } = await supabase.from('contractor_usage_logs')
      .update({ ...data, hours_worked: hoursWorked, daily_charge, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteUsageLog = async (id) => {
    const log = usageLogs.find(l => l.id === id)
    if (log?.status !== 'draft') throw new Error('Only draft logs can be deleted')
    const { error } = await supabase.from('contractor_usage_logs').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Workflow ──────────────────────────────────────────────────────────────
  const submitUsageLog = async (logId) => {
    try {
      const result = await startWorkflow('contractor_usage_logs', logId, actor())
      toast.success(`Submitted — awaiting ${result.currentStep?.step_name || 'review'}`)
    } catch (err) {
      // No workflow configured — simple status flip
      if (err.message?.includes('No active workflow')) {
        await supabase.from('contractor_usage_logs')
          .update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', logId)
        toast.success('Log submitted for review')
      } else throw err
    }
    await fetchAll()
  }

  const approveUsageLog = async (logId, comment = '') => {
    const log = usageLogs.find(l => l.id === logId)
    if (log?.workflow_instance_id) {
      const result = await approveStep(log.workflow_instance_id, actor(), comment)
      if (result.completed) {
        toast.success('Log approved — ready for billing')
      }
    } else {
      await supabase.from('contractor_usage_logs')
        .update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', logId)
      toast.success('Log approved')
    }
    await fetchAll()
  }

  const rejectUsageLog = async (logId, reason) => {
    if (!reason?.trim()) throw new Error('Rejection reason required')
    const log = usageLogs.find(l => l.id === logId)
    if (log?.workflow_instance_id) {
      await rejectStep(log.workflow_instance_id, actor(), reason)
    } else {
      await supabase.from('contractor_usage_logs')
        .update({ status: 'rejected', rejection_reason: reason, updated_at: new Date().toISOString() }).eq('id', logId)
    }
    toast.success('Log rejected')
    await fetchAll()
  }

  const cancelUsageLog = async (logId) => {
    const log = usageLogs.find(l => l.id === logId)
    if (log?.workflow_instance_id) {
      await cancelWorkflow(log.workflow_instance_id, actor(), 'Cancelled by user')
    } else {
      await supabase.from('contractor_usage_logs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', logId)
    }
    await fetchAll()
  }

  // ── Billing / Accounting ──────────────────────────────────────────────────
  // Post a journal entry for a set of approved logs in a billing period.
  // debitAccountId  = Equipment Hire Expense account
  // creditAccountId = Accounts Payable account
  const postInvoiceToAccounts = async ({ equipmentId, periodStart, periodEnd, debitAccountId, creditAccountId, notes }) => {
    const eq   = equipment.find(e => e.id === equipmentId)
    const logs = usageLogs.filter(l =>
      l.equipment_id === equipmentId &&
      l.status === 'approved' &&
      l.date >= periodStart &&
      l.date <= periodEnd &&
      !l.journal_entry_ref
    )
    if (!logs.length) throw new Error('No approved unbilled logs in this period')

    const total       = logs.reduce((s, l) => s + (l.daily_charge || 0), 0)
    const totalHours  = logs.reduce((s, l) => s + (l.hours_worked || 0), 0)
    const ci_code     = await generateTxnCode('CI').catch(() => `CI-${Date.now()}`)
    const entryId     = genId()
    const now         = new Date().toISOString()
    const description = `Equipment Hire: ${eq?.contractor_name} — ${eq?.equipment_description || eq?.equipment_type} (${periodStart} to ${periodEnd})`

    // Write journal entry
    const { error: jeErr } = await supabase.from('journal_entries').insert([{
      id: entryId, reference: ci_code, description,
      entry_date:   periodEnd,
      total_debit:  total,
      total_credit: total,
      status: 'posted',
      created_by: actor().name,
      created_at: now,
    }])
    if (jeErr) throw jeErr

    // Journal lines: DR Expense / CR AP
    await supabase.from('journal_lines').insert([
      { id: genId(), entry_id: entryId, account_id: debitAccountId,  debit: total, credit: 0,     description, created_at: now },
      { id: genId(), entry_id: entryId, account_id: creditAccountId, debit: 0,     credit: total, description: `AP: ${eq?.contractor_name}`, created_at: now },
    ])

    // Mark logs as billed
    for (const log of logs) {
      await supabase.from('contractor_usage_logs')
        .update({ journal_entry_ref: ci_code, updated_at: now }).eq('id', log.id)
    }

    auditLog({
      module: 'fleet', action: 'POST', entityType: 'contractor_invoice',
      entityId: entryId, entityName: ci_code, txnCode: ci_code,
      details: `${logs.length} logs · ${totalHours.toFixed(1)} hrs · ${total.toFixed(2)} ${eq?.currency || 'USD'}`,
      userName: actor().name,
    })

    await fetchAll()
    return { ci_code, total, totalHours }
  }

  // ── Derived helpers ───────────────────────────────────────────────────────
  const getEquipmentLogs     = (id)            => usageLogs.filter(l => l.equipment_id === id)
  const getAccumulatedCharge = (id, from, to)  => usageLogs
    .filter(l => l.equipment_id === id && l.date >= from && l.date <= to)
    .reduce((s, l) => s + (l.daily_charge || 0), 0)
  const getPendingCharge     = (id)            => usageLogs
    .filter(l => l.equipment_id === id && !['cancelled','rejected'].includes(l.status) && !l.journal_entry_ref)
    .reduce((s, l) => s + (l.daily_charge || 0), 0)
  const getBilledCharge      = (id)            => usageLogs
    .filter(l => l.equipment_id === id && l.journal_entry_ref)
    .reduce((s, l) => s + (l.daily_charge || 0), 0)

  return (
    <ContractorContext.Provider value={{
      equipment, usageLogs, loading, fetchAll,
      addEquipment, updateEquipment, deleteEquipment,
      addUsageLog, updateUsageLog, deleteUsageLog,
      submitUsageLog, approveUsageLog, rejectUsageLog, cancelUsageLog,
      postInvoiceToAccounts,
      getEquipmentLogs, getAccumulatedCharge, getPendingCharge, getBilledCharge,
      calcDailyCharge,
    }}>
      {children}
    </ContractorContext.Provider>
  )
}

export function useContractor() {
  const ctx = useContext(ContractorContext)
  if (!ctx) throw new Error('useContractor must be used inside ContractorProvider')
  return ctx
}
