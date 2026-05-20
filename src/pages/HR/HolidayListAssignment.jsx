import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const empty = { holiday_list_id: '', department_id: '', branch_name: '', effective_from: '', effective_to: '', is_active: true }

export default function HolidayListAssignment() {
  const canEdit = useCanEdit('hr', 'holiday-list-assignments')
  const [assignments, setAssignments] = useState([])
  const [lists, setLists] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [asnRes, listRes, deptRes] = await Promise.all([
      supabase.from('holiday_list_assignments').select('*, holiday_lists(name), departments(name)').order('created_at', { ascending: false }),
      supabase.from('holiday_lists').select('id, name').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    if (asnRes.error) toast.error(asnRes.error.message)
    setAssignments(asnRes.data || [])
    setLists(listRes.data || [])
    setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openModal = (a = null) => setModal(a ? { ...a } : { ...empty })

  const save = async () => {
    const { id, holiday_lists: _l, departments: _d, ...rest } = modal
    setSaving(true)
    try {
      const payload = {
        ...rest,
        department_id: rest.department_id || null,
        effective_from: rest.effective_from || null,
        effective_to: rest.effective_to || null,
      }
      if (id) {
        const { error } = await supabase.from('holiday_list_assignments').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('holiday_list_assignments').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Assignment saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('holiday_list_assignments').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  if (loading) return <div><PageHeader title="Holiday List Assignment" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Holiday List Assignment" subtitle="Assign holiday lists to departments and branches with effective dates">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Assignment
          </button>
        )}
      </PageHeader>

      {assignments.length === 0
        ? <EmptyState icon="event_available" message="No holiday list assignments" action={canEdit ? { label: 'New Assignment', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr><th>Holiday List</th><th>Department</th><th>Branch</th><th>Effective From</th><th>Effective To</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.holiday_lists?.name || '—'}</td>
                    <td>{a.departments?.name || <span style={{ color: 'var(--text-dim)' }}>All</span>}</td>
                    <td>{a.branch_name || <span style={{ color: 'var(--text-dim)' }}>All</span>}</td>
                    <td>{a.effective_from || '—'}</td>
                    <td>{a.effective_to || '—'}</td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: a.is_active ? 'var(--green)22' : 'var(--border)', color: a.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openModal(a)}>Edit</button>}
                        {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(a)}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Assignment' : 'New Holiday List Assignment'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Holiday List *</label>
            <select className="form-control" value={modal?.holiday_list_id || ''} onChange={e => setF('holiday_list_id', e.target.value)} disabled={!canEdit}>
              <option value="">Select holiday list…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Department (blank = all)</label>
              <select className="form-control" value={modal?.department_id || ''} onChange={e => setF('department_id', e.target.value)} disabled={!canEdit}>
                <option value="">All departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Branch (optional)</label>
              <input className="form-control" value={modal?.branch_name || ''} onChange={e => setF('branch_name', e.target.value)} disabled={!canEdit} placeholder="e.g. Head Office" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Effective From</label>
              <input className="form-control" type="date" value={modal?.effective_from || ''} onChange={e => setF('effective_from', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Effective To</label>
              <input className="form-control" type="date" value={modal?.effective_to || ''} onChange={e => setF('effective_to', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={modal?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
            <span>Active</span>
          </label>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete Assignment" message="Delete this holiday list assignment?" />
    </div>
  )
}
