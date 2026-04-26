import { useState } from 'react'
import { useProcurement } from '../../hooks/useProcurement'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function GoodsReceived() {
  const { goodsReceived, purchaseOrders, createGoodsReceived, loading, fetchAll } = useProcurement()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [form, setForm] = useState({
    po_id: '',
    po_number: '',
    date: new Date().toISOString().split('T')[0],
    vehicle: '',
    driver: '',
    supplier_name: '',
    received_by_name: user?.full_name || user?.username,
    items: [],
    notes: ''
  })

  const fetchPOItems = async (poId) => {
    const po = purchaseOrders.find(p => p.id === poId)
    if (po) {
      const poItems = typeof po.items === 'string' ? JSON.parse(po.items) : po.items
      setForm({
        ...form,
        po_id: poId,
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        items: poItems.map(it => ({
          name: it.name,
          category: it.category,
          unit: it.unit || 'pcs',
          ordered: it.ordered_qty,
          received: 0,
          unit_cost: it.unit_cost || 0,
          total: 0,
          lot_batch: '',
          expiry_date: '',
          storage_location: '',
          quality_pass: true,
          serial_numbers: []
        }))
      })
    }
  }

  const updateItem = (idx, field, val) => {
    const newItems = [...form.items]
    newItems[idx][field] = val
    if (field === 'received' || field === 'unit_cost') {
      newItems[idx].total = (newItems[idx].received || 0) * (newItems[idx].unit_cost || 0)
    }
    setForm({...form, items: newItems})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.po_id) return toast.error('Select a purchase order')
    if (form.items.some(it => it.received < 0)) return toast.error('Received quantities cannot be negative')
    try {
      await createGoodsReceived({
        po_id: form.po_id,
        po_number: form.po_number,
        date: form.date,
        vehicle: form.vehicle,
        driver: form.driver,
        supplier_name: form.supplier_name,
        received_by_id: user?.id,
        received_by_name: form.received_by_name,
        items: form.items,
        notes: form.notes
      })
      toast.success('Goods received recorded, stock updated')
      setModalOpen(false)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Goods Received Notes</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ New GRN</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>GRN #</th><th>Date</th><th>PO #</th><th>Supplier</th><th>Items</th><th>Received By</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6">Loading...</td></tr> : goodsReceived.length === 0 ? <tr><td colSpan="6">No GRNs</td></tr> : goodsReceived.map(gr => (
              <tr key={gr.id}>
                <td>{gr.grn_number}</td>
                <td>{gr.date}</td>
                <td>{gr.po_number || '-'}</td>
                <td>{gr.supplier_name}</td>
                <td>{(typeof gr.items === 'string' ? JSON.parse(gr.items) : gr.items).length}</td>
                <td>{gr.received_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Goods Received <span>Note</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Purchase Order</label>
                  <select className="form-control" value={form.po_id} onChange={e => fetchPOItems(e.target.value)}>
                    <option value="">Select PO</option>
                    {purchaseOrders.filter(po => po.status !== 'completed').map(po => <option key={po.id} value={po.id}>{po.po_number} - {po.supplier_name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input type="date" className="form-control" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Vehicle</label><input className="form-control" value={form.vehicle} onChange={e => setForm({...form, vehicle: e.target.value})} /></div>
                <div className="form-group"><label>Driver</label><input className="form-control" value={form.driver} onChange={e => setForm({...form, driver: e.target.value})} /></div>
              </div>
              <div className="section-label">Received Items</div>
              <div className="table-wrap">
                <table style={{ fontSize: 11 }}>
                  <thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Unit</th><th>Unit Cost</th><th>Total</th><th>Lot/Batch</th><th>Expiry</th><th>Location</th><th>Quality</th></tr></thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <tr key={idx}>
                        <td>{it.name}</td>
                        <td>{it.ordered}</td>
                        <td><input type="number" className="form-control" style={{ width: 70 }} value={it.received} onChange={e => updateItem(idx, 'received', parseInt(e.target.value) || 0)} /></td>
                        <td>{it.unit}</td>
                        <td><input type="number" step="0.01" className="form-control" style={{ width: 80 }} value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} /></td>
                        <td>${it.total.toFixed(2)}</td>
                        <td><input className="form-control" style={{ width: 100 }} placeholder="Batch" value={it.lot_batch} onChange={e => updateItem(idx, 'lot_batch', e.target.value)} /></td>
                        <td><input type="date" className="form-control" style={{ width: 110 }} value={it.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)} /></td>
                        <td><input className="form-control" style={{ width: 100 }} placeholder="Rack/Shelf" value={it.storage_location} onChange={e => updateItem(idx, 'storage_location', e.target.value)} /></td>
                        <td><input type="checkbox" checked={it.quality_pass} onChange={e => updateItem(idx, 'quality_pass', e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save GRN</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
