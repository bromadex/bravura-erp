// src/pages/Inventory/Transactions.jsx
// Phase 3 — reads from stock_ledger_entries (immutable SLE journal).
// SLEs cannot be deleted; delete button removed.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useInventory }   from '../../contexts/InventoryContext'
import { supabase }       from '../../lib/supabase'
import TxnCodeBadge       from '../../components/TxnCodeBadge'
import { TXN_CODE_REGEX } from '../../utils/txnCode'
import { PageHeader, EmptyState, Pagination } from '../../components/ui'

const PAGE_SIZE = 50
const isTxnCode = str => str && new RegExp(`^${TXN_CODE_REGEX.source.replace('\\b', '')}$`).test(str.trim())

const TYPE_ICON = {
  Receipt:        'move_to_inbox',
  Issue:          'assignment_return',
  Transfer:       'swap_horiz',
  Reconciliation: 'adjust',
  Opening:        'inventory',
  Adjustment:     'tune',
}
const TYPE_COLOR = {
  Receipt:        'var(--green)',
  Issue:          'var(--red)',
  Transfer:       'var(--blue)',
  Reconciliation: 'var(--yellow)',
  Opening:        'var(--teal)',
  Adjustment:     'var(--purple)',
}
const VOUCHER_LABEL = {
  StockIn:             'Stock In',
  StockOut:            'Stock Out',
  PurchaseReceipt:     'GRN Receipt',
  StoreRequisition:    'Store Req.',
  StockTransfer:       'Transfer',
  StockReconciliation: 'Reconciliation',
  OpeningStock:        'Opening',
}

export default function Transactions() {
  const { items: allItems } = useInventory()

  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [tableLoading, setTableLoading] = useState(true)

  const [filterType,  setFilterType]  = useState('ALL')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm,  setSearchTerm]  = useState('')
  const debounceRef = useRef(null)

  const handleSearchChange = v => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 400)
  }

  const fetchPage = useCallback(async (p = 0) => {
    setTableLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = supabase
      .from('stock_ledger_entries')
      .select(
        'id, item_id, warehouse_id, posting_datetime, voucher_type, transaction_type, voucher_no, actual_qty, qty_after_transaction, incoming_rate, outgoing_rate, created_by, items(name, category, unit)',
        { count: 'exact' }
      )
      .eq('is_cancelled', false)
      .order('posting_datetime', { ascending: false })
      .range(from, to)

    if (filterType !== 'ALL') q = q.eq('transaction_type', filterType)
    if (dateFrom) q = q.gte('posting_datetime', dateFrom)
    if (dateTo)   q = q.lte('posting_datetime', `${dateTo}T23:59:59`)

    if (searchTerm.trim()) {
      const matchingIds = allItems
        .filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(i => i.id)
      q = matchingIds.length > 0
        ? q.in('item_id', matchingIds)
        : q.in('item_id', ['__no_match__'])
    }

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0); setPage(p) }
    setTableLoading(false)
  }, [filterType, dateFrom, dateTo, searchTerm, allItems])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const clearFilters = () => {
    setFilterType('ALL'); setDateFrom(''); setDateTo(''); setSearchInput(''); setSearchTerm('')
  }

  return (
    <div>
      <PageHeader title="Stock Ledger" />

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 220 }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-dim)' }}>search</span>
          <input
            type="text" placeholder="Search items…" value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 36px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control" style={{ width: 165 }}>
          <option value="ALL">All Types</option>
          <option value="Receipt">Receipt (In)</option>
          <option value="Issue">Issue (Out)</option>
          <option value="Transfer">Transfer</option>
          <option value="Reconciliation">Reconciliation</option>
          <option value="Opening">Opening Stock</option>
          <option value="Adjustment">Adjustment</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-control" style={{ width: 140 }} />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="form-control" style={{ width: 140 }} />
        {(dateFrom || dateTo || searchInput || filterType !== 'ALL') && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
            <span className="material-icons">clear</span> Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Type</th>
                <th>Item</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Balance After</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th>Voucher</th>
                <th>Posted By</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="9"><EmptyState icon="receipt_long" message="No ledger entries found" /></td></tr>
              ) : rows.map(sle => {
                const txType   = sle.transaction_type || 'Adjustment'
                const qty      = sle.actual_qty ?? 0
                const isIn     = qty > 0
                const rate     = isIn ? (sle.incoming_rate ?? 0) : (sle.outgoing_rate ?? 0)
                const itemName = sle.items?.name || sle.item_id
                const category = sle.items?.category || '—'
                const dt       = sle.posting_datetime
                  ? new Date(sle.posting_datetime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'
                return (
                  <tr key={sle.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{dt}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: TYPE_COLOR[txType] || 'var(--text-dim)' }}>
                        <span className="material-icons" style={{ fontSize: 16 }}>{TYPE_ICON[txType] || 'receipt'}</span>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          {VOUCHER_LABEL[sle.voucher_type] || txType}
                        </span>
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemName}
                    </td>
                    <td style={{ fontSize: 12 }}>{category}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: isIn ? 'var(--green)' : 'var(--red)' }}>
                      {isIn ? '+' : ''}{qty}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {sle.qty_after_transaction != null ? Number(sle.qty_after_transaction).toFixed(2) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {rate > 0 ? rate.toFixed(2) : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {sle.voucher_no
                        ? isTxnCode(sle.voucher_no)
                          ? <TxnCodeBadge code={sle.voucher_no.trim()} />
                          : <span style={{ color: 'var(--text-dim)' }}>{sle.voucher_no}</span>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize: 12 }}>{sle.created_by || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={fetchPage} />
      </div>
    </div>
  )
}
