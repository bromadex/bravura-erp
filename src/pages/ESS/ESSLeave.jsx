// src/pages/ESS/ESSLeave.jsx
// Employee self-service leave page — balances, apply, history, team calendar.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useHR } from '../../contexts/HRContext'

const today    = new Date().toISOString().split('T')[0]
const thisYear = new Date().getFullYear()

function pad(n) { return String(n).padStart(2, '0') }

function diffDays(from, to) {
  if (!from || !to) return 0
  const a = new Date(from)
  const b = new Date(to)
  return Math.max(0, Math.round((b - a) / 86400000) + 1)
}

const HISTORY_TABS = [
  { id: 'pending',  label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all',      label: 'All' },
]

export default function ESSLeave() {
  const { user }     = useAuth()
  const navigate     = useNavigate()
  const { leaveTypes } = useHR()

  const [employeeId, setEmployeeId] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // ── Data ─────────────────────────────────────────────────────
  const [balances,    setBalances]    = useState([])
  const [myRequests,  setMyRequests]  = useState([])
  const [teamLeave,   setTeamLeave]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [histTab,     setHistTab]     = useState('all')

  // ── Apply form ────────────────────────────────────────────────
  const [form, setForm] = useState({
    leave_type_id: '', from_date: today, to_date: today,
    half_day: false, reason: '',
  })
  const [submitting,   setSubmitting]   = useState(false)
  const [balanceWarn,  setBalanceWarn]  = useState(null)

  // ── Resolve employee ──────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    supabase.from('app_users').select('employee_id').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.employee_id) setEmployeeId(data.employee_id)
        else toast.error('Account not linked to employee record')
      })
      .finally(() => setLoadingUser(false))
  }, [user])

  // ── Fetch data ────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const [balRes, reqRes, teamRes] = await Promise.allSettled([
        supabase.from('leave_balances')
          .select('*, leave_types(name, color)')
          .eq('employee_id', employeeId)
          .eq('year', thisYear),

        supabase.from('leave_requests')
          .select('*, leave_types(name, color)')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false }),

        // Team leave this month
        supabase.from('leave_requests')
          .select('*, employees(name), leave_types(name, color)')
          .eq('status', 'approved')
          .gte('start_date', `${thisYear}-${pad(new Date().getMonth() + 1)}-01`)
          .lte('start_date', `${thisYear}-${pad(new Date().getMonth() + 1)}-31`)
          .neq('employee_id', employeeId),
      ])

      if (balRes.status  === 'fulfilled' && !balRes.value.error)  setBalances(balRes.value.data || [])
      if (reqRes.status  === 'fulfilled' && !reqRes.value.error)  setMyRequests(reqRes.value.data || [])
      if (teamRes.status === 'fulfilled' && !teamRes.value.error) setTeamLeave(teamRes.value.data || [])
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [employeeId])

  useEffect(() => { if (!loadingUser && employeeId) fetchAll() }, [fetchAll, loadingUser, employeeId])

  // ── Balance warning when leave type / dates change ────────────
  useEffect(() => {
    if (!form.leave_type_id) { setBalanceWarn(null); return }
    const bal = balances.find(b => b.leave_type_id === form.leave_type_id)
    if (!bal) { setBalanceWarn(null); return }
    const days = form.half_day ? 0.5 : diffDays(form.from_date, form.to_date)
    const remaining = (bal.total_days || 0) - (bal.used_days || 0)
    if (days > remaining) {
      setBalanceWarn(`Insufficient balance — requesting ${days} day(s), only ${remaining} remaining.`)
    } else {
      setBalanceWarn(null)
    }
  }, [form.leave_type_id, form.from_date, form.to_date, form.half_day, balances])

  // ── Submit leave request ──────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.leave_type_id)     return toast.error('Select a leave type')
    if (!form.from_date)         return toast.error('Start date is required')
    if (!form.to_date)           return toast.error('End date is required')
    if (new Date(form.to_date) < new Date(form.from_date))
      return toast.error('End date must be after start date')

    const days = form.half_day ? 0.5 : diffDays(form.from_date, form.to_date)
    if (days <= 0) return toast.error('Invalid date range')

    if (balanceWarn) {
      const proceed = window.confirm(`${balanceWarn}\n\nSubmit anyway?`)
      if (!proceed) return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('leave_requests').insert([{
        id:             crypto.randomUUID(),
        employee_id:    employeeId,
        leave_type_id:  form.leave_type_id,
        start_date:     form.from_date,
        end_date:       form.to_date,
        is_half_day:    form.half_day,
        total_leave_days: days,
        reason:         form.reason,
        status:         'pending_supervisor',
        created_at:     new Date().toISOString(),
      }])
      if (error) throw error

      toast.success(`Leave request submitted for ${days} day(s)`)
      setForm({ leave_type_id: '', from_date: today, to_date: today, half_day: false, reason: '' })
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  // ── Cancel request ────────────────────────────────────────────
  const cancelRequest = async (id) => {
    if (!window.confirm('Cancel this leave request?')) return
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
      toast.success('Request cancelled')
      fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // ── Filtered history ──────────────────────────────────────────
  const filteredRequests = histTab === 'all'
    ? myRequests
    : myRequests.filter(r => {
        if (histTab === 'pending')  return ['pending_supervisor', 'pending_hr', 'draft'].includes(r.status)
        if (histTab === 'approved') return r.status === 'approved'
        if (histTab === 'rejected') return r.status === 'rejected'
        return true
      })

  if (loadingUser) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
  if (!employeeId) return <div style={{ textAlign: 'center', padding: 60 }}><div style={{ fontWeight: 700 }}>Account not linked to an employee record.</div></div>

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>My Leave</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>Check balances, apply for leave, and view your history.</p>
      </div>

      {/* ── Section 1: Leave Balances ─────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Leave Balances — {thisYear}</div>
        {balances.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No leave balances for this year.</div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {balances.map(lb => {
              const total     = lb.total_days || 0
              const used      = lb.used_days  || 0
              const remaining = Math.max(0, total - used)
              const pct       = total > 0 ? Math.min(100, (used / total) * 100) : 0
              return (
                <div key={lb.id}
                  style={{ minWidth: 140, padding: 14, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    {lb.leave_types?.color && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: lb.leave_types.color, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{lb.leave_types?.name}</span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{remaining}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>of {total} days</div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{used} used</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: Apply Form ─────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>add_circle</span>
          Apply for Leave
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Leave Type *</label>
              <select className="form-control" value={form.leave_type_id}
                onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}>
                <option value="">Select…</option>
                {leaveTypes.filter(lt => lt.is_active).map(lt => (
                  <option key={lt.id} value={lt.id}>{lt.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>From Date *</label>
              <input type="date" className="form-control" value={form.from_date}
                onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>To Date *</label>
              <input type="date" className="form-control" value={form.to_date}
                onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.half_day}
                  onChange={e => setForm(f => ({ ...f, half_day: e.target.checked }))} />
                Half Day
              </label>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Reason</label>
            <textarea className="form-control" rows={2} value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Optional reason…" />
          </div>

          {/* Balance summary & warning */}
          {form.leave_type_id && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              {(() => {
                const days = form.half_day ? 0.5 : diffDays(form.from_date, form.to_date)
                return (
                  <span style={{ color: 'var(--text-dim)' }}>Requesting <strong>{days}</strong> day(s)</span>
                )
              })()}
            </div>
          )}
          {balanceWarn && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(239,83,80,.1)', borderRadius: 6, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(239,83,80,.2)' }}>
              ⚠️ {balanceWarn}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Apply for Leave'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Section 3: My Leave History ──────────────────────── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>My Leave History</div>

        {/* History tabs */}
        <div className="tab-nav" style={{ marginBottom: 14 }}>
          {HISTORY_TABS.map(t => (
            <button key={t.id} className={`tab-btn${histTab === t.id ? ' active' : ''}`}
              onClick={() => setHistTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>Loading…</div>
        ) : filteredRequests.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            No {histTab === 'all' ? '' : histTab} leave requests found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Type', 'Dates', 'Days', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map(req => (
                <tr key={req.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {req.leave_types?.color && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: req.leave_types.color }} />
                      )}
                      {req.leave_types?.name || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px', fontSize: 12 }}>
                    {req.start_date}
                    {req.start_date !== req.end_date ? ` → ${req.end_date}` : ''}
                    {req.is_half_day && <span className="badge badge-yellow" style={{ fontSize: 9, marginLeft: 4 }}>½</span>}
                  </td>
                  <td style={{ padding: '8px 8px', fontWeight: 700 }}>{req.total_leave_days ?? '—'}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <span className={`badge ${
                      req.status === 'approved' ? 'badge-green' :
                      req.status === 'rejected' ? 'badge-red' :
                      req.status === 'cancelled' ? 'badge-dim' :
                      'badge-yellow'
                    }`} style={{ fontSize: 10 }}>
                      {(req.status || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '8px 8px' }}>
                    {['pending_supervisor', 'pending_hr', 'draft'].includes(req.status) && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancelRequest(req.id)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>cancel</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Section 4: Team Leave Calendar ───────────────────── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>group</span>
          Team Leave This Month
        </div>
        {teamLeave.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No approved team leave this month.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {teamLeave.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{req.employees?.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {req.start_date}{req.start_date !== req.end_date ? ` → ${req.end_date}` : ''}
                    {req.leave_types?.name && ` · ${req.leave_types.name}`}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{req.total_leave_days ?? '—'} day(s)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
