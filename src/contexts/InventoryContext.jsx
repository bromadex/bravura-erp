import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const InventoryContext = createContext(null)

export function InventoryProvider({ children }) {
  const [items, setItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [stockTakes, setStockTakes] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, txRes, stRes, catRes] = await Promise.all([
        supabase.from('items').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_takes').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
      ])
      if (itemsRes.data) setItems(itemsRes.data)
      if (txRes.data) setTransactions(txRes.data)
      if (stRes.data) setStockTakes(stRes.data)
      if (catRes.data) setCategories(catRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const addItem = async (item) => {
    const id = generateId()
    const { data, error } = await supabase.from('items').insert([{
      id, name: item.name, category: item.category,
      unit: item.unit || 'pcs', cost: item.cost || 0,
      threshold: item.threshold || 5,
      balance: item.openingStock || 0,
      total_in: item.openingStock || 0,
      total_out: 0, notes: item.notes || '',
    }]).select().single()
    if (error) throw error
    await fetchAll()
    return data
  }

  const updateItem = async (id, updates) => {
    const { error } = await supabase.from('items').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteItem = async (id) => {
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const stockIn = async (itemId, quantity, date, deliveredBy, receivedBy, notes) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const { error: ie } = await supabase.from('items').update({
      balance: item.balance + quantity,
      total_in: (item.total_in || 0) + quantity,
    }).eq('id', itemId)
    if (ie) throw ie
    const { error: te } = await supabase.from('transactions').insert([{
      id: generateId(), type: 'IN', item_id: itemId,
      item_name: item.name, category: item.category,
      qty: quantity, date, delivered_by: deliveredBy,
      received_by: receivedBy, notes,
      user_name: receivedBy, created_at: new Date().toISOString(),
    }])
    if (te) throw te
    await fetchAll()
  }

  const stockOut = async (itemId, quantity, date, issuedTo, authorizedBy, purpose) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    if (quantity > item.balance) throw new Error('Insufficient stock')
    const { error: ie } = await supabase.from('items').update({
      balance: item.balance - quantity,
      total_out: (item.total_out || 0) + quantity,
    }).eq('id', itemId)
    if (ie) throw ie
    const { error: te } = await supabase.from('transactions').insert([{
      id: generateId(), type: 'OUT', item_id: itemId,
      item_name: item.name, category: item.category,
      qty: quantity, date, issued_to: issuedTo,
      authorized_by: authorizedBy, notes: purpose,
      user_name: authorizedBy, created_at: new Date().toISOString(),
    }])
    if (te) throw te
    await fetchAll()
  }

  const stockTake = async (itemId, countedQty, date, countedBy, notes) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const variance = countedQty - item.balance
    await supabase.from('stock_takes').insert([{
      id: generateId(), item_id: itemId, item_name: item.name,
      system_qty: item.balance, counted: countedQty, variance,
      date, done_by: countedBy, notes, created_at: new Date().toISOString(),
    }])
    await supabase.from('items').update({ balance: countedQty }).eq('id', itemId)
    if (variance !== 0) {
      await supabase.from('transactions').insert([{
        id: generateId(), type: 'ADJUSTMENT', item_id: itemId,
        item_name: item.name, category: item.category,
        qty: Math.abs(variance), date, done_by: countedBy,
        notes: `Stock take adjustment (${variance > 0 ? '+' : ''}${variance})`,
        user_name: countedBy, created_at: new Date().toISOString(),
      }])
    }
    await fetchAll()
  }

  const deleteTransaction = async (tx) => {
    const item = items.find(i => i.id === tx.item_id)
    if (item) {
      let newBalance = item.balance
      if (tx.type === 'IN' || tx.type === 'GRN') newBalance = item.balance - tx.qty
      else if (tx.type === 'OUT') newBalance = item.balance + tx.qty
      await supabase.from('items').update({ balance: newBalance }).eq('id', item.id)
    }
    await supabase.from('transactions').delete().eq('id', tx.id)
    await fetchAll()
  }

  return (
    <InventoryContext.Provider value={{
      items, transactions, stockTakes, categories, loading,
      addItem, updateItem, deleteItem, stockIn, stockOut, stockTake,
      deleteTransaction, fetchAll,
    }}>
      {children}
    </InventoryContext.Provider>
  )
}

export function useInventory() {
  const ctx = useContext(InventoryContext)
  if (!ctx) throw new Error('useInventory must be used inside InventoryProvider')
  return ctx
}
