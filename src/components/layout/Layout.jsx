import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import Breadcrumbs from './Breadcrumbs'
import { useRecentPages } from '../../hooks/useRecentPages'

// Module display names for breadcrumb labels
const MODULE_LABELS = {
  dashboard: 'Dashboard', inventory: 'Inventory', procurement: 'Procurement',
  fuel: 'Fuel', fleet: 'Fleet', hr: 'HR', campsite: 'Campsite',
  logistics: 'Logistics', accounting: 'Accounting', governance: 'Governance',
  connect: 'Connect', reports: 'Reports', settings: 'Settings',
}

const PAGE_LABELS = {
  'stock-balance': 'Stock Balance', 'stock-in': 'Stock In', 'stock-out': 'Stock Out',
  'stock-transfers': 'Stock Transfers',
  'stock-taking': 'Stock Taking', 'transactions': 'Transactions', 'categories': 'Categories',
  'store-requisitions': 'Store Requisitions', 'warehouses': 'Warehouses',
  'batch-serials': 'Batch & Serial Tracking',
  'stock-ageing': 'Stock Ageing Report',
  'forecast-reorder': 'Forecast & Reorder Intelligence',
  'supplier-price-lists': 'Supplier Price Lists',
  'cost-centre-report': 'Cost Centre Report',
  'budget-vs-actual': 'Budget vs Actual',
  'governance-policies': 'Governance Policies',
  'inventory-audit-log': 'Ops Audit Log',
  'dashboard': 'Dashboard',
  'dept-consumption': 'Department Consumption',
  'material-requests': 'Material Requests',
  'suppliers': 'Suppliers', 'store-requisitions': 'Store Requisitions',
  'purchase-requisitions': 'Purchase Requisitions', 'purchase-orders': 'Purchase Orders',
  'goods-received': 'Goods Received',
  'landed-costs': 'Landed Cost Vouchers',
  'tanks': 'Fuel Tanks', 'dipstick': 'Dipstick Log', 'issuance': 'Fuel Issuance',
  'deliveries': 'Deliveries', 'reports': 'Reports',
  'vehicles': 'Vehicles', 'generators': 'Generators', 'heavy-equipment': 'Heavy Equipment',
  'maintenance-alerts': 'Maintenance Alerts', 'asset-issues': 'Asset Issues',
  'employees': 'Employees', 'departments': 'Departments', 'designations': 'Designations',
  'attendance': 'Attendance', 'leave': 'Leave', 'leave-balance': 'Leave Balance',
  'leave-calendar': 'Leave Calendar', 'travel': 'Travel', 'payroll': 'Payroll',
  'permissions': 'Permissions', 'timesheet': 'Timesheet',
  'overview': 'Overview', 'blocks': 'Blocks', 'rooms': 'Rooms',
  'assignments': 'Assignments', 'camp-stock': 'Camp Stock', 'ppe-register': 'PPE Register',
  'batch-plant': 'Batch Plant', 'camp-management': 'Camp Management',
  'memos': 'Memos', 'announcements': 'Announcements', 'policies': 'Policies',
  'chart-of-accounts': 'Chart of Accounts', 'journal-entries': 'Journal Entries',
  'audit-log': 'Audit Log', 'drafts': 'Drafts',
  'master-data': 'Master Data', 'workflows': 'Workflow Builder',
}

export default function Layout({ module }) {
  const location   = useLocation()
  const navigate   = useNavigate()
  const { trackPage } = useRecentPages()

  // Build breadcrumb segments from path
  const crumbs = useMemo(() => {
    const segments = location.pathname.replace('/module/', '').split('/').filter(Boolean)
    const result = [{ label: 'Home', path: '/' }]
    segments.forEach((seg, i) => {
      const path = '/module/' + segments.slice(0, i + 1).join('/')
      const label = (i === 0 ? MODULE_LABELS[seg] : PAGE_LABELS[seg]) || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      result.push({ label, path })
    })
    return result
  }, [location.pathname])

  // Track the current page in recent history
  useEffect(() => {
    const lastCrumb = crumbs[crumbs.length - 1]
    if (lastCrumb && lastCrumb.path !== '/') {
      trackPage({ path: lastCrumb.path, label: lastCrumb.label, module })
    }
  }, [location.pathname])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar module={module} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <Breadcrumbs crumbs={crumbs} navigate={navigate} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
