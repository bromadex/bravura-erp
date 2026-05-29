import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions, AlertBanner } from '../../components/ui'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import { generateTxnCode } from '../../utils/txnCode'
import { auditLog } from '../../engine/auditEngine'
import { exportXLSX } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]
const monthStart = today.slice(0, 7) + '-01'

const CATEGORIES = [
  { value: 'mechanical',  label: 'Mechanical'  },
  { value: 'electrical',  label: 'Electrical'  },
  { value: 'hydraulic',   label: 'Hydraulic'   },
  { value: 'tyre',        label: 'Tyre / Wheel' },
  { value: 'operator',    label: 'Operator Error' },
  { value: 'accident',    label: 'Accident / Impact' },
  { value: 'wear',        label: 'Normal Wear' },
  { value: 'overload',    label: 'Overloading' },
  { value: 'pm_miss',     label: 'Missed PM'   },
  { value: 'other',       label: 'Other'       },
]

const STATUS_BADGE = { open: 'badge-red', resolved: 'badge-green' }

const TABS = [
  { id: 'all',      label: 'All'      },
  { id: 'open',     label: 'Active'   },
  { id: 'resolved', label: 'Resolved' },
]

const BLANK_BD = {
  asset_id: '', reported_by: '', description: '', breakdown_category: 'mechanical',
  reported_at: new Date().toISOString().slice(0, 16), estimated_cost: '',
}
const BLANK_RESOLVE = {
  root_cause: '', corrective_action: '', resolution_notes: '', downtime_hours: '',
  actual_cost: '', wo_number: '', resolved_by: '',
}

