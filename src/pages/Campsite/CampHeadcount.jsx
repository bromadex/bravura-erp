// src/pages/Campsite/CampHeadcount.jsx — Daily camp headcount log
import { useState } from 'react'
import { useLogistics } from '../../contexts/LogisticsContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

const TODAY = new Date().toISOString().split('T')[0]
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function CampHeadcount() {
  const { headcounts, setHeadcount, loading } = useLogistics()
  const { user }  = useAuth()
  const canEdit   = useCanEdit('campsite', 'headcount')

  const [form, setForm] = useState({ count: '', date: TODAY, notes: '' })

  const todayHC  = headcounts.find(h => h.date === TODAY)?.count || 0
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const yestHC   = headcounts.find(h => h.date === yesterday)?.count || 0

  const last7 = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] })()
  const recent = headcounts.filter(h => h.date >= last7)
  const avgHC  = recent.length > 0 ? Math.round(recent.reduce((s, h) => s + h.count, 0) / recent.length) : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.count) return toast.error('Enter headcount')
    try {
      await setHeadcount(form.date, parseInt(form.count), form.notes, user?.full_name || user?.username || '')
      toast.success(form.date === TODAY ? 'Headcount recorded' : 'Headcount updated')
      setForm({ count: '', date: TODAY, notes: '' })
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Camp Headcount</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Daily occupant count log</div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Today',    value: todayHC || '—', color: todayHC > 0 ? 'var(--teal)' : 'var(--text-dim)' },
          { label: 'Yesterday', value: yestHC || '—',  color: yestHC > 0  ? 'var(--blue)'  : 'var(--text-dim)' },
          { label: '7-Day Avg', value: avgHC  || '—',  color: avgHC  > 0  ? 'var(--green)' : 'var(--text-dim)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Quick entry */}
      {canEdit && (
        <form onSubmit={handleSubmit} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--teal)' }}>edit_note</span>
            Record Headcount
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input type="date" className="form-control" style={{ width: 150 }} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Count *</label>
              <input type="number" min="0" required className="form-control" style={{ width: 120 }}
                placeholder="Enter count" value={form.count}
                onChange={e => setForm(f => ({ ...f, count: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
              <label className="form-label">Notes</label>
              <input className="form-control" placeholder="Optional notes…" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary">
              {headcounts.find(h => h.date === form.date) ? 'Update' : 'Record'}
            </button>
          </div>
        </form>
      )}

      {/* History table */}
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Headcount</th>
                <th>Change</th>
                <th>Notes</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : headcounts.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>No headcount records yet</td></tr>
              ) : headcounts.map((h, idx) => {
                const prev    = headcounts[idx + 1]
                const delta   = prev ? h.count - prev.count : null
                const isToday = h.date === TODAY
                const dayName = DAY_NAMES[new Date(h.date + 'T00:00:00').getDay()]
                return (
                  <tr key={h.id} style={{ background: isToday ? 'rgba(251,191,36,.04)' : 'transparent' }}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: isToday ? 700 : 400 }}>
                      {h.date}
                      {isToday && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 20, background: 'rgba(251,191,36,.15)', border: '1px solid rgba(251,191,36,.3)', color: 'var(--yellow)', fontSize: 10, fontWeight: 700 }}>Today</span>}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{dayName}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 17, color: 'var(--teal)' }}>{h.count}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: delta === null ? 'var(--text-dim)' : delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                      {delta === null ? '—' : delta > 0 ? `+${delta}` : delta === 0 ? '0' : delta}
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{h.notes || '—'}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{h.recorded_by || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
