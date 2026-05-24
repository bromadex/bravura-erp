// src/pages/Settings/ApprovalThresholds.jsx
// Configure tiered financial approval thresholds per document type.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, ModalDialog, ModalActions, EmptyState } from '../../components/ui'

const DOC_TYPES = [
  { value: 'purchase_order',       label: 'Purchase Orders'       },
  { value: 'purchase_requisition', label: 'Purchase Requisitions' },
  { value: 'store_requisition',    label: 'Store Requisitions'    },
  { value: 'payment_voucher',      label: 'Payment Vouchers'      },
  { value: 'purchase_invoice',     label: 'Purchase Invoices'     },
  { value: 'purchase_return',      label: 'Purchase Returns'      },
]

const APPROVER_ROLES = [
  { value: 'hod',             label: 'Head of Department' },
  { value: 'finance_manager', label: 'Finance Manager'    },
  { value: 'cfo',             label: 'Chief Finance Officer' },
  { value: 'ceo',             label: 'CEO / MD'           },
  { value: 'board',           label: 'Board of Directors' },
  { value: 'it_manager',      label: 'IT Manager'         },
  { value: 'procurement_manager', label: 'Procurement Manager' },
  { value: 'admin',           label: 'Administrator'      },
]

const ROLE_COLORS = {
  hod: 'var(--blue)', finance_manager: 'var(--teal)', cfo: 'var(--teal)',
  ceo: 'var(--red)', board: 'var(--red)', it_manager: 'var(--purple)',
  procurement_manager: 'var(--gold)', admin: 'var(--text-dim)',
}

