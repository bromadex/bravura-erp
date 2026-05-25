// src/pages/Connect/ConnectPage.jsx
// Full C1-C4 rewrite: unread badges, read receipts, reply/quote, edit/delete,
// typing indicators, online presence, emoji reactions, @mentions, /slash tagging,
// file attachments, pinned messages, message search, topic channels, group rename,
// starred messages, message forwarding.

import { useState, useEffect, useRef, useCallback, memo, useImperativeHandle, forwardRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import MessageBubble from '../../components/connect/MessageBubble'
import SlashMentionPicker from '../../components/connect/SlashMentionPicker'
import TxnCodeMessage from '../../components/connect/TxnCodeLink'
import { PREFIX_REGISTRY, getSearchTables } from '../../engine/transactionEngine'

// ── Keyframe CSS injection ────────────────────────────────────
const KEYFRAME_CSS = `
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
}
@keyframes fadeOut {
  to { opacity: 0; }
}
@keyframes typingDot {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40%           { transform: scale(1.0); opacity: 1;   }
}
`

function injectKeyframes() {
  if (document.getElementById('connect-keyframes')) return
  const s = document.createElement('style')
  s.id = 'connect-keyframes'
  s.textContent = KEYFRAME_CSS
  document.head.appendChild(s)
}

// ── useIsMobile ───────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

// ── Time helpers ──────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), diff = (Date.now() - d) / 1000
  if (diff < 60)    return 'now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false
  return (Date.now() - new Date(lastSeenAt).getTime()) < 120000
}

