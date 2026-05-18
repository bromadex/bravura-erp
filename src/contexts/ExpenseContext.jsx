// src/contexts/ExpenseContext.jsx
// Expense management context: expense types, claims, and employee advances.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { auditLog } from '../engine/auditEngine'
import toast from 'react-hot-toast'

const ExpenseContext = createContext(null)

export function ExpenseProvider({ children }) {
  const [expenseTypes, setExpenseTypes] = useState([])
  const [claims,       setClaims]       = useState([])
  const [advances,     setAdvances]     = useState([])
  const [loading,      setLoading]      = useState(true)

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [etRes, clRes, advRes] = await Promise.all([
        supabase
          .from('expense_types')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('expense_claims')
          .select('*, expense_claim_details(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('employee_advances')
          .select('*')
          .order('created_at', { ascending: false }),
      ])
      if (etRes.data)  setExpenseTypes(etRes.data)
      if (clRes.data)  setClaims(clRes.data)
      if (advRes.data) setAdvances(advRes.data)
    } catch (err) {
      toast.error('Failed to load expense data')
      console.error('[ExpenseContext] fetchAll error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Expense Types ─────────────────────────────────────────────────────────

  const addExpenseType = async (data) => {
    const { data: inserted, error } = await supabase
      .from('expense_types')
      .insert([{
        name:                 data.name,
        description:          data.description          || null,
        default_account_code: data.default_account_code || null,
        max_claim_amount:     parseFloat(data.max_claim_amount) || 0,
        requires_receipt:     data.requires_receipt !== undefined ? data.requires_receipt : true,
        is_active:            data.is_active           !== undefined ? data.is_active : true,
      }])
      .select()
      .single()

    if (error) throw new Error(error.message)

    auditLog({
      module:     'expenses',
      action:     'CREATE',
      entityType: 'expense_type',
      entityId:   inserted?.id || '',
      entityName: data.name,
    }).catch(() => {})

    await fetchAll()
    return inserted
  }

  const updateExpenseType = async (id, updates) => {
    const { error } = await supabase
      .from('expense_types')
      .update({
        name:                 updates.name,
        description:          updates.description          ?? null,
        default_account_code: updates.default_account_code ?? null,
        max_claim_amount:     parseFloat(updates.max_claim_amount) || 0,
        requires_receipt:     updates.requires_receipt,
        is_active:            updates.is_active,
      })
      .eq('id', id)

    if (error) throw new Error(error.message)

    auditLog({
      module:     'expenses',
      action:     'UPDATE',
      entityType: 'expense_type',
      entityId:   id,
      entityName: updates.name || '',
    }).catch(() => {})

    await fetchAll()
  }

  const deleteExpenseType = async (id) => {
    const { error } = await supabase
      .from('expense_types')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)

    auditLog({
      module:     'expenses',
      action:     'DELETE',
      entityType: 'expense_type',
      entityId:   id,
    }).catch(() => {})

    await fetchAll()
  }

  // ── Claims ────────────────────────────────────────────────────────────────

  const deleteClaim = async (id) => {
    const claim = claims.find(c => c.id === id)
    if (!claim) throw new Error('Claim not found')
    if (claim.status !== 'Draft') throw new Error('Only Draft claims can be deleted')

    // Delete details first (FK constraint)
    await supabase.from('expense_claim_details').delete().eq('claim_id', id)
    await supabase.from('expense_claim_advances').delete().eq('claim_id', id)

    const { error } = await supabase.from('expense_claims').delete().eq('id', id)
    if (error) throw new Error(error.message)

    auditLog({
      module:     'expenses',
      action:     'DELETE',
      entityType: 'expense_claim',
      entityId:   id,
      entityName: claim.claim_number || id,
    }).catch(() => {})

    await fetchAll()
  }

  // ── Advances ──────────────────────────────────────────────────────────────

  const deleteAdvance = async (id) => {
    const advance = advances.find(a => a.id === id)
    if (!advance) throw new Error('Advance not found')
    if (advance.status !== 'Draft') throw new Error('Only Draft advances can be deleted')

    const { error } = await supabase.from('employee_advances').delete().eq('id', id)
    if (error) throw new Error(error.message)

    auditLog({
      module:     'expenses',
      action:     'DELETE',
      entityType: 'employee_advance',
      entityId:   id,
      entityName: advance.advance_number || id,
    }).catch(() => {})

    await fetchAll()
  }

  // ── Context value ─────────────────────────────────────────────────────────

  return (
    <ExpenseContext.Provider value={{
      expenseTypes,
      claims,
      advances,
      loading,
      fetchAll,
      addExpenseType,
      updateExpenseType,
      deleteExpenseType,
      deleteClaim,
      deleteAdvance,
    }}>
      {children}
    </ExpenseContext.Provider>
  )
}

export function useExpense() {
  const ctx = useContext(ExpenseContext)
  if (!ctx) throw new Error('useExpense must be used inside ExpenseProvider')
  return ctx
}
