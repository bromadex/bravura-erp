import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function FuelDeliveries() {
  const { deliveries, addDelivery, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'deliveries')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    fuel_type: 'DIESEL',
    qty: '',
    supplier: '',
    dip_before: '',
    dip_after: '',
    notes: '',
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.qty || parseFloat(form.qty) <= 0) return toast.error('Enter a valid quantity')
    try {
      await addDelivery({ ...form, qty: parseFloat(form.qty), user_name: user?.full_name || user?.username })
      toast.success(`Delivery of ${form.qty} L recorded`)
      setShowModal(false)
      setForm({ date: new Date().toISOString().split('T')[0], fuel_type: 'DIESEL', qty: '', supplier: '', dip_before: '', dip_after: '', notes: '' })
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Deliveries</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <span className="material-icons">local_shipping</span> Add Delivery
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table className="stock-table">
          <thead><tr><th>Date</th><th>Fuel Type</th><th>Quantity (L)</th><th>Supplier</th><th>Dip Before (cm)</th><th>Dip After (cm)</th><th>Notes</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7">Loading...</td></tr> : deliveries.length === 0 ? <tr><td colSpan="7">No deliveries</td></tr> : deliveries.map(d => (
              <tr key={d.id}>
                <td>{d.date}</td><td>{d.fuel_type}</td><td>{d.qty}</td>
                <td>{d.supplier || '-'}</td><td>{d.dip_before || '-'}</td>
                <td>{d.dip_after || '-'}</td><td>{d.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Record <span>Fuel Delivery</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>DATE</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div className="form-group"><label>FUEL TYPE</label><select className="form-control" value={form.fuel_type} onChange={e => setForm({...form, fuel_type: e.target.value})}><option>DIESEL</option><option>PETROL</option></select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>QUANTITY (Litres) *</label><input type="number" step="0.1" className="form-control" required value={form.qty} onChange={e => setForm({...form, qty: e.target.value})} /></div>
                <div className="form-group"><label>SUPPLIER</label><input className="form-control" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>DIPSTICK BEFORE (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_before} onChange={e => setForm({...form, dip_before: e.target.value})} /></div>
                <div className="form-group"><label>DIPSTICK AFTER (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_after} onChange={e => setForm({...form, dip_after: e.target.value})} /></div>
              </div>
              <div className="form-group"><label>NOTES</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Delivery</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
