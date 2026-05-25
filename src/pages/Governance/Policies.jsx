// src/pages/Governance/Policies.jsx
// Policies & Rules — Quill editor, full-view modal, compliance dashboard,
// mandatory enforcement, versioning (governance_document_versions).

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ModalDialog, ModalActions, TabNav, ConfirmDialog } from '../../components/ui'
import RichTextEditor, { stripHtml, isHtmlContent } from '../../components/ui/RichTextEditor'
import toast from 'react-hot-toast'

const CATS = ['General', 'HR', 'Operations', 'Safety', 'Finance', 'IT', 'Legal']

const RESPONSE_STYLE = {
  accepted:  { color: 'var(--green)',  bg: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.3)',  icon: 'check_circle' },
  rejected:  { color: 'var(--red)',    bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.3)',   icon: 'cancel'       },
  consulted: { color: 'var(--yellow)', bg: 'rgba(251,191,36,.12)',  border: 'rgba(251,191,36,.3)',  icon: 'forum'        },
}

function bumpVersion(v = '1.0') {
  const parts = String(v).split('.')
  const minor = parseInt(parts[1] || '0', 10) + 1
  return `${parts[0]}.${minor}`
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB')
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

// ── KPI card (inline — no external dep needed) ───────────────────
function KPI({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function Policies() {
  const { user } = useAuth()
  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  // ── Tab ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('policies')

  // ── Data ──────────────────────────────────────────────────────
  const [policies,   setPolicies]   = useState([])
  const [responses,  setResponses]  = useState([])   // current user's responses
  const [loading,    setLoading]    = useState(true)

  // ── Filter ────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState('All')

  // ── Read modal ────────────────────────────────────────────────
  const [reading,     setReading]     = useState(null)   // policy being viewed
  const [signComment, setSignComment] = useState('')
  const [signing,     setSigning]     = useState(false)

  // ── Publish / edit modal ──────────────────────────────────────
  const [showForm,   setShowForm]   = useState(false)
  const [editing,    setEditing]    = useState(null)   // policy being edited
  const [saving,     setSaving]     = useState(false)
  const [confirmReAck, setConfirmReAck] = useState(false)
  const [pendingSave,  setPendingSave]  = useState(null)

  // Form fields (stable — no cursor jumping)
  const [fTitle,       setFTitle]       = useState('')
  const [fBodyHtml,    setFBodyHtml]    = useState('')
  const [fCategory,    setFCategory]    = useState('General')
  const [fVersion,     setFVersion]     = useState('1.0')
  const [fMandatory,   setFMandatory]   = useState(false)
  const [fAckBy,       setFAckBy]       = useState('')
  const [fChangeNotes, setFChangeNotes] = useState('')

  // ── Compliance tab ────────────────────────────────────────────
  const [compPolicy,    setCompPolicy]    = useState('')
  const [allUsers,      setAllUsers]      = useState([])
  const [compResponses, setCompResponses] = useState([])
  const [compLoading,   setCompLoading]   = useState(false)

  // ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, title, body, body_html, version, category, published_by_name, created_at, updated_at, is_mandatory, acknowledge_by')
        .eq('doc_type', 'policy')
        .order('created_at', { ascending: false }),
      supabase.from('governance_responses')
        .select('*')
        .eq('user_id', user.id),
    ])
    if (pRes.data) setPolicies(pRes.data)
    if (rRes.data) setResponses(rRes.data)
    setLoading(false)
  }, [user.id])

  useEffect(() => { fetchData() }, [fetchData])

  const myResponse = (policyId) => responses.find(r => r.document_id === policyId)

  // ── Filtered policies ─────────────────────────────────────────
  const visiblePolicies = activeFilter === 'All'
    ? policies
    : policies.filter(p => p.category === activeFilter)

  // ── Open read modal ───────────────────────────────────────────
  const openRead = (policy) => {
    const resp = myResponse(policy.id)
    setReading(policy)
    setSignComment(resp?.comments || '')
  }

  // ── Respond ───────────────────────────────────────────────────
  const handleRespond = async (response) => {
    if (!reading) return
    setSigning(true)
    try {
      const existing = myResponse(reading.id)
      if (existing) {
        const { error } = await supabase.from('governance_responses')
          .update({ response, comments: signComment || null, responded_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('governance_responses').insert([{
          document_id:  reading.id,
          user_id:      user.id,
          response,
          comments:     signComment || null,
          responded_at: new Date().toISOString(),
          acknowledged_at: new Date().toISOString(),
        }])
        if (error) throw error
      }
      const labels = { accepted: 'Policy accepted', rejected: 'Response recorded', consulted: 'Consultation recorded' }
      toast.success(labels[response] || 'Response recorded')
      await fetchData()
      // keep modal open but refresh reading policy data
      const fresh = (await supabase.from('governance_documents').select('*').eq('id', reading.id).single()).data
      if (fresh) setReading(fresh)
    } catch (err) {
      toast.error(err.message)
    } finally { setSigning(false) }
  }

  // ── Open form ─────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setFTitle('')
    setFBodyHtml('')
    setFCategory('General')
    setFVersion('1.0')
    setFMandatory(false)
    setFAckBy('')
    setFChangeNotes('')
    setShowForm(true)
  }

  const openEdit = (policy, e) => {
    e.stopPropagation()
    setEditing(policy)
    setFTitle(policy.title || '')
    setFBodyHtml(policy.body_html || policy.body || '')
    setFCategory(policy.category || 'General')
    setFVersion(policy.version || '1.0')
    setFMandatory(!!policy.is_mandatory)
    setFAckBy(policy.acknowledge_by ? policy.acknowledge_by.substring(0, 10) : '')
    setFChangeNotes('')
    setShowForm(true)
  }

  // ── Save policy ───────────────────────────────────────────────
  const doSave = async (payload, isUpdate) => {
    setSaving(true)
    try {
      if (!isUpdate) {
        // CREATE
        const newId = crypto.randomUUID()
        const { error } = await supabase.from('governance_documents').insert([{
          ...payload,
          id:                newId,
          doc_type:          'policy',
          published_by:      user.id,
          published_by_name: user.full_name || user.username || '',
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        }])
        if (error) throw error

        // version snapshot
        await supabase.from('governance_document_versions').insert([{
          document_id:    newId,
          version:        payload.version,
          body_html:      payload.body_html || '',
          change_notes:   'Initial version',
          changed_by:     user.id,
          changed_by_name: user.full_name || user.username || '',
          effective_date: new Date().toISOString(),
          created_at:     new Date().toISOString(),
        }])
        toast.success('Policy published')
      } else {
        // UPDATE
        const { error } = await supabase.from('governance_documents')
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id)
        if (error) throw error

        // version snapshot
        await supabase.from('governance_document_versions').insert([{
          document_id:    editing.id,
          version:        payload.version,
          body_html:      payload.body_html || '',
          change_notes:   fChangeNotes || null,
          changed_by:     user.id,
          changed_by_name: user.full_name || user.username || '',
          effective_date: new Date().toISOString(),
          created_at:     new Date().toISOString(),
        }])
        toast.success('Policy updated')
      }

      setShowForm(false)
      setEditing(null)
      fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
      setPendingSave(null)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!fTitle.trim() || !fBodyHtml.trim()) {
      toast.error('Title and body are required')
      return
    }
    const newVersion = editing ? bumpVersion(editing.version) : fVersion
    const payload = {
      title:        fTitle.trim(),
      body_html:    fBodyHtml,
      body:         stripHtml(fBodyHtml),
      category:     fCategory,
      version:      newVersion,
      is_mandatory: fMandatory,
      acknowledge_by: fMandatory && fAckBy ? new Date(fAckBy).toISOString() : null,
    }

    if (editing) {
      // ask about re-acknowledge
      setPendingSave(payload)
      setConfirmReAck(true)
    } else {
      doSave(payload, false)
    }
  }

  const handleReAckConfirm = async (clearAcks) => {
    setConfirmReAck(false)
    if (!pendingSave) return
    if (clearAcks) {
      await supabase.from('governance_responses').delete().eq('document_id', editing.id)
    }
    doSave(pendingSave, true)
  }

  // ── Compliance: load users + responses when policy selected ───
  useEffect(() => {
    if (!compPolicy || activeTab !== 'compliance') return
    setCompLoading(true)
    Promise.all([
      supabase.from('app_users').select('id, full_name, username').eq('is_active', true),
      supabase.from('governance_responses').select('*').eq('document_id', compPolicy),
    ]).then(([uRes, rRes]) => {
      if (uRes.data) setAllUsers(uRes.data)
      if (rRes.data) setCompResponses(rRes.data)
      setCompLoading(false)
    })
  }, [compPolicy, activeTab])

  // ── Compliance CSV export ─────────────────────────────────────
  const exportCSV = () => {
    const rows = complianceRows()
    const header = 'Employee,Response,Date,Comment'
    const lines = rows.map(r =>
      [r.name, r.response, r.date, (r.comment || '').replace(/,/g, ';')].join(',')
    )
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const pol = policies.find(p => p.id === compPolicy)
    a.download = `${pol?.title || 'policy'}-compliance.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const complianceRows = () => {
    return allUsers.map(u => {
      const resp = compResponses.find(r => r.user_id === u.id)
      return {
        id:       u.id,
        name:     u.full_name || u.username,
        response: resp?.response || 'pending',
        date:     resp?.responded_at ? fmtDate(resp.responded_at) : '',
        comment:  resp?.comments || '',
      }
    })
  }

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
  )

  const tabs = [
    { id: 'policies',   label: 'Policies',   icon: 'description', count: policies.length },
    ...(isAdmin ? [{ id: 'compliance', label: 'Compliance', icon: 'verified_user' }] : []),
  ]

  return (
    <div style={{ padding: 24 }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Policies &amp; Rules</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Company policies requiring acknowledgement</div>
        </div>
        {isAdmin && activeTab === 'policies' && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Policy
          </button>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      {isAdmin && (
        <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 1 — POLICIES
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'policies' && (
        <>
          {/* Category filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, marginTop: isAdmin ? 16 : 0 }}>
            {['All', ...CATS].map(cat => (
              <button key={cat}
                onClick={() => setActiveFilter(cat)}
                style={{
                  padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${activeFilter === cat ? 'var(--gold)' : 'var(--border)'}`,
                  background: activeFilter === cat ? 'rgba(184,163,100,.15)' : 'transparent',
                  color: activeFilter === cat ? 'var(--gold)' : 'var(--text-dim)',
                  transition: 'all .15s',
                }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Policy cards */}
          {visiblePolicies.length === 0 ? (
            <div className="empty-state">
              <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>description</span>
              <p>No policies {activeFilter !== 'All' ? `in ${activeFilter}` : 'published'} yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visiblePolicies.map(p => {
                const resp = myResponse(p.id)
                const rs   = resp ? RESPONSE_STYLE[resp.response] : null
                const preview = stripHtml(p.body_html || p.body || '')
                const overdue = p.is_mandatory && p.acknowledge_by && !resp && isOverdue(p.acknowledge_by)

                return (
                  <div key={p.id} className="card"
                    onClick={() => openRead(p)}
                    style={{ padding: 20, display: 'flex', alignItems: 'flex-start', gap: 16, cursor: 'pointer' }}>

                    {/* Icon */}
                    <span className="material-icons"
                      style={{ fontSize: 32, color: rs ? rs.color : 'var(--yellow)', flexShrink: 0, marginTop: 2 }}>
                      {rs ? rs.icon : 'description'}
                    </span>

                    {/* Main content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</span>
                        {/* Version badge */}
                        <span style={{
                          padding: '1px 8px', borderRadius: 10, background: 'var(--surface2)',
                          border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', fontWeight: 600,
                        }}>v{p.version || '1.0'}</span>
                        {/* Category chip */}
                        <span style={{
                          padding: '1px 8px', borderRadius: 10, background: 'rgba(184,163,100,.12)',
                          border: '1px solid rgba(184,163,100,.25)', fontSize: 10, color: 'var(--gold)', fontWeight: 600,
                        }}>{p.category}</span>
                        {/* Mandatory badge */}
                        {p.is_mandatory && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 10, background: 'rgba(239,68,68,.12)',
                            border: '1px solid rgba(239,68,68,.3)', fontSize: 10, color: 'var(--red)', fontWeight: 700,
                          }}>REQUIRED</span>
                        )}
                        {/* Deadline badge */}
                        {p.acknowledge_by && !resp && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                            background: overdue ? 'rgba(239,68,68,.12)' : 'rgba(251,191,36,.12)',
                            border: `1px solid ${overdue ? 'rgba(239,68,68,.3)' : 'rgba(251,191,36,.3)'}`,
                            color: overdue ? 'var(--red)' : 'var(--yellow)',
                          }}>{overdue ? 'OVERDUE' : `Due ${fmtDate(p.acknowledge_by)}`}</span>
                        )}
                      </div>

                      {/* Preview text */}
                      {preview && (
                        <div style={{
                          fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          marginBottom: 4,
                        }}>{preview}</div>
                      )}

                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {p.published_by_name || 'Unknown'} · {fmtDate(p.created_at)}
                      </div>
                    </div>

                    {/* Right side — response or CTA */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      {resp ? (
                        <span style={{
                          padding: '3px 12px', borderRadius: 20,
                          background: rs.bg, border: `1px solid ${rs.border}`,
                          color: rs.color, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>{rs.icon}</span>
                          {resp.response}
                        </span>
                      ) : (
                        <button className="btn btn-primary btn-sm"
                          onClick={e => { e.stopPropagation(); openRead(p) }}
                          style={{ fontSize: 11 }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>menu_book</span>
                          Read &amp; Respond
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11 }}
                          onClick={e => openEdit(p, e)}>
                          <span className="material-icons" style={{ fontSize: 12 }}>edit</span> Edit
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2 — COMPLIANCE (admin only)
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'compliance' && isAdmin && (
        <div style={{ marginTop: 16 }}>
          {/* Policy selector */}
          <div className="form-group" style={{ marginBottom: 20, maxWidth: 400 }}>
            <label className="form-label">Select Policy</label>
            <select className="form-control" value={compPolicy}
              onChange={e => setCompPolicy(e.target.value)}>
              <option value="">— choose a policy —</option>
              {policies.map(p => (
                <option key={p.id} value={p.id}>{p.title} (v{p.version})</option>
              ))}
            </select>
          </div>

          {compPolicy && (
            <>
              {compLoading ? (
                <div style={{ color: 'var(--text-dim)', padding: 20 }}>Loading compliance data…</div>
              ) : (
                <ComplianceDashboard
                  policy={policies.find(p => p.id === compPolicy)}
                  allUsers={allUsers}
                  responses={compResponses}
                  onExport={exportCSV}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          READ MODAL (full policy view)
      ══════════════════════════════════════════════════════════ */}
      <ModalDialog open={!!reading} onClose={() => { setReading(null); setSignComment('') }}
        title={reading ? `${reading.title} · v${reading.version || '1.0'}` : ''}
        size="lg">
        {reading && (() => {
          const resp      = myResponse(reading.id)
          const rs        = resp ? RESPONSE_STYLE[resp.response] : null
          const hasHtml   = isHtmlContent(reading.body_html)
          const overdueR  = reading.is_mandatory && reading.acknowledge_by && !resp && isOverdue(reading.acknowledge_by)

          return (
            <>
              {/* Mandatory banner */}
              {reading.is_mandatory && (
                <div style={{
                  padding: '8px 14px', borderRadius: 8, marginBottom: 10,
                  background: 'rgba(184,163,100,.18)', border: '1px solid rgba(184,163,100,.4)',
                  color: 'var(--gold)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>priority_high</span>
                  This policy is mandatory — your acknowledgement is required.
                  {reading.acknowledge_by && (
                    <span style={{ marginLeft: 'auto' }}>Due: {fmtDate(reading.acknowledge_by)}</span>
                  )}
                </div>
              )}

              {/* Overdue warning */}
              {overdueR && (
                <div style={{
                  padding: '8px 14px', borderRadius: 8, marginBottom: 10,
                  background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                  color: 'var(--red)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>warning</span>
                  Overdue — deadline was {fmtDate(reading.acknowledge_by)}
                </div>
              )}

              {/* Policy body */}
              <div style={{
                maxHeight: '60vh', overflowY: 'auto', padding: '14px 16px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, marginBottom: 16, lineHeight: 1.7,
              }}>
                {hasHtml
                  ? <div className="ql-editor" style={{ padding: 0 }}
                      dangerouslySetInnerHTML={{ __html: reading.body_html }} />
                  : <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 13, color: 'var(--text)' }}>
                      {reading.body}
                    </pre>
                }
              </div>

              {/* Current response badge */}
              {resp && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                  padding: '8px 14px', borderRadius: 8,
                  background: rs.bg, border: `1px solid ${rs.border}`,
                }}>
                  <span className="material-icons" style={{ fontSize: 18, color: rs.color }}>{rs.icon}</span>
                  <span style={{ fontSize: 13, color: rs.color, fontWeight: 700, textTransform: 'capitalize' }}>
                    {resp.response}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>
                    on {fmtDate(resp.responded_at)}
                  </span>
                  {resp.comments && (
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>— "{resp.comments}"</span>
                  )}
                </div>
              )}

              {/* Response form */}
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">{resp ? 'Change your comment (optional)' : 'Comments (optional)'}</label>
                <textarea rows={2} className="form-control" style={{ resize: 'vertical' }}
                  value={signComment} onChange={e => setSignComment(e.target.value)}
                  placeholder="Add any comments or concerns…" />
              </div>

              <ModalActions>
                <button className="btn btn-secondary"
                  onClick={() => { setReading(null); setSignComment('') }}>
                  Close
                </button>
                <button className="btn btn-warning" disabled={signing}
                  style={{ background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.4)', color: 'var(--yellow)' }}
                  onClick={() => handleRespond('consulted')}>
                  {signing ? '…' : 'Consulted'}
                </button>
                <button className="btn btn-danger" disabled={signing}
                  onClick={() => handleRespond('rejected')}>
                  {signing ? '…' : 'Reject'}
                </button>
                <button className="btn btn-primary" disabled={signing}
                  onClick={() => handleRespond('accepted')}>
                  {signing ? 'Saving…' : resp ? 'Re-Accept' : 'Accept'}
                </button>
              </ModalActions>
            </>
          )
        })()}
      </ModalDialog>

      {/* ══════════════════════════════════════════════════════════
          PUBLISH / EDIT POLICY MODAL
      ══════════════════════════════════════════════════════════ */}
      <ModalDialog open={showForm} onClose={() => { setShowForm(false); setEditing(null) }}
        title={editing ? `Edit Policy · ${editing.title}` : 'Publish Policy'}
        size="lg">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Title */}
          <div className="form-group">
            <label className="form-label">Policy Title *</label>
            <input required className="form-control" value={fTitle}
              onChange={e => setFTitle(e.target.value)} placeholder="e.g. Remote Work Policy" />
          </div>

          {/* Category + Version */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={fCategory} onChange={e => setFCategory(e.target.value)}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Version {editing && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>(will auto-increment)</span>}</label>
              <input className="form-control" placeholder="1.0" value={editing ? bumpVersion(editing.version) : fVersion}
                disabled={!!editing}
                onChange={e => !editing && setFVersion(e.target.value)} />
            </div>
          </div>

          {/* Mandatory + Acknowledge By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={fMandatory} onChange={e => setFMandatory(e.target.checked)} />
              <span>Mandatory — require acknowledgement from all employees</span>
            </label>
            {fMandatory && (
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label className="form-label">Acknowledge By (optional)</label>
                <input type="date" className="form-control" value={fAckBy}
                  onChange={e => setFAckBy(e.target.value)} />
              </div>
            )}
          </div>

          {/* Rich text body */}
          <div className="form-group">
            <label className="form-label">Policy Body *</label>
            <RichTextEditor
              value={fBodyHtml}
              onChange={setFBodyHtml}
              placeholder="Write the full policy text here…"
              toolbar="full"
              minHeight={300}
            />
          </div>

          {/* Change notes (edit only) */}
          {editing && (
            <div className="form-group">
              <label className="form-label">Change Notes</label>
              <textarea rows={2} className="form-control" style={{ resize: 'vertical' }}
                value={fChangeNotes} onChange={e => setFChangeNotes(e.target.value)}
                placeholder="Briefly describe what changed in this version…" />
            </div>
          )}

          <ModalActions>
            <button type="button" className="btn btn-secondary"
              onClick={() => { setShowForm(false); setEditing(null) }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Publish Policy'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* Re-acknowledge confirm dialog */}
      {confirmReAck && (
        <ModalDialog open={confirmReAck} onClose={() => setConfirmReAck(false)}
          title="Clear existing acknowledgements?">
          <p style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7, marginBottom: 16 }}>
            Updating this policy will require all employees to re-acknowledge.
            Do you want to <strong>clear all existing acceptances</strong> so everyone must respond again?
          </p>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setConfirmReAck(false)}>Cancel</button>
            <button className="btn btn-secondary" onClick={() => handleReAckConfirm(false)}>
              Keep existing responses
            </button>
            <button className="btn btn-danger" onClick={() => handleReAckConfirm(true)}>
              Clear &amp; require re-acknowledgement
            </button>
          </ModalActions>
        </ModalDialog>
      )}

    </div>
  )
}

// ── Compliance Dashboard sub-component ───────────────────────────
function ComplianceDashboard({ policy, allUsers, responses, onExport }) {
  const total     = allUsers.length
  const accepted  = responses.filter(r => r.response === 'accepted').length
  const rejected  = responses.filter(r => r.response === 'rejected').length
  const consulted = responses.filter(r => r.response === 'consulted').length
  const pending   = total - responses.length
  const pct       = total > 0 ? Math.round((accepted / total) * 100) : 0
  const overdue   = policy?.acknowledge_by && isOverdue(policy.acknowledge_by) && pending > 0

  const rows = allUsers.map(u => {
    const resp = responses.find(r => r.user_id === u.id)
    return {
      id:       u.id,
      name:     u.full_name || u.username,
      response: resp?.response || 'pending',
      date:     resp?.responded_at ? fmtDate(resp.responded_at) : '—',
      comment:  resp?.comments || '',
    }
  }).sort((a, b) => {
    const order = { accepted: 0, consulted: 1, rejected: 2, pending: 3 }
    return (order[a.response] ?? 9) - (order[b.response] ?? 9)
  })

  const rowColor = {
    accepted:  { bg: 'rgba(52,211,153,.06)',  color: 'var(--green)' },
    rejected:  { bg: 'rgba(239,68,68,.06)',   color: 'var(--red)'   },
    consulted: { bg: 'rgba(251,191,36,.06)',  color: 'var(--yellow)'},
    pending:   { bg: 'transparent',           color: 'var(--text-dim)' },
  }

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPI label="Total Employees" value={total}    color="var(--text)"   />
        <KPI label="Accepted"        value={accepted} color="var(--green)"  />
        <KPI label="Rejected"        value={rejected} color="var(--red)"    />
        <KPI label="Consulted"       value={consulted}color="var(--yellow)" />
        <KPI label="Pending"         value={pending}  color="var(--text-dim)" />
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
          <span>Acceptance rate</span>
          <span style={{ fontWeight: 700, color: pct >= 80 ? 'var(--green)' : 'var(--yellow)' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 6, transition: 'width .4s',
            width: `${pct}%`,
            background: pct >= 80 ? 'var(--green)' : 'var(--yellow)',
          }} />
        </div>
        {overdue && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>warning</span>
            Deadline passed — {pending} employee{pending !== 1 ? 's' : ''} still pending
          </div>
        )}
      </div>

      {/* Table header + export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Response Details</div>
        <button className="btn btn-secondary btn-sm" onClick={onExport} style={{ fontSize: 12 }}>
          <span className="material-icons" style={{ fontSize: 14 }}>download</span> Export CSV
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Employee</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Response</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Date</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const style = rowColor[r.response] || rowColor.pending
              return (
                <tr key={r.id} style={{ background: style.bg, borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{r.name}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{
                      fontWeight: 700, fontSize: 11, textTransform: 'capitalize',
                      color: style.color,
                    }}>{r.response}</span>
                  </td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-dim)' }}>{r.date}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.comment || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
