// src/engine/transactionEngine.js
//
// Single source of truth for transaction codes and prefix metadata.
//
// Re-exports generateTxnCode() from utils/txnCode so callers only need
// one import instead of two. Also provides PREFIX_REGISTRY which maps
// every two-to-four-letter prefix to its module, table, route and label.
//
// TxnCodeLink.jsx, TopBar search and any future global-search or
// deep-link feature should derive their table list from PREFIX_REGISTRY
// rather than maintaining their own hardcoded arrays.

export { generateTxnCode, TXN_CODE_REGEX } from '../utils/txnCode'

/**
 * Every known transaction-code prefix.
 * table   — Supabase table name
 * numCol  — column that holds the txn code (for SELECT lookups)
 * module  — ERP module key (matches sidebar ALL_MODULES keys)
 * route   — deep-link to the relevant module page
 * label   — human-readable document type
 */
export const PREFIX_REGISTRY = {
  // ── Inventory ──────────────────────────────────────────────
  SI:  { label: 'Stock In',             module: 'inventory',   table: 'stock_transactions',    numCol: 'txn_code', route: '/module/inventory/stock-in'                    },
  SO:  { label: 'Stock Out',            module: 'inventory',   table: 'stock_transactions',    numCol: 'txn_code', route: '/module/inventory/stock-out'                   },
  ST:  { label: 'Stock Take',           module: 'inventory',   table: 'stock_transactions',    numCol: 'txn_code', route: '/module/inventory/stock-taking'                },

  // ── Procurement ────────────────────────────────────────────
  SR:  { label: 'Store Requisition',    module: 'procurement', table: 'store_requisitions',    numCol: 'req_number', route: '/module/procurement/store-requisitions'      },
  PR:  { label: 'Purchase Requisition', module: 'procurement', table: 'purchase_requisitions', numCol: 'req_number', route: '/module/procurement/purchase-requisitions'   },
  PO:  { label: 'Purchase Order',       module: 'procurement', table: 'purchase_orders',       numCol: 'po_number',  route: '/module/procurement/purchase-orders'         },
  GRN: { label: 'Goods Received',       module: 'procurement', table: 'goods_received',        numCol: 'grn_number', route: '/module/procurement/goods-received'          },

  // ── Fuel ──────────────────────────────────────────────────
  FI:  { label: 'Fuel Issuance',        module: 'fuel',        table: 'fuel_log',              numCol: 'txn_code', route: '/module/fuel/issuance'                        },
  FD:  { label: 'Fuel Delivery',        module: 'fuel',        table: 'fuel_deliveries',       numCol: 'txn_code', route: '/module/fuel/deliveries'                      },
  DS:  { label: 'Dipstick Reading',     module: 'fuel',        table: 'dipstick_logs',         numCol: 'txn_code', route: '/module/fuel/dipstick'                        },

  // ── Fleet ─────────────────────────────────────────────────
  FT:  { label: 'Asset Fault / Issue',  module: 'fleet',       table: 'asset_issues',          numCol: 'txn_code', route: '/module/fleet/asset-issues'                   },

  // ── HR ────────────────────────────────────────────────────
  LV:  { label: 'Leave Request',        module: 'hr',          table: 'leave_requests',        numCol: 'txn_code', route: '/module/hr/leave'                             },
  TR:  { label: 'Travel Request',       module: 'hr',          table: 'travel_requests',       numCol: 'txn_code', route: '/module/hr/travel'                            },
  AT:  { label: 'Attendance Record',    module: 'hr',          table: 'employee_attendance',   numCol: 'txn_code', route: '/module/hr/attendance'                        },
  OT:  { label: 'Overtime Request',     module: 'hr',          table: 'ot_requests',           numCol: 'txn_code', route: '/module/hr/attendance'                        },

  // ── Campsite ──────────────────────────────────────────────
  CA:  { label: 'Camp Assignment',      module: 'campsite',    table: 'room_assignments',      numCol: 'txn_code', route: '/module/campsite/assignments'                  },
  CT:  { label: 'Camp Transfer',        module: 'campsite',    table: 'room_assignments',      numCol: 'txn_code', route: '/module/campsite/assignments'                  },
  CV:  { label: 'Camp Vacate',          module: 'campsite',    table: 'room_assignments',      numCol: 'txn_code', route: '/module/campsite/assignments'                  },
  CM:  { label: 'Camp Maintenance',     module: 'campsite',    table: 'camp_maintenance_flags', numCol: 'txn_code', route: '/module/campsite/rooms'                      },

  // ── Governance ────────────────────────────────────────────
  MO:  { label: 'Internal Memo',        module: 'governance',  table: 'governance_documents',  numCol: 'txn_code', route: '/module/governance/memos'                     },

  // ── Accounting ────────────────────────────────────────────
  JE:  { label: 'Journal Entry',        module: 'accounting',  table: 'journal_entries',       numCol: 'reference', route: '/module/accounting/journal-entries'          },

  // ── Logistics ─────────────────────────────────────────────
  LD:  { label: 'Logistics Delivery',   module: 'logistics',   table: 'deliveries',            numCol: 'txn_code', route: '/module/logistics/deliveries'                 },
}

/**
 * Given any transaction code (e.g. "SR-2026-00012"), return its registry entry.
 * Returns null for unknown prefixes.
 */
export function resolvePrefix(code) {
  if (!code) return null
  const prefix = code.split('-')[0]
  return PREFIX_REGISTRY[prefix] || null
}

/**
 * Build the SEARCH_TABLES array that TopBar / searchEngine use.
 * Returns deduplicated by table+numCol so scanning doesn't double-query.
 */
export function getSearchTables() {
  const seen = new Set()
  return Object.entries(PREFIX_REGISTRY).reduce((acc, [prefix, meta]) => {
    const key = `${meta.table}|${meta.numCol}`
    if (!seen.has(key)) {
      seen.add(key)
      acc.push({ table: meta.table, numCol: meta.numCol, label: meta.label, route: meta.route, prefix })
    }
    return acc
  }, [])
}
