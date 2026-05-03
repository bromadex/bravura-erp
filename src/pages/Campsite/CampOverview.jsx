// src/pages/Campsite/CampOverview.jsx
//
// Default view: block-by-block grid of colour-coded room tiles.
// KPI strip at top. Filter bar for block/status/search.
// Clicking a room tile opens the RoomDetailPanel.

import { useState, useMemo } from 'react'
import { useCampsite } from '../../contexts/CampsiteContext'
import RoomDetailPanel from './RoomDetailPanel'
import AssignRoomModal from './AssignRoomModal'

export default function CampOverview() {
  const { blocks, rooms, assignments, loading, getRoomStatus, STATUS_COLOR, STATUS_LABEL, kpis } = useCampsite()

  const [selectedRoomId, setSelectedRoomId]   = useState(null)
  const [showAssignModal, setShowAssignModal]  = useState(false)
  const [filterBlock,  setFilterBlock]         = useState('all')
  const [filterStatus, setFilterStatus]        = useState('all')
  const [search,       setSearch]              = useState('')

  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      if (filterBlock !== 'all' && room.block_id !== filterBlock) return false
      const status = getRoomStatus(room.id)
      if (filterStatus !== 'all' && status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        const occupants = assignments
          .filter(a => a.room_id === room.id && a.status !== 'checked_out' && a.status !== 'transferred')
          .map(a => a.employees?.name?.toLowerCase() || '')
        const matchesRoom = room.code.toLowerCase().includes(q)
        const matchesOccupant = occupants.some(n => n.includes(q))
        if (!matchesRoom && !matchesOccupant) return false
      }
      return true
    })
  }, [rooms, assignments, filterBlock, filterStatus, search, getRoomStatus])

  const roomsByBlock = useMemo(() => {
    const map = {}
    filteredRooms.forEach(room => {
      const blockId = room.block_id || 'unassigned'
      if (!map[blockId]) map[blockId] = []
      map[blockId].push(room)
    })
    return map
  }, [filteredRooms])

  const visibleBlocks = useMemo(() => {
    if (filterBlock !== 'all') {
      const b = blocks.find(b => b.id === filterBlock)
      return b ? [b] : []
    }
    return blocks.filter(b => roomsByBlock[b.id]?.length > 0)
  }, [blocks, filterBlock, roomsByBlock])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-dim)' }}>
        Loading campsite data…
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      {/* KPI strip */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Rooms',    value: kpis.totalRooms,    icon: 'bed',        color: 'var(--text)' },
          { label: 'Occupied',       value: kpis.occupied,      icon: 'people',     color: 'var(--red)' },
          { label: 'Vacant',         value: kpis.vacant,        icon: 'hotel',      color: 'var(--green)' },
          { label: 'On Leave',       value: kpis.onLeave,       icon: 'event_busy', color: 'var(--yellow)' },
          { label: 'Maintenance',    value: kpis.maintenance,   icon: 'build',      color: 'var(--text-dim)' },
          { label: 'Occupancy Rate', value: `${kpis.occupancyRate}%`, icon: 'percent', color: 'var(--gold)' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ fontSize: 22, color: k.color }}>{k.icon}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{k.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-icons" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-dim)' }}>search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search room or occupant…"
            style={{ padding: '7px 10px 7px 30px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, width: 200 }}
          />
        </div>

        <select value={filterBlock} onChange={e => setFilterBlock(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Blocks</option>
          {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Statuses</option>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="occupied_on_leave">On Leave</option>
          <option value="full">Full</option>
          <option value="maintenance">Maintenance</option>
        </select>

        <div style={{ flex: 1 }} />

        <button className="btn btn-primary btn-sm" onClick={() => setShowAssignModal(true)}>
          <span className="material-icons" style={{ fontSize: 15 }}>person_add</span>
          Assign Room
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_COLOR).filter(([k]) => k !== 'unknown').map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-dim)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {STATUS_LABEL[status]}
          </div>
        ))}
      </div>

      {/* Block sections */}
      {visibleBlocks.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>cabin</span>
          <p>No blocks or rooms configured yet.</p>
        </div>
      ) : visibleBlocks.map(block => {
        const blockRooms = roomsByBlock[block.id] || []
        return (
          <div key={block.id} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{block.name}</div>
              {block.type && <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 10 }}>{block.type}</span>}
              {block.gender_policy && block.gender_policy !== 'mixed' && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 10 }}>{block.gender_policy}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{blockRooms.length} room{blockRooms.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Airline seat plan: 2 columns per row, colour-coded */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 480 }}>
              {blockRooms.map(room => {
                const status    = getRoomStatus(room.id)
                const color     = STATUS_COLOR[status]
                const occupants = assignments.filter(a =>
                  a.room_id === room.id && a.status !== 'checked_out' && a.status !== 'transferred'
                )
                const isStore = room.room_purpose === 'storeroom'
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    title={`${room.code} — ${STATUS_LABEL[status]}\n${occupants.map(a => a.employees?.name || '?').join(', ')}`}
                    style={{ background: `${color}15`, border: `2px solid ${color}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minHeight: 72, textAlign: 'left' }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}33` }}
                    onMouseOut={e  => { e.currentTarget.style.transform = '';            e.currentTarget.style.boxShadow = '' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>{room.code}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {isStore ? 'Storeroom' : STATUS_LABEL[status]}
                    </div>
                    {!isStore && occupants.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {occupants.map((a, i) => {
                          const nm = a.employees?.name || '?'
                          const initials = nm.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                          return (
                            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: color, color: '#0b0f1a', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {initials}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {!isStore && room.capacity > 0 && (
                      <div style={{ display: 'flex', gap: 3, marginTop: 'auto' }}>
                        {Array.from({ length: room.capacity }).map((_, i) => (
                          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < occupants.length ? color : 'var(--border2)' }} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Room detail panel */}
      {selectedRoomId && (
        <RoomDetailPanel
          roomId={selectedRoomId}
          onClose={() => setSelectedRoomId(null)}
        />
      )}

      {/* Assign modal */}
      {showAssignModal && (
        <AssignRoomModal onClose={() => setShowAssignModal(false)} />
      )}
    </div>
  )
}
