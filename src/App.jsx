import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Placeholder for inventory pages (will be replaced with real components later)
function InventoryPlaceholder({ pageName }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <span className="material-icons" style={{ fontSize: 64, opacity: 0.4, marginBottom: 16 }}>inventory</span>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>Inventory / {pageName}</h2>
      <p style={{ color: 'var(--text-dim)' }}>This page is under development</p>
    </div>
  )
}

// Simple placeholder for other modules (no sidebar)
function ModulePlaceholder({ moduleName }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <span className="material-icons" style={{ fontSize: 64, opacity: 0.4, marginBottom: 16 }}>construction</span>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>{moduleName} Module</h2>
      <p style={{ color: 'var(--text-dim)' }}>Coming soon – Under development</p>
      <button 
        className="btn btn-secondary" 
        style={{ marginTop: 20 }}
        onClick={() => window.location.href = '/'}
      >
        Back to Home
      </button>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Inventory pages list (must match Sidebar.jsx)
const inventoryPages = [
  'stock-balance', 'stock-in', 'stock-out', 'transactions', 'stock-taking'
]

function AppRoutes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const onNavigate = (path) => navigate(path)

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={user ? <HomeGrid /> : <Navigate to="/login" replace />} />

      {/* INVENTORY - with sidebar */}
      <Route path="/module/inventory" element={<ProtectedRoute><Layout module="inventory" onNavigate={onNavigate} /></ProtectedRoute>}>
        {inventoryPages.map(page => (
          <Route 
            key={page} 
            path={page} 
            element={<InventoryPlaceholder pageName={page.replace('-', ' ')} />} 
          />
        ))}
        {/* Default redirect to stock-balance if no page specified */}
        <Route index element={<Navigate to="stock-balance" replace />} />
      </Route>

      {/* ALL OTHER MODULES - no sidebar yet */}
      <Route path="/module/dashboard" element={<ProtectedRoute><ModulePlaceholder moduleName="Dashboard" /></ProtectedRoute>} />
      <Route path="/module/procurement" element={<ProtectedRoute><ModulePlaceholder moduleName="Procurement" /></ProtectedRoute>} />
      <Route path="/module/logistics" element={<ProtectedRoute><ModulePlaceholder moduleName="Logistics" /></ProtectedRoute>} />
      <Route path="/module/fuel" element={<ProtectedRoute><ModulePlaceholder moduleName="Fuel Management" /></ProtectedRoute>} />
      <Route path="/module/fleet" element={<ProtectedRoute><ModulePlaceholder moduleName="Fleet" /></ProtectedRoute>} />
      <Route path="/module/hr" element={<ProtectedRoute><ModulePlaceholder moduleName="Human Resources" /></ProtectedRoute>} />
      <Route path="/module/accounting" element={<ProtectedRoute><ModulePlaceholder moduleName="Accounting" /></ProtectedRoute>} />
      <Route path="/module/reports" element={<ProtectedRoute><ModulePlaceholder moduleName="Reports" /></ProtectedRoute>} />

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
