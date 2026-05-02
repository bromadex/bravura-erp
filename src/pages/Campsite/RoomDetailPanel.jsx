// src/pages/Campsite/RoomDetailPanel.jsx
//
// Right-side panel showing full room details and active/past assignments.
// Opens when a room tile is clicked in CampOverview.

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import TransferRoomModal from './TransferRoomModal'
import toast from 'react-hot-toast'

export default function RoomDetailPanel({ roomId, onClose }) {
  const { user }  = useAuth()
  const { rooms, blocks, assignments, getRoomStatus, STATUS_COLOR, STATUS_LABEL, flagMaintenance, vacateRoom } = useCampsite()

  const room  = rooms.find(r => r.id === roomId)
  const block = room ? blocks.find(b => b.id === room.block_id) : null

  const activeAssignments = assignments.filter(a =>
    a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred'
  )
  const pastAssignments = assignments.filter(a =>
    a.room_id === roomId && (a.status === 'checked_out' || a.status === 'transferred')
  ).slice(0, 10)

  const status = room ? getRoomStatus(roomId) : 'unknown'
  const color  = STATUS_COLOR[status]

  const [maintNotes,   setMaintNotes]   = useState(room?.maintenance_notes || '')
  const [savingMaint,  setSavingMaint]  = useState(false)
  const [vacating,     setVacating]     = useState(null)
  const [vacateNotes,  setVacateNotes]  = useState('')
  const [transferring, setTransferring] = useState(null)

  if (!room) return null

  const handleToggleMaintenance = async () => {
    setSavingMaint(true)
    try {
      await flagMaintenance(roomId, !room.is_maintenance, maintNotes)
      toast.success(room.is_maintenance ? 'Room cleared from maintenance' : 'Room flagged for maintenance')
    } catch (err) {
      toast.error(err.message)
    } finally { setSavingMaint(false) }
  }

  const handleVacate = async (assignmentId) => {
    try {
      const code = await vacateRoom({ assignmentId, checkOutNotes: vacateNotes, processedBy: user?.full_name })
      toast.success(`Vacated — ${code}`)
      setVacating(null)
      setVacateNotes('')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480, background: 'var(--surface)', borderLeft: '1px solid var(--border2)', zIndex: 301, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}20`, border: `2px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons" style={{ color, fontSize: 22 }}>bed</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--mono)' }}>{room.code}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {block?.name} · {room.type || 'Standard'} · Capacity: {room.capacity || 1}
            </div>
          </div>
          <span style={{ padding: '4px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: 11, fontWeight: 700 }}>
            {STATUS_LABEL[status]}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Active occupants */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              Current Occupants ({activeAssignments.length})
            </div>
            {activeAssignments.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Room is vacant</div>
            ) : activeAssignments.map(a => (
              <div key={a.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a', flexShrink: 0 }}>
                    {(a.employees?.full_name || '?').charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.employees?.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.employees?.bra_number} · Since {a.start_date}</div>
                  </div>
                  {a.txn_code && <TxnCodeBadge code={a.txn_code} />}
                  <span style={{ fontSize: 10, color: a.status === 'on_leave' ? 'var(--yellow)' : 'var(--green)', background: a.status === 'on_leave' ? 'rgba(251,191,36,.1)' : 'rgba(52,211,153,.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                    {a.status === 'on_leave' ? 'On Leave' : 'Active'}
                  </span>
                </div>

                {vacating === a.id ? (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text"
                      value={vacateNotes}
                      onChange={e => setVacateNotes(e.target.value)}
                      placeholder="Check-out notes (optional)"
                      style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-danger btn-sm" onClick={() => handleVacate(a.id)}>Confirm Vacate</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setVacating(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setTransferring(a)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>swap_horiz</span> Transfer
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setVacating(a.id)}>
                      <span className="material-icons" style={{ fontSize: 13 }}>logout</span> Vacate
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Maintenance toggle */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 16, color: 'var(--yellow)' }}>build</span>
              Maintenance
            </div>
            <textarea
              value={maintNotes}
              onChange={e => setMaintNotes(e.target.value)}
              placeholder="Maintenance notes…"
              rows={2}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
            />
            <button
              className={`btn btn-sm ${room.is_maintenance ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleToggleMaintenance}
              disabled={savingMaint}
            >
              <span className="material-icons" style={{ fontSize: 14 }}>{room.is_maintenance ? 'check_circle' : 'warning'}</span>
              {room.is_maintenance ? 'Clear Maintenance Flag' : 'Flag for Maintenance'}
            </button>
          </div>

          {/* Past assignments */}
          {pastAssignments.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
                History
              </div>
              {pastAssignments.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span className="material-icons" style={{ fontSize: 15, color: 'var(--text-dim)' }}>person</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{a.employees?.full_name}</span>
                    <span style={{ color: 'var(--text-dim)' }}> · {a.start_date} → {a.end_date || '—'}</span>
                  </div>
                  {a.txn_code && <TxnCodeBadge code={a.txn_code} />}
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 8 }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {transferring && (
        <TransferRoomModal
          assignment={transferring}
          onClose={() => setTransferring(null)}
        />
      )}
    </>
  )
}
