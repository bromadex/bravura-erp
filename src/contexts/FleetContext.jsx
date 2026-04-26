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

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [vRes, gRes, grRes, eRes] = await Promise.all([
        supabase.from('fleet').select('*').order('reg'),
        supabase.from('generators').select('*').order('gen_code'),
        supabase.from('gen_run_log').select('*').order('date', { ascending: false }),
        supabase.from('earth_movers').select('*').order('reg'),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (grRes.data) setGenRunLogs(grRes.data)
      if (eRes.data) setEarthMovers(eRes.data)
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

  // Helper: get total fuel consumed for a vehicle (from fuel_log)
  const getVehicleFuel = (reg) => {
    // This will be used in components by querying fuel_log directly or via context.
    // We'll compute on demand inside components.
    return 0 // placeholder – actual calculation done in component using Supabase query.
  }

  return (
    <FleetContext.Provider value={{
      vehicles, generators, genRunLogs, earthMovers, loading,
      addVehicle, updateVehicle, deleteVehicle,
      addGenerator, updateGenerator, deleteGenerator,
      addGenRunLog, deleteGenRunLog,
      addEarthMover, updateEarthMover, deleteEarthMover,
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
