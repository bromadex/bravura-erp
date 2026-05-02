// src/components/QuickActionModal.jsx
//
// Right-panel overlay that shows any record by its transaction code.
// Opens from: TxnCodeBadge clicks, global search results, notification deep-links.
// Fetches from each relevant table based on the code prefix.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PREFIX_TABLE_MAP = {
  SR: { table: 'store_requisitions',   label: 'Store Requisition'   },
  PR: { table: 'purchase_requisitions', label: 'Purchase Requisition' },
  PO: { table: 'purchase_orders',       label: 'Purchase Order'       },
  GR: { table: 'goods_received',        label: 'Goods Received'       },
  LV: { table: 'leave_requests',        label: 'Leave Request'        },
  FI: { table: 'fuel_log',              label: 'Fuel Issuance'        },
  TR: { table: 'travel_requests',       label: 'Travel Request'       },
  PY: { table: 'payroll_runs',          label: 'Payroll Run'          },
  FT: { table: 'asset_issues',          label: 'Asset Fault'          },
  MO: { table: 'memos',                 label: 'Memo'                 },
  AT: { table: 'employee_attendance',   label: 'Attendance Record'    },
  CA: { table: 'room_assignments',      label: 'Room Assignment'      },
  CT: { table: 'room_transfers',        label: 'Room Transfer'        },
  CV: { table: 'room_vacates',          label: 'Room Vacate'          },
  CM: { table: 'room_maintenance',      label: 'Maintenance Flag'     },
  PI: { table: 'ppe_issuances',         label: 'PPE Issuance'         },
}

const STATUS_COLORS = {
  draft:      'var(--text-dim)',
  pending:    'var(--yellow)',
  submitted:  'var(--yellow)',
  approved:   'var(--green)',
  rejected:   'var(--red)',
  fulfilled:  'var(--teal)',
  active:     'var(--green)',
  closed:     'var(--text-dim)',
  confirmed:  'var(--green)',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status?.toLowerCase()] || 'var(--text-dim)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
      {status || '—'}
    </span>
  )
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-word' }}>{String(value)}</div>
    </div>
  )
}

function TimelineStrip({ timeline }) {
  if (!timeline?.length) return (
    <div style={{ padding: '16px 0', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>No history yet</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {timeline.map((entry, i) => (
        <div key={entry.id || i} style={{ display: 'flex', gap: 12, paddingBottom: 16, position: 'relative' }}>
          {/* Vertical line */}
          {i < timeline.length - 1 && (
            <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 2, background: 'var(--border)' }} />
          )}
          {/* Dot */}
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
            <span className="material-icons" style={{ fontSize: 13, color: 'var(--gold)' }}>circle</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{entry.action}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {entry.by_name} · {new Date(entry.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            {entry.comment && (
              <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4, fontStyle: 'italic' }}>"{entry.comment}"</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function QuickActionModal({ code, onClose }) {
  const [record,   setRecord]   = useState(null)
  const [timeline, setTimeline] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const panelRef = useRef(null)

  const prefix = code?.split('-')[0]
  const meta   = PREFIX_TABLE_MAP[prefix]

  useEffect(() => {
    if (!code || !meta) { setLoading(false); return }

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [recRes, tlRes] = await Promise.all([
          supabase.from(meta.table).select('*').eq('txn_code', code).maybeSingle(),
          supabase.from('txn_timeline').select('*').eq('record_id', code).order('timestamp', { ascending: true }),
        ])
        if (recRes.error) throw recRes.error
        setRecord(recRes.data)
        setTimeline(tlRes.data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [code])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Render record fields dynamically, skipping internal IDs and timestamps
  const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'txn_code'])
  const displayFields = record
    ? Object.entries(record).filter(([k]) => !SKIP_FIELDS.has(k))
    : []

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 600, background: 'var(--surface)', borderLeft: '1px solid var(--border2)', zIndex: 401, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              {meta?.label || 'Record'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{code}</div>
          </div>
          {record?.status && <StatusBadge status={record.status} />}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 36, display: 'block', opacity: 0.4, marginBottom: 8 }}>hourglass_empty</span>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 20, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
              Error: {error}
            </div>
          )}

          {!loading && !error && !meta && (
            <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
              Unknown code prefix "{prefix}". Cannot resolve this record.
            </div>
          )}

          {!loading && !error && meta && !record && (
            <div style={{ padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>
              No record found for <strong style={{ color: 'var(--gold)' }}>{code}</strong>.
            </div>
          )}

          {!loading && !error && record && (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Details</div>
                {displayFields.map(([key, val]) => (
                  <Field
                    key={key}
                    label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    value={Array.isArray(val) ? JSON.stringify(val) : val}
                  />
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>History</div>
                <TimelineStrip timeline={timeline} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
