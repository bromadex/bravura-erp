// src/pages/HR/Payroll.jsx
//
// Payroll period: 23rd of previous month → 22nd of current month
// Auto-generates payroll records from approved attendance records.
// HR fills in basic salary per employee then the system calculates:
//   Regular pay, Overtime (1.5×), Saturday (1.5×), Public Holiday (2×)
// Then HR adds deductions (PAYE, NSSA, Aids Levy) before approval.

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { getPayrollPeriod, buildTimesheetSummary, WORK_SCHEDULE } from '../../utils/attendanceUtils'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

export default function Payroll() {
  const { employees, attendance, departments, designations } = useHR()
  const canEdit    = useCanEdit('hr', 'payroll')
  const canApprove = useCanApprove('hr', 'payroll')

  const [periods,         setPeriods]         = useState([])
  const [selectedPeriod,  setSelectedPeriod]  = useState(null)
  const [records,         setRecords]         = useState([])
  const [publicHolidays,  setPublicHolidays]  = useState([])
  const [loading,         setLoading]         = useState(false)
  const [generating,      setGenerating]      = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [editingRecord,   setEditingRecord]   = useState(null)  // inline salary edit
  const [salaryForm,      setSalaryForm]      = useState({})

  // Load public holidays and payroll periods on mount
  useEffect(() => {
    const load = async () => {
      const [phRes, ppRes] = await Promise.all([
        supabase.from('public_holidays').select('date, name'),
        supabase.from('payroll_periods').select('*').order('start_date', { ascending: false }),
      ])
      setPublicHolidays(phRes.data || [])
      setPeriods(ppRes.data || [])
      if (ppRes.data?.length) setSelectedPeriod(ppRes.data[0])
    }
    load()
  }, [])

  // Load records when period changes
  useEffect(() => {
    if (!selectedPeriod) return
    const loadRecords = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('payroll_period_id', selectedPeriod.id)
        .order('employee_name')
      setRecords(data || [])
      setLoading(false)
    }
    loadRecords()
  }, [selectedPeriod])

  // Create a new payroll period
  const createPeriod = async () => {
    const { start, end, label } = getPayrollPeriod()
    const existing = periods.find(p => p.start_date === start)
    if (existing) { toast.error('Period already exists'); setSelectedPeriod(existing); return }
    const { data, error } = await supabase
      .from('payroll_periods')
      .insert([{ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), period_label: label, start_date: start, end_date: end }])
      .select().single()
    if (error) { toast.error(error.message); return }
    setPeriods(prev => [data, ...prev])
    setSelectedPeriod(data)
    toast.success(`Period created: ${label}`)
  }

  // Generate payroll records from approved attendance
  const generateRecords = async () => {
    if (!selectedPeriod) return
    if (!window.confirm('Generate payroll records from approved attendance? Existing records will be updated.')) return
    setGenerating(true)
    try {
      const activeEmps = employees.filter(e => e.status === 'Active' || e.status === 'On Leave')
      const toInsert   = []

      for (const emp of activeEmps) {
        const summary   = buildTimesheetSummary(attendance, emp.id, selectedPeriod.start_date, selectedPeriod.end_date, publicHolidays)
        const desig     = designations.find(d => d.id === emp.designation_id)
        const dept      = departments.find(d => d.id === emp.department_id)
        const basicSalary = emp.basic_salary || 0
        const hourlyRate  = basicSalary > 0 ? basicSalary / 168 : 0  // 168 = standard monthly hours

        const regularPay       = summary.regularHours       * hourlyRate
        const overtimePay      = summary.overtimeHours      * hourlyRate * WORK_SCHEDULE.overtimeRate
        const saturdayPay      = summary.saturdayHours      * hourlyRate * WORK_SCHEDULE.overtimeRate
        const publicHolidayPay = summary.publicHolidayHours * hourlyRate * WORK_SCHEDULE.publicHolidayRate
        const allowances       = emp.allowances || 0
        const grossPay         = regularPay + overtimePay + saturdayPay + publicHolidayPay + allowances

        toInsert.push({
          id:                  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + emp.id.slice(0,4),
          payroll_period_id:   selectedPeriod.id,
          employee_id:         emp.id,
          employee_name:       emp.name,
          employee_number:     emp.employee_number,
          designation:         desig?.title || '',
          department:          dept?.name   || '',
          regular_days:        summary.regularDays,
          regular_hours:       summary.regularHours,
          saturday_hours:      summary.saturdayHours,
          overtime_hours:      summary.overtimeHours,
          public_holiday_hours: summary.publicHolidayHours,
          basic_salary:        basicSalary,
          hourly_rate:         hourlyRate,
          regular_pay:         regularPay,
          overtime_pay:        overtimePay,
          saturday_pay:        saturdayPay,
          public_holiday_pay:  publicHolidayPay,
          allowances,
          gross_pay:           grossPay,
          absent_days:         summary.absentWeekdays,
        })
      }

      // Upsert
      const { error } = await supabase
        .from('payroll_records')
        .upsert(toInsert, { onConflict: 'payroll_period_id,employee_id' })
      if (error) throw new Error(error.message)

      const { data: refreshed } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('payroll_period_id', selectedPeriod.id)
        .order('employee_name')
      setRecords(refreshed || [])
      toast.success(`Generated ${toInsert.length} payroll records`)
    } catch (err) { toast.error(err.message) }
    finally { setGenerating(false) }
  }

  // Save salary/deduction edits
  const saveSalaryEdit = async () => {
    if (!editingRecord) return
    setSaving(true)
    try {
      const gross = (parseFloat(salaryForm.regular_pay) || 0) +
                    (parseFloat(salaryForm.overtime_pay) || 0) +
                    (parseFloat(salaryForm.saturday_pay) || 0) +
                    (parseFloat(salaryForm.public_holiday_pay) || 0) +
                    (parseFloat(salaryForm.allowances) || 0)
      const totalDeductions = (parseFloat(salaryForm.paye) || 0) +
                              (parseFloat(salaryForm.nssa) || 0) +
                              (parseFloat(salaryForm.aids_levy) || 0) +
                              (parseFloat(salaryForm.other_deductions) || 0)
      const updates = {
        ...salaryForm,
        gross_pay:        gross,
        total_deductions: totalDeductions,
        net_pay:          gross - totalDeductions,
      }
      const { error } = await supabase.from('payroll_records').update(updates).eq('id', editingRecord.id)
      if (error) throw new Error(error.message)
      setRecords(prev => prev.map(r => r.id === editingRecord.id ? { ...r, ...updates } : r))
      setEditingRecord(null)
      toast.success('Payroll record updated')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // Approve payroll period
  const approvePeriod = async () => {
    if (!canApprove) return toast.error('No approval permission')
    if (!window.confirm('Approve this payroll period? This locks all records.')) return
    const session = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
    const { error } = await supabase
      .from('payroll_periods')
      .update({ status: 'approved', approved_by: session?.full_name || session?.username, processed_at: new Date().toISOString() })
      .eq('id', selectedPeriod.id)
    if (error) { toast.error(error.message); return }
    setPeriods(prev => prev.map(p => p.id === selectedPeriod.id ? { ...p, status: 'approved' } : p))
    setSelectedPeriod(prev => ({ ...prev, status: 'approved' }))
    toast.success('Payroll period approved')
  }

  // Export to Excel
  const exportToExcel = () => {
    const data = records.map(r => ({
      'Employee Number': r.employee_number,
      'Name':            r.employee_name,
      'Designation':     r.designation,
      'Department':      r.department,
      'Regular Days':    r.regular_days,
      'Regular Hours':   r.regular_hours?.toFixed(1),
      'OT Hours':        r.overtime_hours?.toFixed(1),
      'Sat Hours':       r.saturday_hours?.toFixed(1),
      'PH Hours':        r.public_holiday_hours?.toFixed(1),
      'Basic Salary':    r.basic_salary,
      'Regular Pay':     r.regular_pay?.toFixed(2),
      'OT Pay':          r.overtime_pay?.toFixed(2),
      'Sat Pay':         r.saturday_pay?.toFixed(2),
      'PH Pay':          r.public_holiday_pay?.toFixed(2),
      'Allowances':      r.allowances,
      'Gross Pay':       r.gross_pay?.toFixed(2),
      'PAYE':            r.paye,
      'NSSA':            r.nssa,
      'Aids Levy':       r.aids_levy,
      'Other Deductions':r.other_deductions,
      'Total Deductions':r.total_deductions?.toFixed(2),
      'Net Pay':         r.net_pay?.toFixed(2),
      'Absent Days':     r.absent_days,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
    XLSX.writeFile(wb, `Payroll_${selectedPeriod?.period_label?.replace(/ /g,'_')}.xlsx`)
    toast.success('Exported')
  }

  // Totals
  const totals = records.reduce((acc, r) => ({
    gross:    acc.gross    + (r.gross_pay        || 0),
    net:      acc.net      + (r.net_pay          || 0),
    deduct:   acc.deduct   + (r.total_deductions || 0),
    overtime: acc.overtime + (r.overtime_hours   || 0),
  }), { gross: 0, net: 0, deduct: 0, overtime: 0 })

  const isLocked = selectedPeriod?.status === 'approved' || selectedPeriod?.status === 'paid'

  const statusBadge = (s) => {
    const map = { open: 'badge-blue', processing: 'badge-yellow', approved: 'badge-green', paid: 'badge-green' }
    return <span className={`badge ${map[s] || 'badge-gold'}`}>{s}</span>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payroll</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={createPeriod}>
            <span className="material-icons">add</span> New Period
          </button>
          {selectedPeriod && !isLocked && canEdit && (
            <button className="btn btn-secondary" onClick={generateRecords} disabled={generating}>
              <span className="material-icons">autorenew</span>
              {generating ? 'Generating…' : 'Generate from Attendance'}
            </button>
          )}
          {records.length > 0 && (
            <button className="btn btn-secondary" onClick={exportToExcel}>
              <span className="material-icons">table_chart</span> Export
            </button>
          )}
          {selectedPeriod && !isLocked && canApprove && records.length > 0 && (
            <button className="btn btn-primary" onClick={approvePeriod}>
              <span className="material-icons">check_circle</span> Approve Period
            </button>
          )}
        </div>
      </div>

      {/* Period selector */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Payroll Period</label>
            <select className="form-control"
              value={selectedPeriod?.id || ''}
              onChange={e => setSelectedPeriod(periods.find(p => p.id === e.target.value) || null)}>
              <option value="">— Select period —</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.period_label} ({p.start_date} → {p.end_date})</option>)}
            </select>
          </div>
          {selectedPeriod && (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Status</label>
              <div style={{ paddingTop: 8 }}>{statusBadge(selectedPeriod.status)}</div>
            </div>
          )}
        </div>
        {selectedPeriod && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Period: {selectedPeriod.start_date} → {selectedPeriod.end_date}
            {selectedPeriod.approved_by && ` · Approved by: ${selectedPeriod.approved_by}`}
          </div>
        )}
      </div>

      {/* KPIs */}
      {records.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card"><div className="kpi-label">Employees</div><div className="kpi-val">{records.length}</div><div className="kpi-sub">on payroll</div></div>
          <div className="kpi-card"><div className="kpi-label">Gross Pay</div><div className="kpi-val" style={{ fontSize: 18 }}>${totals.gross.toFixed(0)}</div><div className="kpi-sub">total</div></div>
          <div className="kpi-card"><div className="kpi-label">Deductions</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--red)' }}>${totals.deduct.toFixed(0)}</div><div className="kpi-sub">total</div></div>
          <div className="kpi-card"><div className="kpi-label">Net Pay</div><div className="kpi-val" style={{ fontSize: 18, color: 'var(--green)' }}>${totals.net.toFixed(0)}</div><div className="kpi-sub">total</div></div>
        </div>
      )}

      {/* Records table */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading records…</div>
      ) : !selectedPeriod ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>payments</span>
          <span>Select or create a payroll period to get started</span>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>autorenew</span>
          <span>No records yet. Click "Generate from Attendance" to create them.</span>
        </div>
      ) : (
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Payroll Records — {selectedPeriod.period_label}
            {isLocked && <span className="badge badge-green" style={{ marginLeft: 10 }}>Locked</span>}
          </div>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="stock-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Dept</th>
                  <th>Reg Hrs</th>
                  <th>OT Hrs</th>
                  <th>Sat Hrs</th>
                  <th>PH Hrs</th>
                  <th>Gross Pay</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Absent</th>
                  {!isLocked && canEdit && <th>Edit</th>}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.employee_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.employee_number} · {r.designation}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.department}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.regular_hours?.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: r.overtime_hours > 0 ? 'var(--yellow)' : 'inherit' }}>{r.overtime_hours?.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.saturday_hours?.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: r.public_holiday_hours > 0 ? 'var(--teal)' : 'inherit' }}>{r.public_holiday_hours?.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>${r.gross_pay?.toFixed(2) || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>${r.total_deductions?.toFixed(2) || '0.00'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>${r.net_pay?.toFixed(2) || '—'}</td>
                    <td style={{ color: r.absent_days > 0 ? 'var(--red)' : 'inherit', fontFamily: 'var(--mono)' }}>{r.absent_days}</td>
                    {!isLocked && canEdit && (
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditingRecord(r); setSalaryForm({ basic_salary: r.basic_salary, regular_pay: r.regular_pay, overtime_pay: r.overtime_pay, saturday_pay: r.saturday_pay, public_holiday_pay: r.public_holiday_pay, allowances: r.allowances, paye: r.paye, nssa: r.nssa, aids_levy: r.aids_levy, other_deductions: r.other_deductions, notes: r.notes }) }}>
                          <span className="material-icons">edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingRecord && (
        <div className="overlay" onClick={() => setEditingRecord(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit Payroll — <span>{editingRecord.employee_name}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Pay Components</div>
                {[['Basic Salary','basic_salary'],['Regular Pay','regular_pay'],['OT Pay (1.5×)','overtime_pay'],['Saturday Pay (1.5×)','saturday_pay'],['Public Holiday Pay (2×)','public_holiday_pay'],['Allowances','allowances']].map(([label, key]) => (
                  <div className="form-group" key={key}>
                    <label>{label}</label>
                    <input type="number" step="0.01" min="0" className="form-control"
                      value={salaryForm[key] || 0}
                      onChange={e => setSalaryForm(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Deductions</div>
                {[['PAYE (Tax)','paye'],['NSSA','nssa'],['Aids Levy','aids_levy'],['Other Deductions','other_deductions']].map(([label, key]) => (
                  <div className="form-group" key={key}>
                    <label>{label}</label>
                    <input type="number" step="0.01" min="0" className="form-control"
                      value={salaryForm[key] || 0}
                      onChange={e => setSalaryForm(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                ))}
                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows="2" value={salaryForm.notes || ''}
                    onChange={e => setSalaryForm(prev => ({ ...prev, notes: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingRecord(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSalaryEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
