import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../utils/txnCode'

const FuelContext = createContext(null)

// Default dipstick calibration — 2m rod, 10103L tank (kept for single-tank backward compat)
const DEFAULT_CALIBRATION = [
  [0.00,0],[0.01,6],[0.02,17],[0.03,31],[0.04,48],[0.05,67],[0.06,88],[0.07,111],[0.08,136],[0.09,162],
  [0.10,189],[0.11,218],[0.12,247],[0.13,279],[0.14,311],[0.15,344],[0.16,379],[0.17,414],[0.18,450],[0.19,488],
  [0.20,526],[0.21,565],[0.22,605],[0.23,645],[0.24,687],[0.25,729],[0.26,772],[0.27,815],[0.28,860],[0.29,905],
  [0.30,950],[0.31,997],[0.32,1043],[0.33,1091],[0.34,1139],[0.35,1188],[0.36,1237],[0.37,1286],[0.38,1337],[0.39,1387],
  [0.40,1439],[0.41,1490],[0.42,1542],[0.43,1595],[0.44,1648],[0.45,1702],[0.46,1755],[0.47,1810],[0.48,1865],[0.49,1920],
  [0.50,1975],[0.51,2031],[0.52,2087],[0.53,2144],[0.54,2201],[0.55,2258],[0.56,2316],[0.57,2374],[0.58,2432],[0.59,2490],
  [0.60,2549],[0.61,2608],[0.62,2668],[0.63,2727],[0.64,2787],[0.65,2847],[0.66,2908],[0.67,2968],[0.68,3029],[0.69,3090],
  [0.70,3151],[0.71,3213],[0.72,3275],[0.73,3336],[0.74,3398],[0.75,3461],[0.76,3523],[0.77,3585],[0.78,3648],[0.79,3711],
  [0.80,3774],[0.81,3837],[0.82,3900],[0.83,3964],[0.84,4027],[0.85,4091],[0.86,4154],[0.87,4218],[0.88,4282],[0.89,4346],
  [0.90,4410],[0.91,4474],[0.92,4538],[0.93,4602],[0.94,4666],[0.95,4730],[0.96,4794],[0.97,4859],[0.98,4923],[0.99,4987],
  [1.00,5052],[1.01,5116],[1.02,5180],[1.03,5245],[1.04,5309],[1.05,5373],[1.06,5437],[1.07,5502],[1.08,5566],[1.09,5630],
  [1.10,5694],[1.11,5758],[1.12,5822],[1.13,5885],[1.14,5949],[1.15,6013],[1.16,6076],[1.17,6140],[1.18,6203],[1.19,6266],
  [1.20,6329],[1.21,6392],[1.22,6455],[1.23,6518],[1.24,6580],[1.25,6643],[1.26,6705],[1.27,6767],[1.28,6829],[1.29,6890],
  [1.30,6952],[1.31,7013],[1.32,7074],[1.33,7135],[1.34,7196],[1.35,7256],[1.36,7316],[1.37,7376],[1.38,7436],[1.39,7495],
  [1.40,7554],[1.41,7613],[1.42,7671],[1.43,7730],[1.44,7788],[1.45,7845],[1.46,7902],[1.47,7959],[1.48,8016],[1.49,8072],
  [1.50,8128],[1.51,8184],[1.52,8239],[1.53,8294],[1.54,8348],[1.55,8402],[1.56,8455],[1.57,8508],[1.58,8561],[1.59,8613],
  [1.60,8665],[1.61,8716],[1.62,8767],[1.63,8817],[1.64,8867],[1.65,8916],[1.66,8964],[1.67,9012],[1.68,9060],[1.69,9107],
  [1.70,9153],[1.71,9199],[1.72,9244],[1.73,9288],[1.74,9332],[1.75,9374],[1.76,9417],[1.77,9458],[1.78,9499],[1.79,9539],
  [1.80,9578],[1.81,9616],[1.82,9653],[1.83,9689],[1.84,9725],[1.85,9759],[1.86,9792],[1.87,9825],[1.88,9856],[1.89,9886],
  [1.90,9914],[1.91,9942],[1.92,9968],[1.93,9992],[1.94,10015],[1.95,10036],[1.96,10055],[1.97,10072],[1.98,10086],[1.99,10097],[2.00,10103],
]
const DEFAULT_TANK_CAPACITY = 10103

