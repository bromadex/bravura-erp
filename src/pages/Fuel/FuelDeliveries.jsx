// src/pages/Fuel/FuelDeliveries.jsx
// Modern redesign: KPIs, search, filter, edit/delete, Excel export

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const today = new Date().toISOString().split('T')[0]

export default function FuelDeliveries() {
  const { deliveries, addDelivery, loading, fetchAll } = useFuel()
  const { user }    = useAuth()
  const canEdit     = useCanEdit('fuel', 'deliveries')
  const canDelete   = useCanDelete('fuel', 'deliveries')

  const [showModal,  setShowModal]  = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const BLANK = { date: today, fuel_type: 'DIESEL', qty: '', supplier: '', dip_before: '', dip_after: '', delivery_note: '', notes: '' }
  const [form, setForm] = useState(BLANK)

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({ date: r.date, fuel_type: r.fuel_type || 'DIESEL', qty: r.qty, supplier: r.supplier || '', dip_before: r.dip_before || '', dip_after: r.dip_after || '', delivery_note: r.delivery_note || '', notes: r.notes || '' })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.qty || parseFloat(form.qty) <= 0) return toast.error('Enter a valid quantity')
    const payload = { ...form, qty: parseFloat(form.qty), user_name: user?.full_name || user?.username }
    try {
      if (editRecord) {
        const { error } = await supabase.from('fuel_deliveries').update(payload).eq('id', editRecord.id)
        if (error) throw error
        toast.success('Delivery updated')
      } else {
        await addDelivery(payload)
        toast.success(`Delivery of ${form.qty} L recorded`)
      }
      await fetchAll()
      setShowModal(false); setEditRecord(null); setForm(BLANK)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this delivery record?')) return
    const { error } = await supabase.from('fuel_deliveries').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted'); await fetchAll()
  }

  const filtered = deliveries.filter(r => {
    if (dateFrom && r.date < dateFrom) return false
    if (dateTo   && r.date > dateTo)   return false
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      if (!(r.supplier?.toLowerCase().includes(t) || r.notes?.toLowerCase().includes(t) || r.delivery_note?.toLowerCase().includes(t))) return false
    }
    return true
  })

  const totalDelivered   = deliveries.reduce((s, r) => s + (r.qty || 0), 0)
  const deliveredThisMonth = deliveries.filter(r => r.date?.startsWith(today.slice(0, 7))).reduce((s, r) => s + (r.qty || 0), 0)
  const uniqueSuppliers  = new Set(deliveries.map(r => r.supplier).filter(Boolean)).size

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ Date: r.date, Type: r.fuel_type, Qty: r.qty, Supplier: r.supplier, DipBefore: r.dip_before, DipAfter: r.dip_after, DeliveryNote: r.delivery_note, Notes: r.notes })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Deliveries')
    XLSX.writeFile(wb, `FuelDeliveries_${today}.xlsx`)
    toast.success('Exported')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Deliveries</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportXLSX}>
            <span className="material-icons">table_chart</span> Export
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={openNew}>
              <span className="material-icons">local_shipping</span> Add Delivery
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Delivered</div>
          <div className="kpi-val" style={{ color: 'var(--green)' }}>{totalDelivered.toLocaleString()}</div>
          <div className="kpi-sub">all time (L)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">This Month</div>
          <div className="kpi-val">{deliveredThisMonth.toLocaleString()}</div>
          <div className="kpi-sub">litres received</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Deliveries</div>
          <div className="kpi-val">{deliveries.length}</div>
          <div className="kpi-sub">total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Suppliers</div>
          <div className="kpi-val" style={{ color: 'var(--teal)' }}>{uniqueSuppliers}</div>
          <div className="kpi-sub">unique</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Supplier, notes…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setDateFrom(''); setDateTo('') }}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Delivery Records</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Date</th><th>Fuel Type</th><th>Quantity (L)</th><th>Supplier</th>
                <th>Dip Before (cm)</th><th>Dip After (cm)</th><th>Delivery Note</th><th>Notes</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9" className="empty-state">No deliveries found</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td><span className={`badge ${r.fuel_type === 'DIESEL' ? 'badge-yellow' : 'badge-green'}`}>{r.fuel_type}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{(r.qty || 0).toLocaleString()} L</td>
                  <td style={{ fontWeight: 600 }}>{r.supplier || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.dip_before || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{r.dip_after  || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.delivery_note || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.notes || '—'}</td>
                  {(canEdit || canDelete) && (
                    <td style={{ display: 'flex', gap: 4 }}>
                      {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>}
                      {canDelete && <button className="btn btn-danger btn-sm"    onClick={() => handleDelete(r.id)}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="overlay" onClick={() => { setShowModal(false); setEditRecord(null) }}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editRecord ? 'Edit' : 'Record'} Fuel <span>Delivery</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input type="date" className="form-control" required value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Fuel Type</label>
                  <select className="form-control" value={form.fuel_type}
                    onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
                    <option>DIESEL</option><option>PETROL</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity (L) *</label>
                  <input type="number" step="0.1" min="1" className="form-control" required
                    value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Supplier</label>
                  <input className="form-control" value={form.supplier}
                    onChange={e => setForm({ ...form, supplier: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Dipstick Before (cm)</label>
                  <input type="number" step="0.01" className="form-control" value={form.dip_before}
                    onChange={e => setForm({ ...form, dip_before: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Dipstick After (cm)</label>
                  <input type="number" step="0.01" className="form-control" value={form.dip_after}
                    onChange={e => setForm({ ...form, dip_after: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Delivery Note / Invoice #</label>
                <input className="form-control" placeholder="e.g. DN-2024-001"
                  value={form.delivery_note} onChange={e => setForm({ ...form, delivery_note: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" rows="2" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditRecord(null) }}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <span className="material-icons">local_shipping</span>
                  {editRecord ? 'Save Changes' : 'Save Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
