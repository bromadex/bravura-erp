// src/pages/Campsite/CampAssignments.jsx — Full assignment list with transfer/vacate

import { useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import TransferRoomModal from './TransferRoomModal'
import toast from 'react-hot-toast'

export default function CampAssignments() {
  const { user } = useAuth()
  const { assignments, rooms, blocks, loading, vacateRoom, transferRoom } = useCampsite()

  const [search,   setSearch]   = useState('')
  const [fStatus,  setFStatus]  = useState('active')
  const [vacating,    setVacating]    = useState(null)
  const [vacNotes,    setVacNotes]    = useState('')
  const [transferring, setTransferring] = useState(null)
  const [saving,      setSaving]      = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return assignments.filter(a => {
      if (fStatus !== 'all' && a.status !== fStatus) return false
      if (q) {
        const name = a.employees?.name?.toLowerCase() || ''
        const bra  = a.employees?.employee_number?.toLowerCase() || ''
        const code = a.txn_code?.toLowerCase() || ''
        const room = rooms.find(r => r.id === a.room_id)
        const rCode= room?.code?.toLowerCase() || ''
        if (!name.includes(q) && !bra.includes(q) && !code.includes(q) && !rCode.includes(q)) return false
      }
      return true
    })
  }, [assignments, rooms, search, fStatus])

  const getRoomCode = (roomId) => rooms.find(r => r.id === roomId)?.code || '—'
  const getBlockName = (roomId) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return '—'
    return blocks.find(b => b.id === room.block_id)?.name || '—'
  }

  const handleVacate = async () => {
    if (!vacating) return
    setSaving(true)
    try {
      const code = await vacateRoom({ assignmentId: vacating.id, checkOutNotes: vacNotes, processedBy: user?.name })
      toast.success(`Vacated — ${code}`)
      setVacating(null)
      setVacNotes('')
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const STATUS_STYLE = {
    active:       { bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.3)',  color: 'var(--green)'    },
    on_leave:     { bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  color: 'var(--yellow)'   },
    checked_out:  { bg: 'rgba(100,116,139,.1)', border: 'rgba(100,116,139,.3)', color: 'var(--text-dim)' },
    transferred:  { bg: 'rgba(96,165,250,.1)',  border: 'rgba(96,165,250,.3)',  color: 'var(--blue)'     },
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Assignments</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{assignments.filter(a => a.status === 'active').length} active</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, BRA#, room, code…"
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, width: 220 }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="checked_out">Checked Out</option>
          <option value="transferred">Transferred</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee</th>
              <th>Room</th>
              <th>Block</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No assignments found</td></tr>
            ) : filtered.map(a => {
              const s = STATUS_STYLE[a.status] || STATUS_STYLE.active
              return (
                <tr key={a.id}>
                  <td>{a.txn_code ? <TxnCodeBadge code={a.txn_code} /> : '—'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.employees?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.employees?.employee_number}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{getRoomCode(a.room_id)}</td>
                  <td>{getBlockName(a.room_id)}</td>
                  <td style={{ fontSize: 12 }}>{a.start_date || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.end_date || '—'}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                      {a.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {(a.status === 'active' || a.status === 'on_leave') && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setTransferring(a)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>swap_horiz</span> Transfer
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => { setVacating(a); setVacNotes('') }}>
                          <span className="material-icons" style={{ fontSize: 13 }}>logout</span> Vacate
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Transfer modal */}
      {transferring && (
        <TransferRoomModal
          assignment={transferring}
          onClose={() => setTransferring(null)}
        />
      )}

      {/* Vacate confirmation */}
      {vacating && (
        <>
          <div onClick={() => setVacating(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Confirm Vacate</div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
              Checking out <strong style={{ color: 'var(--text)' }}>{vacating.employees?.name}</strong> from room <strong style={{ color: 'var(--gold)' }}>{getRoomCode(vacating.room_id)}</strong>.
            </p>
            <textarea value={vacNotes} onChange={e => setVacNotes(e.target.value)} placeholder="Check-out notes (optional)" rows={2}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', marginBottom: 12, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setVacating(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleVacate} disabled={saving}>{saving ? 'Processing…' : 'Confirm Vacate'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
