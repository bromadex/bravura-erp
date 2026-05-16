// src/pages/Procurement/SupplierPerformance.jsx
//
// Supplier Scorecard + Performance Log
// Section A: per-supplier composite score computed from POs, GRNs and performance_log
// Section B: raw event log with manual log entry modal

import { useState, useEffect, useMemo } from 'react'
import { useProcurement } from '../../contexts/ProcurementContext'
import { PageHeader, ModalDialog, ModalActions, StatusBadge } from '../../components/ui'
import toast from 'react-hot-toast'
import { fmtNum, fmtDate, exportXLSX, dateTag } from '../../engine/reportingEngine'
import { supabase } from '../../lib/supabase'

const EVENT_TYPES = [
  'delivery_on_time',
  'delivery_late',
  'item_rejected',
  'price_variance',
  'quality_issue',
  'partial_delivery',
]

const EVENT_META = {
  delivery_on_time: { icon: 'check_circle', color: 'var(--green)',  label: 'On Time'          },
  delivery_late:    { icon: 'timer',        color: 'var(--red)',    label: 'Late Delivery'     },
  item_rejected:    { icon: 'cancel',       color: 'var(--red)',    label: 'Item Rejected'     },
  price_variance:   { icon: 'trending_up',  color: 'var(--yellow)', label: 'Price Variance'    },
  quality_issue:    { icon: 'warning',      color: 'var(--yellow)', label: 'Quality Issue'     },
  partial_delivery: { icon: 'pie_chart',    color: 'var(--teal)',   label: 'Partial Delivery'  },
}

const RATING_BADGE = { A: 'badge-green', B: 'badge-blue', C: 'badge-yellow', D: 'badge-red' }

