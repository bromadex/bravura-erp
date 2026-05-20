// src/components/layout/TopBar.jsx
// Two-strip header: identity bar (maroon) + utility bar (surface).

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import QuickActionModal from '../QuickActionModal'
import QuickActionsPanel from '../QuickActionsPanel'

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

const ENTITY_SEARCH_TABLES = [
  { table: 'employees',          nameCol: 'name',           codeCol: 'employee_number', icon: 'person',         label: 'Employee',       route: '/module/hr/employees'                   },
  { table: 'fleet',              nameCol: 'reg',            codeCol: 'fleet_code',      icon: 'directions_car', label: 'Vehicle',        route: '/module/fleet/vehicles'                 },
  { table: 'earth_movers',       nameCol: 'reg',            codeCol: 'fleet_code',      icon: 'agriculture',    label: 'Equipment',      route: '/module/fleet/vehicles'                 },
  { table: 'suppliers',          nameCol: 'name',           codeCol: null,              icon: 'local_shipping', label: 'Supplier',       route: '/module/procurement/suppliers'          },
  { table: 'governance_documents', nameCol: 'title',        codeCol: 'txn_code',        icon: 'description',    label: 'Document',       route: '/module/governance/memos'               },
  { table: 'purchase_orders',    nameCol: 'supplier_name',  codeCol: 'po_number',       icon: 'shopping_bag',   label: 'Purchase Order', route: '/module/procurement/purchase-orders'    },
  { table: 'store_requisitions', nameCol: 'requester_name', codeCol: 'req_number',      icon: 'assignment',     label: 'Requisition',    route: '/module/procurement/store-requisitions' },
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

const MAROON = '#6b1a2a'
const MAROON_DARK = '#561523'

export default function TopBar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const [notifications,  setNotifications]  = useState([])
  const [unreadCount,    setUnreadCount]    = useState(0)
  const [dropdownOpen,   setDropdownOpen]   = useState(false)
  const dropdownRef = useRef(null)
  const [cmdOpen, setCmdOpen] = useState(false)

  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchExpanded,setSearchExpanded]= useState(false)
  const [quickCode,     setQuickCode]     = useState(null)
  const searchRef   = useRef(null)
  const searchInput = useRef(null)
  const searchTimer = useRef(null)

  // Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(p => !p) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Notifications
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25)
    if (data) { setNotifications(data); setUnreadCount(data.filter(n => !n.is_read).length) }
  }, [user?.id])

  useEffect(() => { fetchNotifications(); const iv = setInterval(fetchNotifications, 300000); return () => clearInterval(iv) }, [fetchNotifications])

  useEffect(() => {
    if (!user?.id) return
    const ch = supabase.channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchNotifications())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user?.id, fetchNotifications])

  useEffect(() => {
    const h = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(p => Math.max(0, p - 1))
  }
  const markAllRead = async () => {
    if (!user?.id) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(p => p.map(n => ({ ...n, is_read: true }))); setUnreadCount(0)
  }
  const handleNotificationClick = async (n) => {
    if (!n.is_read) await markAsRead(n.id)
    setDropdownOpen(false); if (n.link) navigate(n.link)
  }

  // Search
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) { setSearchOpen(false); setSearchExpanded(false) } }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const runSearch = useCallback(async (q) => {
    const t = q.trim()
    if (t.length < 3) { setSearchResults([]); setSearchOpen(false); return }
    setSearchLoading(true); setSearchOpen(true)
    try {
      const upper = t.toUpperCase()
      const isCode = /^[A-Z]{2,3}-?\d*/.test(upper)
      let txnResults = []
      if (isCode) {
        txnResults = (await Promise.all(SEARCH_TABLES.map(({ table, label, prefix }) =>
          supabase.from(table).select('txn_code, status').ilike('txn_code', `${upper}%`).limit(5)
            .then(({ data }) => (data || []).map(row => ({ id: `txn_${table}_${row.txn_code}`, type: 'txn', code: row.txn_code, status: row.status, label, prefix })))
        ))).flat().filter(r => r.code)
      }
      const entityResults = (await Promise.all(ENTITY_SEARCH_TABLES.map(async ({ table, nameCol, codeCol, icon, label, route }) => {
        const { data } = await supabase.from(table).select(`id, ${nameCol}${codeCol ? `, ${codeCol}` : ''}`).ilike(nameCol, `%${t}%`).limit(4)
        return (data || []).map(row => ({ id: `entity_${table}_${row.id}`, type: 'entity', label, name: row[nameCol], code: codeCol ? row[codeCol] : null, icon, route }))
      }))).flat()
      const seen = new Set()
      setSearchResults([...entityResults, ...txnResults].filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true }))
    } finally { setSearchLoading(false) }
  }, [])

  const handleSearchChange = (e) => {
    const val = e.target.value; setSearchQuery(val)
    clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => runSearch(val), 300)
  }
  const handleSearchSelect = (result) => { setQuickCode(result.code); setSearchOpen(false); setSearchQuery('') }

  const entityResults = searchResults.filter(r => r.type === 'entity')
  const txnResults    = searchResults.filter(r => r.type === 'txn')

  const userName = user?.full_name || user?.username || '?'
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <>
      {/* ── TOP STRIP: Identity bar ─────────────────────────────── */}
      <div style={{
        background: MAROON,
        padding: '0 16px',
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 51,
        boxShadow: '0 1px 0 rgba(0,0,0,.3)',
      }}>
        {/* Brand */}
        <div
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
        >
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'rgba(255,255,255,.15)',
            border: '1px solid rgba(255,255,255,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-icons" style={{ fontSize: 15, color: '#fff' }}>diamond</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: 1, lineHeight: 1 }}>BRAVURA ERP</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.5)', letterSpacing: 1.5, fontFamily: 'var(--mono)' }}>ENTERPRISE</div>
          </div>
        </div>

        {/* User + Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {userInitial}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}
            className="topbar-username">
            {userName}
          </span>
          <button
            onClick={logout}
            title="Logout"
            style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, cursor: 'pointer', color: 'rgba(255,255,255,.8)', padding: '3px 6px', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,.2)' }}
            onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,.1)' }}
          >
            <span className="material-icons" style={{ fontSize: 15 }}>logout</span>
          </button>
        </div>
      </div>

      {/* ── BOTTOM STRIP: Utility bar ───────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        position: 'sticky',
        top: 40,
        zIndex: 50,
      }}>

        {/* Global search */}
        <div ref={searchRef} style={{ position: 'relative', flex: 1 }}>
          {/* Mobile: icon-only collapsed, expands on tap */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="material-icons" style={{ position: 'absolute', left: 10, fontSize: 16, color: 'var(--text-dim)', pointerEvents: 'none', zIndex: 1 }}>search</span>
            <input
              ref={searchInput}
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => { setSearchExpanded(true); searchQuery.length >= 3 && setSearchOpen(true) }}
              placeholder="Search records, codes…"
              style={{
                width: '100%',
                padding: '6px 10px 6px 32px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                color: 'var(--text)',
                fontSize: 12,
                outline: 'none',
                transition: 'border-color .15s',
              }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = MAROON }}
              onBlurCapture={e  => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>

          {/* Search results dropdown */}
          {searchOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 200, overflow: 'hidden' }}>
              {searchLoading ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>
              ) : searchResults.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>No results for "{searchQuery}"</div>
              ) : (
                <>
                  {entityResults.length > 0 && (
                    <>
                      <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Records</div>
                      {entityResults.map(r => (
                        <div key={r.id} onClick={() => { navigate(r.route); setSearchOpen(false); setSearchQuery('') }}
                          style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderTop: '1px solid var(--border)', transition: 'background .1s' }}
                          onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                          onMouseOut={e  => { e.currentTarget.style.background = 'transparent' }}>
                          <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)', flexShrink: 0 }}>{r.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.label}{r.code ? ` · ${r.code}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {txnResults.length > 0 && (
                    <>
                      <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Transaction Codes</div>
                      {txnResults.map(r => (
                        <div key={r.id} onClick={() => handleSearchSelect(r)}
                          style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderTop: '1px solid var(--border)', transition: 'background .1s' }}
                          onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                          onMouseOut={e  => { e.currentTarget.style.background = 'transparent' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{r.code}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{r.label}</span>
                          {r.status && <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 10 }}>{r.status}</span>}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Cmd+K */}
        <button onClick={() => setCmdOpen(true)} title="Quick actions (Ctrl+K)" className="btn btn-secondary btn-sm"
          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span className="material-icons" style={{ fontSize: 15 }}>bolt</span>
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, opacity: .6 }} className="topbar-kbd">⌘K</kbd>
        </button>

        {/* Theme toggle */}
        <button onClick={toggleTheme} className="btn btn-secondary btn-sm" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span className="material-icons" style={{ fontSize: 17 }}>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>

        {/* Notification bell */}
        <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setDropdownOpen(p => !p)} title="Notifications"
            style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 4, display: 'flex', alignItems: 'center' }}>
            <span className="material-icons" style={{ fontSize: 22, color: dropdownOpen ? MAROON : 'var(--text-dim)' }}>notifications</span>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 0, right: 0, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,.5)', zIndex: 200, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>Notifications</div>
                  {unreadCount > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{unreadCount} unread</div>}
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
                    <div key={n.id} onClick={() => handleNotificationClick(n)}
                      style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', background: n.is_read ? 'transparent' : 'rgba(251,191,36,.04)', borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = n.is_read ? 'var(--surface2)' : 'rgba(251,191,36,.08)' }}
                      onMouseOut={e  => { e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(251,191,36,.04)' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${meta.color}18`, border: `1px solid ${meta.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <span className="material-icons" style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize: 13, lineHeight: 1.4 }}>{n.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{relativeTime(n.created_at)}</div>
                      </div>
                      {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 6 }} />}
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
      </div>

      {/* Mobile responsive overrides */}
      <style>{`
        @media (max-width: 480px) {
          .topbar-username { display: none !important; }
          .topbar-kbd { display: none !important; }
        }
      `}</style>

      {quickCode && <QuickActionModal code={quickCode} onClose={() => setQuickCode(null)} />}
      <QuickActionsPanel open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  )
}
