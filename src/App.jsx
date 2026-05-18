// src/App.jsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'

import { ThemeProvider }           from './contexts/ThemeContext'
import { AuthProvider, useAuth }  from './contexts/AuthContext'
import { PermissionProvider }     from './contexts/PermissionContext'
import { LeaveProvider }          from './contexts/LeaveContext'
import { InventoryProvider }      from './contexts/InventoryContext'
import { ProcurementProvider }    from './contexts/ProcurementContext'
import { FuelProvider }           from './contexts/FuelContext'
import { FleetProvider }          from './contexts/FleetContext'
import { ContractorProvider }     from './contexts/ContractorContext'
import { PettyCashProvider }      from './contexts/PettyCashContext'
import { HRProvider }             from './contexts/HRContext'
import { ShiftProvider }          from './contexts/ShiftContext'
import { ExpenseProvider }        from './contexts/ExpenseContext'
import { LogisticsProvider }      from './contexts/LogisticsContext'
import { CampsiteProvider }       from './contexts/CampsiteContext'
import { AccountingProvider }     from './contexts/AccountingContext'
import { MasterDataProvider }       from './contexts/MasterDataContext'
import { AssetRegistryProvider }    from './contexts/AssetRegistryContext'
import { NotificationProvider }     from './contexts/NotificationContext'

// Shell components — static (needed on every route)
import Login           from './pages/Login'
import HomeGrid        from './pages/HomeGrid'
import Layout          from './components/layout/Layout'
import TopBar          from './components/layout/TopBar'
import PermissionRoute from './components/PermissionRoute'
import AccessDenied    from './pages/Errors/AccessDenied'
import ChangePassword  from './pages/ChangePassword'

// ── Lazy page imports ──────────────────────────────────────────

// Governance
const EthicsGate       = lazy(() => import('./pages/Governance/EthicsGate'))
const GovAnnouncements = lazy(() => import('./pages/Governance/Announcements'))
const GovMemos         = lazy(() => import('./pages/Governance/Memos'))
const GovPolicies      = lazy(() => import('./pages/Governance/Policies'))
const GovCodeOfEthics  = lazy(() => import('./pages/Governance/CodeOfEthics'))

// Campsite
const CampOverview    = lazy(() => import('./pages/Campsite/CampOverview'))
const CampBlocks      = lazy(() => import('./pages/Campsite/CampBlocks'))
const CampRooms       = lazy(() => import('./pages/Campsite/CampRooms'))
const CampAssignments = lazy(() => import('./pages/Campsite/CampAssignments'))
const CampStock       = lazy(() => import('./pages/Campsite/CampStock'))
const CampConsumption = lazy(() => import('./pages/Campsite/CampConsumption'))
const CampPPERegister = lazy(() => import('./pages/Campsite/CampPPERegister'))
const CampHeadcount   = lazy(() => import('./pages/Campsite/CampHeadcount'))

// Settings / Workflow
const WorkflowAdmin   = lazy(() => import('./components/workflow/WorkflowAdmin'))
const WorkflowBuilder = lazy(() => import('./components/workflow/WorkflowBuilder'))
const WorkflowInbox   = lazy(() => import('./pages/Workflow/WorkflowInbox'))
const MasterData      = lazy(() => import('./pages/Settings/MasterData'))

// Connect
const ConnectPage = lazy(() => import('./pages/Connect/ConnectPage'))

// Notifications
const NotificationCenter = lazy(() => import('./pages/Notifications/NotificationCenter'))

// Dashboard
const DashboardOverview = lazy(() => import('./pages/Dashboard/DashboardOverview'))

// Inventory
const StockBalance     = lazy(() => import('./pages/Inventory/StockBalance'))
const StockIn          = lazy(() => import('./pages/Inventory/StockIn'))
const StockOut         = lazy(() => import('./pages/Inventory/StockOut'))
const Transactions     = lazy(() => import('./pages/Inventory/Transactions'))
const StockTaking      = lazy(() => import('./pages/Inventory/StockTaking'))
const Categories       = lazy(() => import('./pages/Inventory/Categories'))
const StorageLocations = lazy(() => import('./pages/Inventory/StorageLocations'))