function lastSeenText(lastSeenAt) {
  if (!lastSeenAt) return 'Never seen'
  if (isOnline(lastSeenAt)) return 'Online'
  const diff = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 172800) return 'Yesterday'
  return new Date(lastSeenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── MessageInput (forwardRef, uncontrolled) ───────────────────
const MessageInput = forwardRef(function MessageInput(
  { onSend, onChange, onTyping, announcementOnly, isAdmin },
  ref
) {
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  useImperativeHandle(ref, () => ({
    insertAtSlash: (text) => {
      const val = inputRef.current?.value || ''
      const slashIdx = val.lastIndexOf('/')
      inputRef.current.value = (slashIdx >= 0 ? val.slice(0, slashIdx) : val) + '[' + text + '] '
      inputRef.current.focus()
    },
    insertAtAt: (text) => {
      const val = inputRef.current?.value || ''
      const atIdx = val.lastIndexOf('@')
      inputRef.current.value = (atIdx >= 0 ? val.slice(0, atIdx) : val) + text
      inputRef.current.focus()
    },
    getValue: () => inputRef.current?.value || '',
    clear: () => { if (inputRef.current) inputRef.current.value = '' },
    focus: () => inputRef.current?.focus(),
  }))

  const handleSend = (e) => {
    e.preventDefault()
    const text = inputRef.current?.value?.trim()
    if (!text) return
    onSend(text)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !onSend) return
    setUploading(true)
    try {
      const path = `${crypto.randomUUID()}/${file.name}`
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) { toast.error('Upload failed: ' + upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)
      onSend('', {
        attachment_url: publicUrl,
        attachment_type: file.type.startsWith('image') ? 'image' : 'file',
        attachment_name: file.name,
        attachment_size: file.size,
      })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (announcementOnly && !isAdmin) {
    return (
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>campaign</span>
        This is an announcement channel — only admins can post
      </div>
    )
  }

  return (
    <form onSubmit={handleSend} style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* File attach */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '6px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          {uploading
            ? <span className="material-icons" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>hourglass_empty</span>
            : <span className="material-icons" style={{ fontSize: 20 }}>attach_file</span>
          }
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
        <input
          ref={inputRef}
          defaultValue=""
          placeholder="Type a message… (/ to tag a doc, @ to mention)"
          autoComplete="off"
          onInput={e => { onChange?.(e.target.value); onTyping?.() }}
          style={{
            flex: 1, borderRadius: 24, padding: '10px 16px', fontSize: 14,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--gold)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <span className="material-icons" style={{ fontSize: 20 }}>send</span>
        </button>
      </div>
    </form>
  )
})

// ── Typing indicator ──────────────────────────────────────────
function TypingIndicator({ typingUsers }) {
  if (!typingUsers.length) return null
  const names = typingUsers.map(u => u.name).join(' and ')
  const label = `${names} ${typingUsers.length === 1 ? 'is' : 'are'} typing`
  return (
    <div style={{ padding: '4px 16px 2px', display: 'flex', alignItems: 'center', gap: 8, height: 28, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: 'var(--text-dim)',
            animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>{label}…</span>
    </div>
  )
}

// ── Main ConnectPage ──────────────────────────────────────────
export default function ConnectPage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()

  // ── Core state ────────────────────────────────────────────
  const [conversations,    setConversations]    = useState([])
  const [channels,         setChannels]         = useState([])
  const [selectedId,       setSelectedId]       = useState(null)
  const [messages,         setMessages]         = useState([])
  const [participants,     setParticipants]     = useState([])
  const [allUsers,         setAllUsers]         = useState([])
  const [employeeMap,      setEmployeeMap]      = useState({})
  const [userMap,          setUserMap]          = useState({})
  const [loadingConvs,     setLoadingConvs]     = useState(true)
  const [loadingMsgs,      setLoadingMsgs]      = useState(false)
  const [showNew,          setShowNew]          = useState(false)
  const [newSearch,        setNewSearch]        = useState('')
  const [selectedUsers,    setSelectedUsers]    = useState([])
  const [groupName,        setGroupName]        = useState('')
  const [convSearch,       setConvSearch]       = useState('')
  const [showMembers,      setShowMembers]      = useState(false)
  const [profileUser,      setProfileUser]      = useState(null)
  const [mobileScreen,     setMobileScreen]     = useState('list')

  // ── New C1-C4 state ───────────────────────────────────────
  const [unreadMap,        setUnreadMap]        = useState({})
  const [reactions,        setReactions]        = useState({})
  const [reads,            setReads]            = useState({})
  const [typingUsers,      setTypingUsers]      = useState([])
  const [onlineMap,        setOnlineMap]        = useState({})
  const [pinnedMessages,   setPinnedMessages]   = useState([])
  const [replyTo,          setReplyTo]          = useState(null)
  const [hoveredMsg,       setHoveredMsg]       = useState(null)
  const [slashQuery,       setSlashQuery]       = useState(null)
  const [slashResults,     setSlashResults]     = useState([])
  const [mentionQuery,     setMentionQuery]     = useState(null)
  const [showSlashHint,    setShowSlashHint]    = useState(false)
  const [starredIds,       setStarredIds]       = useState(new Set())
  const [showStarred,      setShowStarred]      = useState(false)
  const [forwardMsg,       setForwardMsg]       = useState(null)
  const [forwardSearch,    setForwardSearch]    = useState('')
  const [showSearch,       setShowSearch]       = useState(false)
  const [searchQuery,      setSearchQuery]      = useState('')
  const [searchResults,    setSearchResults]    = useState([])
  const [showPinnedAll,    setShowPinnedAll]    = useState(false)
  const [renameMode,       setRenameMode]       = useState(false)
  const [renameValue,      setRenameValue]      = useState('')
  const [renameLoading,    setRenameLoading]    = useState(false)
  const [showChannelCreate,setShowChannelCreate] = useState(false)
  const [newChannelName,   setNewChannelName]   = useState('')
  const [newChannelDesc,   setNewChannelDesc]   = useState('')
  const [newChannelAnno,   setNewChannelAnno]   = useState(false)
  const [lastReadMap,      setLastReadMap]      = useState({})

  // ── Refs ──────────────────────────────────────────────────
  const inputRef       = useRef(null)
  const presenceChannel = useRef(null)
  const typingTimeout  = useRef(null)
  const msgRefs        = useRef({})
  const messagesEndRef = useRef(null)
  const lastSeenInterval = useRef(null)

  // Inject keyframes
  useEffect(() => { injectKeyframes() }, [])

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_manager'].includes(user?.role_id)

  // ── Online presence heartbeat ─────────────────────────────
  useEffect(() => {
    const updateLastSeen = () => {
      supabase.from('app_users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
    }
    updateLastSeen()
    lastSeenInterval.current = setInterval(updateLastSeen, 30000)
    return () => clearInterval(lastSeenInterval.current)
  }, [user.id])

  // ── Load users + employees ────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [userRes, empRes] = await Promise.all([
        supabase.from('app_users').select('id, full_name, username, last_seen_at').order('full_name'),
        supabase.from('employees').select('system_user_id, phone, email, name'),
      ])
      if (userRes.data) {
        setAllUsers(userRes.data.filter(u => u.id !== user.id))
        const map = {}
        const online = {}
        userRes.data.forEach(u => {
          map[u.id] = u.full_name || u.username || 'Unknown'
          if (u.last_seen_at) online[u.id] = u.last_seen_at
        })
        map[user.id] = user.full_name || user.username || 'Me'
        setUserMap(map)
        setOnlineMap(online)
      }
      if (empRes.data) {
        const empMap = {}
        empRes.data.forEach(e => { if (e.system_user_id) empMap[e.system_user_id] = { phone: e.phone, email: e.email } })
        setEmployeeMap(empMap)
      }
    }
    load()
  }, [user.id, user.full_name, user.username])

  // ── Export unread count ───────────────────────────────────
  useEffect(() => {
    const total = Object.values(unreadMap).reduce((a, b) => a + b, 0)
    window.__connectUnread = total
    window.dispatchEvent(new CustomEvent('connect-unread-update', { detail: total }))
  }, [unreadMap])

  // ── Load starred message ids ──────────────────────────────
  const loadStarred = useCallback(async () => {
    const { data } = await supabase.from('message_stars').select('message_id').eq('user_id', user.id)
    if (data) setStarredIds(new Set(data.map(r => r.message_id)))
  }, [user.id])

  useEffect(() => { loadStarred() }, [loadStarred])

  // ── Load channels ─────────────────────────────────────────
  const loadChannels = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select('*, chat_messages(body, created_at, sender_id)')
      .eq('type', 'channel')
      .order('name')
    if (data) setChannels(data)
  }, [])

  useEffect(() => { loadChannels() }, [loadChannels])

  // ── Load conversations ────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true)
    const { data: partData } = await supabase
      .from('chat_participants').select('conversation_id, last_read_at').eq('user_id', user.id)
    if (!partData?.length) { setConversations([]); setLoadingConvs(false); return }
    const ids = partData.map(p => p.conversation_id)
    const readMap = {}
    partData.forEach(p => { if (p.last_read_at) readMap[p.conversation_id] = p.last_read_at })
    setLastReadMap(readMap)
    const { data } = await supabase
      .from('chat_conversations')
      .select('*, chat_participants(user_id), chat_messages(id, body, created_at, sender_id)')
      .in('id', ids).order('updated_at', { ascending: false })
    if (data) {
      setConversations(data)
      // Calculate unread counts
      const newUnread = {}
      data.forEach(conv => {
        const lastRead = readMap[conv.id]
        if (!lastRead) {
          const count = (conv.chat_messages || []).filter(m => m.sender_id !== user.id).length
          newUnread[conv.id] = Math.min(count, 99)
        } else {
          const count = (conv.chat_messages || []).filter(m =>
            m.sender_id !== user.id && new Date(m.created_at) > new Date(lastRead)
          ).length
          newUnread[conv.id] = Math.min(count, 99)
        }
      })
      setUnreadMap(newUnread)
    }
    setLoadingConvs(false)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Mark conversation as read ─────────────────────────────
  const markAsRead = useCallback(async (convId, msgList) => {
    const now = new Date().toISOString()
    const latestMsg = msgList.length ? msgList[msgList.length - 1] : null
    await supabase.from('chat_participants').upsert({
      conversation_id: convId, user_id: user.id,
      last_read_at: now,
      last_read_message_id: latestMsg?.id || null,
    }, { onConflict: 'conversation_id,user_id' })
    setLastReadMap(prev => ({ ...prev, [convId]: now }))
    setUnreadMap(prev => ({ ...prev, [convId]: 0 }))
  }, [user.id])

  // ── Load messages ─────────────────────────────────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return
    setLoadingMsgs(true)
    setMessages([])
    setReactions({})
    setReads({})
    setPinnedMessages([])
    const [mRes, pRes, pinRes] = await Promise.all([
      supabase.from('chat_messages')
        .select('id, conversation_id, sender_id, body, is_deleted, is_edited, is_pinned, edited_at, original_body, reply_to_id, attachment_url, attachment_type, attachment_name, attachment_size, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true }).limit(300),
      supabase.from('chat_participants').select('user_id').eq('conversation_id', convId),
      supabase.from('chat_messages')
        .select('id, body, sender_id, created_at')
        .eq('conversation_id', convId).eq('is_pinned', true).eq('is_deleted', false),
    ])

    const msgs = mRes.data || []
    setMessages(msgs.filter(m => !m.is_deleted || true)) // keep deleted for tombstone
    if (pRes.data) setParticipants(pRes.data)
    if (pinRes.data) setPinnedMessages(pinRes.data)

    // Load reactions
    if (msgs.length) {
      const msgIds = msgs.map(m => m.id)
      const { data: rxData } = await supabase.from('message_reactions').select('*').in('message_id', msgIds)
      if (rxData) {
        const rxMap = {}
        rxData.forEach(r => {
          if (!rxMap[r.message_id]) rxMap[r.message_id] = {}
          if (!rxMap[r.message_id][r.emoji]) rxMap[r.message_id][r.emoji] = { emoji: r.emoji, count: 0, myReact: false }
          rxMap[r.message_id][r.emoji].count++
          if (r.user_id === user.id) rxMap[r.message_id][r.emoji].myReact = true
        })
        const finalRx = {}
        Object.entries(rxMap).forEach(([mid, emojis]) => { finalRx[mid] = Object.values(emojis) })
        setReactions(finalRx)
      }

      // Load read receipts for own messages
      const myMsgIds = msgs.filter(m => m.sender_id === user.id).map(m => m.id)
      if (myMsgIds.length) {
        const { data: readData } = await supabase.from('message_reads').select('message_id, user_id').in('message_id', myMsgIds)
        if (readData) {
          const readsMap = {}
          const otherParticipants = (pRes.data || []).filter(p => p.user_id !== user.id).map(p => p.user_id)
          myMsgIds.forEach(mid => {
            const readers = readData.filter(r => r.message_id === mid && r.user_id !== user.id).map(r => r.user_id)
            if (!readers.length) readsMap[mid] = 'sent'
            else if (otherParticipants.every(uid => readers.includes(uid))) readsMap[mid] = 'read'
            else readsMap[mid] = 'delivered'
          })
          setReads(readsMap)
        }
      }

      // Bulk upsert message_reads for messages I haven't read
      const unreadMsgIds = msgs.filter(m => m.sender_id !== user.id).map(m => m.id)
      if (unreadMsgIds.length) {
        await supabase.from('message_reads').upsert(
          unreadMsgIds.map(mid => ({ message_id: mid, user_id: user.id, read_at: new Date().toISOString() })),
          { onConflict: 'message_id,user_id' }
        )
      }
    }

    setLoadingMsgs(false)
    await markAsRead(convId, msgs)
  }, [user.id, markAsRead])

  useEffect(() => { if (selectedId) loadMessages(selectedId) }, [selectedId, loadMessages])

  // ── Realtime subscriptions ────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    const channels_arr = []

    // 1. Chat messages INSERT / UPDATE
    const msgChannel = supabase.channel(`chat-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        setMessages(prev => {
          const exists = prev.some(m => m.id === payload.new.id)
          return exists ? prev : [...prev, payload.new]
        })
        // If not mine, mark read immediately
        if (payload.new.sender_id !== user.id) {
          supabase.from('message_reads').upsert(
            [{ message_id: payload.new.id, user_id: user.id, read_at: new Date().toISOString() }],
            { onConflict: 'message_id,user_id' }
          )
          setUnreadMap(prev => ({ ...prev, [selectedId]: 0 }))
        }
        loadConversations()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m))
        // Update pinned if needed
        if (payload.new.is_pinned) {
          setPinnedMessages(prev => {
            const exists = prev.some(p => p.id === payload.new.id)
            return exists ? prev.map(p => p.id === payload.new.id ? payload.new : p) : [...prev, payload.new]
          })
        } else {
          setPinnedMessages(prev => prev.filter(p => p.id !== payload.new.id))
        }
      })
      .subscribe()
    channels_arr.push(msgChannel)

    // 2. Read receipts
    const readsChannel = supabase.channel(`reads-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_reads',
      }, (payload) => {
        const { message_id, user_id } = payload.new
        setReads(prev => {
          // Recalculate read status for that message
          const curr = prev[message_id]
          if (!curr) return prev
          // We can only step forward: sent → delivered → read
          return { ...prev, [message_id]: curr === 'sent' ? 'delivered' : curr === 'delivered' ? 'delivered' : curr }
        })
        // Check if ALL participants have read
        setParticipants(parts => {
          const others = parts.filter(p => p.user_id !== user.id).map(p => p.user_id)
          // Just upgrade to delivered if another person read it
          setReads(prev => {
            const curr = prev[message_id]
            if (curr === 'sent') return { ...prev, [message_id]: 'delivered' }
            return prev
          })
          return parts
        })
      })
      .subscribe()
    channels_arr.push(readsChannel)

    // 3. Reactions
    const rxChannel = supabase.channel(`reactions-${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_reactions',
      }, (payload) => {
        const { message_id, emoji, user_id } = payload.new
        setReactions(prev => {
          const curr = prev[message_id] || []
          const existing = curr.find(r => r.emoji === emoji)
          if (existing) {
            return {
              ...prev,
              [message_id]: curr.map(r => r.emoji === emoji
                ? { ...r, count: r.count + 1, myReact: r.myReact || user_id === user.id }
                : r
              )
            }
          }
          return { ...prev, [message_id]: [...curr, { emoji, count: 1, myReact: user_id === user.id }] }
        })
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'message_reactions',
      }, (payload) => {
        const { message_id, emoji, user_id } = payload.old
        setReactions(prev => {
          const curr = prev[message_id] || []
          return {
            ...prev,
            [message_id]: curr
              .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, myReact: user_id === user.id ? false : r.myReact } : r)
              .filter(r => r.count > 0)
          }
        })
      })
      .subscribe()
    channels_arr.push(rxChannel)

    // 4. Presence (typing)
    const presenceCh = supabase.channel(`presence-${selectedId}`, {
      config: { presence: { key: user.id } }
    })
      .on('presence', { event: 'sync' }, () => {
        const state = presenceCh.presenceState()
        const typing = Object.values(state).flat().filter(s => s.user_id !== user.id && s.typing)
        setTypingUsers(typing)
      })
      .subscribe()
    presenceChannel.current = presenceCh
    channels_arr.push(presenceCh)

    return () => {
      channels_arr.forEach(ch => supabase.removeChannel(ch))
      presenceChannel.current = null
      setTypingUsers([])
    }
  }, [selectedId, user.id, loadConversations])

  // ── Auto scroll ───────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showSearch])

  // ── Select conversation ───────────────────────────────────
  const selectConversation = useCallback((convId) => {
    setSelectedId(convId)
    setShowMembers(false)
    setProfileUser(null)
    setMessages([])
    setReplyTo(null)
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setShowStarred(false)
    setSlashQuery(null)
    setMentionQuery(null)
    if (isMobile) setMobileScreen('chat')
  }, [isMobile])

  // ── Slash hint on conversation open ──────────────────────
  useEffect(() => {
    if (selectedId && !sessionStorage.getItem('connect_slash_hint')) {
      setShowSlashHint(true)
      sessionStorage.setItem('connect_slash_hint', '1')
      setTimeout(() => setShowSlashHint(false), 3000)
    }
  }, [selectedId])

  const goBack = () => {
    setMobileScreen('list')
    setSelectedId(null)
    setMessages([])
    setShowMembers(false)
    setReplyTo(null)
  }

  // ── Typing handler ────────────────────────────────────────
  const handleTyping = useCallback(() => {
    if (!presenceChannel.current) return
    presenceChannel.current.track({ user_id: user.id, name: userMap[user.id] || 'You', typing: true })
    clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      presenceChannel.current?.track({ user_id: user.id, name: userMap[user.id] || 'You', typing: false })
    }, 2000)
  }, [user.id, userMap])

  // ── Input change handler (slash / mention detection) ──────
  const handleInputChange = useCallback((value) => {
    // Slash detection
    const slashMatch = value.match(/(\/[a-zA-Z0-9-]*)$/)
    if (slashMatch) {
      const q = slashMatch[1]
      setSlashQuery(q)
      setMentionQuery(null)
      searchTransactions(q)
      return
    }
    // Mention detection
    const mentionMatch = value.match(/@(\w*)$/)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1])
      setSlashQuery(null)
      return
    }
    // Close both pickers
    setSlashQuery(null)
    setMentionQuery(null)
  }, [])

  // ── Transaction search — powered by PREFIX_REGISTRY ─────────
  // Searches every module in the system; deduplicates by table+numCol so
  // prefixes that share a table (FL/GN/EM all use asset_registry) are queried once.
  const searchTransactions = useCallback(async (q) => {
    const term = q.replace('/', '').toUpperCase()
    if (!term) { setSlashResults([]); return }
    try {
      // If term looks like a specific prefix (e.g. "PO", "SR", "LV"), limit to that table only
      const exactEntry = PREFIX_REGISTRY[term]
      const tables = exactEntry
        ? [{ table: exactEntry.table, numCol: exactEntry.numCol, label: exactEntry.label, prefix: term, icon: exactEntry.icon, amtCol: exactEntry.amtCol }]
        : getSearchTables()   // all 35+ modules, deduped by table

      const perTable = Math.max(2, Math.floor(10 / tables.length))
      const all = await Promise.all(
        tables.map(async ({ table, numCol, label, prefix, icon, amtCol }) => {
          const sel = [numCol, 'status', 'title', amtCol].filter(Boolean).join(',')
          const { data } = await supabase.from(table).select(sel).ilike(numCol, `%${term}%`).limit(perTable)
          return (data || []).map(row => ({
            code:   row[numCol],
            label,
            status: row.status,
            amount: amtCol ? row[amtCol] : null,
            icon:   icon || 'receipt_long',
          }))
        })
      )
      setSlashResults(all.flat().filter(r => r.code).slice(0, 12))
    } catch {
      setSlashResults([])
    }
  }, [])

  // ── Send message ──────────────────────────────────────────
  const handleSend = useCallback(async (body, attachmentFields = {}) => {
    if (!body && !attachmentFields.attachment_url) return
    if (!selectedId) return

    const trimBody = body.trim()
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const realId = crypto.randomUUID()

    const msgObj = {
      id: realId,
      conversation_id: selectedId,
      sender_id: user.id,
      body: trimBody || null,
      is_deleted: false,
      is_edited: false,
      is_pinned: false,
      reply_to_id: replyTo?.id || null,
      created_at: now,
      ...attachmentFields,
    }

    // Optimistic
    setMessages(prev => [...prev, { ...msgObj, id: tempId }])
    setReplyTo(null)
    setSlashQuery(null)
    setMentionQuery(null)

    // Stop typing
    clearTimeout(typingTimeout.current)
    presenceChannel.current?.track({ user_id: user.id, name: userMap[user.id] || 'You', typing: false })

    try {
      const { error } = await supabase.from('chat_messages').insert([msgObj])
      if (error) {
        setMessages(prev => prev.filter(m => m.id !== tempId))
        toast.error(error.message)
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: realId } : m))
        setReads(prev => ({ ...prev, [realId]: 'sent' }))
        supabase.from('chat_conversations').update({ updated_at: now }).eq('id', selectedId)
        loadConversations()

        // Handle @mentions
        const mentionPattern = /@(\w[\w\s]*)/g
        let mm
        const mentioned = []
        while ((mm = mentionPattern.exec(trimBody)) !== null) {
          const name = mm[1].trim()
          const mentionedUser = allUsers.find(u =>
            (u.full_name || '').toLowerCase() === name.toLowerCase() ||
            (u.username || '').toLowerCase() === name.toLowerCase()
          )
          if (mentionedUser && !mentioned.includes(mentionedUser.id)) {
            mentioned.push(mentionedUser.id)
          }
        }
        if (mentioned.length) {
          const selectedConv = conversations.find(c => c.id === selectedId) || channels.find(c => c.id === selectedId)
          const convName = selectedConv?.name || 'Connect'
          const preview = (trimBody || '').slice(0, 60)
          await supabase.from('notifications').insert(
            mentioned.map(uid => ({
              id: crypto.randomUUID(),
              user_id: uid,
              title: 'You were mentioned',
              body: `In ${convName}: ${preview}`,
              type: 'mention',
              read: false,
              created_at: now,
            }))
          )
        }
      }
    } catch (err) {
      toast.error(err.message)
    }
  }, [selectedId, user.id, replyTo, loadConversations, allUsers, conversations, channels, userMap])

  // ── Edit message ──────────────────────────────────────────
  const handleEdit = useCallback(async (msgId, newBody) => {
    const orig = messages.find(m => m.id === msgId)
    if (!orig) return
    const { error } = await supabase.from('chat_messages').update({
      body: newBody,
      is_edited: true,
      edited_at: new Date().toISOString(),
      original_body: orig.original_body || orig.body,
    }).eq('id', msgId)
    if (error) toast.error(error.message)
    else setMessages(prev => prev.map(m => m.id === msgId ? { ...m, body: newBody, is_edited: true } : m))
  }, [messages])

  // ── Delete message ────────────────────────────────────────
  const handleDelete = useCallback(async (msgId) => {
    const { error } = await supabase.from('chat_messages').update({ is_deleted: true }).eq('id', msgId)
    if (error) toast.error(error.message)
    else setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true } : m))
  }, [])

  // ── React (emoji) ─────────────────────────────────────────
  const handleReact = useCallback(async (msgId, emoji) => {
    const msgReactions = reactions[msgId] || []
    const existing = msgReactions.find(r => r.emoji === emoji && r.myReact)
    if (existing) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', msgId).eq('user_id', user.id).eq('emoji', emoji)
    } else {
      await supabase.from('message_reactions').upsert(
        [{ message_id: msgId, user_id: user.id, emoji, created_at: new Date().toISOString() }],
        { onConflict: 'message_id,user_id,emoji' }
      )
    }
  }, [reactions, user.id])

  // ── Pin / Unpin ───────────────────────────────────────────
  const handlePin = useCallback(async (msgId, pinState) => {
    const { error } = await supabase.from('chat_messages').update({ is_pinned: pinState }).eq('id', msgId)
    if (error) { toast.error(error.message); return }
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_pinned: pinState } : m))
    if (pinState) {
      const msg = messages.find(m => m.id === msgId)
      if (msg) setPinnedMessages(prev => [...prev, msg])
    } else {
      setPinnedMessages(prev => prev.filter(p => p.id !== msgId))
    }
  }, [messages])

  // ── Star / Unstar ─────────────────────────────────────────
  const handleStar = useCallback(async (msgId) => {
    if (starredIds.has(msgId)) {
      await supabase.from('message_stars').delete().eq('message_id', msgId).eq('user_id', user.id)
      setStarredIds(prev => { const s = new Set(prev); s.delete(msgId); return s })
    } else {
      await supabase.from('message_stars').upsert(
        [{ message_id: msgId, user_id: user.id, starred_at: new Date().toISOString() }],
        { onConflict: 'message_id,user_id' }
      )
      setStarredIds(prev => new Set([...prev, msgId]))
    }
  }, [starredIds, user.id])

  // ── Forward message ───────────────────────────────────────
  const handleForwardSend = useCallback(async (targetConvId) => {
    if (!forwardMsg || !targetConvId) return
    const now = new Date().toISOString()
    const { error } = await supabase.from('chat_messages').insert([{
      id: crypto.randomUUID(),
      conversation_id: targetConvId,
      sender_id: user.id,
      body: '↩ Forwarded: ' + (forwardMsg.body || ''),
      attachment_url: forwardMsg.attachment_url || null,
      attachment_type: forwardMsg.attachment_type || null,
      attachment_name: forwardMsg.attachment_name || null,
      attachment_size: forwardMsg.attachment_size || null,
      is_deleted: false, is_edited: false, is_pinned: false,
      created_at: now,
    }])
    if (error) { toast.error(error.message); return }
    const targetConv = [...conversations, ...channels].find(c => c.id === targetConvId)
    toast.success(`Message forwarded to ${targetConv?.name || 'conversation'}`)
    setForwardMsg(null)
    setForwardSearch('')
    supabase.from('chat_conversations').update({ updated_at: now }).eq('id', targetConvId)
    loadConversations()
  }, [forwardMsg, user.id, conversations, channels, loadConversations])

  // ── Message search ────────────────────────────────────────
  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !selectedId) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('chat_messages')
        .select('*').eq('conversation_id', selectedId)
        .ilike('body', `%${searchQuery}%`).eq('is_deleted', false).limit(20)
      setSearchResults(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showSearch, selectedId])

  const scrollToMessage = useCallback((msgId) => {
    const el = msgRefs.current[msgId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // ── Group rename ──────────────────────────────────────────
  const handleRename = useCallback(async () => {
    if (!renameValue.trim()) return
    setRenameLoading(true)
    const { error } = await supabase.from('chat_conversations').update({ name: renameValue.trim() }).eq('id', selectedId)
    if (error) { toast.error(error.message); setRenameLoading(false); return }
    setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, name: renameValue.trim() } : c))
    setRenameMode(false)
    setRenameLoading(false)
  }, [renameValue, selectedId])

  // ── Create channel ────────────────────────────────────────
  const handleCreateChannel = useCallback(async () => {
    if (!newChannelName.trim()) return
    const now = new Date().toISOString()
    const convId = crypto.randomUUID()
    const slug = newChannelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const { error } = await supabase.from('chat_conversations').insert([{
      id: convId, type: 'channel',
      name: newChannelName.trim(), slug,
      description: newChannelDesc.trim() || null,
      is_announcement_only: newChannelAnno,
      created_by: user.id, created_at: now, updated_at: now,
    }])
    if (error) { toast.error(error.message); return }
    setShowChannelCreate(false)
    setNewChannelName(''); setNewChannelDesc(''); setNewChannelAnno(false)
    loadChannels()
    toast.success('Channel created!')
  }, [newChannelName, newChannelDesc, newChannelAnno, user.id, loadChannels])

  // ── Create conversation ───────────────────────────────────
  const createConversation = useCallback(async () => {
    if (!selectedUsers.length) return toast.error('Select at least one person')
    try {
      const isGroup = selectedUsers.length > 1
      const convId = crypto.randomUUID()
      const now = new Date().toISOString()
      if (!isGroup) {
        const otherId = selectedUsers[0]
        const { data: myParts } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', user.id)
        if (myParts?.length) {
          const { data: shared } = await supabase
            .from('chat_participants').select('conversation_id')
            .eq('user_id', otherId).in('conversation_id', myParts.map(p => p.conversation_id))
          if (shared?.length) {
            const { data: conv } = await supabase
              .from('chat_conversations').select('id, type')
              .eq('id', shared[0].conversation_id).eq('type', 'direct').single()
            if (conv) { setShowNew(false); setSelectedUsers([]); selectConversation(conv.id); return }
          }
        }
      }
      await supabase.from('chat_conversations').insert([{
        id: convId, type: isGroup ? 'group' : 'direct',
        name: isGroup ? (groupName.trim() || 'Group Chat') : null,
        created_by: user.id, created_at: now, updated_at: now,
      }])
      await supabase.from('chat_participants').insert(
        [user.id, ...selectedUsers].map(uid => ({ id: crypto.randomUUID(), conversation_id: convId, user_id: uid, joined_at: now }))
      )
      setShowNew(false); setSelectedUsers([]); setGroupName('')
      await loadConversations()
      selectConversation(convId)
    } catch (err) { toast.error(err.message) }
  }, [selectedUsers, user.id, groupName, loadConversations, selectConversation])

  // ── Helpers ───────────────────────────────────────────────
  const selectedConv = [...conversations, ...channels].find(c => c.id === selectedId)

  const getConvName = useCallback((conv) => {
    if (!conv) return ''
    if (conv.type === 'channel') return `# ${conv.name || 'channel'}`
    if (conv.type === 'group') return conv.name || 'Group Chat'
    const other = conv.chat_participants?.find(p => p.user_id !== user.id)
    return other ? (userMap[other.user_id] || 'Unknown') : 'Direct Message'
  }, [user.id, userMap])

  const getConvInitial = (conv) => {
    if (conv?.type === 'channel') return '#'
    if (conv?.type === 'group') return 'G'
    return getConvName(conv).charAt(0).toUpperCase() || '?'
  }

  const getLastMsg = (conv) => {
    const msgs = conv.chat_messages
    if (!msgs?.length) return { text: 'No messages yet', time: '' }
    const last = [...msgs].sort((a, b) => a.created_at > b.created_at ? -1 : 1)[0]
    const prefix = last.sender_id === user.id ? 'You: ' : ''
    const text = prefix + (last.body || (last.attachment_name ? `📎 ${last.attachment_name}` : ''))
    return { text: text.slice(0, 50) + (text.length > 50 ? '…' : ''), time: formatTime(last.created_at) }
  }

  const filteredConvs = conversations.filter(c => !convSearch || getConvName(c).toLowerCase().includes(convSearch.toLowerCase()))
  const filteredChannels = channels.filter(c => !convSearch || getConvName(c).toLowerCase().includes(convSearch.toLowerCase()))
  const filteredUsers = allUsers.filter(u => !newSearch || u.full_name?.toLowerCase().includes(newSearch.toLowerCase()) || u.username?.toLowerCase().includes(newSearch.toLowerCase()))

  const groupedMessages = (showStarred ? messages.filter(m => starredIds.has(m.id)) : messages).reduce((g, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!g[date]) g[date] = []
    g[date].push(msg)
    return g
  }, {})

  // Build reply-to lookup
  const msgById = {}
  messages.forEach(m => { msgById[m.id] = m })

  // ────────────────────────────────────────────────────────────
  // ── Conversation List ─────────────────────────────────────
  const ConvList = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', ...(isMobile ? { width: '100%' } : { width: 300, minWidth: 300, borderRight: '1px solid var(--border)' }) }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span className="material-icons" style={{ color: 'var(--teal)', fontSize: 20 }}>forum</span>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Messages</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-icons" style={{ fontSize: 15 }}>add</span> New
        </button>
      </div>
      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input className="form-control" placeholder="Search conversations…" style={{ fontSize: 13 }}
          value={convSearch} onChange={e => setConvSearch(e.target.value)} />
      </div>
      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingConvs ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* DMs & Groups */}
            {filteredConvs.length > 0 && (
              <>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Direct Messages
                </div>
                {filteredConvs.map(conv => {
                  const isActive = conv.id === selectedId && !isMobile
                  const last = getLastMsg(conv)
                  const unread = unreadMap[conv.id] || 0
                  const otherUser = conv.type === 'direct' ? conv.chat_participants?.find(p => p.user_id !== user.id) : null
                  const otherOnline = otherUser ? isOnline(onlineMap[otherUser.user_id]) : false
                  return (
                    <div key={conv.id} onClick={() => selectConversation(conv.id)}
                      style={{ padding: '11px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isActive ? 'rgba(184,50,50,.08)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,.03)', transition: 'background .15s' }}>
                      {/* Avatar with online dot */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: conv.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: 'var(--bg)' }}>
                          {getConvInitial(conv)}
                        </div>
                        {otherOnline && (
                          <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--surface)' }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: unread > 0 ? 700 : 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getConvName(conv)}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{last.text}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        {last.time && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{last.time}</div>}
                        {unread > 0 && (
                          <span style={{ background: 'var(--gold)', color: 'var(--bg)', borderRadius: 12, padding: '1px 6px', fontSize: 10, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* Channels */}
            {(filteredChannels.length > 0 || isAdmin) && (
              <>
                <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ flex: 1 }}>Channels</span>
                  {isAdmin && (
                    <button onClick={() => setShowChannelCreate(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex', alignItems: 'center' }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>add</span>
                    </button>
                  )}
                </div>
                {filteredChannels.map(conv => {
                  const isActive = conv.id === selectedId && !isMobile
                  const last = getLastMsg(conv)
                  return (
                    <div key={conv.id} onClick={() => selectConversation(conv.id)}
                      style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isActive ? 'rgba(184,50,50,.08)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--gold)' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,.03)', transition: 'background .15s' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'var(--text-dim)', flexShrink: 0 }}>
                        #
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{last.text}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{last.time}</div>
                    </div>
                  )
                })}
                {filteredChannels.length === 0 && isAdmin && (
                  <div style={{ padding: '8px 16px 12px', fontSize: 12, color: 'var(--text-dim)' }}>
                    No channels yet — <button onClick={() => setShowChannelCreate(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: 12, padding: 0 }}>Create one</button>
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {filteredConvs.length === 0 && filteredChannels.length === 0 && !loadingConvs && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                <span className="material-icons" style={{ fontSize: 44, opacity: 0.2, display: 'block', marginBottom: 8 }}>chat_bubble_outline</span>
                <div style={{ fontSize: 13 }}>No conversations yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Tap + New to start chatting</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // ── Chat Panel ────────────────────────────────────────────
  const isAnnouncementOnly = selectedConv?.is_announcement_only && !isAdmin

  const ChatArea = (
    <div style={{ display: 'flex', height: '100%', ...(isMobile ? { width: '100%' } : { flex: 1 }), minWidth: 0, position: 'relative' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)', position: 'relative' }}>
        {!selectedId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 72, opacity: 0.12, marginBottom: 16 }}>forum</span>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No conversation selected</div>
            <div style={{ fontSize: 13 }}>Choose one or start a new one</div>
          </div>
        ) : (
          <>
            {/* ── Chat Header ── */}
            <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {isMobile && (
                  <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 4, display: 'flex', alignItems: 'center' }}>
                    <span className="material-icons">arrow_back</span>
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => {
                    if (selectedConv?.type === 'group' || selectedConv?.type === 'channel') {
                      setShowMembers(v => !v)
                    } else {
                      const other = selectedConv?.chat_participants?.find(p => p.user_id !== user.id)
                      if (other) {
                        setProfileUser({ user_id: other.user_id, name: userMap[other.user_id] || 'Unknown', empInfo: employeeMap[other.user_id] })
                        setShowMembers(v => !v)
                      }
                    }
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: selectedConv?.type === 'channel' ? 8 : '50%', flexShrink: 0, background: selectedConv?.type === 'channel' ? 'var(--surface2)' : selectedConv?.type === 'group' ? 'linear-gradient(135deg,var(--blue),var(--teal))' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: selectedConv?.type === 'channel' ? 18 : 14, color: selectedConv?.type === 'channel' ? 'var(--text-dim)' : 'var(--bg)' }}>
                    {selectedConv ? getConvInitial(selectedConv) : '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {getConvName(selectedConv)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--teal)' }}>
                      {selectedConv?.type === 'channel'
                        ? (selectedConv.description || 'Channel')
                        : selectedConv?.type === 'group'
                        ? `${participants.length} members — tap to view`
                        : (() => {
                            const other = selectedConv?.chat_participants?.find(p => p.user_id !== user.id)
                            return other ? lastSeenText(onlineMap[other.user_id]) : 'Tap for contact details'
                          })()
                      }
                    </div>
                  </div>
                </div>
                {/* Header actions */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <button onClick={() => setShowStarred(v => !v)} title="Starred messages"
                    style={{ background: showStarred ? 'rgba(184,50,50,.12)' : 'none', border: 'none', cursor: 'pointer', color: showStarred ? 'var(--gold)' : 'var(--text-dim)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 18 }}>{showStarred ? 'star' : 'star_border'}</span>
                  </button>
                  <button onClick={() => { setShowSearch(v => !v); setSearchQuery(''); setSearchResults([]) }} title="Search messages"
                    style={{ background: showSearch ? 'rgba(184,50,50,.12)' : 'none', border: 'none', cursor: 'pointer', color: showSearch ? 'var(--gold)' : 'var(--text-dim)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 18 }}>search</span>
                  </button>
                </div>
              </div>

              {/* Search bar */}
              {showSearch && (
                <div style={{ padding: '0 16px 10px' }}>
                  <input
                    className="form-control" placeholder="Search messages…" autoFocus
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
              )}
            </div>

            {/* ── Pinned messages banner ── */}
            {pinnedMessages.length > 0 && !showSearch && (
              <div style={{ background: 'rgba(184,50,50,.06)', borderBottom: '1px solid rgba(184,50,50,.15)', padding: '8px 16px', flexShrink: 0, cursor: 'pointer' }}
                onClick={() => setShowPinnedAll(v => !v)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 14, color: 'var(--gold)' }}>push_pin</span>
                  <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pinnedMessages.length > 1 ? `${pinnedMessages.length} pinned messages` : (pinnedMessages[0].body || 'Pinned message')}
                  </span>
                  <span className="material-icons" style={{ fontSize: 14, color: 'var(--gold)' }}>{showPinnedAll ? 'expand_less' : 'expand_more'}</span>
                </div>
                {showPinnedAll && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pinnedMessages.map(pm => (
                      <div key={pm.id} onClick={(e) => { e.stopPropagation(); scrollToMessage(pm.id); setShowPinnedAll(false) }}
                        style={{ fontSize: 12, color: 'var(--text)', background: 'var(--surface)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>{userMap[pm.sender_id] || 'Unknown'}:</span>
                        {(pm.body || '').slice(0, 80)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Search results ── */}
            {showSearch && searchQuery.trim() ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>No results found</div>
                ) : searchResults.map(msg => (
                  <div key={msg.id} onClick={() => { setShowSearch(false); setSearchQuery(''); setTimeout(() => scrollToMessage(msg.id), 100) }}
                    style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{userMap[msg.sender_id] || 'Unknown'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtTime(msg.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                      {(msg.body || '').split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === searchQuery.toLowerCase()
                          ? <mark key={i} style={{ background: 'rgba(184,50,50,.3)', color: 'var(--text)', borderRadius: 2 }}>{part}</mark>
                          : <span key={i}>{part}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Messages list ── */
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px', display: 'flex', flexDirection: 'column' }}>
                {loadingMsgs ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
                ) : messages.filter(m => !showStarred || starredIds.has(m.id)).length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                    {showStarred ? 'No starred messages' : 'No messages yet. Say hello! 👋'}
                  </div>
                ) : Object.entries(groupedMessages).map(([date, msgs]) => (
                  <div key={date}>
                    <div style={{ textAlign: 'center', margin: '10px 0' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', background: 'var(--surface)', padding: '2px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>{date}</span>
                    </div>
                    {msgs.map((msg, idx) => {
                      const isMine = msg.sender_id === user.id
                      const prevMsg = idx > 0 ? msgs[idx - 1] : null
                      const showName = !isMine && msg.sender_id !== prevMsg?.sender_id && selectedConv?.type !== 'direct'
                      const isTemp = msg.id?.startsWith('temp-')
                      const msgReactions = reactions[msg.id] || []
                      const replyToMsg = msg.reply_to_id ? msgById[msg.reply_to_id] : null
                      return (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          isMine={isMine}
                          showName={showName}
                          senderName={userMap[msg.sender_id] || 'Unknown'}
                          isTemp={isTemp}
                          reactions={msgReactions}
                          isStarred={starredIds.has(msg.id)}
                          replyToMsg={replyToMsg}
                          onReply={(m) => setReplyTo({ id: m.id, body: m.body, sender_name: userMap[m.sender_id] || 'Unknown' })}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onReact={handleReact}
                          onForward={(m) => { setForwardMsg(m); setForwardSearch('') }}
                          onStar={handleStar}
                          onPin={handlePin}
                          onCopyText={() => toast.success('Copied!')}
                          onScrollToReply={scrollToMessage}
                          msgRefs={msgRefs}
                          isAdmin={isAdmin}
                          userMap={userMap}
                          fmtTime={fmtTime}
                          readStatus={isMine ? (reads[msg.id] || 'sent') : null}
                          isMobile={isMobile}
                        />
                      )
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* ── Typing indicator ── */}
            <TypingIndicator typingUsers={typingUsers} />

            {/* ── Reply preview bar ── */}
            {replyTo && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <div style={{ flex: 1, borderLeft: '3px solid var(--gold)', paddingLeft: 10, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>{replyTo.sender_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {replyTo.body || 'Attachment'}
                  </div>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 4 }}>
                  <span className="material-icons" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            )}

            {/* ── Slash hint ── */}
            {showSlashHint && (
              <div style={{
                position: 'absolute', bottom: 70, left: 16, right: 16, zIndex: 100,
                background: 'rgba(184,50,50,.10)', border: '1px solid rgba(184,50,50,.25)',
                borderRadius: 10, padding: '10px 14px',
                animation: 'slideUp 0.3s ease, fadeOut 0.5s ease 2.5s forwards',
                fontSize: 12, color: 'var(--gold)',
                display: 'flex', alignItems: 'center', gap: 10,
                pointerEvents: 'none',
              }}>
                <span className="material-icons" style={{ fontSize: 16 }}>tips_and_updates</span>
                <div>
                  <strong>Tip:</strong> Type <code style={{ background: 'rgba(184,50,50,.18)', padding: '1px 6px', borderRadius: 4 }}>/</code> to tag any document &nbsp;·&nbsp; Type <code style={{ background: 'rgba(184,50,50,.18)', padding: '1px 6px', borderRadius: 4 }}>@</code> to mention someone
                </div>
              </div>
            )}

            {/* ── Slash / Mention picker ── */}
            {(slashQuery !== null || mentionQuery !== null) && (
              <SlashMentionPicker
                mode={slashQuery !== null ? 'slash' : 'mention'}
                query={mentionQuery}
                slashResults={slashResults}
                mentionUsers={participants.map(p => allUsers.find(u => u.id === p.user_id) || { id: p.user_id, full_name: userMap[p.user_id] })}
                onlineMap={onlineMap}
                onSelect={(value) => {
                  if (slashQuery !== null) {
                    inputRef.current?.insertAtSlash(value)
                  } else {
                    inputRef.current?.insertAtAt(value)
                  }
                  setSlashQuery(null)
                  setMentionQuery(null)
                }}
                onClose={() => { setSlashQuery(null); setMentionQuery(null) }}
              />
            )}

            {/* ── Message Input ── */}
            <MessageInput
              ref={inputRef}
              onSend={handleSend}
              onChange={handleInputChange}
              onTyping={handleTyping}
              announcementOnly={isAnnouncementOnly}
              isAdmin={isAdmin}
            />
          </>
        )}
      </div>

      {/* ── Contact / Members panel ── */}
      {showMembers && selectedConv && (
        <div style={{ width: 260, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', flexShrink: 0, ...(isMobile ? { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 10, width: '78%', boxShadow: '-4px 0 20px rgba(0,0,0,.3)' } : {}) }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--teal)' }}>{selectedConv.type === 'channel' ? 'tag' : selectedConv.type === 'group' ? 'group' : 'person'}</span>
            {/* Group rename */}
            {selectedConv.type === 'group' && renameMode ? (
              <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameMode(false) }}
                  autoFocus
                  style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--gold)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                />
                <button onClick={handleRename} disabled={renameLoading}
                  style={{ background: 'var(--gold)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--bg)', fontWeight: 700 }}>
                  {renameLoading ? '…' : 'Save'}
                </button>
                <button onClick={() => setRenameMode(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                  {selectedConv.type === 'group' ? `Members (${participants.length})` : selectedConv.type === 'channel' ? `# ${selectedConv.name}` : 'Contact'}
                </div>
                {selectedConv.type === 'group' && isAdmin && (
                  <button onClick={() => { setRenameValue(selectedConv.name || ''); setRenameMode(true) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', padding: 2 }}>
                    <span className="material-icons" style={{ fontSize: 16 }}>edit</span>
                  </button>
                )}
              </>
            )}
            <button onClick={() => setShowMembers(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
              <span className="material-icons" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {/* Channel info */}
            {selectedConv.type === 'channel' && selectedConv.description && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                {selectedConv.description}
              </div>
            )}
            {/* Direct / Group members */}
            {(selectedConv.type === 'direct'
              ? participants.filter(p => p.user_id !== user.id)
              : participants
            ).map(p => {
              const name = userMap[p.user_id] || 'Unknown'
              const isMe = p.user_id === user.id
              const empInfo = employeeMap[p.user_id]
              const online = isOnline(onlineMap[p.user_id])
              const isOpen = selectedConv.type === 'direct' || profileUser?.user_id === p.user_id
              return (
                <div key={p.user_id}
                  onClick={() => selectedConv.type === 'group' && setProfileUser(prev => prev?.user_id === p.user_id ? null : { user_id: p.user_id, name, empInfo })}
                  style={{ padding: '10px 12px', borderRadius: 10, cursor: selectedConv.type === 'group' ? 'pointer' : 'default', marginBottom: 4, background: isOpen && selectedConv.type === 'group' ? 'rgba(184,50,50,.06)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: isMe ? 'linear-gradient(135deg,var(--gold),var(--teal))' : 'linear-gradient(135deg,var(--blue),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--bg)' }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      {online && (
                        <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--surface)' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}{isMe ? ' (You)' : ''}</div>
                      <div style={{ fontSize: 11, color: online ? 'var(--green)' : 'var(--text-dim)' }}>
                        {lastSeenText(onlineMap[p.user_id])}
                      </div>
                    </div>
                    {selectedConv.type === 'group' && (
                      <span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>{isOpen ? 'expand_less' : 'expand_more'}</span>
                    )}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', paddingLeft: 4 }}>
                      {empInfo?.phone ? (
                        <a href={`tel:${empInfo.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', marginBottom: 6, textDecoration: 'none' }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>phone</span>{empInfo.phone}
                        </a>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>phone_disabled</span>No phone on record
                        </div>
                      )}
                      {empInfo?.email ? (
                        <a href={`mailto:${empInfo.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>email</span>{empInfo.email}
                        </a>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>mail_outline</span>No email on record
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

  // ── New Conversation Modal ─────────────────────────────────
  const NewConvModal = showNew && (
    <>
      <div onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 440, maxHeight: '85vh', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="material-icons" style={{ color: 'var(--teal)' }}>person_add</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>New Conversation</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setShowNew(false); setSelectedUsers([]); setGroupName(''); setNewSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'hidden' }}>
          <input className="form-control" placeholder="Search people…" value={newSearch} onChange={e => setNewSearch(e.target.value)} autoFocus />
          {selectedUsers.length > 1 && (
            <input className="form-control" placeholder="Group name (optional)" value={groupName} onChange={e => setGroupName(e.target.value)} />
          )}
          {selectedUsers.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selectedUsers.map(uid => {
                const u = allUsers.find(x => x.id === uid)
                return (
                  <span key={uid} style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(184,50,50,.12)', border: '1px solid rgba(184,50,50,.3)', color: 'var(--gold)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
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
              const online = isOnline(onlineMap[u.id])
              return (
                <div key={u.id} onClick={() => setSelectedUsers(p => isSel ? p.filter(x => x !== u.id) : [...p, u.id])}
                  style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: isSel ? 'rgba(184,50,50,.06)' : 'transparent' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--bg)' }}>
                      {(u.full_name || u.username || '?').charAt(0).toUpperCase()}
                    </div>
                    {online && (
                      <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--surface)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.full_name || u.username}</div>
                    {u.full_name && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.username}</div>}
                  </div>
                  <span className="material-icons" style={{ fontSize: 18, color: isSel ? 'var(--gold)' : 'var(--border)' }}>{isSel ? 'check_circle' : 'radio_button_unchecked'}</span>
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

  // ── Forward Modal ─────────────────────────────────────────
  const ForwardModal = forwardMsg && (
    <>
      <div onClick={() => { setForwardMsg(null); setForwardSearch('') }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 700 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 400, maxHeight: '70vh', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 701, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="material-icons" style={{ color: 'var(--teal)' }}>forward</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Forward Message</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setForwardMsg(null); setForwardSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '8px 10px', borderRadius: 8, fontStyle: 'italic' }}>
            {(forwardMsg.body || '').slice(0, 100) || 'Attachment'}
          </div>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input className="form-control" placeholder="Search conversations…" autoFocus value={forwardSearch} onChange={e => setForwardSearch(e.target.value)} style={{ fontSize: 13 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {[...conversations, ...channels]
            .filter(c => c.id !== selectedId && (!forwardSearch || getConvName(c).toLowerCase().includes(forwardSearch.toLowerCase())))
            .map(c => (
              <button key={c.id} onClick={() => handleForwardSend(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.03)', textAlign: 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <div style={{ width: 36, height: 36, borderRadius: c.type === 'channel' ? 8 : '50%', background: c.type === 'channel' ? 'var(--surface2)' : 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: c.type === 'channel' ? 16 : 13, color: c.type === 'channel' ? 'var(--text-dim)' : 'var(--bg)', flexShrink: 0, border: c.type === 'channel' ? '1px solid var(--border)' : 'none' }}>
                  {getConvInitial(c)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{getConvName(c)}</span>
              </button>
            ))}
        </div>
      </div>
    </>
  )

  // ── Create Channel Modal ──────────────────────────────────
  const ChannelCreateModal = showChannelCreate && (
    <>
      <div onClick={() => setShowChannelCreate(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-icons" style={{ color: 'var(--teal)' }}>tag</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Create Channel</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowChannelCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Channel name *</label>
            <input className="form-control" placeholder="e.g. general, announcements" autoFocus
              value={newChannelName} onChange={e => setNewChannelName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Description</label>
            <input className="form-control" placeholder="What is this channel about?" value={newChannelDesc} onChange={e => setNewChannelDesc(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={newChannelAnno} onChange={e => setNewChannelAnno(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--gold)' }} />
            Announcement-only (admins post, everyone reads)
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <button className="btn btn-secondary" onClick={() => setShowChannelCreate(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>
              Create Channel
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {isMobile ? (
        <>
          {mobileScreen === 'list' && ConvList}
          {mobileScreen === 'chat' && ChatArea}
        </>
      ) : (
        <>{ConvList}{ChatArea}</>
      )}
      {NewConvModal}
      {ForwardModal}
      {ChannelCreateModal}
    </div>
  )
}
