// src/pages/Logistics/LogisticsDeliveries.jsx
// Site deliveries with loaded-vs-received variance tracking

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
  const { user } = useAuth()
  const canEdit = useCanEdit('logistics', 'deliveries')

  const [showModal,  setShowModal]  = useState(false)
  const [viewRecord, setViewRecord] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [form, setForm] = useState({
    date: today, supplier: '', driver: '', truck_reg: '', delivery_note: '',
    status: 'received', received_by: user?.full_name || user?.username || '',
    variance_notes: '', notes: '',
    items: [{ name: '', category: 'General', unit: 'pcs', loaded: 0, received: 0, unit_cost: 0 }],
  })

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
      await addDelivery({ ...form, items: validItems }, user?.full_name || user?.username)
      toast.success(`Delivery recorded — ${validItems.length} item(s) stocked in`)
      setShowModal(false)
      setForm({ date: today, supplier: '', driver: '', truck_reg: '', delivery_note: '', status: 'received', received_by: user?.full_name || user?.username || '', variance_notes: '', notes: '', items: [{ name: '', category: 'General', unit: 'pcs', loaded: 0, received: 0, unit_cost: 0 }] })
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(deliveries.map(d => ({ Date: d.date, Supplier: d.supplier, Driver: d.driver, Truck: d.truck_reg, DN: d.delivery_note, Loaded: d.total_loaded, Received: d.total_received, Variance: d.variance, Status: d.status, ReceivedBy: d.received_by })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Deliveries')
    XLSX.writeFile(wb, `LogisticsDeliveries_${today}.xlsx`); toast.success('Exported')
  }

  // KPIs
  const totalDeliveries  = deliveries.length
  const withVariance     = deliveries.filter(d => Math.abs(d.total_received - d.total_loaded) > 0).length
  const totalShortage    = deliveries.reduce((s, d) => s + Math.min(0, d.variance || 0), 0)

  const statusColor = (s) => ({ received: 'badge-green', partial: 'badge-yellow', rejected: 'badge-red' }[s] || 'badge-gold')

  const parseItems = (raw) => typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Site Deliveries</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}><span className="material-icons">table_chart</span> Export</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <span className="material-icons">local_shipping</span> Record Delivery
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Deliveries</div><div className="kpi-val">{totalDeliveries}</div></div>
        <div className="kpi-card">
          <div className="kpi-label">With Variance</div>
          <div className="kpi-val" style={{ color: withVariance > 0 ? 'var(--yellow)' : 'var(--green)' }}>{withVariance}</div>
          <div className="kpi-sub">{totalDeliveries > 0 ? ((withVariance / totalDeliveries) * 100).toFixed(0) : 0}% of deliveries</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Shortage</div>
          <div className="kpi-val" style={{ color: totalShortage < 0 ? 'var(--red)' : 'var(--green)' }}>{Math.abs(totalShortage).toLocaleString()}</div>
          <div className="kpi-sub">units short-delivered</div>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr><th>Date</th><th>Supplier</th><th>Driver / Truck</th><th>DN #</th><th>Loaded</th><th>Received</th><th>Variance</th><th>Status</th><th>Received By</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
            : deliveries.length === 0 ? <tr><td colSpan="9" className="empty-state">No deliveries recorded</td></tr>
            : deliveries.map(d => {
              const v = d.total_received - d.total_loaded
              return (
                <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setViewRecord(d)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.date}</td>
                  <td style={{ fontWeight: 600 }}>{d.supplier || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.driver || '—'}{d.truck_reg ? ` / ${d.truck_reg}` : ''}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{d.delivery_note || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{d.total_loaded || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{d.total_received}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                    {v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`}
                  </td>
                  <td><span className={`badge ${statusColor(d.status)}`}>{d.status}</span></td>
                  <td style={{ fontSize: 12 }}>{d.received_by || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                <div className="form-group"><label>Supplier</label><input className="form-control" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
                <div className="form-group"><label>Driver</label><input className="form-control" value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} /></div>
                <div className="form-group"><label>Truck Reg</label><input className="form-control" value={form.truck_reg} onChange={e => setForm({ ...form, truck_reg: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Delivery Note #</label><input className="form-control" placeholder="e.g. DN-2024-001" value={form.delivery_note} onChange={e => setForm({ ...form, delivery_note: e.target.value })} /></div>
                <div className="form-group"><label>Received By</label><input className="form-control" value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} /></div>
              </div>

              <div style={{ margin: '14px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-dim)' }}>ITEMS — LOADED vs RECEIVED</span>
                {hasVariance && (
                  <span style={{ fontSize: 11, color: variance < 0 ? 'var(--red)' : 'var(--green)' }}>
                    Total variance: {variance > 0 ? '+' : ''}{variance} units
                  </span>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 0.8fr 0.8fr 0.8fr auto', gap: 6, minWidth: 650, marginBottom: 6, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  <span>ITEM NAME</span><span>CATEGORY</span><span>UNIT</span><span>LOADED</span><span>RECEIVED</span><span>UNIT COST ($)</span><span></span>
                </div>
                {form.items.map((it, i) => {
                  const v = (it.received || 0) - (it.loaded || 0)
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 0.8fr 0.8fr 0.8fr auto', gap: 6, marginBottom: 6, minWidth: 650, alignItems: 'center' }}>
                      <input className="form-control" placeholder="Item name" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} />
                      <select className="form-control" value={it.category} onChange={e => setItem(i, 'category', e.target.value)}>
                        {CATS.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <input className="form-control" value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} />
                      <input type="number" className="form-control" min="0" value={it.loaded} onChange={e => setItem(i, 'loaded', parseFloat(e.target.value) || 0)} />
                      <input type="number" className="form-control" min="0" value={it.received}
                        onChange={e => setItem(i, 'received', parseFloat(e.target.value) || 0)}
                        style={{ border: it.loaded > 0 && it.received < it.loaded ? '1.5px solid var(--yellow)' : '' }} />
                      <input type="number" className="form-control" min="0" step="0.01" value={it.unit_cost} onChange={e => setItem(i, 'unit_cost', parseFloat(e.target.value) || 0)} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {it.loaded > 0 && it.received !== it.loaded && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: v < 0 ? 'var(--red)' : 'var(--green)' }}>
                            {v > 0 ? '+' : ''}{v}
                          </span>
                        )}
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginBottom: 12 }}>
                <span className="material-icons">add</span> Add Item
              </button>

              {hasVariance && (
                <div className="form-group">
                  <label>Variance Notes *</label>
                  <textarea className="form-control" rows="2" placeholder="Explain any differences between loaded and received quantities" value={form.variance_notes} onChange={e => setForm({ ...form, variance_notes: e.target.value })} />
                </div>
              )}
              <div className="form-group"><label>General Notes</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
                <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>inventory</span>
                Saving will automatically stock in all received items to logistics stock.
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <span className="material-icons">local_shipping</span>
                  {saving ? 'Saving…' : 'Save Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View delivery */}
      {viewRecord && (
        <div className="overlay" onClick={() => setViewRecord(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delivery — <span>{viewRecord.date}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Supplier:</span> <strong>{viewRecord.supplier || '—'}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Status:</span> <span className={`badge ${statusColor(viewRecord.status)}`}>{viewRecord.status}</span></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Driver:</span> {viewRecord.driver || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Truck:</span> {viewRecord.truck_reg || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Delivery Note:</span> {viewRecord.delivery_note || '—'}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>Received By:</span> {viewRecord.received_by || '—'}</div>
              {viewRecord.variance_notes && <div style={{ gridColumn: 'span 2', color: 'var(--yellow)', fontSize: 12 }}>Variance note: {viewRecord.variance_notes}</div>}
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Loaded</th><th>Received</th><th>Variance</th><th>Unit Cost</th></tr></thead>
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
                        <td style={{ fontFamily: 'var(--mono)', color: v < 0 ? 'var(--red)' : v > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                          {v === 0 ? '—' : `${v > 0 ? '+' : ''}${v}`}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)' }}>${(it.unit_cost || 0).toFixed(2)}</td>
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
    </div>
  )
}
