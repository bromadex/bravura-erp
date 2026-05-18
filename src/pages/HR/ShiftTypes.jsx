// src/pages/HR/ShiftTypes.jsx
// Full CRUD page for managing shift types and shift locations.

import { useState } from 'react'
import { useShift } from '../../contexts/ShiftContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { auditLog } from '../../engine/auditEngine'
import {
  PageHeader, KPICard, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, DataTable, Spinner,
} from '../../components/ui'

// ── Default form values ────────────────────────────────────────────────────
const SHIFT_DEFAULTS = {
  name: '',
  start_time: '08:00',
  end_time: '17:00',
  color: '#3B82F6',
  grace_period_after_start_mins: 0,
  late_entry_grace_mins: 0,
  early_exit_grace_mins: 0,
  working_hours_threshold_for_half_day: 4,
  working_hours_threshold_for_absent: 0,
  max_working_hours: 9,
  enable_auto_attendance: false,
  is_night_shift: false,
  is_active: true,
}

const LOCATION_DEFAULTS = {
  name: '',
  latitude: '',
  longitude: '',
  radius_meters: 100,
}

export default function ShiftTypes() {
  const { user } = useAuth()
  const canApprove = useCanApprove('hr', 'attendance')
  const {
    shiftTypes,
    shiftLocations,
    loading,
    addShiftType,
    updateShiftType,
    deleteShiftType,
    addShiftLocation,
    deleteShiftLocation,
  } = useShift()

  // ── Shift Type modal state ───────────────────────────────────────────────
  const [shiftModal,   setShiftModal]   = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)   // null = add mode
  const [form,         setForm]         = useState(SHIFT_DEFAULTS)
  const [saving,       setSaving]       = useState(false)

  // ── Delete confirm state ─────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  // ── Location state ───────────────────────────────────────────────────────
  const [locModal,     setLocModal]     = useState(false)
  const [locForm,      setLocForm]      = useState(LOCATION_DEFAULTS)
  const [savingLoc,    setSavingLoc]    = useState(false)
  const [deleteLocId,  setDeleteLocId]  = useState(null)
  const [deletingLoc,  setDeletingLoc]  = useState(false)

  // ── KPI metrics ──────────────────────────────────────────────────────────
  const activeShifts = shiftTypes.filter(s => s.is_active).length
  const nightShifts  = shiftTypes.filter(s => s.is_night_shift && s.is_active).length

  // ── Open add modal ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null)
    setForm(SHIFT_DEFAULTS)
    setShiftModal(true)
  }

  // ── Open edit modal ──────────────────────────────────────────────────────
  const openEdit = (shift) => {
    setEditTarget(shift)
    setForm({
      name:                                    shift.name                                    ?? '',
      start_time:                              shift.start_time                              ?? '08:00',
      end_time:                                shift.end_time                                ?? '17:00',
      color:                                   shift.color                                   ?? '#3B82F6',
      grace_period_after_start_mins:           shift.grace_period_after_start_mins           ?? 0,
      late_entry_grace_mins:                   shift.late_entry_grace_mins                   ?? 0,
      early_exit_grace_mins:                   shift.early_exit_grace_mins                   ?? 0,
      working_hours_threshold_for_half_day:    shift.working_hours_threshold_for_half_day    ?? 4,
      working_hours_threshold_for_absent:      shift.working_hours_threshold_for_absent      ?? 0,
      max_working_hours:                       shift.max_working_hours                       ?? 9,
      enable_auto_attendance:                  shift.enable_auto_attendance                  ?? false,
      is_night_shift:                          shift.is_night_shift                          ?? false,
      is_active:                               shift.is_active                               ?? true,
    })
    setShiftModal(true)
  }

  const field = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? parseFloat(e.target.value) || 0
      : e.target.value
    setForm(f => ({ ...f, [key]: val }))
  }

  // ── Save shift type ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Shift name is required'); return }
    setSaving(true)
    try {
      if (editTarget) {
        await updateShiftType(editTarget.id, form)
        toast.success('Shift type updated')
      } else {
        await addShiftType(form)
        toast.success('Shift type added')
      }
      setShiftModal(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save shift type')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete shift type ────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteShiftType(deleteTarget.id)
      toast.success('Shift type deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  // ── Save location ────────────────────────────────────────────────────────
  const handleSaveLocation = async () => {
    if (!locForm.name.trim()) { toast.error('Location name is required'); return }
    setSavingLoc(true)
    try {
      await addShiftLocation({
        name:          locForm.name.trim(),
        latitude:      parseFloat(locForm.latitude)  || null,
        longitude:     parseFloat(locForm.longitude) || null,
        radius_meters: parseInt(locForm.radius_meters, 10) || 100,
      })
      toast.success('Location added')
      setLocModal(false)
      setLocForm(LOCATION_DEFAULTS)
    } catch (err) {
      toast.error(err.message || 'Failed to add location')
    } finally {
      setSavingLoc(false)
    }
  }

  // ── Delete location ──────────────────────────────────────────────────────
  const handleDeleteLocation = async () => {
    if (!deleteLocId) return
    setDeletingLoc(true)
    try {
      await deleteShiftLocation(deleteLocId)
      toast.success('Location removed')
      setDeleteLocId(null)
    } catch (err) {
      toast.error(err.message || 'Failed to remove location')
    } finally {
      setDeletingLoc(false)
    }
  }

  // ── Table columns ────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'color',
      label: '',
      render: (v) => (
        <span style={{
          display: 'inline-block', width: 12, height: 12,
          borderRadius: '50%', background: v || '#3B82F6', flexShrink: 0,
        }} />
      ),
    },
    { key: 'name',       label: 'Name',        sortable: true },
    {
      key: 'start_time',
      label: 'Time',
      render: (_, row) => `${row.start_time || '—'} – ${row.end_time || '—'}`,
    },
    {
      key: 'grace_period_after_start_mins',
      label: 'Grace (mins)',
      render: (v) => v ?? 0,
    },
    {
      key: 'working_hours_threshold_for_half_day',
      label: 'Half-Day (hrs)',
      render: (v) => v ?? '—',
    },
    {
      key: 'enable_auto_attendance',
      label: 'Auto Attendance',
      render: (v) => v ? 'Yes' : 'No',
    },
    {
      key: 'is_night_shift',
      label: 'Night Shift',
      render: (v) => v ? 'Yes' : 'No',
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (v) => <StatusBadge status={v ? 'active' : 'inactive'} />,
    },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>
            Edit
          </button>
          <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const locColumns = [
    { key: 'name',          label: 'Name',           sortable: true },
    { key: 'latitude',      label: 'Latitude',       render: (v) => v ?? '—' },
    { key: 'longitude',     label: 'Longitude',      render: (v) => v ?? '—' },
    { key: 'radius_meters', label: 'Radius (m)',     render: (v) => v ?? '—' },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <button className="btn btn-sm btn-danger" onClick={() => setDeleteLocId(row.id)}>
          Remove
        </button>
      ),
    },
  ]

  if (loading) return <div className="page-body"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Shift Types"
        subtitle="Configure work shifts, time boundaries, and grace periods"
      >
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons md-18">add</span> Add Shift Type
        </button>
      </PageHeader>

      <div className="page-body">
        {/* KPI Row */}
        <div className="kpi-row">
          <KPICard label="Total Active Shifts" value={activeShifts} icon="schedule" color="blue" />
          <KPICard label="Night Shifts"         value={nightShifts}  icon="nights_stay" color="purple" />
          <KPICard label="Total Defined"        value={shiftTypes.length} icon="list_alt" />
        </div>

        {/* Shift Types Table */}
        <DataTable
          columns={columns}
          data={shiftTypes}
          rowKey="id"
          emptyText="No shift types defined yet"
          emptyIcon="schedule"
          searchable
          searchPlaceholder="Search shift types…"
        />

        {/* Locations Section */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Shift Locations</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => { setLocForm(LOCATION_DEFAULTS); setLocModal(true) }}>
              <span className="material-icons md-18">add_location</span> Add Location
            </button>
          </div>
          <DataTable
            columns={locColumns}
            data={shiftLocations}
            rowKey="id"
            emptyText="No locations configured"
            emptyIcon="location_off"
          />
        </div>
      </div>

      {/* ── Add / Edit Shift Modal ─────────────────────────────────────────── */}
      <ModalDialog
        open={shiftModal}
        onClose={() => setShiftModal(false)}
        title={editTarget ? `Edit Shift · ${editTarget.name}` : 'Add Shift Type'}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          {/* Name */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Shift Name *</label>
            <input className="form-control" value={form.name} onChange={field('name')} placeholder="e.g. Day Shift" />
          </div>

          {/* Start / End times */}
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input className="form-control" type="time" value={form.start_time} onChange={field('start_time')} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input className="form-control" type="time" value={form.end_time} onChange={field('end_time')} />
          </div>

          {/* Color */}
          <div className="form-group">
            <label className="form-label">Color</label>
            <input type="color" value={form.color} onChange={field('color')} style={{ width: 48, height: 36, border: 'none', cursor: 'pointer' }} />
          </div>

          {/* Grace period */}
          <div className="form-group">
            <label className="form-label">Grace Period After Start (mins)</label>
            <input className="form-control" type="number" min="0" value={form.grace_period_after_start_mins} onChange={field('grace_period_after_start_mins')} />
          </div>

          {/* Late entry grace */}
          <div className="form-group">
            <label className="form-label">Late Entry Grace (mins)</label>
            <input className="form-control" type="number" min="0" value={form.late_entry_grace_mins} onChange={field('late_entry_grace_mins')} />
          </div>

          {/* Early exit grace */}
          <div className="form-group">
            <label className="form-label">Early Exit Grace (mins)</label>
            <input className="form-control" type="number" min="0" value={form.early_exit_grace_mins} onChange={field('early_exit_grace_mins')} />
          </div>

          {/* Half day threshold */}
          <div className="form-group">
            <label className="form-label">Half-Day Threshold (hrs)</label>
            <input className="form-control" type="number" min="0" step="0.5" value={form.working_hours_threshold_for_half_day} onChange={field('working_hours_threshold_for_half_day')} />
          </div>

          {/* Absent threshold */}
          <div className="form-group">
            <label className="form-label">Absent Threshold (hrs)</label>
            <input className="form-control" type="number" min="0" step="0.5" value={form.working_hours_threshold_for_absent} onChange={field('working_hours_threshold_for_absent')} />
          </div>

          {/* Max working hours */}
          <div className="form-group">
            <label className="form-label">Max Working Hours</label>
            <input className="form-control" type="number" min="0" step="0.5" value={form.max_working_hours} onChange={field('max_working_hours')} />
          </div>

          {/* Checkboxes row */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.enable_auto_attendance} onChange={field('enable_auto_attendance')} />
              Enable Auto Attendance
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_night_shift} onChange={field('is_night_shift')} />
              Night Shift
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={field('is_active')} />
              Active
            </label>
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShiftModal(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editTarget ? 'Update Shift' : 'Add Shift'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Add Location Modal ─────────────────────────────────────────────── */}
      <ModalDialog open={locModal} onClose={() => setLocModal(false)} title="Add Shift Location">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Location Name *</label>
            <input className="form-control" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Site" />
          </div>
          <div className="form-group">
            <label className="form-label">Latitude</label>
            <input className="form-control" type="number" step="any" value={locForm.latitude} onChange={e => setLocForm(f => ({ ...f, latitude: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Longitude</label>
            <input className="form-control" type="number" step="any" value={locForm.longitude} onChange={e => setLocForm(f => ({ ...f, longitude: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Geo-fence Radius (meters)</label>
            <input className="form-control" type="number" min="0" value={locForm.radius_meters} onChange={e => setLocForm(f => ({ ...f, radius_meters: e.target.value }))} />
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setLocModal(false)} disabled={savingLoc}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveLocation} disabled={savingLoc}>
            {savingLoc ? 'Saving…' : 'Add Location'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Delete Shift Confirm ───────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Shift Type"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />

      {/* ── Delete Location Confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteLocId}
        onClose={() => setDeleteLocId(null)}
        onConfirm={handleDeleteLocation}
        title="Remove Location"
        message="Remove this shift location? Existing assignments will not be affected."
        confirmLabel="Remove"
        danger
        loading={deletingLoc}
      />
    </div>
  )
}