const newId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
const safe = (res) => (res.error ? [] : res.data || [])

// Normalize fuel_issuance row to fuel_log-compatible shape for backward compat
function normalizeIssuance(row) {
  return {
    ...row,
    // Map fuel_issuance columns → fuel_log column names
    amount:   row.amount   ?? row.quantity ?? 0,
    vehicle:  row.vehicle  || row.equipment_name || '',
    driver:   row.driver   || row.driver_operator || '',
    odometer: row.odometer != null ? String(row.odometer)
             : row.odometer_reading != null ? String(row.odometer_reading)
             : '',
    date: typeof row.date === 'string' ? row.date.slice(0, 10) : row.date,
    _source: 'fuel_issuance',
  }
}

export function FuelProvider({ children }) {
  const [tanks,        setTanks]        = useState([])
  const [issuances,    setIssuances]    = useState([])
  const [deliveries,   setDeliveries]   = useState([])
  const [dipstickLog,  setDipstickLog]  = useState([])
  const [fuelRequests, setFuelRequests] = useState([])
  const [calibrations, setCalibrations] = useState({}) // { tankId: [[cm,litres],...] }
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tanksRes, issuanceRes, delRes, dipRes, reqRes, calRes] = await Promise.all([
        supabase.from('fuel_tanks').select('*').order('name'),
        supabase.from('fuel_issuance').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('fuel_deliveries').select('*').order('date', { ascending: false }),
        supabase.from('dipstick_log').select('*').order('date', { ascending: false }),
        supabase.from('fuel_requests').select('*').order('request_date', { ascending: false }).limit(200),
        supabase.from('fuel_calibration').select('*'),
      ])

      setTanks(safe(tanksRes))
      setIssuances(safe(issuanceRes).map(normalizeIssuance))
      setDeliveries(safe(delRes))
      setDipstickLog(safe(dipRes))
      setFuelRequests(safe(reqRes))

      // Build per-tank calibration map
      const calData = safe(calRes)
      const calMap = {}
      calData.forEach(row => {
        if (!calMap[row.tank_id]) calMap[row.tank_id] = []
        calMap[row.tank_id].push([parseFloat(row.cm), parseFloat(row.litres)])
      })
      Object.keys(calMap).forEach(tid => calMap[tid].sort((a, b) => a[0] - b[0]))
      setCalibrations(calMap)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fuel data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // TANK_MAX_LITRES: from primary tank or hardcoded fallback (backward compat)
  const TANK_MAX_LITRES = tanks[0]?.capacity || DEFAULT_TANK_CAPACITY

  const getTankById = (tankId) => tanks.find(t => t.id === tankId) || tanks[0] || null

  const getCalibrationTable = (tankId) => {
    if (tankId && calibrations[tankId]?.length) return calibrations[tankId]
    return DEFAULT_CALIBRATION
  }

  const getLitresFromCm = (cm, tankId) => {
    if (cm === null || cm === undefined || isNaN(cm)) return 0
    if (cm <= 0) return 0
    const table = getCalibrationTable(tankId)
    const maxEntry = table[table.length - 1]
    if (cm >= maxEntry[0]) return maxEntry[1]
    for (let i = 0; i < table.length - 1; i++) {
      const [d0, l0] = table[i]
      const [d1, l1] = table[i + 1]
      if (cm >= d0 && cm <= d1) {
        const frac = (cm - d0) / (d1 - d0)
        return Math.round(l0 + frac * (l1 - l0))
      }
    }
    return 0
  }

  const getCurrentTankLevel = (tankId) => {
    // Try dipstick_log first (most accurate — actual physical measurement)
    const relevant = tankId
      ? dipstickLog.filter(d => d.tank_id === tankId)
      : dipstickLog
    if (relevant.length) {
      const latest = [...relevant].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      if (latest.fuel_end != null) return latest.fuel_end
    }
    // Fall back to tank.current_level from fuel_tanks table
    const tank = getTankById(tankId)
    return tank?.current_level || 0
  }

  const getTankPercentage = (tankId) => {
    const tank = getTankById(tankId)
    const capacity = tank?.capacity || TANK_MAX_LITRES
    return capacity > 0 ? (getCurrentTankLevel(tankId) / capacity) * 100 : 0
  }

  // ── Analytics ──────────────────────────────────────────────────────

  const getIssuanceByDay = (tankId) => {
    const items = tankId ? issuances.filter(i => i.tank_id === tankId) : issuances
    const map = new Map()
    items.forEach(i => {
      const date = typeof i.date === 'string' ? i.date.slice(0, 10) : String(i.date)
      map.set(date, (map.get(date) || 0) + (Number(i.amount) || 0))
    })
    const sortedDates = Array.from(map.keys()).sort()
    return { labels: sortedDates, data: sortedDates.map(d => map.get(d)) }
  }

  const getIssuanceByVehicle = (tankId) => {
    const items = tankId ? issuances.filter(i => i.tank_id === tankId) : issuances
    const map = new Map()
    items.forEach(i => {
      const v = i.vehicle || i.equipment_name || 'Unknown'
      map.set(v, (map.get(v) || 0) + (Number(i.amount) || 0))
    })
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
    return { labels: sorted.map(v => v[0]), data: sorted.map(v => v[1]) }
  }

  const getTankLevelTrend = (tankId) => {
    const items = tankId ? dipstickLog.filter(d => d.tank_id === tankId) : dipstickLog
    const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date))
    return { labels: sorted.map(d => d.date), data: sorted.map(d => d.fuel_end || 0) }
  }

  const predictDaysUntilEmpty = (tankId) => {
    const relevant = tankId ? dipstickLog.filter(d => d.tank_id === tankId) : dipstickLog
    const sorted = [...relevant].sort((a, b) => new Date(a.date) - new Date(b.date))
    if (sorted.length < 2) return null
    const recent = sorted.slice(-14)
    const x = recent.map((_, idx) => idx)
    const y = recent.map(d => d.fuel_end || 0)
    const n = x.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] * x[i] }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    if (slope >= 0) return null
    const daysToEmpty = -intercept / slope
    if (daysToEmpty < 0) return null
    const lastDate = new Date(recent[recent.length - 1].date)
    const emptyDate = new Date(lastDate)
    emptyDate.setDate(lastDate.getDate() + Math.ceil(daysToEmpty))
    return emptyDate.toISOString().split('T')[0]
  }

  // ── CRUD ───────────────────────────────────────────────────────────

  const addIssuance = async (issuance) => {
    const id = newId()
    const tank = issuance.tank_id
      ? tanks.find(t => t.id === issuance.tank_id)
      : tanks[0] || null

    // Write to fuel_issuance (primary going forward)
    const qty = parseFloat(issuance.amount) || 0
    const { error } = await supabase.from('fuel_issuance').insert([{
      id,
      tank_id:          tank?.id || null,
      date:             issuance.date,
      time:             issuance.time || null,
      fuel_type:        issuance.fuel_type || 'DIESEL',
      quantity:         qty,
      amount:           qty,
      equipment_type:   issuance.equipment_type || 'vehicle',
      equipment_id:     issuance.asset_id || null,
      equipment_name:   issuance.vehicle || '',
      driver_operator:  issuance.driver || '',
      odometer_reading: issuance.odometer ? parseFloat(issuance.odometer) : null,
      authorized_by:    issuance.authorized_by || '',
      purpose:          issuance.purpose || '',
      notes:            issuance.notes || null,
      created_by:       issuance.user_name || '',
      txn_code:         issuance.txn_code || null,
      unit_cost:        parseFloat(issuance.unit_cost) || 0,
      total_cost:       parseFloat(issuance.total_cost) || (qty * (parseFloat(issuance.unit_cost) || 0)),
      project_id:       issuance.project_id || null,
      cost_center:      issuance.cost_center || null,
      approval_status:  'approved',
    }])
    if (error) throw error

    // Bridge-write to fuel_log so existing direct-query pages continue to work
    await supabase.from('fuel_log').insert([{
      id:            newId(),
      date:          issuance.date,
      time:          issuance.time || null,
      fuel_type:     issuance.fuel_type || 'DIESEL',
      amount:        qty,
      vehicle:       issuance.vehicle || '',
      driver:        issuance.driver || '',
      authorized_by: issuance.authorized_by || '',
      purpose:       issuance.purpose || '',
      odometer:      issuance.odometer ? String(issuance.odometer) : null,
      flowmeter:     parseFloat(issuance.flowmeter) || 0,
      user_name:     issuance.user_name || '',
      txn_code:      issuance.txn_code || null,
      created_at:    new Date().toISOString(),
    }])

    auditLog({ module: 'fuel', action: 'LOG', entityType: 'fuel_issuance', entityId: id, entityName: issuance.vehicle || '' })
    await fetchAll()
  }

  const addDelivery = async (delivery) => {
    const id = newId()
    const { error } = await supabase.from('fuel_deliveries').insert([{ id, ...delivery, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fuel', action: 'LOG', entityType: 'fuel_delivery', entityId: id, entityName: delivery.supplier || delivery.delivered_by || '' })
    await fetchAll()
  }

  const addDipstick = async (record) => {
    const id = newId()
    const { error } = await supabase.from('dipstick_log').insert([{ id, ...record, created_at: new Date().toISOString() }])
    if (error) throw error
    // Update fuel_tanks.current_level so tank card shows live data
    if (record.tank_id && record.fuel_end != null) {
      await supabase.from('fuel_tanks').update({ current_level: record.fuel_end, updated_at: new Date().toISOString() }).eq('id', record.tank_id)
    }
    auditLog({ module: 'fuel', action: 'LOG', entityType: 'dipstick', entityId: id, entityName: record.date || '' })
    await fetchAll()
  }

  const updateDipstick = async (id, record) => {
    const before = dipstickLog.find(d => d.id === id)
    const { error } = await supabase.from('dipstick_log').update(record).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fuel', action: 'UPDATE', entityType: 'dipstick', entityId: id, entityName: before?.date || '', oldValues: before, newValues: { ...before, ...record } })
    await fetchAll()
  }

  const deleteDipstick = async (id) => {
    const { error } = await supabase.from('dipstick_log').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fuel', action: 'DELETE', entityType: 'dipstick', entityId: id })
    await fetchAll()
  }

  // ── Fuel Requests ──────────────────────────────────────────────────

  const addFuelRequest = async (req) => {
    const id = newId()
    let request_no
    try { request_no = await generateTxnCode('FLR') } catch { request_no = `FLR-${Date.now()}` }
    const { error } = await supabase.from('fuel_requests').insert([{
      id, request_no, ...req,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fuel', action: 'CREATE', entityType: 'fuel_request', entityId: id, entityName: request_no })
    await fetchAll()
    return request_no
  }

  const updateFuelRequest = async (id, updates) => {
    const { error } = await supabase.from('fuel_requests').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const approveFuelRequest = async (id, approvedBy) => {
    const { error } = await supabase.from('fuel_requests').update({
      status: 'approved', approved_by: approvedBy,
      approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fuel', action: 'APPROVE', entityType: 'fuel_request', entityId: id })
    await fetchAll()
  }

  const rejectFuelRequest = async (id, reason, rejectedBy) => {
    const { error } = await supabase.from('fuel_requests').update({
      status: 'rejected', rejection_reason: reason,
      approved_by: rejectedBy, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  return (
    <FuelContext.Provider value={{
      // State
      tanks, issuances, deliveries, dipstickLog, fuelRequests, calibrations, loading,
      // Backward-compat constant
      TANK_MAX_LITRES,
      // Tank helpers
      getTankById,
      getLitresFromCm,
      getCurrentTankLevel,
      getTankPercentage,
      // Analytics
      getIssuanceByDay,
      getIssuanceByVehicle,
      getTankLevelTrend,
      predictDaysUntilEmpty,
      // Issuance CRUD
      addIssuance, addDelivery,
      addDipstick, updateDipstick, deleteDipstick,
      // Fuel requests
      addFuelRequest, updateFuelRequest, approveFuelRequest, rejectFuelRequest,
      fetchAll,
    }}>
      {children}
    </FuelContext.Provider>
  )
}

export function useFuel() {
  const ctx = useContext(FuelContext)
  if (!ctx) throw new Error('useFuel must be used inside FuelProvider')
  return ctx
}
