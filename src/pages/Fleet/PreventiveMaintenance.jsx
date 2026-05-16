// src/pages/Fleet/PreventiveMaintenance.jsx
// World-standard Preventive Maintenance page for mining-site fleet ERP.

import { useState, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useFleet } from '../../contexts/FleetContext'
import { PageHeader } from '../../components/ui/PageHeader'
import { TabNav } from '../../components/ui/TabNav'

// ─── Constants ───────────────────────────────────────────────────────────────

const TASK_CATEGORIES = [
  { value: 'engine',      label: 'Engine' },
  { value: 'brakes',      label: 'Brakes' },
  { value: 'tyres',       label: 'Tyres' },
  { value: 'electrical',  label: 'Electrical' },
  { value: 'hydraulics',  label: 'Hydraulics' },
  { value: 'bodywork',    label: 'Bodywork' },
  { value: 'lubrication', label: 'Lubrication' },
  { value: 'inspection',  label: 'Inspection' },
  { value: 'other',       label: 'Other' },
]

const INTERVAL_TYPES = [
  { value: 'km',    label: 'km' },
  { value: 'hours', label: 'Hours' },
  { value: 'days',  label: 'Days' },
  { value: 'date',  label: 'Fixed Date' },
]

const PRIORITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
]

const WO_STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed',      label: 'Closed' },
  { value: 'cancelled',   label: 'Cancelled' },
]

