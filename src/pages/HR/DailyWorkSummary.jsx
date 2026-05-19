import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'groups',    label: 'Groups',     icon: 'group' },
  { id: 'summaries', label: 'Submissions', icon: 'description' },
]

const emptyGroup = { name: '', description: '', send_email_to: '', email_subject: 'Daily Work Summary', is_active: true }
const emptySummary = { employee_id: '', group_id: '', summary_date: new Date().toISOString().slice(0, 10), summary_text: '', hours_worked: '' }

export default function DailyWorkSummary() {
  const canEdit = useCanEdit('hr', 'daily-work-summary')
  const [tab, setTab] = useState('groups')
  const [groups, setGroups] = useState([])
  const [summaries, setSummaries] = useState([])
  const [employees, setEmployees] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [memberModal, setMemberModal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [gRes, sRes, eRes, mRes] = await Promise.all([
      supabase.from('daily_work_summary_groups').select('*').order('name'),
      supabase.from('daily_work_summaries').select('*, employees(name), daily_work_summary_groups(name)').order('summary_date', { ascending: false }).limit(100),
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
      supabase.from('daily_work_summary_group_members').select('*, employees(name)'),
    ])
    if (gRes.error) toast.error(gRes.error.message)
    setGroups(gRes.data || [])
    setSummaries(sRes.data || [])
    setEmployees(eRes.data || [])
    setMembers(mRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openGroupModal = (g = null) => setModal({ mode: 'group', data: g ? { ...g } : { ...emptyGroup } })
  const openSummaryModal = (s = null) => setModal({ mode: 'summary', data: s ? { ...s } : { ...emptySummary } })

  const saveGroup = async () => {
    const { id, ...rest } = modal.data
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('daily_work_summary_groups').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('daily_work_summary_groups').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Group saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const saveSummary = async () => {
    const { id, employees: _e, daily_work_summary_groups: _g, ...rest } = modal.data
    const payload = {
      ...rest,
      group_id: rest.group_id || null,
      hours_worked: rest.hours_worked === '' ? null : Number(rest.hours_worked),
    }
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('daily_work_summaries').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('daily_work_summaries').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Summary saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const addMember = async (groupId, employeeId) => {
    if (!employeeId) return
    const { error } = await supabase.from('daily_work_summary_group_members').insert({
      id: crypto.randomUUID(), group_id: groupId, employee_id: employeeId,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Member added')
    fetchAll()
  }

  const removeMember = async (memberId) => {
    const { error } = await supabase.from('daily_work_summary_group_members').delete().eq('id', memberId)
    if (error) { toast.error(error.message); return }
    toast.success('Member removed')
    fetchAll()
  }

  const doDelete = async () => {
    const { error } = await supabase.from(deleting._table).delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))

  if (loading) return <div><PageHeader title="Daily Work Summary" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  const groupMembers = memberModal ? members.filter(m => m.group_id === memberModal.id) : []
  const availableEmps = memberModal ? employees.filter(e => !groupMembers.some(m => m.employee_id === e.id)) : []

  return (
    <div>
      <PageHeader title="Daily Work Summary" subtitle="Group employees, collect daily summaries, send digest emails">
        {canEdit && tab === 'groups'    && <button className="btn btn-primary btn-sm" onClick={() => openGroupModal()}><span className="material-icons">add</span>New Group</button>}
        {canEdit && tab === 'summaries' && <button className="btn btn-primary btn-sm" onClick={() => openSummaryModal()}><span className="material-icons">add</span>New Summary</button>}
      </PageHeader>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'groups' && (
        <div style={{ marginTop: 16 }}>
          {groups.length === 0
            ? <EmptyState icon="group" message="No groups defined" action={canEdit ? { label: 'New Group', onClick: () => openGroupModal() } : null} />
            : (
              <table className="data-table">
                <thead><tr><th>Name</th><th>Email Recipients</th><th>Members</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {groups.map(g => {
                    const memberCount = members.filter(m => m.group_id === g.id).length
                    return (
                      <tr key={g.id}>
                        <td style={{ fontWeight: 600 }}>{g.name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{g.send_email_to || '—'}</td>
                        <td><button className="btn btn-secondary btn-xs" onClick={() => setMemberModal(g)}>Manage ({memberCount})</button></td>
                        <td><span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: g.is_active ? 'var(--green)22' : 'var(--border)', color: g.is_active ? 'var(--green)' : 'var(--text-dim)' }}>{g.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openGroupModal(g)}>Edit</button>}
                            {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...g, _table: 'daily_work_summary_groups' })}>Del</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}

      {tab === 'summaries' && (
        <div style={{ marginTop: 16 }}>
          {summaries.length === 0
            ? <EmptyState icon="description" message="No work summaries submitted" action={canEdit ? { label: 'New Summary', onClick: () => openSummaryModal() } : null} />
            : (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Employee</th><th>Group</th><th>Hours</th><th>Summary</th><th /></tr></thead>
                <tbody>
                  {summaries.map(s => (
                    <tr key={s.id}>
                      <td>{s.summary_date}</td>
                      <td>{s.employees?.name}</td>
                      <td>{s.daily_work_summary_groups?.name || '—'}</td>
                      <td>{s.hours_worked ?? '—'}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{s.summary_text}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openSummaryModal(s)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...s, _table: 'daily_work_summaries' })}>Del</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Group Modal */}
      <ModalDialog open={modal?.mode === 'group'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Group' : 'New Group'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={modal?.data?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={modal?.data?.description || ''} onChange={e => setF('description', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Email Recipients (comma-separated)</label>
            <input className="form-control" value={modal?.data?.send_email_to || ''} onChange={e => setF('send_email_to', e.target.value)} placeholder="manager@example.com, hr@example.com" disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Email Subject</label>
            <input className="form-control" value={modal?.data?.email_subject || ''} onChange={e => setF('email_subject', e.target.value)} disabled={!canEdit} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={modal?.data?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
            <span>Active</span>
          </label>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveGroup} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Summary Modal */}
      <ModalDialog open={modal?.mode === 'summary'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Summary' : 'New Daily Summary'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={modal?.data?.employee_id || ''} onChange={e => setF('employee_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Group</label>
              <select className="form-control" value={modal?.data?.group_id || ''} onChange={e => setF('group_id', e.target.value)} disabled={!canEdit}>
                <option value="">None</option>
                {groups.filter(g => g.is_active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Summary Date *</label>
              <input className="form-control" type="date" value={modal?.data?.summary_date || ''} onChange={e => setF('summary_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Hours Worked</label>
              <input className="form-control" type="number" step="0.25" value={modal?.data?.hours_worked || ''} onChange={e => setF('hours_worked', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Summary *</label>
            <textarea className="form-control" rows={6} value={modal?.data?.summary_text || ''} onChange={e => setF('summary_text', e.target.value)} placeholder="What did you work on today?" disabled={!canEdit} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveSummary} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Member Management Modal */}
      <ModalDialog open={!!memberModal} onClose={() => setMemberModal(null)} title={`Manage Members — ${memberModal?.name || ''}`} size="md">
        <div style={{ marginBottom: 14, display: 'flex', gap: 8 }}>
          <select className="form-control" id="add-member-select" style={{ flex: 1 }}>
            <option value="">Add an employee…</option>
            {availableEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => {
              const sel = document.getElementById('add-member-select')
              if (sel.value) { addMember(memberModal.id, sel.value); sel.value = '' }
            }}>Add</button>
          )}
        </div>
        {groupMembers.length === 0
          ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>No members yet</div>
          : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {groupMembers.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span>{m.employees?.name}</span>
                  {canEdit && <button className="btn btn-danger btn-xs" onClick={() => removeMember(m.id)}>Remove</button>}
                </div>
              ))}
            </div>
          )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setMemberModal(null)}>Close</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete" message="Delete this record?" />
    </div>
  )
}
