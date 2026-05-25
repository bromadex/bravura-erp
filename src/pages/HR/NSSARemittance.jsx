// src/pages/HR/NSSARemittance.jsx
// NSSA Monthly Remittance Schedule
// Employee contribution: 3% of gross, capped at $600 insurable earnings → max $18.00/month
// Employer contribution: 3.5% of gross, capped at $700 insurable earnings → max $24.50/month
// Due: 10th of the following month — SI 393 of 1993 as amended 2023

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (n) => `$ ${fmtNum(n)}`

const computeGross = (r) =>
  (r.regular_pay        || 0) +
  (r.overtime_pay       || 0) +
  (r.saturday_pay       || 0) +
  (r.public_holiday_pay || 0) +
  (r.allowances         || 0)

const getDueDate = (period) => {
  if (!period?.end_date) return '—'
  const d = new Date(period.end_date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(10)
  return d.toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' })
}

const getDueDateParts = (period) => {
  if (!period?.end_date) return { day: '10', month: '—', year: '—', full: '—' }
  const d = new Date(period.end_date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(10)
  return {
    day:   '10',
    month: d.toLocaleDateString('en-ZW', { month: 'long' }),
    year:  d.getFullYear(),
    full:  d.toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

const enrichRecord = (r) => {
  const gross       = computeGross(r)
  const ee_insurable = Math.min(gross, 600)
  const er_insurable = Math.min(gross, 700)
  const ee_nssa      = r.nssa || 0
  const er_nssa      = parseFloat((er_insurable * 0.035).toFixed(2))
  const total_nssa   = parseFloat((ee_nssa + er_nssa).toFixed(2))
  return { ...r, gross, ee_insurable, er_insurable, ee_nssa, er_nssa, total_nssa }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NSSARemittance() {
  const [periods,        setPeriods]        = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [records,        setRecords]        = useState([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)

  // ── Fetch periods on mount ─────────────────────────────────────────────────
  const fetchPeriods = useCallback(async () => {
    setLoadingPeriods(true)
    try {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('id, period_label, start_date, end_date, status')
        .order('start_date', { ascending: false })
      if (error) throw error
      const list = data || []
      setPeriods(list)
      const closed = list.find(p => p.status === 'Closed')
      setSelectedPeriod(closed || list[0] || null)
    } catch (err) {
      toast.error('Failed to load payroll periods: ' + err.message)
    } finally {
      setLoadingPeriods(false)
    }
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])

  // ── Fetch records when period changes ──────────────────────────────────────
  const fetchRecords = useCallback(async (period) => {
    if (!period) { setRecords([]); return }
    setLoadingRecords(true)
    try {
      const { data, error } = await supabase
        .from('payroll_records')
        .select(
          'id, employee_name, employee_number, department,' +
          'regular_pay, overtime_pay, saturday_pay, public_holiday_pay,' +
          'allowances, nssa, net_pay'
        )
        .eq('payroll_period_id', period.id)
        .order('employee_name', { ascending: true })
      if (error) throw error
      setRecords((data || []).map(enrichRecord))
    } catch (err) {
      toast.error('Failed to load payroll records: ' + err.message)
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  useEffect(() => { fetchRecords(selectedPeriod) }, [selectedPeriod, fetchRecords])

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totEmployees  = records.length
  const totEeNssa     = records.reduce((a, r) => a + r.ee_nssa,    0)
  const totErNssa     = records.reduce((a, r) => a + r.er_nssa,    0)
  const totNssa       = records.reduce((a, r) => a + r.total_nssa, 0)
  const dueDate       = getDueDate(selectedPeriod)
  const dueParts      = getDueDateParts(selectedPeriod)

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExportXLSX = () => {
    if (!records.length) { toast.error('No records to export'); return }
    const rows = records.map((r, i) => ({
      '#':                    i + 1,
      'Employee Name':        r.employee_name   || '',
      'Employee Number':      r.employee_number || '',
      'Department':           r.department      || '',
      'Gross Pay':            r.gross,
      'Insurable Earnings EE': r.ee_insurable,
      'Employee NSSA 3%':     r.ee_nssa,
      'Insurable Earnings ER': r.er_insurable,
      'Employer NSSA 3.5%':   r.er_nssa,
      'Total NSSA':           r.total_nssa,
    }))
    rows.push({
      '#':                    '',
      'Employee Name':        'TOTAL',
      'Employee Number':      '',
      'Department':           '',
      'Gross Pay':            records.reduce((a, r) => a + r.gross,         0),
      'Insurable Earnings EE': records.reduce((a, r) => a + r.ee_insurable, 0),
      'Employee NSSA 3%':     totEeNssa,
      'Insurable Earnings ER': records.reduce((a, r) => a + r.er_insurable, 0),
      'Employer NSSA 3.5%':   totErNssa,
      'Total NSSA':           totNssa,
    })
    exportXLSX(rows, `NSSA_${selectedPeriod?.period_label || 'remittance'}`, 'NSSA Remittance')
  }

  // ── Export CSV (NSSA format) ───────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!records.length) { toast.error('No records to export'); return }
    const header = [
      'EmployeeName', 'EmployeeNumber', 'GrossPay',
      'InsurableEarningsEE', 'EmployeeNSSA',
      'InsurableEarningsER', 'EmployerNSSA', 'TotalNSSA',
    ]
    const rows = records.map(r => [
      r.employee_name   || '',
      r.employee_number || '',
      r.gross.toFixed(2),
      r.ee_insurable.toFixed(2),
      r.ee_nssa.toFixed(2),
      r.er_insurable.toFixed(2),
      r.er_nssa.toFixed(2),
      r.total_nssa.toFixed(2),
    ])
    const csv  = [header, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `NSSA_${selectedPeriod?.period_label || 'remittance'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasRecords = records.length > 0
  const noPeriod   = !selectedPeriod && !loadingPeriods

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="NSSA Remittance Schedule"
        subtitle="Monthly NSSA contributions — employee 3% + employer 3.5% — due 10th of following month"
      >
        {hasRecords && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
              <span className="material-icons md-16">download</span> Export XLSX
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              <span className="material-icons md-16">upload_file</span> Export CSV
            </button>
          </>
        )}
      </PageHeader>

      {/* Period Selector Bar */}
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
          Payroll Period
        </label>
        {loadingPeriods ? (
          <Spinner size="sm" />
        ) : (
          <select
            className="form-control"
            style={{ minWidth: 220 }}
            value={selectedPeriod?.id || ''}
            onChange={e => {
              const p = periods.find(p => p.id === e.target.value)
              setSelectedPeriod(p || null)
            }}
          >
            <option value="">— Select Period —</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.period_label}{p.status === 'Closed' ? ' (Closed)' : p.status === 'Draft' ? ' (Draft)' : ''}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => fetchRecords(selectedPeriod)}
          disabled={!selectedPeriod || loadingRecords}
        >
          <span className="material-icons md-16">refresh</span> Refresh
        </button>
        {selectedPeriod && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {selectedPeriod.start_date} → {selectedPeriod.end_date}
          </span>
        )}
      </div>

      {/* Loading */}
      {loadingRecords && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading payroll records…" />
        </div>
      )}

      {/* No period selected */}
      {!loadingRecords && noPeriod && (
        <EmptyState
          icon="security"
          message="Select a payroll period to view the NSSA remittance schedule"
        />
      )}

      {/* Period selected but no records */}
      {!loadingRecords && selectedPeriod && !hasRecords && (
        <EmptyState
          icon="security"
          message={`No payroll records found for ${selectedPeriod.period_label}`}
        />
      )}

      {/* Main content */}
      {!loadingRecords && hasRecords && (
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
              value={totEmployees}
              icon="people"
              color="blue"
            />
            <KPICard
              label="Total Employee NSSA"
              value={$(totEeNssa)}
              icon="person"
              color="teal"
            />
            <KPICard
              label="Total Employer NSSA"
              value={$(totErNssa)}
              icon="business"
              color="purple"
            />
            <KPICard
              label="Total NSSA Remittance"
              value={$(totNssa)}
              icon="account_balance"
              color="gold"
            />
            <KPICard
              label="Due Date"
              value={`10 ${dueParts.month} ${dueParts.year}`}
              icon="event"
              color="yellow"
            />
          </div>

          {/* Remittance Summary Box */}
          <div
            style={{
              border: '2px solid var(--gold)',
              borderRadius: 10,
              padding: '20px 24px',
              marginBottom: 24,
              background: 'var(--surface)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--gold)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              Total NSSA Due This Month
            </div>

            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 14,
                lineHeight: '2',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 480 }}>
                <span style={{ color: 'var(--text-dim)' }}>Employee contributions (3%):</span>
                <span>{$(totEeNssa)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 480 }}>
                <span style={{ color: 'var(--text-dim)' }}>Employer contributions (3.5%):</span>
                <span>{$(totErNssa)}</span>
              </div>
              <div
                style={{
                  borderTop: '1px solid var(--border2)',
                  marginTop: 4,
                  paddingTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  maxWidth: 480,
                }}
              >
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>TOTAL PAYABLE TO NSSA:</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 16 }}>{$(totNssa)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--red)' }}>
                  event
                </span>
                Due Date:{' '}
                <strong style={{ color: 'var(--text)' }}>{dueDate}</strong>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--text-dim)' }}>
                  badge
                </span>
                NSSA Account:{' '}
                <em style={{ color: 'var(--text-dim)' }}>Enter NSSA employer registration number</em>
              </div>
            </div>
          </div>

          {/* Detail Table */}
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
                Employee Detail — {selectedPeriod?.period_label}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
                  <span className="material-icons md-16">download</span> Export XLSX
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                  <span className="material-icons md-16">upload_file</span> Export CSV
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
                    <th>Dept</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Insurable (EE)</th>
                    <th style={{ textAlign: 'right' }}>EE NSSA 3%</th>
                    <th style={{ textAlign: 'right' }}>Insurable (ER)</th>
                    <th style={{ textAlign: 'right' }}>ER NSSA 3.5%</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{r.employee_name || '—'}</td>
                      <td style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                        {r.employee_number || '—'}
                      </td>
                      <td style={{ color: 'var(--text-mid)' }}>{r.department || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(r.gross)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                        {$(r.ee_insurable)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>
                        {$(r.ee_nssa)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                        {$(r.er_insurable)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 600 }}>
                        {$(r.er_nssa)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                        {$(r.total_nssa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={4} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                      TOTALS
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {$(records.reduce((a, r) => a + r.gross, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                      {$(records.reduce((a, r) => a + r.ee_insurable, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                      {$(totEeNssa)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                      {$(records.reduce((a, r) => a + r.er_insurable, 0))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                      {$(totErNssa)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                      {$(totNssa)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
