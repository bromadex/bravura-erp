// src/pages/Fuel/DipstickLog.jsx
//
// FIXES:
// 1. Column name mismatch — data is saved as `error_pct` but the table
//    was reading `r.error_percent` (undefined). Fixed to `r.error_pct`.
//
// 2. Error % formula clarified:
//    error_liters = flowmeter_issued - actual_issued
//      (positive = flowmeter over-counts, negative = flowmeter under-counts)
//    error_pct = (error_liters / actual_issued) * 100
//    This is the standard tank reconciliation formula.
//
// 3. Added colour-coded error badge: green ≤2%, yellow ≤5%, red >5%

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function DipstickLog() {
  const { dipstickLog, addDipstick, getLitresFromCm, loading, fetchAll } = useFuel()
  const { user }   = useAuth()
  const canEdit    = useCanEdit('fuel', 'dipstick')

  const [showModal,    setShowModal]    = useState(false)
  const [calculation,  setCalculation]  = useState(null)
  const [form, setForm] = useState({
    date:      new Date().toISOString().split('T')[0],
    dip_start: '',
    dip_end:   '',
    fm_start:  '',
    fm_end:    '',
    notes:     '',
  })

  // ── Calculation helper ────────────────────────────────────
  const calcValues = (f = form) => {
    const startCm = parseFloat(f.dip_start)
    const endCm   = parseFloat(f.dip_end)
    if (isNaN(startCm) || isNaN(endCm)) return null

    const startL  = getLitresFromCm(startCm)
    const endL    = getLitresFromCm(endCm)
    const actual  = startL - endL                         // litres consumed per dipstick

    const fmStart = parseFloat(f.fm_start) || 0
    const fmEnd   = parseFloat(f.fm_end)   || 0
    const flow    = fmEnd - fmStart                       // litres counted by flowmeter

    // error_liters: difference between what the meter says and what the tank says
    // positive = meter over-counted; negative = meter under-counted
    const error    = flow - actual
    // error_pct: percentage of actual consumption
    // ✅ FIX: was (error / actual) * 100 — same formula, but column name was wrong in table
    const errorPct = actual !== 0 ? (error / actual) * 100 : 0

    return { startL, endL, actual, flow, error, errorPct }
  }

  const handleCalculate = () => {
    const result = calcValues()
    if (result) setCalculation(result)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date) return toast.error('Enter date')
    const startCm = parseFloat(form.dip_start)
    const endCm   = parseFloat(form.dip_end)
    if (isNaN(startCm) || isNaN(endCm)) return toast.error('Enter dipstick readings')

    const c = calcValues()
    if (!c) return

    try {
      await addDipstick({
        date:              form.date,
        dip_start:         startCm,
        dip_end:           endCm,
        fuel_start:        c.startL,
        fuel_end:          c.endL,
        fm_start:          parseFloat(form.fm_start) || 0,
        fm_end:            parseFloat(form.fm_end)   || 0,
        flowmeter_issued:  c.flow,
        actual_issued:     c.actual,
        error_liters:      c.error,
        error_pct:         c.errorPct,   // ✅ saved as error_pct (not error_percent)
        done_by:           user?.full_name || user?.username,
        notes:             form.notes,
      })
      toast.success('Dipstick record saved')
      setShowModal(false)
      setForm({ date: new Date().toISOString().split('T')[0], dip_start: '', dip_end: '', fm_start: '', fm_end: '', notes: '' })
      setCalculation(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  // ── Error colour helper ───────────────────────────────────
  const errorColor = (pct) => {
    const abs = Math.abs(pct || 0)
    if (abs <= 2) return 'var(--green)'
    if (abs <= 5) return 'var(--yellow)'
    return 'var(--red)'
  }

  const errorBadge = (pct) => {
    const abs = Math.abs(pct || 0)
    const cls = abs <= 2 ? 'badge-green' : abs <= 5 ? 'badge-yellow' : 'badge-red'
    return <span className={`badge ${cls}`}>{(pct || 0).toFixed(1)}%</span>
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dipstick Log</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <span className="material-icons">straighten</span> New Record
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 11, color: 'var(--text-dim)' }}>
        <span><span className="badge badge-green">≤2%</span> Acceptable</span>
        <span><span className="badge badge-yellow">2–5%</span> Investigate</span>
        <span><span className="badge badge-red">&gt;5%</span> Significant loss</span>
        <span style={{ marginLeft: 8 }}>Error = Flowmeter − Actual. Positive = meter over-counts. Negative = meter under-counts.</span>
      </div>

      <div className="table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Dip Start (cm)</th>
              <th>Dip End (cm)</th>
              <th>Tank Start (L)</th>
              <th>Tank End (L)</th>
              <th>Actual Issued (L)</th>
              <th>Flowmeter (L)</th>
              <th>Error (L)</th>
              <th>Error %</th>
              <th>Done By</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="11" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
            ) : dipstickLog.length === 0 ? (
              <tr><td colSpan="11" className="empty-state">No dipstick records yet</td></tr>
            ) : dipstickLog.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.dip_start}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.dip_end}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.fuel_start?.toFixed(0)}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.fuel_end?.toFixed(0)}</td>
                <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.actual_issued?.toFixed(0)}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.flowmeter_issued?.toFixed(0)}</td>
                <td style={{ fontFamily: 'var(--mono)', color: errorColor(r.error_pct) }}>
                  {r.error_liters > 0 ? '+' : ''}{r.error_liters?.toFixed(1)}
                </td>
                {/* ✅ FIX: was r.error_percent (undefined) — now r.error_pct */}
                <td>{errorBadge(r.error_pct)}</td>
                <td style={{ fontSize: 12 }}>{r.done_by || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New <span>Dipstick Record</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Date *</label>
                <input type="date" className="form-control" required
                  value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '12px 0 8px' }}>
                Dipstick Readings
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start (cm) — before issuance</label>
                  <input type="number" step="0.01" min="0" className="form-control"
                    value={form.dip_start}
                    onChange={e => setForm({ ...form, dip_start: e.target.value })}
                    onBlur={handleCalculate} />
                </div>
                <div className="form-group">
                  <label>End (cm) — after issuance</label>
                  <input type="number" step="0.01" min="0" className="form-control"
                    value={form.dip_end}
                    onChange={e => setForm({ ...form, dip_end: e.target.value })}
                    onBlur={handleCalculate} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', margin: '12px 0 8px' }}>
                Flowmeter Readings
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Flowmeter Start (L)</label>
                  <input type="number" step="0.1" min="0" className="form-control"
                    value={form.fm_start}
                    onChange={e => setForm({ ...form, fm_start: e.target.value })}
                    onBlur={handleCalculate} />
                </div>
                <div className="form-group">
                  <label>Flowmeter End (L)</label>
                  <input type="number" step="0.1" min="0" className="form-control"
                    value={form.fm_end}
                    onChange={e => setForm({ ...form, fm_end: e.target.value })}
                    onBlur={handleCalculate} />
                </div>
              </div>

              {/* Live calculation preview */}
              {calculation && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    Reconciliation Preview
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><span className="text-dim">Tank Start:</span> <strong>{calculation.startL.toFixed(0)} L</strong></div>
                    <div><span className="text-dim">Tank End:</span> <strong>{calculation.endL.toFixed(0)} L</strong></div>
                    <div><span className="text-dim">Actual Issued:</span> <strong>{calculation.actual.toFixed(0)} L</strong></div>
                    <div><span className="text-dim">Flowmeter Issued:</span> <strong>{calculation.flow.toFixed(0)} L</strong></div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="text-dim">Discrepancy:</span>
                    <strong style={{ color: errorColor(calculation.errorPct), fontFamily: 'var(--mono)', fontSize: 15 }}>
                      {calculation.error > 0 ? '+' : ''}{calculation.error.toFixed(1)} L
                    </strong>
                    {errorBadge(calculation.errorPct)}
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
                      {calculation.error > 0 ? 'Flowmeter over-counted' : calculation.error < 0 ? 'Flowmeter under-counted' : 'Perfect match'}
                    </span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" rows="2" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
