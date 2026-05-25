// src/pages/Governance/Memos.jsx
// Upgraded: Quill editor, To/CC/From, visibility, acknowledgement tracking, sent view

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import { ModalDialog, ModalActions } from '../../components/ui'
import RichTextEditor, { stripHtml, isHtmlContent } from '../../components/ui/RichTextEditor'
import toast from 'react-hot-toast'

const CATS = ['General', 'Operations', 'HR', 'Safety', 'Finance', 'Procurement']

// ── Visibility badge config ──────────────────────────────────────
const VIS_CONFIG = {
  public:       { label: '🌐 Public',       color: 'var(--teal)',   bg: 'rgba(45,212,191,.1)',  border: 'rgba(45,212,191,.25)' },
  private:      { label: '🔒 Private',      color: 'var(--yellow)', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.25)' },
  confidential: { label: '🔐 Confidential', color: 'var(--red)',    bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)'  },
}

// ── Employee multi-select picker ─────────────────────────────────
function EmployeePicker({ label, selected, onChange, allUsers }) {
  const [search, setSearch] = useState('')

  const filtered = allUsers.filter(u =>
    !selected.includes(u.id) &&
    (u.full_name || u.username || '').toLowerCase().includes(search.toLowerCase())
  )

  const addUser = (u) => { onChange([...selected, u.id]); setSearch('') }
  const removeUser = (id) => onChange(selected.filter(x => x !== id))
  const getName = (id) => allUsers.find(u => u.id === id)?.full_name || allUsers.find(u => u.id === id)?.username || id

  return (
    <div>
      <label className="form-label">{label}</label>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {selected.map(id => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 8px', borderRadius: 12, background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.25)', color: 'var(--blue)' }}>
              {getName(id)}
              <button type="button" onClick={() => removeUser(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1, padding: 0, fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {/* Search box */}
      <input
        className="form-control"
        placeholder={`Search employees…`}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 4 }}
      />
      {/* Dropdown */}
      {search && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', maxHeight: 160, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No results</div>
          ) : filtered.map(u => (
            <div key={u.id}
              onClick={() => addUser(u)}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              {u.full_name || u.username}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────
export default function Memos() {
  const { user } = useAuth()
  const [tab,      setTab]      = useState('inbox')
  const [memos,    setMemos]    = useState([])
  const [sentMemos, setSentMemos] = useState([])
  const [reads,    setReads]    = useState(new Set())
  const [acks,     setAcks]     = useState(new Set())    // doc IDs user has acknowledged
  const [sentAcks, setSentAcks] = useState({})           // docId -> { acknowledged, total }
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [editing,  setEditing]  = useState(null)
  const [acking,   setAcking]   = useState(null)         // docId being acknowledged

  // Users list for name resolution & picker
  const [allUsers, setAllUsers] = useState([])

  // ── Form state ────────────────────────────────────────────────
  const [formTitle,      setFormTitle]      = useState('')
  const [formBodyHtml,   setFormBodyHtml]   = useState('')
  const [formCategory,   setFormCategory]   = useState('General')
  const [formVisibility, setFormVisibility] = useState('public')
  const [formRequiresAck, setFormRequiresAck] = useState(false)
  const [formTo,         setFormTo]         = useState([])
  const [formCc,         setFormCc]         = useState([])

  const isAdmin      = ['role_super_admin', 'role_hr_manager', 'role_hr', 'role_manager'].includes(user?.role_id)
  const isSuperAdmin = user?.role_id === 'role_super_admin'

  // ── Fetch users for name display & picker ─────────────────────
  useEffect(() => {
    supabase.from('app_users').select('id, full_name, username').eq('is_active', true)
      .then(({ data }) => setAllUsers(data || []))
  }, [])

  const userName = (id) => allUsers.find(u => u.id === id)?.full_name || allUsers.find(u => u.id === id)?.username || id

  // ── Visibility filter ─────────────────────────────────────────
  const visibleMemo = (doc) => {
    if (isSuperAdmin) return true
    const vis = doc.visibility || 'public'
    if (vis === 'public') return true
    const recipIds = doc.recipient_ids || []
    const ccIds    = doc.cc_ids || []
    if (vis === 'private') return isAdmin || recipIds.includes(user.id) || ccIds.includes(user.id)
    if (vis === 'confidential') return recipIds.includes(user.id)
    return false
  }

  // ── Fetch data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [mRes, rRes, aRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, txn_code, title, body, body_html, category, published_by, published_by_name, created_at, updated_at, visibility, recipient_ids, cc_ids, requires_ack')
        .eq('doc_type', 'memo')
        .order('created_at', { ascending: false }),
      supabase.from('announcement_reads')
        .select('document_id').eq('user_id', user.id),
      supabase.from('governance_responses')
        .select('document_id').eq('user_id', user.id).eq('response', 'acknowledged'),
    ])
    if (mRes.data) {
      const visible = mRes.data.filter(visibleMemo)
      setMemos(visible)
      // Sent tab: memos this user published
      setSentMemos(mRes.data.filter(d => d.published_by === user.id))
    }
    if (rRes.data) setReads(new Set(rRes.data.map(r => r.document_id)))
    if (aRes.data) setAcks(new Set(aRes.data.map(r => r.document_id)))
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isSuperAdmin, isAdmin])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Fetch acknowledgement counts for sent memos ───────────────
  useEffect(() => {
    if (!isAdmin || sentMemos.length === 0) return
    const ids = sentMemos.filter(d => d.requires_ack).map(d => d.id)
    if (ids.length === 0) return
    supabase.from('governance_responses')
      .select('document_id')
      .in('document_id', ids)
      .eq('response', 'acknowledged')
      .then(({ data }) => {
        const counts = {}
        for (const row of (data || [])) {
          counts[row.document_id] = (counts[row.document_id] || 0) + 1
        }
        const result = {}
        for (const doc of sentMemos) {
          if (doc.requires_ack) {
            result[doc.id] = {
              acknowledged: counts[doc.id] || 0,
              total: (doc.recipient_ids || []).length,
            }
          }
        }
        setSentAcks(result)
      })
  }, [sentMemos, isAdmin])

  // ── Mark as read ──────────────────────────────────────────────
  const markRead = async (docId) => {
    if (reads.has(docId)) return
    await supabase.from('announcement_reads').insert([{
      id: crypto.randomUUID(), document_id: docId, user_id: user.id, read_at: new Date().toISOString(),
    }])
    setReads(prev => new Set([...prev, docId]))
  }

  // ── Acknowledge memo ──────────────────────────────────────────
  const handleAcknowledge = async (docId) => {
    setAcking(docId)
    try {
      const { error } = await supabase.from('governance_responses').insert([{
        id: crypto.randomUUID(),
        document_id: docId,
        user_id: user.id,
        response: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }])
      if (error) throw error
      setAcks(prev => new Set([...prev, docId]))
      toast.success('Acknowledgement recorded')
    } catch (err) {
      toast.error(err.message)
    } finally { setAcking(null) }
  }

  // ── Form open/close ───────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setFormTitle('')
    setFormBodyHtml('')
    setFormCategory('General')
    setFormVisibility('public')
    setFormRequiresAck(false)
    setFormTo([])
    setFormCc([])
    setShowForm(true)
  }

  const openEdit = (memo) => {
    setEditing(memo)
    setFormTitle(memo.title || '')
    setFormBodyHtml(memo.body_html || memo.body || '')
    setFormCategory(memo.category || 'General')
    setFormVisibility(memo.visibility || 'public')
    setFormRequiresAck(memo.requires_ack || false)
    setFormTo(memo.recipient_ids || [])
    setFormCc(memo.cc_ids || [])
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null) }

  // ── Save ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formTitle.trim()) return toast.error('Subject / title is required')
    if (!formBodyHtml.trim()) return toast.error('Memo body is required')
    setSaving(true)
    try {
      const payload = {
        title:         formTitle.trim(),
        body_html:     formBodyHtml,
        category:      formCategory,
        visibility:    formVisibility,
        requires_ack:  formVisibility === 'public' ? false : formRequiresAck,
        recipient_ids: formTo,
        cc_ids:        formCc,
        updated_at:    new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('governance_documents').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Memo updated')
      } else {
        const txnCode = await generateTxnCode('MO')
        const { error } = await supabase.from('governance_documents').insert([{
          id:                crypto.randomUUID(),
          doc_type:          'memo',
          txn_code:          txnCode,
          published_by:      user.id,
          published_by_name: user.full_name || user.username || '',
          created_at:        new Date().toISOString(),
          ...payload,
        }])
        if (error) throw error
        toast.success(`Memo issued — ${txnCode}`)
      }
      closeForm()
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this memo? This cannot be undone.')) return
    setDeleting(id)
    try {
      const { error } = await supabase.from('governance_documents').delete().eq('id', id)
      if (error) throw error
      toast.success('Memo deleted')
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setDeleting(null) }
  }

  // ── Memo card renderer ────────────────────────────────────────
  const renderMemoCard = (doc, { showAdminActions = false, showAckStatus = false } = {}) => {
    const isNew   = !reads.has(doc.id)
    const isOpen  = expanded === doc.id
    const vis     = doc.visibility || 'public'
    const visCfg  = VIS_CONFIG[vis] || VIS_CONFIG.public
    const author  = doc.published_by_name || 'Unknown'
    const hasAckNeeded = doc.requires_ack && !acks.has(doc.id) && (doc.recipient_ids || []).includes(user.id)
    const ackInfo = showAckStatus && sentAcks[doc.id]

    const bodyContent = isHtmlContent(doc.body_html) ? doc.body_html : (doc.body_html || doc.body || '')
    const isHtml = isHtmlContent(bodyContent)

    return (
      <div key={doc.id} className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Expand toggle */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
            onClick={() => { setExpanded(isOpen ? null : doc.id); markRead(doc.id) }}
          >
            <span className="material-icons" style={{ fontSize: 20, color: isNew ? 'var(--blue)' : 'var(--text-dim)', flexShrink: 0 }}>
              {isNew ? 'mail' : 'drafts'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: isNew ? 700 : 500, fontSize: 13, color: isNew ? 'var(--text)' : 'var(--text-mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {doc.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {doc.txn_code && (
                  <span style={{ fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 700 }}>{doc.txn_code}</span>
                )}
                <span>{doc.category} · {author} · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {doc.updated_at && doc.updated_at !== doc.created_at && (
                  <span style={{ color: 'var(--teal)' }}>· edited</span>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, color: visCfg.color, background: visCfg.bg, border: `1px solid ${visCfg.border}` }}>
                  {visCfg.label}
                </span>
                {ackInfo && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, color: ackInfo.acknowledged >= ackInfo.total ? 'var(--teal)' : 'var(--yellow)', background: ackInfo.acknowledged >= ackInfo.total ? 'rgba(45,212,191,.1)' : 'rgba(251,191,36,.1)', border: `1px solid ${ackInfo.acknowledged >= ackInfo.total ? 'rgba(45,212,191,.3)' : 'rgba(251,191,36,.3)'}` }}>
                    {ackInfo.acknowledged}/{ackInfo.total} acknowledged
                  </span>
                )}
              </div>
            </div>
            {isNew && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.25)', padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>NEW</span>}
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)', flexShrink: 0 }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
          </div>

          {/* Admin actions */}
          {showAdminActions && isAdmin && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(doc)} title="Edit">
                <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id} title="Delete">
                <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
              </button>
            </div>
          )}
        </div>

        {isOpen && (
          <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
            {/* To / CC line */}
            {((doc.recipient_ids || []).length > 0 || (doc.cc_ids || []).length > 0) && (
              <div style={{ paddingTop: 10, fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {(doc.recipient_ids || []).length > 0 && (
                  <div><strong style={{ color: 'var(--text-mid)' }}>To:</strong> {doc.recipient_ids.map(id => userName(id)).join(', ')}</div>
                )}
                {(doc.cc_ids || []).length > 0 && (
                  <div><strong style={{ color: 'var(--text-mid)' }}>CC:</strong> {doc.cc_ids.map(id => userName(id)).join(', ')}</div>
                )}
              </div>
            )}

            {/* Body */}
            <div style={{ paddingTop: 14 }}>
              {isHtml ? (
                <div
                  className="ql-editor"
                  style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7, padding: 0 }}
                  dangerouslySetInnerHTML={{ __html: bodyContent }}
                />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{bodyContent}</div>
              )}
            </div>

            {/* Acknowledgement banner */}
            {hasAckNeeded && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 600 }}>⚠ Acknowledgement required</span>
                <button
                  className="btn btn-sm"
                  style={{ background: 'rgba(251,191,36,.2)', border: '1px solid rgba(251,191,36,.4)', color: 'var(--yellow)', fontSize: 12 }}
                  onClick={() => handleAcknowledge(doc.id)}
                  disabled={acking === doc.id}
                >
                  {acking === doc.id ? 'Recording…' : 'I acknowledge receipt of this memo'}
                </button>
              </div>
            )}

            {/* Already acknowledged note */}
            {doc.requires_ack && acks.has(doc.id) && (doc.recipient_ids || []).includes(user.id) && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span>
                You have acknowledged this memo.
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Memos</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Internal memoranda</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>mail</span> Issue Memo
          </button>
        )}
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
          {['inbox', 'sent'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 20px', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--gold)' : 'var(--text-dim)', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent', marginBottom: -2, cursor: 'pointer', textTransform: 'capitalize', transition: 'color .15s' }}>
              {t === 'inbox' ? 'Inbox' : 'Sent'}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : tab === 'inbox' ? (
        memos.length === 0 ? (
          <div className="empty-state">
            <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>mail</span>
            <p>No memos in your inbox.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memos.map(doc => renderMemoCard(doc, { showAdminActions: true }))}
          </div>
        )
      ) : (
        sentMemos.length === 0 ? (
          <div className="empty-state">
            <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>outbox</span>
            <p>You have not issued any memos.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sentMemos.map(doc => renderMemoCard(doc, { showAdminActions: true, showAckStatus: true }))}
          </div>
        )
      )}

      {/* Issue / Edit Memo modal */}
      <ModalDialog open={showForm} onClose={closeForm} title={`${editing ? 'Edit' : 'Issue'} Memo`}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editing?.txn_code && (
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--gold)', background: 'rgba(251,191,36,.1)', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>{editing.txn_code}</div>
          )}

          {/* Formal header block */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', minWidth: 50 }}>From:</span>
              <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>{user?.full_name || user?.username || ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', minWidth: 50 }}>Date:</span>
              <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          {/* To & CC pickers */}
          <EmployeePicker label="To *" selected={formTo} onChange={setFormTo} allUsers={allUsers} />
          <EmployeePicker label="CC (optional)" selected={formCc} onChange={setFormCc} allUsers={allUsers} />

          <div className="form-group">
            <label className="form-label">Subject / Title *</label>
            <input required className="form-control" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Memo subject…" />
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-control" value={formCategory} onChange={e => setFormCategory(e.target.value)}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Body *</label>
            <RichTextEditor
              value={formBodyHtml}
              onChange={setFormBodyHtml}
              toolbar="full"
              minHeight={250}
              placeholder="Write memo here…"
            />
          </div>

          {/* Visibility + requires ack */}
          <div className="form-group">
            <label className="form-label">Visibility</label>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {['public', 'private', 'confidential'].map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: formVisibility === v ? 'var(--text)' : 'var(--text-dim)' }}>
                  <input type="radio" name="visibility" value={v} checked={formVisibility === v} onChange={() => { setFormVisibility(v); if (v === 'public') setFormRequiresAck(false) }} />
                  {VIS_CONFIG[v].label}
                </label>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
              {formVisibility === 'public' && 'Visible to all users'}
              {formVisibility === 'private' && 'Visible to To + CC recipients (and admins)'}
              {formVisibility === 'confidential' && 'Visible to To recipients only (CC cannot see)'}
            </div>
          </div>

          {formVisibility !== 'public' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={formRequiresAck} onChange={e => setFormRequiresAck(e.target.checked)} />
              <span>Requires Acknowledgement — recipients must confirm receipt</span>
            </label>
          )}

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Memo' : 'Issue Memo'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
