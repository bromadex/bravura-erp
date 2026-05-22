import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'

const InventoryContext = createContext(null)

const DEFAULT_WAREHOUSE = 'wh_main_store'

export function InventoryProvider({ children }) {
  const [items,           setItems]           = useState([])
  const [bins,            setBins]            = useState([])
  const [warehouses,      setWarehouses]      = useState([])
  const [stockLedger,     setStockLedger]     = useState([])
  const [stockTakes,      setStockTakes]      = useState([])
  const [categories,      setCategories]      = useState([])
  const [materialRequests, setMaterialRequests] = useState([])
  const [mrItems,         setMrItems]         = useState([])
  const [reorderLevels,   setReorderLevels]   = useState([])
  // Legacy: keep transactions in state so existing Transactions.jsx still works
  const [transactions,    setTransactions]    = useState([])
  const [stockTransfers,  setStockTransfers]  = useState([])
  const [loading,         setLoading]         = useState(true)

  const generateId = () =>
    crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, binsRes, whRes, sleRes, stRes, catRes, mrRes, mrItemRes, rlRes, txRes, stxRes] =
        await Promise.all([
          supabase.from('items').select('*').order('name'),
          supabase.from('bins').select('*, warehouses(code, name, type)').order('item_id'),
          supabase.from('warehouses').select('*').eq('is_active', true).order('name'),
          supabase.from('stock_ledger_entries').select('*').eq('is_cancelled', false)
            .order('posting_datetime', { ascending: false }).limit(500),
          supabase.from('stock_takes').select('*').order('created_at', { ascending: false }),
          supabase.from('categories').select('*').order('name'),
          supabase.from('material_requests').select('*').order('created_at', { ascending: false }),
          supabase.from('material_request_items').select('*'),
          supabase.from('item_reorder_levels').select('*'),
          supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(500),
          supabase.from('stock_transfers').select('*, stock_transfer_lines(*)').order('created_at', { ascending: false }),
        ])
      if (itemsRes.data)   setItems(itemsRes.data)
      if (binsRes.data)    setBins(binsRes.data)
      if (whRes.data)      setWarehouses(whRes.data)
      if (sleRes.data)     setStockLedger(sleRes.data)
      if (stRes.data)      setStockTakes(stRes.data)
      if (catRes.data)     setCategories(catRes.data)
      if (mrRes.data)      setMaterialRequests(mrRes.data)
      if (mrItemRes.data)  setMrItems(mrItemRes.data)
      if (rlRes.data)      setReorderLevels(rlRes.data)
      if (txRes.data)      setTransactions(txRes.data)
      if (stxRes.data)     setStockTransfers(stxRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Bin helpers ───────────────────────────────────────────────
  const getBin = (itemId, warehouseId = DEFAULT_WAREHOUSE) =>
    bins.find(b => b.item_id === itemId && b.warehouse_id === warehouseId)

  const getActualQty = (itemId, warehouseId = DEFAULT_WAREHOUSE) =>
    getBin(itemId, warehouseId)?.actual_qty ?? 0

  const getProjectedQty = (itemId, warehouseId = DEFAULT_WAREHOUSE) =>
    getBin(itemId, warehouseId)?.projected_qty ?? 0

  const getValuationRate = (itemId, warehouseId = DEFAULT_WAREHOUSE) =>
    getBin(itemId, warehouseId)?.valuation_rate ?? 0

  // ── Stock Ledger helpers ──────────────────────────────────────
  const getSLEsForItem = (itemId, warehouseId = null) =>
    stockLedger.filter(s =>
      s.item_id === itemId && (warehouseId ? s.warehouse_id === warehouseId : true)
    )

  // ── Item CRUD ─────────────────────────────────────────────────
  const addItem = async (item) => {
    const id = generateId()
    const openQty = parseFloat(item.openingStock) || 0

    const { data, error } = await supabase.from('items').insert([{
      id,
      name:                 item.name,
      category:             item.category,
      unit:                 item.unit || 'pcs',
      cost:                 item.cost || 0,
      threshold:            item.threshold || 5,
      balance:              openQty,       // legacy column, keep in sync
      total_in:             openQty,
      total_out:            0,
      notes:                item.notes || '',
      valuation_method:     item.valuation_method || 'Moving Average',
      lead_time_days:       item.lead_time_days || 0,
      safety_stock:         item.safety_stock || 0,
      min_order_qty:        item.min_order_qty || 0,
      default_warehouse_id: item.default_warehouse_id || DEFAULT_WAREHOUSE,
    }]).select().single()
    if (error) throw error

    // Create opening SLE if there is opening stock
    if (openQty > 0) {
      await supabase.from('stock_ledger_entries').insert([{
        id:              generateId(),
        item_id:         id,
        warehouse_id:    item.default_warehouse_id || DEFAULT_WAREHOUSE,
        posting_datetime: new Date().toISOString(),
        voucher_type:    'OpeningStock',
        voucher_no:      `OPEN-${id.slice(-6).toUpperCase()}`,
        actual_qty:      openQty,
        incoming_rate:   item.cost || 0,
        created_by:      'system',
      }])
    }

    auditLog({ module: 'inventory', action: 'CREATE', entityType: 'item', entityId: id, entityName: item.name })
    await fetchAll()
    return data
  }

  const updateItem = async (id, updates) => {
    const item = items.find(i => i.id === id)
    const { error } = await supabase.from('items').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'inventory', action: 'UPDATE', entityType: 'item', entityId: id, entityName: item?.name || id, oldValues: item, newValues: { ...item, ...updates } })
    await fetchAll()
  }

  const deleteItem = async (id) => {
    const item = items.find(i => i.id === id)
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'inventory', action: 'DELETE', entityType: 'item', entityId: id, entityName: item?.name || id, oldValues: item })
    await fetchAll()
  }

  // ── Stock In ──────────────────────────────────────────────────
  // Creates an SLE (which triggers bin update via DB trigger).
  // Also keeps legacy items.balance / transactions in sync.
  const stockIn = async (itemId, quantity, date, deliveredBy, receivedBy, notes, warehouseId, unitCost) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const wh   = warehouseId || item.default_warehouse_id || DEFAULT_WAREHOUSE
    const cost = unitCost != null ? parseFloat(unitCost) : (item.cost || 0)

    const sleId = generateId()
    const txId  = generateId()

    const { error: sleErr } = await supabase.from('stock_ledger_entries').insert([{
      id:              sleId,
      item_id:         itemId,
      warehouse_id:    wh,
      posting_datetime: new Date(date || Date.now()).toISOString(),
      voucher_type:    'StockIn',
      voucher_no:      `SI-${Date.now()}`,
      actual_qty:      quantity,
      incoming_rate:   cost,
      created_by:      receivedBy || '',
    }])
    if (sleErr) throw sleErr

    // Legacy: keep items.balance and transactions in sync
    await Promise.all([
      supabase.from('items').update({
        balance:  (item.balance || 0) + quantity,
        total_in: (item.total_in  || 0) + quantity,
        cost:     cost,
      }).eq('id', itemId),
      supabase.from('transactions').insert([{
        id: txId, type: 'IN', item_id: itemId,
        item_name: item.name, category: item.category,
        qty: quantity, date: date || new Date().toISOString().split('T')[0],
        delivered_by: deliveredBy, received_by: receivedBy, notes,
        user_name: receivedBy, created_at: new Date().toISOString(),
      }]),
    ])

    auditLog({ module: 'inventory', action: 'STOCK_IN', entityType: 'sle', entityId: sleId, entityName: item.name, userName: receivedBy || '' })
    await fetchAll()
  }

  // ── Stock Out ─────────────────────────────────────────────────
  const stockOut = async (itemId, quantity, date, issuedTo, authorizedBy, purpose, warehouseId) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const wh  = warehouseId || item.default_warehouse_id || DEFAULT_WAREHOUSE
    const bin = getBin(itemId, wh)
    const availQty = bin?.actual_qty ?? item.balance ?? 0
    if (quantity > availQty) throw new Error(`Insufficient stock. Available: ${availQty}`)

    const sleId = generateId()
    const txId  = generateId()

    const { error: sleErr } = await supabase.from('stock_ledger_entries').insert([{
      id:              sleId,
      item_id:         itemId,
      warehouse_id:    wh,
      posting_datetime: new Date(date || Date.now()).toISOString(),
      voucher_type:    'StockOut',
      voucher_no:      `SO-${Date.now()}`,
      actual_qty:      -quantity,
      created_by:      authorizedBy || '',
    }])
    if (sleErr) throw sleErr

    await Promise.all([
      supabase.from('items').update({
        balance:   (item.balance || 0) - quantity,
        total_out: (item.total_out || 0) + quantity,
      }).eq('id', itemId),
      supabase.from('transactions').insert([{
        id: txId, type: 'OUT', item_id: itemId,
        item_name: item.name, category: item.category,
        qty: quantity, date: date || new Date().toISOString().split('T')[0],
        issued_to: issuedTo, authorized_by: authorizedBy, notes: purpose,
        user_name: authorizedBy, created_at: new Date().toISOString(),
      }]),
    ])

    auditLog({ module: 'inventory', action: 'STOCK_OUT', entityType: 'sle', entityId: sleId, entityName: item.name, userName: authorizedBy || '' })
    await fetchAll()
  }

  // ── Stock Take (reconciliation) ───────────────────────────────
  const stockTake = async (itemId, countedQty, date, countedBy, notes, warehouseId) => {
    const item = items.find(i => i.id === itemId)
    if (!item) throw new Error('Item not found')
    const wh  = warehouseId || item.default_warehouse_id || DEFAULT_WAREHOUSE
    const bin = getBin(itemId, wh)
    const systemQty = bin?.actual_qty ?? item.balance ?? 0
    const variance  = countedQty - systemQty

    const stId  = generateId()
    const sleId = generateId()

    await supabase.from('stock_takes').insert([{
      id: stId, item_id: itemId, item_name: item.name,
      system_qty: systemQty, counted: countedQty, variance,
      date, done_by: countedBy, notes, created_at: new Date().toISOString(),
    }])

    if (variance !== 0) {
      const { error: sleErr } = await supabase.from('stock_ledger_entries').insert([{
        id:              sleId,
        item_id:         itemId,
        warehouse_id:    wh,
        posting_datetime: new Date(date || Date.now()).toISOString(),
        voucher_type:    'StockReconciliation',
        voucher_no:      `RECON-${stId.slice(-6).toUpperCase()}`,
        actual_qty:      variance,
        incoming_rate:   variance > 0 ? (item.cost || 0) : 0,
        created_by:      countedBy || '',
      }])
      if (sleErr) throw sleErr

      await Promise.all([
        supabase.from('items').update({ balance: countedQty }).eq('id', itemId),
        supabase.from('transactions').insert([{
          id: generateId(), type: 'ADJUSTMENT', item_id: itemId,
          item_name: item.name, category: item.category,
          qty: Math.abs(variance), date, done_by: countedBy,
          notes: `Stock reconciliation (${variance > 0 ? '+' : ''}${variance})`,
          user_name: countedBy, created_at: new Date().toISOString(),
        }]),
      ])
    }

    auditLog({ module: 'inventory', action: 'STOCK_TAKE', entityType: 'stock_take', entityId: stId, entityName: item.name, userName: countedBy || '' })
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
    auditLog({ module: 'inventory', action: 'DELETE', entityType: 'transaction', entityId: tx.id, entityName: tx.item_name || '' })
    await fetchAll()
  }

  // ── SLE: record a GRN stock-in (called from ProcurementContext) ──
  const createGRNLedgerEntry = async (itemId, warehouseId, qty, unitCost, voucherNo, detailNo) => {
    const item = items.find(i => i.id === itemId)
    const { error } = await supabase.from('stock_ledger_entries').insert([{
      id:              generateId(),
      item_id:         itemId,
      warehouse_id:    warehouseId || DEFAULT_WAREHOUSE,
      posting_datetime: new Date().toISOString(),
      voucher_type:    'PurchaseReceipt',
      voucher_no:      voucherNo,
      voucher_detail_no: detailNo,
      actual_qty:      qty,
      incoming_rate:   unitCost || 0,
      created_by:      'system',
    }])
    if (error) throw error
    // Update last_purchase_rate on item
    if (unitCost > 0) {
      await supabase.from('items').update({ last_purchase_rate: unitCost, cost: unitCost }).eq('id', itemId)
    }
  }

  // ── Warehouses ────────────────────────────────────────────────
  const addWarehouse = async (wh) => {
    const id = generateId()
    const { error } = await supabase.from('warehouses').insert([{ id, ...wh, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'inventory', action: 'CREATE', entityType: 'warehouse', entityId: id, entityName: wh.name })
    await fetchAll()
  }

  const updateWarehouse = async (id, updates) => {
    const { error } = await supabase.from('warehouses').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteWarehouse = async (id) => {
    const { error } = await supabase.from('warehouses').update({ is_active: false }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Reorder levels ────────────────────────────────────────────
  const setReorderLevel = async (itemId, warehouseId, reorderLevel, reorderQty, mrType) => {
    const { error } = await supabase.from('item_reorder_levels').upsert([{
      id:                    generateId(),
      item_id:               itemId,
      warehouse_id:          warehouseId || DEFAULT_WAREHOUSE,
      reorder_level:         reorderLevel,
      reorder_qty:           reorderQty,
      material_request_type: mrType || 'Purchase',
      created_at:            new Date().toISOString(),
    }], { onConflict: 'item_id,warehouse_id' })
    if (error) throw error
    await fetchAll()
  }

  const deleteReorderLevel = async (id) => {
    const { error } = await supabase.from('item_reorder_levels').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Items below their reorder level (projected_qty <= reorder_level)
  const getItemsBelowReorder = () => {
    const results = []
    reorderLevels.forEach(rl => {
      const bin = getBin(rl.item_id, rl.warehouse_id)
      const projQty = bin?.projected_qty ?? 0
      if (projQty <= rl.reorder_level) {
        const item = items.find(i => i.id === rl.item_id)
        results.push({ ...rl, item, projQty, shortage: rl.reorder_level - projQty })
      }
    })
    return results
  }

  // ── Material Requests ─────────────────────────────────────────
  const generateMRNumber = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('material_requests').select('mr_number').ilike('mr_number', `MR-${year}-%`)
    let max = 0
    ;(data || []).forEach(r => {
      const n = parseInt((r.mr_number || '').split('-').pop(), 10)
      if (!isNaN(n) && n > max) max = n
    })
    return `MR-${year}-${String(max + 1).padStart(4, '0')}`
  }

  const createMaterialRequest = async (mrData, itemsList) => {
    const id       = generateId()
    const mrNumber = await generateMRNumber()
    const { error: mrErr } = await supabase.from('material_requests').insert([{
      id,
      mr_number:        mrNumber,
      type:             mrData.type || 'Purchase',
      status:           'Draft',
      transaction_date: mrData.transaction_date || new Date().toISOString().split('T')[0],
      required_by_date: mrData.required_by_date || null,
      department:       mrData.department || null,
      requested_by:     mrData.requested_by || null,
      set_warehouse_id: mrData.set_warehouse_id || DEFAULT_WAREHOUSE,
      notes:            mrData.notes || null,
      created_by:       mrData.created_by || null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }])
    if (mrErr) throw mrErr

    if (itemsList?.length) {
      const itemRows = itemsList.map(it => ({
        id:               generateId(),
        mr_id:            id,
        item_id:          it.item_id,
        item_name:        it.item_name,
        qty:              it.qty,
        ordered_qty:      0,
        received_qty:     0,
        warehouse_id:     it.warehouse_id || mrData.set_warehouse_id || DEFAULT_WAREHOUSE,
        unit:             it.unit || '',
        rate:             it.rate || 0,
        schedule_date:    it.schedule_date || null,
        notes:            it.notes || null,
        created_at:       new Date().toISOString(),
      }))
      const { error: itemErr } = await supabase.from('material_request_items').insert(itemRows)
      if (itemErr) throw itemErr

      // Increment indented_qty on bins for each line
      for (const it of itemsList) {
        await supabase.rpc('fn_mr_update_bin_indented', {
          p_item_id:      it.item_id,
          p_warehouse_id: it.warehouse_id || mrData.set_warehouse_id || DEFAULT_WAREHOUSE,
          p_qty_delta:    it.qty,
        }).then(() => {})
      }
    }

    auditLog({ module: 'inventory', action: 'CREATE', entityType: 'material_request', entityId: id, entityName: mrNumber })
    await fetchAll()
    return { id, mr_number: mrNumber }
  }

  const updateMaterialRequestStatus = async (id, status) => {
    const { error } = await supabase.from('material_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteMaterialRequest = async (id) => {
    const mr = materialRequests.find(m => m.id === id)
    if (mr?.status !== 'Draft') throw new Error('Only Draft material requests can be deleted')
    // Restore indented_qty in bins
    const lines = mrItems.filter(i => i.mr_id === id)
    for (const it of lines) {
      await supabase.rpc('fn_mr_update_bin_indented', {
        p_item_id:      it.item_id,
        p_warehouse_id: it.warehouse_id || DEFAULT_WAREHOUSE,
        p_qty_delta:    -it.qty,
      }).then(() => {})
    }
    await supabase.from('material_requests').delete().eq('id', id)
    await fetchAll()
  }

  // ── Stock Transfers ────────────────────────────────────────────────────

  const createStockTransfer = async (transfer, lines) => {
    const id = generateId()
    const transferNo = `ST-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
    const { error } = await supabase.from('stock_transfers').insert([{
      id, transfer_no: transferNo, ...transfer,
      status: 'Draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    for (const line of lines) {
      await supabase.from('stock_transfer_lines').insert([{
        id: generateId(), transfer_id: id,
        item_id: line.itemId, item_name: line.itemName,
        unit: line.unit || 'pcs', qty: parseFloat(line.qty),
        qty_transferred: 0,
        from_warehouse_id: transfer.from_warehouse_id,
        to_warehouse_id: transfer.to_warehouse_id,
        valuation_rate: line.valuationRate || 0,
        notes: line.notes || '',
        created_at: new Date().toISOString(),
      }])
    }
    await fetchAll()
    return { id, transfer_no: transferNo }
  }

  const submitStockTransfer = async (id) => {
    const { error } = await supabase.from('stock_transfers').update({
      status: 'Pending Approval', updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const approveStockTransfer = async (id, approverName, approverId) => {
    const { error } = await supabase.from('stock_transfers').update({
      status: 'Approved', approved_by: approverName, approved_by_id: approverId,
      approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const completeStockTransfer = async (id) => {
    const transfer = stockTransfers.find(t => t.id === id)
    if (!transfer) throw new Error('Transfer not found')
    if (!['Approved', 'In Transit'].includes(transfer.status)) throw new Error('Transfer must be Approved before completing')
    const lines = transfer.stock_transfer_lines || []
    const now = new Date().toISOString()
    const today = now.split('T')[0]
    for (const line of lines) {
      const qty = parseFloat(line.qty) || 0
      if (qty <= 0) continue
      await supabase.from('stock_ledger_entries').insert([{
        id: generateId(), item_id: line.item_id,
        warehouse_id: transfer.from_warehouse_id,
        voucher_type: 'Stock Transfer', voucher_no: transfer.transfer_no,
        actual_qty: -qty, outgoing_rate: line.valuation_rate || 0, incoming_rate: 0,
        posting_date: today, created_at: now, updated_at: now,
      }]).catch(() => null)
      await supabase.from('stock_ledger_entries').insert([{
        id: generateId(), item_id: line.item_id,
        warehouse_id: transfer.to_warehouse_id,
        voucher_type: 'Stock Transfer', voucher_no: transfer.transfer_no,
        actual_qty: qty, incoming_rate: line.valuation_rate || 0, outgoing_rate: 0,
        posting_date: today, created_at: now, updated_at: now,
      }]).catch(() => null)
      await supabase.from('stock_transfer_lines').update({ qty_transferred: qty }).eq('id', line.id)
      if (line.item_id) {
        const { data: item } = await supabase.from('items').select('balance').eq('id', line.item_id).maybeSingle()
        if (item) await supabase.from('items').update({ balance: (item.balance || 0) - qty }).eq('id', line.item_id)
      }
    }
    await supabase.from('stock_transfers').update({
      status: 'Completed', completed_at: now, updated_at: now,
    }).eq('id', id)
    await fetchAll()
  }

  const cancelStockTransfer = async (id, reason) => {
    const { error } = await supabase.from('stock_transfers').update({
      status: 'Cancelled', cancellation_reason: reason, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Auto-create MRs for all items below reorder level
  const autoCreateReorderMRs = async (createdBy) => {
    const belowReorder = getItemsBelowReorder()
    if (!belowReorder.length) return 0
    let count = 0
    for (const rl of belowReorder) {
      const reorderQty = Math.max(rl.reorder_qty, rl.reorder_level - rl.projQty + (rl.item?.safety_stock || 0))
      await createMaterialRequest(
        { type: rl.material_request_type || 'Purchase', set_warehouse_id: rl.warehouse_id, created_by: createdBy },
        [{ item_id: rl.item_id, item_name: rl.item?.name || '', qty: reorderQty, warehouse_id: rl.warehouse_id }]
      )
      count++
    }
    return count
  }

  return (
    <InventoryContext.Provider value={{
      // State
      items, bins, warehouses, stockLedger, stockTakes, categories,
      materialRequests, mrItems, reorderLevels,
      transactions,  // legacy
      stockTransfers,
      loading,
      // Bin helpers
      getBin, getActualQty, getProjectedQty, getValuationRate,
      getSLEsForItem,
      DEFAULT_WAREHOUSE,
      // Item CRUD
      addItem, updateItem, deleteItem,
      // Stock operations
      stockIn, stockOut, stockTake, deleteTransaction,
      createGRNLedgerEntry,
      // Warehouses
      addWarehouse, updateWarehouse, deleteWarehouse,
      // Reorder levels
      setReorderLevel, deleteReorderLevel, getItemsBelowReorder,
      // Material requests
      createMaterialRequest, updateMaterialRequestStatus, deleteMaterialRequest,
      autoCreateReorderMRs,
      // Stock transfers
      createStockTransfer, submitStockTransfer, approveStockTransfer,
      completeStockTransfer, cancelStockTransfer,
      fetchAll,
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
