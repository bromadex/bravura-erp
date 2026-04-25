import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
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
      role: data.role,
      employee_id: data.employee_id,
    }
    setUser(session)
    const store = rememberMe ? localStorage : sessionStorage
    store.setItem('bravura_session', JSON.stringify(session))
    return session
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('bravura_session')
    sessionStorage.removeItem('bravura_session')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
