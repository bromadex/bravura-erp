// src/pages/Governance/Memos.jsx
// Full edit + delete + stable individual state fields (no cursor jumping)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import toast from 'react-hot-toast'

const CATS = ['General', 'Operations', 'HR', 'Safety', 'Finance', 'Procurement']

export default function Memos() {
  const { user } = useAuth()
  const [memos,    setMemos]    = useState([])
  const [reads,    setReads]    = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [editing,  setEditing]  = useState(null)

  // ── Stable individual fields — prevents cursor jumping ────────
  const [formTitle,    setFormTitle]    = useState('')
  const [formBody,     setFormBody]     = useState('')
  const [formCategory, setFormCategory] = useState('General')

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr', 'role_manager'].includes(user?.role_id)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [mRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, txn_code, title, body, category, published_by_name, created_at, updated_at')
        .eq('doc_type', 'memo')
        .order('created_at', { ascending: false }),
      supabase.from('announcement_reads')
        .select('document_id').eq('user_id', user.id),
    ])
    if (mRes.data) setMemos(mRes.data)
    if (rRes.data) setReads(new Set(rRes.data.map(r => r.document_id)))
    setLoading(false)
  }, [user.id])

  useEffect(() => { fetchData() }, [fetchData])

  const openNew = () => {
    setEditing(null)
    setFormTitle('')
    setFormBody('')
    setFormCategory('General')
    setShowForm(true)
  }

  const openEdit = (memo) => {
    setEditing(memo)
    setFormTitle(memo.title || '')
    setFormBody(memo.body || '')
    setFormCategory(memo.category || 'General')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formTitle.trim() || !formBody.trim()) return toast.error('Title and content are required')
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase.from('governance_documents').update({
          title:      formTitle.trim(),
          body:       formBody.trim(),
          category:   formCategory,
          updated_at: new Date().toISOString(),
        }).eq('id', editing.id)
        if (error) throw error
        toast.success('Memo updated')
      } else {
        const txnCode = await generateTxnCode('MO')
        const { error } = await supabase.from('governance_documents').insert([{
          id:                crypto.randomUUID(),
          doc_type:          'memo',
          txn_code:          txnCode,
          title:             formTitle.trim(),
          body:              formBody.trim(),
          category:          formCategory,
          published_by:      user.id,
          published_by_name: user.full_name || user.username || '',
          created_at:        new Date().toISOString(),
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

  const markRead = async (docId) => {
    if (reads.has(docId)) return
    await supabase.from('announcement_reads').insert([{
      id: crypto.randomUUID(), document_id: docId, user_id: user.id, read_at: new Date().toISOString(),
    }])
    setReads(prev => new Set([...prev, docId]))
  }

  return (
    <div style={{ padding: 24 }}>
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

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : memos.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>mail</span>
          <p>No memos yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {memos.map(doc => {
            const isNew  = !reads.has(doc.id)
            const isOpen = expanded === doc.id
            const author = doc.published_by_name || 'Unknown'
            return (
              <div key={doc.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Expand toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => { setExpanded(isOpen ? null : doc.id); markRead(doc.id) }}>
                    <span className="material-icons" style={{ fontSize: 20, color: isNew ? 'var(--blue)' : 'var(--text-dim)', flexShrink: 0 }}>
                      {isNew ? 'mail' : 'drafts'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: isNew ? 700 : 500, fontSize: 13, color: isNew ? 'var(--text)' : 'var(--text-mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                        {doc.txn_code && (
                          <span style={{ fontFamily: 'monospace', color: 'var(--gold)', marginRight: 8, fontWeight: 700 }}>{doc.txn_code}</span>
                        )}
                        {doc.category} · {author} · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {doc.updated_at && doc.updated_at !== doc.created_at && (
                          <span style={{ marginLeft: 6, color: 'var(--teal)' }}>· edited</span>
                        )}
                      </div>
                    </div>
                    {isNew && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.25)', padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>NEW</span>}
                    <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)', flexShrink: 0 }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
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
                    <div style={{ paddingTop: 14, fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{doc.body}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <>
          <div onClick={closeForm} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <span className="material-icons" style={{ color: 'var(--teal)' }}>mail</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{editing ? 'Edit' : 'Issue'} Memo</div>
              {editing?.txn_code && (
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--gold)', background: 'rgba(251,191,36,.1)', padding: '2px 8px', borderRadius: 8 }}>{editing.txn_code}</span>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Title / Subject *</label>
                <input required className="form-control"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Content *</label>
                <textarea required rows={8} className="form-control" style={{ resize: 'vertical' }}
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update Memo' : 'Issue Memo'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
