import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  // Helper: fetch permissions for a user
  const fetchUserPermissions = async (userId) => {
    try {
      // Get user's role
      const { data: userData } = await supabase
        .from('app_users')
        .select('role_id')
        .eq('id', userId)
        .single()
      
      if (!userData) return []
      
      // Get role permissions
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role_id', userData.role_id)
      
      // Get user-specific overrides
      const { data: userPerms } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId)
      
      // Merge: user overrides role
      const roleMap = new Map()
      rolePerms?.forEach(p => {
        const key = `${p.module_name}|${p.page_name || ''}`
        roleMap.set(key, {
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          can_approve: p.can_approve
        })
      })
      
      userPerms?.forEach(p => {
        const key = `${p.module_name}|${p.page_name || ''}`
        roleMap.set(key, {
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          can_approve: p.can_approve
        })
      })
      
      // Convert to array
      const merged = Array.from(roleMap.entries()).map(([key, perms]) => {
        const [module_name, page_name] = key.split('|')
        return { module_name, page_name: page_name || null, ...perms }
      })
      
      // Store in localStorage cache for fast access from other contexts
      const permsCache = {}
      merged.forEach(p => {
        const cacheKey = `${p.module_name}|${p.page_name || ''}`
        permsCache[cacheKey] = {
          can_view: p.can_view,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          can_approve: p.can_approve
        }
      })
      localStorage.setItem('user_permissions_cache', JSON.stringify(permsCache))
      
      return merged
    } catch (err) {
      console.error('Error fetching permissions:', err)
      return []
    }
  }

  // Helper: check permission (used by components via context)
  const hasPermission = (moduleName, pageName, action) => {
    if (!user) return false
    
    // Super Admin bypass
    if (user.role_id === 'role_super_admin') return true
    
    const perm = permissions.find(p => 
      p.module_name === moduleName && 
      (p.page_name === pageName || p.page_name === null)
    )
    
    if (!perm) return false
    
    switch(action) {
      case 'view': return perm.can_view
      case 'edit': return perm.can_edit
      case 'delete': return perm.can_delete
      case 'approve': return perm.can_approve
      default: return false
    }
  }

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session')
    if (saved) {
      try { 
        const parsed = JSON.parse(saved)
        setUser(parsed)
        // Also load permissions for this user
        fetchUserPermissions(parsed.id).then(setPermissions)
      } catch {}
    }
    setLoading(false)
  }, [])

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

    // Update last login timestamp
    await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', data.id)

    const session = {
      id: data.id,
      username: data.username,
      full_name: data.full_name,
      role_id: data.role_id,
      employee_id: data.employee_id,
      is_active: data.is_active,
      must_change_password: data.must_change_password,
      can_manage_permissions: data.can_manage_permissions || false
    }
    
    setUser(session)
    
    // Fetch and store permissions (also stores cache in localStorage)
    const userPerms = await fetchUserPermissions(data.id)
    setPermissions(userPerms)
    
    const store = rememberMe ? localStorage : sessionStorage
    store.setItem('bravura_session', JSON.stringify(session))
    
    return session
  }

  function logout() {
    setUser(null)
    setPermissions([])
    localStorage.removeItem('bravura_session')
    sessionStorage.removeItem('bravura_session')
    localStorage.removeItem('user_permissions_cache')
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      permissions, 
      loading, 
      login, 
      logout,
      hasPermission 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