export default function BreakdownManagement() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('fleet', 'maintenance')

  const [breakdowns, setBreakdowns] = useState([])
  const [assets,     setAssets]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('all')

  const [showNewModal,     setShowNewModal]     = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [showViewModal,    setShowViewModal]    = useState(false)
  const [selected,         setSelected]         = useState(null)
  const [newForm,          setNewForm]          = useState(BLANK_BD)
  const [resolveForm,      setResolveForm]      = useState(BLANK_RESOLVE)
  const [saving,           setSaving]           = useState(false)
  const [search,           setSearch]           = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [bdRes, assetRes] = await Promise.all([
      supabase.from('breakdown_reports').select('*').order('reported_at', { ascending: false }).limit(500),
      supabase.from('asset_registry').select('id,asset_name,asset_code,plate_number,asset_category').order('asset_name'),
    ])
    setBreakdowns(bdRes.data || [])
    setAssets(assetRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = breakdowns.filter(b => {
    if (tab !== 'all' && b.status !== tab) return false
    if (search) {
      const t = search.toLowerCase()
      if (!(b.breakdown_no?.toLowerCase().includes(t) || b.asset_name?.toLowerCase().includes(t) ||
            b.description?.toLowerCase().includes(t)  || b.reported_by?.toLowerCase().includes(t))) return false
    }
    return true
  })

  // KPIs
  const active       = breakdowns.filter(b => b.status === 'open').length
  const resolvedMonth = breakdowns.filter(b => b.status === 'resolved' && b.resolved_at?.slice(0, 7) === today.slice(0, 7)).length
  const downtimeMonth = breakdowns.filter(b => b.reported_at?.slice(0, 7) === today.slice(0, 7))
    .reduce((s, b) => s + (parseFloat(b.downtime_hours) || 0), 0)
  const resolvedWithTime = breakdowns.filter(b => b.status === 'resolved' && b.reported_at && b.resolved_at)
  const avgMTTR = resolvedWithTime.length
    ? (resolvedWithTime.reduce((s, b) => s + (new Date(b.resolved_at) - new Date(b.reported_at)) / 3600000, 0) / resolvedWithTime.length).toFixed(1)
    : null

  const handleCreate = async () => {
    if (!newForm.description.trim()) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      let breakdown_no
      try { breakdown_no = await generateTxnCode('BRK') } catch { breakdown_no = null }
      if (!breakdown_no) breakdown_no = `BRK-${Date.now()}`

      const asset = assets.find(a => a.id === newForm.asset_id)
      const { error } = await supabase.from('breakdown_reports').insert({
        breakdown_no,
        asset_id:           newForm.asset_id || null,
        asset_name:         asset?.asset_name || '',
        asset_code:         asset?.plate_number || asset?.asset_code || '',
        reported_at:        newForm.reported_at ? new Date(newForm.reported_at).toISOString() : new Date().toISOString(),
        reported_by:        newForm.reported_by || user?.full_name || '',
        description:        newForm.description,
        breakdown_category: newForm.breakdown_category,
        estimated_cost:     parseFloat(newForm.estimated_cost) || 0,
        status:             'open',
        created_by:         user?.id || '',
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      if (error) throw error
      await auditLog({ module: 'fleet', action: 'CREATE', entityType: 'breakdown', entityName: breakdown_no })
      toast.success(`Breakdown ${breakdown_no} registered`)
      setShowNewModal(false)
      setNewForm(BLANK_BD)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleResolve = async () => {
    if (!resolveForm.root_cause.trim())       { toast.error('Root cause is required');        return }
    if (!resolveForm.corrective_action.trim()){ toast.error('Corrective action is required'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('breakdown_reports').update({
        root_cause:        resolveForm.root_cause,
        corrective_action: resolveForm.corrective_action,
        resolution_notes:  resolveForm.resolution_notes || null,
        downtime_hours:    parseFloat(resolveForm.downtime_hours) || 0,
        actual_cost:       parseFloat(resolveForm.actual_cost)    || 0,
        wo_number:         resolveForm.wo_number || null,
        resolved_by:       resolveForm.resolved_by || user?.full_name || '',
        resolved_at:       new Date().toISOString(),
        status:            'resolved',
        updated_at:        new Date().toISOString(),
      }).eq('id', selected.id)
      if (error) throw error
      await auditLog({ module: 'fleet', action: 'RESOLVE', entityType: 'breakdown', entityId: selected.id, entityName: selected.breakdown_no })
      toast.success(`Breakdown ${selected.breakdown_no} resolved`)
      setShowResolveModal(false)
      setSelected(null)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleExport = () => {
    if (!filtered.length) return toast.error('No records to export')
    exportXLSX(filtered.map(b => ({
      'Breakdown No':   b.breakdown_no,
      'Asset':          b.asset_name || '—',
      'Reported At':    b.reported_at?.slice(0, 16) || '—',
      'Reported By':    b.reported_by || '—',
      'Category':       b.breakdown_category,
      'Description':    b.description,
      'Root Cause':     b.root_cause || '—',
      'Corrective Action': b.corrective_action || '—',
      'Downtime Hrs':   b.downtime_hours || 0,
      'Actual Cost':    b.actual_cost || 0,
      'WO Ref':         b.wo_number || '—',
      'Status':         b.status,
      'Resolved At':    b.resolved_at?.slice(0, 16) || '—',
      'Resolved By':    b.resolved_by || '—',
    })), `Breakdowns_${today}`, 'Breakdowns')
    toast.success(`Exported ${filtered.length} records`)
  }

  const catLabel = (val) => CATEGORIES.find(c => c.value === val)?.label || val

  return (
    <div>
      <PageHeader title="Breakdown Management" subtitle="Register, track and RCA all fleet breakdowns">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setNewForm({ ...BLANK_BD, reported_by: user?.full_name || '' }); setShowNewModal(true) }}>
            <span className="material-icons">report_problem</span> Register Breakdown
          </button>
        )}
      </PageHeader>

      {active > 0 && (
        <AlertBanner type="danger" message={`${active} active breakdown${active > 1 ? 's' : ''} — fleet availability impacted.`} />
      )}

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Active Breakdowns"   value={active}                               color="red"    icon="report_problem"  sub="unresolved" />
        <KPICard label="Resolved This Month" value={resolvedMonth}                        color="green"  icon="check_circle"    sub={today.slice(0,7)} />
        <KPICard label="Downtime This Month" value={`${downtimeMonth.toFixed(1)} hrs`}   color="yellow" icon="timer_off"       sub="fleet hours lost" />
        <KPICard label="Avg MTTR"            value={avgMTTR ? `${avgMTTR} hrs` : '—'}   color="teal"   icon="speed"           sub="mean time to resolve" />
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <input className="form-control" placeholder="Search breakdown no, asset, description, reporter…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {search && <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>
            <span className="material-icons" style={{ fontSize: 16 }}>clear</span>
          </button>}
        </div>
      </div>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Breakdown No</th>
                <th>Asset</th>
                <th>Reported</th>
                <th>Category</th>
                <th>Description</th>
                <th>Downtime</th>
                <th>Root Cause</th>
                <th>Status</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9"><EmptyState icon="report_problem" message="No breakdowns recorded" /></td></tr>
              ) : filtered.map(b => (
                <tr key={b.id}>
                  <td>{b.breakdown_no ? <TxnCodeBadge code={b.breakdown_no} /> : '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{b.asset_name || '—'}</div>
                    {b.asset_code && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{b.asset_code}</div>}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    <div>{b.reported_at?.slice(0, 10) || '—'}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{b.reported_by || '—'}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{catLabel(b.breakdown_category)}</td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.description}>
                      {b.description}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: b.downtime_hours > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                    {b.downtime_hours ? `${b.downtime_hours} hrs` : '—'}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 160 }}>
                    {b.root_cause ? (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={b.root_cause}>
                        {b.root_cause}
                      </span>
                    ) : <span style={{ color: 'var(--text-dim)' }}>Pending RCA</span>}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[b.status] || 'badge-default'}`}>{b.status}</span></td>
                  {canEdit && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {b.status === 'open' && (
                          <button className="btn btn-success btn-sm" title="Resolve / RCA"
                            onClick={() => { setSelected(b); setResolveForm({ ...BLANK_RESOLVE, resolved_by: user?.full_name || '' }); setShowResolveModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" title="View details"
                          onClick={() => { setSelected(b); setShowViewModal(true) }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>visibility</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Breakdown Modal */}
      {showNewModal && (
        <ModalDialog open onClose={() => setShowNewModal(false)} title="Register Breakdown" size="lg">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Asset / Equipment</label>
              <select className="form-control" value={newForm.asset_id}
                onChange={e => setNewForm(f => ({ ...f, asset_id: e.target.value }))}>
                <option value="">— Select asset —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.asset_name}{a.plate_number ? ` (${a.plate_number})` : ''} — {a.asset_category || ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="form-control" value={newForm.breakdown_category}
                onChange={e => setNewForm(f => ({ ...f, breakdown_category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date / Time Reported *</label>
              <input type="datetime-local" className="form-control" value={newForm.reported_at}
                onChange={e => setNewForm(f => ({ ...f, reported_at: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Reported By</label>
              <input className="form-control" value={newForm.reported_by}
                onChange={e => setNewForm(f => ({ ...f, reported_by: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Estimated Cost ($)</label>
              <input type="number" className="form-control" min="0" step="0.01" value={newForm.estimated_cost}
                onChange={e => setNewForm(f => ({ ...f, estimated_cost: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Description of Breakdown *</label>
            <textarea className="form-control" rows={3} required
              placeholder="Describe what happened, symptoms, location…"
              value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Registering…' : 'Register Breakdown'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Resolve / RCA Modal */}
      {showResolveModal && selected && (
        <ModalDialog open onClose={() => { setShowResolveModal(false); setSelected(null) }}
          title={`Resolve & RCA · ${selected.breakdown_no}`} size="lg">
          <div style={{ padding: '8px 0 12px', borderBottom: '1px solid var(--border)', marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{selected.asset_name}</strong>
            {' — '}{selected.description}
          </div>
          <div className="form-group">
            <label>Root Cause Analysis *</label>
            <textarea className="form-control" rows={3} required
              placeholder="Why did this breakdown occur? 5-Why or factual root cause…"
              value={resolveForm.root_cause} onChange={e => setResolveForm(f => ({ ...f, root_cause: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Corrective Action Taken *</label>
            <textarea className="form-control" rows={3} required
              placeholder="What was done to fix it and prevent recurrence?"
              value={resolveForm.corrective_action} onChange={e => setResolveForm(f => ({ ...f, corrective_action: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Total Downtime (Hours)</label>
              <input type="number" className="form-control" min="0" step="0.5" value={resolveForm.downtime_hours}
                onChange={e => setResolveForm(f => ({ ...f, downtime_hours: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Actual Cost ($)</label>
              <input type="number" className="form-control" min="0" step="0.01" value={resolveForm.actual_cost}
                onChange={e => setResolveForm(f => ({ ...f, actual_cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Linked WO Number</label>
              <input className="form-control" placeholder="e.g. WO-00042" value={resolveForm.wo_number}
                onChange={e => setResolveForm(f => ({ ...f, wo_number: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Resolved By</label>
              <input className="form-control" value={resolveForm.resolved_by}
                onChange={e => setResolveForm(f => ({ ...f, resolved_by: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Resolution Notes</label>
            <textarea className="form-control" rows={2} value={resolveForm.resolution_notes}
              onChange={e => setResolveForm(f => ({ ...f, resolution_notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowResolveModal(false); setSelected(null) }}>Cancel</button>
            <button className="btn btn-success" onClick={handleResolve} disabled={saving}>
              {saving ? 'Resolving…' : 'Mark Resolved'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* View details modal */}
      {showViewModal && selected && (
        <ModalDialog open onClose={() => { setShowViewModal(false); setSelected(null) }}
          title={`Breakdown · ${selected.breakdown_no}`} size="md">
          <div style={{ fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 14, color: 'var(--text-dim)' }}>
              <span>Asset: <strong style={{ color: 'var(--text)' }}>{selected.asset_name || '—'}</strong></span>
              <span>Category: <strong style={{ color: 'var(--text)' }}>{catLabel(selected.breakdown_category)}</strong></span>
              <span>Reported: <strong style={{ color: 'var(--text)' }}>{selected.reported_at?.slice(0, 16) || '—'}</strong></span>
              <span>By: <strong style={{ color: 'var(--text)' }}>{selected.reported_by || '—'}</strong></span>
              <span>Downtime: <strong style={{ color: 'var(--yellow)' }}>{selected.downtime_hours ? `${selected.downtime_hours} hrs` : '—'}</strong></span>
              <span>Cost: <strong style={{ color: 'var(--teal)' }}>{selected.actual_cost ? `$${Number(selected.actual_cost).toLocaleString()}` : '—'}</strong></span>
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Description</div>
              {selected.description}
            </div>
            {selected.root_cause && (
              <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Root Cause</div>
                {selected.root_cause}
              </div>
            )}
            {selected.corrective_action && (
              <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Corrective Action</div>
                {selected.corrective_action}
              </div>
            )}
            {selected.wo_number && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>Linked WO: <strong style={{ color: 'var(--text)' }}>{selected.wo_number}</strong></div>
            )}
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowViewModal(false); setSelected(null) }}>Close</button>
            {selected.status === 'open' && canEdit && (
              <button className="btn btn-success" onClick={() => { setShowViewModal(false); setResolveForm({ ...BLANK_RESOLVE, resolved_by: user?.full_name || '' }); setShowResolveModal(true) }}>
                Resolve &amp; RCA
              </button>
            )}
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
