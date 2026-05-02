// src/pages/Campsite/AssignRoomModal.jsx
//
// Modal for assigning an employee to a room.
// Validates: duplicate active assignment, room capacity, gender policy, maintenance status.

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function AssignRoomModal({ onClose, prefillEmployee = null, prefillRoom = null }) {
  const { user }    = useAuth()
  const { blocks, rooms, assignments, getRoomStatus, STATUS_LABEL, STATUS_COLOR, assignRoom } = useCampsite()

  const [employees,   setEmployees]   = useState([])
  const [employeeId,  setEmployeeId]  = useState(prefillEmployee || '')
  const [roomId,      setRoomId]      = useState(prefillRoom || '')
  const [startDate,   setStartDate]   = useState(new Date().toISOString().split('T')[0])
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)
  const [warning,     setWarning]     = useState(null)

  useEffect(() => {
    supabase.from('employees').select('id, full_name, bra_number, gender, status').eq('status', 'active').order('full_name').then(({ data }) => {
      if (data) setEmployees(data)
    })
  }, [])

  // Validate on employee/room change
  useEffect(() => {
    setWarning(null)
    if (!employeeId || !roomId) return

    const room = rooms.find(r => r.id === roomId)
    if (!room) return

    const status = getRoomStatus(roomId)
    if (status === 'maintenance') { setWarning({ type: 'error', msg: 'This room is under maintenance and cannot accept assignments.' }); return }
    if (status === 'full') { setWarning({ type: 'error', msg: 'This room is at full capacity.' }); return }

    const existingActive = assignments.find(a =>
      a.employee_id === employeeId && a.status !== 'checked_out' && a.status !== 'transferred'
    )
    if (existingActive) {
      setWarning({ type: 'warning', msg: `This employee already has an active room assignment (${existingActive.txn_code || 'unknown'}). Proceeding will fail — use Transfer instead.` })
      return
    }

    if (room.gender_policy && room.gender_policy !== 'mixed') {
      const emp = employees.find(e => e.id === employeeId)
      if (emp && emp.gender && emp.gender.toLowerCase() !== room.gender_policy.toLowerCase()) {
        setWarning({ type: 'warning', msg: `This room has a ${room.gender_policy} gender policy but the selected employee is ${emp.gender}.` })
      }
    }
  }, [employeeId, roomId, rooms, assignments, employees, getRoomStatus])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const code = await assignRoom({ employeeId, roomId, startDate, notes, processedBy: user?.full_name })
      toast.success(`Room assigned — ${code}`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const availableRooms = rooms.filter(r => {
    const s = getRoomStatus(r.id)
    return s !== 'maintenance' && s !== 'full'
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-icons" style={{ color: 'var(--green)' }}>person_add</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Assign Room</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {warning && (
            <div style={{ padding: 12, borderRadius: 8, background: warning.type === 'error' ? 'rgba(239,68,68,.1)' : 'rgba(251,191,36,.1)', border: `1px solid ${warning.type === 'error' ? 'rgba(239,68,68,.3)' : 'rgba(251,191,36,.3)'}`, color: warning.type === 'error' ? 'var(--red)' : 'var(--yellow)', fontSize: 12 }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>warning</span>
              {warning.msg}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Employee *</label>
            <select required value={employeeId} onChange={e => setEmployeeId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.bra_number})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Room *</label>
            <select required value={roomId} onChange={e => setRoomId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
              <option value="">Select room…</option>
              {blocks.map(block => {
                const blockRooms = availableRooms.filter(r => r.block_id === block.id)
                if (!blockRooms.length) return null
                return (
                  <optgroup key={block.id} label={block.name}>
                    {blockRooms.map(r => {
                      const s = getRoomStatus(r.id)
                      return <option key={r.id} value={r.id}>{r.code} — {STATUS_LABEL[s]}</option>
                    })}
                  </optgroup>
                )
              })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Start Date *</label>
            <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Check-in Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…"
              style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || warning?.type === 'error'}>
              {saving ? 'Assigning…' : 'Assign Room'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
