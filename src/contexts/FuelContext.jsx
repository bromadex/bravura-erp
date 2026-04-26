import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const FuelContext = createContext(null)

export function FuelProvider({ children }) {
  const [tanks, setTanks] = useState([])
  const [calibration, setCalibration] = useState([])
  const [dipstickLog, setDipstickLog] = useState([])
  const [issuances, setIssuances] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, cRes, dRes, iRes, delRes] = await Promise.all([
        supabase.from('fuel_tanks').select('*').order('name'),
        supabase.from('fuel_calibration').select('*').order('cm'),
        supabase.from('dipstick_log').select('*').order('date', { ascending: false }),
        supabase.from('fuel_issuance').select('*').order('date', { ascending: false }),
        supabase.from('fuel_deliveries').select('*').order('date', { ascending: false }),
      ])
      if (tRes.data) setTanks(tRes.data)
      if (cRes.data) setCalibration(cRes.data)
      if (dRes.data) setDipstickLog(dRes.data)
      if (iRes.data) setIssuances(iRes.data)
      if (delRes.data) setDeliveries(delRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fuel data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ––––– Tanks CRUD –––––
  const addTank = async (tank) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_tanks').insert([{ id, ...tank, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }

  const updateTank = async (id, updates) => {
    const { error } = await supabase.from('fuel_tanks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteTank = async (id) => {
    const { error } = await supabase.from('fuel_tanks').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ––––– Calibration –––––
  const addCalibrationPoint = async (tankId, cm, litres) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_calibration').insert([{ id, tank_id: tankId, cm, litres }])
    if (error) throw error
    await fetchAll()
  }

  const getLitresFromCm = (tankId, cm) => {
    const points = calibration.filter(c => c.tank_id === tankId).sort((a,b) => a.cm - b.cm)
    if (!points.length) return 0
    // find interpolation
    let lower = null, upper = null
    for (let p of points) {
      if (p.cm <= cm) lower = p
      if (p.cm >= cm && upper === null) upper = p
    }
    if (!lower) lower = points[0]
    if (!upper) upper = points[points.length-1]
    if (lower.cm === upper.cm) return lower.litres
    const frac = (cm - lower.cm) / (upper.cm - lower.cm)
    return lower.litres + frac * (upper.litres - lower.litres)
  }

  // ––––– Dipstick –––––
  const addDipstick = async (record) => {
    const id = generateId()
    const { error } = await supabase.from('dipstick_log').insert([{ id, ...record, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  // ––––– Fuel Issuance –––––
  const addIssuance = async (issuance) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_issuance').insert([{ id, ...issuance, created_at: new Date().toISOString() }])
    if (error) throw error
    // Optionally update tank current level (if you want automatic deduction)
    const tank = tanks.find(t => t.id === issuance.tank_id)
    if (tank) {
      const newLevel = tank.current_level - issuance.quantity
      await supabase.from('fuel_tanks').update({ current_level: newLevel }).eq('id', issuance.tank_id)
    }
    await fetchAll()
  }

  // ––––– Fuel Delivery –––––
  const addDelivery = async (delivery) => {
    const id = generateId()
    const { error } = await supabase.from('fuel_deliveries').insert([{ id, ...delivery, created_at: new Date().toISOString() }])
    if (error) throw error
    // Update tank current level
    const tank = tanks.find(t => t.id === delivery.tank_id)
    if (tank) {
      const newLevel = (tank.current_level || 0) + delivery.quantity
      await supabase.from('fuel_tanks').update({ current_level: newLevel }).eq('id', delivery.tank_id)
    }
    await fetchAll()
  }

  // ––––– Reports –––––
  const getFuelEfficiency = (startDate, endDate) => {
    // Simple: for each vehicle, total fuel / total distance (if odometer readings exist)
    const filtered = issuances.filter(i => i.date >= startDate && i.date <= endDate && i.equipment_type === 'vehicle' && i.odometer_reading)
    const efficiency = {}
    for (const i of filtered) {
      if (!efficiency[i.equipment_id]) {
        efficiency[i.equipment_id] = { name: i.equipment_name, totalFuel: 0, lastOdometer: null, firstOdometer: null }
      }
      const entry = efficiency[i.equipment_id]
      entry.totalFuel += i.quantity
      if (i.odometer_reading) {
        if (entry.lastOdometer === null || i.odometer_reading > entry.lastOdometer) entry.lastOdometer = i.odometer_reading
        if (entry.firstOdometer === null || i.odometer_reading < entry.firstOdometer) entry.firstOdometer = i.odometer_reading
      }
    }
    const result = []
    for (const [id, data] of Object.entries(efficiency)) {
      const distance = (data.lastOdometer || 0) - (data.firstOdometer || 0)
      const eff = distance > 0 ? data.totalFuel / distance : 0
      result.push({ ...data, distance, efficiency: eff })
    }
    return result
  }

  return (
    <FuelContext.Provider value={{
      tanks, dipstickLog, issuances, deliveries, calibration, loading,
      addTank, updateTank, deleteTank,
      addCalibrationPoint,
      getLitresFromCm,
      addDipstick,
      addIssuance,
      addDelivery,
      getFuelEfficiency,
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
