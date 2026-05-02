// src/pages/Notifications/NotificationCenter.jsx
//
// Full notification page at /module/notifications.
// Shows all notifications with filter by type, date range, read/unread.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const NOTIFICATION_ICONS = {
  leave_request:          { icon: 'event_note',         color: 'var(--yellow)'   },
  leave_approved:         { icon: 'event_available',    color: 'var(--green)'    },
  leave_rejected:         { icon: 'event_busy',         color: 'var(--red)'      },
  leave_forwarded:        { icon: 'forward_to_inbox',   color: 'var(--blue)'     },
  attendance_alert:       { icon: 'schedule',           color: 'var(--yellow)'   },
  account_created:        { icon: 'person_add',         color: 'var(--teal)'     },
  payroll:                { icon: 'payments',           color: 'var(--purple)'   },
  requisition_submitted:  { icon: 'assignment',         color: 'var(--purple)'   },
  requisition_approved:   { icon: 'approval',           color: 'var(--green)'    },
  requisition_fulfilled:  { icon: 'inventory',          color: 'var(--teal)'     },
  requisition_overdue:    { icon: 'schedule',           color: 'var(--red)'      },
  chat_message:           { icon: 'chat',               color: 'var(--blue)'     },
  policy_pending:         { icon: 'policy',             color: 'var(--yellow)'   },
  memo_published:         { icon: 'mail',               color: 'var(--gold)'     },
  room_assigned:          { icon: 'hotel',              color: 'var(--green)'    },
  room_transferred:       { icon: 'swap_horiz',         color: 'var(--blue)'     },
  room_vacated:           { icon: 'logout',             color: 'var(--text-dim)' },
  camp_maintenance:       { icon: 'build',              color: 'var(--yellow)'   },
  po_approval_required:   { icon: 'shopping_bag',       color: 'var(--purple)'   },
  ot_request:             { icon: 'more_time',          color: 'var(--blue)'     },
  exit_checklist:         { icon: 'checklist',          color: 'var(--yellow)'   },
  default:                { icon: 'notifications',      color: 'var(--text-dim)' },
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts)
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NotificationCenter() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [filterRead,    setFilterRead]    = useState('all')   // all | unread | read
  const [filterType,    setFilterType]    = useState('all')
  const [page,          setPage]          = useState(0)
  const PAGE_SIZE = 50

  const fetch = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    let q = supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (filterRead === 'unread') q = q.eq('is_read', false)
    if (filterRead === 'read')   q = q.eq('is_read', true)
    if (filterType !== 'all')    q = q.eq('type', filterType)
    const { data } = await q
    if (data) setNotifications(page === 0 ? data : prev => [...prev, ...data])
    setLoading(false)
  }, [user?.id, filterRead, filterType, page])

  useEffect(() => { setPage(0); setNotifications([]) }, [filterRead, filterType])
  useEffect(() => { fetch() }, [fetch])

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const handleClick = async (n) => {
    if (!n.is_read) await markRead(n.id)
    if (n.link) navigate(n.link)
  }

  const allTypes = [...new Set(Object.keys(NOTIFICATION_ICONS).filter(k => k !== 'default'))]
  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Notifications</h2>
          {unreadCount > 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{unreadCount} unread</div>}
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
            <span className="material-icons" style={{ fontSize: 14 }}>done_all</span> Mark all read
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterRead} onChange={e => setFilterRead(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Types</option>
          {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading && notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 36, display: 'block', opacity: 0.4, marginBottom: 8 }}>notifications_none</span>
            No notifications
          </div>
        ) : notifications.map(n => {
          const meta = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.default
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{ padding: '14px 18px', display: 'flex', gap: 14, cursor: n.link ? 'pointer' : 'default', background: n.is_read ? 'transparent' : 'rgba(251,191,36,.03)', borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
              onMouseOver={e => { e.currentTarget.style.background = n.is_read ? 'var(--surface2)' : 'rgba(251,191,36,.07)' }}
              onMouseOut={e  => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(251,191,36,.03)' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${meta.color}18`, border: `1px solid ${meta.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <span className="material-icons" style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize: 13, lineHeight: 1.4 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{relativeTime(n.created_at)}</div>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 8 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {notifications.length >= PAGE_SIZE && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
