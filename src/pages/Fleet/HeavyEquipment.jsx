// src/pages/Fleet/HeavyEquipment.jsx
// Heavy Equipment (earth movers) with employee-linked operator dropdown

import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

export default function HeavyEquipment() {
  const { earthMovers, addEarthMover, updateEarthMover, deleteEarthMover, equipmentHourLogs, addEquipmentHourLog, reclassifyFleetAsset, categoryConfigs, loading, fetchAll } = useFleet()
  const canEdit   = useCanEdit('fleet', 'heavy-equipment')
  const canDelete = useCanDelete('fleet', 'heavy-equipment')
  const [modalOpen,      setModalOpen]      = useState(false)
  const [hourModalOpen,  setHourModalOpen]  = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [employees,      setEmployees]      = useState([])
  const [reclassAsset,   setReclassAsset]   = useState(null)
  const [reclassForm,    setReclassForm]    = useState({ newCategory: '', reason: '' })
  const [reclassLoading, setReclassLoading] = useState(false)
  const [form, setForm] = useState({
    reg: '', type: '', description: '', operator_id: '', operator_name: '',
    status: 'Active', odometer_km: '', last_service_date: '', assigned_project: ''
  })
  const [hourForm, setHourForm] = useState({
    equipment_id: '', date: new Date().toISOString().split('T')[0],
    hours_start: '', hours_end: '', hours_worked: '', operator_id: '', operator_name: '', notes: ''
  })

  useEffect(() => {
    supabase.from('employees').select('id, name, employee_number').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const openEdit = (eq = null) => {
    if (eq) {
      setEditing(eq)
      setForm({
        reg: eq.reg, type: eq.type || '', description: eq.description || '',
        operator_id: eq.operator_id || '', operator_name: eq.operator_name || '',
        status: eq.status || 'Active', hour_meter: eq.hour_meter || '', odometer_km: eq.odometer_km || '',
        last_service_date: eq.last_service_date || '', assigned_project: eq.assigned_project || ''
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', operator_id: '', operator_name: '', status: 'Active', hour_meter: '', odometer_km: '', last_service_date: '', assigned_project: '' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration/code required')
    try {
      const hourVal = form.hour_meter ? parseFloat(form.hour_meter) : null
      const payload = {
        reg: form.reg, type: form.type, description: form.description,
        operator_id: form.operator_id || null, operator_name: form.operator_name || '',
        status: form.status, last_service_date: form.last_service_date || null,
        assigned_project: form.assigned_project || '',
        hour_meter:   hourVal,
        odometer_km:  hourVal,  // kept in sync — both columns exist after migration 008
      }
      if (editing) { await updateEarthMover(editing.id, payload); toast.success('Equipment updated') }
      else { await addEarthMover(payload); toast.success('Equipment added') }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleHourLog = async (e) => {
    e.preventDefault()
    if (!hourForm.equipment_id) return toast.error('Select equipment')
    try {
      const hs = parseFloat(hourForm.hours_start) || 0
      const he = parseFloat(hourForm.hours_end) || 0
      const payload = {
        ...hourForm,
        hours_start: hs, hours_end: he,
        hours_worked: hourForm.hours_worked ? parseFloat(hourForm.hours_worked) : (he - hs > 0 ? he - hs : null),
      }
      await addEquipmentHourLog(payload)
      toast.success('Hour log added')
      setHourModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  const equipTypes = ['Excavator', 'Bulldozer', 'Front Loader', 'Grader', 'Dump Truck', 'Crane', 'Compactor', 'Forklift', 'Drill Rig', 'Other']

  return (
    <div>
      <PageHeader title="Heavy Equipment">
        {canEdit && (
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={() => setHourModalOpen(true)}>
              <span className="material-icons">timer</span> Log Hours
            </button>
            <button className="btn btn-primary" onClick={() => openEdit()}>
              <span className="material-icons">add</span> Add Equipment
            </button>
          </div>
        )}
      </PageHeader>

      {loading ? (
        <EmptyState icon="hourglass_empty" message="Loading equipment…" />
      ) : earthMovers.length === 0 ? (
        <EmptyState icon="construction" message="No heavy equipment added yet" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {earthMovers.map(eq => {
            const totalHours = (equipmentHourLogs || []).filter(l => l.equipment_id === eq.id).reduce((s, l) => s + (l.hours_worked || 0), 0)
            return (
              <div key={eq.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-icons" style={{ fontSize: 32, color: 'var(--teal)' }}>construction</span>
                  <StatusBadge status={eq.status} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{eq.reg}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{eq.type || '—'} {eq.description ? `· ${eq.description}` : ''}</div>
                {eq.operator_name && (
                  <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--teal)' }}>person</span>
                    {eq.operator_name}
                  </div>
                )}
                {eq.assigned_project && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>📍 {eq.assigned_project}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>⏱ Total hours: {totalHours.toFixed(1)}</div>
                <div className="btn-group-sm" style={{ justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" title="Reclassify" onClick={() => { setReclassAsset(eq); setReclassForm({ newCategory: '', reason: '' }) }}><span className="material-icons">swap_horiz</span></button>}
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(eq)}><span className="material-icons">edit</span></button>}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={async () => { if (window.confirm(`Delete ${eq.reg}?`)) { await deleteEarthMover(eq.id); toast.success('Deleted') } }}><span className="material-icons">delete</span></button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reclassify Modal */}
      {reclassAsset && (
        <ModalDialog open={!!reclassAsset} onClose={() => setReclassAsset(null)} title="Reclassify Asset">
          <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
            <strong>{reclassAsset.reg}</strong> is currently <strong>{reclassAsset.asset_category || 'Heavy Equipment'}</strong>
            {reclassAsset._legacy && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>(legacy — will be migrated)</span>}
          </div>
          <div className="form-group">
            <label>Move to Category *</label>
            <select className="form-control" value={reclassForm.newCategory}
              onChange={e => setReclassForm(f => ({ ...f, newCategory: e.target.value }))}>
              <option value="">— Select target category —</option>
              {(categoryConfigs.length
                ? categoryConfigs.filter(c => c.category !== (reclassAsset.asset_category || 'Heavy Equipment'))
                : [
                    { category: 'Vehicle',         measurement_type: 'km'    },
                    { category: 'Generator',       measurement_type: 'hours' },
                    { category: 'Light Equipment', measurement_type: 'hours' },
                    { category: 'Water Pump',      measurement_type: 'hours' },
                    { category: 'Compressor',      measurement_type: 'hours' },
                    { category: 'Fixed Plant',     measurement_type: 'fixed' },
                  ]
              ).map(c => <option key={c.category} value={c.category}>{c.category} ({c.measurement_type})</option>)}
            </select>
          </div>
          {reclassForm.newCategory && (() => {
            const toCfg = (categoryConfigs.length ? categoryConfigs : []).find(c => c.category === reclassForm.newCategory)
            if (toCfg?.measurement_type === 'km') return (
              <div style={{ background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 6, padding: 10, fontSize: 12, marginBottom: 12 }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: 'var(--yellow)' }}>warning</span>
                Measurement changes <strong>hours → km</strong>. The current hour meter ({(reclassAsset.hour_meter || 0).toLocaleString()} hrs) will be <strong>archived</strong> and the metric will reset to 0.
              </div>
            )
            return null
          })()}
          <div className="form-group">
            <label>Reason *</label>
            <textarea className="form-control" rows={3} value={reclassForm.reason}
              onChange={e => setReclassForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Equipment repurposed as site vehicle" />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setReclassAsset(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!reclassForm.newCategory || !reclassForm.reason || reclassLoading}
              onClick={async () => {
                setReclassLoading(true)
                try {
                  const code = await reclassifyFleetAsset(reclassAsset.id, reclassForm.newCategory, reclassForm.reason)
                  toast.success(`Reclassified → ${reclassForm.newCategory} (${code})`)
                  setReclassAsset(null)
                } catch (err) { toast.error(err.message) }
                finally { setReclassLoading(false) }
              }}>
              {reclassLoading ? 'Processing…' : `Reclassify → ${reclassForm.newCategory || '…'}`}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      <ModalDialog open={modalOpen} onClose={() => setModalOpen(false)} title={`${editing ? 'Edit' : 'Add'} Equipment`}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group"><label>Registration / Code *</label><input className="form-control" required value={form.reg} onChange={e => setForm({...form, reg: e.target.value.toUpperCase()})} /></div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-control" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="">— Select type —</option>
                {equipTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Description / Model</label><input className="form-control" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
          <div className="form-row">
            <div className="form-group">
              <label>Assigned Operator</label>
              <select className="form-control" value={form.operator_id} onChange={e => { const emp = employees.find(x => x.id === e.target.value); setForm(f => ({ ...f, operator_id: e.target.value, operator_name: emp?.name || '' })) }}>
                <option value="">— Select employee —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option>Active</option><option>Grounded</option><option>Maintenance</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Hour Meter</label><input type="number" className="form-control" value={form.hour_meter || form.odometer_km} onChange={e => setForm({...form, hour_meter: e.target.value, odometer_km: e.target.value})} placeholder="0" /></div>
            <div className="form-group"><label>Last Service Date</label><input type="date" className="form-control" value={form.last_service_date} onChange={e => setForm({...form, last_service_date: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Assigned Project</label><input className="form-control" value={form.assigned_project} onChange={e => setForm({...form, assigned_project: e.target.value})} /></div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Equipment</button>
          </ModalActions>
        </form>
      </ModalDialog>

      <ModalDialog open={hourModalOpen} onClose={() => setHourModalOpen(false)} title="Log Equipment Hours">
        <form onSubmit={handleHourLog}>
          <div className="form-row">
            <div className="form-group">
              <label>Equipment *</label>
              <select className="form-control" required value={hourForm.equipment_id} onChange={e => setHourForm({...hourForm, equipment_id: e.target.value})}>
                <option value="">Select equipment</option>
                {earthMovers.map(eq => <option key={eq.id} value={eq.id}>{eq.reg} — {eq.type}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Date</label><input type="date" className="form-control" required value={hourForm.date} onChange={e => setHourForm({...hourForm, date: e.target.value})} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Hours Start</label><input type="number" step="0.1" className="form-control" value={hourForm.hours_start} onChange={e => setHourForm({...hourForm, hours_start: e.target.value})} /></div>
            <div className="form-group"><label>Hours End</label><input type="number" step="0.1" className="form-control" value={hourForm.hours_end} onChange={e => setHourForm({...hourForm, hours_end: e.target.value})} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Hours Worked (override)</label><input type="number" step="0.1" className="form-control" value={hourForm.hours_worked} onChange={e => setHourForm({...hourForm, hours_worked: e.target.value})} placeholder="Auto-calculated if blank" /></div>
            <div className="form-group">
              <label>Operator</label>
              <select className="form-control" value={hourForm.operator_id} onChange={e => { const emp = employees.find(x => x.id === e.target.value); setHourForm(f => ({ ...f, operator_id: e.target.value, operator_name: emp?.name || '' })) }}>
                <option value="">— Select employee —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Notes</label><textarea className="form-control" rows={2} value={hourForm.notes} onChange={e => setHourForm({...hourForm, notes: e.target.value})} /></div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setHourModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Log</button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
