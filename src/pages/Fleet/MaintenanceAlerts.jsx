import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { generateTxnCode } from '../../utils/txnCode'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

const URGENCY_ORDER = { critical: 0, overdue: 1, due_soon: 2, ok: 3, unknown: 4 }

const URGENCY_CFG = {
  critical: { label: 'Critical',  color: 'var(--red)',    icon: 'error',            rowBg: 'color-mix(in srgb,var(--red)    5%,var(--surface))' },
  overdue:  { label: 'Overdue',   color: 'var(--red)',    icon: 'warning',          rowBg: 'color-mix(in srgb,var(--red)    3%,var(--surface))' },
  due_soon: { label: 'Due Soon',  color: 'var(--yellow)', icon: 'schedule',         rowBg: 'color-mix(in srgb,var(--yellow) 3%,var(--surface))' },
  ok:       { label: 'OK',        color: 'var(--green)',  icon: 'check_circle',     rowBg: '' },
  unknown:  { label: 'Unknown',   color: 'var(--text-dim)',icon: 'help',            rowBg: '' },
}

const TASK_CATEGORIES = ['engine','brakes','tyres','electrical','hydraulics','bodywork','lubrication','inspection','other']
const PRIORITIES = ['critical','high','medium','low']

function UrgencyPill({ urgency }) {
  const cfg = URGENCY_CFG[urgency] || URGENCY_CFG.unknown
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
      background: `color-mix(in srgb,${cfg.color} 15%,var(--surface2))`,
      color: cfg.color,
      border: `1px solid color-mix(in srgb,${cfg.color} 30%,transparent)`,
    }}>
      {cfg.label}
    </span>
  )
}

function PriorityPill({ priority }) {
  const colors = { critical: 'var(--red)', high: 'var(--yellow)', medium: 'var(--blue)', low: 'var(--text-dim)' }
  const c = colors[priority] || 'var(--text-dim)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase',
      background: `color-mix(in srgb,${c} 15%,var(--surface2))`,
      color: c,
    }}>{priority}</span>
  )
}

