// src/components/connect/SlashMentionPicker.jsx
// Combined /slash transaction picker and @mention picker

import { useEffect, useRef } from 'react'

// ── Status badge ──────────────────────────────────────────────
const STATUS_COLORS = {
  draft: 'var(--text-dim)', pending: 'var(--yellow)', pending_supervisor: 'var(--yellow)',
  pending_hr: 'var(--yellow)', approved: 'var(--green)', rejected: 'var(--red)',
  fulfilled: 'var(--teal)', submitted: 'var(--blue)', paid: 'var(--green)',
  received: 'var(--green)', partial: 'var(--yellow)',
}

function StatusBadge({ status }) {
  if (!status) return null
  const color = STATUS_COLORS[status] || 'var(--text-dim)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
      background: `${color}18`, color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Format amount ─────────────────────────────────────────────
function fmtAmt(v) {
  if (!v && v !== 0) return null
  return Number(v).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Online dot ────────────────────────────────────────────────
function OnlineDot({ isOnline }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: isOnline ? 'var(--green)' : 'var(--border)', flexShrink: 0,
    }} />
  )
}

// ── Slash mode — transaction results ─────────────────────────
function SlashResults({ results, onSelect, onClose }) {
  return (
    <>
      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-icons" style={{ fontSize: 15, color: 'var(--gold)' }}>link</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Tag a document</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>↵ to select · Esc to close</span>
      </div>
      {results.length === 0 ? (
        <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
          No documents found — keep typing
        </div>
      ) : (
        results.map((r, i) => (
          <button
            key={`${r.code}-${i}`}
            onClick={() => onSelect(r.code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 14px', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--gold)', flexShrink: 0 }}>{r.icon}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{r.code}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <StatusBadge status={r.status} />
            {r.amount != null && (
              <span style={{ fontSize: 11, color: 'var(--text)', marginLeft: 4, flexShrink: 0 }}>{fmtAmt(r.amount)}</span>
            )}
          </button>
        ))
      )}
    </>
  )
}

// ── Mention mode — user list ──────────────────────────────────
function MentionResults({ users, query, onSelect, onlineMap }) {
  const filtered = users.filter(u =>
    !query || (u.full_name || u.username || '').toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8)

  return (
    <>
      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-icons" style={{ fontSize: 15, color: 'var(--teal)' }}>alternate_email</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Mention someone</span>
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No users found</div>
      ) : (
        filtered.map(u => {
          const name = u.full_name || u.username || 'Unknown'
          const isOnline = onlineMap?.[u.id] ? (Date.now() - new Date(onlineMap[u.id]).getTime()) < 120000 : false
          return (
            <button
              key={u.id}
              onClick={() => onSelect('@' + name + ' ')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 14px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,var(--blue),var(--teal))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 11, color: 'var(--bg)',
              }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </div>
                {u.username && u.full_name && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.username}</div>
                )}
              </div>
              <OnlineDot isOnline={isOnline} />
            </button>
          )
        })
      )}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function SlashMentionPicker({ mode, query, slashResults, mentionUsers, onlineMap, onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (ref.current && !ref.current.contains(e.target) && e.type === 'mousedown') onClose()
    }
    document.addEventListener('keydown', handler)
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        bottom: 72,
        left: 12,
        right: 12,
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 12,
        boxShadow: '0 -4px 20px rgba(0,0,0,.3)',
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {mode === 'slash' && (
        <SlashResults results={slashResults} onSelect={onSelect} onClose={onClose} />
      )}
      {mode === 'mention' && (
        <MentionResults users={mentionUsers} query={query} onSelect={onSelect} onlineMap={onlineMap} />
      )}
    </div>
  )
}
