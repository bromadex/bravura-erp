// src/pages/Fleet/TyreManagement.jsx
// Tyre Lifecycle Management — mining-site fleet ERP

import { useState, useEffect, useMemo } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import toast from 'react-hot-toast'

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n, dec = 0) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

const today = () => new Date().toISOString().split('T')[0]

const treadColor = (depth) => {
  if (depth == null) return 'var(--text-dim)'
  if (depth >= 5) return 'var(--green)'
  if (depth >= 3) return 'var(--yellow)'
  return 'var(--red)'
}

const treadBg = (depth) => {
  if (depth == null) return 'var(--border2)'
  if (depth >= 5) return 'var(--green)'
  if (depth >= 3) return 'var(--yellow)'
  return 'var(--red)'
}

const STATUS_COLORS = {
  in_stock: { bg: 'var(--green)22', text: 'var(--green)' },
  fitted:   { bg: 'var(--gold)22',  text: 'var(--gold)'  },
  retreaded:{ bg: '#8b5cf622',      text: '#a78bfa'      },
  scrapped: { bg: 'var(--red)22',   text: 'var(--red)'   },
}

const EVENT_LABELS = {
  fit: 'Fit', remove: 'Remove', rotate: 'Rotate',
  retread: 'Retread', inspect: 'Inspect', scrap: 'Scrap',
}

const POSITIONS = ['FL', 'FR', 'RL', 'RR', 'spare']

const posLabel = (pos) => {
  if (pos === 'FL') return 'Front Left'
  if (pos === 'FR') return 'Front Right'
  if (pos === 'RL') return 'Rear Left'
  if (pos === 'RR') return 'Rear Right'
  if (pos === 'spare') return 'Spare'
  return pos || '—'
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: 'var(--border)', text: 'var(--text-mid)' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
      background: c.bg, color: c.text,
    }}>
      {status?.replace('_', ' ') || '—'}
    </span>
  )
}

function TreadBar({ current, min, max }) {
  if (current == null || max == null) return <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
  const pct = Math.max(0, Math.min(100, ((current - 0) / (max - 0)) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
      <div style={{ flex: 1, height: 7, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: treadBg(current), borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: treadColor(current), minWidth: 36 }}>{fmt(current, 1)} mm</span>
    </div>
  )
}

function KmBar({ accumulated, rated }) {
  if (accumulated == null || !rated) return <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
  const pct = Math.max(0, Math.min(100, (accumulated / rated) * 100))
  const barColor = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--green)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 130 }}>
      <div style={{ flex: 1, height: 7, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-mid)', minWidth: 40 }}>{fmt(pct, 0)}%</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, color: 'var(--text-dim)' }}>
      <span className="material-icons" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>autorenew</span>
      <span style={{ marginLeft: 12 }}>Loading…</span>
    </div>
  )
}

// ─── Modal wrapper ───────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, width = 640 }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,.4)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── field helpers ───────────────────────────────────────────────────────────

const FG = ({ label, children, half }) => (
  <div style={{ flex: half ? '1 1 calc(50% - 8px)' : '1 1 100%', minWidth: half ? 160 : undefined }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-mid)', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
)

const inp = {
  className: 'form-control',
  style: { width: '100%', boxSizing: 'border-box' },
}

// ─── Tyre Form Modal ─────────────────────────────────────────────────────────

const BLANK_TYRE = {
  serial_number: '', brand: '', size: '', tyre_type: 'steer',
  tread_depth_new: '', tread_depth_min: '', tread_depth_current: '',
  rated_km: '', km_accumulated: '', retread_count: '0',
  purchase_date: '', purchase_cost: '', notes: '',
}

