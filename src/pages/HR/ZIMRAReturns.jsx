// src/pages/HR/ZIMRAReturns.jsx
// ZIMRA P6 Monthly PAYE Return
// Employers must remit PAYE + AIDS Levy to ZIMRA by the 10th of the following month.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getDueDate = (period) => {
  if (!period?.end_date) return '—'
  const d = new Date(period.end_date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(10)
  return d.toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' })
}

const computeGross = (r) =>
  (r.regular_pay || 0) +
  (r.overtime_pay || 0) +
  (r.saturday_pay || 0) +
  (r.public_holiday_pay || 0) +
  (r.allowances || 0)

const $ = (n) => `$ ${fmtNum(n)}`

// ─── Component ────────────────────────────────────────────────────────────────

export default function ZIMRAReturns() {
  const [periods,        setPeriods]        = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [records,        setRecords]        = useState([])
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)

  // ── Fetch periods on mount ──────────────────────────────────────────────────
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
      // Auto-select: prefer most-recent Closed, else most-recent overall
      const closed = list.find(p => p.status === 'Closed')
      setSelectedPeriod(closed || list[0] || null)
    } catch (err) {
      toast.error('Failed to load payroll periods: ' + err.message)
    } finally {
      setLoadingPeriods(false)
    }
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])

  // ── Fetch records whenever selected period changes ─────────────────────────
  const fetchRecords = useCallback(async (period) => {
    if (!period) { setRecords([]); return }
    setLoadingRecords(true)
    try {
      const { data, error } = await supabase
        .from('payroll_records')
        .select(
          'id, employee_id, employee_name, employee_number, department,' +
          'basic_salary, regular_pay, overtime_pay, saturday_pay, public_holiday_pay,' +
          'allowances, paye, nssa, aids_levy, other_deductions, net_pay'
        )
        .eq('period_id', period.id)
        .order('employee_name', { ascending: true })
      if (error) throw error
      const enriched = (data || []).map(r => ({ ...r, gross: computeGross(r) }))
      setRecords(enriched)
    } catch (err) {
      toast.error('Failed to load payroll records: ' + err.message)
    } finally {
      setLoadingRecords(false)
    }
  }, [])

  useEffect(() => { fetchRecords(selectedPeriod) }, [selectedPeriod, fetchRecords])

  // ── Aggregate totals ────────────────────────────────────────────────────────
  const totGross     = records.reduce((a, r) => a + (r.gross       || 0), 0)
  const totPaye      = records.reduce((a, r) => a + (r.paye        || 0), 0)
  const totAids      = records.reduce((a, r) => a + (r.aids_levy   || 0), 0)
  const totNssa      = records.reduce((a, r) => a + (r.nssa        || 0), 0)
  const totRemittance = totPaye + totAids
  const dueDate      = getDueDate(selectedPeriod)

  // ── Export XLSX ─────────────────────────────────────────────────────────────
  const handleExportXLSX = () => {
    if (!records.length) { toast.error('No records to export'); return }
    const rows = records.map((r, i) => ({
      '#':              i + 1,
      'Employee Name':  r.employee_name || '',
      'Emp No':         r.employee_number || '',
      'Department':     r.department || '',
      'Gross Pay':      r.gross,
      'Taxable Income': r.gross,
      'PAYE':           r.paye        || 0,
      'AIDS Levy':      r.aids_levy   || 0,
      'NSSA (Emp 3%)':  r.nssa        || 0,
      'Net Pay':        r.net_pay     || 0,
    }))
    // Totals row
    rows.push({
      '#':              '',
      'Employee Name':  'TOTAL',
      'Emp No':         '',
      'Department':     '',
      'Gross Pay':      totGross,
      'Taxable Income': totGross,
      'PAYE':           totPaye,
      'AIDS Levy':      totAids,
      'NSSA (Emp 3%)':  totNssa,
      'Net Pay':        records.reduce((a, r) => a + (r.net_pay || 0), 0),
    })
    exportXLSX(rows, `ZIMRA_P6_${selectedPeriod?.period_label || 'return'}`, 'P6 PAYE Return')
  }

  // ── Export CSV (ZIMRA efiling format) ─────────────────────────────────────
  const exportCSV = () => {
    if (!records.length) { toast.error('No records to export'); return }
    const header = ['EmployeeName', 'EmployeeNumber', 'TaxPeriod', 'GrossPay', 'PAYE', 'AIDSLevy', 'NSSAEmployee']
    const rows = records.map(r => [
      r.employee_name,
      r.employee_number || '',
      selectedPeriod?.period_label || '',
      r.gross.toFixed(2),
      (r.paye      || 0).toFixed(2),
      (r.aids_levy || 0).toFixed(2),
      (r.nssa      || 0).toFixed(2),
    ])
    const csv = [header, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `ZIMRA_P6_${selectedPeriod?.period_label || 'return'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const hasRecords = records.length > 0
  const noPeriod   = !selectedPeriod && !loadingPeriods

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="ZIMRA P6 PAYE Return"
        subtitle="Monthly PAYE remittance report — due 10th of the following month"
      >
        {hasRecords && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
              <span className="material-icons md-16">download</span> Export XLSX
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
              <span className="material-icons md-16">upload_file</span> Export CSV (ZIMRA format)
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
                {p.period_label} {p.status === 'Closed' ? '(Closed)' : p.status === 'Draft' ? '(Draft)' : ''}
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

      {/* Loading state */}
      {loadingRecords && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading payroll records…" />
        </div>
      )}

      {/* Empty state — no period selected */}
      {!loadingRecords && noPeriod && (
        <EmptyState
          icon="receipt_long"
          message="Select a payroll period to view return data"
        />
      )}

      {/* Empty state — period selected but no records */}
      {!loadingRecords && selectedPeriod && !hasRecords && (
        <EmptyState
          icon="receipt_long"
          message={`No payroll records found for ${selectedPeriod.period_label}`}
        />
      )}

      {/* Main content — only when records exist */}
      {!loadingRecords && hasRecords && (
        <>
          {/* KPI Cards — 5 in responsive grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <KPICard
              label="Employees on Return"
              value={records.length}
              icon="people"
              color="blue"
            />
            <KPICard
              label="Total Gross Pay"
              value={$(totGross)}
              icon="payments"
              color="green"
            />
            <KPICard
              label="Total PAYE"
              value={$(totPaye)}
              icon="account_balance"
              color="yellow"
            />
            <KPICard
              label="Total AIDS Levy"
              value={$(totAids)}
              icon="volunteer_activism"
              color="purple"
            />
            <KPICard
              label="NSSA Payable"
              value={$(totNssa)}
              icon="security"
              color="teal"
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
                marginBottom: 12,
              }}
            >
              Total Remittance Due to ZIMRA
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>PAYE</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {$(totPaye)}
                </span>
              </div>
              <span style={{ fontSize: 20, color: 'var(--text-dim)' }}>+</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>AIDS Levy</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {$(totAids)}
                </span>
              </div>
              <span style={{ fontSize: 20, color: 'var(--text-dim)' }}>=</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>Total</span>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: 'var(--gold)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {$(totRemittance)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 6 }}>
              <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--red)' }}>
                  event
                </span>
                Due Date:{' '}
                <strong style={{ color: 'var(--text)' }}>{dueDate}</strong>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--teal)' }}>
                  security
                </span>
                NSSA (separate remittance):{' '}
                <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{$(totNssa)}</strong>
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
                <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                  <span className="material-icons md-16">upload_file</span> Export CSV (ZIMRA)
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Employee Name</th>
                    <th>Emp No</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'right' }}>Gross Pay</th>
                    <th style={{ textAlign: 'right' }}>Taxable Income</th>
                    <th style={{ textAlign: 'right' }}>PAYE</th>
                    <th style={{ textAlign: 'right' }}>AIDS Levy</th>
                    <th style={{ textAlign: 'right' }}>NSSA (Emp 3%)</th>
                    <th style={{ textAlign: 'right' }}>Net Pay</th>
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
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                        {$(r.gross)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
                        {$(r.paye || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                        {$(r.aids_levy || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                        {$(r.nssa || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {$(r.net_pay || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                    <td colSpan={4} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                      TOTALS
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(totGross)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {$(totGross)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>
                      {$(totPaye)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                      {$(totAids)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                      {$(totNssa)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {$(records.reduce((a, r) => a + (r.net_pay || 0), 0))}
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
