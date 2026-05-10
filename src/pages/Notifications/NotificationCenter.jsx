// src/pages/Notifications/NotificationCenter.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Icon/color map keyed on notification.type ─────────────────────────────
const TYPE_META = {
  leave_request:         { icon: 'event_note',       color: 'var(--yellow)'   },
  leave_approved:        { icon: 'event_available',  color: 'var(--green)'    },
  leave_rejected:        { icon: 'event_busy',       color: 'var(--red)'      },
  leave_forwarded:       { icon: 'forward_to_inbox', color: 'var(--blue)'     },
  attendance_alert:      { icon: 'schedule',         color: 'var(--yellow)'   },
  account_created:       { icon: 'person_add',       color: 'var(--teal)'     },
  payroll:               { icon: 'payments',         color: 'var(--purple)'   },
  payroll_processed:     { icon: 'payments',         color: 'var(--purple)'   },
  requisition_submitted: { icon: 'assignment',       color: 'var(--purple)'   },
  requisition_approved:  { icon: 'approval',         color: 'var(--green)'    },
  requisition_fulfilled: { icon: 'inventory',        color: 'var(--teal)'     },
  requisition_overdue:   { icon: 'timer_off',        color: 'var(--red)'      },
  po_approval_required:  { icon: 'shopping_bag',     color: 'var(--purple)'   },
  chat_message:          { icon: 'chat',             color: 'var(--blue)'     },
  policy_pending:        { icon: 'policy',           color: 'var(--yellow)'   },
  memo_published:        { icon: 'mail',             color: 'var(--gold)'     },
  room_assigned:         { icon: 'hotel',            color: 'var(--green)'    },
  room_transferred:      { icon: 'swap_horiz',       color: 'var(--blue)'     },
  room_vacated:          { icon: 'logout',           color: 'var(--text-dim)' },
  camp_maintenance:      { icon: 'build',            color: 'var(--yellow)'   },
  ot_request:            { icon: 'more_time',        color: 'var(--blue)'     },
  exit_checklist:        { icon: 'checklist',        color: 'var(--yellow)'   },
  travel_request:        { icon: 'flight_takeoff',   color: 'var(--blue)'     },
  travel_approved:       { icon: 'flight_takeoff',   color: 'var(--green)'    },
  info:                  { icon: 'info',             color: 'var(--blue)'     },
  success:               { icon: 'check_circle',     color: 'var(--green)'    },
  warning:               { icon: 'warning',          color: 'var(--yellow)'   },
  error:                 { icon: 'error',            color: 'var(--red)'      },
  default:               { icon: 'notifications',    color: 'var(--text-dim)' },
}

// ── Category tab definitions ──────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',          label: 'All',           icon: 'notifications'  },
  { id: 'approval',     label: 'Approvals',     icon: 'approval'       },
  { id: 'reminder',     label: 'Reminders',     icon: 'timer'          },
  { id: 'announcement', label: 'Announcements', icon: 'campaign'       },
  { id: 'escalation',   label: 'Escalations',   icon: 'priority_high'  },
  { id: 'general',      label: 'General',       icon: 'inbox'          },
]

