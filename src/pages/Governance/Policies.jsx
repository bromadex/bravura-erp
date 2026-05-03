// src/pages/Governance/Policies.jsx
// Policies & Rules using governance_documents where doc_type='policy'
// Employees can accept/reject. Admins can publish and view response stats.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function Policies() {
  const { user } = useAuth()
  const [policies,   setPolicies]   = useState([])
  const [responses,  setResponses]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [signing,    setSigning]    = useState(null)
  const [signComment, setSignComment] = useState('')
  const [form, setForm] = useState({ title: '', body: '', version: '1.0', category: 'General' })

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [pRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, title, body, version, category, published_by_name, created_at')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('governance_documents').insert([{
        id:                crypto.randomUUID(),
        doc_type:          'policy',
        title:             form.title,
        body:              form.body,
        version:           form.version,
        category:          form.category,
        published_by:      user.id,
        published_by_name: user.full_name || user.username || '',
        created_at:        new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Policy published')
      setShowForm(false)
      setForm({ title: '', body: '', version: '1.0', category: 'General' })
      fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const handleRespond = async (response) => {
    if (!signing) return
    setSaving(true)
    try {
      const existing = myResponse(signing.id)
      if (existing) {
        const { error } = await supabase.from('governance_responses')
          .update({ response, comments: signComment, responded_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('governance_responses').insert([{
          id:           crypto.randomUUID(),
          document_id:  signing.id,
          user_id:      user.id,
          response,
          comments:     signComment || null,
          responded_at: new Date().toISOString(),
        }])
        if (error) throw error
      }
      toast.success(response === 'accepted' ? 'Policy accepted' : 'Response recorded')
      setSigning(null)
      setSignComment('')
      fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const RESPONSE_STYLE = {
    accepted: { color: 'var(--green)',    bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.3)',  icon: 'check_circle' },
    rejected: { color: 'var(--red)',      bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.3)',   icon: 'cancel'       },
    consulted:{ color: 'var(--yellow)',   bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  icon: 'forum'        },
  }

  const CATS = ['General', 'HR', 'Operations', 'Safety', 'Finance', 'IT', 'Legal']

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Policies &amp; Rules</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Company policies requiring acknowledgement</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Policy
          </button>
        )}
      </div>

      {policies.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>description</span>
          <p>No policies published yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {policies.map(p => {
            const resp = myResponse(p.id)
            const rs   = resp ? RESPONSE_STYLE[resp.response] : null
            const author = p.published_by_name || 'Unknown'
            return (
              <div key={p.id} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="material-icons" style={{ fontSize: 32, color: rs ? rs.color : 'var(--yellow)', flexShrink: 0 }}>
                  {rs ? rs.icon : 'description'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {p.category} · v{p.version || '1.0'} · {author} · {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </div>
                  {p.body && (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.body}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {resp ? (
                    <>
                      <span style={{ padding: '2px 10px', borderRadius: 20, background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                        {resp.response}
                      </span>
                      <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => { setSigning(p); setSignComment(resp.comments || '') }}>
                        Change
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => { setSigning(p); setSignComment('') }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>draw</span> Respond
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Respond modal */}
      {signing && (
        <>
          <div onClick={() => { setSigning(null); setSignComment('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Respond to Policy</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              <strong style={{ color: 'var(--text)' }}>{signing.title}</strong>
            </div>
            {signing.body && (
              <div style={{ maxHeight: 150, overflowY: 'auto', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                {signing.body}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Comments (optional)</label>
              <textarea rows={2} className="form-control" style={{ resize: 'vertical' }} value={signComment}
                onChange={e => setSignComment(e.target.value)} placeholder="Add any comments or concerns…" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => { setSigning(null); setSignComment('') }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleRespond('rejected')} disabled={saving}>Reject</button>
              <button className="btn btn-primary" onClick={() => handleRespond('accepted')} disabled={saving}>
                {saving ? 'Saving…' : 'Accept'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Publish policy modal */}
      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 560, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--yellow)' }}>description</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Publish Policy</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Policy Title *</label>
                <input required className="form-control" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Version</label>
                  <input className="form-control" placeholder="1.0" value={form.version}
                    onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Policy Text *</label>
                <textarea required rows={8} className="form-control" style={{ resize: 'vertical' }} value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Publishing…' : 'Publish Policy'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
