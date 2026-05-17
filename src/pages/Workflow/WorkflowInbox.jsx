// src/pages/Workflow/WorkflowInbox.jsx
// My pending approvals dashboard — shows all workflow_instances where the
// current user can act, sorted by SLA urgency then age.

import { useState, useEffect, useCallback } from 'react'
import { useAuth }            from '../../contexts/AuthContext'
import { getWorkflowInbox }   from '../../engine/workflowEngine'

// ── Constants ─────────────────────────────────────────────────

const MODULE_COLOR = {
  hr:          'var(--green)',   procurement: 'var(--purple)',
  fuel:        'var(--gold)',    fleet:       'var(--yellow)',
  accounting:  'var(--red)',     logistics:   '#f97316',
  campsite:    'var(--teal)',    governance:  '#818cf8',
  connect:     'var(--teal)',    projects:    '#22d3ee',
}
const MODULE_ICON = {
  hr:          'people',         procurement: 'shopping_cart',
  fuel:        'local_gas_station', fleet:    'directions_car',
  accounting:  'receipt_long',   logistics:   'local_shipping',
  campsite:    'hotel',          governance:  'policy',
  connect:     'forum',          projects:    'folder_open',
}

const SLA_STYLE = {
  ok:      { color: 'var(--green)',  bg: 'rgba(52,211,153,.1)',  icon: 'schedule',      label: 'On Time'  },
  warning: { color: 'var(--yellow)', bg: 'rgba(251,191,36,.1)',  icon: 'warning_amber', label: 'Due Soon' },
  overdue: { color: 'var(--red)',    bg: 'rgba(239,68,68,.1)',   icon: 'alarm',         label: 'Overdue'  },
}

const ENTITY_LABEL = {
  leave_requests:            'Leave Request',
  travel_requests:           'Travel Request',
  store_requisitions:        'Store Requisition',
  purchase_requisitions:     'Purchase Requisition',
  purchase_orders:           'Purchase Order',
  contractor_usage_logs:     'Contractor Usage Log',
  petty_cash_transactions:   'Petty Cash',
  petty_cash_reconciliations:'PC Reconciliation',
  employee_attendance:       'Attendance Record',
}

// Entity type → App route for navigation hints
const ENTITY_ROUTE = {
  leave_requests:            '/module/hr/leave',
  travel_requests:           '/module/hr/leave',
  store_requisitions:        '/module/procurement/store-requisitions',
  purchase_requisitions:     '/module/procurement/purchase-requisitions',
  purchase_orders:           '/module/procurement/purchase-orders',
  petty_cash_transactions:   '/module/accounting/petty-cash',
  petty_cash_reconciliations:'/module/accounting/petty-cash',
}

function fmtDuration(mins) {
  if (mins < 60)   return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
}

function ageSince(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return fmtDuration(Math.max(0, mins))
}

// ── Component ─────────────────────────────────────────────────

export default function WorkflowInbox() {
  const { user } = useAuth()
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('ALL')    // 'ALL' | 'overdue' | 'warning'

  const actor = {
    id:      user?.id        || '',
    name:    user?.full_name || user?.username || '',
    role_id: user?.role_id   || '',
  }

  const load = useCallback(async () => {
    if (!actor.id) return
    setLoading(true)
    try   { setItems(await getWorkflowInbox(actor)) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }, [actor.id, actor.role_id])   // eslint-disable-line

  useEffect(() => { load() }, [load])

  const filtered = filter === 'ALL'
    ? items
    : items.filter(i => i.sla?.urgency === filter)

  // Group by module
  const groups = filtered.reduce((acc, item) => {
    const mod = item.workflow?.module || 'other'
    ;(acc[mod] = acc[mod] || []).push(item)
    return acc
  }, {})

  const overdue = items.filter(i => i.sla?.urgency === 'overdue').length
  const warning = items.filter(i => i.sla?.urgency === 'warning').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Approvals</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? 's' : ''} pending your action
            {overdue > 0 && <span style={{ color: 'var(--red)', fontWeight: 700, marginLeft: 8 }}>· {overdue} overdue</span>}
            {warning > 0 && <span style={{ color: 'var(--yellow)', fontWeight: 700, marginLeft: 8 }}>· {warning} due soon</span>}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <span className="material-icons">refresh</span>
        </button>
      </div>

      {/* Quick filters */}
      <div className="btn-group" style={{ marginBottom: 20 }}>
        <button className={`btn btn-sm ${filter === 'ALL'     ? 'btn-primary'   : 'btn-secondary'}`} onClick={() => setFilter('ALL')}>
          All ({items.length})
        </button>
        <button className={`btn btn-sm ${filter === 'overdue' ? 'btn-danger'    : 'btn-secondary'}`} onClick={() => setFilter('overdue')} disabled={overdue === 0}>
          <span className="material-icons" style={{ fontSize: 14 }}>alarm</span> Overdue ({overdue})
        </button>
        <button className={`btn btn-sm ${filter === 'warning' ? 'btn-secondary' : 'btn-secondary'}`}
          style={filter === 'warning' ? { border: '1px solid var(--yellow)', color: 'var(--yellow)' } : {}}
          onClick={() => setFilter('warning')} disabled={warning === 0}>
          <span className="material-icons" style={{ fontSize: 14 }}>warning_amber</span> Due Soon ({warning})
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading pending approvals…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: .25 }}>inbox</span>
          <p>{filter !== 'ALL' ? 'No items match this filter.' : 'No pending approvals. You\'re all caught up!'}</p>
        </div>
      ) : (
        Object.entries(groups).map(([mod, modItems]) => {
          const modColor = MODULE_COLOR[mod] || 'var(--text-dim)'
          const modIcon  = MODULE_ICON[mod]  || 'circle'
          return (
            <div key={mod} style={{ marginBottom: 24 }}>
              {/* Module header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: modColor, background: `${modColor}15`, border: `1px solid ${modColor}33`, padding: '4px 12px', borderRadius: 20 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>{modIcon}</span>
                  {mod.charAt(0).toUpperCase() + mod.slice(1)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{modItems.length} item{modItems.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="card">
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th><th>Submitted By</th><th>Current Step</th>
                        <th>Age</th><th>SLA</th><th>Route to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modItems.map(item => {
                        const slaS    = item.sla ? SLA_STYLE[item.sla.urgency] : null
                        const route   = ENTITY_ROUTE[item.entity_type]
                        const entLabel = ENTITY_LABEL[item.entity_type] || item.entity_type
                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{entLabel}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                                {item.entity_id?.slice(0, 8)}…
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{item.initiated_by_name || '—'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                {new Date(item.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                                {item.current_step?.step_name || '—'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                                {item.workflow?.name}
                              </div>
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                              {ageSince(item.started_at)} ago
                            </td>
                            <td>
                              {slaS ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: slaS.color, background: slaS.bg, border: `1px solid ${slaS.color}44`, padding: '2px 8px', borderRadius: 20 }}>
                                  <span className="material-icons" style={{ fontSize: 12 }}>{slaS.icon}</span>
                                  {item.sla.urgency === 'overdue'
                                    ? `${slaS.label} ${fmtDuration(item.sla.overdueMins)}`
                                    : `${slaS.label} ${fmtDuration(item.sla.remainingMins)}`}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                              )}
                            </td>
                            <td>
                              {route ? (
                                <a href={route} style={{ fontSize: 12, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                                  <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                                  Open
                                </a>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
