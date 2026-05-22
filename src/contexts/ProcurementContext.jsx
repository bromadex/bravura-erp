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
  const [poLines,              setPoLines]              = useState([])
  const [grnLines,             setGrnLines]             = useState([])
  const [invoiceLines,         setInvoiceLines]         = useState([])
  const [rfqLines,             setRfqLines]             = useState([])
  const [quotLines,            setQuotLines]            = useState([])
  const [stockTransfers,       setStockTransfers]       = useState([])

  const generateId = () => crypto.randomUUID()

  const safe = (q) => Promise.resolve(q).catch(() => ({ data: [] }))

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, srRes, prRes, poRes, grRes, rfqRes, quotRes, piRes, budRes,
             polRes, grlRes, pilRes, rflRes, qllRes] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('store_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_requisitions').select('*').order('created_at', { ascending: false }),
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }),
        supabase.from('goods_received').select('*').order('date', { ascending: false }),
        safe(supabase.from('rfq').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('rfq_quotations').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('purchase_invoices').select('*').order('invoice_date', { ascending: false })),
        safe(supabase.from('procurement_budgets').select('*').order('department')),
        safe(supabase.from('purchase_order_lines').select('*').order('created_at')),
        safe(supabase.from('grn_lines').select('*').order('created_at')),
        safe(supabase.from('purchase_invoice_lines').select('*').order('created_at')),
        safe(supabase.from('rfq_lines').select('*').order('created_at')),
        safe(supabase.from('quotation_lines').select('*').order('created_at')),
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
      if (polRes.data) setPoLines(polRes.data)
      if (grlRes.data) setGrnLines(grlRes.data)
      if (pilRes.data) setInvoiceLines(pilRes.data)
      if (rflRes.data) setRfqLines(rflRes.data)
      if (qllRes.data) setQuotLines(qllRes.data)
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
    const before = suppliers.find(s => s.id === id)
    const { error } = await supabase.from('suppliers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'procurement', action: 'UPDATE', entityType: 'supplier', entityId: id, entityName: before?.name || id, oldValues: before, newValues: { ...before, ...updates } })
    await fetchAll()
  }

  const deleteSupplier = async (id) => {
    const before = suppliers.find(s => s.id === id)
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'procurement', action: 'DELETE', entityType: 'supplier', entityId: id, entityName: before?.name || id, oldValues: before })
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

      await supabase.from('items').update({
        balance:   invItem.balance - issueQty,
        total_out: (invItem.total_out || 0) + issueQty,
      }).eq('id', invItem.id)

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

    // Write normalized purchase_order_lines
    const poItemsList = typeof po.items === 'string' ? JSON.parse(po.items || '[]') : (po.items || [])
    if (poItemsList.length > 0) {
      const lineInserts = poItemsList.map(it => ({
        id: generateId(), po_id: id,
        item_name: it.name || it.item_name || '',
        category:  it.category || '',
        unit:      it.unit || 'pcs',
        qty_ordered: parseFloat(it.ordered_qty || it.qty || 0),
        qty_received: 0, qty_invoiced: 0, qty_returned: 0,
        unit_rate: parseFloat(it.unit_cost || it.unit_price || it.rate || 0),
        warehouse_id: it.warehouse_id || null,
        mr_item_id: it.mr_item_id || null,
        status: 'Open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('purchase_order_lines').insert(lineInserts).catch(() => null)
    }

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

    // Write supplier performance log entry (delivery event)
    if (grn.supplier_id) {
      const po = grn.po_id ? purchaseOrders.find(p => p.id === grn.po_id) : null
      const deliveryDate  = grn.actual_delivery_date || grn.date
      const expectedDate  = po?.delivery_date || null
      const delayDays     = expectedDate && deliveryDate
        ? Math.floor((new Date(deliveryDate) - new Date(expectedDate)) / 86400000)
        : null
      const totalOrdered  = (grn.items || []).reduce((s, i) => s + (parseFloat(i.ordered_qty) || parseFloat(i.qty) || 0), 0)
      const totalReceived = (grn.items || []).reduce((s, i) => s + (parseFloat(i.received)    || parseFloat(i.qty) || 0), 0)

      await supabase.from('supplier_performance_log').insert([{
        id:            generateId(),
        supplier_id:   grn.supplier_id,
        supplier_name: grn.supplier_name || '',
        po_id:         grn.po_id         || null,
        grn_id:        id,
        event_type:    delayDays > 0 ? 'delivery_late' : 'delivery_on_time',
        event_date:    deliveryDate || new Date().toISOString().split('T')[0],
        expected_date: expectedDate,
        actual_date:   deliveryDate,
        delay_days:    delayDays,
        ordered_qty:   totalOrdered,
        received_qty:  totalReceived,
        quality_score: grn.quality_score ? parseInt(grn.quality_score) : null,
        created_at:    new Date().toISOString(),
      }]).catch(() => null) // non-blocking — don't fail GRN if perf log fails
    }

    // Auto-update inventory stock + write Stock Ledger Entries
    for (const it of grn.items) {
      const { data: existing } = await supabase.from('items').select('*').ilike('name', it.name).maybeSingle()
      let itemId = existing?.id
      if (!existing) {
        itemId = generateId()
        await supabase.from('items').insert([{
          id: itemId, name: it.name, category: it.category,
          unit: it.unit || 'pcs', balance: it.received, total_in: it.received,
          total_out: 0, cost: it.unit_cost || 0, threshold: 5, notes: '',
          last_purchase_rate: it.unit_cost || 0,
        }])
      } else {
        await supabase.from('items').update({
          balance:             existing.balance + it.received,
          total_in:            (existing.total_in || 0) + it.received,
          cost:                it.unit_cost > 0 ? it.unit_cost : existing.cost,
          last_purchase_rate:  it.unit_cost > 0 ? it.unit_cost : (existing.last_purchase_rate || existing.cost),
        }).eq('id', existing.id)
      }
      // Legacy transaction record
      await supabase.from('transactions').insert([{
        id: generateId(), type: 'GRN', item_name: it.name, category: it.category,
        qty: it.received, date: grn.date,
        delivered_by: grn.supplier_name || grn.driver || '',
        received_by: grn.received_by || '',
        notes: `GRN: ${grnNumber}`,
        user_name: grn.received_by || '',
        created_at: new Date().toISOString(),
      }])
      // ERPNext-style Stock Ledger Entry (triggers bin update via DB trigger)
      if (itemId) {
        await supabase.from('stock_ledger_entries').insert([{
          id:                generateId(),
          item_id:           itemId,
          warehouse_id:      it.warehouse_id || 'wh_main_store',
          voucher_type:      'Purchase Receipt',
          voucher_no:        grnNumber,
          voucher_detail_no: it.name,
          actual_qty:        parseFloat(it.received) || 0,
          incoming_rate:     parseFloat(it.unit_cost) || 0,
          outgoing_rate:     0,
          posting_date:      grn.date,
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }]).catch(() => null) // non-blocking if SLE table doesn't exist yet
      }
    }

    if (grn.po_id) {
      await supabase.from('purchase_orders').update({ status: 'partially_received' }).eq('id', grn.po_id)
    }

    // Write normalized grn_lines
    const grnItemsList = typeof grn.items === 'string' ? JSON.parse(grn.items || '[]') : (grn.items || [])
    const grnLineInserts = []
    for (const it of grnItemsList) {
      // Try to find matching PO line for FK linking
      let poLineId = null
      if (grn.po_id) {
        const matchingPoLine = poLines.find(pl =>
          pl.po_id === grn.po_id &&
          pl.item_name.toLowerCase() === (it.name || '').toLowerCase()
        )
        poLineId = matchingPoLine?.id || null
      }
      // Find item_id
      const { data: itemRow } = await supabase.from('items').select('id').ilike('name', it.name).maybeSingle()
      grnLineInserts.push({
        id: generateId(), grn_id: id,
        po_line_id: poLineId,
        item_id: itemRow?.id || null,
        item_name: it.name || '',
        category: it.category || '',
        unit: it.unit || 'pcs',
        qty_ordered: parseFloat(it.ordered || it.ordered_qty || 0),
        qty_received: parseFloat(it.received || it.qty || 0),
        qty_rejected: parseFloat(it.rejected || 0),
        unit_rate: parseFloat(it.unit_cost || it.unit_price || 0),
        warehouse_id: it.warehouse_id || 'wh_main_store',
        batch_no: it.batch_no || it.lot_batch || null,
        lot_batch: it.lot_batch || null,
        notes: it.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
    if (grnLineInserts.length > 0) {
      await supabase.from('grn_lines').insert(grnLineInserts).catch(() => null)
    }

    // Auto GL posting for GRN
    try {
      const { postToGL } = await import('../engine/accountingEngine')
      // Fetch GL config
      const { data: glConfig } = await supabase
        .from('inventory_gl_accounts')
        .select('*')
        .eq('event_type', 'grn_receipt')
        .eq('is_active', true)
        .maybeSingle()

      if (glConfig?.debit_account_code && glConfig?.credit_account_code) {
        const totalVal = grnItemsList.reduce((s, it) =>
          s + (parseFloat(it.received || 0) * parseFloat(it.unit_cost || 0)), 0)
        if (totalVal > 0) {
          // Resolve account codes to IDs (engine uses resolveAccounts internally via account_code)
          await postToGL({
            sourceModule: 'procurement',
            sourceType:   'goods_received',
            sourceId:     `${grnNumber}-auto`,
            entryDate:    grn.date,
            description:  `GRN ${grnNumber} — ${grn.supplier_name || 'Supplier'}`,
            reference:    `GRN-${grnNumber}`,
            postedBy:     grn.received_by || 'System',
            lines: [
              { account_code: glConfig.debit_account_code,  debit: totalVal,  credit: 0,        description: `Stock received: ${grnNumber}` },
              { account_code: glConfig.credit_account_code, debit: 0,         credit: totalVal, description: `GRNI: ${grnNumber}` },
            ],
          }).catch(() => null) // non-blocking — don't fail GRN if GL config missing
        }
      }
    } catch (_) { /* GL not configured — skip silently */ }

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
    // outstanding is GENERATED ALWAYS AS (total_amount - paid_amount) STORED — never insert it
    const { outstanding: _drop, ...piData } = pi
    const { error } = await supabase.from('purchase_invoices').insert([{
      id, pi_number: piNumber, ...piData,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'procurement', action: 'CREATE', entityType: 'purchase_invoice', entityId: id, entityName: piNumber })

    // Write normalized purchase_invoice_lines with 3-way match data
    const piItemsList = typeof pi.items === 'string' ? JSON.parse(pi.items || '[]') : (pi.items || [])
    for (const it of piItemsList) {
      // Try to find matching GRN line and PO line for 3-way match
      let grnLineId = null, poLineId = null, grnQty = null, grnRate = null, poQty = null, poRate = null

      if (pi.grn_id) {
        const matchGrn = grnLines.find(gl =>
          gl.grn_id === pi.grn_id && gl.item_name.toLowerCase() === (it.name || '').toLowerCase()
        )
        if (matchGrn) {
          grnLineId = matchGrn.id
          grnQty    = matchGrn.qty_received
          grnRate   = matchGrn.unit_rate
          poLineId  = matchGrn.po_line_id
        }
      }
      if (!poLineId && pi.po_id) {
        const matchPo = poLines.find(pl =>
          pl.po_id === pi.po_id && pl.item_name.toLowerCase() === (it.name || '').toLowerCase()
        )
        if (matchPo) {
          poLineId = matchPo.id
          poQty    = matchPo.qty_ordered
          poRate   = matchPo.unit_rate
        }
      }

      const invQty  = parseFloat(it.qty || it.quantity || 0)
      const invRate = parseFloat(it.unit_price || it.unit_cost || it.rate || 0)

      // Determine 3-way match status
      let matchStatus = 'Pending'
      let matchNotes = ''
      if (grnQty !== null && poRate !== null) {
        if (invQty > (grnQty || 0) * 1.001) { matchStatus = 'Overbilled'; matchNotes = `Invoice qty ${invQty} > GRN accepted ${grnQty}` }
        else if (poRate && Math.abs(invRate - poRate) / poRate > 0.01) { matchStatus = 'Rate Mismatch'; matchNotes = `Invoice rate ${invRate} vs PO rate ${poRate}` }
        else { matchStatus = 'Matched' }
      }

      await supabase.from('purchase_invoice_lines').insert([{
        id: generateId(), invoice_id: id,
        grn_line_id: grnLineId, po_line_id: poLineId,
        item_name: it.name || '', category: it.category || '',
        unit: it.unit || 'pcs',
        qty: invQty, unit_rate: invRate,
        tax_rate: parseFloat(it.tax_rate || 0),
        po_qty: poQty, po_rate: poRate,
        grn_qty: grnQty, grn_rate: grnRate,
        match_status: matchStatus, match_notes: matchNotes,
        notes: it.notes || null,
        created_at: new Date().toISOString(),
      }]).catch(() => null)
    }

    await fetchAll(); return id
  }

  const updatePurchaseInvoice = async (id, updates) => {
    const { outstanding: _drop, ...safeUpdates } = updates
    const { error } = await supabase.from('purchase_invoices').update({ ...safeUpdates, updated_at: new Date().toISOString() }).eq('id', id)
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

  const checkBudget = (department, amount, fiscalYear = new Date().getFullYear()) => {
    const deptBudgets = budgets.filter(b => b.department === department && b.fiscal_year === fiscalYear)
    if (!deptBudgets.length) return { ok: true, warning: false, message: 'No budget configured' }
    const annual = deptBudgets.find(b => b.period === 'annual') || deptBudgets[0]
    const spent  = purchaseOrders
      .filter(p => p.department === department && p.status !== 'Cancelled')
      .reduce((s, p) => s + (p.total_amount || 0), 0)
    const remaining = (annual.budget_amount || 0) - spent
    const pctUsed   = (annual.budget_amount || 0) > 0 ? (spent + amount) / annual.budget_amount * 100 : 0
    if (spent + amount > annual.budget_amount) return { ok: false, warning: true, message: `Over budget by $${(spent + amount - annual.budget_amount).toFixed(2)}`, pctUsed }
    if (pctUsed > (annual.alert_threshold || 80)) return { ok: true, warning: true, message: `Budget at ${pctUsed.toFixed(0)}% — only $${remaining.toFixed(2)} remaining`, pctUsed }
    return { ok: true, warning: false, message: `$${remaining.toFixed(2)} remaining (${(100 - pctUsed).toFixed(0)}%)`, pctUsed }
  }

  // ── Line-level helpers ────────────────────────────────────
  // Get normalized lines for a specific PO
  const getPoLines = (poId) => poLines.filter(l => l.po_id === poId)
  // Get normalized lines for a specific GRN
  const getGrnLines = (grnId) => grnLines.filter(l => l.grn_id === grnId)
  // Get normalized lines for a specific invoice
  const getInvoiceLines = (invoiceId) => invoiceLines.filter(l => l.invoice_id === invoiceId)
  // Get aggregate 3-way match status for an invoice
  const getMatchStatus = (invoiceId) => {
    const lines = invoiceLines.filter(l => l.invoice_id === invoiceId)
    if (!lines.length) return 'Pending'
    if (lines.every(l => l.match_status === 'Matched')) return 'Matched'
    if (lines.some(l => ['Overbilled', 'Rate Mismatch', 'Qty Mismatch'].includes(l.match_status))) return 'Exception'
    return 'Partial'
  }

  return (
    <ProcurementContext.Provider value={{
      suppliers, storeRequisitions, purchaseRequisitions, purchaseOrders, goodsReceived,
      rfqs, rfqQuotations, purchaseInvoices, budgets, loading,
      poLines, grnLines, invoiceLines, rfqLines, quotLines,
      getPoLines, getGrnLines, getInvoiceLines, getMatchStatus,
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
