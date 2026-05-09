// src/pages/HomeGrid.jsx
//
// FIX: Module visibility was checking only defaultPage (e.g. 'hr|dashboard').
// If a user had hr|leave but NOT hr|dashboard, the HR module was invisible on
// the home screen even though they could navigate to it directly. They had to
// type the URL — that's the bug reported.
//
// Fix: check canView against ALL known pages of the module. If the user can
// see ANY page in a module, the module tile appears on the home screen.
// The tile navigates to the first page the user actually has access to.
//
// Also added: notification bell showing unread count.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../contexts/PermissionContext'
import { supabase } from '../lib/supabase'

// All pages per module — must match Sidebar manifest
const MODULE_PAGES = {
  dashboard:   ['overview'],
  procurement: ['suppliers','store-requisitions','purchase-requisitions','purchase-orders','goods-received'],
  inventory:   ['stock-balance','stock-in','stock-out','transactions','stock-taking','categories'],
  logistics:   ['goods-received','batch-plant','campsite'],
  fuel:        ['tanks','dipstick','issuance','deliveries','reports'],
  fleet:       ['dashboard','vehicles','generators','heavy-equipment','maintenance-alerts','asset-issues'],
  hr:          ['dashboard','employees','departments','designations','permissions','attendance','leave','leave-balance','travel'],
  accounting:  ['chart-of-accounts','journal-entries','reports'],
  reports:     ['overview','audit-log','drafts'],
}

const ALL_MODULES = [
  { id: 'dashboard',   icon: 'dashboard',          label: 'Dashboard',          color: '#f4a261', desc: 'KPIs & overview',         route: '/module/dashboard',   moduleName: 'dashboard'   },
  { id: 'procurement', icon: 'shopping_cart',       label: 'Procurement',        color: '#a78bfa', desc: 'Suppliers & orders',      route: '/module/procurement', moduleName: 'procurement' },
  { id: 'inventory',   icon: 'inventory',           label: 'Inventory',          color: '#2dd4bf', desc: 'Stock & warehouse',       route: '/module/inventory',   moduleName: 'inventory'   },
  { id: 'logistics',   icon: 'local_shipping',      label: 'Logistics',          color: '#60a5fa', desc: 'GRN, Batch Plant',        route: '/module/logistics',   moduleName: 'logistics'   },
  { id: 'fuel',        icon: 'local_gas_station',   label: 'Fuel Management',    color: '#fbbf24', desc: 'Tanks & issuance',        route: '/module/fuel',        moduleName: 'fuel'        },
  { id: 'fleet',       icon: 'directions_car',      label: 'Fleet & Assets',     color: '#34d399', desc: 'Vehicles & generators',   route: '/module/fleet',       moduleName: 'fleet'       },
  { id: 'hr',          icon: 'badge',               label: 'Human Resources',    color: '#f87171', desc: 'Employees & payroll',     route: '/module/hr',          moduleName: 'hr'          },
  { id: 'accounting',  icon: 'receipt',             label: 'Accounting',         color: '#818cf8', desc: 'Journals & reports',      route: '/module/accounting',  moduleName: 'accounting'  },
  { id: 'reports',     icon: 'bar_chart',           label: 'Reports',            color: '#38bdf8', desc: 'Analytics & exports',     route: '/module/reports',     moduleName: 'reports'     },
  { id: 'project',     icon: 'construction',        label: 'Project Management', color: '#94a3b8', desc: 'Coming soon',             route: null,                  moduleName: 'project'     },
]

export default function HomeGrid() {
  const { user, logout } = useAuth()
  const navigate          = useNavigate()
  const { canView }       = usePermission()

  const [unreadCount, setUnreadCount] = useState(0)

  // Load unread notification count
  useEffect(() => {
    if (!user?.id) return
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    }
    fetchUnread()
    // Poll every 30 seconds
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user?.id])

  // ── ✅ FIX: show module if user can view ANY page in it ─────────
  // Previously only checked the defaultPage, so users with hr|leave
  // but not hr|dashboard couldn't see the HR tile at all.
  const visibleModules = ALL_MODULES.filter(mod => {
    if (mod.id === 'project') return true   // always show "coming soon"
    const pages = MODULE_PAGES[mod.moduleName]
    if (!pages) return false
    return pages.some(page => canView(mod.moduleName, page))
  })

  // ── Navigate to first accessible page within a module ──────────
  const navigateToModule = (mod) => {
    if (!mod.route) { alert(`${mod.label} – coming soon`); return }
    const pages = MODULE_PAGES[mod.moduleName]
    if (!pages) { navigate(mod.route); return }
    // Find the first page the user actually has access to
    const firstPage = pages.find(page => canView(mod.moduleName, page))
    if (firstPage) {
      navigate(`/module/${mod.moduleName}/${firstPage}`)
    } else {
      navigate(mod.route)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>BRAVURA ERP</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI OPERATIONS</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Notification bell */}
          <button
            onClick={() => navigate('/module/hr/leave')}
            style={{ position: 'relative', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
            title="Notifications"
          >
            <span className="material-icons" style={{ fontSize: 20 }}>notifications</span>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#0b0f1a' }}>
              {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{user?.full_name || user?.username}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {user?.role_id?.replace('role_', '').replace(/_/g, ' ').toUpperCase() || 'USER'}
              </div>
            </div>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={logout}>
            <span className="material-icons" style={{ fontSize: 16 }}>logout</span> Logout
          </button>
        </div>
      </div>

      {/* Welcome */}
      <div style={{ padding: '32px 24px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          Welcome, {user?.full_name?.split(' ')[0] || user?.username}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Select a module to get started</p>
      </div>

      {/* Module grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, padding: '16px 24px 40px', maxWidth: 1000, margin: '0 auto' }}>
        {visibleModules.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>lock</span>
            <p>You don't have access to any modules. Please contact HR.</p>
          </div>
        ) : visibleModules.map(m => (
          <button
            key={m.id}
            onClick={() => navigateToModule(m)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, cursor: 'pointer', transition: 'all .2s', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
            onMouseOver={e => { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${m.color}22` }}
            onMouseOut={e =>  { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            <span className="material-icons" style={{ fontSize: 44, color: m.color }}>{m.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
