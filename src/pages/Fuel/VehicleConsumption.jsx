// src/pages/Fuel/VehicleConsumption.jsx
// Per-vehicle fuel efficiency analytics with abnormal usage detection.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, AlertBanner, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, exportCSV, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'

// ── helpers ────────────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function nDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ── component ──────────────────────────────────────────────────────────────────

export default function VehicleConsumption() {
  const today    = new Date().toISOString().split('T')[0]
  const [from, setFrom]       = useState(nDaysAgo(90))
  const [to,   setTo]         = useState(today)
  const [filter, setFilter]   = useState('')
  const [rows,   setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null) // vehicle name

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('fuel_log')
      .select('id, date, amount, vehicle, odometer, flowmeter, purpose, driver, fuel_type')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('fuel_log fetch error:', error)
        setRows(data || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [from, to])

  // ── per-vehicle analytics ──────────────────────────────────────────────────
  const vehicleData = useMemo(() => {
    // Group by vehicle
    const byVehicle = {}
    for (const r of rows) {
      const v = r.vehicle || 'Unknown'
      if (!byVehicle[v]) byVehicle[v] = []
      byVehicle[v].push(r)
    }

    const result = []

    for (const [vehicle, fills] of Object.entries(byVehicle)) {
      // Sort by date asc
      const sorted = [...fills].sort((a, b) => a.date.localeCompare(b.date))

      // Compute km_driven and l/100km for consecutive odometer pairs
      const enriched = sorted.map((fill, i) => {
        let km_driven = null
        let l100 = null
        if (i > 0) {
          const prev = sorted[i - 1]
          if (fill.odometer != null && prev.odometer != null && fill.odometer > prev.odometer) {
            km_driven = fill.odometer - prev.odometer
            l100 = (fill.amount / km_driven) * 100
          }
        }
        return { ...fill, km_driven, l100 }
      })

      // Efficiency values for median calculation
      const efficiencies = enriched
        .map(f => f.l100)
        .filter(e => e != null && isFinite(e) && e > 0)

      const med = median(efficiencies)
      const threshold = med * 2.0

      // Flag abnormal fills
      const fills2 = enriched.map(f => ({
        ...f,
        abnormal: efficiencies.length >= 2 && f.l100 != null && f.l100 > threshold,
        multiplier: med > 0 && f.l100 != null ? f.l100 / med : null,
      }))

      const totalLitres   = sorted.reduce((s, f) => s + (f.amount || 0), 0)
      const lastOdometer  = sorted.reduce((max, f) => f.odometer > max ? f.odometer : max, 0)
      const avgL100       = efficiencies.length ? efficiencies.reduce((s, e) => s + e, 0) / efficiencies.length : null
      const minL100       = efficiencies.length ? Math.min(...efficiencies) : null
      const maxL100       = efficiencies.length ? Math.max(...efficiencies) : null
      const abnormalCount = fills2.filter(f => f.abnormal).length
      const hasOdometer   = efficiencies.length > 0

      let status = 'no-data'
      if (hasOdometer) {
        if (avgL100 != null && avgL100 < 30) status = 'normal'
        else if (avgL100 != null && avgL100 <= 50) status = 'high'
        else if (avgL100 != null) status = 'high'
      }

      result.push({
        vehicle,
        fills: fills2,
        count: sorted.length,
        totalLitres,
        lastOdometer: lastOdometer || null,
        avgL100,
        minL100,
        maxL100,
        abnormalCount,
        hasOdometer,
        status,
      })
    }

    return result.sort((a, b) => b.totalLitres - a.totalLitres)
  }, [rows])

  // ── filtered vehicles ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!filter.trim()) return vehicleData
    const q = filter.toLowerCase()
    return vehicleData.filter(v => v.vehicle.toLowerCase().includes(q))
  }, [vehicleData, filter])

  // ── summary metrics ────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalVehicles  = filtered.length
    const totalLitres    = filtered.reduce((s, v) => s + v.totalLitres, 0)
    const l100vals       = filtered.map(v => v.avgL100).filter(x => x != null)
    const avgL100Global  = l100vals.length ? l100vals.reduce((s, x) => s + x, 0) / l100vals.length : null
    const abnormalTotal  = filtered.reduce((s, v) => s + v.abnormalCount, 0)
    return { totalVehicles, totalLitres, avgL100Global, abnormalTotal }
  }, [filtered])

  // ── abnormal alerts ────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const out = []
    for (const v of filtered) {
      for (const f of v.fills) {
        if (f.abnormal) {
          out.push({
            vehicle: v.vehicle,
            date: f.date,
            l100: f.l100,
            multiplier: f.multiplier,
          })
        }
      }
    }
    return out.sort((a, b) => b.l100 - a.l100).slice(0, 10)
  }, [filtered])

  // ── exports ────────────────────────────────────────────────────────────────
  const handleExportXLSX = () => {
    const exportRows = filtered.map(v => ({
      Vehicle:      v.vehicle,
      Fills:        v.count,
      'Total Litres': fmtNum(v.totalLitres),
      'Last Odometer': v.lastOdometer ?? '—',
      'Avg L/100km': v.avgL100 != null ? fmtNum(v.avgL100) : '—',
      'Min L/100km': v.minL100 != null ? fmtNum(v.minL100) : '—',
      'Max L/100km': v.maxL100 != null ? fmtNum(v.maxL100) : '—',
      'Abnormal Fills': v.abnormalCount,
      Status: v.status,
    }))
    exportXLSX(exportRows, `VehicleConsumption_${dateTag()}`, 'Vehicle Consumption')
  }

  const handleExportCSV = () => {
    const exportRows = filtered.map(v => ({
      Vehicle:      v.vehicle,
      Fills:        v.count,
      Total_Litres: v.totalLitres,
      Last_Odometer: v.lastOdometer ?? '',
      Avg_L100km:  v.avgL100 != null ? v.avgL100.toFixed(2) : '',
      Min_L100km:  v.minL100 != null ? v.minL100.toFixed(2) : '',
      Max_L100km:  v.maxL100 != null ? v.maxL100.toFixed(2) : '',
      Abnormal_Fills: v.abnormalCount,
      Status: v.status,
    }))
    exportCSV(exportRows, `VehicleConsumption_${dateTag()}`)
  }

  // ── status badge ───────────────────────────────────────────────────────────
  function StatusBadge({ status }) {
    if (status === 'normal') return <span className="badge badge-green" style={{ fontSize: 11 }}>Normal</span>
    if (status === 'high')   return <span className="badge badge-yellow" style={{ fontSize: 11 }}>High</span>
    return <span className="badge" style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text-dim)' }}>No km data</span>
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>

  return (
    <div>
      {/* Header */}
      <PageHeader title="Vehicle Consumption Analytics" subtitle="Per-vehicle fuel efficiency and abnormal usage detection">
        <button className="btn btn-secondary" onClick={handleExportCSV}>
          <span className="material-icons">download</span> CSV
        </button>
        <button className="btn btn-secondary" onClick={handleExportXLSX}>
          <span className="material-icons">table_chart</span> Excel
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--text-dim)', marginRight: 2 }}>From</label>
        <input type="date" className="form-control" style={{ width: 150 }} value={from} onChange={e => setFrom(e.target.value)} />
        <label style={{ fontSize: 13, color: 'var(--text-dim)', marginRight: 2 }}>To</label>
        <input type="date" className="form-control" style={{ width: 150 }} value={to} onChange={e => setTo(e.target.value)} />
        <input
          type="text"
          className="form-control"
          placeholder="Filter by vehicle…"
          style={{ width: 200 }}
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {filter && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setFilter('')}>Clear</button>
        )}
      </div>

      {/* Abnormal alerts */}
      {alerts.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: 'rgba(248,113,113,.10)', borderColor: 'var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="material-icons" style={{ color: 'var(--red)', fontSize: 20 }}>warning</span>
            <strong style={{ fontSize: 13 }}>Abnormal Usage Alerts</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text)' }}>
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>{a.vehicle}</span>
                {': '}
                {a.l100.toFixed(1)} L/100km on {fmtDate(a.date)}
                {a.multiplier != null && (
                  <span style={{ color: 'var(--text-dim)' }}> ({a.multiplier.toFixed(1)}× avg)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary KPI cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          label="Total Vehicles"
          value={summary.totalVehicles}
          icon="directions_car"
        />
        <KPICard
          label="Total Litres"
          value={`${fmtNum(summary.totalLitres)} L`}
          icon="local_gas_station"
          color="gold"
        />
        <KPICard
          label="Avg L/100km"
          value={summary.avgL100Global != null ? `${fmtNum(summary.avgL100Global)}` : '—'}
          icon="speed"
          sub="fleet average"
        />
        <KPICard
          label="Abnormal Fills"
          value={summary.abnormalTotal}
          icon="warning"
          color={summary.abnormalTotal > 0 ? 'red' : ''}
          alert={summary.abnormalTotal > 0}
        />
      </div>

      {/* Per-vehicle table */}
      {filtered.length === 0 ? (
        <EmptyState message="No vehicle fuel records found for the selected period." icon="directions_car" />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Vehicle</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Fills</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Total Litres</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Last Odometer</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Avg L/100km</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Min</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Max</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <>
                    <tr
                      key={v.vehicle}
                      style={{ cursor: 'pointer', background: expanded === v.vehicle ? 'var(--surface2)' : 'transparent' }}
                      onClick={() => setExpanded(expanded === v.vehicle ? null : v.vehicle)}
                    >
                      <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>
                            {expanded === v.vehicle ? 'expand_less' : 'expand_more'}
                          </span>
                          <span style={{ fontWeight: 600 }}>{v.vehicle}</span>
                          {v.abnormalCount > 0 && (
                            <span className="badge badge-red" style={{ fontSize: 10 }}>{v.abnormalCount} ⚠</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13 }}>{v.count}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmtNum(v.totalLitres)} L</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13 }}>{v.lastOdometer ? `${v.lastOdometer.toLocaleString()} km` : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13 }}>{v.avgL100 != null ? fmtNum(v.avgL100) : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--teal)' }}>{v.minL100 != null ? fmtNum(v.minL100) : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 13, color: v.maxL100 > 50 ? 'var(--red)' : 'inherit' }}>{v.maxL100 != null ? fmtNum(v.maxL100) : '—'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
                        <StatusBadge status={v.status} />
                      </td>
                    </tr>

                    {/* Expanded detail table */}
                    {expanded === v.vehicle && (
                      <tr key={`${v.vehicle}-detail`}>
                        <td colSpan={8} style={{ padding: 0, background: 'var(--bg)', borderBottom: '2px solid var(--border2)' }}>
                          <div style={{ padding: 16 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--gold)' }}>
                              Fill history — {v.vehicle}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    {['Date', 'Litres', 'Odometer', 'KM Driven', 'L/100km', 'Flowmeter', 'Driver', 'Status'].map(h => (
                                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {v.fills.map((f, i) => (
                                    <tr key={f.id || i} style={{ background: f.abnormal ? 'rgba(248,113,113,.08)' : 'transparent' }}>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{fmtDate(f.date)}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>{fmtNum(f.amount)} L</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>{f.odometer != null ? `${f.odometer.toLocaleString()} km` : '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>{f.km_driven != null ? `${f.km_driven.toLocaleString()} km` : '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', color: f.abnormal ? 'var(--red)' : 'inherit' }}>
                                        {f.l100 != null ? fmtNum(f.l100) : '—'}
                                      </td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>{f.flowmeter != null ? fmtNum(f.flowmeter) : '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{f.driver || '—'}</td>
                                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                                        {f.abnormal ? (
                                          <span style={{ background: 'var(--red)', color: '#fff', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>⚠ Abnormal</span>
                                        ) : f.l100 != null ? (
                                          <span style={{ background: 'var(--surface2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>OK</span>
                                        ) : (
                                          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
