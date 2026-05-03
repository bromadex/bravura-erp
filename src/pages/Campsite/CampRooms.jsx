// src/pages/Campsite/CampRooms.jsx
//
// FIXES:
// 1. Removed 'notes' from insert payload — column was missing from old DB migration.
//    Now uses room_purpose instead.
// 2. Capacity input fixed — no longer forces 1 when field is cleared.
// 3. Room types changed to: Accommodation (shared, capacity 2),
//    Supervisor Room (single, capacity 1), Storeroom (no assignments).
// 4. Two views: Table (list) and Grid (airline seat-style floor plan).
// 5. Fixed a.employees?.full_name → a.employees?.name

import { useState, useMemo } from 'react'
import { useCampsite } from '../../contexts/CampsiteContext'
import toast from 'react-hot-toast'

// Room purpose config
const PURPOSE_OPTIONS = [
  { value: 'accommodation', label: 'Accommodation',   icon: 'bed',        cap: 2, color: 'var(--teal)'    },
  { value: 'supervisor',    label: 'Supervisor Room',  icon: 'person',     cap: 1, color: 'var(--gold)'    },
  { value: 'storeroom',     label: 'Storeroom',        icon: 'inventory_2',cap: 0, color: 'var(--text-dim)'},
]

const EMPTY_ROOM = {
  code: '', block_id: '', type: 'Standard Single',
  room_purpose: 'accommodation', capacity: 2,
  gender_policy: 'mixed',
}

