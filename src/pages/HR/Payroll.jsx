    // src/pages/HR/Payroll.jsx
//
// CHANGED:
// - generateRecords() now reads paye_rate, nssa_rate, aids_levy_rate,
//   medical_aid, other_deductions from emp record and pre-fills deductions.
//   HR only needs to review and click Approve.
// - Payslip modal — printable/downloadable payslip per employee.
// - Pay history tab — shows all periods an employee appeared in.

import { useState, useEffect } from 'react'
import { useHR } from '../../contexts/HRContext'
import { useCanEdit, useCanApprove, useCanViewField } from '../../hooks/usePermission'
import ProtectedField from '../../components/ProtectedField'
import { supabase } from '../../lib/supabase'
import { getPayrollPeriod, buildTimesheetSummary, WORK_SCHEDULE } from '../../utils/attendanceUtils'
import toast from 'react-hot-toast'
import { exportXLSX } from '../../engine/reportingEngine'
import { postToGL, hasGLEntry, getChartOfAccounts } from '../../engine/accountingEngine'
import { PageHeader, KPICard, StatusBadge, EmptyState, TabNav } from '../../components/ui'

// ZIMRA Progressive PAYE — uses income_tax_slabs for active tax year
// Falls back to flat rate if no slabs available (graceful degradation)
const calcPAYEProgressive = (gross, slabs, flatRatePct) => {
  // If slabs available, compute progressive tax
  if (slabs && slabs.length > 0) {
    let tax = 0
    let remaining = Math.max(0, gross)
    for (const slab of slabs) {
      if (remaining <= 0) break
      const from = slab.slab_from ?? 0
      const to   = slab.slab_to   ?? Infinity
      if (gross <= from) break  // not yet in this bracket
      const taxable = Math.min(remaining, to - from)
      tax += (taxable * (slab.rate_pct / 100)) + (slab.fixed_amount || 0)
      remaining -= taxable
    }
    return Math.max(0, tax)
  }
  // Fallback: flat rate from employee record
  return gross * ((flatRatePct ?? 25) / 100)
}

