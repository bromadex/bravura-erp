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
import { postToGL } from '../engine/accountingEngine'

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
    // identity fields (direct columns on asset_registry)
    make:                       a.make || '',
    model:                      a.model || '',
    year:                       a.year || null,
    colour:                     a.colour || '',
    vin_serial:                 a.vin_serial || '',
    engine_number:              a.engine_number || '',
    chassis_number:             a.chassis_number || '',
    fuel_type:                  a.fuel_type || '',
    // compliance fields stored in metadata
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
    // identity fields
    make:                  v.make || null,
    model:                 v.model || null,
    year:                  v.year ? parseInt(v.year) : null,
    colour:                v.colour || null,
    vin_serial:            v.vin_serial || null,
    engine_number:         v.engine_number || null,
    chassis_number:        v.chassis_number || null,
    fuel_type:             v.fuel_type || null,
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
  // identity fields
  if ('make' in updates)           ar.make = updates.make || null
  if ('model' in updates)          ar.model = updates.model || null
  if ('year' in updates)           ar.year = updates.year ? parseInt(updates.year) : null
  if ('colour' in updates)         ar.colour = updates.colour || null
  if ('vin_serial' in updates)     ar.vin_serial = updates.vin_serial || null
  if ('engine_number' in updates)  ar.engine_number = updates.engine_number || null
  if ('chassis_number' in updates) ar.chassis_number = updates.chassis_number || null
  if ('fuel_type' in updates)      ar.fuel_type = updates.fuel_type || null
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
  const [categoryConfigs, setCategoryConfigs]   = useState([])
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
  const [meterReadings, setMeterReadings]       = useState([])
  const [accidentReports, setAccidentReports]   = useState([])
  const [fleetDocuments, setFleetDocuments]     = useState([])
  const [loading, setLoading]                   = useState(true)

  const generateId = () =>
    crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)

  // ── Fetch ────────────────────────────────────────────────────────────────
  // Prefers asset_registry as source of truth.
  // Falls back to legacy fleet/earth_movers/generators tables for any records
  // not yet migrated, so the UI works before the SQL migration is run.

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        arRes, cfgRes,
        legacyFleetRes, legacyEMRes, legacyGenRes,
        grRes, dtRes, mtRes, fRes, vtRes, ehRes, aiRes,
        msRes, woRes, tiRes, tmRes, mrRes, accRes, fdRes,
      ] = await Promise.all([
        safe(supabase.from('asset_registry').select('*').order('asset_name')),
        safe(supabase.from('asset_category_config').select('*').order('sort_order')),
        safe(supabase.from('fleet').select('*').order('reg')),
        safe(supabase.from('earth_movers').select('*').order('reg')),
        safe(supabase.from('generators').select('*').order('gen_name')),
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
        safe(supabase.from('meter_readings').select('*').order('reading_date', { ascending: false }).limit(500)),
        safe(supabase.from('accident_reports').select('*').order('incident_date', { ascending: false })),
        safe(supabase.from('fleet_documents').select('*').order('expiry_date')),
      ])

      const arRows = arRes.data || []
      // IDs that are already covered by asset_registry (either via id match or source_id match)
      const arIdSet        = new Set(arRows.map(r => r.id))
      const migratedFleet  = new Set(arRows.filter(r => r.source_table === 'fleet').map(r => r.source_id).filter(Boolean))
      const migratedEM     = new Set(arRows.filter(r => r.source_table === 'earth_movers').map(r => r.source_id).filter(Boolean))
      const migratedGen    = new Set(arRows.filter(r => r.source_table === 'generators').map(r => r.source_id).filter(Boolean))

      // Legacy rows not yet in asset_registry — tag with _legacy so writes go to old tables
      const legacyVehicles = (legacyFleetRes.data || [])
        .filter(v => !arIdSet.has(v.id) && !migratedFleet.has(v.id))
        .map(v => ({ ...toVehicle(fromVehicle(v, v.id, v.fleet_code || v.id)), _legacy: true, _legacyTable: 'fleet' }))
      const legacyEM = (legacyEMRes.data || [])
        .filter(e => !arIdSet.has(e.id) && !migratedEM.has(e.id))
        .map(e => ({ ...toEarthMover(fromEarthMover(e, e.id, e.fleet_code || e.id)), _legacy: true, _legacyTable: 'earth_movers' }))
      const legacyGens = (legacyGenRes.data || [])
        .filter(g => !arIdSet.has(g.id) && !migratedGen.has(g.id))
        .map(g => ({ ...toGenerator(fromGenerator(g, g.id, g.gen_code || g.id)), _legacy: true, _legacyTable: 'generators' }))

      setVehicles([
        ...arRows.filter(a => VEHICLE_CATS.includes(a.asset_category)).map(toVehicle),
        ...legacyVehicles,
      ])
      setGenerators([
        ...arRows.filter(a => GENERATOR_CATS.includes(a.asset_category)).map(toGenerator),
        ...legacyGens,
      ])
      setEarthMovers([
        ...arRows.filter(a => !VEHICLE_CATS.includes(a.asset_category) && !GENERATOR_CATS.includes(a.asset_category)).map(toEarthMover),
        ...legacyEM,
      ])
      if (cfgRes?.data) setCategoryConfigs(cfgRes.data)

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
      if (mrRes.data)  setMeterReadings(mrRes.data)
      if (accRes.data) setAccidentReports(accRes.data)
      if (fdRes.data)  setFleetDocuments(fdRes.data)
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
    // Try up to 3 times — self-heals if the counter ever drifts behind existing records
    for (let attempt = 0; attempt < 3; attempt++) {
      let asset_code
      try { asset_code = await generateTxnCode('FL') }
      catch { asset_code = `FL-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()}` }

      const { error } = await supabase.from('asset_registry')
        .insert([{ ...fromVehicle(vehicle, id, asset_code), created_at: new Date().toISOString() }])

      if (!error) {
        auditLog({ module: 'fleet', action: 'CREATE', entityType: 'vehicle', entityId: id, entityName: vehicle.reg || id })
        await fetchAll()
        return
      }
      // On unique-code collision, advance the counter and retry
      if (error.code === '23505' && error.message?.includes('asset_code')) {
        await supabase.rpc('next_txn_code', { p_prefix: 'FL', p_year: new Date().getFullYear() })
        continue
      }
      throw error
    }
    throw new Error('Failed to generate a unique asset code — please try again')
  }

  const updateVehicle = async (id, updates) => {
    const current = vehicles.find(x => x.id === id)
    if (current?._legacy) {
      const leg = {}
      if ('reg' in updates)                leg.reg = updates.reg
      if ('type' in updates)               leg.type = updates.type
      if ('description' in updates)        leg.description = updates.description
      if ('status' in updates)             leg.status = updates.status
      if ('odometer_km' in updates)        leg.odometer_km = parseFloat(updates.odometer_km) || 0
      if ('service_interval_km' in updates) leg.service_interval_km = updates.service_interval_km
      if ('last_service_date' in updates)  leg.last_service_date = updates.last_service_date
      if ('driver_name' in updates)        leg.driver_name = updates.driver_name
      if ('assigned_project' in updates)   leg.assigned_project = updates.assigned_project
      if ('department' in updates)         leg.department = updates.department
      if ('acquisition_cost' in updates)   leg.acquisition_cost = parseFloat(updates.acquisition_cost) || 0
      const { error } = await supabase.from('fleet').update(leg).eq('id', id)
      if (error) throw error
    } else {
      const arUpdates = vehicleUpdateToAR(updates, current)
      const { error } = await supabase.from('asset_registry').update(arUpdates).eq('id', id)
      if (error) throw error
    }
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'vehicle', entityId: id, entityName: current?.reg || id })
    await fetchAll()
  }

  const deleteVehicle = async (id) => {
    const v = vehicles.find(x => x.id === id)
    const table = v?._legacy ? 'fleet' : 'asset_registry'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'vehicle', entityId: id, entityName: v?.reg || id })
    await fetchAll()
  }

  // ── Generator CRUD → asset_registry ──────────────────────────────────────

  const addGenerator = async (generator) => {
    const id = generateId()
    for (let attempt = 0; attempt < 3; attempt++) {
      let asset_code
      try { asset_code = await generateTxnCode('GN') }
      catch { asset_code = `GN-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()}` }
      const { error } = await supabase.from('asset_registry')
        .insert([{ ...fromGenerator(generator, id, asset_code), created_at: new Date().toISOString() }])
      if (!error) {
        auditLog({ module: 'fleet', action: 'CREATE', entityType: 'generator', entityId: id, entityName: generator.gen_code || id })
        await fetchAll()
        return
      }
      if (error.code === '23505' && error.message?.includes('asset_code')) {
        await supabase.rpc('next_txn_code', { p_prefix: 'GN', p_year: new Date().getFullYear() })
        continue
      }
      throw error
    }
    throw new Error('Failed to generate a unique asset code — please try again')
  }

  const updateGenerator = async (id, updates) => {
    const g = generators.find(x => x.id === id)
    if (g?._legacy) {
      const leg = {}
      if ('gen_name' in updates)         leg.gen_name = updates.gen_name
      if ('gen_code' in updates)         leg.gen_code = updates.gen_code
      if ('status' in updates)           leg.status = updates.status
      if ('description' in updates)      leg.description = updates.description
      if ('assigned_project' in updates) leg.assigned_project = updates.assigned_project
      if ('department' in updates)       leg.department = updates.department
      const { error } = await supabase.from('generators').update(leg).eq('id', id)
      if (error) throw error
    } else {
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
    }
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  const deleteGenerator = async (id) => {
    const g = generators.find(x => x.id === id)
    const table = g?._legacy ? 'generators' : 'asset_registry'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'generator', entityId: id, entityName: g?.gen_code || id })
    await fetchAll()
  }

  // ── Earth Mover / Equipment CRUD → asset_registry ────────────────────────

  const addEarthMover = async (equipment) => {
    const id = generateId()
    for (let attempt = 0; attempt < 3; attempt++) {
      let asset_code
      try { asset_code = await generateTxnCode('EM') }
      catch { asset_code = `EM-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()}` }
      const { error } = await supabase.from('asset_registry')
        .insert([{ ...fromEarthMover(equipment, id, asset_code), created_at: new Date().toISOString() }])
      if (!error) {
        auditLog({ module: 'fleet', action: 'CREATE', entityType: 'heavy_equipment', entityId: id, entityName: equipment.reg || id })
        await fetchAll()
        return
      }
      if (error.code === '23505' && error.message?.includes('asset_code')) {
        await supabase.rpc('next_txn_code', { p_prefix: 'EM', p_year: new Date().getFullYear() })
        continue
      }
      throw error
    }
    throw new Error('Failed to generate a unique asset code — please try again')
  }

  const updateEarthMover = async (id, updates) => {
    const current = earthMovers.find(x => x.id === id)
    if (current?._legacy) {
      const leg = {}
      if ('reg' in updates)                   leg.reg = updates.reg
      if ('type' in updates)                  leg.type = updates.type
      if ('description' in updates)           leg.description = updates.description
      if ('status' in updates)                leg.status = updates.status
      if ('hour_meter' in updates)            leg.hour_meter = parseFloat(updates.hour_meter) || 0
      if ('service_interval_hours' in updates) leg.service_interval_hours = updates.service_interval_hours
      if ('last_service_date' in updates)     leg.last_service_date = updates.last_service_date
      if ('driver_name' in updates)           leg.driver_name = updates.driver_name
      if ('assigned_project' in updates)      leg.assigned_project = updates.assigned_project
      if ('department' in updates)            leg.department = updates.department
      const { error } = await supabase.from('earth_movers').update(leg).eq('id', id)
      if (error) throw error
    } else {
      const arUpdates = earthMoverUpdateToAR(updates, current)
      const { error } = await supabase.from('asset_registry').update(arUpdates).eq('id', id)
      if (error) throw error
    }
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'heavy_equipment', entityId: id, entityName: current?.reg || id })
    await fetchAll()
  }

  const deleteEarthMover = async (id) => {
    const e = earthMovers.find(x => x.id === id)
    const table = e?._legacy ? 'earth_movers' : 'asset_registry'
    const { error } = await supabase.from(table).delete().eq('id', id)
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
      if (vehicle._legacy) {
        await supabase.from('fleet').update({ odometer_km: trip.end_odometer }).eq('id', trip.vehicle_id)
      } else {
        await supabase.from('asset_registry')
          .update({ primary_metric_val: trip.end_odometer, updated_at: new Date().toISOString() })
          .eq('id', trip.vehicle_id)
      }
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
      if (equipment._legacy) {
        await supabase.from('earth_movers').update({ hour_meter: log.end_hour_meter }).eq('id', log.equipment_id)
      } else {
        await supabase.from('asset_registry')
          .update({ primary_metric_val: log.end_hour_meter, updated_at: new Date().toISOString() })
          .eq('id', log.equipment_id)
      }
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

  const closeWorkOrder = async (id, { actual_cost, completion_notes, actual_end_date, odometer_at_service, hour_meter_at_service, parts_used }) => {
    const wo = workOrders.find(x => x.id === id)
    const updates = {
      status: 'closed', actual_cost: actual_cost || null,
      completion_notes: completion_notes || null,
      actual_end_date: actual_end_date || new Date().toISOString().split('T')[0],
    }
    if (odometer_at_service)   updates.odometer_at_service   = odometer_at_service
    if (hour_meter_at_service) updates.hour_meter_at_service = hour_meter_at_service
    // Persist parts_used JSONB (strip UI-only fields like id/search state)
    if (Array.isArray(parts_used) && parts_used.length > 0) {
      updates.parts_used = parts_used.map(p => ({
        part_name:  p.part_name,
        qty:        Number(p.qty) || 0,
        unit_cost:  Number(p.unit_cost) || 0,
        item_id:    p.item_id || null,
        item_code:  p.item_code || null,
        warehouse_id: p.warehouse_id || null,
      }))
    }
    const { error } = await supabase.from('maintenance_work_orders').update(updates).eq('id', id)
    if (error) throw error
    if (wo?.schedule_id) {
      const schedUpdates = { last_done_date: updates.actual_end_date }
      if (odometer_at_service)   schedUpdates.last_done_km    = odometer_at_service
      if (hour_meter_at_service) schedUpdates.last_done_hours = hour_meter_at_service
      await safe(supabase.from('maintenance_schedules').update(schedUpdates).eq('id', wo.schedule_id))
    }
    // Write last service back to asset record (asset_registry or legacy table)
    if (wo?.asset_id) {
      const allAssets = [...vehicles, ...generators, ...earthMovers]
      const asset = allAssets.find(a => a.id === wo.asset_id)
      if (asset?._legacy) {
        await safe(supabase.from(asset._legacyTable)
          .update({ last_service_date: updates.actual_end_date }).eq('id', wo.asset_id))
      } else {
        const serviceUpdate = { last_service_date: updates.actual_end_date, updated_at: new Date().toISOString() }
        if (odometer_at_service)   serviceUpdate.last_service_val = odometer_at_service
        if (hour_meter_at_service) serviceUpdate.last_service_val = hour_meter_at_service
        await safe(supabase.from('asset_registry').update(serviceUpdate).eq('id', wo.asset_id))
      }
    }
    auditLog({ module: 'fleet', action: 'CLOSE', entityType: 'work_order', entityId: id, entityName: wo?.wo_number || id })
    await fetchAll()
  }

  // ── Meter Readings ────────────────────────────────────────────────────────

  const addMeterReading = async (reading) => {
    // Validate: new reading must be >= last reading for this asset
    const lastReading = meterReadings
      .filter(r => r.asset_id === reading.asset_id && r.reading_type === reading.reading_type)
      .sort((a, b) => new Date(b.reading_date) - new Date(a.reading_date))[0]
    if (lastReading && parseFloat(reading.reading_value) < parseFloat(lastReading.reading_value)) {
      throw new Error(`Meter reading cannot decrease. Last value: ${lastReading.reading_value}`)
    }
    const id = generateId()
    const { error } = await supabase.from('meter_readings').insert([{
      id, ...reading, created_at: new Date().toISOString(),
    }])
    if (error) throw error
    // Update asset_registry primary_metric_val
    await safe(supabase.from('asset_registry')
      .update({ primary_metric_val: parseFloat(reading.reading_value), updated_at: new Date().toISOString() })
      .eq('id', reading.asset_id))
    auditLog({ module: 'fleet', action: 'METER', entityType: 'meter_reading', entityId: id, entityName: reading.asset_id })
    await fetchAll()
  }

  const getAssetMeterHistory = (assetId, readingType = 'odometer') =>
    meterReadings.filter(r => r.asset_id === assetId && r.reading_type === readingType)
      .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date))

  // ── Accident Reports ──────────────────────────────────────────────────────

  const addAccidentReport = async (report) => {
    const id = generateId()
    const report_number = await generateTxnCode('ACC').catch(() => `ACC-${Date.now()}`)
    const { error } = await supabase.from('accident_reports').insert([{
      id, report_number, ...report, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'accident_report', entityId: id, entityName: report_number })
    await fetchAll()
    return report_number
  }

  const updateAccidentReport = async (id, updates) => {
    const { error } = await supabase.from('accident_reports')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'accident_report', entityId: id })
    await fetchAll()
  }

  // ── Fleet Documents ───────────────────────────────────────────────────────

  const addFleetDocument = async (doc) => {
    const id = generateId()
    const { error } = await supabase.from('fleet_documents').insert([{
      id, ...doc, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }])
    if (error) throw error
    auditLog({ module: 'fleet', action: 'CREATE', entityType: 'fleet_document', entityId: id, entityName: doc.doc_type })
    await fetchAll()
  }

  const updateFleetDocument = async (id, updates) => {
    const { error } = await supabase.from('fleet_documents')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteFleetDocument = async (id) => {
    const { error } = await supabase.from('fleet_documents').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const getExpiringDocuments = (days = 30) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days)
    const today = new Date()
    return fleetDocuments.filter(d => {
      if (!d.expiry_date || !d.is_active) return false
      const exp = new Date(d.expiry_date)
      return exp <= cutoff
    }).sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
  }

  // Compute expiry warnings from asset metadata fields (before fleet_documents populated)
  const getAssetExpiryWarnings = (days = 30) => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days)
    const warnings = []
    vehicles.forEach(v => {
      const checks = [
        { field: 'licence_expiry', label: 'License' },
        { field: 'insurance_expiry', label: 'Insurance' },
        { field: 'roadworthy_expiry', label: 'Roadworthy' },
      ]
      checks.forEach(({ field, label }) => {
        const dateStr = v[field] || v.metadata?.[field]
        if (!dateStr) return
        const exp = new Date(dateStr)
        if (exp <= cutoff) {
          const daysLeft = Math.ceil((exp - new Date()) / 86400000)
          warnings.push({
            asset: v.reg, assetId: v.id, type: label,
            expiry: dateStr, daysLeft, overdue: daysLeft < 0,
          })
        }
      })
    })
    return warnings.sort((a, b) => a.daysLeft - b.daysLeft)
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
    await safe(supabase.from('tyre_inventory').update(tyreUpdates).eq('id', movement.tyre_id))
    await fetchAll()
  }

  // ── Reclassification ─────────────────────────────────────────────────────
  // Moves any fleet asset to a new category.
  // Handles both legacy (old-table) and asset_registry records.
  // Legacy records are auto-migrated into asset_registry on reclassify.

  const reclassifyFleetAsset = async (assetId, newCategory, reason) => {
    const all = [...vehicles, ...generators, ...earthMovers]
    const asset = all.find(a => a.id === assetId)
    if (!asset) throw new Error('Asset not found')

    const fromCat = asset.asset_category ||
      (vehicles.find(v => v.id === assetId) ? 'Vehicle' :
       generators.find(g => g.id === assetId) ? 'Generator' : 'Heavy Equipment')

    if (fromCat === newCategory) throw new Error('Already in this category')

    const FALLBACK_CATS = [
      { category: 'Vehicle',         measurement_type: 'km',    service_interval_basis: 'km'    },
      { category: 'Generator',       measurement_type: 'hours', service_interval_basis: 'hours' },
      { category: 'Heavy Equipment', measurement_type: 'hours', service_interval_basis: 'hours' },
      { category: 'Light Equipment', measurement_type: 'hours', service_interval_basis: 'hours' },
      { category: 'Water Pump',      measurement_type: 'hours', service_interval_basis: 'hours' },
      { category: 'Compressor',      measurement_type: 'hours', service_interval_basis: 'hours' },
      { category: 'Fixed Plant',     measurement_type: 'fixed', service_interval_basis: 'hours' },
    ]
    const configs = categoryConfigs.length ? categoryConfigs : FALLBACK_CATS
    const fromCfg = configs.find(c => c.category === fromCat)
    const toCfg   = configs.find(c => c.category === newCategory)
    const toMeasurement = toCfg?.measurement_type || 'hours'
    const measurementChanging = (fromCfg?.measurement_type || 'km') !== toMeasurement

    // Archive the old metric value if measurement type changes
    const archived = {}
    if (measurementChanging) {
      const pfx = fromCat.toLowerCase().replace(/ /g, '_')
      archived[`${pfx}_metric`] = asset.primary_metric_val ?? asset.odometer_km ?? asset.hour_meter ?? 0
      archived[`${pfx}_measurement_type`] = fromCfg?.measurement_type || 'km'
    }

    const txnCode = await generateTxnCode('AR').catch(() => `AR-${Date.now()}`)
    const now   = new Date().toISOString()
    const today = now.split('T')[0]

    if (asset._legacy) {
      // Auto-migrate to asset_registry with the new category in one step
      const assetCode = await generateTxnCode('AS').catch(() => `AS-${Date.now()}`)
      const { error } = await supabase.from('asset_registry').insert([{
        id: assetId,
        asset_code: assetCode,
        asset_name: asset.reg || asset.gen_name || asset.asset_name || 'Unknown',
        asset_category: newCategory,
        measurement_type: toMeasurement,
        service_interval_basis: toCfg?.service_interval_basis || 'hours',
        primary_metric_val: measurementChanging ? 0 : (asset.primary_metric_val ?? asset.odometer_km ?? asset.hour_meter ?? 0),
        plate_number: asset.reg || asset.plate_number || '',
        status: asset.status || 'Active',
        assigned_project: asset.assigned_project || '',
        source_table: asset._legacyTable,
        source_id: assetId,
        archived_fields: archived,
        created_by: 'Reclassification',
        created_at: now,
      }])
      if (error) throw error
    } else {
      const upd = {
        asset_category: newCategory,
        measurement_type: toMeasurement,
        service_interval_basis: toCfg?.service_interval_basis || 'hours',
        archived_fields: { ...(asset.archived_fields || {}), ...archived },
        updated_at: now,
      }
      if (measurementChanging) {
        upd.primary_metric_val = 0
        upd.service_interval   = null
        upd.last_service_val   = null
      }
      const { error } = await supabase.from('asset_registry').update(upd).eq('id', assetId)
      if (error) throw error
    }

    // Reclassification audit log
    await safe(supabase.from('asset_reclassification_log').insert([{
      id: generateId(),
      txn_code: txnCode,
      asset_id: assetId,
      asset_code: asset.asset_code || asset.fleet_code || asset.gen_code || assetId,
      asset_name: asset.reg || asset.gen_name || asset.asset_name || 'Unknown',
      from_category: fromCat,
      to_category: newCategory,
      from_measurement_type: fromCfg?.measurement_type,
      to_measurement_type: toMeasurement,
      reason,
      archived_fields: archived,
      migrated_fields: {},
      status: 'Completed',
      requested_by: 'User',
      created_at: now,
    }]))

    // Timeline entry for asset_registry records
    if (!asset._legacy) {
      await safe(supabase.from('asset_timeline').insert([{
        id: generateId(), asset_id: assetId, event_type: 'reclassified',
        event_date: today,
        title: `Reclassified: ${fromCat} → ${newCategory}`,
        description: reason,
        metadata: { txn_code: txnCode, measurement_change: measurementChanging },
        created_by: 'User',
      }]))
    }

    auditLog({
      module: 'fleet', action: 'RECLASSIFY', entityType: 'asset',
      entityId: assetId, entityName: asset.reg || asset.gen_name || 'Asset',
      txnCode, details: `${fromCat} → ${newCategory}: ${reason}`,
    })

    await fetchAll()
    return txnCode
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
      meterReadings, accidentReports, fleetDocuments,
      categoryConfigs,
      loading,
      addVehicle, updateVehicle, deleteVehicle,
      addGenerator, updateGenerator, deleteGenerator,
      addEarthMover, updateEarthMover, deleteEarthMover,
      reclassifyFleetAsset,
      addGenRunLog, deleteGenRunLog,
      addVehicleTrip, addEquipmentHourLog,
      addAssetIssue, updateAssetIssue,
      addMaintenanceLog, addDowntimeLog, closeDowntimeLog,
      addMaintenanceSchedule, updateMaintenanceSchedule, deleteMaintenanceSchedule,
      createWorkOrder, updateWorkOrder, closeWorkOrder,
      addTyre, updateTyre, scrapTyre,
      recordTyreMovement,
      addMeterReading, getAssetMeterHistory,
      addAccidentReport, updateAccidentReport,
      addFleetDocument, updateFleetDocument, deleteFleetDocument,
      getExpiringDocuments, getAssetExpiryWarnings,
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
