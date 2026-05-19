// src/pages/HR/ExitInterviews.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog, TabNav,
} from '../../components/ui'

const STATUSES     = ['Pending', 'Scheduled', 'Completed', 'Cancelled']
const SATISFACTION = ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied', 'Very Dissatisfied']

const statusColor = s => ({
  Pending: 'var(--yellow)', Scheduled: 'var(--blue)',
  Completed: 'var(--green)', Cancelled: 'var(--text-dim)',
}[s] || 'var(--text-dim)')

const satisfactionColor = s => ({
  'Very Satisfied': 'var(--green)', 'Satisfied': 'var(--teal)',
  'Neutral': 'var(--blue)', 'Dissatisfied': 'var(--yellow)',
  'Very Dissatisfied': 'var(--red)',
}[s] || 'var(--text-dim)')

function StarDisplay({ rating }) {
  if (!rating) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  return (
    <span>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= rating ? 'var(--gold)' : 'var(--text-dim)', fontSize: 15 }}>★</span>
      ))}
    </span>
  )
}

function StarSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{ fontSize: 28, cursor: 'pointer', color: i <= (hovered || value) ? 'var(--gold)' : 'var(--text-dim)', transition: 'color .1s' }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(i)}
        >★</span>
      ))}
    </span>
  )
}

const emptyForm = () => ({
  employee_id: '', separation_id: '', interview_date: '', interviewer_id: '',
  status: 'Pending', rating: 0, reason_for_leaving: '', overall_satisfaction: '',
  feedback_on_manager: '', feedback_on_company: '', suggestions: '',
  would_rejoin: null, notes: '',
})

const FORM_TABS = [
  { id: 'basic',    label: 'Basic Info' },
  { id: 'feedback', label: 'Feedback'   },
  { id: 'outcome',  label: 'Outcome'    },
]

