// src/contexts/AuthContext.jsx
//
// CHANGES:
// 1. fetchUserPermissions now loads designation permissions as the LOWEST
//    priority layer (designation → role → user-specific overrides).
//    Priority order (each level can override the one below):
//      designation_permissions  (lowest — job-title baseline)
//      role_permissions         (medium — system role)
//      user_permissions         (highest — individual overrides)
//
//    hr|leave and hr|leave-balance are ALWAYS injected for every active
//    user regardless of their other permissions. Every employee needs leave.
//
// 2. setEmployeeStatus now deactivates / reactivates the app_users account
//    when the employee is Suspended, Terminated, or reverted to Active.
//    (The actual setEmployeeStatus call lives in HRContext — AuthContext
//    exposes refreshPermissions so HRContext can trigger a reload.)

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading,     setLoading]     = useState(true)

  // ── fetchUserPermissions ────────────────────────────────────────
  // Merge order: designation (lowest) → role → user override (highest)
  // hr|leave and hr|leave-balance are always granted.
  const fetchUserPermissions = async (userId) => {
    try {
      // 1. Get user's role_id and employee record for designation lookup
      const { data: userData } = await supabase
        .from('app_users')
        .select('role_id, employee_id')
        .eq('id', userId)
        .single()
      if (!userData) return []

      // 2. Get designation_id from employees table (if linked)
      let designationId = null
      if (userData.employee_id) {
        const { data: emp } = await supabase
          .from('employees')
          .select('designation_id')
          .eq('id', userData.employee_id)
          .single()
        designationId = emp?.designation_id || null
      }

      // 3. Fetch all three permission layers in parallel
      const [roleRes, userRes, desigRes] = await Promise.all([
        supabase.from('role_permissions').select('*').eq('role_id', userData.role_id),
        supabase.from('user_permissions').select('*').eq('user_id', userId),
        designationId
          ? supabase.from('designation_permissions').select('*').eq('designation_id', designationId)
          : Promise.resolve({ data: [] }),
      ])

      const rolePerms  = roleRes.data  || []
      const userPerms  = userRes.data  || []
      const desigPerms = desigRes.data || []

      // 4. Build merged map — last write wins, so apply lowest→highest
      const map = new Map()

      const applyLayer = (perms) => {
        perms.forEach(p => {
          const key = `${p.module_name}|${p.page_name || ''}`
          map.set(key, {
            can_view:    p.can_view    ?? false,
            can_edit:    p.can_edit    ?? false,
            can_delete:  p.can_delete  ?? false,
            can_approve: p.can_approve ?? false,
          })
        })
      }

      applyLayer(desigPerms)  // lowest priority
      applyLayer(rolePerms)
      applyLayer(userPerms)   // highest priority

      // 5. Always grant hr|leave and hr|leave-balance (every employee
      //    must be able to apply for leave regardless of other permissions)
      const leaveKey   = 'hr|leave'
      const balanceKey = 'hr|leave-balance'
      if (!map.get(leaveKey)?.can_view) {
        map.set(leaveKey, { can_view: true, can_edit: true, can_delete: false, can_approve: false })
      }
      if (!map.get(balanceKey)?.can_view) {
        map.set(balanceKey, { can_view: true, can_edit: false, can_delete: false, can_approve: false })
      }

      // 6. Convert map → array
      const merged = Array.from(map.entries()).map(([key, perms]) => {
        const [module_name, page_name] = key.split('|')
        return { module_name, page_name: page_name || null, ...perms }
      })

      // 7. Cache in localStorage for PermissionContext to read on reload
      const permsCache = {}
      merged.forEach(p => {
        const key = `${p.module_name}|${p.page_name || ''}`
        permsCache[key] = {
          can_view:    p.can_view,
          can_edit:    p.can_edit,
          can_delete:  p.can_delete,
          can_approve: p.can_approve,
        }
      })
      localStorage.setItem('user_permissions_cache', JSON.stringify(permsCache))

      return merged
    } catch (err) {
      console.error('Error fetching permissions:', err)
      return []
    }
  }

  // Allow HRContext to trigger a permission refresh after status changes
  const refreshPermissions = async (userId) => {
    const perms = await fetchUserPermissions(userId)
    setPermissions(perms)
  }

  // ── Restore session on mount ────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setUser(parsed)
        fetchUserPermissions(parsed.id).then(setPermissions)
      } catch {}
    }
    setLoading(false)
  }, [])

  // ── login ───────────────────────────────────────────────────────
  async function login(username, password, rememberMe = false) {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .limit(1)
      .single()

    if (error || !data) throw new Error('User not found or inactive')

    const pwMatch = data.password_plain === password || atob(data.password_hash || '') === password
    if (!pwMatch) throw new Error('Incorrect password')

    await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', data.id)

    const session = {
      id:                     data.id,
      username:               data.username,
      full_name:              data.full_name,
      role_id:                data.role_id,
      employee_id:            data.employee_id,
      is_active:              data.is_active,
      must_change_password:   data.must_change_password || false,
      can_manage_permissions: data.can_manage_permissions || false,
    }

    setUser(session)
    const userPerms = await fetchUserPermissions(data.id)
    setPermissions(userPerms)

    const store = rememberMe ? localStorage : sessionStorage
    store.setItem('bravura_session', JSON.stringify(session))

    return session
  }

  // ── logout ──────────────────────────────────────────────────────
  function logout() {
    setUser(null)
    setPermissions([])
    localStorage.removeItem('bravura_session')
    sessionStorage.removeItem('bravura_session')
    localStorage.removeItem('user_permissions_cache')
  }

  // ── hasPermission (logic-level helper) ─────────────────────────
  const hasPermission = (moduleName, pageName, action) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    const perm = permissions.find(p =>
      p.module_name === moduleName &&
      (p.page_name === pageName || p.page_name === null)
    )
    if (!perm) return false
    switch (action) {
      case 'view':    return perm.can_view
      case 'edit':    return perm.can_edit
      case 'delete':  return perm.can_delete
      case 'approve': return perm.can_approve
      default:        return false
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      permissions,
      loading,
      login,
      logout,
      hasPermission,
      fetchUserPermissions,
      refreshPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
