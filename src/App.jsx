// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { AuthProvider, useAuth }   from './contexts/AuthContext'
import { PermissionProvider }      from './contexts/PermissionContext'
import { LeaveProvider }           from './contexts/LeaveContext'
import { InventoryProvider }       from './contexts/InventoryContext'
import { ProcurementProvider }     from './contexts/ProcurementContext'
import { FuelProvider }            from './contexts/FuelContext'
import { FleetProvider }           from './contexts/FleetContext'
import { HRProvider }              from './contexts/HRContext'
import { LogisticsProvider }       from './contexts/LogisticsContext'

import Login           from './pages/Login'
import HomeGrid        from './pages/HomeGrid'
import Layout          from './components/layout/Layout'
import PermissionRoute from './components/PermissionRoute'
import AccessDenied    from './pages/Errors/AccessDenied'
import ChangePassword  from './pages/ChangePassword'

// ── Dashboard ─────────────────────────────────────────────────
import DashboardOverview from './pages/Dashboard/DashboardOverview'

// ── Inventory ─────────────────────────────────────────────────
import StockBalance     from './pages/Inventory/StockBalance'
import StockIn          from './pages/Inventory/StockIn'
import StockOut         from './pages/Inventory/StockOut'
import Transactions     from './pages/Inventory/Transactions'
import StockTaking      from './pages/Inventory/StockTaking'
import Categories       from './pages/Inventory/Categories'
import StorageLocations from './pages/Inventory/StorageLocations'

// ── Procurement ───────────────────────────────────────────────
import Suppliers            from './pages/Procurement/Suppliers'
import StoreRequisitions    from './pages/Procurement/StoreRequisitions'
import PurchaseRequisitions from './pages/Procurement/PurchaseRequisitions'
import PurchaseOrders       from './pages/Procurement/PurchaseOrders'
import GoodsReceived        from './pages/Procurement/GoodsReceived'

// ── Fuel ──────────────────────────────────────────────────────
import FuelTanks      from './pages/Fuel/FuelTanks'
import FuelIssuance   from './pages/Fuel/FuelIssuance'
import FuelDeliveries from './pages/Fuel/FuelDeliveries'
import DipstickLog    from './pages/Fuel/DipstickLog'
import FuelReports    from './pages/Fuel/FuelReports'

// ── Fleet ─────────────────────────────────────────────────────
import FleetDashboard    from './pages/Fleet/FleetDashboard'
import Vehicles          from './pages/Fleet/Vehicles'
import Generators        from './pages/Fleet/Generators'
import HeavyEquipment    from './pages/Fleet/HeavyEquipment'
import MaintenanceAlerts from './pages/Fleet/MaintenanceAlerts'
import AssetIssues       from './pages/Fleet/AssetIssues'

// ── HR ────────────────────────────────────────────────────────
import HRDashboard     from './pages/HR/HRDashboard'
import Employees       from './pages/HR/Employees'
import Departments     from './pages/HR/Departments'
import Designations    from './pages/HR/Designations'
import UserPermissions from './pages/HR/UserPermissions'
import Attendance      from './pages/HR/Attendance'
import Leave           from './pages/HR/Leave'
import LeaveBalance    from './pages/HR/LeaveBalance'
import LeaveCalendar   from './pages/HR/LeaveCalendar'
import LeaveReports    from './pages/HR/LeaveReports'
import Travel          from './pages/HR/Travel'
import Payroll         from './pages/HR/Payroll'

// ── Logistics ─────────────────────────────────────────────────
import LogisticsDashboard  from './pages/Logistics/LogisticsDashboard'
import CampManagement      from './pages/Logistics/CampManagement'
import BatchPlant          from './pages/Logistics/BatchPlant'
import LogisticsDeliveries from './pages/Logistics/LogisticsDeliveries'

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password === true && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  return children
}

function ModulePlaceholder({ module, page }) {
  const navigate = useNavigate()
  const label    = page?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const modLabel = module?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 16 }}>
      <span className="material-icons" style={{ fontSize: 72, opacity: .3, color: 'var(--gold)' }}>construction</span>
      <div>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 6 }}>{modLabel}</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>{label}</h2>
        <p style={{ color: 'var(--text-dim)', marginTop: 8, fontSize: 13 }}>Under development</p>
      </div>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>
        <span className="material-icons" style={{ fontSize: 16 }}>home</span> Back to Home
      </button>
    </div>
  )
}

// Only true placeholder modules (Logistics is now real)
const OTHER_MODULES = [
  { id: 'accounting', pages: ['chart-of-accounts', 'journal-entries', 'reports'] },
  { id: 'reports',    pages: ['overview', 'audit-log', 'drafts']                 },
]

