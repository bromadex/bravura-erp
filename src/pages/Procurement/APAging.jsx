// src/pages/Procurement/APAging.jsx
// AP Aging Report — accounts payable aging for unpaid supplier invoices.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKETS = ['Current', '31–60', '61–90', '91–120', '> 120']

const BUCKET_COLORS = {
  'Current': 'var(--green)',
  '31–60':   'var(--yellow)',
  '61–90':   'var(--gold)',
  '91–120':  'var(--red)',
  '> 120':   'var(--red)',
}

const BUCKET_BORDER = {
  'Current': 'transparent',
  '31–60':   'var(--yellow)',
  '61–90':   'var(--gold)',
  '91–120':  'var(--red)',
  '> 120':   'var(--red)',
}

const CURRENCIES = ['All', 'USD', 'ZAR', 'BWP', 'ZiG']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBucket(ageDays) {
  if (ageDays <= 30)  return 'Current'
  if (ageDays <= 60)  return '31–60'
  if (ageDays <= 90)  return '61–90'
  if (ageDays <= 120) return '91–120'
  return '> 120'
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// ── Bucket Badge ──────────────────────────────────────────────────────────────

function BucketBadge({ bucket }) {
  return (
    <span style={{
      display:       'inline-block',
      padding:       '2px 8px',
      borderRadius:  4,
      fontSize:      11,
      fontWeight:    700,
      letterSpacing: '0.05em',
      background:    BUCKET_COLORS[bucket],
      color:         bucket === 'Current' ? 'var(--surface)' : 'var(--surface)',
      fontFamily:    'var(--mono)',
      whiteSpace:    'nowrap',
      opacity:       bucket === '91–120' ? 0.85 : 1,
    }}>
      {bucket}
    </span>
  )
}

// ── Label / input helpers ─────────────────────────────────────────────────────

const labelStyle = {
  display:       'flex',
  flexDirection: 'column',
  gap:           4,
  fontSize:      12,
  color:         'var(--text-dim)',
  fontWeight:    600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const inputStyle = {
  padding:      '6px 10px',
  borderRadius: 6,
  border:       '1px solid var(--border)',
  background:   'var(--surface2)',
  color:        'var(--text)',
  fontSize:     13,
  outline:      'none',
  minWidth:     160,
}

const selectStyle = {
  ...inputStyle,
  minWidth: 140,
  cursor:   'pointer',
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function APAging() {
  const [invoices,       setInvoices]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [currencyFilter, setCurrencyFilter] = useState('All')
  const [asAtDate,       setAsAtDate]       = useState(new Date().toISOString().split('T')[0])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchInvoices() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('id, invoice_no, invoice_date, due_date, total_amount, paid_amount, status, currency, supplier_id, suppliers(name)')
        .neq('status', 'Paid')
        .neq('status', 'Cancelled')
        .order('invoice_date', { ascending: true })
      if (error) throw error
      setInvoices(data || [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load AP data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInvoices() }, [])

  // ── Computed rows ──────────────────────────────────────────────────────────

  const today = useMemo(() => new Date(asAtDate + 'T00:00:00'), [asAtDate])

  const rows = useMemo(() => {
    return invoices.map(inv => {
      const outstanding = (inv.total_amount || 0) - (inv.paid_amount || 0)
      const ageingDays  = Math.floor((today - new Date(inv.invoice_date)) / 86400000)
      const bucket      = getBucket(ageingDays)
      const supplierName = inv.suppliers?.name || inv.supplier_id || '—'
      return { ...inv, outstanding, ageingDays, bucket, supplierName }
    })
  }, [invoices, today])

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = rows
    if (supplierSearch.trim()) {
      const q = supplierSearch.trim().toLowerCase()
      r = r.filter(inv => inv.supplierName.toLowerCase().includes(q))
    }
    if (currencyFilter !== 'All') {
      r = r.filter(inv => inv.currency === currencyFilter)
    }
    return r
  }, [rows, supplierSearch, currencyFilter])

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalOutstanding = filtered.reduce((s, r) => s + r.outstanding, 0)
    const totalInvoices    = filtered.length
    const overdue          = filtered.filter(r => r.bucket !== 'Current')
    const critical         = filtered.filter(r => r.bucket === '91–120' || r.bucket === '> 120')
    const overdueAmount    = overdue.reduce((s, r) => s + r.outstanding, 0)
    const criticalAmount   = critical.reduce((s, r) => s + r.outstanding, 0)
    const oldest           = filtered.length ? Math.max(...filtered.map(r => r.ageingDays)) : 0
    return { totalOutstanding, totalInvoices, overdue: overdue.length, overdueAmount, critical: critical.length, criticalAmount, oldest }
  }, [filtered])

  // ── Bucket summary ─────────────────────────────────────────────────────────

  const bucketStats = useMemo(() => {
    const totalOutstanding = filtered.reduce((s, r) => s + r.outstanding, 0) || 1
    return BUCKETS.map(b => {
      const bRows  = filtered.filter(r => r.bucket === b)
      const amount = bRows.reduce((s, r) => s + r.outstanding, 0)
      const pct    = totalOutstanding > 1 ? (amount / totalOutstanding) * 100 : 0
      return { bucket: b, count: bRows.length, amount, pct }
    })
  }, [filtered])

  // ── Table rows sorted by ageing desc ──────────────────────────────────────

  const tableRows = useMemo(
    () => [...filtered].sort((a, b) => b.ageingDays - a.ageingDays),
    [filtered]
  )

  // ── Export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    if (!tableRows.length) { toast.error('No data to export'); return }
    exportXLSX(
      tableRows.map(r => ({
        Supplier:      r.supplierName,
        'Invoice No':  r.invoice_no || r.id,
        'Invoice Date': r.invoice_date || '',
        'Due Date':    r.due_date || '',
        Currency:      r.currency || '',
        Total:         r.total_amount || 0,
        Paid:          r.paid_amount  || 0,
        Outstanding:   r.outstanding,
        'Age (days)':  r.ageingDays,
        Bucket:        r.bucket,
        Status:        r.status || '',
      })),
      `APAging_${dateTag()}`,
      'AP Aging'
    )
    toast.success('Exported')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Page Header */}
      <PageHeader
        title="AP Aging Report"
        subtitle="Outstanding supplier invoice balances by age — as at today"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons md-16">download</span>
          Export XLSX
        </button>
        <button className="btn btn-secondary" onClick={fetchInvoices}>
          <span className="material-icons md-16">refresh</span>
          Refresh
        </button>
      </PageHeader>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={labelStyle}>
          Supplier
          <input
            type="text"
            placeholder="Search supplier…"
            style={inputStyle}
            value={supplierSearch}
            onChange={e => setSupplierSearch(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Currency
          <select
            style={selectStyle}
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          As at
          <input
            type="date"
            style={inputStyle}
            value={asAtDate}
            onChange={e => setAsAtDate(e.target.value)}
          />
        </label>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPICard
          label="Total Outstanding"
          value={`$ ${fmtNum(kpis.totalOutstanding)}`}
          icon="account_balance_wallet"
          color="red"
        />
        <KPICard
          label="Total Invoices"
          value={kpis.totalInvoices}
          icon="receipt"
        />
        <KPICard
          label="Overdue (>30 days)"
          value={kpis.overdue}
          sub={`$ ${fmtNum(kpis.overdueAmount)}`}
          icon="schedule"
          color={kpis.overdue > 0 ? 'yellow' : ''}
        />
        <KPICard
          label="Critical (>90 days)"
          value={kpis.critical}
          sub={`$ ${fmtNum(kpis.criticalAmount)}`}
          icon="warning"
          color={kpis.critical > 0 ? 'red' : ''}
        />
        <KPICard
          label="Oldest Invoice"
          value={`${kpis.oldest} days`}
          icon="history"
          color={kpis.oldest > 90 ? 'red' : kpis.oldest > 30 ? 'yellow' : ''}
        />
      </div>

      {/* Aging summary bar */}
      {filtered.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Aging Distribution
          </div>

          {/* Stacked bar */}
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 28, marginBottom: 12 }}>
            {bucketStats.map(bs => bs.pct > 0 && (
              <div
                key={bs.bucket}
                title={`${bs.bucket}: ${bs.pct.toFixed(1)}%`}
                style={{
                  width:      `${bs.pct}%`,
                  background: BUCKET_COLORS[bs.bucket],
                  opacity:    bs.bucket === '91–120' ? 0.75 : 1,
                  transition: 'width 0.3s',
                }}
              />
            ))}
          </div>

          {/* Bucket totals row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {bucketStats.map(bs => (
              <div key={bs.bucket} style={{
                background:   'var(--surface2)',
                border:       `1px solid var(--border)`,
                borderTop:    `3px solid ${BUCKET_COLORS[bs.bucket]}`,
                borderRadius: 6,
                padding:      '8px 10px',
                fontSize:     12,
              }}>
                <div style={{ fontWeight: 700, color: BUCKET_COLORS[bs.bucket], marginBottom: 4, fontSize: 11 }}>{bs.bucket}</div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)' }}>{bs.count} inv</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>$ {fmtNum(bs.amount)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{bs.pct.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {tableRows.length === 0 ? (
          <div style={{ padding: '40px 20px' }}>
            <EmptyState icon="receipt_long" message="No unpaid invoices found — either all invoices are paid or no data matches your filters." />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                  {['Supplier', 'Invoice No', 'Invoice Date', 'Due Date', 'Currency', 'Total', 'Paid', 'Outstanding', 'Age (days)', 'Bucket'].map(h => (
                    <th key={h} style={{
                      padding:       '10px 14px',
                      fontWeight:    700,
                      fontSize:      11,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color:         'var(--text-dim)',
                      borderBottom:  '1px solid var(--border)',
                      whiteSpace:    'nowrap',
                      textAlign:     ['Total', 'Paid', 'Outstanding', 'Age (days)'].includes(h) ? 'right' : 'left',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  const borderColor = BUCKET_BORDER[row.bucket]
                  const opacity     = row.bucket === '> 120' ? 0.9 : 1
                  return (
                    <tr
                      key={row.id || i}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        borderLeft:   `3px solid ${borderColor}`,
                        opacity,
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '9px 14px', color: 'var(--text)', fontWeight: 500 }}>
                        {row.supplierName}
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.invoice_no || row.id}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(row.invoice_date)}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fmtDate(row.due_date)}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12 }}>
                        {row.currency || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>
                        {fmtNum(row.total_amount)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', whiteSpace: 'nowrap' }}>
                        {row.paid_amount ? fmtNum(row.paid_amount) : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {fmtNum(row.outstanding)}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: BUCKET_COLORS[row.bucket], whiteSpace: 'nowrap' }}>
                        {row.ageingDays}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <BucketBadge bucket={row.bucket} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border2)' }}>
                  <td colSpan={7} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    TOTAL OUTSTANDING ({tableRows.length} invoices)
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                    {fmtNum(filtered.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