function TyreFormModal({ open, onClose, editing, addTyre, updateTyre }) {
  const [form, setForm] = useState(BLANK_TYRE)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        serial_number:       editing.serial_number || '',
        brand:               editing.brand || '',
        size:                editing.size || '',
        tyre_type:           editing.tyre_type || 'steer',
        tread_depth_new:     editing.tread_depth_new ?? '',
        tread_depth_min:     editing.tread_depth_min ?? '',
        tread_depth_current: editing.tread_depth_current ?? '',
        rated_km:            editing.rated_km ?? '',
        km_accumulated:      editing.km_accumulated ?? '',
        retread_count:       editing.retread_count ?? '0',
        purchase_date:       editing.purchase_date || '',
        purchase_cost:       editing.purchase_cost ?? '',
        notes:               editing.notes || '',
      })
    } else {
      setForm(BLANK_TYRE)
    }
  }, [open, editing])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.serial_number.trim()) { toast.error('Serial number is required'); return }
    setSaving(true)
    const payload = {
      serial_number:       form.serial_number.trim(),
      brand:               form.brand.trim(),
      size:                form.size.trim(),
      tyre_type:           form.tyre_type,
      tread_depth_new:     form.tread_depth_new !== '' ? parseFloat(form.tread_depth_new) : null,
      tread_depth_min:     form.tread_depth_min !== '' ? parseFloat(form.tread_depth_min) : null,
      tread_depth_current: form.tread_depth_current !== '' ? parseFloat(form.tread_depth_current) : null,
      rated_km:            form.rated_km !== '' ? parseInt(form.rated_km) : null,
      km_accumulated:      form.km_accumulated !== '' ? parseInt(form.km_accumulated) : 0,
      retread_count:       parseInt(form.retread_count) || 0,
      purchase_date:       form.purchase_date || null,
      purchase_cost:       form.purchase_cost !== '' ? parseFloat(form.purchase_cost) : null,
      notes:               form.notes.trim() || null,
    }
    try {
      if (editing) {
        await updateTyre(editing.id, payload)
        toast.success('Tyre updated')
      } else {
        await addTyre(payload)
        toast.success('Tyre added to inventory')
      }
      onClose()
    } catch (err) { toast.error(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit Tyre — ${editing.serial_number}` : 'New Tyre'} width={680}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <FG label="Serial Number *" half>
            <input {...inp} value={form.serial_number} onChange={set('serial_number')} placeholder="e.g. TY-0001" required />
          </FG>
          <FG label="Brand" half>
            <input {...inp} value={form.brand} onChange={set('brand')} placeholder="e.g. Bridgestone" />
          </FG>
          <FG label="Size" half>
            <input {...inp} value={form.size} onChange={set('size')} placeholder="e.g. 11R22.5" />
          </FG>
          <FG label="Tyre Type" half>
            <select {...inp} value={form.tyre_type} onChange={set('tyre_type')}>
              <option value="steer">Steer</option>
              <option value="drive">Drive</option>
              <option value="trailer">Trailer</option>
              <option value="spare">Spare</option>
            </select>
          </FG>
          <FG label="Tread Depth — New (mm)" half>
            <input type="number" step="0.1" {...inp} value={form.tread_depth_new} onChange={set('tread_depth_new')} placeholder="e.g. 14" />
          </FG>
          <FG label="Tread Depth — Min (mm)" half>
            <input type="number" step="0.1" {...inp} value={form.tread_depth_min} onChange={set('tread_depth_min')} placeholder="e.g. 2" />
          </FG>
          <FG label="Tread Depth — Current (mm)" half>
            <input type="number" step="0.1" {...inp} value={form.tread_depth_current} onChange={set('tread_depth_current')} placeholder="e.g. 9.5" />
          </FG>
          <FG label="Rated km" half>
            <input type="number" {...inp} value={form.rated_km} onChange={set('rated_km')} placeholder="e.g. 120000" />
          </FG>
          <FG label="km Accumulated" half>
            <input type="number" {...inp} value={form.km_accumulated} onChange={set('km_accumulated')} placeholder="0" />
          </FG>
          <FG label="Retread Count" half>
            <input type="number" min="0" {...inp} value={form.retread_count} onChange={set('retread_count')} placeholder="0" />
          </FG>
          <FG label="Purchase Date" half>
            <input type="date" {...inp} value={form.purchase_date} onChange={set('purchase_date')} />
          </FG>
          <FG label="Purchase Cost (USD)" half>
            <input type="number" step="0.01" {...inp} value={form.purchase_cost} onChange={set('purchase_cost')} placeholder="0.00" />
          </FG>
          <FG label="Notes">
            <textarea {...inp} rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" style={{ ...inp.style, resize: 'vertical' }} />
          </FG>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Tyre' : 'Add Tyre'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Record Movement Modal ───────────────────────────────────────────────────

const BLANK_MOVEMENT = {
  event_type: 'inspect', event_date: today(), vehicle_id: '',
  position: '', km_at_event: '', tread_depth: '', condition_notes: '', performed_by: '',
}

function MovementModal({ open, onClose, tyre, allAssets, recordTyreMovement, tyreMovements }) {
  const [form, setForm] = useState(BLANK_MOVEMENT)
  const [saving, setSaving] = useState(false)

  // km since last fit (for remove / scrap)
  const kmSinceLastFit = useMemo(() => {
    if (!tyre) return null
    const fitEvents = tyreMovements
      .filter(m => m.tyre_id === tyre.id && m.event_type === 'fit')
      .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
    if (!fitEvents.length || !tyre.fitted_odometer) return null
    const kmAt = parseFloat(form.km_at_event)
    if (!kmAt) return null
    return Math.max(0, kmAt - tyre.fitted_odometer)
  }, [tyre, form.km_at_event, tyreMovements])

  useEffect(() => {
    if (!open) return
    setForm({
      ...BLANK_MOVEMENT,
      event_date: today(),
      vehicle_id: tyre?.current_vehicle || '',
      position:   tyre?.current_position || '',
    })
  }, [open, tyre])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const needsVehicle = ['fit', 'remove', 'rotate', 'inspect'].includes(form.event_type)
  const needsPosition = ['fit', 'rotate'].includes(form.event_type)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tyre) return
    if (form.event_type === 'fit' && !form.vehicle_id) { toast.error('Vehicle is required for fit'); return }
    if (form.event_type === 'fit' && !form.position) { toast.error('Position is required for fit'); return }
    setSaving(true)
    try {
      await recordTyreMovement({
        tyre_id:         tyre.id,
        vehicle_id:      form.vehicle_id || null,
        event_type:      form.event_type,
        event_date:      form.event_date,
        position:        form.position || null,
        km_at_event:     form.km_at_event !== '' ? parseFloat(form.km_at_event) : null,
        tread_depth:     form.tread_depth !== '' ? parseFloat(form.tread_depth) : null,
        condition_notes: form.condition_notes.trim() || null,
        performed_by:    form.performed_by.trim() || null,
      })
      toast.success(`Movement recorded: ${EVENT_LABELS[form.event_type]}`)
      onClose()
    } catch (err) { toast.error(err.message || 'Failed to record movement') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={tyre ? `Record Movement — ${tyre.serial_number}` : 'Record Movement'} width={560}>
      {tyre && (
        <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--text-mid)' }}>
          {tyre.brand} · {tyre.size} · Status: <StatusBadge status={tyre.status} /> · Tread: {tyre.tread_depth_current ?? '—'} mm
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <FG label="Event Type" half>
            <select {...inp} value={form.event_type} onChange={set('event_type')}>
              {Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FG>
          <FG label="Event Date" half>
            <input type="date" {...inp} value={form.event_date} onChange={set('event_date')} required />
          </FG>
          {needsVehicle && (
            <FG label={form.event_type === 'fit' ? 'Vehicle / Asset *' : 'Vehicle / Asset'} half>
              <select {...inp} value={form.vehicle_id} onChange={set('vehicle_id')}>
                <option value="">— Select asset —</option>
                {allAssets.map(a => <option key={a.id} value={a.id}>{a.reg}{a.make ? ` — ${a.make}` : ''}</option>)}
              </select>
            </FG>
          )}
          {needsPosition && (
            <FG label="Position *" half>
              <select {...inp} value={form.position} onChange={set('position')}>
                <option value="">— Select position —</option>
                {POSITIONS.map(p => <option key={p} value={p}>{posLabel(p)}</option>)}
              </select>
            </FG>
          )}
          <FG label="Odometer / km at Event" half>
            <input type="number" {...inp} value={form.km_at_event} onChange={set('km_at_event')} placeholder="e.g. 45200" />
          </FG>
          <FG label="Tread Depth (mm)" half>
            <input type="number" step="0.1" {...inp} value={form.tread_depth} onChange={set('tread_depth')} placeholder="e.g. 7.5" />
          </FG>
          <FG label="Performed By">
            <input {...inp} value={form.performed_by} onChange={set('performed_by')} placeholder="Name of technician" />
          </FG>
          <FG label="Condition Notes">
            <textarea {...inp} rows={2} value={form.condition_notes} onChange={set('condition_notes')} placeholder="Observations, damage, wear pattern…" style={{ ...inp.style, resize: 'vertical' }} />
          </FG>
        </div>
        {(['remove', 'scrap'].includes(form.event_type)) && kmSinceLastFit != null && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--gold)22', borderRadius: 6, fontSize: 12, color: 'var(--gold)' }}>
            <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>info</span>
            km accumulated on this fitting: <strong>{fmt(kmSinceLastFit)}</strong>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Movement'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Scrap Confirm Modal ─────────────────────────────────────────────────────

function ScrapModal({ open, onClose, tyre, scrapTyre }) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setNotes('') }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await scrapTyre(tyre.id, notes.trim() || null)
      toast.success(`Tyre ${tyre.serial_number} scrapped`)
      onClose()
    } catch (err) { toast.error(err.message || 'Scrap failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Scrap Tyre" width={420}>
      {tyre && (
        <p style={{ color: 'var(--text-mid)', marginBottom: 12, fontSize: 14 }}>
          Confirm scrapping <strong>{tyre.serial_number}</strong> ({tyre.brand} · {tyre.size})?
          This action cannot be undone.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <FG label="Scrap Reason / Notes">
          <textarea {...inp} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. sidewall damage, beyond tread limit…" style={{ ...inp.style, resize: 'vertical' }} />
        </FG>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? 'Scrapping…' : 'Confirm Scrap'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Tab 1: Tyre Inventory ───────────────────────────────────────────────────

function InventoryTab({ tyreInventory, allAssets, addTyre, updateTyre, scrapTyre, recordTyreMovement, tyreMovements }) {
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [filterAsset,  setFilterAsset]  = useState('')
  const [search,       setSearch]       = useState('')
  const [tyreModal,    setTyreModal]    = useState(false)
  const [editingTyre,  setEditingTyre]  = useState(null)
  const [movTyre,      setMovTyre]      = useState(null)
  const [scrapTarget,  setScrapTarget]  = useState(null)

  const kpi = useMemo(() => ({
    total:    tyreInventory.length,
    fitted:   tyreInventory.filter(t => t.status === 'fitted').length,
    in_stock: tyreInventory.filter(t => t.status === 'in_stock').length,
    retreaded:tyreInventory.filter(t => t.status === 'retreaded').length,
    scrapped: tyreInventory.filter(t => t.status === 'scrapped').length,
  }), [tyreInventory])

  const filtered = useMemo(() => {
    let rows = tyreInventory
    if (filterStatus) rows = rows.filter(t => t.status === filterStatus)
    if (filterType)   rows = rows.filter(t => t.tyre_type === filterType)
    if (filterAsset)  rows = rows.filter(t => t.current_vehicle === filterAsset)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(t =>
        (t.serial_number || '').toLowerCase().includes(q) ||
        (t.brand || '').toLowerCase().includes(q) ||
        (t.size || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [tyreInventory, filterStatus, filterType, filterAsset, search])

  const openEdit = (t) => { setEditingTyre(t); setTyreModal(true) }
  const openNew  = () => { setEditingTyre(null); setTyreModal(true) }

  const assetName = (id) => allAssets.find(a => a.id === id)?.reg || id || '—'

  const KPI = ({ label, value, color }) => (
    <div style={{ flex: '1 1 150px', background: 'var(--surface2)', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${color || 'var(--border2)'}` }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{label}</div>
    </div>
  )

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <KPI label="Total Tyres"   value={kpi.total}     />
        <KPI label="Fitted"        value={kpi.fitted}    color="var(--gold)"   />
        <KPI label="In Stock"      value={kpi.in_stock}  color="var(--green)"  />
        <KPI label="Retreaded"     value={kpi.retreaded} color="#a78bfa"       />
        <KPI label="Scrapped"      value={kpi.scrapped}  color="var(--red)"    />
      </div>

      {/* Filters + search + add */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          className="form-control" style={{ flex: '1 1 180px', maxWidth: 240 }}
          placeholder="Search serial, brand, size…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select className="form-control" style={{ flex: '0 0 140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="fitted">Fitted</option>
          <option value="retreaded">Retreaded</option>
          <option value="scrapped">Scrapped</option>
        </select>
        <select className="form-control" style={{ flex: '0 0 130px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="steer">Steer</option>
          <option value="drive">Drive</option>
          <option value="trailer">Trailer</option>
          <option value="spare">Spare</option>
        </select>
        <select className="form-control" style={{ flex: '0 0 160px' }} value={filterAsset} onChange={e => setFilterAsset(e.target.value)}>
          <option value="">All assets</option>
          {allAssets.map(a => <option key={a.id} value={a.id}>{a.reg}</option>)}
        </select>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openNew}>
          <span className="material-icons" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>add</span>
          New Tyre
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
              {['Serial #', 'Brand', 'Size', 'Type', 'Vehicle / Position', 'Tread Depth', 'km Accumulated', 'Status', 'Retreads', 'Actions'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>tire_repair</span>
                  No tyres found
                </td>
              </tr>
            )}
            {filtered.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '9px 10px', fontWeight: 700, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{t.serial_number}</td>
                <td style={{ padding: '9px 10px' }}>{t.brand || '—'}</td>
                <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{t.size || '—'}</td>
                <td style={{ padding: '9px 10px', textTransform: 'capitalize' }}>{t.tyre_type || '—'}</td>
                <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                  {t.current_vehicle ? (
                    <span>{assetName(t.current_vehicle)} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({t.current_position || '—'})</span></span>
                  ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                </td>
                <td style={{ padding: '9px 10px', minWidth: 140 }}>
                  <TreadBar current={t.tread_depth_current} min={t.tread_depth_min} max={t.tread_depth_new} />
                </td>
                <td style={{ padding: '9px 10px', minWidth: 150 }}>
                  <KmBar accumulated={t.km_accumulated} rated={t.rated_km} />
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {fmt(t.km_accumulated)} / {fmt(t.rated_km)} km
                  </div>
                </td>
                <td style={{ padding: '9px 10px' }}><StatusBadge status={t.status} /></td>
                <td style={{ padding: '9px 10px', textAlign: 'center' }}>{t.retread_count || 0}</td>
                <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-secondary btn-sm" title="Edit" style={{ marginRight: 4 }} onClick={() => openEdit(t)}>
                    <span className="material-icons" style={{ fontSize: 15 }}>edit</span>
                  </button>
                  <button className="btn btn-secondary btn-sm" title="Record Movement" style={{ marginRight: 4 }} onClick={() => setMovTyre(t)}>
                    <span className="material-icons" style={{ fontSize: 15 }}>swap_horiz</span>
                  </button>
                  {t.status !== 'scrapped' && (
                    <button className="btn btn-danger btn-sm" title="Scrap" onClick={() => setScrapTarget(t)}>
                      <span className="material-icons" style={{ fontSize: 15 }}>delete_forever</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TyreFormModal
        open={tyreModal}
        onClose={() => setTyreModal(false)}
        editing={editingTyre}
        addTyre={addTyre}
        updateTyre={updateTyre}
      />
      <MovementModal
        open={!!movTyre}
        onClose={() => setMovTyre(null)}
        tyre={movTyre}
        allAssets={allAssets}
        recordTyreMovement={recordTyreMovement}
        tyreMovements={tyreMovements}
      />
      <ScrapModal
        open={!!scrapTarget}
        onClose={() => setScrapTarget(null)}
        tyre={scrapTarget}
        scrapTyre={scrapTyre}
      />
    </div>
  )
}

// ─── Tyre Position Card ──────────────────────────────────────────────────────

function PositionCard({ position, tyre, onFit, onRemove, onRotate, onInspect }) {
  const empty = !tyre
  return (
    <div style={{
      background: 'var(--surface2)', border: `1px solid ${empty ? 'var(--border)' : 'var(--border2)'}`,
      borderRadius: 8, padding: 14, minHeight: 130, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-mid)' }}>
        {posLabel(position)}
      </div>
      {empty ? (
        <>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 28 }}>radio_button_unchecked</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onFit(position)} style={{ width: '100%' }}>
            <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>add</span> Fit Tyre
          </button>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{tyre.serial_number}</div>
          <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>{tyre.brand} · {tyre.size}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: treadBg(tyre.tread_depth_current), flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: treadColor(tyre.tread_depth_current), fontWeight: 600 }}>
              {tyre.tread_depth_current ?? '—'} mm
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmt(tyre.km_accumulated)} km</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} title="Remove" onClick={() => onRemove(tyre)}>
              <span className="material-icons" style={{ fontSize: 13 }}>remove_circle_outline</span>
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} title="Rotate" onClick={() => onRotate(tyre)}>
              <span className="material-icons" style={{ fontSize: 13 }}>360</span>
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} title="Inspect" onClick={() => onInspect(tyre)}>
              <span className="material-icons" style={{ fontSize: 13 }}>search</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab 2: Vehicle Fitment View ─────────────────────────────────────────────

function FitmentTab({ tyreInventory, allAssets, tyreMovements, recordTyreMovement }) {
  const [selectedAsset, setSelectedAsset] = useState('')
  const [movTyre,       setMovTyre]       = useState(null)
  const [defaultEvt,    setDefaultEvt]    = useState('inspect')

  const fittedTyres = useMemo(
    () => tyreInventory.filter(t => t.current_vehicle === selectedAsset && t.status === 'fitted'),
    [tyreInventory, selectedAsset]
  )

  const tyreAtPos = (pos) => fittedTyres.find(t => t.current_position === pos) || null

  const assetHistory = useMemo(
    () => tyreMovements.filter(m => m.vehicle_id === selectedAsset).sort((a, b) => new Date(b.event_date) - new Date(a.event_date)),
    [tyreMovements, selectedAsset]
  )

  // "Fit Tyre" on empty position opens movement modal for a stock tyre selection
  // We open a simplified fit-movement modal via movTyre with a synthetic pre-fill
  const handleFit = (position) => {
    // We open the movement modal with a fake tyre (null) — user will pick from stock inside the modal.
    // For simplicity, find first in_stock tyre and prompt
    const stock = tyreInventory.filter(t => t.status === 'in_stock')
    if (!stock.length) { toast.error('No tyres in stock to fit'); return }
    // Open a movement modal — we'll set a synthetic tyre with forced event = fit + position
    setDefaultEvt('fit')
    setMovTyre({ ...stock[0], _forcedPosition: position })
  }

  const openMovement = (tyre, evtType) => {
    setDefaultEvt(evtType)
    setMovTyre(tyre)
  }

  // Name map
  const tyreMovementName = (m) => {
    const t = tyreInventory.find(x => x.id === m.tyre_id)
    return t ? t.serial_number : m.tyre_id
  }
  const assetLabel = allAssets.find(a => a.id === selectedAsset)?.reg || ''

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>Select Asset:</label>
        <select
          className="form-control" style={{ maxWidth: 280 }}
          value={selectedAsset} onChange={e => setSelectedAsset(e.target.value)}
        >
          <option value="">— Choose vehicle / equipment —</option>
          {allAssets.map(a => <option key={a.id} value={a.id}>{a.reg}{a.make ? ` (${a.make})` : ''}</option>)}
        </select>
      </div>

      {!selectedAsset ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 48, display: 'block', marginBottom: 8 }}>local_shipping</span>
          Select an asset to view tyre fitment
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
            {assetLabel} — Tyre Layout
            <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-dim)', marginLeft: 8 }}>
              {fittedTyres.length} tyre{fittedTyres.length !== 1 ? 's' : ''} fitted
            </span>
          </div>

          {/* Visual layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
            {POSITIONS.map(pos => (
              <PositionCard
                key={pos}
                position={pos}
                tyre={tyreAtPos(pos)}
                onFit={handleFit}
                onRemove={(t) => openMovement(t, 'remove')}
                onRotate={(t) => openMovement(t, 'rotate')}
                onInspect={(t) => openMovement(t, 'inspect')}
              />
            ))}
          </div>

          {/* Fitment history for this asset */}
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-mid)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            Fitment History
          </div>
          {assetHistory.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', padding: '16px 0', fontSize: 13 }}>No tyre movement history for this asset.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                    {['Date', 'Tyre Serial', 'Event', 'Position', 'km at Event', 'Tread (mm)', 'Performed By', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-mid)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assetHistory.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtDate(m.event_date)}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontWeight: 600 }}>{tyreMovementName(m)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                          background: m.event_type === 'fit' ? 'var(--green)22' : m.event_type === 'scrap' ? 'var(--red)22' : 'var(--border)',
                          color: m.event_type === 'fit' ? 'var(--green)' : m.event_type === 'scrap' ? 'var(--red)' : 'var(--text-mid)',
                        }}>
                          {EVENT_LABELS[m.event_type] || m.event_type}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px' }}>{m.position || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{m.km_at_event != null ? fmt(m.km_at_event) : '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{m.tread_depth != null ? `${m.tread_depth} mm` : '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{m.performed_by || '—'}</td>
                      <td style={{ padding: '7px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>{m.condition_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {movTyre && (
        <MovementModal
          open={!!movTyre}
          onClose={() => setMovTyre(null)}
          tyre={movTyre}
          allAssets={allAssets}
          recordTyreMovement={async (mvt) => {
            await recordTyreMovement({ ...mvt, vehicle_id: mvt.vehicle_id || selectedAsset })
          }}
          tyreMovements={tyreMovements}
          _defaultEventType={defaultEvt}
          _defaultVehicle={selectedAsset}
        />
      )}
    </div>
  )
}