// ── Helpers ───────────────────────────────────────────────────────────────
function relativeTime(ts) {
  const diff = Date.now() - new Date(ts)
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateGroup(ts) {
  const d     = new Date(ts)
  const today = new Date()
  const diff  = Math.floor((today - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)   return 'This Week'
  if (diff < 30)  return 'This Month'
  return 'Earlier'
}

function groupByDate(items) {
  const order  = ['Today', 'Yesterday', 'This Week', 'This Month', 'Earlier']
  const groups = {}
  items.forEach(n => {
    const g = dateGroup(n.created_at)
    if (!groups[g]) groups[g] = []
    groups[g].push(n)
  })
  return order.filter(g => groups[g]).map(g => ({ label: g, items: groups[g] }))
}

// ── Component ─────────────────────────────────────────────────────────────
export default function NotificationCenter() {
  const { user }    = useAuth()
  const navigate    = useNavigate()

  const [notifications, setNotifications] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [activeTab,     setActiveTab]     = useState('all')
  const [filterRead,    setFilterRead]    = useState('all')  // all | unread | read
  const [page,          setPage]          = useState(0)
  const [hasMore,       setHasMore]       = useState(false)
  const PAGE_SIZE = 40
  const channelRef = useRef(null)

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (pageNum = 0, replace = true) => {
    if (!user?.id) return
    if (pageNum === 0) setLoading(true)

    let q = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (activeTab !== 'all')     q = q.eq('category', activeTab)
    if (filterRead === 'unread') q = q.eq('is_read', false)
    if (filterRead === 'read')   q = q.eq('is_read', true)

    const { data } = await q
    if (data) {
      setNotifications(prev => replace ? data : [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [user?.id, activeTab, filterRead])

  // Reset on tab/filter change
  useEffect(() => {
    setPage(0)
    fetchPage(0, true)
  }, [activeTab, filterRead]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load more
  useEffect(() => {
    if (page > 0) fetchPage(page, false)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notif-center:${user.id}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchPage(0, true) })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, fetchPage])

  // ── Counts per category (derived from current fetch, best-effort) ─────
  const countsByCategory = useCallback(() => {
    const counts = {}
    CATEGORIES.forEach(c => { counts[c.id] = 0 })
    notifications.forEach(n => {
      if (!n.is_read) {
        counts.all++
        const cat = n.category || 'general'
        if (counts[cat] !== undefined) counts[cat]++
        else counts.general++
      }
    })
    return counts
  }, [notifications])

  const counts = countsByCategory()

  // ── Actions ──────────────────────────────────────────────────────────
  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const deleteNotif = async (id) => {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const markAllRead = async () => {
    let q = supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    if (activeTab !== 'all') q = q.eq('category', activeTab)
    await q
    setNotifications(prev => prev.map(n =>
      (activeTab === 'all' || n.category === activeTab) ? { ...n, is_read: true } : n
    ))
  }

  const clearRead = async () => {
    if (!confirm('Delete all read notifications? This cannot be undone.')) return
    let q = supabase.from('notifications').delete().eq('user_id', user.id).eq('is_read', true)
    if (activeTab !== 'all') q = q.eq('category', activeTab)
    await q
    setNotifications(prev => prev.filter(n =>
      !n.is_read || (activeTab !== 'all' && n.category !== activeTab)
    ))
  }

  const handleClick = async (n) => {
    if (!n.is_read) await markRead(n.id)
    if (n.link) navigate(n.link)
  }

  // ── Computed ─────────────────────────────────────────────────────────
  const unreadInTab  = notifications.filter(n => !n.is_read).length
  const grouped      = groupByDate(notifications)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Notification Center</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
            Approvals, reminders, announcements and escalations in one place
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {unreadInTab > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
              <span className="material-icons" style={{ fontSize: 14 }}>done_all</span> Mark all read
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={clearRead}>
            <span className="material-icons" style={{ fontSize: 14 }}>delete_sweep</span> Clear read
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {CATEGORIES.map(cat => {
          const isActive = activeTab === cat.id
          const badge    = counts[cat.id] || 0
          return (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 500,
                background: isActive ? 'var(--gold)' : 'var(--surface)',
                color:      isActive ? '#000'       : 'var(--text-dim)',
                transition: 'all .15s',
              }}
            >
              <span className="material-icons" style={{ fontSize: 14 }}>{cat.icon}</span>
              {cat.label}
              {badge > 0 && (
                <span style={{
                  background: isActive ? 'rgba(0,0,0,.25)' : 'var(--gold)',
                  color:      isActive ? '#000'            : '#000',
                  borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Read filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'unread', 'read'].map(f => (
          <button
            key={f}
            onClick={() => setFilterRead(f)}
            className={`btn btn-sm ${filterRead === f ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize', fontSize: 11 }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && notifications.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 32, display: 'block', opacity: 0.4, marginBottom: 8 }}>hourglass_empty</span>
          Loading…
        </div>
      ) : notifications.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 40, display: 'block', opacity: 0.3, marginBottom: 10 }}>
            {CATEGORIES.find(c => c.id === activeTab)?.icon || 'notifications_none'}
          </span>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {filterRead === 'unread' ? 'All caught up!' : `No ${activeTab === 'all' ? '' : activeTab + ' '}notifications`}
          </div>
          <div style={{ fontSize: 12 }}>New notifications will appear here in real time.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {grouped.map(group => (
            <div key={group.label}>
              {/* Date group header */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
                {group.label}
              </div>
              <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                {group.items.map((n, idx) => {
                  const meta = TYPE_META[n.type] || TYPE_META.default
                  return (
                    <NotifRow
                      key={n.id}
                      n={n}
                      meta={meta}
                      isLast={idx === group.items.length - 1}
                      onClick={() => handleClick(n)}
                      onMarkRead={() => markRead(n.id)}
                      onDelete={() => deleteNotif(n.id)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Row component (memoised to prevent list re-renders) ───────────────────
function NotifRow({ n, meta, isLast, onClick, onMarkRead, onDelete }) {
  const [hovered, setHovered] = useState(false)

  const catColors = {
    approval:     '#7c3aed',
    reminder:     '#d97706',
    announcement: '#0ea5e9',
    escalation:   '#dc2626',
    general:      'var(--text-dim)',
  }
  const catColor = catColors[n.category] || catColors.general

  return (
    <div
      style={{
        padding: '13px 16px', display: 'flex', gap: 13, alignItems: 'flex-start',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        background: hovered
          ? (n.is_read ? 'var(--surface2)' : 'rgba(251,191,36,.06)')
          : (n.is_read ? 'transparent'     : 'rgba(251,191,36,.025)'),
        transition: 'background .12s',
        cursor: n.link ? 'pointer' : 'default',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon circle */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: `${meta.color}15`, border: `1px solid ${meta.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-icons" style={{ fontSize: 17, color: meta.color }}>{meta.icon}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: n.is_read ? 500 : 700, fontSize: 13, lineHeight: 1.4 }}>{n.title}</span>
          {n.category && n.category !== 'general' && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}30`,
              borderRadius: 4, padding: '1px 5px',
            }}>
              {n.category}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.45 }}>{n.message}</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 11 }}>schedule</span>
          {relativeTime(n.created_at)}
          {n.link && <span style={{ color: 'var(--gold)', fontSize: 10 }}>→ view</span>}
        </div>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {!n.is_read && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', marginTop: 4 }} />
        )}
        {hovered && (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            {!n.is_read && (
              <button
                title="Mark as read"
                className="btn btn-secondary btn-sm"
                style={{ padding: '3px 6px', fontSize: 11 }}
                onClick={onMarkRead}
              >
                <span className="material-icons" style={{ fontSize: 13 }}>done</span>
              </button>
            )}
            <button
              title="Delete"
              className="btn btn-danger btn-sm"
              style={{ padding: '3px 6px', fontSize: 11 }}
              onClick={onDelete}
            >
              <span className="material-icons" style={{ fontSize: 13 }}>close</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
