import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import toast from 'react-hot-toast'

export default function Generators() {
  const { generators, genRunLogs, addGenerator, updateGenerator, deleteGenerator, addGenRunLog, deleteGenRunLog, getGeneratorEfficiency, getNextService, getHealthScore, getHealthStatus, loading, fetchAll } = useFleet()
  const [modalOpen, setModalOpen] = useState(false)
  const [runModalOpen, setRunModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    gen_code: '', gen_name: '', location: '', capacity: '', status: 'Stopped', service_date: '', last_service_date: '', service_interval_hours: 500
  })
  const [runForm, setRunForm] = useState({
    gen_id: '', date: new Date().toISOString().split('T')[0], start_time: '', end_time: '', hours: '', fuel_used: '', notes: ''
  })

  useEffect(() => { fetchAll() }, [])

  const openModal = (gen = null) => {
    if (gen) {
      setEditing(gen)
      setForm({
        gen_code: gen.gen_code, gen_name: gen.gen_name, location: gen.location || '',
        capacity: gen.capacity || '', status: gen.status || 'Stopped', service_date: gen.service_date || '',
        last_service_date: gen.last_service_date || '', service_interval_hours: gen.service_interval_hours || 500
      })
    } else {
      setEditing(null)
      setForm({ gen_code: '', gen_name: '', location: '', capacity: '', status: 'Stopped', service_date: '', last_service_date: '', service_interval_hours: 500 })
    }
    setModalOpen(true)
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

  const handleDelete = async (gen) => {
    if (window.confirm(`Delete generator "${gen.gen_code}"?`)) {
      await deleteGenerator(gen.id)
      toast.success('Deleted')
      await fetchAll()
    }
  }

  const openRunModal = (genId = '') => {
    setRunForm({ gen_id: genId, date: new Date().toISOString().split('T')[0], start_time: '', end_time: '', hours: '', fuel_used: '', notes: '' })
    setRunModalOpen(true)
  }

  const handleRunSubmit = async (e) => {
    e.preventDefault()
    if (!runForm.gen_id) return toast.error('Select generator')
    if (!runForm.date) return toast.error('Enter date')
    try {
      await addGenRunLog({
        gen_id: runForm.gen_id,
        date: runForm.date,
        start_time: runForm.start_time,
        end_time: runForm.end_time,
        hours: parseFloat(runForm.hours) || 0,
        fuel_used: parseFloat(runForm.fuel_used) || 0,
        notes: runForm.notes,
      })
      toast.success('Run log added')
      setRunModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDeleteRunLog = async (id) => {
    if (window.confirm('Delete this run log?')) {
      await deleteGenRunLog(id)
      toast.success('Run log deleted')
      await fetchAll()
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Generators</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Generator
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {loading ? <div>Loading...</div> : generators.length === 0 ? <div className="empty-state">No generators added</div> : generators.map(g => {
          const efficiency = getGeneratorEfficiency(g.id)
          const nextService = getNextService(g)
          const healthScore = getHealthScore(g, 'generator')
          const health = getHealthStatus(healthScore)
          const isServiceOverdue = nextService?.type === 'date' && new Date(nextService) < new Date()

          return (
            <div key={g.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>bolt</span>
                <span className={`badge ${g.status === 'Running' ? 'bg-green' : 'bg-red'}`}>{g.status}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{g.gen_code}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{g.gen_name}</div>
              {g.location && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>location_on</span> {g.location}</div>}
              {g.capacity && <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>bolt</span> {g.capacity} kVA</div>}
              {efficiency && (
                <div style={{ fontSize: 12 }}><span className="material-icons" style={{ fontSize: 12 }}>local_gas_station</span> Fuel Efficiency: <strong>{efficiency.toFixed(1)} L/hour</strong></div>
              )}
              <div style={{ fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 12 }}>build</span> Last Service: {g.last_service_date || g.service_date || '—'} {nextService && nextService.type === 'date' && (
                  <span style={{ color: isServiceOverdue ? 'var(--red)' : 'var(--green)' }}>
                    · Next: {nextService} {isServiceOverdue && '(Overdue)'}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons" style={{ fontSize: 16, color: health.color }}>{health.icon}</span>
                <span style={{ fontWeight: 600 }}>Health: {health.label}</span>
                <div className="progress-bar" style={{ flex: 1, background: 'var(--surface2)' }}><div className="progress-fill" style={{ width: `${healthScore}%`, background: health.color }}></div></div>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openRunModal(g.id)}><span className="material-icons">schedule</span> Log Run</button>
                <button className="btn btn-secondary btn-sm" onClick={() => openModal(g)}><span className="material-icons">edit</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g)}><span className="material-icons">delete</span></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Run Log Table */}
      <div className="card" style={{ padding: 16, marginTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Generator Run Log</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Generator</th><th>Start</th><th>End</th><th>Hours</th><th>Fuel (L)</th><th>Notes</th><th></th></tr>
            </thead>
            <tbody>
              {genRunLogs.map(log => {
                const gen = generators.find(g => g.id === log.gen_id)
                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{log.date}</td>
                    <td><strong>{gen?.gen_code || '—'}</strong></td>
                    <td>{log.start_time || '-'}</td>
                    <td>{log.end_time || '-'}</td>
                    <td>{log.hours}</td>
                    <td>{log.fuel_used}</td>
                    <td>{log.notes || '-'}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteRunLog(log.id)}><span className="material-icons">delete</span></button></td>
                  </tr>
                )
              })}
              {genRunLogs.length === 0 && <tr><td colSpan="8" className="empty-state">No run logs yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generator Add/Edit Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} <span>Generator</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Generator Code *</label><input className="form-control" required value={form.gen_code} onChange={e => setForm({...form, gen_code: e.target.value})} /></div>
                <div className="form-group"><label>Name</label><input className="form-control" value={form.gen_name} onChange={e => setForm({...form, gen_name: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Location</label><input className="form-control" value={form.location} onChange={e => setForm({...form, location: e.target.value})} /></div>
                <div className="form-group"><label>Capacity (kVA)</label><input type="number" className="form-control" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option>Running</option><option>Stopped</option><option>Maintenance</option><option>Offline</option></select></div>
                <div className="form-group"><label>Last Service Date</label><input type="date" className="form-control" value={form.last_service_date} onChange={e => setForm({...form, last_service_date: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Service Interval (hours)</label><input type="number" className="form-control" value={form.service_interval_hours} onChange={e => setForm({...form, service_interval_hours: parseInt(e.target.value) || 500})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Run Log Modal */}
      {runModalOpen && (
        <div className="overlay" onClick={() => setRunModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log Generator <span>Run</span></div>
            <form onSubmit={handleRunSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Generator</label><select className="form-control" required value={runForm.gen_id} onChange={e => setRunForm({...runForm, gen_id: e.target.value})}><option value="">Select</option>{generators.map(g => <option key={g.id} value={g.id}>{g.gen_code} - {g.gen_name}</option>)}</select></div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" required value={runForm.date} onChange={e => setRunForm({...runForm, date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Time</label><input type="time" className="form-control" value={runForm.start_time} onChange={e => setRunForm({...runForm, start_time: e.target.value})} /></div>
                <div className="form-group"><label>End Time</label><input type="time" className="form-control" value={runForm.end_time} onChange={e => setRunForm({...runForm, end_time: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Engine Hours</label><input type="number" step="0.1" className="form-control" placeholder="Total hours run" value={runForm.hours} onChange={e => setRunForm({...runForm, hours: e.target.value})} /></div>
                <div className="form-group"><label>Fuel Used (L)</label><input type="number" step="0.1" className="form-control" value={runForm.fuel_used} onChange={e => setRunForm({...runForm, fuel_used: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={runForm.notes} onChange={e => setRunForm({...runForm, notes: e.target.value})} /></div>
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
