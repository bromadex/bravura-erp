// src/pages/Governance/Announcements.jsx — Company-wide announcements

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function Announcements() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState({ title: '', body: '', priority: 'normal' })
  const [saving,        setSaving]        = useState(false)

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  const fetch = async () => {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*, app_users(full_name)').order('created_at', { ascending: false })
    if (data) setAnnouncements(data)
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('announcements').insert([{
        id:          crypto.randomUUID(),
        title:       form.title,
        body:        form.body,
        priority:    form.priority,
        posted_by:   user.id,
        created_at:  new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Announcement published')
      setShowForm(false)
      setForm({ title: '', body: '', priority: 'normal' })
      fetch()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const PRIORITY_COLOR = {
    normal:   'var(--teal)',
    important: 'var(--yellow)',
    urgent:   'var(--red)',
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
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : announcements.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>campaign</span>
          <p>No announcements yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.map(a => {
            const pc = PRIORITY_COLOR[a.priority] || PRIORITY_COLOR.normal
            return (
              <div key={a.id} className="card" style={{ padding: 20, borderLeft: `4px solid ${pc}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{a.title}</span>
                      {a.priority !== 'normal' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: `${pc}18`, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
                          {a.priority}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                      {a.app_users?.full_name || 'Unknown'} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <>
          <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 520, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800 }}>Post Announcement</div>
            <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input required type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Message *</label>
                <textarea required value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={5}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
