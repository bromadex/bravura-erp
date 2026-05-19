// src/pages/HomeGrid.jsx
//
// Consolidated into 7 super-modules. Each super-module aggregates permission
// checks across all its constituent modules: if the user can see ANY page in
// ANY sub-module, the tile is visible.

import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../contexts/PermissionContext'
import TopBar from '../components/layout/TopBar'

// Each entry has: id, icon, label, color, desc, route, checks: [{module, pages}]
const ALL_MODULES = [
  {
    id: 'people', icon: 'badge', label: 'People & Workforce', color: '#f87171',
    desc: 'Employees, payroll, leave, recruitment & expenses',
    route: '/module/hr',
    mergedCount: 2,
    checks: [
      { module: 'hr',       pages: ['employees','payroll','leave','attendance','dashboard'] },
      { module: 'expenses', pages: ['claims','advances'] },
    ],
  },
  {
    id: 'supply-chain', icon: 'inventory_2', label: 'Supply Chain', color: '#a78bfa',
    desc: 'Procurement, warehouse stock & logistics',
    route: '/module/procurement',
    mergedCount: 3,
    checks: [
      { module: 'procurement', pages: ['suppliers','purchase-orders','store-requisitions','dashboard'] },
      { module: 'inventory',   pages: ['stock-balance','stock-in','stock-out'] },
      { module: 'logistics',   pages: ['batch-plant','deliveries'] },
    ],
  },
  {
    id: 'operations', icon: 'engineering', label: 'Operations', color: '#34d399',
    desc: 'Fleet, assets, fuel management & campsite',
    route: '/module/fleet',
    mergedCount: 3,
    checks: [
      { module: 'fleet',    pages: ['vehicles','dashboard','asset-registry','registry'] },
      { module: 'fuel',     pages: ['tanks','issuance','dipstick'] },
      { module: 'campsite', pages: ['overview','assignments','rooms'] },
    ],
  },
  {
    id: 'finance', icon: 'account_balance', label: 'Finance', color: '#818cf8',
    desc: 'General ledger, journals & petty cash',
    route: '/module/accounting',
    mergedCount: 2,
    checks: [
      { module: 'accounting', pages: ['chart-of-accounts','journal-entries','reports'] },
      { module: 'projects',   pages: ['petty-cash-dashboard','petty-cash-expenses'] },
    ],
  },
  {
    id: 'workplace', icon: 'corporate_fare', label: 'Workplace', color: '#fcd34d',
    desc: 'Announcements, memos, policies & messaging',
    route: '/module/governance',
    mergedCount: 2,
    checks: [
      { module: 'governance', pages: ['announcements','memos','policies','code-of-ethics'] },
      { module: 'connect',    pages: ['chats'] },
    ],
  },
  {
    id: 'analytics', icon: 'insights', label: 'Analytics', color: '#38bdf8',
    desc: 'KPI dashboards, reports & audit trail',
    route: '/module/reports',
    mergedCount: 1,
    checks: [
      { module: 'reports', pages: ['overview','kpi-dashboards','report-builder','audit-log'] },
    ],
  },
  {
    id: 'settings', icon: 'admin_panel_settings', label: 'Settings & Admin', color: '#a78bfa',
    desc: 'Workflow builder, assignments & system config',
    route: '/module/settings/workflows',
    mergedCount: 1,
    checks: [
      { module: 'settings', pages: ['workflows','workflow-assignments','master-data'] },
    ],
  },
]

export default function HomeGrid() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const { canView } = usePermission()

  // Show super-module if user can view ANY page in ANY of its constituent modules
  const visibleModules = ALL_MODULES.filter(mod =>
    mod.checks.some(c => c.pages.some(p => canView(c.module, p)))
  )

  // Navigate directly to the super-module route
  const navigateToModule = (mod) => {
    navigate(mod.route)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      <TopBar />

      {/* Welcome */}
      <div style={{ padding: '32px 24px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          Welcome, {user?.full_name?.split(' ')[0] || user?.username}
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Select a module to get started</p>
      </div>

      {/* Module grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, padding: '16px 24px 40px', maxWidth: 1100, margin: '0 auto' }}>
        {visibleModules.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <span className="material-icons" style={{ fontSize: 48, opacity: 0.5 }}>lock</span>
            <p>You don't have access to any modules. Please contact HR.</p>
          </div>
        ) : visibleModules.map(m => (
          <button
            key={m.id}
            onClick={() => navigateToModule(m)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 20px', cursor: 'pointer', transition: 'all .2s', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
            onMouseOver={e => { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${m.color}22` }}
            onMouseOut={e =>  { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            {/* Icon in colored rounded container */}
            <div style={{ width: 60, height: 60, borderRadius: 16, background: `${m.color}18`, border: `1px solid ${m.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span className="material-icons" style={{ fontSize: 32, color: m.color }}>{m.icon}</span>
              {m.mergedCount > 1 && (
                <div style={{ position: 'absolute', top: -6, right: -6, background: m.color, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '2px 5px', lineHeight: 1.2 }}>
                  {m.mergedCount}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
