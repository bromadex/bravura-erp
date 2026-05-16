// src/contexts/ProcurementContext.jsx
//
// FIX: toast.info() does not exist in react-hot-toast.
// Replaced with toast() which works for neutral messages.
//
// ADDED: fulfillStoreRequisition() — storekeeper issues items from stock
// after HOD approval. Deducts from inventory and marks fulfilled.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { pushNotificationToHOD, pushNotificationToRoles, pushNotificationFromTemplate } from '../engine/notificationEngine'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../engine/transactionEngine'

const ProcurementContext = createContext(null)

export function ProcurementProvider({ children }) {
  const [suppliers,            setSuppliers]            = useState([])
  const [storeRequisitions,    setStoreRequisitions]    = useState([])
  const [purchaseRequisitions, setPurchaseRequisitions] = useState([])
  const [purchaseOrders,       setPurchaseOrders]       = useState([])
  const [goodsReceived,        setGoodsReceived]        = useState([])
  const [rfqs,                 setRfqs]                 = useState([])
  const [rfqQuotations,        setRfqQuotations]        = useState([])
  const [purchaseInvoices,     setPurchaseInvoices]     = useState([])
  const [budgets,              setBudgets]              = useState([])
  const [loading,              setLoading]              = useState(true)

  const generateId = () => crypto.randomUUID()

  const safe = (q) => q.catch(() => ({ data: [] }))

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, srRes, prRes, poRes, grRes, rfqRes, quotRes, piRes, budRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('store_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }),
        supabase.from('goods_received').select('*').order('date', { ascending: false }),
        safe(supabase.from('rfq').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('rfq_quotations').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('purchase_invoices').select('*').order('invoice_date', { ascending: false })),
        safe(supabase.from('procurement_budgets').select('*').order('department')),
      ])
      if (supRes.data) setSuppliers(supRes.data)
      if (srRes.data)  setStoreRequisitions(srRes.data)
      if (prRes.data)  setPurchaseRequisitions(prRes.data)
      if (poRes.data)  setPurchaseOrders(poRes.data)
      if (grRes.data)  setGoodsReceived(grRes.data)
      if (rfqRes.data)  setRfqs(rfqRes.data)
      if (quotRes.data) setRfqQuotations(quotRes.data)
      if (piRes.data)   setPurchaseInvoices(piRes.data)
      if (budRes.data)  setBudgets(budRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load procurement data')
    } finally { setLoading(false) }
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

  // ── Store Requisitions ────────────────────────────────────
  const createStoreRequisition = async (req) => {
    const id = generateId()
    const srNumber = await generateTxnCode('SR')
    const { error } = await supabase.from('store_requisitions').insert([{
      id,
      req_number: srNumber,
      sr_number:  srNumber,
      ...req,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    if (error) throw error

    // Notify HOD that a requisition needs approval
    await pushNotificationFromTemplate('sr_submitted', {
      requester_name: req.requester_name || 'Someone',
      req_number:     srNumber,
    }, { department: req.department }, {
      type:    'requisition_submitted',
      title:   'Store Requisition Pending Approval',
      message: `${req.requester_name || 'Someone'} submitted ${srNumber} for your approval.`,
      link:    '/module/procurement/store-requisitions',
    })

    await fetchAll()
    return id
  }

  const updateStoreRequisition = async (id, updates) => {
    const { error } = await supabase.from('store_requisitions').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Step 1: HOD approves — checks stock, auto-creates PRs for shortages
  const approveStoreRequisition = async (id, approverName, approverId) => {
    const req = storeRequisitions.find(r => r.id === id)
    if (!req) throw new Error('Requisition not found')

    const items    = typeof req.items === 'string' ? JSON.parse(req.items || '[]') : (req.items || [])
    const deficits = []

    for (const it of items) {
      const { data: itemData } = await supabase
        .from('items')
        .select('balance, id')
        .ilike('name', it.name)
        .maybeSingle()
      const balance = itemData?.balance || 0
      if (it.qty > balance) {
        deficits.push({ ...it, deficit: it.qty - balance, available: balance })
      }
    }

    const { error } = await supabase.from('store_requisitions').update({
      status:        'approved',
      approver_id:   approverId,
      approver_name: approverName,
      approved_at:   new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error

    // Auto-create PRs for items with insufficient stock
    for (const deficit of deficits) {
      const prId     = generateId()
      const prNumber = await generateTxnCode('PR')
      await supabase.from('purchase_requisitions').insert([{
        id: prId, pr_number: prNumber,
        date:           new Date().toISOString().split('T')[0],
        department:     req.department,
        requester_id:   req.requester_id,
        requester_name: req.requester_name,
        source_req_id:  id,
        priority:       req.priority || 'normal',
        items: [{
          name:          deficit.name,
          category:      deficit.category,
          requested_qty: deficit.deficit,
          unit:          deficit.unit || 'pcs',
          notes:         `Auto-generated: ${deficit.deficit} needed, ${deficit.available} in stock. From ${req.sr_number || req.req_number}`,
        }],
        status:     'submitted',
        created_at: new Date().toISOString(),
      }])
    }

    // ✅ FIX: toast() not toast.info() — react-hot-toast has no .info method
    if (deficits.length) {
      toast(`${deficits.length} Purchase Requisition(s) auto-created for stock shortages`, {
        icon: '📋',
        duration: 5000,
      })
    }

    // Notify storekeepers that a requisition is ready to fulfil
    const srNum = req?.sr_number || req?.req_number || id
    await pushNotificationFromTemplate('sr_ready_to_fulfil', {
      req_number: srNum,
    }, { roles: ['role_storekeeper', 'role_store_manager'] }, {
      type:    'requisition_approved',
      title:   'Store Requisition Ready to Fulfil',
      message: `SR ${srNum} is ready to fulfil from store.`,
      link:    '/module/procurement/store-requisitions',
    })

    await fetchAll()
  }

  // Step 2: Storekeeper fulfills — issues items from stock, marks fulfilled
  const fulfillStoreRequisition = async (id, issuedBy, issuedById) => {
    const req = storeRequisitions.find(r => r.id === id)
    if (!req) throw new Error('Requisition not found')
    if (req.status !== 'approved') throw new Error('Only approved requisitions can be fulfilled')

    const items    = typeof req.items === 'string' ? JSON.parse(req.items || '[]') : (req.items || [])
    const issued   = []
    const notIssued = []

    for (const it of items) {
      // Find item in inventory by name (case-insensitive)
      const { data: invItem } = await supabase
        .from('items')
        .select('*')
        .ilike('name', it.name)
        .maybeSingle()

      if (!invItem) {
        notIssued.push({ ...it, reason: 'Item not found in inventory' })
        continue
      }

      const issueQty = Math.min(it.qty, invItem.balance)
      if (issueQty <= 0) {
        notIssued.push({ ...it, reason: 'No stock available' })
        continue
      }

      // Deduct from inventory
      await supabase.from('items').update({
        balance:   invItem.balance - issueQty,
        total_out: (invItem.total_out || 0) + issueQty,
      }).eq('id', invItem.id)

      // Record transaction
      await supabase.from('transactions').insert([{
        id:            generateId(),
        type:          'OUT',
        item_id:       invItem.id,
        item_name:     invItem.name,
        category:      invItem.category,
        qty:           issueQty,
        date:          new Date().toISOString().split('T')[0],
        issued_to:     req.department,
        authorized_by: req.approver_name || issuedBy,
        notes:         `Store Requisition: ${req.sr_number || req.req_number} — Requested by ${req.requester_name}`,
        user_name:     issuedBy,
        created_at:    new Date().toISOString(),
      }])

      issued.push({ ...it, issued_qty: issueQty })
    }

    // Mark as fulfilled (or partially fulfilled)
    const newStatus = notIssued.length === 0 ? 'fulfilled' : 'partially_fulfilled'
    await supabase.from('store_requisitions').update({
      status:        newStatus,
      issued_by:     issuedBy,
      issued_by_id:  issuedById,
      issued_at:     new Date().toISOString(),
      issued_items:  JSON.stringify(issued),
      not_issued:    notIssued.length > 0 ? JSON.stringify(notIssued) : null,
      updated_at:    new Date().toISOString(),
    }).eq('id', id)

    if (notIssued.length > 0) {
      toast(`Partially fulfilled — ${notIssued.length} item(s) could not be issued: ${notIssued.map(n => n.name).join(', ')}`, { icon: '⚠️', duration: 6000 })
    }
    await fetchAll()
    return { issued, notIssued }
  }

  const rejectStoreRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('store_requisitions').update({
      status:           'rejected',
      approver_id:      approverId,
      approver_name:    approverName,
      rejection_reason: reason,
      updated_at:       new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Purchase Requisitions ─────────────────────────────────
  const approvePurchaseRequisition = async (id, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'approved', approver_id: approverId, approver_name: approverName,
      approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const rejectPurchaseRequisition = async (id, reason, approverName, approverId) => {
    const { error } = await supabase.from('purchase_requisitions').update({
      status: 'rejected', approver_id: approverId, approver_name: approverName,
      rejection_reason: reason, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Purchase Orders ───────────────────────────────────────
  const createPurchaseOrder = async (po) => {
    const id       = generateId()
    const poNumber = await generateTxnCode('PO')
    const { error } = await supabase.from('purchase_orders').insert([{
      id, po_number: poNumber, ...po, created_at: new Date().toISOString(),
    }])
    if (error) throw error
    await fetchAll()
    return id
  }

  const updatePurchaseOrderStatus = async (id, status) => {
    const { error } = await supabase.from('purchase_orders').update({
      status, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Goods Received ────────────────────────────────────────
  const createGoodsReceived = async (grn) => {
    const id        = generateId()
    const grnNumber = await generateTxnCode('GRN')
    const { error } = await supabase.from('goods_received').insert([{
      id, grn_number: grnNumber, ...grn, created_at: new Date().toISOString(),
    }])
    if (error) throw error

    // Auto-update inventory stock
    for (const it of grn.items) {
      const { data: existing } = await supabase.from('items').select('*').ilike('name', it.name).maybeSingle()
      if (!existing) {
        await supabase.from('items').insert([{
          id: generateId(), name: it.name, category: it.category,
          unit: it.unit || 'pcs', balance: it.received, total_in: it.received,
          total_out: 0, cost: it.unit_cost || 0, threshold: 5, notes: '',
        }])
      } else {
        await supabase.from('items').update({
          balance:  existing.balance + it.received,
          total_in: (existing.total_in || 0) + it.received,
          cost: it.unit_cost > 0 ? it.unit_cost : existing.cost,
        }).eq('id', existing.id)
      }
      await supabase.from('transactions').insert([{
        id: generateId(), type: 'GRN', item_name: it.name, category: it.category,
        qty: it.received, date: grn.date,
        delivered_by: grn.supplier_name || grn.driver || '',
        received_by: grn.received_by || '',
        notes: `GRN: ${grnNumber}`,
        user_name: grn.received_by || '',
        created_at: new Date().toISOString(),
      }])
    }

    if (grn.po_id) {
      await supabase.from('purchase_orders').update({ status: 'partially_received' }).eq('id', grn.po_id)
    }
    await fetchAll()
    return id
  }

  // ── RFQ ───────────────────────────────────────────────────
  const createRFQ = async (rfq) => {
    const id = generateId()
    const rfqNumber = await generateTxnCode('RFQ')
    const { error } = await supabase.from('rfq').insert([{
      id, rfq_number: rfqNumber, ...rfq, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'procurement', action: 'CREATE', entityType: 'rfq', entityId: id, entityName: rfqNumber })
    await fetchAll(); return id
  }

  const updateRFQ = async (id, updates) => {
    const { error } = await supabase.from('rfq').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Quotations ────────────────────────────────────────────
  const addQuotation = async (quot) => {
    const id = generateId()
    const { error } = await supabase.from('rfq_quotations').insert([{ id, ...quot, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll(); return id
  }

  const selectQuotation = async (quotId, rfqId, reason = '') => {
    await supabase.from('rfq_quotations').update({ status: 'Selected', selected_reason: reason }).eq('id', quotId)
    await supabase.from('rfq_quotations').update({ status: 'Rejected' }).eq('rfq_id', rfqId).neq('id', quotId)
    await supabase.from('rfq').update({ status: 'Closed', updated_at: new Date().toISOString() }).eq('id', rfqId)
    await fetchAll()
  }

  const deleteQuotation = async (id) => {
    const { error } = await supabase.from('rfq_quotations').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Purchase Invoices ─────────────────────────────────────
  const createPurchaseInvoice = async (pi) => {
    const id = generateId()
    const piNumber = await generateTxnCode('PI')
    // outstanding is GENERATED ALWAYS AS (total_amount - paid_amount) STORED — do not insert it
    const { outstanding: _drop, ...piData } = pi
    const { error } = await supabase.from('purchase_invoices').insert([{
      id, pi_number: piNumber, ...piData,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'procurement', action: 'CREATE', entityType: 'purchase_invoice', entityId: id, entityName: piNumber })
    await fetchAll(); return id
  }

  const updatePurchaseInvoice = async (id, updates) => {
    const { error } = await supabase.from('purchase_invoices').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const recordPayment = async (id, { amount, method, reference, date }) => {
    const inv = purchaseInvoices.find(p => p.id === id)
    if (!inv) throw new Error('Invoice not found')
    const newPaid = (inv.paid_amount || 0) + amount
    const newStatus = newPaid >= inv.total_amount ? 'Paid' : 'Partially Paid'
    const { error } = await supabase.from('purchase_invoices').update({
      paid_amount: newPaid, status: newStatus,
      payment_method: method, payment_reference: reference, payment_date: date,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'procurement', action: 'PAYMENT', entityType: 'purchase_invoice', entityId: id, entityName: inv.pi_number })
    await fetchAll()
  }

  // ── Budgets ───────────────────────────────────────────────
  const createBudget = async (budget) => {
    const id = generateId()
    const { error } = await supabase.from('procurement_budgets').insert([{ id, ...budget, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll(); return id
  }

  const updateBudget = async (id, updates) => {
    const { error } = await supabase.from('procurement_budgets').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteBudget = async (id) => {
    const { error } = await supabase.from('procurement_budgets').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Budget helper: check if PO is within budget ───────────
  const checkBudget = (department, amount, fiscalYear = new Date().getFullYear()) => {
    const deptBudgets = budgets.filter(b => b.department === department && b.fiscal_year === fiscalYear)
    if (!deptBudgets.length) return { ok: true, warning: false, message: 'No budget configured' }
    const annual = deptBudgets.find(b => b.period === 'annual') || deptBudgets[0]
    const spent  = purchaseOrders
      .filter(p => p.department === department && p.status !== 'Cancelled')
      .reduce((s, p) => s + (p.total_amount || 0), 0)
    const remaining = (annual.budget_amount || 0) - spent
    const pctUsed   = (annual.budget_amount || 0) > 0 ? (spent + amount) / annual.budget_amount * 100 : 0
    if (spent + amount > annual.budget_amount) return { ok: false, warning: true, message: `Over budget by $${((spent + amount - annual.budget_amount)).toFixed(2)}`, pctUsed }
    if (pctUsed > (annual.alert_threshold || 80)) return { ok: true, warning: true, message: `Budget at ${pctUsed.toFixed(0)}% — only $${remaining.toFixed(2)} remaining`, pctUsed }
    return { ok: true, warning: false, message: `$${remaining.toFixed(2)} remaining (${(100 - pctUsed).toFixed(0)}%)`, pctUsed }
  }

  return (
    <ProcurementContext.Provider value={{
      suppliers, storeRequisitions, purchaseRequisitions, purchaseOrders, goodsReceived,
      rfqs, rfqQuotations, purchaseInvoices, budgets, loading,
      addSupplier, updateSupplier, deleteSupplier,
      createStoreRequisition, updateStoreRequisition,
      approveStoreRequisition, rejectStoreRequisition, fulfillStoreRequisition,
      approvePurchaseRequisition, rejectPurchaseRequisition,
      createPurchaseOrder, updatePurchaseOrderStatus,
      createGoodsReceived,
      createRFQ, updateRFQ,
      addQuotation, selectQuotation, deleteQuotation,
      createPurchaseInvoice, updatePurchaseInvoice, recordPayment,
      createBudget, updateBudget, deleteBudget, checkBudget,
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
