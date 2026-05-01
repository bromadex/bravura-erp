    // src/pages/Dashboard/DashboardOverview.jsx
//
// Main ERP dashboard. Fetches live data from all modules via direct
// Supabase queries — no context dependency, works standalone.
// Refreshes every 2 minutes. Has its own header/layout.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Reusable components ──────────────────────────────────────

const StatCard = ({ label, value, sub, icon, color, onClick, alert }) => (
  <div
    className="kpi-card"
    onClick={onClick}
    style={{
      cursor: onClick ? 'pointer' : 'default',
      borderLeft: alert ? `3px solid ${color || 'var(--gold)'}` : undefined,
      transition: 'all .15s',
    }}
    onMouseOver={e => { if (onClick) e.currentTarget.style.boxShadow = `0 4px 16px ${color || 'var(--gold)'}22` }}
    onMouseOut={e  => { e.currentTarget.style.boxShadow = '' }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div className="kpi-label">{label}</div>
      {icon && <span className="material-icons" style={{ fontSize: 18, color: color || 'var(--text-dim)', opacity: 0.7 }}>{icon}</span>}
    </div>
    <div className="kpi-val" style={{ color: color, fontSize: 26 }}>{value ?? '—'}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
)

const GaugeBar = ({ label, value, max, color, unit = '' }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color }}>
          {value}{unit}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

