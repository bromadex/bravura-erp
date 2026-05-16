// src/contexts/FleetContext.jsx
// TRUE MERGE: all vehicle/generator/equipment data lives in asset_registry.
// Mapping helpers translate asset_registry columns ↔ the field names that
// existing Fleet pages (Vehicles, Generators, HeavyEquipment) already use,
// so those pages need no changes.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../engine/transactionEngine'

const FleetContext = createContext(null)

const safe = (q) => Promise.resolve(q).catch(() => ({ data: [] }))

// ── Category grouping ────────────────────────────────────────────────────────
// Which asset_registry categories belong to each fleet sub-type.
// Vehicles page shows 'Vehicle'.
// Generators page shows 'Generator'.
// HeavyEquipment page shows everything else.
const VEHICLE_CATS   = ['Vehicle']
const GENERATOR_CATS = ['Generator']
const EQUIPMENT_CATS = ['Heavy Equipment','Light Equipment','Water Pump','Compressor','Fixed Plant','Roller','Excavator']

// ── Column mappers ───────────────────────────────────────────────────────────

/** asset_registry row → vehicle-shaped object (as Fleet pages expect) */
function toVehicle(a) {
  return {
    ...a,                                             // keep all asset_registry fields
    reg:                        a.plate_number || a.asset_name || '',
    fleet_code:                 a.asset_code,
    type:                       a.asset_subtype || '',
    description:                a.notes || '',
    driver_id:                  a.metadata?.driver_id || '',
    driver_name:                a.assigned_to || '',
    odometer_km:                a.primary_metric_val || 0,
    service_interval_km:        a.measurement_type === 'km' ? (a.service_interval || null) : null,
    service_interval_days:      a.metadata?.service_interval_days || null,
    utilization_available_hours: a.metadata?.utilization_available_hours || null,
    // enhancement fields stored in metadata
    tare_weight:                a.metadata?.tare_weight || null,
    gross_vehicle_mass:         a.metadata?.gross_vehicle_mass || null,
    licence_expiry:             a.metadata?.licence_expiry || null,
    insurance_expiry:           a.metadata?.insurance_expiry || null,
    roadworthy_expiry:          a.metadata?.roadworthy_expiry || null,
    tracker_id:                 a.metadata?.tracker_id || null,
    cost_center:                a.metadata?.cost_center || null,
    acquisition_cost:           a.purchase_cost || 0,
    acquisition_date:           a.purchase_date || null,
  }
}

/** vehicle-shaped form data → asset_registry insert payload */
function fromVehicle(v, id, asset_code) {
  return {
    id,
    asset_code,
    asset_name:            v.reg || v.description || 'Unknown Vehicle',
    asset_category:        v.asset_category || 'Vehicle',
    asset_subtype:         v.type || '',
    measurement_type:      'km',
    primary_metric_val:    parseFloat(v.odometer_km) || 0,
    service_interval:      v.service_interval_km ? parseFloat(v.service_interval_km) : null,
    service_interval_basis: 'km',
    last_service_date:     v.last_service_date || null,
    last_service_val:      v.last_service_km ? parseFloat(v.last_service_km) : null,
    plate_number:          v.reg || '',
    status:                v.status || 'Active',
    assigned_to:           v.driver_name || '',
    assigned_project:      v.assigned_project || '',
    department:            v.department || '',
    location:              v.location || '',
    purchase_cost:         v.acquisition_cost ? parseFloat(v.acquisition_cost) : 0,
    purchase_date:         v.acquisition_date || null,
    salvage_value:         v.salvage_value ? parseFloat(v.salvage_value) : 0,
    notes:                 v.description || '',
    source_table:          'fleet',
    metadata: {
      driver_id:                  v.driver_id || null,
      service_interval_days:      v.service_interval_days ? parseInt(v.service_interval_days) : null,
      utilization_available_hours: v.utilization_available_hours ? parseFloat(v.utilization_available_hours) : null,
      tare_weight:                v.tare_weight || null,
      gross_vehicle_mass:         v.gross_vehicle_mass || null,
      licence_expiry:             v.licence_expiry || null,
      insurance_expiry:           v.insurance_expiry || null,
      roadworthy_expiry:          v.roadworthy_expiry || null,
      tracker_id:                 v.tracker_id || null,
      cost_center:                v.cost_center || null,
    },
  }
}

