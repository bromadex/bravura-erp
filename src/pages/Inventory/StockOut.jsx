// src/pages/Inventory/StockOut.jsx
//
// READ-ONLY — stock exits only through approved Store Requisitions fulfilled
// by the storekeeper. The stockOut() function in InventoryContext still exists
// and is called internally by ProcurementContext.fulfillStoreRequisition().
// This page shows the history of stock-out transactions via stock_ledger_entries.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { exportXLSX } from '../../engine/reportingEngine'
import { KPICard, EmptyState, AlertBanner } from '../../components/ui'

export default function StockOut() {
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        // 1. Fetch issue SLEs (actual_qty < 0)
        const { data: sles, error: sleErr } = await supabase
          .from('stock_ledger_entries')
          .select('*, items(name,unit,category,item_code), warehouses(name)')
          .lt('actual_qty', 0)
          .order('posting_datetime', { ascending: false })
          .limit(1000)

        if (sleErr) throw sleErr
        if (!sles || cancelled) return

        // 2. Collect StoreRequisition voucher_nos for SR lookup
        const srNos = [...new Set(
          sles
            .filter(s => s.voucher_type === 'StoreRequisition')
            .map(s => s.voucher_no)
            .filter(Boolean)
        )]

        let srMap = {}
        if (srNos.length) {
          const { data: srs } = await supabase
            .from('store_requisitions')
            .select('sr_number, req_number, department, cost_center, project')
            .or(srNos.map(n => `sr_number.eq.${n},req_number.eq.${n}`).join(','))
          if (srs) {
            srs.forEach(sr => {
              if (sr.sr_number)  srMap[sr.sr_number]  = sr
              if (sr.req_number) srMap[sr.req_number] = sr
            })
          }
        }

        if (cancelled) return

        // 3. Map SLEs to display rows
        const mapped = sles.map(s => {
          const sr = srMap[s.voucher_no] || {}
          return {
            id:          s.id,
            date:        (s.posting_datetime || '').slice(0, 10),
            item_name:   s.items?.name    || s.item_id,
            category:    s.items?.category || '',
            unit:        s.items?.unit    || 'pcs',
            item_code:   s.items?.item_code || '',
            warehouse:   s.warehouses?.name || s.warehouse_id,
            quantity:    Math.abs(s.actual_qty),
            unit_cost:   s.outgoing_rate || 0,
            reference:   s.voucher_no    || '',
            type:        s.voucher_type  || 'Issue',
            department:  sr.department   || '',
            cost_center: sr.cost_center  || '',
            project:     sr.project      || '',
            issued_by:   s.created_by    || '',
          }
        })

        setRows(mapped)
      } catch (err) {
        console.error('StockOut fetch error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [refreshKey])

  const filtered = rows.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false
    if (dateTo   && tx.date > dateTo)   return false
    if (searchTerm && !tx.item_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const totalQty   = filtered.reduce((s, t) => s + (t.quantity  || 0), 0)
  const totalValue = filtered.reduce((s, t) => s + ((t.quantity || 0) * (t.unit_cost || 0)), 0)

  const exportExcel = () => {
    exportXLSX(filtered.map(t => ({
      Date:          t.date,
      Item:          t.item_name,
      Quantity:      t.quantity,
      Unit:          t.unit,
      'Unit Cost':   t.unit_cost,
      Total:         (t.quantity || 0) * (t.unit_cost || 0),
      Reference:     t.reference   || '',
      'Issued By':   t.issued_by   || '',
      Department:    t.department  || '',
      'Cost Center': t.cost_center || '',
      Project:       t.project     || '',
      Warehouse:     t.warehouse   || '',
    })), `stock-out-${new Date().toISOString().split('T')[0]}`, 'Stock Out')
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Banner explaining the policy */}
      <AlertBanner
        type="warning"
        message={
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Stock exits only through Store Requisitions</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              Direct stock-out is disabled. To issue stock, submit a Store Requisition in the Procurement module.
              Stock is deducted automatically when the storekeeper fulfils an approved requisition.
            </div>
          </div>
        }
      />

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24, marginTop: 20 }}>
        <KPICard label="Total Issues"  value={filtered.length}             icon="remove_circle" color="red"    />
        <KPICard label="Total Qty Out" value={totalQty.toLocaleString()}   icon="inventory_2"   color="yellow" />
        <KPICard label="Total Value"   value={`$${totalValue.toFixed(2)}`} icon="attach_money"  color="gold"   />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search item…"
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => setRefreshKey(k => k + 1)}>
          <span className="material-icons" style={{ fontSize: 15 }}>refresh</span> Refresh
        </button>
        <button className="btn btn-secondary btn-sm" onClick={exportExcel}>
          <span className="material-icons" style={{ fontSize: 15 }}>download</span> Export
        </button>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Warehouse</th>
              <th>Department</th>
              <th>Cost Center</th>
              <th>Project</th>
              <th>Reference</th>
              <th>Issued By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10}><EmptyState icon="assignment_return" message="No stock-out transactions found" /></td></tr>
            ) : filtered.map(t => (
              <tr key={t.id}>
                <td style={{ fontSize: 12 }}>{t.date}</td>
                <td style={{ fontWeight: 600 }}>{t.item_name}</td>
                <td style={{ color: 'var(--red)', fontWeight: 700 }}>−{t.quantity}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.unit}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.warehouse || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.department || '—'}</td>
                <td className="td-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.cost_center || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.project || '—'}</td>
                <td className="td-mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>{t.reference || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.issued_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