const ActivityItem = ({ icon, color, text, time }) => (
  <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${color}18`, border: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
      <span className="material-icons" style={{ fontSize: 14, color }}>{icon}</span>
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>{text}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{time}</div>
    </div>
  </div>
)

// ── Main component ────────────────────────────────────────────

export default function DashboardOverview() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const today   = new Date().toISOString().split('T')[0]
  const hour    = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name     = user?.full_name?.split(' ')[0] || user?.username || 'there'

  const [loading, setLoading] = useState(true)
  const [d, setD] = useState({
    totalEmployees: 0, activeEmployees: 0, onLeaveToday: 0,
    attendanceToday: 0, pendingAttendance: 0, pendingLeave: 0,
    totalItems: 0, lowStockItems: 0,
    fuelLevel: 0, fuelMax: 10103, fuelPct: 0, fuelIssuedToday: 0,
    pendingPOs: 0, pendingReqs: 0,
    openPeriod: null,
    alerts: [],
    activity: [],
  })

  const load = async () => {
    setLoading(true)
    try {
      const [empR, attR, leaveR, invR, issR, delR, poR, srR, payR, logR] = await Promise.all([
        supabase.from('employees').select('id, status'),
        supabase.from('employee_attendance').select('id, employee_id, status, clock_in, date').gte('date', today),
        supabase.from('leave_requests').select('id, status, employee_id, start_date, end_date').in('status', ['pending_supervisor','pending_hr','approved']),
        supabase.from('inventory_items').select('id, quantity, reorder_level').limit(500),
        supabase.from('fuel_issuances').select('amount, date').order('date', { ascending: false }).limit(200),
        supabase.from('fuel_deliveries').select('qty').order('date', { ascending: false }).limit(100),
        supabase.from('purchase_orders').select('id').eq('status', 'pending'),
        supabase.from('store_requisitions').select('id').eq('status', 'pending'),
        supabase.from('payroll_periods').select('id, period_label, status').eq('status', 'open').limit(1),
        supabase.from('hr_audit_logs').select('action, entity_name, user_name, created_at').order('created_at', { ascending: false }).limit(8),
      ])

      const employees      = empR.data || []
      const totalEmployees = employees.length
      const activeEmployees = employees.filter(e => e.status === 'Active').length
      const todayAtt        = (attR.data || []).filter(a => a.date === today)
      const attendanceToday = todayAtt.filter(a => a.clock_in).length
      const pendingAttendance = (attR.data || []).filter(a => a.status === 'pending').length

      const leaveReqs    = leaveR.data || []
      const pendingLeave = leaveReqs.filter(r => ['pending_supervisor','pending_hr'].includes(r.status)).length
      const onLeaveToday = leaveReqs.filter(r => r.status === 'approved' && r.start_date <= today && r.end_date >= today).length

      const items        = invR.data || []
      const totalItems   = items.length
      const lowStockItems = items.filter(i => (i.quantity || 0) <= (i.reorder_level || 0)).length

      const totalDelivered  = (delR.data || []).reduce((s, d) => s + (d.qty    || 0), 0)
      const totalIssuedAll  = (issR.data || []).reduce((s, i) => s + (i.amount || 0), 0)
      const fuelIssuedToday = (issR.data || []).filter(i => i.date === today).reduce((s, i) => s + (i.amount || 0), 0)
      const fuelLevel       = Math.max(0, Math.min(10103, totalDelivered - totalIssuedAll))
      const fuelPct         = (fuelLevel / 10103) * 100

      const pendingPOs   = (poR.data  || []).length
      const pendingReqs  = (srR.data  || []).length
      const openPeriod   = (payR.data || [])[0] || null

      // Alerts
      const alerts = []
      if (pendingAttendance > 0)  alerts.push({ icon: 'schedule',          color: 'var(--yellow)', text: `${pendingAttendance} timesheet${pendingAttendance !== 1 ? 's' : ''} awaiting approval`,           route: '/module/hr/attendance' })
      if (pendingLeave > 0)       alerts.push({ icon: 'event_busy',        color: 'var(--red)',    text: `${pendingLeave} leave request${pendingLeave !== 1 ? 's' : ''} pending approval`,                    route: '/module/hr/leave'      })
      if (lowStockItems > 0)      alerts.push({ icon: 'inventory_2',       color: 'var(--yellow)', text: `${lowStockItems} item${lowStockItems !== 1 ? 's' : ''} at or below reorder level`,                   route: '/module/inventory/stock-balance' })
      if (fuelPct < 10)           alerts.push({ icon: 'local_gas_station', color: 'var(--red)',    text: `CRITICAL: Fuel tank at ${fuelPct.toFixed(0)}% — immediate delivery required`,                       route: '/module/fuel/tanks'    })
      else if (fuelPct < 20)      alerts.push({ icon: 'local_gas_station', color: 'var(--yellow)', text: `Fuel tank low — ${fuelPct.toFixed(0)}% remaining (${Math.round(fuelLevel).toLocaleString()} L)`,    route: '/module/fuel/tanks'    })
      if (pendingPOs > 0)         alerts.push({ icon: 'shopping_bag',      color: 'var(--blue)',   text: `${pendingPOs} purchase order${pendingPOs !== 1 ? 's' : ''} pending approval`,                       route: '/module/procurement/purchase-orders' })
      if (openPeriod)             alerts.push({ icon: 'payments',          color: 'var(--purple)', text: `Open payroll period: ${openPeriod.period_label}`,                                                    route: '/module/hr/payroll'    })

      // Recent activity from audit log
      const actionIcons = {
        CREATE_EMPLOYEE:     { icon: 'person_add',      color: 'var(--green)'  },
        CLOCK_IN:            { icon: 'login',            color: 'var(--teal)'   },
        CLOCK_OUT:           { icon: 'logout',           color: 'var(--blue)'   },
        APPROVE_LEAVE:       { icon: 'event_available',  color: 'var(--green)'  },
        REJECT_LEAVE:        { icon: 'event_busy',       color: 'var(--red)'    },
        CREATE_LEAVE_REQUEST:{ icon: 'event_note',       color: 'var(--yellow)' },
        APPROVE_ATTENDANCE:  { icon: 'check_circle',     color: 'var(--green)'  },
        STATUS_CHANGE:       { icon: 'swap_horiz',       color: 'var(--yellow)' },
      }
      const activity = (logR.data || []).map(log => {
        const mapped = actionIcons[log.action] || { icon: 'history', color: 'var(--text-dim)' }
        const label  = log.action?.replace(/_/g, ' ').toLowerCase()
        const text   = `${log.user_name || 'System'} — ${label}${log.entity_name ? ` (${log.entity_name})` : ''}`
        const t      = new Date(log.created_at)
        const mins   = Math.round((Date.now() - t) / 60000)
        const time   = mins < 60 ? `${mins}m ago` : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        return { ...mapped, text, time }
      })

      setD({ totalEmployees, activeEmployees, onLeaveToday, attendanceToday, pendingAttendance, pendingLeave, totalItems, lowStockItems, fuelLevel: Math.round(fuelLevel), fuelMax: 10103, fuelPct, fuelIssuedToday, pendingPOs, pendingReqs, openPeriod, alerts, activity })
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 120000)
    return () => clearInterval(iv)
  }, [today])

  const levelColor = d.fuelPct < 10 ? 'var(--red)' : d.fuelPct < 20 ? 'var(--yellow)' : d.fuelPct < 40 ? 'var(--yellow)' : 'var(--teal)'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Top bar */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
            <span className="material-icons" style={{ fontSize: 16 }}>home</span>
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--gold)' }}>BRAVURA ERP</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>OPERATIONS DASHBOARD</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#0b0f1a' }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            <span className="material-icons" style={{ fontSize: 16 }}>logout</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>

        {/* Welcome */}
        <div style={{ background: 'linear-gradient(135deg,rgba(244,162,97,.1),rgba(45,212,191,.07))', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{greeting}, {name} 👋</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}Kamativi Operations
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'HR',        icon: 'badge',             route: '/module/hr'          },
              { label: 'Inventory', icon: 'inventory',         route: '/module/inventory'   },
              { label: 'Fuel',      icon: 'local_gas_station', route: '/module/fuel'        },
              { label: 'Fleet',     icon: 'directions_car',    route: '/module/fleet'       },
            ].map(b => (
              <button key={b.label} className="btn btn-secondary btn-sm" onClick={() => navigate(b.route)}>
                <span className="material-icons" style={{ fontSize: 14 }}>{b.icon}</span>{b.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--text-dim)', gap: 12 }}>
            <span className="material-icons" style={{ fontSize: 24 }}>autorenew</span>
            Loading dashboard…
          </div>
        ) : (
          <>
            {/* Alerts */}
            {d.alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {d.alerts.map((a, i) => (
                  <div key={i} onClick={() => a.route && navigate(a.route)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: `${a.color}0d`, border: `1px solid ${a.color}33`, borderRadius: 10, cursor: a.route ? 'pointer' : 'default', transition: 'background .15s' }}
                    onMouseOver={e => { if (a.route) e.currentTarget.style.background = `${a.color}18` }}
                    onMouseOut={e  => { if (a.route) e.currentTarget.style.background = `${a.color}0d` }}>
                    <span className="material-icons" style={{ fontSize: 18, color: a.color }}>{a.icon}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{a.text}</span>
                    {a.route && <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>chevron_right</span>}
                  </div>
                ))}
              </div>
            )}

            {/* HR KPIs */}
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Human Resources</div>
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              <StatCard label="Total Employees"    value={d.totalEmployees}    sub={`${d.activeEmployees} active`}          icon="people"        color="var(--teal)"                                               onClick={() => navigate('/module/hr/employees')}  />
              <StatCard label="Clocked In Today"   value={d.attendanceToday}   sub={`of ${d.activeEmployees} active`}       icon="login"         color="var(--green)"                                              onClick={() => navigate('/module/hr/attendance')} />
              <StatCard label="On Leave Today"     value={d.onLeaveToday}      sub="approved leave"                         icon="event_busy"    color="var(--yellow)"                                             onClick={() => navigate('/module/hr/leave')}      />
              <StatCard label="Pending Timesheets" value={d.pendingAttendance} sub="awaiting approval"                      icon="schedule"      color={d.pendingAttendance > 0 ? 'var(--yellow)' : 'var(--green)'} alert={d.pendingAttendance > 0} onClick={() => navigate('/module/hr/attendance')} />
              <StatCard label="Pending Leave"      value={d.pendingLeave}      sub="needs approval"                         icon="approval"      color={d.pendingLeave > 0 ? 'var(--red)' : 'var(--green)'}        alert={d.pendingLeave > 0}      onClick={() => navigate('/module/hr/leave')}      />
            </div>

            {/* Mid row: Inventory, Fuel, Procurement */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>

              {/* Inventory */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--teal)' }}>inventory</span>Inventory
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/inventory')}>View</button>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div className="kpi-card" style={{ flex: 1, padding: 12 }}><div className="kpi-label">Total Items</div><div style={{ fontSize: 22, fontWeight: 800 }}>{d.totalItems}</div></div>
                  <div className="kpi-card" style={{ flex: 1, padding: 12, borderLeft: d.lowStockItems > 0 ? '2px solid var(--red)' : undefined }}>
                    <div className="kpi-label">Low Stock</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: d.lowStockItems > 0 ? 'var(--red)' : 'var(--green)' }}>{d.lowStockItems}</div>
                  </div>
                </div>
                {d.lowStockItems > 0 && (
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/module/inventory/stock-balance')}>
                    <span className="material-icons" style={{ fontSize: 14 }}>warning</span> View low-stock items
                  </button>
                )}
              </div>

              {/* Fuel */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--yellow)' }}>local_gas_station</span>Fuel
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/fuel')}>View</button>
                </div>
                <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, d.fuelPct)}%`, background: levelColor, borderRadius: 6, transition: 'width .6s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
                  <span style={{ fontWeight: 700 }}>{d.fuelLevel.toLocaleString()} L</span>
                  <span style={{ color: levelColor, fontWeight: 700 }}>{d.fuelPct.toFixed(0)}%</span>
                  <span style={{ color: 'var(--text-dim)' }}>10,103 L cap</span>
                </div>
                <div className="kpi-card" style={{ padding: 10 }}>
                  <div className="kpi-label">Issued Today</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--yellow)' }}>{d.fuelIssuedToday} L</div>
                </div>
              </div>

              {/* Procurement */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--purple)' }}>shopping_cart</span>Procurement
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate('/module/procurement')}>View</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="kpi-card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => navigate('/module/procurement/purchase-orders')}>
                    <div className="kpi-label">Pending POs</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: d.pendingPOs > 0 ? 'var(--yellow)' : 'var(--green)' }}>{d.pendingPOs}</div>
                  </div>
                  <div className="kpi-card" style={{ padding: 12, cursor: 'pointer' }} onClick={() => navigate('/module/procurement/store-requisitions')}>
                    <div className="kpi-label">Pending Requisitions</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: d.pendingReqs > 0 ? 'var(--yellow)' : 'var(--green)' }}>{d.pendingReqs}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Recent activity */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 16, color: 'var(--gold)' }}>history</span>
                  Recent Activity
                </div>
                {d.activity.length === 0
                  ? <div className="empty-state" style={{ padding: 20 }}>No recent activity</div>
                  : d.activity.map((a, i) => <ActivityItem key={i} {...a} />)
                }
              </div>

              {/* Quick actions + payroll */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {d.openPeriod && (
                  <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--purple)', cursor: 'pointer', background: 'rgba(167,139,250,.04)' }} onClick={() => navigate('/module/hr/payroll')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="material-icons" style={{ fontSize: 28, color: 'var(--purple)' }}>payments</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Open Payroll Period</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.openPeriod.period_label} — click to process</div>
                      </div>
                      <span className="material-icons" style={{ color: 'var(--text-dim)' }}>chevron_right</span>
                    </div>
                  </div>
                )}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Quick Actions</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Clock In',       icon: 'login',                color: 'var(--green)',  route: '/module/hr/attendance'        },
                      { label: 'Apply Leave',    icon: 'event_note',           color: 'var(--yellow)', route: '/module/hr/leave'             },
                      { label: 'Stock Out',      icon: 'remove_circle',        color: 'var(--red)',    route: '/module/inventory/stock-out'  },
                      { label: 'Fuel Issuance',  icon: 'local_gas_station',    color: 'var(--yellow)', route: '/module/fuel/issuance'        },
                      { label: 'Travel Request', icon: 'flight_takeoff',       color: 'var(--blue)',   route: '/module/hr/travel'            },
                      { label: 'Leave Balance',  icon: 'account_balance_wallet',color: 'var(--teal)', route: '/module/hr/leave-balance'     },
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
    </div>
  )
}
