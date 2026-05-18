// src/pages/HR/AppraisalPeriods.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, KPICard,
  ModalDialog, ModalActions, ConfirmDialog
} from '../../components/ui'

const BLANK_FORM = {
  name: '',
  period_type: 'Annual',
  start_date: '',
  end_date: '',
  description: '',
  status: 'Draft',
}

const PERIOD_TYPES = ['Annual', 'Semi-Annual', 'Quarterly']
const STATUSES     = ['Draft', 'Active', 'Closed', 'Archived']

function periodStatusBadge(status) {
  const map = { Draft: 'yellow', Active: 'green', Closed: 'blue', Archived: 'dim' }
  return map[status] || 'dim'
}

export default function AppraisalPeriods() {
  const { user } = useAuth()
  const canEdit    = useCanEdit('hr', 'appraisal_periods')
  const canApprove = useCanApprove('hr', 'appraisal_periods')

  const [periods,    setPeriods]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)   // period object | null
  const [form,       setForm]       = useState(BLANK_FORM)
  const [confirm,    setConfirm]    = useState({ open: false, period: null }) // close confirm

  // ── Fetch ────────────────────────────────────────────────────
  const fetchPeriods = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('appraisal_periods')
        .select('*, performance_reviews(id)')
        .order('start_date', { ascending: false })
      if (error) throw error
      setPeriods(data || [])
    } catch (err) {
      toast.error('Failed to load appraisal periods: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPeriods() }, [fetchPeriods])

  // ── KPIs ─────────────────────────────────────────────────────
  const kpiTotal   = periods.length
  const kpiActive  = periods.filter(p => p.status === 'Active').length
  const kpiClosed  = periods.filter(p => p.status === 'Closed').length
  const kpiReviews = periods.reduce((sum, p) =>
    sum + (Array.isArray(p.performance_reviews) ? p.performance_reviews.length : 0), 0)

  // ── Modal helpers ─────────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (period) => {
    setEditing(period)
    setForm({
      name:        period.name,
      period_type: period.period_type,
      start_date:  period.start_date,
      end_date:    period.end_date,
      description: period.description || '',
      status:      period.status,
    })
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditing(null) }

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim())  return toast.error('Name is required')
    if (!form.start_date)   return toast.error('Start date is required')
    if (!form.end_date)     return toast.error('End date is required')
    if (form.start_date > form.end_date)
      return toast.error('Start date must be before end date')

    setSaving(true)
    try {
      const payload = {
        name:        form.name.trim(),
        period_type: form.period_type,
        start_date:  form.start_date,
        end_date:    form.end_date,
        description: form.description.trim() || null,
        status:      form.status,
      }

      if (editing) {
        const { error } = await supabase
          .from('appraisal_periods')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Appraisal period updated')
      } else {
        const { error } = await supabase
          .from('appraisal_periods')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Appraisal period created')
      }

      closeModal()
      await fetchPeriods()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Activate ──────────────────────────────────────────────────
  const handleActivate = async (period) => {
    try {
      const { error } = await supabase
        .from('appraisal_periods')
        .update({ status: 'Active' })
        .eq('id', period.id)
      if (error) throw error
      toast.success(`"${period.name}" is now Active`)
      await fetchPeriods()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Close (with confirm) ──────────────────────────────────────
  const confirmClose = (period) => setConfirm({ open: true, period })

  const handleClose = async () => {
    const period = confirm.period
    setConfirm({ open: false, period: null })
    try {
      const { error } = await supabase
        .from('appraisal_periods')
        .update({ status: 'Closed' })
        .eq('id', period.id)
      if (error) throw error
      toast.success(`"${period.name}" closed`)
      await fetchPeriods()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (period) => {
    if (!window.confirm(`Delete period "${period.name}"? This cannot be undone.`)) return
    try {
      const { error } = await supabase
        .from('appraisal_periods')
        .delete()
        .eq('id', period.id)
      if (error) throw error
      toast.success('Deleted')
      await fetchPeriods()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Appraisal Periods">
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons">add</span> New Period
          </button>
        )}
      </PageHeader>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPICard label="Total Periods"   value={kpiTotal}   icon="date_range" />
        <KPICard label="Active"          value={kpiActive}  icon="play_circle_outline" color="green" />
        <KPICard label="Closed"          value={kpiClosed}  icon="check_circle_outline" color="blue" />
        <KPICard label="Reviews Created" value={kpiReviews} icon="rate_review" color="gold" />
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Reviews</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
            ) : periods.length === 0 ? (
              <tr><td colSpan="7"><EmptyState icon="date_range" message="No appraisal periods yet" /></td></tr>
            ) : periods.map(period => (
              <tr key={period.id}>
                <td style={{ fontWeight: 600 }}>{period.name}</td>
                <td>{period.period_type}</td>
                <td>{period.start_date}</td>
                <td>{period.end_date}</td>
                <td style={{ textAlign: 'center' }}>
                  {Array.isArray(period.performance_reviews) ? period.performance_reviews.length : 0}
                </td>
                <td>
                  <StatusBadge status={period.status?.toLowerCase()} label={period.status} />
                </td>
                <td>
                  <div className="btn-group-sm">
                    {canEdit && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(period)}
                        title="Edit"
                      >
                        <span className="material-icons" style={{ fontSize: 15 }}>edit</span>
                      </button>
                    )}
                    {canApprove && period.status === 'Draft' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleActivate(period)}
                        title="Activate period"
                      >
                        <span className="material-icons" style={{ fontSize: 15 }}>play_arrow</span> Activate
                      </button>
                    )}
                    {canApprove && period.status === 'Active' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => confirmClose(period)}
                        title="Close period"
                        style={{ color: 'var(--blue)' }}
                      >
                        <span className="material-icons" style={{ fontSize: 15 }}>lock</span> Close
                      </button>
                    )}
                    {canEdit && period.status === 'Draft' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(period)}
                        title="Delete"
                      >
                        <span className="material-icons" style={{ fontSize: 15 }}>delete</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New / Edit Modal */}
      <ModalDialog
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit · ${editing.name}` : 'New Appraisal Period'}
      >
        <div className="form-group">
          <label>Name *</label>
          <input
            className="form-control"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Annual Review 2025"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Period Type *</label>
            <select
              className="form-control"
              value={form.period_type}
              onChange={e => setForm({ ...form, period_type: e.target.value })}
            >
              {PERIOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select
              className="form-control"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Start Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.start_date}
              onChange={e => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>End Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.end_date}
              onChange={e => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            rows="3"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description of this review period…"
          />
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* Close Confirm Dialog */}
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, period: null })}
        onConfirm={handleClose}
        title="Close Appraisal Period"
        message={`Close "${confirm.period?.name}"? No further reviews can be submitted after closing. This cannot be undone.`}
        confirmLabel="Close Period"
        danger
      />
    </div>
  )
}
