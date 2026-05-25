// src/pages/Procurement/IMTTTracker.jsx
// IMTT (Intermediated Money Transfer Tax) Tracker
// Zimbabwe: 2% on all bank/electronic transfers — charged by bank at source
// Track IMTT liability for compliance and cost accounting

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, Spinner } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ─── Constants ─────────────────────────────────────────────────────────────────

const IMTT_METHODS = ['Bank Transfer', 'RTGS', 'EFT', 'Mobile Money', 'POS', 'Online Transfer']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad2 = (n) => String(n).padStart(2, '0')

const $ = (n) => `$ ${fmtNum(n)}`

const getMonthRange = (year, month0) => {
  const from = `${year}-${pad2(month0 + 1)}-01`
  const last = new Date(year, month0 + 1, 0).getDate()
  const to   = `${year}-${pad2(month0 + 1)}-${pad2(last)}`
  return { from, to }
}

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Payment method badge colours
const methodBadgeColor = (method) => {
  if (!method) return 'var(--text-dim)'
  const m = method.toLowerCase()
  if (m.includes('rtgs'))        return 'var(--teal)'
  if (m.includes('bank'))        return 'var(--blue)'
  if (m.includes('eft'))         return 'var(--purple)'
  if (m.includes('mobile'))      return 'var(--green)'
  if (m.includes('pos'))         return 'var(--yellow)'
  if (m.includes('online'))      return 'var(--gold)'
  return 'var(--text-dim)'
}

