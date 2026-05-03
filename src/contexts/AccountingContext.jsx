// src/contexts/AccountingContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const AccountingContext = createContext(null)

export function AccountingProvider({ children }) {
  const [accounts,       setAccounts]       = useState([])
  const [journalEntries, setJournalEntries] = useState([])
  const [journalLines,   setJournalLines]   = useState([])
  const [loading,        setLoading]        = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [aR, eR, lR] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true).order('code'),
        supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }).limit(200),
        supabase.from('journal_lines').select('*').order('created_at', { ascending: true }),
      ])
      if (aR.data) setAccounts(aR.data)
      if (eR.data) setJournalEntries(eR.data)
      if (lR.data) setJournalLines(lR.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load accounting data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Accounts ─────────────────────────────────────────────────
  const addAccount = async (data) => {
    const { error } = await supabase.from('accounts').insert([{
      id: crypto.randomUUID(), ...data, is_active: true, balance: 0,
      created_at: new Date().toISOString(),
    }])
    if (error) throw error
    await fetchAll()
  }

  const updateAccount = async (id, data) => {
    const { error } = await supabase.from('accounts').update(data).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteAccount = async (id) => {
    const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Journal Entries ───────────────────────────────────────────
  const postEntry = async ({ entry_date, description, reference, lines, createdBy }) => {
    const totalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0)
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.001)
      throw new Error(`Entry does not balance. Debit: ${totalDebit}, Credit: ${totalCredit}`)

    const entryId = crypto.randomUUID()
    const { error: ee } = await supabase.from('journal_entries').insert([{
      id:           entryId,
      entry_date,
      description,
      reference:    reference || null,
      total_debit:  totalDebit,
      total_credit: totalCredit,
      status:       'posted',
      created_by:   createdBy || null,
      created_at:   new Date().toISOString(),
    }])
    if (ee) throw ee

    const { error: le } = await supabase.from('journal_lines').insert(
      lines.map(l => ({
        id:          crypto.randomUUID(),
        entry_id:    entryId,
        account_id:  l.account_id,
        debit:       l.debit  || 0,
        credit:      l.credit || 0,
        description: l.description || null,
        created_at:  new Date().toISOString(),
      }))
    )
    if (le) throw le

    // Update account balances
    for (const l of lines) {
      const acct = accounts.find(a => a.id === l.account_id)
      if (!acct) continue
      // Normal balance: Assets/Expenses debit-normal; Liabilities/Equity/Revenue credit-normal
      const isDebitNormal = ['Asset', 'Expense'].includes(acct.type)
      const delta = isDebitNormal
        ? (l.debit || 0) - (l.credit || 0)
        : (l.credit || 0) - (l.debit || 0)
      await supabase.from('accounts').update({ balance: acct.balance + delta }).eq('id', acct.id)
    }

    await fetchAll()
    return entryId
  }

  // ── Reports helpers ────────────────────────────────────────────
  const getBalanceSheet = () => {
    const assets      = accounts.filter(a => a.type === 'Asset')
    const liabilities = accounts.filter(a => a.type === 'Liability')
    const equity      = accounts.filter(a => a.type === 'Equity')
    return {
      totalAssets:      assets.reduce((s, a) => s + (a.balance || 0), 0),
      totalLiabilities: liabilities.reduce((s, a) => s + (a.balance || 0), 0),
      totalEquity:      equity.reduce((s, a) => s + (a.balance || 0), 0),
      assets, liabilities, equity,
    }
  }

  const getProfitLoss = () => {
    const revenue  = accounts.filter(a => a.type === 'Revenue')
    const expenses = accounts.filter(a => a.type === 'Expense')
    const totalRev = revenue.reduce((s, a) => s + (a.balance || 0), 0)
    const totalExp = expenses.reduce((s, a) => s + (a.balance || 0), 0)
    return { totalRevenue: totalRev, totalExpenses: totalExp, netProfit: totalRev - totalExp, revenue, expenses }
  }

  return (
    <AccountingContext.Provider value={{
      accounts, journalEntries, journalLines, loading,
      addAccount, updateAccount, deleteAccount,
      postEntry, getBalanceSheet, getProfitLoss,
      refresh: fetchAll,
    }}>
      {children}
    </AccountingContext.Provider>
  )
}

export function useAccounting() {
  const ctx = useContext(AccountingContext)
  if (!ctx) throw new Error('useAccounting must be used inside AccountingProvider')
  return ctx
}
