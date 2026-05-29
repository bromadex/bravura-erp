// src/pages/Fleet/Vehicles.jsx
// Enhanced vehicle master with full identity, compliance and technical fields.

import { useState, useEffect } from 'react'
import { useFleet } from '../../contexts/FleetContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const VEHICLE_TYPES  = ['Pickup','LDV','SUV','Bus','Minibus','Truck','Tipper','Tanker','Crane','Grader',
                        'Water Bowser','Low Bed','Flatbed','Ambulance','Van','Panel Van','Other']
const FUEL_TYPES     = ['Diesel','Petrol','CNG','LPG','Electric','Hybrid']
const STATUSES       = ['Active','Grounded','Maintenance','Sold','Written Off']

function expiryColor(dateStr) {
  if (!dateStr) return ''
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (days < 0)  return 'var(--red)'
  if (days < 30) return 'var(--yellow)'
  return 'var(--green)'
}

function ExpiryBadge({ label, date }) {
  if (!date) return null
  const days = Math.ceil((new Date(date) - new Date()) / 86400000)
  const color = expiryColor(date)
  return (
    <div style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color, fontWeight: 600 }}>{label}:</span>
      <span style={{ color }}>{date}{days < 0 ? ' (EXPIRED)' : days < 30 ? ` (${days}d)` : ''}</span>
    </div>
  )
}

const EMPTY = {
  reg: '', type: '', make: '', model: '', year: '', colour: '', fuel_type: '',
  vin_serial: '', engine_number: '', chassis_number: '',
  driver_name: '', driver_id: '', status: 'Active',
  odometer_km: '', last_service_date: '', service_interval_km: '', service_interval_days: '',
  assigned_project: '', department: '', location: '', cost_center: '',
  tare_weight: '', gross_vehicle_mass: '', tracker_id: '',
  licence_expiry: '', insurance_expiry: '', roadworthy_expiry: '',
  acquisition_cost: '', acquisition_date: '', salvage_value: '',
  useful_life_years: '5', utilization_available_hours: '',
  description: '',
}

