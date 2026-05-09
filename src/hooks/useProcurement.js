import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export function useProcurement() {
  const [suppliers, setSuppliers] = useState([])
  const [storeRequisitions, setStoreRequisitions] = useState([])
  const [purchaseRequisitions, setPurchaseRequisitions] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [goodsReceived, setGoodsReceived] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // Fetch all procurement data
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, storeRes, prRes, poRes, grRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('store_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }),
        supabase.from('goods_received').select('*').order('date', { ascending: false }),
      ])
      if (supRes.data) setSuppliers(supRes.data)
      if (storeRes.data) setStoreRequisitions(storeRes.data)
      if (prRes.data) setPurchaseRequisitions(prRes.data)
      if (poRes.data) setPurchaseOrders(poRes.data)
      if (grRes.data) setGoodsReceived(grRes.data)
    } catch (err) { console.error(err); toast.error('Failed to load procurement data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ---------- Suppliers ----------
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

  // ---------- Store Requisitions ----------
  const createStoreRequisition = async (req) => {
    const id = generateId()
    const reqNumber = `SR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4,'0')}`
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
    // First, get the requisition
    const { data: req, error: fetchErr } = await supabase.from('store_requisitions').select('*').eq('id', id).single()
    if (fetchErr) throw fetchErr

    // Check each item against current stock and create purchase requisitions for deficits
    const items = typeof req.items === 'string' ? JSON.parse(req.items) : req.items
    const deficits = []
    for (const it of items) {
      const { data: itemData } = await supabase.from('items').select('balance').eq('name', it.name).maybeSingle()
      const balance = itemData?.balance || 0
      const deficit = it.qty - balance
      if (deficit > 0) {
        deficits.push({ ...it, deficit })
      }
    }

    // Update status to approved
    const { error: updateErr } = await supabase.from('store_requisitions').update({
      status: 'approved',
      approver_id: approverId,
      approver_name: approverName,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (updateErr) throw updateErr

    // Create Purchase Requisitions for deficits
    for (const deficit of deficits) {
      const prId = generateId()
      const prNumber = `PR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4,'0')}`
      const prItems = [{
        name: deficit.name,
        category: deficit.category,
        requested_qty: deficit.deficit,
        unit: deficit.unit || 'pcs',
        suggested_supplier: '',
        notes: `Auto-created from store requisition ${req.req_number}`
      }]
      await supabase.from('purchase_requisitions').insert([{
        id: prId,
        pr_number: prNumber,
        date: new Date().toISOString().split('T')[0],
        department: req.department,
        requester_id: req.requester_id,
        requester_name: req.requester_name,
        source_req_id: id,
        items: prItems,
        priority: req.priority,
        status: 'submitted',
        notes: `Generated due to stock shortage for ${deficit.name}`,
        created_at: new Date().toISOString()
      }])
    }
    await fetchAll()
    if (deficits.length) toast.info(`${deficits.length} purchase requisition(s) created due to stock shortage`)
    return deficits
  }

  const rejectStoreRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('store_requisitions').update({
      status: 'rejected',
      approver_id: approverId,
      approver_name: approverName,
      rejection_reason: reason,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---------- Purchase Requisitions ----------
  const createPurchaseRequisition = async (pr) => {
    const id = generateId()
    const prNumber = `PR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4,'0')}`
    const { error } = await supabase.from('purchase_requisitions').insert([{ id, pr_number: prNumber, ...pr, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }

  const approvePurchaseRequisition = async (id, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'approved',
      approver_id: approverId,
      approver_name: approverName,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const rejectPurchaseRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'rejected',
      approver_id: approverId,
      approver_name: approverName,
      rejection_reason: reason,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ---------- Purchase Orders ----------
  const createPurchaseOrder = async (po) => {
    const id = generateId()
    const poNumber = `PO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4,'0')}`
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

  // ---------- Goods Received ----------
  const createGoodsReceived = async (grn) => {
    const id = generateId()
    const grnNumber = `GRN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4,'0')}`
    const { error } = await supabase.from('goods_received').insert([{ id, grn_number: grnNumber, ...grn, created_at: new Date().toISOString() }])
    if (error) throw error

    // Update stock for each received item
    for (const it of grn.items) {
      // Find or create item
      let item = null
      const { data: existing } = await supabase.from('items').select('*').eq('name', it.name).maybeSingle()
      if (!existing) {
        // Create new item with opening balance = received qty
        const newId = generateId()
        await supabase.from('items').insert([{
          id: newId,
          name: it.name,
          category: it.category,
          unit: it.unit,
          balance: it.received,
          total_in: it.received,
          total_out: 0,
          cost: it.unit_cost || 0,
          threshold: 5,
          notes: ''
        }])
      } else {
        // Update existing item
        const newBalance = existing.balance + it.received
        const newTotalIn = (existing.total_in || 0) + it.received
        await supabase.from('items').update({
          balance: newBalance,
          total_in: newTotalIn,
          cost: it.unit_cost || existing.cost // optionally average cost
        }).eq('id', existing.id)
      }

      // Insert serial numbers if provided
      if (it.serial_numbers && it.serial_numbers.length) {
        for (const sn of it.serial_numbers) {
          await supabase.from('serial_numbers').insert([{
            id: generateId(),
            item_id: existing?.id || (await supabase.from('items').select('id').eq('name', it.name).single()).data.id,
            item_name: it.name,
            serial_number: sn,
            batch_number: it.lot_batch,
            expiry_date: it.expiry_date,
            status: 'in_stock',
            received_in_grn_id: id
          }])
        }
      }
    }

    // Update PO status if fully received
    if (grn.po_id) {
      const { data: po } = await supabase.from('purchase_orders').select('items, total_amount').eq('id', grn.po_id).single()
      const poItems = typeof po.items === 'string' ? JSON.parse(po.items) : po.items
      let allReceived = true
      for (const poIt of poItems) {
        const receivedQty = grn.items.filter(git => git.name === poIt.name).reduce((sum, git) => sum + git.received, 0)
        if (receivedQty < poIt.ordered_qty) allReceived = false
      }
      const newStatus = allReceived ? 'completed' : 'partially_received'
      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', grn.po_id)
    }

    await fetchAll()
    return id
  }

  return {
    suppliers,
    storeRequisitions,
    purchaseRequisitions,
    purchaseOrders,
    goodsReceived,
    loading,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    createStoreRequisition,
    updateStoreRequisition,
    approveStoreRequisition,
    rejectStoreRequisition,
    createPurchaseRequisition,
    approvePurchaseRequisition,
    rejectPurchaseRequisition,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    createGoodsReceived,
    fetchAll,
  }
}
