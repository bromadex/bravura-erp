// src/pages/Procurement/GRIRReconciliation.jsx
// GRIR Clearing Account Reconciliation — Goods Receipt / Invoice Receipt.
//
//  Tab 1 – Received Not Invoiced (RNI):
//    PO lines where qty_received > qty_invoiced. The company owes money but
//    the supplier invoice has not yet been raised.
//
//  Tab 2 – Invoiced Not Received (INR):
//    Invoice lines with no backing GRN (grn_line_id IS NULL). Could be a
//    prepayment, a missing delivery, or an incorrect billing.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase }                                   from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState }            from '../../components/ui'
import { exportXLSX, fmtNum, dateTag }                from '../../engine/reportingEngine'
import toast                                          from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'rni', label: 'Received Not Invoiced (RNI)' },
  { id: 'inr', label: 'Invoiced Not Received (INR)'  },
]

const RNI_COLUMNS = [
  { key: 'po_number',     label: 'PO No',        align: 'left'  },
  { key: 'supplier_name', label: 'Supplier',      align: 'left'  },
  { key: 'item_name',     label: 'Item',          align: 'left'  },
  { key: 'unit',          label: 'Unit',          align: 'left'  },
  { key: 'qty_ordered',   label: 'Ordered',       align: 'right' },
  { key: 'qty_received',  label: 'Received',      align: 'right' },
  { key: 'qty_invoiced',  label: 'Invoiced',      align: 'right' },
  { key: 'qty_pending',   label: 'Pending Qty',   align: 'right' },
  { key: 'unit_rate',     label: 'Unit Rate',     align: 'right' },
  { key: 'pending_value', label: 'Pending Value', align: 'right' },
  { key: 'po_date',       label: 'PO Date',       align: 'left'  },
]

const INR_COLUMNS = [
  { key: 'invoice_no',    label: 'Invoice No',    align: 'left'  },
  { key: 'invoice_date',  label: 'Invoice Date',  align: 'left'  },
  { key: 'supplier_name', label: 'Supplier',      align: 'left'  },
  { key: 'item_name',     label: 'Item',          align: 'left'  },
  { key: 'unit',          label: 'Unit',          align: 'left'  },
  { key: 'qty',           label: 'Qty',           align: 'right' },
  { key: 'unit_rate',     label: 'Unit Rate',     align: 'right' },
  { key: 'value',         label: 'Value',         align: 'right' },
  { key: 'match_status',  label: 'Match Status',  align: 'left'  },
]

const MATCH_STATUS_COLORS = {
  Matched:      'var(--green)',
  Unmatched:    'var(--red)',
  Partial:      'var(--yellow)',
  'Under Review': 'var(--blue)',
}

// ── Style helpers ─────────────────────────────────────────────────────────────

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

const thStyle = (align = 'left') => ({
  padding:       '10px 14px',
  fontWeight:    700,
  fontSize:      11,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color:         'var(--text-dim)',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
  textAlign:     align,
})

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day:   'numeric',
    month: 'short',
    year:  'numeric',
  })
}

// ── Match Status Badge ────────────────────────────────────────────────────────

function MatchBadge({ status }) {
  const color = MATCH_STATUS_COLORS[status] || 'var(--text-dim)'
  return (
    <span style={{
      display:       'inline-block',
      padding:       '2px 8px',
      borderRadius:  4,
      fontSize:      11,
      fontWeight:    700,
      letterSpacing: '0.05em',
      background:    color,
      color:         'var(--surface)',
      fontFamily:    'var(--mono)',
      whiteSpace:    'nowrap',
    }}>
      {status || 'Unknown'}
    </span>
  )
}

// ── RNI Row left-border style ─────────────────────────────────────────────────

