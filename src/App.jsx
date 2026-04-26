import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Placeholder for inventory pages
const InventoryPlaceholder = ({ title }) => (
  <div className="empty-state">
    <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>inventory</span>
    <div className="empty-text">{title} – Coming soon</div>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Inventory pages list
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

      {/* Inventory module with sidebar - TEST ONLY */}
      <Route path="/module/inventory" element={<ProtectedRoute><Layout module="inventory" onNavigate={onNavigate} /></ProtectedRoute>}>
        {inventoryPages.map(page => (
          <Route key={page} path={page} element={<InventoryPlaceholder title={`Inventory / ${page.replace('-', ' ')}`} />} />
        ))}
      </Route>

      {/* All other modules still show alert (no sidebar) */}
      <Route path="/module/procurement" element={<ProtectedRoute><div style={{ padding: 40 }}>Procurement – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/fuel" element={<ProtectedRoute><div style={{ padding: 40 }}>Fuel – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/fleet" element={<ProtectedRoute><div style={{ padding: 40 }}>Fleet – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/hr" element={<ProtectedRoute><div style={{ padding: 40 }}>HR – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/accounting" element={<ProtectedRoute><div style={{ padding: 40 }}>Accounting – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/reports" element={<ProtectedRoute><div style={{ padding: 40 }}>Reports – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/dashboard" element={<ProtectedRoute><div style={{ padding: 40 }}>Dashboard – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />
      <Route path="/module/logistics" element={<ProtectedRoute><div style={{ padding: 40 }}>Logistics – Coming soon. <button onClick={() => navigate('/')}>Back to Home</button></div></ProtectedRoute>} />

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
