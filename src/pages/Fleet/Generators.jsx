// src/pages/Fleet/Generators.jsx
// Generators with operator linked to employees

import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function Generators() {
  const { generators, addGenerator, updateGenerator, deleteGenerator, addGenRunLog, genRunLogs, reclassifyFleetAsset, categoryConfigs, loading, fetchAll } = useFleet()
  const canEdit   = useCanEdit('fleet', 'generators')
  const canDelete = useCanDelete('fleet', 'generators')
  const [modalOpen,      setModalOpen]      = useState(false)
  const [runModalOpen,   setRunModalOpen]   = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [employees,      setEmployees]      = useState([])
  const [reclassAsset,   setReclassAsset]   = useState(null)
  const [reclassForm,    setReclassForm]    = useState({ newCategory: '', reason: '' })
  const [reclassLoading, setReclassLoading] = useState(false)
  const [form, setForm] = useState({
    gen_code: '', gen_name: '', location: '', capacity: '', status: 'Stopped',
    service_date: '', assigned_operator_id: '', assigned_operator_name: ''
  })
  const [runForm, setRunForm] = useState({
    gen_id: '', date: new Date().toISOString().split('T')[0],
    start_time: '', stop_time: '', run_hours: '', fuel_used: '',
    operator_id: '', operator_name: '', notes: ''
  })

  useEffect(() => {
    // Load employees joined with app_users — we need app_users.id for the FK constraint
    // generators.assigned_operator_id → app_users.id (NOT employees.id)
    supabase.from('employees')
      .select('id, name, employee_number, system_user_id')
      .neq('status', 'Terminated')
      .not('system_user_id', 'is', null)
      .order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
  }, [])

  const openEdit = (gen = null) => {
    if (gen) {
      setEditing(gen)
      setForm({
        gen_code: gen.gen_code, gen_name: gen.gen_name || '', location: gen.location || '',
        capacity: gen.capacity || '', status: gen.status || 'Stopped',
        service_date: gen.last_service_date || gen.service_date || '',
        assigned_operator_id: gen.assigned_operator_id || '',
        assigned_operator_name: gen.assigned_operator_name || ''
      })
    } else {
      setEditing(null)
      setForm({ gen_code: '', gen_name: '', location: '', capacity: '', status: 'Stopped', service_date: '', assigned_operator_id: '', assigned_operator_name: '' })
    }
    setModalOpen(true)
  }

  const handleOperatorSelect = (empId, setter) => {
    const emp = employees.find(e => e.system_user_id === empId || e.id === empId)
    setter(prev => ({ ...prev, operator_id: empId, operator_name: emp?.name || '', assigned_operator_id: empId, assigned_operator_name: emp?.name || '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.gen_code) return toast.error('Generator code required')
    try {
      if (editing) {
        await updateGenerator(editing.id, form)
        toast.success('Generator updated')
      } else {
        await addGenerator(form)
        toast.success('Generator added')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleRunLog = async (e) => {
    e.preventDefault()
    if (!runForm.gen_id) return toast.error('Select a generator')
    try {
      const payload = {
        ...runForm,
        run_hours: runForm.run_hours ? parseFloat(runForm.run_hours) : null,
        fuel_used: runForm.fuel_used ? parseFloat(runForm.fuel_used) : null,
      }
      await addGenRunLog(payload)
      toast.success('Run log added')
      setRunModalOpen(false)
      setRunForm({ gen_id: '', date: new Date().toISOString().split('T')[0], start_time: '', stop_time: '', run_hours: '', fuel_used: '', operator_id: '', operator_name: '', notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  const statusColor = { Running: 'var(--green)', Stopped: 'var(--text-dim)', Maintenance: 'var(--yellow)', Offline: 'var(--red)' }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Generators</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && (
            <>
              <button className="btn btn-secondary" onClick={() => setRunModalOpen(true)}>
                <span className="material-icons">timer</span> Log Run
              </button>
              <button className="btn btn-primary" onClick={() => openEdit()}>
                <span className="material-icons">add</span> Add Generator
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading generators…</div>
      ) : generators.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>bolt</span>
          <p>No generators added yet</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {generators.map(g => {
            const recentLogs = (genRunLogs || []).filter(l => l.gen_id === g.id).slice(0, 3)
            const totalHours = (genRunLogs || []).filter(l => l.gen_id === g.id).reduce((s, l) => s + (l.run_hours || 0), 0)
            return (
              <div key={g.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="material-icons" style={{ fontSize: 32, color: 'var(--yellow)' }}>bolt</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[g.status] || 'var(--text-dim)', background: `${statusColor[g.status]}18`, padding: '2px 8px', borderRadius: 10, border: `1px solid ${statusColor[g.status]}44` }}>{g.status}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{g.gen_code}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{g.gen_name || '—'}</div>
                {g.location && <div style={{ fontSize: 11, marginTop: 2, color: 'var(--text-dim)' }}>📍 {g.location}</div>}
                {g.capacity && <div style={{ fontSize: 11, marginTop: 2 }}>⚡ {g.capacity} kVA</div>}
                {g.assigned_operator_name && (
                  <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--teal)' }}>person</span>
                    {g.assigned_operator_name}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>⏱ Total hours: {totalHours.toFixed(1)}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {canEdit && <button className="btn btn-secondary btn-sm" title="Reclassify" onClick={() => { setReclassAsset(g); setReclassForm({ newCategory: '', reason: '' }) }}><span className="material-icons">swap_horiz</span></button>}
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(g)}><span className="material-icons">edit</span></button>}
                  {canDelete && <button className="btn btn-danger btn-sm" onClick={async () => { if (window.confirm(`Delete ${g.gen_code}?`)) { await deleteGenerator(g.id); toast.success('Deleted') } }}><span className="material-icons">delete</span></button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reclassify Modal */}
      {reclassAsset && (
        <div className="overlay" onClick={() => setReclassAsset(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">Reclassify <span>Asset</span></div>
            <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
              <strong>{reclassAsset.gen_code}</strong> is currently a <strong>Generator</strong>
              {reclassAsset._legacy && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>(legacy — will be migrated)</span>}
            </div>
            <div className="form-group">
              <label>Move to Category *</label>
              <select className="form-control" value={reclassForm.newCategory}
                onChange={e => setReclassForm(f => ({ ...f, newCategory: e.target.value }))}>
                <option value="">— Select target category —</option>
                {(categoryConfigs.length
                  ? categoryConfigs.filter(c => c.category !== 'Generator')
                  : [
                      { category: 'Vehicle',         measurement_type: 'km'    },
                      { category: 'Heavy Equipment', measurement_type: 'hours' },
                      { category: 'Light Equipment', measurement_type: 'hours' },
                      { category: 'Water Pump',      measurement_type: 'hours' },
                      { category: 'Compressor',      measurement_type: 'hours' },
                      { category: 'Fixed Plant',     measurement_type: 'fixed' },
                    ]
                ).map(c => <option key={c.category} value={c.category}>{c.category} ({c.measurement_type})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Reason *</label>
              <textarea className="form-control" rows={3} value={reclassForm.reason}
                onChange={e => setReclassForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Unit repurposed as standby pump" />
            </div>
            <div className="modal-actions">
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
            </div>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Generator</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Generator Code *</label><input className="form-control" required value={form.gen_code} onChange={e => setForm({...form, gen_code: e.target.value})} placeholder="e.g. GEN-01" /></div>
                <div className="form-group"><label>Name / Model</label><input className="form-control" value={form.gen_name} onChange={e => setForm({...form, gen_name: e.target.value})} placeholder="e.g. Cummins C500" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Location</label><input className="form-control" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
                <div className="form-group"><label>Capacity (kVA)</label><input type="number" className="form-control" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option>Running</option><option>Stopped</option><option>Maintenance</option><option>Offline</option>
                  </select>
                </div>
                <div className="form-group"><label>Last Service Date</label><input type="date" className="form-control" value={form.service_date} onChange={e => setForm({...form, service_date: e.target.value})} /></div>
              </div>
              <div className="form-group">
                <label>Assigned Operator</label>
                <select className="form-control" value={form.assigned_operator_id} onChange={e => setForm(f => { const emp = employees.find(x => x.system_user_id === e.target.value); return { ...f, assigned_operator_id: e.target.value, assigned_operator_name: emp?.name || '' } })}>
                  <option value="">— Select employee —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.system_user_id}>{emp.name} ({emp.employee_number})</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Generator</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Run Log Modal */}
      {runModalOpen && (
        <div className="overlay" onClick={() => setRunModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">Log <span>Generator Run</span></div>
            <form onSubmit={handleRunLog}>
              <div className="form-row">
                <div className="form-group">
                  <label>Generator *</label>
                  <select className="form-control" required value={runForm.gen_id} onChange={e => setRunForm({...runForm, gen_id: e.target.value})}>
                    <option value="">Select generator</option>
                    {generators.map(g => <option key={g.id} value={g.id}>{g.gen_code} — {g.gen_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" required value={runForm.date} onChange={e => setRunForm({...runForm, date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Time</label><input type="time" className="form-control" value={runForm.start_time} onChange={e => setRunForm({...runForm, start_time: e.target.value})} /></div>
                <div className="form-group"><label>Stop Time</label><input type="time" className="form-control" value={runForm.stop_time} onChange={e => setRunForm({...runForm, stop_time: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Run Hours</label><input type="number" step="0.1" className="form-control" value={runForm.run_hours} onChange={e => setRunForm({...runForm, run_hours: e.target.value})} /></div>
                <div className="form-group"><label>Fuel Used (L)</label><input type="number" step="0.1" className="form-control" value={runForm.fuel_used} onChange={e => setRunForm({...runForm, fuel_used: e.target.value})} /></div>
              </div>
              <div className="form-group">
                <label>Operator</label>
                <select className="form-control" value={runForm.operator_id} onChange={e => { const emp = employees.find(x => x.id === e.target.value); setRunForm(f => ({ ...f, operator_id: e.target.value, operator_name: emp?.name || '' })) }}>
                  <option value="">— Select employee —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.system_user_id}>{emp.name} ({emp.employee_number})</option>)}
                </select>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows={2} value={runForm.notes} onChange={e => setRunForm({...runForm, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setRunModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
