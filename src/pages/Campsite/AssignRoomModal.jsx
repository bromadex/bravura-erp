// src/pages/Campsite/AssignRoomModal.jsx
//
// FIXES:
// 1. Employee dropdown was empty — .eq('status','active') fails because
//    the employees table stores 'Active' (capital A). Fixed to .neq('status','Terminated').
// 2. Column names fixed: full_name → name, bra_number → employee_number.
// 3. Shared rooms (capacity 2) now show a second employee slot.
//    Both employees are validated and assigned individually via assignRoom().
//    The second slot is optional — you can assign just one person to a shared room.

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCampsite } from '../../contexts/CampsiteContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function AssignRoomModal({ onClose, prefillEmployee = null, prefillRoom = null }) {
  const { user } = useAuth()
  const { blocks, rooms, assignments, getRoomStatus, STATUS_LABEL, assignRoom } = useCampsite()

  const [employees,    setEmployees]    = useState([])
  const [loadingEmps,  setLoadingEmps]  = useState(true)

  // Employee 1 (always required)
  const [employeeId1,  setEmployeeId1]  = useState(prefillEmployee || '')
  // Employee 2 (only for capacity ≥ 2)
  const [employeeId2,  setEmployeeId2]  = useState('')

  const [roomId,       setRoomId]       = useState(prefillRoom || '')
  const [startDate,    setStartDate]    = useState(new Date().toISOString().split('T')[0])
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [warnings,     setWarnings]     = useState([])

  // FIX 1: Use .neq('status','Terminated') — employees table stores 'Active' not 'active'
  useEffect(() => {
    setLoadingEmps(true)
    supabase
      .from('employees')
      .select('id, name, employee_number, gender, status, department_id')
      .neq('status', 'Terminated')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Employee fetch error:', error)
        if (data) setEmployees(data)
        setLoadingEmps(false)
      })
  }, [])

  const selectedRoom = useMemo(() => rooms.find(r => r.id === roomId), [rooms, roomId])
  const roomCapacity = selectedRoom?.capacity ?? 1
  const isShared     = roomCapacity >= 2 && selectedRoom?.room_purpose !== 'storeroom'

  // Employees already actively assigned to rooms (cannot be double-assigned)
  const alreadyAssignedIds = useMemo(() =>
    new Set(assignments.filter(a => a.status !== 'checked_out' && a.status !== 'transferred').map(a => a.employee_id)),
    [assignments]
  )

  // Current occupants of selected room (to calculate slots remaining)
  const currentOccupants = useMemo(() =>
    assignments.filter(a => a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred'),
    [assignments, roomId]
  )
  const slotsRemaining = roomCapacity - currentOccupants.length

  // Validate whenever selections change
  useEffect(() => {
    const w = []
    if (!roomId) { setWarnings([]); return }

    const status = getRoomStatus(roomId)
    if (status === 'maintenance') { setWarnings([{ type: 'error', msg: 'This room is under maintenance.' }]); return }
    if (slotsRemaining <= 0)      { setWarnings([{ type: 'error', msg: 'This room is at full capacity.' }]); return }
    if (isShared && slotsRemaining === 1 && employeeId2) {
      w.push({ type: 'warning', msg: 'Room only has 1 slot remaining. The second employee will not be assigned.' })
    }

    // Check employee 1
    if (employeeId1 && alreadyAssignedIds.has(employeeId1)) {
      const emp = employees.find(e => e.id === employeeId1)
      w.push({ type: 'error', msg: `${emp?.name || 'Employee 1'} already has an active room assignment. Use Transfer instead.` })
    }
    // Check employee 2
    if (employeeId2 && alreadyAssignedIds.has(employeeId2)) {
      const emp = employees.find(e => e.id === employeeId2)
      w.push({ type: 'error', msg: `${emp?.name || 'Employee 2'} already has an active room assignment. Use Transfer instead.` })
    }
    // Check duplicate selection
    if (employeeId1 && employeeId2 && employeeId1 === employeeId2) {
      w.push({ type: 'error', msg: 'Both slots have the same employee selected.' })
    }
    // Gender policy check
    if (selectedRoom?.gender_policy && selectedRoom.gender_policy !== 'mixed') {
      [employeeId1, employeeId2].filter(Boolean).forEach(eid => {
        const emp = employees.find(e => e.id === eid)
        if (emp?.gender && emp.gender.toLowerCase() !== selectedRoom.gender_policy.toLowerCase()) {
          w.push({ type: 'warning', msg: `${emp.name} (${emp.gender}) — this room has a ${selectedRoom.gender_policy} policy.` })
        }
      })
    }

    setWarnings(w)
  }, [employeeId1, employeeId2, roomId, selectedRoom, alreadyAssignedIds, employees, slotsRemaining, isShared, getRoomStatus])

  const hasErrors = warnings.some(w => w.type === 'error')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!employeeId1) return toast.error('Select at least one employee')
    if (!roomId)      return toast.error('Select a room')
    if (hasErrors)    return

    setSaving(true)
    try {
      const codes = []

      // Assign employee 1
      const code1 = await assignRoom({
        employeeId: employeeId1,
        roomId,
        startDate,
        notes,
        processedBy: user?.full_name || user?.username,
      })
      codes.push(code1)

      // Assign employee 2 if selected and there's capacity
      if (employeeId2 && slotsRemaining >= 2) {
        const code2 = await assignRoom({
          employeeId: employeeId2,
          roomId,
          startDate,
          notes,
          processedBy: user?.full_name || user?.username,
        })
        codes.push(code2)
      }

      toast.success(`Room assigned — ${codes.join(', ')}`)
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // Available rooms — exclude full and maintenance, group by block
  const availableRooms = rooms.filter(r => {
    if (r.room_purpose === 'storeroom') return false
    const s = getRoomStatus(r.id)
    return s !== 'maintenance' && s !== 'full'
  })

  // Employees available for selection (exclude already assigned, and each other)
  const availableForSlot1 = employees.filter(e => e.id !== employeeId2)
  const availableForSlot2 = employees.filter(e => e.id !== employeeId1)

  const empLabel = (emp) => `${emp.name} (${emp.employee_number || '—'})`

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 500, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <span className="material-icons" style={{ color: 'var(--green)' }}>person_add</span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Assign Room</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Warnings */}
          {warnings.map((w, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: w.type === 'error' ? 'rgba(239,68,68,.1)' : 'rgba(251,191,36,.1)', border: `1px solid ${w.type === 'error' ? 'rgba(239,68,68,.3)' : 'rgba(251,191,36,.3)'}`, color: w.type === 'error' ? 'var(--red)' : 'var(--yellow)', fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 14, marginTop: 1 }}>warning</span>
              {w.msg}
            </div>
          ))}

          {/* Room selection — first, so capacity determines how many employee slots show */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Room *</label>
            <select required value={roomId} onChange={e => { setRoomId(e.target.value); setEmployeeId2('') }}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}>
              <option value="">Select room…</option>
              {blocks.map(block => {
                const blockRooms = availableRooms.filter(r => r.block_id === block.id)
                if (!blockRooms.length) return null
                return (
                  <optgroup key={block.id} label={block.name}>
                    {blockRooms.map(r => {
                      const s = getRoomStatus(r.id)
                      const occ = assignments.filter(a => a.room_id === r.id && a.status !== 'checked_out' && a.status !== 'transferred').length
                      const slots = (r.capacity || 1) - occ
                      return (
                        <option key={r.id} value={r.id}>
                          {r.code} — {STATUS_LABEL[s]} ({slots} slot{slots !== 1 ? 's' : ''} free)
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
            </select>

            {/* Room info strip */}
            {selectedRoom && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 12 }}>
                <span>Capacity: <strong style={{ color: 'var(--text)' }}>{selectedRoom.capacity}</strong></span>
                <span>Available slots: <strong style={{ color: slotsRemaining > 0 ? 'var(--green)' : 'var(--red)' }}>{slotsRemaining}</strong></span>
                {selectedRoom.gender_policy !== 'mixed' && (
                  <span>Policy: <strong style={{ color: 'var(--yellow)', textTransform: 'capitalize' }}>{selectedRoom.gender_policy} only</strong></span>
                )}
              </div>
            )}
          </div>

          {/* Employee 1 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
              {isShared ? 'Employee 1 *' : 'Employee *'}
            </label>
            {loadingEmps ? (
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                Loading employees…
              </div>
            ) : (
              <select required value={employeeId1} onChange={e => setEmployeeId1(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: `1px solid ${alreadyAssignedIds.has(employeeId1) && employeeId1 ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8, color: employeeId1 ? 'var(--text)' : 'var(--text-dim)', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">Select employee…</option>
                {availableForSlot1.map(emp => (
                  <option key={emp.id} value={emp.id} disabled={alreadyAssignedIds.has(emp.id)}>
                    {empLabel(emp)}{alreadyAssignedIds.has(emp.id) ? ' — Already assigned' : ''}
                  </option>
                ))}
              </select>
            )}
            {employees.length === 0 && !loadingEmps && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>No employees found. Check that employees exist with a non-Terminated status.</div>
            )}
          </div>

          {/* Employee 2 — only shown for shared rooms */}
          {isShared && slotsRemaining >= 2 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                Employee 2
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>(optional — leave blank to assign 1 person only)</span>
              </label>
              <select value={employeeId2} onChange={e => setEmployeeId2(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: `1px solid ${alreadyAssignedIds.has(employeeId2) && employeeId2 ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8, color: employeeId2 ? 'var(--text)' : 'var(--text-dim)', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">— Not assigning a second person —</option>
                {availableForSlot2.map(emp => (
                  <option key={emp.id} value={emp.id} disabled={alreadyAssignedIds.has(emp.id)}>
                    {empLabel(emp)}{alreadyAssignedIds.has(emp.id) ? ' — Already assigned' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Show message when room only has 1 slot left even if capacity is 2 */}
          {isShared && slotsRemaining === 1 && (
            <div style={{ padding: '8px 12px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 6, fontSize: 11, color: 'var(--yellow)' }}>
              This room already has 1 occupant. Only 1 more person can be assigned.
            </div>
          )}

          {/* Start date */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Start Date *</label>
            <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>Check-in Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…"
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* Summary */}
          {(employeeId1 || employeeId2) && roomId && !hasErrors && (
            <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--green)' }}>Assignment Summary</div>
              {[employeeId1, employeeId2].filter(Boolean).map(eid => {
                const emp = employees.find(e => e.id === eid)
                return emp ? (
                  <div key={eid} style={{ color: 'var(--text-dim)' }}>
                    • {emp.name} → {selectedRoom?.code}
                  </div>
                ) : null
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary"
              disabled={saving || hasErrors || !employeeId1 || !roomId}>
              {saving ? 'Assigning…' : `Assign Room${employeeId2 ? ' (2 people)' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
