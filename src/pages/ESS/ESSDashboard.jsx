// src/pages/ESS/ESSDashboard.jsx
// Personal employee dashboard — current user sees only their own data.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const today     = new Date().toISOString().split('T')[0]
const currentYear = new Date().getFullYear()

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatTime(timeStr) {
  if (!timeStr) return '—'
  try {
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    return `${hour % 12 || 12}:${m} ${ampm}`
  } catch { return timeStr }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

export default function ESSDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [employeeId,     setEmployeeId]     = useState(null)
  const [fullName,       setFullName]       = useState('')
  const [loading,        setLoading]        = useState(true)
  const [leaveBalances,  setLeaveBalances]  = useState([])
  const [todayAtt,       setTodayAtt]       = useState(null)
  const [pendingLeaves,  setPendingLeaves]  = useState([])
  const [holidays,       setHolidays]       = useState([])
  const [notifications,  setNotifications]  = useState([])

  const firstName = (fullName || user?.full_name || 'there').split(' ')[0]

  // ── Load all data on mount ────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return

    const load = async () => {
      setLoading(true)
      try {
        // 1. Resolve employee_id
        const { data: appUser, error: auErr } = await supabase
          .from('app_users')
          .select('employee_id, full_name')
          .eq('id', user.id)
          .single()

        if (auErr || !appUser?.employee_id) {
          toast.error('Account not linked to an employee record')
          setLoading(false)
          return
        }

        const empId = appUser.employee_id
        setEmployeeId(empId)
        setFullName(appUser.full_name || user.full_name || '')

        // 2–6: parallel fetch
        const [balRes, attRes, pendRes, holRes, notifRes] = await Promise.allSettled([
          supabase.from('leave_balances')
            .select('*, leave_types(name, color)')
            .eq('employee_id', empId)
            .eq('year', currentYear),

          supabase.from('employee_attendance')
            .select('*')
            .eq('employee_id', empId)
            .eq('date', today)
            .maybeSingle(),

          supabase.from('leave_requests')
            .select('*, leave_types(name)')
            .eq('employee_id', empId)
            .eq('status', 'pending_supervisor')
            .order('created_at', { ascending: false })
            .limit(3),

          supabase.from('holiday_list_dates')
            .select('*')
            .gte('holiday_date', today)
            .order('holiday_date')
            .limit(5),

          supabase.from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        if (balRes.status   === 'fulfilled' && !balRes.value.error)   setLeaveBalances(balRes.value.data || [])
        if (attRes.status   === 'fulfilled' && !attRes.value.error)   setTodayAtt(attRes.value.data)
        if (pendRes.status  === 'fulfilled' && !pendRes.value.error)  setPendingLeaves(pendRes.value.data || [])
        if (holRes.status   === 'fulfilled' && !holRes.value.error)   setHolidays(holRes.value.data || [])
        if (notifRes.status === 'fulfilled' && !notifRes.value.error) setNotifications(notifRes.value.data || [])
      } catch (err) {
        toast.error(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-dim)' }}>
        <span className="material-icons" style={{ fontSize: 40, opacity: .3, display: 'block', marginBottom: 12 }}>person</span>
        Loading your dashboard…
      </div>
    )
  }

  if (!employeeId) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span className="material-icons" style={{ fontSize: 48, opacity: .3, display: 'block', marginBottom: 12 }}>error_outline</span>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Account not linked</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>Please contact HR to link your account to an employee record.</div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Welcome header ─────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
          {getGreeting()}, {firstName}! 👋
        </h1>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{formatDate(today)}</div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Apply Leave',   icon: 'beach_access', path: '/ess/leave' },
          { label: 'Attendance',    icon: 'fingerprint',  path: '/ess/attendance' },
          { label: 'View Payslip',  icon: 'receipt_long', path: '/ess/payslips' },
        ].map(a => (
          <button key={a.path} className="btn btn-secondary" onClick={() => navigate(a.path)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* ── Today's Attendance ────────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>fingerprint</span>
            Today's Attendance
          </div>
          {todayAtt ? (
            <div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>CLOCK IN</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--green)' }}>{formatTime(todayAtt.clock_in)}</div>
                </div>
                {todayAtt.clock_out && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>CLOCK OUT</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{formatTime(todayAtt.clock_out)}</div>
                  </div>
                )}
                {todayAtt.total_hours != null && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>HOURS</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{Number(todayAtt.total_hours).toFixed(1)}h</div>
                  </div>
                )}
              </div>
              {!todayAtt.clock_out && (
                <div style={{ marginTop: 10 }}>
                  <span className="badge badge-green" style={{ fontSize: 11 }}>● Currently clocked in</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 12 }}>Not clocked in yet today</div>
              <button className="btn btn-primary" onClick={() => navigate('/ess/attendance')}>
                <span className="material-icons" style={{ fontSize: 16 }}>login</span> Clock In Now
              </button>
            </div>
          )}
        </div>

        {/* ── Pending Leave Requests ────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>pending</span>
            Pending Requests
          </div>
          {pendingLeaves.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 12 }}>No pending leave requests</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingLeaves.map(req => (
                <div key={req.id} style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{req.leave_types?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{req.start_date} → {req.end_date}</div>
                  <span className="badge badge-yellow" style={{ fontSize: 10, marginTop: 4 }}>Pending</span>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => navigate('/ess/leave')}>
                View All →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Leave Balances ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>event_available</span>
          My Leave Balances — {currentYear}
        </div>
        {leaveBalances.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No leave balances for this year.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {leaveBalances.map(lb => {
              const total     = lb.total_days || 0
              const used      = lb.used_days  || 0
              const remaining = Math.max(0, total - used)
              const pct       = total > 0 ? Math.min(100, (used / total) * 100) : 0
              return (
                <div key={lb.id} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {lb.leave_types?.color && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: lb.leave_types.color, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{lb.leave_types?.name}</span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{remaining}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>of {total} days remaining</div>
                  {/* Balance bar */}
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)', borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{used} used</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Upcoming Holidays ────────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>celebration</span>
            Upcoming Holidays
          </div>
          {holidays.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No upcoming holidays found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {holidays.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < holidays.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.holiday_name || h.name || '—'}</div>
                    {h.description && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{h.description}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                    {h.holiday_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Notifications ──────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>notifications</span>
            Recent Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No notifications yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifications.map(n => (
                <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  {!n.is_read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0, marginTop: 5 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 700, fontSize: 13, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>
                      {n.message?.slice(0, 80)}{n.message?.length > 80 ? '…' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
