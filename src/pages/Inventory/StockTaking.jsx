// src/pages/Inventory/StockTaking.jsx
// Complete rewrite: one-page stock take, bulk entry, variance analysis

import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function StockTaking() {
  const { items, stockTakes, stockTake, loading, fetchAll } = useInventory()
  const { user } = useAuth()
  const canEdit = useCanEdit('inventory', 'stock-taking')

  const [showModal,   setShowModal]   = useState(false)
  const [filterCat,   setFilterCat]   = useState('ALL')
  const [tabActive,   setTabActive]   = useState('history') // 'history' | 'new'

  // New stock take — bulk entry table
  const [stDate,      setStDate]      = useState(today)
  const [stBy,        setStBy]        = useState(user?.full_name || user?.username || '')
  const [stNotes,     setStNotes]     = useState('')
  const [counts,      setCounts]      = useState({})  // { [itemId]: countedQty }
  const [saving,      setSaving]      = useState(false)

  const categories   = ['ALL', ...new Set(items.map(i => i.category).filter(Boolean))]
  const filteredItems = filterCat === 'ALL' ? items : items.filter(i => i.category === filterCat)

  const setCount = (itemId, val) => setCounts(prev => ({ ...prev, [itemId]: val }))

  const itemsWithCounts = filteredItems.filter(i => counts[i.id] !== undefined && counts[i.id] !== '')
  const totalVariance   = itemsWithCounts.reduce((s, i) => s + ((parseInt(counts[i.id]) || 0) - (i.balance || 0)), 0)

  const handleSave = async () => {
    if (itemsWithCounts.length === 0) return toast.error('Enter counted quantities for at least one item')
    if (!window.confirm(`Record stock take for ${itemsWithCounts.length} item(s)? This will update balances for all items where you've entered a count.`)) return
    setSaving(true)
    let done = 0
    try {
      for (const item of itemsWithCounts) {
        const counted = parseInt(counts[item.id])
        if (isNaN(counted)) continue
        await stockTake(item.id, counted, stDate, stBy, stNotes)
        done++
      }
      toast.success(`Stock take complete — ${done} item(s) updated`)
      setCounts({})
      setTabActive('history')
      await fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(stockTakes.map(st => ({
      Date: st.date, Item: st.item_name, 'System Qty': st.system_qty,
      Counted: st.counted, Variance: st.variance, 'Done By': st.done_by, Notes: st.notes
    })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Stock Takes')
    XLSX.writeFile(wb, `StockTaking_${today}.xlsx`); toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock Taking</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setTabActive(tabActive === 'new' ? 'history' : 'new')}>
              <span className="material-icons">{tabActive === 'new' ? 'history' : 'fact_check'}</span>
              {tabActive === 'new' ? 'View History' : 'New Stock Take'}
            </button>
          )}
        </div>
      </div>

      {/* Warning */}
      <div style={{ padding: '10px 16px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, marginBottom: 20, fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-icons" style={{ fontSize: 16 }}>warning</span>
        Stock taking overrides the system balance with physically counted quantities. This creates an adjustment transaction.
      </div>

      {/* ── NEW STOCK TAKE ──────────────────────────────────── */}
      {tabActive === 'new' && canEdit && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Date of Count</label>
                <input type="date" className="form-control" value={stDate} onChange={e => setStDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Counted By</label>
                <input className="form-control" value={stBy} onChange={e => setStBy(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input className="form-control" placeholder="Optional notes" value={stNotes} onChange={e => setStNotes(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => setFilterCat(c)}>{c === 'ALL' ? 'All Categories' : c}</button>
            ))}
          </div>

          {itemsWithCounts.length > 0 && (
            <div style={{ padding: '10px 16px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
              <strong>{itemsWithCounts.length}</strong> items counted ·
              Total variance: <strong style={{ color: totalVariance > 0 ? 'var(--green)' : totalVariance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                {totalVariance > 0 ? '+' : ''}{totalVariance} units
              </strong>
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Item</th><th>Category</th><th>Unit</th>
                    <th>System Balance</th><th>Physical Count</th><th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const counted  = counts[item.id]
                    const hasCount = counted !== undefined && counted !== ''
                    const variance = hasCount ? (parseInt(counted) || 0) - (item.balance || 0) : null
                    return (
                      <tr key={item.id} style={{ background: hasCount ? (variance !== 0 ? 'rgba(251,191,36,.04)' : 'rgba(52,211,153,.04)') : 'transparent' }}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ fontSize: 12 }}>{item.category}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{item.unit || 'pcs'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{item.balance}</td>
                        <td>
                          <input
                            type="number" min="0"
                            placeholder="Enter count"
                            value={counts[item.id] ?? ''}
                            onChange={e => setCount(item.id, e.target.value)}
                            className="form-control"
                            style={{ maxWidth: 120, padding: '6px 10px', fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 700, background: hasCount ? (variance === 0 ? 'rgba(52,211,153,.1)' : 'rgba(251,191,36,.1)') : 'var(--surface2)', borderColor: hasCount ? (variance === 0 ? 'rgba(52,211,153,.3)' : 'rgba(251,191,36,.3)') : 'var(--border2)' }}
                          />
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: variance === null ? 'transparent' : variance > 0 ? 'var(--green)' : variance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setCounts({}); setTabActive('history') }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || itemsWithCounts.length === 0}>
              <span className="material-icons">fact_check</span>
              {saving ? 'Saving…' : `Save Stock Take (${itemsWithCounts.length} items)`}
            </button>
          </div>
        </div>
      )}

      {/* ── HISTORY ─────────────────────────────────────────── */}
      {tabActive === 'history' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr><th>Date</th><th>Item</th><th>System Qty</th><th>Counted</th><th>Variance</th><th>Done By</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                : stockTakes.length === 0 ? (
                  <tr><td colSpan="7"><div className="empty-state"><span className="material-icons" style={{ fontSize: 36, opacity: 0.3 }}>fact_check</span><span>No stock takes recorded. Click "New Stock Take" to begin.</span></div></td></tr>
                ) : stockTakes.map(st => (
                  <tr key={st.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{st.date}</td>
                    <td style={{ fontWeight: 600 }}>{st.item_name}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{st.system_qty}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{st.counted}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: st.variance > 0 ? 'var(--green)' : st.variance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                      {st.variance > 0 ? '+' : ''}{st.variance}
                    </td>
                    <td style={{ fontSize: 12 }}>{st.done_by || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{st.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
