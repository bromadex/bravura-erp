import { useState } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function GoodsReceived() {
  const { goodsReceived, purchaseOrders, createGoodsReceived, loading } = useProcurement()
  const { user } = useAuth()
  const canEdit = useCanEdit('procurement', 'goods-received')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewGRN, setViewGRN] = useState(null)

  const emptyForm = () => ({
    date: new Date().toISOString().split('T')[0],
    po_id: '',
    supplier_name: '',
    driver: '',
    vehicle: '',
    received_by: user?.full_name || user?.username || '',
    items: [{ name: '', category: '', unit: 'pcs', ordered: 0, received: 0, unit_cost: 0, lot_batch: '', notes: '' }],
    notes: '',
  })
  const [form, setForm] = useState(emptyForm)

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: '', unit: 'pcs', ordered: 0, received: 0, unit_cost: 0, lot_batch: '', notes: '' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setItem = (i, field, val) => setForm(f => {
    const items = [...f.items]; items[i] = { ...items[i], [field]: val }; return { ...f, items }
  })

  const totalValue = form.items.reduce((s, it) => s + (it.received * it.unit_cost), 0)

  const handlePOSelect = (poId) => {
    const po = purchaseOrders.find(p => p.id === poId)
    if (!po) { setForm(f => ({ ...f, po_id: '' })); return }
    const poItems = typeof po.items === 'string' ? JSON.parse(po.items || '[]') : (po.items || [])
    setForm(f => ({
      ...f, po_id: poId,
      supplier_name: po.supplier_name || '',
      items: poItems.map(it => ({
        name: it.name || '',
        category: it.category || '',
        unit: it.unit || 'pcs',
        ordered: it.ordered_qty || 0,
        received: it.ordered_qty || 0,
        unit_cost: it.unit_cost || 0,
        lot_batch: '',
        notes: '',
      })),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date) return toast.error('Enter a date')
    if (form.items.some(it => !it.name)) return toast.error('All items need a name')
    if (form.items.every(it => it.received <= 0)) return toast.error('At least one item must have received qty > 0')
    try {
      await createGoodsReceived({
        ...form,
        items: form.items.filter(it => it.name && it.received > 0),
        total_value: totalValue,
        created_by: user?.full_name || user?.username,
      })
      toast.success(`GRN saved — ${form.items.filter(it => it.received > 0).length} items stocked in`)
      setForm(emptyForm())
      setModalOpen(false)
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Goods Received</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setModalOpen(true) }}>
            <span className="material-icons">add</span> New GRN
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>GRN #</th><th>Date</th><th>Supplier</th><th>Driver / Vehicle</th>
              <th>Received By</th><th>Items</th><th>Total Value</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>Loading...<\/td><\/tr>
            ) : goodsReceived.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>No GRNs yet<\/td><\/tr>
            ) : (
              goodsReceived.map(grn => {
                const items = typeof grn.items === 'string' ? JSON.parse(grn.items || '[]') : (grn.items || [])
                const total = items.reduce((s, it) => s + ((it.received || 0) * (it.unit_cost || 0)), 0)
                return (
                  <tr key={grn.id} style={{ cursor: 'pointer' }} onClick={() => setViewGRN(grn)}>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{grn.grn_number}<\/td>
                    <td>{grn.date}<\/td>
                    <td style={{ fontWeight: 600 }}>{grn.supplier_name || '—'}<\/td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{grn.driver || '—'} {grn.vehicle ? `/ ${grn.vehicle}` : ''}<\/td>
                    <td>{grn.received_by || '—'}<\/td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{items.length}<\/td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${total.toFixed(2)}<\/td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{grn.notes || '—'}<\/td>
                  <\/tr>
                )
              })
            )}
          <\/tbody>
        <\/table>
      <\/div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>move_to_inbox</span>
              New Goods Received <span>Note</span>
            <\/div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>DATE *<\/label><input type="date" className="form-control" required value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} /><\/div>
                <div className="form-group"><label>LINK TO PURCHASE ORDER<\/label>
                  <select className="form-control" value={form.po_id} onChange={e => handlePOSelect(e.target.value)}>
                    <option value="">— None (direct delivery) —<\/option>
                    {purchaseOrders.filter(po => po.status !== 'completed').map(po => (
                      <option key={po.id} value={po.id}>{po.po_number} — {po.supplier_name}<\/option>
                    ))}
                  <\/select>
                <\/div>
              <\/div>
              <div className="form-row">
                <div className="form-group"><label>SUPPLIER<\/label><input className="form-control" value={form.supplier_name} onChange={e => setForm(f => ({...f, supplier_name: e.target.value}))} /><\/div>
                <div className="form-group"><label>DRIVER / VEHICLE<\/label><input className="form-control" placeholder="Driver name / vehicle reg" value={form.driver} onChange={e => setForm(f => ({...f, driver: e.target.value}))} /><\/div>
              <\/div>
              <div className="form-group"><label>RECEIVED BY<\/label><input className="form-control" value={form.received_by} onChange={e => setForm(f => ({...f, received_by: e.target.value}))} /><\/div>

              <div style={{ margin: '16px 0 8px', fontWeight: 700, fontSize: 12, color: 'var(--text-dim)' }}>ITEMS RECEIVED<\/div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.8fr 0.8fr 0.9fr 1fr auto', gap: 6, minWidth: 700, marginBottom: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  <span>ITEM NAME<\/span><span>CATEGORY<\/span><span>UNIT<\/span><span>ORDERED<\/span><span>RECEIVED<\/span><span>UNIT COST<\/span><span>LOT/BATCH<\/span><span><\/span>
                <\/div>
                {form.items.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.7fr 0.8fr 0.8fr 0.9fr 1fr auto', gap: 6, marginBottom: 6, minWidth: 700 }}>
                    <input className="form-control" placeholder="Item name" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} />
                    <input className="form-control" placeholder="Category" value={it.category} onChange={e => setItem(i, 'category', e.target.value)} />
                    <input className="form-control" placeholder="pcs" value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} />
                    <input type="number" className="form-control" min="0" value={it.ordered} onChange={e => setItem(i, 'ordered', parseInt(e.target.value) || 0)} />
                    <input type="number" className="form-control" min="0" value={it.received} onChange={e => setItem(i, 'received', parseInt(e.target.value) || 0)} style={{ border: it.received > it.ordered && it.ordered > 0 ? '1px solid var(--yellow)' : '' }} />
                    <input type="number" className="form-control" min="0" step="0.01" placeholder="0.00" value={it.unit_cost} onChange={e => setItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} />
                    <input className="form-control" placeholder="Lot/Batch#" value={it.lot_batch} onChange={e => setItem(i, 'lot_batch', e.target.value)} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}><span className="material-icons">close<\/span><\/button>
                  <\/div>
                ))}
              <\/div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
                  <span className="material-icons">add<\/span> Add Item
                <\/button>
                <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--teal)' }}>
                  Total Value: <strong>${totalValue.toFixed(2)}<\/strong>
                <\/div>
              <\/div>

              <div className="form-group"><label>NOTES<\/label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} /><\/div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel<\/button>
                <button type="submit" className="btn btn-primary">
                  <span className="material-icons">save<\/span> Save GRN & Update Stock
                <\/button>
              <\/div>
            <\/form>
          <\/div>
        <\/div>
      )}

      {viewGRN && (
        <div className="overlay" onClick={() => setViewGRN(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8 }}>receipt<\/span>
              {viewGRN.grn_number}
            <\/div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Date:<\/span> <strong>{viewGRN.date}<\/strong><\/div>
              <div><span style={{ color: 'var(--text-dim)' }}>Supplier:<\/span> <strong>{viewGRN.supplier_name || '—'}<\/strong><\/div>
              <div><span style={{ color: 'var(--text-dim)' }}>Driver:<\/span> {viewGRN.driver || '—'}<\/div>
              <div><span style={{ color: 'var(--text-dim)' }}>Received By:<\/span> {viewGRN.received_by || '—'}<\/div>
              {viewGRN.notes && <div style={{ gridColumn: 'span 2', color: 'var(--text-dim)', fontSize: 12 }}>{viewGRN.notes}<\/div>}
            <\/div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item<\/th><th>Category<\/th><th>Unit<\/th><th>Ordered<\/th><th>Received<\/th><th>Unit Cost<\/th><th>Total<\/th><th>Lot/Batch<\/th></tr></thead>
                <tbody>
                  {(typeof viewGRN.items === 'string' ? JSON.parse(viewGRN.items || '[]') : (viewGRN.items || [])).map((it, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{it.name}<\/td>
                      <td>{it.category}<\/td>
                      <td>{it.unit || 'pcs'}<\/td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{it.ordered || '—'}<\/td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>{it.received}<\/td>
                      <td style={{ fontFamily: 'var(--mono)' }}>${(it.unit_cost || 0).toFixed(2)}<\/td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>${((it.received || 0) * (it.unit_cost || 0)).toFixed(2)}<\/td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{it.lot_batch || '—'}<\/td>
                    <\/tr>
                  ))}
                <\/tbody>
              </table>
            <\/div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setViewGRN(null)}>Close<\/button><\/div>
          <\/div>
        <\/div>
      )}
    <\/div>
  )
}
