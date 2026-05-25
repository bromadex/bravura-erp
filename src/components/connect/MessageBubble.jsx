// src/components/connect/MessageBubble.jsx
// Extracted message bubble with full C1-C4 feature support

import { useState, useRef, useEffect } from 'react'
import TxnCodeMessage from './TxnCodeLink'

// ── File size formatter ───────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── File icon by extension ────────────────────────────────────
function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase()
  if (['pdf'].includes(ext)) return 'picture_as_pdf'
  if (['doc', 'docx'].includes(ext)) return 'description'
  if (['xls', 'xlsx'].includes(ext)) return 'table_chart'
  if (['txt'].includes(ext)) return 'article'
  return 'attach_file'
}

// ── Read receipt tick component ───────────────────────────────
function ReadTicks({ readStatus }) {
  if (!readStatus || readStatus === 'sending') return null
  const teal = readStatus === 'read'
  const double = readStatus === 'delivered' || readStatus === 'read'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 3, color: teal ? 'var(--teal)' : 'var(--text-dim)', fontSize: 10, userSelect: 'none' }}>
      {double ? '✓✓' : '✓'}
    </span>
  )
}

// ── Quoted reply block ────────────────────────────────────────
function QuotedReply({ replyToMsg, onScrollToReply, userMap }) {
  if (!replyToMsg) return null
  const senderName = userMap?.[replyToMsg.sender_id] || 'Someone'
  const bodyPreview = (replyToMsg.body || '').slice(0, 80) + (replyToMsg.body?.length > 80 ? '…' : '')
  return (
    <div
      onClick={onScrollToReply}
      style={{
        background: 'var(--surface2)',
        borderLeft: '3px solid var(--gold)',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 11,
        cursor: 'pointer',
        marginBottom: 4,
        maxWidth: '100%',
        opacity: 0.9,
      }}
    >
      <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 2 }}>{senderName}</div>
      <div style={{ color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {replyToMsg.is_deleted ? <em>This message was deleted</em> : bodyPreview}
      </div>
    </div>
  )
}

// ── Reactions row ─────────────────────────────────────────────
function ReactionsRow({ reactions = [], onReact }) {
  if (!reactions.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', borderRadius: 20, fontSize: 12,
            background: r.myReact ? 'rgba(251,191,36,.2)' : 'var(--surface2)',
            border: r.myReact ? '1px solid rgba(251,191,36,.5)' : '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text)',
          }}
        >
          <span>{r.emoji}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.count}</span>
        </button>
      ))}
    </div>
  )
}

