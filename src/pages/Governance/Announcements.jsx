// src/pages/Governance/Announcements.jsx
// Uses governance_documents where doc_type='announcement'
// Tracks reads via announcement_reads table

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const PRIORITY_CONFIG = {
  normal:    { color: 'var(--teal)',   bg: 'rgba(45,212,191,.08)',  border: 'rgba(45,212,191,.25)'  },
  important: { color: 'var(--yellow)', bg: 'rgba(251,191,36,.08)',  border: 'rgba(251,191,36,.25)'  },
  urgent:    { color: 'var(--red)',    bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.25)'   },
}

export default function Announcements() {
  const { user } = useAuth()
  const [docs,       setDocs]       = useState([])
  const [reads,      setReads]      = useState(new Set())
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [form,       setForm]       = useState({ title: '', body: '', priority: 'normal' })

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr', 'role_manager'].includes(user?.role_id)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [dRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, title, body, priority, published_by_name, created_at')
        .eq('doc_type', 'announcement')
        .order('created_at', { ascending: false }),
      supabase.from('announcement_reads')
        .select('document_id')
        .eq('user_id', user.id),
    ])
    if (dRes.data) setDocs(dRes.data)
    if (rRes.data) setReads(new Set(rRes.data.map(r => r.document_id)))
    setLoading(false)
  }, [user.id])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('governance_documents').insert([{
        id:                crypto.randomUUID(),
        doc_type:          'announcement',
        title:             form.title,
        body:              form.body,
        priority:          form.priority,
        published_by:      user.id,
        published_by_name: user.full_name || user.username || '',
        created_at:        new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Announcement published')
      setShowForm(false)
      setForm({ title: '', body: '', priority: 'normal' })
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Announcements</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Company-wide communications</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-icons" style={{ fontSize: 16 }}>campaign</span> Post Announcement
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>campaign</span>
          <p>No announcements yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.map(doc => {
            const pc    = PRIORITY_CONFIG[doc.priority] || PRIORITY_CONFIG.normal
            const isNew = !reads.has(doc.id)
            const author = doc.published_by_name || 'Unknown'
            return (
              <div key={doc.id} className="card"
                style={{ padding: 20, borderLeft: `4px solid ${pc.color}`, cursor: isNew ? 'pointer' : 'default', opacity: isNew ? 1 : 0.85 }}
                onClick={() => markRead(doc.id)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{doc.title}</span>
                      {doc.priority !== 'normal' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: pc.color, background: pc.bg, border: `1px solid ${pc.border}`, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
                          {doc.priority}
                        </span>
                      )}
                      {isNew && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(96,165,250,.12)', border: '1px solid rgba(96,165,250,.25)', padding: '2px 8px', borderRadius: 10 }}>
                          NEW
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{doc.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                      {author} · {new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {!isNew && <span className="material-icons" style={{ fontSize: 18, color: 'var(--green)', flexShrink: 0, marginTop: 2 }}>check_circle</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Post modal */}
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 540, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--gold)' }}>campaign</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Post Announcement</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input required type="text" className="form-control" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Message *</label>
                <textarea required rows={5} className="form-control" style={{ resize: 'vertical' }} value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-control" value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Publishing…' : 'Publish'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
