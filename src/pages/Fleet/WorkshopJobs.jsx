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
  complaint_description: '', diagnosis_notes: '', description: '', estimated_cost: '', notes: '',
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
  const [partsLines,     setPartsLines]     = useState([])
  const [itemSearch,     setItemSearch]     = useState('')
  const [itemResults,    setItemResults]    = useState([])
  const [itemSearching,  setItemSearching]  = useState(false)
  const [labourEntries,  setLabourEntries]  = useState([])
  const [labourLoading,  setLabourLoading]  = useState(false)

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

  const loadLabourEntries = useCallback(async (woId) => {
    setLabourLoading(true)
    const { data } = await supabase.from('wo_labour').select('*').eq('wo_id', woId).order('created_at')
    setLabourEntries(data || [])
    setLabourLoading(false)
  }, [])

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
        assigned_to:           newForm.assigned_to           || null,
        workshop:              newForm.workshop              || null,
        complaint_description: newForm.complaint_description || null,
        diagnosis_notes:       newForm.diagnosis_notes       || null,
        description:           newForm.description           || null,
        estimated_cost:        parseFloat(newForm.estimated_cost) || null,
        notes:                 newForm.notes                 || null,
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

  const searchInventoryItems = async (q) => {
    if (!q.trim() || q.length < 2) { setItemResults([]); return }
    setItemSearching(true)
    const { data } = await supabase.from('items').select('id, item_code, name, balance, cost, unit')
      .or(`name.ilike.%${q}%,item_code.ilike.%${q}%`).eq('is_active', true).limit(10)
    setItemResults(data || [])
    setItemSearching(false)
  }

  const addPartLine = (item) => {
    setPartsLines(prev => [...prev, {
      _id:      crypto.randomUUID(),
      item_id:  item.id,
      item_code: item.item_code || '',
      part_name: item.name,
      qty:       1,
      unit_cost: item.cost || 0,
      balance:   item.balance || 0,
    }])
    setItemSearch('')
    setItemResults([])
  }

  const removePartLine = (uid) => setPartsLines(prev => prev.filter(p => p._id !== uid))

  const handleClose = async () => {
    if (!closeForm.findings.trim()) { toast.error('Findings are required'); return }
    setSaving(true)
    try {
      const labourCost = (parseFloat(closeForm.labour_hours) || 0) * (parseFloat(closeForm.labour_rate) || 0)
      const invPartsCost = partsLines.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unit_cost) || 0), 0)
      const partsCost  = (parseFloat(closeForm.parts_cost) || 0) + invPartsCost
      const actualCost = labourCost + partsCost

      const parts_used = partsLines.map(p => ({
        item_id:   p.item_id,
        item_code: p.item_code,
        part_name: p.part_name,
        qty:       Number(p.qty) || 0,
        unit_cost: Number(p.unit_cost) || 0,
        warehouse_id: null,
      }))

      await supabase.from('maintenance_work_orders').update({
        status:            'closed',
        findings:          closeForm.findings,
        completion_notes:  closeForm.completion_notes || null,
        labour_hours:      parseFloat(closeForm.labour_hours) || null,
        labour_rate:       parseFloat(closeForm.labour_rate)  || null,
        labour_cost:       labourCost || null,
        parts_cost:        partsCost  || null,
        actual_cost:       actualCost || null,
        parts_used:        parts_used.length ? parts_used : null,
        invoice_number:    closeForm.invoice_number || null,
        actual_end_date:   closeForm.actual_end_date || today,
        updated_at:        new Date().toISOString(),
      }).eq('id', selected.id)

      // Deduct inventory for each linked part (non-blocking on failure)
      for (const p of partsLines) {
        if (!p.item_id || !p.qty) continue
        try {
          const qty = Number(p.qty) || 0
          const now = new Date().toISOString()
          await supabase.from('stock_ledger_entries').insert({
            id:                    crypto.randomUUID(),
            item_id:               p.item_id,
            warehouse_id:          p.warehouse_id || null,
            posting_datetime:      now,
            voucher_type:          'Maintenance WO',
            voucher_no:            selected.wo_number,
            actual_qty:            -qty,
            outgoing_rate:         Number(p.unit_cost) || 0,
            valuation_rate:        Number(p.unit_cost) || 0,
            stock_value_difference:-(qty * (Number(p.unit_cost) || 0)),
            transaction_type:      'issue',
            created_by:            user?.id || '',
            created_at:            now,
          })
          // Update items.balance + total_out
          await supabase.from('items').update({
            balance:   Math.max(0, (p.balance || 0) - qty),
            total_out: supabase.rpc ? undefined : undefined,
          }).eq('id', p.item_id)
          // Use raw update for total_out increment
          await supabase.rpc('increment_item_total_out', { item_id: p.item_id, qty_out: qty }).catch(() => {
            // rpc might not exist — do a manual update fallback
            supabase.from('items').select('total_out').eq('id', p.item_id).single()
              .then(({ data: itm }) => {
                if (itm) supabase.from('items').update({ total_out: (itm.total_out || 0) + qty }).eq('id', p.item_id)
              }).catch(() => {})
          })
        } catch (invErr) {
          console.warn('[inventory] part deduction failed:', invErr?.message)
        }
      }

      await auditLog({ module: 'fleet', action: 'CLOSE', entityType: 'work_order', entityId: selected.id, entityName: selected.wo_number })
      toast.success(`WO ${selected.wo_number} closed`)
      setShowCloseModal(false)
      setSelected(null)
      setPartsLines([])
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
                        {w.status === 'closed' && (
                          <button className="btn btn-secondary btn-sm" title="View details" onClick={() => { setSelected(w); setShowEditModal(true); loadLabourEntries(w.id) }}>
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
            <label>Complaint / Problem Description</label>
            <textarea className="form-control" rows={2} placeholder="What did the driver/operator report?"
              value={newForm.complaint_description}
              onChange={e => setNewForm(f => ({ ...f, complaint_description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Diagnosis Notes</label>
            <textarea className="form-control" rows={2} placeholder="Mechanic's initial assessment…"
              value={newForm.diagnosis_notes}
              onChange={e => setNewForm(f => ({ ...f, diagnosis_notes: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Work Instructions</label>
            <textarea className="form-control" rows={2} value={newForm.description}
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

          {/* Parts from Inventory */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--yellow)' }}>inventory_2</span>
              <strong style={{ fontSize: 13 }}>Parts from Inventory</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="form-control" placeholder="Search inventory items by name or code…"
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); searchInventoryItems(e.target.value) }} />
            </div>
            {itemResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8, maxHeight: 160, overflowY: 'auto' }}>
                {itemResults.map(item => (
                  <div key={item.id}
                    style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                    onClick={() => addPartLine(item)}>
                    <span><strong>{item.item_code}</strong> — {item.name}</span>
                    <span className="text-muted">Stock: {item.balance ?? 0} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}
            {partsLines.length > 0 && (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left' }}>Part</th>
                    <th style={{ padding: '4px 8px', width: 80 }}>Qty</th>
                    <th style={{ padding: '4px 8px', width: 100 }}>Unit Cost</th>
                    <th style={{ padding: '4px 8px', width: 90 }}>Total</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {partsLines.map(p => (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}>{p.part_name}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" className="form-control" style={{ padding: '2px 6px', fontSize: 13 }}
                          min="0.01" step="0.01" value={p.qty}
                          onChange={e => setPartsLines(prev => prev.map(x => x._id === p._id ? { ...x, qty: e.target.value } : x))} />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input type="number" className="form-control" style={{ padding: '2px 6px', fontSize: 13 }}
                          min="0" step="0.01" value={p.unit_cost}
                          onChange={e => setPartsLines(prev => prev.map(x => x._id === p._id ? { ...x, unit_cost: e.target.value } : x))} />
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--teal)' }}>
                        ${((Number(p.qty) || 0) * (Number(p.unit_cost) || 0)).toFixed(2)}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => removePartLine(p._id)}
                          style={{ padding: '2px 4px', color: 'var(--red)' }}>
                          <span className="material-icons" style={{ fontSize: 16 }}>close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>Parts Total:</td>
                    <td style={{ padding: '4px 8px', color: 'var(--teal)', fontWeight: 700 }}>
                      ${partsLines.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unit_cost) || 0), 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowCloseModal(false); setSelected(null); setPartsLines([]) }}>Cancel</button>
            <button className="btn btn-success" onClick={handleClose} disabled={saving}>
              {saving ? 'Closing…' : 'Close Work Order'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* View findings modal */}
      {showEditModal && selected && (
        <ModalDialog open onClose={() => { setShowEditModal(false); setSelected(null); setLabourEntries([]) }}
          title={`WO Details · ${selected.wo_number}`} size="lg">
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.task_name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{selected.asset_name || ''} · {selected.task_category} · {selected.priority}</div>
            </div>

            {/* Complaint & Diagnosis */}
            {(selected.complaint_description || selected.diagnosis_notes) && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, borderLeft: '3px solid var(--yellow)' }}>
                {selected.complaint_description && (
                  <div style={{ marginBottom: selected.diagnosis_notes ? 8 : 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 3 }}>Complaint</div>
                    {selected.complaint_description}
                  </div>
                )}
                {selected.diagnosis_notes && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 3 }}>Diagnosis</div>
                    {selected.diagnosis_notes}
                  </div>
                )}
              </div>
            )}

            {selected.description && (
              <div style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
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

            {/* Labour Entries from wo_labour */}
            {labourEntries.length > 0 && (
              <div style={{ marginBottom: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Labour Entries</div>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Technician</th>
                      <th style={{ padding: '4px 8px' }}>Date</th>
                      <th style={{ padding: '4px 8px' }}>Hours</th>
                      <th style={{ padding: '4px 8px' }}>Rate</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labourEntries.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 8px' }}>{l.technician_name || '—'}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{l.work_date || '—'}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)' }}>{l.hours}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--mono)' }}>${Number(l.hourly_rate).toFixed(2)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                          ${(Number(l.hours) * Number(l.hourly_rate)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {labourLoading && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Loading labour entries…</div>}

            {/* Cost Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', marginTop: 12, fontSize: 12, color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div>Labour: <strong style={{ color: 'var(--text)' }}>{selected.labour_hours ? `${selected.labour_hours} hrs` : '—'}</strong></div>
              <div>Labour Cost: <strong style={{ color: 'var(--text)' }}>{selected.labour_cost ? `$${Number(selected.labour_cost).toLocaleString()}` : '—'}</strong></div>
              <div>Parts Cost: <strong style={{ color: 'var(--text)' }}>{selected.parts_cost ? `$${Number(selected.parts_cost).toLocaleString()}` : '—'}</strong></div>
              <div>Total Actual: <strong style={{ color: 'var(--teal)', fontSize: 14 }}>{selected.actual_cost ? `$${Number(selected.actual_cost).toLocaleString()}` : '—'}</strong></div>
              {selected.estimated_cost > 0 && (
                <div>Estimated: <strong style={{ color: selected.actual_cost > selected.estimated_cost ? 'var(--red)' : 'var(--green)' }}>
                  ${Number(selected.estimated_cost).toLocaleString()}
                  {selected.actual_cost > 0 && selected.estimated_cost > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11 }}>
                      ({selected.actual_cost > selected.estimated_cost ? '+' : ''}{(((selected.actual_cost - selected.estimated_cost) / selected.estimated_cost) * 100).toFixed(0)}%)
                    </span>
                  )}
                </strong></div>
              )}
              <div>Invoice: <strong style={{ color: 'var(--text)' }}>{selected.invoice_number || '—'}</strong></div>
              <div>Closed: <strong style={{ color: 'var(--text)' }}>{selected.actual_end_date || '—'}</strong></div>
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowEditModal(false); setSelected(null); setLabourEntries([]) }}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
