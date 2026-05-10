// src/components/QuickActionsPanel.jsx
//
// Press Ctrl+K (or Cmd+K on Mac) to open the command palette.
// Registered globally in TopBar via useEffect.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ALL_ACTIONS = [
  // Navigation
  { id: 'nav-dashboard',    label: 'Go to Dashboard',             desc: 'Main overview',                icon: 'home',           color: '#60a5fa', path: '/' },
  { id: 'nav-employees',    label: 'Go to Employees',             desc: 'HR · Employee list',           icon: 'people',         color: '#34d399', path: '/module/hr/employees' },
  { id: 'nav-leave',        label: 'Go to Leave',                 desc: 'HR · Leave requests',          icon: 'event_note',     color: '#34d399', path: '/module/hr/leave' },
  { id: 'nav-attendance',   label: 'Go to Attendance',            desc: 'HR · Daily attendance',        icon: 'schedule',       color: '#34d399', path: '/module/hr/attendance' },
  { id: 'nav-payroll',      label: 'Go to Payroll',               desc: 'HR · Payroll processing',      icon: 'payments',       color: '#34d399', path: '/module/hr/payroll' },
  { id: 'nav-stock',        label: 'Go to Stock Balance',         desc: 'Inventory · Stock levels',     icon: 'inventory_2',    color: '#60a5fa', path: '/module/inventory/stock-balance' },
  { id: 'nav-stock-in',     label: 'Go to Stock In',              desc: 'Inventory · Receive stock',    icon: 'add_box',        color: '#60a5fa', path: '/module/inventory/stock-in' },
  { id: 'nav-po',           label: 'Go to Purchase Orders',       desc: 'Procurement · PO list',        icon: 'shopping_bag',   color: '#a78bfa', path: '/module/procurement/purchase-orders' },
  { id: 'nav-sr',           label: 'Go to Store Requisitions',    desc: 'Procurement · SR list',        icon: 'assignment',     color: '#a78bfa', path: '/module/procurement/store-requisitions' },
  { id: 'nav-grn',          label: 'Go to Goods Received',        desc: 'Procurement · GRN list',       icon: 'move_to_inbox',  color: '#a78bfa', path: '/module/procurement/goods-received' },
  { id: 'nav-suppliers',    label: 'Go to Suppliers',             desc: 'Procurement · Supplier list',  icon: 'local_shipping', color: '#a78bfa', path: '/module/procurement/suppliers' },
  { id: 'nav-fuel',         label: 'Go to Fuel Issuance',         desc: 'Fuel · Issue fuel',            icon: 'local_gas_station', color: '#fbbf24', path: '/module/fuel/issuance' },
  { id: 'nav-vehicles',     label: 'Go to Vehicles',              desc: 'Fleet · Vehicle list',         icon: 'directions_car', color: '#f59e0b', path: '/module/fleet/vehicles' },
  { id: 'nav-camp',         label: 'Go to Camp Management',       desc: 'Logistics · Camp ops',         icon: 'hotel',          color: '#2dd4bf', path: '/module/logistics/camp-management' },
  { id: 'nav-memos',        label: 'Go to Memos',                 desc: 'Governance · Internal memos',  icon: 'mail',           color: '#818cf8', path: '/module/governance/memos' },
  { id: 'nav-audit',        label: 'Go to Audit Trail',           desc: 'Reports · Full audit log',     icon: 'history',        color: '#94a3b8', path: '/module/reports/audit-log' },
  { id: 'nav-master',       label: 'Go to Master Data',           desc: 'Settings · Reference data',    icon: 'database',       color: '#c084fc', path: '/module/settings/master-data' },
  // Quick actions (navigation-based, actual forms open on the destination page)
  { id: 'act-leave',        label: 'Submit Leave Request',        desc: 'HR · Open leave form',         icon: 'event_note',     color: '#34d399', path: '/module/hr/leave' },
  { id: 'act-travel',       label: 'Submit Travel Request',       desc: 'HR · Open travel form',        icon: 'flight',         color: '#34d399', path: '/module/hr/travel' },
  { id: 'act-sr',           label: 'New Store Requisition',       desc: 'Procurement · Create SR',      icon: 'add_shopping_cart', color: '#a78bfa', path: '/module/procurement/store-requisitions' },
  { id: 'act-po',           label: 'New Purchase Order',          desc: 'Procurement · Create PO',      icon: 'shopping_bag',   color: '#a78bfa', path: '/module/procurement/purchase-orders' },
  { id: 'act-fuel',         label: 'Issue Fuel',                  desc: 'Fuel · Log issuance',          icon: 'local_gas_station', color: '#fbbf24', path: '/module/fuel/issuance' },
  { id: 'act-announce',     label: 'New Announcement',            desc: 'Governance · Post announcement', icon: 'campaign',     color: '#818cf8', path: '/module/governance/announcements' },
]

export default function QuickActionsPanel({ open, onClose }) {
  const navigate    = useNavigate()
  const inputRef    = useRef(null)
  const [query,     setQuery]     = useState('')
  const [selected,  setSelected]  = useState(0)

  const filtered = query.trim()
    ? ALL_ACTIONS.filter(a => `${a.label} ${a.desc}`.toLowerCase().includes(query.toLowerCase()))
    : ALL_ACTIONS

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  const choose = useCallback((action) => {
    navigate(action.path)
    onClose()
  }, [navigate, onClose])

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered[selected]) choose(filtered[selected]) }
    if (e.key === 'Escape')    { onClose() }
  }

  if (!open) return null

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="cmd-input-wrap">
          <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 20 }}>search</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search pages and actions…"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
          />
          <kbd className="cmd-shortcut" style={{ fontSize: 11 }}>ESC</kbd>
        </div>

        <div className="cmd-results">
          {filtered.length === 0
            ? <div className="cmd-empty">No results for "{query}"</div>
            : (
              <>
                {!query && <div className="cmd-section-label">Navigate & Actions</div>}
                {filtered.map((action, i) => (
                  <div
                    key={action.id}
                    className={`cmd-item${i === selected ? ' selected' : ''}`}
                    onClick={() => choose(action)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <div className="cmd-item-icon" style={{ background: action.color + '22' }}>
                      <span className="material-icons" style={{ color: action.color, fontSize: 18 }}>{action.icon}</span>
                    </div>
                    <div>
                      <div className="cmd-item-label">{action.label}</div>
                      <div className="cmd-item-desc">{action.desc}</div>
                    </div>
                  </div>
                ))}
              </>
            )
          }
        </div>
      </div>
    </div>
  )
}
