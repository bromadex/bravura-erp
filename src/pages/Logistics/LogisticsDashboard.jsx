// src/pages/Logistics/LogisticsDashboard.jsx
// Site operations intelligence overview

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogistics } from '../../contexts/LogisticsContext'

const today = new Date().toISOString().split('T')[0]

export default function LogisticsDashboard() {
  const navigate = useNavigate()
  const { items, transactions, deliveries, batchRecords, headcounts, ppeIssuances, getBatchEfficiency, loading } = useLogistics()

  const todayHeadcount = headcounts.find(h => h.date === today)?.count || 0
  const yesterdayHC    = headcounts.find(h => h.date === new Date(Date.now() - 86400000).toISOString().split('T')[0])?.count || 0

  // Low stock items
  const lowStock = items.filter(i => i.balance <= (i.reorder_level || 0) && i.reorder_level > 0)
  const outOfStock = items.filter(i => i.balance <= 0)

  // Today's consumption
  const todayOut = transactions.filter(t => t.type === 'OUT' && t.date === today).reduce((s, t) => s + (t.total_cost || 0), 0)
  const todayIn  = transactions.filter(t => t.type === 'IN'  && t.date === today).reduce((s, t) => s + (t.qty || 0), 0)

  // This month's concrete output
  const monthStart   = today.slice(0, 7) + '-01'
  const concreteThisMonth = batchRecords.filter(r => r.date >= monthStart).reduce((s, r) => s + (r.volume_m3 || 0), 0)

  // Batch efficiency
  const efficiency = getBatchEfficiency(30)

  // Category breakdown
  const categoryMap = {}
  items.forEach(i => { const k = i.category; if (!categoryMap[k]) categoryMap[k] = { count: 0, lowStock: 0 }; categoryMap[k].count++; if (i.balance <= (i.reorder_level || 0) && i.reorder_level > 0) categoryMap[k].lowStock++ })

  // Recent deliveries
  const recentDeliveries = deliveries.slice(0, 5)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Logistics Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/module/logistics/camp')}>
            <span className="material-icons">cabin</span> Camp
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/module/logistics/batch-plant')}>
            <span className="material-icons">factory</span> Batch Plant
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/module/logistics/deliveries')}>
            <span className="material-icons">local_shipping</span> Deliveries
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(outOfStock.length > 0 || lowStock.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {outOfStock.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--red)' }}>error</span>
              <strong>{outOfStock.length} item{outOfStock.length !== 1 ? 's' : ''} out of stock:</strong>
              {' '}{outOfStock.slice(0, 4).map(i => i.name).join(', ')}{outOfStock.length > 4 ? ` +${outOfStock.length - 4} more` : ''}
            </div>
          )}
          {lowStock.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--yellow)' }}>warning</span>
              <strong>{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} below reorder level:</strong>
              {' '}{lowStock.slice(0, 4).map(i => i.name).join(', ')}{lowStock.length > 4 ? ` +${lowStock.length - 4} more` : ''}
            </div>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card" onClick={() => navigate('/module/logistics/camp')} style={{ cursor: 'pointer' }}>
          <div className="kpi-label">Camp Headcount Today</div>
          <div className="kpi-val" style={{ color: 'var(--teal)' }}>{todayHeadcount}</div>
          <div className="kpi-sub">{yesterdayHC > 0 ? `Yesterday: ${yesterdayHC}` : 'Yesterday not recorded'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Stock Items</div>
          <div className="kpi-val">{items.length}</div>
          <div className="kpi-sub">{lowStock.length > 0 ? `${lowStock.length} low stock` : 'All levels OK'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Today's Issuances</div>
          <div className="kpi-val" style={{ color: 'var(--yellow)' }}>${todayOut.toFixed(0)}</div>
          <div className="kpi-sub">value issued today</div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/module/logistics/batch-plant')} style={{ cursor: 'pointer' }}>
          <div className="kpi-label">Concrete This Month</div>
          <div className="kpi-val" style={{ color: 'var(--blue)' }}>{concreteThisMonth.toFixed(1)}</div>
          <div className="kpi-sub">m³ produced</div>
        </div>
        {efficiency && (
          <div className="kpi-card">
            <div className="kpi-label">Cement Efficiency (30d)</div>
            <div className="kpi-val" style={{ color: efficiency.avgCement > 400 ? 'var(--red)' : 'var(--green)' }}>{efficiency.avgCement.toFixed(0)}</div>
            <div className="kpi-sub">kg cement per m³</div>
          </div>
        )}
      </div>

      {/* Mid grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Stock by category */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--teal)' }}>inventory_2</span>
            Stock by Category
          </div>
          {Object.entries(categoryMap).length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No items yet</div>
          ) : Object.entries(categoryMap).map(([cat, data]) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12 }}>{cat}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{data.count} items</span>
                {data.lowStock > 0 && <span className="badge badge-yellow">{data.lowStock} low</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Recent deliveries */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16, color: 'var(--yellow)' }}>local_shipping</span>
              Recent Deliveries
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/logistics/deliveries')}>View all</button>
          </div>
          {recentDeliveries.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No deliveries yet</div>
          ) : recentDeliveries.map(d => {
            const variance = d.total_received - d.total_loaded
            return (
              <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{d.supplier || 'Unknown supplier'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.date} · {d.delivery_note || '—'}</div>
                {Math.abs(variance) > 0 && (
                  <div style={{ fontSize: 10, color: variance < 0 ? 'var(--red)' : 'var(--green)', marginTop: 2 }}>
                    Variance: {variance > 0 ? '+' : ''}{variance.toFixed(0)} units
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Batch plant summary */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16, color: 'var(--blue)' }}>factory</span>
              Batch Plant (30 days)
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/logistics/batch-plant')}>View all</button>
          </div>
          {!efficiency ? (
            <div className="empty-state" style={{ padding: 20 }}>No batch records yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="kpi-card" style={{ padding: 12 }}>
                <div className="kpi-label">Total Volume</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--blue)' }}>{efficiency.totalVolume.toFixed(1)} m³</div>
                <div className="kpi-sub">{efficiency.batches} batches</div>
              </div>
              <div className="kpi-card" style={{ padding: 12 }}>
                <div className="kpi-label">Cement Used</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{efficiency.totalCement.toFixed(0)} kg</div>
                <div className="kpi-sub">{efficiency.avgCement.toFixed(0)} kg/m³ avg</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