export default function Vehicles() {
  const {
    vehicles, addVehicle, updateVehicle, deleteVehicle,
    reclassifyFleetAsset, categoryConfigs, loading, fetchAll,
    getAssetExpiryWarnings,
  } = useFleet()
  const navigate  = useNavigate()
  const canEdit   = useCanEdit('fleet', 'vehicles')
  const canDelete = useCanDelete('fleet', 'vehicles')

  const [modalOpen,      setModalOpen]      = useState(false)
  const [tab,            setTab]            = useState('identity')
  const [editing,        setEditing]        = useState(null)
  const [employees,      setEmployees]      = useState([])
  const [departments,    setDepartments]    = useState([])
  const [fuelMap,        setFuelMap]        = useState({})
  const [reclassAsset,   setReclassAsset]   = useState(null)
  const [reclassForm,    setReclassForm]    = useState({ newCategory: '', reason: '' })
  const [reclassLoading, setReclassLoading] = useState(false)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    supabase.from('employees').select('id, name, employee_number').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
    supabase.from('departments').select('id,name').order('name')
      .then(({ data }) => { if (data) setDepartments(data) })
    supabase.from('fuel_log').select('vehicle, amount')
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(f => { if (f.vehicle) map[f.vehicle] = (map[f.vehicle] || 0) + (f.amount || 0) })
          setFuelMap(map)
        }
      })
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openModal = (v = null) => {
    setTab('identity')
    if (v) {
      setEditing(v)
      setForm({
        reg: v.reg || '', type: v.type || '', make: v.make || '', model: v.model || '',
        year: v.year || '', colour: v.colour || '', fuel_type: v.fuel_type || '',
        vin_serial: v.vin_serial || '', engine_number: v.engine_number || '',
        chassis_number: v.chassis_number || '',
        driver_name: v.driver_name || '', driver_id: v.driver_id || '',
        status: v.status || 'Active', odometer_km: v.odometer_km || '',
        last_service_date: v.last_service_date || '',
        service_interval_km: v.service_interval_km || '',
        service_interval_days: v.service_interval_days || '',
        assigned_project: v.assigned_project || '', department: v.department || '',
        location: v.location || '', cost_center: v.cost_center || '',
        tare_weight: v.tare_weight || '', gross_vehicle_mass: v.gross_vehicle_mass || '',
        tracker_id: v.tracker_id || '',
        licence_expiry: v.licence_expiry || v.metadata?.licence_expiry || '',
        insurance_expiry: v.insurance_expiry || v.metadata?.insurance_expiry || '',
        roadworthy_expiry: v.roadworthy_expiry || v.metadata?.roadworthy_expiry || '',
        acquisition_cost: v.acquisition_cost || '', acquisition_date: v.acquisition_date || '',
        salvage_value: v.salvage_value || '', useful_life_years: v.useful_life_years || '5',
        utilization_available_hours: v.utilization_available_hours || '',
        description: v.description || '',
      })
    } else {
      setEditing(null)
      setForm(EMPTY)
    }
    setModalOpen(true)
  }

  const handleDriverSelect = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({ ...f, driver_id: empId, driver_name: emp?.name || '' }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.reg) return toast.error('Registration required')
    try {
      const payload = {
        reg: form.reg, type: form.type,
        make: form.make || null, model: form.model || null,
        year: form.year ? parseInt(form.year) : null,
        colour: form.colour || null, fuel_type: form.fuel_type || null,
        vin_serial: form.vin_serial || null,
        engine_number: form.engine_number || null,
        chassis_number: form.chassis_number || null,
        description: form.description,
        driver_id: form.driver_id || null, driver_name: form.driver_name || '',
        status: form.status,
        odometer_km: form.odometer_km ? parseFloat(form.odometer_km) : null,
        last_service_date: form.last_service_date || null,
        service_interval_km: form.service_interval_km ? parseInt(form.service_interval_km) : null,
        service_interval_days: form.service_interval_days ? parseInt(form.service_interval_days) : null,
        assigned_project: form.assigned_project || '',
        department: form.department || '',
        location: form.location || '',
        cost_center: form.cost_center || '',
        tare_weight: form.tare_weight || null,
        gross_vehicle_mass: form.gross_vehicle_mass || null,
        tracker_id: form.tracker_id || null,
        licence_expiry: form.licence_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
        roadworthy_expiry: form.roadworthy_expiry || null,
        acquisition_cost: form.acquisition_cost ? parseFloat(form.acquisition_cost) : 0,
        acquisition_date: form.acquisition_date || null,
        salvage_value: form.salvage_value ? parseFloat(form.salvage_value) : 0,
        useful_life_years: form.useful_life_years ? parseInt(form.useful_life_years) : 5,
        utilization_available_hours: form.utilization_available_hours ? parseFloat(form.utilization_available_hours) : 0,
      }
      if (editing) {
        await updateVehicle(editing.id, payload)
        toast.success('Vehicle updated')
      } else {
        await addVehicle(payload)
        toast.success('Vehicle added')
      }
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete vehicle "${v.reg}"? This cannot be undone.`)) return
    await deleteVehicle(v.id)
    toast.success('Deleted')
  }

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase()
    const matchSearch = !q || v.reg?.toLowerCase().includes(q) || v.make?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) || v.type?.toLowerCase().includes(q) ||
      v.driver_name?.toLowerCase().includes(q) || v.assigned_project?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'All' || v.status === statusFilter
    return matchSearch && matchStatus
  })

  const expiryWarnings = getAssetExpiryWarnings(30)

  return (
    <div>
      <PageHeader title={`Vehicles (${vehicles.length})`}>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openModal()}>
            <span className="material-icons">add</span> Add Vehicle
          </button>
        )}
      </PageHeader>

      {/* Expiry warnings banner */}
      {expiryWarnings.length > 0 && (
        <div style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--yellow)', marginBottom: 6 }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
            {expiryWarnings.length} compliance issue{expiryWarnings.length > 1 ? 's' : ''} require attention
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {expiryWarnings.slice(0, 5).map((w, i) => (
              <span key={i} style={{ fontSize: 12, background: 'rgba(0,0,0,.2)', borderRadius: 4, padding: '2px 8px', color: w.daysLeft < 0 ? 'var(--red)' : 'var(--yellow)' }}>
                {w.asset} — {w.type} {w.daysLeft < 0 ? `expired ${Math.abs(w.daysLeft)}d ago` : `in ${w.daysLeft}d`}
              </span>
            ))}
            {expiryWarnings.length > 5 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>+{expiryWarnings.length - 5} more</span>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="Search registration, make, model…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ maxWidth: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <EmptyState icon="hourglass_empty" message="Loading vehicles…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="directions_car" message={search ? 'No vehicles match your search' : 'No vehicles added yet'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(v => {
            const totalFuel = fuelMap[v.reg] || 0
            const hasWarning = expiryWarnings.some(w => w.assetId === v.id)
            return (
              <div key={v.id} className="card" style={{ padding: 16, borderLeft: hasWarning ? '3px solid var(--yellow)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 28, color: 'var(--gold)' }}>directions_car</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{v.reg}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.type || '—'}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div style={{ marginTop: 10, fontSize: 12 }}>
                  {v.fuel_type && <div style={{ color: 'var(--text-dim)' }}>⛽ {v.fuel_type}</div>}
                  {v.colour && <div style={{ color: 'var(--text-dim)' }}>🎨 {v.colour}</div>}
                  {v.driver_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <span className="material-icons" style={{ fontSize: 14, color: 'var(--teal)' }}>person</span>
                      {v.driver_name}
                    </div>
                  )}
                  {v.assigned_project && <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>📍 {v.assigned_project}</div>}
                  {v.odometer_km != null && (
                    <div style={{ marginTop: 4 }}>🔢 <strong>{Number(v.odometer_km).toLocaleString()}</strong> km</div>
                  )}
                  <div style={{ marginTop: 4 }}>⛽ <strong>{totalFuel.toLocaleString()}</strong> L total fuel</div>
                </div>

                {/* Compliance badges */}
                <div style={{ marginTop: 8 }}>
                  <ExpiryBadge label="License" date={v.licence_expiry || v.metadata?.licence_expiry} />
                  <ExpiryBadge label="Insurance" date={v.insurance_expiry || v.metadata?.insurance_expiry} />
                  <ExpiryBadge label="Roadworthy" date={v.roadworthy_expiry || v.metadata?.roadworthy_expiry} />
                </div>

                <div className="btn-group-sm" style={{ justifyContent: 'flex-end', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" title="View Detail"
                    onClick={() => navigate(`/module/fleet/vehicle/${v.id}`)}>
                    <span className="material-icons">open_in_new</span>
                  </button>
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm" title="Reclassify"
                      onClick={() => { setReclassAsset(v); setReclassForm({ newCategory: '', reason: '' }) }}>
                      <span className="material-icons">swap_horiz</span>
                    </button>
                  )}
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openModal(v)}>
                      <span className="material-icons">edit</span>
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v)}>
                      <span className="material-icons">delete</span>
                    </button>
                  )}
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
            <strong>{reclassAsset.reg}</strong> is currently a <strong>Vehicle</strong>
          </div>
          <div className="form-group">
            <label>Move to Category *</label>
            <select className="form-control" value={reclassForm.newCategory}
              onChange={e => setReclassForm(f => ({ ...f, newCategory: e.target.value }))}>
              <option value="">— Select target category —</option>
              {(categoryConfigs.length
                ? categoryConfigs.filter(c => c.category !== 'Vehicle')
                : [
                    { category: 'Generator', measurement_type: 'hours' },
                    { category: 'Heavy Equipment', measurement_type: 'hours' },
                    { category: 'Light Equipment', measurement_type: 'hours' },
                    { category: 'Compressor', measurement_type: 'hours' },
                  ]
              ).map(c => (
                <option key={c.category} value={c.category}>{c.category} ({c.measurement_type})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Reason for Reclassification *</label>
            <textarea className="form-control" rows={3} required value={reclassForm.reason}
              onChange={e => setReclassForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Vehicle repurposed as site generator" />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setReclassAsset(null)}>Cancel</button>
            <button className="btn btn-primary"
              disabled={!reclassForm.newCategory || !reclassForm.reason || reclassLoading}
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

      {/* Add / Edit Modal — tabbed form */}
      <ModalDialog open={modalOpen} onClose={() => setModalOpen(false)}
        title={`${editing ? 'Edit' : 'Add'} Vehicle`} size="large">
        <form onSubmit={handleSubmit}>

          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {[
              { id: 'identity',    label: 'Identity',    icon: 'badge' },
              { id: 'technical',   label: 'Technical',   icon: 'build' },
              { id: 'compliance',  label: 'Compliance',  icon: 'verified_user' },
              { id: 'operations',  label: 'Operations',  icon: 'settings' },
              { id: 'finance',     label: 'Finance',     icon: 'attach_money' },
            ].map(t => (
              <button key={t.id} type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: tab === t.id ? 'var(--gold)' : 'transparent',
                  color: tab === t.id ? '#000' : 'var(--text-dim)',
                  fontWeight: tab === t.id ? 700 : 400, fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                <span className="material-icons" style={{ fontSize: 14 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Identity Tab ── */}
          {tab === 'identity' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Registration Number *</label>
                  <input className="form-control" required value={form.reg}
                    onChange={e => set('reg', e.target.value.toUpperCase())} placeholder="e.g. ABC 123Z" />
                </div>
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <select className="form-control" value={form.type} onChange={e => set('type', e.target.value)}>
                    <option value="">— Select —</option>
                    {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Make</label>
                  <input className="form-control" value={form.make} onChange={e => set('make', e.target.value)}
                    placeholder="e.g. Toyota, Isuzu, Mercedes" />
                </div>
                <div className="form-group">
                  <label>Model</label>
                  <input className="form-control" value={form.model} onChange={e => set('model', e.target.value)}
                    placeholder="e.g. Hilux, NQR, Actros" />
                </div>
                <div className="form-group" style={{ maxWidth: 100 }}>
                  <label>Year</label>
                  <input type="number" className="form-control" value={form.year} onChange={e => set('year', e.target.value)}
                    placeholder="2020" min="1950" max={new Date().getFullYear() + 1} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Colour</label>
                  <input className="form-control" value={form.colour} onChange={e => set('colour', e.target.value)}
                    placeholder="e.g. White, Silver" />
                </div>
                <div className="form-group">
                  <label>Fuel Type</label>
                  <select className="form-control" value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
                    <option value="">— Select —</option>
                    {FUEL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description / Additional Notes</label>
                <input className="form-control" value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Additional details" />
              </div>
            </>
          )}

          {/* ── Technical Tab ── */}
          {tab === 'technical' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>VIN / Chassis Serial</label>
                  <input className="form-control" value={form.vin_serial} onChange={e => set('vin_serial', e.target.value.toUpperCase())}
                    placeholder="17-char VIN" />
                </div>
                <div className="form-group">
                  <label>Chassis Number</label>
                  <input className="form-control" value={form.chassis_number} onChange={e => set('chassis_number', e.target.value.toUpperCase())} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Engine Number</label>
                  <input className="form-control" value={form.engine_number} onChange={e => set('engine_number', e.target.value.toUpperCase())} />
                </div>
                <div className="form-group">
                  <label>Tracker / Telematics ID</label>
                  <input className="form-control" value={form.tracker_id} onChange={e => set('tracker_id', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tare Weight (kg)</label>
                  <input type="number" className="form-control" value={form.tare_weight}
                    onChange={e => set('tare_weight', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Gross Vehicle Mass (kg)</label>
                  <input type="number" className="form-control" value={form.gross_vehicle_mass}
                    onChange={e => set('gross_vehicle_mass', e.target.value)} placeholder="0" />
                </div>
              </div>
            </>
          )}

          {/* ── Compliance Tab ── */}
          {tab === 'compliance' && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
                Expiry dates shown in red when expired, yellow within 30 days.
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label>Vehicle License Expiry</label>
                  <input type="date" className="form-control" value={form.licence_expiry}
                    onChange={e => set('licence_expiry', e.target.value)}
                    style={{ borderColor: form.licence_expiry ? expiryColor(form.licence_expiry) : undefined }} />
                </div>
                <div className="form-group">
                  <label>Insurance Expiry</label>
                  <input type="date" className="form-control" value={form.insurance_expiry}
                    onChange={e => set('insurance_expiry', e.target.value)}
                    style={{ borderColor: form.insurance_expiry ? expiryColor(form.insurance_expiry) : undefined }} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Roadworthy / Fitness Expiry</label>
                  <input type="date" className="form-control" value={form.roadworthy_expiry}
                    onChange={e => set('roadworthy_expiry', e.target.value)}
                    style={{ borderColor: form.roadworthy_expiry ? expiryColor(form.roadworthy_expiry) : undefined }} />
                </div>
                <div className="form-group" />
              </div>
            </>
          )}

          {/* ── Operations Tab ── */}
          {tab === 'operations' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Assigned Driver</label>
                  <select className="form-control" value={form.driver_id} onChange={e => handleDriverSelect(e.target.value)}>
                    <option value="">— Select employee —</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Current Odometer (km)</label>
                  <input type="number" className="form-control" value={form.odometer_km}
                    onChange={e => set('odometer_km', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>Last Service Date</label>
                  <input type="date" className="form-control" value={form.last_service_date}
                    onChange={e => set('last_service_date', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Service Interval (km)</label>
                  <input type="number" className="form-control" value={form.service_interval_km}
                    onChange={e => set('service_interval_km', e.target.value)} placeholder="5000" />
                </div>
                <div className="form-group">
                  <label>Service Interval (days)</label>
                  <input type="number" className="form-control" value={form.service_interval_days}
                    onChange={e => set('service_interval_days', e.target.value)} placeholder="180" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Assigned Project / Site</label>
                  <input className="form-control" value={form.assigned_project}
                    onChange={e => set('assigned_project', e.target.value)} placeholder="e.g. Boxcut Phase 2" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select className="form-control" value={form.department}
                    onChange={e => set('department', e.target.value)}>
                    <option value="">— Select department —</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Location</label>
                  <input className="form-control" value={form.location}
                    onChange={e => set('location', e.target.value)} placeholder="e.g. Main Yard" />
                </div>
                <div className="form-group">
                  <label>Utilization Available Hours/Month</label>
                  <input type="number" className="form-control" value={form.utilization_available_hours}
                    onChange={e => set('utilization_available_hours', e.target.value)} placeholder="160" />
                </div>
              </div>
            </>
          )}

          {/* ── Finance Tab ── */}
          {tab === 'finance' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Acquisition Cost (USD)</label>
                  <input type="number" className="form-control" value={form.acquisition_cost}
                    onChange={e => set('acquisition_cost', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Acquisition Date</label>
                  <input type="date" className="form-control" value={form.acquisition_date}
                    onChange={e => set('acquisition_date', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Salvage Value (USD)</label>
                  <input type="number" className="form-control" value={form.salvage_value}
                    onChange={e => set('salvage_value', e.target.value)} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Useful Life (Years)</label>
                  <input type="number" className="form-control" value={form.useful_life_years}
                    onChange={e => set('useful_life_years', e.target.value)} placeholder="5" min="1" max="50" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cost Center</label>
                  <input className="form-control" value={form.cost_center}
                    onChange={e => set('cost_center', e.target.value)} />
                </div>
                <div className="form-group" />
              </div>
              {form.acquisition_cost && form.salvage_value !== '' && form.useful_life_years && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                  <strong>Straight-line depreciation:</strong>{' '}
                  ${(((parseFloat(form.acquisition_cost) - parseFloat(form.salvage_value || 0)) / parseFloat(form.useful_life_years)) || 0).toFixed(2)}/year
                </div>
              )}
            </>
          )}

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Update Vehicle' : 'Add Vehicle'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
