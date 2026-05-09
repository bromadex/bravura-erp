// src/components/ui/StatusBadge.jsx
// Single source of truth for status → badge colour mapping.
// Covers every status value used across all ERP modules.

const STATUS_MAP = {
  // Approval / Workflow
  pending:              'badge-yellow',
  submitted:            'badge-blue',
  approved:             'badge-green',
  rejected:             'badge-red',
  cancelled:            'badge-red',
  draft:                'badge-blue',
  review:               'badge-yellow',

  // Procurement
  fulfilled:            'badge-green',
  partially_fulfilled:  'badge-yellow',
  ordered:              'badge-gold',
  partially_received:   'badge-yellow',
  received:             'badge-green',
  closed:               'badge-dim',

  // HR / Attendance
  present:              'badge-green',
  absent:               'badge-red',
  late:                 'badge-yellow',
  leave:                'badge-purple',
  holiday:              'badge-blue',
  active:               'badge-green',
  inactive:             'badge-dim',
  terminated:           'badge-red',

  // Inventory
  in_stock:             'badge-green',
  low_stock:            'badge-yellow',
  out_of_stock:         'badge-red',
  normal:               'badge-green',

  // Campsite
  vacant:               'badge-green',
  occupied:             'badge-red',
  occupied_on_leave:    'badge-yellow',
  on_leave:             'badge-yellow',
  full:                 'badge-red',
  maintenance:          'badge-yellow',
  checked_out:          'badge-dim',
  transferred:          'badge-blue',

  // Fleet / Assets
  working:              'badge-green',
  breakdown:            'badge-red',
  in_progress:          'badge-yellow',
  resolved:             'badge-green',
  open:                 'badge-yellow',
  grounded:             'badge-red',

  // Logistics / Delivery
  in_transit:           'badge-blue',
  delivered:            'badge-green',
  short_delivered:      'badge-yellow',

  // Fuel
  diesel:               'badge-gold',
  petrol:               'badge-blue',
}

const LABEL_OVERRIDES = {
  occupied_on_leave: 'On Leave',
  partially_fulfilled: 'Part. Fulfilled',
  partially_received: 'Part. Received',
  in_progress: 'In Progress',
  in_transit: 'In Transit',
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  short_delivered: 'Short Delivered',
  checked_out: 'Checked Out',
}

function prettyLabel(status) {
  if (!status) return '—'
  if (LABEL_OVERRIDES[status]) return LABEL_OVERRIDES[status]
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function StatusBadge({ status, label, className = '' }) {
  const key = (status || '').toLowerCase()
  const cls = STATUS_MAP[key] || 'badge-dim'
  return (
    <span className={`badge ${cls} ${className}`}>
      {label ?? prettyLabel(status)}
    </span>
  )
}
