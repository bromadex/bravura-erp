import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import HomeGrid from './pages/HomeGrid'
import Layout from './components/layout/Layout'

// Inventory Pages
import StockBalance from './pages/Inventory/StockBalance'
import StockIn from './pages/Inventory/StockIn'
import StockOut from './pages/Inventory/StockOut'
import Transactions from './pages/Inventory/Transactions'
import StockTaking from './pages/Inventory/StockTaking'
import Categories from './pages/Inventory/Categories'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)', gap:12 }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

const MODULES = [
  { id:'dashboard',   pages:['overview'] },
  { id:'procurement', pages:['suppliers','store-requisitions','purchase-requisitions','purchase-orders','goods-received'] },
  { id:'inventory',   pages:['stock-balance','stock-in','stock-out','transactions','stock-taking','categories'] },
  { id:'logistics',   pages:['goods-received','batch-plant','campsite'] },
  { id:'fuel',        pages:['tanks','dipstick','issuance','deliveries','reports'] },
  { id:'fleet',       pages:['vehicles','generators','heavy-equipment'] },
  { id:'hr',          pages:['employees','timesheets','leave','payroll','permissions'] },
  { id:'accounting',  pages:['chart-of-accounts','journal-entries','reports'] },
  { id:'reports',     pages:['overview','audit-log','drafts'] },
]

function ModulePlaceholder({ module, page }) {
  const navigate = useNavigate()
  const label = page?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const modLabel = module?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', gap:16 }}>
      <span className="material-icons" style={{ fontSize:72, opacity:.3, color:'var(--gold)' }}>construction</span>
      <div><div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text-dim)', letterSpacing:2, marginBottom:6 }}>{modLabel}</div>
      <h2 style={{ fontSize:22, fontWeight:800 }}>{label}</h2>
      <p style={{ color:'var(--text-dim)', marginTop:8, fontSize:13 }}>This page is under development</p></div>
      <button className="btn btn-secondary" onClick={() => navigate('/')}><span className="material-icons" style={{ fontSize:16 }}>home</span> Back to Home</button>
    </div>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />

      {/* Dashboard - simple */}
      <Route path="/module/dashboard" element={<ProtectedRoute><ModulePlaceholder module="dashboard" page="overview" /></ProtectedRoute>} />

      {/* Inventory - full implementation */}
      <Route path="/module/inventory" element={<ProtectedRoute><Layout module="inventory" /></ProtectedRoute>}>
        <Route index element={<StockBalance />} />
        <Route path="stock-balance" element={<StockBalance />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="stock-out" element={<StockOut />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="stock-taking" element={<StockTaking />} />
        <Route path="categories" element={<Categories />} />
      </Route>

      {/* Other modules - placeholder */}
      {MODULES.filter(m => m.id !== 'inventory' && m.id !== 'dashboard').map(mod => (
        <Route key={mod.id} path={`/module/${mod.id}`} element={<ProtectedRoute><Layout module={mod.id} /></ProtectedRoute>}>
          <Route index element={<ModulePlaceholder module={mod.id} page={mod.pages[0]} />} />
          {mod.pages.map(page => <Route key={page} path={page} element={<ModulePlaceholder module={mod.id} page={page} />} />)}
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
        <Toaster position="top-right" toastOptions={{ style: { background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border2)' } }} />
      </BrowserRouter>
    </AuthProvider>
  )
}
