import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function FuelDeliveries() {
  const { tanks, deliveries, addDelivery, getLitresFromCm, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    tank_id: '',
    date: new Date().toISOString().split('T')[0],
    fuel_type: 'DIESEL',
    quantity: '',
    unit_cost: '',
    supplier: '',
    dip_before_cm: '',
    dip_after_cm: '',
    notes: '',
  })
  const [calcLitres, setCalcLitres] = useState(null)

  const handleDipChange = () => {
    const tankId = form.tank_id
    const beforeCm = parseFloat(form.dip_before_cm)
    const afterCm = parseFloat(form.dip_after_cm)
    if (!tankId || isNaN(beforeCm) || isNaN(afterCm)) {
      setCalcLitres(null)
      return
    }
    const beforeL = getLitresFromCm(tankId, beforeCm)
    const afterL = getLitresFromCm(tankId, afterCm)
    const diff = afterL - beforeL
    setCalcLitres({ beforeL, afterL, diff })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.tank_id) return toast.error('Select tank')
    if (!form.quantity || parseFloat(form.quantity) <= 0) return toast.error('Enter valid quantity')
    try {
      await addDelivery({
        tank_id: form.tank_id,
        date: form.date,
        fuel_type: form.fuel_type,
        quantity: parseFloat(form.quantity),
        unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
        supplier: form.supplier,
        dip_before_cm: form.dip_before_cm ? parseFloat(form.dip_before_cm) : null,
        dip_after_cm: form.dip_after_cm ? parseFloat(form.dip_after_cm) : null,
        litres_before: calcLitres?.beforeL,
        litres_after: calcLitres?.afterL,
        notes: form.notes,
        created_by: user?.full_name || user?.username,
      })
      toast.success(`Delivery of ${form.quantity} L recorded`)
      setModalOpen(false)
      setForm({ tank_id: '', date: new Date().toISOString().split('T')[0], fuel_type: 'DIESEL', quantity: '', unit_cost: '', supplier: '', dip_before_cm: '', dip_after_cm: '', notes: '' })
      setCalcLitres(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Deliveries</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <span className="material-icons">local_shipping</span> Add Delivery
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Tank</th><th>Type</th><th>Quantity (L)</th><th>Unit Cost</th><th>Total Value</th>
              <th>Supplier</th><th>Dip Before (L)</th><th>Dip After (L)</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="10">Loading...</td></tr>
            ) : deliveries.length === 0 ? (
              <tr><td colSpan="10">No deliveries</td></tr>
            ) : (
              deliveries.map(d => {
                const tank = tanks.find(t => t.id === d.tank_id)
                const total = d.quantity * (d.unit_cost || 0)
                return (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>{tank?.name || '-'}</td>
                    <td><span className="badge bg-blue">{d.fuel_type}</span></td>
                    <td style={{ color: 'var(--teal)' }}>{d.quantity.toLocaleString()}</td>
                    <td>${(d.unit_cost || 0).toFixed(2)}</td>
                    <td>${total.toFixed(2)}</td>
                    <td>{d.supplier || '-'}</td>
                    <td>{d.litres_before?.toFixed(0) || '-'}</td>
                    <td>{d.litres_after?.toFixed(0) || '-'}</td>
                    <td>{d.notes || '-'}</td>
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
            <div className="modal-title">Record <span>Fuel Delivery</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>TANK</label><select className="form-control" required value={form.tank_id} onChange={e => setForm({...form, tank_id: e.target.value})}><option value="">Select</option>{tanks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                <div className="form-group"><label>DATE</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>FUEL TYPE</label><select className="form-control" value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}><option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option></select></div>
                <div className="form-group"><label>QUANTITY (Litres) *</label><input type="number" step="0.1" className="form-control" required value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>UNIT COST (USD)</label><input type="number" step="0.01" className="form-control" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})} placeholder="Optional"/></div>
                <div className="form-group"><label>SUPPLIER</label><input className="form-control" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} placeholder="Supplier name"/></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>DIPSTICK BEFORE (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_before_cm} onChange={e => setForm({...form, dip_before_cm: e.target.value})} onBlur={handleDipChange} /></div>
                <div className="form-group"><label>DIPSTICK AFTER (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_after_cm} onChange={e => setForm({...form, dip_after_cm: e.target.value})} onBlur={handleDipChange} /></div>
              </div>
              {calcLitres && (
                <div style={{ background: 'var(--surface2)', padding: 8, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                  Before: <strong>{calcLitres.beforeL.toFixed(0)} L</strong> | After: <strong>{calcLitres.afterL.toFixed(0)} L</strong> | Dip Difference: <strong style={{ color: 'var(--gold)' }}>{calcLitres.diff.toFixed(0)} L</strong>
                </div>
              )}
              <div className="form-group"><label>NOTES</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Delivery</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
