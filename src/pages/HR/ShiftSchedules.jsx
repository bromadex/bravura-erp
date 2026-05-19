import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

const empty = { name: '', description: '', rotation_pattern: '', rotation_days: 1, start_date: '', is_active: true }

function buildPreview(pattern, days, start, length = 30) {
  if (!pattern || !start) return []
  const shifts = pattern.split(',').map(s => s.trim()).filter(Boolean)
  if (shifts.length === 0) return []
  const startDate = new Date(start)
  const out = []
  for (let i = 0; i < length; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const rotationCycle = Math.floor(i / days)
    const shift = shifts[rotationCycle % shifts.length]
    out.push({ date: d.toISOString().slice(0, 10), shift })
  }
  return out
}

export default function ShiftSchedules() {
  const canEdit = useCanEdit('hr', 'shift-schedules')
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('shift_schedules').select('*').order('name')
    if (error) toast.error(error.message)
    setSchedules(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const openModal = (s = null) => setModal(s ? { ...s } : { ...empty })

  const save = async () => {
    const { id, ...rest } = modal
    const payload = { ...rest, start_date: rest.start_date || null, rotation_days: Number(rest.rotation_days) }
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('shift_schedules').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('shift_schedules').insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Saved')
      setModal(null)
      fetch()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from('shift_schedules').delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetch()
  }

  const setF = (k, v) => setModal(m => ({ ...m, [k]: v }))

  const modalPreview = modal ? buildPreview(modal.rotation_pattern, modal.rotation_days, modal.start_date, 14) : []
  const fullPreview = previewing ? buildPreview(previewing.rotation_pattern, previewing.rotation_days, previewing.start_date, 30) : []

  if (loading) return <div><PageHeader title="Shift Schedules" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Shift Schedules" subtitle="Define recurring rotating shift patterns">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => openModal()}>
            <span className="material-icons">add</span>New Schedule
          </button>
        )}
      </PageHeader>

      {schedules.length === 0
        ? <EmptyState icon="rotate_right" message="No shift schedules defined" action={canEdit ? { label: 'New Schedule', onClick: () => openModal() } : null} />
        : (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {schedules.map(s => (
              <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                    {s.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{s.description}</div>}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: s.is_active ? 'var(--green)22' : 'var(--border)', color: s.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, flexWrap: 'wrap' }}>
                  <div><strong>Pattern:</strong> {s.rotation_pattern}</div>
                  <div><strong>Cycle:</strong> {s.rotation_days}d</div>
                  {s.start_date && <div><strong>Start:</strong> {s.start_date}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-xs" onClick={() => setPreviewing(s)}>Preview 30d</button>
                  {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openModal(s)}>Edit</button>}
                  {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting(s)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Edit Modal */}
      <ModalDialog open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Schedule' : 'New Shift Schedule'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input className="form-control" value={modal?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={modal?.description || ''} onChange={e => setF('description', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Rotation Pattern * (comma-separated shift codes)</label>
            <input className="form-control" value={modal?.rotation_pattern || ''} onChange={e => setF('rotation_pattern', e.target.value)} placeholder="e.g. Morning,Afternoon,Night" disabled={!canEdit} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Days per Shift</label>
              <input className="form-control" type="number" min={1} value={modal?.rotation_days ?? 1} onChange={e => setF('rotation_days', Number(e.target.value))} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input className="form-control" type="date" value={modal?.start_date || ''} onChange={e => setF('start_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {modalPreview.length > 0 && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>Preview (next 14 days)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {modalPreview.map(p => (
                  <div key={p.date} style={{ background: 'var(--surface)', padding: 6, borderRadius: 4, textAlign: 'center', fontSize: 10 }}>
                    <div style={{ color: 'var(--text-dim)' }}>{p.date.slice(5)}</div>
                    <div style={{ fontWeight: 700, marginTop: 2 }}>{p.shift}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {/* Full Preview Modal */}
      <ModalDialog open={!!previewing} onClose={() => setPreviewing(null)} title={`${previewing?.name} — 30 Day Preview`} size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {fullPreview.map(p => (
            <div key={p.date} style={{ background: 'var(--surface2)', padding: 8, borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
              <div style={{ color: 'var(--text-dim)' }}>{new Date(p.date).toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div style={{ color: 'var(--text-dim)' }}>{p.date.slice(5)}</div>
              <div style={{ fontWeight: 700, marginTop: 4, color: 'var(--gold)' }}>{p.shift}</div>
            </div>
          ))}
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setPreviewing(null)}>Close</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} title="Delete Schedule" message={`Delete "${deleting?.name}"?`} />
    </div>
  )
}
