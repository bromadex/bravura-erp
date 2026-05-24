// src/pages/Inventory/StockTaking.jsx
// Phase 7 upgrade: item search, item_code column, "Set all = system qty" shortcut

import { useState, useMemo } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, EmptyState, AlertBanner } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

export default function StockTaking() {
  const { items, bins, stockTakes, stockTake, loading, fetchAll } = useInventory()
  const getBinQty = itemId => bins.filter(b => b.item_id === itemId).reduce((s, b) => s + (b.actual_qty || 0), 0)
  const { user } = useAuth()
  const canEdit = useCanEdit('inventory', 'stock-taking')

  const [filterCat,  setFilterCat]  = useState('ALL')
  const [search,     setSearch]     = useState('')
  const [tabActive,  setTabActive]  = useState('history') // 'history' | 'new'

  // History filters
  const [histSearch, setHistSearch] = useState('')

  // New stock take — bulk entry table
  const [stDate,  setStDate]  = useState(today)
  const [stBy,    setStBy]    = useState(user?.full_name || user?.username || '')
  const [stNotes, setStNotes] = useState('')
  const [counts,  setCounts]  = useState({})  // { [itemId]: countedQty }
  const [saving,  setSaving]  = useState(false)

  const categories = useMemo(() => ['ALL', ...new Set(items.map(i => i.category).filter(Boolean))], [items])

  const filteredItems = useMemo(() => {
    let list = filterCat === 'ALL' ? items : items.filter(i => i.category === filterCat)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.item_code || '').toLowerCase().includes(q) ||
        (i.subcategory || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [items, filterCat, search])

  const setCount = (itemId, val) => setCounts(prev => ({ ...prev, [itemId]: val }))

  const itemsWithCounts = filteredItems.filter(i => counts[i.id] !== undefined && counts[i.id] !== '')
  const totalVariance   = itemsWithCounts.reduce((s, i) => s + ((parseInt(counts[i.id]) || 0) - getBinQty(i.id)), 0)
  const zeroDiff        = itemsWithCounts.filter(i => (parseInt(counts[i.id]) || 0) === getBinQty(i.id)).length
  const hasDiff         = itemsWithCounts.filter(i => (parseInt(counts[i.id]) || 0) !== getBinQty(i.id)).length

  // Quick-fill: set counted = system qty for all visible items
  const handleFillAll = () => {
    const patch = {}
    filteredItems.forEach(i => { patch[i.id] = String(getBinQty(i.id)) })
    setCounts(prev => ({ ...prev, ...patch }))
  }

  // Clear only filled items with zero variance
  const handleClearNoVariance = () => {
    setCounts(prev => {
      const next = { ...prev }
      filteredItems.forEach(i => {
        if (next[i.id] !== undefined && (parseInt(next[i.id]) || 0) === getBinQty(i.id)) delete next[i.id]
      })
      return next
    })
    toast('Cleared items with no variance')
  }

  const handleSave = async () => {
    if (itemsWithCounts.length === 0) return toast.error('Enter counted quantities for at least one item')
    if (!window.confirm(`Record stock take for ${itemsWithCounts.length} item(s)? Balances will be updated for all items where you've entered a count.`)) return
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

  const handleExport = () => {
    exportXLSX(stockTakes.map(st => ({
      Date: st.date, Item: st.item_name, 'System Qty': st.system_qty,
      Counted: st.counted, Variance: st.variance, 'Done By': st.done_by, Notes: st.notes
    })), `StockTaking_${today}`, 'Stock Takes')
    toast.success('Exported')
  }

  // History filter
  const filteredHistory = useMemo(() => {
    if (!histSearch.trim()) return stockTakes
    const q = histSearch.trim().toLowerCase()
    return stockTakes.filter(st => (st.item_name || '').toLowerCase().includes(q))
  }, [stockTakes, histSearch])

  return (
    <div>
      <PageHeader title="Stock Taking">
        <button className="btn btn-secondary" onClick={handleExport}><span className="material-icons">table_chart</span> Export</button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setTabActive(tabActive === 'new' ? 'history' : 'new')}>
            <span className="material-icons">{tabActive === 'new' ? 'history' : 'fact_check'}</span>
            {tabActive === 'new' ? 'View History' : 'New Stock Take'}
          </button>
        )}
      </PageHeader>

      <AlertBanner type="warning" message="Stock taking overrides the system balance with physically counted quantities. This creates an adjustment transaction." />

      {/* ── NEW STOCK TAKE ──────────────────────────────────── */}
      {tabActive === 'new' && canEdit && (
        <div style={{ marginTop: 16 }}>
          {/* Header fields */}
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

          {/* Search + Category filter + Quick actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-control"
              placeholder="Search item name, code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <div className="btn-group" style={{ flexWrap: 'wrap' }}>
              {categories.map(c => (
                <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setFilterCat(c)}>{c === 'ALL' ? 'All' : c}</button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <div className="btn-group">
              <button className="btn btn-secondary btn-sm" title="Set all visible items counted = system qty"
                onClick={handleFillAll}>
                <span className="material-icons" style={{ fontSize: 14 }}>done_all</span> Fill System Qty
              </button>
              {zeroDiff > 0 && (
                <button className="btn btn-secondary btn-sm" style={{ color: 'var(--text-dim)' }}
                  title="Remove items with zero variance from entry table"
                  onClick={handleClearNoVariance}>
                  <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear No-Variance ({zeroDiff})
                </button>
              )}
            </div>
          </div>

          {/* Summary banner */}
          {itemsWithCounts.length > 0 && (
            <div style={{ padding: '10px 16px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, marginBottom: 14, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span><strong>{itemsWithCounts.length}</strong> items counted</span>
              <span>No variance: <strong style={{ color: 'var(--green)' }}>{zeroDiff}</strong></span>
              <span>Has variance: <strong style={{ color: hasDiff > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>{hasDiff}</strong></span>
              <span>Total variance: <strong style={{ color: totalVariance > 0 ? 'var(--green)' : totalVariance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                {totalVariance > 0 ? '+' : ''}{totalVariance} units
              </strong></span>
            </div>
          )}

          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Item</th><th>Code</th><th>Category</th><th>Unit</th>
                    <th>System Balance</th><th>Physical Count</th><th>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan="7"><EmptyState icon="search_off" message="No items match your search." /></td></tr>
                  ) : filteredItems.map(item => {
                    const counted   = counts[item.id]
                    const hasCount  = counted !== undefined && counted !== ''
                    const systemQty = getBinQty(item.id)
                    const variance  = hasCount ? (parseInt(counted) || 0) - systemQty : null
                    return (
                      <tr key={item.id} style={{ background: hasCount ? (variance !== 0 ? 'rgba(251,191,36,.04)' : 'rgba(52,211,153,.04)') : 'transparent' }}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>{item.item_code || '—'}</td>
                        <td style={{ fontSize: 12 }}>{item.category}{item.subcategory ? <span style={{ color: 'var(--text-dim)' }}> / {item.subcategory}</span> : ''}</td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{item.unit || 'pcs'}</td>
                        <td className="td-mono">{systemQty}</td>
                        <td>
                          <input
                            type="number" min="0"
                            placeholder="Enter count"
                            value={counts[item.id] ?? ''}
                            onChange={e => setCount(item.id, e.target.value)}
                            className="form-control"
                            style={{ maxWidth: 120, padding: '6px 10px', fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 700,
                              background:  hasCount ? (variance === 0 ? 'rgba(52,211,153,.1)' : 'rgba(251,191,36,.1)') : 'var(--surface2)',
                              borderColor: hasCount ? (variance === 0 ? 'rgba(52,211,153,.3)' : 'rgba(251,191,36,.3)') : 'var(--border2)' }}
                          />
                        </td>
                        <td className="td-mono" style={{ color: variance === null ? 'transparent' : variance > 0 ? 'var(--green)' : variance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                          {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }} className="btn-group">
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
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <input className="form-control" placeholder="Search history by item name…"
              value={histSearch} onChange={e => setHistSearch(e.target.value)}
              style={{ maxWidth: 280 }} />
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Date</th><th>Item</th><th>System Qty</th><th>Counted</th><th>Variance</th><th>Done By</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                  : filteredHistory.length === 0 ? (
                    <tr><td colSpan="7"><EmptyState icon="fact_check" message={histSearch ? 'No results match your search.' : 'No stock takes recorded. Click "New Stock Take" to begin.'} /></td></tr>
                  ) : filteredHistory.map(st => (
                    <tr key={st.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{st.date}</td>
                      <td style={{ fontWeight: 600 }}>{st.item_name}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{st.system_qty}</td>
                      <td className="td-mono">{st.counted}</td>
                      <td className="td-mono" style={{ color: st.variance > 0 ? 'var(--green)' : st.variance < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
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
        </div>
      )}
    </div>
  )
}
