import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const MODULE_SECTIONS = {
  inventory: {
    title: 'Inventory',
    icon: 'inventory',
    pages: [
      { id: 'stock-balance', label: 'Stock Balance', icon: 'list_alt' },
      { id: 'stock-in', label: 'Stock In', icon: 'inventory_2' },
      { id: 'stock-out', label: 'Stock Out', icon: 'assignment_return' },
      { id: 'transactions', label: 'Transactions', icon: 'receipt' },
      { id: 'stock-taking', label: 'Stock Taking', icon: 'fact_check' },
      { id: 'store-requisition', label: 'Store Requisition', icon: 'request_quote' },
      { id: 'low-stock-alerts', label: 'Low Stock Alerts', icon: 'warning' },
      { id: 'categories', label: 'Categories', icon: 'category' },
    ]
  },
  procurement: {
    title: 'Procurement',
    icon: 'shopping_cart',
    pages: [
      { id: 'suppliers', label: 'Suppliers', icon: 'business' },
      { id: 'purchase-requisitions', label: 'Purchase Requisitions', icon: 'request_quote' },
      { id: 'purchase-orders', label: 'Purchase Orders', icon: 'receipt' },
      { id: 'goods-received', label: 'Goods Received', icon: 'assignment_turned_in' },
    ]
  },
  fuel: {
    title: 'Fuel Management',
    icon: 'local_gas_station',
    pages: [
      { id: 'fuel-tanks', label: 'Fuel Tanks', icon: 'storage' },
      { id: 'dipstick', label: 'Dipstick Records', icon: 'straighten' },
      { id: 'fuel-issuance', label: 'Fuel Issuance', icon: 'local_gas_station' },
      { id: 'fuel-deliveries', label: 'Fuel Deliveries', icon: 'local_shipping' },
      { id: 'fuel-reports', label: 'Fuel Reports', icon: 'bar_chart' },
    ]
  },
  fleet: {
    title: 'Fleet & Assets',
    icon: 'directions_car',
    pages: [
      { id: 'vehicles', label: 'Vehicles', icon: 'directions_car' },
      { id: 'generators', label: 'Generators', icon: 'electrical_services' },
      { id: 'heavy-equipment', label: 'Heavy Equipment', icon: 'construction' },
    ]
  },
  hr: {
    title: 'Human Resources',
    icon: 'badge',
    pages: [
      { id: 'employees', label: 'Employees', icon: 'people' },
      { id: 'designations', label: 'Designations', icon: 'work' },
      { id: 'skill-matrix', label: 'Skill Matrix', icon: 'insights' },
      { id: 'certifications', label: 'Certifications', icon: 'verified' },
      { id: 'training', label: 'Training', icon: 'school' },
      { id: 'travel-expenses', label: 'Travel Expenses', icon: 'flight' },
      { id: 'leave-requests', label: 'Leave Requests', icon: 'beach_access' },
    ]
  },
  accounting: {
    title: 'Accounting',
    icon: 'receipt',
    pages: [
      { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: 'account_tree' },
      { id: 'journal-entries', label: 'Journal Entries', icon: 'receipt' },
      { id: 'purchase-invoices', label: 'Purchase Invoices', icon: 'receipt_long' },
      { id: 'trial-balance', label: 'Trial Balance', icon: 'balance' },
      { id: 'profit-loss', label: 'Profit & Loss', icon: 'show_chart' },
      { id: 'balance-sheet', label: 'Balance Sheet', icon: 'account_balance' },
    ]
  },
  reports: {
    title: 'Reports',
    icon: 'bar_chart',
    pages: [
      { id: 'analytics', label: 'Analytics', icon: 'insights' },
      { id: 'drafts-manager', label: 'Drafts Manager', icon: 'drafts' },
      { id: 'audit-trail', label: 'Audit Trail', icon: 'history' },
      { id: 'user-management', label: 'User Management', icon: 'manage_accounts' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ]
  },
}

export default function Sidebar({ module, onNavigate }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem(`sidebar_expanded_${module}`)
    return saved ? JSON.parse(saved) : true
  })

  useEffect(() => {
    localStorage.setItem(`sidebar_expanded_${module}`, JSON.stringify(expanded))
  }, [expanded, module])

  const section = MODULE_SECTIONS[module]
  if (!section) return null

  const currentPage = location.pathname.split('/').pop()

  return (
    <aside style={{ width: 260, background: 'var(--surface)', borderRight: '1px solid var(--border)', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto', padding: '20px 12px' }}>
      {/* Home button */}
      <button
        onClick={() => onNavigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', marginBottom: 20, borderRadius: 10, background: 'transparent', border: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text)' }}
      >
        <span className="material-icons">home</span>
        <span style={{ fontWeight: 600 }}>Home</span>
      </button>

      {/* Section header (expandable) */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: expanded ? 'rgba(244,162,97,.1)' : 'transparent', marginBottom: expanded ? 8 : 0 }}
      >
        <span className="material-icons" style={{ color: 'var(--gold)' }}>{section.icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{section.title}</span>
        <span className="material-icons" style={{ fontSize: 18 }}>{expanded ? 'expand_less' : 'expand_more'}</span>
      </div>

      {/* Pages list (if expanded) */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {section.pages.map(page => {
            const isActive = currentPage === page.id
            return (
              <button
                key={page.id}
                onClick={() => onNavigate(`/module/${module}/${page.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px 8px 36px',
                  borderRadius: 8, background: isActive ? 'rgba(244,162,97,.12)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: isActive ? 'var(--gold)' : 'var(--text-mid)',
                  fontSize: 12, fontWeight: isActive ? 600 : 400, textAlign: 'left',
                }}
              >
                <span className="material-icons" style={{ fontSize: 16 }}>{page.icon}</span>
                <span>{page.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
