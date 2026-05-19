// src/pages/HR/SalaryComponentAccounts.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import toast from 'react-hot-toast'

const EMPTY = { component_id: '', account_code: '', account_label: '', department_id: '', is_default: false, notes: '' }

export default function SalaryComponentAccounts() {
  const canEdit = useCanEdit('hr', 'component-accounts')

  const [rows, setRows]             = useState([])
  const [components, setComponents] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading]       = useState(true)
  const [filterComp, setFilterComp] = useState('')
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [editing, setEditing]       = useState(null)
  const [confirm, setConfirm]       = useState(null)

  const compMap = Object.fromEntries(components.map(c => [c.id, c.name]))
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]))

  const fetchMeta = useCallback(async () => {
    const [{ data: comps }, { data: depts }] = await Promise.all([
      supabase.from('salary_components').select('id,name,component_type').order('name'),
      supabase.from('departments').select('id,name').order('name'),
    ])
    setComponents(comps || [])
    setDepartments(depts || [])
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('salary_component_accounts').select('*').order('account_code')
    if (filterComp) q = q.eq('component_id', filterComp)
    const { data, error } = await q
    if (error) { toast.error('Failed to load mappings: ' + error.message); setLoading(false); return }
    setRows(data || []); setLoading(false)
  }, [filterComp])

  useEffect(() => { fetchMeta() }, [fetchMeta])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => {
    setEditing(r.id)
    setForm({ component_id: r.component_id, account_code: r.account_code, account_label: r.account_label || '', department_id: r.department_id || '', is_default: r.is_default, notes: r.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.component_id)       return toast.error('Select a salary component')
    if (!form.account_code.trim()) return toast.error('Account code is required')
    setSaving(true)
    if (form.is_default && !form.department_id) {
      await supabase.from('salary_component_accounts').update({ is_default: false }).eq('component_id', form.component_id).is('department_id', null).neq('id', editing || '')
    }
    const payload = {
      component_id: form.component_id, account_code: form.account_code.trim(),
      account_label: form.account_label.trim() || null, department_id: form.department_id || null,
      is_default: form.is_default, notes: form.notes.trim() || null,
    }
    let error
    if (editing) {
      ;({ error } = await supabase.from('salary_component_accounts').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('salary_component_accounts').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Mapping updated' : 'GL mapping created')
    setModal(false); fetchRows()
  }

  const del = async id => {
    const { error } = await supabase.from('salary_component_accounts').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Mapping deleted'); fetchRows(); setConfirm(null)
  }

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const grouped = rows.reduce((acc, r) => {
    if (!acc[r.component_id]) acc[r.component_id] = []
    acc[r.component_id].push(r)
    return acc
  }, {})

  return (
    <div>
      <PageHeader title="Salary Component Accounts" subtitle="Map salary components to GL account codes for payroll accounting">
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ Add GL Mapping</button>}
      </PageHeader>

      <div style={{ marginBottom: 16 }}>
        <select value={filterComp} onChange={e => setFilterComp(e.target.value)} className="input" style={{ minWidth: 240 }}>
          <option value="">All Components</option>
          {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="account_tree" message="No GL mappings configured yet" action={canEdit ? { label: 'Add First Mapping', onClick: openNew } : null} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).map(([compId, mappings]) => (
            <div key={compId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>account_tree</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{compMap[compId] || compId}</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{mappings.length} mapping{mappings.length !== 1 ? 's' : ''}</span>
              </div>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Account Code</th><th>Account Label</th><th>Department</th>
                    <th>Default</th><th>Notes</th>{canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {mappings.map(r => (
                    <tr key={r.id}>
                      <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{r.account_code}</span></td>
                      <td>{r.account_label || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                      <td>{r.department_id ? (deptMap[r.department_id] || r.department_id) : <span style={{ color: 'var(--text-dim)' }}>All departments</span>}</td>
                      <td>{r.is_default && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--green)22', color: 'var(--green)', fontWeight: 700 }}>Default</span>}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                      {canEdit && (
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>Edit</button>
                            <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ id: r.id, label: `${r.account_code} → ${compMap[compId]}` })}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit GL Mapping' : 'New GL Mapping'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Salary Component *</label>
            <select className="input" value={form.component_id} onChange={e => fld('component_id', e.target.value)} disabled={!!editing}>
              <option value="">Select component…</option>
              {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.component_type})</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Account Code *</label>
              <input className="input" value={form.account_code} onChange={e => fld('account_code', e.target.value)} placeholder="e.g. 5100" style={{ fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label className="field-label">Account Label</label>
              <input className="input" value={form.account_label} onChange={e => fld('account_label', e.target.value)} placeholder="e.g. Salaries Expense" />
            </div>
          </div>
          <div>
            <label className="field-label">Department <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(blank = all departments)</span></label>
            <select className="input" value={form.department_id} onChange={e => fld('department_id', e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => fld('is_default', e.target.checked)} />
            <label htmlFor="is_default" style={{ cursor: 'pointer', fontSize: 13 }}>Set as default account for this component</label>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <input className="input" value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirm} title="Delete GL Mapping" danger
        message={`Delete mapping "${confirm?.label}"?`} confirmLabel="Delete"
        onConfirm={() => del(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
