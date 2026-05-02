// src/components/TxnCodeBadge.jsx
//
// Renders any transaction code string as a clickable gold pill.
// Clicking opens the Quick Action Modal (imported lazily to avoid circular deps).
// Can also be used inline to highlight codes inside free-text strings.

import { useState } from 'react'
import { TXN_CODE_REGEX } from '../utils/txnCode'
import QuickActionModal from './QuickActionModal'

const BADGE_STYLE = {
  display:        'inline-flex',
  alignItems:     'center',
  gap:            4,
  padding:        '2px 8px',
  borderRadius:   20,
  background:     'rgba(251,191,36,.12)',
  border:         '1px solid rgba(251,191,36,.35)',
  color:          'var(--gold)',
  fontFamily:     'var(--mono)',
  fontSize:       11,
  fontWeight:     700,
  letterSpacing:  0.5,
  cursor:         'pointer',
  whiteSpace:     'nowrap',
  transition:     'background .15s',
}

// Single badge for a known code
export default function TxnCodeBadge({ code, style }) {
  const [open, setOpen] = useState(false)

  if (!code) return null

  return (
    <>
      <span
        style={{ ...BADGE_STYLE, ...style }}
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(251,191,36,.22)' }}
        onMouseOut={e  => { e.currentTarget.style.background = 'rgba(251,191,36,.12)' }}
        title={`View ${code}`}
      >
        <span className="material-icons" style={{ fontSize: 11 }}>tag</span>
        {code}
      </span>

      {open && <QuickActionModal code={code} onClose={() => setOpen(false)} />}
    </>
  )
}

// Renders a string with all embedded transaction codes replaced by clickable badges
export function TxnCodeText({ text }) {
  if (!text) return null

  const parts = []
  let lastIndex = 0
  const regex = new RegExp(TXN_CODE_REGEX.source, 'g')
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(<TxnCodeBadge key={match.index} code={match[1]} />)
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <>{parts}</>
}
