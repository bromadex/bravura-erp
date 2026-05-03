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
import { CampsiteProvider }        from './contexts/CampsiteContext'
import { AccountingProvider }      from './contexts/AccountingContext'

import Login           from './pages/Login'
import HomeGrid        from './pages/HomeGrid'
import Layout          from './components/layout/Layout'
import PermissionRoute from './components/PermissionRoute'
import AccessDenied    from './pages/Errors/AccessDenied'
import ChangePassword  from './pages/ChangePassword'

// ── Governance ────────────────────────────────────────────────
import EthicsGate        from './pages/Governance/EthicsGate'
import GovAnnouncements  from './pages/Governance/Announcements'
import GovMemos          from './pages/Governance/Memos'
import GovPolicies       from './pages/Governance/Policies'
import GovCodeOfEthics   from './pages/Governance/CodeOfEthics'

// ── Campsite ──────────────────────────────────────────────────
import CampOverview      from './pages/Campsite/CampOverview'
import CampBlocks        from './pages/Campsite/CampBlocks'
import CampRooms         from './pages/Campsite/CampRooms'
import CampAssignments   from './pages/Campsite/CampAssignments'
import CampStock         from './pages/Campsite/CampStock'
import CampConsumption   from './pages/Campsite/CampConsumption'
import CampPPERegister   from './pages/Campsite/CampPPERegister'
import CampHeadcount     from './pages/Campsite/CampHeadcount'

// ── Connect ───────────────────────────────────────────────────
import ConnectPage from './pages/Connect/ConnectPage'

// ── Notifications ─────────────────────────────────────────────
import NotificationCenter from './pages/Notifications/NotificationCenter'

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
import TimesheetSummary from './pages/HR/TimesheetSummary'

// ── Accounting ────────────────────────────────────────────────
import ChartOfAccounts  from './pages/Accounting/ChartOfAccounts'
import JournalEntries   from './pages/Accounting/JournalEntries'
import FinancialReports from './pages/Accounting/FinancialReports'

// ── Reports ───────────────────────────────────────────────────
import ReportsOverview from './pages/Reports/ReportsOverview'
import AuditTrail      from './pages/Reports/AuditTrail'
import Drafts          from './pages/Reports/Drafts'

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
  const path = window.location.pathname
  if (user.must_change_password === true && path !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  // Ethics gate: only redirect when explicitly false.
  // null or undefined = column not yet populated for this user = treat as signed.
  const needsEthicsSign = user.has_signed_code_of_ethics === false
  if (needsEthicsSign && path !== '/governance/ethics-gate' && path !== '/change-password') {
    return <Navigate to="/governance/ethics-gate" replace />
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

// No more placeholder modules — all are implemented
const OTHER_MODULES = []

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
        <Route path="timesheet"      element={<TimesheetSummary />} />
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

      {/* ── CAMPSITE ─────────────────────────────────────── */}
      <Route path="/module/campsite" element={
        <ProtectedRoute>
          <PermissionRoute module="campsite" page="overview">
            <LogisticsProvider>
              <CampsiteProvider>
                <Layout module="campsite" />
              </CampsiteProvider>
            </LogisticsProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index              element={<CampOverview />}    />
        <Route path="overview"    element={<CampOverview />}    />
        <Route path="blocks"      element={<CampBlocks />}      />
        <Route path="rooms"       element={<CampRooms />}       />
        <Route path="assignments" element={<CampAssignments />} />
        <Route path="camp-stock"  element={<CampStock />}       />
        <Route path="consumption" element={<CampConsumption />} />
        <Route path="ppe-register" element={<CampPPERegister />} />
        <Route path="headcount"   element={<CampHeadcount />}   />
      </Route>

      {/* ── GOVERNANCE ─────────────────────────────────────── */}
      <Route path="/module/governance" element={
        <ProtectedRoute>
          <PermissionRoute module="governance" page="announcements">
            <Layout module="governance" />
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                 element={<GovAnnouncements />} />
        <Route path="announcements"  element={<GovAnnouncements />} />
        <Route path="memos"          element={<GovMemos />}         />
        <Route path="policies"       element={<GovPolicies />}      />
        <Route path="code-of-ethics" element={<GovCodeOfEthics />}  />
      </Route>

      {/* Ethics gate — outside normal module layout */}
      <Route path="/governance/ethics-gate" element={<ProtectedRoute><EthicsGate /></ProtectedRoute>} />

      {/* ── NOTIFICATIONS PAGE ───────────────────────────── */}
      <Route path="/module/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />

      {/* ── PLACEHOLDER MODULES ──────────────���───────────── */}
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

      {/* ── ACCOUNTING ───────────────────────────────────── */}
      <Route path="/module/accounting" element={
        <ProtectedRoute>
          <PermissionRoute module="accounting" page="chart-of-accounts">
            <AccountingProvider>
              <Layout module="accounting" />
            </AccountingProvider>
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index                    element={<ChartOfAccounts />}  />
        <Route path="chart-of-accounts" element={<ChartOfAccounts />}  />
        <Route path="journal-entries"   element={<JournalEntries />}   />
        <Route path="reports"           element={<FinancialReports />} />
      </Route>

      {/* ── REPORTS ──────────────────────────────────────── */}
      <Route path="/module/reports" element={
        <ProtectedRoute>
          <PermissionRoute module="reports" page="overview">
            <Layout module="reports" />
          </PermissionRoute>
        </ProtectedRoute>
      }>
        <Route index           element={<ReportsOverview />} />
        <Route path="overview" element={<ReportsOverview />} />
        <Route path="audit-log" element={<AuditTrail />}    />
        <Route path="drafts"    element={<Drafts />}         />
      </Route>

      {/* ── CONNECT ──────────────────────────────────────── */}
      <Route path="/module/connect" element={
        <ProtectedRoute>
          <Layout module="connect" />
        </ProtectedRoute>
      }>
        <Route index        element={<ConnectPage />} />
        <Route path="chats" element={<ConnectPage />} />
      </Route>

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