export default function ExitInterviews() {
  const { employees } = useHR()

  const [interviews,     setInterviews]     = useState([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [statusFilter,   setStatusFilter]   = useState('All')

  const [showAdd,        setShowAdd]        = useState(false)
  const [editItem,       setEditItem]       = useState(null)
  const [viewItem,       setViewItem]       = useState(null)
  const [deleteItem,     setDeleteItem]     = useState(null)
  const [form,           setForm]           = useState(emptyForm())
  const [activeTab,      setActiveTab]      = useState('basic')
  const [empSeparations, setEmpSeparations] = useState([])

  const fetchInterviews = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('exit_interviews')
      .select('*, emp:employees!exit_interviews_employee_id_fkey(id,name,designation_id,hire_date), interviewer:employees!exit_interviews_interviewer_id_fkey(id,name)')
      .order('interview_date', { ascending: false })
    if (error) toast.error('Failed to load exit interviews')
    setInterviews(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchInterviews() }, [fetchInterviews])

  const fetchEmpSeparations = useCallback(async (empId) => {
    if (!empId) { setEmpSeparations([]); return }
    const { data } = await supabase
      .from('employee_separations')
      .select('id,reason,relieving_date,separation_number')
      .eq('employee_id', empId)
      .order('created_at', { ascending: false })
    setEmpSeparations(data || [])
  }, [])

  const openAdd = () => {
    setForm(emptyForm())
    setActiveTab('basic')
    setEditItem(null)
    setEmpSeparations([])
    setShowAdd(true)
  }

  const openEdit = (item) => {
    setForm({
      employee_id:        item.employee_id        || '',
      separation_id:      item.separation_id      || '',
      interview_date:     item.interview_date     || '',
      interviewer_id:     item.interviewer_id     || '',
      status:             item.status             || 'Pending',
      rating:             item.rating             || 0,
      reason_for_leaving: item.reason_for_leaving || '',
      overall_satisfaction: item.overall_satisfaction || '',
      feedback_on_manager: item.feedback_on_manager || '',
      feedback_on_company: item.feedback_on_company || '',
      suggestions:        item.suggestions        || '',
      would_rejoin:       item.would_rejoin,
      notes:              item.notes              || '',
    })
    fetchEmpSeparations(item.employee_id)
    setActiveTab('basic')
    setEditItem(item)
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.employee_id)    { toast.error('Employee is required');       return }
    if (!form.interview_date) { toast.error('Interview date is required'); return }
    if (!form.status)         { toast.error('Status is required');         return }
    setSaving(true)
    try {
      const payload = {
        employee_id:          form.employee_id,
        separation_id:        form.separation_id      || null,
        interview_date:       form.interview_date,
        interviewer_id:       form.interviewer_id     || null,
        status:               form.status,
        rating:               form.rating             || null,
        reason_for_leaving:   form.reason_for_leaving || null,
        overall_satisfaction: form.overall_satisfaction || null,
        feedback_on_manager:  form.feedback_on_manager  || null,
        feedback_on_company:  form.feedback_on_company  || null,
        suggestions:          form.suggestions          || null,
        would_rejoin:         form.would_rejoin,
        notes:                form.notes               || null,
        updated_at:           new Date().toISOString(),
      }
      if (editItem) {
        const { error } = await supabase.from('exit_interviews').update(payload).eq('id', editItem.id)
        if (error) throw error
        toast.success('Interview updated')
      } else {
        const { error } = await supabase.from('exit_interviews').insert([{
          id: crypto.randomUUID(), ...payload, created_at: new Date().toISOString(),
        }])
        if (error) throw error
        toast.success('Interview created')
      }
      setShowAdd(false)
      setViewItem(null)
      fetchInterviews()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('exit_interviews').delete().eq('id', deleteItem.id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    setDeleteItem(null)
    fetchInterviews()
  }

  const allEmployees    = employees || []
  const activeEmployees = allEmployees.filter(e => e.status === 'Active' || e.status === 'active')
  const filtered        = statusFilter === 'All' ? interviews : interviews.filter(i => i.status === statusFilter)
  const getEmpName      = id => allEmployees.find(e => e.id === id)?.name || '—'

  const kpi = {
    total:     interviews.length,
    pending:   interviews.filter(i => i.status === 'Pending').length,
    completed: interviews.filter(i => i.status === 'Completed').length,
    avgRating: (() => {
      const rated = interviews.filter(i => i.rating)
      return rated.length ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1) : '—'
    })(),
  }

  return (
    <div>
      <PageHeader title="Exit Interviews">
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          <span className="material-icons">add</span> New Interview
        </button>
      </PageHeader>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total',      value: kpi.total,     icon: 'people',       col: undefined    },
          { label: 'Pending',    value: kpi.pending,   icon: 'schedule',     col: 'var(--yellow)' },
          { label: 'Completed',  value: kpi.completed, icon: 'check_circle', col: 'var(--green)'  },
          { label: 'Avg Rating', value: kpi.avgRating, icon: 'star',         col: 'var(--gold)'   },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-icons" style={{ color: k.col || 'var(--text-dim)', fontSize: 22 }}>{k.icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${s === 'All' ? 'var(--gold)' : statusColor(s)}`,
              background: statusFilter === s ? (s === 'All' ? 'var(--gold)' : statusColor(s)) : 'transparent',
              color: statusFilter === s ? '#fff' : (s === 'All' ? 'var(--gold)' : statusColor(s)),
            }}
          >{s}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="exit_to_app" message="No exit interviews found." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Interview Date</th>
                <th>Interviewer</th>
                <th>Status</th>
                <th>Rating</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setViewItem(item)}>
                  <td style={{ fontWeight: 600 }}>{item.emp?.name || getEmpName(item.employee_id)}</td>
                  <td>{item.interview_date || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>{item.interviewer?.name || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <StatusBadge status={item.status?.toLowerCase()} label={item.status} />
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <StarDisplay rating={item.rating} />
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-xs btn-secondary" onClick={() => setViewItem(item)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>visibility</span>
                    </button>
                    <button className="btn btn-xs btn-secondary" onClick={() => openEdit(item)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                    <button className="btn btn-xs btn-danger" onClick={() => setDeleteItem(item)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      <ModalDialog
        open={!!viewItem}
        onClose={() => setViewItem(null)}
        title="Exit Interview"
        size="xl"
      >
        {viewItem && (
          <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                  {viewItem.emp?.name || getEmpName(viewItem.employee_id)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
                  {viewItem.emp?.designation_id ? `Designation ID: ${viewItem.emp.designation_id}` : ''}
                  {viewItem.emp?.hire_date ? ` · Joined ${viewItem.emp.hire_date}` : ''}
                </div>
              </div>
              <StatusBadge status={viewItem.status?.toLowerCase()} label={viewItem.status} />
            </div>

            {/* Two-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <ViewField label="Interview Date" value={viewItem.interview_date} />
              <ViewField label="Interviewer" value={viewItem.interviewer?.name} />
              <ViewField label="Rating">
                <StarDisplay rating={viewItem.rating} />
              </ViewField>
              <ViewField label="Overall Satisfaction">
                {viewItem.overall_satisfaction ? (
                  <span style={{
                    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: satisfactionColor(viewItem.overall_satisfaction) + '22',
                    color: satisfactionColor(viewItem.overall_satisfaction),
                  }}>
                    {viewItem.overall_satisfaction}
                  </span>
                ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
              </ViewField>
              <ViewField label="Would Rejoin">
                {viewItem.would_rejoin === true && (
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--green)22', color: 'var(--green)' }}>Yes</span>
                )}
                {viewItem.would_rejoin === false && (
                  <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--red)22', color: 'var(--red)' }}>No</span>
                )}
                {viewItem.would_rejoin === null && <span style={{ color: 'var(--text-dim)' }}>—</span>}
              </ViewField>
              <ViewField label="Reason for Leaving" value={viewItem.reason_for_leaving} />
            </div>

            {viewItem.feedback_on_manager && <ViewFieldFull label="Feedback on Manager" value={viewItem.feedback_on_manager} />}
            {viewItem.feedback_on_company && <ViewFieldFull label="Feedback on Company" value={viewItem.feedback_on_company} />}
            {viewItem.suggestions         && <ViewFieldFull label="Suggestions"         value={viewItem.suggestions}         />}
            {viewItem.notes               && <ViewFieldFull label="Notes"               value={viewItem.notes}               />}
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setViewItem(null)}>Close</button>
          <button className="btn btn-primary" onClick={() => { openEdit(viewItem); setViewItem(null) }}>
            <span className="material-icons" style={{ fontSize: 15 }}>edit</span> Edit
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── ADD / EDIT MODAL ── */}
      <ModalDialog
        open={showAdd}
        onClose={() => { setShowAdd(false); setEditItem(null) }}
        title={editItem ? 'Edit Exit Interview' : 'New Exit Interview'}
        size="xl"
      >
        <div style={{ padding: '0 24px' }}>
          <TabNav tabs={FORM_TABS} active={activeTab} onChange={setActiveTab} />
        </div>

        <div style={{ padding: '16px 24px 0', minHeight: 320 }}>
          {/* ── Basic Info ── */}
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Employee *</label>
                <select
                  className="form-control"
                  value={form.employee_id}
                  onChange={e => { setForm(f => ({ ...f, employee_id: e.target.value, separation_id: '' })); fetchEmpSeparations(e.target.value) }}
                >
                  <option value="">— Select employee —</option>
                  {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Interview Date *</label>
                  <input type="date" className="form-control" value={form.interview_date} onChange={e => setForm(f => ({ ...f, interview_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Interviewer</label>
                  <select className="form-control" value={form.interviewer_id} onChange={e => setForm(f => ({ ...f, interviewer_id: e.target.value }))}>
                    <option value="">— Select —</option>
                    {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Separation Record</label>
                  <select
                    className="form-control"
                    value={form.separation_id}
                    onChange={e => setForm(f => ({ ...f, separation_id: e.target.value }))}
                    disabled={!form.employee_id}
                  >
                    <option value="">— None —</option>
                    {empSeparations.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.separation_number || s.id}{s.relieving_date ? ` (${s.relieving_date})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status *</label>
                  <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Feedback ── */}
          {activeTab === 'feedback' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Reason for Leaving</label>
                <textarea className="form-control" rows={3} value={form.reason_for_leaving} onChange={e => setForm(f => ({ ...f, reason_for_leaving: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Overall Satisfaction</label>
                <select className="form-control" value={form.overall_satisfaction} onChange={e => setForm(f => ({ ...f, overall_satisfaction: e.target.value }))}>
                  <option value="">— Select —</option>
                  {SATISFACTION.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Feedback on Manager</label>
                <textarea className="form-control" rows={3} value={form.feedback_on_manager} onChange={e => setForm(f => ({ ...f, feedback_on_manager: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Feedback on Company</label>
                <textarea className="form-control" rows={3} value={form.feedback_on_company} onChange={e => setForm(f => ({ ...f, feedback_on_company: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Suggestions</label>
                <textarea className="form-control" rows={3} value={form.suggestions} onChange={e => setForm(f => ({ ...f, suggestions: e.target.value }))} />
              </div>
            </div>
          )}

          {/* ── Outcome ── */}
          {activeTab === 'outcome' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Rating (1–5)</label>
                <StarSelector value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} />
                {form.rating > 0 && (
                  <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--text-dim)' }}>
                    {form.rating} star{form.rating > 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Would Rejoin</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[{ label: 'Yes', val: true }, { label: 'No', val: false }, { label: 'Not specified', val: null }].map(opt => (
                    <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="would_rejoin" checked={form.would_rejoin === opt.val} onChange={() => setForm(f => ({ ...f, would_rejoin: opt.val }))} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          )}
        </div>

        {/* In-modal tab prev/next */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 8, borderTop: '1px solid var(--border)', marginTop: 16 }}>
          {activeTab !== 'basic' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab(FORM_TABS[FORM_TABS.findIndex(t => t.id === activeTab) - 1]?.id)}>
              ← Back
            </button>
          )}
          {activeTab !== 'outcome' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab(FORM_TABS[FORM_TABS.findIndex(t => t.id === activeTab) + 1]?.id)}>
              Next →
            </button>
          )}
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditItem(null) }}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Exit Interview"
        message={`Delete the exit interview for ${deleteItem?.emp?.name || getEmpName(deleteItem?.employee_id)}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

// ── Small view helpers ─────────────────────────────────────────
function ViewField({ label, value, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text)' }}>{children ?? (value || '—')}</div>
    </div>
  )
}

function ViewFieldFull({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', background: 'var(--surface)', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--border)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}
