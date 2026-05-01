// src/pages/Dashboard/DashboardOverview.jsx
//
// Main ERP dashboard. Pulls live data from all available contexts.
// Designed to work even when some contexts aren't mounted — it fetches
// counts directly from Supabase so it doesn't depend on every Provider.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Stat card component ──────────────────────────────────────
const StatCard = ({ label, value, sub, icon, color, onClick, alert }) => (
  <div
    className="kpi-card"
    style={{ cursor: onClick ? 'pointer' : 'default', borderLeft: alert ? `3px solid ${color || 'var(--gold)'}` : undefined, transition: 'all .2s' }}
    onClick={onClick}
    onMouseOver={e => { if (onClick) e.currentTarget.style.borderColor = color || 'var(--gold)' }}
    onMouseOut={e => { if (onClick && !alert) e.currentTarget.style.borderColor = 'var(--border)' }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div className="kpi-label">{label}</div>
      {icon && <span className="material-icons" style={{ fontSize: 18, color: color || 'var(--text-dim)', opacity: 0.7 }}>{icon}</span>}
    </div>
    <div className="kpi-val" style={{ color: color, fontSize: 26 }}>{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
)

// ── Activity item ────────────────────────────────────────────
const ActivityItem = ({ icon, color, text, time }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${color}18`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
      <span className="material-icons" style={{ fontSize: 15, color }}>{icon}</span>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{text}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{time}</div>
    </div>
  </div>
)

// ── Mini gauge bar ───────────────────────────────────────────
const GaugeBar = ({ label, value, max, color, unit = '' }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color }}>{value}{unit}</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

export default function DashboardOverview() {
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const today     = new Date().toISOString().split('T')[0]
  const hour      = new Date().getHours()
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [data, setData] = useState({
    // HR
    totalEmployees: 0, activeEmployees: 0, onLeaveToday: 0,
    pendingAttendance: 0, attendanceToday: 0,
    pendingLeave: 0,
    // Inventory
    totalItems: 0, lowStockItems: 0, stockTransactionsToday: 0,
    // Fuel
    fuelLevel: 0, fuelMax: 10103, fuelPct: 0,
    fuelIssuedToday: 0,
    // Procurement
    pendingPOs: 0, pendingRequisitions: 0,
    // Payroll
    openPayrollPeriod: null,
    // Recent activity
    recentActivity: [],
    // Alerts
    alerts: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Run all queries in parallel
        const [
          empRes, attRes, leaveRes, invRes, fuelIssRes, fuelDelRes,
          poRes, srRes, payRes, auditRes,
        ] = await Promise.all([
          supabase.from('employees').select('id, status'),
          supabase.from('employee_attendance').select('id, employee_id, status, date, clock_in').gte('date', today),
          supabase.from('leave_requests').select('id, status, employee_id, start_date, end_date').in('status', ['pending_supervisor','pending_hr','approved']),
          supabase.from('inventory_items').select('id, name, quantity, reorder_level'),
          supabase.from('fuel_issuances').select('amount, date').gte('date', today),
          supabase.from('fuel_deliveries').select('qty').order('date', { ascending: false }).limit(50),
          supabase.from('purchase_orders').select('id, status').eq('status', 'pending'),
          supabase.from('store_requisitions').select('id, status').eq('status', 'pending'),
          supabase.from('payroll_periods').select('id, period_label, status').eq('status', 'open').limit(1),
          supabase.from('hr_audit_logs').select('action, entity_name, user_name, created_at').order('created_at', { ascending: false }).limit(8),
        ])

        // HR stats
        const employees         = empRes.data || []
        const totalEmployees    = employees.length
        const activeEmployees   = employees.filter(e => e.status === 'Active').length
        const todayAttendance   = attRes.data || []
        const attendanceToday   = todayAttendance.filter(a => a.clock_in).length
        const pendingAttendance = (attRes.data || []).filter(a => a.status === 'pending').length

        const leaveReqs         = leaveRes.data || []
        const pendingLeave      = leaveReqs.filter(r => r.status === 'pending_supervisor' || r.status === 'pending_hr').length
        const onLeaveToday      = leaveReqs.filter(r =>
          r.status === 'approved' && r.start_date <= today && r.end_date >= today
        ).length

        // Inventory
        const items         = invRes.data || []
        const totalItems    = items.length
        const lowStockItems = items.filter(i => (i.quantity || 0) <= (i.reorder_level || 0)).length

        // Fuel (calculate level from deliveries - issuances)
        const totalDelivered    = (fuelDelRes.data || []).reduce((s, d) => s + (d.qty || 0), 0)
        const totalIssuedAll    = (fuelIssRes.data || []).reduce((s, i) => s + (i.amount || 0), 0)
        const fuelIssuedToday   = (fuelIssRes.data || []).filter(i => i.date === today).reduce((s, i) => s + (i.amount || 0), 0)
        // Simplified: just show today's issuance
        const fuelLevel         = Math.max(0, Math.min(10103, totalDelivered - totalIssuedAll))
        const fuelPct           = (fuelLevel / 10103) * 100

        // Procurement
        const pendingPOs            = (poRes.data || []).length
        const pendingRequisitions   = (srRes.data || []).length

        // Payroll
        const openPayrollPeriod = (payRes.data || [])[0] || null

        // Recent activity from audit log
        const recentActivity = (auditRes.data || []).map(log => {
          const actionMap = {
            CREATE_EMPLOYEE: { icon: 'person_add', color: 'var(--green)', text: `${log.user_name} added employee ${log.entity_name || ''}` },
            CLOCK_IN:        { icon: 'login',       color: 'var(--teal)',  text: `${log.entity_name || 'Employee'} clocked in` },
            CLOCK_OUT:       { icon: 'logout',      color: 'var(--blue)',  text: `${log.entity_name || 'Employee'} clocked out` },
            APPROVE_LEAVE:   { icon: 'event_available', color: 'var(--green)', text: `${log.user_name} approved a leave request` },
            REJECT_LEAVE:    { icon: 'event_busy',      color: 'var(--red)',   text: `Leave request rejected by ${log.user_name}` },
            APPROVE_ATTENDANCE: { icon: 'check_circle', color: 'var(--green)', text: `${log.user_name} approved timesheet` },
            CREATE_LEAVE_REQUEST: { icon: 'event_note', color: 'var(--yellow)', text: `Leave request submitted` },
          }
          const mapped = actionMap[log.action] || { icon: 'history', color: 'var(--text-dim)', text: `${log.action?.replace(/_/g,' ')} — ${log.entity_name || ''}` }
          const time = new Date(log.created_at)
          const rel  = time > new Date(Date.now() - 3600000) ? `${Math.round((Date.now() - time) / 60000)}m ago`
                     : time.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          return { ...mapped, time: rel }
        })

        // Smart alerts
        const alerts = []
        if (pendingAttendance > 0) alerts.push({ icon: 'schedule', color: 'var(--yellow)', text: `${pendingAttendance} timesheet${pendingAttendance !== 1 ? 's' : ''} awaiting approval`, route: '/module/hr/attendance' })
        if (pendingLeave > 0)      alerts.push({ icon: 'event_busy', color: 'var(--red)', text: `${pendingLeave} leave request${pendingLeave !== 1 ? 's' : ''} pending approval`, route: '/module/hr/leave' })
        if (lowStockItems > 0)     alerts.push({ icon: 'inventory_2', color: 'var(--yellow)', text: `${lowStockItems} inventory item${lowStockItems !== 1 ? 's' : ''} at or below reorder level`, route: '/module/inventory/stock-balance' })
        if (fuelPct < 20)          alerts.push({ icon: 'local_gas_station', color: 'var(--red)', text: `Fuel tank critically low — ${fuelPct.toFixed(0)}% remaining`, route: '/module/fuel/tanks' })
        else if (fuelPct < 40)     alerts.push({ icon: 'local_gas_station', color: 'var(--yellow)', text: `Fuel level below 40% — ${fuelPct.toFixed(0)}% remaining`, route: '/module/fuel/tanks' })
        if (pendingPOs > 0)        alerts.push({ icon: 'shopping_bag', color: 'var(--blue)', text: `${pendingPOs} purchase order${pendingPOs !== 1 ? 's' : ''} pending`, route: '/module/procurement/purchase-orders' })
        if (openPayrollPeriod)     alerts.push({ icon: 'payments', color: 'var(--purple)', text: `Open payroll period: ${openPayrollPeriod.period_label}`, route: '/module/hr/payroll' })

        setData({
          totalEmployees, activeEmployees, onLeaveToday,
          pendingAttendance, attendanceToday, pendingLeave,
          totalItems, lowStockItems, stockTransactionsToday: 0,
          fuelLevel: Math.round(fuelLevel), fuelMax: 10103, fuelPct,
          fuelIssuedToday,
          pendingPOs, pendingRequisitions,
          openPayrollPeriod,
          recentActivity,
          alerts,
        })
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Refresh every 2 minutes
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [today])

  const name = user?.full_name?.split(' ')[0] || user?.username || 'there'

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* Welcome banner */}
      <div style={{ background: 'linear-gradient(135deg, rgba(244,162,97,.12), rgba(45,212,191,.08))', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{greeting}, {name} 👋</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}Bravura Kamativi Operations
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/hr')}>
            <span className="material-icons" style={{ fontSize: 14 }}>badge</span> HR
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/inventory')}>
            <span className="material-icons" style={{ fontSize: 14 }}>inventory</span> Inventory
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fuel')}>
            <span className="material-icons" style={{ fontSize: 14 }}>local_gas_station</span> Fuel
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--text-dim)', gap: 12 }}>
          <span className="material-icons" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>autorenew</span>
          Loading dashboard data…
        </div>
      ) : (
        <>
          {/* Alerts */}
          {data.alerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {data.alerts.map((a, i) => (
                <div key={i} onClick={() => a.route && navigate(a.route)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: `${a.color}0d`, border: `1px solid ${a.color}33`, borderRadius: 10, cursor: a.route ? 'pointer' : 'default', transition: 'all .15s' }}
                  onMouseOver={e => { if (a.route) e.currentTarget.style.background = `${a.color}18` }}
                  onMouseOut={e =>  { if (a.route) e.currentTarget.style.background = `${a.color}0d` }}>
                  <span className="material-icons" style={{ fontSize: 18, color: a.color }}>{a.icon}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{a.text}</span>
                  {a.route && <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>chevron_right</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── HR KPIs ─────────────────────────────── */}
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Human Resources</div>
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <StatCard label="Total Employees" value={data.totalEmployees} sub={`${data.activeEmployees} active`} icon="people" color="var(--teal)" onClick={() => navigate('/module/hr/employees')} />
            <StatCard label="Clocked In Today" value={data.attendanceToday} sub={`of ${data.activeEmployees} active`} icon="login" color="var(--green)" onClick={() => navigate('/module/hr/attendance')} />
            <StatCard label="On Leave Today" value={data.onLeaveToday} sub="approved leave" icon="event_busy" color="var(--yellow)" onClick={() => navigate('/module/hr/leave')} />
            <StatCard label="Pending Timesheets" value={data.pendingAttendance} sub="awaiting approval" icon="schedule" color={data.pendingAttendance > 0 ? 'var(--yellow)' : 'var(--green)'} alert={data.pendingAttendance > 0} onClick={() => navigate('/module/hr/attendance')} />
            <StatCard label="Pending Leave" value={data.pendingLeave} sub="needs approval" icon="approval" color={data.pendingLeave > 0 ? 'var(--red)' : 'var(--green)'} alert={data.pendingLeave > 0} onClick={() => navigate('/module/hr/leave')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>

            {/* ── Inventory card ───────────────────── */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 18, color: 'var(--teal)' }}>inventory</span> Inventory
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/inventory')}>View</button>
              </div>
              <GaugeBar label="Stock Items" value={data.totalItems} max={data.totalItems || 1} color="var(--teal)" unit=" items" />
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <div className="kpi-card" style={{ flex: 1, padding: 12 }}>
                  <div className="kpi-label">Total Items</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{data.totalItems}</div>
                </div>
                <div className="kpi-card" style={{ flex: 1, padding: 12, borderLeft: data.lowStockItems > 0 ? '2px solid var(--red)' : undefined }}>
                  <div className="kpi-label">Low Stock</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: data.lowStockItems > 0 ? 'var(--red)' : 'var(--green)' }}>{data.lowStockItems}</div>
                </div>
              </div>
            </div>

            {/* ── Fuel card ────────────────────────── */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 18, color: 'var(--yellow)' }}>local_gas_station</span> Fuel
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fuel')}>View</button>
              </div>
              <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-dim)' }}>Main Tank (ZUFTA10)</div>
              <div style={{ height: 12, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${Math.min(100, data.fuelPct)}%`, background: data.fuelPct < 20 ? 'var(--red)' : data.fuelPct < 40 ? 'var(--yellow)' : 'var(--teal)', borderRadius: 6, transition: 'width .6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>{data.fuelLevel.toLocaleString()} L</span>
                <span style={{ color: data.fuelPct < 20 ? 'var(--red)' : data.fuelPct < 40 ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{data.fuelPct.toFixed(0)}%</span>
                <span style={{ color: 'var(--text-dim)' }}>10,103 L max</span>
              </div>
              <div className="kpi-card" style={{ padding: 12 }}>
                <div className="kpi-label">Issued Today</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{data.fuelIssuedToday} L</div>
              </div>
            </div>

            {/* ── Procurement card ─────────────────── */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 18, color: 'var(--purple)' }}>shopping_cart</span> Procurement
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/procurement')}>View</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="kpi-card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => navigate('/module/procurement/purchase-orders')}>
                  <div className="kpi-label">Pending POs</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: data.pendingPOs > 0 ? 'var(--yellow)' : 'var(--green)' }}>{data.pendingPOs}</div>
                </div>
                <div className="kpi-card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => navigate('/module/procurement/store-requisitions')}>
                  <div className="kpi-label">Pending Requisitions</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: data.pendingRequisitions > 0 ? 'var(--yellow)' : 'var(--green)' }}>{data.pendingRequisitions}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom row ──────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Recent Activity */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons" style={{ fontSize: 16, color: 'var(--gold)' }}>history</span>
                Recent Activity
              </div>
              {data.recentActivity.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>No recent activity</div>
              ) : data.recentActivity.map((a, i) => (
                <ActivityItem key={i} icon={a.icon} color={a.color} text={a.text} time={a.time} />
              ))}
            </div>

            {/* Quick actions + Payroll status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Open payroll banner */}
              {data.openPayrollPeriod && (
                <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--purple)', cursor: 'pointer', background: 'rgba(167,139,250,.04)' }} onClick={() => navigate('/module/hr/payroll')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="material-icons" style={{ fontSize: 28, color: 'var(--purple)' }}>payments</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>Open Payroll Period</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{data.openPayrollPeriod.period_label} — click to process</div>
                    </div>
                    <span className="material-icons" style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>chevron_right</span>
                  </div>
                </div>
              )}

              {/* Quick links */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Quick Actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Clock In',        icon: 'login',              color: 'var(--green)',  route: '/module/hr/attendance'    },
                    { label: 'Apply Leave',     icon: 'event_note',         color: 'var(--yellow)', route: '/module/hr/leave'         },
                    { label: 'Stock Out',       icon: 'remove_circle',      color: 'var(--red)',    route: '/module/inventory/stock-out' },
                    { label: 'Fuel Issuance',   icon: 'local_gas_station',  color: 'var(--yellow)', route: '/module/fuel/issuance'    },
                    { label: 'Travel Request',  icon: 'flight_takeoff',     color: 'var(--blue)',   route: '/module/hr/travel'        },
                    { label: 'Leave Balance',   icon: 'account_balance_wallet', color: 'var(--teal)', route: '/module/hr/leave-balance' },
                  ].map(btn => (
                    <button key={btn.label} className="btn btn-secondary" onClick={() => navigate(btn.route)}
                      style={{ justifyContent: 'flex-start', gap: 8, fontSize: 12, padding: '10px 12px' }}>
                      <span className="material-icons" style={{ fontSize: 15, color: btn.color }}>{btn.icon}</span>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