// ── Emoji picker (mini) ───────────────────────────────────────
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function EmojiPicker({ onPick, onClose, isMine }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        bottom: '100%',
        [isMine ? 'right' : 'left']: 0,
        marginBottom: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 24,
        padding: '6px 8px',
        display: 'flex', gap: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,.4)',
        zIndex: 50,
        whiteSpace: 'nowrap',
      }}
    >
      {QUICK_EMOJIS.map(em => (
        <button
          key={em}
          onClick={() => { onPick(em); onClose() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '2px 4px', borderRadius: 8, lineHeight: 1 }}
        >
          {em}
        </button>
      ))}
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────
function ContextMenu({ isMine, isAdmin, isPinned, isStarred, x, y, onEdit, onDelete, onForward, onStar, onPin, onCopy, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose() })
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const menuItems = [
    ...(isMine ? [{ label: 'Edit', icon: 'edit', action: onEdit }] : []),
    ...(isMine ? [{ label: 'Delete', icon: 'delete', action: onDelete, danger: true }] : []),
    { label: 'Reply', icon: 'reply', action: null }, // handled by action bar
    { label: 'Forward', icon: 'forward', action: onForward },
    { label: isStarred ? 'Unstar' : 'Star', icon: isStarred ? 'star' : 'star_border', action: onStar },
    { label: 'Copy Text', icon: 'content_copy', action: onCopy },
    ...((isMine || isAdmin) ? [{ label: isPinned ? 'Unpin' : 'Pin', icon: isPinned ? 'push_pin' : 'push_pin', action: onPin }] : []),
  ]

  // Clamp to viewport
  const style = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 280),
    left: Math.min(x, window.innerWidth - 180),
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: 10,
    boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    zIndex: 300,
    minWidth: 160,
    overflow: 'hidden',
  }

  return (
    <div ref={ref} style={style}>
      {menuItems.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.action?.(); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '10px 14px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, color: item.danger ? 'var(--red)' : 'var(--text)',
            textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ── Main MessageBubble export ─────────────────────────────────
export default function MessageBubble({
  msg,
  isMine,
  showName,
  senderName,
  isTemp,
  reactions = [],
  isStarred,
  replyToMsg,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onStar,
  onPin,
  onCopyText,
  onScrollToReply,
  msgRefs,
  isAdmin,
  userMap,
  fmtTime,
  readStatus,
  isMobile,
}) {
  const [hovered, setHovered] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState(msg.body || '')
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 })
  const bubbleRef = useRef(null)

  // Register msgRef for scroll-to
  useEffect(() => {
    if (msgRefs && msg.id && !msg.id.startsWith('temp-')) {
      msgRefs.current[msg.id] = bubbleRef.current
    }
  }, [msg.id, msgRefs])

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue.trim() !== msg.body) {
      onEdit(msg.id, editValue.trim())
    }
    setEditMode(false)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setContextPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const handleMoreClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setContextPos({ x: rect.left, y: rect.bottom + 4 })
    setShowContextMenu(true)
  }

  if (msg.is_deleted) {
    return (
      <div
        ref={bubbleRef}
        style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 4 }}
      >
        <div style={{
          padding: '7px 12px', borderRadius: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic',
        }}>
          This message was deleted
        </div>
      </div>
    )
  }

  return (
    <div
      ref={bubbleRef}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => { if (!isMobile) { setHovered(false); setShowEmoji(false) } }}
      onContextMenu={handleContextMenu}
      style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 3, position: 'relative' }}
    >
      {/* Sender name */}
      {showName && (
        <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 2, marginLeft: isMine ? 0 : 4, fontWeight: 600 }}>
          {senderName}
        </div>
      )}

      {/* Row: action bar + bubble */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row', position: 'relative', maxWidth: isMobile ? '85%' : '68%' }}>

        {/* Hover action bar */}
        {hovered && !editMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 20, padding: '2px 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,.3)',
            flexShrink: 0, order: isMine ? -1 : 1,
          }}>
            <button onClick={() => onReply?.(msg)} title="Reply"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 16, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
              <span className="material-icons" style={{ fontSize: 14 }}>reply</span>
            </button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowEmoji(v => !v)} title="React"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 16, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
                <span className="material-icons" style={{ fontSize: 14 }}>add_reaction</span>
              </button>
              {showEmoji && (
                <EmojiPicker isMine={isMine} onPick={(em) => onReact?.(msg.id, em)} onClose={() => setShowEmoji(false)} />
              )}
            </div>
            <button onClick={handleMoreClick} title="More"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 16, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
              <span className="material-icons" style={{ fontSize: 14 }}>more_horiz</span>
            </button>
          </div>
        )}

        {/* Bubble */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Quoted reply */}
          {replyToMsg && (
            <QuotedReply replyToMsg={replyToMsg} onScrollToReply={() => onScrollToReply?.(replyToMsg.id)} userMap={userMap} />
          )}

          {/* Star badge */}
          {isStarred && (
            <div style={{
              position: 'absolute', top: -6, [isMine ? 'left' : 'right']: -6,
              fontSize: 12, zIndex: 2, pointerEvents: 'none', userSelect: 'none',
            }}>⭐</div>
          )}

          {/* Bubble body */}
          <div style={{
            padding: editMode ? 0 : '8px 12px',
            borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isMine ? 'var(--gold)' : 'var(--surface)',
            color: isMine ? 'var(--bg)' : 'var(--text)',
            border: isMine ? 'none' : '1px solid var(--border)',
            fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
            opacity: isTemp ? 0.6 : 1,
            position: 'relative',
          }}>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() } if (e.key === 'Escape') setEditMode(false) }}
                  style={{
                    width: '100%', minWidth: 200, minHeight: 60, padding: '8px 12px',
                    background: 'var(--surface2)', border: '1px solid var(--gold)',
                    borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditMode(false)}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--gold)', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--bg)', fontWeight: 700 }}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Image attachment */}
                {msg.attachment_url && msg.attachment_type === 'image' && (
                  <div style={{ marginBottom: msg.body ? 6 : 0 }}>
                    <img
                      src={msg.attachment_url}
                      alt={msg.attachment_name || 'Image'}
                      onClick={() => window.open(msg.attachment_url, '_blank')}
                      style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, cursor: 'pointer', display: 'block' }}
                    />
                  </div>
                )}
                {/* File attachment */}
                {msg.attachment_url && msg.attachment_type === 'file' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: isMine ? 'rgba(0,0,0,.12)' : 'var(--surface2)',
                    border: isMine ? 'none' : '1px solid var(--border)',
                    marginBottom: msg.body ? 6 : 0,
                  }}>
                    <span className="material-icons" style={{ fontSize: 22, color: isMine ? 'rgba(0,0,0,.5)' : 'var(--gold)' }}>
                      {fileIcon(msg.attachment_name)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {msg.attachment_name}
                      </div>
                      <div style={{ fontSize: 10, color: isMine ? 'rgba(0,0,0,.4)' : 'var(--text-dim)' }}>{fmtSize(msg.attachment_size)}</div>
                    </div>
                    <a href={msg.attachment_url} download={msg.attachment_name} target="_blank" rel="noopener noreferrer"
                      style={{ color: isMine ? 'rgba(0,0,0,.6)' : 'var(--teal)', display: 'flex' }}>
                      <span className="material-icons" style={{ fontSize: 18 }}>download</span>
                    </a>
                  </div>
                )}
                {/* Message body */}
                {msg.body ? <TxnCodeMessage body={msg.body} /> : null}
              </>
            )}
          </div>

          {/* Timestamp + edited tag + read ticks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
            {msg.is_edited && (
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>(edited)</span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {isTemp ? '…' : fmtTime(msg.created_at)}
            </span>
            {isMine && <ReadTicks readStatus={readStatus} />}
          </div>

          {/* Reactions */}
          <ReactionsRow reactions={reactions} onReact={(em) => onReact?.(msg.id, em)} />
        </div>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <ContextMenu
          isMine={isMine}
          isAdmin={isAdmin}
          isPinned={msg.is_pinned}
          isStarred={isStarred}
          x={contextPos.x}
          y={contextPos.y}
          onEdit={() => setEditMode(true)}
          onDelete={() => onDelete?.(msg.id)}
          onForward={() => onForward?.(msg)}
          onStar={() => onStar?.(msg.id)}
          onPin={() => onPin?.(msg.id, !msg.is_pinned)}
          onCopy={() => { navigator.clipboard.writeText(msg.body || ''); onCopyText?.() }}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  )
}
