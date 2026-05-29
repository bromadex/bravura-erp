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

const CATEGORIES = ['engine','brakes','tyres','electrical','hydraulics','bodywork','lubrication','inspection','transmission','cooling','fuel_system','other']
const PRIORITIES  = ['critical','high','medium','low']
const STATUSES    = ['open','in_progress','closed','cancelled']

const STATUS_BADGE = { open: 'badge-yellow', in_progress: 'badge-blue', closed: 'badge-green', cancelled: 'badge-default' }
const PRIORITY_BADGE = { critical: 'badge-red', high: 'badge-yellow', medium: 'badge-blue', low: 'badge-default' }

const TABS = [
  { id: 'all',         label: 'All'         },
  { id: 'open',        label: 'Open'        },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'closed',      label: 'Closed'      },
]

const BLANK_WO = {
  asset_id: '', task_name: '', task_category: 'engine', priority: 'medium',
  planned_start_date: today, planned_end_date: '', assigned_to: '', workshop: '',
  description: '', estimated_cost: '', notes: '',
}

const BLANK_CLOSE = {
  findings: '', completion_notes: '', labour_hours: '', labour_rate: '', parts_cost: '',
  invoice_number: '', actual_end_date: today,
}

export default function WorkshopJobs() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('fleet', 'maintenance')

  const [wos,       setWos]       = useState([])
  const [assets,    setAssets]    = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,     setTab]     = useState('all')

  const [showNewModal,   setShowNewModal]   = useState(false)
  const [showEditModal,  setShowEditModal]  = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [selected,       setSelected]       = useState(null)
  const [newForm,        setNewForm]        = useState(BLANK_WO)
  const [closeForm,      setCloseForm]      = useState(BLANK_CLOSE)
  const [saving,         setSaving]         = useState(false)
  const [search,         setSearch]         = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [woRes, assetRes, empRes] = await Promise.all([
      supabase.from('maintenance_work_orders').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('asset_registry').select('id,asset_name,asset_code,plate_number,asset_category').order('asset_name'),
      supabase.from('employees').select('id,name').neq('status','Terminated').order('name'),
    ])
    setWos(woRes.data || [])
    setAssets(assetRes.data || [])
    if (!empRes.error) setEmployees(empRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = wos.filter(w => {
    if (tab !== 'all' && w.status !== tab) return false
    if (search) {
      const t = search.toLowerCase()
      if (!(w.wo_number?.toLowerCase().includes(t) || w.asset_name?.toLowerCase().includes(t) ||
            w.asset_reg?.toLowerCase().includes(t)  || w.task_name?.toLowerCase().includes(t)  ||
            w.assigned_to?.toLowerCase().includes(t))) return false
    }
    return true
  })

  // KPIs
  const openCount    = wos.filter(w => w.status === 'open').length
  const inProgCount  = wos.filter(w => w.status === 'in_progress').length
  const overdueCount = wos.filter(w => ['open','in_progress'].includes(w.status) && w.planned_end_date && w.planned_end_date < today).length
  const closedMonth  = wos.filter(w => w.status === 'closed' && w.actual_end_date >= monthStart).length

  const handleCreate = async () => {
    if (!newForm.task_name.trim()) { toast.error('Task name is required'); return }
    setSaving(true)
    try {
      let wo_number
      try { wo_number = await generateTxnCode('WO') } catch { wo_number = null }
      if (!wo_number) wo_number = `WO-${Date.now()}`

      const asset = assets.find(a => a.id === newForm.asset_id)
      const { error } = await supabase.from('maintenance_work_orders').insert({
        wo_number,
        asset_id:          newForm.asset_id || null,
        asset_name:        asset?.asset_name || newForm.asset_id || '',
        asset_reg:         asset?.plate_number || asset?.asset_code || '',
        task_name:         newForm.task_name,
        task_category:     newForm.task_category,
        priority:          newForm.priority,
        status:            'open',
        planned_start_date: newForm.planned_start_date || null,
        planned_end_date:  newForm.planned_end_date   || null,
        assigned_to:       newForm.assigned_to        || null,
        workshop:          newForm.workshop            || null,
        description:       newForm.description        || null,
        estimated_cost:    parseFloat(newForm.estimated_cost) || null,
        notes:             newForm.notes              || null,
        source:            'manual',
        created_by:        user?.id || '',
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      })
      if (error) throw error
      await auditLog({ module: 'fleet', action: 'CREATE', entityType: 'work_order', entityName: wo_number })
      toast.success(`Work Order ${wo_number} created`)
      setShowNewModal(false)
      setNewForm(BLANK_WO)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleStartProgress = async (wo) => {
    try {
      await supabase.from('maintenance_work_orders').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', wo.id)
      await auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'work_order', entityId: wo.id, entityName: wo.wo_number })
      toast.success(`WO ${wo.wo_number} — In Progress`)
      fetchData()
    } catch (e) { toast.error(e.message) }
  }

  const handleClose = async () => {
    if (!closeForm.findings.trim()) { toast.error('Findings are required'); return }
    setSaving(true)
    try {
      const labourCost = (parseFloat(closeForm.labour_hours) || 0) * (parseFloat(closeForm.labour_rate) || 0)
      const partsCost  = parseFloat(closeForm.parts_cost) || 0
      const actualCost = labourCost + partsCost

      await supabase.from('maintenance_work_orders').update({
        status:            'closed',
        findings:          closeForm.findings,
        completion_notes:  closeForm.completion_notes || null,
        labour_hours:      parseFloat(closeForm.labour_hours) || null,
        labour_rate:       parseFloat(closeForm.labour_rate)  || null,
        labour_cost:       labourCost || null,
        parts_cost:        partsCost  || null,
        actual_cost:       actualCost || null,
        invoice_number:    closeForm.invoice_number || null,
        actual_end_date:   closeForm.actual_end_date || today,
        updated_at:        new Date().toISOString(),
      }).eq('id', selected.id)

      await auditLog({ module: 'fleet', action: 'CLOSE', entityType: 'work_order', entityId: selected.id, entityName: selected.wo_number })
      toast.success(`WO ${selected.wo_number} closed`)
      setShowCloseModal(false)
      setSelected(null)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleCancel = async (wo) => {
    if (!window.confirm(`Cancel WO ${wo.wo_number}?`)) return
    try {
      await supabase.from('maintenance_work_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', wo.id)
      toast.success(`WO ${wo.wo_number} cancelled`)
      fetchData()
    } catch (e) { toast.error(e.message) }
  }

  const handleExport = () => {
    if (!filtered.length) return toast.error('No records to export')
    exportXLSX(filtered.map(w => ({
      'WO Number':     w.wo_number,
      'Asset':         w.asset_name || w.asset_reg || '—',
      'Task':          w.task_name,
      'Category':      w.task_category,
      'Priority':      w.priority,
      'Status':        w.status,
      'Assigned To':   w.assigned_to || '—',
      'Planned Start': w.planned_start_date || '—',
      'Planned End':   w.planned_end_date   || '—',
      'Actual End':    w.actual_end_date    || '—',
      'Labour Hrs':    w.labour_hours       || '—',
      'Labour Cost':   w.labour_cost        || '—',
      'Parts Cost':    w.parts_cost         || '—',
      'Actual Cost':   w.actual_cost        || '—',
      'Findings':      w.findings           || '—',
    })), `WorkshopJobs_${today}`, 'Work Orders')
    toast.success(`Exported ${filtered.length} records`)
  }

  const isOverdue = (w) => ['open','in_progress'].includes(w.status) && w.planned_end_date && w.planned_end_date < today

  return (
    <div>
      <PageHeader title="Workshop Jobs" subtitle="Work order management — open, assign, track, close">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setNewForm(BLANK_WO); setShowNewModal(true) }}>
            <span className="material-icons">add</span> New WO
          </button>
        )}
      </PageHeader>

      {overdueCount > 0 && (
        <AlertBanner type="danger" message={`${overdueCount} work order${overdueCount > 1 ? 's' : ''} overdue — past planned completion date.`} />
      )}

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Open"        value={openCount}   sub="work orders"    color="yellow" icon="build" />
        <KPICard label="In Progress" value={inProgCount} sub="being worked"   color="blue"   icon="engineering" />
        <KPICard label="Overdue"     value={overdueCount} sub="past due date" color="red"    icon="warning" />
        <KPICard label="Closed This Month" value={closedMonth} sub={today.slice(0,7)} color="green" icon="check_circle" />
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <input className="form-control" placeholder="Search WO number, asset, task, technician…"
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
                <th>WO No</th>
                <th>Asset</th>
                <th>Task / Category</th>
                <th>Priority</th>
                <th>Assigned To</th>
                <th>Planned End</th>
                <th>Cost</th>
                <th>Status</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9"><EmptyState icon="build" message="No work orders found" /></td></tr>
              ) : filtered.map(w => (
                <tr key={w.id} style={{ background: isOverdue(w) ? 'rgba(239,68,68,.04)' : undefined }}>
                  <td>{w.wo_number ? <TxnCodeBadge code={w.wo_number} /> : '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{w.asset_name || '—'}</div>
                    {w.asset_reg && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{w.asset_reg}</div>}
                    {w.source && w.source !== 'manual' && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{w.source}{w.source_ref ? ` · ${w.source_ref}` : ''}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{w.task_name || '—'}</div>
                    <span className="badge badge-default" style={{ fontSize: 9 }}>{w.task_category}</span>
                  </td>
                  <td><span className={`badge ${PRIORITY_BADGE[w.priority] || 'badge-default'}`}>{w.priority}</span></td>
                  <td style={{ fontSize: 12, color: w.assigned_to ? 'var(--text)' : 'var(--text-dim)' }}>{w.assigned_to || 'Unassigned'}</td>
                  <td style={{ fontSize: 12, color: isOverdue(w) ? 'var(--red)' : 'var(--text)', fontWeight: isOverdue(w) ? 700 : 400 }}>
                    {w.planned_end_date || '—'}
                    {isOverdue(w) && <div style={{ fontSize: 10 }}>OVERDUE</div>}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {w.actual_cost ? `$${Number(w.actual_cost).toLocaleString()}` : w.estimated_cost ? <span style={{ color: 'var(--text-dim)' }}>est ${Number(w.estimated_cost).toLocaleString()}</span> : '—'}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[w.status] || 'badge-default'}`}>{w.status?.replace('_', ' ')}</span></td>
                  {canEdit && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {w.status === 'open' && (
                          <button className="btn btn-primary btn-sm" title="Start" onClick={() => handleStartProgress(w)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>play_arrow</span>
                          </button>
                        )}
                        {['open','in_progress'].includes(w.status) && (
                          <button className="btn btn-success btn-sm" title="Close WO" onClick={() => { setSelected(w); setCloseForm(BLANK_CLOSE); setShowCloseModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>check</span>
                          </button>
                        )}
                        {['open','in_progress'].includes(w.status) && (
                          <button className="btn btn-danger btn-sm" title="Cancel" onClick={() => handleCancel(w)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                          </button>
                        )}
                        {w.status === 'closed' && w.findings && (
                          <button className="btn btn-secondary btn-sm" title="View findings" onClick={() => { setSelected(w); setShowEditModal(true) }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>visibility</span>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New WO Modal */}
      {showNewModal && (
        <ModalDialog open onClose={() => setShowNewModal(false)} title="New Work Order" size="lg">
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
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Task / Job Description *</label>
              <input className="form-control" required value={newForm.task_name}
                onChange={e => setNewForm(f => ({ ...f, task_name: e.target.value }))}
                placeholder="e.g. 250hr service, Replace brake pads" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="form-control" value={newForm.task_category}
                onChange={e => setNewForm(f => ({ ...f, task_category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select className="form-control" value={newForm.priority}
                onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Planned Start</label>
              <input type="date" className="form-control" value={newForm.planned_start_date}
                onChange={e => setNewForm(f => ({ ...f, planned_start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Planned Completion</label>
              <input type="date" className="form-control" value={newForm.planned_end_date}
                onChange={e => setNewForm(f => ({ ...f, planned_end_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Estimated Cost ($)</label>
              <input type="number" className="form-control" min="0" step="0.01" value={newForm.estimated_cost}
                onChange={e => setNewForm(f => ({ ...f, estimated_cost: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Assigned Technician</label>
              <select className="form-control" value={newForm.assigned_to}
                onChange={e => setNewForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">— Select technician —</option>
                {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Workshop / Bay</label>
              <input className="form-control" placeholder="e.g. Main Workshop" value={newForm.workshop}
                onChange={e => setNewForm(f => ({ ...f, workshop: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Detailed Description / Instructions</label>
            <textarea className="form-control" rows={3} value={newForm.description}
              onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={newForm.notes}
              onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Work Order'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Close WO Modal */}
      {showCloseModal && selected && (
        <ModalDialog open onClose={() => { setShowCloseModal(false); setSelected(null) }}
          title={`Close WO · ${selected.wo_number}`} size="lg">
          <div style={{ padding: '8px 0 12px', borderBottom: '1px solid var(--border)', marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{selected.task_name}</strong>
            {selected.asset_name && <> — {selected.asset_name}</>}
          </div>
          <div className="form-group">
            <label>Findings / Work Done *</label>
            <textarea className="form-control" rows={3} required
              placeholder="Describe what was found and what was done…"
              value={closeForm.findings} onChange={e => setCloseForm(f => ({ ...f, findings: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Labour Hours</label>
              <input type="number" className="form-control" min="0" step="0.5"
                value={closeForm.labour_hours} onChange={e => setCloseForm(f => ({ ...f, labour_hours: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Labour Rate ($/hr)</label>
              <input type="number" className="form-control" min="0" step="0.01"
                value={closeForm.labour_rate} onChange={e => setCloseForm(f => ({ ...f, labour_rate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Labour Cost</label>
              <input className="form-control" readOnly
                value={closeForm.labour_hours && closeForm.labour_rate
                  ? `$${(parseFloat(closeForm.labour_hours) * parseFloat(closeForm.labour_rate)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Parts / Materials Cost ($)</label>
              <input type="number" className="form-control" min="0" step="0.01"
                value={closeForm.parts_cost} onChange={e => setCloseForm(f => ({ ...f, parts_cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Total Actual Cost</label>
              <input className="form-control" readOnly
                style={{ fontWeight: 700, color: 'var(--teal)' }}
                value={(() => {
                  const l = (parseFloat(closeForm.labour_hours) || 0) * (parseFloat(closeForm.labour_rate) || 0)
                  const p = parseFloat(closeForm.parts_cost) || 0
                  return l + p > 0 ? `$${(l + p).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'
                })()} />
            </div>
            <div className="form-group">
              <label>Invoice Number</label>
              <input className="form-control" value={closeForm.invoice_number}
                onChange={e => setCloseForm(f => ({ ...f, invoice_number: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Actual Completion Date</label>
              <input type="date" className="form-control" value={closeForm.actual_end_date}
                onChange={e => setCloseForm(f => ({ ...f, actual_end_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Completion Notes</label>
            <textarea className="form-control" rows={2} value={closeForm.completion_notes}
              onChange={e => setCloseForm(f => ({ ...f, completion_notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowCloseModal(false); setSelected(null) }}>Cancel</button>
            <button className="btn btn-success" onClick={handleClose} disabled={saving}>
              {saving ? 'Closing…' : 'Close Work Order'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* View findings modal */}
      {showEditModal && selected && (
        <ModalDialog open onClose={() => { setShowEditModal(false); setSelected(null) }}
          title={`WO Findings · ${selected.wo_number}`} size="md">
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{selected.task_name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{selected.asset_name || ''} · {selected.task_category}</div>
            </div>
            {selected.description && (
              <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Instructions:</div>
                {selected.description}
              </div>
            )}
            <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Findings:</div>
              {selected.findings || '—'}
            </div>
            {selected.completion_notes && (
              <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Completion Notes:</div>
                {selected.completion_notes}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', marginTop: 12, fontSize: 12, color: 'var(--text-dim)' }}>
              <div>Labour: <strong style={{ color: 'var(--text)' }}>{selected.labour_hours ? `${selected.labour_hours} hrs` : '—'}</strong></div>
              <div>Labour Cost: <strong style={{ color: 'var(--text)' }}>{selected.labour_cost ? `$${Number(selected.labour_cost).toLocaleString()}` : '—'}</strong></div>
              <div>Parts Cost: <strong style={{ color: 'var(--text)' }}>{selected.parts_cost ? `$${Number(selected.parts_cost).toLocaleString()}` : '—'}</strong></div>
              <div>Total Actual: <strong style={{ color: 'var(--teal)' }}>{selected.actual_cost ? `$${Number(selected.actual_cost).toLocaleString()}` : '—'}</strong></div>
              <div>Invoice: <strong style={{ color: 'var(--text)' }}>{selected.invoice_number || '—'}</strong></div>
              <div>Closed: <strong style={{ color: 'var(--text)' }}>{selected.actual_end_date || '—'}</strong></div>
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowEditModal(false); setSelected(null) }}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
