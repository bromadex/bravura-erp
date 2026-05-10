// src/pages/Reports/KpiDashboards.jsx
// Per-department KPI dashboard with four tabs: HR, Fuel, Procurement, Maintenance.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'
import { ChartCard } from '../../components/ui'
import { StatBar, SegmentedBar } from '../../components/ui'
import { TabNav } from '../../components/ui'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtN = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0))

function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Safe Supabase query – returns [] on error, never throws
async function safeQuery(builder) {
  try {
    const { data, error } = await builder
    if (error) { console.warn('[KpiDashboards] query error:', error.message); return [] }
    return data || []
  } catch (e) {
    console.warn('[KpiDashboards] exception:', e.message)
    return []
  }
}

// ---------------------------------------------------------------------------
// KPI Card (local, matches ReportsOverview pattern)
// ---------------------------------------------------------------------------

function KpiCard({ label, value, sub, color = 'var(--gold)', icon }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${color}18`, border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-icons" style={{ fontSize: 17, color }}>{icon}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
          {label.toUpperCase()}
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingCard() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', opacity: 0.5,
    }}>
      <div style={{ height: 12, background: 'var(--border)', borderRadius: 4, marginBottom: 12, width: '60%' }} />
      <div style={{ height: 28, background: 'var(--border)', borderRadius: 4, marginBottom: 8, width: '40%' }} />
      <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, width: '80%' }} />
    </div>
  )
}

function LoadingState() {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14, marginBottom: 24 }}>
        {[1, 2, 3, 4].map(i => <LoadingCard key={i} />)}
      </div>
      <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        <span className="material-icons" style={{ fontSize: 28, marginBottom: 8, display: 'block', opacity: 0.4 }}>hourglass_top</span>
        Loading data…
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — HR Metrics
// ---------------------------------------------------------------------------

async function fetchHR() {
  const monthStart = startOfMonth()

  const [employees, leaveRequests, leaveApproved, payroll] = await Promise.all([
    safeQuery(supabase.from('employees').select('id, status, department, department_id, joining_date')),
    safeQuery(supabase.from('leave_requests').select('id, status, start_date, end_date, employee_id, department')),
    safeQuery(
      supabase.from('leave_requests')
        .select('id, status, start_date, end_date, employee_id')
        .eq('status', 'Approved')
        .gte('start_date', monthStart.split('T')[0])
    ),
    safeQuery(
      supabase.from('payroll_records')
        .select('gross_salary, net_salary, period_month, period_year')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(200)
    ),
  ])

  const activeEmps = employees.filter(e => e.status !== 'Terminated')
  const newHires   = employees.filter(e => e.joining_date && e.joining_date >= monthStart.split('T')[0])
  const pending    = leaveRequests.filter(r => r.status === 'Pending' || r.status === 'pending' || r.status === 'pending_hr' || r.status === 'pending_supervisor')

  // Days taken this month from approved leave
  let daysTaken = 0
  for (const lr of leaveApproved) {
    if (lr.start_date && lr.end_date) {
      const s = new Date(lr.start_date), e = new Date(lr.end_date)
      const diff = Math.max(0, Math.round((e - s) / 86400000) + 1)
      daysTaken += diff
    }
  }

  // Department breakdown
  const deptMap = {}
  for (const e of activeEmps) {
    const d = e.department || 'Unassigned'
    if (!deptMap[d]) deptMap[d] = { dept: d, headcount: 0, pendingLeave: 0 }
    deptMap[d].headcount++
  }
  for (const lr of pending) {
    const d = lr.department || 'Unassigned'
    if (!deptMap[d]) deptMap[d] = { dept: d, headcount: 0, pendingLeave: 0 }
    deptMap[d].pendingLeave++
  }
  const deptRows = Object.values(deptMap).sort((a, b) => b.headcount - a.headcount)

  // Latest payroll month
  let latestGross = 0, latestNet = 0
  if (payroll.length > 0) {
    const latest = payroll[0]
    const latestKey = `${latest.period_year}-${latest.period_month}`
    const latestGroup = payroll.filter(p => `${p.period_year}-${p.period_month}` === latestKey)
    latestGross = latestGroup.reduce((s, p) => s + (p.gross_salary || 0), 0)
    latestNet   = latestGroup.reduce((s, p) => s + (p.net_salary   || 0), 0)
  }

  return {
    totalActive: activeEmps.length,
    newHires: newHires.length,
    pendingLeave: pending.length,
    daysTaken,
    latestGross,
    latestNet,
    deptRows,
  }
}

function HRTab({ data }) {
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14 }

  return (
    <div>
      <SectionTitle>Key Metrics</SectionTitle>
      <div style={{ ...kpiGrid, marginBottom: 24 }}>
        <KpiCard label="Total Active Employees" value={fmtN(data.totalActive)}    sub="Excl. Terminated"          color="var(--green)"  icon="people"       />
        <KpiCard label="New Hires This Month"   value={fmtN(data.newHires)}       sub="Joined this calendar month" color="var(--blue)"   icon="person_add"   />
        <KpiCard label="Pending Leave Requests" value={fmtN(data.pendingLeave)}   sub="Awaiting approval"         color={data.pendingLeave > 0 ? 'var(--yellow)' : 'var(--green)'} icon="event_busy" />
        <KpiCard label="Leave Days Taken (Month)" value={fmtN(data.daysTaken)}   sub="Approved leave this month" color="var(--purple)"  icon="calendar_month" />
      </div>

      {(data.latestGross > 0 || data.latestNet > 0) && (
        <>
          <SectionTitle>Latest Payroll Run</SectionTitle>
          <div style={{ ...kpiGrid, marginBottom: 24 }}>
            <KpiCard label="Gross Total"  value={fmtNum(data.latestGross)} sub="Latest payroll period" color="var(--teal)"  icon="payments"      />
            <KpiCard label="Net Total"    value={fmtNum(data.latestNet)}   sub="Latest payroll period" color="var(--gold)"  icon="account_balance_wallet" />
          </div>
        </>
      )}

      <SectionTitle>Department Breakdown</SectionTitle>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Headcount</th>
                <th>Pending Leave</th>
              </tr>
            </thead>
            <tbody>
              {data.deptRows.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No data available</td></tr>
              )}
              {data.deptRows.map(row => (
                <tr key={row.dept}>
                  <td style={{ fontWeight: 600 }}>{row.dept}</td>
                  <td className="td-mono">{row.headcount}</td>
                  <td className="td-mono" style={{ color: row.pendingLeave > 0 ? 'var(--yellow)' : 'inherit' }}>
                    {row.pendingLeave}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Fuel Usage
// ---------------------------------------------------------------------------

async function fetchFuel() {
  const monthStart = startOfMonth().split('T')[0]

  const [issues, tanks] = await Promise.all([
    safeQuery(
      supabase.from('fuel_issues')
        .select('id, litres_issued, total_cost, fuel_type, vehicle_id, vehicle_reg, issue_date')
        .gte('issue_date', monthStart)
    ),
    safeQuery(
      supabase.from('fuel_tanks')
        .select('id, name, current_level, capacity, is_active, fuel_type')
    ),
  ])

  const totalLitres = issues.reduce((s, i) => s + (i.litres_issued || 0), 0)
  const totalCost   = issues.reduce((s, i) => s + (i.total_cost   || 0), 0)
  const avgCostPerL = totalLitres > 0 ? totalCost / totalLitres : 0
  const activeTanks = tanks.filter(t => t.is_active !== false).length

  // By fuel type
  const fuelTypeMap = {}
  for (const i of issues) {
    const ft = i.fuel_type || 'Unknown'
    if (!fuelTypeMap[ft]) fuelTypeMap[ft] = { type: ft, litres: 0, cost: 0 }
    fuelTypeMap[ft].litres += i.litres_issued || 0
    fuelTypeMap[ft].cost   += i.total_cost    || 0
  }
  const fuelTypeRows = Object.values(fuelTypeMap).sort((a, b) => b.litres - a.litres)

  // Top 5 vehicles
  const vehicleMap = {}
  for (const i of issues) {
    const vid = i.vehicle_reg || i.vehicle_id || 'Unknown'
    if (!vehicleMap[vid]) vehicleMap[vid] = { vehicle: vid, litres: 0, cost: 0 }
    vehicleMap[vid].litres += i.litres_issued || 0
    vehicleMap[vid].cost   += i.total_cost    || 0
  }
  const topVehicles = Object.values(vehicleMap).sort((a, b) => b.litres - a.litres).slice(0, 5)

  // Tank levels for chart
  const tankChart = tanks.filter(t => t.capacity > 0).map(t => ({
    label: t.name || t.fuel_type || 'Tank',
    value: Math.round((t.current_level || 0) / (t.capacity || 1) * 100),
    color: (t.current_level || 0) / (t.capacity || 1) < 0.25 ? 'var(--red)' : 'var(--gold)',
  }))

  return { totalLitres, totalCost, avgCostPerL, activeTanks, fuelTypeRows, topVehicles, tankChart }
}

function FuelTab({ data }) {
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14 }

  return (
    <div>
      <SectionTitle>Key Metrics</SectionTitle>
      <div style={{ ...kpiGrid, marginBottom: 24 }}>
        <KpiCard label="Total Litres Issued (Month)" value={fmtN(data.totalLitres) + ' L'} sub="This calendar month"    color="var(--gold)"   icon="local_gas_station" />
        <KpiCard label="Fuel Cost (Month)"            value={fmtNum(data.totalCost)}        sub="Total cost this month"  color="var(--red)"    icon="attach_money"      />
        <KpiCard label="Avg Cost / Litre"             value={fmtNum(data.avgCostPerL)}      sub="Cost ÷ litres issued"  color="var(--purple)" icon="calculate"         />
        <KpiCard label="Active Tanks"                 value={fmtN(data.activeTanks)}        sub="Operational fuel tanks" color="var(--teal)"   icon="water_drop"        />
      </div>

      {data.tankChart.length > 0 && (
        <>
          <SectionTitle>Tank Levels (%)</SectionTitle>
          <ChartCard
            title="Tank Fill Levels"
            subtitle="Current fill as % of capacity"
            data={data.tankChart}
            unit="%"
            height={120}
            style={{ marginBottom: 24 }}
          />
        </>
      )}

      <SectionTitle>By Fuel Type</SectionTitle>
      <div className="card" style={{ padding: 0, marginBottom: 24 }}>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Fuel Type</th><th>Litres</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {data.fuelTypeRows.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No issues this month</td></tr>
              )}
              {data.fuelTypeRows.map(row => (
                <tr key={row.type}>
                  <td style={{ fontWeight: 600 }}>{row.type}</td>
                  <td className="td-mono">{fmtN(row.litres)} L</td>
                  <td className="td-mono">{fmtNum(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SectionTitle>Top 5 Vehicles by Litres This Month</SectionTitle>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Vehicle</th><th>Litres</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {data.topVehicles.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No vehicle data this month</td></tr>
              )}
              {data.topVehicles.map((row, i) => (
                <tr key={row.vehicle}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 6, fontFamily: 'var(--mono)' }}>#{i + 1}</span>
                    {row.vehicle}
                  </td>
                  <td className="td-mono">{fmtN(row.litres)} L</td>
                  <td className="td-mono">{fmtNum(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 3 — Procurement Spend
// ---------------------------------------------------------------------------

async function fetchProcurement() {
  const monthStart = startOfMonth().split('T')[0]

  const [openPOs, monthPOs, pendingSRs, fulfilledSRs] = await Promise.all([
    safeQuery(
      supabase.from('purchase_orders')
        .select('id, status, total_amount, supplier_id, supplier_name, po_date')
        .in('status', ['Pending', 'Approved', 'Partial'])
    ),
    safeQuery(
      supabase.from('purchase_orders')
        .select('id, total_amount, supplier_id, supplier_name, po_date')
        .gte('po_date', monthStart)
    ),
    safeQuery(
      supabase.from('store_requisitions')
        .select('id, status')
        .eq('status', 'Pending')
    ),
    safeQuery(
      supabase.from('store_requisitions')
        .select('id, status, updated_at')
        .eq('status', 'Fulfilled')
        .gte('updated_at', monthStart)
    ),
  ])

  const openPOCount  = openPOs.length
  const openPOValue  = openPOs.reduce((s, p) => s + (p.total_amount || 0), 0)
  const monthSpend   = monthPOs.reduce((s, p) => s + (p.total_amount || 0), 0)
  const pendingSRCnt = pendingSRs.length

  // Top suppliers this month by value
  const supplierMap = {}
  for (const po of monthPOs) {
    const name = po.supplier_name || po.supplier_id || 'Unknown'
    if (!supplierMap[name]) supplierMap[name] = { supplier: name, pos: 0, value: 0 }
    supplierMap[name].pos++
    supplierMap[name].value += po.total_amount || 0
  }
  const topSuppliers = Object.values(supplierMap).sort((a, b) => b.value - a.value).slice(0, 10)

  return { openPOCount, openPOValue, monthSpend, pendingSRCnt, fulfilledSRs: fulfilledSRs.length, topSuppliers }
}

function ProcurementTab({ data }) {
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14 }

  return (
    <div>
      <SectionTitle>Key Metrics</SectionTitle>
      <div style={{ ...kpiGrid, marginBottom: 24 }}>
        <KpiCard label="Open Purchase Orders" value={fmtN(data.openPOCount)}   sub="Pending / Approved / Partial" color="var(--purple)" icon="shopping_cart"  />
        <KpiCard label="Open PO Value"        value={fmtNum(data.openPOValue)} sub="Total value of open POs"      color="var(--blue)"   icon="request_quote"  />
        <KpiCard label="PO Spend This Month"  value={fmtNum(data.monthSpend)}  sub="POs raised this month"        color="var(--gold)"   icon="payments"       />
        <KpiCard label="Pending Requisitions" value={fmtN(data.pendingSRCnt)}  sub="Store requisitions pending"   color={data.pendingSRCnt > 0 ? 'var(--yellow)' : 'var(--green)'} icon="list_alt" />
      </div>

      <SectionTitle>Top Suppliers by PO Value This Month</SectionTitle>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Supplier</th><th>POs</th><th>Total Value</th></tr>
            </thead>
            <tbody>
              {data.topSuppliers.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No purchase orders this month</td></tr>
              )}
              {data.topSuppliers.map((row, i) => (
                <tr key={row.supplier}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', marginRight: 6, fontFamily: 'var(--mono)' }}>#{i + 1}</span>
                    {row.supplier}
                  </td>
                  <td className="td-mono">{row.pos}</td>
                  <td className="td-mono">{fmtNum(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 4 — Maintenance / Downtime
// ---------------------------------------------------------------------------

async function fetchMaintenance() {
  const monthStart = startOfMonth().split('T')[0]

  // Try 'fleet' first, fall back to 'vehicles'
  let fleet = await safeQuery(supabase.from('fleet').select('id, status, registration, make, model'))
  if (fleet.length === 0) {
    fleet = await safeQuery(supabase.from('vehicles').select('id, status, registration, make, model'))
  }

  // Try maintenance_records, then vehicle_maintenance
  let maintenanceRecords = await safeQuery(
    supabase.from('maintenance_records')
      .select('id, downtime_hours, maintenance_date, vehicle_id, description')
      .gte('maintenance_date', monthStart)
  )
  if (maintenanceRecords.length === 0) {
    maintenanceRecords = await safeQuery(
      supabase.from('vehicle_maintenance')
        .select('id, downtime_hours, maintenance_date, vehicle_id, description')
        .gte('maintenance_date', monthStart)
    )
  }

  // Fleet status breakdown
  const statusMap = {}
  for (const v of fleet) {
    const s = v.status || 'Unknown'
    statusMap[s] = (statusMap[s] || 0) + 1
  }
  const statusRows = Object.entries(statusMap).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)

  const inMaintenance = fleet.filter(v =>
    v.status === 'In Maintenance' || v.status === 'Under Maintenance' || v.status === 'Maintenance'
  ).length
  const activeFleet = fleet.filter(v => v.status === 'Active').length
  const maintenanceCount = maintenanceRecords.length
  const downtimeHours = maintenanceRecords.reduce((s, r) => s + (r.downtime_hours || 0), 0)

  // Segmented bar data for fleet status
  const barSegments = statusRows.map(r => ({
    label: r.status,
    value: r.count,
    color: r.status === 'Active' ? 'var(--green)'
         : r.status.toLowerCase().includes('maintenance') ? 'var(--red)'
         : r.status === 'Inactive' ? 'var(--text-dim)'
         : 'var(--yellow)',
  }))

  return { inMaintenance, activeFleet, maintenanceCount, downtimeHours, statusRows, barSegments, totalFleet: fleet.length }
}

function MaintenanceTab({ data }) {
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 14 }

  return (
    <div>
      <SectionTitle>Key Metrics</SectionTitle>
      <div style={{ ...kpiGrid, marginBottom: 24 }}>
        <KpiCard label="Vehicles In Maintenance" value={fmtN(data.inMaintenance)}    sub="Under / In Maintenance status"   color="var(--red)"    icon="build"         />
        <KpiCard label="Active Fleet"            value={fmtN(data.activeFleet)}      sub={`of ${fmtN(data.totalFleet)} total`} color="var(--green)"  icon="directions_car" />
        <KpiCard label="Maintenance Records (Month)" value={fmtN(data.maintenanceCount)} sub="Records logged this month"   color="var(--blue)"   icon="assignment"    />
        <KpiCard label="Est. Downtime (hrs)"     value={fmtNum(data.downtimeHours)}  sub="Sum of downtime_hours this month" color="var(--yellow)" icon="timer_off"     />
      </div>

      {data.barSegments.length > 0 && (
        <>
          <SectionTitle>Fleet Status Distribution</SectionTitle>
          <div className="card" style={{ padding: 16, marginBottom: 24 }}>
            <SegmentedBar segments={data.barSegments} height={12} />
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {data.barSegments.map(seg => (
                <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color }} />
                  <span style={{ color: 'var(--text-dim)' }}>{seg.label}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{seg.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <SectionTitle>Fleet Status Breakdown</SectionTitle>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr><th>Status</th><th>Count</th><th>% of Fleet</th></tr>
            </thead>
            <tbody>
              {data.statusRows.length === 0 && (
                <tr><td colSpan={3} className="empty-state">No fleet data available</td></tr>
              )}
              {data.statusRows.map(row => (
                <tr key={row.status}>
                  <td style={{ fontWeight: 600 }}>{row.status}</td>
                  <td className="td-mono">{row.count}</td>
                  <td className="td-mono">
                    {data.totalFleet > 0 ? ((row.count / data.totalFleet) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fetch dispatcher
// ---------------------------------------------------------------------------

async function fetchTabData(tabId) {
  switch (tabId) {
    case 'hr':          return fetchHR()
    case 'fuel':        return fetchFuel()
    case 'procurement': return fetchProcurement()
    case 'maintenance': return fetchMaintenance()
    default:            return {}
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'hr',          label: 'HR Metrics',       icon: 'people'         },
  { id: 'fuel',        label: 'Fuel Usage',        icon: 'local_gas_station' },
  { id: 'procurement', label: 'Procurement Spend', icon: 'shopping_cart' },
  { id: 'maintenance', label: 'Maintenance',       icon: 'build'         },
]

export default function KpiDashboards() {
  const [activeTab, setActiveTab]   = useState('hr')
  const [tabData,   setTabData]     = useState({})
  const [loading,   setLoading]     = useState({})
  const [lastFetch, setLastFetch]   = useState({})

  const loadTab = useCallback(async (tabId, force = false) => {
    if (!force && tabData[tabId]) return   // already cached
    setLoading(prev => ({ ...prev, [tabId]: true }))
    try {
      const result = await fetchTabData(tabId)
      setTabData(prev => ({ ...prev, [tabId]: result }))
      setLastFetch(prev => ({ ...prev, [tabId]: new Date() }))
    } catch (err) {
      console.error('[KpiDashboards] loadTab error:', err)
    } finally {
      setLoading(prev => ({ ...prev, [tabId]: false }))
    }
  }, [tabData])

  // Load tab on first switch
  useEffect(() => { loadTab(activeTab) }, [activeTab])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => loadTab(activeTab, true)

  const isLoading  = loading[activeTab]
  const data       = tabData[activeTab]
  const fetchedAt  = lastFetch[activeTab]

  return (
    <div style={{ padding: 24 }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>KPI Dashboards</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Live operational metrics by department</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {fetchedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              Last updated: {fmtTime(fetchedAt)}
            </div>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={!!isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-icons md-16" style={{ fontSize: 16, transition: 'transform .5s', transform: isLoading ? 'rotate(360deg)' : 'none' }}>refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Tab Nav */}
      <TabNav tabs={TABS} active={activeTab} onChange={tab => setActiveTab(tab)} />

      <div style={{ marginTop: 20 }}>
        {isLoading || !data ? (
          isLoading ? <LoadingState /> : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              <span className="material-icons" style={{ fontSize: 32, marginBottom: 8, display: 'block', opacity: 0.4 }}>bar_chart</span>
              Select a tab to load data
            </div>
          )
        ) : (
          <>
            {activeTab === 'hr'          && <HRTab          data={data} />}
            {activeTab === 'fuel'        && <FuelTab        data={data} />}
            {activeTab === 'procurement' && <ProcurementTab data={data} />}
            {activeTab === 'maintenance' && <MaintenanceTab data={data} />}
          </>
        )}
      </div>
    </div>
  )
}
