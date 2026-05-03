// src/pages/Campsite/CampConsumption.jsx — Consumption analytics (last 30 days)
import { useState, useMemo } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'

const CATS = ['Food', 'PPE', 'Consumables', 'General']

export default function CampConsumption() {
  const { items, transactions, headcounts, loading } = useLogistics()

  const [filterCat,  setFilterCat]  = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const last30Str = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()

  const getStats = (itemId) => {
    const outTx    = transactions.filter(t => t.item_id === itemId && t.type === 'OUT' && t.date >= last30Str)
    const totalOut = outTx.reduce((s, t) => s + (t.qty || 0), 0)
    const hcDays   = headcounts.filter(h => h.date >= last30Str)
    const avgHC    = hcDays.length > 0 ? hcDays.reduce((s, h) => s + h.count, 0) / hcDays.length : 0
    const days     = hcDays.length || 30
    return { totalOut, perPersonPerDay: avgHC > 0 ? totalOut / (avgHC * days) : 0, avgHC, days }
  }

  const filteredItems = useMemo(() => items.filter(i => {
    if (i.category === 'Batch Plant') return false
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (searchTerm && !i.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  }), [items, filterCat, searchTerm])

  // Summary KPIs
  const totalItems    = filteredItems.length
  const itemsWithData = filteredItems.filter(i => getStats(i.id).totalOut > 0).length
  const avgHC         = (() => {
    const hcDays = headcounts.filter(h => h.date >= last30Str)
    return hcDays.length > 0 ? Math.round(hcDays.reduce((s, h) => s + h.count, 0) / hcDays.length) : 0
  })()

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Consumption Analytics</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Per-person daily consumption — last 30 days. High values may indicate wastage or theft.</div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Items Tracked', value: totalItems,    icon: 'inventory_2', color: 'var(--blue)'  },
          { label: 'With Activity', value: itemsWithData, icon: 'trending_up', color: 'var(--green)' },
          { label: 'Avg Headcount', value: avgHC || '—',  icon: 'people',      color: 'var(--teal)'  },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="material-icons" style={{ fontSize: 18, color: k.color }}>{k.icon}</span>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{k.label.toUpperCase()}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-control" placeholder="Search items…" style={{ maxWidth: 200 }}
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {['ALL', ...CATS].map(c => (
          <button key={c} className={filterCat === c ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setFilterCat(c)}>{c === 'ALL' ? 'All' : c}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Balance</th>
                <th>Used (30d)</th>
                <th>Per Person / Day</th>
                <th>Avg HC</th>
                <th>Days Remaining</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No items found</td></tr>
              ) : filteredItems.map(i => {
                const s         = getStats(i.id)
                const dailyBurn = s.perPersonPerDay * s.avgHC
                const daysLeft  = dailyBurn > 0 ? Math.floor(i.balance / dailyBurn) : null
                const daysColor = daysLeft === null ? 'var(--text-dim)'
                  : daysLeft < 7  ? 'var(--red)'
                  : daysLeft < 14 ? 'var(--yellow)'
                  : 'var(--green)'
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i.category}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i.balance} {i.unit}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{s.totalOut > 0 ? s.totalOut : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                      {s.perPersonPerDay > 0 ? s.perPersonPerDay.toFixed(3) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {s.avgHC > 0 ? Math.round(s.avgHC) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: daysColor }}>
                      {daysLeft !== null ? `~${daysLeft}d` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
