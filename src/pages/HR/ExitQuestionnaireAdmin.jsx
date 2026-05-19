// src/pages/HR/ExitQuestionnaireAdmin.jsx
//
// Admin UI to:
//   1. Manage exit questionnaire settings (questions, intro text, expiry days)
//   2. Generate tokenised public form links for departing employees
//   3. Review submitted responses

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, Spinner, ModalDialog, ModalActions, ConfirmDialog, TabNav } from '../../components/ui'

function generateToken() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(36)).join('').replace(/[^a-z0-9]/g, '').slice(0, 24).padEnd(24, '0')
}

const QUESTION_TYPES = [
  { value: 'rating', label: 'Star Rating (1-5)' },
  { value: 'text',   label: 'Free Text' },
  { value: 'yesno',  label: 'Yes / No' },
]

const BLANK_QUESTION = { order: 0, question: '', type: 'text', required: false }

export default function ExitQuestionnaireAdmin() {
  const { employees } = useHR()
  const [activeTab, setActiveTab] = useState('tokens')
  const [tokens,    setTokens]    = useState([])
  const [responses, setResponses] = useState([])
  const [settings,  setSettings]  = useState(null)
  const [loading,   setLoading]   = useState(true)

  const [tokenModal, setTokenModal] = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [tokenForm,  setTokenForm]  = useState({ employee_id: '', expires_in_days: 30 })
  const [generatedUrl, setGeneratedUrl] = useState('')

  const [questionModal, setQuestionModal] = useState(null)
  const [questionForm,  setQuestionForm]  = useState(BLANK_QUESTION)
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [tokRes, respRes, settingsRes] = await Promise.all([
      supabase.from('exit_questionnaire_tokens').select('*').order('created_at', { ascending: false }),
      supabase.from('exit_questionnaire_responses').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('exit_questionnaire_settings').select('*').eq('id', 'singleton').maybeSingle(),
    ])
    setTokens(tokRes.data || [])
    setResponses(respRes.data || [])
    setSettings(settingsRes.data || null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Generate token ────────────────────────────────────────────
  const openGenerate = () => {
    setTokenForm({ employee_id: '', expires_in_days: settings?.default_expiry_days || 30 })
    setGeneratedUrl('')
    setTokenModal({ mode: 'new' })
  }

  const generate = async () => {
    if (!tokenForm.employee_id) return toast.error('Select an employee')
    try {
      const token = generateToken()
      const expiresAt = new Date(Date.now() + tokenForm.expires_in_days * 86400000).toISOString()
      const id = crypto.randomUUID()
      const { error } = await supabase.from('exit_questionnaire_tokens').insert([{
        id, employee_id: tokenForm.employee_id, token, expires_at: expiresAt,
      }])
      if (error) throw error
      const url = `${window.location.origin}/forms/exit-questionnaire/${token}`
      setGeneratedUrl(url)
      toast.success('Token generated')
      fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const copyLink = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard')
  }

  const handleDeleteToken = async () => {
    try {
      const { error } = await supabase.from('exit_questionnaire_tokens').delete().eq('id', confirm.id)
      if (error) throw error
      toast.success('Token deleted')
      setConfirm(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // ── Settings & questions ──────────────────────────────────────
  const saveSettings = async (patch) => {
    setSavingSettings(true)
    try {
      const payload = { id: 'singleton', ...settings, ...patch, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('exit_questionnaire_settings').upsert(payload, { onConflict: 'id' })
      if (error) throw error
      setSettings(s => ({ ...s, ...patch }))
      toast.success('Saved')
    } catch (err) { toast.error(err.message) }
    finally { setSavingSettings(false) }
  }

  const openAddQuestion = () => {
    const nextOrder = (settings?.questions || []).length + 1
    setQuestionForm({ ...BLANK_QUESTION, order: nextOrder })
    setQuestionModal({ mode: 'add' })
  }

  const openEditQuestion = (q, idx) => {
    setQuestionForm({ ...q })
    setQuestionModal({ mode: 'edit', idx })
  }

  const saveQuestion = async () => {
    if (!questionForm.question.trim()) return toast.error('Question text required')
    const current = settings?.questions || []
    let next
    if (questionModal.mode === 'edit') {
      next = current.map((q, i) => i === questionModal.idx ? { ...questionForm } : q)
    } else {
      next = [...current, { ...questionForm }]
    }
    // Renumber
    next = next.map((q, i) => ({ ...q, order: i + 1 }))
    await saveSettings({ questions: next })
    setQuestionModal(null)
  }

  const removeQuestion = async (idx) => {
    const next = (settings?.questions || []).filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 }))
    await saveSettings({ questions: next })
  }

  const moveQuestion = async (idx, dir) => {
    const list = [...(settings?.questions || [])]
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= list.length) return
    ;[list[idx], list[newIdx]] = [list[newIdx], list[idx]]
    const renumbered = list.map((q, i) => ({ ...q, order: i + 1 }))
    await saveSettings({ questions: renumbered })
  }

  // ── Derived ───────────────────────────────────────────────────
  const empName = (id) => employees.find(e => e.id === id)?.name || '— unknown —'

  const groupedResponses = useMemo(() => {
    const map = {}
    for (const r of responses) {
      if (!map[r.token_id]) map[r.token_id] = []
      map[r.token_id].push(r)
    }
    return map
  }, [responses])

  if (loading) return <div><PageHeader title="Exit Questionnaire" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  const usedCount    = tokens.filter(t => t.used_at).length
  const activeCount  = tokens.filter(t => !t.used_at && (!t.expires_at || new Date(t.expires_at) > new Date())).length
  const expiredCount = tokens.filter(t => !t.used_at && t.expires_at && new Date(t.expires_at) <= new Date()).length

  const TABS = [
    { id: 'tokens',    icon: 'link',         label: `Tokens (${tokens.length})` },
    { id: 'responses', icon: 'quiz',         label: `Responses (${Object.keys(groupedResponses).length})` },
    { id: 'settings',  icon: 'tune',         label: 'Form Settings' },
  ]

  return (
    <div>
      <PageHeader title="Exit Questionnaire" subtitle="Generate tokenised links and manage form questions">
        {activeTab === 'tokens' && (
          <button className="btn btn-primary" onClick={openGenerate}>
            <span className="material-icons">link</span> Generate Link
          </button>
        )}
      </PageHeader>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: 16 }}>
        {activeTab === 'tokens' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total Tokens', value: tokens.length,  color: 'var(--blue)'   },
                { label: 'Active',       value: activeCount,    color: 'var(--green)'  },
                { label: 'Submitted',    value: usedCount,      color: 'var(--gold)'   },
                { label: 'Expired',      value: expiredCount,   color: 'var(--red)'    },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: 'var(--mono)' }}>{k.value}</div>
                </div>
              ))}
            </div>

            {tokens.length === 0
              ? <EmptyState icon="link" message="No questionnaire links generated yet" action={{ label: 'Generate Link', onClick: openGenerate }} />
              : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Employee</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Created</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Expires</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map(t => {
                        const expired = !t.used_at && t.expires_at && new Date(t.expires_at) <= new Date()
                        const url = `${window.location.origin}/forms/exit-questionnaire/${t.token}`
                        const statusColor = t.used_at ? 'var(--green)' : expired ? 'var(--red)' : 'var(--blue)'
                        const statusLabel = t.used_at ? 'Submitted' : expired ? 'Expired' : 'Active'
                        return (
                          <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{empName(t.employee_id)}</td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)' }}>{t.expires_at ? new Date(t.expires_at).toLocaleDateString() : '—'}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>
                                {statusLabel}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                {!t.used_at && !expired && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => copyLink(url)} title="Copy link">
                                    <span className="material-icons" style={{ fontSize: 14 }}>content_copy</span>
                                  </button>
                                )}
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: t.id, name: empName(t.employee_id) })}>
                                  <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </>
        )}

        {activeTab === 'responses' && (
          Object.keys(groupedResponses).length === 0
            ? <EmptyState icon="quiz" message="No questionnaire responses submitted yet" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Object.entries(groupedResponses).map(([tokenId, items]) => {
                  const tk = tokens.find(t => t.id === tokenId)
                  if (!tk) return null
                  return (
                    <div key={tokenId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{empName(tk.employee_id)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Submitted {tk.used_at ? new Date(tk.used_at).toLocaleString() : '—'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => (
                          <div key={r.id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 3 }}>{r.question}</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>
                              {r.rating ? <span style={{ color: 'var(--gold)' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> : (r.answer || '—')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
        )}

        {activeTab === 'settings' && settings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>General</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label>Default Token Expiry (days)</label>
                  <input type="number" min={1} className="form-control" value={settings.default_expiry_days || 30}
                    onChange={e => setSettings(s => ({ ...s, default_expiry_days: parseInt(e.target.value) || 30 }))} />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                    <input type="checkbox" checked={settings.is_enabled !== false}
                      onChange={e => setSettings(s => ({ ...s, is_enabled: e.target.checked }))} />
                    Enable exit questionnaire feature
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>Intro Text</label>
                <textarea className="form-control" rows={3} value={settings.intro_text || ''}
                  onChange={e => setSettings(s => ({ ...s, intro_text: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Thank You Text</label>
                <textarea className="form-control" rows={2} value={settings.thank_you_text || ''}
                  onChange={e => setSettings(s => ({ ...s, thank_you_text: e.target.value }))} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <button className="btn btn-primary btn-sm" disabled={savingSettings}
                  onClick={() => saveSettings({
                    is_enabled: settings.is_enabled !== false,
                    default_expiry_days: settings.default_expiry_days,
                    intro_text: settings.intro_text,
                    thank_you_text: settings.thank_you_text,
                  })}>
                  <span className="material-icons">save</span> Save General Settings
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>Questions ({(settings.questions || []).length})</h3>
                <button className="btn btn-secondary btn-sm" onClick={openAddQuestion}>
                  <span className="material-icons" style={{ fontSize: 15 }}>add</span> Add Question
                </button>
              </div>
              {(settings.questions || []).length === 0
                ? <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '12px 0' }}>No questions configured</div>
                : (settings.questions || []).map((q, idx) => (
                    <div key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none', padding: '12px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: '0 0 30px', textAlign: 'center', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>{q.order}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{q.question}{q.required && <span style={{ color: 'var(--red)' }}> *</span>}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                          Type: {QUESTION_TYPES.find(t => t.value === q.type)?.label || q.type}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}>
                          <span className="material-icons" style={{ fontSize: 14 }}>arrow_upward</span>
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => moveQuestion(idx, 1)} disabled={idx === (settings.questions || []).length - 1}>
                          <span className="material-icons" style={{ fontSize: 14 }}>arrow_downward</span>
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditQuestion(q, idx)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeQuestion(idx)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        )}
      </div>

      {/* Generate token modal */}
      <ModalDialog open={tokenModal?.mode === 'new'} onClose={() => setTokenModal(null)} title="Generate Exit Questionnaire Link" size="md">
        {!generatedUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={tokenForm.employee_id}
                onChange={e => setTokenForm(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Link Expires After (days)</label>
              <input type="number" min={1} className="form-control" value={tokenForm.expires_in_days}
                onChange={e => setTokenForm(p => ({ ...p, expires_in_days: parseInt(e.target.value) || 30 }))} />
            </div>
          </div>
        ) : (
          <div>
            <div style={{ padding: 16, background: 'var(--green)22', border: '1px solid var(--green)55', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>
                Link generated successfully
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Share this URL with the employee. It expires in {tokenForm.expires_in_days} days and can only be used once.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input readOnly className="form-control" value={generatedUrl} style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
              <button className="btn btn-primary" onClick={() => copyLink(generatedUrl)}>
                <span className="material-icons">content_copy</span> Copy
              </button>
            </div>
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setTokenModal(null)}>Close</button>
          {!generatedUrl && <button className="btn btn-primary" onClick={generate}>Generate</button>}
        </ModalActions>
      </ModalDialog>

      {/* Question modal */}
      <ModalDialog open={questionModal !== null} onClose={() => setQuestionModal(null)}
        title={questionModal?.mode === 'edit' ? 'Edit Question' : 'Add Question'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Question Text *</label>
            <textarea className="form-control" rows={2} value={questionForm.question}
              onChange={e => setQuestionForm(p => ({ ...p, question: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Answer Type</label>
            <select className="form-control" value={questionForm.type}
              onChange={e => setQuestionForm(p => ({ ...p, type: e.target.value }))}>
              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={questionForm.required}
                onChange={e => setQuestionForm(p => ({ ...p, required: e.target.checked }))} />
              Required (employee must answer to submit)
            </label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setQuestionModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveQuestion}>
            {questionModal?.mode === 'edit' ? 'Save Changes' : 'Add Question'}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Delete Token"
        message={`Delete the questionnaire link for "${confirm?.name}"? This cannot be undone.`}
        onConfirm={handleDeleteToken}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
