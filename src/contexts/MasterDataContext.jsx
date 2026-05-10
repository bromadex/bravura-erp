// src/contexts/MasterDataContext.jsx
//
// Central registry for all master / reference data used across modules.
// Other contexts (HRContext, ProcurementContext, etc.) should source
// departments, designations, suppliers, cost centers, and sites from here
// rather than maintaining their own copies.
//
// Required Supabase tables (run migration if missing):
//
//   -- Already exists:
//   departments  (id, name, code, hod_id, created_at)
//   designations (id, title, grade, created_at)
//   suppliers    (id, name, contact_person, phone, email, address, category, created_at)
//
//   -- New tables (run once):
//   CREATE TABLE IF NOT EXISTS cost_centers (
//     id          TEXT PRIMARY KEY,
//     code        TEXT NOT NULL UNIQUE,
//     name        TEXT NOT NULL,
//     description TEXT,
//     active      BOOLEAN NOT NULL DEFAULT TRUE,
//     created_at  TIMESTAMPTZ DEFAULT now()
//   );
//
//   CREATE TABLE IF NOT EXISTS sites (
//     id          TEXT PRIMARY KEY,
//     code        TEXT NOT NULL UNIQUE,
//     name        TEXT NOT NULL,
//     location    TEXT,
//     manager     TEXT,
//     active      BOOLEAN NOT NULL DEFAULT TRUE,
//     created_at  TIMESTAMPTZ DEFAULT now()
//   );

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { auditLog } from '../engine/auditEngine'

const MasterDataContext = createContext(null)

export function useMasterData() {
  const ctx = useContext(MasterDataContext)
  if (!ctx) throw new Error('useMasterData must be used inside MasterDataProvider')
  return ctx
}

export function MasterDataProvider({ children }) {
  const [departments,  setDepartments]  = useState([])
  const [designations, setDesignations] = useState([])
  const [suppliers,    setSuppliers]    = useState([])
  const [costCenters,  setCostCenters]  = useState([])
  const [sites,        setSites]        = useState([])
  const [loading,      setLoading]      = useState(true)

  const generateId = () => crypto.randomUUID()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [deptRes, desRes, supRes, ccRes, siteRes] = await Promise.all([
        supabase.from('departments').select('*').order('name'),
        supabase.from('designations').select('*').order('title'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('cost_centers').select('*').order('code'),
        supabase.from('sites').select('*').order('name'),
      ])
      if (deptRes.data) setDepartments(deptRes.data)
      if (desRes.data)  setDesignations(desRes.data)
      if (supRes.data)  setSuppliers(supRes.data)
      if (ccRes.data)   setCostCenters(ccRes.data)
      if (siteRes.data) setSites(siteRes.data)
    } catch (err) {
      console.error('MasterData fetch error:', err)
      toast.error('Failed to load master data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Departments ──────────────────────────────────────────
  const addDepartment = async (dept) => {
    const id = generateId()
    const { error } = await supabase.from('departments').insert([{ id, ...dept, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'settings', action: 'CREATE', entityType: 'department', entityId: id, entityName: dept.name })
    await fetchAll()
    return id
  }

  const updateDepartment = async (id, updates) => {
    const { error } = await supabase.from('departments').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'UPDATE', entityType: 'department', entityId: id, entityName: updates.name })
    await fetchAll()
  }

  const deleteDepartment = async (id) => {
    const dept = departments.find(d => d.id === id)
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'DELETE', entityType: 'department', entityId: id, entityName: dept?.name })
    await fetchAll()
  }

  // ── Designations ─────────────────────────────────────────
  const addDesignation = async (des) => {
    const id = generateId()
    const { error } = await supabase.from('designations').insert([{ id, ...des, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'settings', action: 'CREATE', entityType: 'designation', entityId: id, entityName: des.title })
    await fetchAll()
    return id
  }

  const updateDesignation = async (id, updates) => {
    const { error } = await supabase.from('designations').update(updates).eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'UPDATE', entityType: 'designation', entityId: id, entityName: updates.title })
    await fetchAll()
  }

  const deleteDesignation = async (id) => {
    const des = designations.find(d => d.id === id)
    const { error } = await supabase.from('designations').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'DELETE', entityType: 'designation', entityId: id, entityName: des?.title })
    await fetchAll()
  }

  // ── Suppliers ────────────────────────────────────────────
  const addSupplier = async (supplier) => {
    const id = generateId()
    const { error } = await supabase.from('suppliers').insert([{ id, ...supplier, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'settings', action: 'CREATE', entityType: 'supplier', entityId: id, entityName: supplier.name })
    await fetchAll()
    return id
  }

  const updateSupplier = async (id, updates) => {
    const { error } = await supabase.from('suppliers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'UPDATE', entityType: 'supplier', entityId: id, entityName: updates.name })
    await fetchAll()
  }

  const deleteSupplier = async (id) => {
    const sup = suppliers.find(s => s.id === id)
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) throw error
    auditLog({ module: 'settings', action: 'DELETE', entityType: 'supplier', entityId: id, entityName: sup?.name })
    await fetchAll()
  }

  // ── Cost Centers ─────────────────────────────────────────
  const addCostCenter = async (cc) => {
    const id = generateId()
    const { error } = await supabase.from('cost_centers').insert([{ id, ...cc, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'settings', action: 'CREATE', entityType: 'cost_center', entityId: id, entityName: cc.name })
    await fetchAll()
    return id
  }

  const updateCostCenter = async (id, updates) => {
    const { error } = await supabase.from('cost_centers').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteCostCenter = async (id) => {
    const { error } = await supabase.from('cost_centers').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Sites ────────────────────────────────────────────────
  const addSite = async (site) => {
    const id = generateId()
    const { error } = await supabase.from('sites').insert([{ id, ...site, created_at: new Date().toISOString() }])
    if (error) throw error
    auditLog({ module: 'settings', action: 'CREATE', entityType: 'site', entityId: id, entityName: site.name })
    await fetchAll()
    return id
  }

  const updateSite = async (id, updates) => {
    const { error } = await supabase.from('sites').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteSite = async (id) => {
    const { error } = await supabase.from('sites').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  return (
    <MasterDataContext.Provider value={{
      departments, designations, suppliers, costCenters, sites, loading,
      addDepartment, updateDepartment, deleteDepartment,
      addDesignation, updateDesignation, deleteDesignation,
      addSupplier, updateSupplier, deleteSupplier,
      addCostCenter, updateCostCenter, deleteCostCenter,
      addSite, updateSite, deleteSite,
      refresh: fetchAll,
    }}>
      {children}
    </MasterDataContext.Provider>
  )
}
