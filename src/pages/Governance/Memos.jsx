// src/pages/Governance/Memos.jsx
// Internal memos using governance_documents where doc_type='memo'
// Generates MO transaction codes, tracks reads

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import toast from 'react-hot-toast'

export default function Memos() {
  const { user } = useAuth()
  const [memos,    setMemos]    = useState([])
  const [reads,    setReads]    = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [form,     setForm]     = useState({ title: '', body: '', category: 'General' })

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr', 'role_manager'].includes(user?.role_id)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [mRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('*, app_users(full_name, username)')
        .eq('doc_type', 'memo')
        .order('created_at', { ascending: false }),
      supabase.from('announcement_reads')
        .select('document_id')
        .eq('user_id', user.id),
    ])
    if (mRes.data) setMemos(mRes.data)
    if (rRes.data) setReads(new Set(rRes.data.map(r => r.document_id)))
    setLoading(false)
  }, [user.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const txnCode = await generateTxnCode('MO')
      const { error } = await supabase.from('governance_documents').insert([{
        id:           crypto.randomUUID(),
        doc_type:     'memo',
        txn_code:     txnCode,
        title:        form.title,
        body:         form.body,
        category:     form.category,
        published_by: user.id,
        created_at:   new Date().toISOString(),
      }])
      if (error) throw error
      toast.success(`Memo issued — ${txnCode}`)
      setShowForm(false)
      setForm({ title: '', body: '', category: 'General' })
      fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const markRead = async (docId) => {
    if (reads.has(docId)) return
    await supabase.from('announcement_reads').insert([{
      id:          crypto.randomUUID(),
      document_id: docId,
      user_id:     user.id,
      read_at:     new Date().toISOString(),
    }])
    setReads(prev => new Set([...prev, docId]))
  }

  const CATS = ['General', 'Operations', 'HR', 'Safety', 'Finance', 'Procurement']

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Memos</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Internal memoranda</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
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
            const isNew    = !reads.has(doc.id)
            const isOpen   = expanded === doc.id
            const author   = doc.app_users?.full_name || doc.app_users?.username || 'Unknown'
            return (
              <div key={doc.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => { setExpanded(isOpen ? null : doc.id); markRead(doc.id) }}>
                  <span className="material-icons" style={{ fontSize: 20, color: isNew ? 'var(--blue)' : 'var(--text-dim)', flexShrink: 0 }}>
                    {isNew ? 'mail' : 'drafts'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isNew ? 700 : 500, fontSize: 13, color: isNew ? 'var(--text)' : 'var(--text-mid)' }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {doc.txn_code && <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', marginRight: 8 }}>{doc.txn_code}</span>}
                      {doc.category} · {author} · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {isNew && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.25)', padding: '2px 8px', borderRadius: 10 }}>NEW</span>}
                  <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)' }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
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

      {/* Issue memo modal */}
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 560, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--teal)' }}>mail</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Issue Memo</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Title / Subject *</label>
                <input required className="form-control" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Content *</label>
                <textarea required rows={7} className="form-control" style={{ resize: 'vertical' }} value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Issuing…' : 'Issue Memo'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
