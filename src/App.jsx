import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Placeholder components for pages (will be replaced later)
const Placeholder = ({ title }) => (
  <div className="empty-state">
    <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>construction</span>
    <div className="empty-text">{title} – coming soon</div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Dashboard component (simple placeholder for now)
function DashboardPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">TOTAL ITEMS</div>
          <div className="kpi-val" style={{ color: 'var(--gold)' }}>0</div>
          <div className="kpi-sub">Loading...</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">LOW STOCK</div>
          <div className="kpi-val" style={{ color: 'var(--red)' }}>0</div>
          <div className="kpi-sub">Items below threshold</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">FUEL TANK LEVEL</div>
          <div className="kpi-val" style={{ color: 'var(--teal)' }}>0%</div>
          <div className="kpi-sub">No data yet</div>
        </div>
      </div>
    </div>
  )
}

// Logistics component (placeholder)
function LogisticsPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Logistics</h1>
      </div>
      <Placeholder title="Logistics module – Goods Received, Batch Plant, Campsite" />
    </div>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const onNavigate = (path) => navigate(path)

  // Define module pages
  const inventoryPages = [
    'stock-balance', 'stock-in', 'stock-out', 'transactions', 'stock-taking',
    'store-requisition', 'low-stock-alerts', 'categories'
  ]
  const procurementPages = ['suppliers', 'purchase-requisitions', 'purchase-orders', 'goods-received']
  const fuelPages = ['fuel-tanks', 'dipstick', 'fuel-issuance', 'fuel-deliveries', 'fuel-reports']
  const fleetPages = ['vehicles', 'generators', 'heavy-equipment']
  const hrPages = ['employees', 'designations', 'skill-matrix', 'certifications', 'training', 'travel-expenses', 'leave-requests']
  const accountingPages = ['chart-of-accounts', 'journal-entries', 'purchase-invoices', 'trial-balance', 'profit-loss', 'balance-sheet']
  const reportsPages = ['analytics', 'drafts-manager', 'audit-trail', 'user-management', 'settings']

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />

      {/* Dashboard - direct route (no sidebar) */}
      <Route path="/module/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

      {/* Logistics - direct route (no sidebar) */}
      <Route path="/module/logistics" element={<ProtectedRoute><LogisticsPage /></ProtectedRoute>} />

      {/* Inventory module with sidebar */}
      <Route path="/module/inventory" element={<ProtectedRoute><Layout module="inventory" onNavigate={onNavigate} /></ProtectedRoute>}>
        {inventoryPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Inventory / ${page}`} />} />)}
      </Route>

      {/* Procurement module with sidebar */}
      <Route path="/module/procurement" element={<ProtectedRoute><Layout module="procurement" onNavigate={onNavigate} /></ProtectedRoute>}>
        {procurementPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Procurement / ${page}`} />} />)}
      </Route>

      {/* Fuel module with sidebar */}
      <Route path="/module/fuel" element={<ProtectedRoute><Layout module="fuel" onNavigate={onNavigate} /></ProtectedRoute>}>
        {fuelPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Fuel / ${page}`} />} />)}
      </Route>

      {/* Fleet module with sidebar */}
      <Route path="/module/fleet" element={<ProtectedRoute><Layout module="fleet" onNavigate={onNavigate} /></ProtectedRoute>}>
        {fleetPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Fleet / ${page}`} />} />)}
      </Route>

      {/* HR module with sidebar */}
      <Route path="/module/hr" element={<ProtectedRoute><Layout module="hr" onNavigate={onNavigate} /></ProtectedRoute>}>
        {hrPages.map(page => <Route key={page} path={page} element={<Placeholder title={`HR / ${page}`} />} />)}
      </Route>

      {/* Accounting module with sidebar */}
      <Route path="/module/accounting" element={<ProtectedRoute><Layout module="accounting" onNavigate={onNavigate} /></ProtectedRoute>}>
        {accountingPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Accounting / ${page}`} />} />)}
      </Route>

      {/* Reports module with sidebar */}
      <Route path="/module/reports" element={<ProtectedRoute><Layout module="reports" onNavigate={onNavigate} /></ProtectedRoute>}>
        {reportsPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Reports / ${page}`} />} />)}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border2)' },
            success: { iconTheme: { primary:'var(--green)', secondary:'var(--surface)' } },
            error: { iconTheme: { primary:'var(--red)', secondary:'var(--surface)' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
      }