export default function Payroll() {
  const { employees, attendance, departments, designations, leaveRequests } = useHR()
  const canEdit       = useCanEdit('hr', 'payroll')
  const canApprove    = useCanApprove('hr', 'payroll')
  const canSeeAmounts = useCanViewField('payroll', 'net_pay')

  const [periods,        setPeriods]        = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [records,        setRecords]        = useState([])
  const [publicHolidays, setPublicHolidays] = useState([])
  const [taxSlabs,       setTaxSlabs]       = useState([])
  const [loading,        setLoading]        = useState(false)
  const [generating,     setGenerating]     = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [editingRecord,  setEditingRecord]  = useState(null)
  const [salaryForm,     setSalaryForm]     = useState({})
  const [payslipRecord,  setPayslipRecord]  = useState(null)
  const [activeTab,      setActiveTab]      = useState('payroll')  // 'payroll' | 'history'
  const [historyEmployee, setHistoryEmployee] = useState(null)
  const [historyRecords,  setHistoryRecords]  = useState([])

  const [glModal,    setGlModal]    = useState(false)
  const [glPosted,   setGlPosted]   = useState(false)
  const [posting,    setPosting]    = useState(false)
  const [glAccounts, setGlAccounts] = useState([])
  const [glLines,    setGlLines]    = useState({ expense: '', netPay: '', paye: '', nssa: '', aids: '', other: '' })

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

  // Load active tax year + ZIMRA progressive PAYE slabs on mount
  useEffect(() => {
    const loadTaxSlabs = async () => {
      const { data: yearData } = await supabase
        .from('tax_years')
        .select('id, year_label')
        .or('is_default.eq.true,status.eq.Active')
        .order('is_default', { ascending: false })
        .limit(1)
        .single()

      if (yearData?.id) {
        const { data: slabData } = await supabase
          .from('income_tax_slabs')
          .select('slab_from, slab_to, rate_pct, fixed_amount, applies_to')
          .eq('tax_year_id', yearData.id)
          .eq('applies_to', 'monthly')
          .order('slab_from', { ascending: true })
        setTaxSlabs(slabData || [])
      }
    }
    loadTaxSlabs()
  }, [])

  useEffect(() => {
    if (!selectedPeriod) return
    const load = async () => {
      setLoading(true)
      const { data } = await supabase.from('payroll_records').select('*').eq('payroll_period_id', selectedPeriod.id).order('employee_name')
      setRecords(data || [])
      setLoading(false)
    }
    load()
  }, [selectedPeriod])

  // Load pay history for selected employee
  useEffect(() => {
    if (!historyEmployee) return
    const load = async () => {
      const { data } = await supabase
        .from('payroll_records')
        .select('*, payroll_periods(period_label, start_date, end_date, status)')
        .eq('employee_id', historyEmployee)
        .order('created_at', { ascending: false })
      setHistoryRecords(data || [])
    }
    load()
  }, [historyEmployee])

  useEffect(() => {
    getChartOfAccounts().then(setGlAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedPeriod?.id) { setGlPosted(false); return }
    setGlLines({ expense: '', netPay: '', paye: '', nssa: '', aids: '', other: '' })
    hasGLEntry(`PAYROLL-${selectedPeriod.id}`).then(({ exists }) => setGlPosted(exists))
  }, [selectedPeriod?.id])

  const createPeriod = async () => {
    const { start, end, label } = getPayrollPeriod()
    if (periods.find(p => p.start_date === start)) { toast.error('Period already exists'); return }
    const { data, error } = await supabase.from('payroll_periods').insert([{ id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), period_label: label, start_date: start, end_date: end }]).select().single()
    if (error) { toast.error(error.message); return }
    setPeriods(prev => [data, ...prev]); setSelectedPeriod(data)
    toast.success(`Period created: ${label}`)
  }

  const generateRecords = async () => {
    if (!selectedPeriod) return
    if (!window.confirm('Generate payroll from approved attendance? Existing records updated.')) return
    setGenerating(true)
    try {
      const activeEmps = employees.filter(e => e.status === 'Active' || e.status === 'On Leave')
      const toInsert   = []

      for (const emp of activeEmps) {
        const summary       = buildTimesheetSummary(attendance, emp.id, selectedPeriod.start_date, selectedPeriod.end_date, publicHolidays)
        const desig         = designations.find(d => d.id === emp.designation_id)
        const dept          = departments.find(d => d.id === emp.department_id)
        const basicSalary   = emp.basic_salary  || 0
        const allowances    = emp.allowances     || 0
        const hourlyRate    = basicSalary > 0 ? basicSalary / 168 : 0

        const regularPay       = summary.regularHours       * hourlyRate
        const overtimePay      = summary.overtimeHours      * hourlyRate * WORK_SCHEDULE.overtimeRate
        const saturdayPay      = summary.saturdayHours      * hourlyRate * WORK_SCHEDULE.overtimeRate
        const publicHolidayPay = summary.publicHolidayHours * hourlyRate * WORK_SCHEDULE.publicHolidayRate
        const grossPay         = regularPay + overtimePay + saturdayPay + publicHolidayPay + allowances

        // ✅ Auto-calc deductions from employee compensation settings
        const payeAmt    = calcPAYEProgressive(grossPay, taxSlabs, emp.paye_rate)
        // NSSA: 3% of gross, statutory cap: max insurable earnings = $600/month → max $18
        const NSSA_EE_CEILING = 600   // USD insurable earnings ceiling (employee)
        const nssaInsurable   = Math.min(grossPay, NSSA_EE_CEILING)
        const nssaAmt         = nssaInsurable * ((emp.nssa_rate ?? 3) / 100)
        const aidsAmt    = payeAmt  * ((emp.aids_levy_rate ?? 3) / 100)
        const medicalAmt = emp.medical_aid        || 0
        const otherAmt   = emp.other_deductions   || 0
        const totalDeduct = payeAmt + nssaAmt + aidsAmt + medicalAmt + otherAmt
        const netPay      = grossPay - totalDeduct

        // Leave days in period
        const leaveDays = leaveRequests.filter(r =>
          r.employee_id === emp.id && r.status === 'approved' &&
          r.start_date <= selectedPeriod.end_date && r.end_date >= selectedPeriod.start_date
        ).reduce((s, r) => s + (r.total_leave_days ?? r.days_requested ?? 0), 0)

        toInsert.push({
          id:                  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + emp.id.slice(-4),
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
          paye:                payeAmt,
          nssa:                nssaAmt,
          aids_levy:           aidsAmt,
          other_deductions:    medicalAmt + otherAmt,
          total_deductions:    totalDeduct,
          net_pay:             netPay,
          absent_days:         summary.absentWeekdays,
          leave_days:          leaveDays,
        })
      }

      const { error } = await supabase.from('payroll_records').upsert(toInsert, { onConflict: 'payroll_period_id,employee_id' })
      if (error) throw new Error(error.message)
      const { data: refreshed } = await supabase.from('payroll_records').select('*').eq('payroll_period_id', selectedPeriod.id).order('employee_name')
      setRecords(refreshed || [])
      toast.success(`Generated ${toInsert.length} payroll records`)
    } catch (err) { toast.error(err.message) }
    finally { setGenerating(false) }
  }

  const saveSalaryEdit = async () => {
    if (!editingRecord) return
    setSaving(true)
    try {
      const gross = (parseFloat(salaryForm.regular_pay) || 0) + (parseFloat(salaryForm.overtime_pay) || 0) + (parseFloat(salaryForm.saturday_pay) || 0) + (parseFloat(salaryForm.public_holiday_pay) || 0) + (parseFloat(salaryForm.allowances) || 0)
      const totalDeductions = (parseFloat(salaryForm.paye) || 0) + (parseFloat(salaryForm.nssa) || 0) + (parseFloat(salaryForm.aids_levy) || 0) + (parseFloat(salaryForm.other_deductions) || 0)
      const updates = { ...salaryForm, gross_pay: gross, total_deductions: totalDeductions, net_pay: gross - totalDeductions }
      const { error } = await supabase.from('payroll_records').update(updates).eq('id', editingRecord.id)
      if (error) throw new Error(error.message)
      setRecords(prev => prev.map(r => r.id === editingRecord.id ? { ...r, ...updates } : r))
      setEditingRecord(null); toast.success('Payroll record updated')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const approvePeriod = async () => {
    if (!canApprove) return toast.error('No approval permission')
    if (!window.confirm('Approve this payroll period? Records will be locked.')) return
    const session = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
    const { error } = await supabase.from('payroll_periods').update({ status: 'approved', approved_by: session?.full_name || session?.username, processed_at: new Date().toISOString() }).eq('id', selectedPeriod.id)
    if (error) { toast.error(error.message); return }
    setPeriods(prev => prev.map(p => p.id === selectedPeriod.id ? { ...p, status: 'approved' } : p))
    setSelectedPeriod(prev => ({ ...prev, status: 'approved' }))
    toast.success('Payroll period approved and locked')
  }

  const exportToExcel = () => {
    const data = records.map(r => ({
      'Emp No': r.employee_number, 'Name': r.employee_name, 'Designation': r.designation, 'Department': r.department,
      'Reg Days': r.regular_days, 'Reg Hrs': r.regular_hours?.toFixed(1), 'OT Hrs': r.overtime_hours?.toFixed(1), 'Sat Hrs': r.saturday_hours?.toFixed(1),
      ...(canSeeAmounts ? {
        'Basic': r.basic_salary,
        'Gross': r.gross_pay?.toFixed(2),
        'PAYE': r.paye?.toFixed(2),
        'NSSA': r.nssa?.toFixed(2),
        'Aids Levy': r.aids_levy?.toFixed(2),
        'Other Ded': r.other_deductions?.toFixed(2),
        'Total Ded': r.total_deductions?.toFixed(2),
        'Net Pay': r.net_pay?.toFixed(2),
      } : {}),
      'Absent': r.absent_days, 'Leave': r.leave_days,
    }))
    exportXLSX(data, `Payroll_${selectedPeriod?.period_label?.replace(/ /g,'_')}`, 'Payroll')
    toast.success('Exported')
  }

  const handlePostToGL = async () => {
    const totalPaye  = records.reduce((s, r) => s + (r.paye             || 0), 0)
    const totalNssa  = records.reduce((s, r) => s + (r.nssa             || 0), 0)
    const totalAids  = records.reduce((s, r) => s + (r.aids_levy        || 0), 0)
    const totalOther = records.reduce((s, r) => s + (r.other_deductions || 0), 0)
    const totalGross = records.reduce((s, r) => s + (r.gross_pay        || 0), 0)
    const totalNet   = records.reduce((s, r) => s + (r.net_pay          || 0), 0)
    const required = ['expense', 'netPay', 'paye', 'nssa']
    const conditional = [...(totalAids > 0.001 ? ['aids'] : []), ...(totalOther > 0.001 ? ['other'] : [])]
    if ([...required, ...conditional].some(k => !glLines[k])) return toast.error('Select all accounts before posting')
    setPosting(true)
    const session = JSON.parse(localStorage.getItem('bravura_session') || sessionStorage.getItem('bravura_session') || '{}')
    const lines = [
      { account_id: glLines.expense, debit: totalGross, credit: 0,         description: 'Salaries & Wages Expense' },
      { account_id: glLines.netPay,  debit: 0,          credit: totalNet,  description: 'Net Salaries Payable' },
      { account_id: glLines.paye,    debit: 0,          credit: totalPaye, description: 'PAYE Payable (ZIMRA)' },
      { account_id: glLines.nssa,    debit: 0,          credit: totalNssa, description: 'NSSA Payable' },
      ...(totalAids  > 0.001 ? [{ account_id: glLines.aids,  debit: 0, credit: totalAids,  description: 'Aids Levy Payable' }] : []),
      ...(totalOther > 0.001 ? [{ account_id: glLines.other, debit: 0, credit: totalOther, description: 'Other Deductions Payable' }] : []),
    ]
    try {
      await postToGL({
        sourceModule: 'payroll', sourceType: 'payroll_period',
        sourceId:    selectedPeriod.id,
        entryDate:   selectedPeriod.end_date,
        description: `Payroll — ${selectedPeriod.period_label} (${records.length} employees)`,
        reference:   `PAYROLL-${selectedPeriod.id}`,
        lines, postedBy: session?.full_name || session?.username || '',
      })
      setGlPosted(true)
      setGlModal(false)
      toast.success('Payroll posted to General Ledger')
    } catch (err) { toast.error(err.message) }
    finally { setPosting(false) }
  }

  // Print payslip
  const printPayslip = (record) => {
    const period = selectedPeriod || {}
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Payslip — ${record.employee_name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; font-size: 13px; color: #1a1a1a; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #666; margin-bottom: 20px; }
        .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
        .bold { font-weight: bold; }
        .section { margin: 20px 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; }
        .total { font-size: 15px; font-weight: bold; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>BRAVURA OPERATIONS</h1>
      <h2>PAYSLIP — ${period.period_label || ''}</h2>
      <div class="row"><span>Employee Name</span><span class="bold">${record.employee_name}</span></div>
      <div class="row"><span>Employee Number</span><span>${record.employee_number || '—'}</span></div>
      <div class="row"><span>Designation</span><span>${record.designation || '—'}</span></div>
      <div class="row"><span>Department</span><span>${record.department || '—'}</span></div>
      <div class="row"><span>Pay Period</span><span>${period.start_date} → ${period.end_date}</span></div>
      <div class="section">Earnings</div>
      ${canSeeAmounts ? `<div class="row"><span>Basic Salary</span><span>$${(record.basic_salary||0).toFixed(2)}</span></div>` : ''}
      <div class="row"><span>Regular Pay (${record.regular_hours?.toFixed(1)} hrs)</span><span>${canSeeAmounts ? `$${(record.regular_pay||0).toFixed(2)}` : '—'}</span></div>
      ${record.overtime_hours > 0 ? `<div class="row"><span>Overtime Pay (${record.overtime_hours?.toFixed(1)} hrs × 1.5)</span><span>${canSeeAmounts ? `$${(record.overtime_pay||0).toFixed(2)}` : '—'}</span></div>` : ''}
      ${record.saturday_hours > 0 ? `<div class="row"><span>Saturday Pay (${record.saturday_hours?.toFixed(1)} hrs × 1.5)</span><span>${canSeeAmounts ? `$${(record.saturday_pay||0).toFixed(2)}` : '—'}</span></div>` : ''}
      ${record.public_holiday_hours > 0 ? `<div class="row"><span>Public Holiday Pay (${record.public_holiday_hours?.toFixed(1)} hrs × 2.0)</span><span>${canSeeAmounts ? `$${(record.public_holiday_pay||0).toFixed(2)}` : '—'}</span></div>` : ''}
      ${record.allowances > 0 ? `<div class="row"><span>Allowances</span><span>${canSeeAmounts ? `$${(record.allowances||0).toFixed(2)}` : '—'}</span></div>` : ''}
      ${canSeeAmounts ? `<div class="row bold"><span>GROSS PAY</span><span class="total">$${(record.gross_pay||0).toFixed(2)}</span></div>` : ''}
      <div class="section">Deductions</div>
      ${canSeeAmounts ? `<div class="row"><span>PAYE</span><span>$${(record.paye||0).toFixed(2)}</span></div>` : ''}
      ${taxSlabs.length > 0 ? `<div class="row note"><span>PAYE method</span><span>ZIMRA progressive</span></div>` : ''}
      ${canSeeAmounts ? `<div class="row"><span>NSSA (Employee)</span><span>$${(record.nssa||0).toFixed(2)}</span></div>` : ''}
      ${canSeeAmounts ? `<div class="row"><span>Aids Levy</span><span>$${(record.aids_levy||0).toFixed(2)}</span></div>` : ''}
      ${record.other_deductions > 0 ? `<div class="row"><span>Other Deductions</span><span>${canSeeAmounts ? `$${(record.other_deductions||0).toFixed(2)}` : '—'}</span></div>` : ''}
      ${canSeeAmounts ? `<div class="row bold"><span>TOTAL DEDUCTIONS</span><span>$${(record.total_deductions||0).toFixed(2)}</span></div>` : ''}
      <br>${canSeeAmounts ? `<div class="row bold" style="font-size:16px; padding: 10px 0; border-top: 2px solid #000;"><span>NET PAY</span><span style="color:#16a34a">$${(record.net_pay||0).toFixed(2)}</span></div>` : '<div class="row" style="padding: 10px 0; border-top: 2px solid #000;"><span>NET PAY</span><span style="color:#888">Restricted</span></div>'}
      <br><div style="font-size:10px; color:#999; margin-top:30px">Generated by Bravura ERP · ${new Date().toLocaleString()}</div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `)
    win.document.close()
  }

  const totals = records.reduce((acc, r) => ({
    gross: acc.gross + (r.gross_pay || 0), net: acc.net + (r.net_pay || 0), deduct: acc.deduct + (r.total_deductions || 0),
  }), { gross: 0, net: 0, deduct: 0 })

  const totalPaye  = records.reduce((s, r) => s + (r.paye             || 0), 0)
  const totalNssa  = records.reduce((s, r) => s + (r.nssa             || 0), 0)
  const totalAids  = records.reduce((s, r) => s + (r.aids_levy        || 0), 0)
  const totalOther = records.reduce((s, r) => s + (r.other_deductions || 0), 0)

  const isLocked = selectedPeriod?.status === 'approved' || selectedPeriod?.status === 'paid'

  const statusBadge = (s) => <StatusBadge status={s} />

  return (
    <div>
      <PageHeader title="Payroll">
        <button className="btn btn-secondary" onClick={createPeriod}><span className="material-icons">add</span> New Period</button>
        {selectedPeriod && !isLocked && canEdit && <button className="btn btn-secondary" onClick={generateRecords} disabled={generating}><span className="material-icons">autorenew</span>{generating ? 'Generating…' : 'Generate'}</button>}
        {records.length > 0 && <button className="btn btn-secondary" onClick={exportToExcel}><span className="material-icons">table_chart</span> Export</button>}
        {selectedPeriod && !isLocked && canApprove && records.length > 0 && <button className="btn btn-primary" onClick={approvePeriod}><span className="material-icons">check_circle</span> Approve</button>}
        {isLocked && records.length > 0 && canApprove && (glPosted
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--green)', background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.3)', padding: '6px 12px', borderRadius: 8 }}><span className="material-icons" style={{ fontSize: 15 }}>account_balance</span> GL Posted</span>
          : <button className="btn btn-primary" onClick={() => setGlModal(true)}><span className="material-icons">account_balance</span> Post to GL</button>
        )}
      </PageHeader>

      {/* Tabs */}
      <TabNav
        tabs={[
          { id: 'payroll', label: 'Payroll Runs', icon: 'payments' },
          { id: 'history', label: 'Pay History',  icon: 'history'  },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'payroll' && (
        <>
          {/* Period selector */}
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}><label>Payroll Period</label><select className="form-control" value={selectedPeriod?.id || ''} onChange={e => setSelectedPeriod(periods.find(p => p.id === e.target.value) || null)}><option value="">— Select period —</option>{periods.map(p => <option key={p.id} value={p.id}>{p.period_label} ({p.start_date} → {p.end_date})</option>)}</select></div>
              {selectedPeriod && <div className="form-group"><label>Status</label><div style={{ paddingTop: 8 }}>{statusBadge(selectedPeriod.status)}</div></div>}
            </div>
            {selectedPeriod && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Period: {selectedPeriod.start_date} → {selectedPeriod.end_date}{selectedPeriod.approved_by && ` · Approved by ${selectedPeriod.approved_by}`}</div>}
          </div>

          {records.length > 0 && (
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              <KPICard label="Employees" value={records.length} icon="people" color="blue" />
              <KPICard label="Gross Pay" value={`$${totals.gross.toFixed(0)}`} icon="payments" color="teal" />
              <KPICard label="Deductions" value={`$${totals.deduct.toFixed(0)}`} icon="remove_circle" color="red" />
              <KPICard label="Net Pay" value={`$${totals.net.toFixed(0)}`} icon="account_balance_wallet" color="green" />
            </div>
          )}

          {loading ? (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>
          ) : !selectedPeriod ? (
            <EmptyState icon="payments" message="Select or create a payroll period" />
          ) : records.length === 0 ? (
            <EmptyState icon="autorenew" message="No records yet — click Generate to create them from attendance data" />
          ) : (
            <div className="card">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
                Payroll Records — {selectedPeriod.period_label}{isLocked && <span className="badge badge-green" style={{ marginLeft: 10 }}>Locked</span>}{glPosted && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'rgba(52,211,153,.12)', border: '1px solid rgba(52,211,153,.3)', padding: '2px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>account_balance</span>GL Posted</span>}
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                <table className="stock-table" style={{ minWidth: 900 }}>
                  <thead><tr><th>Employee</th><th>Dept</th><th>Reg Hrs</th><th>OT Hrs</th><th>Gross</th><th>PAYE</th><th>NSSA</th><th>Aids</th><th>Total Ded</th><th>Net Pay</th><th>Absent</th><th>Actions</th></tr></thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id}>
                        <td><div style={{ fontWeight: 600 }}>{r.employee_name}</div><div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.employee_number} · {r.designation}</div></td>
                        <td style={{ fontSize: 11 }}>{r.department}</td>
                        <td className="td-mono">{r.regular_hours?.toFixed(1)}</td>
                        <td className="td-mono" style={{ color: r.overtime_hours > 0 ? 'var(--yellow)' : 'inherit' }}>{r.overtime_hours?.toFixed(1)}</td>
                        <td className="td-mono"><ProtectedField entity="payroll" field="gross_pay">${r.gross_pay?.toFixed(2) || '—'}</ProtectedField></td>
                        <td className="td-mono" style={{ fontSize: 11 }}><ProtectedField entity="payroll" field="paye">${r.paye?.toFixed(2) || '0'}</ProtectedField></td>
                        <td className="td-mono" style={{ fontSize: 11 }}><ProtectedField entity="payroll" field="nssa">${r.nssa?.toFixed(2) || '0'}</ProtectedField></td>
                        <td className="td-mono" style={{ fontSize: 11 }}><ProtectedField entity="payroll" field="aids_levy">${r.aids_levy?.toFixed(2) || '0'}</ProtectedField></td>
                        <td className="td-mono" style={{ color: 'var(--red)' }}><ProtectedField entity="payroll" field="total_deductions">${r.total_deductions?.toFixed(2) || '0'}</ProtectedField></td>
                        <td className="td-mono" style={{ color: 'var(--green)' }}><ProtectedField entity="payroll" field="net_pay">${r.net_pay?.toFixed(2) || '—'}</ProtectedField></td>
                        <td className="td-mono" style={{ color: r.absent_days > 0 ? 'var(--red)' : 'inherit' }}>{r.absent_days}</td>
                        <td className="td-actions">
                          <div className="btn-group-sm">
                            <button className="btn btn-secondary btn-sm" title="Print Payslip" onClick={() => printPayslip(r)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>print</span>
                            </button>
                            {!isLocked && canEdit && (
                              <button className="btn btn-secondary btn-sm" onClick={() => { setEditingRecord(r); setSalaryForm({ basic_salary: r.basic_salary, regular_pay: r.regular_pay, overtime_pay: r.overtime_pay, saturday_pay: r.saturday_pay, public_holiday_pay: r.public_holiday_pay, allowances: r.allowances, paye: r.paye, nssa: r.nssa, aids_levy: r.aids_levy, other_deductions: r.other_deductions, notes: r.notes }) }}>
                                <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div className="form-group">
              <label>Select Employee</label>
              <select className="form-control" value={historyEmployee || ''} onChange={e => setHistoryEmployee(e.target.value || null)}>
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
            </div>
          </div>
          {!historyEmployee ? (
            <EmptyState icon="person_search" message="Select an employee to view pay history" />
          ) : historyRecords.length === 0 ? (
            <EmptyState icon="payments" message="No payroll records found for this employee" />
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="stock-table">
                  <thead><tr><th>Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Reg Hrs</th><th>OT Hrs</th><th>Status</th><th>Payslip</th></tr></thead>
                  <tbody>
                    {historyRecords.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.payroll_periods?.period_label || '—'}<div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{r.payroll_periods?.start_date} → {r.payroll_periods?.end_date}</div></td>
                        <td className="td-mono"><ProtectedField entity="payroll" field="gross_pay">${(r.gross_pay || 0).toFixed(2)}</ProtectedField></td>
                        <td className="td-mono" style={{ color: 'var(--red)' }}><ProtectedField entity="payroll" field="total_deductions">${(r.total_deductions || 0).toFixed(2)}</ProtectedField></td>
                        <td className="td-mono" style={{ color: 'var(--green)' }}><ProtectedField entity="payroll" field="net_pay">${(r.net_pay || 0).toFixed(2)}</ProtectedField></td>
                        <td className="td-mono">{r.regular_hours?.toFixed(1)}</td>
                        <td className="td-mono" style={{ color: r.overtime_hours > 0 ? 'var(--yellow)' : 'inherit' }}>{r.overtime_hours?.toFixed(1)}</td>
                        <td>{statusBadge(r.payroll_periods?.status || 'open')}</td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => { setSelectedPeriod(periods.find(p => p.id === r.payroll_period_id)); printPayslip(r) }}><span className="material-icons" style={{ fontSize: 13 }}>print</span></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GL Posting Modal */}
      {glModal && (
        <div className="overlay" onClick={() => setGlModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8, color: 'var(--green)' }}>account_balance</span>
              Post Payroll to GL — {selectedPeriod?.period_label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}>
              {records.length} employees · Gross <strong style={{ color: 'var(--text)' }}>${totals.gross.toFixed(2)}</strong>
              {' → '}Net <strong style={{ color: 'var(--green)' }}>${totals.net.toFixed(2)}</strong>
              {' · '}Deductions <strong style={{ color: 'var(--red)' }}>${totals.deduct.toFixed(2)}</strong>
            </div>
            {[
              { key: 'expense', side: 'DR', label: 'Salaries & Wages Expense',      amount: totals.gross, show: true },
              { key: 'netPay',  side: 'CR', label: 'Net Salaries Payable',           amount: totals.net,  show: true },
              { key: 'paye',    side: 'CR', label: 'PAYE Payable (ZIMRA)',            amount: totalPaye,   show: true },
              { key: 'nssa',    side: 'CR', label: 'NSSA Payable',                   amount: totalNssa,   show: true },
              { key: 'aids',    side: 'CR', label: 'Aids Levy Payable',              amount: totalAids,   show: totalAids > 0.001 },
              { key: 'other',   side: 'CR', label: 'Other Deductions Payable',       amount: totalOther,  show: totalOther > 0.001 },
            ].filter(l => l.show).map(l => (
              <div key={l.key} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 110px', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 0', borderRadius: 4, textAlign: 'center', background: l.side === 'DR' ? 'rgba(52,211,153,.15)' : 'rgba(239,68,68,.12)', color: l.side === 'DR' ? 'var(--green)' : 'var(--red)' }}>{l.side}</span>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{l.label}</div>
                  <select className="form-control" value={glLines[l.key]} onChange={e => setGlLines(p => ({ ...p, [l.key]: e.target.value }))}>
                    <option value="">— Select account —</option>
                    {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right', fontSize: 13, color: l.side === 'DR' ? 'var(--green)' : 'var(--red)' }}>${l.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setGlModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePostToGL} disabled={posting}>
                <span className="material-icons">account_balance</span>
                {posting ? 'Posting to GL…' : 'Post to General Ledger'}
              </button>
            </div>
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
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Earnings</div>
                {[['Basic Salary','basic_salary'],['Regular Pay','regular_pay'],['OT Pay (1.5×)','overtime_pay'],['Saturday Pay (1.5×)','saturday_pay'],['Public Holiday Pay (2×)','public_holiday_pay'],['Allowances','allowances']].map(([label, key]) => (
                  <div className="form-group" key={key}><label>{label}</label><input type="number" step="0.01" min="0" className="form-control" value={salaryForm[key] || 0} onChange={e => setSalaryForm(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} /></div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Deductions</div>
                {[['PAYE','paye'],['NSSA','nssa'],['Aids Levy','aids_levy'],['Other Deductions','other_deductions']].map(([label, key]) => (
                  <div className="form-group" key={key}><label>{label}</label><input type="number" step="0.01" min="0" className="form-control" value={salaryForm[key] || 0} onChange={e => setSalaryForm(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} /></div>
                ))}
                <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={salaryForm.notes || ''} onChange={e => setSalaryForm(p => ({ ...p, notes: e.target.value }))} /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingRecord(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSalaryEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
   