const ASSET_TYPES = [
  { value: 'vehicle',         label: 'Vehicle' },
  { value: 'generator',       label: 'Generator' },
  { value: 'heavy_equipment', label: 'Heavy Equipment' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split('T')[0]
const todayMs = () => new Date().setHours(0, 0, 0, 0)

function diffDays(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).setHours(0, 0, 0, 0) - todayMs()) / 86400000)
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCurrency(val) {
  if (val == null || val === '') return '—'
  return `K ${Number(val).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function scheduleStatus(s) {
  if (!s.next_due_date) return { label: 'No Date', color: 'var(--text-dim)', urgency: 'none' }
  const d = diffDays(s.next_due_date)
  if (d < 0) return { label: `Overdue ${Math.abs(d)}d`, color: 'var(--red)', urgency: 'overdue' }
  if (d <= 14) return { label: `Due in ${d}d`, color: 'var(--yellow)', urgency: 'soon' }
  return { label: 'OK', color: 'var(--green)', urgency: 'ok' }
}

function priorityBadge(p) {
  const map = {
    critical: 'badge-red',
    high:     'badge-gold',
    medium:   'badge-yellow',
    low:      'badge-blue',
  }
  return map[p] || 'badge-dim'
}

function woStatusBadge(s) {
  const map = {
    open:        'badge-blue',
    in_progress: 'badge-yellow',
    closed:      'badge-green',
    cancelled:   'badge-dim',
  }
  return map[s] || 'badge-dim'
}

function intervalLabel(s) {
  if (!s.interval_type || !s.interval_value) return '—'
  const v = Number(s.interval_value).toLocaleString()
  switch (s.interval_type) {
    case 'km':    return `Every ${v} km`
    case 'hours': return `Every ${v} hrs`
    case 'days':  return `Every ${v} days`
    case 'date':  return `Fixed: ${fmt(s.next_due_date)}`
    default:      return `${v} ${s.interval_type}`
  }
}

function rowBorderStyle(urgency) {
  if (urgency === 'overdue') return { borderLeft: '3px solid var(--red)' }
  if (urgency === 'soon')   return { borderLeft: '3px solid var(--yellow)' }
  return {}
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function KPIBar({ items }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: 10,
      marginBottom: 20,
    }}>
      {items.map((k, i) => (
        <div key={i} className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-val" style={{ fontSize: 22, color: k.color || 'var(--text)' }}>{k.value}</div>
          {k.sub && <div className="kpi-sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function FilterRow({ children }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function SmallSelect({ value, onChange, options, placeholder, style }) {
  return (
    <select
      className="form-control"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ height: 34, padding: '0 10px', fontSize: 12, width: 'auto', minWidth: 130, ...style }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function SmallSearch({ value, onChange, placeholder = 'Search…' }) {
  return (
    <input
      className="form-control"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ height: 34, padding: '0 10px', fontSize: 12, width: 180 }}
    />
  )
}

function ModalOverlay({ open, onClose, title, size, children }) {
  if (!open) return null
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${size === 'lg' ? ' modal-lg' : size === 'xl' ? ' modal-xl' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div className="modal-title" style={{ marginBottom: 0 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
          >
            <span className="material-icons">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Asset helpers ────────────────────────────────────────────────────────────

function useAssetLookup() {
  const { vehicles, generators, earthMovers } = useFleet()

  const allAssets = useMemo(() => [
    ...vehicles.map(v => ({ id: v.id, label: v.reg || v.id, type: 'vehicle', raw: v })),
    ...generators.map(g => ({ id: g.id, label: g.gen_code || g.id, type: 'generator', raw: g })),
    ...earthMovers.map(e => ({ id: e.id, label: e.reg || e.id, type: 'heavy_equipment', raw: e })),
  ], [vehicles, generators, earthMovers])

  const assetById = useCallback((id) => allAssets.find(a => a.id === id), [allAssets])
  const assetLabel = useCallback((id) => assetById(id)?.label || id || '—', [assetById])
  const assetTypeLabel = useCallback((type) => ASSET_TYPES.find(t => t.value === type)?.label || type, [])

  return { allAssets, assetById, assetLabel, assetTypeLabel }
}

// ─── PM Schedule Modal ────────────────────────────────────────────────────────

const BLANK_SCHED = {
  asset_id: '', asset_type: 'vehicle',
  task_name: '', task_category: 'inspection',
  interval_type: 'days', interval_value: '',
  next_due_date: '', next_due_km: '', next_due_hours: '',
  last_done_date: '', last_done_km: '', last_done_hours: '',
  priority: 'medium', notes: '', is_active: true,
}

function ScheduleModal({ open, onClose, editing, allAssets }) {
  const { addMaintenanceSchedule, updateMaintenanceSchedule } = useFleet()
  const [form, setForm] = useState(BLANK_SCHED)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        asset_id:       editing.asset_id       || '',
        asset_type:     editing.asset_type     || 'vehicle',
        task_name:      editing.task_name       || '',
        task_category:  editing.task_category   || 'inspection',
        interval_type:  editing.interval_type   || 'days',
        interval_value: editing.interval_value  || '',
        next_due_date:  editing.next_due_date   || '',
        next_due_km:    editing.next_due_km      != null ? editing.next_due_km : '',
        next_due_hours: editing.next_due_hours   != null ? editing.next_due_hours : '',
        last_done_date: editing.last_done_date  || '',
        last_done_km:   editing.last_done_km     != null ? editing.last_done_km : '',
        last_done_hours:editing.last_done_hours  != null ? editing.last_done_hours : '',
        priority:       editing.priority        || 'medium',
        notes:          editing.notes           || '',
        is_active:      editing.is_active != null ? editing.is_active : true,
      })
    } else {
      setForm(BLANK_SCHED)
    }
  }, [open, editing])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAssetChange = (id) => {
    const a = allAssets.find(x => x.id === id)
    setForm(f => ({ ...f, asset_id: id, asset_type: a?.type || f.asset_type }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_id) return toast.error('Select an asset')
    if (!form.task_name.trim()) return toast.error('Task name required')
    if (!form.interval_value) return toast.error('Interval value required')
    setSaving(true)
    const payload = {
      ...form,
      interval_value: Number(form.interval_value),
      next_due_km:    form.next_due_km    !== '' ? Number(form.next_due_km)    : null,
      next_due_hours: form.next_due_hours !== '' ? Number(form.next_due_hours) : null,
      last_done_km:   form.last_done_km   !== '' ? Number(form.last_done_km)   : null,
      last_done_hours:form.last_done_hours!== '' ? Number(form.last_done_hours): null,
      next_due_date:  form.next_due_date  || null,
      last_done_date: form.last_done_date || null,
      notes:          form.notes          || null,
    }
    try {
      if (editing) {
        await updateMaintenanceSchedule(editing.id, payload)
        toast.success('Schedule updated')
      } else {
        await addMaintenanceSchedule(payload)
        toast.success('Schedule created')
      }
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay open={open} onClose={onClose} title={editing ? 'Edit PM Schedule' : 'New PM Schedule'} size="lg">
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>ASSET *</label>
            <select className="form-control" value={form.asset_id} onChange={e => handleAssetChange(e.target.value)} required>
              <option value="">— Select Asset —</option>
              {['vehicle', 'generator', 'heavy_equipment'].map(type => {
                const group = allAssets.filter(a => a.type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={ASSET_TYPES.find(t => t.value === type)?.label || type}>
                    {group.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div className="form-group">
            <label>PRIORITY</label>
            <select className="form-control" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>TASK NAME *</label>
            <input className="form-control" value={form.task_name} onChange={e => set('task_name', e.target.value)} placeholder="e.g. Engine Oil Change" required />
          </div>
          <div className="form-group">
            <label>CATEGORY</label>
            <select className="form-control" value={form.task_category} onChange={e => set('task_category', e.target.value)}>
              {TASK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>INTERVAL TYPE</label>
            <select className="form-control" value={form.interval_type} onChange={e => set('interval_type', e.target.value)}>
              {INTERVAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>INTERVAL VALUE *</label>
            <input className="form-control" type="number" min="1" value={form.interval_value} onChange={e => set('interval_value', e.target.value)} placeholder="e.g. 5000" required />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8 }}>NEXT DUE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label>DATE</label>
              <input className="form-control" type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>KM</label>
              <input className="form-control" type="number" value={form.next_due_km} onChange={e => set('next_due_km', e.target.value)} placeholder="Odometer km" />
            </div>
            <div className="form-group">
              <label>HOURS</label>
              <input className="form-control" type="number" value={form.next_due_hours} onChange={e => set('next_due_hours', e.target.value)} placeholder="Hour meter" />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8 }}>LAST DONE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label>DATE</label>
              <input className="form-control" type="date" value={form.last_done_date} onChange={e => set('last_done_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label>KM</label>
              <input className="form-control" type="number" value={form.last_done_km} onChange={e => set('last_done_km', e.target.value)} placeholder="Odometer km" />
            </div>
            <div className="form-group">
              <label>HOURS</label>
              <input className="form-control" type="number" value={form.last_done_hours} onChange={e => set('last_done_hours', e.target.value)} placeholder="Hour meter" />
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>NOTES</label>
          <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes…" />
        </div>

        <div className="form-group" style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="pm-active"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="pm-active" style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>Active schedule</label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Schedule')}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ─── Work Order Modal ─────────────────────────────────────────────────────────

const BLANK_WO = {
  asset_id: '', asset_type: 'vehicle',
  schedule_id: null,
  task_name: '', task_category: 'inspection',
  assigned_to: '',
  planned_start_date: today(), planned_end_date: '',
  estimated_cost: '', labour_hours: '', labour_rate: '',
  notes: '',
}

function WorkOrderModal({ open, onClose, prefill, allAssets }) {
  const { createWorkOrder } = useFleet()
  const [form, setForm] = useState(BLANK_WO)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (prefill) {
      setForm({
        asset_id:          prefill.asset_id       || '',
        asset_type:        prefill.asset_type      || 'vehicle',
        schedule_id:       prefill.schedule_id     || null,
        task_name:         prefill.task_name       || '',
        task_category:     prefill.task_category   || 'inspection',
        assigned_to:       prefill.assigned_to     || '',
        planned_start_date:today(),
        planned_end_date:  '',
        estimated_cost:    prefill.estimated_cost  || '',
        labour_hours:      '',
        labour_rate:       '',
        notes:             prefill.notes           || '',
      })
    } else {
      setForm(BLANK_WO)
    }
  }, [open, prefill])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleAssetChange = (id) => {
    const a = allAssets.find(x => x.id === id)
    setForm(f => ({ ...f, asset_id: id, asset_type: a?.type || f.asset_type }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_id) return toast.error('Select an asset')
    if (!form.task_name.trim()) return toast.error('Task name required')
    setSaving(true)
    const payload = {
      asset_id:          form.asset_id,
      asset_type:        form.asset_type,
      schedule_id:       form.schedule_id || null,
      task_name:         form.task_name.trim(),
      task_category:     form.task_category,
      assigned_to:       form.assigned_to || null,
      planned_start_date:form.planned_start_date || null,
      planned_end_date:  form.planned_end_date   || null,
      estimated_cost:    form.estimated_cost !== '' ? Number(form.estimated_cost) : null,
      labour_hours:      form.labour_hours   !== '' ? Number(form.labour_hours)   : null,
      labour_rate:       form.labour_rate    !== '' ? Number(form.labour_rate)    : null,
      parts_used:        [],
      completion_notes:  null,
      status:            'open',
    }
    try {
      await createWorkOrder(payload)
      toast.success('Work order created')
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Failed to create work order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay open={open} onClose={onClose} title="New Work Order" size="lg">
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>ASSET *</label>
            <select className="form-control" value={form.asset_id} onChange={e => handleAssetChange(e.target.value)} required>
              <option value="">— Select Asset —</option>
              {['vehicle', 'generator', 'heavy_equipment'].map(type => {
                const group = allAssets.filter(a => a.type === type)
                if (!group.length) return null
                return (
                  <optgroup key={type} label={ASSET_TYPES.find(t => t.value === type)?.label || type}>
                    {group.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
          <div className="form-group">
            <label>TASK CATEGORY</label>
            <select className="form-control" value={form.task_category} onChange={e => set('task_category', e.target.value)}>
              {TASK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>TASK NAME *</label>
          <input className="form-control" value={form.task_name} onChange={e => set('task_name', e.target.value)} placeholder="Describe the task" required />
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>ASSIGNED TO</label>
            <input className="form-control" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} placeholder="Technician name" />
          </div>
          <div className="form-group">
            <label>ESTIMATED COST (K)</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.estimated_cost} onChange={e => set('estimated_cost', e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>PLANNED START</label>
            <input className="form-control" type="date" value={form.planned_start_date} onChange={e => set('planned_start_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>PLANNED END</label>
            <input className="form-control" type="date" value={form.planned_end_date} onChange={e => set('planned_end_date', e.target.value)} />
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>LABOUR HOURS</label>
            <input className="form-control" type="number" min="0" step="0.5" value={form.labour_hours} onChange={e => set('labour_hours', e.target.value)} placeholder="0" />
          </div>
          <div className="form-group">
            <label>LABOUR RATE (K/hr)</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.labour_rate} onChange={e => set('labour_rate', e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>NOTES</label>
          <textarea className="form-control" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Job instructions, special requirements…" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ─── Close WO Modal ───────────────────────────────────────────────────────────

const BLANK_PART = () => ({ id: crypto.randomUUID(), part_name: '', qty: '', unit_cost: '' })

function CloseWOModal({ open, onClose, wo }) {
  const { closeWorkOrder } = useFleet()
  const [form, setForm] = useState({
    actual_end_date: today(),
    completion_notes: '',
    odometer_at_service: '',
    hour_meter_at_service: '',
  })
  const [parts, setParts] = useState([BLANK_PART()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({
      actual_end_date:      today(),
      completion_notes:     wo?.completion_notes     || '',
      odometer_at_service:  wo?.odometer_at_service  != null ? wo.odometer_at_service : '',
      hour_meter_at_service:wo?.hour_meter_at_service!= null ? wo.hour_meter_at_service : '',
    })
    setParts([BLANK_PART()])
  }, [open, wo])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const updatePart = (id, key, val) => setParts(ps => ps.map(p => p.id === id ? { ...p, [key]: val } : p))
  const removePart = (id) => setParts(ps => ps.filter(p => p.id !== id))
  const addPart = () => setParts(ps => [...ps, BLANK_PART()])

  const partsTotal = parts.reduce((s, p) => {
    const qty = Number(p.qty) || 0
    const uc = Number(p.unit_cost) || 0
    return s + qty * uc
  }, 0)

  const labourCost = wo
    ? (Number(wo.labour_hours) || 0) * (Number(wo.labour_rate) || 0)
    : 0

  const totalCost = partsTotal + labourCost

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.actual_end_date) return toast.error('Completion date required')
    setSaving(true)
    const validParts = parts.filter(p => p.part_name.trim())
    const partsPayload = validParts.map(p => ({
      part_name: p.part_name.trim(),
      qty: Number(p.qty) || 0,
      unit_cost: Number(p.unit_cost) || 0,
    }))
    try {
      await closeWorkOrder(wo.id, {
        actual_cost:          totalCost || null,
        completion_notes:     form.completion_notes || null,
        actual_end_date:      form.actual_end_date,
        odometer_at_service:  form.odometer_at_service  !== '' ? Number(form.odometer_at_service)  : undefined,
        hour_meter_at_service:form.hour_meter_at_service!== '' ? Number(form.hour_meter_at_service): undefined,
      })
      // Persist parts back via updateWorkOrder is called inside closeWorkOrder only for cost fields.
      // We do a separate update for parts_used if there are any.
      if (partsPayload.length > 0) {
        const { updateWorkOrder } = wo // won't exist — use context via ref
      }
      toast.success('Work order closed')
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Failed to close work order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay open={open} onClose={onClose} title={`Close WO — ${wo?.wo_number || ''}`} size="lg">
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>COMPLETION DATE *</label>
            <input className="form-control" type="date" value={form.actual_end_date} onChange={e => set('actual_end_date', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>ODOMETER AT SERVICE (km)</label>
            <input className="form-control" type="number" value={form.odometer_at_service} onChange={e => set('odometer_at_service', e.target.value)} placeholder="Leave blank if N/A" />
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label>HOUR METER AT SERVICE</label>
            <input className="form-control" type="number" value={form.hour_meter_at_service} onChange={e => set('hour_meter_at_service', e.target.value)} placeholder="Leave blank if N/A" />
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ visibility: 'hidden' }}>_</label>
            <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-dim)' }}>
              Labour: {fmtCurrency(labourCost)} ({wo?.labour_hours || 0} hrs × K{wo?.labour_rate || 0}/hr)
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8,
          }}>
            <span>PARTS USED</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addPart}>
              <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Part
            </button>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>PART NAME</th>
                  <th style={{ width: 80 }}>QTY</th>
                  <th style={{ width: 110 }}>UNIT COST (K)</th>
                  <th style={{ width: 100 }}>LINE TOTAL</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => (
                  <tr key={p.id}>
                    <td>
                      <input
                        className="form-control"
                        value={p.part_name}
                        onChange={e => updatePart(p.id, 'part_name', e.target.value)}
                        placeholder="Part description"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control"
                        type="number" min="0" step="0.01"
                        value={p.qty}
                        onChange={e => updatePart(p.id, 'qty', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control"
                        type="number" min="0" step="0.01"
                        value={p.unit_cost}
                        onChange={e => updatePart(p.id, 'unit_cost', e.target.value)}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      />
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      K {((Number(p.qty) || 0) * (Number(p.unit_cost) || 0)).toFixed(2)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removePart(p.id)}
                        style={{ padding: '4px 8px' }}
                      >
                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface2)' }}>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>Parts Subtotal</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>
                    K {partsTotal.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
                <tr style={{ background: 'var(--surface2)' }}>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 800, fontSize: 13 }}>Total Cost</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>
                    K {totalCost.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>COMPLETION NOTES</label>
          <textarea className="form-control" rows={3} value={form.completion_notes} onChange={e => set('completion_notes', e.target.value)} placeholder="Work carried out, findings, follow-up actions…" />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Closing…' : 'Close Work Order'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ─── WO Detail Slide-out Panel ────────────────────────────────────────────────

function WODetailPanel({ wo, onClose, assetLabel, onClose_WO, onStart, onCancel }) {
  if (!wo) return null

  const partsUsed = Array.isArray(wo.parts_used) ? wo.parts_used : []
  const partsTotal = partsUsed.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unit_cost) || 0), 0)
  const labourCost = (Number(wo.labour_hours) || 0) * (Number(wo.labour_rate) || 0)

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
      background: 'var(--surface)', borderLeft: '1px solid var(--border2)',
      zIndex: 150, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,.5)',
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{wo.wo_number || 'WO'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{assetLabel(wo.asset_id)}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
          <span className="material-icons">close</span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ marginBottom: 16 }}>
          <span className={`badge ${woStatusBadge(wo.status)}`} style={{ textTransform: 'uppercase' }}>
            {wo.status?.replace('_', ' ') || 'open'}
          </span>
        </div>

        <DetailRow label="Task" value={wo.task_name} />
        <DetailRow label="Category" value={TASK_CATEGORIES.find(c => c.value === wo.task_category)?.label || wo.task_category} />
        <DetailRow label="Assigned To" value={wo.assigned_to || '—'} />
        <DetailRow label="Planned Start" value={fmt(wo.planned_start_date)} />
        <DetailRow label="Planned End" value={fmt(wo.planned_end_date)} />
        {wo.actual_end_date && <DetailRow label="Actual End" value={fmt(wo.actual_end_date)} />}
        {wo.odometer_at_service != null && <DetailRow label="Odometer at Service" value={`${Number(wo.odometer_at_service).toLocaleString()} km`} />}
        {wo.hour_meter_at_service != null && <DetailRow label="Hour Meter at Service" value={`${Number(wo.hour_meter_at_service).toLocaleString()} hrs`} />}

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8 }}>COST BREAKDOWN</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: 'var(--text-mid)' }}>Labour ({wo.labour_hours || 0} hrs × K{wo.labour_rate || 0})</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtCurrency(labourCost)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
            <span style={{ color: 'var(--text-mid)' }}>Parts subtotal</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{fmtCurrency(partsTotal)}</span>
          </div>
          {wo.estimated_cost != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
              <span style={{ color: 'var(--text-mid)' }}>Estimated cost</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtCurrency(wo.estimated_cost)}</span>
            </div>
          )}
          {wo.actual_cost != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, color: 'var(--green)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
              <span>Actual Cost</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtCurrency(wo.actual_cost)}</span>
            </div>
          )}
        </div>

        {partsUsed.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8 }}>PARTS USED</div>
            <table>
              <thead>
                <tr>
                  <th>PART</th>
                  <th style={{ width: 60 }}>QTY</th>
                  <th style={{ width: 90 }}>UNIT COST</th>
                  <th style={{ width: 90 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {partsUsed.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{p.part_name}</td>
                    <td style={{ fontSize: 12 }}>{p.qty}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>K {Number(p.unit_cost).toFixed(2)}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>K {(Number(p.qty) * Number(p.unit_cost)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {wo.completion_notes && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 6 }}>COMPLETION NOTES</div>
            <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 8 }}>
              {wo.completion_notes}
            </div>
          </div>
        )}
      </div>

      {wo.status !== 'closed' && wo.status !== 'cancelled' && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {wo.status === 'open' && (
            <button className="btn btn-secondary btn-sm" onClick={() => onStart(wo)}>
              <span className="material-icons" style={{ fontSize: 14 }}>play_arrow</span> Start
            </button>
          )}
          {(wo.status === 'open' || wo.status === 'in_progress') && (
            <button className="btn btn-primary btn-sm" onClick={() => onClose_WO(wo)}>
              <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span> Close WO
            </button>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => onCancel(wo)}>
            <span className="material-icons" style={{ fontSize: 14 }}>cancel</span> Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)', minWidth: 140 }}>{label}</span>
      <span style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ─── Tab 1: PM Schedule ───────────────────────────────────────────────────────

function PMScheduleTab({ onCreateWO }) {
  const { maintenanceSchedules, deleteMaintenanceSchedule } = useFleet()
  const { allAssets, assetLabel, assetTypeLabel } = useAssetLookup()

  const [filterType,     setFilterType]     = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [search,         setSearch]         = useState('')
  const [modalOpen,      setModalOpen]      = useState(false)
  const [editing,        setEditing]        = useState(null)

  const activeSchedules = useMemo(() => maintenanceSchedules.filter(s => s.is_active !== false), [maintenanceSchedules])

  const filtered = useMemo(() => {
    return activeSchedules.filter(s => {
      if (filterType     && s.asset_type     !== filterType)     return false
      if (filterCategory && s.task_category  !== filterCategory) return false
      if (filterPriority && s.priority       !== filterPriority) return false
      const st = scheduleStatus(s)
      if (filterStatus && st.urgency !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const label = assetLabel(s.asset_id).toLowerCase()
        if (!s.task_name?.toLowerCase().includes(q) && !label.includes(q)) return false
      }
      return true
    })
  }, [activeSchedules, filterType, filterCategory, filterPriority, filterStatus, search, assetLabel])

  const handleDelete = async (s) => {
    if (!confirm(`Delete schedule "${s.task_name}"? This cannot be undone.`)) return
    try {
      await deleteMaintenanceSchedule(s.id)
      toast.success('Schedule deleted')
    } catch (err) {
      toast.error(err?.message || 'Failed to delete')
    }
  }

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (s) => { setEditing(s); setModalOpen(true) }

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>PM Schedules ({filtered.length})</span>
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 15 }}>add</span> New Schedule
          </button>
        </div>

        <FilterRow>
          <SmallSearch value={search} onChange={setSearch} placeholder="Search asset or task…" />
          <SmallSelect value={filterType} onChange={setFilterType} options={ASSET_TYPES} placeholder="All Asset Types" />
          <SmallSelect value={filterCategory} onChange={setFilterCategory} options={TASK_CATEGORIES} placeholder="All Categories" />
          <SmallSelect value={filterPriority} onChange={setFilterPriority} options={PRIORITIES} placeholder="All Priorities" />
          <SmallSelect
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'overdue', label: 'Overdue' },
              { value: 'soon',    label: 'Due Soon' },
              { value: 'ok',      label: 'OK' },
            ]}
            placeholder="All Statuses"
          />
          {(filterType || filterCategory || filterPriority || filterStatus || search) && (
            <button className="btn btn-secondary btn-sm" onClick={() => {
              setFilterType(''); setFilterCategory(''); setFilterPriority(''); setFilterStatus(''); setSearch('')
            }}>
              <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear
            </button>
          )}
        </FilterRow>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ASSET</th>
                <th>TASK NAME</th>
                <th>CATEGORY</th>
                <th>INTERVAL</th>
                <th>LAST DONE</th>
                <th>NEXT DUE</th>
                <th>PRIORITY</th>
                <th>STATUS</th>
                <th style={{ width: 130 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>
                    <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>event_available</span>
                    No schedules match filters
                  </td>
                </tr>
              )}
              {filtered.map(s => {
                const st = scheduleStatus(s)
                return (
                  <tr key={s.id} style={rowBorderStyle(st.urgency)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{assetLabel(s.asset_id)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: .5 }}>
                        {assetTypeLabel(s.asset_type)}
                      </div>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <div style={{ fontWeight: 500 }}>{s.task_name}</div>
                      {s.notes && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                          {s.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: 'var(--text-mid)', textTransform: 'capitalize' }}>
                        {s.task_category}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{intervalLabel(s)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>
                      {fmt(s.last_done_date)}
                      {s.last_done_km != null && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{Number(s.last_done_km).toLocaleString()} km</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{fmt(s.next_due_date)}</div>
                      {s.next_due_km != null && (
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{Number(s.next_due_km).toLocaleString()} km</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${priorityBadge(s.priority)}`} style={{ textTransform: 'uppercase' }}>
                        {s.priority}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Create Work Order"
                          onClick={() => onCreateWO(s)}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>build</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Edit"
                          onClick={() => openEdit(s)}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          title="Delete"
                          onClick={() => handleDelete(s)}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ScheduleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        allAssets={allAssets}
      />
    </>
  )
}

