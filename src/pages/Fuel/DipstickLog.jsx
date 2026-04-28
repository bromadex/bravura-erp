import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

export default function DipstickLog() {
  const { dipstickLog, addDipstick, getLitresFromCm, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'dipstick')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    dip_start: '',
    dip_end: '',
    fm_start: '',
    fm_end: '',
    notes: '',
  })
  const [calculation, setCalculation] = useState(null)

  const handleCalculate = () => {
    const startCm = parseFloat(form.dip_start)
    const endCm = parseFloat(form.dip_end)
    if (isNaN(startCm) || isNaN(endCm)) return
    const startL = getLitresFromCm(startCm)
    const endL = getLitresFromCm(endCm)
    const actual = startL - endL
    const fmStart = parseFloat(form.fm_start) || 0
    const fmEnd = parseFloat(form.fm_end) || 0
    const flow = fmEnd - fmStart
    const error = flow - actual
    const errorPct = actual !== 0 ? (error / actual) * 100 : 0
    setCalculation({ startL, endL, actual, flow, error, errorPct })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date) return toast.error('Enter date')
    const startCm = parseFloat(form.dip_start)
    const endCm = parseFloat(form.dip_end)
    if (isNaN(startCm) || isNaN(endCm)) return toast.error('Enter dipstick readings')
    const startL = getLitresFromCm(startCm)
    const endL = getLitresFromCm(endCm)
    const actual = startL - endL
    const fmStart = parseFloat(form.fm_start) || 0
    const fmEnd = parseFloat(form.fm_end) || 0
    const flow = fmEnd - fmStart
    const error = flow - actual
    const errorPct = actual !== 0 ? (error / actual) * 100 : 0
    try {
      await addDipstick({
        date: form.date,
        dip_start: startCm,
        dip_end: endCm,
        fuel_start: startL,
        fuel_end: endL,
        fm_start: fmStart,
        fm_end: fmEnd,
        flowmeter_issued: flow,
        actual_issued: actual,
        error_liters: error,
        error_pct: errorPct,
        done_by: user?.full_name || user?.username,
        notes: form.notes,
      })
      toast.success('Dipstick record saved')
      setShowModal(false)
      setForm({ date: new Date().toISOString().split('T')[0], dip_start: '', dip_end: '', fm_start: '', fm_end: '', notes: '' })
      setCalculation(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
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
      <div className="table-wrap">
        <table className="stock-table">
          <thead><tr><th>Date</th><th>Start (cm)</th><th>End (cm)</th><th>Start (L)</th><th>End (L)</th><th>Actual (L)</th><th>Flowmeter (L)</th><th>Error (L)</th><th>Error %</th><th>Done By</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="10">Loading...</td></tr> : dipstickLog.length === 0 ? <tr><td colSpan="10">No records</td></tr> : dipstickLog.map(r => (
              <tr key={r.id}>
                <td>{r.date}</td><td>{r.dip_start}</td><td>{r.dip_end}</td>
                <td>{r.fuel_start?.toFixed(0)}</td><td>{r.fuel_end?.toFixed(0)}</td>
                <td>{r.actual_issued?.toFixed(0)}</td><td>{r.flowmeter_issued?.toFixed(0)}</td>
                <td style={{ color: Math.abs(r.error_liters) > 50 ? 'var(--red)' : 'var(--yellow)' }}>{r.error_liters?.toFixed(1)}</td>
                <td style={{ color: Math.abs(r.error_percent) > 5 ? 'var(--red)' : 'var(--yellow)' }}>{r.error_percent?.toFixed(1)}%</td>
                <td>{r.done_by || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New <span>Dipstick Record</span></div>
            <form onSubmit={handleSubmit}>
              <div className="form-row"><div className="form-group"><label>DATE</label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div></div>
              <div className="form-row">
                <div className="form-group"><label>Dipstick Start (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_start} onChange={e => setForm({...form, dip_start: e.target.value})} onBlur={handleCalculate} /></div>
                <div className="form-group"><label>Dipstick End (cm)</label><input type="number" step="0.01" className="form-control" value={form.dip_end} onChange={e => setForm({...form, dip_end: e.target.value})} onBlur={handleCalculate} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Flowmeter Start (L)</label><input type="number" step="0.1" className="form-control" value={form.fm_start} onChange={e => setForm({...form, fm_start: e.target.value})} onBlur={handleCalculate} /></div>
                <div className="form-group"><label>Flowmeter End (L)</label><input type="number" step="0.1" className="form-control" value={form.fm_end} onChange={e => setForm({...form, fm_end: e.target.value})} onBlur={handleCalculate} /></div>
              </div>
              {calculation && (
                <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                  <div>Start: <strong>{calculation.startL.toFixed(0)} L</strong> | End: <strong>{calculation.endL.toFixed(0)} L</strong></div>
                  <div>Actual Issued: <strong>{calculation.actual.toFixed(0)} L</strong></div>
                  <div>Flowmeter Issued: <strong>{calculation.flow.toFixed(0)} L</strong></div>
                  <div>Error: <strong style={{ color: Math.abs(calculation.error) > 50 ? 'var(--red)' : 'var(--yellow)' }}>{calculation.error.toFixed(1)} L ({calculation.errorPct.toFixed(1)}%)</strong></div>
                </div>
              )}
              <div className="form-group"><label>NOTES</label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Record</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
