// src/components/layout/TopBar.jsx
//
// UPGRADED: Notification bell is now a real dropdown panel.
// Shows last 20 notifications with icon, message, time.
// Mark individual as read. Mark all as read.
// Clicking a notification navigates to its linked page.
// Unread count badge on bell icon.
// Auto-fetches on mount and every 60 seconds.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const NOTIFICATION_ICONS = {
  leave_request:    { icon: 'event_note',       color: 'var(--yellow)' },
  leave_approved:   { icon: 'event_available',  color: 'var(--green)'  },
  leave_rejected:   { icon: 'event_busy',        color: 'var(--red)'    },
  leave_forwarded:  { icon: 'forward_to_inbox',  color: 'var(--blue)'   },
  attendance_alert: { icon: 'schedule',          color: 'var(--yellow)' },
  account_created:  { icon: 'person_add',        color: 'var(--teal)'   },
  payroll:          { icon: 'payments',          color: 'var(--purple)' },
  default:          { icon: 'notifications',     color: 'var(--text-dim)'},
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts)
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate          = useNavigate()

  const [notifications,  setNotifications]  = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const dropdownRef = useRef(null)

  const fetchNotifications = async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25)
    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.is_read).length)
    }
  }

  useEffect(() => {
    fetchNotifications()
    const iv = setInterval(fetchNotifications, 60000)
    return () => clearInterval(iv)
  }, [user?.id])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllRead = async () => {
    if (!user?.id) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) await markAsRead(notification.id)
    setDropdownOpen(false)
    if (notification.link) navigate(notification.link)
  }

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 50 }}>

      {/* Brand */}
      <div style={{ cursor: 'pointer', marginRight: 8 }} onClick={() => navigate('/')}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>BRAVURA ERP</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
        <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: 'var(--text-dim)' }}>search</span>
        <input type="text" placeholder="Search…" style={{ width: '100%', padding: '7px 10px 7px 34px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text)', fontSize: 12, outline: 'none' }} />
      </div>

      <div style={{ flex: 1 }} />

      {/* ── Notification bell with dropdown ───────────── */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', position: 'relative', padding: 4, display: 'flex', alignItems: 'center' }}
          title="Notifications"
        >
          <span className="material-icons" style={{ fontSize: 22, color: dropdownOpen ? 'var(--gold)' : 'var(--text-dim)' }}>notifications</span>
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: 0, right: 0, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {dropdownOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.5)', zIndex: 200, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Notifications</div>
                {unreadCount > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{unreadCount} unread</div>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="btn btn-secondary btn-sm" style={{ fontSize: 10 }}>
                  <span className="material-icons" style={{ fontSize: 12 }}>done_all</span> Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 36, display: 'block', opacity: 0.4, marginBottom: 8 }}>notifications_none</span>
                  No notifications yet
                </div>
              ) : notifications.map(n => {
                const meta = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.default
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(251,191,36,.04)', borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                    onMouseOver={e => { e.currentTarget.style.background = n.is_read ? 'var(--surface2)' : 'rgba(251,191,36,.08)' }}
                    onMouseOut={e  => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(251,191,36,.04)' }}
                  >
                    {/* Icon */}
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${meta.color}18`, border: `1px solid ${meta.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span className="material-icons" style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize: 13, lineHeight: 1.4 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{relativeTime(n.created_at)}</div>
                    </div>

                    {/* Unread dot */}
                    {!n.is_read && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 6 }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <button onClick={() => { setDropdownOpen(false); navigate('/module/hr/leave') }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, width: '100%', justifyContent: 'center' }}>
                  View all in Leave Management
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px 4px 6px' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#0b0f1a', flexShrink: 0 }}>
          {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
            {user?.full_name || user?.username}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {user?.role_id?.replace('role_', '').replace(/_/g, ' ').toUpperCase() || 'USER'}
          </div>
        </div>
      </div>

      {/* Logout */}
      <button className="btn btn-secondary btn-sm" onClick={logout}>
        <span className="material-icons" style={{ fontSize: 15 }}>logout</span>
      </button>
    </div>
  )
}
