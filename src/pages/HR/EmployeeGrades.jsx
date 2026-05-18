import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

const BLANK = { grade_name: '', description: '', default_base_pay: '', currency: 'USD', is_active: true }

export default function EmployeeGrades() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'employee-grades')

  const [grades,    setGrades]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [editGrade, setEditGrade] = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(false)

  const fetchGrades = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('employee_grades').select('*').order('grade_name')
    if (error) toast.error(error.message)
    setGrades(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGrades() }, [fetchGrades])

  const openNew  = () => { setEditGrade(null); setForm(BLANK); setShowForm(true) }
  const openEdit = (g) => {
    setEditGrade(g)
    setForm({
      grade_name: g.grade_name || '',
      description: g.description || '',
      default_base_pay: g.default_base_pay ?? '',
      currency: g.currency || 'USD',
      is_active: g.is_active,
    })
    setShowForm(true)
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.grade_name.trim()) { toast.error('Grade Name is required'); return }
    setSaving(true)
    try {
      const payload = {
        grade_name: form.grade_name.trim(),
        description: form.description,
        default_base_pay: form.default_base_pay !== '' ? parseFloat(form.default_base_pay) : null,
        currency: form.currency,
        is_active: form.is_active,
      }
      if (editGrade) {
        await supabase.from('employee_grades').update(payload).eq('id', editGrade.id)
        toast.success('Grade updated')
      } else {
        await supabase.from('employee_grades').insert([{
          id: crypto.randomUUID(),
          ...payload,
          created_by: user?.full_name || user?.username || '',
        }])
        toast.success('Grade created')
      }
      setShowForm(false)
      fetchGrades()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const toggleActive = async (g) => {
    await supabase.from('employee_grades').update({ is_active: !g.is_active }).eq('id', g.id)
    fetchGrades()
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('employee_grades').delete().eq('id', confirmDel.id)
    toast.success('Grade deleted')
    setConfirmDel(null)
    setDeleting(false)
    fetchGrades()
  }

  const fmt = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

  return (
    <div>
      <PageHeader title="Employee Grades">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <span className="material-icons">add</span> New Grade
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : grades.length === 0 ? (
        <EmptyState icon="grade" message="No employee grades defined yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Grade Name</th>
                <th>Base Pay</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grades.map(g => (
                <tr key={g.id} style={{ opacity: g.is_active ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{g.grade_name}</td>
                  <td>{fmt(g.default_base_pay)}</td>
                  <td>{g.currency || '—'}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: g.is_active ? 'var(--green)18' : 'var(--text-dim)18',
                      color: g.is_active ? 'var(--green)' : 'var(--text-dim)',
                      border: `1px solid ${g.is_active ? 'var(--green)' : 'var(--text-dim)'}44`,
                    }}>
                      {g.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    {canEdit && <>
                      <button className="btn btn-xs btn-secondary" onClick={() => openEdit(g)} title="Edit">
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      <button className="btn btn-xs btn-secondary" onClick={() => toggleActive(g)} title={g.is_active ? 'Deactivate' : 'Activate'}>
                        <span className="material-icons" style={{ fontSize: 13 }}>{g.is_active ? 'toggle_on' : 'toggle_off'}</span>
                      </button>
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(g)} title="Delete">
                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                      </button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalDialog open={showForm} onClose={() => setShowForm(false)} title={editGrade ? 'Edit Grade' : 'New Employee Grade'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Grade Name *</label>
            <input className="form-control" value={form.grade_name} onChange={e => set('grade_name', e.target.value)} placeholder="e.g. Grade A" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Default Base Pay</label>
              <input type="number" className="form-control" min="0" value={form.default_base_pay} onChange={e => set('default_base_pay', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Currency</label>
              <select className="form-control" value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option>USD</option>
                <option>ZiG</option>
                <option>ZWL</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="grade_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <label htmlFor="grade_active" style={{ margin: 0, cursor: 'pointer' }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDelete}
        title="Delete Grade" message={`Delete "${confirmDel?.grade_name}"? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'} danger loading={deleting}
      />
    </div>
  )
}
