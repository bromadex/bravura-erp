// src/pages/Settings/WorkflowRules.jsx
// Conditional workflow routing rules — if [field] [op] [value] → [action].

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, ModalDialog, ModalActions, EmptyState } from '../../components/ui'

const DOC_TYPES = [
  { value: 'purchase_order',       label: 'Purchase Orders'       },
  { value: 'purchase_requisition', label: 'Purchase Requisitions' },
  { value: 'store_requisition',    label: 'Store Requisitions'    },
  { value: 'goods_received',       label: 'Goods Received (GRN)'  },
  { value: 'payment_voucher',      label: 'Payment Vouchers'      },
  { value: 'purchase_invoice',     label: 'Purchase Invoices'     },
  { value: 'purchase_return',      label: 'Purchase Returns'      },
]

const CONDITION_FIELDS = [
  { value: 'total_amount',  label: 'Total Amount ($)',      type: 'number' },
  { value: 'department',    label: 'Department',            type: 'text'   },
  { value: 'category',      label: 'Item Category',         type: 'text'   },
  { value: 'supplier_type', label: 'Supplier Type',         type: 'text'   },
  { value: 'item_count',    label: 'Number of Line Items',  type: 'number' },
  { value: 'warehouse_id',  label: 'Warehouse',             type: 'text'   },
  { value: 'currency',      label: 'Currency',              type: 'text'   },
]

const CONDITION_OPS = [
  { value: 'gt',       label: '>  greater than',      forTypes: ['number'] },
  { value: 'gte',      label: '≥  greater or equal',  forTypes: ['number'] },
  { value: 'lt',       label: '<  less than',          forTypes: ['number'] },
  { value: 'lte',      label: '≤  less or equal',     forTypes: ['number'] },
  { value: 'eq',       label: '=  equals',             forTypes: ['number','text'] },
  { value: 'neq',      label: '≠  not equals',         forTypes: ['number','text'] },
  { value: 'in',       label: 'in  one of (CSV list)', forTypes: ['text'] },
  { value: 'contains', label: 'contains',              forTypes: ['text'] },
]

const ACTION_TYPES = [
  { value: 'require_approver',   label: 'Require Approver',   color: 'var(--blue)'   },
  { value: 'skip_step',          label: 'Skip Workflow Step',  color: 'var(--text-dim)' },
  { value: 'block_submission',   label: 'Block Submission',    color: 'var(--red)'    },
  { value: 'flag_for_review',    label: 'Flag for Review',     color: 'var(--yellow)' },
  { value: 'send_notification',  label: 'Send Notification',   color: 'var(--teal)'   },
]

function ActionBadge({ type }) {
  const meta = ACTION_TYPES.find(a => a.value === type)
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: meta?.color || 'var(--text-dim)',
      background: `${meta?.color || 'var(--text-dim)'}18`, padding: '2px 8px', borderRadius: 4 }}>
      {meta?.label || type}
    </span>
  )
}

const emptyForm = () => ({
  rule_name:       '',
  document_type:   'purchase_order',
  condition_field: 'total_amount',
  condition_op:    'gte',
  condition_value: '',
  action_type:     'require_approver',
  action_value:    '',
  action_label:    '',
  priority:        10,
  is_active:       true,
  notes:           '',
})

