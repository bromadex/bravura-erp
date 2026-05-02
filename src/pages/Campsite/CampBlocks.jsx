// src/pages/Campsite/CampBlocks.jsx — Block configuration management

import { useState } from 'react'
import { useCampsite } from '../../contexts/CampsiteContext'
import toast from 'react-hot-toast'

const EMPTY_BLOCK = { name: '', type: 'Standard Single', gender_policy: 'mixed', notes: '' }

export default function CampBlocks() {
  const { blocks, rooms, addBlock, updateBlock, deleteBlock, loading } = useCampsite()
  const [modal, setModal]   = useState(null) // null | 'add' | block object
  const [form,  setForm]    = useState(EMPTY_BLOCK)
  const [saving, setSaving] = useState(false)

  const open = (block = null) => {
    setForm(block ? { name: block.name, type: block.type, gender_policy: block.gender_policy || 'mixed', notes: block.notes || '' } : EMPTY_BLOCK)
    setModal(block || 'add')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal === 'add') {
        await addBlock(form)
        toast.success('Block created')
      } else {
        await updateBlock(modal.id, form)
        toast.success('Block updated')
      }
      setModal(null)
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (block) => {
    const roomCount = rooms.filter(r => r.block_id === block.id).length
    if (roomCount > 0) { toast.error(`Cannot delete — ${roomCount} room(s) in this block`); return }
    if (!confirm(`Delete block "${block.name}"?`)) return
    try {
      await deleteBlock(block.id)
      toast.success('Block deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Camp Blocks</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Configure the physical block structure of the camp</div>
        </div>
        <button className="btn btn-primary" onClick={() => open()}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Block
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : blocks.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>domain</span>
          <p>No blocks configured. Add a block to start managing rooms.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {blocks.map(b => {
            const roomCount = rooms.filter(r => r.block_id === b.id).length
            return (
              <div key={b.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 20 }}>domain</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{b.type}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{roomCount} room{roomCount !== 1 ? 's' : ''} · {b.gender_policy || 'mixed'}</div>
                    {b.notes && <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4, fontStyle: 'italic' }}>{b.notes}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => open(b)}>
                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span> Edit
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(b)}>
                    <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <>
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 15 }}>
              {modal === 'add' ? 'Add Block' : `Edit — ${modal.name}`}
            </div>
            <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Block Name *</label>
                <input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Block A, Relocation 1, VIP Block"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
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
                <label className="form-label">Gender Policy</label>
                <select value={form.gender_policy} onChange={e => setForm(f => ({ ...f, gender_policy: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }}>
                  <option value="mixed">Mixed</option>
                  <option value="male">Male Only</option>
                  <option value="female">Female Only</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
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
