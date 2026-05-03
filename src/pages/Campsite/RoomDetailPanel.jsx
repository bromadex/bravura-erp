// src/pages/Campsite/RoomDetailPanel.jsx
// Per spec Part 11: tabbed panel with Occupants, History, Maintenance
// Uses correct employee field: .name not .full_name, .employee_number not .bra_number

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import TransferRoomModal from './TransferRoomModal'
import AssignRoomModal from './AssignRoomModal'
import toast from 'react-hot-toast'

const TABS = ['Occupants', 'History', 'Maintenance']

export default function RoomDetailPanel({ roomId, onClose }) {
  const { user } = useAuth()
  const { rooms, blocks, assignments, getRoomStatus, STATUS_COLOR, STATUS_LABEL, flagMaintenance, vacateRoom } = useCampsite()

  const room  = rooms.find(r => r.id === roomId)
  const block = room ? blocks.find(b => b.id === room.block_id) : null
  if (!room) return null

  const activeAssignments = assignments.filter(a =>
    a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred'
  )
  const history = assignments
    .filter(a => a.room_id === roomId && (a.status === 'checked_out' || a.status === 'transferred'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const status   = getRoomStatus(roomId)
  const color    = STATUS_COLOR[status]
  const cap      = room.capacity || 1
  const isStore  = room.room_purpose === 'storeroom'
  const slotsLeft = cap - activeAssignments.length

  const [activeTab,    setActiveTab]    = useState('Occupants')
  const [maintNotes,   setMaintNotes]   = useState(room?.maintenance_reason || '')
  const [savingMaint,  setSavingMaint]  = useState(false)
  const [vacating,     setVacating]     = useState(null)
  const [vacateNotes,  setVacateNotes]  = useState('')
  const [savingVacate, setSavingVacate] = useState(false)
  const [transferring, setTransferring] = useState(null)
  const [showAssign,   setShowAssign]   = useState(false)

  const handleToggleMaintenance = async () => {
    setSavingMaint(true)
    try {
      await flagMaintenance(roomId, !room.is_maintenance, maintNotes)
      toast.success(room.is_maintenance ? 'Maintenance cleared' : 'Room flagged for maintenance')
    } catch (err) { toast.error(err.message) }
    finally { setSavingMaint(false) }
  }

  const handleVacate = async () => {
    setSavingVacate(true)
    try {
      const code = await vacateRoom({ assignmentId: vacating, checkOutNotes: vacateNotes, processedBy: user?.full_name || user?.username })
      toast.success(`Vacated — ${code}`)
      setVacating(null)
      setVacateNotes('')
    } catch (err) { toast.error(err.message) }
    finally { setSavingVacate(false) }
  }

  const ss = (s) => ({
    active:      { bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.3)',  color: 'var(--green)'    },
    on_leave:    { bg: 'rgba(251,191,36,.1)',   border: 'rgba(251,191,36,.3)',  color: 'var(--yellow)'   },
    checked_out: { bg: 'rgba(100,116,139,.1)',  border: 'rgba(100,116,139,.3)', color: 'var(--text-dim)' },
    transferred: { bg: 'rgba(96,165,250,.1)',   border: 'rgba(96,165,250,.3)',  color: 'var(--blue)'     },
  }[s] || { bg: 'rgba(52,211,153,.1)', border: 'rgba(52,211,153,.3)', color: 'var(--green)' })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480, background: 'var(--surface)', borderLeft: '1px solid var(--border2)', zIndex: 301, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `${color}18`, border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-icons" style={{ color, fontSize: 22 }}>
              {isStore ? 'inventory_2' : room.room_purpose === 'supervisor' ? 'person' : 'bed'}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17, fontFamily: 'var(--mono)' }}>{room.code}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {block?.name}{room.type ? ` · ${room.type}` : ''}{!isStore ? ` · Capacity ${cap}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}`, color, fontSize: 11, fontWeight: 700 }}>
              {isStore ? 'Storeroom' : STATUS_LABEL[status]}
            </span>
            {!isStore && !room.is_maintenance && slotsLeft > 0 && (
              <span style={{ fontSize: 10, color: 'var(--green)' }}>{slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} free</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', marginLeft: 8 }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '10px 4px', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--gold)' : 'transparent'}`, color: activeTab === tab ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {tab}
              {tab === 'Occupants' && activeAssignments.length > 0 && (
                <span style={{ marginLeft: 5, background: activeTab === tab ? 'var(--gold)' : 'var(--surface2)', color: activeTab === tab ? '#0b0f1a' : 'var(--text-dim)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                  {activeAssignments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* OCCUPANTS */}
          {activeTab === 'Occupants' && (
            <div>
              {isStore ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                  <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.3 }}>inventory_2</span>
                  Storeroom — no occupant assignments
                </div>
              ) : activeAssignments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                  <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.3 }}>hotel</span>
                  Room is vacant
                  {!room.is_maintenance && (
                    <div style={{ marginTop: 14 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setShowAssign(true)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>person_add</span> Assign Now
                      </button>
                    </div>
                  )}
                </div>
              ) : activeAssignments.map(a => {
                const name     = a.employees?.name || 'Unknown'
                const empNum   = a.employees?.employee_number || '—'
                const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                const style    = ss(a.status)
                return (
                  <div key={a.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a', flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{empNum} · Since {a.start_date}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, background: style.bg, border: `1px solid ${style.border}`, color: style.color, fontSize: 10, fontWeight: 700 }}>
                          {a.status === 'on_leave' ? 'On Leave' : 'Active'}
                        </span>
                        {a.txn_code && <TxnCodeBadge code={a.txn_code} />}
                      </div>
                    </div>

                    {vacating === a.id ? (
                      <div style={{ marginTop: 10 }}>
                        <input type="text" value={vacateNotes} onChange={e => setVacateNotes(e.target.value)}
                          placeholder="Check-out notes (optional)"
                          style={{ width: '100%', padding: '7px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-danger btn-sm" onClick={handleVacate} disabled={savingVacate}>
                            {savingVacate ? 'Processing…' : 'Confirm Vacate'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setVacating(null); setVacateNotes('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setTransferring(a)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>swap_horiz</span> Transfer
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setVacating(a.id)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>logout</span> Vacate
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {!isStore && !room.is_maintenance && slotsLeft > 0 && activeAssignments.length > 0 && (
                <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setShowAssign(true)}>
                  <span className="material-icons" style={{ fontSize: 14 }}>person_add</span> Assign Another Person ({slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} free)
                </button>
              )}
            </div>
          )}

          {/* HISTORY */}
          {activeTab === 'History' && (
            <div>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                  <span className="material-icons" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.3 }}>history</span>
                  No history yet
                </div>
              ) : history.map(a => {
                const name = a.employees?.name || 'Unknown'
                const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', flexShrink: 0 }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.start_date} → {a.end_date || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      {a.txn_code && <TxnCodeBadge code={a.txn_code} />}
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '1px 7px', borderRadius: 8, textTransform: 'capitalize' }}>
                        {(a.status || '').replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* MAINTENANCE */}
          {activeTab === 'Maintenance' && (
            <div>
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: room.is_maintenance ? 'rgba(251,191,36,.08)' : 'rgba(52,211,153,.06)', border: `1px solid ${room.is_maintenance ? 'rgba(251,191,36,.3)' : 'rgba(52,211,153,.2)'}`, fontSize: 12 }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: room.is_maintenance ? 'var(--yellow)' : 'var(--green)' }}>
                  {room.is_maintenance ? 'warning' : 'check_circle'}
                </span>
                {room.is_maintenance
                  ? 'This room is flagged for maintenance. No new assignments can be made until cleared.'
                  : 'Room is operational and available for assignment.'}
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>MAINTENANCE NOTES</label>
              <textarea value={maintNotes} onChange={e => setMaintNotes(e.target.value)}
                placeholder="Describe what needs to be fixed…"
                rows={3}
                style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} />

              <button className={`btn btn-sm ${room.is_maintenance ? 'btn-danger' : 'btn-secondary'}`}
                onClick={handleToggleMaintenance} disabled={savingMaint}
                style={{ width: '100%', justifyContent: 'center' }}>
                <span className="material-icons" style={{ fontSize: 16 }}>{room.is_maintenance ? 'check_circle' : 'build'}</span>
                {savingMaint ? 'Saving…' : room.is_maintenance ? 'Clear Maintenance Flag' : 'Flag for Maintenance'}
              </button>
            </div>
          )}
        </div>
      </div>

      {transferring && <TransferRoomModal assignment={transferring} onClose={() => setTransferring(null)} />}
      {showAssign   && <AssignRoomModal prefillRoom={roomId} onClose={() => setShowAssign(false)} />}
    </>
  )
}