export default function WorkflowRules() {
  const [rules,     setRules]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  const [form,      setForm]      = useState(emptyForm())
  const [saving,    setSaving]    = useState(false)
  const [filterDoc, setFilterDoc] = useState('ALL')

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('erp_workflow_rules').select('*')
      .order('document_type').order('priority')
    if (error) toast.error('Failed to load workflow rules')
    else setRules(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const fieldMeta  = CONDITION_FIELDS.find(f => f.value === form.condition_field) || CONDITION_FIELDS[0]
  const availableOps = CONDITION_OPS.filter(o => o.forTypes.includes(fieldMeta.type))

  const openAdd  = () => { setForm(emptyForm()); setModal('add') }
  const openEdit = (r) => {
    setForm({
      rule_name: r.rule_name, document_type: r.document_type,
      condition_field: r.condition_field, condition_op: r.condition_op,
      condition_value: r.condition_value, action_type: r.action_type,
      action_value: r.action_value, action_label: r.action_label || '',
      priority: r.priority, is_active: r.is_active, notes: r.notes || '',
    })
    setModal(r)
  }

  const handleSave = async () => {
    if (!form.rule_name.trim())    return toast.error('Rule name is required')
    if (!form.condition_value.trim()) return toast.error('Condition value is required')
    if (!form.action_value.trim()) return toast.error('Action value is required')
    setSaving(true)
    const payload = {
      rule_name:       form.rule_name.trim(),
      document_type:   form.document_type,
      condition_field: form.condition_field,
      condition_op:    form.condition_op,
      condition_value: form.condition_value.trim(),
      action_type:     form.action_type,
      action_value:    form.action_value.trim(),
      action_label:    form.action_label.trim() || null,
      priority:        parseInt(form.priority) || 10,
      is_active:       form.is_active,
      notes:           form.notes.trim() || null,
      updated_at:      new Date().toISOString(),
    }
    let error
    if (modal === 'add') {
      const { error: e } = await supabase.from('erp_workflow_rules').insert([{
        id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString(),
      }])
      error = e
    } else {
      const { error: e } = await supabase.from('erp_workflow_rules').update(payload).eq('id', modal.id)
      error = e
    }
    if (error) toast.error(error.message)
    else { toast.success(modal === 'add' ? 'Rule created' : 'Rule updated'); setModal(null); fetchRules() }
    setSaving(false)
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete rule "${r.rule_name}"?`)) return
    const { error } = await supabase.from('erp_workflow_rules').delete().eq('id', r.id)
    if (error) toast.error(error.message)
    else { toast.success('Rule deleted'); fetchRules() }
  }

  const toggleActive = async (r) => {
    const { error } = await supabase.from('erp_workflow_rules').update({
      is_active: !r.is_active, updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) toast.error(error.message)
    else fetchRules()
  }

  const filtered = filterDoc === 'ALL' ? rules : rules.filter(r => r.document_type === filterDoc)

  return (
    <div>
      <PageHeader title="Workflow Rules">
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons">add</span> New Rule
        </button>
      </PageHeader>

      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(96,165,250,.06)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--blue)' }}>info</span>
        Rules are evaluated in <strong>priority order</strong> (lowest number first) when a document is submitted.
        Multiple rules can fire simultaneously. Inactive rules are skipped.
      </div>

      {/* Doc type filter */}
      <div className="btn-group" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={filterDoc === 'ALL' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setFilterDoc('ALL')}>All Types</button>
        {DOC_TYPES.map(dt => (
          <button key={dt.value}
            className={filterDoc === dt.value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setFilterDoc(dt.value)}>
            {dt.label}
            {rules.filter(r => r.document_type === dt.value && r.is_active).length > 0 && (
              <span style={{ marginLeft: 5, background: 'rgba(255,255,255,.2)', borderRadius: 10,
                padding: '0 5px', fontSize: 10 }}>
                {rules.filter(r => r.document_type === dt.value && r.is_active).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th><th>Rule Name</th><th>Document Type</th>
                <th>Condition</th><th>Action</th><th>Action Value</th>
                <th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8"><EmptyState icon="account_tree" message='No workflow rules configured. Click "New Rule" to create one.' /></td></tr>
              ) : filtered.map(r => {
                const docLabel = DOC_TYPES.find(d => d.value === r.document_type)?.label || r.document_type
                const fieldLabel = CONDITION_FIELDS.find(f => f.value === r.condition_field)?.label || r.condition_field
                const opLabel = CONDITION_OPS.find(o => o.value === r.condition_op)?.label || r.condition_op
                return (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-dim)' }}>{r.priority}</td>
                    <td style={{ fontWeight: 600 }}>
                      {r.rule_name}
                      {r.notes && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{r.notes}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{docLabel}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      <span style={{ color: 'var(--blue)' }}>{fieldLabel}</span>
                      {' '}<span style={{ color: 'var(--text-dim)' }}>{opLabel.split(' ')[0]}</span>
                      {' '}<strong>{r.condition_value}</strong>
                    </td>
                    <td><ActionBadge type={r.action_type} /></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{r.action_value}</div>
                      {r.action_label && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.action_label}</div>}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: r.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-secondary btn-sm"
                          style={{ color: r.is_active ? 'var(--text-dim)' : 'var(--green)' }}
                          onClick={() => toggleActive(r)}>
                          {r.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }}
                          onClick={() => handleDelete(r)}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ModalDialog title={modal === 'add' ? 'New Workflow Rule' : `Edit Rule — ${modal.rule_name}`}
          onClose={() => setModal(null)} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Rule Name *</label>
              <input className="form-control" placeholder="e.g. High-value PO escalation"
                value={form.rule_name} onChange={e => sf('rule_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Document Type</label>
              <select className="form-control" value={form.document_type} onChange={e => sf('document_type', e.target.value)}>
                {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Priority (lower = fires first)</label>
              <input type="number" min="1" max="999" className="form-control" style={{ fontFamily: 'var(--mono)' }}
                value={form.priority} onChange={e => sf('priority', e.target.value)} />
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', margin: '12px 0 8px' }}>Condition — When this is true…</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Field</label>
              <select className="form-control" value={form.condition_field}
                onChange={e => { sf('condition_field', e.target.value); sf('condition_op', 'eq') }}>
                {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Operator</label>
              <select className="form-control" value={form.condition_op} onChange={e => sf('condition_op', e.target.value)}>
                {availableOps.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Value {form.condition_op === 'in' ? '(comma-separated)' : ''}</label>
              <input className="form-control" style={{ fontFamily: 'var(--mono)' }}
                type={fieldMeta.type === 'number' ? 'number' : 'text'}
                placeholder={form.condition_op === 'in' ? 'val1,val2,val3' : fieldMeta.type === 'number' ? '0.00' : 'value'}
                value={form.condition_value} onChange={e => sf('condition_value', e.target.value)} />
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)', marginBottom: 8 }}>Action — Then do this…</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Action Type</label>
              <select className="form-control" value={form.action_type} onChange={e => sf('action_type', e.target.value)}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Action Value *</label>
              <input className="form-control" style={{ fontFamily: 'var(--mono)' }}
                placeholder={form.action_type === 'require_approver' ? 'e.g. finance_manager' : 'e.g. step_name'}
                value={form.action_value} onChange={e => sf('action_value', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Action Label</label>
              <input className="form-control"
                placeholder="e.g. Finance Manager approval"
                value={form.action_label} onChange={e => sf('action_label', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Notes</label>
              <input className="form-control" placeholder="Explain purpose of this rule"
                value={form.notes} onChange={e => sf('notes', e.target.value)} />
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 24 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => sf('is_active', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
                Rule is active
              </label>
            </div>
          </div>

          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : modal === 'add' ? 'Create Rule' : 'Save Changes'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