// Procurement
const Suppliers            = lazy(() => import('./pages/Procurement/Suppliers'))
const StoreRequisitions    = lazy(() => import('./pages/Procurement/StoreRequisitions'))
const PurchaseRequisitions = lazy(() => import('./pages/Procurement/PurchaseRequisitions'))
const RequestForQuotation  = lazy(() => import('./pages/Procurement/RequestForQuotation'))
const SupplierQuotations   = lazy(() => import('./pages/Procurement/SupplierQuotations'))
const QuotationComparison  = lazy(() => import('./pages/Procurement/QuotationComparison'))
const PurchaseOrders       = lazy(() => import('./pages/Procurement/PurchaseOrders'))
const GoodsReceived        = lazy(() => import('./pages/Procurement/GoodsReceived'))
const PurchaseInvoices     = lazy(() => import('./pages/Procurement/PurchaseInvoices'))
const SupplierPerformance  = lazy(() => import('./pages/Procurement/SupplierPerformance'))
const ProcurementDashboard = lazy(() => import('./pages/Procurement/ProcurementDashboard'))
const BudgetControl        = lazy(() => import('./pages/Procurement/BudgetControl'))

// Fuel
const FuelTanks          = lazy(() => import('./pages/Fuel/FuelTanks'))
const FuelIssuance       = lazy(() => import('./pages/Fuel/FuelIssuance'))
const FuelDeliveries     = lazy(() => import('./pages/Fuel/FuelDeliveries'))
const DipstickLog        = lazy(() => import('./pages/Fuel/DipstickLog'))
const FuelReports        = lazy(() => import('./pages/Fuel/FuelReports'))
const TankReconciliation = lazy(() => import('./pages/Fuel/TankReconciliation'))
const VehicleConsumption = lazy(() => import('./pages/Fuel/VehicleConsumption'))
const FuelForecasting    = lazy(() => import('./pages/Fuel/FuelForecasting'))

// Fleet
const FleetDashboard        = lazy(() => import('./pages/Fleet/FleetDashboard'))
const ContractorEquipment   = lazy(() => import('./pages/Fleet/ContractorEquipment'))
const Vehicles              = lazy(() => import('./pages/Fleet/Vehicles'))
const Generators            = lazy(() => import('./pages/Fleet/Generators'))
const HeavyEquipment        = lazy(() => import('./pages/Fleet/HeavyEquipment'))
const MaintenanceAlerts     = lazy(() => import('./pages/Fleet/MaintenanceAlerts'))
const AssetIssues           = lazy(() => import('./pages/Fleet/AssetIssues'))
const PreventiveMaintenance = lazy(() => import('./pages/Fleet/PreventiveMaintenance'))
const TyreManagement        = lazy(() => import('./pages/Fleet/TyreManagement'))
const DowntimeAnalytics     = lazy(() => import('./pages/Fleet/DowntimeAnalytics'))
const FleetCostAnalysis     = lazy(() => import('./pages/Fleet/FleetCostAnalysis'))

// HR
const HRDashboard        = lazy(() => import('./pages/HR/HRDashboard'))
const Employees          = lazy(() => import('./pages/HR/Employees'))
const Departments        = lazy(() => import('./pages/HR/Departments'))
const Designations       = lazy(() => import('./pages/HR/Designations'))
const UserPermissions    = lazy(() => import('./pages/HR/UserPermissions'))
const Attendance         = lazy(() => import('./pages/HR/Attendance'))
const Leave              = lazy(() => import('./pages/HR/Leave'))
const LeaveBalance       = lazy(() => import('./pages/HR/LeaveBalance'))
const LeaveCalendar      = lazy(() => import('./pages/HR/LeaveCalendar'))
const LeaveReports       = lazy(() => import('./pages/HR/LeaveReports'))
const Travel             = lazy(() => import('./pages/HR/Travel'))
const Payroll            = lazy(() => import('./pages/HR/Payroll'))
const TimesheetSummary   = lazy(() => import('./pages/HR/TimesheetSummary'))
// HR Phase 1 — Shifts
const ShiftTypes         = lazy(() => import('./pages/HR/ShiftTypes'))
const ShiftAssignments   = lazy(() => import('./pages/HR/ShiftAssignments'))
const HolidayLists       = lazy(() => import('./pages/HR/HolidayLists'))
const AttendanceRequests = lazy(() => import('./pages/HR/AttendanceRequests'))
// HR Analytics (KPI dashboard)
const HRAnalytics        = lazy(() => import('./pages/HR/HRAnalytics'))
// HR Phase 1 — Leave v2
const LeavePolicies      = lazy(() => import('./pages/HR/LeavePolicies'))
const LeaveAllocation    = lazy(() => import('./pages/HR/LeaveAllocation'))
const CompensatoryLeave  = lazy(() => import('./pages/HR/CompensatoryLeave'))
const LeaveEncashment    = lazy(() => import('./pages/HR/LeaveEncashment'))
// HR Phase 2 — Recruitment
const JobPostings        = lazy(() => import('./pages/HR/JobPostings'))
const Applicants         = lazy(() => import('./pages/HR/Applicants'))
const Interviews         = lazy(() => import('./pages/HR/Interviews'))
// HR Phase 2 — Performance
const AppraisalPeriods   = lazy(() => import('./pages/HR/AppraisalPeriods'))
const PerformanceReviews = lazy(() => import('./pages/HR/PerformanceReviews'))
const KPITemplates       = lazy(() => import('./pages/HR/KPITemplates'))
// HR Phase 2 — Payroll v2
const SalaryStructures   = lazy(() => import('./pages/HR/SalaryStructures'))

