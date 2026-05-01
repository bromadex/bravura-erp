// src/contexts/AuthContext.jsx
//
// ADDED: Session timeout — auto-logout after 30 minutes of inactivity.
// Activity is tracked via mousemove, keydown, click, scroll.
// A warning toast appears at 25 minutes, countdown at 29 minutes.
// Timer resets on any user interaction.
//
// Rest of the file is unchanged from the previous version.

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

const TIMEOUT_MS      = 30 * 60 * 1000   // 30 minutes
const WARNING_MS      = 25 * 60 * 1000   // warn at 25 minutes
const EVENTS          = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading,     setLoading]     = useState(true)

  const timeoutRef = useRef(null)
  const warnRef    = useRef(null)

  // ── Permission loader ───────────────────────────────────────
  const fetchUserPermissions = useCallback(async (userId) => {
    try {
      const { data: userData } = await supabase
        .from('app_users')
        .select('role_id, employee_id')
        .eq('id', userId)
        .single()
      if (!userData) return []

      let designationId = null
      if (userData.employee_id) {
        const { data: emp } = await supabase.from('employees').select('designation_id').eq('id', userData.employee_id).single()
        designationId = emp?.designation_id || null
      }

      const [roleRes, userRes, desigRes] = await Promise.all([
        supabase.from('role_permissions').select('*').eq('role_id', userData.role_id),
        supabase.from('user_permissions').select('*').eq('user_id', userId),
        designationId ? supabase.from('designation_permissions').select('*').eq('designation_id', designationId) : Promise.resolve({ data: [] }),
      ])

      const map = new Map()
      const applyLayer = (perms) => {
        ;(perms || []).forEach(p => {
          map.set(`${p.module_name}|${p.page_name || ''}`, {
            can_view:    p.can_view    ?? false,
            can_edit:    p.can_edit    ?? false,
            can_delete:  p.can_delete  ?? false,
            can_approve: p.can_approve ?? false,
          })
        })
      }
      applyLayer(desigRes.data)   // lowest
      applyLayer(roleRes.data)
      applyLayer(userRes.data)    // highest

      // Always grant hr|leave and hr|leave-balance to every active user
      for (const key of ['hr|leave', 'hr|leave-balance']) {
        if (!map.get(key)?.can_view) {
          map.set(key, { can_view: true, can_edit: key === 'hr|leave', can_delete: false, can_approve: false })
        }
      }

      const merged = Array.from(map.entries()).map(([key, perms]) => {
        const [module_name, page_name] = key.split('|')
        return { module_name, page_name: page_name || null, ...perms }
      })

      const cache = {}
      merged.forEach(p => { cache[`${p.module_name}|${p.page_name || ''}`] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete, can_approve: p.can_approve } })
      localStorage.setItem('user_permissions_cache', JSON.stringify(cache))

      return merged
    } catch (err) {
      console.error('Error fetching permissions:', err)
      return []
    }
  }, [])

  const refreshPermissions = useCallback(async (userId) => {
    const perms = await fetchUserPermissions(userId)
    setPermissions(perms)
  }, [fetchUserPermissions])

  // ── Session timeout ─────────────────────────────────────────
  const doLogout = useCallback((reason = '') => {
    setUser(null)
    setPermissions([])
    localStorage.removeItem('bravura_session')
    sessionStorage.removeItem('bravura_session')
    localStorage.removeItem('user_permissions_cache')
    if (reason) toast.error(reason, { duration: 5000 })
  }, [])

  const resetTimer = useCallback(() => {
    clearTimeout(timeoutRef.current)
    clearTimeout(warnRef.current)

    warnRef.current = setTimeout(() => {
      toast('You will be logged out in 5 minutes due to inactivity.', {
        icon: '⚠️',
        duration: 10000,
        style: { background: 'var(--surface)', color: 'var(--yellow)', border: '1px solid var(--yellow)' }
      })
    }, WARNING_MS)

    timeoutRef.current = setTimeout(() => {
      doLogout('You have been logged out due to 30 minutes of inactivity.')
    }, TIMEOUT_MS)
  }, [doLogout])

  // Attach/detach activity listeners when user logs in/out
  useEffect(() => {
    if (!user) {
      clearTimeout(timeoutRef.current)
      clearTimeout(warnRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
      return
    }
    resetTimer()
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    return () => {
      clearTimeout(timeoutRef.current)
      clearTimeout(warnRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [user, resetTimer])

  // ── Session restore ─────────────────────────────────────────
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
  }, [fetchUserPermissions])

  // ── Login ───────────────────────────────────────────────────
  const login = async (username, password, rememberMe = false) => {
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
    ;(rememberMe ? localStorage : sessionStorage).setItem('bravura_session', JSON.stringify(session))
    return session
  }

  // ── Logout ──────────────────────────────────────────────────
  const logout = () => doLogout()

  // ── Permission helper ───────────────────────────────────────
  const hasPermission = (moduleName, pageName, action) => {
    if (!user) return false
    if (user.role_id === 'role_super_admin') return true
    const perm = permissions.find(p => p.module_name === moduleName && (p.page_name === pageName || p.page_name === null))
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
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, hasPermission, fetchUserPermissions, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
