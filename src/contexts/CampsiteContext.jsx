// src/contexts/CampsiteContext.jsx
//
// State and operations for the Campsite module.
// Manages blocks, rooms, and assignments.
// Room status is always calculated, never manually set.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { generateTxnCode } from '../utils/txnCode'
import toast from 'react-hot-toast'

const CampsiteContext = createContext(null)

export function CampsiteProvider({ children }) {
  const [blocks,      setBlocks]      = useState([])
  const [rooms,       setRooms]       = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, rRes, aRes] = await Promise.all([
        supabase.from('camp_blocks').select('*').order('name'),
        supabase.from('camp_rooms').select('*').order('code'),
        supabase.from('room_assignments').select('*, employees(name,employee_number,gender,department_id)').order('created_at', { ascending: false }),
      ])
      if (bRes.data) setBlocks(bRes.data)
      if (rRes.data) setRooms(rRes.data)

      let assignmentsData = aRes.data || []

      // Auto-reset on_leave assignments whose leave has since ended
      const today = new Date().toISOString().split('T')[0]
      const onLeaveList = assignmentsData.filter(a => a.status === 'on_leave')
      if (onLeaveList.length > 0) {
        const empIds = [...new Set(onLeaveList.map(a => a.employee_id))]
        const { data: activeLv } = await supabase
          .from('leave_requests')
          .select('employee_id')
          .in('employee_id', empIds)
          .eq('status', 'approved')
          .gte('end_date', today)
        const stillOnLeave = new Set((activeLv || []).map(l => l.employee_id))
        const toReset = onLeaveList.filter(a => !stillOnLeave.has(a.employee_id)).map(a => a.id)
        if (toReset.length > 0) {
          await supabase.from('room_assignments').update({ status: 'active' }).in('id', toReset)
          const { data: fresh } = await supabase
            .from('room_assignments')
            .select('*, employees(name,employee_number,gender,department_id)')
            .order('created_at', { ascending: false })
          if (fresh) assignmentsData = fresh
        }
      }

      setAssignments(assignmentsData)
    } catch (err) {
      console.error(err)
      toast.error('Failed to load campsite data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Computed room status ──────────────────────────────────────

  const getRoomStatus = useCallback((roomId) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return 'unknown'

    // Maintenance overrides everything
    if (room.is_maintenance) return 'maintenance'

    const activeAssignments = assignments.filter(a => a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred')
    if (activeAssignments.length === 0) return 'vacant'

    // At capacity
    if (room.capacity && activeAssignments.length >= room.capacity) return 'full'

    // Any occupant on leave?
    const anyOnLeave = activeAssignments.some(a => a.status === 'on_leave')
    if (anyOnLeave) return 'occupied_on_leave'

    return 'occupied'
  }, [rooms, assignments])

  const STATUS_COLOR = {
    vacant:           'var(--green)',
    occupied:         'var(--red)',
    occupied_on_leave:'var(--yellow)',
    full:             '#7f1d1d',
    maintenance:      'var(--text-dim)',
    unknown:          'var(--border)',
  }

  const STATUS_LABEL = {
    vacant:           'Vacant',
    occupied:         'Occupied',
    occupied_on_leave:'On Leave',
    full:             'Full',
    maintenance:      'Maintenance',
    unknown:          'Unknown',
  }

  // ── Blocks ────────────────────────────────────────────────────

  const addBlock = async (block) => {
    const id = crypto.randomUUID()
    const { error } = await supabase.from('camp_blocks').insert([{ id, ...block, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }

  const updateBlock = async (id, updates) => {
    const { error } = await supabase.from('camp_blocks').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteBlock = async (id) => {
    const { error } = await supabase.from('camp_blocks').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // ── Rooms ─────────────────────────────────────────────────────

  const addRoom = async (room) => {
    const id = crypto.randomUUID()
    const { error } = await supabase.from('camp_rooms').insert([{ id, ...room, is_maintenance: false, created_at: new Date().toISOString() }])
    if (error) throw error
    await fetchAll()
    return id
  }

  const updateRoom = async (id, updates) => {
    const { error } = await supabase.from('camp_rooms').update(updates).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const flagMaintenance = async (roomId, isMaintenance, notes = '') => {
    const txnCode = isMaintenance ? await generateTxnCode('CM') : null
    const { error } = await supabase.from('camp_rooms').update({
      is_maintenance:    isMaintenance,
      maintenance_reason: notes,
      maintenance_since:  isMaintenance ? new Date().toISOString() : null,
    }).eq('id', roomId)
    if (error) throw error

    if (isMaintenance && txnCode) {
      await supabase.from('camp_maintenance_flags').insert([{
        id:         crypto.randomUUID(),
        txn_code:   txnCode,
        room_id:    roomId,
        reason:     notes,
        created_at: new Date().toISOString(),
      }])
    }
    await fetchAll()
  }

  // ── Assignments ───────────────────────────────────────────────

  const assignRoom = async ({ employeeId, roomId, startDate, notes, processedBy }) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) throw new Error('Room not found')
    if (room.is_maintenance) throw new Error('Room is under maintenance')

    const roomStatus = getRoomStatus(roomId)
    if (roomStatus === 'full') throw new Error('Room is at full capacity')

    const existingActive = assignments.find(a =>
      a.employee_id === employeeId &&
      a.status !== 'checked_out' &&
      a.status !== 'transferred'
    )
    if (existingActive) throw new Error('Employee already has an active room assignment. Use Transfer instead.')

    const txnCode = await generateTxnCode('CA')
    const id = crypto.randomUUID()
    const { error } = await supabase.from('room_assignments').insert([{
      id,
      txn_code:    txnCode,
      employee_id: employeeId,
      room_id:     roomId,
      start_date:  startDate,
      status:      'active',
      checkin_notes: notes || null,
      processed_by:   processedBy || null,
      created_at:  new Date().toISOString(),
    }])
    if (error) throw error

    await supabase.from('txn_timeline').insert([{
      id:          crypto.randomUUID(),
      record_id:   txnCode,
      record_type: 'room_assignment',
      action:      'Assigned',
      by_name:     processedBy || 'System',
      comment:     notes || null,
      timestamp:   new Date().toISOString(),
    }])

    await fetchAll()
    return txnCode
  }

  const transferRoom = async ({ assignmentId, newRoomId, reason, processedBy }) => {
    const assignment = assignments.find(a => a.id === assignmentId)
    if (!assignment) throw new Error('Assignment not found')

    const newRoom = rooms.find(r => r.id === newRoomId)
    if (!newRoom) throw new Error('Target room not found')
    if (newRoom.is_maintenance) throw new Error('Target room is under maintenance')
    if (getRoomStatus(newRoomId) === 'full') throw new Error('Target room is at full capacity')

    const ctCode = await generateTxnCode('CT')

    // Close current assignment
    await supabase.from('room_assignments').update({
      status:   'transferred',
      end_date: new Date().toISOString().split('T')[0],
    }).eq('id', assignmentId)

    // Create new assignment
    const caCode = await generateTxnCode('CA')
    await supabase.from('room_assignments').insert([{
      id:          crypto.randomUUID(),
      txn_code:    caCode,
      employee_id: assignment.employee_id,
      room_id:     newRoomId,
      start_date:  new Date().toISOString().split('T')[0],
      status:      'active',
      processed_by: processedBy || null,
      created_at:  new Date().toISOString(),
    }])

    // Transfer record
    await supabase.from('room_transfers').insert([{
      id:              crypto.randomUUID(),
      txn_code:        ctCode,
      employee_id:     assignment.employee_id,
      from_room_id:    assignment.room_id,
      to_room_id:      newRoomId,
      old_assignment:  assignment.id,
      new_txn_code:    caCode,
      reason:          reason || null,
      processed_by:    processedBy || null,
      created_at:      new Date().toISOString(),
    }])

    await fetchAll()
    return ctCode
  }

  const vacateRoom = async ({ assignmentId, checkOutNotes, processedBy }) => {
    const assignment = assignments.find(a => a.id === assignmentId)
    if (!assignment) throw new Error('Assignment not found')

    const cvCode = await generateTxnCode('CV')

    await supabase.from('room_assignments').update({
      status:         'checked_out',
      end_date:       new Date().toISOString().split('T')[0],
      checkout_notes: checkOutNotes || null,
    }).eq('id', assignmentId)

    await supabase.from('room_vacates').insert([{
      id:             crypto.randomUUID(),
      txn_code:       cvCode,
      assignment_id:  assignmentId,
      employee_id:    assignment.employee_id,
      room_id:        assignment.room_id,
      notes:          checkOutNotes || null,
      processed_by:   processedBy || null,
      created_at:     new Date().toISOString(),
    }])

    await supabase.from('txn_timeline').insert([{
      id:          crypto.randomUUID(),
      record_id:   assignment.txn_code,
      record_type: 'room_assignment',
      action:      'Vacated',
      by_name:     processedBy || 'System',
      comment:     checkOutNotes || null,
      timestamp:   new Date().toISOString(),
    }])

    await fetchAll()
    return cvCode
  }

  // KPIs derived from current data
  const kpis = {
    totalRooms:    rooms.length,
    occupied:      rooms.filter(r => ['occupied','occupied_on_leave','full'].includes(getRoomStatus(r.id))).length,
    vacant:        rooms.filter(r => getRoomStatus(r.id) === 'vacant').length,
    onLeave:       rooms.filter(r => getRoomStatus(r.id) === 'occupied_on_leave').length,
    maintenance:   rooms.filter(r => getRoomStatus(r.id) === 'maintenance').length,
    occupancyRate: rooms.length > 0
      ? Math.round(rooms.filter(r => ['occupied','occupied_on_leave','full'].includes(getRoomStatus(r.id))).length / rooms.length * 100)
      : 0,
  }

  return (
    <CampsiteContext.Provider value={{
      blocks, rooms, assignments, loading,
      getRoomStatus, STATUS_COLOR, STATUS_LABEL,
      kpis,
      addBlock, updateBlock, deleteBlock,
      addRoom, updateRoom, flagMaintenance,
      assignRoom, transferRoom, vacateRoom,
      refresh: fetchAll,
    }}>
      {children}
    </CampsiteContext.Provider>
  )
}

export function useCampsite() {
  const ctx = useContext(CampsiteContext)
  if (!ctx) throw new Error('useCampsite must be used inside CampsiteProvider')
  return ctx
}