const methodBadgeBg = (method) => {
  if (!method) return 'color-mix(in srgb, var(--text-dim) 10%, transparent)'
  const m = method.toLowerCase()
  if (m.includes('rtgs'))        return 'color-mix(in srgb, var(--teal) 12%, transparent)'
  if (m.includes('bank'))        return 'color-mix(in srgb, var(--blue) 12%, transparent)'
  if (m.includes('eft'))         return 'color-mix(in srgb, var(--purple) 12%, transparent)'
  if (m.includes('mobile'))      return 'color-mix(in srgb, var(--green) 12%, transparent)'
  if (m.includes('pos'))         return 'color-mix(in srgb, var(--yellow) 12%, transparent)'
  if (m.includes('online'))      return 'color-mix(in srgb, var(--gold) 12%, transparent)'
  return 'color-mix(in srgb, var(--text-dim) 10%, transparent)'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IMTTTracker() {
  const today   = new Date()
  const [year,   setYear]   = useState(today.getFullYear())
  const [month0, setMonth0] = useState(today.getMonth())

  const [allPVs,   setAllPVs]   = useState([])
  const [loading,  setLoading]  = useState(false)

  const { from: dateFrom, to: dateTo } = getMonthRange(year, month0)
  const periodLabel = `${MONTHS[month0]} ${year}`

  // ── Fetch payment vouchers ─────────────────────────────────────────────────
  const fetchVouchers = useCallback(async (dFrom, dTo) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select(
          'id, pv_number, supplier_name, payment_date, total_amount,' +
          'payment_method, imtt_applicable, imtt_amount, status, currency'
        )
        .gte('payment_date', dFrom)
        .lte('payment_date', dTo)
        .not('status', 'eq', 'Cancelled')
        .order('payment_date', { ascending: false })
      if (error) throw error
      setAllPVs(data || [])
    } catch (err) {
      toast.error('Failed to load payment vouchers: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVouchers(dateFrom, dateTo)
  }, [dateFrom, dateTo, fetchVouchers])

  // ── Computed rows ──────────────────────────────────────────────────────────
  const imttRows = useMemo(() => (
    allPVs
      .filter(pv => IMTT_METHODS.includes(pv.payment_method))
      .map(pv => ({
        ...pv,
        computedIMTT: pv.imtt_applicable
          ? (pv.imtt_amount || 0)
          : (pv.total_amount || 0) * 0.02,
        source: pv.imtt_applicable ? 'recorded' : 'computed',
      }))
  ), [allPVs])

  const nonElectronicCount = useMemo(
    () => allPVs.filter(pv => !IMTT_METHODS.includes(pv.payment_method)).length,
    [allPVs]
  )

  // ── KPI aggregates ─────────────────────────────────────────────────────────
  const electronicCount  = imttRows.length
  const totalTransferVal = useMemo(() => imttRows.reduce((a, r) => a + (r.total_amount || 0), 0), [imttRows])
  const estimatedIMTT    = useMemo(() => imttRows.reduce((a, r) => a + r.computedIMTT, 0), [imttRows])

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!imttRows.length) { toast.error('No electronic transfer records to export'); return }
    const rows = imttRows.map(r => ({
      'Date':            r.payment_date    || '',
      'PV Number':       r.pv_number       || '',
      'Supplier':        r.supplier_name   || '',
      'Payment Method':  r.payment_method  || '',
      'Currency':        r.currency        || 'USD',
      'Transfer Amount': r.total_amount    || 0,
      'IMTT (2%)':       r.computedIMTT,
      'Source':          r.source === 'recorded' ? 'Recorded' : 'Computed',
      'Status':          r.status          || '',
    }))
    rows.push({
      'Date':            '',
      'PV Number':       '',
      'Supplier':        'TOTAL',
      'Payment Method':  '',
      'Currency':        '',
      'Transfer Amount': totalTransferVal,
      'IMTT (2%)':       estimatedIMTT,
      'Source':          '',
      'Status':          '',
    })
    exportXLSX(rows, `IMTT_Tracker_${year}_${pad2(month0 + 1)}`, 'IMTT Tracker')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="IMTT Tracker"
        subtitle="Intermediated Money Transfer Tax — 2% on electronic transfers (withheld at source by bank)"
      >
        {imttRows.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <span className="material-icons md-16">download</span> Export XLSX
          </button>
        )}
      </PageHeader>

      {/* Period Selector */}
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
          onClick={() => fetchVouchers(dateFrom, dateTo)}
          disabled={loading}
        >
          <span className="material-icons md-16">refresh</span> Load
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {dateFrom} → {dateTo}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading payment vouchers…" />
        </div>
      )}

      {/* Content */}
      {!loading && (
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
              label="Electronic Transfers"
              value={electronicCount}
              icon="swap_horiz"
              color="blue"
            />
            <KPICard
              label="Total Transfer Value"
              value={$(totalTransferVal)}
              icon="account_balance_wallet"
              color="green"
            />
            <KPICard
              label="Estimated IMTT @ 2%"
              value={$(estimatedIMTT)}
              icon="percent"
              color="gold"
            />
            <KPICard
              label="Non-Electronic Payments"
              value={nonElectronicCount}
              icon="money_off"
              color="default"
            />
          </div>

          {/* IMTT Summary Box */}
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
              IMTT TRACKER — {periodLabel}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 14,
                lineHeight: '2',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 520, paddingBottom: 4, marginBottom: 4, borderBottom: '1px dashed var(--border2)' }}>
                <span style={{ color: 'var(--text-dim)' }}>Applicable Rate:</span>
                <span style={{ color: 'var(--text-mid)' }}>2% on all electronic transfers</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 520 }}>
                <span style={{ color: 'var(--text-dim)' }}>Transfer Value (Electronic):</span>
                <span>{$(totalTransferVal)}</span>
              </div>
              <div
                style={{
                  borderTop: '1px solid var(--border2)',
                  marginTop: 4,
                  paddingTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  maxWidth: 520,
                }}
              >
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>IMTT @ 2%:</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 16 }}>
                  {$(estimatedIMTT)}
                </span>
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                background: 'color-mix(in srgb, var(--blue) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--blue) 20%, transparent)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-mid)',
              }}
            >
              <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--blue)' }}>
                info
              </span>
              IMTT is withheld at source by your bank. Track this report to reconcile your bank charges.
            </div>
          </div>

          {/* IMTT Applicable Methods Info */}
          <div
            style={{
              marginBottom: 20,
              padding: '10px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 4 }}>
              IMTT-applicable methods:
            </span>
            {IMTT_METHODS.map(m => (
              <span
                key={m}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: methodBadgeBg(m),
                  color: methodBadgeColor(m),
                }}
              >
                {m}
              </span>
            ))}
          </div>

          {/* Detail Table */}
          {imttRows.length === 0 ? (
            <EmptyState
              icon="account_balance_wallet"
              message={`No electronic transfer payments found for ${periodLabel}. IMTT applies to Bank Transfer, RTGS, EFT, Mobile Money, POS, and Online Transfer payments.`}
            />
          ) : (
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
                  Electronic Transfer Detail — {periodLabel}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {electronicCount} transfers · Estimated IMTT: {$(estimatedIMTT)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>PV Number</th>
                      <th>Supplier</th>
                      <th>Payment Method</th>
                      <th style={{ textAlign: 'right' }}>Transfer Amount</th>
                      <th style={{ textAlign: 'right' }}>IMTT (2%)</th>
                      <th style={{ textAlign: 'center' }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imttRows.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                          {fmtDateShort(r.payment_date)}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                          {r.pv_number || '—'}
                        </td>
                        <td style={{ fontWeight: 500 }}>{r.supplier_name || '—'}</td>
                        <td>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: methodBadgeBg(r.payment_method),
                              color: methodBadgeColor(r.payment_method),
                            }}
                          >
                            {r.payment_method || '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(r.total_amount || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                          {$(r.computedIMTT)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: r.source === 'recorded'
                                ? 'color-mix(in srgb, var(--green) 12%, transparent)'
                                : 'color-mix(in srgb, var(--yellow) 12%, transparent)',
                              color: r.source === 'recorded' ? 'var(--green)' : 'var(--yellow)',
                            }}
                          >
                            {r.source === 'recorded' ? 'Recorded' : 'Computed'}
                          </span>
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
                        {$(totalTransferVal)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                        {$(estimatedIMTT)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
