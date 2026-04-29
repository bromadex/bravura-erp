// src/contexts/ProcurementContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const ProcurementContext = createContext(null)

export function ProcurementProvider({ children }) {
  const [suppliers, setSuppliers] = useState([])
  const [storeRequisitions, setStoreRequisitions] = useState([])
  const [purchaseRequisitions, setPurchaseRequisitions] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [goodsReceived, setGoodsReceived] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, srRes, prRes, poRes, grRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('store_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }),
        supabase.from('goods_received').select('*').order('date', { ascending: false }),
      ])
      if (supRes.data) setSuppliers(supRes.data)
      if (srRes.data) setStoreRequisitions(srRes.data)
      if (prRes.data) setPurchaseRequisitions(prRes.data)
      if (poRes.data) setPurchaseOrders(poRes.data)
      if (grRes.data) setGoodsReceived(grRes.data)
    } catch (err) { console.error(err); toast.error('Failed to load procurement data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Suppliers ─────────────────────────────────────────────
  const addSupplier = async (supplier) => {
    const id = generateId()
    const { error } = await supabase.from('suppliers').insert([{ id, ...supplier, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }
  const updateSupplier = async (id, updates) => {
    const { error } = await supabase.from('suppliers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }
  const deleteSupplier = async (id) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Store Requisitions ───────────────────────────────────
  const createStoreRequisition = async (req) => {
    const id = generateId()
    const reqNumber = `SR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error } = await supabase.from('store_requisitions').insert([{ id, req_number: reqNumber, ...req, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }
  const updateStoreRequisition = async (id, updates) => {
    const { error } = await supabase.from('store_requisitions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }
  const approveStoreRequisition = async (id, approverName, approverId) => {
    const req = storeRequisitions.find(r => r.id === id)
    if (!req) throw new Error('Requisition not found')
    const items = typeof req.items === 'string' ? JSON.parse(req.items) : req.items
    const deficits = []
    for (const it of items) {
      const { data: itemData } = await supabase.from('items').select('balance').eq('name', it.name).maybeSingle()
      const balance = itemData?.balance || 0
      if (it.qty > balance) deficits.push({ ...it, deficit: it.qty - balance })
    }
    const { error } = await supabase.from('store_requisitions').update({
      status: 'approved', approver_id: approverId, approver_name: approverName, approved_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    for (const deficit of deficits) {
      const prId = generateId()
      const prNumber = `PR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
      await supabase.from('purchase_requisitions').insert([{
        id: prId, pr_number: prNumber, date: new Date().toISOString().split('T')[0],
        department: req.department, requester_id: req.requester_id, requester_name: req.requester_name,
        source_req_id: id, priority: req.priority,
        items: [{ name: deficit.name, category: deficit.category, requested_qty: deficit.deficit, unit: deficit.unit || 'pcs', notes: `Auto from ${req.req_number}` }],
        status: 'submitted', created_at: new Date().toISOString()
      }])
    }
    if (deficits.length) toast.info(`${deficits.length} PR(s) created for stock shortages`)
    await fetchAll()
  }
  const rejectStoreRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('store_requisitions').update({
      status: 'rejected', approver_id: approverId, approver_name: approverName, rejection_reason: reason, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Purchase Requisitions ────────────────────────────────
  const approvePurchaseRequisition = async (id, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'approved', approver_id: approverId, approver_name: approverName, approved_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }
  const rejectPurchaseRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'rejected', approver_id: approverId, approver_name: approverName, rejection_reason: reason, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Purchase Orders ──────────────────────────────────────
  const createPurchaseOrder = async (po) => {
    const id = generateId()
    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error } = await supabase.from('purchase_orders').insert([{ id, po_number: poNumber, ...po, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }
  const updatePurchaseOrderStatus = async (id, status) => {
    const { error } = await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Goods Received ───────────────────────────────────────
  const createGoodsReceived = async (grn) => {
    const id = generateId()
    const grnNumber = `GRN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error } = await supabase.from('goods_received').insert([{ id, grn_number: grnNumber, ...grn, created_at: new Date().toISOString() }])
    if (error) throw error
    // Update stock for each item
    for (const it of grn.items) {
      const { data: existing } = await supabase.from('items').select('*').eq('name', it.name).maybeSingle()
      if (!existing) {
        await supabase.from('items').insert([{ id: generateId(), name: it.name, category: it.category, unit: it.unit || 'pcs', balance: it.received, total_in: it.received, total_out: 0, cost: it.unit_cost || 0, threshold: 5, notes: '' }])
      } else {
        await supabase.from('items').update({ balance: existing.balance + it.received, total_in: (existing.total_in || 0) + it.received, cost: it.unit_cost > 0 ? it.unit_cost : existing.cost }).eq('id', existing.id)
      }
      await supabase.from('transactions').insert([{ id: generateId(), type: 'GRN', item_name: it.name, category: it.category, qty: it.received, date: grn.date, delivered_by: grn.supplier_name || grn.driver || '', received_by: grn.received_by || '', notes: `GRN: ${grnNumber}`, user_name: grn.received_by || '', created_at: new Date().toISOString() }])
    }
    if (grn.po_id) {
      await supabase.from('purchase_orders').update({ status: 'partially_received' }).eq('id', grn.po_id)
    }
    await fetchAll()
    return id
  }

  return (
    <ProcurementContext.Provider value={{
      suppliers, storeRequisitions, purchaseRequisitions, purchaseOrders, goodsReceived, loading,
      addSupplier, updateSupplier, deleteSupplier,
      createStoreRequisition, updateStoreRequisition, approveStoreRequisition, rejectStoreRequisition,
      approvePurchaseRequisition, rejectPurchaseRequisition,
      createPurchaseOrder, updatePurchaseOrderStatus,
      createGoodsReceived,
      fetchAll,
    }}>
      {children}
    </ProcurementContext.Provider>
  )
}

export function useProcurement() {
  const ctx = useContext(ProcurementContext)
  if (!ctx) throw new Error('useProcurement must be used inside ProcurementProvider')
  return ctx
}
