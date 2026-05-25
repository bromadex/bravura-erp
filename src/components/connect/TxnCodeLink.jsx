// src/components/connect/TxnCodeLink.jsx
// Detects transaction codes in chat messages and makes them clickable chips.
// Derives all module metadata from PREFIX_REGISTRY (transactionEngine.js) —
// the single source of truth — so new modules are automatically supported.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { PREFIX_REGISTRY } from '../../engine/transactionEngine'

// Matches SR-2026-00012, GRN-2026-00001, PCE-2026-00004, JOB-2026-00001 …
const TXN_PATTERN     = /\b([A-Z]{2,4}-\d{4}(?:-\d{4,8})?)\b/g
// Also detect [CODE] format inserted by the slash picker
const BRACKET_PATTERN = /\[([A-Z]{2,4}-\d{4}(?:-\d{4,8})?)\]/g

const STATUS_COLOR = {
  draft:              'var(--text-dim)',
  pending:            'var(--yellow)',
  pending_supervisor: 'var(--yellow)',
  pending_hr:         'var(--yellow)',
  pending_approval:   'var(--yellow)',
  on_hold:            'var(--yellow)',
  approved:           'var(--green)',
  posted:             'var(--green)',
  received:           'var(--green)',
  completed:          'var(--green)',
  paid:               'var(--green)',
  fulfilled:          'var(--teal)',
  open:               'var(--teal)',
  in_progress:        'var(--blue)',
  submitted:          'var(--blue)',
  rejected:           'var(--red)',
  cancelled:          'var(--red)',
  closed:             'var(--text-dim)',
}

// ── Preview modal ─────────────────────────────────────────────
function PreviewModal({ code, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)
  const navigate = useNavigate()

  const prefix = code.split('-')[0]
  const meta   = PREFIX_REGISTRY[prefix]

  useEffect(() => {
    if (!meta) { setErr('Unknown transaction type'); setLoading(false); return }
    supabase.from(meta.table).select('*').eq(meta.numCol, code).limit(1).single()
      .then(({ data: row }) => {
        if (row) setData(row)
        else setErr('Record not found')
        setLoading(false)
      })
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const Field = ({ label, value }) => (value != null && value !== '') ? (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{String(value)}</div>
    </div>
  ) : null

  const fmtAmt = (v) => v != null
    ? Number(v).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0 })
    : null

  const getTitle = (row) => row?.title || row?.name || row?.description || row?.subject || null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 700 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 701, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${meta?.color || 'var(--gold)'}0d` }}>
          <span className="material-icons" style={{ color: meta?.color || 'var(--gold)', fontSize: 22 }}>{meta?.icon || 'receipt_long'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{meta?.label || 'Transaction'}</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--gold)', fontWeight: 700 }}>{code}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 18 }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>Loading…</div>}
          {err     && <div style={{ textAlign: 'center', color: 'var(--red)', padding: 24 }}>{err}</div>}
          {data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Amount */}
              {meta?.amtCol && data[meta.amtCol] != null && (
                <div style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}30`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Amount</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: meta.color }}>{fmtAmt(data[meta.amtCol])}</div>
                </div>
              )}

              {/* Status */}
              {data.status && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Status</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[data.status] || 'var(--text)', background: `${STATUS_COLOR[data.status] || 'var(--gold)'}18`, padding: '3px 12px', borderRadius: 10, border: `1px solid ${STATUS_COLOR[data.status] || 'var(--border)'}44` }}>
                    {data.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              )}

              <Field label="Title / Subject"   value={getTitle(data)} />
              <Field label="Supplier / Vendor"  value={data.supplier_name || data.vendor_name} />
              <Field label="Requested By"       value={data.requester_name || data.employee_name || data.issued_by || data.requested_by} />
              <Field label="Department"         value={data.department} />
              <Field label="Approval Status"    value={data.approval_status?.replace(/_/g, ' ')} />
              {data.created_at && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Created {new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <button onClick={() => navigator.clipboard.writeText(code)} className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>content_copy</span> Copy Code
                </button>
                {meta?.route && (
                  <button onClick={() => { navigate(meta.route); onClose() }} className="btn btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                    Open in {(meta.module?.charAt(0).toUpperCase() || '') + (meta.module?.slice(1) || '')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main export ───────────────────────────────────────────────
export default function TxnCodeMessage({ body }) {
  const [activeCode, setActiveCode] = useState(null)
  if (!body) return null

  // Normalise [CODE] → CODE so one regex handles both
  const normalised = body.replace(BRACKET_PATTERN, '$1')

  const parts = []
  let last = 0, match
  const regex = new RegExp(TXN_PATTERN.source, 'g')
  while ((match = regex.exec(normalised)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: normalised.slice(last, match.index) })
    parts.push({ type: 'code', content: match[0] })
    last = match.index + match[0].length
  }
  if (last < normalised.length) parts.push({ type: 'text', content: normalised.slice(last) })

  return (
    <>
      <span>
        {parts.map((p, i) => {
          if (p.type === 'text') return <span key={i}>{p.content}</span>
          const prefix = p.content.split('-')[0]
          const meta   = PREFIX_REGISTRY[prefix]
          return (
            <button key={i} onClick={() => setActiveCode(p.content)}
              style={{
                background:    `${meta?.color || 'var(--gold)'}18`,
                border:        `1px solid ${meta?.color || 'var(--gold)'}44`,
                borderRadius:  8, padding: '2px 10px', cursor: 'pointer',
                color:         meta?.color || 'var(--gold)',
                fontSize:      12, fontFamily: 'var(--mono, monospace)', fontWeight: 700,
                margin: '0 2px', display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle',
              }}>
              <span className="material-icons" style={{ fontSize: 12 }}>{meta?.icon || 'tag'}</span>
              {p.content}
            </button>
          )
        })}
      </span>
      {activeCode && <PreviewModal code={activeCode} onClose={() => setActiveCode(null)} />}
    </>
  )
}
