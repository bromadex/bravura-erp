// src/pages/HR/LeaveCalendar.jsx
// Month view calendar — colour-coded by leave type, department filter.
// Click any day to see full list of employees on leave that day.

import { useState, useEffect, useMemo } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'

// Deterministic colour per leave type (cycles through palette)
const TYPE_COLORS = [
  '#f87171', // red
  '#60a5fa', // blue
  '#34d399', // green
  '#fbbf24', // yellow
  '#a78bfa', // purple
  '#2dd4bf', // teal
  '#f97316', // orange
]

export default function LeaveCalendar() {
  const { employees, departments, leaveTypes, leaveRequests } = useHR()

  const today       = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())   // 0-indexed
  const [filterDept, setFilterDept] = useState('ALL')
  const [dayDetail, setDayDetail]   = useState(null)     // { dateStr, entries }

  // Colour map: leave_type_id → colour
  const typeColorMap = useMemo(() => {
    const map = {}
    leaveTypes.forEach((lt, i) => { map[lt.id] = TYPE_COLORS[i % TYPE_COLORS.length] })
    return map
  }, [leaveTypes])

  // Filter employees by department
  const filteredEmployeeIds = useMemo(() => {
    if (filterDept === 'ALL') return new Set(employees.map(e => e.id))
    return new Set(employees.filter(e => e.department_id === filterDept).map(e => e.id))
  }, [employees, filterDept])

  // Approved leave requests for the visible month
  const monthStart = `${year}-${String(month + 1).padStart(2,'0')}-01`
  const lastDay    = new Date(year, month + 1, 0).getDate()
  const monthEnd   = `${year}-${String(month + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

  const visibleRequests = useMemo(() => {
    return leaveRequests.filter(r =>
      r.status === 'approved' &&
      filteredEmployeeIds.has(r.employee_id) &&
      r.start_date <= monthEnd &&
      r.end_date   >= monthStart
    )
  }, [leaveRequests, filteredEmployeeIds, monthStart, monthEnd])

  // Build a map: dateStr → [{ employee, leaveType, request }]
  const dayMap = useMemo(() => {
    const map = {}
    visibleRequests.forEach(req => {
      const emp  = employees.find(e => e.id === req.employee_id)
      const lt   = leaveTypes.find(l => l.id === req.leave_type_id)
      const start = new Date(req.start_date)
      const end   = new Date(req.end_date)
      const cursor = new Date(start)
      while (cursor <= end) {
        const m = cursor.getMonth()
        const y = cursor.getFullYear()
        if (m === month && y === year) {
          const key = cursor.toISOString().split('T')[0]
          if (!map[key]) map[key] = []
          map[key].push({ emp, lt, req })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    return map
  }, [visibleRequests, employees, leaveTypes, month, year])

  // Calendar grid: weeks × days
  const firstDayOfMonth = new Date(year, month, 1).getDay()   // 0=Sun
  const startOffset     = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1) // shift to Mon=0
  const totalCells      = Math.ceil((startOffset + lastDay) / 7) * 7
  const cells           = Array.from({ length: totalCells }, (_, i) => {
    const day = i - startOffset + 1
    return (day >= 1 && day <= lastDay) ? day : null
  })

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const monthName = new Date(year, month, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  const handleDayClick = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const entries = dayMap[dateStr] || []
    setDayDetail({ dateStr, entries })
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leave Calendar</h1>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={prevMonth}>
              <span className="material-icons" style={{ fontSize: 18 }}>chevron_left</span>
            </button>
            <div style={{ fontWeight: 800, fontSize: 16, minWidth: 160, textAlign: 'center' }}>{monthName}</div>
            <button className="btn btn-secondary btn-sm" onClick={nextMonth}>
              <span className="material-icons" style={{ fontSize: 18 }}>chevron_right</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()) }}>
              Today
            </button>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, maxWidth: 220 }}>
            <select className="form-control" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {leaveTypes.map(lt => (
              <div key={lt.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: typeColorMap[lt.id] }} />
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{lt.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card" style={{ padding: 16 }}>
        {/* Day of week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', fontFamily: 'var(--mono)', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />
            const dateStr   = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const entries   = dayMap[dateStr] || []
            const isToday   = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            const isSat     = idx % 7 === 5
            const isSun     = idx % 7 === 6

            return (
              <div
                key={idx}
                onClick={() => handleDayClick(day)}
                style={{
                  minHeight: 72,
                  background: isToday ? 'rgba(251,191,36,.12)' : (isSat || isSun) ? 'rgba(255,255,255,.02)' : 'var(--surface2)',
                  border: isToday ? '1px solid rgba(251,191,36,.5)' : '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  cursor: entries.length > 0 ? 'pointer' : 'default',
                  transition: 'all .15s',
                }}
                onMouseOver={e => { if (entries.length > 0) e.currentTarget.style.borderColor = 'var(--gold)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = isToday ? 'rgba(251,191,36,.5)' : 'var(--border)' }}
              >
                <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--gold)' : (isSat || isSun) ? 'var(--text-dim)' : 'var(--text)', marginBottom: 4 }}>
                  {day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entries.slice(0, 3).map((entry, i) => (
                    <div key={i} style={{
                      background: typeColorMap[entry.lt?.id] || 'var(--gold)',
                      borderRadius: 3,
                      padding: '1px 4px',
                      fontSize: 9,
                      color: '#fff',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.emp?.name?.split(' ')[0] || '?'}
                    </div>
                  ))}
                  {entries.length > 3 && (
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', paddingLeft: 4 }}>
                      +{entries.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>
        {Object.values(dayMap).flat().length} approved leave day{Object.values(dayMap).flat().length !== 1 ? 's' : ''} this month
        {filterDept !== 'ALL' && ` · ${departments.find(d => d.id === filterDept)?.name || ''}`}
      </div>

      {/* Day detail modal */}
      {dayDetail && (
        <div className="overlay" onClick={() => setDayDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Leave on{' '}
              <span>{new Date(dayDetail.dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            {dayDetail.entries.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>No employees on leave this day</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dayDetail.entries.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2)', borderRadius: 8, borderLeft: `4px solid ${typeColorMap[entry.lt?.id] || 'var(--gold)'}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${typeColorMap[entry.lt?.id] || 'var(--gold)'}22`, border: `1px solid ${typeColorMap[entry.lt?.id] || 'var(--gold)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: typeColorMap[entry.lt?.id] || 'var(--gold)', flexShrink: 0 }}>
                      {entry.emp?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{entry.emp?.name || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {entry.lt?.name || '—'} · {entry.req.start_date} → {entry.req.end_date}
                      </div>
                      {entry.req.reason && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>
                          {entry.req.reason}
                        </div>
                      )}
                    </div>
                    <span className="badge badge-green" style={{ fontSize: 10 }}>
                      {entry.req.days_requested} day{entry.req.days_requested !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setDayDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
