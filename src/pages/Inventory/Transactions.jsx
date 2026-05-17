// src/pages/Inventory/Transactions.jsx
// Server-side paginated. Queries transactions table directly;
// uses InventoryContext only for deleteTransaction (mutation).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useInventory }     from '../../contexts/InventoryContext'
import { useCanDelete }     from '../../hooks/usePermission'
import { supabase }         from '../../lib/supabase'
import TxnCodeBadge         from '../../components/TxnCodeBadge'
import { TXN_CODE_REGEX }   from '../../utils/txnCode'
import toast                from 'react-hot-toast'
import { PageHeader, EmptyState, Pagination } from '../../components/ui'

const PAGE_SIZE = 50
const isTxnCode = (str) => str && new RegExp(`^${TXN_CODE_REGEX.source.replace('\\b', '')}$`).test(str.trim())

const TYPE_ICON = { IN: 'inventory_2', OUT: 'assignment_return', ADJUSTMENT: 'adjust', GRN: 'move_to_inbox' }
const TYPE_COLOR = { IN: 'var(--green)', OUT: 'var(--red)', ADJUSTMENT: 'var(--yellow)', GRN: 'var(--purple)' }

export default function Transactions() {
  const { deleteTransaction } = useInventory()
  const canDelete = useCanDelete('inventory', 'transactions')

  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [tableLoading, setTableLoading] = useState(true)

  const [filterType, setFilterType] = useState('ALL')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm,  setSearchTerm]  = useState('')
  const debounceRef = useRef(null)

  const handleSearchChange = (v) => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 400)
  }

  const fetchPage = useCallback(async (p = 0) => {
    setTableLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('date',       { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filterType !== 'ALL') q = q.eq('type', filterType)
    if (dateFrom)             q = q.gte('date', dateFrom)
    if (dateTo)               q = q.lte('date', dateTo)
    if (searchTerm.trim())    q = q.ilike('item_name', `%${searchTerm}%`)

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0); setPage(p) }
    setTableLoading(false)
  }, [filterType, dateFrom, dateTo, searchTerm])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const handleDelete = async (tx) => {
    if (!window.confirm(`Delete this transaction? The item balance will be reversed.\n\n${tx.type}: ${tx.item_name} (${tx.qty} units)`)) return
    await deleteTransaction(tx)
    toast.success('Transaction deleted, balance updated')
    await fetchPage(page)
  }

  const clearFilters = () => {
    setFilterType('ALL'); setDateFrom(''); setDateTo(''); setSearchInput(''); setSearchTerm('')
  }

  return (
    <div>
      <PageHeader title="Transactions" />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 220 }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-dim)' }}>search</span>
          <input
            type="text" placeholder="Search items…" value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 36px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control" style={{ width: 140 }}>
          <option value="ALL">All Types</option>
          <option value="IN">Stock In</option>
          <option value="OUT">Stock Out</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="GRN">GRN</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-control" style={{ width: 140 }} />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="form-control" style={{ width: 140 }} />
        {(dateFrom || dateTo || searchInput || filterType !== 'ALL') && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
            <span className="material-icons">clear</span> Clear
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Item</th><th>Category</th>
                <th>Qty</th><th>Reference</th><th>User</th><th>Notes</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="9"><EmptyState icon="receipt_long" message="No transactions found" /></td></tr>
              ) : rows.map(tx => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(tx.date).toLocaleDateString()}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: TYPE_COLOR[tx.type] || 'var(--text-mid)' }}>
                      <span className="material-icons">{TYPE_ICON[tx.type] || 'receipt'}</span>
                      {tx.type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{tx.item_name}</td>
                  <td>{tx.category}</td>
                  <td style={{ fontWeight: 700, color: tx.type === 'OUT' ? 'var(--red)' : 'var(--green)' }}>
                    {tx.type === 'OUT' ? '-' : '+'}{tx.qty}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {(() => {
                      const ref = tx.reference || tx.delivered_by || tx.issued_to || tx.done_by
                      if (!ref) return <span style={{ color: 'var(--text-dim)' }}>—</span>
                      return isTxnCode(ref) ? <TxnCodeBadge code={ref.trim()} /> : <span style={{ color: 'var(--text-dim)' }}>{ref}</span>
                    })()}
                  </td>
                  <td style={{ fontSize: 12 }}>{tx.user_name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 200 }}>{tx.notes || '—'}</td>
                  <td>
                    {canDelete && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tx)}>
                        <span className="material-icons">delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={fetchPage} />
      </div>
    </div>
  )
}