function ProgressBar({ pct, urgency }) {
  if (pct == null) return null
  const p = Math.min(110, Math.max(0, pct))
  const cfg = URGENCY_CFG[urgency] || URGENCY_CFG.ok
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>{Math.min(100, p).toFixed(0)}% used</div>
      <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', width: 100 }}>
        <div style={{ height: '100%', width: `${Math.min(100, p)}%`, background: cfg.color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

function remainingLabel(a) {
  if (a.remaining_km != null) {
    const v = Number(a.remaining_km)
    return v < 0 ? `${Math.abs(v).toFixed(0)} km overdue` : `${v.toFixed(0)} km remaining`
  }
  if (a.remaining_hrs != null) {
    const v = Number(a.remaining_hrs)
    return v < 0 ? `${Math.abs(v).toFixed(1)} hrs overdue` : `${v.toFixed(1)} hrs remaining`
  }
  if (a.remaining_days != null) {
    const v = Number(a.remaining_days)
    return v < 0 ? `${Math.abs(v)} days overdue` : `${v} days remaining`
  }
  return '—'
}

export default function MaintenanceAlerts() {
  const { user } = useAuth()
  const [alerts,   setAlerts]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [woModal,  setWoModal]  = useState(null)
  const [woForm,   setWoForm]   = useState({})
  const [saving,   setSaving]   = useState(false)
  const [showAll,  setShowAll]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_pm_urgency')
      .select('*')
    if (error) { toast.error('Failed to load maintenance alerts'); setLoading(false); return }
    const sorted = (data || []).sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 99) - (URGENCY_ORDER[b.urgency] ?? 99))
    setAlerts(sorted)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const critical = useMemo(() => alerts.filter(a => a.urgency === 'critical').length, [alerts])
  const overdue  = useMemo(() => alerts.filter(a => a.urgency === 'overdue').length,  [alerts])
  const dueSoon  = useMemo(() => alerts.filter(a => a.urgency === 'due_soon').length, [alerts])
  const ok       = useMemo(() => alerts.filter(a => a.urgency === 'ok').length,       [alerts])

  const visibleAlerts = showAll ? alerts : alerts.filter(a => a.urgency !== 'ok')

  const grouped = useMemo(() => {
    const map = { critical: [], overdue: [], due_soon: [], ok: [] }
    visibleAlerts.forEach(a => { if (map[a.urgency]) map[a.urgency].push(a) })
    return map
  }, [visibleAlerts])

  const sections = [
    { key: 'critical', items: grouped.critical },
    { key: 'overdue',  items: grouped.overdue  },
    { key: 'due_soon', items: grouped.due_soon  },
    ...(showAll ? [{ key: 'ok', items: grouped.ok }] : []),
  ].filter(s => s.items.length > 0)

  const openWO = (schedule) => {
    setWoForm({
      task_name:         schedule.task_name || '',
      task_category:     schedule.task_category || 'inspection',
      priority:          schedule.urgency === 'critical' ? 'critical' : schedule.urgency === 'overdue' ? 'high' : 'medium',
      planned_start_date: today,
      planned_end_date:  '',
      notes:             schedule.notes || '',
    })
    setWoModal(schedule)
  }

  const handleCreateWO = async () => {
    if (!woForm.task_name.trim()) return toast.error('Task name required')
    setSaving(true)
    try {
      let wo_number
      try { wo_number = await generateTxnCode('WO') } catch { wo_number = `WO-${Date.now()}` }
      const { error } = await supabase.from('maintenance_work_orders').insert({
        wo_number,
        asset_id:           woModal.asset_id,
        asset_name:         woModal.asset_name || '',
        asset_reg:          woModal.asset_reg  || '',
        asset_type:         woModal.asset_type || 'vehicle',
        schedule_id:        woModal.id,
        task_name:          woForm.task_name,
        task_category:      woForm.task_category,
        priority:           woForm.priority,
        status:             'open',
        planned_start_date: woForm.planned_start_date || null,
        planned_end_date:   woForm.planned_end_date   || null,
        notes:              woForm.notes              || null,
        source:             'maintenance_alert',
        source_ref:         woModal.id,
        created_by:         user?.id || '',
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      if (error) throw error
      toast.success(`Work Order ${wo_number} created`)
      setWoModal(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="Maintenance Alerts" subtitle="PM schedules requiring attention — urgency-ranked" icon="notifications_active">
        <button className="btn btn-ghost" onClick={() => setShowAll(v => !v)}>
          <span className="material-icons" style={{ fontSize: 16 }}>{showAll ? 'visibility_off' : 'visibility'}</span>
          {showAll ? 'Hide OK' : 'Show All'}
        </button>
        <button className="btn btn-ghost" onClick={load}>
          <span className="material-icons" style={{ fontSize: 16 }}>refresh</span>Refresh
        </button>
      </PageHeader>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KPICard label="Critical"  value={critical} icon="error"        color="var(--red)"    />
        <KPICard label="Overdue"   value={overdue}  icon="warning"      color="var(--red)"    />
        <KPICard label="Due Soon"  value={dueSoon}  icon="schedule"     color="var(--yellow)" />
        <KPICard label="Compliant" value={ok}        icon="check_circle" color="var(--green)"  />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading maintenance alerts…</div>
      ) : visibleAlerts.length === 0 ? (
        <EmptyState icon="check_circle" message="All PM schedules are in good standing — no alerts" />
      ) : sections.map(sec => {
        const cfg = URGENCY_CFG[sec.key]
        return (
          <div key={sec.key} className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span className="material-icons" style={{ color: cfg.color, fontSize: 18 }}>{cfg.icon}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: cfg.color }}>{cfg.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({sec.items.length})</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Task</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Progress</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map(a => (
                    <tr key={a.id} style={{ background: cfg.rowBg, borderLeft: `3px solid ${cfg.color}` }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.asset_name || a.asset_reg || a.asset_id}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5 }}>{a.asset_type}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{a.task_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-mid)', textTransform: 'capitalize' }}>{a.task_category}</td>
                      <td><PriorityPill priority={a.priority} /></td>
                      <td><ProgressBar pct={a.pct_used} urgency={a.urgency} /></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: cfg.color, fontWeight: 600 }}>
                        {remainingLabel(a)}
                      </td>
                      <td><UrgencyPill urgency={a.urgency} /></td>
                      <td>
                        {sec.key !== 'ok' && (
                          <button className="btn btn-primary btn-sm" onClick={() => openWO(a)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>build</span> Create WO
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Create WO Modal */}
      {woModal && (
        <ModalDialog open onClose={() => setWoModal(null)} title={`Create WO — ${woModal.asset_name || woModal.asset_reg || woModal.asset_id}`} size="md">
          <div style={{ padding: '8px 0 14px', borderBottom: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>PM Schedule</div>
            <div style={{ fontWeight: 700 }}>{woModal.task_name}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
              {woModal.task_category} ·{' '}
              {woModal.interval_type === 'km'
                ? `Every ${Number(woModal.interval_value).toLocaleString()} km`
                : woModal.interval_type === 'hours'
                ? `Every ${woModal.interval_value} hrs`
                : `Every ${woModal.interval_value} days`}
            </div>
            <div style={{ marginTop: 6 }}>
              <UrgencyPill urgency={woModal.urgency} />
              <span style={{ marginLeft: 8, fontSize: 12, color: URGENCY_CFG[woModal.urgency]?.color, fontWeight: 600 }}>
                {remainingLabel(woModal)}
              </span>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Task Name *</label>
            <input className="form-control" value={woForm.task_name}
              onChange={e => setWoForm(f => ({ ...f, task_name: e.target.value }))} />
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>Priority</label>
              <select className="form-control" value={woForm.priority}
                onChange={e => setWoForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="form-control" value={woForm.task_category}
                onChange={e => setWoForm(f => ({ ...f, task_category: e.target.value }))}>
                {TASK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>Planned Start</label>
              <input type="date" className="form-control" value={woForm.planned_start_date}
                onChange={e => setWoForm(f => ({ ...f, planned_start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Planned End</label>
              <input type="date" className="form-control" value={woForm.planned_end_date}
                onChange={e => setWoForm(f => ({ ...f, planned_end_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={woForm.notes}
              onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setWoModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateWO} disabled={saving}>
              {saving ? 'Creating…' : 'Create Work Order'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
