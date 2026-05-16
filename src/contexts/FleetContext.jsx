import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../engine/transactionEngine'

const FleetContext = createContext(null)

const safe = (q) => q.catch(() => ({ data: [] }))

export function FleetProvider({ children }) {
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [earthMovers, setEarthMovers] = useState([])
  const [genRunLogs, setGenRunLogs] = useState([])
  const [downtimeLogs, setDowntimeLogs] = useState([])
  const [maintenanceLogs, setMaintenanceLogs] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [vehicleTrips, setVehicleTrips] = useState([])
  const [equipmentHourLogs, setEquipmentHourLogs] = useState([])
  const [assetIssues, setAssetIssues] = useState([])
  // PM / Work Orders / Tyres
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [tyreInventory, setTyreInventory] = useState([])
  const [tyreMovements, setTyreMovements] = useState([])
  const [loading, setLoading] = useState(true)

  const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        vRes, gRes, eRes, grRes, dtRes, mtRes, fRes, vtRes, ehRes, aiRes,
        msRes, woRes, tiRes, tmRes,
      ] = await Promise.all([
        safe(supabase.from('fleet').select('*').order('reg')),
        safe(supabase.from('generators').select('*').order('gen_code')),
        safe(supabase.from('earth_movers').select('*').order('reg')),
        safe(supabase.from('gen_run_log').select('*').order('date', { ascending: false })),
        safe(supabase.from('downtime_logs').select('*').order('breakdown_date', { ascending: false })),
        safe(supabase.from('service_maintenance_logs').select('*').order('service_date', { ascending: false })),
        safe(supabase.from('fuel_log').select('*').order('date', { ascending: false })),
        safe(supabase.from('vehicle_trips').select('*').order('date', { ascending: false })),
        safe(supabase.from('equipment_hour_logs').select('*').order('date', { ascending: false })),
        safe(supabase.from('asset_issues').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('maintenance_schedules').select('*').order('next_due_date')),
        safe(supabase.from('maintenance_work_orders').select('*').order('created_at', { ascending: false })),
        safe(supabase.from('tyre_inventory').select('*').order('serial_number')),
        safe(supabase.from('tyre_movements').select('*').order('event_date', { ascending: false })),
      ])
      if (vRes.data)  setVehicles(vRes.data)
      if (gRes.data)  setGenerators(gRes.data)
      if (eRes.data)  setEarthMovers(eRes.data)
      if (grRes.data) setGenRunLogs(grRes.data)
      if (dtRes.data) setDowntimeLogs(dtRes.data)
      if (mtRes.data) setMaintenanceLogs(mtRes.data)
      if (fRes.data)  setFuelLogs(fRes.data)
      if (vtRes.data) setVehicleTrips(vtRes.data)
      if (ehRes.data) setEquipmentHourLogs(ehRes.data)
      if (aiRes.data) setAssetIssues(aiRes.data)
      if (msRes.data) setMaintenanceSchedules(msRes.data)
      if (woRes.data) setWorkOrders(woRes.data)
      if (tiRes.data) setTyreInventory(tiRes.data)
      if (tmRes.data) setTyreMovements(tmRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fleet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ---- Vehicle CRUD ----
  const addVehicle = async (vehicle) => {
    const id = generateId()
    const fleet_code = await generateTxnCode('FL').catch(() => null)
    const { error } = await supabase.from('fleet').insert([{ id, fleet_code, ...vehicle, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'vehicle', entityId: id, entityName: vehicle.reg || id })
    await fetchAll()
  }

  const updateVehicle = async (id, updates) => {
    const v = vehicles.find(x => x.id === id)
    const { error } = await supabase.from('fleet').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'vehicle', entityId: id, entityName: v?.reg || id })
    await fetchAll()
  }

  const deleteVehicle = async (id) => {
    const v = vehicles.find(x => x.id === id)
    const { error } = await supabase.from('fleet').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'vehicle', entityId: id, entityName: v?.reg || id })
    await fetchAll()
  }

  // ---- Generator CRUD ----
  const addGenerator = async (generator) => {
    const id = generateId()
    const { error } = await supabase.from('generators').insert([{ id, ...generator, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'generator', entityId: id, entityName: generator.gen_code || id })
    await fetchAll()
  }

  const updateGenerator = async (id, updates) => {
    const g = generators.find(x => x.id === id)
    const { error } = await supabase.from('generators').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  const deleteGenerator = async (id) => {
    const g = generators.find(x => x.id === id)
    const { error } = await supabase.from('generators').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  // ---- Earth Mover CRUD ----
  const addEarthMover = async (equipment) => {
    const id = generateId()
    const fleet_code = await generateTxnCode('EM').catch(() => null)
    const { error } = await supabase.from('earth_movers').insert([{ id, fleet_code, ...equipment, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'heavy_equipment', entityId: id, entityName: equipment.reg || id })
    await fetchAll()
  }

  const updateEarthMover = async (id, updates) => {
    const e = earthMovers.find(x => x.id === id)
    const { error } = await supabase.from('earth_movers').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'heavy_equipment', entityId: id, entityName: e?.reg || id })
    await fetchAll()
  }

  const deleteEarthMover = async (id) => {
    const e = earthMovers.find(x => x.id === id)
    const { error } = await supabase.from('earth_movers').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'heavy_equipment', entityId: id, entityName: e?.reg || id })
    await fetchAll()
  }

  // ---- Generator Run Logs ----
  const addGenRunLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('gen_run_log').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'gen_run', entityId: id, entityName: log.gen_id || '' })
    await fetchAll()
  }

  const deleteGenRunLog = async (id) => {
    const { error } = await supabase.from('gen_run_log').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'gen_run', entityId: id })
    await fetchAll()
  }

  // ---- Trip logging (vehicles) ----
  const addVehicleTrip = async (trip) => {
    const id = generateId()
    const vehicle = vehicles.find(v => v.id === trip.vehicle_id)
    if (vehicle && trip.end_odometer > vehicle.odometer_km) {
      await supabase.from('fleet').update({ odometer_km: trip.end_odometer }).eq('id', trip.vehicle_id)
    }
    const { error } = await supabase.from('vehicle_trips').insert([{ id, ...trip, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'vehicle_trip', entityId: id, entityName: vehicle?.reg || '' })
    await fetchAll()
  }

  // ---- Hour logging (heavy equipment) ----
  const addEquipmentHourLog = async (log) => {
    const id = generateId()
    const equipment = earthMovers.find(e => e.id === log.equipment_id)
    if (equipment && log.end_hour_meter > equipment.hour_meter) {
      await supabase.from('earth_movers').update({ hour_meter: log.end_hour_meter }).eq('id', log.equipment_id)
    }
    const { error } = await supabase.from('equipment_hour_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'equipment_hours', entityId: id, entityName: equipment?.reg || '' })
    await fetchAll()
  }

  // ---- Asset Issues ----
  const addAssetIssue = async (issue) => {
    const id = generateId()
    const { error } = await supabase.from('asset_issues').insert([{ id, ...issue, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'asset_issue', entityId: id, entityName: issue.txn_code || issue.asset_id || '' })
    await fetchAll()
  }

  const updateAssetIssue = async (id, updates) => {
    const ai = assetIssues.find(x => x.id === id)
    const { error } = await supabase.from('asset_issues').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'asset_issue', entityId: id, entityName: ai?.txn_code || id })
    await fetchAll()
  }

  // ---- Maintenance & Downtime Logs ----
  const addMaintenanceLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('service_maintenance_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'maintenance', entityId: id, entityName: log.asset_id || '' })
    await fetchAll()
  }

  const addDowntimeLog = async (log) => {
    const id = generateId()
    const { error } = await supabase.from('downtime_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'downtime', entityId: id, entityName: log.asset_id || '' })
    await fetchAll()
  }

  const closeDowntimeLog = async (id, { closed_at, repair_cost, resolution_notes }) => {
    const dl = downtimeLogs.find(x => x.id === id)
    const breakdownDate = dl?.breakdown_date || dl?.created_at
    let downtime_hours = null
    if (breakdownDate && closed_at) {
      downtime_hours = (new Date(closed_at) - new Date(breakdownDate)) / 3600000
    }
    const { error } = await supabase.from('downtime_logs').update({
      closed_at,
      repair_cost: repair_cost || null,
      resolution_notes: resolution_notes || null,
      downtime_hours: downtime_hours ? +downtime_hours.toFixed(2) : null,
      status: 'resolved',
    }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'downtime', entityId: id, entityName: dl?.asset_id || id })
    await fetchAll()
  }

  // ---- Maintenance Schedules (PM) ----
  const addMaintenanceSchedule = async (schedule) => {
    const id = generateId()
    const { error } = await supabase.from('maintenance_schedules').insert([{
      id, ...schedule, created_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'maintenance_schedule', entityId: id, entityName: schedule.task_name || id })
    await fetchAll()
  }

  const updateMaintenanceSchedule = async (id, updates) => {
    const ms = maintenanceSchedules.find(x => x.id === id)
    const { error } = await supabase.from('maintenance_schedules').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'maintenance_schedule', entityId: id, entityName: ms?.task_name || id })
    await fetchAll()
  }

  const deleteMaintenanceSchedule = async (id) => {
    const ms = maintenanceSchedules.find(x => x.id === id)
    const { error } = await supabase.from('maintenance_schedules').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'maintenance_schedule', entityId: id, entityName: ms?.task_name || id })
    await fetchAll()
  }

  // ---- Work Orders ----
  const createWorkOrder = async (wo) => {
    const id = generateId()
    const wo_number = await generateTxnCode('WO').catch(() => `WO-${Date.now()}`)
    const { error } = await supabase.from('maintenance_work_orders').insert([{
      id, wo_number, ...wo, status: wo.status || 'open', created_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'work_order', entityId: id, entityName: wo_number || id })
    await fetchAll()
    return id
  }

  const updateWorkOrder = async (id, updates) => {
    const wo = workOrders.find(x => x.id === id)
    const { error } = await supabase.from('maintenance_work_orders').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'work_order', entityId: id, entityName: wo?.wo_number || id })
    await fetchAll()
  }

  const closeWorkOrder = async (id, { actual_cost, completion_notes, actual_end_date, odometer_at_service, hour_meter_at_service }) => {
    const wo = workOrders.find(x => x.id === id)
    const updates = {
      status: 'closed',
      actual_cost: actual_cost || null,
      completion_notes: completion_notes || null,
      actual_end_date: actual_end_date || new Date().toISOString().split('T')[0],
    }
    if (odometer_at_service) updates.odometer_at_service = odometer_at_service
    if (hour_meter_at_service) updates.hour_meter_at_service = hour_meter_at_service
    const { error } = await supabase.from('maintenance_work_orders').update(updates).eq('id', id)
    if (error) throw error
    // If linked to a schedule, update last_done on that schedule
    if (wo?.schedule_id) {
      const schedUpdates = { last_done_date: updates.actual_end_date }
      if (odometer_at_service) schedUpdates.last_done_km = odometer_at_service
      if (hour_meter_at_service) schedUpdates.last_done_hours = hour_meter_at_service
      await supabase.from('maintenance_schedules').update(schedUpdates).eq('id', wo.schedule_id).catch(() => null)
    }
    auditLog({ module: 'fleet', action: 'CLOSE', entityType: 'work_order', entityId: id, entityName: wo?.wo_number || id })
    await fetchAll()
  }

  // ---- Tyre Inventory ----
  const addTyre = async (tyre) => {
    const id = generateId()
    const tyre_code = await generateTxnCode('TYR').catch(() => `TYR-${Date.now()}`)
    const { error } = await supabase.from('tyre_inventory').insert([{
      id, tyre_code, ...tyre, km_accumulated: tyre.km_accumulated || 0, status: tyre.status || 'in_stock',
      created_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'tyre', entityId: id, entityName: tyre.serial_number || id })
    await fetchAll()
  }

  const updateTyre = async (id, updates) => {
    const t = tyreInventory.find(x => x.id === id)
    const { error } = await supabase.from('tyre_inventory').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'tyre', entityId: id, entityName: t?.serial_number || id })
    await fetchAll()
  }

  const scrapTyre = async (id, notes) => {
    const t = tyreInventory.find(x => x.id === id)
    const { error } = await supabase.from('tyre_inventory').update({
      status: 'scrapped', scrapped_at: new Date().toISOString(), scrap_notes: notes || null,
    }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'SCRAP', entityType: 'tyre', entityId: id, entityName: t?.serial_number || id })
    await fetchAll()
  }

  // ---- Tyre Movements ----
  const recordTyreMovement = async (movement) => {
    const id = generateId()
    const { error } = await supabase.from('tyre_movements').insert([{
      id, ...movement, created_at: new Date().toISOString(),
    }])
    if (error) throw error
    // Update tyre status/position based on event
    const tyreUpdates = { last_event: movement.event_type, last_event_date: movement.event_date }
    if (movement.event_type === 'fit') {
      tyreUpdates.current_vehicle = movement.vehicle_id
      tyreUpdates.current_position = movement.position
      tyreUpdates.status = 'fitted'
    } else if (['remove', 'scrap'].includes(movement.event_type)) {
      tyreUpdates.current_vehicle = null
      tyreUpdates.current_position = null
      tyreUpdates.status = movement.event_type === 'scrap' ? 'scrapped' : 'in_stock'
    } else if (movement.event_type === 'rotate') {
      tyreUpdates.current_position = movement.position
    } else if (movement.event_type === 'retread') {
      tyreUpdates.status = 'retreaded'
      tyreUpdates.retread_count = (tyreInventory.find(t => t.id === movement.tyre_id)?.retread_count || 0) + 1
    }
    if (movement.tread_depth !== undefined) tyreUpdates.tread_depth_current = movement.tread_depth
    if (movement.km_at_event && movement.event_type === 'remove') {
      const tyre = tyreInventory.find(t => t.id === movement.tyre_id)
      if (tyre?.fitted_odometer) {
        tyreUpdates.km_accumulated = (tyre.km_accumulated || 0) + (movement.km_at_event - tyre.fitted_odometer)
      }
    }
    if (movement.event_type === 'fit') tyreUpdates.fitted_odometer = movement.km_at_event
    await supabase.from('tyre_inventory').update(tyreUpdates).eq('id', movement.tyre_id).catch(() => null)
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'tyre_movement', entityId: id, entityName: movement.tyre_id })
    await fetchAll()
  }

  // ---- Helper functions ----
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
    if (next && next.type === 'date') {
      const isOverdue = new Date(next) < new Date()
      if (isOverdue) score -= 30
    }
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
    const today = new Date()
    vehicles.forEach(v => {
      const next = getNextService(v)
      if (next?.type === 'date' && new Date(next) < today) {
        alerts.push({ asset: v.reg, type: 'vehicle', message: `Service overdue since ${next}` })
      }
    })
    generators.forEach(g => {
      const next = getNextService(g)
      if (next?.type === 'date' && new Date(next) < today) {
        alerts.push({ asset: g.gen_code, type: 'generator', message: `Service overdue since ${next}` })
      }
    })
    earthMovers.forEach(e => {
      const next = getNextService(e)
      if (next?.type === 'date' && new Date(next) < today) {
        alerts.push({ asset: e.reg, type: 'earthmover', message: `Service overdue since ${next}` })
      }
    })
    // PM Schedule overdue alerts
    maintenanceSchedules.forEach(ms => {
      if (ms.next_due_date && new Date(ms.next_due_date) < today) {
        alerts.push({ asset: ms.asset_id, type: 'pm_schedule', message: `PM "${ms.task_name}" overdue since ${ms.next_due_date}`, scheduleId: ms.id })
      }
    })
    return alerts
  }

  // Get upcoming PM tasks (next N days)
  const getUpcomingPM = (days = 30) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    return maintenanceSchedules
      .filter(ms => ms.next_due_date && new Date(ms.next_due_date) <= cutoff && ms.is_active !== false)
      .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))
  }

  // Get tyres currently fitted to a vehicle
  const getVehicleTyres = (vehicleId) => {
    return tyreInventory.filter(t => t.current_vehicle === vehicleId && t.status === 'fitted')
  }

  // Get total fleet costs for a period
  const getFleetCosts = (fromDate, toDate) => {
    const from = fromDate ? new Date(fromDate) : null
    const to   = toDate   ? new Date(toDate)   : null
    const inRange = (d) => {
      if (!d) return false
      const dt = new Date(d)
      if (from && dt < from) return false
      if (to   && dt > to)   return false
      return true
    }
    const fuelCost = fuelLogs
      .filter(f => inRange(f.date))
      .reduce((s, f) => s + (f.total_cost || f.amount * (f.unit_price || 0) || 0), 0)
    const maintenanceCost = workOrders
      .filter(wo => inRange(wo.actual_end_date) && wo.status === 'closed')
      .reduce((s, wo) => s + (wo.actual_cost || 0), 0)
    const downtimeCost = downtimeLogs
      .filter(dl => inRange(dl.breakdown_date))
      .reduce((s, dl) => s + (dl.repair_cost || 0), 0)
    return { fuelCost, maintenanceCost, downtimeCost, total: fuelCost + maintenanceCost + downtimeCost }
  }

  // Compute MTBF / MTTR for an asset from downtime_logs
  const getAssetReliability = (assetId) => {
    const events = downtimeLogs
      .filter(d => d.asset_id === assetId)
      .sort((a, b) => new Date(a.breakdown_date) - new Date(b.breakdown_date))
    if (events.length === 0) return { mtbf: null, mttr: null, availability: 100, breakdowns: 0 }
    const totalDowntime = events.reduce((s, e) => s + (e.downtime_hours || 0), 0)
    const mttr = events.length > 0 ? totalDowntime / events.length : 0
    // MTBF: average hours between breakdowns (rough: span / count)
    const firstBreakdown = new Date(events[0].breakdown_date)
    const lastBreakdown  = new Date(events[events.length - 1].breakdown_date)
    const spanHours = (lastBreakdown - firstBreakdown) / 3600000 || 1
    const mtbf = events.length > 1 ? spanHours / (events.length - 1) : null
    const uptime = spanHours - totalDowntime
    const availability = spanHours > 0 ? Math.max(0, (uptime / spanHours) * 100) : 100
    return { mtbf: mtbf ? +mtbf.toFixed(1) : null, mttr: +mttr.toFixed(1), availability: +availability.toFixed(1), breakdowns: events.length }
  }

  return (
    <FleetContext.Provider value={{
      vehicles, generators, earthMovers, genRunLogs, downtimeLogs, maintenanceLogs, fuelLogs,
      vehicleTrips, equipmentHourLogs, assetIssues,
      maintenanceSchedules, workOrders, tyreInventory, tyreMovements,
      loading,
      addVehicle, updateVehicle, deleteVehicle,
      addGenerator, updateGenerator, deleteGenerator,
      addEarthMover, updateEarthMover, deleteEarthMover,
      addGenRunLog, deleteGenRunLog,
      addVehicleTrip, addEquipmentHourLog,
      addAssetIssue, updateAssetIssue,
      addMaintenanceLog, addDowntimeLog, closeDowntimeLog,
      addMaintenanceSchedule, updateMaintenanceSchedule, deleteMaintenanceSchedule,
      createWorkOrder, updateWorkOrder, closeWorkOrder,
      addTyre, updateTyre, scrapTyre,
      recordTyreMovement,
      getVehicleFuelEfficiency, getGeneratorEfficiency, getEquipmentEfficiency,
      getNextService, getHealthScore, getHealthStatus, getOverdueAlerts,
      getUpcomingPM, getVehicleTyres, getFleetCosts, getAssetReliability,
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
