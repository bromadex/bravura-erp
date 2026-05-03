// src/pages/Campsite/AssignRoomModal.jsx
//
// FIXES:
// 1. .neq('status','Terminated') — employees stored as 'Active' not 'active'
// 2. Selects 'name' and 'employee_number', not 'full_name' and 'bra_number'
// 3. Shared rooms (capacity >= 2) show an optional second employee slot
// 4. Both employees assigned via separate assignRoom() calls

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const S = { width: '100%', padding: '9px 11px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }

export default function AssignRoomModal({ onClose, prefillEmployee = null, prefillRoom = null }) {
  const { user } = useAuth()
  const { blocks, rooms, assignments, getRoomStatus, STATUS_LABEL, assignRoom } = useCampsite()

  const [employees,   setEmployees]   = useState([])
  const [loadingEmps, setLoadingEmps] = useState(true)
  const [emp1,        setEmp1]        = useState(prefillEmployee || '')
  const [emp2,        setEmp2]        = useState('')
  const [roomId,      setRoomId]      = useState(prefillRoom || '')
  const [startDate,   setStartDate]   = useState(new Date().toISOString().split('T')[0])
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  // FIX: status stored as 'Active' not 'active' — use neq Terminated to catch all active employees
  useEffect(() => {
    supabase
      .from('employees')
      .select('id, name, employee_number, gender, status')
      .neq('status', 'Terminated')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Employees fetch error:', error.message)
        setEmployees(data || [])
        setLoadingEmps(false)
      })
  }, [])

  const room     = useMemo(() => rooms.find(r => r.id === roomId), [rooms, roomId])
  const capacity = room?.capacity ?? 1
  const isShared = capacity >= 2 && room?.room_purpose !== 'storeroom'

  const occupants     = useMemo(() => assignments.filter(a => a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred'), [assignments, roomId])
  const slotsLeft     = capacity - occupants.length
  const takenIds      = useMemo(() => new Set(assignments.filter(a => a.status !== 'checked_out' && a.status !== 'transferred').map(a => a.employee_id)), [assignments])

  const errors = useMemo(() => {
    const e = []
    if (!roomId) return e
    const s = getRoomStatus(roomId)
    if (s === 'maintenance')              e.push('Room is under maintenance.')
    if (slotsLeft <= 0)                   e.push('Room is at full capacity.')
    if (emp1 && takenIds.has(emp1)) {
      const n = employees.find(x => x.id === emp1)?.name || 'Employee 1'
      e.push(`${n} already has an active room assignment. Use Transfer instead.`)
    }
    if (emp2 && takenIds.has(emp2)) {
      const n = employees.find(x => x.id === emp2)?.name || 'Employee 2'
      e.push(`${n} already has an active room assignment. Use Transfer instead.`)
    }
    if (emp1 && emp2 && emp1 === emp2)    e.push('Same employee selected in both slots.')
    return e
  }, [roomId, emp1, emp2, takenIds, employees, slotsLeft, getRoomStatus])

  const warns = useMemo(() => {
    const w = []
    if (!room) return w
    if (room.gender_policy && room.gender_policy !== 'mixed') {
      [emp1, emp2].filter(Boolean).forEach(id => {
        const e = employees.find(x => x.id === id)
        if (e?.gender && e.gender.toLowerCase() !== room.gender_policy.toLowerCase())
          w.push(`${e.name} (${e.gender}) — room is ${room.gender_policy} only.`)
      })
    }
    return w
  }, [room, emp1, emp2, employees])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!emp1 || !roomId || errors.length) return
    setSaving(true)
    try {
      const by   = user?.full_name || user?.username
      const args = { roomId, startDate, notes, processedBy: by }
      const c1   = await assignRoom({ employeeId: emp1, ...args })
      const codes = [c1]
      if (emp2 && slotsLeft >= 2) {
        const c2 = await assignRoom({ employeeId: emp2, ...args })
        codes.push(c2)
      }
      toast.success(`Assigned — ${codes.join(', ')}`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const available = rooms.filter(r => r.room_purpose !== 'storeroom' && !['maintenance','full'].includes(getRoomStatus(r.id)))
  const lbl       = (x) => `${x.name} (${x.employee_number || '—'})`

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 500, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, maxHeight: '92vh', overflowY: 'auto' }}>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <span className="material-icons" style={{ color: 'var(--green)' }}>person_add</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Assign Room</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {errors.map((m, i) => (
            <div key={i} style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)', fontSize: 12, display: 'flex', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>error</span>{m}
            </div>
          ))}
          {warns.map((m, i) => (
            <div key={i} style={{ padding: '9px 12px', borderRadius: 8, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.3)', color: 'var(--yellow)', fontSize: 12, display: 'flex', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>warning</span>{m}
            </div>
          ))}

          {/* Room */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>ROOM *</label>
            <select required value={roomId} onChange={e => { setRoomId(e.target.value); setEmp2('') }} style={S}>
              <option value="">Select room…</option>
              {blocks.map(b => {
                const br = available.filter(r => r.block_id === b.id)
                if (!br.length) return null
                return (
                  <optgroup key={b.id} label={b.name}>
                    {br.map(r => {
                      const occ  = assignments.filter(a => a.room_id === r.id && a.status !== 'checked_out' && a.status !== 'transferred').length
                      const free = (r.capacity || 1) - occ
                      return <option key={r.id} value={r.id}>{r.code} — {STATUS_LABEL[getRoomStatus(r.id)]} · {free} slot{free !== 1 ? 's' : ''} free</option>
                    })}
                  </optgroup>
                )
              })}
            </select>
            {room && (
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 14 }}>
                <span>Capacity: <strong style={{ color: 'var(--text)' }}>{room.capacity}</strong></span>
                <span>Free slots: <strong style={{ color: slotsLeft > 0 ? 'var(--green)' : 'var(--red)' }}>{slotsLeft}</strong></span>
                {room.gender_policy !== 'mixed' && <span style={{ color: 'var(--yellow)', textTransform: 'capitalize' }}>{room.gender_policy} only</span>}
              </div>
            )}
          </div>

          {/* Employee 1 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              {isShared ? 'EMPLOYEE 1 *' : 'EMPLOYEE *'}
            </label>
            {loadingEmps ? (
              <div style={{ ...S, color: 'var(--text-dim)' }}>Loading employees…</div>
            ) : employees.length === 0 ? (
              <div style={{ ...S, color: 'var(--red)', border: '1px solid rgba(239,68,68,.4)', fontSize: 12 }}>
                No employees found. Check employees exist with Active / On Leave / Suspended status.
              </div>
            ) : (
              <select required value={emp1} onChange={e => setEmp1(e.target.value)} style={{ ...S, border: `1px solid ${takenIds.has(emp1) && emp1 ? 'var(--red)' : 'var(--border)'}` }}>
                <option value="">Select employee…</option>
                {employees.filter(e => e.id !== emp2).map(e => (
                  <option key={e.id} value={e.id} disabled={takenIds.has(e.id)}>
                    {lbl(e)}{takenIds.has(e.id) ? ' — Already assigned' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Employee 2 — only for shared rooms with spare capacity */}
          {isShared && slotsLeft >= 2 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                EMPLOYEE 2 <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span>
              </label>
              <select value={emp2} onChange={e => setEmp2(e.target.value)} style={{ ...S, border: `1px solid ${takenIds.has(emp2) && emp2 ? 'var(--red)' : 'var(--border)'}` }}>
                <option value="">— Assign 1 person only —</option>
                {employees.filter(e => e.id !== emp1).map(e => (
                  <option key={e.id} value={e.id} disabled={takenIds.has(e.id)}>
                    {lbl(e)}{takenIds.has(e.id) ? ' — Already assigned' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>START DATE *</label>
            <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} style={S} />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>CHECK-IN NOTES</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" style={{ ...S, resize: 'vertical' }} />
          </div>

          {/* Summary */}
          {emp1 && roomId && !errors.length && (
            <div style={{ padding: '9px 12px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 3 }}>Ready to assign</div>
              {[emp1, emp2].filter(Boolean).map(id => {
                const e = employees.find(x => x.id === id)
                return e ? <div key={id} style={{ color: 'var(--text-dim)' }}>• {e.name} → Room {room?.code}</div> : null
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !!errors.length || !emp1 || !roomId}>
              {saving ? 'Assigning…' : `Assign Room${emp2 ? ' (2 people)' : ''}`}
            </button>
          </div>

        </form>
      </div>
    </>
  )
}
