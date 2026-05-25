// src/pages/Governance/Announcements.jsx
// Upgraded: expiry/archive, pinning, audience targeting, read receipt dashboard

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { ModalDialog, ModalActions, TabNav } from '../../components/ui'
import toast from 'react-hot-toast'

// ── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  normal:    { color: 'var(--teal)',   bg: 'rgba(45,212,191,.08)',  border: 'rgba(45,212,191,.25)'  },
  important: { color: 'var(--yellow)', bg: 'rgba(251,191,36,.08)',  border: 'rgba(251,191,36,.25)'  },
  urgent:    { color: 'var(--red)',    bg: 'rgba(239,68,68,.08)',   border: 'rgba(239,68,68,.25)'   },
}

const ROLE_CHIPS = [
  { id: 'role_manager',       label: 'Managers'    },
  { id: 'role_hr',            label: 'HR'          },
  { id: 'role_finance',       label: 'Finance'     },
  { id: 'role_procurement',   label: 'Procurement' },
  { id: 'role_operations',    label: 'Operations'  },
  { id: 'role_super_admin',   label: 'Admin'       },
]

const TODAY = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

function isExpired(doc) {
  return doc.expiry_date && doc.expiry_date < TODAY
}

function isActiveDoc(doc) {
  return !doc.is_archived && !isExpired(doc)
}

function isArchivedDoc(doc) {
  return doc.is_archived || isExpired(doc)
}

function isEffectivelyPinned(doc) {
  if (!doc.is_pinned) return false
  if (!doc.pin_until) return true
  return doc.pin_until >= TODAY
}

function expiresWithin7Days(doc) {
  if (!doc.expiry_date || isExpired(doc)) return false
  const diff = (new Date(doc.expiry_date) - new Date(TODAY)) / (1000 * 60 * 60 * 24)
  return diff <= 7
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Badge helper ─────────────────────────────────────────────────────────────

function Chip({ children, color, bg, border }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: color || 'var(--text-mid)',
      background: bg || 'rgba(148,163,184,.12)',
      border: `1px solid ${border || 'rgba(148,163,184,.25)'}`,
      padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {children}
    </span>
  )
}

// ── Empty form state ──────────────────────────────────────────────────────────

