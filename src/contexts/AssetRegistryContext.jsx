// src/contexts/AssetRegistryContext.jsx
// Unified Asset Registry — single source of truth for all physical assets.
// Abstracts over vehicles, earth_movers, generators with configurable categories.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { auditLog } from '../engine/auditEngine'
import { generateTxnCode } from '../utils/txnCode'
import toast from 'react-hot-toast'

const AssetRegistryContext = createContext(null)

export function AssetRegistryProvider({ children }) {
  const { user } = useAuth()
  const [assets, setAssets]               = useState([])
  const [categoryConfigs, setCategoryConfigs] = useState([])
  const [reclassLogs, setReclassLogs]     = useState([])
  const [loading, setLoading]             = useState(true)

  const generateId = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).substr(2)

  const userName = () => user?.full_name || user?.username || 'System'

  // ── Data loading ────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [assetRes, configRes, logRes] = await Promise.all([
        supabase.from('asset_registry').select('*').order('asset_code'),
        supabase.from('asset_category_config').select('*').order('sort_order'),
        supabase.from('asset_reclassification_log')
          .select('*').order('created_at', { ascending: false }).limit(200),
      ])
      setAssets(assetRes.data || [])
      setCategoryConfigs(configRes.data || [])
      setReclassLogs(logRes.data || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load asset registry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Category config helpers ──────────────────────────────────────────────

  const getCategoryConfig = (category) =>
    categoryConfigs.find(c => c.category === category) || null

  const createCategoryConfig = async (data) => {
    const id = generateId()
    const { error } = await supabase.from('asset_category_config')
      .insert([{ id, ...data, created_by: userName() }])
    if (error) throw error
    auditLog({ module: 'assets', action: 'CREATE', entityType: 'asset_category_config', entityId: id, entityName: data.category, userName: userName() })
    await fetchAll()
  }

  const updateCategoryConfig = async (id, updates) => {
    const { error } = await supabase.from('asset_category_config')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'assets', action: 'UPDATE', entityType: 'asset_category_config', entityId: id, userName: userName() })
    await fetchAll()
  }

  // ── Asset CRUD ───────────────────────────────────────────────────────────

  const createAsset = async (data) => {
    const id = generateId()
    const asset_code = await generateTxnCode('AS')
    const config = getCategoryConfig(data.asset_category)
    const payload = {
      id,
      asset_code,
      measurement_type: config?.measurement_type || 'hours',
      service_interval_basis: config?.service_interval_basis || 'hours',
      ...data,
      created_by: userName(),
    }
    const { error } = await supabase.from('asset_registry').insert([payload])
    if (error) throw error
    await supabase.from('asset_timeline').insert([{
      id: generateId(), asset_id: id, event_type: 'registered',
      event_date: new Date().toISOString().split('T')[0],
      title: 'Asset Registered',
      description: `Registered as ${data.asset_category} — ${asset_code}`,
      created_by: userName(),
    }])
    auditLog({ module: 'assets', action: 'CREATE', entityType: 'asset_registry', entityId: id, entityName: data.asset_name, txnCode: asset_code, userName: userName() })
    await fetchAll()
    return { id, asset_code }
  }

  const updateAsset = async (id, updates) => {
    const prev = assets.find(a => a.id === id)
    const { error } = await supabase.from('asset_registry')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    // Timeline: track status changes
    if (updates.status && prev?.status !== updates.status) {
      await supabase.from('asset_timeline').insert([{
        id: generateId(), asset_id: id, event_type: 'status_change',
        event_date: new Date().toISOString().split('T')[0],
        title: `Status: ${prev?.status} → ${updates.status}`,
        created_by: userName(),
      }])
    }
    auditLog({ module: 'assets', action: 'UPDATE', entityType: 'asset_registry', entityId: id, entityName: prev?.asset_name, oldValues: prev, newValues: updates, userName: userName() })
    await fetchAll()
  }

  const deleteAsset = async (id) => {
    const asset = assets.find(a => a.id === id)
    const { error } = await supabase.from('asset_registry').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'assets', action: 'DELETE', entityType: 'asset_registry', entityId: id, entityName: asset?.asset_name, userName: userName() })
    await fetchAll()
  }

  // ── Reclassification Engine ──────────────────────────────────────────────
  // Moves an asset to a new category.
  // Preserves history, archives incompatible metric fields, writes full audit trail.

  const reclassifyAsset = async (assetId, newCategory, reason, notes = '') => {
    const asset = assets.find(a => a.id === assetId)
    if (!asset) throw new Error('Asset not found')
    if (asset.asset_category === newCategory) throw new Error('Asset is already in this category')

    const fromConfig = getCategoryConfig(asset.asset_category)
    const toConfig   = getCategoryConfig(newCategory)
    if (!toConfig) throw new Error('Target category not found in configuration')

    const measurementChanging = fromConfig?.measurement_type !== toConfig.measurement_type

    // Archive fields that are incompatible with the new measurement mode
    const newArchived = {}
    if (measurementChanging) {
      const prefix = (asset.asset_category || 'prev').toLowerCase().replace(/ /g, '_')
      newArchived[`${prefix}_primary_metric_val`]   = asset.primary_metric_val
      newArchived[`${prefix}_service_interval`]     = asset.service_interval
      newArchived[`${prefix}_last_service_val`]     = asset.last_service_val
      newArchived[`${prefix}_measurement_type`]     = asset.measurement_type
      newArchived[`${prefix}_service_interval_basis`] = asset.service_interval_basis
    }
    const mergedArchived = { ...(asset.archived_fields || {}), ...newArchived }

    const txnCode = await generateTxnCode('AR')

    // Build update payload
    const assetUpdate = {
      asset_category:        newCategory,
      measurement_type:      toConfig.measurement_type,
      service_interval_basis: toConfig.service_interval_basis,
      archived_fields:       mergedArchived,
      updated_at:            new Date().toISOString(),
    }
    if (measurementChanging) {
      assetUpdate.primary_metric_val = 0
      assetUpdate.service_interval   = null
      assetUpdate.last_service_val   = null
    }

    const { error: updateErr } = await supabase
      .from('asset_registry').update(assetUpdate).eq('id', assetId)
    if (updateErr) throw updateErr

    // Write reclassification log
    const { error: logErr } = await supabase.from('asset_reclassification_log').insert([{
      id: generateId(), txn_code: txnCode,
      asset_id: assetId, asset_code: asset.asset_code, asset_name: asset.asset_name,
      from_category: asset.asset_category, to_category: newCategory,
      from_measurement_type: fromConfig?.measurement_type,
      to_measurement_type: toConfig.measurement_type,
      reason, archived_fields: newArchived, migrated_fields: {},
      status: 'Completed', requested_by: userName(), notes,
    }])
    if (logErr) throw logErr

    // Asset timeline
    await supabase.from('asset_timeline').insert([{
      id: generateId(), asset_id: assetId, event_type: 'reclassified',
      event_date: new Date().toISOString().split('T')[0],
      title: `Reclassified: ${asset.asset_category} → ${newCategory}`,
      description: reason,
      metadata: { txn_code: txnCode, from: asset.asset_category, to: newCategory, measurement_change: measurementChanging },
      created_by: userName(),
    }])

    auditLog({
      module: 'assets', action: 'UPDATE', entityType: 'asset_registry',
      entityId: assetId, entityName: asset.asset_name, txnCode,
      oldValues: { category: asset.asset_category, measurement_type: fromConfig?.measurement_type },
      newValues: { category: newCategory, measurement_type: toConfig.measurement_type },
      details: reason, userName: userName(),
    })

    await fetchAll()
    return txnCode
  }

  // ── Import from existing source tables ───────────────────────────────────

  const _importBatch = async (sourceTable, records, mapper) => {
    const { data: existingData } = await supabase
      .from('asset_registry').select('source_id').eq('source_table', sourceTable)
    const existingIds = new Set((existingData || []).map(r => r.source_id))
    const toImport = records.filter(r => !existingIds.has(r.id))
    let count = 0
    for (const v of toImport) {
      const asset_code = await generateTxnCode('AS')
      // Use source record's own ID so existing FK references (maintenance_logs, work_orders) still resolve
      const id = v.id
      const payload = mapper(v, id, asset_code)
      const { error } = await supabase.from('asset_registry').insert([payload])
      if (!error) {
        await supabase.from('asset_timeline').insert([{
          id: generateId(), asset_id: id, event_type: 'registered',
          event_date: new Date().toISOString().split('T')[0],
          title: `Imported from ${sourceTable}`,
          description: `Original ID: ${v.id}`,
          created_by: userName(),
        }])
        count++
      }
    }
    return count
  }

  const importFromVehicles = async () => {
    const { data, error } = await supabase.from('vehicles').select('*')
    if (error) throw error
    return _importBatch('vehicles', data || [], (v, id, asset_code) => ({
      id, asset_code, source_table: 'vehicles', source_id: v.id,
      asset_name: v.reg || v.description || 'Unknown Vehicle',
      asset_category: 'Vehicle', asset_subtype: v.type || '',
      measurement_type: 'km', primary_metric_val: v.odometer_km || 0,
      service_interval: v.service_interval_km, service_interval_basis: 'km',
      last_service_date: v.last_service_date, plate_number: v.reg,
      status: v.status || 'Active', assigned_project: v.assigned_project,
      department: v.department, purchase_cost: v.acquisition_cost || 0,
      purchase_date: v.acquisition_date, created_by: userName(),
    }))
  }

  const importFromEarthMovers = async () => {
    const { data, error } = await supabase.from('earth_movers').select('*')
    if (error) throw error
    return _importBatch('earth_movers', data || [], (v, id, asset_code) => ({
      id, asset_code, source_table: 'earth_movers', source_id: v.id,
      asset_name: v.reg || v.description || 'Unknown Equipment',
      asset_category: 'Heavy Equipment', measurement_type: 'hours',
      primary_metric_val: v.hour_meter || 0, service_interval_basis: 'hours',
      plate_number: v.reg, status: v.status || 'Active',
      created_by: userName(),
    }))
  }

  const importFromGenerators = async () => {
    const { data, error } = await supabase.from('generators').select('*')
    if (error) throw error
    return _importBatch('generators', data || [], (v, id, asset_code) => ({
      id, asset_code, source_table: 'generators', source_id: v.id,
      asset_name: v.gen_name || v.gen_code || 'Unknown Generator',
      asset_category: 'Generator', measurement_type: 'hours',
      primary_metric_val: 0, service_interval_basis: 'hours',
      status: v.status || 'Active', created_by: userName(),
    }))
  }

  // ── Asset timeline fetch ─────────────────────────────────────────────────

  const getAssetTimeline = async (assetId) => {
    const { data, error } = await supabase.from('asset_timeline')
      .select('*').eq('asset_id', assetId)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  // ── Derived helpers ──────────────────────────────────────────────────────

  const getAssetsByCategory = () => {
    const map = {}
    for (const a of assets) {
      map[a.asset_category] = (map[a.asset_category] || 0) + 1
    }
    return map
  }

  const getServiceDueAssets = () => {
    return assets.filter(a => {
      if (!a.service_interval || !a.last_service_val) return false
      const threshold = a.service_interval * 0.9
      return a.primary_metric_val >= (a.last_service_val + threshold)
    })
  }

  return (
    <AssetRegistryContext.Provider value={{
      assets,
      categoryConfigs,
      reclassLogs,
      loading,
      fetchAll,
      getCategoryConfig,
      createCategoryConfig,
      updateCategoryConfig,
      createAsset,
      updateAsset,
      deleteAsset,
      reclassifyAsset,
      importFromVehicles,
      importFromEarthMovers,
      importFromGenerators,
      getAssetTimeline,
      getAssetsByCategory,
      getServiceDueAssets,
    }}>
      {children}
    </AssetRegistryContext.Provider>
  )
}

export function useAssetRegistry() {
  const ctx = useContext(AssetRegistryContext)
  if (!ctx) throw new Error('useAssetRegistry must be used inside AssetRegistryProvider')
  return ctx
}
