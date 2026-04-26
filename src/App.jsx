import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'

// Simple placeholder for all module pages (no sidebar yet)
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

function AppRoutes() {
  const { user } = useAuth()
  
  // Define all module routes
  const modules = [
    'dashboard', 'procurement', 'inventory', 'logistics', 
    'fuel', 'fleet', 'hr', 'accounting', 'reports'
  ]

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={user ? <HomeGrid /> : <Navigate to="/login" replace />} />
      
      {/* Create routes for all modules */}
      {modules.map(module => (
        <Route 
          key={module}
          path={`/module/${module}`} 
          element={
            <ProtectedRoute>
              <ModulePlaceholder moduleName={module.charAt(0).toUpperCase() + module.slice(1)} />
            </ProtectedRoute>
          } 
        />
      ))}
      
      {/* Also handle sub-routes like /module/inventory/stock-balance */}
      <Route 
        path="/module/inventory/:page" 
        element={
          <ProtectedRoute>
            <ModulePlaceholder moduleName="Inventory" />
          </ProtectedRoute>
        } 
      />
      
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
