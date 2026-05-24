// src/pages/Procurement/SupplierStatement.jsx
//
// Supplier Statement Reconciliation — full AP ledger per supplier.
// Combines POs, GRNs, Purchase Invoices, Payment Vouchers, and
// Purchase Returns into a running-balance statement for a selected
// supplier and date range.

import { useState, useMemo } from 'react'
import { useProcurement }    from '../../contexts/ProcurementContext'
import { exportXLSX, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState }       from '../../components/ui'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d) {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const d = toISO(dateStr)
  return d >= from && d <= to
}

// ── TypeBadge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type, color }) {
  return (
    <span style={{
      display:        'inline-block',
      padding:        '2px 7px',
      borderRadius:   4,
      fontSize:       11,
      fontWeight:     700,
      letterSpacing:  '0.05em',
      background:     color,
      color:          'var(--surface)',
      fontFamily:     'var(--mono)',
      whiteSpace:     'nowrap',
    }}>
      {type}
    </span>
  )
}

// ── Label/input helpers ───────────────────────────────────────────────────────

const labelStyle = {
  display:    'flex',
  flexDirection: 'column',
  gap:        4,
  fontSize:   12,
  color:      'var(--text-dim)',
  fontWeight: 600,
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
  minWidth: 240,
  cursor:   'pointer',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupplierStatement() {
  const {
    suppliers,
    purchaseOrders,
    goodsReceived,
    purchaseInvoices,
    paymentVouchers,
    purchaseReturns,
  } = useProcurement()

  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [dateFrom,         setDateFrom]         = useState(daysAgo(90))
  const [dateTo,           setDateTo]           = useState(new Date().toISOString().split('T')[0])

  // ── Statement computation ──────────────────────────────────────────────────

  const statement = useMemo(() => {
    if (!selectedSupplier) return []
    const rows = []

    // 1. Purchase Orders — committed
    const poStatuses = ['Submitted', 'Approved', 'Partially Received', 'Received', 'Closed']
    for (const po of purchaseOrders) {
      if (po.supplier_id !== selectedSupplier) continue
      if (!poStatuses.includes(po.status)) continue
      if (!inRange(po.order_date, dateFrom, dateTo)) continue
      rows.push({
        type:        'PO',
        ref:         po.po_number,
        date:        toISO(po.order_date),
        description: `Purchase Order ${po.po_number}`,
        debit:       0,
        credit:      Number(po.total_amount) || 0,
        badgeColor:  'var(--blue)',
        status:      po.status,
      })
    }

    // 2. Goods Received Notes — received
    const grnStatuses = ['Submitted', 'Partially Invoiced', 'Invoiced']
    for (const grn of goodsReceived) {
      if (grn.supplier_id !== selectedSupplier) continue
      if (!grnStatuses.includes(grn.status)) continue
      const grnDate = grn.grn_date || grn.date
      if (!inRange(grnDate, dateFrom, dateTo)) continue
      rows.push({
        type:        'GRN',
        ref:         grn.grn_number,
        date:        toISO(grnDate),
        description: `Goods Received ${grn.grn_number}`,
        debit:       0,
        credit:      Number(grn.total_amount) || 0,
        badgeColor:  'var(--teal)',
        status:      grn.status,
      })
    }

    // 3. Purchase Invoices — payable
    const invStatuses = ['Draft', 'Posted', 'Partially Paid', 'Paid', 'Overdue']
    for (const pi of purchaseInvoices) {
      if (pi.supplier_id !== selectedSupplier) continue
      if (!invStatuses.includes(pi.status)) continue
      if (!inRange(pi.invoice_date, dateFrom, dateTo)) continue
      rows.push({
        type:        'INV',
        ref:         pi.pi_number,
        date:        toISO(pi.invoice_date),
        description: `Invoice ${pi.pi_number}`,
        debit:       0,
        credit:      Number(pi.total_amount) || 0,
        badgeColor:  'var(--purple)',
        status:      pi.status,
        due_date:    pi.due_date,
      })
    }

    // 4. Payment Vouchers — reduces balance
    for (const pv of paymentVouchers) {
      if (pv.supplier_id !== selectedSupplier) continue
      if (pv.status !== 'Posted') continue
      if (!inRange(pv.payment_date, dateFrom, dateTo)) continue
      rows.push({
        type:        'PMT',
        ref:         pv.pv_number || pv.id,
        date:        toISO(pv.payment_date),
        description: `Payment ${pv.pv_number || ''}`.trim(),
        debit:       Number(pv.total_amount) || 0,
        credit:      0,
        badgeColor:  'var(--green)',
        status:      pv.status,
      })
    }

    // 5. Purchase Returns — credit notes
    const rtnStatuses = ['Submitted', 'Dispatched']
    for (const pr of purchaseReturns) {
      if (pr.supplier_id !== selectedSupplier) continue
      if (!rtnStatuses.includes(pr.status)) continue
      if (!inRange(pr.return_date, dateFrom, dateTo)) continue
      const rtnValue = Number(pr.return_value ?? pr.reduce_amount) || 0
      rows.push({
        type:        'RTN',
        ref:         pr.pr_number,
        date:        toISO(pr.return_date),
        description: `Purchase Return ${pr.pr_number}`,
        debit:       rtnValue,
        credit:      0,
        badgeColor:  'var(--yellow)',
        status:      pr.status,
      })
    }

    // Sort ascending by date
    rows.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Running balance: credit = we owe supplier (+), debit = paid/returned (-)
    let balance = 0
    return rows.map(r => {
      balance += (r.credit || 0) - (r.debit || 0)
      return { ...r, running_balance: balance }
    })
  }, [selectedSupplier, dateFrom, dateTo, purchaseOrders, goodsReceived, purchaseInvoices, paymentVouchers, purchaseReturns])

  // ── KPI derivations ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalInvoiced = statement
      .filter(r => r.type === 'INV')
      .reduce((s, r) => s + (r.credit || 0), 0)

    const totalPaid = statement
      .filter(r => r.type === 'PMT')
      .reduce((s, r) => s + (r.debit || 0), 0)

    const outstandingBalance = statement.length
      ? statement[statement.length - 1].running_balance
      : 0

    const today = new Date().toISOString().split('T')[0]
    const overdueCount = purchaseInvoices.filter(pi =>
      pi.supplier_id === selectedSupplier &&
      ['Posted', 'Partially Paid', 'Overdue'].includes(pi.status) &&
      pi.due_date && toISO(pi.due_date) < today
    ).length

    return { totalInvoiced, totalPaid, outstandingBalance, overdueCount }
  }, [statement, purchaseInvoices, selectedSupplier])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const totals = useMemo(() => ({
    debit:  statement.reduce((s, r) => s + (r.debit  || 0), 0),
    credit: statement.reduce((s, r) => s + (r.credit || 0), 0),
  }), [statement])

  // ── Supplier info ──────────────────────────────────────────────────────────

  const supplierObj = useMemo(
    () => suppliers.find(s => s.id === selectedSupplier) || null,
    [suppliers, selectedSupplier]
  )

  // ── Export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    if (!statement.length) {
      toast.error('No data to export')
      return
    }
    const rows = statement.map(r => ({
      Date:        r.date,
      Type:        r.type,
      Reference:   r.ref,
      Description: r.description,
      Debit:       r.debit  || 0,
      Credit:      r.credit || 0,
      Balance:     r.running_balance,
    }))
    const supName = supplierObj?.name?.replace(/\s+/g, '_') || 'Supplier'
    exportXLSX(rows, `SupplierStatement_${supName}_${dateTag()}`, 'Statement')
    toast.success('Statement exported')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Page header */}
      <PageHeader
        title="Supplier Statement"
        subtitle="Full AP ledger reconciliation — compare your books against supplier statement"
      >
        <button
          className="btn btn-secondary"
          onClick={handleExport}
          disabled={!selectedSupplier || statement.length === 0}
        >
          <span className="material-icons md-16">download</span>
          Export XLSX
        </button>
      </PageHeader>

      {/* Filters */}
      <div style={{
        display:       'flex',
        gap:           12,
        marginBottom:  24,
        flexWrap:      'wrap',
        alignItems:    'flex-end',
      }}>
        <label style={labelStyle}>
          Supplier
          <select
            style={selectStyle}
            value={selectedSupplier}
            onChange={e => setSelectedSupplier(e.target.value)}
          >
            <option value="">— Select a supplier —</option>
            {suppliers
              .slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
          </select>
        </label>

        <label style={labelStyle}>
          From
          <input
            type="date"
            style={inputStyle}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          To
          <input
            type="date"
            style={inputStyle}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </label>
      </div>

      {/* Body */}
      {selectedSupplier ? (
        <>
          {/* KPI Cards */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap:                 16,
            marginBottom:        24,
          }}>
            <KPICard
              label="Total Invoiced"
              value={`K ${fmtNum(kpis.totalInvoiced)}`}
              icon="receipt"
              color="purple"
            />
            <KPICard
              label="Total Paid"
              value={`K ${fmtNum(kpis.totalPaid)}`}
              icon="payments"
              color="green"
            />
            <KPICard
              label="Outstanding Balance"
              value={`K ${fmtNum(Math.abs(kpis.outstandingBalance))}`}
              sub={kpis.outstandingBalance > 0 ? 'We owe supplier' : kpis.outstandingBalance < 0 ? 'Supplier owes us' : 'Settled'}
              icon="account_balance_wallet"
              color={kpis.outstandingBalance > 0 ? 'red' : kpis.outstandingBalance < 0 ? 'green' : ''}
            />
            <KPICard
              label="Overdue Invoices"
              value={kpis.overdueCount}
              icon="warning"
              color={kpis.overdueCount > 0 ? 'red' : ''}
            />
          </div>

          {/* Statement card */}
          <div style={{
            background:   'var(--surface)',
            border:       '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 20,
          }}>

            {/* Supplier info header */}
            {supplierObj && (
              <div style={{
                padding:      '16px 20px',
                borderBottom: '1px solid var(--border)',
                display:      'flex',
                flexWrap:     'wrap',
                gap:          24,
                alignItems:   'flex-start',
              }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{
                    fontSize:   18,
                    fontWeight: 700,
                    color:      'var(--text)',
                    marginBottom: 4,
                  }}>
                    {supplierObj.name}
                  </div>
                  {(supplierObj.address) && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                      {supplierObj.address}
                    </div>
                  )}
                </div>
                <div style={{
                  display:   'flex',
                  flexWrap:  'wrap',
                  gap:       '4px 20px',
                  fontSize:  12,
                  color:     'var(--text-dim)',
                  alignSelf: 'center',
                }}>
                  {(supplierObj.contact_person || supplierObj.contact) && (
                    <span>
                      <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 3 }}>person</span>
                      {supplierObj.contact_person || supplierObj.contact}
                    </span>
                  )}
                  {supplierObj.phone && (
                    <span>
                      <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 3 }}>phone</span>
                      {supplierObj.phone}
                    </span>
                  )}
                  {supplierObj.email && (
                    <span>
                      <span className="material-icons md-14" style={{ verticalAlign: 'middle', marginRight: 3 }}>email</span>
                      {supplierObj.email}
                    </span>
                  )}
                </div>

                <div style={{
                  marginLeft: 'auto',
                  fontSize:   11,
                  color:      'var(--text-dim)',
                  textAlign:  'right',
                  alignSelf:  'center',
                }}>
                  <div style={{ fontWeight: 600 }}>Period</div>
                  <div>{fmtDate(dateFrom)} – {fmtDate(dateTo)}</div>
                </div>
              </div>
            )}

            {/* Table */}
            {statement.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width:          '100%',
                  borderCollapse: 'collapse',
                  fontSize:       13,
                }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                      {['Date', 'Type', 'Reference', 'Description', 'Debit (K)', 'Credit (K)', 'Balance (K)'].map(h => (
                        <th key={h} style={{
                          padding:      '10px 14px',
                          fontWeight:   700,
                          fontSize:     11,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color:        'var(--text-dim)',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace:   'nowrap',
                          textAlign:    ['Debit (K)', 'Credit (K)', 'Balance (K)'].includes(h) ? 'right' : 'left',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {statement.map((row, i) => {
                      const balColor = row.running_balance <= 0
                        ? 'var(--green)'
                        : 'var(--red)'
                      return (
                        <tr key={i} style={{
                          borderBottom: '1px solid var(--border)',
                          transition:   'background 0.1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <td style={{ padding: '9px 14px', color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: 12 }}>
                            {fmtDate(row.date)}
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <TypeBadge type={row.type} color={row.badgeColor} />
                          </td>
                          <td style={{
                            padding:    '9px 14px',
                            fontFamily: 'var(--mono)',
                            color:      'var(--gold)',
                            fontSize:   12,
                            whiteSpace: 'nowrap',
                          }}>
                            {row.ref}
                          </td>
                          <td style={{ padding: '9px 14px', color: 'var(--text)' }}>
                            {row.description}
                          </td>
                          <td style={{
                            padding:   '9px 14px',
                            textAlign: 'right',
                            fontFamily: 'var(--mono)',
                            color:     row.debit > 0 ? 'var(--green)' : 'var(--text-dim)',
                            whiteSpace: 'nowrap',
                          }}>
                            {row.debit > 0 ? fmtNum(row.debit) : '—'}
                          </td>
                          <td style={{
                            padding:    '9px 14px',
                            textAlign:  'right',
                            fontFamily: 'var(--mono)',
                            color:      row.credit > 0 ? 'var(--red)' : 'var(--text-dim)',
                            whiteSpace: 'nowrap',
                          }}>
                            {row.credit > 0 ? fmtNum(row.credit) : '—'}
                          </td>
                          <td style={{
                            padding:    '9px 14px',
                            textAlign:  'right',
                            fontFamily: 'var(--mono)',
                            fontWeight: 600,
                            color:      balColor,
                            whiteSpace: 'nowrap',
                          }}>
                            {fmtNum(row.running_balance)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr style={{
                      background:  'var(--surface2)',
                      borderTop:   '2px solid var(--border2)',
                    }}>
                      <td colSpan={4} style={{
                        padding:    '10px 14px',
                        fontWeight: 700,
                        fontSize:   13,
                        color:      'var(--text)',
                      }}>
                        TOTALS
                      </td>
                      <td style={{
                        padding:    '10px 14px',
                        textAlign:  'right',
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        color:      'var(--green)',
                      }}>
                        {fmtNum(totals.debit)}
                      </td>
                      <td style={{
                        padding:    '10px 14px',
                        textAlign:  'right',
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        color:      'var(--red)',
                      }}>
                        {fmtNum(totals.credit)}
                      </td>
                      <td style={{
                        padding:    '10px 14px',
                        textAlign:  'right',
                        fontFamily: 'var(--mono)',
                        fontWeight: 700,
                        color:      kpis.outstandingBalance <= 0 ? 'var(--green)' : 'var(--red)',
                      }}>
                        {fmtNum(kpis.outstandingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div style={{ padding: '40px 20px' }}>
                <EmptyState
                  icon="search_off"
                  message="No transactions found for this supplier in the selected date range"
                />
              </div>
            )}
          </div>

          {/* Reconciliation note */}
          <div style={{
            background:   'var(--surface2)',
            border:       '1px solid var(--border)',
            borderLeft:   '3px solid var(--gold)',
            borderRadius: 6,
            padding:      '14px 18px',
            fontSize:     12,
            color:        'var(--text-dim)',
            lineHeight:   1.7,
          }}>
            <span style={{
              display:    'block',
              fontWeight: 700,
              color:      'var(--gold)',
              marginBottom: 4,
              fontSize:   11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Reconciliation Guide
            </span>
            To reconcile: ask the supplier for their statement and compare each line against this ledger.
            Differences may arise from <strong>in-transit goods</strong> not yet received,{' '}
            <strong>timing differences</strong> in posting dates,{' '}
            <strong>unrecorded credits</strong> or credit notes,{' '}
            or <strong>pricing disputes</strong> on individual line items.
            Investigate any variance before authorising payment.
          </div>
        </>
      ) : (
        <EmptyState
          icon="receipt_long"
          message="Select a supplier above to view their full AP statement"
        />
      )}
    </div>
  )
}
