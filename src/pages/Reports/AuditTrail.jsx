// src/pages/Reports/AuditTrail.jsx
// Queries hr_audit_logs which is the single audit table across all modules.
// Columns: id, user_name, action, entity_type, entity_id, entity_name,
//          module, txn_code, old_values, new_values, created_at

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

const MODULE_COLOR = {
  inventory:   'var(--blue)',
  procurement: 'var(--purple)',
  fuel:        'var(--gold)',
  fleet:       'var(--yellow)',
  hr:          'var(--green)',
  campsite:    'var(--teal)',
  logistics:   '#f97316',
  accounting:  'var(--red)',
  governance:  '#818cf8',
  connect:     'var(--teal)',
  system:      'var(--text-dim)',
}

const MODULE_ICON = {
  inventory:   'inventory_2',
  procurement: 'shopping_cart',
  fuel:        'local_gas_station',
  fleet:       'directions_car',
  hr:          'people',
  campsite:    'hotel',
  logistics:   'local_shipping',
  accounting:  'receipt_long',
  governance:  'policy',
  connect:     'forum',
  system:      'settings',
}

const TODAY           = new Date().toISOString().split('T')[0]
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

export default function AuditTrail() {
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [module,   setModule]   = useState('ALL')
  const [dateFrom, setDateFrom] = useState(THIRTY_DAYS_AGO)
  const [dateTo,   setDateTo]   = useState(TODAY)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      // Query both audit tables and merge
      let hrQuery = supabase
        .from('hr_audit_logs')
        .select('id, user_name, action, entity_type, entity_id, entity_name, module, txn_code, created_at')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(400)
      if (module !== 'ALL') hrQuery = hrQuery.eq('module', module)

      const legacyQuery = supabase
        .from('audit_logs')
        .select('id, user_name, action, entity_type, entity_id, entity_name, created_at')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(100)

      const [hrRes, legacyRes] = await Promise.all([hrQuery, legacyQuery])

      const hrRows      = (hrRes.data     || [])
      const legacyRows  = (legacyRes.data || []).map(r => ({ ...r, module: r.module || 'system', txn_code: '' }))

      // Merge and sort by created_at descending, deduplicate by id
      const seenIds = new Set()
      const merged  = [...hrRows, ...legacyRows]
        .filter(r => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 500)

      setRows(merged)
      setLoading(false)
    }
    load()
  }, [dateFrom, dateTo, module])

  const filtered = useMemo(() => {
    if (!search) return rows
    const t = search.toLowerCase()
    return rows.filter(r =>
      r.user_name?.toLowerCase().includes(t) ||
      r.action?.toLowerCase().includes(t) ||
      r.entity_name?.toLowerCase().includes(t) ||
      r.entity_type?.toLowerCase().includes(t) ||
      r.txn_code?.toLowerCase().includes(t)
    )
  }, [rows, search])

  const exportXLSX = () => {
    const wb   = XLSX.utils.book_new()
    const data  = filtered.map(r => ({
      'Date/Time':   new Date(r.created_at).toLocaleString('en-GB'),
      'User':        r.user_name || '—',
      'Action':      r.action    || '—',
      'Module':      r.module    || '—',
      'Record Type': r.entity_type || '—',
      'Record Name': r.entity_name || '—',
      'Txn Code':    r.txn_code  || '—',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Audit Trail')
    XLSX.writeFile(wb, `audit-trail-${TODAY}.xlsx`)
  }

  const modules = ['ALL', 'hr', 'procurement', 'inventory', 'fuel', 'fleet', 'campsite', 'logistics', 'governance', 'accounting', 'connect', 'system']

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} records shown</div>
        </div>
        <button className="btn btn-secondary" onClick={exportXLSX}>
          <span className="material-icons">table_view</span> Export
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <input type="date" className="form-control" style={{ width: 'auto' }}
          value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ lineHeight: '38px', color: 'var(--text-dim)', fontSize: 13 }}>to</span>
        <input type="date" className="form-control" style={{ width: 'auto' }}
          value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input className="form-control" placeholder="Search user, action, record…" style={{ flex: 1, minWidth: 160 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ width: 'auto' }}
          value={module} onChange={e => setModule(e.target.value)}>
          {modules.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="empty-state">Loading audit records…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.25 }}>manage_search</span>
          <p>No records found.</p>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            Audit entries are written by each module when records are created, updated or approved.
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>Record</th>
                <th>Txn Code</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const color = MODULE_COLOR[r.module] || 'var(--text-dim)'
                const icon  = MODULE_ICON[r.module]  || 'circle'
                return (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>
                      {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.user_name || '—'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color, background: `${color}18`, border: `1px solid ${color}44`, padding: '2px 8px', borderRadius: 10 }}>
                        <span className="material-icons" style={{ fontSize: 12 }}>{icon}</span>
                        {r.module || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.action || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      <div>{r.entity_type || '—'}</div>
                      {r.entity_name && <div style={{ color: 'var(--text)', fontWeight: 500 }}>{r.entity_name}</div>}
                    </td>
                    <td>
                      {r.txn_code ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)', padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace' }}>
                          {r.txn_code}
                        </span>
                      ) : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
