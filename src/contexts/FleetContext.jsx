import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const FleetContext = createContext(null)

export function FleetProvider({ children }) {
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [earthMovers, setEarthMovers] = useState([])
  const [genRunLogs, setGenRunLogs] = useState([])
  const [downtimeLogs, setDowntimeLogs] = useState([])
  const [maintenanceLogs, setMaintenanceLogs] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        vRes, gRes, eRes, grRes, dtRes, mtRes, fRes
      ] = await Promise.all([
        supabase.from('fleet').select('*').order('reg'),
        supabase.from('generators').select('*').order('gen_code'),
        supabase.from('earth_movers').select('*').order('reg'),
        supabase.from('gen_run_log').select('*').order('date', { ascending: false }),
        supabase.from('downtime_logs').select('*').order('breakdown_date', { ascending: false }),
        supabase.from('service_maintenance_logs').select('*').order('service_date', { ascending: false }),
        supabase.from('fuel_log').select('*').order('date', { ascending: false }),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthMovers(eRes.data)
      if (grRes.data) setGenRunLogs(grRes.data)
      if (dtRes.data) setDowntimeLogs(dtRes.data)
      if (mtRes.data) setMaintenanceLogs(mtRes.data)
      if (fRes.data) setFuelLogs(fRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fleet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Helper functions
  const getVehicleFuelEfficiency = (reg) => {
    const fuelEntries = fuelLogs.filter(f => f.vehicle === reg)
    if (fuelEntries.length === 0) return null
    const totalFuel = fuelEntries.reduce((s, f) => s + (f.amount || 0), 0)
    const vehicle = vehicles.find(v => v.reg === reg)
    if (!vehicle || !vehicle.odometer_km || totalFuel === 0) return null
    return { kmPerLiter: vehicle.odometer_km / totalFuel, litersPer100km: (totalFuel / vehicle.odometer_km) * 100 }
  }

  const getGeneratorEfficiency = (genId) => {
    const logs = genRunLogs.filter(l => l.gen_id === genId)
    if (logs.length === 0) return null
    const totalFuel = logs.reduce((s, l) => s + (l.fuel_used || 0), 0)
    const totalHours = logs.reduce((s, l) => s + (l.hours || 0), 0)
    if (totalHours === 0) return null
    return totalFuel / totalHours
  }

  const getEquipmentEfficiency = (reg) => {
    const fuelEntries = fuelLogs.filter(f => f.vehicle === reg)
    if (fuelEntries.length === 0) return null
    const totalFuel = fuelEntries.reduce((s, f) => s + (f.amount || 0), 0)
    const equip = earthMovers.find(e => e.reg === reg)
    if (!equip || !equip.hour_meter || totalFuel === 0) return null
    return totalFuel / equip.hour_meter
  }

  const getNextService = (asset) => {
    const lastService = asset.last_service_date ? new Date(asset.last_service_date) : null
    if (!lastService) return null
    if (asset.service_interval_days) {
      const nextDate = new Date(lastService)
      nextDate.setDate(lastService.getDate() + asset.service_interval_days)
      return nextDate.toISOString().split('T')[0]
    }
    if (asset.service_interval_km && asset.odometer_km) {
      const nextOdometer = asset.odometer_km + asset.service_interval_km
      return { type: 'odometer', value: nextOdometer }
    }
    if (asset.service_interval_hours && asset.hour_meter) {
      const nextHours = asset.hour_meter + asset.service_interval_hours
      return { type: 'hours', value: nextHours }
    }
    return null
  }

  const getHealthScore = (asset, type) => {
    let score = 100
    const next = getNextService(asset)
    const isOverdue = next?.type === 'date' ? new Date(next) < new Date() : false
    if (isOverdue) score -= 30
    if (type === 'vehicle') {
      const eff = getVehicleFuelEfficiency(asset.reg)
      if (eff && eff.litersPer100km > 20) score -= 20
      else if (eff && eff.litersPer100km > 15) score -= 10
    } else if (type === 'generator') {
      const eff = getGeneratorEfficiency(asset.id)
      if (eff && eff > 50) score -= 20
      else if (eff && eff > 40) score -= 10
    } else {
      const eff = getEquipmentEfficiency(asset.reg)
      if (eff && eff > 30) score -= 20
      else if (eff && eff > 20) score -= 10
    }
    const downtimeCount = downtimeLogs.filter(d => d.asset_id === asset.id).length
    if (downtimeCount > 2) score -= 20
    else if (downtimeCount > 0) score -= 10
    return Math.max(0, Math.min(100, score))
  }

  const getHealthStatus = (score) => {
    if (score >= 70) return { label: 'Healthy', color: 'var(--green)', icon: 'check_circle' }
    if (score >= 40) return { label: 'Warning', color: 'var(--yellow)', icon: 'warning' }
    return { label: 'Critical', color: 'var(--red)', icon: 'error' }
  }

  const getOverdueAlerts = () => {
    const alerts = []
    vehicles.forEach(v => {
      const next = getNextService(v)
      if (next?.type === 'date' && new Date(next) < new Date()) {
        alerts.push({ asset: v.reg, type: 'vehicle', message: `Service overdue since ${next}` })
      }
    })
    generators.forEach(g => {
      const next = getNextService(g)
      if (next?.type === 'date' && new Date(next) < new Date()) {
        alerts.push({ asset: g.gen_code, type: 'generator', message: `Service overdue since ${next}` })
      }
    })
    earthMovers.forEach(e => {
      const next = getNextService(e)
      if (next?.type === 'date' && new Date(next) < new Date()) {
        alerts.push({ asset: e.reg, type: 'earthmover', message: `Service overdue since ${next}` })
      }
    })
    return alerts
  }

  // CRUD for Vehicles
  const addVehicle = async (vehicle) => {
    const id = generateId()
    const { error } = await supabase.from('fleet').insert([{ id, ...vehicle, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateVehicle = async (id, updates) => {
    const { error } = await supabase.from('fleet').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteVehicle = async (id) => {
    const { error } = await supabase.from('fleet').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // CRUD for Generators
  const addGenerator = async (generator) => {
    const id = generateId()
    const { error } = await supabase.from('generators').insert([{ id, ...generator, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateGenerator = async (id, updates) => {
    const { error } = await supabase.from('generators').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteGenerator = async (id) => {
    const { error } = await supabase.from('generators').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // CRUD for Heavy Equipment
  const addEarthMover = async (eq) => {
    const id = generateId()
    const { error } = await supabase.from('earth_movers').insert([{ id, ...eq, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const updateEarthMover = async (id, updates) => {
    const { error } = await supabase.from('earth_movers').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteEarthMover = async (id) => {
    const { error } = await supabase.from('earth_movers').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Run logs for generators
  const addGenRunLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('gen_run_log').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const deleteGenRunLog = async (id) => {
    const { error } = await supabase.from('gen_run_log').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Service and downtime logs
  const addMaintenanceLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('service_maintenance_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  const addDowntimeLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('downtime_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
  }

  return (
    <FleetContext.Provider value={{
      vehicles, generators, earthMovers, genRunLogs, downtimeLogs, maintenanceLogs, fuelLogs, loading,
      addVehicle, updateVehicle, deleteVehicle,
      addGenerator, updateGenerator, deleteGenerator,
      addEarthMover, updateEarthMover, deleteEarthMover,
      addGenRunLog, deleteGenRunLog,
      addMaintenanceLog, addDowntimeLog,
      getVehicleFuelEfficiency, getGeneratorEfficiency, getEquipmentEfficiency,
      getNextService, getHealthScore, getHealthStatus, getOverdueAlerts,
      fetchAll,
    }}>
      {children}
    </FleetContext.Provider>
  )
}

export function useFleet() {
  const ctx = useContext(FleetContext)
  if (!ctx) throw new Error('useFleet must be used inside FleetProvider')
  return ctx
}
