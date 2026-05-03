// src/pages/Connect/ConnectPage.jsx
// Real-time 1:1 and group messaging using Supabase Realtime.
// Tables: chat_conversations, chat_participants, chat_messages, app_users

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function ConnectPage() {
  const { user } = useAuth()

  const [conversations, setConversations] = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [participants,  setParticipants]  = useState([])
  const [allUsers,      setAllUsers]      = useState([])
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [msgText,       setMsgText]       = useState('')
  const [sending,       setSending]       = useState(false)
  const [showNew,       setShowNew]       = useState(false)
  const [newSearch,     setNewSearch]     = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName,     setGroupName]     = useState('')
  const [convSearch,    setConvSearch]    = useState('')
  const [showPanel,     setShowPanel]     = useState('list') // 'list' | 'chat' on mobile
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  // ── Load all system users for new-conversation picker ──────────
  useEffect(() => {
    supabase.from('app_users').select('id, full_name, username, role_id')
      .order('full_name')
      .then(({ data }) => { if (data) setAllUsers(data.filter(u => u.id !== user.id)) })
  }, [user.id])

  // ── Load conversations ─────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    const { data: partData } = await supabase
      .from('chat_participants').select('conversation_id').eq('user_id', user.id)
    if (!partData?.length) { setConversations([]); setLoadingConvs(false); return }
    const ids = partData.map(p => p.conversation_id)
    const { data: convData } = await supabase
      .from('chat_conversations')
      .select('*, chat_participants(user_id), chat_messages(body, created_at, sender_id)')
      .in('id', ids)
      .order('updated_at', { ascending: false })
    if (convData) setConversations(convData)
    setLoadingConvs(false)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Load messages for selected conversation ────────────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return
    setLoadingMsgs(true)
    const [mRes, pRes] = await Promise.all([
      supabase.from('chat_messages')
        .select('*, app_users(full_name, username)')
        .eq('conversation_id', convId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(200),
      supabase.from('chat_participants')
        .select('user_id, app_users(full_name, username)')
        .eq('conversation_id', convId),
    ])
    if (mRes.data) setMessages(mRes.data)
    if (pRes.data) setParticipants(pRes.data)
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId)
      inputRef.current?.focus()
    }
  }, [selectedId, loadMessages])

  // ── Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase.channel(`msgs-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, async (payload) => {
        const msg = payload.new
        // Fetch sender info
        const { data: sender } = await supabase.from('app_users')
          .select('full_name, username').eq('id', msg.sender_id).single()
        setMessages(prev => [...prev, { ...msg, app_users: sender }])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  // ── Scroll to bottom ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ───────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault()
    const body = msgText.trim()
    if (!body || !selectedId) return
    setSending(true)
    try {
      const { error } = await supabase.from('chat_messages').insert([{
        id:              crypto.randomUUID(),
        conversation_id: selectedId,
        sender_id:       user.id,
        body,
        is_deleted:      false,
        created_at:      new Date().toISOString(),
      }])
      if (error) throw error
      // Update conversation timestamp
      await supabase.from('chat_conversations')
        .update({ updated_at: new Date().toISOString() }).eq('id', selectedId)
      setMsgText('')
      loadConversations()
    } catch (err) {
      toast.error(err.message)
    } finally { setSending(false) }
  }

  // ── Create new conversation ────────────────────────────────────
  const createConversation = async () => {
    if (selectedUsers.length === 0) return toast.error('Select at least one person')
    try {
      const isGroup  = selectedUsers.length > 1
      const convId   = crypto.randomUUID()
      const now      = new Date().toISOString()

      // For 1:1, check if conversation already exists
      if (!isGroup) {
        const otherId = selectedUsers[0]
        const { data: existing } = await supabase
          .from('chat_participants').select('conversation_id').eq('user_id', user.id)
        if (existing?.length) {
          const myConvIds = existing.map(p => p.conversation_id)
          const { data: shared } = await supabase
            .from('chat_participants').select('conversation_id')
            .eq('user_id', otherId).in('conversation_id', myConvIds)
          if (shared?.length) {
            // Check it's a direct chat
            const { data: conv } = await supabase
              .from('chat_conversations').select('id, type')
              .eq('id', shared[0].conversation_id).eq('type', 'direct').single()
            if (conv) {
              setSelectedId(conv.id)
              setShowNew(false)
              setSelectedUsers([])
              setShowPanel('chat')
              return
            }
          }
        }
      }

      const { error: ce } = await supabase.from('chat_conversations').insert([{
        id:         convId,
        type:       isGroup ? 'group' : 'direct',
        name:       isGroup ? (groupName.trim() || 'Group Chat') : null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      }])
      if (ce) throw ce

      const allParticipants = [user.id, ...selectedUsers]
      await supabase.from('chat_participants').insert(
        allParticipants.map(uid => ({
          id:              crypto.randomUUID(),
          conversation_id: convId,
          user_id:         uid,
          joined_at:       now,
        }))
      )

      setSelectedId(convId)
      setShowNew(false)
      setSelectedUsers([])
      setGroupName('')
      setShowPanel('chat')
      await loadConversations()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────
  const getConvName = (conv) => {
    if (conv.type === 'group') return conv.name || 'Group Chat'
    const otherPart = conv.chat_participants?.find(p => p.user_id !== user.id)
    if (!otherPart) return 'Unknown'
    const other = allUsers.find(u => u.id === otherPart.user_id)
    return other?.full_name || other?.username || 'Unknown'
  }

  const getConvInitial = (conv) => {
    if (conv.type === 'group') return 'G'
    return getConvName(conv).charAt(0).toUpperCase()
  }

  const getLastMsg = (conv) => {
    const msgs = conv.chat_messages
    if (!msgs?.length) return { text: 'No messages yet', time: '' }
    const last = msgs.reduce((a, b) => a.created_at > b.created_at ? a : b)
    const text = last.sender_id === user.id ? `You: ${last.body}` : last.body
    return { text: text.slice(0, 45) + (text.length > 45 ? '…' : ''), time: formatTime(last.created_at) }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60)    return 'now'
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const formatMsgTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const filteredConvs = conversations.filter(c =>
    !convSearch || getConvName(c).toLowerCase().includes(convSearch.toLowerCase())
  )

  const filteredUsers = allUsers.filter(u =>
    !newSearch ||
    u.full_name?.toLowerCase().includes(newSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(newSearch.toLowerCase())
  )

  const selectedConv = conversations.find(c => c.id === selectedId)

  // ── Group messages by date ─────────────────────────────────────
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  const PANEL_W = 320
  const isMobile = false // placeholder — CSS handles this

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Conversations list ── */}
      <div style={{ width: PANEL_W, minWidth: PANEL_W, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Messages</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <span className="material-icons" style={{ fontSize: 15 }}>add</span> New
          </button>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <input className="form-control" placeholder="Search conversations…" style={{ fontSize: 12 }}
            value={convSearch} onChange={e => setConvSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
          ) : filteredConvs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              <span className="material-icons" style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 8 }}>chat</span>
              No conversations yet.<br />Start one with the + button.
            </div>
          ) : filteredConvs.map(conv => {
            const isActive = conv.id === selectedId
            const name     = getConvName(conv)
            const last     = getLastMsg(conv)
            return (
              <div key={conv.id} onClick={() => { setSelectedId(conv.id); setShowPanel('chat') }}
                style={{ padding: '11px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isActive ? 'var(--surface2)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}` }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface)' }}
                onMouseOut={e =>  { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: conv.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a', flexShrink: 0 }}>
                  {getConvInitial(conv)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isActive ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last.text}</div>
                </div>
                {last.time && <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{last.time}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Messages area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 64, opacity: 0.2, marginBottom: 16 }}>forum</span>
            <div style={{ fontSize: 14 }}>Select a conversation to start messaging</div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--surface)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: selectedConv?.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a', flexShrink: 0 }}>
                {selectedConv ? getConvInitial(selectedConv) : '?'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedConv ? getConvName(selectedConv) : ''}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {selectedConv?.type === 'group'
                    ? `${participants.length} member${participants.length !== 1 ? 's' : ''}`
                    : 'Direct message'}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {loadingMsgs ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  No messages yet. Send the first one!
                </div>
              ) : Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '12px 0', position: 'relative' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg)', padding: '2px 12px', position: 'relative', zIndex: 1 }}>{date}</span>
                    <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)', zIndex: 0 }} />
                  </div>
                  {msgs.map((msg, idx) => {
                    const isMine    = msg.sender_id === user.id
                    const prevMsg   = idx > 0 ? msgs[idx - 1] : null
                    const showName  = !isMine && msg.sender_id !== prevMsg?.sender_id
                    const senderName = msg.app_users?.full_name || msg.app_users?.username || 'Unknown'
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                        {showName && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2, marginLeft: 8 }}>{senderName}</div>
                        )}
                        <div style={{ maxWidth: '70%', display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: isMine ? 'var(--gold)' : 'var(--surface)',
                            color: isMine ? '#0b0f1a' : 'var(--text)',
                            border: isMine ? 'none' : '1px solid var(--border)',
                            fontSize: 13,
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}>
                            {msg.body}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{formatMsgTime(msg.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                <input
                  ref={inputRef}
                  className="form-control"
                  placeholder="Type a message…"
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e) }}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={sending || !msgText.trim()}>
                  <span className="material-icons" style={{ fontSize: 18 }}>send</span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── New conversation modal ── */}
      {showNew && (
        <>
          <div onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: 'var(--teal)' }}>person_add</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>New Conversation</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="form-control" placeholder="Search people…" value={newSearch}
                onChange={e => setNewSearch(e.target.value)} autoFocus />

              {selectedUsers.length > 1 && (
                <input className="form-control" placeholder="Group name (optional)" value={groupName}
                  onChange={e => setGroupName(e.target.value)} />
              )}

              {selectedUsers.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedUsers.map(uid => {
                    const u = allUsers.find(x => x.id === uid)
                    return (
                      <span key={uid} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.3)', color: 'var(--gold)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {u?.full_name || u?.username}
                        <button onClick={() => setSelectedUsers(prev => prev.filter(x => x !== uid))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    )
                  })}
                </div>
              )}

              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredUsers.map(u => {
                  const isSelected = selectedUsers.includes(u.id)
                  return (
                    <div key={u.id}
                      onClick={() => setSelectedUsers(prev => isSelected ? prev.filter(x => x !== u.id) : [...prev, u.id])}
                      style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isSelected ? 'rgba(251,191,36,.08)' : 'transparent' }}
                      onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseOut={e =>  { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#0b0f1a', flexShrink: 0 }}>
                        {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name || u.username}</div>
                        {u.full_name && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.username}</div>}
                      </div>
                      {isSelected && <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>check_circle</span>}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-secondary" onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={createConversation} disabled={selectedUsers.length === 0}>
                  {selectedUsers.length > 1 ? 'Create Group' : 'Start Chat'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
