// src/pages/HR/AttendanceDevices.jsx
// Biometric / access-control device registry.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import toast from 'react-hot-toast'

const EMPTY = { device_name: '', device_serial: '', location: '', branch: '', ip_address: '', is_active: true, notes: '' }

export default function AttendanceDevices() {
  const canEdit = useCanEdit('hr', 'attendance-devices')

  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('attendance_devices').select('*').order('device_name')
    if (error) { toast.error(error.message); setLoading(false); return }
    setRows(data || []); setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = r => { setEditing(r.id); setForm({ device_name: r.device_name, device_serial: r.device_serial || '', location: r.location || '', branch: r.branch || '', ip_address: r.ip_address || '', is_active: r.is_active, notes: r.notes || '' }); setModal(true) }

  const save = async () => {
    if (!form.device_name.trim()) return toast.error('Device name is required')
    setSaving(true)
    const payload = { ...form, device_name: form.device_name.trim(), device_serial: form.device_serial.trim() || null, location: form.location.trim() || null, branch: form.branch.trim() || null, ip_address: form.ip_address.trim() || null, notes: form.notes.trim() || null, updated_at: new Date().toISOString() }
    let error
    if (editing) {
      ;({ error } = await supabase.from('attendance_devices').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('attendance_devices').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Device updated' : 'Device registered'); setModal(false); fetchRows()
  }

  const toggleActive = async (id, val) => {
    const { error } = await supabase.from('attendance_devices').update({ is_active: val }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success(val ? 'Device activated' : 'Device deactivated'); fetchRows()
  }

  const del = async id => {
    const { error } = await supabase.from('attendance_devices').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Device deleted'); fetchRows(); setConfirm(null)
  }

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <PageHeader title="Attendance Devices" subtitle="Biometric terminals and access-control device registry">
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ Register Device</button>}
      </PageHeader>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="sensors" message="No devices registered" action={canEdit ? { label: 'Register First Device', onClick: openNew } : null} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: 'var(--surface)', border: `1px solid ${r.is_active ? 'var(--green)44' : 'var(--border)'}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: r.is_active ? 'var(--green)18' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 22, color: r.is_active ? 'var(--green)' : 'var(--text-dim)' }}>sensors</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.device_name}</div>
                    {r.device_serial && <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{r.device_serial}</div>}
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: r.is_active ? 'var(--green)22' : 'var(--surface2)', color: r.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                  {r.is_active ? 'Online' : 'Offline'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, marginBottom: 14 }}>
                {r.location && <div style={{ display: 'flex', gap: 8 }}><span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>location_on</span> {r.location}</div>}
                {r.branch    && <div style={{ display: 'flex', gap: 8 }}><span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>business</span> {r.branch}</div>}
                {r.ip_address && <div style={{ display: 'flex', gap: 8 }}><span className="material-icons" style={{ fontSize: 14, color: 'var(--text-dim)' }}>lan</span><span style={{ fontFamily: 'var(--mono)' }}>{r.ip_address}</span></div>}
                {r.last_sync_at && <div style={{ color: 'var(--text-dim)' }}>Last sync: {new Date(r.last_sync_at).toLocaleString()}</div>}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)} style={{ flex: 1 }}>Edit</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(r.id, !r.is_active)} style={{ flex: 1 }}>{r.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ id: r.id, name: r.device_name })}>
                    <span className="material-icons" style={{ fontSize: 15 }}>delete</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Device' : 'Register Device'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Device Name *</label>
            <input className="input" value={form.device_name} onChange={e => fld('device_name', e.target.value)} placeholder="e.g. Main Gate Biometric" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Serial Number</label>
              <input className="input" value={form.device_serial} onChange={e => fld('device_serial', e.target.value)} placeholder="Hardware serial" style={{ fontFamily: 'var(--mono)' }} />
            </div>
            <div>
              <label className="field-label">IP Address</label>
              <input className="input" value={form.ip_address} onChange={e => fld('ip_address', e.target.value)} placeholder="192.168.x.x" style={{ fontFamily: 'var(--mono)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Location</label>
              <input className="input" value={form.location} onChange={e => fld('location', e.target.value)} placeholder="e.g. Main Gate" />
            </div>
            <div>
              <label className="field-label">Branch / Site</label>
              <input className="input" value={form.branch} onChange={e => fld('branch', e.target.value)} placeholder="e.g. Kamativi Mine" />
            </div>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <input className="input" value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="dev_active" checked={form.is_active} onChange={e => fld('is_active', e.target.checked)} />
            <label htmlFor="dev_active" style={{ cursor: 'pointer', fontSize: 13 }}>Device is active</label>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Register'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={!!confirm} title="Delete Device" danger
        message={`Delete device "${confirm?.name}"? Existing check-in records will be unlinked.`} confirmLabel="Delete"
        onConfirm={() => del(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