function blankForm() {
  return {
    title:        '',
    body:         '',
    priority:     'normal',
    expiry_date:  '',
    is_pinned:    false,
    pin_until:    '',
    target_roles: [],
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Announcements() {
  const { user } = useAuth()

  const [docs,          setDocs]          = useState([])
  const [reads,         setReads]         = useState(new Set())      // Set<document_id>
  const [loading,       setLoading]       = useState(true)
  const [activeTab,     setActiveTab]     = useState('active')

  // Form modal
  const [showForm,      setShowForm]      = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(null)
  const [editing,       setEditing]       = useState(null)
  const [form,          setForm]          = useState(blankForm())

  // Read-receipt modal
  const [receiptDoc,    setReceiptDoc]    = useState(null)           // doc object
  const [allUsers,      setAllUsers]      = useState([])
  const [docReads,      setDocReads]      = useState([])
  const [loadingReceipt, setLoadingReceipt] = useState(false)

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr', 'role_manager'].includes(user?.role_id)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [dRes, rRes] = await Promise.all([
      supabase.from('governance_documents')
        .select('id, title, body, priority, published_by_name, created_at, updated_at, expiry_date, is_archived, archived_at, is_pinned, pin_until, target_roles, target_departments')
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

  // ── Filtering ──────────────────────────────────────────────────────────────

  const visibleActive = useMemo(() => {
    return docs
      .filter(isActiveDoc)
      .filter(doc => {
        const tr = doc.target_roles || []
        if (tr.length === 0) return true
        return tr.includes(user?.role_id)
      })
      .sort((a, b) => {
        const pa = isEffectivelyPinned(a) ? 1 : 0
        const pb = isEffectivelyPinned(b) ? 1 : 0
        if (pa !== pb) return pb - pa
        return new Date(b.created_at) - new Date(a.created_at)
      })
  }, [docs, user?.role_id])

  const visibleArchived = useMemo(() => {
    return docs
      .filter(isArchivedDoc)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [docs])

  const pinnedDocs  = useMemo(() => visibleActive.filter(isEffectivelyPinned), [visibleActive])
  const regularDocs = useMemo(() => visibleActive.filter(d => !isEffectivelyPinned(d)), [visibleActive])

  // ── Tab config ─────────────────────────────────────────────────────────────

  const tabs = useMemo(() => {
    const t = [
      { id: 'active',   label: 'Active',   icon: 'campaign',    count: visibleActive.length   },
      { id: 'archived', label: 'Archived', icon: 'inventory_2', count: visibleArchived.length },
    ]
    if (isAdmin) t.push({ id: 'receipts', label: 'Read Receipts', icon: 'fact_check' })
    return t
  }, [visibleActive.length, visibleArchived.length, isAdmin])

  // ── Mark read ──────────────────────────────────────────────────────────────

  const markRead = async (docId) => {
    if (reads.has(docId)) return
    await supabase.from('announcement_reads').insert([{
      id: crypto.randomUUID(), document_id: docId, user_id: user.id, read_at: new Date().toISOString(),
    }])
    setReads(prev => new Set([...prev, docId]))
  }

  // ── Form helpers ───────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null)
    setForm(blankForm())
    setShowForm(true)
  }

  const openEdit = (doc) => {
    setEditing(doc)
    setForm({
      title:        doc.title || '',
      body:         doc.body || '',
      priority:     doc.priority || 'normal',
      expiry_date:  doc.expiry_date || '',
      is_pinned:    doc.is_pinned || false,
      pin_until:    doc.pin_until || '',
      target_roles: doc.target_roles || [],
    })
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditing(null) }

  const setF = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const toggleRole = (roleId) => {
    setForm(prev => {
      const roles = prev.target_roles || []
      return { ...prev, target_roles: roles.includes(roleId) ? roles.filter(r => r !== roleId) : [...roles, roleId] }
    })
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return toast.error('Title and message are required')
    setSaving(true)
    try {
      const payload = {
        title:        form.title.trim(),
        body:         form.body.trim(),
        priority:     form.priority,
        expiry_date:  form.expiry_date || null,
        is_pinned:    form.is_pinned,
        pin_until:    form.is_pinned && form.pin_until ? form.pin_until : null,
        target_roles: form.target_roles.length > 0 ? form.target_roles : [],
        updated_at:   new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('governance_documents').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Announcement updated')
      } else {
        const { error } = await supabase.from('governance_documents').insert([{
          id:                crypto.randomUUID(),
          doc_type:          'announcement',
          published_by:      user.id,
          published_by_name: user.full_name || user.username || '',
          created_at:        new Date().toISOString(),
          is_archived:       false,
          archived_at:       null,
          ...payload,
        }])
        if (error) throw error
        toast.success('Announcement published')
      }
      closeForm()
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // ── Archive / Restore ──────────────────────────────────────────────────────

  const handleArchive = async (doc) => {
    if (!window.confirm('Archive this announcement?')) return
    try {
      const { error } = await supabase.from('governance_documents').update({
        is_archived: true, archived_at: new Date().toISOString(),
      }).eq('id', doc.id)
      if (error) throw error
      toast.success('Archived')
      await fetchData()
    } catch (err) { toast.error(err.message) }
  }

  const handleRestore = async (doc) => {
    try {
      const { error } = await supabase.from('governance_documents').update({
        is_archived: false, archived_at: null,
      }).eq('id', doc.id)
      if (error) throw error
      toast.success('Restored')
      await fetchData()
    } catch (err) { toast.error(err.message) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return
    setDeleting(id)
    try {
      const { error } = await supabase.from('governance_documents').delete().eq('id', id)
      if (error) throw error
      toast.success('Deleted')
      await fetchData()
    } catch (err) {
      toast.error(err.message)
    } finally { setDeleting(null) }
  }

  // ── Read Receipt Modal ─────────────────────────────────────────────────────

  const openReceipts = async (doc) => {
    setReceiptDoc(doc)
    setLoadingReceipt(true)
    const [uRes, rRes] = await Promise.all([
      supabase.from('app_users').select('id, full_name, username').eq('is_active', true),
      supabase.from('announcement_reads').select('user_id, read_at').eq('document_id', doc.id),
    ])
    setAllUsers(uRes.data || [])
    setDocReads(rRes.data || [])
    setLoadingReceipt(false)
  }

  const closeReceipts = () => { setReceiptDoc(null); setAllUsers([]); setDocReads([]) }

  const exportReceiptCSV = () => {
    if (!receiptDoc) return
    const readMap = new Map(docReads.map(r => [r.user_id, r.read_at]))
    const rows = allUsers.map(u => ({
      employee: u.full_name || u.username,
      status:   readMap.has(u.id) ? 'Read' : 'Unread',
      read_at:  readMap.has(u.id) ? fmtDateTime(readMap.get(u.id)) : '',
    }))
    const csv = ['Employee,Status,Read At', ...rows.map(r => `"${r.employee}","${r.status}","${r.read_at}"`)].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `read-receipts-${receiptDoc.id.slice(0, 8)}.csv`
    a.click()
  }

  // ── Card renderer ──────────────────────────────────────────────────────────

  const renderCard = (doc, opts = {}) => {
    const { dimmed = false } = opts
    const pc     = PRIORITY_CONFIG[doc.priority] || PRIORITY_CONFIG.normal
    const isNew  = !reads.has(doc.id)
    const pinned = isEffectivelyPinned(doc)
    const author = doc.published_by_name || 'Unknown'
    const expiring = expiresWithin7Days(doc)
    const targeted = (doc.target_roles || []).length > 0

    return (
      <div
        key={doc.id}
        className="card"
        style={{
          padding: 20,
          borderLeft: `4px solid ${pinned ? 'var(--gold)' : pc.color}`,
          opacity: dimmed ? 0.7 : 1,
          border: pinned ? `1px solid var(--gold)` : undefined,
          position: 'relative',
        }}
        onClick={() => !dimmed && markRead(doc.id)}
      >
        {pinned && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            fontSize: 10, fontWeight: 700, color: 'var(--gold)',
            background: 'rgba(184,50,50,.12)', border: '1px solid var(--gold)',
            padding: '2px 7px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <span className="material-icons" style={{ fontSize: 12 }}>push_pin</span> Pinned
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap', paddingRight: pinned ? 80 : 0 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{doc.title}</span>
              {doc.priority !== 'normal' && (
                <Chip color={pc.color} bg={pc.bg} border={pc.border}>{doc.priority}</Chip>
              )}
              {isNew && !dimmed && (
                <Chip color="var(--blue)" bg="rgba(96,165,250,.12)" border="rgba(96,165,250,.25)">New</Chip>
              )}
              {expiring && (
                <Chip color="var(--yellow)" bg="rgba(251,191,36,.1)" border="rgba(251,191,36,.3)">
                  Expires {fmtDate(doc.expiry_date)}
                </Chip>
              )}
              {targeted && (
                <Chip color="var(--teal)" bg="rgba(45,212,191,.08)" border="rgba(45,212,191,.25)">Targeted</Chip>
              )}
            </div>

            {/* Body */}
            <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{doc.body}</div>

            {/* Meta */}
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              {author} · {fmtDate(doc.created_at)}
              {doc.updated_at && doc.updated_at !== doc.created_at && (
                <span style={{ marginLeft: 8, color: 'var(--teal)' }}>· edited</span>
              )}
              {dimmed && doc.is_archived && doc.archived_at && (
                <span style={{ marginLeft: 8, color: 'var(--red)' }}>· archived {fmtDate(doc.archived_at)}</span>
              )}
              {dimmed && isExpired(doc) && (
                <span style={{ marginLeft: 8, color: 'var(--yellow)' }}>· expired {fmtDate(doc.expiry_date)}</span>
              )}
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {!isNew && !dimmed && (
              <span className="material-icons" style={{ fontSize: 18, color: 'var(--green)' }}>check_circle</span>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4 }}>
                {/* Read receipt eye icon */}
                {!dimmed && (
                  <button className="btn btn-secondary btn-sm" onClick={() => openReceipts(doc)} title="Read receipts">
                    <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                  </button>
                )}
                {!dimmed && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(doc)} title="Edit">
                      <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleArchive(doc)} title="Archive">
                      <span className="material-icons" style={{ fontSize: 14 }}>inventory_2</span>
                    </button>
                  </>
                )}
                {dimmed && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleRestore(doc)} title="Restore">
                    <span className="material-icons" style={{ fontSize: 14 }}>unarchive</span>
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id} title="Delete">
                  <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Active tab ─────────────────────────────────────────────────────

  const renderActive = () => {
    if (visibleActive.length === 0) {
      return (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>campaign</span>
          <p>No active announcements.</p>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pinnedDocs.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-icons" style={{ fontSize: 14 }}>push_pin</span> Pinned
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pinnedDocs.map(doc => renderCard(doc))}
            </div>
          </div>
        )}
        {regularDocs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {regularDocs.map(doc => renderCard(doc))}
          </div>
        )}
      </div>
    )
  }

  // ── Render: Archived tab ───────────────────────────────────────────────────

  const renderArchived = () => {
    if (visibleArchived.length === 0) {
      return (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>inventory_2</span>
          <p>No archived announcements.</p>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleArchived.map(doc => renderCard(doc, { dimmed: true }))}
      </div>
    )
  }

  // ── Render: Read Receipts overview tab (admin) ─────────────────────────────

  const renderReceiptsTab = () => {
    const activeWithReceipts = visibleActive.concat(visibleArchived)
    if (activeWithReceipts.length === 0) {
      return (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>fact_check</span>
          <p>No announcements to show receipts for.</p>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Click the eye icon on any card to view individual read receipts.</div>
        {activeWithReceipts.map(doc => (
          <div key={doc.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtDate(doc.created_at)}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => openReceipts(doc)}>
              <span className="material-icons" style={{ fontSize: 14 }}>visibility</span> View Receipts
            </button>
          </div>
        ))}
      </div>
    )
  }

  // ── Read Receipt Modal content ─────────────────────────────────────────────

  const renderReceiptModal = () => {
    if (!receiptDoc) return null
    const readMap     = new Map(docReads.map(r => [r.user_id, r.read_at]))
    const readUsers   = allUsers.filter(u => readMap.has(u.id))
    const unreadUsers = allUsers.filter(u => !readMap.has(u.id))
    const total       = allUsers.length
    const readCount   = readUsers.length
    const pct         = total > 0 ? Math.round((readCount / total) * 100) : 0

    return (
      <ModalDialog
        open={!!receiptDoc}
        onClose={closeReceipts}
        title={`${receiptDoc.title} · Read Receipts`}
        size="lg"
      >
        {loadingReceipt ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Read',   val: readCount,          color: 'var(--green)'  },
                { label: 'Total',  val: total,              color: 'var(--blue)'   },
                { label: 'Unread', val: total - readCount,  color: 'var(--red)'    },
                { label: '%',      val: `${pct}%`,          color: 'var(--teal)'   },
              ].map(k => (
                <div key={k.label} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>{k.label}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div style={{ background: 'var(--surface2)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', transition: 'width .4s' }} />
            </div>
            {/* Two lists */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Read */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span> Read ({readCount})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {readUsers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No reads yet.</div>
                  ) : readUsers.map(u => (
                    <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{u.full_name || u.username}</span>
                      <span style={{ color: 'var(--text-dim)' }}>{fmtDateTime(readMap.get(u.id))}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Unread */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>cancel</span> Unread ({total - readCount})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                  {unreadUsers.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>Everyone has read this!</div>
                  ) : unreadUsers.map(u => (
                    <div key={u.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-mid)' }}>
                      {u.full_name || u.username}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Actions */}
            <ModalActions>
              <button className="btn btn-secondary" onClick={exportReceiptCSV}>
                <span className="material-icons" style={{ fontSize: 14 }}>download</span> Export CSV
              </button>
              <button className="btn btn-secondary" onClick={closeReceipts}>Close</button>
            </ModalActions>
          </div>
        )}
      </ModalDialog>
    )
  }

  // ── Publish/Edit modal ─────────────────────────────────────────────────────

  const renderFormModal = () => (
    <ModalDialog open={showForm} onClose={closeForm} title={`${editing ? 'Edit' : 'Post'} Announcement`} size="lg">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Title *</label>
          <input required type="text" className="form-control" value={form.title} onChange={e => setF('title', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Message *</label>
          <textarea required rows={6} className="form-control" style={{ resize: 'vertical' }}
            value={form.body} onChange={e => setF('body', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Priority</label>
          <select className="form-control" value={form.priority} onChange={e => setF('priority', e.target.value)}>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Auto-archive after (optional)</label>
          <input type="date" className="form-control" value={form.expiry_date} onChange={e => setF('expiry_date', e.target.value)} />
        </div>

        {/* Pin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="pin-check" checked={form.is_pinned} onChange={e => setF('is_pinned', e.target.checked)} />
          <label htmlFor="pin-check" className="form-label" style={{ margin: 0 }}>Pin this announcement</label>
        </div>
        {form.is_pinned && (
          <div className="form-group" style={{ paddingLeft: 24 }}>
            <label className="form-label">Pin until (optional)</label>
            <input type="date" className="form-control" value={form.pin_until} onChange={e => setF('pin_until', e.target.value)} />
          </div>
        )}

        {/* Target roles */}
        <div className="form-group">
          <label className="form-label">Target roles (leave empty for all)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {/* All chip */}
            <button
              type="button"
              onClick={() => setF('target_roles', [])}
              style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 700,
                background: form.target_roles.length === 0 ? 'var(--gold)' : 'var(--surface2)',
                color: form.target_roles.length === 0 ? '#fff' : 'var(--text-mid)',
                border: `1px solid ${form.target_roles.length === 0 ? 'var(--gold)' : 'var(--border2)'}`,
              }}
            >
              All
            </button>
            {ROLE_CHIPS.map(rc => {
              const active = form.target_roles.includes(rc.id)
              return (
                <button
                  key={rc.id}
                  type="button"
                  onClick={() => toggleRole(rc.id)}
                  style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 600,
                    background: active ? 'rgba(45,212,191,.15)' : 'var(--surface2)',
                    color: active ? 'var(--teal)' : 'var(--text-mid)',
                    border: `1px solid ${active ? 'var(--teal)' : 'var(--border2)'}`,
                  }}
                >
                  {rc.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Archive existing */}
        {editing && !editing.is_archived && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 6 }}>Danger zone</div>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { closeForm(); handleArchive(editing) }}>
              <span className="material-icons" style={{ fontSize: 14 }}>inventory_2</span> Archive this announcement
            </button>
          </div>
        )}

        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Publish'}
          </button>
        </ModalActions>
      </form>
    </ModalDialog>
  )

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Announcements</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Company-wide communications</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons" style={{ fontSize: 16 }}>campaign</span> Post Announcement
          </button>
        )}
      </div>

      {/* Tabs */}
      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : activeTab === 'active'   ? renderActive()
          : activeTab === 'archived' ? renderArchived()
          :                            renderReceiptsTab()
        }
      </div>

      {/* Modals */}
      {isAdmin && renderFormModal()}
      {renderReceiptModal()}
    </div>
  )
}
