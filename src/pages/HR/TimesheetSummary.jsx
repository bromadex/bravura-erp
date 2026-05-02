// src/pages/HR/TimesheetSummary.jsx
//
// Monthly timesheet summary per employee for a payroll period.
// Uses buildTimesheetSummary() from attendanceUtils.js — the function
// was already built, this is the UI that exposes it.
// HR uses this to sign off before approving payroll.
// Individual employee view with a printable summary.

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { supabase } from '../../lib/supabase'
import { buildTimesheetSummary, getPayrollPeriod, WORK_SCHEDULE, calculateAttendancePay } from '../../utils/attendanceUtils'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

export default function TimesheetSummary() {
  const { employees, attendance, departments, designations } = useHR()

  const [publicHolidays, setPublicHolidays] = useState([])
  const [periods,        setPeriods]        = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [filterDept,     setFilterDept]     = useState('ALL')
  const [selectedEmp,    setSelectedEmp]    = useState(null)   // for detail view

  useEffect(() => {
    Promise.all([
      supabase.from('public_holidays').select('date, name'),
      supabase.from('payroll_periods').select('*').order('start_date', { ascending: false }),
    ]).then(([ph, pp]) => {
      setPublicHolidays(ph.data || [])
      setPeriods(pp.data || [])
      if (pp.data?.length) {
        const { start, end, label } = getPayrollPeriod()
        const match = pp.data.find(p => p.start_date === start) || pp.data[0]
        setSelectedPeriod(match)
      }
    })
  }, [])

  const getDesignation = (id) => designations.find(d => d.id === id)?.title || '—'
  const getDeptName    = (id) => departments.find(d => d.id === id)?.name   || '—'

  const activeEmps = employees.filter(e => {
    if (e.status === 'Terminated') return false
    if (filterDept !== 'ALL' && e.department_id !== filterDept) return false
    return true
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Build summaries for all active employees in the period
  const summaries = !selectedPeriod ? [] : activeEmps.map(emp => {
    const s = buildTimesheetSummary(attendance, emp.id, selectedPeriod.start_date, selectedPeriod.end_date, publicHolidays)
    const hourlyRate = emp.basic_salary > 0 ? emp.basic_salary / 168 : 0
    const pay        = hourlyRate > 0 ? calculateAttendancePay(s, hourlyRate) : null
    return { emp, ...s, hourlyRate, pay }
  })

  const exportXLSX = () => {
    if (!selectedPeriod) return
    const rows = summaries.map(r => ({
      'Employee':          r.emp.name,
      'Emp No':            r.emp.employee_number || '—',
      'Department':        getDeptName(r.emp.department_id),
      'Designation':       getDesignation(r.emp.designation_id),
      'Regular Days':      r.regularDays,
      'Regular Hours':     r.regularHours.toFixed(1),
      'Saturday Hours':    r.saturdayHours.toFixed(1),
      'OT Hours (1.5×)':   r.overtimeHours.toFixed(1),
      'PH Hours (2×)':     r.publicHolidayHours.toFixed(1),
      'Total Hours':       r.totalHours.toFixed(1),
      'Absent Days':       r.absentWeekdays,
      'Leave Days':        r.leaveDays || 0,
      'Basic Salary':      r.emp.basic_salary || 0,
      'Hourly Rate':       r.hourlyRate.toFixed(4),
      'Regular Pay':       r.pay?.regularPay?.toFixed(2)  || '—',
      'OT Pay':            r.pay?.overtimePay?.toFixed(2) || '—',
      'Sat Pay':           r.pay?.saturdayPay?.toFixed(2) || '—',
      'PH Pay':            r.pay?.publicHolidayPay?.toFixed(2) || '—',
      'Total Pay':         r.pay?.totalPay?.toFixed(2)    || '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet')
    XLSX.writeFile(wb, `Timesheet_${selectedPeriod.period_label?.replace(/ /g,'_')}.xlsx`)
    toast.success('Exported')
  }

  const printAll = () => window.print()

  // Totals row
  const totals = summaries.reduce((acc, r) => ({
    regularHours:       acc.regularHours       + r.regularHours,
    saturdayHours:      acc.saturdayHours       + r.saturdayHours,
    overtimeHours:      acc.overtimeHours       + r.overtimeHours,
    publicHolidayHours: acc.publicHolidayHours  + r.publicHolidayHours,
    totalHours:         acc.totalHours          + r.totalHours,
    absentWeekdays:     acc.absentWeekdays       + r.absentWeekdays,
    totalPay:           acc.totalPay            + (r.pay?.totalPay || 0),
  }), { regularHours: 0, saturdayHours: 0, overtimeHours: 0, publicHolidayHours: 0, totalHours: 0, absentWeekdays: 0, totalPay: 0 })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Timesheet Summary</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX} disabled={!selectedPeriod}>
            <span className="material-icons">table_chart</span> Export Excel
          </button>
          <button className="btn btn-secondary" onClick={printAll}>
            <span className="material-icons">print</span> Print All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Payroll Period</label>
            <select className="form-control" value={selectedPeriod?.id || ''}
              onChange={e => setSelectedPeriod(periods.find(p => p.id === e.target.value) || null)}>
              <option value="">— Select period —</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.period_label} ({p.start_date} → {p.end_date})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Department</label>
            <select className="form-control" value={filterDept}
              onChange={e => setFilterDept(e.target.value)}>
              <option value="ALL">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        {selectedPeriod && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            Period: <strong>{selectedPeriod.start_date}</strong> → <strong>{selectedPeriod.end_date}</strong>
            {' · '}{summaries.length} employee{summaries.length !== 1 ? 's' : ''}
            {' · '}Work schedule: Mon–Fri 07:00–16:00 (8h), Sat 07:00–12:00 (5h at 1.5×)
          </div>
        )}
      </div>

      {/* KPIs */}
      {selectedPeriod && summaries.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card">
            <div className="kpi-label">Employees</div>
            <div className="kpi-val">{summaries.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Reg Hours</div>
            <div className="kpi-val">{totals.regularHours.toFixed(0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total OT Hours</div>
            <div className="kpi-val" style={{ color: 'var(--yellow)' }}>{totals.overtimeHours.toFixed(1)}</div>
            <div className="kpi-sub">at 1.5×</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Absent Days</div>
            <div className="kpi-val" style={{ color: totals.absentWeekdays > 0 ? 'var(--red)' : 'var(--green)' }}>{totals.absentWeekdays}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Est. Total Pay</div>
            <div className="kpi-val" style={{ fontSize: 20, color: 'var(--teal)' }}>${totals.totalPay.toFixed(0)}</div>
            <div className="kpi-sub">before deductions</div>
          </div>
        </div>
      )}

      {!selectedPeriod ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>calendar_today</span>
          <span>Select a payroll period to view timesheet summaries</span>
        </div>
      ) : (
        <>
          {/* Master table */}
          <div className="card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                Timesheet Register — {selectedPeriod.period_label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Click a row for detail view</span>
            </div>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="stock-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Dept</th>
                    <th>Reg Hrs</th>
                    <th>Sat Hrs</th>
                    <th title="Overtime at 1.5×">OT Hrs (1.5×)</th>
                    <th title="Public holiday at 2×">PH Hrs (2×)</th>
                    <th>Total Hrs</th>
                    <th>Absent Days</th>
                    <th>Leave Days</th>
                    <th>Hourly Rate</th>
                    <th>Est. Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map(r => (
                    <tr key={r.emp.id} style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedEmp(r)}
                      onMouseOver={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseOut={e  => { e.currentTarget.style.background = '' }}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.emp.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.emp.employee_number}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{getDeptName(r.emp.department_id)}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{r.regularHours.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.saturdayHours > 0 ? 'var(--yellow)' : 'inherit' }}>{r.saturdayHours.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.overtimeHours > 0 ? 'var(--yellow)' : 'inherit' }}>{r.overtimeHours.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.publicHolidayHours > 0 ? 'var(--teal)' : 'inherit' }}>{r.publicHolidayHours.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.totalHours.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.absentWeekdays > 3 ? 'var(--red)' : r.absentWeekdays > 0 ? 'var(--yellow)' : 'var(--green)' }}>{r.absentWeekdays}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{r.leaveDays || 0}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 11 }}>
                        {r.hourlyRate > 0 ? `$${r.hourlyRate.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                        {r.pay ? `$${r.pay.totalPay.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan="2">TOTALS ({summaries.length} employees)</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{totals.regularHours.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{totals.saturdayHours.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{totals.overtimeHours.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{totals.publicHolidayHours.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{totals.totalHours.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>{totals.absentWeekdays}</td>
                    <td>—</td>
                    <td>—</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${totals.totalPay.toFixed(2)}</td>
                  </tr>
                  {summaries.length === 0 && (
                    <tr><td colSpan="11" className="empty-state">No attendance records found for this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Individual employee detail modal */}
      {selectedEmp && (
        <div className="overlay" onClick={() => setSelectedEmp(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 4 }}>
                  Timesheet: <span>{selectedEmp.emp.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {selectedEmp.emp.employee_number} · {getDeptName(selectedEmp.emp.department_id)} · {getDesignation(selectedEmp.emp.designation_id)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Period: {selectedPeriod?.start_date} → {selectedPeriod?.end_date}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                const w = window.open('', '_blank')
                w.document.write(`
                  <html><head><title>Timesheet — ${selectedEmp.emp.name}</title>
                  <style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left} th{background:#f5f5f5} .total{font-weight:bold;background:#f0f7ff}</style></head><body>
                  <h2>BRAVURA KAMATIVI — TIMESHEET SUMMARY</h2>
                  <p><strong>Employee:</strong> ${selectedEmp.emp.name} (${selectedEmp.emp.employee_number})</p>
                  <p><strong>Department:</strong> ${getDeptName(selectedEmp.emp.department_id)} &nbsp;|&nbsp; <strong>Designation:</strong> ${getDesignation(selectedEmp.emp.designation_id)}</p>
                  <p><strong>Period:</strong> ${selectedPeriod?.start_date} → ${selectedPeriod?.end_date} &nbsp;|&nbsp; <strong>${selectedPeriod?.period_label}</strong></p>
                  <br>
                  <table>
                    <tr><th>Category</th><th>Hours / Days</th><th>Rate</th><th>Amount</th></tr>
                    <tr><td>Regular Hours</td><td>${selectedEmp.regularHours.toFixed(1)} h</td><td>1.0×</td><td>${selectedEmp.pay ? '$' + selectedEmp.pay.regularPay.toFixed(2) : '—'}</td></tr>
                    <tr><td>Saturday Hours</td><td>${selectedEmp.saturdayHours.toFixed(1)} h</td><td>1.5×</td><td>${selectedEmp.pay ? '$' + selectedEmp.pay.saturdayPay.toFixed(2) : '—'}</td></tr>
                    <tr><td>Overtime Hours (Mon-Fri)</td><td>${selectedEmp.overtimeHours.toFixed(1)} h</td><td>1.5×</td><td>${selectedEmp.pay ? '$' + selectedEmp.pay.overtimePay.toFixed(2) : '—'}</td></tr>
                    <tr><td>Public Holiday Hours</td><td>${selectedEmp.publicHolidayHours.toFixed(1)} h</td><td>2.0×</td><td>${selectedEmp.pay ? '$' + selectedEmp.pay.publicHolidayPay.toFixed(2) : '—'}</td></tr>
                    <tr><td>Total Hours</td><td>${selectedEmp.totalHours.toFixed(1)} h</td><td></td><td>${selectedEmp.pay ? '$' + selectedEmp.pay.totalPay.toFixed(2) : '—'}</td></tr>
                    <tr><td>Absent Weekdays</td><td>${selectedEmp.absentWeekdays} days</td><td></td><td></td></tr>
                    <tr><td>Leave Days</td><td>${selectedEmp.leaveDays || 0} days</td><td></td><td></td></tr>
                  </table>
                  <br><p>Hourly Rate: $${selectedEmp.hourlyRate.toFixed(4)} (Basic Salary $${selectedEmp.emp.basic_salary || 0} ÷ 168)</p>
                  <br><p>Supervisor Signature: _____________________________ &nbsp;&nbsp; Date: ___________</p>
                  <p>HR Signature: _____________________________ &nbsp;&nbsp; Date: ___________</p>
                  <script>window.onload=()=>{window.print()}</script>
                  </body></html>`)
                w.document.close()
              }}>
                <span className="material-icons" style={{ fontSize: 14 }}>print</span> Print
              </button>
            </div>

            {/* Summary grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Regular Hours',     val: `${selectedEmp.regularHours.toFixed(1)} h`,       color: '',                 pay: selectedEmp.pay?.regularPay },
                { label: 'Saturday (1.5×)',   val: `${selectedEmp.saturdayHours.toFixed(1)} h`,      color: 'var(--yellow)',    pay: selectedEmp.pay?.saturdayPay },
                { label: 'Overtime (1.5×)',   val: `${selectedEmp.overtimeHours.toFixed(1)} h`,      color: 'var(--yellow)',    pay: selectedEmp.pay?.overtimePay },
                { label: 'Public Holiday (2×)', val: `${selectedEmp.publicHolidayHours.toFixed(1)} h`, color: 'var(--teal)',   pay: selectedEmp.pay?.publicHolidayPay },
                { label: 'Total Hours',       val: `${selectedEmp.totalHours.toFixed(1)} h`,         color: 'var(--blue)',      pay: selectedEmp.pay?.totalPay },
                { label: 'Absent Days',       val: `${selectedEmp.absentWeekdays} days`,             color: selectedEmp.absentWeekdays > 0 ? 'var(--red)' : 'var(--green)', pay: null },
              ].map(item => (
                <div key={item.label} className="kpi-card" style={{ padding: 14 }}>
                  <div className="kpi-label">{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.val}</div>
                  {item.pay !== undefined && item.pay !== null && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--mono)' }}>${item.pay.toFixed(2)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Daily breakdown */}
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Daily Attendance Records</h4>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Date</th><th>Day</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>OT Hours</th><th>Type</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {attendance
                    .filter(a => a.employee_id === selectedEmp.emp.id && a.date >= selectedPeriod.start_date && a.date <= selectedPeriod.end_date)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(a => {
                      const dow = new Date(a.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
                      const isPH = publicHolidays.some(ph => ph.date === a.date)
                      return (
                        <tr key={a.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{a.date}</td>
                          <td>{dow}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{a.clock_in || '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{a.clock_out || '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{a.total_hours?.toFixed(1) || '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: a.overtime_hours > 0 ? 'var(--yellow)' : 'inherit' }}>{a.overtime_hours?.toFixed(1) || '—'}</td>
                          <td>
                            {isPH
                              ? <span className="badge badge-teal">Public Holiday</span>
                              : <span className="badge badge-blue">{a.shift_type || 'Day'}</span>}
                          </td>
                          <td>
                            <span className={`badge ${a.status === 'approved' ? 'badge-green' : a.status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {selectedEmp.pay && (
              <div style={{ marginTop: 16, background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Pay Summary (Before Deductions)</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontFamily: 'var(--mono)' }}>
                  <div>Hourly Rate: <strong>${selectedEmp.hourlyRate.toFixed(4)}</strong></div>
                  <div>Regular: <strong>${selectedEmp.pay.regularPay.toFixed(2)}</strong></div>
                  {selectedEmp.pay.saturdayPay > 0    && <div>Saturday: <strong style={{ color: 'var(--yellow)' }}>${selectedEmp.pay.saturdayPay.toFixed(2)}</strong></div>}
                  {selectedEmp.pay.overtimePay > 0     && <div>Overtime: <strong style={{ color: 'var(--yellow)' }}>${selectedEmp.pay.overtimePay.toFixed(2)}</strong></div>}
                  {selectedEmp.pay.publicHolidayPay > 0 && <div>Pub Holiday: <strong style={{ color: 'var(--teal)' }}>${selectedEmp.pay.publicHolidayPay.toFixed(2)}</strong></div>}
                  <div style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: 'var(--teal)' }}>
                    TOTAL: ${selectedEmp.pay.totalPay.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedEmp(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
