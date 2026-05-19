import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'all',     label: 'All Documents',  icon: 'folder' },
  { id: 'expiring',label: 'Expiring Soon',  icon: 'warning' },
  { id: 'expired', label: 'Expired',        icon: 'error' },
  { id: 'missing', label: 'Missing Mandatory', icon: 'flag' },
]

const empty = {
  employee_id: '', document_type_id: '', document_number: '',
  issue_date: '', expiry_date: '', issuing_authority: '',
  file_url: '', notes: '', is_verified: false,
}

const daysUntil = (date) => {
  if (!date) return Infinity
  return Math.floor((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function EmployeeDocuments() {
  const { user } = useAuth()
  const canEdit = useCanEdit('hr', 'employee-documents')
  const [tab, setTab] = useState('all')
  const [employees, setEmployees] = useState([])
  const [types, setTypes] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [empRes, typeRes, docRes] = await Promise.all([
      supabase.from('employees').select('id, name').order('name'),
      supabase.from('identification_document_types').select('*').order('name'),
      supabase.from('employee_documents').select('*, employees(name), identification_document_types(name, requires_expiry, is_mandatory)').order('created_at', { ascending: false }),
    ])
    if (empRes.error) toast.error(empRes.error.message)
    setEmployees(empRes.data || [])
    setTypes(typeRes.data || [])
    setDocs(docRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = useMemo(() => {
    let result = docs
    if (filterEmployee) result = result.filter(d => d.employee_id === filterEmployee)
    if (tab === 'expiring') result = result.filter(d => d.expiry_date && daysUntil(d.expiry_date) >= 0 && daysUntil(d.expiry_date) <= 30)
    if (tab === 'expired')  result = result.filter(d => d.expiry_date && daysUntil(d.expiry_date) < 0)
    if (tab === 'missing') {
      const mandatoryTypes = types.filter(t => t.is_mandatory && t.is_active)
      const missing = []
      employees.forEach(emp => {
        mandatoryTypes.forEach(mt => {
          if (!docs.some(d => d.employee_id === emp.id && d.document_type_id === mt.id)) {
            missing.push({ employee_id: emp.id, employees: { name: emp.name }, document_type_id: mt.id, identification_document_types: { name: mt.name }, _missing: true })
          }
        })
      })
      result = missing
    }
    return result
  }, [docs, tab, filterEmployee, types, employees])

  const openModal = (d = null) => setModal(d ? { ...d } : { ...empty })

  const save = async () => {
    const { id, employees: _e, identification_document_types: _t, _missing, ...rest } = modal
    const payload = {
      ...rest,
      issue_date: rest.issue_date || null,
      expiry_date: rest.expiry_date || null,
    }
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('employee_documents').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employee_documents').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Document saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const verify = async (doc) => {
    const { error } = await supabase.from('employee_documents').update({
      is_verified: true, verified_by: user?.id, verified_at: new Date().toISOString(),
    }).eq('id', doc.id)
    if (error) { toast.error(error.message); return }
    toast.success('Document verified')
    fetchAll()
  }

  const doDelete = async () => {
    const { error } = await supabase.from('employee_documents').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="Employee Documents" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Employee Documents" subtitle="Track identification documents, expiry dates and verification status">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>Add Document
          </button>
        )}
      </PageHeader>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
        <select className="form-control" style={{ maxWidth: 260 }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <TabNav tabs={TABS.map(t => ({ ...t, label: `${t.label} (${
        t.id === 'all'      ? docs.length :
        t.id === 'expiring' ? docs.filter(d => d.expiry_date && daysUntil(d.expiry_date) >= 0 && daysUntil(d.expiry_date) <= 30).length :
        t.id === 'expired'  ? docs.filter(d => d.expiry_date && daysUntil(d.expiry_date) < 0).length :
                              types.filter(t => t.is_mandatory && t.is_active).length * employees.length - docs.filter(d => types.find(t => t.id === d.document_type_id)?.is_mandatory).length
      })` }))} active={tab} onChange={setTab} />

      {filtered.length === 0
        ? <EmptyState icon="folder_off" message="No documents in this view" action={canEdit && tab === 'all' ? { label: 'Add Document', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Number</th><th>Issue Date</th><th>Expiry</th><th>Verified</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((d, idx) => {
                  const days = daysUntil(d.expiry_date)
                  const expiryStyle = d._missing ? { color: 'var(--red)', fontWeight: 600 } :
                                      !d.expiry_date ? {} :
                                      days < 0 ? { color: 'var(--red)', fontWeight: 600 } :
                                      days <= 30 ? { color: 'var(--gold)', fontWeight: 600 } : {}
                  return (
                    <tr key={d.id || `missing-${idx}`}>
                      <td>{d.employees?.name}</td>
                      <td style={{ fontWeight: 600 }}>{d.identification_document_types?.name}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{d.document_number || '—'}</td>
                      <td>{d.issue_date || '—'}</td>
                      <td style={expiryStyle}>
                        {d._missing ? 'MISSING' :
                         !d.expiry_date ? '—' :
                         days < 0 ? `Expired ${-days}d ago` :
                         days <= 30 ? `${days}d remaining` :
                         d.expiry_date}
                      </td>
                      <td>{d._missing ? '—' : d.is_verified ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {d._missing && canEdit && <button className="btn btn-primary btn-xs" onClick={() => openModal({ ...empty, employee_id: d.employee_id, document_type_id: d.document_type_id })}>Add</button>}
                          {!d._missing && canEdit && !d.is_verified && <button className="btn btn-xs" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => verify(d)}>Verify</button>}
                          {!d._missing && canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openModal(d)}>Edit</button>}
                          {!d._missing && canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(d)}>Del</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Document' : 'Add Document'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={modal?.employee_id || ''} onChange={e => setF('employee_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Document Type *</label>
              <select className="form-control" value={modal?.document_type_id || ''} onChange={e => setF('document_type_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {types.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Document Number</label>
              <input className="form-control" value={modal?.document_number || ''} onChange={e => setF('document_number', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Issuing Authority</label>
              <input className="form-control" value={modal?.issuing_authority || ''} onChange={e => setF('issuing_authority', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Issue Date</label>
              <input className="form-control" type="date" value={modal?.issue_date || ''} onChange={e => setF('issue_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Expiry Date</label>
              <input className="form-control" type="date" value={modal?.expiry_date || ''} onChange={e => setF('expiry_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>File URL</label>
            <input className="form-control" value={modal?.file_url || ''} onChange={e => setF('file_url', e.target.value)} disabled={!canEdit} placeholder="https://…" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={modal?.notes || ''} onChange={e => setF('notes', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete Document" message="Delete this document record?" />
    </div>
  )
}
