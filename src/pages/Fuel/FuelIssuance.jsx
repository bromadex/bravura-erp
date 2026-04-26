import { useState, useEffect } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

export default function FuelIssuance() {
  const { tanks, issuances, addIssuance, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [earthmovers, setEarthmovers] = useState([])
  const [form, setForm] = useState({
    tank_id: '',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0,5),
    fuel_type: 'DIESEL',
    quantity: '',
    equipment_type: 'vehicle',
    equipment_id: '',
    equipment_name: '',
    driver_operator: '',
    odometer_reading: '',
    engine_hours: '',
    authorized_by: user?.full_name || user?.username || '',
    purpose: '',
    notes: '',
  })

  useEffect(() => {
    const fetchEquipment = async () => {
      const [vRes, gRes, eRes] = await Promise.all([
        supabase.from('fleet').select('id, reg, description').eq('status', 'Active'),
        supabase.from('generators').select('id, gen_code, gen_name'),
        supabase.from('earth_movers').select('id, reg, description'),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthmovers(eRes.data)
    }
    fetchEquipment()
  }, [])

  const handleEquipmentChange = (type, id) => {
    let name = ''
    if (type === 'vehicle') {
      const v = vehicles.find(v => v.id === id)
      name = v ? `${v.reg} - ${v.description || ''}` : ''
    } else if (type === 'generator') {
      const g = generators.find(g => g.id === id)
      name = g ? `${g.gen_code} - ${g.gen_name}` : ''
    } else {
      const e = earthmovers.find(e => e.id === id)
      name = e ? `${e.reg} - ${e.description || ''}` : ''
    }
    setForm({ ...form, equipment_id: id, equipment_name: name })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.tank_id) return toast.error('Select fuel tank')
    if (!form.quantity || form.quantity <= 0) return toast.error('Enter valid quantity')
    if (!form.equipment_id) return toast.error('Select equipment')
    try {
      await addIssuance({
        ...form,
        quantity: parseFloat(form.quantity),
        odometer_reading: form.odometer_reading ? parseFloat(form.odometer_reading) : null,
        engine_hours: form.engine_hours ? parseFloat(form.engine_hours) : null,
        created_by: user?.full_name || user?.username,
      })
      toast.success(`Issued ${form.quantity} L to ${form.equipment_name}`)
      setModalOpen(false)
      setForm({
        tank_id: '', date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0,5),
        fuel_type: 'DIESEL', quantity: '', equipment_type: 'vehicle', equipment_id: '', equipment_name: '',
        driver_operator: '', odometer_reading: '', engine_hours: '', authorized_by: user?.full_name || user?.username || '',
        purpose: '', notes: '',
      })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Issuance</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <span className="material-icons">local_gas_station</span> New Issuance
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Tank</th><th>Type</th><th>Equipment</th><th>Qty (L)</th>
              <th>Driver/Operator</th><th>Authorized By</th><th>Purpose</th><th>Odometer</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10">Loading...</td></tr>
            ) : issuances.length === 0 ? (
              <tr><td colSpan="10">No issuances</td></tr>
            ) : (
              issuances.map(i => {
                const tank = tanks.find(t => t.id === i.tank_id)
                return (
                  <tr key={i.id}>
                    <td>{i.date}</td><td>{i.time}</td>
                    <td>{tank?.name || '-'}</td>
                    <td><span className="badge bg-blue">{i.fuel_type}</span></td>
                    <td><strong>{i.equipment_name}</strong></td>
                    <td style={{ color: 'var(--blue)' }}>{i.quantity.toLocaleString()}</td>
                    <td>{i.driver_operator || '-'}</td>
                    <td>{i.authorized_by || '-'}</td>
                    <td>{i.purpose || '-'}</td>
                    <td>{i.odometer_reading || '-'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log <span>Fuel Issuance</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>TANK</label><select className="form-control" required value={form.tank_id} onChange={e => setForm({...form, tank_id: e.target.value})}><option value="">Select</option>{tanks.map(t => <option key={t.id} value={t.id}>{t.name} (current: {t.current_level?.toFixed(0)} L)</option>)}</select></div>
                <div className="form-group"><label>DATE</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div className="form-group"><label>TIME</label><input type="time" className="form-control" value={form.time} onChange={e => setForm({...form, time: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>FUEL TYPE</label><select className="form-control" value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}><option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option></select></div>
                <div className="form-group"><label>QUANTITY (Litres) *</label><input type="number" step="0.1" className="form-control" required value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>EQUIPMENT TYPE</label>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  {['vehicle','generator','earthmover'].map(t => (
                    <button key={t} type="button" className={`btn btn-sm ${form.equipment_type === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm({...form, equipment_type: t, equipment_id: '', equipment_name: ''})}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>EQUIPMENT</label>
                <select className="form-control" required value={form.equipment_id} onChange={e => handleEquipmentChange(form.equipment_type, e.target.value)}>
                  <option value="">Select</option>
                  {form.equipment_type === 'vehicle' && vehicles.map(v => <option key={v.id} value={v.id}>{v.reg} - {v.description}</option>)}
                  {form.equipment_type === 'generator' && generators.map(g => <option key={g.id} value={g.id}>{g.gen_code} - {g.gen_name}</option>)}
                  {form.equipment_type === 'earthmover' && earthmovers.map(e => <option key={e.id} value={e.id}>{e.reg} - {e.description}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Driver / Operator</label><input className="form-control" value={form.driver_operator} onChange={e => setForm({...form, driver_operator: e.target.value})} /></div>
                <div className="form-group"><label>Odometer (km) or Engine Hours</label><input type="number" step="0.1" className="form-control" placeholder="Optional" value={form.odometer_reading} onChange={e => setForm({...form, odometer_reading: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Authorized By</label><input className="form-control" value={form.authorized_by} onChange={e => setForm({...form, authorized_by: e.target.value})} /></div>
                <div className="form-group"><label>Purpose</label><input className="form-control" value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Log Issuance</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
