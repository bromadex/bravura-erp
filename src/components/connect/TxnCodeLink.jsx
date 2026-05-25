// src/components/connect/TxnCodeLink.jsx
// Detects transaction codes in chat messages and makes them clickable

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TXN_PATTERN    = /\b([A-Z]{2,4}-\d{4}(?:-\d{4,8})?)\b/g
const BRACKET_PATTERN = /\[([A-Z]{2,4}-\d{4}(?:-\d{4,8})?)\]/g

const MODULE_META = {
  SR:  { table: 'store_requisitions',    label: 'Store Requisition',    route: '/module/inventory/store-requisitions',     numCol: 'req_number',      amtCol: null,            icon: 'assignment_returned', color: 'var(--teal)'   },
  PR:  { table: 'purchase_requisitions', label: 'Purchase Requisition', route: '/module/procurement/purchase-requisitions',numCol: 'req_number',      amtCol: null,            icon: 'request_quote',       color: 'var(--blue)'   },
  PO:  { table: 'purchase_orders',       label: 'Purchase Order',       route: '/module/procurement/purchase-orders',       numCol: 'po_number',       amtCol: 'total_amount',  icon: 'shopping_bag',        color: 'var(--purple)' },
  GRN: { table: 'goods_received',        label: 'Goods Received Note',  route: '/module/procurement/goods-received',        numCol: 'grn_number',      amtCol: null,            icon: 'move_to_inbox',       color: 'var(--green)'  },
  INV: { table: 'purchase_invoices',     label: 'Purchase Invoice',     route: '/module/procurement/invoices',              numCol: 'invoice_number',  amtCol: 'total_amount',  icon: 'receipt_long',        color: 'var(--gold)'   },
  PV:  { table: 'payment_vouchers',      label: 'Payment Voucher',      route: '/module/procurement/payment-vouchers',      numCol: 'voucher_number',  amtCol: 'amount',        icon: 'payments',            color: 'var(--yellow)' },
  MR:  { table: 'material_requests',     label: 'Material Request',     route: '/module/procurement/material-requests',     numCol: 'mr_number',       amtCol: null,            icon: 'assignment',          color: 'var(--blue)'   },
  LV:  { table: 'leave_requests',        label: 'Leave Request',        route: '/module/hr/leave',                          numCol: 'txn_code',        amtCol: null,            icon: 'event_busy',          color: 'var(--red)'    },
  MO:  { table: 'governance_documents',  label: 'Internal Memo',        route: '/module/governance/memos',                  numCol: 'txn_code',        amtCol: null,            icon: 'mail',                color: 'var(--teal)'   },
  JOB: { table: 'jobs',                  label: 'Job',                  route: '/module/projects/jobs',                     numCol: 'job_number',      amtCol: 'contract_value',icon: 'work',                color: 'var(--purple)' },
  PK:  { table: 'pick_lists',            label: 'Pick List',            route: '/module/inventory/pick-list',               numCol: 'pick_no',         amtCol: null,            icon: 'assignment',          color: 'var(--teal)'   },
  CC:  { table: 'cycle_count_sessions',  label: 'Cycle Count',          route: '/module/inventory/cycle-count',             numCol: 'session_no',      amtCol: null,            icon: 'playlist_add_check',  color: 'var(--blue)'   },
}

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
  rejected:           'var(--red)',
  cancelled:          'var(--red)',
  fulfilled:          'var(--teal)',
  open:               'var(--teal)',
  submitted:          'var(--blue)',
  in_progress:        'var(--blue)',
}

function PreviewModal({ code, onClose }) {
  const navigate = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)
  const [copied,  setCopied]  = useState(false)

  const prefix = code.split('-')[0]
  const meta   = MODULE_META[prefix]

  useEffect(() => {
    if (!meta) { setErr('Unknown transaction type'); setLoading(false); return }
    supabase.from(meta.table).select('*').eq(meta.numCol, code).limit(1).single()
      .then(({ data: row }) => {
        if (row) setData(row)
        else setErr('Record not found')
        setLoading(false)
      })
  }, [code, meta])

  const Field = ({ label, value }) => value ? (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value}</div>
    </div>
  ) : null

  const handleNavigate = () => {
    onClose()
    navigate(meta.route)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const statusColor = data?.status ? (STATUS_COLOR[data.status] || 'var(--text)') : null
  const amtValue    = meta?.amtCol && data ? data[meta.amtCol] : null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 700 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 460, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 701, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${meta?.color || 'var(--gold)'}0d` }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${meta?.color || 'var(--gold)'}22`, border: `1px solid ${meta?.color || 'var(--gold)'}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-icons" style={{ color: meta?.color || 'var(--gold)', fontSize: 20 }}>{meta?.icon || 'receipt_long'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{meta?.label || 'Transaction'}</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>{code}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0 }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 18 }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 32 }}>Loading…</div>}
          {err     && <div style={{ textAlign: 'center', color: 'var(--red)',      padding: 32 }}>{err}</div>}
          {data    && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Title */}
              <Field label="Title / Reference" value={data.title || data.req_number || data.po_number || data.grn_number || data.invoice_number || data.voucher_number || data.mr_number || data.job_number || data.pick_no || data.session_no} />

              {/* Status badge */}
              {data.status && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Status</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: '3px 12px', borderRadius: 10, border: `1px solid ${statusColor}44` }}>
                    {data.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              )}

              {/* Amount (if applicable) */}
              {amtValue != null && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>Amount</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>
                    USD {Number(amtValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}

              {/* Info fields */}
              <Field label="Supplier / Vendor"  value={data.supplier_name} />
              <Field label="Requested By"        value={data.requester_name} />
              <Field label="Department"          value={data.department} />
              <Field label="Days Requested"      value={data.days_requested} />
              <Field label="Period"              value={data.start_date ? `${data.start_date} → ${data.end_date}` : null} />
              <Field label="Notes"               value={data.notes} />

              {/* Created date */}
              {data.created_at && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Created {new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleCopy}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: 'var(--text-mid)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          {meta && (
            <button onClick={handleNavigate}
              style={{ background: meta.color, border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
              View in {meta.label.split(' ')[0]}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default function TxnCodeMessage({ body }) {
  const [activeCode, setActiveCode] = useState(null)
  if (!body) return null

  // Normalise: replace [CODE] bracket format with bare CODE for uniform matching
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
          const meta   = MODULE_META[prefix]
          return (
            <button key={i} onClick={() => setActiveCode(p.content)}
              style={{
                background:   `${meta?.color || 'var(--gold)'}18`,
                border:       `1px solid ${meta?.color || 'var(--gold)'}44`,
                borderRadius: 8, padding: '2px 10px', cursor: 'pointer',
                color:        meta?.color || 'var(--gold)',
                fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700,
                margin: '0 2px', display: 'inline-flex', alignItems: 'center', gap: 5,
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
