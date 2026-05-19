// src/pages/HR/AppraisalCycles.jsx
// Groups appraisal_periods into named cycles.
// Tables:
//   appraisal_cycles (id, name, year, frequency, start_date, end_date, status, description)
//   appraisal_cycle_periods (id, cycle_id, period_id)

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, Spinner,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'

const FREQUENCIES = ['Annual', 'Semi-Annual', 'Quarterly', 'Monthly']
const STATUSES     = ['Draft', 'Active', 'Closed']

const BLANK_FORM = {
  name:        '',
  year:        new Date().getFullYear(),
  frequency:   'Annual',
  start_date:  '',
  end_date:    '',
  description: '',
  status:      'Draft',
}

// Status color helper
function statusColor(status) {
  if (status === 'Active') return 'var(--green)'
  if (status === 'Closed') return 'var(--text-dim)'
  return 'var(--yellow)' // Draft
}

// Status badge class helper (used inline as fallback)
function statusBadgeStyle(status) {
  const color = statusColor(status)
  return {
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    background: `${color}22`, color, border: `1px solid ${color}44`,
  }
}

export default function AppraisalCycles() {
  const [cycles,       setCycles]       = useState([])
  const [periods,      setPeriods]      = useState([])   // all appraisal_periods
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  // Add/Edit modal
  const [formOpen,     setFormOpen]     = useState(false)
  const [editingCycle, setEditingCycle] = useState(null)
  const [form,         setForm]         = useState(BLANK_FORM)

  // Detail modal
  const [detailOpen,   setDetailOpen]   = useState(false)
  const [detailCycle,  setDetailCycle]  = useState(null)
  const [cycleLinks,   setCycleLinks]   = useState([])    // appraisal_cycle_periods for detail cycle
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linkPeriodId, setLinkPeriodId] = useState('')
  const [linkingSaving,setLinkingSaving]= useState(false)

  // Confirm delete
  const [confirm,      setConfirm]      = useState({ open: false, item: null })

  // ── Fetch cycles + periods ────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cycleRes, periodRes] = await Promise.all([
        supabase
          .from('appraisal_cycles')
          .select('*, appraisal_cycle_periods(id)')
          .order('year', { ascending: false })
          .order('name'),
        supabase
          .from('appraisal_periods')
          .select('*')
          .order('start_date', { ascending: false }),
      ])
      if (cycleRes.error) throw cycleRes.error
      if (periodRes.error) throw periodRes.error
      setCycles(cycleRes.data || [])
      setPeriods(periodRes.data || [])
    } catch (err) {
      toast.error('Failed to load appraisal cycles: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Fetch linked periods for a cycle ─────────────────────────
  const fetchLinks = useCallback(async (cycleId) => {
    setLoadingLinks(true)
    try {
      const { data, error } = await supabase
        .from('appraisal_cycle_periods')
        .select('*, appraisal_periods(*)')
        .eq('cycle_id', cycleId)
        .order('created_at')
      if (error) throw error
      setCycleLinks(data || [])
    } catch (err) {
      toast.error('Failed to load linked periods: ' + err.message)
    } finally {
      setLoadingLinks(false)
    }
  }, [])

  // ── Form modal helpers ────────────────────────────────────────
  const openAdd = () => {
    setEditingCycle(null)
    setForm(BLANK_FORM)
    setFormOpen(true)
  }

  const openEdit = (cycle, e) => {
    e?.stopPropagation()
    setEditingCycle(cycle)
    setForm({
      name:        cycle.name        || '',
      year:        cycle.year        || new Date().getFullYear(),
      frequency:   cycle.frequency   || 'Annual',
      start_date:  cycle.start_date  || '',
      end_date:    cycle.end_date    || '',
      description: cycle.description || '',
      status:      cycle.status      || 'Draft',
    })
    setFormOpen(true)
  }

  const closeForm = () => { setFormOpen(false); setEditingCycle(null) }

  // ── Detail modal helpers ──────────────────────────────────────
  const openDetail = (cycle) => {
    setDetailCycle(cycle)
    setLinkPeriodId('')
    setDetailOpen(true)
    fetchLinks(cycle.id)
  }

  const closeDetail = () => { setDetailOpen(false); setDetailCycle(null); setCycleLinks([]) }

  // ── Save cycle ────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim())  return toast.error('Name is required')
    if (!form.year)         return toast.error('Year is required')
    if (!form.start_date)   return toast.error('Start date is required')
    if (!form.end_date)     return toast.error('End date is required')
    if (form.start_date > form.end_date)
      return toast.error('Start date must be before end date')

    setSaving(true)
    try {
      const payload = {
        name:        form.name.trim(),
        year:        Number(form.year),
        frequency:   form.frequency,
        start_date:  form.start_date,
        end_date:    form.end_date,
        description: form.description.trim() || null,
        status:      form.status,
      }

      if (editingCycle) {
        const { error } = await supabase
          .from('appraisal_cycles')
          .update(payload)
          .eq('id', editingCycle.id)
        if (error) throw error
        toast.success('Cycle updated')
      } else {
        const { error } = await supabase
          .from('appraisal_cycles')
          .insert({ ...payload, id: crypto.randomUUID() })
        if (error) throw error
        toast.success('Cycle created')
      }

      closeForm()
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete cycle ──────────────────────────────────────────────
  const askDelete = (cycle, e) => { e?.stopPropagation(); setConfirm({ open: true, item: cycle }) }

  const handleDelete = async () => {
    const cycle = confirm.item
    setConfirm({ open: false, item: null })
    try {
      // Remove all period links first
      await supabase.from('appraisal_cycle_periods').delete().eq('cycle_id', cycle.id)
      const { error } = await supabase
        .from('appraisal_cycles')
        .delete()
        .eq('id', cycle.id)
      if (error) throw error
      toast.success(`"${cycle.name}" deleted`)
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Link a period ─────────────────────────────────────────────
  const handleLinkPeriod = async () => {
    if (!linkPeriodId) return toast.error('Select a period to link')
    setLinkingSaving(true)
    try {
      const { error } = await supabase
        .from('appraisal_cycle_periods')
        .insert({ id: crypto.randomUUID(), cycle_id: detailCycle.id, period_id: linkPeriodId })
      if (error) throw error
      toast.success('Period linked')
      setLinkPeriodId('')
      await fetchLinks(detailCycle.id)
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLinkingSaving(false)
    }
  }

  // ── Unlink a period ───────────────────────────────────────────
  const handleUnlink = async (linkId) => {
    try {
      const { error } = await supabase
        .from('appraisal_cycle_periods')
        .delete()
        .eq('id', linkId)
      if (error) throw error
      toast.success('Period unlinked')
      await fetchLinks(detailCycle.id)
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Status transition ─────────────────────────────────────────
  const handleStatusChange = async (cycle, newStatus) => {
    try {
      const { error } = await supabase
        .from('appraisal_cycles')
        .update({ status: newStatus })
        .eq('id', cycle.id)
      if (error) throw error
      toast.success(`Status changed to ${newStatus}`)
      // Refresh detail if open
      if (detailCycle?.id === cycle.id) {
        setDetailCycle({ ...detailCycle, status: newStatus })
      }
      await fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  const getPeriodCount = (cycle) =>
    Array.isArray(cycle.appraisal_cycle_periods)
      ? cycle.appraisal_cycle_periods.length
      : 0

  // Periods not yet linked to the detail cycle
  const linkedPeriodIds = cycleLinks.map(l => l.period_id)
  const unlinkablePeriods = periods.filter(p => !linkedPeriodIds.includes(p.id))

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Appraisal Cycles"
        subtitle={`${cycles.length} cycle${cycles.length !== 1 ? 's' : ''} · ${cycles.filter(c => c.status === 'Active').length} active`}
      >
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons">add</span> New Cycle
        </button>
      </PageHeader>

      {loading ? (
        <Spinner />
      ) : cycles.length === 0 ? (
        <EmptyState
          icon="loop"
          message="No appraisal cycles yet"
          action={{ label: 'New Cycle', onClick: openAdd }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {cycles.map(cycle => {
            const count = getPeriodCount(cycle)
            return (
              <div
                key={cycle.id}
                onClick={() => openDetail(cycle)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow .15s, border-color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'; e.currentTarget.style.borderColor = 'var(--gold)66' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {/* Status top bar */}
                <div style={{ height: 4, background: statusColor(cycle.status) }} />

                <div style={{ padding: '14px 16px 12px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{cycle.name}</div>
                    <span style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: 'var(--blue)22', color: 'var(--blue)', border: '1px solid var(--blue)44',
                    }}>
                      {cycle.year}
                    </span>
                  </div>

                  {/* Frequency + Status row */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44',
                    }}>
                      {cycle.frequency}
                    </span>
                    <span style={statusBadgeStyle(cycle.status)}>{cycle.status}</span>
                  </div>

                  {/* Date range */}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
                    <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'text-top', marginRight: 4 }}>date_range</span>
                    {cycle.start_date} — {cycle.end_date}
                  </div>

                  {/* Period count chip */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)',
                  }}>
                    {count} period{count !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Card footer */}
                <div
                  style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}
                  onClick={e => e.stopPropagation()}
                >
                  <button className="btn btn-secondary btn-sm" onClick={e => openEdit(cycle, e)}>
                    <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={e => askDelete(cycle, e)}>
                    <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Cycle Modal ──────────────────────────────── */}
      <ModalDialog
        open={formOpen}
        onClose={closeForm}
        title={editingCycle ? `Edit · ${editingCycle.name}` : 'New Appraisal Cycle'}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name *</label>
            <input
              className="form-control"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Annual Review Cycle 2026"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Year *</label>
              <input
                type="number"
                className="form-control"
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                min={2000}
                max={2100}
                placeholder="2026"
              />
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <select
                className="form-control"
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
              >
                {FREQUENCIES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Start Date *</label>
              <input
                type="date"
                className="form-control"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>End Date *</label>
              <input
                type="date"
                className="form-control"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select
              className="form-control"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              className="form-control"
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description…"
            />
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeForm} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingCycle ? 'Update' : 'Create'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Detail Modal ────────────────────────────────────────── */}
      <ModalDialog
        open={detailOpen}
        onClose={closeDetail}
        title={detailCycle ? `${detailCycle.name} · ${detailCycle.year}` : ''}
        size="lg"
      >
        {detailCycle && (
          <div>
            {/* Cycle info strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10, marginBottom: 20,
            }}>
              {[
                { label: 'Status',     value: detailCycle.status,                                  color: statusColor(detailCycle.status) },
                { label: 'Frequency',  value: detailCycle.frequency,                               color: 'var(--purple)' },
                { label: 'Start',      value: detailCycle.start_date || '—',                       color: 'var(--text)' },
                { label: 'End',        value: detailCycle.end_date   || '—',                       color: 'var(--text)' },
                { label: 'Periods',    value: cycleLinks.length,                                   color: 'var(--blue)' },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>{kpi.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: kpi.color, fontFamily: typeof kpi.value === 'number' ? 'var(--mono)' : 'inherit' }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {detailCycle.description && (
              <div style={{
                background: 'var(--surface2)', borderRadius: 8, padding: 12,
                fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 16,
              }}>
                {detailCycle.description}
              </div>
            )}

            {/* Status change buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {detailCycle.status === 'Draft' && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleStatusChange(detailCycle, 'Active')}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>play_arrow</span> Activate
                </button>
              )}
              {detailCycle.status === 'Active' && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--text-dim)' }}
                  onClick={() => handleStatusChange(detailCycle, 'Closed')}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>lock</span> Close Cycle
                </button>
              )}
            </div>

            {/* Linked periods header */}
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
            }}>
              Linked Periods
            </div>

            {/* Link period row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
                <label style={{ fontSize: 12 }}>Add Period</label>
                <select
                  className="form-control"
                  value={linkPeriodId}
                  onChange={e => setLinkPeriodId(e.target.value)}
                >
                  <option value="">Select a period to link…</option>
                  {unlinkablePeriods.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.period_type || p.status})</option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleLinkPeriod}
                disabled={linkingSaving || !linkPeriodId}
                style={{ flexShrink: 0 }}
              >
                {linkingSaving ? 'Linking…' : 'Link Period'}
              </button>
            </div>

            {/* Linked periods table */}
            {loadingLinks ? (
              <Spinner />
            ) : cycleLinks.length === 0 ? (
              <EmptyState icon="link_off" message="No periods linked to this cycle yet" />
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Period Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Dates</th>
                      <th style={{ width: 80 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycleLinks.map(link => {
                      const p = link.appraisal_periods
                      if (!p) return null
                      return (
                        <tr key={link.id}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td style={{ fontSize: 12 }}>{p.period_type || '—'}</td>
                          <td>
                            <StatusBadge status={(p.status || '').toLowerCase()} label={p.status} />
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                            {p.start_date} — {p.end_date}
                          </td>
                          <td>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleUnlink(link.id)}
                              title="Unlink"
                            >
                              <span className="material-icons" style={{ fontSize: 13 }}>link_off</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <ModalActions>
          {detailCycle && (
            <button
              className="btn btn-secondary"
              onClick={e => { closeDetail(); openEdit(detailCycle, e) }}
            >
              <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit Cycle
            </button>
          )}
          <button className="btn btn-secondary" onClick={closeDetail}>Close</button>
        </ModalActions>
      </ModalDialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirm.open}
        onClose={() => setConfirm({ open: false, item: null })}
        onConfirm={handleDelete}
        title="Delete Appraisal Cycle"
        message={`Delete "${confirm.item?.name}"? All period links will also be removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
