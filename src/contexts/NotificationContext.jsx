// src/contexts/NotificationContext.jsx
// Global unread notification count + realtime subscription.
// Centralizes the subscription so only one Supabase channel is used
// for count-tracking (TopBar keeps its own separate channel for the
// dropdown content, which requires the full rows).

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth }  from './AuthContext'

const NotificationContext = createContext({ unreadCount: 0, refresh: () => {} })

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnread = useCallback(async () => {
    if (!user?.id) { setUnreadCount(0); return }
    try {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    } catch {}
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    fetchUnread()
    const iv = setInterval(fetchUnread, 120000)   // 2-min fallback poll
    const ch = supabase
      .channel(`notif-ctx:${user.id}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchUnread)
      .subscribe()
    return () => { clearInterval(iv); supabase.removeChannel(ch) }
  }, [fetchUnread, user?.id])

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh: fetchUnread }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() { return useContext(NotificationContext) }
