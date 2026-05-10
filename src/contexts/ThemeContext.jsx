// src/contexts/ThemeContext.jsx
//
// Manages dark/light theme. Applies data-theme attribute to <html>.
// Persists selection in localStorage.

import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'bravura_theme'

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
  }, [theme])

  const setTheme = (t) => setThemeState(t)
  const toggleTheme = () => setThemeState(t => t === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
