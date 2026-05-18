// src/pages/HR/ShiftAssignments.jsx
// Assign shifts to employees and manage the current shift roster.

import { useState, useMemo } from 'react'
import { useShift } from '../../contexts/ShiftContext'
import { useHR } from '../../contexts/HRContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState,
  ModalDialog, ModalActions, ConfirmDialog, DataTable, Spinner,
} from '../../components/ui'

const ASSIGN_DEFAULTS = {
  employee_id:      '',
  shift_type_id:    '',
  shift_location_id: '',
  start_date:       new Date().toISOString().split('T')[0],
  end_date:         '',
}

export default function ShiftAssignments() {
  const { user } = useAuth()
  const canApprove = useCanApprove('hr', 'attendance')
  const { shiftTypes, shiftLocations, shiftAssignments, loading, assignShift, updateShiftAssignment, endShiftAssignment } = useShift()
  const { employees, departments } = useHR()

  // ── Filter state ─────────────────────────────────────────────────────────
  const [deptFilter,   setDeptFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')
  const [dateFilter,   setDateFilter]   = useState('')

  // ── Modal state ──────────────────────────────────────────────────────────
  const [assignModal,  setAssignModal]  = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [form,         setForm]         = useState(ASSIGN_DEFAULTS)
  const [saving,       setSaving]       = useState(false)
  const [empSearch,    setEmpSearch]    = useState('')

  // ── End assignment confirm ───────────────────────────────────────────────
  const [endTarget,    setEndTarget]    = useState(null)
  const [ending,       setEnding]       = useState(false)

  // ── Derived data ─────────────────────────────────────────────────────────
  const enriched = useMemo(() => {
    return shiftAssignments.map(sa => {
      const emp   = employees.find(e => e.id === sa.employee_id)
      const shift = shiftTypes.find(s => s.id === sa.shift_type_id)
      const dept  = departments.find(d => d.id === emp?.department_id)
      return { ...sa, _emp: emp, _shift: shift, _dept: dept }
    })
  }, [shiftAssignments, employees, shiftTypes, departments])

  const filtered = useMemo(() => {
    let rows = enriched
    if (deptFilter)                rows = rows.filter(r => r._dept?.id === deptFilter)
    if (statusFilter !== 'All')    rows = rows.filter(r => r.status === statusFilter)
    if (dateFilter) {
      rows = rows.filter(r => {
        if (!r.start_date) return false
        const start = r.start_date
        const end   = r.end_date || '9999-12-31'
        return dateFilter >= start && dateFilter <= end
      })
    }
    return rows
  }, [enriched, deptFilter, statusFilter, dateFilter])

  // ── KPI ──────────────────────────────────────────────────────────────────
  const activeAssignments  = shiftAssignments.filter(s => s.status === 'Active').length
  const nightAssignments   = enriched.filter(s => s.status === 'Active' && s._shift?.is_night_shift).length
  const assignedEmployeeIds = new Set(shiftAssignments.filter(s => s.status === 'Active').map(s => s.employee_id))
  const unassigned         = employees.filter(e => e.status === 'Active' && !assignedEmployeeIds.has(e.id)).length

  // ── Helpers ──────────────────────────────────────────────────────────────
  const field = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const filteredEmployees = useMemo(() => {
    if (!empSearch) return employees.filter(e => e.status === 'Active')
    const t = empSearch.toLowerCase()
    return employees.filter(e => e.status === 'Active' && (
      e.name?.toLowerCase().includes(t) || e.employee_number?.toLowerCase().includes(t)
    ))
  }, [employees, empSearch])

  const openAdd = () => {
    setEditTarget(null)
    setForm(ASSIGN_DEFAULTS)
    setEmpSearch('')
    setAssignModal(true)
  }

  const openEdit = (row) => {
    setEditTarget(row)
    setForm({
      employee_id:       row.employee_id       || '',
      shift_type_id:     row.shift_type_id     || '',
      shift_location_id: row.shift_location_id || '',
      start_date:        row.start_date        || '',
      end_date:          row.end_date          || '',
    })
    setEmpSearch(row._emp?.name || '')
    setAssignModal(true)
  }

  const handleSave = async () => {
    if (!form.employee_id)   { toast.error('Select an employee');  return }
    if (!form.shift_type_id) { toast.error('Select a shift type'); return }
    if (!form.start_date)    { toast.error('Start date is required'); return }

    // Validate: no active assignment for same employee (only when adding new)
    if (!editTarget) {
      const hasActive = shiftAssignments.some(
        s => s.employee_id === form.employee_id && s.status === 'Active'
      )
      if (hasActive) {
        toast.error('This employee already has an active shift assignment. End it first.')
        return
      }
    }

    setSaving(true)
    try {
      if (editTarget) {
        await updateShiftAssignment(editTarget.id, {
          shift_type_id:     form.shift_type_id     || null,
          shift_location_id: form.shift_location_id || null,
          start_date:        form.start_date,
          end_date:          form.end_date           || null,
        })
        toast.success('Assignment updated')
      } else {
        await assignShift({
          employee_id:       form.employee_id,
          shift_type_id:     form.shift_type_id,
          shift_location_id: form.shift_location_id || null,
          start_date:        form.start_date,
          end_date:          form.end_date || null,
          created_by:        user?.username || user?.full_name || 'system',
        })
        toast.success('Shift assigned')
      }
      setAssignModal(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save assignment')
    } finally {
      setSaving(false)
    }
  }

  const handleEnd = async () => {
    if (!endTarget) return
    setEnding(true)
    try {
      await endShiftAssignment(endTarget.id)
      toast.success('Shift assignment ended')
      setEndTarget(null)
    } catch (err) {
      toast.error(err.message || 'Failed to end assignment')
    } finally {
      setEnding(false)
    }
  }

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    { key: '_name',       label: 'Employee',     sortable: true,  render: (_, r) => r._emp?.name      || '—' },
    { key: '_empno',      label: 'Emp #',        render: (_, r) => r._emp?.employee_number             || '—' },
    { key: '_dept',       label: 'Department',   render: (_, r) => r._dept?.name                       || '—' },
    { key: '_shift',      label: 'Shift',        render: (_, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {r._shift?.color && (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: r._shift.color, display: 'inline-block' }} />
        )}
        {r._shift?.name || '—'}
      </span>
    )},
    { key: 'start_date',  label: 'Start Date',   sortable: true },
    { key: 'end_date',    label: 'End Date',      render: (v) => v || 'Ongoing' },
    { key: 'status',      label: 'Status',        render: (v) => <StatusBadge status={v?.toLowerCase() || 'inactive'} /> },
    {
      key: '_actions',
      label: '',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>Edit</button>
          {row.status === 'Active' && (
            <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setEndTarget(row) }}>End</button>
          )}
        </div>
      ),
    },
  ]

  if (loading) return <div className="page-body"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Shift Assignments"
        subtitle="Assign and manage employee shift rosters"
      >
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons md-18">assignment_ind</span> Assign Shift
        </button>
      </PageHeader>

      <div className="page-body">
        {/* KPI Row */}
        <div className="kpi-row">
          <KPICard label="Active Assignments"    value={activeAssignments} icon="badge"        color="blue"   />
          <KPICard label="Night Shift Employees" value={nightAssignments}  icon="nights_stay"  color="purple" />
          <KPICard label="Unassigned (Active)"   value={unassigned}        icon="person_off"   color="red"    />
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <select className="form-control" style={{ width: 180 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          <select className="form-control" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <input
            className="form-control"
            type="date"
            style={{ width: 160 }}
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            title="Filter by effective date"
          />
          {(deptFilter || statusFilter !== 'Active' || dateFilter) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setDeptFilter(''); setStatusFilter('Active'); setDateFilter('') }}>
              Clear
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyText="No assignments match the current filters"
          emptyIcon="assignment_ind"
          searchable
          searchPlaceholder="Search employee, shift…"
        />
      </div>

      {/* ── Assign / Edit Modal ──────────────────────────────────────────────── */}
      <ModalDialog
        open={assignModal}
        onClose={() => setAssignModal(false)}
        title={editTarget ? 'Edit Shift Assignment' : 'Assign Shift to Employee'}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', padding: '16px 0' }}>
          {/* Employee selector */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Employee *</label>
            {editTarget ? (
              <input className="form-control" value={editTarget._emp?.name || editTarget.employee_id} disabled />
            ) : (
              <>
                <input
                  className="form-control"
                  placeholder="Search employee name or number…"
                  value={empSearch}
                  onChange={e => { setEmpSearch(e.target.value); setForm(f => ({ ...f, employee_id: '' })) }}
                />
                {empSearch && !form.employee_id && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, maxHeight: 180, overflowY: 'auto', background: 'var(--surface)' }}>
                    {filteredEmployees.length === 0 && (
                      <div style={{ padding: '10px 14px', color: 'var(--text-dim)', fontSize: 13 }}>No employees found</div>
                    )}
                    {filteredEmployees.map(e => (
                      <div
                        key={e.id}
                        style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                        onClick={() => { setForm(f => ({ ...f, employee_id: e.id })); setEmpSearch(`${e.name} (${e.employee_number})`) }}
                        onMouseOver={ev => ev.currentTarget.style.background = 'var(--surface2)'}
                        onMouseOut={ev => ev.currentTarget.style.background = ''}
                      >
                        <strong>{e.name}</strong>
                        <span style={{ color: 'var(--text-dim)', marginLeft: 8 }}>{e.employee_number}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Shift Type */}
          <div className="form-group">
            <label className="form-label">Shift Type *</label>
            <select className="form-control" value={form.shift_type_id} onChange={field('shift_type_id')}>
              <option value="">Select shift…</option>
              {shiftTypes.filter(s => s.is_active).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.start_time} – {s.end_time})</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Location (optional)</label>
            <select className="form-control" value={form.shift_location_id} onChange={field('shift_location_id')}>
              <option value="">No specific location</option>
              {shiftLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div className="form-group">
            <label className="form-label">Start Date *</label>
            <input className="form-control" type="date" value={form.start_date} onChange={field('start_date')} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date (leave blank for ongoing)</label>
            <input className="form-control" type="date" value={form.end_date} onChange={field('end_date')} />
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setAssignModal(false)} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editTarget ? 'Update Assignment' : 'Assign Shift'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── End Assignment Confirm ───────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!endTarget}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEnd}
        title="End Shift Assignment"
        message={`End the shift assignment for ${endTarget?._emp?.name || 'this employee'}? Today's date will be recorded as the end date.`}
        confirmLabel="End Assignment"
        danger
        loading={ending}
      />
    </div>
  )
}