// Expenses
const ExpenseDashboard   = lazy(() => import('./pages/Expenses/ExpenseDashboard'))
const ExpenseClaims      = lazy(() => import('./pages/Expenses/ExpenseClaims'))
const ExpenseAdvances    = lazy(() => import('./pages/Expenses/ExpenseAdvances'))
const ExpenseTypes       = lazy(() => import('./pages/Expenses/ExpenseTypes'))

// ESS
const ESSLayout          = lazy(() => import('./pages/ESS/ESSLayout'))
const ESSDashboard       = lazy(() => import('./pages/ESS/ESSDashboard'))
const ESSAttendance      = lazy(() => import('./pages/ESS/ESSAttendance'))
const ESSLeave           = lazy(() => import('./pages/ESS/ESSLeave'))
const ESSPayslips        = lazy(() => import('./pages/ESS/ESSPayslips'))

// Projects / Petty Cash
const PettyCashDashboard      = lazy(() => import('./pages/Projects/PettyCashDashboard'))
const PettyCashFunds          = lazy(() => import('./pages/Projects/PettyCashFunds'))
const PettyCashExpenses       = lazy(() => import('./pages/Projects/PettyCashExpenses'))
const PettyCashReconciliation = lazy(() => import('./pages/Projects/PettyCashReconciliation'))

// Accounting
const ChartOfAccounts  = lazy(() => import('./pages/Accounting/ChartOfAccounts'))
const JournalEntries   = lazy(() => import('./pages/Accounting/JournalEntries'))
const FinancialReports = lazy(() => import('./pages/Accounting/FinancialReports'))

// Reports
const ReportsOverview  = lazy(() => import('./pages/Reports/ReportsOverview'))
const AuditTrail       = lazy(() => import('./pages/Reports/AuditTrail'))
const Drafts           = lazy(() => import('./pages/Reports/Drafts'))
const ReportBuilder    = lazy(() => import('./pages/Reports/ReportBuilder'))
const KpiDashboards    = lazy(() => import('./pages/Reports/KpiDashboards'))
const ScheduledReports = lazy(() => import('./pages/Reports/ScheduledReports'))

// Assets
const AssetDashboard      = lazy(() => import('./pages/Assets/AssetDashboard'))
const AssetRegistry       = lazy(() => import('./pages/Assets/AssetRegistry'))
const CategoryConfig      = lazy(() => import('./pages/Assets/CategoryConfig'))
const ReclassificationLog = lazy(() => import('./pages/Assets/ReclassificationLog'))
const AssetImport         = lazy(() => import('./pages/Assets/AssetImport'))

// Logistics
const LogisticsDashboard  = lazy(() => import('./pages/Logistics/LogisticsDashboard'))
const CampManagement      = lazy(() => import('./pages/Logistics/CampManagement'))
const BatchPlant          = lazy(() => import('./pages/Logistics/BatchPlant'))
const LogisticsDeliveries = lazy(() => import('./pages/Logistics/LogisticsDeliveries'))

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
    Loading…
  </div>
)

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

