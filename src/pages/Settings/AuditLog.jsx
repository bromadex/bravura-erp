// src/pages/Settings/AuditLog.jsx
//
// Phase 18 — Governance: Audit log viewer scoped to inventory and
// procurement events. Loads from system_audit_logs with live
// auto-refresh every 30 seconds.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Spinner } from '../../components/ui'
import { exportXLSX } from '../../engine/reportingEngine'

// ── Action colour map ─────────────────────────────────────────
const ACTION_COLORS = {
  CREATE:    'var(--green)',
  UPDATE:    'var(--blue)',
  DELETE:    'var(--red)',
  STOCK_IN:  'var(--teal)',
  STOCK_OUT: 'var(--yellow)',
  APPROVE:   'var(--purple)',
  REJECT:    'var(--red)',
  EXPORT:    'var(--gold)',
}

function actionColor(action) {
  return ACTION_COLORS[action?.toUpperCase()] || 'var(--text-dim)'
}

// ── Utilities ─────────────────────────────────────────────────
function fmtTimestamp(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

function safeParseJson(val) {
  if (!val) return null
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return val }
}

// ── Action Badge ──────────────────────────────────────────────
function ActionBadge({ action }) {
  const color = actionColor(action)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {action || '—'}
    </span>
  )
}

// ── JSON Preview ──────────────────────────────────────────────
function JsonBlock({ label, data }) {
  if (!data) return null
  const pretty = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
        {label}
      </div>
      <pre style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 12, fontSize: 11,
        fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        maxHeight: 260, overflowY: 'auto', margin: 0,
        color: 'var(--text)',
      }}>
        {pretty}
      </pre>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function AuditLog() {
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [viewing,     setViewing]     = useState(null)

  // Filters
  const [filterModule, setFilterModule] = useState('ALL')
  const [filterAction, setFilterAction] = useState('ALL')
  const [filterUser,   setFilterUser]   = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')

  const intervalRef = useRef(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    const { data, error } = await supabase
      .from('system_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      toast.error(`Audit log: ${error.message}`)
    } else {
      setLogs(data || [])
    }
    if (!quiet) setLoading(false)
  }, [])

  // Initial load + auto-refresh every 30 s
  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => load(true), 30000)
    return () => clearInterval(intervalRef.current)
  }, [load])

  // Distinct values for filter dropdowns
  const allModules = useMemo(() => {
    const s = new Set(logs.map(l => l.module).filter(Boolean))
    return [...s].sort()
  }, [logs])

  const allActions = useMemo(() => {
    const s = new Set(logs.map(l => l.action).filter(Boolean))
    return [...s].sort()
  }, [logs])

  // Filtered rows
  const filtered = useMemo(() => {
    const userQ = filterUser.toLowerCase().trim()
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs   = dateTo   ? new Date(dateTo + 'T23:59:59').getTime() : null
    return logs.filter(l => {
      if (filterModule !== 'ALL' && l.module !== filterModule) return false
      if (filterAction !== 'ALL' && l.action !== filterAction) return false
      if (userQ && !(l.user_name || '').toLowerCase().includes(userQ)) return false
      if (fromTs && new Date(l.created_at).getTime() < fromTs) return false
      if (toTs   && new Date(l.created_at).getTime() > toTs)   return false
      return true
    })
  }, [logs, filterModule, filterAction, filterUser, dateFrom, dateTo])

  // KPI counts (last 30 days)
  const cutoff = thirtyDaysAgo()
  const recent = useMemo(() => logs.filter(l => new Date(l.created_at) >= cutoff), [logs]) // eslint-disable-line react-hooks/exhaustive-deps
  const kpiTotal   = recent.length
  const kpiCreate  = recent.filter(l => l.action === 'CREATE').length
  const kpiUpdate  = recent.filter(l => l.action === 'UPDATE').length
  const kpiDelete  = recent.filter(l => l.action === 'DELETE').length

  const handleExport = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const rows = filtered.map(l => ({
      Timestamp:    fmtTimestamp(l.created_at),
      Module:       l.module || '',
      Action:       l.action || '',
      'Entity Type': l.entity_type || '',
      Entity:       l.entity_name || l.entity_id || '',
      User:         l.user_name || '',
      IP:           l.ip_address || '',
    }))
    exportXLSX(rows, `AuditLog_${new Date().toISOString().split('T')[0]}`, 'Audit Log')
    toast.success('Audit log exported')
  }

  const clearFilters = () => {
    setFilterModule('ALL')
    setFilterAction('ALL')
    setFilterUser('')
    setDateFrom('')
    setDateTo('')
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Audit Log" subtitle="Inventory and procurement event history" />
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Inventory and procurement event history">
        <button className="btn btn-secondary" onClick={() => load()}>
          <span className="material-icons">refresh</span> Refresh
        </button>
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">download</span> Export XLSX
        </button>
      </PageHeader>

      {/* ── KPI Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12, marginTop: 20, marginBottom: 20,
      }}>
        <KPICard label="Total Events (30d)" value={kpiTotal}  icon="list_alt"   color="blue"   />
        <KPICard label="Creates"            value={kpiCreate} icon="add_circle"  color="green"  />
        <KPICard label="Updates"            value={kpiUpdate} icon="edit"        color="blue"   />
        <KPICard label="Deletes"            value={kpiDelete} icon="delete"      color="red"    />
      </div>

      {/* ── Filter Bar ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Module */}
        <select
          className="form-control"
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          <option value="ALL">All Modules</option>
          {allModules.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Action */}
        <select
          className="form-control"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          <option value="ALL">All Actions</option>
          {['CREATE', 'UPDATE', 'DELETE', 'STOCK_IN', 'STOCK_OUT', 'APPROVE', 'REJECT', 'EXPORT'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
          {allActions
            .filter(a => !['CREATE', 'UPDATE', 'DELETE', 'STOCK_IN', 'STOCK_OUT', 'APPROVE', 'REJECT', 'EXPORT'].includes(a))
            .map(a => <option key={a} value={a}>{a}</option>)
          }
        </select>

        {/* User search */}
        <input
          className="form-control"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          placeholder="Search user…"
          style={{ maxWidth: 200 }}
        />

        {/* Date from */}
        <input
          type="date"
          className="form-control"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ maxWidth: 160 }}
          title="From date"
        />

        {/* Date to */}
        <input
          type="date"
          className="form-control"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          style={{ maxWidth: 160 }}
          title="To date"
        />

        {/* Clear */}
        {(filterModule !== 'ALL' || filterAction !== 'ALL' || filterUser || dateFrom || dateTo) && (
          <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
            <span className="material-icons" style={{ fontSize: 14 }}>close</span>
            Clear
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {filtered.length} of {logs.length} events
        </div>
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <EmptyState icon="manage_search" message="No audit events match your filters" />
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['Timestamp', 'Module', 'Action', 'Entity Type', 'Entity', 'User', 'Details'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px', textAlign: 'left',
                        fontWeight: 600, fontSize: 11,
                        color: 'var(--text-dim)', whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr
                    key={log.id}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    {/* Timestamp */}
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 11 }}>
                      {fmtTimestamp(log.created_at)}
                    </td>

                    {/* Module */}
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                      {log.module || '—'}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '8px 12px' }}>
                      <ActionBadge action={log.action} />
                    </td>

                    {/* Entity Type */}
                    <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                      {log.entity_type || '—'}
                    </td>

                    {/* Entity */}
                    <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span title={log.entity_name || log.entity_id || ''}>
                        {log.entity_name || log.entity_id || '—'}
                      </span>
                    </td>

                    {/* User */}
                    <td style={{ padding: '8px 12px', fontSize: 11 }}>
                      {log.user_name || (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>

                    {/* Details eye button */}
                    <td style={{ padding: '8px 12px' }}>
                      {(log.old_values || log.new_values) ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View change details"
                          onClick={() => setViewing(log)}
                          style={{ padding: '3px 8px' }}
                        >
                          <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-dim)', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Showing {filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 10 }}>Auto-refreshes every 30 seconds</span>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <ModalDialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title="Audit Event · Details"
        size="lg"
      >
        {viewing && (
          <div style={{ fontSize: 13 }}>
            {/* Summary grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr',
              columnGap: 16, rowGap: 6, marginBottom: 16,
              padding: '12px 16px', background: 'var(--surface2)',
              borderRadius: 8, border: '1px solid var(--border)',
            }}>
              {[
                ['Timestamp',   fmtTimestamp(viewing.created_at)],
                ['Module',      viewing.module || '—'],
                ['Action',      null],
                ['Entity Type', viewing.entity_type || '—'],
                ['Entity',      viewing.entity_name || viewing.entity_id || '—'],
                ['User',        viewing.user_name || '—'],
                ['IP Address',  viewing.ip_address || '—'],
              ].map(([label, value]) => (
                label === 'Action'
                  ? (
                    <><div key="al" style={{ color: 'var(--text-dim)', alignSelf: 'center' }}>Action</div>
                    <div key="av"><ActionBadge action={viewing.action} /></div></>
                  )
                  : (
                    <><div key={`${label}-l`} style={{ color: 'var(--text-dim)' }}>{label}</div>
                    <div key={`${label}-v`} style={{ fontFamily: label === 'Module' || label === 'Entity Type' ? 'var(--mono)' : undefined }}>{value}</div></>
                  )
              ))}
            </div>

            {/* JSON diff */}
            <JsonBlock label="Before (old values)" data={safeParseJson(viewing.old_values)} />
            <JsonBlock label="After (new values)"  data={safeParseJson(viewing.new_values)} />

            {!viewing.old_values && !viewing.new_values && (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: 16 }}>
                No value snapshot recorded for this event.
              </div>
            )}
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setViewing(null)}>
            Close
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
