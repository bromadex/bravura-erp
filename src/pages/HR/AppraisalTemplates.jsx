// src/pages/HR/AppraisalTemplates.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, EmptyState, TabNav, ModalDialog, ModalActions, ConfirmDialog, Spinner,
} from '../../components/ui'

export default function AppraisalTemplates() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('hr', 'performance-reviews')

  const [templates, setTemplates] = useState([])
  const [kras,      setKras]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)

  // List modal
  const [showNew,  setShowNew]   = useState(false)
  const [newForm,  setNewForm]   = useState({ template_title: '', description: '', is_active: true })

  // Detail modal
  const [detail,      setDetail]      = useState(null)
  const [activeTab,   setActiveTab]   = useState('goals')
  const [goals,       setGoals]       = useState([])
  const [loadingGoals, setLoadingGoals] = useState(false)
  const [goalForm,    setGoalForm]    = useState({ kra_id: '', kra_title: '', per_weightage: 10, sort_order: 0 })
  const [editGoal,    setEditGoal]    = useState(null)
  const [confirmDelGoal, setConfirmDelGoal] = useState(null)
  const [detailForm,  setDetailForm]  = useState({})
  const [confirmDel,  setConfirmDel]  = useState(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('appraisal_templates')
      .select('*, appraisal_template_goals(id)')
      .order('template_title')
    setTemplates(data || [])
    setLoading(false)
  }, [])

  const fetchKRAs = useCallback(async () => {
    const { data } = await supabase.from('kras').select('id, title').eq('is_active', true).order('title')
    setKras(data || [])
  }, [])

  const fetchGoals = useCallback(async (templateId) => {
    setLoadingGoals(true)
    const { data } = await supabase
      .from('appraisal_template_goals')
      .select('*, kras(title)')
      .eq('template_id', templateId)
      .order('sort_order')
    setGoals(data || [])
    setLoadingGoals(false)
  }, [])

  useEffect(() => { fetchTemplates(); fetchKRAs() }, [fetchTemplates, fetchKRAs])

  const openDetail = (t) => {
    setDetail(t)
    setDetailForm({ template_title: t.template_title, description: t.description || '', is_active: t.is_active })
    setActiveTab('goals')
    setGoalForm({ kra_id: '', kra_title: '', per_weightage: 10, sort_order: goals.length })
    setEditGoal(null)
    fetchGoals(t.id)
  }

  const handleCreate = async () => {
    if (!newForm.template_title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      await supabase.from('appraisal_templates').insert([{
        id: crypto.randomUUID(), template_title: newForm.template_title,
        description: newForm.description, is_active: newForm.is_active,
        created_by: user?.full_name || '',
      }])
      toast.success('Template created')
      setShowNew(false)
      setNewForm({ template_title: '', description: '', is_active: true })
      fetchTemplates()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleSaveDetail = async () => {
    if (!detailForm.template_title?.trim()) { toast.error('Title required'); return }
    setSaving(true)
    await supabase.from('appraisal_templates').update({ template_title: detailForm.template_title, description: detailForm.description, is_active: detailForm.is_active }).eq('id', detail.id)
    toast.success('Template saved')
    setSaving(false)
    fetchTemplates()
  }

  const handleDeleteTemplate = async () => {
    await supabase.from('appraisal_templates').delete().eq('id', confirmDel.id)
    toast.success('Template deleted')
    setConfirmDel(null)
    fetchTemplates()
  }

  // KRA select change — auto-fill title
  const handleKRASelect = (kraId) => {
    const kra = kras.find(k => k.id === kraId)
    setGoalForm(f => ({ ...f, kra_id: kraId, kra_title: kra?.title || f.kra_title }))
  }

  const handleSaveGoal = async () => {
    if (!goalForm.kra_title.trim()) { toast.error('KRA title required'); return }
    const payload = { kra_id: goalForm.kra_id || null, kra_title: goalForm.kra_title, per_weightage: parseFloat(goalForm.per_weightage) || 0, sort_order: parseInt(goalForm.sort_order) || 0 }
    if (editGoal) {
      await supabase.from('appraisal_template_goals').update(payload).eq('id', editGoal.id)
      toast.success('Goal updated')
    } else {
      await supabase.from('appraisal_template_goals').insert([{ id: crypto.randomUUID(), template_id: detail.id, ...payload }])
      toast.success('Goal added')
    }
    setEditGoal(null)
    setGoalForm({ kra_id: '', kra_title: '', per_weightage: 10, sort_order: goals.length + 1 })
    fetchGoals(detail.id)
    fetchTemplates()
  }

  const handleDeleteGoal = async () => {
    await supabase.from('appraisal_template_goals').delete().eq('id', confirmDelGoal.id)
    toast.success('Goal removed')
    setConfirmDelGoal(null)
    fetchGoals(detail.id)
    fetchTemplates()
  }

  const startEditGoal = (g) => {
    setEditGoal(g)
    setGoalForm({ kra_id: g.kra_id || '', kra_title: g.kra_title, per_weightage: g.per_weightage, sort_order: g.sort_order })
  }

  const totalWeight = goals.reduce((s, g) => s + Number(g.per_weightage || 0), 0)

  const TABS = [{ id: 'goals', label: 'KRA Goals' }, { id: 'details', label: 'Details' }]

  return (
    <div>
      <PageHeader title="Appraisal Templates">
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <span className="material-icons">add</span> New Template
          </button>
        )}
      </PageHeader>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : templates.length === 0 ? (
        <EmptyState icon="description" message="No appraisal templates yet." />
      ) : (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Template Title</th>
                <th>Description</th>
                <th>KRAs</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--gold)' }} onClick={() => openDetail(t)}>{t.template_title}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                  <td>{t.appraisal_template_goals?.length || 0}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: t.is_active ? 'var(--green)18' : 'var(--text-dim)18', color: t.is_active ? 'var(--green)' : 'var(--text-dim)', border: `1px solid ${t.is_active ? 'var(--green)' : 'var(--text-dim)'}44` }}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-xs btn-secondary" onClick={() => openDetail(t)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                    </button>
                    {canEdit && (
                      <button className="btn btn-xs btn-danger" onClick={() => setConfirmDel(t)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Template */}
      <ModalDialog open={showNew} onClose={() => setShowNew(false)} title="New Appraisal Template">
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Template Title *</label>
            <input className="form-control" value={newForm.template_title} onChange={e => setNewForm(f => ({ ...f, template_title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="tmpl_active" checked={newForm.is_active} onChange={e => setNewForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="tmpl_active" style={{ margin: 0 }}>Active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </ModalActions>
      </ModalDialog>

      {/* Detail Modal */}
      {detail && (
        <ModalDialog open={!!detail} onClose={() => setDetail(null)} title={detail.template_title} size="lg">
          <div style={{ padding: '0 20px 20px' }}>
            <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

            {activeTab === 'goals' && (
              <div style={{ marginTop: 16 }}>
                {/* Weight indicator */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Total weightage: <strong style={{ color: totalWeight === 100 ? 'var(--green)' : totalWeight > 100 ? 'var(--red)' : 'var(--yellow)' }}>{totalWeight}%</strong> {totalWeight !== 100 && <span style={{ fontSize: 11 }}>(should sum to 100%)</span>}</span>
                  {canEdit && !editGoal && (
                    <button className="btn btn-primary btn-sm" onClick={() => setEditGoal({})}>
                      <span className="material-icons">add</span> Add KRA Goal
                    </button>
                  )}
                </div>

                {/* Add / Edit Goal form */}
                {(editGoal !== null) && (
                  <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 11 }}>KRA</label>
                      <select className="form-control" value={goalForm.kra_id} onChange={e => handleKRASelect(e.target.value)}>
                        <option value="">— Custom title —</option>
                        {kras.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}
                      </select>
                    </div>
                    {!goalForm.kra_id && (
                      <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
                        <label style={{ fontSize: 11 }}>KRA Title *</label>
                        <input className="form-control" value={goalForm.kra_title} onChange={e => setGoalForm(f => ({ ...f, kra_title: e.target.value }))} placeholder="Enter title" />
                      </div>
                    )}
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 90 }}>
                      <label style={{ fontSize: 11 }}>Weightage %</label>
                      <input type="number" className="form-control" min="0" max="100" value={goalForm.per_weightage} onChange={e => setGoalForm(f => ({ ...f, per_weightage: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 70 }}>
                      <label style={{ fontSize: 11 }}>Order</label>
                      <input type="number" className="form-control" min="0" value={goalForm.sort_order} onChange={e => setGoalForm(f => ({ ...f, sort_order: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveGoal}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditGoal(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {loadingGoals ? <Spinner /> : goals.length === 0 ? (
                  <EmptyState icon="flag" message="No KRA goals yet. Add one above." />
                ) : (
                  <table className="stock-table">
                    <thead><tr><th>#</th><th>KRA Title</th><th>Weightage (%)</th><th>Actions</th></tr></thead>
                    <tbody>
                      {goals.map(g => (
                        <tr key={g.id}>
                          <td style={{ color: 'var(--text-dim)', width: 32 }}>{g.sort_order}</td>
                          <td style={{ fontWeight: 600 }}>{g.kra_title}</td>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{g.per_weightage}%</span>
                          </td>
                          <td style={{ display: 'flex', gap: 4 }}>
                            {canEdit && <>
                              <button className="btn btn-xs btn-secondary" onClick={() => startEditGoal(g)}>
                                <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                              </button>
                              <button className="btn btn-xs btn-danger" onClick={() => setConfirmDelGoal(g)}>
                                <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                              </button>
                            </>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'details' && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label>Template Title *</label>
                  <input className="form-control" value={detailForm.template_title || ''} onChange={e => setDetailForm(f => ({ ...f, template_title: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-control" rows={3} value={detailForm.description || ''} onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="det_active" checked={!!detailForm.is_active} onChange={e => setDetailForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <label htmlFor="det_active" style={{ margin: 0 }}>Active</label>
                </div>
                {canEdit && (
                  <button className="btn btn-primary" onClick={handleSaveDetail} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
              </div>
            )}
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}

      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDeleteTemplate}
        title="Delete Template" message={`Delete "${confirmDel?.template_title}"?`} confirmLabel="Delete" danger />
      <ConfirmDialog open={!!confirmDelGoal} onClose={() => setConfirmDelGoal(null)} onConfirm={handleDeleteGoal}
        title="Remove Goal" message={`Remove "${confirmDelGoal?.kra_title}" from this template?`} confirmLabel="Remove" danger />
    </div>
  )
}