function ratingFromScore(score) {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

function computeScore({ onTimePct, rejectionRatePct, qualityAvg, priceVariancePct }) {
  const priceStability = Math.max(0, 100 - Math.abs(priceVariancePct))
  return (
    onTimePct * 0.4 +
    (100 - rejectionRatePct) * 0.2 +
    (qualityAvg / 5) * 100 * 0.2 +
    priceStability * 0.2
  )
}

const today = new Date().toISOString().split('T')[0]

export default function SupplierPerformance() {
  const { suppliers, purchaseOrders, goodsReceived } = useProcurement()

  const [perfLog,     setPerfLog]     = useState([])
  const [logLoading,  setLogLoading]  = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)   // supplier_id

  // Log entry modal
  const [logModal,   setLogModal]    = useState(false)
  const [logSaving,  setLogSaving]   = useState(false)
  const [logForm,    setLogForm]     = useState({
    supplier_id:        '',
    supplier_name:      '',
    event_type:         'delivery_on_time',
    event_date:         today,
    po_id:              '',
    delay_days:         '',
    ordered_qty:        '',
    received_qty:       '',
    rejected_qty:       '',
    rejection_reason:   '',
    quality_score:      '',
    po_unit_price:      '',
    invoice_unit_price: '',
    price_variance_pct: '',
    notes:              '',
  })

  // Fetch performance log
  useEffect(() => {
    setLogLoading(true)
    Promise.resolve(
      supabase.from('supplier_performance_log').select('*').order('event_date', { ascending: false }).limit(50)
    ).catch(() => ({ data: [] }))
      .then(({ data }) => {
        setPerfLog(data || [])
        setLogLoading(false)
      })
  }, [])

  const refreshLog = async () => {
    const { data } = await Promise.resolve(
      supabase.from('supplier_performance_log').select('*').order('event_date', { ascending: false }).limit(50)
    ).catch(() => ({ data: [] }))
    setPerfLog(data || [])
  }

  // ── Scorecard computation ──────────────────────────────────
  const scorecards = useMemo(() => {
    const suppliersWithPOs = suppliers.filter(s =>
      purchaseOrders.some(po => po.supplier_id === s.id || po.supplier_name === s.name)
    )

    return suppliersWithPOs.map(supplier => {
      const sPOs = purchaseOrders.filter(
        po => po.supplier_id === supplier.id || po.supplier_name === supplier.name
      )
      const deliveredPOs = sPOs.filter(
        po => po.actual_delivery_date && po.delivery_date
      )
      const onTimePOs = deliveredPOs.filter(
        po => po.actual_delivery_date <= po.delivery_date
      )
      const onTimePct = deliveredPOs.length > 0
        ? (onTimePOs.length / deliveredPOs.length) * 100
        : 0

      // GRN data for this supplier
      const sGRNs = goodsReceived.filter(
        g => g.supplier_id === supplier.id || g.supplier_name === supplier.name
      )
      let totalReceived = 0
      let totalRejected = 0
      let qualityScores = []
      for (const grn of sGRNs) {
        const items = typeof grn.items === 'string' ? JSON.parse(grn.items || '[]') : (grn.items || [])
        for (const it of items) {
          totalReceived += (it.received || it.received_qty || 0)
          totalRejected += (it.rejected || it.rejected_qty || 0)
        }
        if (grn.quality_score != null) qualityScores.push(Number(grn.quality_score))
      }
      const rejectionRatePct = totalReceived > 0 ? (totalRejected / totalReceived) * 100 : 0
      const qualityAvg = qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 3 // neutral default

      // Price variance from log
      const sLog = perfLog.filter(
        e => e.supplier_id === supplier.id || e.supplier_name === supplier.name
      )
      const priceEvents = sLog.filter(e => e.price_variance_pct != null)
      const priceVariancePct = priceEvents.length > 0
        ? priceEvents.reduce((s, e) => s + Number(e.price_variance_pct), 0) / priceEvents.length
        : 0

      const score  = computeScore({ onTimePct, rejectionRatePct, qualityAvg, priceVariancePct })
      const rating = ratingFromScore(score)

      const recentEvents = sLog.slice(0, 5)

      return {
        supplier,
        totalPOs:        sPOs.length,
        deliveredPOs:    deliveredPOs.length,
        onTimePOs:       onTimePOs.length,
        onTimePct,
        rejectionRatePct,
        qualityAvg,
        priceVariancePct,
        score,
        rating,
        recentEvents,
        poList: sPOs,
      }
    }).sort((a, b) => b.score - a.score)
  }, [suppliers, purchaseOrders, goodsReceived, perfLog])

  // ── Save log event ─────────────────────────────────────────
  const handleLogSave = async (e) => {
    e.preventDefault()
    if (!logForm.supplier_id) return toast.error('Select a supplier')
    setLogSaving(true)
    try {
      const payload = {
        supplier_id:    logForm.supplier_id,
        supplier_name:  logForm.supplier_name,
        event_type:     logForm.event_type,
        event_date:     logForm.event_date,
        notes:          logForm.notes || null,
        created_at:     new Date().toISOString(),
      }
      if (logForm.po_id)              payload.po_id              = logForm.po_id
      if (logForm.delay_days)         payload.delay_days         = Number(logForm.delay_days)
      if (logForm.ordered_qty)        payload.ordered_qty        = Number(logForm.ordered_qty)
      if (logForm.received_qty)       payload.received_qty       = Number(logForm.received_qty)
      if (logForm.rejected_qty)       payload.rejected_qty       = Number(logForm.rejected_qty)
      if (logForm.rejection_reason)   payload.rejection_reason   = logForm.rejection_reason
      if (logForm.quality_score)      payload.quality_score      = Number(logForm.quality_score)
      if (logForm.po_unit_price)      payload.po_unit_price      = Number(logForm.po_unit_price)
      if (logForm.invoice_unit_price) payload.invoice_unit_price = Number(logForm.invoice_unit_price)
      if (logForm.price_variance_pct) payload.price_variance_pct = Number(logForm.price_variance_pct)

      const { error } = await supabase.from('supplier_performance_log').insert([payload])
      if (error) throw error

      toast.success('Performance event logged')
      setLogModal(false)
      await refreshLog()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLogSaving(false)
    }
  }

  // ── Export ─────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(
      scorecards.map(sc => ({
        Supplier:       sc.supplier.name,
        'Total POs':    sc.totalPOs,
        'On-Time %':    sc.onTimePct.toFixed(1),
        'Rejection %':  sc.rejectionRatePct.toFixed(1),
        'Avg Quality':  sc.qualityAvg.toFixed(2),
        'Price Var %':  sc.priceVariancePct.toFixed(2),
        Score:          sc.score.toFixed(1),
        Rating:         sc.rating,
      })),
      `SupplierScorecard_${dateTag()}`,
      'Scorecard'
    )
    toast.success('Exported')
  }

  // Event detail string
  function eventDetail(ev) {
    switch (ev.event_type) {
      case 'delivery_late':    return `Delay: ${ev.delay_days ?? '?'} day(s)`
      case 'item_rejected':    return `Rejected: ${ev.rejected_qty ?? '?'} of ${ev.received_qty ?? '?'}`
      case 'price_variance':   return `Variance: ${ev.price_variance_pct != null ? ev.price_variance_pct.toFixed(1) + '%' : '?'}`
      case 'quality_issue':    return `Quality: ${ev.quality_score ?? '?'}/5`
      case 'partial_delivery': return `Rcvd: ${ev.received_qty ?? '?'} / Ord: ${ev.ordered_qty ?? '?'}`
      default:                 return ev.notes || '—'
    }
  }

  return (
    <div>
      <PageHeader
        title="Supplier Performance"
        subtitle="Scorecards, delivery tracking and quality metrics"
      >
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button className="btn btn-primary" onClick={() => {
          setLogForm({
            supplier_id: '', supplier_name: '', event_type: 'delivery_on_time',
            event_date: today, po_id: '', delay_days: '', ordered_qty: '',
            received_qty: '', rejected_qty: '', rejection_reason: '',
            quality_score: '', po_unit_price: '', invoice_unit_price: '',
            price_variance_pct: '', notes: '',
          })
          setLogModal(true)
        }}>
          <span className="material-icons">add</span> Log Event
        </button>
      </PageHeader>

      {/* ── Section A: Scorecard ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
          Supplier Scorecard
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Total POs</th>
                <th>On-Time %</th>
                <th>Rejection %</th>
                <th>Avg Quality</th>
                <th>Price Var %</th>
                <th>Score</th>
                <th>Rating</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
                  No suppliers with purchase orders
                </td></tr>
              ) : scorecards.map(sc => (
                <>
                  <tr
                    key={sc.supplier.id}
                    style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e  => e.currentTarget.style.background = ''}
                    onClick={() => setExpandedRow(expandedRow === sc.supplier.id ? null : sc.supplier.id)}
                  >
                    <td style={{ fontWeight: 600 }}>
                      <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: 'var(--text-dim)' }}>
                        {expandedRow === sc.supplier.id ? 'expand_less' : 'expand_more'}
                      </span>
                      {sc.supplier.name}
                    </td>
                    <td className="td-mono">{sc.totalPOs}</td>
                    <td className="td-mono" style={{ color: sc.onTimePct >= 80 ? 'var(--green)' : sc.onTimePct >= 60 ? 'var(--yellow)' : 'var(--red)' }}>
                      {sc.deliveredPOs > 0 ? sc.onTimePct.toFixed(1) + '%' : '—'}
                    </td>
                    <td className="td-mono" style={{ color: sc.rejectionRatePct > 5 ? 'var(--red)' : sc.rejectionRatePct > 2 ? 'var(--yellow)' : 'var(--green)' }}>
                      {sc.rejectionRatePct.toFixed(1)}%
                    </td>
                    <td className="td-mono">
                      {sc.qualityAvg.toFixed(1)}<span style={{ color: 'var(--text-dim)', fontSize: 11 }}>/5</span>
                    </td>
                    <td className="td-mono" style={{ color: Math.abs(sc.priceVariancePct) > 5 ? 'var(--yellow)' : 'var(--text)' }}>
                      {sc.priceVariancePct > 0 ? '+' : ''}{sc.priceVariancePct.toFixed(1)}%
                    </td>
                    <td className="td-mono" style={{ fontWeight: 700 }}>{sc.score.toFixed(1)}</td>
                    <td>
                      <span className={`badge ${RATING_BADGE[sc.rating]}`}>{sc.rating}</span>
                    </td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setLogForm(f => ({ ...f, supplier_id: sc.supplier.id, supplier_name: sc.supplier.name }))
                          setLogModal(true)
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: 14 }}>add</span> Log
                      </button>
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {expandedRow === sc.supplier.id && (
                    <tr key={`${sc.supplier.id}-expand`}>
                      <td colSpan="9" style={{ padding: 0, background: 'var(--surface)' }}>
                        <div style={{ padding: 16 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* PO delivery detail */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                PO Delivery History
                              </div>
                              {sc.poList.length === 0 ? (
                                <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>No POs</p>
                              ) : (
                                <table className="stock-table" style={{ fontSize: 12 }}>
                                  <thead>
                                    <tr><th>PO #</th><th>Expected</th><th>Actual</th><th>Status</th></tr>
                                  </thead>
                                  <tbody>
                                    {sc.poList.slice(0, 8).map(po => {
                                      const isLate = po.actual_delivery_date && po.delivery_date && po.actual_delivery_date > po.delivery_date
                                      return (
                                        <tr key={po.id}>
                                          <td className="td-mono" style={{ color: 'var(--gold)' }}>{po.po_number}</td>
                                          <td>{po.delivery_date || '—'}</td>
                                          <td style={{ color: isLate ? 'var(--red)' : po.actual_delivery_date ? 'var(--green)' : 'var(--text-dim)' }}>
                                            {po.actual_delivery_date || '—'}
                                          </td>
                                          <td><StatusBadge status={po.status} /></td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>

                            {/* Last 5 events */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Last 5 Log Events
                              </div>
                              {sc.recentEvents.length === 0 ? (
                                <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>No events logged</p>
                              ) : sc.recentEvents.map((ev, i) => {
                                const meta = EVENT_META[ev.event_type] || { icon: 'info', color: 'var(--text-dim)', label: ev.event_type }
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                    <span className="material-icons" style={{ fontSize: 16, color: meta.color }}>{meta.icon}</span>
                                    <span style={{ flex: 1 }}>{meta.label}</span>
                                    <span style={{ color: 'var(--text-dim)' }}>{ev.event_date}</span>
                                    <span style={{ color: meta.color }}>{eventDetail(ev)}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section B: Performance Log ── */}
      <div className="card">
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
          Performance Log <span style={{ fontWeight: 400, color: 'var(--text-dim)', fontSize: 12 }}>— last 50 events</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Event Type</th>
                <th>PO Ref</th>
                <th>Details</th>
                <th>Quality Score</th>
              </tr>
            </thead>
            <tbody>
              {logLoading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</td></tr>
              ) : perfLog.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No events logged yet</td></tr>
              ) : perfLog.map(ev => {
                const meta = EVENT_META[ev.event_type] || { icon: 'info', color: 'var(--text-dim)', label: ev.event_type }
                return (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(ev.event_date)}</td>
                    <td style={{ fontWeight: 600 }}>{ev.supplier_name}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="material-icons" style={{ fontSize: 15, color: meta.color }}>{meta.icon}</span>
                        <span style={{ color: meta.color, fontSize: 12 }}>{meta.label}</span>
                      </span>
                    </td>
                    <td className="td-mono" style={{ color: 'var(--gold)' }}>{ev.po_id || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{eventDetail(ev)}{ev.notes ? ` — ${ev.notes}` : ''}</td>
                    <td className="td-mono">
                      {ev.quality_score != null ? (
                        <span style={{ color: ev.quality_score >= 4 ? 'var(--green)' : ev.quality_score >= 3 ? 'var(--yellow)' : 'var(--red)' }}>
                          {ev.quality_score}/5
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Log Event Modal ── */}
      <ModalDialog
        open={logModal}
        onClose={() => setLogModal(false)}
        title="Log Performance Event"
        size="lg"
      >
        <form onSubmit={handleLogSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Supplier *</label>
              <select
                className="form-control"
                required
                value={logForm.supplier_id}
                onChange={e => {
                  const s = suppliers.find(x => x.id === e.target.value)
                  setLogForm(f => ({ ...f, supplier_id: e.target.value, supplier_name: s?.name || '' }))
                }}
              >
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Event Type *</label>
              <select
                className="form-control"
                value={logForm.event_type}
                onChange={e => setLogForm(f => ({ ...f, event_type: e.target.value }))}
              >
                {EVENT_TYPES.map(t => (
                  <option key={t} value={t}>{EVENT_META[t]?.label || t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Event Date *</label>
              <input
                type="date"
                className="form-control"
                required
                value={logForm.event_date}
                onChange={e => setLogForm(f => ({ ...f, event_date: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>PO Reference (optional)</label>
              <select
                className="form-control"
                value={logForm.po_id}
                onChange={e => setLogForm(f => ({ ...f, po_id: e.target.value }))}
              >
                <option value="">— None —</option>
                {purchaseOrders
                  .filter(po => !logForm.supplier_id || po.supplier_id === logForm.supplier_id || po.supplier_name === logForm.supplier_name)
                  .map(po => <option key={po.id} value={po.id}>{po.po_number}</option>)
                }
              </select>
            </div>

            {/* Late delivery fields */}
            {logForm.event_type === 'delivery_late' && (
              <div className="form-group">
                <label>Delay Days</label>
                <input
                  type="number"
                  min="1"
                  className="form-control"
                  value={logForm.delay_days}
                  onChange={e => setLogForm(f => ({ ...f, delay_days: e.target.value }))}
                />
              </div>
            )}

            {/* Rejection / partial delivery fields */}
            {(logForm.event_type === 'item_rejected' || logForm.event_type === 'partial_delivery') && (
              <>
                <div className="form-group">
                  <label>Ordered Qty</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={logForm.ordered_qty}
                    onChange={e => setLogForm(f => ({ ...f, ordered_qty: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Received Qty</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={logForm.received_qty}
                    onChange={e => setLogForm(f => ({ ...f, received_qty: e.target.value }))}
                  />
                </div>
                {logForm.event_type === 'item_rejected' && (
                  <>
                    <div className="form-group">
                      <label>Rejected Qty</label>
                      <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={logForm.rejected_qty}
                        onChange={e => setLogForm(f => ({ ...f, rejected_qty: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Rejection Reason</label>
                      <input
                        className="form-control"
                        value={logForm.rejection_reason}
                        onChange={e => setLogForm(f => ({ ...f, rejection_reason: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Quality score */}
            {(logForm.event_type === 'quality_issue' || logForm.event_type === 'delivery_on_time') && (
              <div className="form-group">
                <label>Quality Score (1–5)</label>
                <select
                  className="form-control"
                  value={logForm.quality_score}
                  onChange={e => setLogForm(f => ({ ...f, quality_score: e.target.value }))}
                >
                  <option value="">— optional —</option>
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}

            {/* Price variance */}
            {logForm.event_type === 'price_variance' && (
              <>
                <div className="form-group">
                  <label>PO Unit Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={logForm.po_unit_price}
                    onChange={e => setLogForm(f => ({ ...f, po_unit_price: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Invoice Unit Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={logForm.invoice_unit_price}
                    onChange={e => setLogForm(f => ({ ...f, invoice_unit_price: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Price Variance % (+ve = charged more)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={logForm.price_variance_pct}
                    onChange={e => setLogForm(f => ({ ...f, price_variance_pct: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Notes</label>
              <textarea
                className="form-control"
                rows="2"
                value={logForm.notes}
                onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setLogModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={logSaving}>
              <span className="material-icons">save</span>
              {logSaving ? 'Saving…' : 'Save Event'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
