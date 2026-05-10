// src/pages/Reports/ScheduledReports.jsx
// CRUD management page for automated scheduled report delivery.

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useMasterData } from '../../contexts/MasterDataContext'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'
import {
  exportXLSX,
  exportCSV,
  exportPDF,
  fmtDate,
  dateTag,
} from '../../engine/reportingEngine'

// ── Constants ────────────────────────────────────────────────────────────────

const REPORT_TYPE_OPTIONS = [
  { value: 'hr_headcount',       label: 'HR: Employee Headcount' },
  { value: 'leave_summary',      label: 'HR: Leave Summary' },
  { value: 'fuel_consumption',   label: 'Fuel: Consumption Log' },
  { value: 'procurement_pos',    label: 'Procurement: Purchase Orders' },
  { value: 'store_requisitions', label: 'Procurement: Store Requisitions' },
  { value: 'inventory_stock',    label: 'Inventory: Stock Report' },
  { value: 'payroll_summary',    label: 'HR: Payroll Summary' },
  { value: 'audit_log',         label: 'System: Audit Log' },
]

const FREQUENCY_OPTIONS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel' },
  { value: 'csv',   label: 'CSV' },
  { value: 'pdf',   label: 'PDF' },
]

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const EMPTY_FORM = {
  name:          '',
  report_type:   'hr_headcount',
  frequency:     'weekly',
  day_of_week:   1,
  day_of_month:  1,
  format:        'excel',
  department:    '',
  recipients:    '',
  enabled:       true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFrequency(row) {
  if (row.frequency === 'daily')   return 'Daily'
  if (row.frequency === 'weekly')  return `Weekly (${DOW_LABELS[row.day_of_week] ?? '?'})`
  if (row.frequency === 'monthly') {
    const d = row.day_of_month
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
    return `Monthly (${d}${suffix})`
  }
  return row.frequency
}

function fmtFormat(fmt) {
  if (fmt === 'excel') return 'Excel'
  if (fmt === 'csv')   return 'CSV'
  if (fmt === 'pdf')   return 'PDF'
  return fmt
}

function labelForType(value) {
  return REPORT_TYPE_OPTIONS.find(o => o.value === value)?.label ?? value
}

// Fetch report data from Supabase based on report_type.
// Returns an array of plain objects suitable for export.
async function fetchReportData(reportType) {
  switch (reportType) {
    case 'hr_headcount': {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, department, designation, status, hire_date')
        .neq('status', 'Terminated')
      if (error) throw error
      return data || []
    }
    case 'leave_summary': {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, employee_id, leave_type, start_date, end_date, status, created_at')
      if (error) throw error
      return data || []
    }
    case 'fuel_consumption': {
      const { data, error } = await supabase
        .from('fuel_logs')
        .select('id, vehicle_id, fuel_type, quantity, unit_cost, total_cost, log_date, created_at')
      if (error) throw error
      return data || []
    }
    case 'procurement_pos': {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, supplier_id, status, total_amount, created_at')
      if (error) throw error
      return data || []
    }
    case 'store_requisitions': {
      const { data, error } = await supabase
        .from('requisitions')
        .select('id, requisition_number, department, status, created_at')
      if (error) throw error
      return data || []
    }
    case 'inventory_stock': {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, category, quantity, unit, reorder_point, unit_cost')
        .eq('is_active', true)
      if (error) throw error
      return data || []
    }
    case 'payroll_summary': {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('id, period, status, total_gross, total_net, created_at')
      if (error) throw error
      return data || []
    }
    case 'audit_log': {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, table_name, record_id, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return data || []
    }
    default: {
      throw new Error(`Unknown report type: ${reportType}`)
    }
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScheduledReports() {
  const { user }        = useAuth()
  const { departments } = useMasterData()

  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editRow,    setEditRow]    = useState(null)   // null = add mode
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(null)   // id being confirmed
  const [running,    setRunning]    = useState(null)   // id being run

  // ── Data load ──────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('scheduled_reports')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      toast.error('Failed to load scheduled reports')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditRow(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (row) => {
    setEditRow(row)
    const recipientsRaw = row.recipients
    let recipientsStr = ''
    if (recipientsRaw) {
      if (typeof recipientsRaw === 'string') {
        recipientsStr = recipientsRaw
      } else if (Array.isArray(recipientsRaw)) {
        recipientsStr = recipientsRaw.join(', ')
      } else if (recipientsRaw.roles || recipientsRaw.userIds) {
        const parts = [
          ...(recipientsRaw.roles    || []),
          ...(recipientsRaw.userIds  || []),
        ]
        recipientsStr = parts.join(', ')
      }
    }
    setForm({
      name:         row.name          ?? '',
      report_type:  row.report_type   ?? 'hr_headcount',
      frequency:    row.frequency     ?? 'weekly',
      day_of_week:  row.day_of_week   ?? 1,
      day_of_month: row.day_of_month  ?? 1,
      format:       row.format        ?? 'excel',
      department:   row.filters?.department ?? '',
      recipients:   recipientsStr,
      enabled:      row.enabled       ?? true,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditRow(null)
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }

    setSaving(true)
    try {
      const recipients = { roles: [], userIds: [] }
      if (form.recipients.trim()) {
        // Store raw input split by comma as roles list
        recipients.roles = form.recipients.split(',').map(s => s.trim()).filter(Boolean)
      }

      const payload = {
        name:         form.name.trim(),
        report_type:  form.report_type,
        frequency:    form.frequency,
        day_of_week:  form.frequency === 'weekly'  ? Number(form.day_of_week)  : null,
        day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
        filters:      form.department ? { department: form.department } : {},
        recipients,
        format:       form.format,
        enabled:      form.enabled,
      }

      if (editRow) {
        const { error } = await supabase
          .from('scheduled_reports')
          .update(payload)
          .eq('id', editRow.id)
        if (error) throw error
        toast.success('Scheduled report updated')
      } else {
        const { error } = await supabase
          .from('scheduled_reports')
          .insert({ ...payload, created_by: user?.id ?? null })
        if (error) throw error
        toast.success('Scheduled report created')
      }

      closeModal()
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle enabled ─────────────────────────────────────────────────────────

  const handleToggle = async (row) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ enabled: !row.enabled })
        .eq('id', row.id)
      if (error) throw error
      toast.success(row.enabled ? 'Report disabled' : 'Report enabled')
      await load()
    } catch (err) {
      toast.error('Failed to update status')
      console.error(err)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = (id) => setDeleting(id)
  const cancelDelete  = ()   => setDeleting(null)

  const handleDelete = async () => {
    if (!deleting) return
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', deleting)
      if (error) throw error
      toast.success('Scheduled report deleted')
      setDeleting(null)
      await load()
    } catch (err) {
      toast.error('Failed to delete')
      console.error(err)
    }
  }

  // ── Run Now ────────────────────────────────────────────────────────────────

  const handleRunNow = async (row) => {
    setRunning(row.id)
    const tid = toast.loading('Running report…')
    try {
      const data = await fetchReportData(row.report_type)

      if (!data.length) {
        toast.dismiss(tid)
        toast('No data to export', { icon: 'ℹ️' })
        return
      }

      const filename = `${row.name.replace(/\s+/g, '_')}_${dateTag()}`
      const title    = row.name

      if (row.format === 'csv') {
        exportCSV(data, filename)
      } else if (row.format === 'pdf') {
        exportPDF(data, title)
      } else {
        exportXLSX(data, filename)
      }

      // Update last_run_at
      await supabase
        .from('scheduled_reports')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', row.id)

      toast.dismiss(tid)
      toast.success('Report downloaded')
      await load()
    } catch (err) {
      toast.dismiss(tid)
      toast.error(err.message || 'Report failed')
      console.error(err)
    } finally {
      setRunning(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Scheduled Reports"
        subtitle="Configure automatic report delivery."
        actions={
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            + Add
          </button>
        }
      />

      {/* Info banner */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '12px 16px',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-dim)',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <span className="material-icons" style={{ fontSize: 18, color: 'var(--primary)', marginTop: 1 }}>
          info
        </span>
        <span>
          Reports run server-side via Supabase Edge Functions or pg_cron. Contact your admin to enable
          automatic delivery. You can run any report manually now using the <strong>Run Now</strong> button.
        </span>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            No scheduled reports. Click <strong>+ Add</strong> to create one.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Report Type</th>
                  <th>Frequency</th>
                  <th>Format</th>
                  <th>Enabled</th>
                  <th>Last Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong></td>

                    <td>
                      <span className="badge badge-dim" style={{ fontSize: 11 }}>
                        {labelForType(row.report_type)}
                      </span>
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>{fmtFrequency(row)}</td>

                    <td>
                      <span
                        className={`badge badge-dim ${
                          row.format === 'pdf'
                            ? 'badge-warning'
                            : row.format === 'csv'
                            ? ''
                            : 'badge-success'
                        }`}
                        style={{ fontSize: 11 }}
                      >
                        {fmtFormat(row.format)}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className={`badge ${row.enabled ? 'badge-success' : 'badge-dim'}`}
                          style={{ fontSize: 11 }}
                        >
                          {row.enabled ? 'Active' : 'Disabled'}
                        </span>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => handleToggle(row)}
                          title={row.enabled ? 'Disable' : 'Enable'}
                        >
                          {row.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>

                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                      {row.last_run_at ? fmtDate(row.last_run_at) : 'Never'}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => confirmDelete(row.id)}
                        >
                          Delete
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleRunNow(row)}
                          disabled={running === row.id}
                        >
                          {running === row.id ? 'Running…' : 'Run Now'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editRow ? 'Edit Scheduled Report' : 'Add Scheduled Report'}
      >
        <div className="form-group">
          <label>Name *</label>
          <input
            className="form-control"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Weekly Fuel Report"
          />
        </div>

        <div className="form-group">
          <label>Report Type</label>
          <select
            className="form-control"
            value={form.report_type}
            onChange={e => set('report_type', e.target.value)}
          >
            {REPORT_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Frequency</label>
            <select
              className="form-control"
              value={form.frequency}
              onChange={e => set('frequency', e.target.value)}
            >
              {FREQUENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.frequency === 'weekly' && (
            <div className="form-group">
              <label>Day of Week</label>
              <select
                className="form-control"
                value={form.day_of_week}
                onChange={e => set('day_of_week', Number(e.target.value))}
              >
                {DAY_OF_WEEK_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {form.frequency === 'monthly' && (
            <div className="form-group">
              <label>Day of Month (1–28)</label>
              <input
                type="number"
                className="form-control"
                min={1}
                max={28}
                value={form.day_of_month}
                onChange={e => set('day_of_month', Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Export Format</label>
          <select
            className="form-control"
            value={form.format}
            onChange={e => set('format', e.target.value)}
          >
            {FORMAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Department Filter (optional)</label>
          <select
            className="form-control"
            value={form.department}
            onChange={e => set('department', e.target.value)}
          >
            <option value="">— All Departments —</option>
            {(departments || []).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Recipients</label>
          <textarea
            className="form-control"
            rows={3}
            value={form.recipients}
            onChange={e => set('recipients', e.target.value)}
            placeholder="Enter role IDs or notes (e.g. role_hr_manager, role_finance)"
            style={{ resize: 'vertical' }}
          />
          <small style={{ color: 'var(--text-dim)', fontSize: 11 }}>
            Comma-separated role IDs or user notes. Actual delivery requires server-side configuration.
          </small>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => set('enabled', e.target.checked)}
            />
            <span>Enabled</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Delete Confirm Dialog */}
      {deleting && (
        <ModalDialog
          open={!!deleting}
          onClose={cancelDelete}
          title="Delete Scheduled Report"
        >
          <p style={{ marginBottom: 20 }}>
            Are you sure you want to delete this scheduled report? This action cannot be undone.
          </p>
          <ModalActions>
            <button className="btn btn-secondary" onClick={cancelDelete}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