// HR module picker page — full-page layout with TopBar, no sidebar
function HRPickerPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <TopBar />
      <div style={{ flex: 1, padding: '32px 24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <HRDashboard />
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login"           element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/access-denied"   element={<AccessDenied />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/"                element={<ProtectedRoute><HomeGrid /></ProtectedRoute>} />
        <Route path="/module/workflow/inbox" element={<ProtectedRoute><WorkflowInbox /></ProtectedRoute>} />

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
          <Route index                          element={<ProcurementDashboard />}  />
          <Route path="dashboard"               element={<ProcurementDashboard />}  />
          <Route path="suppliers"               element={<Suppliers />}             />
          <Route path="store-requisitions"      element={<StoreRequisitions />}     />
          <Route path="purchase-requisitions"   element={<PurchaseRequisitions />}  />
          <Route path="rfq"                     element={<RequestForQuotation />}   />
          <Route path="quotations"              element={<SupplierQuotations />}    />
          <Route path="quotation-comparison"    element={<QuotationComparison />}   />
          <Route path="purchase-orders"         element={<PurchaseOrders />}        />
          <Route path="goods-received"          element={<GoodsReceived />}         />
          <Route path="invoices"                element={<PurchaseInvoices />}      />
          <Route path="budget-control"          element={<BudgetControl />}         />
          <Route path="supplier-performance"    element={<SupplierPerformance />}   />
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
          <Route index                 element={<FuelTanks />}          />
          <Route path="tanks"          element={<FuelTanks />}          />
          <Route path="issuance"       element={<FuelIssuance />}       />
          <Route path="deliveries"     element={<FuelDeliveries />}     />
          <Route path="dipstick"       element={<DipstickLog />}        />
          <Route path="reconciliation" element={<TankReconciliation />} />
          <Route path="consumption"    element={<VehicleConsumption />} />
          <Route path="forecasting"    element={<FuelForecasting />}    />
          <Route path="reports"        element={<FuelReports />}        />
        </Route>

        {/* ── FLEET & ASSET REGISTRY ───────────────────────── */}
        <Route path="/module/fleet" element={
          <ProtectedRoute>
            <PermissionRoute module="fleet" page="dashboard">
              <AssetRegistryProvider>
                <FleetProvider>
                  <ContractorProvider>
                    <Layout module="fleet" />
                  </ContractorProvider>
                </FleetProvider>
              </AssetRegistryProvider>
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index                          element={<FleetDashboard />} />
          <Route path="dashboard"               element={<FleetDashboard />} />
          <Route path="contractor-equipment"    element={<ContractorEquipment />} />
          <Route path="vehicles"                element={<Vehicles />} />
          <Route path="generators"              element={<Generators />} />
          <Route path="heavy-equipment"         element={<HeavyEquipment />} />
          <Route path="maintenance-alerts"      element={<MaintenanceAlerts />} />
          <Route path="asset-issues"            element={<AssetIssues />} />
          <Route path="preventive-maintenance"  element={<PreventiveMaintenance />} />
          <Route path="tyre-management"         element={<TyreManagement />} />
          <Route path="downtime-analytics"      element={<DowntimeAnalytics />} />
          <Route path="cost-analysis"           element={<FleetCostAnalysis />} />
          {/* Asset Registry — unified asset master */}
          <Route path="asset-registry"          element={<AssetDashboard />} />
          <Route path="registry"                element={<AssetRegistry />} />
          <Route path="category-config"         element={<CategoryConfig />} />
          <Route path="reclass-log"             element={<ReclassificationLog />} />
          <Route path="asset-import"            element={<AssetImport />} />
        </Route>

        {/* ── HR ───────────────────────────────────────────── */}
        {/* index = full-page picker (no sidebar); sub-routes use Layout */}
        <Route path="/module/hr" element={
          <ProtectedRoute>
            <PermissionRoute module="hr" page="dashboard">
              <HRProvider>
                <ShiftProvider>
                  <LeaveProvider>
                    <Outlet />
                  </LeaveProvider>
                </ShiftProvider>
              </HRProvider>
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index element={<HRPickerPage />} />
          <Route path="dashboard" element={<Navigate to="/module/hr" replace />} />

          <Route element={<Layout module="hr" />}>
            <Route path="analytics"           element={<HRAnalytics />} />
            <Route path="employees"           element={<Employees />} />
            <Route path="departments"         element={<Departments />} />
            <Route path="designations"        element={<Designations />} />
            <Route path="permissions"         element={<UserPermissions />} />
            <Route path="shift-types"         element={<ShiftTypes />} />
            <Route path="shift-assignments"   element={<ShiftAssignments />} />
            <Route path="holiday-lists"       element={<HolidayLists />} />
            <Route path="attendance"          element={<Attendance />} />
            <Route path="attendance-requests" element={<AttendanceRequests />} />
            <Route path="leave"               element={<Leave />} />
            <Route path="leave-policies"      element={<LeavePolicies />} />
            <Route path="leave-allocation"    element={<LeaveAllocation />} />
            <Route path="compensatory-leave"  element={<CompensatoryLeave />} />
            <Route path="leave-encashment"    element={<LeaveEncashment />} />
            <Route path="leave-balance"       element={<LeaveBalance />} />
            <Route path="leave-calendar"      element={<LeaveCalendar />} />
            <Route path="leave-reports"       element={<LeaveReports />} />
            <Route path="travel"              element={<Travel />} />
            <Route path="payroll"             element={<Payroll />} />
            <Route path="timesheet"           element={<TimesheetSummary />} />
            <Route path="salary-structures"   element={<SalaryStructures />} />
            {/* Recruitment */}
            <Route path="job-postings"        element={<JobPostings />} />
            <Route path="applicants"          element={<Applicants />} />
            <Route path="interviews"          element={<Interviews />} />
            {/* Performance */}
            <Route path="appraisal-periods"   element={<AppraisalPeriods />} />
            <Route path="performance-reviews" element={<PerformanceReviews />} />
            <Route path="kpi-templates"       element={<KPITemplates />} />
          </Route>
        </Route>

        {/* ── EXPENSES ─────────────────────────────────────── */}
        <Route path="/module/expenses" element={
          <ProtectedRoute>
            <PermissionRoute module="expenses" page="dashboard">
              <ExpenseProvider>
                <Layout module="expenses" />
              </ExpenseProvider>
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index            element={<ExpenseDashboard />} />
          <Route path="dashboard" element={<ExpenseDashboard />} />
          <Route path="claims"    element={<ExpenseClaims />} />
          <Route path="advances"  element={<ExpenseAdvances />} />
          <Route path="types"     element={<ExpenseTypes />} />
        </Route>

        {/* ── ESS (Employee Self-Service) ───────────────────── */}
        <Route path="/ess" element={
          <ProtectedRoute>
            <ESSLayout />
          </ProtectedRoute>
        }>
          <Route index              element={<ESSDashboard />} />
          <Route path="dashboard"   element={<ESSDashboard />} />
          <Route path="attendance"  element={<ESSAttendance />} />
          <Route path="leave"       element={<ESSLeave />} />
          <Route path="payslips"    element={<ESSPayslips />} />
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
          <Route index               element={<CampOverview />}    />
          <Route path="overview"     element={<CampOverview />}    />
          <Route path="blocks"       element={<CampBlocks />}      />
          <Route path="rooms"        element={<CampRooms />}       />
          <Route path="assignments"  element={<CampAssignments />} />
          <Route path="camp-stock"   element={<CampStock />}       />
          <Route path="consumption"  element={<CampConsumption />} />
          <Route path="ppe-register" element={<CampPPERegister />} />
          <Route path="headcount"    element={<CampHeadcount />}   />
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

        {/* ── PROJECTS / PETTY CASH ───────────────────────── */}
        <Route path="/module/projects" element={
          <ProtectedRoute>
            <PermissionRoute module="projects" page="petty-cash-dashboard">
              <AccountingProvider>
                <PettyCashProvider>
                  <Layout module="projects" />
                </PettyCashProvider>
              </AccountingProvider>
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index                             element={<PettyCashDashboard />}      />
          <Route path="petty-cash-dashboard"       element={<PettyCashDashboard />}      />
          <Route path="petty-cash-funds"           element={<PettyCashFunds />}          />
          <Route path="petty-cash-expenses"        element={<PettyCashExpenses />}       />
          <Route path="petty-cash-reconciliation"  element={<PettyCashReconciliation />} />
        </Route>

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

        {/* ── SETTINGS ──────────────────────────────────────── */}
        <Route path="/module/settings" element={
          <ProtectedRoute>
            <Layout module="settings" />
          </ProtectedRoute>
        }>
          <Route index                    element={<MasterData />}      />
          <Route path="master-data"       element={<MasterData />}      />
          <Route path="workflows"         element={<WorkflowBuilder />} />
          <Route path="workflows/admin"   element={<WorkflowAdmin />}   />
        </Route>

        {/* ── REPORTS ──────────────────────────────────────── */}
        <Route path="/module/reports" element={
          <ProtectedRoute>
            <PermissionRoute module="reports" page="overview">
              <Layout module="reports" />
            </PermissionRoute>
          </ProtectedRoute>
        }>
          <Route index                  element={<ReportsOverview />}  />
          <Route path="overview"        element={<ReportsOverview />}  />
          <Route path="kpi-dashboards"  element={<KpiDashboards />}   />
          <Route path="report-builder"  element={<ReportBuilder />}   />
          <Route path="scheduled"       element={<ScheduledReports />} />
          <Route path="audit-log"       element={<AuditTrail />}      />
          <Route path="drafts"          element={<Drafts />}           />
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
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <PermissionProvider>
        <NotificationProvider>
        <MasterDataProvider>
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
        </MasterDataProvider>
        </NotificationProvider>
      </PermissionProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
