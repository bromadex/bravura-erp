import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const FleetContext = createContext(null)

export function FleetProvider({ children }) {
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [genRunLogs, setGenRunLogs] = useState([])
  const [earthMovers, setEarthMovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fuelMap, setFuelMap] = useState({})   // vehicle reg -> total litres
  const [genFuelMap, setGenFuelMap] = useState({}) // generator id -> total fuel from run logs

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // Fetch all fleet data and fuel consumption
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [vRes, gRes, grRes, eRes, fuelRes] = await Promise.all([
        supabase.from('fleet').select('*').order('reg'),
        supabase.from('generators').select('*').order('gen_code'),
        supabase.from('gen_run_log').select('*').order('date', { ascending: false }),
        supabase.from('earth_movers').select('*').order('reg'),
        supabase.from('fuel_log').select('vehicle, amount'),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (grRes.data) setGenRunLogs(grRes.data)
      if (eRes.data) setEarthMovers(eRes.data)

      // Build fuel map for vehicles (by registration)
      const fMap = {}
      if (fuelRes.data) {
        fuelRes.data.forEach(f => {
          if (f.vehicle) fMap[f.vehicle] = (fMap[f.vehicle] || 0) + (f.amount || 0)
        })
      }
      setFuelMap(fMap)

      // Build generator fuel map from run logs
      const gMap = {}
      if (grRes.data) {
        grRes.data.forEach(log => {
          const genId = log.gen_id
          if (genId) gMap[genId] = (gMap[genId] || 0) + (log.fuel_used || 0)
        })
      }
      setGenFuelMap(gMap)

    } catch (err) {
      console.error(err)
      toast.error('Failed to load fleet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ---- Vehicles ----
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

  // ---- Generators ----
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

  // ---- Generator Run Logs ----
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

  // ---- Heavy Equipment ----
  const addEarthMover = async (equipment) => {
    const id = generateId()
    const { error } = await supabase.from('earth_movers').insert([{ id, ...equipment, created_at: new Date().toISOString() }])
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

  // Helper to get fuel for a vehicle by registration
  const getVehicleFuel = (reg) => fuelMap[reg] || 0

  // Helper to get total fuel for a generator by its id
  const getGeneratorFuel = (genId) => genFuelMap[genId] || 0

  return (
    <FleetContext.Provider value={{
      vehicles, generators, genRunLogs, earthMovers, loading,
      fuelMap: fuelMap,
      addVehicle, updateVehicle, deleteVehicle,
      addGenerator, updateGenerator, deleteGenerator,
      addGenRunLog, deleteGenRunLog,
      addEarthMover, updateEarthMover, deleteEarthMover,
      getVehicleFuel, getGeneratorFuel,
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
