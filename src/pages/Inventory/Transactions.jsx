import { useState } from 'react'
import { useInventory } from '../../contexts/InventoryContext'
import { useCanDelete } from '../../hooks/usePermission'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import { TXN_CODE_REGEX } from '../../utils/txnCode'
import toast from 'react-hot-toast'

const isTxnCode = (str) => str && new RegExp(`^${TXN_CODE_REGEX.source.replace('\\b', '')}$`).test(str.trim())

export default function Transactions() {
  const { transactions, loading, deleteTransaction, fetchAll } = useInventory()
  const canDelete = useCanDelete('inventory', 'transactions')

  const [filterType, setFilterType] = useState('ALL')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = transactions.filter(tx => {
    if (filterType !== 'ALL' && tx.type !== filterType) return false
    if (search && !tx.item_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && tx.date < dateFrom) return false
    if (dateTo && tx.date > dateTo) return false
    return true
  })

  const getTypeIcon = (type) => {
    switch (type) {
      case 'IN': return 'inventory_2'
      case 'OUT': return 'assignment_return'
      case 'ADJUSTMENT': return 'adjust'
      case 'GRN': return 'move_to_inbox'
      default: return 'receipt'
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'IN': return 'var(--green)'
      case 'OUT': return 'var(--red)'
      case 'ADJUSTMENT': return 'var(--yellow)'
      case 'GRN': return 'var(--purple)'
      default: return 'var(--text-mid)'
    }
  }

  const handleDelete = async (tx) => {
    if (window.confirm(`Delete this transaction? The item balance will be reversed.\n\n${tx.type}: ${tx.item_name} (${tx.qty} units)`)) {
      await deleteTransaction(tx)
      toast.success('Transaction deleted, balance updated')
      await fetchAll()
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 200 }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-dim)' }}>
            search
          </span>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 36px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}
          />
        </div>

        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control" style={{ width: 130 }}>
          <option value="ALL">All Types</option>
          <option value="IN">Stock In</option>
          <option value="OUT">Stock Out</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="GRN">GRN</option>
        </select>

        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-control" style={{ width: 130 }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="form-control" style={{ width: 130 }} />

        {(dateFrom || dateTo || search !== '' || filterType !== 'ALL') && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
              setSearch('')
              setFilterType('ALL')
            }}
          >
            <span className="material-icons">clear</span> Clear
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Item</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Reference</th>
              <th>User</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>
                  No transactions found
                </td>
              </tr>
            ) : (
              filtered.map(tx => (
                <tr key={tx.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(tx.date).toLocaleDateString()}
                  </td>

                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: getTypeColor(tx.type) }}>
                      <span className="material-icons">{getTypeIcon(tx.type)}</span>
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
                      return isTxnCode(ref)
                        ? <TxnCodeBadge code={ref.trim()} />
                        : <span style={{ color: 'var(--text-dim)' }}>{ref}</span>
                    })()}
                  </td>

                  <td style={{ fontSize: 12 }}>
                    {tx.user_name || '-'}
                  </td>

                  <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 200 }}>
                    {tx.notes || '-'}
                  </td>

                  <td>
                    {canDelete && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tx)}>
                        <span className="material-icons">delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