// ─── Tab 3: Tread Depth Alerts ───────────────────────────────────────────────

function AlertsTab({ tyreInventory, allAssets, recordTyreMovement, tyreMovements }) {
  const [movTyre, setMovTyre] = useState(null)

  const assetName = (id) => allAssets.find(a => a.id === id)?.reg || id || '—'

  const withDepth = useMemo(
    () => tyreInventory
      .filter(t => t.status !== 'scrapped' && t.tread_depth_current != null)
      .sort((a, b) => (a.tread_depth_current ?? 999) - (b.tread_depth_current ?? 999)),
    [tyreInventory]
  )

  const estKmLeft = (t) => {
    const { tread_depth_current: cur, tread_depth_min: min, tread_depth_new: newD, rated_km } = t
    if (cur == null || min == null || newD == null || !rated_km || newD <= min) return null
    return Math.max(0, ((cur - min) / (newD - min)) * rated_km)
  }

  const critical = withDepth.filter(t => t.tread_depth_current < (t.tread_depth_min ?? 2))
  const warning  = withDepth.filter(t => {
    const min = t.tread_depth_min ?? 2
    const cur = t.tread_depth_current
    return cur >= min && cur < min + 1
  })
  const ok = withDepth.filter(t => {
    const min = t.tread_depth_min ?? 2
    const cur = t.tread_depth_current
    return cur >= min + 1
  })

  const Row = ({ t }) => {
    const km = estKmLeft(t)
    return (
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{t.serial_number}</td>
        <td style={{ padding: '8px 10px' }}>{assetName(t.current_vehicle)}</td>
        <td style={{ padding: '8px 10px' }}>{t.current_position || '—'}</td>
        <td style={{ padding: '8px 10px' }}>
          <span style={{ fontWeight: 700, color: treadColor(t.tread_depth_current) }}>
            {t.tread_depth_current ?? '—'} mm
          </span>
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--text-mid)' }}>{t.tread_depth_min ?? '—'} mm</td>
        <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>
          {km != null ? `~${fmt(km)} km` : '—'}
        </td>
        <td style={{ padding: '8px 10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setMovTyre(t)}>
            <span className="material-icons" style={{ fontSize: 14, marginRight: 3 }}>search</span> Inspect
          </button>
        </td>
      </tr>
    )
  }

  const Section = ({ title, rows, color, icon }) => {
    if (!rows.length) return null
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: `${color}22`, borderRadius: 6, marginBottom: 8, borderLeft: `3px solid ${color}` }}>
          <span className="material-icons" style={{ color, fontSize: 20 }}>{icon}</span>
          <span style={{ fontWeight: 700, color, fontSize: 14 }}>{title}</span>
          <span style={{ marginLeft: 4, background: `${color}33`, color, borderRadius: 12, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{rows.length}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                {['Serial', 'Vehicle', 'Position', 'Current Depth', 'Min Depth', 'km Left (est.)', 'Action'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-mid)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map(t => <Row key={t.id} t={t} />)}</tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      {withDepth.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
          <span className="material-icons" style={{ fontSize: 48, display: 'block', marginBottom: 8 }}>check_circle</span>
          No tread depth data recorded yet.
        </div>
      )}
      <Section title="Critical — Below Minimum" rows={critical} color="var(--red)"    icon="error" />
      <Section title="Warning — Within 1 mm of Minimum" rows={warning} color="var(--yellow)" icon="warning" />
      <Section title="OK" rows={ok} color="var(--green)" icon="check_circle" />

      <MovementModal
        open={!!movTyre}
        onClose={() => setMovTyre(null)}
        tyre={movTyre}
        allAssets={allAssets}
        recordTyreMovement={recordTyreMovement}
        tyreMovements={tyreMovements}
        _defaultEventType="inspect"
      />
    </div>
  )
}

