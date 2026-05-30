// src/pages/Fuel/VehicleConsumption.jsx
// Per-vehicle fuel efficiency analytics with abnormal usage detection, benchmarking,
// economy analytics, fleet trend, and anomaly detection.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, AlertBanner, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, exportCSV, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

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
  const [expanded, setExpanded]   = useState(null)
  const [activeTab, setActiveTab] = useState('analytics')

  // ── Benchmarks state ──────────────────────────────────────────────────────
  const [benchmarks,      setBenchmarks]      = useState([])
  const [bLoading,        setBLoading]        = useState(true)
  const [showBenchModal,  setShowBenchModal]  = useState(false)
  const [benchForm,       setBenchForm]       = useState({ vehicle: '', target_l_per_100km: '', target_l_per_hr: '', measurement_type: 'km', notes: '' })
  const [editBenchId,     setEditBenchId]     = useState(null)
  const [benchSaving,     setBenchSaving]     = useState(false)

  // ── Economy / Anomaly state ───────────────────────────────────────────────
  const [econIssuances,  setEconIssuances]  = useState([])
  const [econTrips,      setEconTrips]      = useState([])
  const [econAssets,     setEconAssets]     = useState([])
  const [econLoading,    setEconLoading]    = useState(false)
  const [econSortCol,    setEconSortCol]    = useState('total_litres')
  const [econSortDir,    setEconSortDir]    = useState('desc')
  const [anomalyFilter,  setAnomalyFilter]  = useState('all')   // 'all'|'Critical'|'Warning'
  const [anomalyAsset,   setAnomalyAsset]   = useState('')

  // ── fetch benchmarks ─────────────────────────────────────────────────────
  const fetchBenchmarks = useCallback(() => {
    setBLoading(true)
    supabase.from('fuel_benchmarks').select('*').order('vehicle')
      .then(({ data }) => { setBenchmarks(data || []); setBLoading(false) })
      .catch(() => setBLoading(false))
  }, [])

  useEffect(() => { fetchBenchmarks() }, [fetchBenchmarks])

  // ── fetch economy data (issuances + trips + assets) ──────────────────────
  const fetchEconomyData = useCallback(async () => {
    setEconLoading(true)
    try {
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const cutoff = sixMonthsAgo.toISOString().split('T')[0]

      const [issRes, tripRes, assetRes] = await Promise.all([
        supabase.from('fuel_issuance')
          .select('id, date, quantity, amount, equipment_name, asset_id, tank_id, driver_operator, created_at')
          .gte('date', cutoff)
          .order('date', { ascending: false }),
        supabase.from('vehicle_trips')
          .select('id, vehicle_id, asset_id, date, distance, driver_name, start_odometer, end_odometer')
          .gte('date', cutoff),
        supabase.from('asset_registry')
          .select('id, asset_name, asset_code, vehicle_type, asset_category, fuel_tank_capacity, benchmark_consumption, current_engine_hours'),
      ])
      setEconIssuances(issRes.data || [])
      setEconTrips(tripRes.data || [])
      setEconAssets(assetRes.data || [])
    } catch (e) {
      console.error('economy data fetch error', e)
    }
    setEconLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'economy' || activeTab === 'anomalies') fetchEconomyData()
  }, [activeTab, fetchEconomyData])

  // ── fetch fuel log ─────────────────────────────────────────────────────────
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

  // ── type-level benchmark defaults ─────────────────────────────────────────
  const TYPE_BENCHMARKS = { truck: 35, pickup: 15, generator_kva: 8, excavator: 25, grader: 20, bus: 30 }

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

  // ── efficiency ranking (benchmark vs actual) ──────────────────────────────
  const rankData = useMemo(() => {
    return vehicleData
      .filter(v => v.avgL100 != null)
      .map(v => {
        const bench = benchmarks.find(b => b.vehicle === v.vehicle)
        const benchL100 = bench?.target_l_per_100km ? parseFloat(bench.target_l_per_100km) : null
        const deviation = benchL100 ? ((v.avgL100 - benchL100) / benchL100 * 100) : null
        const effColor = deviation == null
          ? 'var(--text-dim)'
          : deviation <= 10 ? 'var(--green)'
          : deviation <= 25 ? 'var(--yellow)'
          : 'var(--red)'
        return { ...v, benchL100, deviation, effColor }
      })
      .sort((a, b) => {
        if (a.deviation != null && b.deviation != null) return a.deviation - b.deviation
        if (a.deviation != null) return -1
        if (b.deviation != null) return 1
        return (a.avgL100 || 0) - (b.avgL100 || 0)
      })
  }, [vehicleData, benchmarks])

  // ── monthly trend per vehicle ──────────────────────────────────────────────
  function monthlyTrend(fills) {
    const map = {}
    fills.forEach(f => {
      if (!f.date) return
      const mk = f.date.slice(0, 7)
      if (!map[mk]) map[mk] = { litres: 0, fills: 0, l100vals: [] }
      map[mk].litres += f.amount || 0
      map[mk].fills++
      if (f.l100 != null) map[mk].l100vals.push(f.l100)
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([mk, m]) => ({
        month: new Date(mk + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
        litres: m.litres,
        avgL100: m.l100vals.length ? m.l100vals.reduce((s, v) => s + v, 0) / m.l100vals.length : null,
      }))
  }

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

  // ── benchmark CRUD ─────────────────────────────────────────────────────────
  const openNewBench = (vehicleName) => {
    setEditBenchId(null)
    setBenchForm({ vehicle: vehicleName || '', target_l_per_100km: '', target_l_per_hr: '', measurement_type: 'km', notes: '' })
    setShowBenchModal(true)
  }

  const openEditBench = (b) => {
    setEditBenchId(b.id)
    setBenchForm({ vehicle: b.vehicle, target_l_per_100km: b.target_l_per_100km || '', target_l_per_hr: b.target_l_per_hr || '', measurement_type: b.measurement_type || 'km', notes: b.notes || '' })
    setShowBenchModal(true)
  }

  const handleSaveBench = async () => {
    if (!benchForm.vehicle.trim()) { toast.error('Enter vehicle name'); return }
    setBenchSaving(true)
    try {
      const payload = {
        vehicle:           benchForm.vehicle.trim(),
        target_l_per_100km: benchForm.target_l_per_100km !== '' ? parseFloat(benchForm.target_l_per_100km) : null,
        target_l_per_hr:    benchForm.target_l_per_hr    !== '' ? parseFloat(benchForm.target_l_per_hr)    : null,
        measurement_type:  benchForm.measurement_type,
        notes:             benchForm.notes || null,
        updated_at:        new Date().toISOString(),
      }
      if (editBenchId) {
        const { error } = await supabase.from('fuel_benchmarks').update(payload).eq('id', editBenchId)
        if (error) throw error
        toast.success('Benchmark updated')
      } else {
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
        const { error } = await supabase.from('fuel_benchmarks').insert([{ id, ...payload, created_at: new Date().toISOString() }])
        if (error) throw error
        toast.success('Benchmark saved')
      }
      setShowBenchModal(false)
      fetchBenchmarks()
    } catch (e) { toast.error(e.message) }
    setBenchSaving(false)
  }

  const handleDeleteBench = async (id) => {
    if (!window.confirm('Delete this benchmark?')) return
    const { error } = await supabase.from('fuel_benchmarks').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Benchmark deleted')
    fetchBenchmarks()
  }

  // ── Economy: per-asset computed rows ──────────────────────────────────────
  const TYPE_BENCH_MAP = { truck: 35, pickup: 15, generator_kva: 8, excavator: 25, grader: 20, bus: 30 }

  const econRows = useMemo(() => {
    if (!econIssuances.length && !econAssets.length) return []

    // Build per-asset issuance totals
    const issMap = {}
    for (const iss of econIssuances) {
      const key = iss.asset_id || iss.equipment_name || 'unknown'
      if (!issMap[key]) issMap[key] = { totalLitres: 0, totalCost: 0, issuances: [] }
      issMap[key].totalLitres += Number(iss.quantity) || 0
      issMap[key].totalCost   += Number(iss.total_cost) || 0
      issMap[key].issuances.push(iss)
    }

    // Build per-asset trip distance totals (vehicle_id or asset_id)
    const tripMap = {}
    for (const t of econTrips) {
      const key = t.asset_id || t.vehicle_id || ''
      if (!key) continue
      if (!tripMap[key]) tripMap[key] = { totalKm: 0 }
      tripMap[key].totalKm += Number(t.distance) || 0
    }

    // Merge with asset_registry
    const result = []
    const processedKeys = new Set()

    for (const [key, data] of Object.entries(issMap)) {
      if (processedKeys.has(key)) continue
      processedKeys.add(key)

      const asset = econAssets.find(a => a.id === key)
      const trips = tripMap[key] || { totalKm: 0 }

      const totalLitres = data.totalLitres
      const totalKm     = trips.totalKm
      const engHours    = Number(asset?.current_engine_hours) || 0

      const l100km  = totalKm > 0 ? (totalLitres / totalKm) * 100 : null
      const kmPerL  = totalLitres > 0 && totalKm > 0 ? totalKm / totalLitres : null
      const lPerHr  = engHours > 0 ? totalLitres / engHours : null

      const assetName = asset?.asset_name || asset?.asset_code || key
      const vType     = (asset?.vehicle_type || asset?.asset_category || '').toLowerCase()
      const benchKey  = Object.keys(TYPE_BENCH_MAP).find(k => vType.includes(k))
      const assetBench = asset?.benchmark_consumption
        ? Number(asset.benchmark_consumption)
        : benchKey ? TYPE_BENCH_MAP[benchKey] : null

      let effPct = null
      let effColor = 'var(--text-dim)'
      if (assetBench && l100km != null) {
        effPct = ((assetBench - l100km) / assetBench) * 100   // positive = better than bench
        const overPct = ((l100km - assetBench) / assetBench) * 100
        effColor = overPct <= 10 ? 'var(--green)' : overPct <= 25 ? 'var(--yellow)' : 'var(--red)'
      }

      result.push({ key, assetName, totalLitres, totalKm, l100km, kmPerL, lPerHr, assetBench, effPct, effColor, totalCost: data.totalCost })
    }

    // Sort
    const dir = econSortDir === 'asc' ? 1 : -1
    return result.sort((a, b) => {
      const av = a[econSortCol] ?? -Infinity
      const bv = b[econSortCol] ?? -Infinity
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir
    })
  }, [econIssuances, econTrips, econAssets, econSortCol, econSortDir])

  // ── Economy: fleet-wide monthly trend ─────────────────────────────────────
  const fleetMonthlyTrend = useMemo(() => {
    const map = {}
    for (const iss of econIssuances) {
      const mk = String(iss.date || '').slice(0, 7)
      if (!mk || mk.length !== 7) continue
      if (!map[mk]) map[mk] = { litres: 0, cost: 0 }
      map[mk].litres += Number(iss.quantity) || 0
      map[mk].cost   += Number(iss.total_cost) || 0
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([mk, m], i, arr) => {
        const prev = arr[i - 1]?.[1]
        const changeL = prev && prev.litres > 0 ? ((m.litres - prev.litres) / prev.litres) * 100 : null
        return {
          month: new Date(mk + '-01').toLocaleString('default', { month: 'short', year: '2-digit' }),
          litres: m.litres,
          cost: m.cost,
          changeL,
        }
      })
  }, [econIssuances])

  // ── Anomaly detection ──────────────────────────────────────────────────────
  const anomalyRows = useMemo(() => {
    if (!econIssuances.length) return []

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    // Group issuances by asset (equipment_name or asset_id)
    const byAsset = {}
    for (const iss of econIssuances) {
      const key = iss.asset_id || iss.equipment_name || 'unknown'
      if (!byAsset[key]) byAsset[key] = []
      byAsset[key].push(iss)
    }

    const anomalies = []

    for (const [assetKey, items] of Object.entries(byAsset)) {
      const asset = econAssets.find(a => a.id === assetKey)
      const assetName = asset?.asset_name || asset?.asset_code || assetKey
      const tankCapacity = Number(asset?.fuel_tank_capacity) || 0

      // Sort by created_at ascending for chronological analysis
      const sorted = [...items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      // Monthly totals for rolling average
      const monthlyMap = {}
      for (const iss of sorted) {
        const mk = String(iss.date || '').slice(0, 7)
        if (!mk) continue
        if (!monthlyMap[mk]) monthlyMap[mk] = 0
        monthlyMap[mk] += Number(iss.quantity) || 0
      }
      const months = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b))
      const currentMk = now.toISOString().slice(0, 7)
      const priorMonths = months.filter(([mk]) => mk < currentMk).slice(-3)
      const rollingAvgMonthly = priorMonths.length
        ? priorMonths.reduce((s, [, v]) => s + v, 0) / priorMonths.length
        : null
      const currentMonthTotal = monthlyMap[currentMk] || 0

      for (const iss of sorted) {
        const issDate = new Date(iss.created_at || iss.date)
        const qty = Number(iss.quantity) || 0
        const driver = iss.driver_operator || iss.authorized_by || '—'

        // Rule 1: Overfill
        if (tankCapacity > 0 && qty > tankCapacity * 1.05) {
          anomalies.push({
            date: iss.date, assetName, qty, driver,
            rule: 'Overfill', severity: 'Critical', issId: iss.id,
          })
        }

        // Rule 3: Duplicate fill-up (same asset fuelled twice within 4 hours)
        const prevForAsset = sorted.filter(i => i.id !== iss.id && new Date(i.created_at || i.date) < issDate)
        if (prevForAsset.length) {
          const lastFill = prevForAsset[prevForAsset.length - 1]
          const lastTime = new Date(lastFill.created_at || lastFill.date)
          const diffHrs = (issDate - lastTime) / (1000 * 60 * 60)
          if (diffHrs >= 0 && diffHrs < 4) {
            anomalies.push({
              date: iss.date, assetName, qty, driver,
              rule: 'Duplicate Fill-up', severity: 'Critical', issId: iss.id + '-dup',
            })
          }
        }

        // Rule 4: After-hours (22:00 – 05:00)
        const issHour = issDate.getHours()
        if (issHour >= 22 || issHour < 5) {
          anomalies.push({
            date: iss.date, assetName, qty, driver,
            rule: 'After-Hours', severity: 'Warning', issId: iss.id + '-ah',
          })
        }

        // Rule 5: No trip linked on that day
        const issDateStr = String(iss.date || '').slice(0, 10)
        const tripsOnDay = econTrips.filter(t =>
          (t.asset_id === assetKey || t.vehicle_id === assetKey) &&
          String(t.date).slice(0, 10) === issDateStr
        )
        if (tripsOnDay.length === 0 && issDate >= thisMonthStart) {
          anomalies.push({
            date: iss.date, assetName, qty, driver,
            rule: 'No Trip Linked', severity: 'Warning', issId: iss.id + '-nt',
          })
        }
      }

      // Rule 2: High Consumption this month vs rolling avg
      if (rollingAvgMonthly != null && rollingAvgMonthly > 0 && currentMonthTotal > rollingAvgMonthly * 1.25) {
        anomalies.push({
          date: currentMk + '-01', assetName, qty: currentMonthTotal, driver: '—',
          rule: 'High Consumption', severity: 'Warning', issId: assetKey + '-hc',
        })
      }
    }

    return anomalies.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'Critical' ? -1 : 1
      return String(b.date).localeCompare(String(a.date))
    })
  }, [econIssuances, econTrips, econAssets])

  // ── Anomaly summary stats ──────────────────────────────────────────────────
  const anomalySummary = useMemo(() => {
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const thisMonth = anomalyRows.filter(a => new Date(a.date) >= thisMonthStart)
    const suspiciousL = thisMonth.reduce((s, a) => s + (a.qty || 0), 0)
    // Estimate unit cost from recent issuances
    const avgUnitCost = econIssuances.length
      ? econIssuances.filter(i => (Number(i.unit_cost) || 0) > 0)
          .reduce((s, i, _, arr) => s + Number(i.unit_cost) / arr.length, 0)
      : 0
    const valueAtRisk = suspiciousL * (avgUnitCost || 1.5)
    return { count: thisMonth.length, suspiciousL, valueAtRisk }
  }, [anomalyRows, econIssuances])

  // Anomaly filtered list
  const filteredAnomalies = useMemo(() => {
    let list = anomalyRows
    if (anomalyFilter !== 'all') list = list.filter(a => a.severity === anomalyFilter)
    if (anomalyAsset.trim()) list = list.filter(a => a.assetName.toLowerCase().includes(anomalyAsset.toLowerCase()))
    return list
  }, [anomalyRows, anomalyFilter, anomalyAsset])

  // ── status badge ───────────────────────────────────────────────────────────
  function StatusBadge({ status }) {
    if (status === 'normal') return <span className="badge badge-green" style={{ fontSize: 11 }}>Normal</span>
    if (status === 'high')   return <span className="badge badge-yellow" style={{ fontSize: 11 }}>High</span>
    return <span className="badge" style={{ fontSize: 11, background: 'var(--surface2)', color: 'var(--text-dim)' }}>No km data</span>
  }

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading && activeTab === 'analytics') return <div style={{ padding: 40 }}><Spinner /></div>

  return (
    <div>
      {/* Header */}
      <PageHeader title="Vehicle Consumption Analytics" subtitle="Per-vehicle fuel efficiency, benchmarking and abnormal usage detection">
        {activeTab === 'analytics' && (
          <>
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <span className="material-icons">download</span> CSV
            </button>
            <button className="btn btn-secondary" onClick={handleExportXLSX}>
              <span className="material-icons">table_chart</span> Excel
            </button>
          </>
        )}
        {activeTab === 'benchmarks' && (
          <button className="btn btn-primary" onClick={() => openNewBench('')}>
            <span className="material-icons">add</span> Add Benchmark
          </button>
        )}
        {activeTab === 'ranking' && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Ranked by deviation from benchmark — best first</span>
        )}
        {activeTab === 'economy' && (
          <button className="btn btn-secondary" onClick={fetchEconomyData} disabled={econLoading}>
            <span className="material-icons">refresh</span> Refresh
          </button>
        )}
        {activeTab === 'anomalies' && (
          <button className="btn btn-secondary" onClick={fetchEconomyData} disabled={econLoading}>
            <span className="material-icons">refresh</span> Refresh
          </button>
        )}
      </PageHeader>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'analytics',  label: 'Consumption Analytics', icon: 'speed'        },
          { id: 'benchmarks', label: 'Benchmarks',            icon: 'flag'         },
          { id: 'ranking',    label: 'Efficiency Ranking',    icon: 'emoji_events' },
          { id: 'economy',    label: 'Economy Analytics',     icon: 'eco'          },
          { id: 'anomalies',  label: 'Anomalies',             icon: 'report_problem'},
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--gold)' : 'var(--text-dim)',
              borderBottom: activeTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'benchmarks' && (
        <div>
          {bLoading ? <div style={{ padding: 40 }}><Spinner /></div> : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {benchmarks.length === 0 ? (
                <div style={{ padding: 32 }}>
                  <EmptyState icon="flag" message="No benchmarks set. Click 'Add Benchmark' to define target consumption for a vehicle." />
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Vehicle', 'Target L/100km', 'Target L/hr', 'Actual Avg L/100km', 'vs Target', 'Type', 'Notes', ''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: h === 'vs Target' || h === 'Actual Avg L/100km' || h === 'Target L/100km' || h === 'Target L/hr' ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarks.map(b => {
                        const vData = vehicleData.find(v => v.vehicle === b.vehicle)
                        const actual = vData?.avgL100
                        const target = parseFloat(b.target_l_per_100km)
                        const diff   = actual != null && target > 0 ? actual - target : null
                        const diffColor = diff == null ? 'var(--text-dim)' : diff > target * 0.2 ? 'var(--red)' : diff > 0 ? 'var(--yellow)' : 'var(--green)'
                        return (
                          <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{b.vehicle}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {b.target_l_per_100km != null ? fmtNum(b.target_l_per_100km) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {b.target_l_per_hr != null ? fmtNum(b.target_l_per_hr) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {actual != null ? fmtNum(actual) : <span style={{ color: 'var(--text-dim)' }}>No data</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: diffColor }}>
                              {diff != null ? (diff > 0 ? '+' : '') + fmtNum(diff) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12 }}>
                              <span className="badge badge-yellow" style={{ fontSize: 10 }}>{b.measurement_type === 'hr' ? 'L/hr' : 'L/100km'}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>{b.notes || '—'}</td>
                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', marginRight: 4 }} onClick={() => openEditBench(b)}>Edit</button>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--red)' }} onClick={() => handleDeleteBench(b.id)}>Del</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Benchmark modal */}
          {showBenchModal && (
            <div className="overlay" onClick={() => setShowBenchModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">{editBenchId ? 'Edit' : 'Add'} <span>Benchmark</span></div>
                <div className="form-group">
                  <label>Vehicle / Equipment *</label>
                  <input className="form-control" list="vehicle-list" value={benchForm.vehicle}
                    onChange={e => setBenchForm(f => ({ ...f, vehicle: e.target.value }))} />
                  <datalist id="vehicle-list">
                    {vehicleData.map(v => <option key={v.vehicle} value={v.vehicle} />)}
                  </datalist>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Target L/100km</label>
                    <input className="form-control" type="number" min="0" step="0.1"
                      value={benchForm.target_l_per_100km}
                      onChange={e => setBenchForm(f => ({ ...f, target_l_per_100km: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Target L/hr (equipment)</label>
                    <input className="form-control" type="number" min="0" step="0.1"
                      value={benchForm.target_l_per_hr}
                      onChange={e => setBenchForm(f => ({ ...f, target_l_per_hr: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Measurement</label>
                  <select className="form-control" value={benchForm.measurement_type}
                    onChange={e => setBenchForm(f => ({ ...f, measurement_type: e.target.value }))}>
                    <option value="km">km (vehicles)</option>
                    <option value="hr">hours (equipment)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input className="form-control" value={benchForm.notes}
                    onChange={e => setBenchForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowBenchModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveBench} disabled={benchSaving}>
                    {benchSaving ? 'Saving…' : 'Save Benchmark'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <>

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

        </> // end analytics tab
      )}

      {/* ── Economy Analytics Tab ─────────────────────────────────── */}
      {activeTab === 'economy' && (
        <div>
          {econLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading economy data…</div>
          ) : (
            <>
              {/* Per-Asset Fuel Economy Table */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Per-Asset Fuel Economy</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Last 6 months · click column header to sort</span>
                </div>
                {econRows.length === 0 ? (
                  <div style={{ padding: 32 }}>
                    <EmptyState icon="eco" message="No issuance data found for the last 6 months. Issue fuel to assets to see economy metrics." />
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {[
                            { col: 'assetName',   label: 'Asset',         align: 'left'  },
                            { col: 'totalLitres', label: 'Litres Issued', align: 'right' },
                            { col: 'totalKm',     label: 'KM Driven',     align: 'right' },
                            { col: 'l100km',      label: 'L/100km',       align: 'right' },
                            { col: 'kmPerL',      label: 'km/L',          align: 'right' },
                            { col: 'lPerHr',      label: 'L/hr',          align: 'right' },
                            { col: 'assetBench',  label: 'Benchmark',     align: 'right' },
                            { col: 'effPct',      label: 'Efficiency',    align: 'center'},
                          ].map(({ col, label, align }) => (
                            <th key={col}
                              onClick={() => {
                                if (econSortCol === col) setEconSortDir(d => d === 'asc' ? 'desc' : 'asc')
                                else { setEconSortCol(col); setEconSortDir('desc') }
                              }}
                              style={{ padding: '10px 14px', textAlign: align, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: econSortCol === col ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                              {label}{econSortCol === col ? (econSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {econRows.map(row => (
                          <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{row.assetName}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {fmtNum(row.totalLitres)} L
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {row.totalKm > 0 ? `${row.totalKm.toLocaleString()} km` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: row.effColor, fontWeight: row.l100km != null ? 600 : 400 }}>
                              {row.l100km != null ? fmtNum(row.l100km) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {row.kmPerL != null ? fmtNum(row.kmPerL) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                              {row.lPerHr != null ? fmtNum(row.lPerHr) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)' }}>
                              {row.assetBench != null ? `${row.assetBench} L/100km` : <span>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {row.effPct == null ? (
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No benchmark</span>
                              ) : (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                  background: `${row.effColor}18`, color: row.effColor, border: `1px solid ${row.effColor}44`,
                                }}>
                                  {row.effPct >= 0 ? '+' : ''}{row.effPct.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Fleet-Wide Monthly Trend */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Fleet-Wide Monthly Fuel Trend</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-dim)' }}>Last 6 months</span>
                </div>
                {fleetMonthlyTrend.length === 0 ? (
                  <div style={{ padding: 32 }}>
                    <EmptyState icon="trending_up" message="No monthly data available yet." />
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Month', 'Litres Issued', 'Total Cost', 'vs Prior Month'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Month' ? 'left' : 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fleetMonthlyTrend.map(t => {
                          const changeColor = t.changeL == null ? 'var(--text-dim)' : t.changeL > 0 ? 'var(--red)' : 'var(--green)'
                          return (
                            <tr key={t.month} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.month}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmtNum(t.litres)} L</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--teal)' }}>
                                {t.cost > 0 ? `$${fmtNum(t.cost)}` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: t.changeL != null ? 600 : 400, color: changeColor }}>
                                {t.changeL != null
                                  ? <>{t.changeL > 0 ? '↑ +' : '↓ '}{Math.abs(t.changeL).toFixed(1)}%</>
                                  : '—'
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Anomalies Tab ──────────────────────────────────────────── */}
      {activeTab === 'anomalies' && (
        <div>
          {econLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Analyzing issuance data…</div>
          ) : (
            <>
              {/* KPI row */}
              <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <KPICard
                  label="Total Anomalies This Month"
                  value={anomalySummary.count}
                  icon="report_problem"
                  color={anomalySummary.count > 0 ? 'red' : 'green'}
                />
                <KPICard
                  label="Suspicious Litres"
                  value={`${fmtNum(anomalySummary.suspiciousL)} L`}
                  icon="water_drop"
                  color={anomalySummary.suspiciousL > 0 ? 'yellow' : ''}
                />
                <KPICard
                  label="Estimated Value at Risk"
                  value={`$${fmtNum(anomalySummary.valueAtRisk)}`}
                  icon="attach_money"
                  color={anomalySummary.valueAtRisk > 0 ? 'red' : ''}
                />
              </div>

              {/* Filters */}
              <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>Severity</label>
                <select className="form-control" style={{ width: 160 }} value={anomalyFilter} onChange={e => setAnomalyFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="Critical">Critical only</option>
                  <option value="Warning">Warning only</option>
                </select>
                <input className="form-control" placeholder="Filter by asset…" style={{ width: 200 }} value={anomalyAsset}
                  onChange={e => setAnomalyAsset(e.target.value)} />
                {anomalyAsset && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setAnomalyAsset('')}>Clear</button>}
              </div>

              {/* Anomaly table */}
              {filteredAnomalies.length === 0 ? (
                <div className="card" style={{ padding: 32 }}>
                  <EmptyState icon="check_circle" message={anomalyRows.length === 0 ? "No anomalies detected. All issuance records look clean." : "No anomalies match the current filters."} />
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Anomaly Detections</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filteredAnomalies.length} record{filteredAnomalies.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Asset', 'Litres', 'Driver / Attendant', 'Rule Triggered', 'Severity'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Litres' ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAnomalies.map((a, i) => {
                          const isCrit = a.severity === 'Critical'
                          const sevColor = isCrit ? 'var(--red)' : 'var(--yellow)'
                          return (
                            <tr key={a.issId || i} style={{ borderBottom: '1px solid var(--border)', background: isCrit ? 'rgba(248,113,113,.04)' : 'transparent' }}>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmtDate(a.date)}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 600 }}>{a.assetName}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>{fmtNum(a.qty)} L</td>
                              <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-dim)' }}>{a.driver}</td>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="material-icons" style={{ fontSize: 14, color: sevColor }}>
                                    {isCrit ? 'error' : 'warning'}
                                  </span>
                                  <span style={{ fontSize: 13 }}>{a.rule}</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 10,
                                  background: `${sevColor}18`, color: sevColor, border: `1px solid ${sevColor}44`,
                                }}>
                                  {a.severity}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'ranking' && (
        <div>
          {rankData.length === 0 ? (
            <EmptyState icon="emoji_events" message="No vehicle consumption data with odometer readings for ranking" />
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Rank', 'Vehicle', 'Actual L/100km', 'Benchmark', 'Deviation', 'Rating', 'Fills', 'Abnormal'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Rank' || h === 'Rating' || h === 'Fills' || h === 'Abnormal' ? 'center' : h === 'Actual L/100km' || h === 'Benchmark' || h === 'Deviation' ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rankData.map((v, i) => (
                      <tr key={v.vehicle} style={{ borderBottom: '1px solid var(--border)', background: i === 0 && v.deviation != null && v.deviation <= 0 ? 'color-mix(in srgb,var(--green) 5%,transparent)' : 'transparent' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {i < 3 ? (
                            <span style={{ fontSize: 16 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{i + 1}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {v.vehicle}
                          {v.abnormalCount > 0 && <span className="badge badge-red" style={{ fontSize: 10, marginLeft: 6 }}>{v.abnormalCount} ⚠</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: v.effColor, fontWeight: 600 }}>
                          {fmtNum(v.avgL100)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)' }}>
                          {v.benchL100 != null ? fmtNum(v.benchL100) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: v.effColor }}>
                          {v.deviation != null
                            ? `${v.deviation > 0 ? '+' : ''}${v.deviation.toFixed(1)}%`
                            : <span style={{ color: 'var(--text-dim)' }}>no benchmark</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {v.deviation == null ? (
                            <span className="badge" style={{ fontSize: 10, background: 'var(--surface2)', color: 'var(--text-dim)' }}>No bench</span>
                          ) : v.deviation <= 10 ? (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>Efficient</span>
                          ) : v.deviation <= 25 ? (
                            <span className="badge badge-yellow" style={{ fontSize: 10 }}>High</span>
                          ) : (
                            <span className="badge badge-red" style={{ fontSize: 10 }}>Excessive</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 13 }}>{v.count}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {v.abnormalCount > 0
                            ? <span style={{ color: 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{v.abnormalCount}</span>
                            : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Monthly trend for top vehicles */}
          {rankData.slice(0, 3).filter(v => v.fills.length >= 2).map(v => {
            const trend = monthlyTrend(v.fills)
            if (trend.length < 2) return null
            const maxL = Math.max(...trend.map(t => t.avgL100 || 0)) || 1
            return (
              <div key={v.vehicle} className="card" style={{ padding: 16, marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: v.effColor }}>
                  {v.vehicle} — Monthly L/100km Trend
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Month', 'Litres', 'Avg L/100km', 'vs Benchmark', 'Trend'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border2)', color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map(t => {
                        const diff = v.benchL100 && t.avgL100 != null ? t.avgL100 - v.benchL100 : null
                        const barW = t.avgL100 != null ? Math.min(100, (t.avgL100 / maxL) * 100) : 0
                        const barColor = diff == null ? 'var(--teal)' : diff <= 0 ? 'var(--green)' : diff <= v.benchL100 * 0.25 ? 'var(--yellow)' : 'var(--red)'
                        return (
                          <tr key={t.month} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)' }}>{t.month}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)' }}>{fmtNum(t.litres)} L</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', color: barColor, fontWeight: 600 }}>
                              {t.avgL100 != null ? fmtNum(t.avgL100) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', color: diff == null ? 'var(--text-dim)' : diff > 0 ? 'var(--red)' : 'var(--green)', fontWeight: diff != null ? 600 : 400 }}>
                              {diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ width: 80, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${barW}%`, background: barColor, borderRadius: 4 }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
