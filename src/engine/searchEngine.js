// src/engine/searchEngine.js
//
// Global search hook — searches both transaction codes AND entity names
// across all modules. The TopBar currently has inline txn-code-only
// search; this hook extends it to keyword search and can be swapped in.
//
// useGlobalSearch() returns { results, loading, search }
// where search(query) is already debounced (300 ms).
//
// Result shape:
//   { type: 'txn'|'entity', code, label, route, status, module }

import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getSearchTables } from './transactionEngine'

// Tables searched by keyword (name / description / code)
const KEYWORD_SOURCES = [
  { table: 'items',      cols: ['name', 'code'],             label: 'Inventory Item', module: 'inventory',   route: '/module/inventory/stock-balance'              },
  { table: 'employees',  cols: ['name', 'employee_number'],  label: 'Employee',       module: 'hr',          route: '/module/hr/employees'                          },
  { table: 'suppliers',  cols: ['name', 'contact_person'],   label: 'Supplier',       module: 'procurement', route: '/module/procurement/suppliers'                 },
  { table: 'vehicles',   cols: ['registration', 'make'],     label: 'Vehicle',        module: 'fleet',       route: '/module/fleet/vehicles'                        },
  { table: 'accounts',   cols: ['name', 'code'],             label: 'Account',        module: 'accounting',  route: '/module/accounting/chart-of-accounts'          },
  { table: 'camp_rooms', cols: ['code', 'name'],             label: 'Camp Room',      module: 'campsite',    route: '/module/campsite/rooms'                        },
  { table: 'governance_documents', cols: ['title'],          label: 'Document',       module: 'governance',  route: '/module/governance/announcements'              },
]

// Looks like a txn code prefix: 2+ uppercase letters optionally followed by dash+digits
const TXN_PATTERN = /^[A-Z]{2,4}(-\d*)?$/i

export function useGlobalSearch() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  const runSearch = useCallback(async (raw) => {
    const q = raw.trim()
    if (q.length < 2) { setResults([]); return }

    setLoading(true)
    try {
      const upper  = q.toUpperCase()
      const isTxn  = TXN_PATTERN.test(upper) || /^[A-Z]{2,4}-\d/.test(upper)
      const promises = []

      if (isTxn) {
        // ── Transaction code search ─────────────────────────
        for (const { table, numCol, label, route } of getSearchTables()) {
          promises.push(
            supabase
              .from(table)
              .select(`${numCol}, status`)
              .ilike(numCol, `${upper}%`)
              .limit(6)
              .then(({ data }) =>
                (data || []).map(r => ({
                  type: 'txn',
                  code:   r[numCol],
                  label,
                  route,
                  status: r.status || '',
                  module: route.split('/')[2] || '',
                }))
              )
          )
        }
      } else {
        // ── Keyword / entity search ─────────────────────────
        for (const { table, cols, label, module, route } of KEYWORD_SOURCES) {
          const orFilter = cols.map(c => `${c}.ilike.%${q}%`).join(',')
          promises.push(
            supabase
              .from(table)
              .select([...cols, 'id'].join(','))
              .or(orFilter)
              .limit(5)
              .then(({ data }) =>
                (data || []).map(r => ({
                  type:   'entity',
                  code:   r[cols[0]],
                  label:  `${label}: ${r[cols[0]]}`,
                  route,
                  status: '',
                  module,
                }))
              )
          )
        }
      }

      const nested = await Promise.all(promises)
      setResults(nested.flat().filter(r => r.code).slice(0, 20))
    } catch (err) {
      console.error('[searchEngine] search error:', err?.message || err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const search = useCallback((query) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(query), 300)
  }, [runSearch])

  const clear = useCallback(() => setResults([]), [])

  return { results, loading, search, clear }
}