export default function CampRooms() {
  const {
    blocks, rooms, assignments, loading,
    addRoom, updateRoom, getRoomStatus, STATUS_COLOR, STATUS_LABEL,
  } = useCampsite()

  const [viewMode, setViewMode]   = useState('grid')   // 'grid' | 'table'
  const [modal,    setModal]      = useState(null)      // null | 'add' | room object
  const [form,     setForm]       = useState(EMPTY_ROOM)
  const [saving,   setSaving]     = useState(false)
  const [search,   setSearch]     = useState('')
  const [fBlock,   setFBlock]     = useState('all')
  const [fStatus,  setFStatus]    = useState('all')
  const [selectedBlock, setSelectedBlock] = useState(null)  // for grid view

  // When purpose changes, auto-set capacity
  const handlePurposeChange = (purpose) => {
    const opt = PURPOSE_OPTIONS.find(p => p.value === purpose)
    setForm(f => ({ ...f, room_purpose: purpose, capacity: opt?.cap ?? 2 }))
  }

  const open = (room = null) => {
    if (room) {
      setForm({
        code:          room.code,
        block_id:      room.block_id || '',
        type:          room.type || 'Standard Single',
        room_purpose:  room.room_purpose || 'accommodation',
        capacity:      room.capacity ?? 2,
        gender_policy: room.gender_policy || 'mixed',
      })
    } else {
      setForm(EMPTY_ROOM)
    }
    setModal(room || 'add')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.code.trim()) return toast.error('Room code required')
    if (!form.block_id)    return toast.error('Select a block')

    // Never send 'notes' — column may not exist on older DBs
    // room_purpose and the new columns are safe after running migration_fix.sql
    const payload = {
      code:          form.code.trim().toUpperCase(),
      block_id:      form.block_id,
      type:          form.type,
      room_purpose:  form.room_purpose,
      capacity:      form.room_purpose === 'storeroom' ? 0 : (parseInt(form.capacity) || 1),
      gender_policy: form.gender_policy,
      is_maintenance: false,
    }

    setSaving(true)
    try {
      if (modal === 'add') {
        await addRoom(payload)
        toast.success(`Room ${payload.code} added`)
      } else {
        await updateRoom(modal.id, payload)
        toast.success(`Room ${payload.code} updated`)
      }
      setModal(null)
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => rooms.filter(r => {
    if (fBlock  !== 'all' && r.block_id !== fBlock)         return false
    if (fStatus !== 'all' && getRoomStatus(r.id) !== fStatus) return false
    if (search  && !r.code.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [rooms, fBlock, fStatus, search, getRoomStatus])

  const getOccupants = (roomId) =>
    assignments.filter(a => a.room_id === roomId && a.status !== 'checked_out' && a.status !== 'transferred')

  // ── GRID VIEW — airline seat plan per block ────────────────
  const renderGrid = () => {
    const displayBlocks = fBlock === 'all' ? blocks : blocks.filter(b => b.id === fBlock)

    return displayBlocks.map(block => {
      const blockRooms = filtered.filter(r => r.block_id === block.id)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

      if (blockRooms.length === 0) return null

      return (
        <div key={block.id} style={{ marginBottom: 32 }}>
          {/* Block header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>domain</span>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{block.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              {blockRooms.length} room{blockRooms.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Seat-plan grid — 2 columns like an aisle-less cabin */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            maxWidth: 480,
          }}>
            {blockRooms.map(room => {
              const status    = getRoomStatus(room.id)
              const color     = STATUS_COLOR[status]    || 'var(--text-dim)'
              const occupants = getOccupants(room.id)
              const purpose   = PURPOSE_OPTIONS.find(p => p.value === room.room_purpose) || PURPOSE_OPTIONS[0]
              const isStore   = room.room_purpose === 'storeroom'

              return (
                <div
                  key={room.id}
                  onClick={() => open(room)}
                  title={`${room.code} — ${STATUS_LABEL[status] || status}${occupants.map(o => '\n' + (o.employees?.name || '?')).join('')}`}
                  style={{
                    background:    `${color}12`,
                    border:        `2px solid ${color}`,
                    borderRadius:  10,
                    padding:       '10px 12px',
                    cursor:        'pointer',
                    position:      'relative',
                    transition:    'transform .1s, box-shadow .1s',
                    minHeight:     72,
                    display:       'flex',
                    flexDirection: 'column',
                    gap:           4,
                  }}
                  onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}33` }}
                  onMouseOut={e  => { e.currentTarget.style.transform = '';             e.currentTarget.style.boxShadow = '' }}
                >
                  {/* Room code */}
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color: 'var(--gold)' }}>
                    {room.code}
                  </div>

                  {/* Purpose icon + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="material-icons" style={{ fontSize: 13, color: purpose.color }}>{purpose.icon}</span>
                    <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {isStore ? 'Storeroom' : STATUS_LABEL[status] || status}
                    </span>
                  </div>

                  {/* Occupant initials */}
                  {!isStore && occupants.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                      {occupants.map(o => {
                        const name = o.employees?.name || '?'
                        const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                        return (
                          <div key={o.id} title={name} style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: 'var(--gold)',
                            color: '#0b0f1a',
                            fontSize: 9, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {initials}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Capacity dots — one dot per slot */}
                  {!isStore && room.capacity > 0 && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 'auto' }}>
                      {Array.from({ length: room.capacity }).map((_, i) => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: i < occupants.length ? color : 'var(--border2)',
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )
    })
  }

  // ── LEGEND ────────────────────────────────────────────────
  const legend = [
    { color: STATUS_COLOR.vacant,          label: 'Vacant'       },
    { color: STATUS_COLOR.occupied,         label: 'Occupied'     },
    { color: STATUS_COLOR.occupied_on_leave,label: 'On Leave'     },
    { color: STATUS_COLOR.full,             label: 'Full'         },
    { color: STATUS_COLOR.maintenance,      label: 'Maintenance'  },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Rooms</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{rooms.length} total rooms</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {[{ id: 'grid', icon: 'grid_view' }, { id: 'table', icon: 'table_rows' }].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)} style={{ padding: '6px 10px', background: viewMode === v.id ? 'var(--gold)' : 'transparent', border: 'none', cursor: 'pointer', color: viewMode === v.id ? '#0b0f1a' : 'var(--text-dim)' }}>
                <span className="material-icons" style={{ fontSize: 16 }}>{v.icon}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => open()}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Room
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search room code…"
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, width: 160 }} />
        <select value={fBlock} onChange={e => setFBlock(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Blocks</option>
          {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}>
          <option value="all">All Statuses</option>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="occupied_on_leave">On Leave</option>
          <option value="full">Full</option>
          <option value="maintenance">Maintenance</option>
        </select>

        {/* Legend */}
        {viewMode === 'grid' && (
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {legend.map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color, border: `1px solid ${l.color}` }} />
                {l.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GRID VIEW */}
      {viewMode === 'grid' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No rooms match filters</div>
          ) : renderGrid()}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Room Code</th><th>Block</th><th>Purpose</th><th>Type</th>
                <th>Capacity</th><th>Status</th><th>Occupants</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No rooms</td></tr>
              ) : filtered.map(room => {
                const status    = getRoomStatus(room.id)
                const color     = STATUS_COLOR[status] || 'var(--text-dim)'
                const block     = blocks.find(b => b.id === room.block_id)
                const occupants = getOccupants(room.id)
                const purpose   = PURPOSE_OPTIONS.find(p => p.value === room.room_purpose) || PURPOSE_OPTIONS[0]
                return (
                  <tr key={room.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{room.code}</td>
                    <td>{block?.name || '—'}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <span className="material-icons" style={{ fontSize: 14, color: purpose.color }}>{purpose.icon}</span>
                        {purpose.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{room.type || '—'}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>
                      {room.room_purpose === 'storeroom' ? '—' : room.capacity}
                    </td>
                    <td>
                      <span style={{ padding: '2px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: 11, fontWeight: 700 }}>
                        {STATUS_LABEL[status] || status}
                      </span>
                    </td>
                    <td>
                      {occupants.length === 0
                        ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                        : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {occupants.map(a => (
                              <span key={a.id} style={{ fontSize: 11, color: 'var(--text-mid)' }}>
                                {a.employees?.name || '—'}
                              </span>
                            ))}
                          </div>
                      }
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => open(room)}>
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {modal && (
        <>
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 460, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 15 }}>
              {modal === 'add' ? 'Add Room' : `Edit Room — ${modal.code}`}
            </div>

            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Room Code */}
              <div className="form-group">
                <label className="form-label">Room Code *</label>
                <input required type="text" value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. A-01, R1-05, V-03"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* Block */}
              <div className="form-group">
                <label className="form-label">Block *</label>
                <select required value={form.block_id}
                  onChange={e => setForm(f => ({ ...f, block_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                  <option value="">Select block…</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Room Purpose — the key new field */}
              <div className="form-group">
                <label className="form-label">Room Purpose *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {PURPOSE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => handlePurposeChange(opt.value)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 10,
                        border: `2px solid ${form.room_purpose === opt.value ? opt.color : 'var(--border)'}`,
                        background: form.room_purpose === opt.value ? `${opt.color}18` : 'var(--surface2)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        transition: 'all .15s',
                      }}>
                      <span className="material-icons" style={{ fontSize: 20, color: form.room_purpose === opt.value ? opt.color : 'var(--text-dim)' }}>{opt.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: form.room_purpose === opt.value ? opt.color : 'var(--text-dim)', textAlign: 'center' }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
                {form.room_purpose === 'storeroom' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
                    Storerooms cannot have room assignments. They are excluded from occupancy tracking.
                  </div>
                )}
              </div>

              {/* Type and Capacity — hide capacity for storeroom */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Room Type</label>
                  <select value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                    <option>Standard Single</option>
                    <option>Shared Double</option>
                    <option>Executive Single</option>
                    <option>Shared Triple</option>
                  </select>
                </div>

                {form.room_purpose !== 'storeroom' && (
                  <div className="form-group">
                    <label className="form-label">
                      Max Occupants
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>
                        (max 2)
                      </span>
                    </label>
                    <input
                      type="number"
                      min={1} max={form.room_purpose === 'supervisor' ? 1 : 2}
                      value={form.capacity === '' ? '' : form.capacity}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '') { setForm(f => ({ ...f, capacity: '' })); return }
                        const n = parseInt(val)
                        const max = form.room_purpose === 'supervisor' ? 1 : 2
                        setForm(f => ({ ...f, capacity: Math.min(max, Math.max(1, n)) }))
                      }}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                    {form.room_purpose === 'supervisor' && (
                      <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 4 }}>Supervisor rooms are always single occupancy</div>
                    )}
                  </div>
                )}
              </div>

              {/* Gender policy */}
              {form.room_purpose !== 'storeroom' && (
                <div className="form-group">
                  <label className="form-label">Gender Policy</label>
                  <select value={form.gender_policy}
                    onChange={e => setForm(f => ({ ...f, gender_policy: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                    <option value="mixed">Mixed</option>
                    <option value="male">Male Only</option>
                    <option value="female">Female Only</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Room'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
