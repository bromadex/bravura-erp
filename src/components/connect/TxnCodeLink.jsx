// src/components/connect/TxnCodeLink.jsx
// Detects transaction codes in chat messages and makes them clickable

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const TXN_PATTERN = /\b([A-Z]{2,4}-\d{4}-\d{4,6})\b/g

const MODULE_META = {
  SR:  { table: 'store_requisitions',   label: 'Store Requisition',    route: '/module/procurement/store-requisitions',   numCol: 'req_number' },
  PR:  { table: 'purchase_requisitions',label: 'Purchase Requisition', route: '/module/procurement/purchase-requisitions', numCol: 'req_number' },
  PO:  { table: 'purchase_orders',      label: 'Purchase Order',       route: '/module/procurement/purchase-orders',       numCol: 'po_number'  },
  GRN: { table: 'goods_received',       label: 'Goods Received Note',  route: '/module/procurement/goods-received',        numCol: 'grn_number' },
  LV:  { table: 'leave_requests',       label: 'Leave Request',        route: '/module/hr/leave',                          numCol: 'txn_code'   },
  MO:  { table: 'governance_documents', label: 'Internal Memo',        route: '/module/governance/memos',                  numCol: 'txn_code'   },
}

const STATUS_COLOR = {
  draft: 'var(--text-dim)', pending: 'var(--yellow)', pending_supervisor: 'var(--yellow)',
  pending_hr: 'var(--yellow)', approved: 'var(--green)', rejected: 'var(--red)',
  fulfilled: 'var(--teal)', submitted: 'var(--blue)',
}

function PreviewModal({ code, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)
  const prefix = code.split('-')[0]
  const meta   = MODULE_META[prefix]

  // Load on mount
  useState(() => {
    if (!meta) { setErr('Unknown transaction type'); setLoading(false); return }
    supabase.from(meta.table).select('*').eq(meta.numCol, code).limit(1).single()
      .then(({ data: row, error }) => {
        if (row) setData(row)
        else setErr('Record not found')
        setLoading(false)
      })
  }, [])

  const Field = ({ label, value }) => value ? (
    <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div><div style={{ fontSize: 13 }}>{value}</div></div>
  ) : null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 700 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 701 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>receipt_long</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{meta?.label || 'Transaction'}</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--gold)' }}>{code}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>
        <div style={{ padding: 18 }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>Loading…</div>}
          {err     && <div style={{ textAlign: 'center', color: 'var(--red)',      padding: 24 }}>{err}</div>}
          {data    && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Title / Reference" value={data.title || data.req_number || data.po_number || data.grn_number} />
              {data.status && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Status</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[data.status] || 'var(--text)', background: `${STATUS_COLOR[data.status] || 'var(--text)'}18`, padding: '3px 12px', borderRadius: 10, border: `1px solid ${STATUS_COLOR[data.status] || 'var(--border)'}44` }}>
                    {data.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              )}
              <Field label="Department"     value={data.department} />
              <Field label="Requested By"   value={data.requester_name} />
              <Field label="Days Requested" value={data.days_requested} />
              <Field label="Period"         value={data.start_date ? `${data.start_date} → ${data.end_date}` : null} />
              <Field label="Notes"          value={data.notes} />
              {data.created_at && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Created {new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <a href={meta?.route} style={{ textDecoration: 'none' }}>
                  <button className="btn btn-secondary" style={{ fontSize: 12 }}>Open Module →</button>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function TxnCodeMessage({ body }) {
  const [activeCode, setActiveCode] = useState(null)
  if (!body) return null

  const parts = []
  let last = 0, match
  const regex = new RegExp(TXN_PATTERN.source, 'g')
  while ((match = regex.exec(body)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: body.slice(last, match.index) })
    parts.push({ type: 'code', content: match[0] })
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push({ type: 'text', content: body.slice(last) })

  return (
    <>
      <span>
        {parts.map((p, i) =>
          p.type === 'text' ? <span key={i}>{p.content}</span> : (
            <button key={i} onClick={() => setActiveCode(p.content)}
              style={{ background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.4)', borderRadius: 6, padding: '1px 8px', cursor: 'pointer', color: 'var(--gold)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, margin: '0 2px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="material-icons" style={{ fontSize: 11 }}>receipt_long</span>
              {p.content}
            </button>
          )
        )}
      </span>
      {activeCode && <PreviewModal code={activeCode} onClose={() => setActiveCode(null)} />}
    </>
  )
}
