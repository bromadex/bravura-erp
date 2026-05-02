// src/pages/Campsite/CampRooms.jsx — Room list with add/edit and status column

import { useState, useMemo } from 'react'
import { useCampsite } from '../../contexts/CampsiteContext'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import toast from 'react-hot-toast'

const EMPTY_ROOM = { code: '', block_id: '', type: 'Standard Single', capacity: 1, notes: '' }

export default function CampRooms() {
  const { blocks, rooms, assignments, loading, addRoom, updateRoom, getRoomStatus, STATUS_COLOR, STATUS_LABEL } = useCampsite()

  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY_ROOM)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [fBlock,  setFBlock]  = useState('all')
  const [fStatus, setFStatus] = useState('all')

  const open = (room = null) => {
    setForm(room ? { code: room.code, block_id: room.block_id || '', type: room.type || 'Standard Single', capacity: room.capacity || 1, notes: room.notes || '' } : EMPTY_ROOM)
    setModal(room || 'add')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'add') {
        await addRoom(form)
        toast.success('Room added')
      } else {
        await updateRoom(modal.id, form)
        toast.success('Room updated')
      }
      setModal(null)
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    return rooms.filter(r => {
      if (fBlock !== 'all' && r.block_id !== fBlock) return false
      if (fStatus !== 'all' && getRoomStatus(r.id) !== fStatus) return false
      if (search && !r.code.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rooms, fBlock, fStatus, search, getRoomStatus])

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Rooms</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{rooms.length} total rooms</div>
        </div>
        <button className="btn btn-primary" onClick={() => open()}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Room
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search room code…"
          style={{ padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
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
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Room Code</th>
              <th>Block</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Status</th>
              <th>Occupants</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>No rooms match filters</td></tr>
            ) : filtered.map(room => {
              const status    = getRoomStatus(room.id)
              const color     = STATUS_COLOR[status]
              const block     = blocks.find(b => b.id === room.block_id)
              const occupants = assignments.filter(a => a.room_id === room.id && a.status !== 'checked_out' && a.status !== 'transferred')
              return (
                <tr key={room.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{room.code}</td>
                  <td>{block?.name || '—'}</td>
                  <td>{room.type || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{room.capacity || 1}</td>
                  <td>
                    <span style={{ padding: '2px 10px', borderRadius: 20, background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: 11, fontWeight: 700 }}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td>
                    {occupants.length === 0 ? <span style={{ color: 'var(--text-dim)' }}>—</span> : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {occupants.map(a => (
                          <span key={a.id} style={{ fontSize: 11, color: 'var(--text-mid)' }}>{a.employees?.name}</span>
                        ))}
                      </div>
                    )}
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

      {modal && (
        <>
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 15 }}>
              {modal === 'add' ? 'Add Room' : `Edit Room — ${modal.code}`}
            </div>
            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Room Code *</label>
                <input required type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. A-01, R1-05, V-03"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Block *</label>
                <select required value={form.block_id} onChange={e => setForm(f => ({ ...f, block_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                  <option value="">Select block…</option>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                    <option>Standard Single</option>
                    <option>Shared Double</option>
                    <option>Executive Single</option>
                    <option>Family</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input type="number" min={1} max={10} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
