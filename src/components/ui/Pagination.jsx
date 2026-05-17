// src/components/ui/Pagination.jsx — shared server-side pagination control
export function Pagination({ page, pageSize, total, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const start = page * pageSize + 1
  const end   = Math.min((page + 1) * pageSize, total)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', borderTop: '1px solid var(--border)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-dim)' }}>
        {start.toLocaleString()}–{end.toLocaleString()} of <strong style={{ color: 'var(--text)' }}>{total.toLocaleString()}</strong>
      </span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => onPage(0)} title="First">
          <span className="material-icons" style={{ fontSize: 16 }}>first_page</span>
        </button>
        <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)} title="Previous">
          <span className="material-icons" style={{ fontSize: 16 }}>chevron_left</span>
        </button>
        <span style={{ padding: '3px 12px', background: 'var(--surface2)', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
          {page + 1} / {totalPages}
        </span>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)} title="Next">
          <span className="material-icons" style={{ fontSize: 16 }}>chevron_right</span>
        </button>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => onPage(totalPages - 1)} title="Last">
          <span className="material-icons" style={{ fontSize: 16 }}>last_page</span>
        </button>
      </div>
    </div>
  )
}
