import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function PurchaseOrders() {
  const { purchaseOrders, suppliers, createPurchaseOrder, updatePurchaseOrderStatus, loading } = useProcurement()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPO, setEditingPO] = useState(null)
  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '',
    items: [{ name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0, total: 0, notes: '' }],
    notes: '',
  })

  const openCreate = () => {
    setEditingPO(null)
    setForm({
      supplier_id: '',
      supplier_name: '',
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: '',
      items: [{ name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0, total: 0, notes: '' }],
      notes: '',
    })
    setModalOpen(true)
  }

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', ordered_qty: 1, unit: 'pcs', unit_cost: 0, total: 0, notes: '' }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx, field, val) => {
    const newItems = [...form.items]
    newItems[idx][field] = val
    if (field === 'ordered_qty' || field === 'unit_cost') {
      newItems[idx].total = (newItems[idx].ordered_qty || 0) * (newItems[idx].unit_cost || 0)
    }
    setForm({ ...form, items: newItems })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (form.items.some(it => !it.name || !it.ordered_qty)) return toast.error('Every item needs a name and quantity')
    const supplier = suppliers.find(s => s.id === form.supplier_id)
    const totalAmount = form.items.reduce((sum, it) => sum + (it.total || 0), 0)
    try {
      await createPurchaseOrder({
        supplier_id: form.supplier_id,
        supplier_name: supplier?.name || '',
        order_date: form.order_date,
        delivery_date: form.delivery_date,
        items: form.items,
        total_amount: totalAmount,
        notes: form.notes,
        created_by_id: user?.id,
        created_by_name: user?.full_name || user?.username,
        status: 'draft',
      })
      toast.success('Purchase order created')
      setModalOpen(false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Purchase Orders</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <span className="material-icons">add</span> Create PO
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PO #</th><th>Supplier</th><th>Order Date</th><th>Delivery Date</th>
              <th>Items</th><th>Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : purchaseOrders.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>No purchase orders</td></tr>
            ) : (
              purchaseOrders.map(po => {
                const items = typeof po.items === 'string' ? JSON.parse(po.items || '[]') : (po.items || [])
                return (
                  <tr key={po.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{po.po_number}</td>
                    <td>{po.supplier_name}</td>
                    <td>{po.order_date}</td>
                    <td>{po.delivery_date || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{items.length}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${parseFloat(po.total_amount || 0).toFixed(2)}</td>
                    <td><span className={`badge ${po.status === 'completed' ? 'badge-green' : po.status === 'confirmed' ? 'badge-blue' : 'badge-yellow'}`}>{po.status}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => {/* receive goods – will open GRN modal */ alert('Receive goods – coming soon')}}>Receive</button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create PO Modal */}
      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create <span>Purchase Order</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Supplier *</label>
                  <select className="form-control" required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                    <option value="">Select a supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Order Date</label>
                  <input type="date" className="form-control" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Expected Delivery Date</label>
                <input type="date" className="form-control" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
              </div>

              <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 12, color: 'var(--text-dim)', letterSpacing: 1 }}>ITEMS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr 1fr auto', gap: 6, marginBottom: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                <span>ITEM NAME</span><span>CATEGORY</span><span>QTY</span><span>UNIT</span><span>UNIT COST</span><span>TOTAL</span><span></span>
              </div>
              {form.items.map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.7fr 0.8fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                  <input className="form-control" placeholder="Item name" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
                  <input className="form-control" placeholder="Category" value={it.category} onChange={e => updateItem(idx, 'category', e.target.value)} />
                  <input type="number" className="form-control" min="1" value={it.ordered_qty} onChange={e => updateItem(idx, 'ordered_qty', parseInt(e.target.value) || 1)} />
                  <input className="form-control" placeholder="pcs" value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} />
                  <input type="number" className="form-control" step="0.01" placeholder="0.00" value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} />
                  <span style={{ fontSize: 12, alignSelf: 'center', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${it.total.toFixed(2)}</span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}><span className="material-icons" style={{ fontSize: 14 }}>close</span></button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Item</button>

              <div className="form-group" style={{ marginTop: 16 }}><label>Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create PO</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
