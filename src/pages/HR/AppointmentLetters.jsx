import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, EmptyState, Spinner, ConfirmDialog, ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'templates', label: 'Templates', icon: 'description' },
  { id: 'letters',   label: 'Letters',   icon: 'mail' },
]

const VARS = ['{{employee_name}}', '{{designation}}', '{{department}}', '{{joining_date}}', '{{salary}}', '{{letter_date}}', '{{company_name}}']

const STATUS_COLOR = { Draft: 'var(--text-dim)', Issued: 'var(--blue)', Accepted: 'var(--green)', Declined: 'var(--red)' }

const emptyTpl = { name: '', intro: '', body: '', outro: '', is_active: true }
const emptyLetter = {
  employee_id: '', template_id: '',
  letter_date: new Date().toISOString().slice(0, 10),
  designation: '', department: '', joining_date: '', salary_text: '', status: 'Draft',
}

export default function AppointmentLetters() {
  const canEdit = useCanEdit('hr', 'appointment-letters')
  const [tab, setTab] = useState('templates')
  const [templates, setTemplates] = useState([])
  const [letters, setLetters] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [preview, setPreview] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [tplRes, letRes, empRes] = await Promise.all([
      supabase.from('appointment_letter_templates').select('*').order('name'),
      supabase.from('appointment_letters').select('*, employees(name), appointment_letter_templates(name)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name').eq('status', 'Active').order('name'),
    ])
    if (tplRes.error) toast.error(tplRes.error.message)
    setTemplates(tplRes.data || [])
    setLetters(letRes.data || [])
    setEmployees(empRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openTplModal    = (t = null) => setModal({ mode: 'tpl',    data: t ? { ...t } : { ...emptyTpl } })
  const openLetterModal = (l = null) => setModal({ mode: 'letter', data: l ? { ...l } : { ...emptyLetter } })

  const interpolate = (text, vars) => {
    if (!text) return ''
    return text
      .replace(/\{\{employee_name\}\}/g,  vars.employee_name  || '')
      .replace(/\{\{designation\}\}/g,    vars.designation    || '')
      .replace(/\{\{department\}\}/g,     vars.department     || '')
      .replace(/\{\{joining_date\}\}/g,   vars.joining_date   || '')
      .replace(/\{\{salary\}\}/g,         vars.salary_text    || '')
      .replace(/\{\{letter_date\}\}/g,    vars.letter_date    || '')
      .replace(/\{\{company_name\}\}/g,   'Bravura Mining')
  }

  const generateContent = (letterData) => {
    const tpl = templates.find(t => t.id === letterData.template_id)
    if (!tpl) return ''
    const emp = employees.find(e => e.id === letterData.employee_id)
    const vars = { ...letterData, employee_name: emp?.name || '' }
    return [interpolate(tpl.intro, vars), interpolate(tpl.body, vars), interpolate(tpl.outro, vars)]
      .filter(Boolean).join('\n\n')
  }

  const openPreview = (letter) => {
    const content = letter.generated_content || generateContent(letter)
    setPreview({ ...letter, generated_content: content })
  }

  const saveTpl = async () => {
    const { id, ...rest } = modal.data
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('appointment_letter_templates').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('appointment_letter_templates').insert({ ...rest, id: crypto.randomUUID() })
        if (error) throw error
      }
      toast.success('Template saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const saveLetter = async () => {
    const { id, employees: _e, appointment_letter_templates: _t, ...rest } = modal.data
    const generated_content = generateContent(rest)
    setSaving(true)
    try {
      if (id) {
        const { error } = await supabase.from('appointment_letters').update({ ...rest, generated_content, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('appointment_letters').insert({ ...rest, id: crypto.randomUUID(), ref_number: `APL-${Date.now()}`, generated_content })
        if (error) throw error
      }
      toast.success('Letter saved')
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const doDelete = async () => {
    const { error } = await supabase.from(deleting._table).delete().eq('id', deleting.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleting(null)
    fetchAll()
  }

  const setF = (k, v) => setModal(m => ({ ...m, data: { ...m.data, [k]: v } }))

  if (loading) return <div><PageHeader title="Appointment Letters" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader title="Appointment Letters" subtitle="Manage letter templates and generate employee appointment letters">
        {canEdit && tab === 'templates' && (
          <button className="btn btn-primary btn-sm" onClick={() => openTplModal()}>
            <span className="material-icons">add</span>New Template
          </button>
        )}
        {canEdit && tab === 'letters' && (
          <button className="btn btn-primary btn-sm" onClick={() => openLetterModal()}>
            <span className="material-icons">add</span>Generate Letter
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'templates' && (
        <div style={{ marginTop: 16 }}>
          {templates.length === 0
            ? <EmptyState icon="description" message="No templates defined" action={canEdit ? { label: 'New Template', onClick: () => openTplModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Has Intro</th><th>Has Outro</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>{t.intro ? '✓' : '—'}</td>
                      <td>{t.outro ? '✓' : '—'}</td>
                      <td>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, background: t.is_active ? 'var(--green)22' : 'var(--border)', color: t.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openTplModal(t)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...t, _table: 'appointment_letter_templates' })}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {tab === 'letters' && (
        <div style={{ marginTop: 16 }}>
          {letters.length === 0
            ? <EmptyState icon="mail" message="No appointment letters generated" action={canEdit ? { label: 'Generate Letter', onClick: () => openLetterModal() } : null} />
            : (
              <table className="data-table">
                <thead>
                  <tr><th>Ref</th><th>Employee</th><th>Template</th><th>Date</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {letters.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{l.ref_number}</td>
                      <td>{l.employees?.name}</td>
                      <td>{l.appointment_letter_templates?.name || '—'}</td>
                      <td>{l.letter_date}</td>
                      <td><span style={{ color: STATUS_COLOR[l.status], fontWeight: 600, fontSize: 12 }}>{l.status}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-xs" onClick={() => openPreview(l)}>Preview</button>
                          {canEdit && <button className="btn btn-secondary btn-xs" onClick={() => openLetterModal(l)}>Edit</button>}
                          {canEdit && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ...l, _table: 'appointment_letters' })}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}

      {/* Template Modal */}
      <ModalDialog open={modal?.mode === 'tpl'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Template' : 'New Template'} size="lg">
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Variables:{' '}
          {VARS.map(v => (
            <code key={v} style={{ background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px', margin: '0 2px', fontSize: 11 }}>{v}</code>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Template Name *</label>
            <input className="form-control" value={modal?.data?.name || ''} onChange={e => setF('name', e.target.value)} disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Intro (optional)</label>
            <textarea className="form-control" rows={2} value={modal?.data?.intro || ''} onChange={e => setF('intro', e.target.value)} disabled={!canEdit} placeholder="Opening paragraph…" />
          </div>
          <div className="form-group">
            <label>Body *</label>
            <textarea className="form-control" rows={7} value={modal?.data?.body || ''} onChange={e => setF('body', e.target.value)} disabled={!canEdit} placeholder="Main letter content…" />
          </div>
          <div className="form-group">
            <label>Outro (optional)</label>
            <textarea className="form-control" rows={2} value={modal?.data?.outro || ''} onChange={e => setF('outro', e.target.value)} disabled={!canEdit} placeholder="Closing paragraph…" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={modal?.data?.is_active ?? true} onChange={e => setF('is_active', e.target.checked)} disabled={!canEdit} />
            <span>Active</span>
          </label>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveTpl} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Letter Modal */}
      <ModalDialog open={modal?.mode === 'letter'} onClose={() => setModal(null)} title={modal?.data?.id ? 'Edit Letter' : 'Generate Letter'} size="md">
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
              <label>Template *</label>
              <select className="form-control" value={modal?.data?.template_id || ''} onChange={e => setF('template_id', e.target.value)} disabled={!canEdit}>
                <option value="">Select…</option>
                {templates.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Letter Date</label>
              <input className="form-control" type="date" value={modal?.data?.letter_date || ''} onChange={e => setF('letter_date', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Joining Date</label>
              <input className="form-control" type="date" value={modal?.data?.joining_date || ''} onChange={e => setF('joining_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label>Designation</label>
              <input className="form-control" value={modal?.data?.designation || ''} onChange={e => setF('designation', e.target.value)} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input className="form-control" value={modal?.data?.department || ''} onChange={e => setF('department', e.target.value)} disabled={!canEdit} />
            </div>
          </div>
          <div className="form-group">
            <label>Salary Text</label>
            <input className="form-control" value={modal?.data?.salary_text || ''} onChange={e => setF('salary_text', e.target.value)} placeholder="e.g. USD 5,000 per month" disabled={!canEdit} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={modal?.data?.status || 'Draft'} onChange={e => setF('status', e.target.value)} disabled={!canEdit}>
              {['Draft', 'Issued', 'Accepted', 'Declined'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveLetter} disabled={saving || !canEdit}>{saving ? 'Saving…' : 'Save'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Preview Modal */}
      <ModalDialog open={!!preview} onClose={() => setPreview(null)} title={`Appointment Letter — ${preview?.employees?.name || ''}`} size="lg">
        <div style={{ background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 4, padding: 32, fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.8, minHeight: 400, whiteSpace: 'pre-wrap' }}>
          {preview?.generated_content || '(No content — ensure a template is selected and the template has a body)'}
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setPreview(null)}>Close</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Confirm Delete"
        message="Delete this record? This cannot be undone."
      />
    </div>
  )
}
