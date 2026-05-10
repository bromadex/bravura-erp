// src/hooks/useRecentPages.js
//
// Tracks recently visited pages and user-pinned favorites in localStorage.
// Max 8 recent pages, 8 favorites. Both are keyed by path and deduped.

import { useState, useCallback } from 'react'

const RECENT_KEY   = 'bravura_recent_pages'
const FAVORITE_KEY = 'bravura_favorites'
const MAX_RECENT   = 8
const MAX_FAV      = 8

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch {}
}

export function useRecentPages() {
  const [recentPages, setRecentPages] = useState(() => load(RECENT_KEY))
  const [favorites,   setFavorites]   = useState(() => load(FAVORITE_KEY))

  const trackPage = useCallback(({ path, label, module }) => {
    setRecentPages(prev => {
      const filtered = prev.filter(p => p.path !== path)
      const next = [{ path, label, module, ts: Date.now() }, ...filtered].slice(0, MAX_RECENT)
      save(RECENT_KEY, next)
      return next
    })
  }, [])

  const toggleFavorite = useCallback(({ path, label }) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.path === path)
      const next = exists
        ? prev.filter(f => f.path !== path)
        : [...prev, { path, label }].slice(0, MAX_FAV)
      save(FAVORITE_KEY, next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    save(RECENT_KEY, [])
    setRecentPages([])
  }, [])

  return { recentPages, favorites, trackPage, toggleFavorite, clearRecent }
}