function fmt(n) { return n == null ? '∞' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` }

function TierBar({ thresholds }) {
  if (!thresholds.length) return null
  const sorted = [...thresholds].filter(t => t.is_active).sort((a, b) => a.min_amount - b.min_amount)
  return (
    <div style={{ display: 'flex', gap: 0, marginTop: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {sorted.map((t, i) => {
        const color = ROLE_COLORS[t.approver_role] || 'var(--text-dim)'
        return (
          <div key={t.id} style={{ flex: 1, padding: '8px 10px', background: `${color}11`,
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>
              {fmt(t.min_amount)} – {fmt(t.max_amount)}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color }}>{t.approver_label}</div>
            {t.requires_two && <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 2 }}>2 approvers</div>}
          </div>
        )
      })}
    </div>
  )
}

const emptyForm = () => ({
  document_type:  'purchase_order',
  min_amount:     '',
  max_amount:     '',
  approver_role:  'hod',
  approver_label: '',
  requires_two:   false,
  is_active:      true,
  notes:          '',
})

export default function ApprovalThresholds() {
  const [thresholds, setThresholds] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)   // null | 'add' | threshold object
  const [form,       setForm]       = useState(emptyForm())
  const [saving,     setSaving]     = useState(false)
  const [activeDoc,  setActiveDoc]  = useState('purchase_order')

  const fetchThresholds = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('approval_thresholds').select('*')
      .order('document_type').order('min_amount')
    if (error) toast.error('Failed to load thresholds')
    else setThresholds(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchThresholds() }, [fetchThresholds])

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-populate approver_label when role changes
  const handleRoleChange = (role) => {
    const found = APPROVER_ROLES.find(r => r.value === role)
    sf('approver_role', role)
    if (found) sf('approver_label', found.label)
  }

  const openAdd = () => {
    setForm({ ...emptyForm(), document_type: activeDoc })
    setModal('add')
  }

  const openEdit = (t) => {
    setForm({
      document_type:  t.document_type,
      min_amount:     t.min_amount ?? '',
      max_amount:     t.max_amount ?? '',
      approver_role:  t.approver_role,
      approver_label: t.approver_label,
      requires_two:   t.requires_two,
      is_active:      t.is_active,
      notes:          t.notes || '',
    })
    setModal(t)
  }

  const handleSave = async () => {
    if (!form.approver_label.trim()) return toast.error('Approver label is required')
    const min = parseFloat(form.min_amount)
    if (isNaN(min) || min < 0) return toast.error('Min amount must be ≥ 0')
    const max = form.max_amount === '' || form.max_amount == null ? null : parseFloat(form.max_amount)
    if (max !== null && max <= min) return toast.error('Max amount must be greater than min amount')
    setSaving(true)
    const payload = {
      document_type:  form.document_type,
      min_amount:     min,
      max_amount:     max,
      approver_role:  form.approver_role,
      approver_label: form.approver_label.trim(),
      requires_two:   form.requires_two,
      is_active:      form.is_active,
      notes:          form.notes.trim() || null,
      updated_at:     new Date().toISOString(),
    }
    let error
    if (modal === 'add') {
      const { error: e } = await supabase.from('approval_thresholds').insert([{ id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString() }])
      error = e
    } else {
      const { error: e } = await supabase.from('approval_thresholds').update(payload).eq('id', modal.id)
      error = e
    }
    if (error) toast.error(error.message)
    else { toast.success(modal === 'add' ? 'Threshold added' : 'Threshold updated'); setModal(null); fetchThresholds() }
    setSaving(false)
  }

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete threshold for ${t.approver_label} on ${t.document_type}?`)) return
    const { error } = await supabase.from('approval_thresholds').delete().eq('id', t.id)
    if (error) toast.error(error.message)
    else { toast.success('Threshold deleted'); fetchThresholds() }
  }

  const toggleActive = async (t) => {
    const { error } = await supabase.from('approval_thresholds').update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (error) toast.error(error.message)
    else fetchThresholds()
  }

  const byDocType = DOC_TYPES.map(dt => ({
    ...dt,
    rows: thresholds.filter(t => t.document_type === dt.value).sort((a, b) => a.min_amount - b.min_amount),
  }))

  const activeDT = byDocType.find(d => d.value === activeDoc) || byDocType[0]

  return (
    <div>
      <PageHeader title="Approval Thresholds">
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons">add</span> Add Threshold
        </button>
      </PageHeader>

      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--blue)' }}>info</span>
        Thresholds define which role must approve based on document value. The first matching tier (min ≤ amount &lt; max) applies.
        Multiple active thresholds per document type create a tiered approval ladder.
      </div>

      {/* Doc type tabs */}
      <div className="btn-group" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {DOC_TYPES.map(dt => (
          <button key={dt.value}
            className={activeDoc === dt.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setActiveDoc(dt.value)}>
            {dt.label}
            {thresholds.filter(t => t.document_type === dt.value && t.is_active).length > 0 && (
              <span style={{ marginLeft: 6, background: 'rgba(255,255,255,.2)', borderRadius: 10,
                padding: '0 6px', fontSize: 10 }}>
                {thresholds.filter(t => t.document_type === dt.value && t.is_active).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeDT && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{activeDT.label}</div>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Tier
            </button>
          </div>

          <TierBar thresholds={activeDT.rows} />

          <div className="table-wrap" style={{ marginTop: 16 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</div>
            ) : activeDT.rows.length === 0 ? (
              <EmptyState icon="policy" message="No thresholds configured for this document type." />
            ) : (
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Min Amount</th><th>Max Amount</th><th>Approver Role</th>
                    <th>Approver Label</th><th>2 Approvers</th><th>Status</th><th>Notes</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDT.rows.map(t => {
                    const color = ROLE_COLORS[t.approver_role] || 'var(--text-dim)'
                    return (
                      <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                        <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(t.min_amount)}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{fmt(t.max_amount)}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                            color, background: `${color}18`, padding: '2px 8px', borderRadius: 4 }}>
                            {t.approver_role}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{t.approver_label}</td>
                        <td style={{ textAlign: 'center' }}>{t.requires_two ? '✓' : '—'}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600,
                            color: t.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 200 }}>{t.notes || '—'}</td>
                        <td>
                          <div className="btn-group">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>Edit</button>
                            <button className="btn btn-secondary btn-sm"
                              style={{ color: t.is_active ? 'var(--text-dim)' : 'var(--green)' }}
                              onClick={() => toggleActive(t)}>
                              {t.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }}
                              onClick={() => handleDelete(t)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {modal && (
        <ModalDialog title={modal === 'add' ? 'Add Approval Threshold' : 'Edit Approval Threshold'}
          onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Document Type</label>
              <select className="form-control" value={form.document_type} onChange={e => sf('document_type', e.target.value)}>
                {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Min Amount ($) *</label>
              <input type="number" min="0" step="0.01" className="form-control" style={{ fontFamily: 'var(--mono)' }}
                placeholder="0" value={form.min_amount} onChange={e => sf('min_amount', e.target.value)} />
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>Amount ≥ this triggers tier</small>
            </div>
            <div className="form-group">
              <label>Max Amount ($)</label>
              <input type="number" min="0" step="0.01" className="form-control" style={{ fontFamily: 'var(--mono)' }}
                placeholder="Leave blank for no upper limit" value={form.max_amount} onChange={e => sf('max_amount', e.target.value)} />
              <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>Empty = top tier (no ceiling)</small>
            </div>
            <div className="form-group">
              <label>Approver Role *</label>
              <select className="form-control" value={form.approver_role} onChange={e => handleRoleChange(e.target.value)}>
                {APPROVER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Approver Label *</label>
              <input className="form-control" placeholder="e.g. Head of Department"
                value={form.approver_label} onChange={e => sf('approver_label', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requires_two}
                  onChange={e => sf('requires_two', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
                Require two approvers at this tier
              </label>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <input className="form-control" placeholder="Explain why this tier exists"
                value={form.notes} onChange={e => sf('notes', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => sf('is_active', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
                Threshold is active
              </label>
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : modal === 'add' ? 'Add Threshold' : 'Save Changes'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