// ─── Tab 4: Cost & Analytics ─────────────────────────────────────────────────

function AnalyticsTab({ tyreInventory }) {
  const scrapped = useMemo(() => tyreInventory.filter(t => t.status === 'scrapped'), [tyreInventory])
  const active   = useMemo(() => tyreInventory.filter(t => t.status !== 'scrapped'), [tyreInventory])

  // Cost per tyre (purchase_cost + rough retread estimate: $200 per retread)
  const RETREAD_COST_EST = 200

  const brandStats = useMemo(() => {
    const map = {}
    tyreInventory.forEach(t => {
      if (!t.brand) return
      if (!map[t.brand]) map[t.brand] = { brand: t.brand, count: 0, totalKm: 0, totalCost: 0 }
      map[t.brand].count++
      map[t.brand].totalKm += t.km_accumulated || 0
      map[t.brand].totalCost += (t.purchase_cost || 0) + (t.retread_count || 0) * RETREAD_COST_EST
    })
    return Object.values(map).sort((a, b) => b.totalKm / b.count - a.totalKm / a.count)
  }, [tyreInventory])

  const totalPurchaseCost = useMemo(
    () => tyreInventory.reduce((s, t) => s + (t.purchase_cost || 0), 0),
    [tyreInventory]
  )
  const totalRetreadCost = useMemo(
    () => tyreInventory.reduce((s, t) => s + (t.retread_count || 0) * RETREAD_COST_EST, 0),
    [tyreInventory]
  )
  const avgKmPerTyre = useMemo(() => {
    const withKm = tyreInventory.filter(t => t.km_accumulated > 0)
    if (!withKm.length) return 0
    return withKm.reduce((s, t) => s + t.km_accumulated, 0) / withKm.length
  }, [tyreInventory])

  const cpk = useMemo(() => {
    // Cost per km: total cost / total km across all tyres
    const totalKm = tyreInventory.reduce((s, t) => s + (t.km_accumulated || 0), 0)
    const totalCost = totalPurchaseCost + totalRetreadCost
    if (!totalKm) return null
    return totalCost / totalKm
  }, [tyreInventory, totalPurchaseCost, totalRetreadCost])

  // Scrapped tyres: km vs rated
  const scrapTable = useMemo(
    () => scrapped.sort((a, b) => (b.km_accumulated || 0) - (a.km_accumulated || 0)),
    [scrapped]
  )

  const Metric = ({ label, value, sub, color }) => (
    <div style={{ flex: '1 1 180px', background: 'var(--surface2)', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${color || 'var(--border2)'}` }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{sub}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 3 }}>{label}</div>
    </div>
  )

  return (
    <div>
      {/* Summary metrics */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <Metric label="Total Purchase Cost"    value={`$${fmt(totalPurchaseCost)}`}  color="var(--gold)"  />
        <Metric label="Retread Cost (est.)"    value={`$${fmt(totalRetreadCost)}`}   color="#a78bfa"      />
        <Metric label="Total Fleet Tyre Cost"  value={`$${fmt(totalPurchaseCost + totalRetreadCost)}`} color="var(--text)" />
        <Metric label="Avg km per Tyre"        value={`${fmt(avgKmPerTyre)}`} sub="km" color="var(--green)" />
        <Metric label="Cost per km"            value={cpk != null ? `$${cpk.toFixed(4)}` : '—'} sub="across fleet" />
        <Metric label="Total Scrapped"         value={scrapped.length} color="var(--red)" />
      </div>

      {/* Brand performance table */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-mid)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        Average km by Brand
      </div>
      {brandStats.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '12px 0', fontSize: 13 }}>No brand data available.</div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                {['Brand', 'Tyres', 'Total km', 'Avg km / Tyre', 'Total Cost (incl. retreads)', 'Cost / km'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-mid)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {brandStats.map(b => {
                const avgKm = b.count ? b.totalKm / b.count : 0
                const ckm = b.totalKm ? b.totalCost / b.totalKm : null
                return (
                  <tr key={b.brand} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{b.brand}</td>
                    <td style={{ padding: '8px 10px' }}>{b.count}</td>
                    <td style={{ padding: '8px 10px' }}>{fmt(b.totalKm)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--green)' }}>{fmt(avgKm)}</td>
                    <td style={{ padding: '8px 10px' }}>${fmt(b.totalCost)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{ckm != null ? `$${ckm.toFixed(4)}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Scrapped tyres table */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text-mid)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        Scrapped Tyres — km Achieved vs Rated
      </div>
      {scrapTable.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '12px 0', fontSize: 13 }}>No scrapped tyres on record.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                {['Serial', 'Brand', 'Size', 'km Achieved', 'Rated km', 'Life Utilisation', 'Retread Count', 'Scrapped On', 'Scrap Notes'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-mid)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scrapTable.map(t => {
                const pct = t.rated_km ? Math.min(100, ((t.km_accumulated || 0) / t.rated_km) * 100) : null
                const pctColor = pct == null ? 'var(--text-dim)' : pct >= 90 ? 'var(--green)' : pct >= 60 ? 'var(--yellow)' : 'var(--red)'
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{t.serial_number}</td>
                    <td style={{ padding: '8px 10px' }}>{t.brand || '—'}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 12 }}>{t.size || '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(t.km_accumulated)}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{fmt(t.rated_km)}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {pct != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 7, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pctColor, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: pctColor }}>{fmt(pct, 0)}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{t.retread_count || 0}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(t.scrapped_at)}</td>
                    <td style={{ padding: '8px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>{t.scrap_notes || '—'}</td>
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

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'inventory', label: 'Tyre Inventory',    icon: 'inventory_2'       },
  { key: 'fitment',   label: 'Vehicle Fitment',   icon: 'local_shipping'    },
  { key: 'alerts',    label: 'Tread Depth Alerts', icon: 'warning'          },
  { key: 'analytics', label: 'Cost & Analytics',  icon: 'bar_chart'         },
]

export default function TyreManagement() {
  const {
    vehicles, earthMovers,
    tyreInventory, tyreMovements,
    addTyre, updateTyre, scrapTyre,
    recordTyreMovement,
    loading,
  } = useFleet()

  const [activeTab, setActiveTab] = useState('inventory')

  const allAssets = useMemo(() => [
    ...vehicles.map(v => ({ id: v.id, reg: v.reg, make: v.make, model: v.model, _type: 'vehicle' })),
    ...earthMovers.map(e => ({ id: e.id, reg: e.reg, make: e.make, model: e.model, _type: 'earthmover' })),
  ], [vehicles, earthMovers])

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <span className="material-icons" style={{ fontSize: 28, color: 'var(--gold)' }}>tire_repair</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Tyre Management</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>Lifecycle tracking, fitment, tread monitoring and cost analytics</p>
        </div>
        {!loading && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
            {tyreInventory.length} tyre{tyreInventory.length !== 1 ? 's' : ''} in system
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer', whiteSpace: 'nowrap',
              fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? 'var(--text)' : 'var(--text-mid)',
              fontSize: 13, transition: 'color .15s',
            }}
          >
            <span className="material-icons" style={{ fontSize: 17 }}>{tab.icon}</span>
            {tab.label}
            {tab.key === 'alerts' && (() => {
              const crit = tyreInventory.filter(t => t.status !== 'scrapped' && t.tread_depth_current != null && t.tread_depth_current < (t.tread_depth_min ?? 2)).length
              if (!crit) return null
              return (
                <span style={{
                  background: 'var(--red)', color: '#fff', borderRadius: 12,
                  fontSize: 10, fontWeight: 800, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>{crit}</span>
              )
            })()}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <Spinner />
      ) : (
        <>
          {activeTab === 'inventory' && (
            <InventoryTab
              tyreInventory={tyreInventory}
              allAssets={allAssets}
              addTyre={addTyre}
              updateTyre={updateTyre}
              scrapTyre={scrapTyre}
              recordTyreMovement={recordTyreMovement}
              tyreMovements={tyreMovements}
            />
          )}
          {activeTab === 'fitment' && (
            <FitmentTab
              tyreInventory={tyreInventory}
              allAssets={allAssets}
              tyreMovements={tyreMovements}
              recordTyreMovement={recordTyreMovement}
            />
          )}
          {activeTab === 'alerts' && (
            <AlertsTab
              tyreInventory={tyreInventory}
              allAssets={allAssets}
              recordTyreMovement={recordTyreMovement}
              tyreMovements={tyreMovements}
            />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsTab tyreInventory={tyreInventory} />
          )}
        </>
      )}
    </div>
  )
}
