import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export function useInventory() {
  const [items, setItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [stockTakes, setStockTakes] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Generate UUID for new records
  const generateId = () => {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // Fetch all inventory data
  const fetchAll = async () => {
    setLoading(true)
    try {
      const [itemsRes, transactionsRes, stockTakesRes, categoriesRes] = await Promise.all([
        supabase.from('items').select('*').order('name'),
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_takes').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
      ])
      if (itemsRes.data) setItems(itemsRes.data)
      if (transactionsRes.data) setTransactions(transactionsRes.data)
      if (stockTakesRes.data) setStockTakes(stockTakesRes.data)
      if (categoriesRes.data) setCategories(categoriesRes.data)
    } catch (error) {
      console.error('Error fetching inventory:', error)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }

  // Items CRUD
  const addItem = async (item) => {
    const newId = generateId()
    const { data, error } = await supabase
      .from('items')
      .insert([{
        id: newId,
        name: item.name,
        category: item.category,
        unit: item.unit || 'pcs',
        cost: item.cost || 0,
        threshold: item.threshold || 5,
        balance: item.openingStock || 0,
        total_in: item.openingStock || 0,
        total_out: 0,
        notes: item.notes || '',
      }])
      .select()
      .single()
    
    if (error) throw error
    await fetchAll()
    return data
  }

  const updateItem = async (id, updates) => {
    const { error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteItem = async (id) => {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Stock In
  const stockIn = async (itemId, quantity, date, deliveredBy, receivedBy, notes) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')

    const newBalance = item.balance + quantity
    const newId = generateId()
    
    // Update item
    const { error: itemError } = await supabase
      .from('items')
      .update({
        balance: newBalance,
        total_in: (item.total_in || 0) + quantity,
      })
      .eq('id', itemId)
    
    if (itemError) throw itemError

    // Create transaction with explicit ID
    const { error: txError } = await supabase
      .from('transactions')
      .insert([{
        id: newId,
        type: 'IN',
        item_id: itemId,
        item_name: item.name,
        category: item.category,
        qty: quantity,
        date: date,
        delivered_by: deliveredBy,
        received_by: receivedBy,
        notes: notes,
        user_name: receivedBy,
        created_at: new Date().toISOString(),
      }])
    
    if (txError) throw txError
    
    await fetchAll()
  }

  // Stock Out
  const stockOut = async (itemId, quantity, date, issuedTo, authorizedBy, purpose) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    if (quantity > item.balance) throw new Error('Insufficient stock')

    const newBalance = item.balance - quantity
    const newId = generateId()
    
    const { error: itemError } = await supabase
      .from('items')
      .update({
        balance: newBalance,
        total_out: (item.total_out || 0) + quantity,
      })
      .eq('id', itemId)
    
    if (itemError) throw itemError

    const { error: txError } = await supabase
      .from('transactions')
      .insert([{
        id: newId,
        type: 'OUT',
        item_id: itemId,
        item_name: item.name,
        category: item.category,
        qty: quantity,
        date: date,
        issued_to: issuedTo,
        authorized_by: authorizedBy,
        notes: purpose,
        user_name: authorizedBy,
        created_at: new Date().toISOString(),
      }])
    
    if (txError) throw txError
    
    await fetchAll()
  }

  // Stock Take
  const stockTake = async (itemId, countedQty, date, countedBy, notes) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')

    const variance = countedQty - item.balance
    const newId = generateId()
    const adjId = generateId()
    
    // Create stock take record
    const { error: stError } = await supabase
      .from('stock_takes')
      .insert([{
        id: newId,
        item_id: itemId,
        item_name: item.name,
        system_qty: item.balance,
        counted: countedQty,
        variance: variance,
        date: date,
        done_by: countedBy,
        notes: notes,
        created_at: new Date().toISOString(),
      }])
    
    if (stError) throw stError

    // Update item balance
    const { error: itemError } = await supabase
      .from('items')
      .update({ balance: countedQty })
      .eq('id', itemId)
    
    if (itemError) throw itemError

    // Create adjustment transaction if variance exists
    if (variance !== 0) {
      await supabase.from('transactions').insert([{
        id: adjId,
        type: 'ADJUSTMENT',
        item_id: itemId,
        item_name: item.name,
        category: item.category,
        qty: Math.abs(variance),
        date: date,
        done_by: countedBy,
        notes: `Stock take adjustment (${variance > 0 ? '+' : ''}${variance})`,
        user_name: countedBy,
        created_at: new Date().toISOString(),
      }])
    }
    
    await fetchAll()
  }

  // Delete transaction (admin only, reverses balance)
  const deleteTransaction = async (tx) => {
    const item = items.find(i => i.id === tx.item_id)
    if (!item) throw new Error('Item not found')

    let newBalance = item.balance
    if (tx.type === 'IN' || tx.type === 'GRN') {
      newBalance = item.balance - tx.qty
    } else if (tx.type === 'OUT') {
      newBalance = item.balance + tx.qty
    }

    await supabase.from('items').update({ balance: newBalance }).eq('id', item.id)
    await supabase.from('transactions').delete().eq('id', tx.id)
    await fetchAll()
  }

  useEffect(() => {
    fetchAll()
  }, [])

  return {
    items,
    transactions,
    stockTakes,
    categories,
    loading,
    addItem,
    updateItem,
    deleteItem,
    stockIn,
    stockOut,
    stockTake,
    deleteTransaction,
    fetchAll,
  }
}
