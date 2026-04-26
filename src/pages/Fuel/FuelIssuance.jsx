import { useState, useEffect } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

export default function FuelIssuance() {
  const { issuances, addIssuance, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [generators, setGenerators] = useState([])
  const [earthmovers, setEarthmovers] = useState([])
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0,5),
    fuel_type: 'DIESEL',
    amount: '',
    vehicle: '',
    driver: '',
    authorized_by: user?.full_name || user?.username || '',
    purpose: '',
    odometer: '',
    flowmeter: '',
  })
  const [equipType, setEquipType] = useState('vehicle') // vehicle, generator, earthmover

  useEffect(() => {
    const fetchEquipment = async () => {
      const [vRes, gRes, eRes] = await Promise.all([
        supabase.from('fleet').select('reg, description').eq('status', 'Active'),
        supabase.from('generators').select('gen_code, gen_name'),
        supabase.from('earth_movers').select('reg, description'),
      ])
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthmovers(eRes.data)
    }
    fetchEquipment()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (equipType === 'vehicle' && !form.vehicle) return toast.error('Select a vehicle')
    try {
      await addIssuance({
        ...form,
        amount: parseFloat(form.amount),
        flowmeter: parseFloat(form.flowmeter) || 0,
        odometer: form.odometer ? parseFloat(form.odometer) : null,
        user_name: user?.full_name || user?.username,
        vehicle: equipType === 'vehicle' ? form.vehicle : (equipType === 'generator' ? form.vehicle : form.vehicle), // adjust as needed
        driver: form.driver,
        authorized_by: form.authorized_by,
      })
      toast.success(`Issued ${form.amount} L`)
      setShowModal(false)
      setForm({ date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0,5), fuel_type: 'DIESEL', amount: '', vehicle: '', driver: '', authorized_by: user?.full_name || user?.username || '', purpose: '', odometer: '', flowmeter: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Issuance</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <span className="material-icons">local_gas_station</span> New Issuance
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Fuel Type</th><th>Vehicle/Equipment</th><th>Amount (L)</th><th>Driver</th><th>Authorized By</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7">Loading...</td></tr> : issuances.length === 0 ? <tr><td colSpan="7">No records</td></tr> : issuances.map(i => (
              <tr key={i.id}><td>{i.date}</td><td>{i.time || '-'}</td><td>{i.fuel_type}</td><td>{i.vehicle || '-'}</td><td>{i.amount}</td><td>{i.driver || '-'}</td><td>{i.authorized_by || '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Log Fuel <span>Issuance</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>DATE</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div className="form-group"><label>TIME</label><input type="time" className="form-control" value={form.time} onChange={e => setForm({...form, time: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>FUEL TYPE</label><select className="form-control" value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}><option>DIESEL</option><option>PETROL</option></select></div>
                <div className="form-group"><label>AMOUNT (Litres) *</label><input type="number" step="0.1" className="form-control" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>EQUIPMENT TYPE</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {['vehicle','generator','earthmover'].map(t => (
                    <button type="button" key={t} className={`btn btn-sm ${equipType === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEquipType(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>{equipType === 'vehicle' ? 'VEHICLE' : equipType === 'generator' ? 'GENERATOR' : 'HEAVY EQUIPMENT'}</label>
                <select className="form-control" required value={form.vehicle} onChange={e => setForm({...form, vehicle: e.target.value})}>
                  <option value="">Select</option>
                  {equipType === 'vehicle' && vehicles.map(v => <option key={v.reg} value={v.reg}>{v.reg} - {v.description}</option>)}
                  {equipType === 'generator' && generators.map(g => <option key={g.gen_code} value={g.gen_code}>{g.gen_code} - {g.gen_name}</option>)}
                  {equipType === 'earthmover' && earthmovers.map(e => <option key={e.reg} value={e.reg}>{e.reg} - {e.description}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>DRIVER / OPERATOR</label><input className="form-control" value={form.driver} onChange={e => setForm({...form, driver: e.target.value})} /></div>
                <div className="form-group"><label>AUTHORIZED BY</label><input className="form-control" value={form.authorized_by} onChange={e => setForm({...form, authorized_by: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>ODOMETER (km)</label><input type="number" step="0.1" className="form-control" value={form.odometer} onChange={e => setForm({...form, odometer: e.target.value})} /></div>
                <div className="form-group"><label>FLOWMETER (L)</label><input type="number" step="0.1" className="form-control" value={form.flowmeter} onChange={e => setForm({...form, flowmeter: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>PURPOSE / NOTES</label><textarea className="form-control" rows="2" value={form.purpose} onChange={e => setForm({...form, purpose: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Log Issuance</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
