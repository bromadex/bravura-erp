
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Placeholder for any missing page
const Placeholder = ({ title }) => (
  <div className="empty-state">
    <span className="material-icons" style={{ fontSize: 48 }}>construction</span>
    <div className="empty-text">{title} – coming soon</div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex-center" style={{ height: '100vh' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Helper to generate routes for a module
function ModuleRoutes({ module, pages }) {
  return (
    <Route path={`/module/${module}`} element={<Layout module={module} />}>
      <Route index element={<Navigate to={pages[0]} replace />} />
      {pages.map(page => (
        <Route key={page} path={page} element={<Placeholder title={`${module} / ${page}`} />} />
      ))}
    </Route>
  )
}

function AppRoutes() {
  const { user } = useAuth()

  const modulePages = {
    inventory: ['stock-balance', 'stock-in', 'stock-out', 'transactions', 'stock-taking', 'store-requisition', 'low-stock-alerts', 'categories'],
    procurement: ['suppliers', 'purchase-requisitions', 'purchase-orders', 'goods-received'],
    fuel: ['fuel-tanks', 'dipstick', 'fuel-issuance', 'fuel-deliveries', 'fuel-reports'],
    fleet: ['vehicles', 'generators', 'heavy-equipment'],
    hr: ['employees', 'designations', 'skill-matrix', 'certifications', 'training', 'travel-expenses', 'leave-requests'],
    accounting: ['chart-of-accounts', 'journal-entries', 'purchase-invoices', 'trial-balance', 'profit-loss', 'balance-sheet'],
    reports: ['analytics', 'drafts-manager', 'audit-trail', 'user-management', 'settings'],
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />

      {Object.entries(modulePages).map(([module, pages]) => (
        <Route key={module} path={`/module/${module}`} element={<Layout module={module} />}>
          <Route index element={<Navigate to={pages[0]} replace />} />
          {pages.map(page => (
            <Route key={page} path={page} element={<Placeholder title={`${module} / ${page}`} />} />
          ))}
        </Route>
      ))}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </AuthProvider>
  )
}
