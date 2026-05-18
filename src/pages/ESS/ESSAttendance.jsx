// src/pages/ESS/ESSAttendance.jsx
// Employee self-service attendance — check-in/out, monthly calendar, history.

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { processCheckin } from '../../engine/shiftEngine'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_COLOR = {
  present:   'var(--green)',
  absent:    'var(--red)',
  half_day:  'var(--yellow)',
  leave:     '#7c5cbf',
  holiday:   'var(--blue)',
}

function pad(n) { return String(n).padStart(2, '0') }

function getTimeStr() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatTimeAMPM(timeStr) {
  if (!timeStr) return '—'
  try {
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h, 10)
    return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  } catch { return timeStr }
}

export default function ESSAttendance() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [employeeId, setEmployeeId] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // ── Today's status ────────────────────────────────────────────
  const [todayRecord,   setTodayRecord]   = useState(null)
  const [clockLoading,  setClockLoading]  = useState(false)
  const [currentTime,   setCurrentTime]   = useState(new Date())

  // ── Calendar ──────────────────────────────────────────────────
  const [calendarMonth,  setCalendarMonth]  = useState(new Date().getMonth())
  const [calendarYear,   setCalendarYear]   = useState(new Date().getFullYear())
  const [monthData,      setMonthData]      = useState([])
  const [selectedDay,    setSelectedDay]    = useState(null)
  const [calLoading,     setCalLoading]     = useState(false)

  // ── Recent history ────────────────────────────────────────────
  const [recentRecords, setRecentRecords] = useState([])
  const [histLoading,   setHistLoading]   = useState(false)

  // Tick the clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ── Resolve employee ──────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.employee_id) setEmployeeId(data.employee_id)
      })
      .finally(() => setLoadingUser(false))
  }, [user])

  // ── Fetch today's record ──────────────────────────────────────
  const fetchToday = useCallback(async () => {
    if (!employeeId) return
    const { data } = await supabase
      .from('employee_attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', getTodayStr())
      .maybeSingle()
    setTodayRecord(data)
  }, [employeeId])

  // ── Fetch calendar month ──────────────────────────────────────
  const fetchMonth = useCallback(async () => {
    if (!employeeId) return
    setCalLoading(true)
    const monthStr = `${calendarYear}-${pad(calendarMonth + 1)}`
    const { data } = await supabase
      .from('employee_attendance')
      .select('date, clock_in, clock_out, total_hours, attendance_type, status')
      .eq('employee_id', employeeId)
      .gte('date', `${monthStr}-01`)
      .lte('date', `${monthStr}-31`)
    setMonthData(data || [])
    setCalLoading(false)
  }, [employeeId, calendarMonth, calendarYear])

  // ── Fetch recent history ──────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!employeeId) return
    setHistLoading(true)
    const { data } = await supabase
      .from('employee_attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .order('date', { ascending: false })
      .limit(10)
    setRecentRecords(data || [])
    setHistLoading(false)
  }, [employeeId])

  useEffect(() => {
    if (employeeId) { fetchToday(); fetchMonth(); fetchHistory() }
  }, [employeeId, fetchToday, fetchMonth, fetchHistory])

  useEffect(() => { if (employeeId) fetchMonth() }, [calendarMonth, calendarYear, fetchMonth])

  // ── Clock In / Out ────────────────────────────────────────────
  const handleClock = async () => {
    if (!employeeId) return
    const logType  = todayRecord?.clock_in && !todayRecord?.clock_out ? 'OUT' : 'IN'
    const today    = getTodayStr()
    const timeStr  = getTimeStr()
    setClockLoading(true)
    try {
      // Try to get geolocation
      let lat = null, lng = null
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch { /* geolocation denied or unavailable */ }

      // Try engine first
      try {
        await processCheckin(employeeId, logType, new Date().toISOString(), { lat, lng })
      } catch {
        // Fallback: direct supabase insert/update
        if (logType === 'IN') {
          await supabase.from('employee_attendance').insert([{
            id:          crypto.randomUUID(),
            employee_id: employeeId,
            date:        today,
            clock_in:    timeStr,
            status:      'pending',
          }])
        } else {
          await supabase
            .from('employee_attendance')
            .update({ clock_out: timeStr })
            .eq('employee_id', employeeId)
            .eq('date', today)
            .is('clock_out', null)
        }
      }

      toast.success(logType === 'IN' ? `Clocked in at ${timeStr}` : `Clocked out at ${timeStr}`)
      await fetchToday()
      await fetchHistory()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setClockLoading(false)
    }
  }

  // ── Calendar rendering ────────────────────────────────────────
  const monthMap = {}
  monthData.forEach(r => { monthMap[r.date] = r })

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay()
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const getAttColor = (dateStr) => {
    const rec = monthMap[dateStr]
    if (!rec) return null
    const type = (rec.attendance_type || '').toLowerCase()
    return TYPE_COLOR[type] || 'var(--text-dim)'
  }

  const navigateMonth = (dir) => {
    let m = calendarMonth + dir
    let y = calendarYear
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setCalendarMonth(m)
    setCalendarYear(y)
    setSelectedDay(null)
  }

  const isToday  = (d) => {
    const n = new Date()
    return d === n.getDate() && calendarMonth === n.getMonth() && calendarYear === n.getFullYear()
  }

  const isClockedIn  = todayRecord?.clock_in && !todayRecord?.clock_out
  const monthName    = new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long', year: 'numeric' })

  if (loadingUser) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
  if (!employeeId) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontWeight: 700 }}>Account not linked to an employee record.</div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Attendance</h2>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
          {currentTime.toLocaleTimeString()} · {getTodayStr()}
        </div>
      </div>

      {/* ── Section 1: Check-in Panel ───────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 20, textAlign: 'center' }}>
        {isClockedIn ? (
          <>
            <span className="material-icons" style={{ fontSize: 48, color: 'var(--green)', display: 'block', marginBottom: 8 }}>check_circle</span>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Currently Clocked In</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
              Since {formatTimeAMPM(todayRecord.clock_in)}
            </div>
            {todayRecord.total_hours != null && (
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6 }}>
                {Number(todayRecord.total_hours).toFixed(1)} hours tracked
              </div>
            )}
            <button className="btn btn-danger" style={{ marginTop: 16 }} onClick={handleClock} disabled={clockLoading}>
              <span className="material-icons" style={{ fontSize: 18 }}>logout</span>
              {clockLoading ? 'Processing…' : 'Clock Out'}
            </button>
          </>
        ) : (
          <>
            <span className="material-icons" style={{ fontSize: 48, opacity: .3, display: 'block', marginBottom: 8 }}>fingerprint</span>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {todayRecord?.clock_out ? 'Clocked Out Today' : 'Not Clocked In'}
            </div>
            {todayRecord?.clock_in && todayRecord?.clock_out && (
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
                {formatTimeAMPM(todayRecord.clock_in)} → {formatTimeAMPM(todayRecord.clock_out)}
                {todayRecord.total_hours != null && ` · ${Number(todayRecord.total_hours).toFixed(1)}h`}
              </div>
            )}
            {!todayRecord?.clock_out && (
              <button className="btn btn-primary" style={{ marginTop: 16, padding: '12px 32px', fontSize: 15 }} onClick={handleClock} disabled={clockLoading}>
                <span className="material-icons" style={{ fontSize: 20 }}>login</span>
                {clockLoading ? 'Processing…' : 'Clock In'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Section 2: Monthly Calendar ─────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigateMonth(-1)}>
            <span className="material-icons" style={{ fontSize: 18 }}>chevron_left</span>
          </button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{monthName}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigateMonth(1)}>
            <span className="material-icons" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 11 }}>
          {Object.entries({ Present: 'present', Absent: 'absent', 'Half Day': 'half_day', Leave: 'leave', Holiday: 'holiday' }).map(([label, key]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLOR[key] }} />
              {label}
            </span>
          ))}
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, padding: '2px 0' }}>{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const dateStr = `${calendarYear}-${pad(calendarMonth + 1)}-${pad(d)}`
            const dotColor = getAttColor(dateStr)
            const rec = monthMap[dateStr]
            return (
              <div
                key={i}
                onClick={() => setSelectedDay(selectedDay === dateStr ? null : dateStr)}
                style={{
                  textAlign: 'center', padding: '6px 2px', borderRadius: 6, cursor: 'pointer',
                  background: isToday(d) ? 'var(--gold-alpha, rgba(212,175,55,.15))' : selectedDay === dateStr ? 'var(--surface2)' : 'transparent',
                  border: `1px solid ${isToday(d) ? 'var(--gold)' : 'transparent'}`,
                  transition: 'background .15s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: isToday(d) ? 800 : 400 }}>{d}</div>
                {dotColor && (
                  <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: dotColor, margin: '2px auto 0' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Selected day detail */}
        {selectedDay && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
            <strong>{selectedDay}</strong>
            {monthMap[selectedDay] ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span><strong>Type:</strong> {monthMap[selectedDay].attendance_type || '—'}</span>
                <span><strong>In:</strong> {formatTimeAMPM(monthMap[selectedDay].clock_in)}</span>
                <span><strong>Out:</strong> {formatTimeAMPM(monthMap[selectedDay].clock_out)}</span>
                {monthMap[selectedDay].total_hours != null && (
                  <span><strong>Hours:</strong> {Number(monthMap[selectedDay].total_hours).toFixed(1)}h</span>
                )}
                <span><strong>Status:</strong> {monthMap[selectedDay].status}</span>
              </div>
            ) : (
              <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>No attendance record</span>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Recent History ────────────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>Recent Attendance</div>
        {histLoading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>Loading…</div>
        ) : recentRecords.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No records found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Date', 'Clock In', 'Clock Out', 'Hours', 'Type', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRecords.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px' }}>{r.date}</td>
                  <td style={{ padding: '8px 8px' }}>{formatTimeAMPM(r.clock_in)}</td>
                  <td style={{ padding: '8px 8px' }}>{formatTimeAMPM(r.clock_out)}</td>
                  <td style={{ padding: '8px 8px' }}>{r.total_hours != null ? `${Number(r.total_hours).toFixed(1)}h` : '—'}</td>
                  <td style={{ padding: '8px 8px' }}>
                    {r.attendance_type && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {TYPE_COLOR[r.attendance_type?.toLowerCase()] && (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLOR[r.attendance_type.toLowerCase()] }} />
                        )}
                        {r.attendance_type}
                      </span>
                    )}
                    {!r.attendance_type && '—'}
                  </td>
                  <td style={{ padding: '8px 8px' }}>
                    <span className={`badge ${r.status === 'approved' ? 'badge-green' : r.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 10 }}>
                      {r.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
