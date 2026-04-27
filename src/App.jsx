import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { InventoryProvider } from './contexts/InventoryContext'
import { ProcurementProvider } from './contexts/ProcurementContext'
import { FuelProvider } from './contexts/FuelContext'
import { FleetProvider } from './contexts/FleetContext'
import { HRProvider } from './contexts/HRContext'
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

// Procurement Pages
import Suppliers from './pages/Procurement/Suppliers'
import StoreRequisitions from './pages/Procurement/StoreRequisitions'
import PurchaseRequisitions from './pages/Procurement/PurchaseRequisitions'
import PurchaseOrders from './pages/Procurement/PurchaseOrders'
import GoodsReceived from './pages/Procurement/GoodsReceived'

// Fuel Pages
import FuelTanks from './pages/Fuel/FuelTanks'
import FuelIssuance from './pages/Fuel/FuelIssuance'
import FuelDeliveries from './pages/Fuel/FuelDeliveries'
import DipstickLog from './pages/Fuel/DipstickLog'
import FuelReports from './pages/Fuel/FuelReports'

// Fleet Pages
import FleetDashboard from './pages/Fleet/FleetDashboard'
import Vehicles from './pages/Fleet/Vehicles'
import Generators from './pages/Fleet/Generators'
import HeavyEquipment from './pages/Fleet/HeavyEquipment'
import MaintenanceAlerts from './pages/Fleet/MaintenanceAlerts'
import AssetIssues from './pages/Fleet/AssetIssues'

// HR Pages
import Employees from './pages/HR/Employees'
import Designations from './pages/HR/Designations'
import UserPermissions from './pages/HR/UserPermissions'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text-dim)' }}>Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Placeholder for other modules that are not yet built
function ModulePlaceholder({ module, page }) {
  const navigate = useNavigate()
  const label = page?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const modLabel = module?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', gap:16 }}>
      <span className="material-icons" style={{ fontSize:72, opacity:.3, color:'var(--gold)' }}>construction</span>
      <div>
        <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text-dim)', letterSpacing:2, marginBottom:6 }}>{modLabel}</div>
        <h2 style={{ fontSize:22, fontWeight:800 }}>{label}</h2>
        <p style={{ color:'var(--text-dim)', marginTop:8, fontSize:13 }}>Under development</p>
      </div>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        <span className="material-icons" style={{ fontSize:16 }}>home</span> Back to Home
      </button>
    </div>
  )
}

const OTHER_MODULES = [
  { id:'logistics',   pages:['goods-received','batch-plant','campsite'] },
  { id:'accounting',  pages:['chart-of-accounts','journal-entries','reports'] },
  { id:'reports',     pages:['overview','audit-log','drafts'] },
]

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />

      {/* Dashboard placeholder */}
      <Route path="/module/dashboard" element={<ProtectedRoute><ModulePlaceholder module="dashboard" page="overview" /></ProtectedRoute>} />

      {/* INVENTORY */}
      <Route path="/module/inventory" element={<ProtectedRoute><InventoryProvider><Layout module="inventory" /></InventoryProvider></ProtectedRoute>}>
        <Route index element={<StockBalance />} />
        <Route path="stock-balance" element={<StockBalance />} />
        <Route path="stock-in" element={<StockIn />} />
        <Route path="stock-out" element={<StockOut />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="stock-taking" element={<StockTaking />} />
        <Route path="categories" element={<Categories />} />
      </Route>

      {/* PROCUREMENT */}
      <Route path="/module/procurement" element={<ProtectedRoute><ProcurementProvider><Layout module="procurement" /></ProcurementProvider></ProtectedRoute>}>
        <Route index element={<Suppliers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="store-requisitions" element={<StoreRequisitions />} />
        <Route path="purchase-requisitions" element={<PurchaseRequisitions />} />
        <Route path="purchase-orders" element={<PurchaseOrders />} />
        <Route path="goods-received" element={<GoodsReceived />} />
      </Route>

      {/* FUEL MANAGEMENT */}
      <Route path="/module/fuel" element={
        <ProtectedRoute>
          <ProcurementProvider>
            <FuelProvider>
              <Layout module="fuel" />
            </FuelProvider>
          </ProcurementProvider>
        </ProtectedRoute>
      }>
        <Route index element={<FuelTanks />} />
        <Route path="tanks" element={<FuelTanks />} />
        <Route path="issuance" element={<FuelIssuance />} />
        <Route path="deliveries" element={<FuelDeliveries />} />
        <Route path="dipstick" element={<DipstickLog />} />
        <Route path="reports" element={<FuelReports />} />
      </Route>

      {/* FLEET & ASSETS */}
      <Route path="/module/fleet" element={
        <ProtectedRoute>
          <FleetProvider>
            <Layout module="fleet" />
          </FleetProvider>
        </ProtectedRoute>
      }>
        <Route index element={<FleetDashboard />} />
        <Route path="dashboard" element={<FleetDashboard />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="generators" element={<Generators />} />
        <Route path="heavy-equipment" element={<HeavyEquipment />} />
        <Route path="maintenance-alerts" element={<MaintenanceAlerts />} />
        <Route path="asset-issues" element={<AssetIssues />} />
      </Route>

      {/* HUMAN RESOURCES */}
      <Route path="/module/hr" element={
        <ProtectedRoute>
          <HRProvider>
            <Layout module="hr" />
          </HRProvider>
        </ProtectedRoute>
      }>
        <Route index element={<Employees />} />
        <Route path="employees" element={<Employees />} />
        <Route path="designations" element={<Designations />} />
        <Route path="permissions" element={<UserPermissions />} />
        <Route path="leave" element={<ModulePlaceholder module="hr" page="leave" />} />
        <Route path="travel" element={<ModulePlaceholder module="hr" page="travel" />} />
      </Route>

      {/* OTHER MODULES – placeholders */}
      {OTHER_MODULES.map(mod => (
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
        <Toaster position="top-right" toastOptions={{
          style: { background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border2)' },
          success: { iconTheme: { primary:'var(--green)', secondary:'var(--surface)' } },
          error: { iconTheme: { primary:'var(--red)', secondary:'var(--surface)' } },
        }} />
      </BrowserRouter>
    </AuthProvider>
  )
}
