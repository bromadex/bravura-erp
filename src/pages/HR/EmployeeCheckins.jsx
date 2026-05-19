// src/pages/HR/EmployeeCheckins.jsx
// Biometric / mobile check-in log — view, filter, and process to attendance.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import {
  PageHeader, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, Pagination,
} from '../../components/ui'
import toast from 'react-hot-toast'

const PAGE_SIZE = 30

export default function EmployeeCheckins() {
  const canEdit = useCanEdit('hr', 'employee-checkins')

  const [rows, setRows]             = useState([])
  const [employees, setEmployees]   = useState([])
  const [devices, setDevices]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)

  const [filterEmp, setFilterEmp]     = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterProc, setFilterProc]   = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState({ employee_id: '', log_type: 'IN', time: '', device_id: '', notes: '' })
  const [saving, setSaving]         = useState(false)
  const [editing, setEditing]       = useState(null)
  const [confirm, setConfirm]       = useState(null)

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]))
  const deviceMap = Object.fromEntries(devices.map(d => [d.id, d.device_name]))

  const fetchMeta = useCallback(async () => {
    const [{ data: emps }, { data: devs }] = await Promise.all([
      supabase.from('employees').select('id,name').order('name'),
      supabase.from('attendance_devices').select('id,device_name').eq('is_active', true).order('device_name'),
    ])
    setEmployees(emps || [])
    setDevices(devs || [])
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('employee_checkins').select('*', { count: 'exact' })
    if (filterEmp)  q = q.eq('employee_id', filterEmp)
    if (filterType) q = q.eq('log_type', filterType)
    if (filterProc === 'yes') q = q.eq('is_processed', true)
    if (filterProc === 'no')  q = q.eq('is_processed', false)
    if (dateFrom)   q = q.gte('time', dateFrom)
    if (dateTo)     q = q.lte('time', dateTo + 'T23:59:59')
    const { data, count, error } = await q
      .order('time', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) { toast.error('Failed to load check-ins: ' + error.message); setLoading(false); return }
    setRows(data || []); setTotal(count || 0); setLoading(false)
  }, [filterEmp, filterType, filterProc, dateFrom, dateTo, page])

  useEffect(() => { fetchMeta() }, [fetchMeta])
  useEffect(() => { fetchRows() }, [fetchRows])

  const openNew = () => {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setEditing(null); setForm({ employee_id: '', log_type: 'IN', time: now.toISOString().slice(0,16), device_id: '', notes: '' }); setModal(true)
  }
  const openEdit = r => {
    setEditing(r.id)
    setForm({ employee_id: r.employee_id, log_type: r.log_type || 'IN', time: r.time ? r.time.slice(0,16) : '', device_id: r.device_id || '', notes: r.notes || '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.employee_id) return toast.error('Select an employee')
    if (!form.time)        return toast.error('Time is required')
    setSaving(true)
    const payload = { employee_id: form.employee_id, log_type: form.log_type, time: new Date(form.time).toISOString(), device_id: form.device_id || null, notes: form.notes || null }
    let error
    if (editing) {
      ;({ error } = await supabase.from('employee_checkins').update(payload).eq('id', editing))
    } else {
      ;({ error } = await supabase.from('employee_checkins').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Check-in updated' : 'Check-in recorded'); setModal(false); fetchRows()
  }

  const markProcessed = async id => {
    const { error } = await supabase.from('employee_checkins').update({ is_processed: true, processed_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Marked as processed'); fetchRows(); setConfirm(null)
  }

  const del = async id => {
    const { error } = await supabase.from('employee_checkins').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Deleted'); fetchRows(); setConfirm(null)
  }

  const resetFilters = () => { setFilterEmp(''); setFilterType(''); setFilterProc(''); setDateFrom(''); setDateTo(''); setPage(0) }
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const formatTime = t => t ? new Date(t).toLocaleString() : '—'

  return (
    <div>
      <PageHeader title="Employee Check-ins" subtitle="Biometric and mobile attendance log">
        {canEdit && <button className="btn btn-primary" onClick={openNew}>+ Manual Entry</button>}
      </PageHeader>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <select value={filterEmp} onChange={e => { setFilterEmp(e.target.value); setPage(0) }} className="input" style={{ minWidth: 200 }}>
          <option value="">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(0) }} className="input" style={{ minWidth: 120 }}>
          <option value="">IN & OUT</option>
          <option value="IN">IN Only</option>
          <option value="OUT">OUT Only</option>
        </select>
        <select value={filterProc} onChange={e => { setFilterProc(e.target.value); setPage(0) }} className="input" style={{ minWidth: 150 }}>
          <option value="">All (processed/not)</option>
          <option value="no">Unprocessed</option>
          <option value="yes">Processed</option>
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" className="input" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} style={{ width: 140 }} />
          <span style={{ color: 'var(--text-dim)' }}>—</span>
          <input type="date" className="input" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} style={{ width: 140 }} />
        </div>
        {(filterEmp || filterType || filterProc || dateFrom || dateTo) && (
          <button className="btn btn-secondary" onClick={resetFilters}>Clear</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="fingerprint" message="No check-in records found" />
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Type</th><th>Time</th>
                  <th>Device</th><th>Processed</th><th>Notes</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{empMap[r.employee_id] || r.employee_id}</td>
                    <td>
                      <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 4, fontWeight: 700, background: r.log_type === 'IN' ? 'var(--green)22' : 'var(--red)22', color: r.log_type === 'IN' ? 'var(--green)' : 'var(--red)' }}>
                        {r.log_type || 'IN'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{formatTime(r.time)}</td>
                    <td style={{ fontSize: 12 }}>{r.device_id ? (deviceMap[r.device_id] || r.device_id) : <span style={{ color: 'var(--text-dim)' }}>Manual</span>}</td>
                    <td>
                      {r.is_processed
                        ? <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>✓ Processed</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Pending</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {!r.is_processed && (
                            <>
                              <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>Edit</button>
                              <button className="btn btn-sm btn-primary" onClick={() => setConfirm({ type: 'process', id: r.id, name: empMap[r.employee_id] })}>Process</button>
                            </>
                          )}
                          <button className="btn btn-sm btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirm({ type: 'delete', id: r.id, name: empMap[r.employee_id] })}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}

      <ModalDialog open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Check-in' : 'Manual Check-in Entry'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Employee *</label>
            <select className="input" value={form.employee_id} onChange={e => fld('employee_id', e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="field-label">Log Type</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                {['IN','OUT'].map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="log_type" value={t} checked={form.log_type === t} onChange={() => fld('log_type', t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">Time *</label>
              <input type="datetime-local" className="input" value={form.time} onChange={e => fld('time', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Device</label>
            <select className="input" value={form.device_id} onChange={e => fld('device_id', e.target.value)}>
              <option value="">Manual Entry</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.device_name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Notes</label>
            <input className="input" value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Record'}</button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog open={confirm?.type === 'process'} title="Mark as Processed"
        message={`Mark check-in for ${confirm?.name} as processed into attendance?`} confirmLabel="Mark Processed"
        onConfirm={() => markProcessed(confirm.id)} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm?.type === 'delete'} title="Delete Check-in" danger
        message={`Delete this check-in record for ${confirm?.name}?`} confirmLabel="Delete"
        onConfirm={() => del(confirm.id)} onClose={() => setConfirm(null)} />
    </div>
  )
}
