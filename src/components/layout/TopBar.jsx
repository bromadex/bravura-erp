// src/components/layout/TopBar.jsx
//
// Notification bell: Supabase Realtime subscription with 5-min polling fallback.
// Global search: live transaction-code lookup across all txn_code columns.
// Footer link updated to /module/notifications (full notification page).

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { TXN_CODE_REGEX } from '../../utils/txnCode'
import QuickActionModal from '../QuickActionModal'

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
  policy_rejected:        { icon: 'gavel',              color: 'var(--red)'      },
  memo_published:         { icon: 'mail',               color: 'var(--gold)'     },
  consultation_reply:     { icon: 'question_answer',    color: 'var(--teal)'     },
  room_assigned:          { icon: 'hotel',              color: 'var(--green)'    },
  room_transferred:       { icon: 'swap_horiz',         color: 'var(--blue)'     },
  room_vacated:           { icon: 'logout',             color: 'var(--text-dim)' },
  camp_maintenance:       { icon: 'build',              color: 'var(--yellow)'   },
  camp_occupancy_high:    { icon: 'warning',            color: 'var(--red)'      },
  ppe_return_required:    { icon: 'assignment_return',  color: 'var(--yellow)'   },
  po_approval_required:   { icon: 'shopping_bag',       color: 'var(--purple)'   },
  ot_request:             { icon: 'more_time',          color: 'var(--blue)'     },
  exit_checklist:         { icon: 'checklist',          color: 'var(--yellow)'   },
  default:                { icon: 'notifications',      color: 'var(--text-dim)' },
}

// Tables that have a txn_code column for global search
const SEARCH_TABLES = [
  { table: 'store_requisitions',    label: 'Store Requisition',    prefix: 'SR' },
  { table: 'purchase_requisitions', label: 'Purchase Requisition', prefix: 'PR' },
  { table: 'purchase_orders',       label: 'Purchase Order',       prefix: 'PO' },
  { table: 'goods_received',        label: 'Goods Received',       prefix: 'GR' },
  { table: 'leave_requests',        label: 'Leave Request',        prefix: 'LV' },
  { table: 'fuel_log',              label: 'Fuel Issuance',        prefix: 'FI' },
  { table: 'travel_requests',       label: 'Travel Request',       prefix: 'TR' },
  { table: 'asset_issues',          label: 'Asset Fault',          prefix: 'FT' },
  { table: 'employee_attendance',   label: 'Attendance',           prefix: 'AT' },
  { table: 'room_assignments',      label: 'Room Assignment',      prefix: 'CA' },
]

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

  // Search state
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchResults,  setSearchResults]  = useState([])
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [searchOpen,     setSearchOpen]     = useState(false)
  const [quickCode,      setQuickCode]      = useState(null)
  const searchRef   = useRef(null)
  const searchTimer = useRef(null)

  // ── Notifications ─────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
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
  }, [user?.id])

  // Initial load + 5-min polling fallback
  useEffect(() => {
    fetchNotifications()
    const iv = setInterval(fetchNotifications, 300000)
    return () => clearInterval(iv)
  }, [fetchNotifications])

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchNotifications() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, fetchNotifications])

  // Close notification dropdown on outside click
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

  // ── Global search ─────────────────────────────────────────────

  // Close search on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim().toUpperCase()
    if (trimmed.length < 3) { setSearchResults([]); setSearchOpen(false); return }

    // Check if it looks like a code
    const isCode = /^[A-Z]{2,3}-?\d*/.test(trimmed)
    if (!isCode) { setSearchResults([]); return }

    setSearchLoading(true)
    setSearchOpen(true)
    try {
      // Query each table in parallel for txn_code ILIKE pattern
      const queries = SEARCH_TABLES.map(({ table, label, prefix }) =>
        supabase
          .from(table)
          .select('txn_code, status')
          .ilike('txn_code', `${trimmed}%`)
          .limit(5)
          .then(({ data }) =>
            (data || []).map(row => ({ code: row.txn_code, status: row.status, label, prefix }))
          )
      )
      const nested = await Promise.all(queries)
      setSearchResults(nested.flat().filter(r => r.code))
    } finally {
      setSearchLoading(false)
    }
  }, [])

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearchQuery(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(val), 300)
  }

  const handleSearchSelect = (result) => {
    setQuickCode(result.code)
    setSearchOpen(false)
    setSearchQuery('')
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 50 }}>

        {/* Brand */}
        <div style={{ cursor: 'pointer', marginRight: 8 }} onClick={() => navigate('/')}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>BRAVURA ERP</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI</div>
        </div>

        {/* Global search */}
        <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: 'var(--text-dim)' }}>search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length >= 3 && setSearchOpen(true)}
            placeholder="Search transaction codes…"
            style={{ width: '100%', padding: '7px 10px 7px 34px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text)', fontSize: 12, outline: 'none' }}
          />

          {/* Search results dropdown */}
          {searchOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 200, overflow: 'hidden' }}>
              {searchLoading ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>No results for "{searchQuery}"</div>
              ) : (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </div>
                  {searchResults.map(r => (
                    <div
                      key={r.code}
                      onClick={() => handleSearchSelect(r)}
                      style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderTop: '1px solid var(--border)', transition: 'background .1s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseOut={e  => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{r.code}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{r.label}</span>
                      {r.status && (
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 10 }}>
                          {r.status}
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* ── Notification bell ─────────────────────────────── */}
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
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${meta.color}18`, border: `1px solid ${meta.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <span className="material-icons" style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize: 13, lineHeight: 1.4 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{relativeTime(n.created_at)}</div>
                      </div>
                      {!n.is_read && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 6 }} />
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <button onClick={() => { setDropdownOpen(false); navigate('/module/notifications') }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, width: '100%', justifyContent: 'center' }}>
                  View all notifications
                </button>
              </div>
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

        <button className="btn btn-secondary btn-sm" onClick={logout}>
          <span className="material-icons" style={{ fontSize: 15 }}>logout</span>
        </button>
      </div>

      {/* Quick Action Modal from global search */}
      {quickCode && <QuickActionModal code={quickCode} onClose={() => setQuickCode(null)} />}
    </>
  )
}
