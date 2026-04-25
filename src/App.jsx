import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Placeholder components for pages (will be replaced later)
const Placeholder = ({ title }) => (
  <div className="empty-state">
    <span className="material-icons" style={{ fontSize: 48 }}>construction</span>
    <div className="empty-text">{title} – coming soon</div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Helper to generate placeholder routes for a module
function makeModuleRoutes(module, pages) {
  return pages.map(page => (
    <Route key={page.id} path={page.id} element={<Placeholder title={`${module} / ${page.label}`} />} />
  ))
}

function AppRoutes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const onNavigate = (path) => navigate(path)

  // Define module pages (same as in Sidebar)
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

      {/* Module layouts */}
      <Route path="/module/inventory" element={<Layout module="inventory" onNavigate={onNavigate} />}>
        {inventoryPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Inventory / ${page}`} />} />)}
      </Route>
      <Route path="/module/procurement" element={<Layout module="procurement" onNavigate={onNavigate} />}>
        {procurementPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Procurement / ${page}`} />} />)}
      </Route>
      <Route path="/module/fuel" element={<Layout module="fuel" onNavigate={onNavigate} />}>
        {fuelPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Fuel / ${page}`} />} />)}
      </Route>
      <Route path="/module/fleet" element={<Layout module="fleet" onNavigate={onNavigate} />}>
        {fleetPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Fleet / ${page}`} />} />)}
      </Route>
      <Route path="/module/hr" element={<Layout module="hr" onNavigate={onNavigate} />}>
        {hrPages.map(page => <Route key={page} path={page} element={<Placeholder title={`HR / ${page}`} />} />)}
      </Route>
      <Route path="/module/accounting" element={<Layout module="accounting" onNavigate={onNavigate} />}>
        {accountingPages.map(page => <Route key={page} path={page} element={<Placeholder title={`Accounting / ${page}`} />} />)}
      </Route>
      <Route path="/module/reports" element={<Layout module="reports" onNavigate={onNavigate} />}>
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
