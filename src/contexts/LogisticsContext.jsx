// src/contexts/LogisticsContext.jsx

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const LogisticsContext = createContext(null)

export function LogisticsProvider({ children }) {
  const [items,        setItems]        = useState([])
  const [transactions, setTransactions] = useState([])
  const [deliveries,   setDeliveries]   = useState([])
  const [batchRecords, setBatchRecords] = useState([])
  const [headcounts,   setHeadcounts]   = useState([])
  const [ppeIssuances, setPpeIssuances] = useState([])
  const [loading,      setLoading]      = useState(true)

  const generateId = () =>
    crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [iR, tR, dR, bR, hR, pR] = await Promise.all([
        supabase.from('logistics_items').select('*').eq('is_active', true).order('category').order('name'),
        supabase.from('logistics_transactions').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('logistics_deliveries').select('*').order('date', { ascending: false }),
        supabase.from('batch_plant_records').select('*').order('date', { ascending: false }),
        supabase.from('camp_headcount').select('*').order('date', { ascending: false }).limit(60),
        supabase.from('ppe_issuances').select('*').order('date', { ascending: false }),
      ])
      if (iR.data) setItems(iR.data)
      if (tR.data) setTransactions(tR.data)
      if (dR.data) setDeliveries(dR.data)
      if (bR.data) setBatchRecords(bR.data)
      if (hR.data) setHeadcounts(hR.data)
      if (pR.data) setPpeIssuances(pR.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load logistics data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Items ─────────────────────────────────────────────────────
  const addItem = async (item) => {
    const { error } = await supabase.from('logistics_items').insert([{
      id: generateId(), ...item,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const updateItem = async (id, updates) => {
    const { error } = await supabase.from('logistics_items')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  const deleteItem = async (id) => {
    const { error } = await supabase.from('logistics_items').update({ is_active: false }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── Stock In ──────────────────────────────────────────────────
  const stockIn = async (itemId, qty, date, supplier, reference, notes, unitCost = 0, userName = '') => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const { error: ie } = await supabase.from('logistics_items').update({
      balance:   item.balance + qty,
      total_in:  (item.total_in || 0) + qty,
      unit_cost: unitCost > 0 ? unitCost : item.unit_cost,
      updated_at: new Date().toISOString(),
    }).eq('id', itemId)
    if (ie) throw new Error(ie.message)
    const { error: te } = await supabase.from('logistics_transactions').insert([{
      id: generateId(), type: 'IN', item_id: itemId, item_name: item.name,
      category: item.category, qty, date, supplier, reference,
      unit_cost: unitCost, total_cost: qty * (unitCost || item.unit_cost || 0),
      notes, user_name: userName, created_at: new Date().toISOString(),
    }])
    if (te) throw new Error(te.message)
    await fetchAll()
  }

  // ── Stock Out ─────────────────────────────────────────────────
  const stockOut = async (itemId, qty, date, issuedTo, authorizedBy, notes, deliveryId = null, batchId = null, userName = '') => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    if (qty > item.balance) throw new Error(`Insufficient stock. Available: ${item.balance} ${item.unit}`)
    const { error: ie } = await supabase.from('logistics_items').update({
      balance:   item.balance - qty,
      total_out: (item.total_out || 0) + qty,
      updated_at: new Date().toISOString(),
    }).eq('id', itemId)
    if (ie) throw new Error(ie.message)
    const { error: te } = await supabase.from('logistics_transactions').insert([{
      id: generateId(), type: 'OUT', item_id: itemId, item_name: item.name,
      category: item.category, qty, date, issued_to: issuedTo,
      authorized_by: authorizedBy, delivery_id: deliveryId, batch_id: batchId,
      unit_cost: item.unit_cost, total_cost: qty * (item.unit_cost || 0),
      notes, user_name: userName, created_at: new Date().toISOString(),
    }])
    if (te) throw new Error(te.message)
    await fetchAll()
  }

  // ── Deliveries ─────────────────────────────────────────────────
  const addDelivery = async (delivery, userName = '') => {
    const id            = generateId()
    const deliveryItems = delivery.items || []
    const totalReceived = deliveryItems.reduce((s, it) => s + (it.received || 0), 0)
    const totalLoaded   = deliveryItems.reduce((s, it) => s + (it.loaded || 0), 0)
    const { error } = await supabase.from('logistics_deliveries').insert([{
      id, ...delivery,
      total_loaded: totalLoaded, total_received: totalReceived,
      created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    // Auto stock-in received items
    for (const it of deliveryItems.filter(it => it.name && it.received > 0)) {
      const existing = items.find(i => i.name.toLowerCase() === it.name.toLowerCase() && i.category === it.category)
      if (existing) {
        await stockIn(existing.id, it.received, delivery.date, delivery.supplier, delivery.delivery_note, `Delivery ${id}`, it.unit_cost || 0, userName)
      } else {
        // Auto-create item
        await supabase.from('logistics_items').insert([{
          id: generateId(), name: it.name, category: it.category || 'General',
          unit: it.unit || 'pcs', balance: it.received, total_in: it.received,
          total_out: 0, unit_cost: it.unit_cost || 0, reorder_level: 0,
          is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
    }
    await fetchAll()
    return id
  }

  // ── Batch Plant ────────────────────────────────────────────────
  const addBatchRecord = async (record, userName = '') => {
    const id = generateId()
    const { error } = await supabase.from('batch_plant_records').insert([{
      id, ...record, created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    // Auto deduct raw materials
    const matMap = {
      cement:   { name: 'Cement',               unit: 'kg', category: 'Batch Plant', qty: record.cement_kg    || 0 },
      sand:     { name: 'Sand',                  unit: 'kg', category: 'Batch Plant', qty: record.sand_kg      || 0 },
      stone:    { name: 'Aggregate (Stone)',      unit: 'kg', category: 'Batch Plant', qty: record.stone_kg    || 0 },
      water:    { name: 'Water',                  unit: 'L',  category: 'Batch Plant', qty: record.water_litres|| 0 },
      additive: { name: 'Additive',               unit: 'kg', category: 'Batch Plant', qty: record.additive_kg || 0 },
    }
    for (const mat of Object.values(matMap)) {
      if (mat.qty <= 0) continue
      const itm = items.find(i => i.name.toLowerCase() === mat.name.toLowerCase() && i.category === mat.category)
      if (itm && itm.balance >= mat.qty) {
        await stockOut(itm.id, mat.qty, record.date, 'Batch Plant', record.operator || userName,
          `Batch ${id} — ${record.volume_m3} m³ ${record.mix_design}`, null, id, userName)
      }
    }
    await fetchAll()
    return id
  }

  // ── Headcount ──────────────────────────────────────────────────
  const setHeadcount = async (date, count, notes, recordedBy) => {
    const id = generateId()
    const { error } = await supabase.from('camp_headcount').upsert([{
      id, date, count, notes, recorded_by: recordedBy,
    }], { onConflict: 'date' })
    if (error) throw new Error(error.message)
    await fetchAll()
  }

  // ── PPE Issuance ───────────────────────────────────────────────
  const issuePPE = async (issuance, userName = '') => {
    const { error } = await supabase.from('ppe_issuances').insert([{
      id: generateId(), ...issuance, created_at: new Date().toISOString(),
    }])
    if (error) throw new Error(error.message)
    if (issuance.item_id) {
      await stockOut(issuance.item_id, issuance.qty, issuance.date,
        issuance.employee_id, issuance.issued_by || userName,
        `PPE Issue: ${issuance.reason || ''}`, null, null, userName)
    }
    await fetchAll()
  }

  // ── Analytics ──────────────────────────────────────────────────
  const getConsumptionRatio = (itemId, dateFrom, dateTo) => {
    const outTx     = transactions.filter(t => t.item_id === itemId && t.type === 'OUT' && t.date >= dateFrom && t.date <= dateTo)
    const totalOut  = outTx.reduce((s, t) => s + (t.qty || 0), 0)
    const hcInRange = headcounts.filter(h => h.date >= dateFrom && h.date <= dateTo)
    const avgHC     = hcInRange.length > 0 ? hcInRange.reduce((s, h) => s + (h.count || 0), 0) / hcInRange.length : 0
    const days      = hcInRange.length || 1
    return { totalOut, avgHeadcount: avgHC, perPersonPerDay: avgHC > 0 ? totalOut / (avgHC * days) : 0, days }
  }

  const getBatchEfficiency = (days = 30) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days)
    const recent = batchRecords.filter(r => new Date(r.date) >= cutoff)
    if (!recent.length) return null
    const totalVolume = recent.reduce((s, r) => s + (r.volume_m3  || 0), 0)
    const totalCement = recent.reduce((s, r) => s + (r.cement_kg  || 0), 0)
    return { totalVolume, totalCement, avgCement: totalVolume > 0 ? totalCement / totalVolume : 0, batches: recent.length }
  }

  return (
    <LogisticsContext.Provider value={{
      items, transactions, deliveries, batchRecords, headcounts, ppeIssuances, loading,
      addItem, updateItem, deleteItem,
      stockIn, stockOut,
      addDelivery, addBatchRecord,
      setHeadcount, issuePPE,
      getConsumptionRatio, getBatchEfficiency,
      fetchAll,
    }}>
      {children}
    </LogisticsContext.Provider>
  )
}

export function useLogistics() {
  const ctx = useContext(LogisticsContext)
  if (!ctx) throw new Error('useLogistics must be used inside LogisticsProvider')
  return ctx
}
