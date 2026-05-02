// src/pages/Inventory/StorageLocations.jsx
//
// Manage physical storage locations within the store.
// Locations are grouped by Zone. Each location has a Code (short ID),
// Name, Zone, Description, and optional Capacity.
// Used when doing Stock In to specify where an item is stored.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function StorageLocations() {
  const canEdit   = useCanEdit('inventory', 'stock-balance')
  const canDelete = useCanDelete('inventory', 'stock-balance')

  const [locations, setLocations] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [filterZone, setFilterZone] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const emptyForm = { code: '', name: '', zone: '', description: '', capacity: '', is_active: true }
  const [form, setForm] = useState(emptyForm)

  const fetchLocations = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('storage_locations').select('*').order('zone').order('code')
    if (!error && data) setLocations(data)
    setLoading(false)
  }

  useEffect(() => { fetchLocations() }, [])

  const zones = ['ALL', ...new Set(locations.map(l => l.zone).filter(Boolean))]

  const filtered = locations.filter(l => {
    if (!l.is_active) return false
    if (filterZone !== 'ALL' && l.zone !== filterZone) return false
    if (searchTerm && !(l.code.toLowerCase().includes(searchTerm.toLowerCase()) || l.name.toLowerCase().includes(searchTerm.toLowerCase()))) return false
    return true
  })

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
  const openEdit   = (loc) => {
    setEditing(loc)
    setForm({ code: loc.code, name: loc.name, zone: loc.zone || '', description: loc.description || '', capacity: loc.capacity || '', is_active: loc.is_active })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code.trim() || !form.name.trim()) return toast.error('Code and Name are required')
    try {
      if (editing) {
        const { error } = await supabase.from('storage_locations').update({ ...form }).eq('id', editing.id)
        if (error) throw error
        toast.success('Location updated')
      } else {
        const { error } = await supabase.from('storage_locations').insert([{
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
          ...form,
          created_at: new Date().toISOString(),
        }])
        if (error) {
          if (error.message.includes('unique')) { toast.error(`Code "${form.code}" already exists`); return }
          throw error
        }
        toast.success('Location added')
      }
      setShowModal(false)
      setEditing(null)
      await fetchLocations()
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (loc) => {
    if (!window.confirm(`Delete "${loc.name}"? Items stored here will lose their location reference.`)) return
    const { error } = await supabase.from('storage_locations').update({ is_active: false }).eq('id', loc.id)
    if (error) { toast.error(error.message); return }
    toast.success('Location removed')
    await fetchLocations()
  }

  // Group by zone for visual display
  const byZone = {}
  filtered.forEach(l => {
    const z = l.zone || 'Unzoned'
    if (!byZone[z]) byZone[z] = []
    byZone[z].push(l)
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Storage Locations</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="material-icons">add_location</span> Add Location
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', color: 'var(--teal)', marginRight: 6 }}>info</span>
        Storage locations define where items are physically kept. Assign a location when doing Stock In so the storekeeper knows exactly where to find any item.
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card"><div className="kpi-label">Total Locations</div><div className="kpi-val">{locations.filter(l => l.is_active).length}</div></div>
        <div className="kpi-card"><div className="kpi-label">Zones</div><div className="kpi-val">{new Set(locations.filter(l => l.is_active).map(l => l.zone).filter(Boolean)).size}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="Search code or name…" style={{ maxWidth: 200 }}
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {zones.map(z => (
            <button key={z} className={filterZone === z ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => setFilterZone(z)}>{z === 'ALL' ? 'All Zones' : z}</button>
          ))}
        </div>
      </div>

      {/* Grouped by zone */}
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Loading…</div>
      : Object.entries(byZone).length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.3 }}>location_on</span>
          <span>No storage locations yet — click Add Location to create your first one</span>
        </div>
      ) : Object.entries(byZone).map(([zone, locs]) => (
        <div key={zone} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>folder_open</span>
            {zone} ({locs.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {locs.map(loc => (
              <div key={loc.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--gold)', marginBottom: 2 }}>{loc.code}</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{loc.name}</div>
                    {loc.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{loc.description}</div>}
                    {loc.capacity && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>Capacity: {loc.capacity}</div>}
                  </div>
                  {(canEdit || canDelete) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {canEdit && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(loc)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(loc)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? 'Edit' : 'Add'} Storage <span>Location</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Location Code * <small style={{ color: 'var(--text-dim)' }}>(unique short ID)</small></label>
                  <input className="form-control" required placeholder="e.g. A1, SHELF-B2, YARD-01"
                    value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    readOnly={!!editing} style={editing ? { background: 'var(--surface2)', color: 'var(--text-dim)' } : {}} />
                </div>
                <div className="form-group">
                  <label>Zone / Area</label>
                  <input className="form-control" placeholder="e.g. Main Storeroom, Electrical Store, Yard"
                    value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Location Name *</label>
                <input className="form-control" required placeholder="e.g. Main Storeroom Shelf A1"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input className="form-control" placeholder="What is stored here, access notes…"
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Capacity (optional)</label>
                <input className="form-control" placeholder="e.g. 50 bags, 200 kg, 10 pallets"
                  value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <span className="material-icons">{editing ? 'save' : 'add_location'}</span>
                  {editing ? 'Save Changes' : 'Add Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