/** asset_registry row → generator-shaped object */
function toGenerator(a) {
  return {
    ...a,
    gen_code: a.asset_code,
    gen_name: a.asset_name,
  }
}

/** generator form data → asset_registry insert payload */
function fromGenerator(g, id, asset_code) {
  return {
    id,
    asset_code:        g.gen_code || asset_code,
    asset_name:        g.gen_name || g.gen_code || 'Unknown Generator',
    asset_category:    'Generator',
    asset_subtype:     g.type || g.asset_subtype || '',
    measurement_type:  'hours',
    primary_metric_val: 0,
    service_interval_basis: 'hours',
    status:            g.status || 'Active',
    assigned_project:  g.assigned_project || '',
    department:        g.department || '',
    notes:             g.description || g.notes || '',
    source_table:      'generators',
    metadata:          {},
  }
}

/** asset_registry row → earth-mover-shaped object */
function toEarthMover(a) {
  return {
    ...a,
    reg:                   a.plate_number || a.asset_name || '',
    fleet_code:            a.asset_code,
    type:                  a.asset_subtype || '',
    description:           a.notes || '',
    hour_meter:            a.primary_metric_val || 0,
    service_interval_hours: a.measurement_type === 'hours' ? (a.service_interval || null) : null,
    assigned_project:      a.assigned_project || '',
    driver_name:           a.assigned_to || '',
  }
}

/** earth mover form data → asset_registry insert payload */
function fromEarthMover(e, id, asset_code) {
  return {
    id,
    asset_code,
    asset_name:        e.reg || e.description || 'Unknown Equipment',
    asset_category:    e.asset_category || 'Heavy Equipment',
    asset_subtype:     e.type || '',
    measurement_type:  'hours',
    primary_metric_val: parseFloat(e.hour_meter) || 0,
    service_interval:  e.service_interval_hours ? parseFloat(e.service_interval_hours) : null,
    service_interval_basis: 'hours',
    last_service_date: e.last_service_date || null,
    plate_number:      e.reg || '',
    status:            e.status || 'Active',
    assigned_to:       e.driver_name || '',
    assigned_project:  e.assigned_project || '',
    department:        e.department || '',
    notes:             e.description || '',
    source_table:      'earth_movers',
    metadata:          {},
  }
}

/** Build asset_registry UPDATE payload from a partial vehicle update object */
function vehicleUpdateToAR(updates, currentAsset) {
  const ar = { updated_at: new Date().toISOString() }
  if ('reg' in updates)                { ar.plate_number = updates.reg; ar.asset_name = updates.reg }
  if ('type' in updates)               ar.asset_subtype = updates.type
  if ('description' in updates)        ar.notes = updates.description
  if ('status' in updates)             ar.status = updates.status
  if ('odometer_km' in updates)        ar.primary_metric_val = parseFloat(updates.odometer_km) || 0
  if ('service_interval_km' in updates) ar.service_interval = updates.service_interval_km ? parseFloat(updates.service_interval_km) : null
  if ('last_service_date' in updates)  ar.last_service_date = updates.last_service_date
  if ('driver_name' in updates)        ar.assigned_to = updates.driver_name
  if ('assigned_project' in updates)   ar.assigned_project = updates.assigned_project
  if ('department' in updates)         ar.department = updates.department
  if ('acquisition_cost' in updates)   ar.purchase_cost = parseFloat(updates.acquisition_cost) || 0
  if ('acquisition_date' in updates)   ar.purchase_date = updates.acquisition_date
  if ('salvage_value' in updates)      ar.salvage_value = parseFloat(updates.salvage_value) || 0
  // Metadata patch — merge with existing
  const META_FIELDS = ['driver_id','service_interval_days','utilization_available_hours','tare_weight',
    'gross_vehicle_mass','licence_expiry','insurance_expiry','roadworthy_expiry','tracker_id','cost_center']
  const metaPatch = {}
  for (const f of META_FIELDS) { if (f in updates) metaPatch[f] = updates[f] }
  if (Object.keys(metaPatch).length > 0) {
    ar.metadata = { ...(currentAsset?.metadata || {}), ...metaPatch }
  }
  return ar
}

