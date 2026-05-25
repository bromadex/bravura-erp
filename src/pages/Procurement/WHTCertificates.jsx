// src/pages/Procurement/WHTCertificates.jsx
// Per-supplier WHT002 printable certificates
// ZIMRA Form WHT002 — issued annually to each supplier showing WHT withheld
// Pursuant to the Income Tax Act [Chapter 23:06]

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, Spinner, ModalDialog, ModalActions } from '../../components/ui'
import { exportMultiSheet, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (n) => `$ ${fmtNum(n)}`

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const certNumber = (supplierName, yearLabel) => {
  const code = supplierName
    ? supplierName.replace(/\s+/g, '').toUpperCase().slice(0, 8)
    : 'UNKNOWN'
  const yr = yearLabel ? String(yearLabel).slice(-4) : new Date().getFullYear()
  return `WHT002-${code}-${yr}`
}

// ─── WHT002 Certificate Modal ──────────────────────────────────────────────────

function CertificateModal({ supplier, taxYear, settings, onClose }) {
  const companyName    = settings?.company_name    || '[Company Name]'
  const companyBP      = settings?.bp_number       || 'Not Registered'
  const companyAddress = settings?.company_address || 'Zimbabwe'

  const certNo    = certNumber(supplier.supplierName, taxYear?.year_label)
  const yearLabel = taxYear?.year_label || '—'

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  // Group vouchers by WHT type
  const byType = useMemo(() => {
    const map = {}
    for (const v of supplier.vouchers) {
      const type = v.wht_type || 'Unspecified'
      if (!map[type]) {
        map[type] = { type, whtRate: v.wht_rate, grossAmount: 0, whtAmount: 0 }
      }
      map[type].grossAmount += v.gross_amount || 0
      map[type].whtAmount   += v.wht_amount   || 0
    }
    return Object.values(map)
  }, [supplier.vouchers])

  return (
    <ModalDialog
      open
      onClose={onClose}
      title={`WHT002 Certificate — ${supplier.supplierName}`}
      size="lg"
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { display: none !important; }
          .wht002-print-root { display: block !important; }
        }
        .wht002-print-root { display: block; }
      `}</style>

      {/* Action buttons */}
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
        className="wht002-print-root"
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
            WITHHOLDING TAX CERTIFICATE
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', marginTop: 4 }}>
            FORM WHT002
          </div>
        </div>

        {/* Cert number + tax year */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid #ccc',
          fontSize: 13,
        }}>
          <span><strong>Tax Year:</strong> {yearLabel}</span>
          <span><strong>Certificate No:</strong> {certNo}</span>
        </div>

        {/* Withholding Agent (Company) */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Withholding Agent (Company)
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ width: 200, paddingBottom: 4, color: '#555' }}>Name:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{companyName}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>ZIMRA TIN / BP:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{companyBP}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>Address:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{companyAddress}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Recipient (Supplier) */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontSize: 12 }}>
            Recipient (Supplier)
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ width: 200, paddingBottom: 4, color: '#555' }}>Name:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{supplier.supplierName}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>Tax Year:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{yearLabel}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', paddingBottom: 4 }}>No. of Vouchers:</td>
                <td style={{ fontWeight: 600, paddingBottom: 4 }}>{supplier.voucherCount}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Withholding Details Table */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontSize: 12 }}>
            Withholding Details
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #999' }}>
                <th style={{ textAlign: 'left', paddingBottom: 6, paddingRight: 12, color: '#555', fontWeight: 600 }}>
                  Type of Payment
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 6, paddingRight: 12, color: '#555', fontWeight: 600 }}>
                  Gross Amount
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 6, paddingRight: 12, color: '#555', fontWeight: 600 }}>
                  WHT Rate
                </th>
                <th style={{ textAlign: 'right', paddingBottom: 6, color: '#555', fontWeight: 600 }}>
                  WHT Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {byType.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px dashed #ddd' }}>
                  <td style={{ paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}>{row.type}</td>
                  <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}>
                    {$(row.grossAmount)}
                  </td>
                  <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6, paddingRight: 12, color: '#555' }}>
                    {row.whtRate != null
                      ? `${row.whtRate <= 1 ? (row.whtRate * 100).toFixed(0) : row.whtRate}%`
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6, fontWeight: 600 }}>
                    {$(row.whtAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #555' }}>
                <td style={{ paddingTop: 8, fontWeight: 700 }}>TOTAL</td>
                <td style={{ textAlign: 'right', paddingTop: 8, fontWeight: 700, paddingRight: 12 }}>
                  {$(supplier.totalGross)}
                </td>
                <td />
                <td style={{ textAlign: 'right', paddingTop: 8, fontWeight: 700 }}>
                  {$(supplier.totalWHT)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Net Amount */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #ccc', background: '#f9f9f9' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Net Amount Paid to Recipient:</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16 }}>
                  {$(supplier.totalNet)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legal statement */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #ccc', fontSize: 12, color: '#444' }}>
          This certificate is issued pursuant to the Income Tax Act [Chapter 23:06]
        </div>

        {/* Signature block */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 24px 20px',
          fontSize: 12,
        }}>
          <div>
            Authorised Signatory:{'  '}
            <span style={{ borderBottom: '1px solid #555', paddingRight: 160, display: 'inline-block' }} />
          </div>
          <div>Date: _____________</div>
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
          This certificate must be retained by the supplier / recipient for tax purposes.
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function WHTCertificates() {
  const [taxYears,       setTaxYears]       = useState([])
  const [selectedYear,   setSelectedYear]   = useState(null)
  const [vouchers,       setVouchers]       = useState([])
  const [settings,       setSettings]       = useState(null)
  const [loadingYears,   setLoadingYears]   = useState(true)
  const [loadingVouchers, setLoadingVouchers] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState(null)

  // ── Load tax years + settings on mount ────────────────────────────────────
  useEffect(() => {
    const loadInit = async () => {
      setLoadingYears(true)
      try {
        const [{ data: years, error: ye }, { data: cfg, error: ce }] = await Promise.all([
          supabase.from('tax_years')
            .select('id, year_label, start_date, end_date, status')
            .order('start_date', { ascending: false }),
          supabase.from('payroll_settings').select('*').limit(1).maybeSingle(),
        ])
        if (ye) throw ye
        if (ce) throw ce
        const list = years || []
        setTaxYears(list)
        setSettings(cfg || null)
        const open = list.find(y => y.status === 'Open') || list[0] || null
        setSelectedYear(open)
      } catch (err) {
        toast.error('Failed to load tax years: ' + err.message)
      } finally {
        setLoadingYears(false)
      }
    }
    loadInit()
  }, [])

  // ── Fetch WHT vouchers for selected year ──────────────────────────────────
  const fetchVouchers = useCallback(async (taxYear) => {
    if (!taxYear) { setVouchers([]); return }
    setLoadingVouchers(true)
    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select(
          'id, pv_number, supplier_id, supplier_name, payment_date, gross_amount,' +
          'wht_type, wht_rate, wht_amount, net_payment, payment_method'
        )
        .eq('wht_applicable', true)
        .gte('payment_date', taxYear.start_date)
        .lte('payment_date', taxYear.end_date)
        .not('status', 'eq', 'Cancelled')
        .order('supplier_name')
      if (error) throw error
      setVouchers(data || [])
    } catch (err) {
      toast.error('Failed to load WHT vouchers: ' + err.message)
    } finally {
      setLoadingVouchers(false)
    }
  }, [])

  useEffect(() => {
    fetchVouchers(selectedYear)
  }, [selectedYear, fetchVouchers])

  // ── Group by supplier ──────────────────────────────────────────────────────
  const supplierGroups = useMemo(() => {
    const map = {}
    for (const v of vouchers) {
      const key = v.supplier_id || v.supplier_name || 'Unknown'
      if (!map[key]) {
        map[key] = {
          supplierId:   v.supplier_id || null,
          supplierName: v.supplier_name || 'Unknown',
          vouchers:     [],
          totalGross:   0,
          totalWHT:     0,
          totalNet:     0,
          whtTypes:     new Set(),
        }
      }
      map[key].vouchers.push(v)
      map[key].totalGross += v.gross_amount  || 0
      map[key].totalWHT   += v.wht_amount    || 0
      map[key].totalNet   += v.net_payment   || 0
      if (v.wht_type) map[key].whtTypes.add(v.wht_type)
    }
    return Object.values(map).map(s => ({
      ...s,
      voucherCount: s.vouchers.length,
      whtTypes:     Array.from(s.whtTypes),
      isComplete:   !!s.supplierId,
    }))
  }, [vouchers])

  // ── KPI aggregates ─────────────────────────────────────────────────────────
  const kpiSuppliers  = supplierGroups.length
  const kpiTotalGross = supplierGroups.reduce((a, s) => a + s.totalGross, 0)
  const kpiTotalWHT   = supplierGroups.reduce((a, s) => a + s.totalWHT,   0)
  const kpiTotalNet   = supplierGroups.reduce((a, s) => a + s.totalNet,   0)

  // ── Export XLSX ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!supplierGroups.length) { toast.error('No data to export'); return }
    const rows = supplierGroups.map((s, i) => ({
      '#':              i + 1,
      'Supplier':       s.supplierName,
      'WHT Types':      s.whtTypes.join(', '),
      'Vouchers':       s.voucherCount,
      'Total Gross':    s.totalGross,
      'WHT Deducted':   s.totalWHT,
      'Net Paid':       s.totalNet,
      'Status':         s.isComplete ? 'Complete' : 'Missing Supplier Link',
    }))
    const detailRows = vouchers.map(v => ({
      'Supplier':       v.supplier_name || '',
      'PV Number':      v.pv_number     || '',
      'Payment Date':   v.payment_date  || '',
      'WHT Type':       v.wht_type      || '',
      'WHT Rate':       v.wht_rate      || 0,
      'Gross Amount':   v.gross_amount  || 0,
      'WHT Amount':     v.wht_amount    || 0,
      'Net Payment':    v.net_payment   || 0,
      'Payment Method': v.payment_method || '',
    }))
    exportMultiSheet(
      [
        { name: 'WHT Summary', rows },
        { name: 'WHT Detail',  rows: detailRows },
      ],
      `WHT002_Certificates_${selectedYear?.year_label || 'All'}`
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const isLoading = loadingYears || loadingVouchers

  return (
    <div className="page-container">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Page Header */}
      <PageHeader
        title="WHT002 Certificates"
        subtitle="Per-supplier Withholding Tax certificates — ZIMRA Form WHT002 (ITA Chapter 23:06)"
      >
        {supplierGroups.length > 0 && (
          <button className="btn btn-secondary btn-sm no-print" onClick={handleExport}>
            <span className="material-icons md-16">download</span> Export All XLSX
          </button>
        )}
      </PageHeader>

      {/* Tax Year Selector */}
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
            style={{ minWidth: 180 }}
            value={selectedYear?.id || ''}
            onChange={e => {
              const yr = taxYears.find(y => y.id === e.target.value) || null
              setSelectedYear(yr)
            }}
          >
            <option value="">— Select Tax Year —</option>
            {taxYears.map(y => (
              <option key={y.id} value={y.id}>{y.year_label}</option>
            ))}
          </select>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => fetchVouchers(selectedYear)}
          disabled={loadingVouchers || !selectedYear}
        >
          <span className="material-icons md-16">refresh</span> Reload
        </button>
        {selectedYear && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {selectedYear.start_date} → {selectedYear.end_date}
            {' · '}
            <span
              style={{
                color: selectedYear.status === 'Open' ? 'var(--green)' : 'var(--text-dim)',
                fontWeight: 600,
              }}
            >
              {selectedYear.status}
            </span>
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner size="md" text="Loading WHT data…" />
        </div>
      )}

      {/* No year selected */}
      {!isLoading && !selectedYear && (
        <EmptyState icon="folder_open" message="Select a tax year to view WHT002 certificates." />
      )}

      {/* Content */}
      {!isLoading && selectedYear && (
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
              label="Suppliers with WHT"
              value={kpiSuppliers}
              icon="groups"
              color="blue"
            />
            <KPICard
              label="Total Gross Paid"
              value={$(kpiTotalGross)}
              icon="payments"
              color="green"
            />
            <KPICard
              label="Total WHT Deducted"
              value={$(kpiTotalWHT)}
              icon="account_balance"
              color="gold"
            />
            <KPICard
              label="Net Paid to Suppliers"
              value={$(kpiTotalNet)}
              icon="send"
              color="teal"
            />
          </div>

          {/* Supplier Summary Table */}
          {supplierGroups.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              message={`No WHT-applicable payments found for ${selectedYear.year_label}. Payments must have WHT marked as applicable when creating payment vouchers.`}
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
                  WHT002 — {selectedYear.year_label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {supplierGroups.length} suppliers · Click a row to view/print certificate
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: 860 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Supplier</th>
                      <th>WHT Types</th>
                      <th style={{ textAlign: 'right' }}>Vouchers</th>
                      <th style={{ textAlign: 'right' }}>Total Gross</th>
                      <th style={{ textAlign: 'right' }}>WHT Deducted</th>
                      <th style={{ textAlign: 'right' }}>Net Paid</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierGroups.map((s, i) => (
                      <tr
                        key={s.supplierId || s.supplierName}
                        onClick={() => setSelectedSupplier(s)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{s.supplierName}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {s.whtTypes.length > 0 ? s.whtTypes.map(t => (
                              <span
                                key={t}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
                                  color: 'var(--teal)',
                                }}
                              >
                                {t}
                              </span>
                            )) : (
                              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                          {s.voucherCount}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(s.totalGross)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                          {$(s.totalWHT)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {$(s.totalNet)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: s.isComplete
                                ? 'color-mix(in srgb, var(--green) 15%, transparent)'
                                : 'color-mix(in srgb, var(--red) 12%, transparent)',
                              color: s.isComplete ? 'var(--green)' : 'var(--red)',
                            }}
                          >
                            {s.isComplete ? 'Complete' : '⚠ Missing'}
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
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(kpiTotalGross)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{$(kpiTotalWHT)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{$(kpiTotalNet)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Certificate Modal */}
      {selectedSupplier && (
        <CertificateModal
          supplier={selectedSupplier}
          taxYear={selectedYear}
          settings={settings}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
    </div>
  )
}
