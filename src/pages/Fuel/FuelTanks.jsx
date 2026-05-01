// src/pages/Fuel/FuelTanks.jsx
// Modern redesign: live tank gauge, low-level alerts, 7-day chart, by-vehicle/by-driver bars

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function FuelTanks() {
  const {
    issuances, deliveries, dipstickLog,
    getCurrentTankLevel, getTankPercentage, TANK_MAX_LITRES,
    loading
  } = useFuel()

  const canEdit = useCanEdit('fuel', 'tanks')
  const [activeTab, setActiveTab] = useState('overview')

  const currentLevel = getCurrentTankLevel()
  const percentage   = getTankPercentage()
  const totalIssued     = issuances.reduce((s, i) => s + (i.amount || 0), 0)
  const totalDelivered  = deliveries.reduce((s, d) => s + (d.qty    || 0), 0)
  const issuedToday     = issuances.filter(i => i.date === today).reduce((s, i) => s + (i.amount || 0), 0)
  const issuedThisMonth = issuances.filter(i => i.date?.startsWith(today.slice(0, 7))).reduce((s, i) => s + (i.amount || 0), 0)

  // Level colour
  const levelColor = percentage < 10 ? 'var(--red)' : percentage < 20 ? 'var(--yellow)' : percentage < 40 ? 'var(--yellow)' : 'var(--teal)'

  // 7-day trend
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    return {
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      dateStr: ds,
      issued: issuances.filter(iss => iss.date === ds).reduce((s, r) => s + (r.amount || 0), 0)
    }
  })
  const maxDay = Math.max(...last7.map(d => d.issued), 1)

  // By vehicle (top 8)
  const vehicleMap = {}
  issuances.forEach(i => { const k = i.vehicle || 'Unknown'; vehicleMap[k] = (vehicleMap[k] || 0) + (i.amount || 0) })
  const byVehicle = Object.entries(vehicleMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxVehicle = Math.max(...byVehicle.map(v => v[1]), 1)

  // By driver (top 8)
  const driverMap = {}
  issuances.forEach(i => { const k = i.driver || 'Unknown'; driverMap[k] = (driverMap[k] || 0) + (i.amount || 0) })
  const byDriver = Object.entries(driverMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxDriver = Math.max(...byDriver.map(d => d[1]), 1)

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issuances.map(i => ({ Date: i.date, Vehicle: i.vehicle, Driver: i.driver, Litres: i.amount, Purpose: i.purpose }))), 'Issuances')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byVehicle.map(([v, l]) => ({ Vehicle: v, TotalLitres: l }))), 'By Vehicle')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byDriver.map(([d, l]) => ({ Driver: d, TotalLitres: l }))), 'By Driver')
    XLSX.writeFile(wb, `FuelTanks_${today}.xlsx`)
    toast.success('Exported')
  }

  const TABS = [
    { id: 'overview',  label: 'Overview',       icon: 'water'     },
    { id: 'analytics', label: 'Analytics',       icon: 'bar_chart' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Tanks</h1>
        <button className="btn btn-secondary" onClick={exportXLSX}>
          <span className="material-icons">table_chart</span> Export
        </button>
      </div>

      {/* ── Critical / Low alert banner ─────────────────────── */}
      {percentage < 20 && (
        <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 20, background: percentage < 10 ? 'rgba(248,113,113,.1)' : 'rgba(251,191,36,.08)', border: `1px solid ${percentage < 10 ? 'rgba(248,113,113,.4)' : 'rgba(251,191,36,.4)'}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="material-icons" style={{ fontSize: 32, color: levelColor, flexShrink: 0 }}>
            {percentage < 10 ? 'error' : 'warning'}
          </span>
          <div>
            <div style={{ fontWeight: 700, color: levelColor }}>
              {percentage < 10 ? 'CRITICAL — Fuel tank nearly empty' : 'LOW FUEL — Place order soon'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Main tank (ZUFTA10): <strong style={{ color: levelColor }}>{percentage.toFixed(0)}%</strong>
              {' · '}{currentLevel.toLocaleString()} L remaining of {TANK_MAX_LITRES.toLocaleString()} L capacity
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === t.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Tank gauge card */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Main Tank — ZUFTA10</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Capacity: {TANK_MAX_LITRES.toLocaleString()} L</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: levelColor }}>
                  {percentage.toFixed(0)}%
                </span>
                <span className={`badge ${percentage < 10 ? 'badge-red' : percentage < 20 ? 'badge-yellow' : percentage < 40 ? 'badge-yellow' : 'badge-green'}`}>
                  {percentage < 10 ? 'Critical' : percentage < 20 ? 'Low' : percentage < 40 ? 'Below 40%' : 'Normal'}
                </span>
              </div>
            </div>

            {/* Gauge bar */}
            <div style={{ position: 'relative', height: 36, background: 'var(--surface2)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 10 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, percentage)}%`, background: levelColor, borderRadius: 10, transition: 'width .8s ease', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                {percentage > 12 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {currentLevel.toLocaleString()} L
                  </span>
                )}
              </div>
              {/* 20% and 40% markers */}
              {[20, 40].map(pct => (
                <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.2)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              <span>0</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span>
            </div>
          </div>

          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card">
              <div className="kpi-label">Current Level</div>
              <div className="kpi-val" style={{ color: levelColor, fontSize: 22 }}>{currentLevel.toLocaleString()} L</div>
              <div className="kpi-sub">{percentage.toFixed(1)}% full</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Issued Today</div>
              <div className="kpi-val" style={{ color: 'var(--yellow)', fontSize: 22 }}>{issuedToday.toLocaleString()} L</div>
              <div className="kpi-sub">{today}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Issued This Month</div>
              <div className="kpi-val" style={{ fontSize: 22 }}>{issuedThisMonth.toLocaleString()} L</div>
              <div className="kpi-sub">{today.slice(0, 7)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total Delivered</div>
              <div className="kpi-val" style={{ color: 'var(--green)', fontSize: 22 }}>{totalDelivered.toLocaleString()} L</div>
              <div className="kpi-sub">{deliveries.length} deliveries</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Total Issued</div>
              <div className="kpi-val" style={{ fontSize: 22 }}>{totalIssued.toLocaleString()} L</div>
              <div className="kpi-sub">{issuances.length} transactions</div>
            </div>
          </div>

          {/* Recent issuances */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Recent Issuances</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Amount (L)</th><th>Purpose</th></tr></thead>
                <tbody>
                  {issuances.slice(0, 8).map(i => (
                    <tr key={i.id}>
                      <td>{i.date}</td>
                      <td style={{ fontWeight: 600 }}>{i.vehicle || '—'}</td>
                      <td>{i.driver || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--yellow)', fontWeight: 700 }}>{i.amount} L</td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{i.purpose || '—'}</td>
                    </tr>
                  ))}
                  {issuances.length === 0 && <tr><td colSpan="5" className="empty-state">No issuances yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent deliveries */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Recent Deliveries</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Supplier</th><th>Qty (L)</th><th>Fuel Type</th><th>Delivery Note</th></tr></thead>
                <tbody>
                  {deliveries.slice(0, 5).map(d => (
                    <tr key={d.id}>
                      <td>{d.date}</td>
                      <td style={{ fontWeight: 600 }}>{d.supplier || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{d.qty?.toLocaleString()} L</td>
                      <td><span className={`badge ${d.fuel_type === 'DIESEL' ? 'badge-yellow' : 'badge-green'}`}>{d.fuel_type}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.delivery_note || '—'}</td>
                    </tr>
                  ))}
                  {deliveries.length === 0 && <tr><td colSpan="5" className="empty-state">No deliveries yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── ANALYTICS TAB ───────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <>
          {/* 7-day bar chart (CSS) */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>7-Day Consumption Trend</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Litres issued per day</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
              {last7.map((day, i) => {
                const pct     = (day.issued / maxDay) * 100
                const isToday = day.dateStr === today
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, color: isToday ? 'var(--gold)' : 'var(--text-dim)', fontWeight: isToday ? 700 : 400, fontFamily: 'var(--mono)' }}>
                      {day.issued > 0 ? day.issued : ''}
                    </div>
                    <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${Math.max(3, pct)}%`, background: isToday ? 'var(--gold)' : 'var(--teal)', borderRadius: '4px 4px 0 0', opacity: day.issued > 0 ? 1 : 0.15, transition: 'height .4s ease' }} />
                    </div>
                    <div style={{ fontSize: 9, color: isToday ? 'var(--gold)' : 'var(--text-dim)', textAlign: 'center', fontWeight: isToday ? 700 : 400, lineHeight: 1.2 }}>
                      {day.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* By vehicle */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>By Vehicle</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Total litres issued per vehicle</div>
              {byVehicle.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>No data yet</div>
              ) : byVehicle.map(([vehicle, litres]) => {
                const pct = (litres / maxVehicle) * 100
                const pctTotal = totalIssued > 0 ? ((litres / totalIssued) * 100).toFixed(0) : 0
                return (
                  <div key={vehicle} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={vehicle}>{vehicle}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                        {litres.toLocaleString()} L <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({pctTotal}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* By driver */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>By Driver / Operator</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Total litres issued per driver</div>
              {byDriver.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>No data yet</div>
              ) : byDriver.map(([driver, litres]) => {
                const pct = (litres / maxDriver) * 100
                const pctTotal = totalIssued > 0 ? ((litres / totalIssued) * 100).toFixed(0) : 0
                return (
                  <div key={driver} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12 }}>{driver}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                        {litres.toLocaleString()} L <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({pctTotal}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--yellow)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dipstick trend */}
          {dipstickLog.length > 0 && (
            <div className="card" style={{ padding: 20, marginTop: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Tank Level History (from Dipstick)</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>End-of-day levels from dipstick readings</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100, overflowX: 'auto' }}>
                {[...dipstickLog].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-30).map((d, i) => {
                  const lvl = d.fuel_end || d.end_litres || 0
                  const pct = (lvl / TANK_MAX_LITRES) * 100
                  const col = pct < 10 ? 'var(--red)' : pct < 20 ? 'var(--yellow)' : 'var(--teal)'
                  return (
                    <div key={i} title={`${d.date}: ${lvl.toLocaleString()} L`}
                      style={{ flex: '0 0 20px', height: `${Math.max(4, pct)}%`, background: col, borderRadius: '3px 3px 0 0', cursor: 'pointer', transition: 'opacity .15s' }}
                      onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseOut={e  => e.currentTarget.style.opacity = '1'} />
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>Last {Math.min(30, dipstickLog.length)} readings · hover to see value</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
