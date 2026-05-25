// src/pages/HR/ITF16Certificates.jsx
// ITF16 — ZIMRA Annual Employee Income Tax Certificate
// Issued by every employer to each employee by 31 January of the following year.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Spinner } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (n) => `$ ${fmtNum(n)}`

const computeGross = (r) =>
  (r.regular_pay || 0) +
  (r.overtime_pay || 0) +
  (r.saturday_pay || 0) +
  (r.public_holiday_pay || 0) +
  (r.allowances || 0)

/** Build certificate number: ITF16-[emp_number]-[last4 of year_label] */
const certNumber = (empNumber, yearLabel) => {
  const yr = yearLabel ? String(yearLabel).slice(-4) : new Date().getFullYear()
  return `ITF16-${empNumber || 'UNKNOWN'}-${yr}`
}

/** Show due date banner for January or when year is Closed */
const shouldShowDueBanner = (taxYear) => {
  if (!taxYear) return false
  if (taxYear.status === 'Closed') return true
  const month = new Date().getMonth() + 1 // 1-indexed
  return month === 1
}

// ─── ITF16 Certificate Modal ──────────────────────────────────────────────────

function CertificateModal({ employee, taxYear, companySettings, onClose }) {
  const companyName = companySettings?.company_name || '[Company Name]'
  const companyBP   = companySettings?.bp_number    || '[BP Number]'

  const certNo      = certNumber(employee.employee_number, taxYear?.year_label)
  const taxableIncome = employee.total_gross // simplified — no exempt income

  const totalTax = (employee.total_paye || 0) + (employee.total_aids_levy || 0)

  const today = new Date().toLocaleDateString('en-ZW', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`ITF16 Certificate — ${employee.employee_name}`}
      size="lg"
    >
      {/* Print styles — inject a style block visible only to this modal */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { display: none !important; }
          .itf16-print-root { display: block !important; }
        }
        .itf16-print-root { display: block; }
      `}</style>

      {/* Action buttons — hidden when printing */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 20px 0' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          <span className="material-icons md-16">print</span> Print
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      {/* Certificate body */}
      <div
        className="itf16-print-root"
        style={{
          margin: '16px 20px 20px',
          background: '#fff',
          color: '#111',
          border: '2px solid #222',
          borderRadius: 6,
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {/* Header */}
        <div style={{
          textAlign: 'center',
          padding: '20px 24px 16px',
          borderBottom: '2px solid #222',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 2 }}>
            REPUBLIC OF ZIMBABWE
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>
            ZIMBABWE REVENUE AUTHORITY (ZIMRA)
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
            EMPLOYEE'S INCOME TAX CERTIFICATE
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', marginTop: 4 }}>
            FORM ITF16
          </div>
        </div>

        {/* Tax year + cert number */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #ccc',
          fontSize: 13,
        }}>
          <span><strong>Tax Year:</strong> {taxYear?.year_label || '—'}</span>
          <span><strong>Certificate No:</strong> {certNo}</span>
        </div>

        {/* Employer details */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Employer Details
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ width: 200, paddingBottom: 4, color: '#555' }}>Employer Name:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{companyName}</td>
              </tr>
              <tr>
                <td style={{ color: '#555' }}>BP Number:</td>
                <td style={{ fontWeight: 600 }}>{companyBP}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Employee details */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Employee Details
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ width: 220, paddingBottom: 4, color: '#555' }}>Full Name:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{employee.employee_name || '—'}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>Employee Number:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{employee.employee_number || '—'}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>National ID / Passport:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{employee.national_id || '—'}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>ZIMRA TIN:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{employee.tin_number || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Earnings summary */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Earnings Summary
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <CertRow label="Total Gross Earnings" value={$(employee.total_gross || 0)} />
              <CertRow label="Less: Exempt Income" value="$   0.00" dim />
              <CertRow label="Taxable Income" value={$(taxableIncome)} bold />
            </tbody>
          </table>
        </div>

        {/* Tax deductions */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Tax Deductions
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <CertRow label="PAYE Deducted" value={$(employee.total_paye || 0)} />
              <CertRow label="AIDS Levy (3%)" value={$(employee.total_aids_levy || 0)} />
              <CertRow label="Total Tax" value={$(totalTax)} bold />
            </tbody>
          </table>
        </div>

        {/* Other deductions */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Other Deductions
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <CertRow label="NSSA (Employee 3%)" value={$(employee.total_nssa || 0)} />
              <CertRow label="Other Deductions" value={$(employee.total_other_deductions || 0)} />
            </tbody>
          </table>
        </div>

        {/* Net pay */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid #ccc',
          background: '#f9f9f9',
        }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ paddingBottom: 2, fontWeight: 700 }}>NET PAY (after all deductions):</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16 }}>{$(employee.total_net || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Certification statement */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc', fontSize: 12, color: '#444' }}>
          I certify that the above is a true reflection of deductions made during the above-mentioned tax year.
        </div>

        {/* Signature block */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 24px 20px',
          fontSize: 12,
        }}>
          <div>
            Authorised Signatory: <span style={{ borderBottom: '1px solid #555', paddingRight: 120, display: 'inline-block' }} />
          </div>
          <div>
            Date: _____ / _____ / _________
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          padding: '10px 24px 16px',
          borderTop: '1px solid #ccc',
          fontSize: 11,
          color: '#666',
          fontStyle: 'italic',
        }}>
          This certificate must be retained by the employee.
        </div>
      </div>

      <ModalActions>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}>
          <span className="material-icons md-16">print</span> Print Certificate
        </button>
        <button className="btn btn-secondary no-print" onClick={onClose}>Close</button>
      </ModalActions>
    </ModalDialog>
  )
}

/** Reusable certificate row */
function CertRow({ label, value, bold, dim }) {
  return (
    <tr>
      <td style={{
        width: 260,
        paddingBottom: 4,
        color: dim ? '#888' : '#555',
        fontStyle: dim ? 'italic' : 'normal',
      }}>
        {label}:
      </td>
      <td style={{
        textAlign: 'right',
        paddingBottom: 4,
        fontWeight: bold ? 700 : 500,
      }}>
        {value}
      </td>
    </tr>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ITF16Certificates() {
  const [taxYears,       setTaxYears]       = useState([])
  const [selectedYear,   setSelectedYear]   = useState(null)
  const [employees,      setEmployees]      = useState([])
  const [companySettings, setCompanySettings] = useState(null)

  const [loadingYears,  setLoadingYears]  = useState(true)
  const [loadingCerts,  setLoadingCerts]  = useState(false)
  const [loaded,        setLoaded]        = useState(false)

  const [selectedEmp,   setSelectedEmp]   = useState(null) // for modal

  // ── Fetch tax years on mount ───────────────────────────────────────────────
  const fetchTaxYears = useCallback(async () => {
    setLoadingYears(true)
    try {
      const { data, error } = await supabase
        .from('tax_years')
        .select('id, year_label, start_date, end_date, status')
        .order('start_date', { ascending: false })
      if (error) throw error
      const list = data || []
      setTaxYears(list)
      // Auto-select: prefer most-recent Active or Closed year
      const autoSel = list.find(y => y.status === 'Active') ||
                      list.find(y => y.status === 'Closed') ||
                      list[0] || null
      setSelectedYear(autoSel)
    } catch (err) {
      toast.error('Failed to load tax years: ' + err.message)
    } finally {
      setLoadingYears(false)
    }
  }, [])

  // ── Fetch company settings ─────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('payroll_settings')
        .select('company_name, bp_number')
        .maybeSingle()
      setCompanySettings(data || null)
    } catch {
      // non-fatal — use placeholders
    }
  }, [])

  useEffect(() => {
    fetchTaxYears()
    fetchSettings()
  }, [fetchTaxYears, fetchSettings])

  // ── Load certificates ──────────────────────────────────────────────────────
  const loadCertificates = useCallback(async () => {
    if (!selectedYear) { toast.error('Please select a tax year'); return }
    setLoadingCerts(true)
    setLoaded(false)
    setEmployees([])
    try {
      // 1. Fetch payroll periods for the selected tax year
      const { data: periods, error: pErr } = await supabase
        .from('payroll_periods')
        .select('id, period_label, start_date, end_date, currency')
        .gte('start_date', selectedYear.start_date)
        .lte('end_date', selectedYear.end_date)
      if (pErr) throw pErr

      if (!periods?.length) {
        toast('No payroll periods found for this tax year', { icon: 'ℹ️' })
        setLoaded(true)
        setLoadingCerts(false)
        return
      }

      const periodIds = periods.map(p => p.id)

      // 2. Fetch payroll records for those periods
      const { data: records, error: rErr } = await supabase
        .from('payroll_records')
        .select('*')
        .in('payroll_period_id', periodIds)
      if (rErr) throw rErr

      const allRecords = records || []

      // 3. Fetch employee details for national_id / tin_number
      const employeeIds = [...new Set(allRecords.map(r => r.employee_id).filter(Boolean))]

      let empMap = {}
      if (employeeIds.length) {
        const { data: empDetails, error: eErr } = await supabase
          .from('employees')
          .select('id, name, employee_number, national_id, tin_number, bp_number, department_id')
          .in('id', employeeIds)
        if (eErr) throw eErr
        for (const e of empDetails || []) {
          empMap[e.id] = e
        }
      }

      // 4. Group records by employee_id and compute aggregates
      const grouped = {}
      for (const r of allRecords) {
        const eid = r.employee_id
        if (!eid) continue
        if (!grouped[eid]) {
          grouped[eid] = {
            employee_id:             eid,
            employee_name:           r.employee_name || empMap[eid]?.name || '—',
            employee_number:         r.employee_number || empMap[eid]?.employee_number || '—',
            department:              r.department || '—',
            national_id:             empMap[eid]?.national_id || null,
            tin_number:              empMap[eid]?.tin_number  || null,
            bp_number:               empMap[eid]?.bp_number   || null,
            total_gross:             0,
            total_paye:              0,
            total_aids_levy:         0,
            total_nssa:              0,
            total_other_deductions:  0,
            total_net:               0,
            periods_count:           0,
          }
        }
        const g = grouped[eid]
        g.total_gross            += computeGross(r)
        g.total_paye             += r.paye             || 0
        g.total_aids_levy        += r.aids_levy        || 0
        g.total_nssa             += r.nssa             || 0
        g.total_other_deductions += r.other_deductions || 0
        g.total_net              += r.net_pay          || 0
        g.periods_count          += 1
      }

      const list = Object.values(grouped).sort((a, b) =>
        (a.employee_name || '').localeCompare(b.employee_name || '')
      )
      setEmployees(list)
      setLoaded(true)
      toast.success(`Loaded ${list.length} employee certificate${list.length !== 1 ? 's' : ''}`)
    } catch (err) {
      toast.error('Failed to load certificates: ' + err.message)
    } finally {
      setLoadingCerts(false)
    }
  }, [selectedYear])

  // ── KPI aggregates ─────────────────────────────────────────────────────────
  const totGross = useMemo(() => employees.reduce((a, e) => a + (e.total_gross || 0), 0), [employees])
  const totPaye  = useMemo(() => employees.reduce((a, e) => a + (e.total_paye  || 0), 0), [employees])
  const totNssa  = useMemo(() => employees.reduce((a, e) => a + (e.total_nssa  || 0), 0), [employees])

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExportXLSX = () => {
    if (!employees.length) { toast.error('No certificates to export'); return }
    const rows = employees.map((e, i) => ({
      '#':                  i + 1,
      'Employee Name':      e.employee_name || '',
      'Emp No':             e.employee_number || '',
      'National ID / TIN':  e.national_id || e.tin_number || '',
      'Periods':            e.periods_count,
      'Total Gross':        e.total_gross,
      'PAYE':               e.total_paye,
      'AIDS Levy':          e.total_aids_levy,
      'NSSA':               e.total_nssa,
      'Other Deductions':   e.total_other_deductions,
      'Net Pay':            e.total_net,
      'Certificate No':     certNumber(e.employee_number, selectedYear?.year_label),
      'Status':             (e.national_id || e.tin_number) ? 'Complete' : 'Missing ID',
    }))
    exportXLSX(rows, `ITF16_${selectedYear?.year_label || 'certificates'}`, 'ITF16 Certificates')
    toast.success('XLSX exported')
  }

  // ── Due-date banner logic ──────────────────────────────────────────────────
  const showBanner = shouldShowDueBanner(selectedYear)
  const bannerYear = selectedYear?.year_label || ''
  const yearEnd    = selectedYear?.end_date
  const dueYear    = yearEnd ? new Date(yearEnd).getFullYear() + 1 : ''

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="ITF16 Tax Certificates"
        subtitle="Annual employee income tax certificates — ZIMRA Form ITF16, due 31 January"
      >
        {loaded && employees.length > 0 && (
          <>
            <button className="btn btn-secondary btn-sm no-print" onClick={handleExportXLSX}>
              <span className="material-icons md-16">download</span> Export All XLSX
            </button>
            <button className="btn btn-secondary btn-sm no-print" onClick={() => window.print()}>
              <span className="material-icons md-16">print</span> Print All Certificates
            </button>
          </>
        )}
      </PageHeader>

      {/* Due date banner */}
      {showBanner && selectedYear && (
        <div
          style={{
            border: '2px solid var(--gold)',
            borderRadius: 8,
            padding: '12px 18px',
            marginBottom: 16,
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--text)',
          }}
        >
          <span style={{ fontSize: 18 }}>📅</span>
          <span>
            <strong>ITF16 certificates for {bannerYear}</strong> are due by{' '}
            <strong style={{ color: 'var(--gold)' }}>31 January {dueYear}</strong>.
            Ensure all payroll periods are approved.
          </span>
        </div>
      )}

      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
          padding: '12px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          Tax Year
        </label>

        {loadingYears ? (
          <Spinner size="sm" />
        ) : (
          <select
            className="form-control"
            style={{ minWidth: 200 }}
            value={selectedYear?.id || ''}
            onChange={e => {
              const y = taxYears.find(ty => ty.id === e.target.value)
              setSelectedYear(y || null)
              setLoaded(false)
              setEmployees([])
            }}
          >
            <option value="">— Select Tax Year —</option>
            {taxYears.map(y => (
              <option key={y.id} value={y.id}>
                {y.year_label} ({y.status})
              </option>
            ))}
          </select>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={loadCertificates}
          disabled={!selectedYear || loadingCerts}
        >
          {loadingCerts
            ? <><Spinner size="sm" /> Loading…</>
            : <><span className="material-icons md-16">assignment</span> Load Certificates</>
          }
        </button>

        {selectedYear && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {selectedYear.start_date} → {selectedYear.end_date}
          </span>
        )}
      </div>

      {/* Loading state */}
      {loadingCerts && (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Aggregating payroll records across all periods…" />
        </div>
      )}

      {/* Empty / not loaded */}
      {!loadingCerts && !loaded && (
        <EmptyState
          icon="assignment"
          message="Select a tax year and click Load Certificates to generate ITF16 summaries."
        />
      )}

      {/* Loaded but no records */}
      {!loadingCerts && loaded && employees.length === 0 && (
        <EmptyState
          icon="assignment"
          message={`No payroll records found for tax year ${selectedYear?.year_label || ''}.`}
        />
      )}

      {/* Main content */}
      {!loadingCerts && loaded && employees.length > 0 && (
        <>
          {/* KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <KPICard
              label="Employees"
              value={employees.length}
              icon="people"
              color="blue"
            />
            <KPICard
              label="Total Gross Paid"
              value={$(totGross)}
              icon="payments"
              color="green"
            />
            <KPICard
              label="Total PAYE Remitted"
              value={$(totPaye)}
              icon="account_balance"
              color="yellow"
            />
            <KPICard
              label="Total NSSA"
              value={$(totNssa)}
              icon="security"
              color="teal"
            />
          </div>

          {/* Certificates summary table */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                ITF16 Certificates — {selectedYear?.year_label}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm no-print" onClick={handleExportXLSX}>
                  <span className="material-icons md-16">download</span> Export XLSX
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 1000 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Employee</th>
                    <th>Emp No</th>
                    <th>NID / TIN</th>
                    <th style={{ textAlign: 'center' }}>Periods</th>
                    <th style={{ textAlign: 'right' }}>Total Gross</th>
                    <th style={{ textAlign: 'right' }}>PAYE</th>
                    <th style={{ textAlign: 'right' }}>AIDS Levy</th>
                    <th style={{ textAlign: 'right' }}>NSSA</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => {
                    const idDisplay = e.national_id || e.tin_number
                    const isComplete = !!(e.national_id || e.tin_number)
                    return (
                      <tr
                        key={e.employee_id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedEmp(e)}
                        title="Click to view/print ITF16 certificate"
                      >
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{e.employee_name}</td>
                        <td style={{
                          color: 'var(--text-dim)',
                          fontFamily: 'var(--mono)',
                          fontSize: 12,
                        }}>
                          {e.employee_number || '—'}
                        </td>
                        <td style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 12,
                          color: idDisplay ? 'var(--text)' : 'var(--red)',
                          fontWeight: idDisplay ? 400 : 600,
                        }}>
                          {idDisplay || '⚠ Missing'}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-mid)' }}>
                          {e.periods_count}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(e.total_gross)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
                          {$(e.total_paye)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                          {$(e.total_aids_levy)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                          {$(e.total_nssa)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {$(e.total_net)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isComplete ? (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--green)',
                                background: 'color-mix(in srgb, var(--green) 12%, transparent)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Complete
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: 'var(--red)',
                                background: 'color-mix(in srgb, var(--red) 12%, transparent)',
                                padding: '2px 8px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Missing ID
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={5} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                      TOTALS
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(totGross)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>{$(totPaye)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                      {$(employees.reduce((a, e) => a + (e.total_aids_levy || 0), 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{$(totNssa)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {$(employees.reduce((a, e) => a + (e.total_net || 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ITF16 Certificate Modal */}
      {selectedEmp && (
        <CertificateModal
          employee={selectedEmp}
          taxYear={selectedYear}
          companySettings={companySettings}
          onClose={() => setSelectedEmp(null)}
        />
      )}
    </div>
  )
}
