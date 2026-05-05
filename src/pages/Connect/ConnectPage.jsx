// src/pages/Connect/ConnectPage.jsx
// WhatsApp-style mobile layout
// Fixes:
//  1. Visible to all users (handled in PermissionContext)
//  2. Input doesn't lose focus when typing (controlled input, no re-render issues)
//  3. Messages appear instantly via optimistic UI + realtime subscription
//  4. Group member list panel in chat header
//  5. Tap member avatar → see their phone & email

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function ConnectPage() {
  const { user }  = useAuth()
  const isMobile  = useIsMobile()

  const [conversations, setConversations] = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [participants,  setParticipants]  = useState([])   // {user_id} for selected conv
  const [allUsers,      setAllUsers]      = useState([])   // all app_users (for picker)
  const [employeeMap,   setEmployeeMap]   = useState({})   // user_id → {phone, email, name}
  const [userMap,       setUserMap]       = useState({})   // user_id → display name
  const [loadingConvs,  setLoadingConvs]  = useState(true)
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [msgText,       setMsgText]       = useState('')
  const [sending,       setSending]       = useState(false)
  const [showNew,       setShowNew]       = useState(false)
  const [newSearch,     setNewSearch]     = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [groupName,     setGroupName]     = useState('')
  const [convSearch,    setConvSearch]    = useState('')
  const [showMembers,   setShowMembers]   = useState(false)   // member list panel
  const [profileUser,   setProfileUser]   = useState(null)    // clicked member profile
  const [mobileScreen,  setMobileScreen]  = useState('list')  // 'list' | 'chat'

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  // ── Load users + employee contact info ───────────────────────
  useEffect(() => {
    const load = async () => {
      const [userRes, empRes] = await Promise.all([
        supabase.from('app_users').select('id, full_name, username, role_id').order('full_name'),
        supabase.from('employees').select('system_user_id, phone, email, name'),
      ])
      if (userRes.data) {
        setAllUsers(userRes.data.filter(u => u.id !== user.id))
        const map = {}
        userRes.data.forEach(u => { map[u.id] = u.full_name || u.username || 'Unknown' })
        map[user.id] = user.full_name || user.username || 'Me'
        setUserMap(map)
      }
      if (empRes.data) {
        const empMap = {}
        empRes.data.forEach(e => {
          if (e.system_user_id) empMap[e.system_user_id] = { phone: e.phone, email: e.email, name: e.name }
        })
        setEmployeeMap(empMap)
      }
    }
    load()
  }, [user.id, user.full_name, user.username])

  // ── Load conversations ────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    const { data: partData } = await supabase
      .from('chat_participants').select('conversation_id').eq('user_id', user.id)
    if (!partData?.length) { setConversations([]); setLoadingConvs(false); return }
    const ids = partData.map(p => p.conversation_id)
    const { data } = await supabase
      .from('chat_conversations')
      .select('*, chat_participants(user_id), chat_messages(body, created_at, sender_id)')
      .in('id', ids)
      .order('updated_at', { ascending: false })
    if (data) setConversations(data)
    setLoadingConvs(false)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Load messages ─────────────────────────────────────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return
    setLoadingMsgs(true)
    const [mRes, pRes] = await Promise.all([
      supabase.from('chat_messages')
        .select('id, conversation_id, sender_id, body, is_deleted, created_at')
        .eq('conversation_id', convId).eq('is_deleted', false)
        .order('created_at', { ascending: true }).limit(300),
      supabase.from('chat_participants')
        .select('user_id').eq('conversation_id', convId),
    ])
    if (mRes.data) setMessages(mRes.data)
    if (pRes.data) setParticipants(pRes.data)
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (selectedId) loadMessages(selectedId)
  }, [selectedId, loadMessages])

  // ── Realtime subscription — messages appear instantly ─────────
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase.channel(`chat-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        // Only add if not already in list (avoid duplicate from optimistic)
        setMessages(prev => {
          const exists = prev.some(m => m.id === payload.new.id)
          return exists ? prev : [...prev, payload.new]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId])

  // ── Auto-scroll ───────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Select conversation ───────────────────────────────────────
  const selectConversation = (convId) => {
    setSelectedId(convId)
    setShowMembers(false)
    setMessages([])
    if (isMobile) setMobileScreen('chat')
  }

  const goBack = () => {
    setMobileScreen('list')
    setSelectedId(null)
    setMessages([])
    setShowMembers(false)
  }

  // ── Send message — OPTIMISTIC (appears immediately) ───────────
  const sendMessage = async (e) => {
    e?.preventDefault()
    const body = msgText.trim()
    if (!body || !selectedId || sending) return

    const tempId  = `temp-${Date.now()}`
    const now     = new Date().toISOString()
    const tempMsg = { id: tempId, conversation_id: selectedId, sender_id: user.id, body, is_deleted: false, created_at: now }

    // 1. Show immediately (optimistic)
    setMessages(prev => [...prev, tempMsg])
    setMsgText('')

    // 2. Keep focus on input — Fix #2
    setTimeout(() => inputRef.current?.focus(), 0)

    setSending(true)
    try {
      const realId = crypto.randomUUID()
      const { error } = await supabase.from('chat_messages').insert([{
        id:              realId,
        conversation_id: selectedId,
        sender_id:       user.id,
        body,
        is_deleted:      false,
        created_at:      now,
      }])
      if (error) {
        // Remove optimistic message if failed
        setMessages(prev => prev.filter(m => m.id !== tempId))
        toast.error(error.message)
      } else {
        // Replace temp with real ID
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: realId } : m))
        await supabase.from('chat_conversations')
          .update({ updated_at: now }).eq('id', selectedId)
        loadConversations()
      }
    } finally { setSending(false) }
  }

  // ── Create conversation ───────────────────────────────────────
  const createConversation = async () => {
    if (!selectedUsers.length) return toast.error('Select at least one person')
    try {
      const isGroup = selectedUsers.length > 1
      const convId  = crypto.randomUUID()
      const now     = new Date().toISOString()

      if (!isGroup) {
        const otherId = selectedUsers[0]
        const { data: myParts } = await supabase
          .from('chat_participants').select('conversation_id').eq('user_id', user.id)
        if (myParts?.length) {
          const { data: shared } = await supabase
            .from('chat_participants').select('conversation_id')
            .eq('user_id', otherId).in('conversation_id', myParts.map(p => p.conversation_id))
          if (shared?.length) {
            const { data: conv } = await supabase
              .from('chat_conversations').select('id, type')
              .eq('id', shared[0].conversation_id).eq('type', 'direct').single()
            if (conv) {
              setShowNew(false); setSelectedUsers([])
              selectConversation(conv.id)
              return
            }
          }
        }
      }

      await supabase.from('chat_conversations').insert([{
        id: convId, type: isGroup ? 'group' : 'direct',
        name: isGroup ? (groupName.trim() || 'Group Chat') : null,
        created_by: user.id, created_at: now, updated_at: now,
      }])
      await supabase.from('chat_participants').insert(
        [user.id, ...selectedUsers].map(uid => ({
          id: crypto.randomUUID(), conversation_id: convId, user_id: uid, joined_at: now,
        }))
      )
      setShowNew(false); setSelectedUsers([]); setGroupName('')
      await loadConversations()
      selectConversation(convId)
    } catch (err) { toast.error(err.message) }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const getConvName = (conv) => {
    if (!conv) return ''
    if (conv.type === 'group') return conv.name || 'Group Chat'
    const other = conv.chat_participants?.find(p => p.user_id !== user.id)
    return other ? (userMap[other.user_id] || 'Unknown') : 'Direct Message'
  }
  const getConvInitial = (conv) => {
    if (conv?.type === 'group') return 'G'
    return getConvName(conv).charAt(0).toUpperCase()
  }
  const getLastMsg = (conv) => {
    const msgs = conv.chat_messages
    if (!msgs?.length) return { text: 'No messages yet', time: '' }
    const last   = [...msgs].sort((a, b) => a.created_at > b.created_at ? -1 : 1)[0]
    const prefix = last.sender_id === user.id ? 'You: ' : ''
    const text   = prefix + (last.body || '')
    return { text: text.slice(0, 50) + (text.length > 50 ? '…' : ''), time: formatTime(last.created_at) }
  }
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts), diff = (Date.now() - d) / 1000
    if (diff < 60)    return 'now'
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const filteredConvs = conversations.filter(c =>
    !convSearch || getConvName(c).toLowerCase().includes(convSearch.toLowerCase()))
  const filteredUsers = allUsers.filter(u =>
    !newSearch ||
    u.full_name?.toLowerCase().includes(newSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(newSearch.toLowerCase()))
  const selectedConv = conversations.find(c => c.id === selectedId)

  const groupedMessages = messages.reduce((groups, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-GB',
      { weekday: 'long', day: 'numeric', month: 'long' })
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {})

  // ── Conversation List ─────────────────────────────────────────
  const ConversationList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', ...(isMobile ? { width: '100%' } : { width: 300, minWidth: 300, borderRight: '1px solid var(--border)' }) }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span className="material-icons" style={{ color: 'var(--teal)', fontSize: 20 }}>forum</span>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Messages</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-icons" style={{ fontSize: 15 }}>add</span> New
        </button>
      </div>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input className="form-control" placeholder="Search conversations…" style={{ fontSize: 13 }}
          value={convSearch} onChange={e => setConvSearch(e.target.value)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingConvs ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : filteredConvs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 44, opacity: 0.2, display: 'block', marginBottom: 8 }}>chat_bubble_outline</span>
            <div style={{ fontSize: 13 }}>No conversations yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tap + New to start chatting</div>
          </div>
        ) : filteredConvs.map(conv => {
          const isActive = conv.id === selectedId && !isMobile
          const last     = getLastMsg(conv)
          return (
            <div key={conv.id} onClick={() => selectConversation(conv.id)} style={{ padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isActive ? 'rgba(251,191,36,.08)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,.04)', transition: 'background .15s' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: conv.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#0b0f1a' }}>
                {getConvInitial(conv)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getConvName(conv)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{last.text}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                {last.time && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{last.time}</div>}
                {isMobile && <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>chevron_right</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Chat Panel ────────────────────────────────────────────────
  const ChatPanel = () => (
    <div style={{ display: 'flex', height: '100%', ...(isMobile ? { width: '100%' } : { flex: 1 }), minWidth: 0, position: 'relative' }}>
      {/* Main chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 72, opacity: 0.12, marginBottom: 16 }}>forum</span>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No conversation selected</div>
            <div style={{ fontSize: 13 }}>Choose one from the list or start a new one</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--surface)' }}>
              {isMobile && (
                <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 4, display: 'flex', alignItems: 'center' }}>
                  <span className="material-icons">arrow_back</span>
                </button>
              )}
              {/* Avatar / name — tap to view members (fix #4) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: selectedConv?.type === 'group' ? 'pointer' : 'default' }}
                onClick={() => { if (selectedConv?.type === 'group') setShowMembers(v => !v) }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: selectedConv?.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a' }}>
                  {selectedConv ? getConvInitial(selectedConv) : '?'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getConvName(selectedConv)}</div>
                  <div style={{ fontSize: 11, color: selectedConv?.type === 'group' ? 'var(--teal)' : 'var(--text-dim)' }}>
                    {selectedConv?.type === 'group'
                      ? `${participants.length} members — tap to view`
                      : 'Direct message'}
                  </div>
                </div>
              </div>
              {selectedConv?.type === 'group' && (
                <button onClick={() => setShowMembers(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: showMembers ? 'var(--gold)' : 'var(--text-dim)', padding: 4 }}>
                  <span className="material-icons">group</span>
                </button>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column' }}>
              {loadingMsgs ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  No messages yet. Say hello! 👋
                </div>
              ) : Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '10px 0' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>{date}</span>
                  </div>
                  {msgs.map((msg, idx) => {
                    const isMine    = msg.sender_id === user.id
                    const prevMsg   = idx > 0 ? msgs[idx - 1] : null
                    const showName  = !isMine && msg.sender_id !== prevMsg?.sender_id
                    const isTemp    = msg.id?.startsWith('temp-')
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 3 }}>
                        {showName && (
                          <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 2, marginLeft: 4, fontWeight: 600 }}>
                            {userMap[msg.sender_id] || 'Unknown'}
                          </div>
                        )}
                        <div style={{ maxWidth: isMobile ? '82%' : '65%', display: 'flex', alignItems: 'flex-end', gap: 5, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                          <div style={{ padding: '8px 12px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isMine ? 'var(--gold)' : 'var(--surface)', color: isMine ? '#0b0f1a' : 'var(--text)', border: isMine ? 'none' : '1px solid var(--border)', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', opacity: isTemp ? 0.6 : 1 }}>
                            {msg.body}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, marginBottom: 2 }}>
                            {isTemp ? '…' : fmtTime(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input — Fix #2: autoFocus, no re-mount */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  className="form-control"
                  placeholder="Type a message…"
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  style={{ flex: 1, borderRadius: 24, padding: '10px 16px', fontSize: 14 }}
                  autoComplete="off"
                />
                <button type="submit" disabled={!msgText.trim()}
                  style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: msgText.trim() ? 'pointer' : 'default', background: msgText.trim() ? 'var(--gold)' : 'var(--surface2)', color: msgText.trim() ? '#0b0f1a' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .2s' }}>
                  <span className="material-icons" style={{ fontSize: 20 }}>send</span>
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── Members panel (Fix #4 & #5) ── */}
      {showMembers && selectedConv?.type === 'group' && (
        <div style={{ width: 240, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', flexShrink: 0, ...(isMobile ? { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 10, width: '75%', boxShadow: '-4px 0 20px rgba(0,0,0,.3)' } : {}) }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--teal)' }}>group</span>
            <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Members ({participants.length})</div>
            <button onClick={() => setShowMembers(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
              <span className="material-icons" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {participants.map(p => {
              const name  = userMap[p.user_id] || 'Unknown'
              const isMe  = p.user_id === user.id
              const empInfo = employeeMap[p.user_id]
              return (
                <div key={p.user_id}
                  onClick={() => setProfileUser(profileUser?.user_id === p.user_id ? null : { user_id: p.user_id, name, empInfo })}
                  style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4, background: profileUser?.user_id === p.user_id ? 'rgba(251,191,36,.08)' : 'transparent', transition: 'background .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: isMe ? 'linear-gradient(135deg,var(--gold),var(--teal))' : 'linear-gradient(135deg,var(--blue),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#0b0f1a', flexShrink: 0 }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name} {isMe ? '(You)' : ''}
                      </div>
                    </div>
                    <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>
                      {profileUser?.user_id === p.user_id ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                  {/* Fix #5: Contact info when tapped */}
                  {profileUser?.user_id === p.user_id && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', paddingLeft: 4 }}>
                      {empInfo?.phone ? (
                        <a href={`tel:${empInfo.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', marginBottom: 6, textDecoration: 'none' }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>phone</span>
                          {empInfo.phone}
                        </a>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>phone_disabled</span>
                          No phone on record
                        </div>
                      )}
                      {empInfo?.email ? (
                        <a href={`mailto:${empInfo.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>email</span>
                          {empInfo.email}
                        </a>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>mail_outline</span>
                          No email on record
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // ── New Conversation Modal ────────────────────────────────────
  const NewConvModal = () => (
    <>
      <div onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 440, maxHeight: '85vh', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="material-icons" style={{ color: 'var(--teal)' }}>person_add</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>New Conversation</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'hidden' }}>
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
                  <span key={uid} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.3)', color: 'var(--gold)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {u?.full_name || u?.username}
                    <button onClick={() => setSelectedUsers(p => p.filter(x => x !== uid))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', padding: 0, fontSize: 15, lineHeight: 1 }}>×</button>
                  </span>
                )
              })}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredUsers.map(u => {
              const isSel = selectedUsers.includes(u.id)
              return (
                <div key={u.id}
                  onClick={() => setSelectedUsers(p => isSel ? p.filter(x => x !== u.id) : [...p, u.id])}
                  style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isSel ? 'rgba(251,191,36,.08)' : 'transparent' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#0b0f1a', flexShrink: 0 }}>
                    {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name || u.username}</div>
                    {u.full_name && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.username}</div>}
                  </div>
                  <span className="material-icons" style={{ fontSize: 18, color: isSel ? 'var(--gold)' : 'var(--border)' }}>
                    {isSel ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button className="btn btn-secondary" onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}>Cancel</button>
            <button className="btn btn-primary" onClick={createConversation} disabled={!selectedUsers.length}>
              {selectedUsers.length > 1 ? 'Create Group' : 'Start Chat'}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {isMobile ? (
        <>
          {mobileScreen === 'list' && <ConversationList />}
          {mobileScreen === 'chat' && <ChatPanel />}
        </>
      ) : (
        <>
          <ConversationList />
          <ChatPanel />
        </>
      )}
      {showNew && <NewConvModal />}
    </div>
  )
}
