// src/components/ui/DataTable.jsx
//
// Reusable data table with client-side sort, search, and empty state.
//
// Usage:
//   <DataTable
//     columns={[
//       { key: 'name',   label: 'Name',   sortable: true },
//       { key: 'status', label: 'Status', render: (v, row) => <StatusBadge status={v} /> },
//       { key: '_actions', label: '', render: (_, row) => <button onClick={() => edit(row)}>Edit</button> },
//     ]}
//     data={filteredRows}
//     rowKey="id"
//     emptyText="No records found"
//     searchable
//     searchPlaceholder="Search…"
//     onRowClick={(row) => setSelected(row)}
//     stickyHeader
//   />

import { useState, useMemo } from 'react'
import { EmptyState } from './EmptyState'

export function DataTable({
  columns = [],
  data = [],
  rowKey = 'id',
  emptyText = 'No records',
  emptyIcon = 'table_rows',
  searchable = false,
  searchPlaceholder = 'Search…',
  externalSearch,          // if provided, controlled search value
  onSearchChange,          // controlled search handler
  onRowClick,
  loading = false,
  stickyHeader = false,
  compact = false,
  className = '',
}) {
  const [internalSearch, setInternalSearch] = useState('')
  const [sortKey, setSortKey]   = useState(null)
  const [sortDir, setSortDir]   = useState('asc')

  const searchTerm = externalSearch !== undefined ? externalSearch : internalSearch
  const setSearch  = onSearchChange || setInternalSearch

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const processed = useMemo(() => {
    let rows = [...data]

    // Client-side text search across all string-valued columns (if no external search)
    if (externalSearch === undefined && searchTerm) {
      const t = searchTerm.toLowerCase()
      rows = rows.filter(row =>
        columns.some(col => !col.render && String(row[col.key] ?? '').toLowerCase().includes(t))
      )
    }

    // Sort
    if (sortKey) {
      rows.sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ?  1 : -1
        return 0
      })
    }

    return rows
  }, [data, searchTerm, sortKey, sortDir, columns, externalSearch])

  return (
    <div className={`card ${className}`}>
      {searchable && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="form-control"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="table-wrap">
        <table className="stock-table" style={compact ? { fontSize: 12 } : {}}>
          <thead style={stickyHeader ? { position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 } : {}}>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ cursor: col.sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  className={col.className}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {col.sortable && (
                      <span className="material-icons" style={{ fontSize: 14, opacity: sortKey === col.key ? 1 : 0.3 }}>
                        {sortKey === col.key && sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)' }}>
                    <span className="spinner-sm" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : processed.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState icon={emptyIcon} text={emptyText} />
                </td>
              </tr>
            ) : processed.map(row => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : {}}
                onMouseOver={onRowClick ? e => e.currentTarget.style.background = 'var(--surface2)' : undefined}
                onMouseOut={onRowClick  ? e => e.currentTarget.style.background = '' : undefined}
              >
                {columns.map(col => (
                  <td key={col.key} className={col.tdClassName} style={col.tdStyle}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {processed.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
          {processed.length} {processed.length === 1 ? 'record' : 'records'}
          {data.length !== processed.length && ` of ${data.length}`}
        </div>
      )}
    </div>
  )
}