// ───────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login"           element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/access-denied"   element={<AccessDenied />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/"                element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />

      {/* ── DASHBOARD ─────────────────────────────────────── */}
      <Route path="/module/dashboard" element={
        <ProtectedRoute>
          <PermissionRoute module="dashboard" page="overview">
            <DashboardOverview />
          </PermissionRoute>
        </ProtectedRoute>
      } />

      {/* ── INVENTORY ───────────────────────────────────── */}
      <Route path="/module/inventory" element={
        <ProtectedRoute>
          <PermissionRoute module="inventory" page="stock-balance">
            <InventoryProvider>
              <LeaveProvider>
                <Layout module="inventory" />
              </LeaveProvider>
            </InventoryProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                element={<StockBalance />} />
        <Route path="stock-balance" element={<StockBalance />} />
        <Route path="stock-in"      element={<StockIn />} />
        <Route path="stock-out"     element={<StockOut />} />
        <Route path="transactions"  element={<Transactions />} />
        <Route path="stock-taking"  element={<StockTaking />} />
        <Route path="categories"    element={<Categories />} />
        <Route path="locations"     element={<StorageLocations />} />
      </Route>

      {/* ── PROCUREMENT ─────────────────────────────────── */}
      <Route path="/module/procurement" element={
        <ProtectedRoute>
          <PermissionRoute module="procurement" page="suppliers">
            <ProcurementProvider>
              <Layout module="procurement" />
            </ProcurementProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                        element={<Suppliers />} />
        <Route path="suppliers"             element={<Suppliers />} />
        <Route path="store-requisitions"    element={<StoreRequisitions />} />
        <Route path="purchase-requisitions" element={<PurchaseRequisitions />} />
        <Route path="purchase-orders"       element={<PurchaseOrders />} />
        <Route path="goods-received"        element={<GoodsReceived />} />
      </Route>

      {/* ── FUEL ─────────────────────────────────────────── */}
      <Route path="/module/fuel" element={
        <ProtectedRoute>
          <PermissionRoute module="fuel" page="tanks">
            <ProcurementProvider>
              <FuelProvider>
                <LeaveProvider>
                  <Layout module="fuel" />
                </LeaveProvider>
              </FuelProvider>
            </ProcurementProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index              element={<FuelTanks />} />
        <Route path="tanks"       element={<FuelTanks />} />
        <Route path="issuance"    element={<FuelIssuance />} />
        <Route path="deliveries"  element={<FuelDeliveries />} />
        <Route path="dipstick"    element={<DipstickLog />} />
        <Route path="reports"     element={<FuelReports />} />
      </Route>

      {/* ── FLEET ────────────────────────────────────────── */}
      <Route path="/module/fleet" element={
        <ProtectedRoute>
          <PermissionRoute module="fleet" page="dashboard">
            <FleetProvider>
              <Layout module="fleet" />
            </FleetProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                     element={<FleetDashboard />} />
        <Route path="dashboard"          element={<FleetDashboard />} />
        <Route path="vehicles"           element={<Vehicles />} />
        <Route path="generators"         element={<Generators />} />
        <Route path="heavy-equipment"    element={<HeavyEquipment />} />
        <Route path="maintenance-alerts" element={<MaintenanceAlerts />} />
        <Route path="asset-issues"       element={<AssetIssues />} />
      </Route>

      {/* ── HR ───────────────────────────────────────────── */}
      <Route path="/module/hr" element={
        <ProtectedRoute>
          <PermissionRoute module="hr" page="dashboard">
            <HRProvider>
              <LeaveProvider>
                <Layout module="hr" />
              </LeaveProvider>
            </HRProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                 element={<HRDashboard />} />
        <Route path="dashboard"      element={<HRDashboard />} />
        <Route path="employees"      element={<Employees />} />
        <Route path="departments"    element={<Departments />} />
        <Route path="designations"   element={<Designations />} />
        <Route path="permissions"    element={<UserPermissions />} />
        <Route path="attendance"     element={<Attendance />} />
        <Route path="leave"          element={<Leave />} />
        <Route path="leave-balance"  element={<LeaveBalance />} />
        <Route path="leave-calendar" element={<LeaveCalendar />} />
        <Route path="leave-reports"  element={<LeaveReports />} />
        <Route path="travel"         element={<Travel />} />
        <Route path="payroll"        element={<Payroll />} />
      </Route>

      {/* ── LOGISTICS ────────────────────────────────────── */}
      <Route path="/module/logistics" element={
        <ProtectedRoute>
          <PermissionRoute module="logistics" page="dashboard">
            <LogisticsProvider>
              <Layout module="logistics" />
            </LogisticsProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index              element={<LogisticsDashboard />} />
        <Route path="dashboard"   element={<LogisticsDashboard />} />
        <Route path="camp"        element={<CampManagement />} />
        <Route path="batch-plant" element={<BatchPlant />} />
        <Route path="deliveries"  element={<LogisticsDeliveries />} />
      </Route>

      {/* ── PLACEHOLDER MODULES ──────────────────────────── */}
      {OTHER_MODULES.map(mod => (
        <Route key={mod.id} path={`/module/${mod.id}`} element={
          <ProtectedRoute>
            <PermissionRoute module={mod.id} page={mod.pages[0]}>
              <Layout module={mod.id} />
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index element={<ModulePlaceholder module={mod.id} page={mod.pages[0]} />} />
          {mod.pages.map(page => (
            <Route key={page} path={page} element={<ModulePlaceholder module={mod.id} page={page} />} />
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
      <PermissionProvider>
        <LeaveProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" toastOptions={{
              style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border2)' },
              success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--surface)' } },
              error:   { iconTheme: { primary: 'var(--red)',   secondary: 'var(--surface)' } },
            }} />
          </BrowserRouter>
        </LeaveProvider>
      </PermissionProvider>
    </AuthProvider>
  )
}
