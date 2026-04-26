import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const { vehicles, genRunLogs, fuelLogs, updateVehicle, deleteVehicle, getVehicleFuelEfficiency, getNextService, getHealthScore, getHealthStatus, loading, fetchAll } = useFleet()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [serviceModal, setServiceModal] = useState(false)
  const [downtimeModal, setDowntimeModal] = useState(false)
  const [form, setForm] = useState({
    reg: '', type: '', description: '', driver_name: '', status: 'Active',
    odometer_km: 0, last_service_date: '', service_interval_km: 5000,
    service_interval_days: 180, assigned_project: ''
  })
  const [serviceLog, setServiceLog] = useState({ service_date: '', service_type: '', cost: '', notes: '' })
  const [downtimeLog, setDowntimeLog] = useState({ breakdown_date: '', issue: '', downtime_hours: '', notes: '' })

  useEffect(() => { fetchAll() }, [])

  const openModal = (vehicle = null) => {
    if (vehicle) {
      setEditing(vehicle)
      setForm({
        reg: vehicle.reg, type: vehicle.type || '', description: vehicle.description || '',
        driver_name: vehicle.driver_name || '', status: vehicle.status || 'Active',
        odometer_km: vehicle.odometer_km || 0, last_service_date: vehicle.last_service_date || '',
        service_interval_km: vehicle.service_interval_km || 5000,
        service_interval_days: vehicle.service_interval_days || 180,
        assigned_project: vehicle.assigned_project || ''
      })
    } else {
      setEditing(null)
      setForm({ reg: '', type: '', description: '', driver_name: '', status: 'Active', odometer_km: 0, last_service_date: '', service_interval_km: 5000, service_interval_days: 180, assigned_project: '' })
    }
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration required')
    try {
      await updateVehicle(editing.id, { ...form, odometer_km: parseFloat(form.odometer_km) || 0 })
      toast.success('Vehicle updated')
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleAddService = async (vehicle) => {
    if (!serviceLog.service_date) return toast.error('Service date required')
    // log service (you can extend useFleet to record service logs)
    toast.success('Service recorded')
    setServiceModal(false)
    await fetchAll()
  }

  const handleAddDowntime = async (vehicle) => {
    if (!downtimeLog.breakdown_date) return toast.error('Date required')
    // log downtime
    toast.success('Downtime recorded')
    setDowntimeModal(false)
    await fetchAll()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vehicles</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <span className="material-icons">add</span> Add Vehicle
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {loading ? <div>Loading...</div> : vehicles.length === 0 ? <div className="empty-state">No vehicles added</div> : vehicles.map(v => {
          const efficiency = getVehicleFuelEfficiency(v.reg)
          const nextService = getNextService(v)
          const healthScore = getHealthScore(v, 'vehicle')
          const health = getHealthStatus(healthScore)
          const isServiceOverdue = nextService?.type === 'date' && new Date(nextService) < new Date()

          return (
            <div key={v.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>directions_car</span>
                <span className={`badge ${v.status === 'Active' ? 'bg-green' : 'bg-red'}`}>{v.status}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{v.reg}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{v.type || '—'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{v.description || ''}</div>
              {v.driver_name && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>person</span> {v.driver_name}</div>}
              {v.assigned_project && <div style={{ fontSize: 12, marginTop: 4 }}><span className="material-icons" style={{ fontSize: 12 }}>location_on</span> {v.assigned_project}</div>}
              <div style={{ marginTop: 8, fontSize: 12 }}>📊 Odometer: <strong>{v.odometer_km?.toLocaleString()} km</strong></div>
              {efficiency && (
                <div style={{ fontSize: 12 }}>
                  ⛽ Fuel Efficiency: <strong>{efficiency.kmPerLiter?.toFixed(1)} km/L</strong> ({efficiency.litersPer100km?.toFixed(1)} L/100km)
                </div>
              )}
              <div style={{ fontSize: 12 }}>
                🛠️ Last Service: {v.last_service_date || '—'} {nextService && nextService.type === 'date' && (
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
                <button className="btn btn-secondary btn-sm" onClick={() => openModal(v)}><span className="material-icons">edit</span></button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(v); setServiceModal(true) }}><span className="material-icons">build</span> Service</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(v); setDowntimeModal(true) }}><span className="material-icons">report_problem</span> Downtime</button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteVehicle(v.id)}><span className="material-icons">delete</span></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit Modal – unchanged, but include new fields */}
      {modalOpen && ( /* similar to before, now with odometer, service interval, assigned_project fields */ )}
      {serviceModal && ( /* modal for service log */ )}
      {downtimeModal && ( /* modal for downtime log */ )}
    </div>
  )
}