function earthMoverUpdateToAR(updates, currentAsset) {
  const ar = { updated_at: new Date().toISOString() }
  if ('reg' in updates)                  { ar.plate_number = updates.reg; ar.asset_name = updates.reg }
  if ('type' in updates)                 ar.asset_subtype = updates.type
  if ('description' in updates)          ar.notes = updates.description
  if ('status' in updates)               ar.status = updates.status
  if ('hour_meter' in updates)           ar.primary_metric_val = parseFloat(updates.hour_meter) || 0
  if ('service_interval_hours' in updates) ar.service_interval = updates.service_interval_hours ? parseFloat(updates.service_interval_hours) : null
  if ('last_service_date' in updates)    ar.last_service_date = updates.last_service_date
  if ('driver_name' in updates)          ar.assigned_to = updates.driver_name
  if ('assigned_project' in updates)     ar.assigned_project = updates.assigned_project
  if ('department' in updates)           ar.department = updates.department
  if ('asset_category' in updates)       ar.asset_category = updates.asset_category
  return ar
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function FleetProvider({ children }) {
  const [vehicles, setVehicles]                 = useState([])
  const [generators, setGenerators]             = useState([])
  const [earthMovers, setEarthMovers]           = useState([])
  const [genRunLogs, setGenRunLogs]             = useState([])
  const [downtimeLogs, setDowntimeLogs]         = useState([])
  const [maintenanceLogs, setMaintenanceLogs]   = useState([])
  const [fuelLogs, setFuelLogs]                 = useState([])
  const [vehicleTrips, setVehicleTrips]         = useState([])
  const [equipmentHourLogs, setEquipmentHourLogs] = useState([])
  const [assetIssues, setAssetIssues]           = useState([])
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([])
  const [workOrders, setWorkOrders]             = useState([])
  const [tyreInventory, setTyreInventory]       = useState([])
  const [tyreMovements, setTyreMovements]       = useState([])
  const [loading, setLoading]                   = useState(true)

  const generateId = () =>
    crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // ── Fetch ────────────────────────────────────────────────────────────────
  // Vehicles, generators, and equipment all come from asset_registry now.
  // Operational logs (trips, hours, maintenance, tyres) still have their own tables.

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        arRes,                                        // all asset_registry rows
        grRes, dtRes, mtRes, fRes, vtRes, ehRes, aiRes,
        msRes, woRes, tiRes, tmRes,
      ] = await Promise.all([
        safe(supabase.from('asset_registry').select('*').order('asset_name')),
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

      const allAssets = arRes.data || []
      setVehicles(allAssets.filter(a => VEHICLE_CATS.includes(a.asset_category)).map(toVehicle))
      setGenerators(allAssets.filter(a => GENERATOR_CATS.includes(a.asset_category)).map(toGenerator))
      setEarthMovers(allAssets.filter(a =>
        !VEHICLE_CATS.includes(a.asset_category) && !GENERATOR_CATS.includes(a.asset_category)
      ).map(toEarthMover))

      if (grRes.data)  setGenRunLogs(grRes.data)
      if (dtRes.data)  setDowntimeLogs(dtRes.data)
      if (mtRes.data)  setMaintenanceLogs(mtRes.data)
      if (fRes.data)   setFuelLogs(fRes.data)
      if (vtRes.data)  setVehicleTrips(vtRes.data)
      if (ehRes.data)  setEquipmentHourLogs(ehRes.data)
      if (aiRes.data)  setAssetIssues(aiRes.data)
      if (msRes.data)  setMaintenanceSchedules(msRes.data)
      if (woRes.data)  setWorkOrders(woRes.data)
      if (tiRes.data)  setTyreInventory(tiRes.data)
      if (tmRes.data)  setTyreMovements(tmRes.data)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load fleet data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Vehicle CRUD → asset_registry ────────────────────────────────────────

  const addVehicle = async (vehicle) => {
    const id = generateId()
    const asset_code = await generateTxnCode('FL').catch(() => `FL-${Date.now()}`)
    const { error } = await supabase.from('asset_registry')
      .insert([{ ...fromVehicle(vehicle, id, asset_code), created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'vehicle', entityId: id, entityName: vehicle.reg || id })
    await fetchAll()
  }

  const updateVehicle = async (id, updates) => {
    const current = vehicles.find(x => x.id === id)
    const arUpdates = vehicleUpdateToAR(updates, current)
    const { error } = await supabase.from('asset_registry').update(arUpdates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'vehicle', entityId: id, entityName: current?.reg || id })
    await fetchAll()
  }

  const deleteVehicle = async (id) => {
    const v = vehicles.find(x => x.id === id)
    const { error } = await supabase.from('asset_registry').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'vehicle', entityId: id, entityName: v?.reg || id })
    await fetchAll()
  }

  // ── Generator CRUD → asset_registry ──────────────────────────────────────

  const addGenerator = async (generator) => {
    const id = generateId()
    const asset_code = await generateTxnCode('GN').catch(() => `GN-${Date.now()}`)
    const { error } = await supabase.from('asset_registry')
      .insert([{ ...fromGenerator(generator, id, asset_code), created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'generator', entityId: id, entityName: generator.gen_code || id })
    await fetchAll()
  }

  const updateGenerator = async (id, updates) => {
    const g = generators.find(x => x.id === id)
    const ar = { updated_at: new Date().toISOString() }
    if ('gen_name' in updates)       ar.asset_name = updates.gen_name
    if ('gen_code' in updates)       ar.asset_code = updates.gen_code
    if ('status' in updates)         ar.status = updates.status
    if ('description' in updates)    ar.notes = updates.description
    if ('assigned_project' in updates) ar.assigned_project = updates.assigned_project
    if ('department' in updates)     ar.department = updates.department
    if ('asset_subtype' in updates)  ar.asset_subtype = updates.asset_subtype
    const { error } = await supabase.from('asset_registry').update(ar).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  const deleteGenerator = async (id) => {
    const g = generators.find(x => x.id === id)
    const { error } = await supabase.from('asset_registry').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  // ── Earth Mover / Equipment CRUD → asset_registry ────────────────────────

  const addEarthMover = async (equipment) => {
    const id = generateId()
    const asset_code = await generateTxnCode('EM').catch(() => `EM-${Date.now()}`)
    const { error } = await supabase.from('asset_registry')
      .insert([{ ...fromEarthMover(equipment, id, asset_code), created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'heavy_equipment', entityId: id, entityName: equipment.reg || id })
    await fetchAll()
  }

  const updateEarthMover = async (id, updates) => {
    const current = earthMovers.find(x => x.id === id)
    const arUpdates = earthMoverUpdateToAR(updates, current)
    const { error } = await supabase.from('asset_registry').update(arUpdates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'heavy_equipment', entityId: id, entityName: current?.reg || id })
    await fetchAll()
  }

  const deleteEarthMover = async (id) => {
    const e = earthMovers.find(x => x.id === id)
    const { error } = await supabase.from('asset_registry').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'heavy_equipment', entityId: id, entityName: e?.reg || id })
    await fetchAll()
  }

  // ── Generator Run Logs ────────────────────────────────────────────────────

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
    await fetchAll()
  }

  // ── Trip logging — updates asset_registry.primary_metric_val ────────────

  const addVehicleTrip = async (trip) => {
    const id = generateId()
    const vehicle = vehicles.find(v => v.id === trip.vehicle_id)
    if (vehicle && trip.end_odometer > (vehicle.odometer_km || 0)) {
      await supabase.from('asset_registry')
        .update({ primary_metric_val: trip.end_odometer, updated_at: new Date().toISOString() })
        .eq('id', trip.vehicle_id)
    }
    const { error } = await supabase.from('vehicle_trips').insert([{ id, ...trip, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'vehicle_trip', entityId: id, entityName: vehicle?.reg || '' })
    await fetchAll()
  }

  // ── Hour logging — updates asset_registry.primary_metric_val ────────────

  const addEquipmentHourLog = async (log) => {
    const id = generateId()
    const equipment = earthMovers.find(e => e.id === log.equipment_id)
    if (equipment && log.end_hour_meter > (equipment.hour_meter || 0)) {
      await supabase.from('asset_registry')
        .update({ primary_metric_val: log.end_hour_meter, updated_at: new Date().toISOString() })
        .eq('id', log.equipment_id)
    }
    const { error } = await supabase.from('equipment_hour_logs').insert([{ id, ...log, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'LOG', entityType: 'equipment_hours', entityId: id, entityName: equipment?.reg || '' })
    await fetchAll()
  }

  // ── Asset Issues ──────────────────────────────────────────────────────────

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

  // ── Maintenance & Downtime ────────────────────────────────────────────────

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
      closed_at, repair_cost: repair_cost || null,
      resolution_notes: resolution_notes || null,
      downtime_hours: downtime_hours ? +downtime_hours.toFixed(2) : null,
      status: 'resolved',
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── PM Schedules ──────────────────────────────────────────────────────────

  const addMaintenanceSchedule = async (schedule) => {
    const id = generateId()
    const { error } = await supabase.from('maintenance_schedules').insert([{ id, ...schedule, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'maintenance_schedule', entityId: id, entityName: schedule.task_name || id })
    await fetchAll()
  }

  const updateMaintenanceSchedule = async (id, updates) => {
    const { error } = await supabase.from('maintenance_schedules').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteMaintenanceSchedule = async (id) => {
    const { error } = await supabase.from('maintenance_schedules').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Work Orders ───────────────────────────────────────────────────────────

  const createWorkOrder = async (wo) => {
    const id = generateId()
    const wo_number = await generateTxnCode('WO').catch(() => `WO-${Date.now()}`)
    const { error } = await supabase.from('maintenance_work_orders').insert([{
      id, wo_number, ...wo, status: wo.status || 'open', created_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'work_order', entityId: id, entityName: wo_number })
    await fetchAll()
    return id
  }

  const updateWorkOrder = async (id, updates) => {
    const { error } = await supabase.from('maintenance_work_orders').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const closeWorkOrder = async (id, { actual_cost, completion_notes, actual_end_date, odometer_at_service, hour_meter_at_service }) => {
    const wo = workOrders.find(x => x.id === id)
    const updates = {
      status: 'closed', actual_cost: actual_cost || null,
      completion_notes: completion_notes || null,
      actual_end_date: actual_end_date || new Date().toISOString().split('T')[0],
    }
    if (odometer_at_service)   updates.odometer_at_service   = odometer_at_service
    if (hour_meter_at_service) updates.hour_meter_at_service = hour_meter_at_service
    const { error } = await supabase.from('maintenance_work_orders').update(updates).eq('id', id)
    if (error) throw error
    if (wo?.schedule_id) {
      const schedUpdates = { last_done_date: updates.actual_end_date }
      if (odometer_at_service)   schedUpdates.last_done_km    = odometer_at_service
      if (hour_meter_at_service) schedUpdates.last_done_hours = hour_meter_at_service
      await supabase.from('maintenance_schedules').update(schedUpdates).eq('id', wo.schedule_id).catch(() => null)
    }
    // Write last service back to asset_registry
    if (wo?.asset_id) {
      const serviceUpdate = { last_service_date: updates.actual_end_date, updated_at: new Date().toISOString() }
      if (odometer_at_service)   serviceUpdate.last_service_val = odometer_at_service
      if (hour_meter_at_service) serviceUpdate.last_service_val = hour_meter_at_service
      await supabase.from('asset_registry').update(serviceUpdate).eq('id', wo.asset_id).catch(() => null)
    }
    auditLog({ module: 'fleet', action: 'CLOSE', entityType: 'work_order', entityId: id, entityName: wo?.wo_number || id })
    await fetchAll()
  }

  // ── Tyre Inventory ────────────────────────────────────────────────────────

  const addTyre = async (tyre) => {
    const id = generateId()
    const tyre_code = await generateTxnCode('TYR').catch(() => `TYR-${Date.now()}`)
    const { error } = await supabase.from('tyre_inventory').insert([{
      id, tyre_code, ...tyre, km_accumulated: tyre.km_accumulated || 0, status: tyre.status || 'in_stock',
      created_at: new Date().toISOString(),
    }])
    if (error) throw error
    await fetchAll()
  }

  const updateTyre = async (id, updates) => {
    const { error } = await supabase.from('tyre_inventory').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const scrapTyre = async (id, notes) => {
    const { error } = await supabase.from('tyre_inventory').update({
      status: 'scrapped', scrapped_at: new Date().toISOString(), scrap_notes: notes || null,
    }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const recordTyreMovement = async (movement) => {
    const id = generateId()
    const { error } = await supabase.from('tyre_movements').insert([{ id, ...movement, created_at: new Date().toISOString() }])
    if (error) throw error
    const tyreUpdates = { last_event: movement.event_type, last_event_date: movement.event_date }
    if (movement.event_type === 'fit') {
      tyreUpdates.current_vehicle = movement.vehicle_id; tyreUpdates.current_position = movement.position; tyreUpdates.status = 'fitted'
    } else if (['remove', 'scrap'].includes(movement.event_type)) {
      tyreUpdates.current_vehicle = null; tyreUpdates.current_position = null
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
      if (tyre?.fitted_odometer) tyreUpdates.km_accumulated = (tyre.km_accumulated || 0) + (movement.km_at_event - tyre.fitted_odometer)
    }
    if (movement.event_type === 'fit') tyreUpdates.fitted_odometer = movement.km_at_event
    await supabase.from('tyre_inventory').update(tyreUpdates).eq('id', movement.tyre_id).catch(() => null)
    await fetchAll()
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  const getVehicleFuelEfficiency = (reg) => {
    const fuelEntries = fuelLogs.filter(f => f.vehicle === reg)
    if (!fuelEntries.length) return null
    const totalFuel = fuelEntries.reduce((s, f) => s + (f.amount || 0), 0)
    const vehicle = vehicles.find(v => v.reg === reg)
    if (!vehicle || !vehicle.odometer_km || !totalFuel) return null
    return { kmPerLiter: vehicle.odometer_km / totalFuel, litersPer100km: (totalFuel / vehicle.odometer_km) * 100 }
  }

  const getGeneratorEfficiency = (genId) => {
    const logs = genRunLogs.filter(l => l.gen_id === genId)
    if (!logs.length) return null
    const totalFuel  = logs.reduce((s, l) => s + (l.fuel_used || 0), 0)
    const totalHours = logs.reduce((s, l) => s + (l.hours || 0), 0)
    return totalHours ? totalFuel / totalHours : null
  }

  const getEquipmentEfficiency = (reg) => {
    const fuelEntries = fuelLogs.filter(f => f.vehicle === reg)
    if (!fuelEntries.length) return null
    const totalFuel = fuelEntries.reduce((s, f) => s + (f.amount || 0), 0)
    const equip = earthMovers.find(e => e.reg === reg)
    if (!equip || !equip.hour_meter || !totalFuel) return null
    return totalFuel / equip.hour_meter
  }

  const getNextService = (asset) => {
    const lastService = asset.last_service_date ? new Date(asset.last_service_date) : null
    if (!lastService) return null
    const intervalDays = asset.service_interval_days || asset.metadata?.service_interval_days
    if (intervalDays) {
      const next = new Date(lastService); next.setDate(lastService.getDate() + parseInt(intervalDays))
      return next.toISOString().split('T')[0]
    }
    if (asset.service_interval_km && asset.odometer_km)
      return { type: 'odometer', value: asset.odometer_km + asset.service_interval_km }
    if (asset.service_interval_hours && asset.hour_meter)
      return { type: 'hours', value: asset.hour_meter + asset.service_interval_hours }
    return null
  }

  const getHealthScore = (asset, type) => {
    let score = 100
    const next = getNextService(asset)
    if (next && typeof next === 'string' && new Date(next) < new Date()) score -= 30
    if (type === 'vehicle') {
      const eff = getVehicleFuelEfficiency(asset.reg)
      if (eff?.litersPer100km > 20) score -= 20
      else if (eff?.litersPer100km > 15) score -= 10
    } else if (type === 'generator') {
      const eff = getGeneratorEfficiency(asset.id)
      if (eff && eff > 50) score -= 20; else if (eff && eff > 40) score -= 10
    } else {
      const eff = getEquipmentEfficiency(asset.reg)
      if (eff && eff > 30) score -= 20; else if (eff && eff > 20) score -= 10
    }
    const downtimeCount = downtimeLogs.filter(d => d.asset_id === asset.id).length
    if (downtimeCount > 2) score -= 20; else if (downtimeCount > 0) score -= 10
    return Math.max(0, Math.min(100, score))
  }

  const getHealthStatus = (score) => {
    if (score >= 70) return { label: 'Healthy', color: 'var(--green)', icon: 'check_circle' }
    if (score >= 40) return { label: 'Warning', color: 'var(--yellow)', icon: 'warning' }
    return { label: 'Critical', color: 'var(--red)', icon: 'error' }
  }

  const getOverdueAlerts = () => {
    const today = new Date()
    const alerts = []
    ;[...vehicles, ...generators, ...earthMovers].forEach(a => {
      const next = getNextService(a)
      if (typeof next === 'string' && new Date(next) < today) {
        alerts.push({ asset: a.reg || a.gen_code || a.asset_name, type: a.asset_category || 'asset', message: `Service overdue since ${next}` })
      }
    })
    maintenanceSchedules.forEach(ms => {
      if (ms.next_due_date && new Date(ms.next_due_date) < today) {
        alerts.push({ asset: ms.asset_id, type: 'pm_schedule', message: `PM "${ms.task_name}" overdue since ${ms.next_due_date}`, scheduleId: ms.id })
      }
    })
    return alerts
  }

  const getUpcomingPM = (days = 30) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days)
    return maintenanceSchedules
      .filter(ms => ms.next_due_date && new Date(ms.next_due_date) <= cutoff && ms.is_active !== false)
      .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))
  }

  const getVehicleTyres = (vehicleId) =>
    tyreInventory.filter(t => t.current_vehicle === vehicleId && t.status === 'fitted')

  const getFleetCosts = (fromDate, toDate) => {
    const inRange = (d) => {
      if (!d) return false
      const dt = new Date(d)
      if (fromDate && dt < new Date(fromDate)) return false
      if (toDate   && dt > new Date(toDate))   return false
      return true
    }
    const fuelCost        = fuelLogs.filter(f => inRange(f.date)).reduce((s, f) => s + (f.total_cost || 0), 0)
    const maintenanceCost = workOrders.filter(wo => inRange(wo.actual_end_date) && wo.status === 'closed').reduce((s, wo) => s + (wo.actual_cost || 0), 0)
    const downtimeCost    = downtimeLogs.filter(dl => inRange(dl.breakdown_date)).reduce((s, dl) => s + (dl.repair_cost || 0), 0)
    return { fuelCost, maintenanceCost, downtimeCost, total: fuelCost + maintenanceCost + downtimeCost }
  }

  const getAssetReliability = (assetId) => {
    const events = downtimeLogs.filter(d => d.asset_id === assetId).sort((a, b) => new Date(a.breakdown_date) - new Date(b.breakdown_date))
    if (!events.length) return { mtbf: null, mttr: null, availability: 100, breakdowns: 0 }
    const totalDowntime = events.reduce((s, e) => s + (e.downtime_hours || 0), 0)
    const mttr = totalDowntime / events.length
    const spanHours = events.length > 1 ? (new Date(events[events.length-1].breakdown_date) - new Date(events[0].breakdown_date)) / 3600000 || 1 : 1
    const mtbf = events.length > 1 ? spanHours / (events.length - 1) : null
    const availability = Math.max(0, ((spanHours - totalDowntime) / spanHours) * 100)
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
