// src/pages/Procurement/VATReturn.jsx
// ZIMRA Monthly VAT 7 Return
// Zimbabwe VAT: 15% standard rate, file by 25th of following month.
// Input VAT  = VAT paid on purchases (purchase_invoices.tax_amount)
// Output VAT = manually entered (no sales module) stored in vat_return_periods
// Net VAT Payable = Output VAT − Input VAT

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, Spinner, StatusBadge } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

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
  // Due 25th of following month
  const nextMonth = month0 === 11 ? 0 : month0 + 1
  const nextYear  = month0 === 11 ? year + 1 : year
  return `25 ${MONTHS[nextMonth]} ${nextYear}`
}

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const piStatusColor = (s) => {
  if (s === 'Posted')    return 'green'
  if (s === 'Paid')      return 'teal'
  if (s === 'Draft')     return 'yellow'
  if (s === 'Cancelled') return 'red'
  return 'default'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VATReturn() {
  const today   = new Date()
  const [year,   setYear]   = useState(today.getFullYear())
  const [month0, setMonth0] = useState(today.getMonth())

  // Data
  const [invoices,        setInvoices]        = useState([])
  const [savedPeriod,     setSavedPeriod]     = useState(null)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [saving,          setSaving]          = useState(false)

  // Editable output VAT fields
  const [outputVATManual, setOutputVATManual] = useState('')
  const [outputVATNotes,  setOutputVATNotes]  = useState('')

  const { from: dateFrom, to: dateTo } = getMonthRange(year, month0)
  const periodLabel = `${MONTHS[month0]} ${year}`
  const dueDate     = getDueDate(year, month0)

  // ── Fetch saved period ─────────────────────────────────────────────────────
  const fetchSavedPeriod = useCallback(async (label) => {
    try {
      const { data, error } = await supabase
        .from('vat_return_periods')
        .select('*')
        .eq('period_label', label)
        .maybeSingle()
      if (error) throw error
      setSavedPeriod(data || null)
      setOutputVATManual(data ? String(data.output_vat_manual ?? '') : '')
      setOutputVATNotes(data ? (data.output_vat_notes || '') : '')
    } catch (err) {
      toast.error('Failed to load saved period: ' + err.message)
    }
  }, [])

  // ── Fetch purchase invoices ────────────────────────────────────────────────
  const fetchInvoices = useCallback(async (dFrom, dTo) => {
    setLoadingInvoices(true)
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('id, pi_number, supplier_name, invoice_date, subtotal, tax_amount, total_amount, status')
        .gte('invoice_date', dFrom)
        .lte('invoice_date', dTo)
        .not('status', 'eq', 'Cancelled')
        .order('invoice_date')
      if (error) throw error
      setInvoices(data || [])
    } catch (err) {
      toast.error('Failed to load purchase invoices: ' + err.message)
    } finally {
      setLoadingInvoices(false)
    }
  }, [])

  // Load both when period changes
  useEffect(() => {
    fetchSavedPeriod(periodLabel)
    fetchInvoices(dateFrom, dateTo)
  }, [periodLabel, dateFrom, dateTo, fetchSavedPeriod, fetchInvoices])

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totalPurchases = useMemo(
    () => invoices.reduce((a, r) => a + (r.total_amount || 0), 0),
    [invoices]
  )
  const inputVAT = useMemo(
    () => invoices.reduce((a, r) => a + (r.tax_amount || 0), 0),
    [invoices]
  )
  const outputVAT  = parseFloat(outputVATManual) || 0
  const netVATDue  = outputVAT - inputVAT

  // ── Save period ────────────────────────────────────────────────────────────
  const handleSavePeriod = async () => {
    setSaving(true)
    try {
      const payload = {
        period_label:      periodLabel,
        from_date:         dateFrom,
        to_date:           dateTo,
        output_vat_manual: parseFloat(outputVATManual) || 0,
        output_vat_notes:  outputVATNotes || null,
        updated_at:        new Date().toISOString(),
      }
      const { data, error } = await supabase
        .from('vat_return_periods')
        .upsert(payload, { onConflict: 'period_label' })
        .select()
        .single()
      if (error) throw error
      setSavedPeriod(data)
      toast.success('VAT period saved')
    } catch (err) {
      toast.error('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Submit period ──────────────────────────────────────────────────────────
  const handleSubmitPeriod = async () => {
    if (!savedPeriod) {
      toast.error('Save the period first before marking as Submitted')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('vat_return_periods')
        .update({ status: 'Submitted', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', savedPeriod.id)
        .select()
        .single()
      if (error) throw error
      setSavedPeriod(data)
      toast.success('Period marked as Submitted')
    } catch (err) {
      toast.error('Failed to update status: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!invoices.length && outputVAT === 0) {
      toast.error('No data to export')
      return
    }
    const summaryRows = [
      { 'Field': 'Period',           'Value': periodLabel },
      { 'Field': 'From Date',        'Value': dateFrom },
      { 'Field': 'To Date',          'Value': dateTo },
      { 'Field': 'Due Date',         'Value': `25 ${dueDate}` },
      { 'Field': 'Output VAT (15%)', 'Value': outputVAT },
      { 'Field': 'Input VAT',        'Value': inputVAT },
      { 'Field': 'Net VAT Payable',  'Value': netVATDue },
      { 'Field': 'Total Purchases',  'Value': totalPurchases },
      { 'Field': 'Status',           'Value': savedPeriod?.status || 'Unsaved' },
    ]
    const detailRows = invoices.map(r => ({
      'Invoice Date': r.invoice_date || '',
      'PI Number':    r.pi_number   || '',
      'Supplier':     r.supplier_name || '',
      'Subtotal':     r.subtotal    || 0,
      'Tax Amount':   r.tax_amount  || 0,
      'Total Amount': r.total_amount || 0,
      'Status':       r.status      || '',
    }))
    exportXLSX(
      summaryRows,
      `VAT7_Return_${year}_${pad2(month0 + 1)}`,
      'VAT7 Summary',
      [{ name: 'Purchase Invoices', rows: detailRows }]
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const periodSaved      = !!savedPeriod
  const periodStatus     = savedPeriod?.status || 'Draft'
  const periodStatusColor =
    periodStatus === 'Submitted' ? 'green' :
    periodStatus === 'Assessed'  ? 'teal'  : 'yellow'

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        title="VAT 7 Monthly Return"
        subtitle="Zimbabwe VAT 15% — File by 25th of following month (VAT Act Chapter 23:12)"
      >
        {invoices.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <span className="material-icons md-16">download</span> Export XLSX
          </button>
        )}
        {periodSaved && periodStatus === 'Draft' && (
          <button className="btn btn-primary btn-sm" onClick={handleSubmitPeriod} disabled={saving}>
            <span className="material-icons md-16">check_circle</span> Mark Submitted
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
        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {dateFrom} → {dateTo}
          {' · '}
          <span style={{ color: 'var(--text-mid)' }}>Due: {dueDate}</span>
          {periodSaved && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: `color-mix(in srgb, var(--${periodStatusColor}) 15%, transparent)`,
                color: `var(--${periodStatusColor})`,
              }}
            >
              {periodStatus}
            </span>
          )}
        </span>
      </div>

      {/* Loading */}
      {loadingInvoices && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading purchase invoices…" />
        </div>
      )}

      {/* Content */}
      {!loadingInvoices && (
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
              label="Total Purchases"
              value={$(totalPurchases)}
              icon="shopping_cart"
              color="blue"
            />
            <KPICard
              label="Input VAT"
              value={$(inputVAT)}
              icon="receipt_long"
              color="teal"
            />
            <KPICard
              label="Output VAT"
              value={$(outputVAT)}
              icon="point_of_sale"
              color="purple"
            />
            <KPICard
              label={netVATDue >= 0 ? 'Net VAT Payable' : 'VAT Refund Due'}
              value={$(Math.abs(netVATDue))}
              icon={netVATDue >= 0 ? 'arrow_upward' : 'arrow_downward'}
              color="gold"
            />
          </div>

          {/* VAT Computation Box */}
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
              VAT 7 RETURN — {periodLabel}
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
                <span style={{ color: 'var(--text-dim)' }}>Due Date:</span>
                <span style={{ color: 'var(--text-mid)' }}>{dueDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 520 }}>
                <span style={{ color: 'var(--text-dim)' }}>Output VAT (Standard Rate 15%):</span>
                <span>{$(outputVAT)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 520 }}>
                <span style={{ color: 'var(--text-dim)' }}>Input VAT (Purchases):</span>
                <span style={{ color: 'var(--teal)' }}>({$(inputVAT)})</span>
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
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                  {netVATDue >= 0 ? 'NET VAT PAYABLE:' : 'NET VAT REFUND:'}
                </span>
                <span
                  style={{
                    color: netVATDue >= 0 ? 'var(--gold)' : 'var(--teal)',
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  {$(Math.abs(netVATDue))}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              ZIMRA Account: VAT Deposit Account
              {' · '}
              <span style={{ color: 'var(--text-mid)' }}>Form VAT 7</span>
            </div>
          </div>

          {/* Output VAT Manual Entry */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 24,
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
              }}
            >
              Output VAT — Manual Entry
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Output VAT Amount ($)
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 160 }}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={outputVATManual}
                  onChange={e => setOutputVATManual(e.target.value)}
                  disabled={periodStatus === 'Submitted' || periodStatus === 'Assessed'}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Notes (optional)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Based on sales records for the month"
                  value={outputVATNotes}
                  onChange={e => setOutputVATNotes(e.target.value)}
                  disabled={periodStatus === 'Submitted' || periodStatus === 'Assessed'}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSavePeriod}
                disabled={saving || periodStatus === 'Submitted' || periodStatus === 'Assessed'}
              >
                <span className="material-icons md-16">save</span>
                {saving ? 'Saving…' : 'Save Period'}
              </button>
            </div>
            {savedPeriod?.output_vat_notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-mid)' }}>
                <span className="material-icons md-12" style={{ verticalAlign: 'middle', marginRight: 4 }}>info</span>
                {savedPeriod.output_vat_notes}
              </div>
            )}
          </div>

          {/* Purchase Invoices Detail Table */}
          {invoices.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              message={`No purchase invoices found for ${periodLabel}. Input VAT is derived from purchase invoices posted in this period.`}
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
                  Purchase Invoices — {periodLabel}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {invoices.length} invoices · Input VAT: {$(inputVAT)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>Invoice Date</th>
                      <th>PI Number</th>
                      <th>Supplier</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                      <th style={{ textAlign: 'right' }}>Tax Amount</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 13, color: 'var(--text-mid)' }}>
                          {fmtDateShort(r.invoice_date)}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                          {r.pi_number || '—'}
                        </td>
                        <td style={{ fontWeight: 500 }}>{r.supplier_name || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(r.subtotal || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 600 }}>
                          {$(r.tax_amount || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(r.total_amount || 0)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <StatusBadge status={r.status} color={piStatusColor(r.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                      <td colSpan={3} style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-dim)', fontSize: 12 }}>
                        TOTALS
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {$(invoices.reduce((a, r) => a + (r.subtotal || 0), 0))}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                        {$(inputVAT)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {$(totalPurchases)}
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
