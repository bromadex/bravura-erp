// src/pages/Reports/Drafts.jsx — Pending / draft items across modules
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'

const PRIORITY_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--text-dim)' }

function DraftSection({ title, icon, color, items, onNavigate, renderItem }) {
  const [open, setOpen] = useState(true)
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `2px solid ${color}`, cursor: 'pointer', marginBottom: 2 }}
        onClick={() => setOpen(o => !o)}>
        <span className="material-icons" style={{ fontSize: 18, color }}>{icon}</span>
        <div style={{ fontWeight: 700, fontSize: 13, color, flex: 1 }}>{title}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>{items.length}</div>
        <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>{open ? 'expand_less' : 'expand_more'}</span>
      </div>
      {open && items.map((item, i) => renderItem(item, i))}
    </div>
  )
}

function DraftRow({ left, right, sub, badge, badgeColor, onClick }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', borderRadius: 6 }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--surface2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{left}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
      </div>
      {badge && (
        <span style={{ padding: '2px 8px', borderRadius: 20, background: `${badgeColor || 'var(--blue)'}18`, border: `1px solid ${badgeColor || 'var(--blue)'}44`, color: badgeColor || 'var(--blue)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 12 }}>
          {badge}
        </span>
      )}
      {right && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', marginLeft: 12, whiteSpace: 'nowrap' }}>{right}</div>}
    </div>
  )
}

export default function Drafts() {
  const navigate = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [poR, srR, prR, leaveR, travelR, stockR, annR] = await Promise.all([
          // Open Purchase Orders
          supabase.from('purchase_orders').select('id, po_number, status, total_amount, created_at')
            .in('status', ['Pending', 'Approved']).order('created_at', { ascending: false }).limit(50),

          // Store Requisitions awaiting approval
          supabase.from('store_requisitions').select('id, req_number, status, requested_by, created_at')
            .in('status', ['Pending', 'Partial']).order('created_at', { ascending: false }).limit(50),

          // Purchase Requisitions pending
          supabase.from('purchase_requisitions').select('id, pr_number, status, requested_by, created_at')
            .eq('status', 'Pending').order('created_at', { ascending: false }).limit(50),

          // Leave requests pending approval
          supabase.from('leave_requests').select('id, employee_id, leave_type, start_date, end_date, status, created_at')
            .eq('status', 'Pending').order('created_at', { ascending: false }).limit(50),

          // Travel requests pending
          supabase.from('travel_requests').select('id, destination, purpose, status, employee_id, created_at')
            .eq('status', 'Pending').order('created_at', { ascending: false }).limit(50),

          // Low-stock items
          supabase.from('items').select('id, name, code, quantity, reorder_point, unit')
            .eq('is_active', true).filter('quantity', 'lte', 'reorder_point').limit(50),

          // Unread high-priority announcements (from governance_documents)
          supabase.from('governance_documents').select('id, title, priority, created_at')
            .eq('doc_type', 'announcement').eq('priority', 'high')
            .order('created_at', { ascending: false }).limit(20),
        ])

        setData({
          openPOs:    poR.data    || [],
          pendingSRs: srR.data    || [],
          pendingPRs: prR.data    || [],
          pendingLeave:  leaveR.data  || [],
          pendingTravel: travelR.data || [],
          lowStock:   stockR.data || [],
          urgentAnn:  annR.data   || [],
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading pending items…</div>
  if (!data)   return null

  const totalPending = data.openPOs.length + data.pendingSRs.length + data.pendingPRs.length +
    data.pendingLeave.length + data.pendingTravel.length + data.lowStock.length + data.urgentAnn.length

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Pending & Drafts</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {totalPending} item{totalPending !== 1 ? 's' : ''} requiring attention across modules
        </div>
      </div>

      {totalPending === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 64, opacity: 0.3, color: 'var(--green)' }}>task_alt</span>
          <p style={{ fontWeight: 700, marginTop: 12 }}>All clear!</p>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No pending items across any module.</p>
        </div>
      ) : (
        <div style={{ maxWidth: 780 }}>
          <DraftSection title="Urgent Announcements" icon="campaign" color="var(--red)"
            items={data.urgentAnn}
            renderItem={(a, i) => (
              <DraftRow key={a.id}
                left={a.title}
                sub={new Date(a.created_at).toLocaleDateString()}
                badge="HIGH PRIORITY" badgeColor="var(--red)"
                onClick={() => navigate('/module/governance/announcements')} />
            )} />

          <DraftSection title="Low Stock Items" icon="warning" color="var(--yellow)"
            items={data.lowStock}
            renderItem={(s, i) => (
              <DraftRow key={s.id}
                left={s.name}
                sub={`Code: ${s.code || '—'}`}
                right={`${s.quantity} ${s.unit || ''} left`}
                badge="LOW STOCK" badgeColor="var(--yellow)"
                onClick={() => navigate('/module/inventory/stock-balance')} />
            )} />

          <DraftSection title="Pending Leave Requests" icon="event_busy" color="var(--green)"
            items={data.pendingLeave}
            renderItem={(l, i) => (
              <DraftRow key={l.id}
                left={`${l.leave_type} — ${l.start_date} to ${l.end_date}`}
                sub={`Employee: ${l.employee_id}`}
                badge="Pending" badgeColor="var(--blue)"
                onClick={() => navigate('/module/hr/leave')} />
            )} />

          <DraftSection title="Pending Travel Requests" icon="flight" color="var(--blue)"
            items={data.pendingTravel}
            renderItem={(t, i) => (
              <DraftRow key={t.id}
                left={t.destination || 'Travel Request'}
                sub={t.purpose || ''}
                badge="Pending" badgeColor="var(--blue)"
                onClick={() => navigate('/module/hr/travel')} />
            )} />

          <DraftSection title="Open Purchase Orders" icon="shopping_cart" color="var(--purple)"
            items={data.openPOs}
            renderItem={(p, i) => (
              <DraftRow key={p.id}
                left={p.po_number || p.id.slice(0, 8)}
                sub={new Date(p.created_at).toLocaleDateString()}
                right={p.total_amount ? `$${Number(p.total_amount).toFixed(2)}` : ''}
                badge={p.status} badgeColor="var(--purple)"
                onClick={() => navigate('/module/procurement/purchase-orders')} />
            )} />

          <DraftSection title="Pending Store Requisitions" icon="store" color="var(--purple)"
            items={data.pendingSRs}
            renderItem={(r, i) => (
              <DraftRow key={r.id}
                left={r.req_number || r.id.slice(0, 8)}
                sub={`By: ${r.requested_by || '—'} · ${new Date(r.created_at).toLocaleDateString()}`}
                badge={r.status} badgeColor="var(--purple)"
                onClick={() => navigate('/module/procurement/store-requisitions')} />
            )} />

          <DraftSection title="Pending Purchase Requisitions" icon="request_quote" color="var(--purple)"
            items={data.pendingPRs}
            renderItem={(r, i) => (
              <DraftRow key={r.id}
                left={r.pr_number || r.id.slice(0, 8)}
                sub={`By: ${r.requested_by || '—'} · ${new Date(r.created_at).toLocaleDateString()}`}
                badge="Pending" badgeColor="var(--purple)"
                onClick={() => navigate('/module/procurement/purchase-requisitions')} />
            )} />
        </div>
      )}
    </div>
  )
}