function rniRowStyle(pending_value) {
  if (pending_value > 5000) {
    return { borderLeft: '4px solid var(--red)', fontWeight: 600 }
  }
  if (pending_value > 1000) {
    return { borderLeft: '3px solid rgba(var(--red-rgb, 220,60,60), 0.45)' }
  }
  return { borderLeft: '3px solid transparent' }
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onSelect }) {
  return (
    <div style={{
      display:      'flex',
      gap:          0,
      borderBottom: '2px solid var(--border)',
      marginBottom: 24,
    }}>
      {TABS.map(t => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              padding:         '9px 22px',
              border:          'none',
              background:      'transparent',
              cursor:          'pointer',
              fontSize:        13,
              fontWeight:      isActive ? 700 : 500,
              color:           isActive ? 'var(--gold)' : 'var(--text-dim)',
              borderBottom:    isActive ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom:    -2,
              letterSpacing:   '0.01em',
              transition:      'color 0.15s, border-color 0.15s',
              whiteSpace:      'nowrap',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({ supplierSearch, onSupplierChange, minValue, onMinValueChange }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <label style={labelStyle}>
        Supplier
        <input
          type="text"
          placeholder="Search supplier…"
          style={inputStyle}
          value={supplierSearch}
          onChange={e => onSupplierChange(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Min Value
        <input
          type="number"
          placeholder="e.g. 500"
          style={{ ...inputStyle, minWidth: 120 }}
          value={minValue}
          onChange={e => onMinValueChange(e.target.value)}
          min={0}
          step={100}
        />
      </label>
    </div>
  )
}

// ── Table shell ───────────────────────────────────────────────────────────────

function TableShell({ columns, children, footer }) {
  return (
    <div style={{
      background:   'var(--surface)',
      border:       '1px solid var(--border)',
      borderRadius: 10,
      overflow:     'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
              {columns.map(col => (
                <th key={col.key} style={thStyle(col.align)}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {footer && (
            <tfoot style={{ borderTop: '2px solid var(--border2)' }}>
              {footer}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── RNI Table ─────────────────────────────────────────────────────────────────

function RNITable({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px' }}>
        <EmptyState
          icon="check_circle"
          message="All purchase orders are fully invoiced — no clearing balance."
        />
      </div>
    )
  }

  const totalValue = rows.reduce((s, r) => s + r.pending_value, 0)
  const totalPendingQty = rows.reduce((s, r) => s + r.qty_pending, 0)

  const footer = (
    <tr style={{ background: 'var(--surface2)' }}>
      <td colSpan={7} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
        TOTAL RNI ({rows.length} lines)
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
        {fmtNum(totalPendingQty)}
      </td>
      <td />
      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>
        {fmtNum(totalValue)}
      </td>
      <td />
    </tr>
  )

  return (
    <TableShell columns={RNI_COLUMNS} footer={footer}>
      {rows.map((row, i) => {
        const rowStyle = rniRowStyle(row.pending_value)
        return (
          <tr
            key={row.id || i}
            style={{ borderBottom: '1px solid var(--border)', ...rowStyle }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            {/* PO No */}
            <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {row.po_number}
            </td>
            {/* Supplier */}
            <td style={{ padding: '9px 14px', color: 'var(--text)', fontWeight: 500 }}>
              {row.supplier_name}
            </td>
            {/* Item */}
            <td style={{ padding: '9px 14px', color: 'var(--text-mid)', maxWidth: 220 }}>
              {row.item_name || '—'}
            </td>
            {/* Unit */}
            <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12 }}>
              {row.unit || '—'}
            </td>
            {/* Ordered */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 12 }}>
              {fmtNum(row.qty_ordered)}
            </td>
            {/* Received */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', fontSize: 12 }}>
              {fmtNum(row.qty_received)}
            </td>
            {/* Invoiced */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)', fontSize: 12 }}>
              {fmtNum(row.qty_invoiced)}
            </td>
            {/* Pending Qty — highlighted */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)', whiteSpace: 'nowrap' }}>
              {fmtNum(row.qty_pending)}
            </td>
            {/* Unit Rate */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {fmtNum(row.unit_rate)}
            </td>
            {/* Pending Value — highlighted */}
            <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: row.pending_value > 5000 ? 'var(--red)' : row.pending_value > 1000 ? 'var(--yellow)' : 'var(--text)', whiteSpace: 'nowrap' }}>
              {fmtNum(row.pending_value)}
            </td>
            {/* PO Date */}
            <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {fmtDate(row.po_date)}
            </td>
          </tr>
        )
      })}
    </TableShell>
  )
}

// ── INR Table ─────────────────────────────────────────────────────────────────

function INRTable({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px' }}>
        <EmptyState
          icon="verified"
          message="All invoice lines have matching GRN records."
        />
      </div>
    )
  }

  const totalValue = rows.reduce((s, r) => s + r.value, 0)

  const footer = (
    <tr style={{ background: 'var(--surface2)' }}>
      <td colSpan={6} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
        TOTAL INR ({rows.length} lines)
      </td>
      <td />
      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>
        {fmtNum(totalValue)}
      </td>
      <td />
    </tr>
  )

  return (
    <TableShell columns={INR_COLUMNS} footer={footer}>
      {rows.map((row, i) => (
        <tr
          key={row.id || i}
          style={{ borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--yellow)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.background = ''}
        >
          {/* Invoice No */}
          <td style={{ padding: '9px 14px', fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12, whiteSpace: 'nowrap' }}>
            {row.invoice_no || '—'}
          </td>
          {/* Invoice Date */}
          <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
            {fmtDate(row.invoice_date)}
          </td>
          {/* Supplier */}
          <td style={{ padding: '9px 14px', color: 'var(--text)', fontWeight: 500 }}>
            {row.supplier_name}
          </td>
          {/* Item */}
          <td style={{ padding: '9px 14px', color: 'var(--text-mid)', maxWidth: 220 }}>
            {row.item_name || '—'}
          </td>
          {/* Unit */}
          <td style={{ padding: '9px 14px', color: 'var(--text-dim)', fontSize: 12 }}>
            {row.unit || '—'}
          </td>
          {/* Qty */}
          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-mid)', fontSize: 12 }}>
            {fmtNum(row.qty)}
          </td>
          {/* Unit Rate */}
          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
            {fmtNum(row.unit_rate)}
          </td>
          {/* Value */}
          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {fmtNum(row.value)}
          </td>
          {/* Match Status */}
          <td style={{ padding: '9px 14px' }}>
            <MatchBadge status={row.match_status} />
          </td>
        </tr>
      ))}
    </TableShell>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GRIRReconciliation() {
  const [activeTab,      setActiveTab]      = useState('rni')
  const [rniRaw,         setRniRaw]         = useState([])
  const [inrRaw,         setInrRaw]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [minValue,       setMinValue]       = useState('')

  // ── Fetch RNI ──────────────────────────────────────────────────────────────

  const fetchRNI = useCallback(async () => {
    const { data: poLines, error } = await supabase
      .from('purchase_order_lines')
      .select(`
        id, item_name, item_code, unit,
        qty_ordered, qty_received, qty_invoiced, unit_rate,
        purchase_orders!inner(
          id, po_number, order_date, expected_delivery_date, supplier_id,
          suppliers(name)
        )
      `)
      .gt('qty_received', 0)

    if (error) throw error

    const lines = (poLines || [])
      .filter(l => (l.qty_received - (l.qty_invoiced || 0)) > 0.001)
      .map(l => ({
        ...l,
        qty_pending:   l.qty_received - (l.qty_invoiced || 0),
        pending_value: (l.qty_received - (l.qty_invoiced || 0)) * (l.unit_rate || 0),
        supplier_name: l.purchase_orders?.suppliers?.name || '—',
        po_number:     l.purchase_orders?.po_number || '—',
        po_date:       l.purchase_orders?.order_date || null,
        expected_delivery: l.purchase_orders?.expected_delivery_date || null,
      }))

    // Sort by pending_value desc
    lines.sort((a, b) => b.pending_value - a.pending_value)
    setRniRaw(lines)
  }, [])

  // ── Fetch INR ──────────────────────────────────────────────────────────────

  const fetchINR = useCallback(async () => {
    const { data: invoiceLines, error } = await supabase
      .from('purchase_invoice_lines')
      .select(`
        id, item_name, unit, qty, unit_rate, grn_line_id, match_status,
        purchase_invoices!inner(
          id, invoice_no, invoice_date, status, supplier_id,
          suppliers(name)
        )
      `)
      .is('grn_line_id', null)
      .neq('purchase_invoices.status', 'Cancelled')

    if (error) throw error

    const lines = (invoiceLines || []).map(l => ({
      ...l,
      supplier_name: l.purchase_invoices?.suppliers?.name || '—',
      invoice_no:    l.purchase_invoices?.invoice_no    || '—',
      invoice_date:  l.purchase_invoices?.invoice_date  || null,
      value:         (l.qty || 0) * (l.unit_rate || 0),
    }))

    // Sort by invoice_date asc (oldest first — most urgent)
    lines.sort((a, b) => {
      if (!a.invoice_date) return 1
      if (!b.invoice_date) return -1
      return a.invoice_date.localeCompare(b.invoice_date)
    })

    setInrRaw(lines)
  }, [])

  // ── Load all data ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([fetchRNI(), fetchINR()])
    } catch (err) {
      console.error('GRIR fetch error:', err)
      toast.error('Failed to load GRIR data')
    } finally {
      setLoading(false)
    }
  }, [fetchRNI, fetchINR])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const minValueNum = useMemo(
    () => (minValue !== '' ? parseFloat(minValue) : 0),
    [minValue]
  )

  function applyFilters(rows, valueKey) {
    let r = rows
    if (supplierSearch.trim()) {
      const q = supplierSearch.trim().toLowerCase()
      r = r.filter(row => row.supplier_name.toLowerCase().includes(q))
    }
    if (minValueNum > 0) {
      r = r.filter(row => (row[valueKey] || 0) >= minValueNum)
    }
    return r
  }

  const rniFiltered = useMemo(
    () => applyFilters(rniRaw, 'pending_value'),
    [rniRaw, supplierSearch, minValueNum]  // eslint-disable-line react-hooks/exhaustive-deps
  )

  const inrFiltered = useMemo(
    () => applyFilters(inrRaw, 'value'),
    [inrRaw, supplierSearch, minValueNum]  // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── KPIs (based on raw totals — not filtered) ──────────────────────────────

  const kpis = useMemo(() => {
    const rniLines = rniRaw.length
    const rniValue = rniRaw.reduce((s, r) => s + r.pending_value, 0)
    const inrLines = inrRaw.length
    const inrValue = inrRaw.reduce((s, r) => s + r.value, 0)
    return { rniLines, rniValue, inrLines, inrValue }
  }, [rniRaw, inrRaw])

  // ── Export handlers ────────────────────────────────────────────────────────

  function handleExportRNI() {
    if (!rniFiltered.length) { toast.error('No RNI data to export'); return }
    exportXLSX(
      rniFiltered.map(r => ({
        'PO No':          r.po_number,
        'Supplier':       r.supplier_name,
        'Item':           r.item_name || '',
        'Unit':           r.unit || '',
        'Qty Ordered':    r.qty_ordered  || 0,
        'Qty Received':   r.qty_received || 0,
        'Qty Invoiced':   r.qty_invoiced || 0,
        'Pending Qty':    r.qty_pending,
        'Unit Rate':      r.unit_rate    || 0,
        'Pending Value':  r.pending_value,
        'PO Date':        r.po_date      || '',
      })),
      `GRIR_RNI_${dateTag()}`,
      'Received Not Invoiced'
    )
    toast.success('RNI exported')
  }

  function handleExportINR() {
    if (!inrFiltered.length) { toast.error('No INR data to export'); return }
    exportXLSX(
      inrFiltered.map(r => ({
        'Invoice No':   r.invoice_no   || '',
        'Invoice Date': r.invoice_date || '',
        'Supplier':     r.supplier_name,
        'Item':         r.item_name    || '',
        'Unit':         r.unit         || '',
        'Qty':          r.qty          || 0,
        'Unit Rate':    r.unit_rate    || 0,
        'Value':        r.value,
        'Match Status': r.match_status || '',
      })),
      `GRIR_INR_${dateTag()}`,
      'Invoiced Not Received'
    )
    toast.success('INR exported')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading GRIR data…
      </div>
    )
  }

  const isRNI = activeTab === 'rni'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>

      {/* Page Header */}
      <PageHeader
        title="GRIR Reconciliation"
        subtitle="Clearing account reconciliation — received not invoiced vs invoiced not received"
      >
        {isRNI ? (
          <button className="btn btn-secondary" onClick={handleExportRNI}>
            <span className="material-icons md-16">download</span>
            Export RNI
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={handleExportINR}>
            <span className="material-icons md-16">download</span>
            Export INR
          </button>
        )}
        <button className="btn btn-secondary" onClick={fetchAll}>
          <span className="material-icons md-16">refresh</span>
          Refresh
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap:                 16,
        marginBottom:        28,
      }}>
        <KPICard
          label="RNI Lines"
          value={kpis.rniLines}
          icon="local_shipping"
          color={kpis.rniLines > 0 ? 'yellow' : ''}
          onClick={() => setActiveTab('rni')}
        />
        <KPICard
          label="RNI Value"
          value={`$ ${fmtNum(kpis.rniValue)}`}
          icon="account_balance_wallet"
          color={kpis.rniValue > 0 ? 'red' : ''}
          onClick={() => setActiveTab('rni')}
        />
        <KPICard
          label="INR Lines"
          value={kpis.inrLines}
          icon="receipt_long"
          color={kpis.inrLines > 0 ? 'yellow' : ''}
          onClick={() => setActiveTab('inr')}
        />
        <KPICard
          label="INR Value"
          value={`$ ${fmtNum(kpis.inrValue)}`}
          icon="money_off"
          color={kpis.inrValue > 0 ? 'red' : ''}
          onClick={() => setActiveTab('inr')}
        />
      </div>

      {/* Net clearing position callout */}
      {(kpis.rniValue > 0 || kpis.inrValue > 0) && (
        <div style={{
          background:   'var(--surface)',
          border:       '1px solid var(--border)',
          borderLeft:   '4px solid var(--teal)',
          borderRadius: 8,
          padding:      '12px 18px',
          marginBottom: 24,
          display:      'flex',
          alignItems:   'center',
          gap:          16,
          flexWrap:     'wrap',
        }}>
          <span className="material-icons" style={{ color: 'var(--teal)', fontSize: 20 }}>
            balance
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>
            <strong style={{ color: 'var(--text)' }}>Net GRIR Position:</strong>
            {' '}
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
              $ {fmtNum(Math.abs(kpis.rniValue - kpis.inrValue))}
            </span>
            {' '}
            {kpis.rniValue >= kpis.inrValue
              ? 'net received-not-invoiced exposure (company owes suppliers)'
              : 'net invoiced-not-received exposure (unmatched invoices exceed deliveries)'}
          </span>
        </div>
      )}

      {/* Tabs */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* Filter bar */}
      <FilterBar
        supplierSearch={supplierSearch}
        onSupplierChange={setSupplierSearch}
        minValue={minValue}
        onMinValueChange={setMinValue}
      />

      {/* Table for active tab */}
      {isRNI
        ? <RNITable rows={rniFiltered} />
        : <INRTable rows={inrFiltered} />
      }

    </div>
  )
}
