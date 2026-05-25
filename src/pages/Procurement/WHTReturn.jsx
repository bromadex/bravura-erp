// src/pages/Procurement/WHTReturn.jsx
// WHT Monthly Return — Withholding Tax deducted from supplier payments
// Services (professional/management): 10% WHT
// Contractors/sub-contractors: 15% WHT
// Due: 10th of the following month — Zimbabwe ITA Chapter 23:06, 3rd Schedule

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, Spinner, StatusBadge } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (n) => `$ ${fmtNum(n)}`

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad2 = (n) => String(n).padStart(2, '0')

const getMonthRange = (year, month0) => {
  const from = `${year}-${pad2(month0 + 1)}-01`
  const last = new Date(year, month0 + 1, 0).getDate()
  const to   = `${year}-${pad2(month0 + 1)}-${pad2(last)}`
  return { from, to }
}

const getDueDate = (year, month0) => {
  const next = new Date(year, month0 + 1, 10)
  return next.toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' })
}

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const statusColor = (s) => {
  if (s === 'Posted')    return 'green'
  if (s === 'Draft')     return 'yellow'
  if (s === 'Cancelled') return 'red'
  return 'default'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WHTReturn() {
  const today    = new Date()
  const [year,   setYear]   = useState(today.getFullYear())
  const [month0, setMonth0] = useState(today.getMonth())

  const [vouchers,       setVouchers]       = useState([])
  const [loadingVouchers, setLoadingVouchers] = useState(false)

  const { from: dateFrom, to: dateTo } = getMonthRange(year, month0)

  // ── Fetch vouchers ─────────────────────────────────────────────────────────
  const fetchVouchers = useCallback(async (dFrom, dTo) => {
    setLoadingVouchers(true)
    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select(
          'id, pv_number, payment_date, supplier_name, supplier_id, currency,' +
          'gross_amount, wht_type, wht_rate, wht_amount, net_payment, status,' +
          'suppliers(name)'
        )
        .eq('wht_applicable', true)
        .gte('payment_date', dFrom)
        .lte('payment_date', dTo)
        .neq('status', 'Cancelled')
        .order('payment_date', { ascending: true })
      if (error) throw error
      setVouchers(data || [])
    } catch (err) {
      toast.error('Failed to load WHT transactions: ' + err.message)
    } finally {
      setLoadingVouchers(false)
    }
  }, [])

  useEffect(() => {
    fetchVouchers(dateFrom, dateTo)
  }, [dateFrom, dateTo, fetchVouchers])

  const handleRefresh = () => fetchVouchers(dateFrom, dateTo)

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totCount      = vouchers.length
  const totGross      = vouchers.reduce((a, v) => a + (v.gross_amount  || 0), 0)
  const totWHT        = vouchers.reduce((a, v) => a + (v.wht_amount    || 0), 0)
  const totNet        = vouchers.reduce((a, v) => a + (v.net_payment   || 0), 0)

  const services    = vouchers.filter(v => (v.wht_type || '').toLowerCase().includes('service') || v.wht_rate === 0.10 || v.wht_rate === 10)
  const contractors = vouchers.filter(v => (v.wht_type || '').toLowerCase().includes('contractor') || v.wht_rate === 0.15 || v.wht_rate === 15)

  const svcGross  = services.reduce((a, v)    => a + (v.gross_amount || 0), 0)
  const svcWHT    = services.reduce((a, v)    => a + (v.wht_amount   || 0), 0)
  const conGross  = contractors.reduce((a, v) => a + (v.gross_amount || 0), 0)
  const conWHT    = contractors.reduce((a, v) => a + (v.wht_amount   || 0), 0)

  const dueDate   = getDueDate(year, month0)

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExportXLSX = () => {
    if (!vouchers.length) { toast.error('No records to export'); return }
    const rows = vouchers.map(v => ({
      'PV Number':      v.pv_number    || '',
      'Payment Date':   v.payment_date || '',
      'Supplier':       v.supplier_name || v.suppliers?.name || '',
      'WHT Type':       v.wht_type     || '',
      'Currency':       v.currency     || 'USD',
      'Gross Amount':   v.gross_amount || 0,
      'WHT Rate':       v.wht_rate     || 0,
      'WHT Amount':     v.wht_amount   || 0,
      'Net Payment':    v.net_payment  || 0,
      'Status':         v.status       || '',
    }))
    rows.push({
      'PV Number':      '',
      'Payment Date':   '',
      'Supplier':       'TOTAL',
      'WHT Type':       '',
      'Currency':       '',
      'Gross Amount':   totGross,
      'WHT Rate':       '',
      'WHT Amount':     totWHT,
      'Net Payment':    totNet,
      'Status':         '',
    })
    exportXLSX(rows, `WHT_Return_${year}_${pad2(month0 + 1)}`, 'WHT Return')
  }

  // ── Export CSV (ZIMRA format) ──────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!vouchers.length) { toast.error('No records to export'); return }
    const header = [
      'PaymentDate', 'SupplierName', 'GrossAmount',
      'WHTType', 'WHTRate', 'WHTAmount', 'NetPaid', 'PVNumber',
    ]
    const rows = vouchers.map(v => [
      v.payment_date || '',
      v.supplier_name || v.suppliers?.name || '',
      (v.gross_amount || 0).toFixed(2),
      v.wht_type || '',
      (v.wht_rate || 0),
      (v.wht_amount || 0).toFixed(2),
      (v.net_payment || 0).toFixed(2),
      v.pv_number || '',
    ])
    const csv  = [header, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `WHT_Return_${year}_${pad2(month0 + 1)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasVouchers = vouchers.length > 0

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="WHT Monthly Return"
        subtitle="Withholding Tax deducted from supplier payments — due 10th of following month (ITA Ch 23:06)"
      >
        {hasVouchers && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
              <span className="material-icons md-16">download</span> Export XLSX
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              <span className="material-icons md-16">upload_file</span> Export CSV (ZIMRA)
            </button>
          </>
        )}
      </PageHeader>

      {/* Date Range Controls */}
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
          Period
        </label>
        <select
          className="form-control"
          style={{ minWidth: 140 }}
          value={month0}
          onChange={e => setMonth0(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          className="form-control"
          style={{ width: 90 }}
          value={year}
          min={2020}
          max={2040}
          onChange={e => setYear(Number(e.target.value))}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={loadingVouchers}
        >
          <span className="material-icons md-16">refresh</span> Refresh
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {dateFrom} → {dateTo}
          {' · '}
          <span style={{ color: 'var(--text-mid)' }}>Due: {dueDate}</span>
        </span>
      </div>

      {/* Loading */}
      {loadingVouchers && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading WHT transactions…" />
        </div>
      )}

      {/* Empty state */}
      {!loadingVouchers && !hasVouchers && (
        <EmptyState
          icon="receipt_long"
          message="No WHT-applicable payments in this period. Payments are marked as WHT-applicable when creating payment vouchers."
        />
      )}

      {/* Main content */}
      {!loadingVouchers && hasVouchers && (
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
              label="WHT Transactions"
              value={totCount}
              icon="receipt"
              color="blue"
            />
            <KPICard
              label="Total Gross Payments"
              value={$(totGross)}
              icon="payments"
              color="green"
            />
            <KPICard
              label="Total WHT Deducted"
              value={$(totWHT)}
              icon="account_balance"
              color="gold"
            />
            <KPICard
              label="Net Paid to Suppliers"
              value={$(totNet)}
              icon="send"
              color="teal"
            />
          </div>

          {/* WHT Breakdown */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {/* Services 10% */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '16px 20px',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--teal)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="material-icons md-14">work</span>
                Services — 10% WHT
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Transactions</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{services.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Gross Amount</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{$(svcGross)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 8,
                  marginTop: 4,
                }}
              >
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>WHT Amount</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>{$(svcWHT)}</span>
              </div>
            </div>

            {/* Contractors 15% */}
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '16px 20px',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--purple)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="material-icons md-14">construction</span>
                Contractors — 15% WHT
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Transactions</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{contractors.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Gross Amount</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{$(conGross)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 8,
                  marginTop: 4,
                }}
              >
                <span style={{ color: 'var(--purple)', fontWeight: 600 }}>WHT Amount</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 700 }}>{$(conWHT)}</span>
              </div>
            </div>
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
              Total WHT Remittance Due — {MONTHS[month0]} {year}
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
                <span style={{ color: 'var(--text-dim)' }}>Services WHT (10%):</span>
                <span>{$(svcWHT)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 480 }}>
                <span style={{ color: 'var(--text-dim)' }}>Contractors WHT (15%):</span>
                <span>{$(conWHT)}</span>
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
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>TOTAL PAYABLE TO ZIMRA (WHT):</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 16 }}>{$(totWHT)}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 14 }}>
              <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--red)' }}>
                event
              </span>
              Due Date:{' '}
              <strong style={{ color: 'var(--text)' }}>{dueDate}</strong>
              {' · '}
              <span style={{ color: 'var(--text-dim)' }}>Form WHT001</span>
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
                WHT Transaction Detail — {MONTHS[month0]} {year}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleExportXLSX}>
                  <span className="material-icons md-16">download</span> Export XLSX
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
                  <span className="material-icons md-16">upload_file</span> Export CSV (ZIMRA)
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>PV No</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>WHT Type</th>
                    <th style={{ textAlign: 'right' }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>WHT Amount</th>
                    <th style={{ textAlign: 'right' }}>Net Payment</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                        {v.pv_number || '—'}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                        {fmtDateShort(v.payment_date)}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {v.supplier_name || v.suppliers?.name || '—'}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: (v.wht_rate === 0.15 || v.wht_rate === 15)
                              ? 'var(--purple)'
                              : 'var(--teal)',
                            background: (v.wht_rate === 0.15 || v.wht_rate === 15)
                              ? 'color-mix(in srgb, var(--purple) 12%, transparent)'
                              : 'color-mix(in srgb, var(--teal) 12%, transparent)',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          {v.wht_type || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {$(v.gross_amount || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                        {v.wht_rate != null
                          ? `${v.wht_rate <= 1 ? (v.wht_rate * 100).toFixed(0) : v.wht_rate}%`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                        {$(v.wht_amount || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {$(v.net_payment || 0)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge status={v.status} color={statusColor(v.status)} />
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
                    <td />
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                      {$(totWHT)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(totNet)}</td>
                    <td />
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
