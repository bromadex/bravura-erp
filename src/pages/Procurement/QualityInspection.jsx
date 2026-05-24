// src/pages/Procurement/QualityInspection.jsx
// Quality Inspection Dashboard — Procurement module
// Tracks incoming goods quality control, acceptance/rejection and corrective actions.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { useProcurement } from '../../contexts/ProcurementContext'
import { exportXLSX, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const thirtyDaysAgo = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
})()

function emptyForm() {
  return {
    grn_id: '',
    item_name: '',
    item_id: '',
    inspection_date: today,
    inspector_name: '',
    sample_qty: '',
    accepted_qty: '',
    rejected_qty: '',
    rejection_reason: '',
    corrective_action: '',
    remarks: '',
    acceptance_criteria: '',
    status: 'Pending',
    inspection_type: 'Incoming',
  }
}

function StatusBadge({ status }) {
  const COLOR_MAP = {
    Pending:            'var(--yellow)',
    Accepted:           'var(--green)',
    Rejected:           'var(--red)',
    'Partially Accepted': 'var(--teal)',
  }
  const color = COLOR_MAP[status] || 'var(--text-dim)'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      color,
      border: `1px solid ${color}`,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      letterSpacing: '.03em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

export default function QualityInspection() {
  const { goodsReceived } = useProcurement()

  const [inspections, setInspections]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState(thirtyDaysAgo)
  const [filterDateTo, setFilterDateTo]     = useState(today)
  const [searchTerm, setSearchTerm]     = useState('')
  const [viewQI, setViewQI]             = useState(null)
  const [createModal, setCreateModal]   = useState(false)
  const [saving, setSaving]             = useState(false)
  const [form, setForm]                 = useState(emptyForm())

  // ── Load ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('quality_inspections')
      .select('*')
      .order('inspection_date', { ascending: false })
    if (error) {
      toast.error('Failed to load quality inspections')
      console.error(error)
    } else {
      setInspections(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Filtered list ────────────────────────────────────────────
  const filtered = useMemo(() => inspections.filter(qi => {
    if (filterStatus !== 'all' && qi.status !== filterStatus) return false
    if (filterDateFrom && qi.inspection_date < filterDateFrom) return false
    if (filterDateTo   && qi.inspection_date > filterDateTo)   return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      if (
        !qi.item_name?.toLowerCase().includes(q) &&
        !qi.qi_number?.toLowerCase().includes(q) &&
        !qi.inspector_name?.toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [inspections, filterStatus, filterDateFrom, filterDateTo, searchTerm])

  // ── KPI cards (last 30 days of full list) ───────────────────
  const kpi = useMemo(() => {
    const recent = inspections.filter(qi => qi.inspection_date >= thirtyDaysAgo)
    const total  = recent.length
    const accepted   = recent.filter(qi => qi.status === 'Accepted').length
    const partial    = recent.filter(qi => qi.status === 'Partially Accepted').length
    const rejected   = recent.filter(qi => qi.status === 'Rejected').length
    const pending    = inspections.filter(qi => qi.status === 'Pending').length
    const acceptRate = total > 0 ? ((accepted + partial) / total * 100).toFixed(1) + '%' : '—'
    const rejectRate = total > 0 ? (rejected / total * 100).toFixed(1) + '%' : '—'
    return { total, acceptRate, rejectRate, pending }
  }, [inspections])

  // ── GRN lookup helper ────────────────────────────────────────
  const grnById = useMemo(() => {
    const map = {}
    for (const g of goodsReceived) map[g.id] = g
    return map
  }, [goodsReceived])

  // ── Create ───────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const qiNumber = `QI-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
      const { error } = await supabase.from('quality_inspections').insert([{
        id: crypto.randomUUID(),
        qi_number: qiNumber,
        ...form,
        sample_qty:   Number(form.sample_qty)   || 0,
        accepted_qty: Number(form.accepted_qty) || 0,
        rejected_qty: Number(form.rejected_qty) || 0,
        parameters:   [],
        docstatus:    0,
        created_by:   '',
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      }])
      if (error) throw error
      toast.success(`Quality inspection ${qiNumber} created`)
      setCreateModal(false)
      setForm(emptyForm())
      loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Export ───────────────────────────────────────────────────
  const handleExport = () => {
    if (!filtered.length) { toast.error('No records to export'); return }
    exportXLSX(
      filtered.map(qi => ({
        'QI No':           qi.qi_number,
        'Type':            qi.inspection_type,
        'Item':            qi.item_name,
        'Batch No':        qi.batch_no || '',
        'Inspector':       qi.inspector_name,
        'Date':            qi.inspection_date,
        'Sample Qty':      qi.sample_qty,
        'Accepted Qty':    qi.accepted_qty,
        'Rejected Qty':    qi.rejected_qty,
        'Status':          qi.status,
        'Rejection Reason': qi.rejection_reason || '',
        'Corrective Action': qi.corrective_action || '',
        'Remarks':         qi.remarks || '',
      })),
      `QualityInspections_${dateTag()}`,
      'Quality Inspections',
    )
    toast.success('Exported')
  }

  // ── Reset form when modal opens ──────────────────────────────
  useEffect(() => {
    if (createModal) setForm(emptyForm())
  }, [createModal])

  const needsReason = form.status === 'Rejected' || form.status === 'Partially Accepted'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        title="Quality Inspections"
        subtitle="Incoming goods quality control and rejection tracking"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          <span className="material-icons">add</span> New Inspection
        </button>
      </PageHeader>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, marginTop: 16 }}>
        <KPICard
          label="Total Inspections (30d)"
          value={kpi.total}
          icon="science"
          color="blue"
        />
        <KPICard
          label="Acceptance Rate"
          value={kpi.acceptRate}
          icon="thumb_up"
          color="green"
        />
        <KPICard
          label="Rejection Rate"
          value={kpi.rejectRate}
          icon="thumb_down"
          color="red"
        />
        <KPICard
          label="Pending Inspections"
          value={kpi.pending}
          icon="hourglass_empty"
          color="yellow"
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>From</label>
          <input
            type="date"
            className="form-control"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>To</label>
          <input
            type="date"
            className="form-control"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 170 }}>
          <label>Status</label>
          <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option>Pending</option>
            <option>Accepted</option>
            <option>Rejected</option>
            <option>Partially Accepted</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
          <label>Search</label>
          <input
            className="form-control"
            placeholder="Item, QI No, Inspector…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setFilterStatus('all')
            setFilterDateFrom(thirtyDaysAgo)
            setFilterDateTo(today)
            setSearchTerm('')
          }}
        >
          Clear
        </button>
      </div>

      {/* ── Main Table ─────────────────────────────────────────── */}
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>QI No</th>
                <th>GRN</th>
                <th>Item</th>
                <th>Inspector</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Sample Qty</th>
                <th style={{ textAlign: 'right' }}>Accepted</th>
                <th style={{ textAlign: 'right' }}>Rejected</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="10">
                    <EmptyState
                      icon="science"
                      message='No quality inspections found. Click "New Inspection" to create one.'
                    />
                  </td>
                </tr>
              ) : filtered.map(qi => {
                const grn = grnById[qi.grn_id]
                return (
                  <tr key={qi.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                      {qi.qi_number}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                      {grn ? grn.grn_number : qi.grn_id ? qi.grn_id.slice(-8) : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{qi.item_name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{qi.inspector_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{qi.inspection_date}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtNum(qi.sample_qty)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>
                      {fmtNum(qi.accepted_qty)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: qi.rejected_qty > 0 ? 'var(--red)' : 'var(--text-dim)', fontWeight: qi.rejected_qty > 0 ? 700 : 400 }}>
                      {fmtNum(qi.rejected_qty)}
                    </td>
                    <td><StatusBadge status={qi.status} /></td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewQI(qi)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── View QI Modal ──────────────────────────────────────── */}
      {viewQI && (() => {
        const grn    = grnById[viewQI.grn_id]
        const params = Array.isArray(viewQI.parameters) ? viewQI.parameters : []
        return (
          <ModalDialog
            open
            title={`Quality Inspection · ${viewQI.qi_number}`}
            onClose={() => setViewQI(null)}
            size="lg"
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: 'var(--gold)' }}>
                {viewQI.qi_number}
              </span>
              <span style={{
                padding: '2px 10px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--blue)',
                border: '1px solid var(--blue)',
                background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
              }}>
                {viewQI.inspection_type}
              </span>
              <StatusBadge status={viewQI.status} />
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
              {[
                ['Item',          viewQI.item_name || '—'],
                ['GRN',           grn ? `${grn.grn_number} — ${grn.supplier_name}` : viewQI.grn_id || '—'],
                ['Inspector',     viewQI.inspector_name || '—'],
                ['Inspection Date', viewQI.inspection_date || '—'],
                ['Batch No',      viewQI.batch_no || '—'],
                ['Acceptance Criteria', viewQI.acceptance_criteria || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Qty breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Sample Qty</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                  {fmtNum(viewQI.sample_qty)}
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', textAlign: 'center', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Accepted</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                  {fmtNum(viewQI.accepted_qty)}
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', textAlign: 'center', border: `1px solid color-mix(in srgb, var(--red) ${viewQI.rejected_qty > 0 ? 30 : 0}%, transparent)` }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Rejected</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', color: viewQI.rejected_qty > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                  {fmtNum(viewQI.rejected_qty)}
                </div>
              </div>
            </div>

            {/* Parameters table */}
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>
              Inspection Parameters
            </div>
            {params.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, background: 'var(--surface2)', borderRadius: 8, marginBottom: 16 }}>
                <span className="material-icons" style={{ display: 'block', fontSize: 28, marginBottom: 4, opacity: .5 }}>tune</span>
                No parameters recorded
              </div>
            ) : (
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th style={{ textAlign: 'right' }}>Min</th>
                      <th style={{ textAlign: 'right' }}>Max</th>
                      <th style={{ textAlign: 'right' }}>Actual</th>
                      <th>UOM</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{p.min_value ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{p.max_value ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: 700 }}>{p.actual_value ?? '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{p.uom || '—'}</td>
                        <td>
                          {p.pass === true || p.pass === 'true' ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-icons" style={{ fontSize: 14 }}>check_circle</span> Pass
                            </span>
                          ) : p.pass === false || p.pass === 'false' ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-icons" style={{ fontSize: 14 }}>cancel</span> Fail
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rejection / corrective / remarks */}
            {(viewQI.rejection_reason || viewQI.corrective_action || viewQI.remarks) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 16 }}>
                {viewQI.rejection_reason && (
                  <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Rejection Reason</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{viewQI.rejection_reason}</div>
                  </div>
                )}
                {viewQI.corrective_action && (
                  <div style={{ padding: '10px 14px', background: 'color-mix(in srgb, var(--yellow) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--yellow) 25%, transparent)', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Corrective Action</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{viewQI.corrective_action}</div>
                  </div>
                )}
                {viewQI.remarks && (
                  <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>Remarks</div>
                    <div style={{ fontSize: 13 }}>{viewQI.remarks}</div>
                  </div>
                )}
              </div>
            )}

            <ModalActions>
              <button className="btn btn-secondary" onClick={() => setViewQI(null)}>Close</button>
            </ModalActions>
          </ModalDialog>
        )
      })()}

      {/* ── Create QI Modal ────────────────────────────────────── */}
      {createModal && (
        <ModalDialog
          open
          title="New Quality Inspection"
          onClose={() => setCreateModal(false)}
          size="lg"
        >
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
              {/* GRN */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Source GRN</label>
                <select
                  className="form-control"
                  value={form.grn_id}
                  onChange={e => setForm(f => ({ ...f, grn_id: e.target.value }))}
                >
                  <option value="">— Select GRN (optional) —</option>
                  {goodsReceived.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.grn_number || g.id.slice(-8)} — {g.supplier_name}{g.grn_date ? ` (${g.grn_date})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item name */}
              <div className="form-group">
                <label>Item Name *</label>
                <input
                  required
                  className="form-control"
                  placeholder="e.g. Steel Rod 10mm"
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                />
              </div>

              {/* Inspector name */}
              <div className="form-group">
                <label>Inspector Name *</label>
                <input
                  required
                  className="form-control"
                  placeholder="Inspector's full name"
                  value={form.inspector_name}
                  onChange={e => setForm(f => ({ ...f, inspector_name: e.target.value }))}
                />
              </div>

              {/* Inspection date */}
              <div className="form-group">
                <label>Inspection Date *</label>
                <input
                  required
                  type="date"
                  className="form-control"
                  value={form.inspection_date}
                  onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))}
                />
              </div>

              {/* Inspection type */}
              <div className="form-group">
                <label>Inspection Type</label>
                <select
                  className="form-control"
                  value={form.inspection_type}
                  onChange={e => setForm(f => ({ ...f, inspection_type: e.target.value }))}
                >
                  <option>Incoming</option>
                  <option>In-Process</option>
                  <option>Final</option>
                  <option>Outgoing</option>
                </select>
              </div>

              {/* Sample qty */}
              <div className="form-group">
                <label>Sample Qty *</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  className="form-control"
                  placeholder="0"
                  value={form.sample_qty}
                  onChange={e => setForm(f => ({ ...f, sample_qty: e.target.value }))}
                />
              </div>

              {/* Accepted qty */}
              <div className="form-group">
                <label>Accepted Qty</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="form-control"
                  placeholder="0"
                  value={form.accepted_qty}
                  onChange={e => setForm(f => ({ ...f, accepted_qty: e.target.value }))}
                />
              </div>

              {/* Rejected qty */}
              <div className="form-group">
                <label>Rejected Qty</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="form-control"
                  placeholder="0"
                  value={form.rejected_qty}
                  onChange={e => setForm(f => ({ ...f, rejected_qty: e.target.value }))}
                />
              </div>

              {/* Status */}
              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-control"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option>Pending</option>
                  <option>Accepted</option>
                  <option>Rejected</option>
                  <option>Partially Accepted</option>
                </select>
              </div>

              {/* Acceptance criteria */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Acceptance Criteria</label>
                <input
                  className="form-control"
                  placeholder="e.g. Dimension ±0.5mm, no visible cracks"
                  value={form.acceptance_criteria}
                  onChange={e => setForm(f => ({ ...f, acceptance_criteria: e.target.value }))}
                />
              </div>

              {/* Rejection reason — conditional */}
              {needsReason && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Rejection Reason {form.status === 'Rejected' ? '*' : ''}</label>
                  <textarea
                    required={form.status === 'Rejected'}
                    className="form-control"
                    rows={2}
                    placeholder="Describe the reason for rejection…"
                    value={form.rejection_reason}
                    onChange={e => setForm(f => ({ ...f, rejection_reason: e.target.value }))}
                  />
                </div>
              )}

              {/* Corrective action — conditional */}
              {needsReason && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Corrective Action</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Corrective or preventive action to be taken…"
                    value={form.corrective_action}
                    onChange={e => setForm(f => ({ ...f, corrective_action: e.target.value }))}
                  />
                </div>
              )}

              {/* Remarks */}
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Remarks</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Additional notes…"
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </div>

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <span className="material-icons">save</span>
                {saving ? 'Saving…' : 'Create Inspection'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