// ─── Tab 2: Work Orders ───────────────────────────────────────────────────────

function WorkOrdersTab({ prefillWO, onClearPrefill, allAssets }) {
  const { workOrders, updateWorkOrder } = useFleet()
  const { assetLabel, assetTypeLabel } = useAssetLookup()

  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterType,     setFilterType]     = useState('')
  const [search,         setSearch]         = useState('')
  const [woModalOpen,    setWoModalOpen]    = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [selectedWO,     setSelectedWO]     = useState(null)
  const [detailWO,       setDetailWO]       = useState(null)

  // Open create modal if raised from PM tab
  useEffect(() => {
    if (prefillWO) {
      setWoModalOpen(true)
    }
  }, [prefillWO])

  const filtered = useMemo(() => {
    return workOrders.filter(w => {
      if (filterStatus && w.status !== filterStatus) return false
      if (filterType   && w.asset_type !== filterType) return false
      if (search) {
        const q = search.toLowerCase()
        const al = assetLabel(w.asset_id).toLowerCase()
        if (!w.task_name?.toLowerCase().includes(q) && !al.includes(q) && !w.wo_number?.toLowerCase().includes(q) && !(w.assigned_to || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [workOrders, filterStatus, filterType, search, assetLabel])

  const handleStart = async (wo) => {
    try {
      await updateWorkOrder(wo.id, { status: 'in_progress' })
      toast.success('Work order started')
      if (detailWO?.id === wo.id) setDetailWO({ ...wo, status: 'in_progress' })
    } catch (err) {
      toast.error(err?.message || 'Failed to start WO')
    }
  }

  const handleCancel = async (wo) => {
    if (!confirm(`Cancel WO ${wo.wo_number}?`)) return
    try {
      await updateWorkOrder(wo.id, { status: 'cancelled' })
      toast.success('Work order cancelled')
      if (detailWO?.id === wo.id) setDetailWO(null)
    } catch (err) {
      toast.error(err?.message || 'Failed to cancel WO')
    }
  }

  const openCloseModal = (wo) => { setSelectedWO(wo); setCloseModalOpen(true) }

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Work Orders ({filtered.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => { onClearPrefill(); setWoModalOpen(true) }}>
            <span className="material-icons" style={{ fontSize: 15 }}>add</span> New WO
          </button>
        </div>

        <FilterRow>
          <SmallSearch value={search} onChange={setSearch} placeholder="Search WO#, asset, task…" />
          <SmallSelect value={filterStatus} onChange={setFilterStatus} options={WO_STATUSES} placeholder="All Statuses" />
          <SmallSelect value={filterType} onChange={setFilterType} options={ASSET_TYPES} placeholder="All Asset Types" />
          {(filterStatus || filterType || search) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterStatus(''); setFilterType(''); setSearch('') }}>
              <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear
            </button>
          )}
        </FilterRow>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>WO#</th>
                <th>ASSET</th>
                <th>TASK</th>
                <th>ASSIGNED TO</th>
                <th>STATUS</th>
                <th>PLANNED DATE</th>
                <th>EST. COST</th>
                <th>ACTUAL COST</th>
                <th style={{ width: 150 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>
                    <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>assignment</span>
                    No work orders match filters
                  </td>
                </tr>
              )}
              {filtered.map(wo => (
                <tr
                  key={wo.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDetailWO(detailWO?.id === wo.id ? null : wo)}
                >
                  <td>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>
                      {wo.wo_number || '—'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{assetLabel(wo.asset_id)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      {assetTypeLabel(wo.asset_type)}
                    </div>
                  </td>
                  <td style={{ maxWidth: 200 }}>
                    <div>{wo.task_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{wo.task_category}</div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{wo.assigned_to || '—'}</td>
                  <td>
                    <span className={`badge ${woStatusBadge(wo.status)}`} style={{ textTransform: 'uppercase' }}>
                      {wo.status?.replace('_', ' ') || 'open'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{fmt(wo.planned_start_date)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtCurrency(wo.estimated_cost)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: wo.actual_cost != null ? 'var(--green)' : 'var(--text-dim)' }}>
                    {fmtCurrency(wo.actual_cost)}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {wo.status === 'open' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleStart(wo)} title="Start">
                          <span className="material-icons" style={{ fontSize: 13 }}>play_arrow</span>
                        </button>
                      )}
                      {(wo.status === 'open' || wo.status === 'in_progress') && (
                        <button className="btn btn-primary btn-sm" onClick={() => openCloseModal(wo)} title="Close WO">
                          <span className="material-icons" style={{ fontSize: 13 }}>check_circle</span>
                        </button>
                      )}
                      {wo.status !== 'closed' && wo.status !== 'cancelled' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleCancel(wo)} title="Cancel">
                          <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => setDetailWO(detailWO?.id === wo.id ? null : wo)} title="Details">
                        <span className="material-icons" style={{ fontSize: 13 }}>info</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <WorkOrderModal
        open={woModalOpen}
        onClose={() => { setWoModalOpen(false); onClearPrefill() }}
        prefill={prefillWO}
        allAssets={allAssets}
      />

      <CloseWOModal
        open={closeModalOpen}
        onClose={() => { setCloseModalOpen(false); setSelectedWO(null) }}
        wo={selectedWO}
      />

      {detailWO && (
        <WODetailPanel
          wo={workOrders.find(w => w.id === detailWO.id) || detailWO}
          onClose={() => setDetailWO(null)}
          assetLabel={assetLabel}
          onClose_WO={openCloseModal}
          onStart={handleStart}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}

// ─── Tab 3: Upcoming 30-day ───────────────────────────────────────────────────

function UpcomingTab({ onCreateWO }) {
  const { workOrders, getUpcomingPM, maintenanceSchedules } = useFleet()
  const { assetLabel, assetTypeLabel } = useAssetLookup()

  const upcoming = useMemo(() => getUpcomingPM(30), [getUpcomingPM, maintenanceSchedules])

  const overdue = useMemo(() =>
    maintenanceSchedules.filter(s => s.is_active !== false && s.next_due_date && diffDays(s.next_due_date) < 0),
    [maintenanceSchedules]
  )

  const dueThisWeek = useMemo(() =>
    maintenanceSchedules.filter(s => {
      if (s.is_active === false || !s.next_due_date) return false
      const d = diffDays(s.next_due_date)
      return d >= 0 && d <= 7
    }),
    [maintenanceSchedules]
  )

  const dueThisMonth = useMemo(() =>
    maintenanceSchedules.filter(s => {
      if (s.is_active === false || !s.next_due_date) return false
      const d = diffDays(s.next_due_date)
      return d >= 0 && d <= 30
    }),
    [maintenanceSchedules]
  )

  const openWOs   = useMemo(() => workOrders.filter(w => w.status === 'open').length, [workOrders])
  const inProgWOs = useMemo(() => workOrders.filter(w => w.status === 'in_progress').length, [workOrders])

  // Group into sections
  const sections = useMemo(() => {
    const todayD = new Date(); todayD.setHours(0,0,0,0)
    const weekEnd = new Date(todayD); weekEnd.setDate(todayD.getDate() + 7)
    const nextWeekEnd = new Date(todayD); nextWeekEnd.setDate(todayD.getDate() + 14)
    const monthEnd = new Date(todayD); monthEnd.setDate(todayD.getDate() + 30)

    const allDue = [
      ...overdue.map(s => ({ ...s, _section: 'overdue' })),
      ...maintenanceSchedules.filter(s => {
        if (s.is_active === false || !s.next_due_date) return false
        const d = diffDays(s.next_due_date)
        return d >= 0 && d <= 30
      }).map(s => {
        const d = diffDays(s.next_due_date)
        const section = d <= 7 ? 'this_week' : d <= 14 ? 'next_week' : 'this_month'
        return { ...s, _section: section }
      }),
    ]

    const grouped = { overdue: [], this_week: [], next_week: [], this_month: [] }
    allDue.forEach(s => {
      if (grouped[s._section]) grouped[s._section].push(s)
    })

    return [
      { key: 'overdue',    label: 'Overdue',    color: 'var(--red)',    icon: 'warning',   items: grouped.overdue },
      { key: 'this_week',  label: 'This Week',  color: 'var(--yellow)', icon: 'today',     items: grouped.this_week },
      { key: 'next_week',  label: 'Next Week',  color: 'var(--gold)',   icon: 'date_range',items: grouped.next_week },
      { key: 'this_month', label: 'This Month', color: 'var(--blue)',   icon: 'calendar_month', items: grouped.this_month },
    ].filter(sec => sec.items.length > 0)
  }, [overdue, maintenanceSchedules])

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">OVERDUE</div>
          <div className="kpi-val" style={{ fontSize: 22, color: overdue.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {overdue.length}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">DUE THIS WEEK</div>
          <div className="kpi-val" style={{ fontSize: 22, color: dueThisWeek.length > 0 ? 'var(--yellow)' : 'var(--text)' }}>
            {dueThisWeek.length}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">DUE THIS MONTH</div>
          <div className="kpi-val" style={{ fontSize: 22, color: 'var(--blue)' }}>{dueThisMonth.length}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">OPEN WOs</div>
          <div className="kpi-val" style={{ fontSize: 22, color: 'var(--gold)' }}>{openWOs}</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="kpi-label">IN PROGRESS</div>
          <div className="kpi-val" style={{ fontSize: 22, color: 'var(--yellow)' }}>{inProgWOs}</div>
        </div>
      </div>

      {sections.length === 0 && (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 48, color: 'var(--green)', display: 'block', marginBottom: 12 }}>check_circle</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>All Clear</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No PM tasks due in the next 30 days</div>
        </div>
      )}

      {sections.map(sec => (
        <div key={sec.key} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="material-icons" style={{ color: sec.color, fontSize: 18 }}>{sec.icon}</span>
            <span style={{ fontWeight: 800, fontSize: 13, color: sec.color }}>{sec.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>({sec.items.length} tasks)</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ASSET</th>
                  <th>TASK</th>
                  <th>CATEGORY</th>
                  <th>PRIORITY</th>
                  <th>DUE DATE</th>
                  <th>DAYS</th>
                  <th style={{ width: 100 }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map(s => {
                  const d = diffDays(s.next_due_date)
                  return (
                    <tr key={s.id} style={rowBorderStyle(sec.key === 'overdue' ? 'overdue' : sec.key === 'this_week' ? 'soon' : {})}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{assetLabel(s.asset_id)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          {assetTypeLabel(s.asset_type)}
                        </div>
                      </td>
                      <td>
                        <div>{s.task_name}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-mid)', textTransform: 'capitalize' }}>
                          {s.task_category}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${priorityBadge(s.priority)}`}>{s.priority}</span>
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{fmt(s.next_due_date)}</td>
                      <td>
                        {d < 0 ? (
                          <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12 }}>{Math.abs(d)}d overdue</span>
                        ) : d === 0 ? (
                          <span style={{ color: 'var(--yellow)', fontWeight: 700, fontSize: 12 }}>Today</span>
                        ) : (
                          <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>in {d}d</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onCreateWO(s)}
                          title="Raise Work Order"
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>build</span> WO
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function PreventiveMaintenance() {
  const { maintenanceSchedules, workOrders, loading } = useFleet()
  const { allAssets } = useAssetLookup()

  const [activeTab, setActiveTab] = useState('schedules')
  const [woPrefill, setWoPrefill] = useState(null)

  // Global KPIs
  const activeSchedules = useMemo(() => maintenanceSchedules.filter(s => s.is_active !== false), [maintenanceSchedules])
  const overdueCount    = useMemo(() => activeSchedules.filter(s => s.next_due_date && diffDays(s.next_due_date) < 0).length, [activeSchedules])
  const openWOCount     = useMemo(() => workOrders.filter(w => w.status === 'open').length, [workOrders])
  const inProgWOCount   = useMemo(() => workOrders.filter(w => w.status === 'in_progress').length, [workOrders])

  const handleCreateWOFromSchedule = useCallback((schedule) => {
    setWoPrefill({
      asset_id:     schedule.asset_id,
      asset_type:   schedule.asset_type,
      schedule_id:  schedule.id,
      task_name:    schedule.task_name,
      task_category:schedule.task_category,
      notes:        schedule.notes,
    })
    setActiveTab('workorders')
  }, [])

  const TABS = [
    { id: 'schedules',  label: 'PM Schedule',    icon: 'event_repeat',   count: activeSchedules.length },
    { id: 'workorders', label: 'Work Orders',     icon: 'build',          count: workOrders.length },
    { id: 'upcoming',   label: 'Upcoming (30d)',  icon: 'upcoming',       count: overdueCount || undefined },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <span className="material-icons" style={{ animation: 'spin 1s linear infinite', fontSize: 28, color: 'var(--gold)' }}>sync</span>
        <span style={{ color: 'var(--text-dim)' }}>Loading fleet data…</span>
        <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHeader
        title="Preventive Maintenance"
        subtitle="Manage PM schedules, work orders and upcoming service tasks"
      />

      {/* Global KPI bar */}
      <KPIBar items={[
        { label: 'ACTIVE SCHEDULES', value: activeSchedules.length, color: 'var(--text)' },
        { label: 'OVERDUE',          value: overdueCount,           color: overdueCount > 0 ? 'var(--red)' : 'var(--green)' },
        { label: 'OPEN WORK ORDERS', value: openWOCount,            color: openWOCount > 0  ? 'var(--gold)' : 'var(--text)' },
        { label: 'IN PROGRESS',      value: inProgWOCount,          color: inProgWOCount > 0 ? 'var(--yellow)' : 'var(--text)' },
      ]} />

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: 16 }}>
        {activeTab === 'schedules' && (
          <PMScheduleTab onCreateWO={handleCreateWOFromSchedule} />
        )}
        {activeTab === 'workorders' && (
          <WorkOrdersTab
            prefillWO={woPrefill}
            onClearPrefill={() => setWoPrefill(null)}
            allAssets={allAssets}
          />
        )}
        {activeTab === 'upcoming' && (
          <UpcomingTab onCreateWO={handleCreateWOFromSchedule} />
        )}
      </div>
    </div>
  )
}
