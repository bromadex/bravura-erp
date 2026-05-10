// src/components/ui/StatusBadge.jsx
//
// Status badge that first checks DB-driven statuses (from MasterDataContext),
// then falls back to the hardcoded STATUS_MAP for backward compatibility.
// The fallback ensures badges always render even before DB data loads.

import { useMemo } from 'react'
import { useMasterData } from '../../contexts/MasterDataContext'

// ── Hardcoded fallback (used when DB statuses not yet loaded) ──
const STATUS_MAP = {
  pending: 'badge-yellow', submitted: 'badge-blue', approved: 'badge-green',
  rejected: 'badge-red', cancelled: 'badge-red', draft: 'badge-blue',
  review: 'badge-yellow', fulfilled: 'badge-green', partially_fulfilled: 'badge-yellow',
  ordered: 'badge-gold', partially_received: 'badge-yellow', received: 'badge-green',
  closed: 'badge-dim', present: 'badge-green', absent: 'badge-red', late: 'badge-yellow',
  leave: 'badge-purple', holiday: 'badge-blue', active: 'badge-green',
  inactive: 'badge-dim', terminated: 'badge-red', in_stock: 'badge-green',
  low_stock: 'badge-yellow', out_of_stock: 'badge-red', normal: 'badge-green',
  vacant: 'badge-green', occupied: 'badge-red', occupied_on_leave: 'badge-yellow',
  on_leave: 'badge-yellow', full: 'badge-red', maintenance: 'badge-yellow',
  checked_out: 'badge-dim', transferred: 'badge-blue', working: 'badge-green',
  breakdown: 'badge-red', in_progress: 'badge-yellow', resolved: 'badge-green',
  open: 'badge-yellow', grounded: 'badge-red', in_transit: 'badge-blue',
  delivered: 'badge-green', short_delivered: 'badge-yellow', diesel: 'badge-gold',
  petrol: 'badge-blue', success: 'badge-green', failed: 'badge-red',
}

const LABEL_OVERRIDES = {
  occupied_on_leave: 'On Leave', partially_fulfilled: 'Part. Fulfilled',
  partially_received: 'Part. Received', in_progress: 'In Progress',
  in_transit: 'In Transit', in_stock: 'In Stock', low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock', short_delivered: 'Short Delivered', checked_out: 'Checked Out',
}

function prettyLabel(status, dbStatuses) {
  if (!status) return '—'
  const dbEntry = dbStatuses?.find(s => s.key === (status || '').toLowerCase())
  if (dbEntry?.label) return dbEntry.label
  if (LABEL_OVERRIDES[status]) return LABEL_OVERRIDES[status]
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function useSafeStatuses() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { statuses } = useMasterData()
    return statuses || []
  } catch {
    return []
  }
}

export function StatusBadge({ status, label, className = '' }) {
  const dbStatuses = useSafeStatuses()
  const key = (status || '').toLowerCase()

  const cls = useMemo(() => {
    const dbEntry = dbStatuses.find(s => s.key === key)
    return dbEntry?.badge_class || STATUS_MAP[key] || 'badge-dim'
  }, [key, dbStatuses])

  return (
    <span className={`badge ${cls} ${className}`}>
      {label ?? prettyLabel(status, dbStatuses)}
    </span>
  )
}
