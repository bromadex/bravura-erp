// src/pages/Settings/EmailLogs.jsx
//
// View email delivery history. Filter by status / event_type. Retry failed sends.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, Spinner, ModalDialog, ModalActions } from '../../components/ui'
import { sendEmail } from '../../engine/emailEngine'

const STATUS_COLORS = {
  pending: 'var(--yellow)', sent: 'var(--green)', failed: 'var(--red)', bounced: 'var(--orange)',
}

export default function EmailLogs() {
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('ALL')
  const [search,   setSearch]   = useState('')
  const [viewing,  setViewing]  = useState(null)
  const [retrying, setRetrying] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) toast.error(error.message)
    setLogs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filter !== 'ALL' && l.status !== filter) return false
      if (search) {
        const q = search.toLowerCase()
        return (l.to_email || '').toLowerCase().includes(q)
          || (l.subject || '').toLowerCase().includes(q)
          || (l.event_type || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [logs, filter, search])

  const retry = async (l) => {
    setRetrying(l.id)
    try {
      const res = await sendEmail({
        to: l.to_email, toName: l.to_name,
        cc: l.cc_emails, subject: l.subject,
        html: l.body_html, text: l.body_text,
        eventType: l.event_type, templateId: l.template_id,
        relatedEntityType: l.related_entity_type, relatedEntityId: l.related_entity_id,
      })
      if (res.ok) toast.success('Email resent')
      else toast.error(res.error || 'Retry failed')
      await load()
    } catch (err) { toast.error(err.message) }
    finally { setRetrying(null) }
  }

  if (loading) return <div><PageHeader title="Email Logs" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  const counts = {
    total:   logs.length,
    sent:    logs.filter(l => l.status === 'sent').length,
    pending: logs.filter(l => l.status === 'pending').length,
    failed:  logs.filter(l => l.status === 'failed').length,
  }

  return (
    <div>
      <PageHeader title="Email Logs" subtitle="Email delivery history and retry queue">
        <button className="btn btn-secondary" onClick={load}>
          <span className="material-icons">refresh</span> Refresh
        </button>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { k: 'total',   label: 'Total Emails', color: 'var(--blue)'   },
          { k: 'sent',    label: 'Delivered',    color: 'var(--green)'  },
          { k: 'pending', label: 'Pending',      color: 'var(--yellow)' },
          { k: 'failed',  label: 'Failed',       color: 'var(--red)'    },
        ].map(s => (
          <div key={s.k} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--mono)' }}>{counts[s.k]}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by recipient, subject, event…" style={{ maxWidth: 320 }} />
        <select className="form-control" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="ALL">All Status</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>
      </div>

      {filtered.length === 0
        ? <EmptyState icon="mail" message="No email logs match your filters" />
        : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Time</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>To</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Subject</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Event</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const sc = STATUS_COLORS[l.status] || 'var(--text-dim)'
                  return (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setViewing(l)}>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 500 }}>{l.to_email}</div>
                        {l.to_name && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{l.to_name}</div>}
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.subject || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                        {l.event_type || '—'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${sc}22`, color: sc, border: `1px solid ${sc}44`, textTransform: 'capitalize' }}>
                          {l.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {(l.status === 'failed' || l.status === 'pending') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => retry(l)} disabled={retrying === l.id}>
                            <span className="material-icons" style={{ fontSize: 13 }}>refresh</span>
                            {retrying === l.id ? '…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      <ModalDialog open={viewing !== null} onClose={() => setViewing(null)} title="Email Detail" size="lg">
        {viewing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 6 }}>
              <div style={{ color: 'var(--text-dim)' }}>To:</div>          <div><strong>{viewing.to_email}</strong>{viewing.to_name ? ` (${viewing.to_name})` : ''}</div>
              <div style={{ color: 'var(--text-dim)' }}>From:</div>        <div>{viewing.from_email || '—'} {viewing.from_name ? `(${viewing.from_name})` : ''}</div>
              {viewing.cc_emails && (<><div style={{ color: 'var(--text-dim)' }}>CC:</div><div>{viewing.cc_emails}</div></>)}
              <div style={{ color: 'var(--text-dim)' }}>Subject:</div>     <div><strong>{viewing.subject}</strong></div>
              <div style={{ color: 'var(--text-dim)' }}>Status:</div>      <div style={{ color: STATUS_COLORS[viewing.status], fontWeight: 700, textTransform: 'capitalize' }}>{viewing.status}</div>
              <div style={{ color: 'var(--text-dim)' }}>Event Type:</div>  <div style={{ fontFamily: 'var(--mono)' }}>{viewing.event_type || '—'}</div>
              <div style={{ color: 'var(--text-dim)' }}>Provider:</div>    <div>{viewing.provider || '—'}</div>
              <div style={{ color: 'var(--text-dim)' }}>Created:</div>     <div>{new Date(viewing.created_at).toLocaleString()}</div>
              {viewing.sent_at && (<><div style={{ color: 'var(--text-dim)' }}>Sent At:</div><div>{new Date(viewing.sent_at).toLocaleString()}</div></>)}
              {viewing.provider_message_id && (<><div style={{ color: 'var(--text-dim)' }}>Message ID:</div><div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{viewing.provider_message_id}</div></>)}
            </div>

            {viewing.error_message && (
              <div style={{ background: 'var(--red)22', border: '1px solid var(--red)55', borderRadius: 8, padding: 12 }}>
                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Error</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{viewing.error_message}</div>
              </div>
            )}

            {viewing.body_html && (
              <div>
                <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>HTML Body Preview:</div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, maxHeight: 320, overflow: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: viewing.body_html }} />
              </div>
            )}
            {!viewing.body_html && viewing.body_text && (
              <div>
                <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>Text Body:</div>
                <pre style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', margin: 0 }}>{viewing.body_text}</pre>
              </div>
            )}
          </div>
        )}
        <ModalActions>
          {viewing && (viewing.status === 'failed' || viewing.status === 'pending') && (
            <button className="btn btn-secondary" onClick={() => { retry(viewing); setViewing(null) }}>
              <span className="material-icons">refresh</span> Retry
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
