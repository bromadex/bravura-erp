// src/pages/Fuel/FuelForecasting.jsx
// Consumption forecasting with reorder recommendations.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { StatBar } from '../../components/ui/StatBar'
import { ChartCard } from '../../components/ui/ChartCard'
import { PageHeader, KPICard, EmptyState, Spinner } from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'

const TANK_MAX_LITRES = 10103  // fallback constant
const REORDER_PCT     = 0.20   // 20% safety stock
const FILL_TO_PCT     = 0.90   // fill to 90%

// ── helpers ────────────────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function nDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function levelColor(pct) {
  if (pct >= 30) return 'var(--teal)'
  if (pct >= 10) return 'var(--yellow)'
  return 'var(--red)'
}

function levelTextColor(pct) {
  if (pct >= 30) return 'var(--teal)'
  if (pct >= 10) return 'var(--yellow)'
  return 'var(--red)'
}

// ── component ──────────────────────────────────────────────────────────────────

export default function FuelForecasting() {
  const today = new Date().toISOString().split('T')[0]

  const [currentLevel, setCurrentLevel]   = useState(null) // null = not loaded yet
  const [capacity,     setCapacity]        = useState(TANK_MAX_LITRES)
  const [issuances,    setIssuances]       = useState([])
  const [loading,      setLoading]         = useState(true)
  const [rateKey,      setRateKey]         = useState('14') // '7' | '14' | '30'

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      // Latest dipstick reading
      supabase
        .from('dipstick_log')
        .select('date, fuel_end')
        .order('date', { ascending: false })
        .limit(1),

      // Tank capacity (from fuel_tanks if it exists)
      supabase
        .from('fuel_tanks')
        .select('capacity')
        .eq('is_active', true)
        .limit(1),

      // Last 30 days of issuances
      supabase
        .from('fuel_log')
        .select('date, amount')
        .gte('date', nDaysAgo(30))
        .order('date', { ascending: true }),
    ]).then(([dipRes, tankRes, issRes]) => {
      if (cancelled) return

      // Dipstick
      const dip = dipRes.data?.[0]
      if (dip) {
        const level = dip.fuel_end ?? null
        setCurrentLevel(level)
      } else {
        setCurrentLevel(null)
      }

      // Capacity
      if (!tankRes.error && tankRes.data?.[0]?.capacity) {
        setCapacity(tankRes.data[0].capacity)
      } else {
        setCapacity(TANK_MAX_LITRES)
      }

      // Issuances
      setIssuances(issRes.data || [])
      setLoading(false)
    }).catch(err => {
      if (!cancelled) {
        console.error('FuelForecasting fetch error:', err)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [])

  // ── consumption rates ──────────────────────────────────────────────────────
  const rates = useMemo(() => {
    function totalInWindow(days) {
      const cutoff = nDaysAgo(days)
      return issuances
        .filter(r => r.date >= cutoff)
        .reduce((s, r) => s + (r.amount || 0), 0)
    }

    const total7  = totalInWindow(7)
    const total14 = totalInWindow(14)
    const total30 = totalInWindow(30)

    return {
      '7':  total7  / 7,
      '14': total14 / 14,
      '30': total30 / 30,
    }
  }, [issuances])

  // ── forecast ───────────────────────────────────────────────────────────────
  const forecast = useMemo(() => {
    const dailyRate = rates[rateKey] || 0
    const level     = currentLevel ?? 0
    const reorderAt = capacity * REORDER_PCT

    if (dailyRate <= 0) {
      return { dailyRate: 0, daysToEmpty: null, depletionDate: null, daysToReorder: null, reorderDate: null, orderQty: null }
    }

    const daysToEmpty   = level / dailyRate
    const depletionDate = addDays(today, Math.ceil(daysToEmpty))

    const daysToReorder   = (level - reorderAt) / dailyRate
    const reorderDate     = daysToReorder > 0 ? addDays(today, Math.ceil(daysToReorder)) : today
    const orderQty        = Math.max(0, capacity * FILL_TO_PCT - level)

    return { dailyRate, daysToEmpty, depletionDate, daysToReorder, reorderDate, orderQty }
  }, [rates, rateKey, currentLevel, capacity, today])

  // ── 30-day projection table (every 5 days) ─────────────────────────────────
  const projectionRows = useMemo(() => {
    const level = currentLevel ?? 0
    const dailyRate = rates[rateKey] || 0
    return Array.from({ length: 7 }, (_, i) => {
      const dayN     = (i + 1) * 5
      const projected = Math.max(0, level - dailyRate * dayN)
      const pct      = (projected / capacity) * 100
      const date     = addDays(today, dayN)
      return { day: dayN, date, projected, pct }
    })
  }, [currentLevel, rates, rateKey, capacity, today])

  // ── 30-day consumption trend chart ────────────────────────────────────────
  const trendData = useMemo(() => {
    // Group by date, last 30 days
    const cutoff = nDaysAgo(30)
    const byDate = {}
    for (const r of issuances) {
      if (r.date < cutoff) continue
      byDate[r.date] = (byDate[r.date] || 0) + (r.amount || 0)
    }
    const dates = Object.keys(byDate).sort()
    return dates.map(d => ({
      label: d.slice(5), // MM-DD
      value: byDate[d],
      color: 'var(--gold)',
    }))
  }, [issuances])

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40 }}><Spinner /></div>

  const noDipstick    = currentLevel === null
  const noIssuances   = issuances.length === 0
  const level         = currentLevel ?? 0
  const tankPct       = Math.min(100, (level / capacity) * 100)
  const reorderAt     = capacity * REORDER_PCT
  const reorderPct    = (reorderAt / capacity) * 100

  const rateLabel = { '7': '7-day', '14': '14-day', '30': '30-day' }

  return (
    <div>
      {/* Header */}
      <PageHeader title="Fuel Forecasting & Reorder Planning" subtitle="Predict depletion and schedule restocking based on rolling consumption averages" />

      {/* No dipstick banner */}
      {noDipstick && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: 'rgba(248,113,113,.10)', borderColor: 'var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 20 }}>info</span>
            <span style={{ fontSize: 13 }}>No dipstick readings found. Add a dipstick reading to enable level-based forecasting. Consumption rates are still shown below.</span>
          </div>
        </div>
      )}

      {/* No issuances banner */}
      {noIssuances && (
        <div className="card" style={{ padding: 14, marginBottom: 16, background: 'rgba(248,113,113,.06)', borderColor: 'var(--border2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 20 }}>info</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Insufficient data: no fuel issuances in the last 30 days. Daily rates cannot be calculated.</span>
          </div>
        </div>
      )}

      {/* Current tank status */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--gold)' }}>Current Tank Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: levelTextColor(tankPct) }}>
              {fmtNum(level)} L
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>of {fmtNum(capacity)} L capacity</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>Tank level</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: levelTextColor(tankPct) }}>{tankPct.toFixed(1)}%</span>
            </div>
            <StatBar value={level} max={capacity} color={levelColor(tankPct)} height={12} showLabel={false} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
              <span>0</span>
              <span style={{ color: 'var(--yellow)' }}>Reorder at {reorderPct.toFixed(0)}% ({fmtNum(reorderAt)} L)</span>
              <span>{fmtNum(capacity)} L</span>
            </div>
          </div>
        </div>
      </div>

      {/* Consumption rates + rate selector */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>Consumption Rates</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['7', '14', '30'].map(k => (
              <button
                key={k}
                className={`btn${rateKey === k ? ' btn-primary' : ' btn-secondary'}`}
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => setRateKey(k)}
              >
                {k}-day
              </button>
            ))}
          </div>
        </div>
        <div className="kpi-grid">
          {[
            { label: '7-day avg', key: '7' },
            { label: '14-day avg', key: '14' },
            { label: '30-day avg', key: '30' },
          ].map(({ label, key }) => (
            <KPICard
              key={key}
              label={label}
              value={rates[key] > 0 ? `${fmtNum(rates[key])} L/day` : 'No data'}
              icon="trending_down"
              color={rateKey === key ? 'gold' : ''}
            />
          ))}
        </div>
      </div>

      {/* Forecast cards */}
      {!noDipstick && !noIssuances && forecast.dailyRate > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: 'var(--gold)' }}>
            Forecast (using {rateLabel[rateKey]})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>

            {/* Reorder date */}
            <div className="card" style={{ padding: 16, background: forecast.daysToReorder != null && forecast.daysToReorder <= 14 ? 'rgba(251,191,36,.12)' : 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="material-icons" style={{ color: 'var(--yellow)', fontSize: 22 }}>shopping_cart</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Reorder Date</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
                {fmtDate(forecast.reorderDate)}
              </div>
              {forecast.daysToReorder != null && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  {forecast.daysToReorder > 0
                    ? `in ${Math.ceil(forecast.daysToReorder)} days`
                    : 'Reorder now — below safety stock!'}
                </div>
              )}
            </div>

            {/* Depletion date */}
            <div className="card" style={{ padding: 16, background: forecast.daysToEmpty != null && forecast.daysToEmpty <= 7 ? 'rgba(248,113,113,.12)' : 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="material-icons" style={{ color: 'var(--red)', fontSize: 22 }}>hourglass_empty</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Depletion Date</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--red)' }}>
                {fmtDate(forecast.depletionDate)}
              </div>
              {forecast.daysToEmpty != null && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  in {Math.ceil(forecast.daysToEmpty)} days at {fmtNum(forecast.dailyRate)} L/day
                </div>
              )}
            </div>

            {/* Recommended order */}
            <div className="card" style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="material-icons" style={{ color: 'var(--teal)', fontSize: 22 }}>local_shipping</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Recommended Order</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                {forecast.orderQty != null ? `${fmtNum(forecast.orderQty)} L` : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                fills tank to {(FILL_TO_PCT * 100).toFixed(0)}% ({fmtNum(capacity * FILL_TO_PCT)} L)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No-data notice when rate is 0 but dipstick exists */}
      {!noDipstick && (noIssuances || forecast.dailyRate === 0) && (
        <div className="card" style={{ padding: 20, marginBottom: 16, textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 36, opacity: .4 }}>query_stats</span>
          <p style={{ marginTop: 8 }}>Insufficient consumption data for the selected window. Try a wider rate (30-day) or add fuel issuances.</p>
        </div>
      )}

      {/* 30-day projection table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border2)', fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>
          30-Day Projection (every 5 days, {rateLabel[rateKey]} rate)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Day', 'Date', 'Projected Level', '% Full', 'Level'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Day' || h === 'Date' ? 'left' : 'right', borderBottom: '1px solid var(--border2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projectionRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>Day {row.day}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>{fmtDate(row.date)}</td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontFamily: 'var(--mono)', color: levelTextColor(row.pct), fontWeight: 600 }}>
                    {fmtNum(row.projected)} L
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontFamily: 'var(--mono)', color: levelTextColor(row.pct) }}>
                    {row.pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', textAlign: 'right', minWidth: 120 }}>
                    <StatBar value={row.projected} max={capacity} color={levelColor(row.pct)} height={6} showLabel={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 30-day consumption trend chart */}
      {trendData.length > 0 ? (
        <ChartCard
          title="Consumption Trend — Last 30 Days"
          subtitle="Daily litres issued (from fuel log)"
          data={trendData}
          unit=" L"
          height={160}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <div className="card" style={{ padding: 20, marginBottom: 16, textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 36, opacity: .4 }}>bar_chart</span>
          <p style={{ marginTop: 8 }}>No issuance data available for the last 30 days.</p>
        </div>
      )}
    </div>
  )
}
