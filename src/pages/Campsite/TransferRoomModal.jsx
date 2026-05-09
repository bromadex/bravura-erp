// src/pages/Campsite/TransferRoomModal.jsx
// Modal for transferring an employee from their current room to another.
// Closes the current assignment, opens a new one, and logs a CT txn code.

import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import { ModalDialog, ModalActions } from '../../components/ui'
import toast from 'react-hot-toast'

export default function TransferRoomModal({ assignment, onClose }) {
  const { user } = useAuth()
  const { rooms, blocks, getRoomStatus, STATUS_LABEL, transferRoom } = useCampsite()

  const [newRoomId, setNewRoomId] = useState('')
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)

  const availableRooms = rooms.filter(r => {
    if (r.id === assignment.room_id) return false
    const s = getRoomStatus(r.id)
    return s !== 'maintenance' && s !== 'full'
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newRoomId) return
    setSaving(true)
    try {
      const code = await transferRoom({
        assignmentId: assignment.id,
        newRoomId,
        reason,
        processedBy: user?.full_name || user?.username,
      })
      toast.success(`Transferred — ${code}`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const currentRoom = rooms.find(r => r.id === assignment.room_id)

  return (
    <ModalDialog open title="Transfer Room" onClose={onClose}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Who + from where */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#0b0f1a', flexShrink: 0 }}>
              {(assignment.employees?.name || '?').charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{assignment.employees?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Currently in <span style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{currentRoom?.code || '—'}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Transfer To *</label>
            <select required value={newRoomId} onChange={e => setNewRoomId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
              <option value="">Select destination room…</option>
              {blocks.map(block => {
                const bRooms = availableRooms.filter(r => r.block_id === block.id)
                if (!bRooms.length) return null
                return (
                  <optgroup key={block.id} label={block.name}>
                    {bRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.code} — {STATUS_LABEL[getRoomStatus(r.id)]}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            {availableRooms.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                No available rooms to transfer to.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Transfer</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="Optional — block change, maintenance, personal request…"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !newRoomId || availableRooms.length === 0}>
              {saving ? 'Transferring…' : 'Confirm Transfer'}
            </button>
          </ModalActions>
        </form>
    </ModalDialog>
  )
}
