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
/**
 * icon   — Material Icons name for UI chips and preview cards
 * color  — CSS variable string for per-module colour coding
 * amtCol — column holding a monetary amount (null if not applicable)
 */
export const PREFIX_REGISTRY = {
  // ── Inventory ──────────────────────────────────────────────────────────────
  SI:  { label: 'Stock In',             module: 'inventory',   table: 'stock_transactions',         numCol: 'txn_code',        amtCol: null,             icon: 'add_circle',              color: 'var(--teal)',   route: '/module/inventory/stock-in'                        },
  SO:  { label: 'Stock Out',            module: 'inventory',   table: 'stock_transactions',         numCol: 'txn_code',        amtCol: null,             icon: 'remove_circle',           color: 'var(--teal)',   route: '/module/inventory/stock-out'                       },
  ST:  { label: 'Stock Take',           module: 'inventory',   table: 'stock_transactions',         numCol: 'txn_code',        amtCol: null,             icon: 'inventory_2',             color: 'var(--teal)',   route: '/module/inventory/stock-taking'                    },
  PK:  { label: 'Pick List',            module: 'inventory',   table: 'pick_lists',                 numCol: 'pick_no',         amtCol: null,             icon: 'fact_check',              color: 'var(--teal)',   route: '/module/inventory/pick-list'                       },
  CC:  { label: 'Cycle Count',          module: 'inventory',   table: 'cycle_count_sessions',       numCol: 'session_no',      amtCol: null,             icon: 'playlist_add_check',      color: 'var(--blue)',   route: '/module/inventory/cycle-count'                     },

  // ── Procurement ────────────────────────────────────────────────────────────
  SR:  { label: 'Store Requisition',    module: 'procurement', table: 'store_requisitions',         numCol: 'req_number',      amtCol: null,             icon: 'assignment_returned',     color: 'var(--teal)',   route: '/module/inventory/store-requisitions'              },
  MR:  { label: 'Material Request',     module: 'procurement', table: 'material_requests',          numCol: 'mr_number',       amtCol: null,             icon: 'assignment',              color: 'var(--blue)',   route: '/module/procurement/material-requests'             },
  PR:  { label: 'Purchase Requisition', module: 'procurement', table: 'purchase_requisitions',      numCol: 'req_number',      amtCol: null,             icon: 'request_quote',           color: 'var(--blue)',   route: '/module/procurement/purchase-requisitions'         },
  RFQ: { label: 'Request for Quotation',module: 'procurement', table: 'rfq',                        numCol: 'rfq_number',      amtCol: null,             icon: 'quiz',                    color: 'var(--blue)',   route: '/module/procurement/rfq'                           },
  BO:  { label: 'Blanket Order',        module: 'procurement', table: 'blanket_orders',             numCol: 'bo_number',       amtCol: 'total_value',    icon: 'layers',                  color: 'var(--purple)', route: '/module/procurement/blanket-orders'                },
  PO:  { label: 'Purchase Order',       module: 'procurement', table: 'purchase_orders',            numCol: 'po_number',       amtCol: 'total_amount',   icon: 'shopping_bag',            color: 'var(--purple)', route: '/module/procurement/purchase-orders'               },
  GRN: { label: 'Goods Received',       module: 'procurement', table: 'goods_received',             numCol: 'grn_number',      amtCol: null,             icon: 'move_to_inbox',           color: 'var(--green)',  route: '/module/procurement/goods-received'                },
  PI:  { label: 'Purchase Invoice',     module: 'procurement', table: 'purchase_invoices',          numCol: 'invoice_number',  amtCol: 'total_amount',   icon: 'receipt_long',            color: 'var(--gold)',   route: '/module/procurement/invoices'                      },
  PV:  { label: 'Payment Voucher',      module: 'procurement', table: 'payment_vouchers',           numCol: 'voucher_number',  amtCol: 'amount',         icon: 'payments',                color: 'var(--yellow)', route: '/module/procurement/payment-vouchers'              },

  // ── Fuel ──────────────────────────────────────────────────────────────────
  FI:  { label: 'Fuel Issuance',        module: 'fuel',        table: 'fuel_log',                   numCol: 'txn_code',        amtCol: 'total_cost',     icon: 'local_gas_station',       color: 'var(--yellow)', route: '/module/fuel/issuance'                             },
  FD:  { label: 'Fuel Delivery',        module: 'fuel',        table: 'fuel_deliveries',            numCol: 'txn_code',        amtCol: 'total_cost',     icon: 'local_shipping',          color: 'var(--blue)',   route: '/module/fuel/deliveries'                           },
  DS:  { label: 'Dipstick Reading',     module: 'fuel',        table: 'dipstick_logs',              numCol: 'txn_code',        amtCol: null,             icon: 'water_drop',              color: 'var(--teal)',   route: '/module/fuel/dipstick'                             },

  // ── Fleet ─────────────────────────────────────────────────────────────────
  FL:  { label: 'Fleet Vehicle',        module: 'fleet',       table: 'asset_registry',             numCol: 'asset_code',      amtCol: null,             icon: 'directions_car',          color: 'var(--blue)',   route: '/module/fleet/vehicles'                            },
  GN:  { label: 'Generator',            module: 'fleet',       table: 'asset_registry',             numCol: 'asset_code',      amtCol: null,             icon: 'power',                   color: 'var(--green)',  route: '/module/fleet/generators'                          },
  EM:  { label: 'Earth Mover',          module: 'fleet',       table: 'asset_registry',             numCol: 'asset_code',      amtCol: null,             icon: 'construction',            color: 'var(--purple)', route: '/module/fleet/heavy-equipment'                     },
  FT:  { label: 'Asset Fault / Issue',  module: 'fleet',       table: 'asset_issues',               numCol: 'txn_code',        amtCol: null,             icon: 'report_problem',          color: 'var(--red)',    route: '/module/fleet/asset-issues'                        },
  WO:  { label: 'Work Order',           module: 'fleet',       table: 'maintenance_work_orders',    numCol: 'wo_number',       amtCol: 'total_cost',     icon: 'build',                   color: 'var(--blue)',   route: '/module/fleet/work-orders'                         },
  TYR: { label: 'Tyre Record',          module: 'fleet',       table: 'tyre_inventory',             numCol: 'tyre_code',       amtCol: null,             icon: 'tire_repair',             color: 'var(--teal)',   route: '/module/fleet/tyres'                               },
  CE:  { label: 'Contractor Equipment', module: 'fleet',       table: 'contractor_equipment',       numCol: 'ce_code',         amtCol: null,             icon: 'precision_manufacturing', color: 'var(--purple)', route: '/module/fleet/contractor-equipment'                },
  CU:  { label: 'Contractor Usage',     module: 'fleet',       table: 'contractor_usage_logs',      numCol: 'cu_code',         amtCol: 'total_amount',   icon: 'timer',                   color: 'var(--teal)',   route: '/module/fleet/contractor-equipment'                },
  CI:  { label: 'Contractor Invoice',   module: 'fleet',       table: 'journal_entries',            numCol: 'reference',       amtCol: null,             icon: 'receipt',                 color: 'var(--gold)',   route: '/module/accounting/journal-entries'                },

  // ── Asset Registry ────────────────────────────────────────────────────────
  AS:  { label: 'Asset',                module: 'assets',      table: 'asset_registry',             numCol: 'asset_code',      amtCol: 'purchase_value', icon: 'inventory_2',             color: 'var(--gold)',   route: '/module/fleet/registry'                            },
  AR:  { label: 'Asset Reclassification',module:'assets',      table: 'asset_reclassification_log', numCol: 'txn_code',        amtCol: null,             icon: 'swap_horiz',              color: 'var(--teal)',   route: '/module/fleet/reclass-log'                         },

  // ── HR ────────────────────────────────────────────────────────────────────
  LV:  { label: 'Leave Request',        module: 'hr',          table: 'leave_requests',             numCol: 'txn_code',        amtCol: null,             icon: 'event_busy',              color: 'var(--red)',    route: '/module/hr/leave'                                  },
  TR:  { label: 'Travel Request',       module: 'hr',          table: 'travel_requests',            numCol: 'txn_code',        amtCol: null,             icon: 'flight',                  color: 'var(--blue)',   route: '/module/hr/travel'                                 },
  AT:  { label: 'Attendance Record',    module: 'hr',          table: 'employee_attendance',        numCol: 'txn_code',        amtCol: null,             icon: 'schedule',                color: 'var(--teal)',   route: '/module/hr/attendance'                             },
  OT:  { label: 'Overtime Request',     module: 'hr',          table: 'ot_requests',                numCol: 'txn_code',        amtCol: null,             icon: 'more_time',               color: 'var(--yellow)', route: '/module/hr/attendance'                             },
  EMP: { label: 'Employee',             module: 'hr',          table: 'employees',                  numCol: 'employee_number', amtCol: null,             icon: 'person',                  color: 'var(--blue)',   route: '/module/hr/employees'                              },
  ADV: { label: 'Expense Advance',      module: 'hr',          table: 'employee_advances',          numCol: 'advance_number',  amtCol: 'advance_amount', icon: 'account_balance_wallet',  color: 'var(--yellow)', route: '/module/hr/expenses'                               },
  EXP: { label: 'Expense Claim',        module: 'hr',          table: 'expense_claims',             numCol: 'claim_number',    amtCol: 'grand_total',    icon: 'receipt',                 color: 'var(--yellow)', route: '/module/hr/expenses'                               },

  // ── Projects ──────────────────────────────────────────────────────────────
  JOB: { label: 'Job',                  module: 'projects',    table: 'jobs',                       numCol: 'job_number',      amtCol: 'contract_value', icon: 'work',                    color: 'var(--purple)', route: '/module/projects/jobs'                             },

  // ── Campsite ──────────────────────────────────────────────────────────────
  CA:  { label: 'Camp Assignment',      module: 'campsite',    table: 'room_assignments',           numCol: 'txn_code',        amtCol: null,             icon: 'hotel',                   color: 'var(--teal)',   route: '/module/campsite/assignments'                      },
  CT:  { label: 'Camp Transfer',        module: 'campsite',    table: 'room_assignments',           numCol: 'txn_code',        amtCol: null,             icon: 'swap_horiz',              color: 'var(--blue)',   route: '/module/campsite/assignments'                      },
  CV:  { label: 'Camp Vacate',          module: 'campsite',    table: 'room_assignments',           numCol: 'txn_code',        amtCol: null,             icon: 'logout',                  color: 'var(--red)',    route: '/module/campsite/assignments'                      },
  CM:  { label: 'Camp Maintenance',     module: 'campsite',    table: 'camp_maintenance_flags',     numCol: 'txn_code',        amtCol: null,             icon: 'home_repair_service',     color: 'var(--yellow)', route: '/module/campsite/rooms'                            },

  // ── Governance ────────────────────────────────────────────────────────────
  AN:  { label: 'Announcement',         module: 'governance',  table: 'governance_documents',       numCol: 'txn_code',        amtCol: null,             icon: 'campaign',                color: 'var(--blue)',   route: '/module/governance/announcements'                  },
  MO:  { label: 'Internal Memo',        module: 'governance',  table: 'governance_documents',       numCol: 'txn_code',        amtCol: null,             icon: 'mail',                    color: 'var(--teal)',   route: '/module/governance/memos'                          },
  PL:  { label: 'Policy',               module: 'governance',  table: 'governance_documents',       numCol: 'txn_code',        amtCol: null,             icon: 'policy',                  color: 'var(--purple)', route: '/module/governance/policies'                       },

  // ── Accounting ────────────────────────────────────────────────────────────
  JE:  { label: 'Journal Entry',        module: 'accounting',  table: 'journal_entries',            numCol: 'reference',       amtCol: null,             icon: 'account_balance',         color: 'var(--gold)',   route: '/module/accounting/journal-entries'                },

  // ── Logistics ─────────────────────────────────────────────────────────────
  LD:  { label: 'Logistics Delivery',   module: 'logistics',   table: 'deliveries',                 numCol: 'txn_code',        amtCol: null,             icon: 'local_shipping',          color: 'var(--blue)',   route: '/module/logistics/deliveries'                      },

  // ── Petty Cash ────────────────────────────────────────────────────────────
  PCF: { label: 'Petty Cash Fund',      module: 'projects',    table: 'petty_cash_funds',           numCol: 'pcf_code',        amtCol: 'fund_amount',    icon: 'savings',                 color: 'var(--yellow)', route: '/module/projects/petty-cash-funds'                 },
  PCT: { label: 'Petty Cash Top-up',    module: 'projects',    table: 'petty_cash_topups',          numCol: 'pct_code',        amtCol: 'amount',         icon: 'add_card',                color: 'var(--yellow)', route: '/module/projects/petty-cash-funds'                 },
  PCE: { label: 'Petty Cash Expense',   module: 'projects',    table: 'petty_cash_transactions',    numCol: 'pce_code',        amtCol: 'amount',         icon: 'receipt_long',            color: 'var(--yellow)', route: '/module/projects/petty-cash-expenses'              },
  PCR: { label: 'Petty Cash Recon',     module: 'projects',    table: 'petty_cash_reconciliations', numCol: 'pcr_code',        amtCol: null,             icon: 'balance',                 color: 'var(--teal)',   route: '/module/projects/petty-cash-reconciliation'        },
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
