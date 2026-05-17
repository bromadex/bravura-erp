// src/pages/Reports/AuditTrail.jsx
// Queries hr_audit_logs (primary) + audit_logs (legacy) with server-side
// pagination. Replaces the previous hard-coded .limit(400)/.limit(100).

import { useState, useEffect, useCallback } from 'react'
import { supabase }         from '../../lib/supabase'
import { exportXLSX }       from '../../engine/reportingEngine'
import { Pagination }       from '../../components/ui'

const PAGE_SIZE = 100

const MODULE_COLOR = {
  inventory: 'var(--blue)', procurement: 'var(--purple)', fuel: 'var(--gold)',
  fleet: 'var(--yellow)', hr: 'var(--green)', campsite: 'var(--teal)',
  logistics: '#f97316', accounting: 'var(--red)', governance: '#818cf8',
  connect: 'var(--teal)', projects: '#22d3ee', system: 'var(--text-dim)',
}
const MODULE_ICON = {
  inventory: 'inventory_2', procurement: 'shopping_cart', fuel: 'local_gas_station',
  fleet: 'directions_car', hr: 'people', campsite: 'hotel',
  logistics: 'local_shipping', accounting: 'receipt_long', governance: 'policy',
  connect: 'forum', projects: 'folder_open', system: 'settings',
}

const TODAY           = new Date().toISOString().split('T')[0]
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

const MODULES = ['ALL', 'hr', 'procurement', 'inventory', 'fuel', 'fleet', 'campsite', 'logistics', 'governance', 'accounting', 'projects', 'connect', 'system']

export default function AuditTrail() {
  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [dateFrom,     setDateFrom]     = useState(THIRTY_DAYS_AGO)
  const [dateTo,       setDateTo]       = useState(TODAY)
  const [actionFilter, setActionFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [expandedRow,  setExpandedRow]  = useState(null)

  const fetchPage = useCallback(async (p = 0) => {
    setLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = supabase
      .from('hr_audit_logs')
      .select('id, user_name, action, entity_type, entity_id, entity_name, module, txn_code, old_values, new_values, status, details, created_at', { count: 'exact' })
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (moduleFilter !== 'ALL')  q = q.eq('module', moduleFilter)
    if (actionFilter !== 'ALL')  q = q.eq('action', actionFilter)
    if (statusFilter !== 'ALL')  q = q.eq('status', statusFilter)
    if (search.trim())           q = q.or(`user_name.ilike.%${search}%,action.ilike.%${search}%,entity_name.ilike.%${search}%,entity_type.ilike.%${search}%,txn_code.ilike.%${search}%`)

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0); setPage(p) }
    setLoading(false)
  }, [dateFrom, dateTo, moduleFilter, actionFilter, statusFilter, search])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const handleExport = async () => {
    let q = supabase
      .from('hr_audit_logs')
      .select('user_name, action, module, entity_type, entity_name, txn_code, status, details, created_at')
      .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
    if (moduleFilter !== 'ALL') q = q.eq('module', moduleFilter)
    if (actionFilter !== 'ALL') q = q.eq('action', actionFilter)
    const { data } = await q
    if (!data?.length) return
    exportXLSX(data.map(r => ({
      'Date/Time':   new Date(r.created_at).toLocaleString('en-GB'),
      'User':        r.user_name   || '—',
      'Action':      r.action      || '—',
      'Module':      r.module      || '—',
      'Record Type': r.entity_type || '—',
      'Record Name': r.entity_name || '—',
      'Txn Code':    r.txn_code    || '—',
      'Status':      r.status      || '—',
      'Details':     r.details     || '—',
    })), `audit-trail-${TODAY}`, 'Audit Trail')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{total.toLocaleString()} records in range</div>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_view</span> Export
        </button>
      </div>

      {/* Status quick-filter */}
      <div className="btn-group" style={{ marginBottom: 12 }}>
        <button className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter('ALL')}>All</button>
        <button className={`btn btn-sm ${statusFilter === 'failed' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setStatusFilter('failed')}>
          <span className="material-icons" style={{ fontSize: 14 }}>error</span> Failed Only
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <input type="date" className="form-control" style={{ width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{ lineHeight: '38px', color: 'var(--text-dim)', fontSize: 13 }}>to</span>
        <input type="date" className="form-control" style={{ width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <input className="form-control" placeholder="Search user, action, record…" style={{ flex: 1, minWidth: 160 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ width: 'auto' }} value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
          {MODULES.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Modules' : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
        </select>
        <select className="form-control" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="ALL">All Actions</option>
          <option value="CREATE">Create</option><option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option><option value="APPROVE">Approve</option>
          <option value="REJECT">Reject</option><option value="LOGIN">Login</option>
          <option value="LOGIN_FAILED">Failed Login</option><option value="LOGOUT">Logout</option>
        </select>
      </div>

      {loading ? (
        <div className="empty-state">Loading audit records…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.25 }}>manage_search</span>
          <p>No records found for the selected filters.</p>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            Audit entries are written by each module when records are created, updated or approved.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date / Time</th><th>User</th><th>Module</th><th>Action</th>
                  <th>Status</th><th>Record</th><th>Txn Code</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const color = MODULE_COLOR[r.module] || 'var(--text-dim)'
                  const icon  = MODULE_ICON[r.module]  || 'circle'
                  return (
                    <>
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
                        <td style={{ fontSize: 13 }}>
                          {r.action || '—'}
                          {(r.old_values || r.new_values) && (
                            <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: 10, marginLeft: 6 }}
                              onClick={e => { e.stopPropagation(); setExpandedRow(expandedRow === r.id ? null : r.id) }}>
                              <span className="material-icons" style={{ fontSize: 12 }}>compare</span>
                            </button>
                          )}
                        </td>
                        <td>
                          {r.status === 'failed'
                            ? <span className="badge badge-red"   style={{ fontSize: 11 }}>Failed</span>
                            : <span className="badge badge-green" style={{ fontSize: 11 }}>OK</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                          <div>{r.entity_type || '—'}</div>
                          {r.entity_name && <div style={{ color: 'var(--text)', fontWeight: 500 }}>{r.entity_name}</div>}
                        </td>
                        <td>
                          {r.txn_code
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)', padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace' }}>{r.txn_code}</span>
                            : <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr key={`${r.id}-expand`}>
                          <td colSpan="7" style={{ background: 'var(--surface2)', padding: 12, fontSize: 11, fontFamily: 'var(--mono)' }}>
                            {r.old_values && (
                              <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: 'var(--red)' }}>Before:</strong>
                                <pre style={{ margin: '4px 0 0', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                  {JSON.stringify(JSON.parse(r.old_values), null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.new_values && (
                              <div>
                                <strong style={{ color: 'var(--green)' }}>After:</strong>
                                <pre style={{ margin: '4px 0 0', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                  {JSON.stringify(JSON.parse(r.new_values), null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.details && (
                              <div style={{ marginTop: 8, color: 'var(--yellow)' }}>
                                <strong>Details:</strong> {r.details}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={fetchPage} />
        </div>
      )}
    </div>
  )
}
