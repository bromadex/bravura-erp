// src/pages/Fuel/FuelTanks.jsx
//
// ADDED:
// 1. Low-level alert banner — appears when tank < 20%, critical when < 10%
// 2. Consumption reports tab — daily usage, by vehicle, by driver
// 3. 7-day trend mini chart using CSS bar chart (no extra library)

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function FuelTanks() {
  const { issuances, deliveries, getCurrentTankLevel, getTankPercentage, TANK_MAX_LITRES, loading } = useFuel()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'tanks')

  const [activeTab, setActiveTab] = useState('overview')

  const currentLevel = getCurrentTankLevel()
  const percentage   = getTankPercentage()
  const totalIssued    = issuances.reduce((s, i) => s + (i.amount || 0), 0)
  const totalDelivered = deliveries.reduce((s, d) => s + (d.qty    || 0), 0)

  const today   = new Date().toISOString().split('T')[0]
  const issuedToday = issuances.filter(i => i.date === today).reduce((s, i) => s + (i.amount || 0), 0)

  // ── 7-day daily trend ──────────────────────────────────────
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().split('T')[0]
    const issued  = issuances.filter(iss => iss.date === dateStr).reduce((s, iss) => s + (iss.amount || 0), 0)
    return { date: dateStr, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), issued }
  })
  const maxDay = Math.max(...last7.map(d => d.issued), 1)

  // ── By vehicle ─────────────────────────────────────────────
  const vehicleMap = {}
  issuances.forEach(i => {
    const key = i.vehicle || 'Unknown'
    vehicleMap[key] = (vehicleMap[key] || 0) + (i.amount || 0)
  })
  const byVehicle = Object.entries(vehicleMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  // ── By driver ──────────────────────────────────────────────
  const driverMap = {}
  issuances.forEach(i => {
    const key = i.driver || 'Unknown'
    driverMap[key] = (driverMap[key] || 0) + (i.amount || 0)
  })
  const byDriver = Object.entries(driverMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const exportReport = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issuances.map(i => ({ Date: i.date, Time: i.time, Type: i.fuel_type, Litres: i.amount, Vehicle: i.vehicle, Driver: i.driver, Purpose: i.purpose, Authorized: i.authorized_by }))), 'Issuances')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byVehicle.map(([v, l]) => ({ Vehicle: v, 'Total Litres': l }))), 'By Vehicle')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byDriver.map(([d, l]) => ({ Driver: d, 'Total Litres': l }))), 'By Driver')
    XLSX.writeFile(wb, `Fuel_Report_${today}.xlsx`)
    toast.success('Exported')
  }

  const levelColor = percentage < 10 ? 'var(--red)' : percentage < 20 ? 'var(--yellow)' : percentage < 40 ? 'var(--yellow)' : 'var(--teal)'

  const TABS = [
    { id: 'overview',  label: 'Overview',  icon: 'water'     },
    { id: 'report',    label: 'Consumption Report', icon: 'bar_chart' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Tanks</h1>
        <button className="btn btn-secondary" onClick={exportReport}>
          <span className="material-icons">table_chart</span> Export
        </button>
      </div>

      {/* ── Low-level alert ─────────────────────────────────── */}
      {percentage < 20 && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 20,
          background: percentage < 10 ? 'rgba(248,113,113,.12)' : 'rgba(251,191,36,.1)',
          border: `1px solid ${percentage < 10 ? 'rgba(248,113,113,.4)' : 'rgba(251,191,36,.4)'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className="material-icons" style={{ fontSize: 28, color: levelColor }}>
            {percentage < 10 ? 'error' : 'warning'}
          </span>
          <div>
            <div style={{ fontWeight: 700, color: levelColor, fontSize: 14 }}>
              {percentage < 10 ? 'CRITICAL: Fuel tank nearly empty' : 'WARNING: Fuel level low'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              Main tank (ZUFTA10) is at <strong style={{ color: levelColor }}>{percentage.toFixed(0)}%</strong>
              {' '}— {currentLevel.toLocaleString()} L remaining out of {TANK_MAX_LITRES.toLocaleString()} L.
              {' '}Order a delivery to avoid operations disruption.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--gold)' : '2px solid transparent', color: activeTab === t.id ? 'var(--gold)' : 'var(--text-mid)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Tank level card */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Main Tank — ZUFTA10</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, height: 32, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
              <div style={{ width: `${Math.min(100, percentage)}%`, height: '100%', background: levelColor, borderRadius: 10, transition: 'width .6s ease', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                {percentage > 15 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{percentage.toFixed(0)}%</span>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: levelColor }}>{currentLevel.toLocaleString()} L</span>
              <span style={{ color: 'var(--text-dim)' }}>Capacity: {TANK_MAX_LITRES.toLocaleString()} L</span>
            </div>
            <div className="kpi-grid" style={{ marginBottom: 0 }}>
              <div className="kpi-card"><div className="kpi-label">Issued Today</div><div className="kpi-val" style={{ color: 'var(--yellow)' }}>{issuedToday} L</div></div>
              <div className="kpi-card"><div className="kpi-label">Total Issued</div><div className="kpi-val">{totalIssued.toLocaleString()} L</div><div className="kpi-sub">{issuances.length} transactions</div></div>
              <div className="kpi-card"><div className="kpi-label">Total Delivered</div><div className="kpi-val" style={{ color: 'var(--green)' }}>{totalDelivered.toLocaleString()} L</div><div className="kpi-sub">{deliveries.length} deliveries</div></div>
              <div className="kpi-card"><div className="kpi-label">Tank Level</div><div className="kpi-val" style={{ color: levelColor }}>{percentage.toFixed(0)}%</div><div className="kpi-sub">{percentage < 20 ? '⚠ Low' : 'Normal'}</div></div>
            </div>
          </div>

          {/* Recent issuances */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Issuances</h3>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Amount (L)</th><th>Purpose</th></tr></thead>
                <tbody>
                  {issuances.slice(0, 8).map(i => (
                    <tr key={i.id}><td>{i.date}</td><td>{i.vehicle || '—'}</td><td>{i.driver || '—'}</td><td style={{ fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>{i.amount} L</td><td style={{ color: 'var(--text-dim)' }}>{i.purpose || '—'}</td></tr>
                  ))}
                  {issuances.length === 0 && <tr><td colSpan="5" className="empty-state">No issuances yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent deliveries */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Deliveries</h3>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Supplier</th><th>Qty (L)</th><th>Fuel Type</th></tr></thead>
                <tbody>
                  {deliveries.slice(0, 5).map(d => (
                    <tr key={d.id}><td>{d.date}</td><td>{d.supplier || '—'}</td><td style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{d.qty} L</td><td>{d.fuel_type}</td></tr>
                  ))}
                  {deliveries.length === 0 && <tr><td colSpan="4" className="empty-state">No deliveries yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'report' && (
        <>
          {/* 7-day consumption bar chart */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>7-Day Consumption Trend</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120 }}>
              {last7.map((day, i) => {
                const pct = (day.issued / maxDay) * 100
                const isToday = day.date === today
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontWeight: isToday ? 700 : 400 }}>{day.issued || '—'}</div>
                    <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${Math.max(4, pct)}%`, background: isToday ? 'var(--gold)' : 'var(--teal)', borderRadius: '4px 4px 0 0', opacity: day.issued > 0 ? 1 : 0.2, transition: 'height .4s ease' }} />
                    </div>
                    <div style={{ fontSize: 9, color: isToday ? 'var(--gold)' : 'var(--text-dim)', textAlign: 'center', fontWeight: isToday ? 700 : 400 }}>{day.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* By vehicle */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Consumption by Vehicle</div>
              {byVehicle.length === 0 ? <div className="empty-state">No data</div> : byVehicle.map(([vehicle, litres]) => {
                const pct = (litres / totalIssued) * 100
                return (
                  <div key={vehicle} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{vehicle}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>{litres.toLocaleString()} L</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* By driver */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Consumption by Driver</div>
              {byDriver.length === 0 ? <div className="empty-state">No data</div> : byDriver.map(([driver, litres]) => {
                const pct = (litres / totalIssued) * 100
                return (
                  <div key={driver} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12 }}>{driver}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>{litres.toLocaleString()} L</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--yellow)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
