// src/pages/Procurement/QuotationComparison.jsx
import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import toast from 'react-hot-toast'
import { fmtDate, fmtNum, dateTag, exportXLSX } from '../../engine/reportingEngine'
import { PageHeader, StatusBadge } from '../../components/ui'

export default function QuotationComparison() {
  const { rfqs, rfqQuotations, selectQuotation, loading } = useProcurement()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlRfqId = searchParams.get('rfq_id') || ''
  const [selectedRfqId, setSelectedRfqId] = useState(urlRfqId)

  const handleRfqChange = (id) => {
    setSelectedRfqId(id)
    if (id) setSearchParams({ rfq_id: id })
    else setSearchParams({})
  }

  const parseItems = (raw) =>
    Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw || '[]') : [])

  // ── selected RFQ + quotations ─────────────────────────────────
  const rfq = rfqs.find(r => r.id === selectedRfqId)
  const quotations = useMemo(
    () => rfqQuotations.filter(q => q.rfq_id === selectedRfqId),
    [rfqQuotations, selectedRfqId]
  )

  // ── derive comparison metrics ─────────────────────────────────
  const totals       = quotations.map(q => parseFloat(q.total_amount) || 0)
  const deliveries   = quotations.map(q => q.delivery_days != null ? parseInt(q.delivery_days) : null)
  const minTotal     = totals.length > 0 ? Math.min(...totals.filter(t => t > 0)) : null
  const minDelivery  = deliveries.filter(d => d != null).length > 0
    ? Math.min(...deliveries.filter(d => d != null))
    : null

  // RFQ items (for row labels)
  const rfqItems = rfq ? parseItems(rfq.items) : []

  // For each quotation, build a map of item name → item data
  const quotItemMaps = quotations.map(q =>
    parseItems(q.items).reduce((acc, it) => {
      acc[it.name] = it
      return acc
    }, {})
  )

  // ── select quotation ──────────────────────────────────────────
  const handleSelect = async (quot) => {
    if (!window.confirm(`Select quotation from ${quot.supplier_name} and close this RFQ?`)) return
    const reason = window.prompt('Reason for selecting (optional):') ?? ''
    if (reason === null) return
    try {
      await selectQuotation(quot.id, quot.rfq_id, reason)
      toast.success('Quotation selected. RFQ closed.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── export ────────────────────────────────────────────────────
  const handleExport = () => {
    if (!rfq || quotations.length === 0) return
    const rows = []
    // Header info
    rows.push({ Criteria: 'RFQ', ...Object.fromEntries(quotations.map(q => [q.supplier_name, rfq.rfq_number + ': ' + rfq.title])) })
    rows.push({ Criteria: 'Submitted', ...Object.fromEntries(quotations.map(q => [q.supplier_name, q.submitted_date])) })
    rows.push({ Criteria: 'Valid Until', ...Object.fromEntries(quotations.map(q => [q.supplier_name, q.valid_until || '—'])) })
    rows.push({ Criteria: 'Delivery Days', ...Object.fromEntries(quotations.map(q => [q.supplier_name, q.delivery_days != null ? q.delivery_days + ' days' : '—'])) })
    rows.push({ Criteria: 'Payment Terms', ...Object.fromEntries(quotations.map(q => [q.supplier_name, q.payment_terms || '—'])) })
    rfqItems.forEach(rfqIt => {
      rows.push({
        Criteria: `Item: ${rfqIt.name}`,
        ...Object.fromEntries(quotations.map((q, qi) => {
          const it = quotItemMaps[qi][rfqIt.name]
          return [q.supplier_name, it ? `$${fmtNum(it.unit_price)}` : '—']
        })),
      })
    })
    rows.push({ Criteria: 'TOTAL', ...Object.fromEntries(quotations.map(q => [q.supplier_name, `$${fmtNum(q.total_amount)}`])) })
    rows.push({ Criteria: 'Status', ...Object.fromEntries(quotations.map(q => [q.supplier_name, q.status])) })
    exportXLSX(rows, `QuotationComparison_${rfq.rfq_number}_${dateTag()}`, 'Comparison')
    toast.success('Exported')
  }

  // ── cell highlight helpers ────────────────────────────────────
  const isCheapest = (q) => totals.length > 1 && (parseFloat(q.total_amount) || 0) === minTotal && minTotal > 0
  const isFastest  = (q) => deliveries.filter(d => d != null).length > 1 && q.delivery_days != null && parseInt(q.delivery_days) === minDelivery
  const isSelected = (q) => q.status === 'Selected'

  const colStyle = (q) => ({
    borderLeft: isSelected(q) ? '3px solid var(--gold)' : undefined,
    background: isSelected(q) ? 'rgba(var(--gold-rgb, 212,175,55), 0.05)' : undefined,
  })

  // ── empty states ──────────────────────────────────────────────
  if (!selectedRfqId) {
    return (
      <div>
        <PageHeader title="Quotation Comparison" subtitle="Side-by-side comparison of supplier quotations" />
        <RfqSelector rfqs={rfqs} value={selectedRfqId} onChange={handleRfqChange} />
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 56, opacity: 0.25, color: 'var(--gold)', display: 'block', marginBottom: 12 }}>compare_arrows</span>
          <div style={{ color: 'var(--text-dim)', fontSize: 15 }}>Select an RFQ to compare quotations</div>
        </div>
      </div>
    )
  }

  if (!loading && rfq && quotations.length === 0) {
    return (
      <div>
        <PageHeader title={`Quotation Comparison — ${rfq.rfq_number}: ${rfq.title}`} subtitle="Side-by-side comparison" />
        <RfqSelector rfqs={rfqs} value={selectedRfqId} onChange={handleRfqChange} />
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 56, opacity: 0.25, color: 'var(--text-dim)', display: 'block', marginBottom: 12 }}>inbox</span>
          <div style={{ color: 'var(--text-dim)', fontSize: 15 }}>No quotations recorded for this RFQ.</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 6 }}>Go to <strong>Supplier Quotations</strong> and add quotations first.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={rfq ? `Quotation Comparison — ${rfq.rfq_number}: ${rfq.title}` : 'Quotation Comparison'}
        subtitle="Side-by-side comparison of supplier quotations"
      >
        <button className="btn btn-secondary" onClick={handleExport} disabled={quotations.length === 0}>
          <span className="material-icons">table_chart</span> Export Excel
        </button>
      </PageHeader>

      <RfqSelector rfqs={rfqs} value={selectedRfqId} onChange={handleRfqChange} />

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : quotations.length === 1 ? (
        <div className="card" style={{ padding: '8px 16px 12px', marginBottom: 12, background: 'rgba(255,200,0,0.06)', border: '1px solid var(--yellow)' }}>
          <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', color: 'var(--yellow)', marginRight: 6 }}>warning</span>
          <span style={{ color: 'var(--yellow)', fontSize: 13 }}>Only 1 quotation received — add more quotations for a meaningful comparison.</span>
        </div>
      ) : null}

      {quotations.length > 0 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="stock-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Criteria</th>
                {quotations.map(q => (
                  <th key={q.id} style={{ minWidth: 160, ...colStyle(q), textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: isSelected(q) ? 'var(--gold)' : undefined }}>
                      {q.supplier_name}
                    </div>
                    {isSelected(q) && (
                      <div style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
                        SELECTED
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ── Meta rows ── */}
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Submitted</td>
                {quotations.map(q => (
                  <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                    {fmtDate(q.submitted_date)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Valid Until</td>
                {quotations.map(q => (
                  <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                    {fmtDate(q.valid_until)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Delivery Days</td>
                {quotations.map(q => {
                  const fast = isFastest(q)
                  return (
                    <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                      {q.delivery_days != null ? (
                        <span style={{ color: fast ? 'var(--green)' : undefined, fontWeight: fast ? 700 : undefined }}>
                          {q.delivery_days} days{fast ? ' ✓' : ''}
                        </span>
                      ) : '—'}
                      {fast && <div style={{ fontSize: 10, color: 'var(--green)' }}>(fastest)</div>}
                    </td>
                  )
                })}
              </tr>
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Payment Terms</td>
                {quotations.map(q => (
                  <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                    {q.payment_terms || '—'}
                  </td>
                ))}
              </tr>

              {/* ── Divider ── */}
              <tr>
                <td colSpan={quotations.length + 1} style={{ padding: 0, borderTop: '2px solid var(--border)' }} />
              </tr>

              {/* ── Item rows ── */}
              {rfqItems.length > 0 ? (
                rfqItems.map((rfqIt, rowIdx) => {
                  // Find lowest unit price for this item
                  const prices = quotations.map((q, qi) => {
                    const it = quotItemMaps[qi][rfqIt.name]
                    return it ? parseFloat(it.unit_price) || 0 : null
                  })
                  const validPrices = prices.filter(p => p != null && p > 0)
                  const minPrice = validPrices.length > 1 ? Math.min(...validPrices) : null

                  return (
                    <tr key={rowIdx}>
                      <td style={{ fontWeight: 600 }}>
                        <div>{rfqIt.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                          {rfqIt.qty} {rfqIt.unit}
                        </div>
                      </td>
                      {quotations.map((q, qi) => {
                        const it        = quotItemMaps[qi][rfqIt.name]
                        const price     = it ? parseFloat(it.unit_price) || 0 : null
                        const cheapItem = minPrice != null && price === minPrice && price > 0
                        return (
                          <td key={q.id} style={{ textAlign: 'center', fontFamily: 'var(--mono)', ...colStyle(q) }}>
                            {it ? (
                              <>
                                <span style={{ color: cheapItem ? 'var(--green)' : 'var(--teal)', fontWeight: cheapItem ? 700 : undefined }}>
                                  ${fmtNum(it.unit_price)}{cheapItem ? ' ✓' : ''}
                                </span>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>= ${fmtNum(it.total)}</div>
                              </>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>No items on RFQ</td>
                  {quotations.map(q => (
                    <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>—</td>
                  ))}
                </tr>
              )}

              {/* ── Divider ── */}
              <tr>
                <td colSpan={quotations.length + 1} style={{ padding: 0, borderTop: '2px solid var(--border)' }} />
              </tr>

              {/* ── Total row ── */}
              <tr style={{ background: 'var(--surface2)' }}>
                <td style={{ fontWeight: 800, fontSize: 15 }}>TOTAL</td>
                {quotations.map(q => {
                  const cheap = isCheapest(q)
                  return (
                    <td key={q.id} style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 800, ...colStyle(q) }}>
                      <span style={{ color: cheap ? 'var(--green)' : 'var(--teal)', fontSize: 15 }}>
                        ${fmtNum(q.total_amount)}{cheap ? ' ✓' : ''}
                      </span>
                      {cheap && <div style={{ fontSize: 10, color: 'var(--green)' }}>(cheapest)</div>}
                    </td>
                  )
                })}
              </tr>

              {/* ── Status row ── */}
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Status</td>
                {quotations.map(q => (
                  <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                    <StatusBadge status={q.status} />
                  </td>
                ))}
              </tr>

              {/* ── Action row ── */}
              <tr>
                <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Action</td>
                {quotations.map(q => (
                  <td key={q.id} style={{ textAlign: 'center', ...colStyle(q) }}>
                    {q.status === 'Selected' ? (
                      <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 13 }}>✓ Selected</span>
                    ) : q.status === 'Received' && rfq?.status === 'Open' ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSelect(q)}
                      >
                        Select
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Shared RFQ selector dropdown ─────────────────────────────
function RfqSelector({ rfqs, value, onChange }) {
  return (
    <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      <label style={{ color: 'var(--text-dim)', fontSize: 13, whiteSpace: 'nowrap' }}>Select RFQ:</label>
      <select
        className="form-control"
        style={{ maxWidth: 420 }}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">— Choose an RFQ —</option>
        {rfqs.map(r => (
          <option key={r.id} value={r.id}>{r.rfq_number}: {r.title} ({r.status})</option>
        ))}
      </select>
    </div>
  )
}
