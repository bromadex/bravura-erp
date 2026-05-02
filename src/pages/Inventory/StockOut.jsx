// src/pages/Inventory/StockOut.jsx
//
// READ-ONLY — stock exits only through approved Store Requisitions fulfilled
// by the storekeeper. The stockOut() function in InventoryContext still exists
// and is called internally by ProcurementContext.fulfillStoreRequisition().
// This page shows the history of stock-out transactions.

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import * as XLSX from 'xlsx'

export default function StockOut() {
  const { transactions, loading } = useInventory()

  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const stockOutTx = transactions.filter(t => t.type === 'OUT')

  const filtered = stockOutTx.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false
    if (dateTo   && tx.date > dateTo)   return false
    if (searchTerm && !tx.item_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  const totalQty   = filtered.reduce((s, t) => s + (t.quantity || 0), 0)
  const totalValue = filtered.reduce((s, t) => s + ((t.quantity || 0) * (t.unit_cost || 0)), 0)

  const exportExcel = () => {
    const rows = filtered.map(t => ({
      Date:       t.date,
      Item:       t.item_name,
      Quantity:   t.quantity,
      Unit:       t.unit,
      'Unit Cost': t.unit_cost,
      'Total':    (t.quantity || 0) * (t.unit_cost || 0),
      Reference:  t.reference || '',
      Notes:      t.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Out')
    XLSX.writeFile(wb, `stock-out-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Banner explaining the policy */}
      <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20, flexShrink: 0, marginTop: 1 }}>info</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Stock exits only through Store Requisitions</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Direct stock-out is disabled. To issue stock, submit a Store Requisition in the Procurement module.
            Stock is deducted automatically when the storekeeper fulfils an approved requisition.
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Issues',  value: filtered.length,             icon: 'remove_circle', color: 'var(--red)'  },
          { label: 'Total Qty Out', value: totalQty.toLocaleString(),   icon: 'inventory_2',   color: 'var(--yellow)' },
          { label: 'Total Value',   value: `$${totalValue.toFixed(2)}`, icon: 'attach_money',  color: 'var(--gold)' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ fontSize: 22, color: k.color }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{k.label}</div>
              </div>
            </div>
          </div>
        ))}
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
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No stock-out transactions found</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id}>
                <td style={{ fontSize: 12 }}>{t.date}</td>
                <td style={{ fontWeight: 600 }}>{t.item_name}</td>
                <td style={{ color: 'var(--red)', fontWeight: 700 }}>−{t.quantity}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.unit}</td>
                <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{t.reference || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
