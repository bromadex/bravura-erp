// src/pages/Logistics/LogisticsDeliveries.jsx
import { useState } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]
const CATS  = ['Food', 'PPE', 'Consumables', 'Batch Plant', 'General']

export default function LogisticsDeliveries() {
  const { deliveries, addDelivery, loading } = useLogistics()
  const { user }  = useAuth()
  const canEdit   = useCanEdit('logistics', 'deliveries')

  const [showModal,  setShowModal]  = useState(false)
  const [viewRecord, setViewRecord] = useState(null)
  const [saving,     setSaving]     = useState(false)

  const emptyForm = () => ({
    date: today, supplier: '', driver: '', truck_reg: '', delivery_note: '',
    status: 'received', received_by: user?.full_name || user?.username || '',
    variance_notes: '', notes: '',
    items: [{ name: '', category: 'General', unit: 'pcs', loaded: 0, received: 0, unit_cost: 0 }],
  })
  const [form, setForm] = useState(emptyForm())

  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, { name: '', category: 'General', unit: 'pcs', loaded: 0, received: 0, unit_cost: 0 }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setItem    = (i, k, v) => setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [k]: v }; return { ...f, items } })

  const totalLoaded   = form.items.reduce((s, it) => s + (it.loaded   || 0), 0)
  const totalReceived = form.items.reduce((s, it) => s + (it.received || 0), 0)
  const variance      = totalReceived - totalLoaded
  const hasVariance   = form.items.some(it => Math.abs((it.received || 0) - (it.loaded || 0)) > 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validItems = form.items.filter(it => it.name && it.received > 0)
    if (validItems.length === 0) return toast.error('Add at least one item with received quantity')
    setSaving(true)
    try {
      await addDelivery({ ...form, items: validItems }, user?.full_name || '')
      toast.success(`Delivery recorded — ${validItems.length} item(s) stocked in`)
      setShowModal(false)
      setForm(emptyForm())
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(deliveries.map(d => ({ Date: d.date, Supplier: d.supplier, Driver: d.driver, Truck: d.truck_reg, DN: d.delivery_note, Loaded: d.total_loaded, Received: d.total_received, Variance: (d.total_received||0)-(d.total_loaded||0), Status: d.status })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Deliveries')
    XLSX.writeFile(wb, `LogisticsDeliveries_${today}.xlsx`); toast.success('Exported')
  }

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])
  const totalShortage = deliveries.reduce((s, d) => s + Math.min(0, (d.total_received || 0) - (d.total_loaded || 0)), 0)
  const withVariance  = deliveries.filter(d => Math.abs((d.total_received||0) - (d.total_loaded||0)) > 0).length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Site Deliveries</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowModal(true)}><span className="material-icons">local_shipping</span> Record Delivery</button>}
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Deliveries</div><div className="kpi-val">{deliveries.length}</div></div>
        <div className="kpi-card" style={{ borderLeft: withVariance > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">With Variance</div>
          <div className="kpi-val" style={{ color: withVariance > 0 ? 'var(--yellow)' : 'var(--green)' }}>{withVariance}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Shortage</div>
          <div className="kpi-val" style={{ color: totalShortage < 0 ? 'var(--red)' : 'var(--green)' }}>{Math.abs(totalShortage)}</div>
          <div className="kpi-sub">units</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead><tr><th>Date</th><th>Supplier</th><th>Driver / Truck</th><th>DN #</th><th>Loaded</th><th>Received</th><th>Variance</th><th>Status</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
            : deliveries.length === 0 ? <tr><td colSpan="8" className="empty-state">No deliveries recorded</td></tr>
            : deliveries.map(d => {
              const v = (d.total_received || 0) - (d.total_loaded || 0)
              return (
                <tr key={d.id} onClick={() => setViewRecord(d)} style={{ cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e  => e.currentTarget.style.background = ''}>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.date}</td>
                  <td style={{ fontWeight: 600 }}>{d.supplier || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.driver || '—'}{d.truck_reg ? ` / ${d.truck_reg}` : ''}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{d.delivery_note || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{d.total_loaded || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.total_received}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`}</td>
                  <td><span className={`badge ${d.status === 'received' ? 'badge-green' : d.status === 'partial' ? 'badge-yellow' : 'badge-red'}`}>{d.status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* View delivery */}
      {viewRecord && (
        <div className="overlay" onClick={() => setViewRecord(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delivery — <span>{viewRecord.date}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Supplier:</span> <strong>{viewRecord.supplier || '—'}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Driver:</span> {viewRecord.driver || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Truck:</span> {viewRecord.truck_reg || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>DN #:</span> {viewRecord.delivery_note || '—'}</div>
              {viewRecord.variance_notes && <div style={{ gridColumn: 'span 2', color: 'var(--yellow)', fontSize: 12 }}>Variance note: {viewRecord.variance_notes}</div>}
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Loaded</th><th>Received</th><th>Variance</th></tr></thead>
                <tbody>
                  {parseItems(viewRecord.items).map((it, i) => {
                    const v = (it.received || 0) - (it.loaded || 0)
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td>{it.category}</td>
                        <td>{it.unit}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{it.loaded || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{it.received}</td>
                        <td style={{ fontFamily: 'var(--mono)', color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setViewRecord(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* New delivery modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Record Site <span>Delivery</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>Date *</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="form-group"><label>Status</label><select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="received">Received</option><option value="partial">Partial</option><option value="rejected">Rejected</option></select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
                <div className="form-group"><label>Supplier</label><input className="form-control" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
                <div className="form-group"><label>Driver</label><input className="form-control" value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} /></div>
                <div className="form-group"><label>Truck Reg</label><input className="form-control" value={form.truck_reg} onChange={e => setForm({ ...form, truck_reg: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Delivery Note #</label><input className="form-control" value={form.delivery_note} onChange={e => setForm({ ...form, delivery_note: e.target.value })} /></div>
                <div className="form-group"><label>Received By</label><input className="form-control" value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} /></div>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, margin: '12px 0 8px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                <span>Items — Loaded vs Received</span>
                {hasVariance && <span style={{ color: variance < 0 ? 'var(--red)' : 'var(--green)' }}>Total variance: {variance > 0 ? '+' : ''}{variance}</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {form.items.map((it, i) => {
                  const v = (it.received || 0) - (it.loaded || 0)
                  return (
                    <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                      <div className="form-row" style={{ marginBottom: 8 }}>
                        <div className="form-group"><label>Item Name *</label><input className="form-control" placeholder="e.g. Cement 50kg bags" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} /></div>
                        <div className="form-group"><label>Category</label><select className="form-control" value={it.category} onChange={e => setItem(i, 'category', e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 0.8fr 0.8fr 0.8fr auto', gap: 8, alignItems: 'flex-end' }}>
                        <div className="form-group"><label>Unit</label><input className="form-control" value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} /></div>
                        <div className="form-group"><label>Loaded (supplier says)</label><input type="number" min="0" className="form-control" value={it.loaded} onChange={e => setItem(i, 'loaded', parseFloat(e.target.value) || 0)} /></div>
                        <div className="form-group"><label>Received (counted)</label><input type="number" min="0" className="form-control" value={it.received} onChange={e => setItem(i, 'received', parseFloat(e.target.value) || 0)} style={{ border: it.loaded > 0 && it.received < it.loaded ? '1.5px solid var(--yellow)' : '' }} /></div>
                        <div className="form-group"><label>Unit Cost ($)</label><input type="number" min="0" step="0.01" className="form-control" value={it.unit_cost} onChange={e => setItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} /></div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', paddingBottom: 2 }}>
                          {it.loaded > 0 && it.received !== it.loaded && <span style={{ fontSize: 11, fontWeight: 700, color: v < 0 ? 'var(--red)' : 'var(--green)' }}>{v > 0 ? '+' : ''}{v}</span>}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}><span className="material-icons" style={{ fontSize: 13 }}>close</span></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginBottom: 12 }}><span className="material-icons">add</span> Add Item</button>
              {hasVariance && <div className="form-group" style={{ marginBottom: 12 }}><label>Variance Notes *</label><textarea className="form-control" rows="2" placeholder="Explain the difference between loaded and received…" value={form.variance_notes} onChange={e => setForm({ ...form, variance_notes: e.target.value })} /></div>}
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
                <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>inventory</span>
                Received items will be automatically added to logistics stock.
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Delivery'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
