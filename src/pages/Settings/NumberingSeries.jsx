// src/pages/Settings/NumberingSeries.jsx
// Manage document numbering series — prefix, padding, current counter, active state.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, ModalDialog, ModalActions } from '../../components/ui'

function preview(prefix, padding, val) {
  const next = (val || 0) + 1
  return `${prefix}${String(next).padStart(padding, '0')}`
}

const DOC_LABELS = {
  material_requests:     'Material Requests',
  purchase_requisitions: 'Purchase Requisitions',
  purchase_orders:       'Purchase Orders',
  goods_received:        'Goods Received Notes',
  purchase_invoices:     'Purchase Invoices',
  payment_vouchers:      'Payment Vouchers',
  store_requisitions:    'Store Requisitions',
  purchase_returns:      'Purchase Returns',
  stock_transfers:       'Stock Transfers',
  landed_cost_vouchers:  'Landed Cost Vouchers',
}

export default function NumberingSeries() {
  const [series,  setSeries]  = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState({})

  const fetchSeries = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('numbering_series').select('*').order('series_key')
    if (error) { toast.error('Failed to load series'); }
    else setSeries(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSeries() }, [fetchSeries])

  const openEdit = (s) => {
    setEditing(s)
    setForm({ prefix: s.prefix, padding: s.padding, current_val: s.current_val, is_active: s.is_active })
  }

  const handleSave = async () => {
    if (!form.prefix.trim()) return toast.error('Prefix is required')
    const pad = parseInt(form.padding)
    if (isNaN(pad) || pad < 1 || pad > 10) return toast.error('Padding must be 1–10')
    const cur = parseInt(form.current_val)
    if (isNaN(cur) || cur < 0) return toast.error('Current value must be ≥ 0')
    const isReset = cur < editing.current_val
    if (isReset && !window.confirm(
      `Resetting the counter from ${editing.current_val} to ${cur} may cause duplicate document numbers if existing documents already use those numbers. Continue?`
    )) return
    setSaving(true)
    const { error } = await supabase.from('numbering_series').update({
      prefix:      form.prefix.trim().toUpperCase(),
      padding:     pad,
      current_val: cur,
      is_active:   form.is_active,
      updated_at:  new Date().toISOString(),
    }).eq('id', editing.id)
    if (error) toast.error(error.message)
    else { toast.success('Series updated'); setEditing(null); fetchSeries() }
    setSaving(false)
  }

  const toggleActive = async (s) => {
    const { error } = await supabase.from('numbering_series').update({
      is_active: !s.is_active, updated_at: new Date().toISOString(),
    }).eq('id', s.id)
    if (error) toast.error(error.message)
    else { toast.success(s.is_active ? 'Series deactivated' : 'Series activated'); fetchSeries() }
  }

  return (
    <div>
      <PageHeader title="Numbering Series">
        <button className="btn btn-secondary" onClick={fetchSeries}>
          <span className="material-icons">refresh</span> Refresh
        </button>
      </PageHeader>

      <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>info</span>
        Document numbers are generated atomically. Editing the prefix or counter affects <strong>all future documents</strong>. Resetting the counter below its current value risks duplicates.
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Series Key</th>
                <th>Description</th>
                <th>Prefix</th>
                <th>Padding</th>
                <th style={{ textAlign: 'right' }}>Current #</th>
                <th>Next Preview</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : series.map(s => (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>{s.series_key}</td>
                  <td style={{ fontWeight: 600 }}>{s.description || DOC_LABELS[s.series_key] || s.series_key}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{s.prefix}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'center' }}>{s.padding}</td>
                  <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{s.current_val}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)',
                      background: 'rgba(52,211,153,.08)', padding: '2px 8px', borderRadius: 4 }}>
                      {preview(s.prefix, s.padding, s.current_val)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: s.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn btn-secondary btn-sm"
                        style={{ color: s.is_active ? 'var(--red)' : 'var(--green)' }}
                        onClick={() => toggleActive(s)}>
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ModalDialog title={`Edit Series — ${editing.series_key}`} onClose={() => setEditing(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Prefix</label>
              <input className="form-control" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
                value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} />
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>e.g. PO- or GRN-</small>
            </div>
            <div className="form-group">
              <label>Padding (digits)</label>
              <input type="number" min="1" max="10" className="form-control" style={{ fontFamily: 'var(--mono)' }}
                value={form.padding} onChange={e => setForm(f => ({ ...f, padding: e.target.value }))} />
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>Number of zero-padded digits</small>
            </div>
            <div className="form-group">
              <label>Current Counter Value</label>
              <input type="number" min="0" className="form-control" style={{ fontFamily: 'var(--mono)' }}
                value={form.current_val} onChange={e => setForm(f => ({ ...f, current_val: e.target.value }))} />
              <small style={{ fontSize: 10, color: form.current_val < editing.current_val ? 'var(--red)' : 'var(--text-dim)' }}>
                {form.current_val < editing.current_val ? '⚠ Resetting counter — may cause duplicates' : 'Next document will use this + 1'}
              </small>
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label>Preview</label>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800, color: 'var(--green)',
                padding: '8px 14px', background: 'rgba(52,211,153,.08)', borderRadius: 8, border: '1px solid rgba(52,211,153,.2)' }}>
                {preview(form.prefix || editing.prefix, parseInt(form.padding) || editing.padding, parseInt(form.current_val) || 0)}
              </div>
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>Next number that will be issued</small>
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
              Series is active (inactive series cannot generate new numbers)
            </label>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
