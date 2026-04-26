import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function DipstickLog() {
  const { tanks, dipstickLog, addDipstick, getLitresFromCm, loading, fetchAll } = useFuel()
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    tank_id: '',
    date: new Date().toISOString().split('T')[0],
    dip_start_cm: '',
    dip_end_cm: '',
    flowmeter_start: '',
    flowmeter_end: '',
    notes: '',
  })
  const [calculated, setCalculated] = useState(null)

  const handleCalculate = () => {
    const tankId = form.tank_id
    const startCm = parseFloat(form.dip_start_cm)
    const endCm = parseFloat(form.dip_end_cm)
    if (!tankId || isNaN(startCm) || isNaN(endCm)) return
    const startL = getLitresFromCm(tankId, startCm)
    const endL = getLitresFromCm(tankId, endCm)
    const actualIssued = startL - endL
    const flowStart = parseFloat(form.flowmeter_start) || 0
    const flowEnd = parseFloat(form.flowmeter_end) || 0
    const flowmeterIssued = flowEnd - flowStart
    const errorLit = flowmeterIssued - actualIssued
    const errorPct = actualIssued !== 0 ? (errorLit / actualIssued) * 100 : 0
    setCalculated({ startL, endL, actualIssued, flowmeterIssued, errorLit, errorPct })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.tank_id) return toast.error('Select a tank')
    if (!form.dip_start_cm || !form.dip_end_cm) return toast.error('Enter dipstick readings')
    const startCm = parseFloat(form.dip_start_cm)
    const endCm = parseFloat(form.dip_end_cm)
    const startL = getLitresFromCm(form.tank_id, startCm)
    const endL = getLitresFromCm(form.tank_id, endCm)
    const actualIssued = startL - endL
    const flowStart = parseFloat(form.flowmeter_start) || 0
    const flowEnd = parseFloat(form.flowmeter_end) || 0
    const flowmeterIssued = flowEnd - flowStart
    const errorLit = flowmeterIssued - actualIssued
    const errorPct = actualIssued !== 0 ? (errorLit / actualIssued) * 100 : 0
    try {
      await addDipstick({
        tank_id: form.tank_id,
        date: form.date,
        dip_start_cm: startCm,
        dip_end_cm: endCm,
        start_litres: startL,
        end_litres: endL,
        flowmeter_start: flowStart,
        flowmeter_end: flowEnd,
        flowmeter_issued: flowmeterIssued,
        actual_issued: actualIssued,
        error_liters: errorLit,
        error_percent: errorPct,
        recorded_by: user?.full_name || user?.username,
        notes: form.notes,
      })
      toast.success('Dipstick record saved')
      setModalOpen(false)
      setForm({ tank_id: '', date: new Date().toISOString().split('T')[0], dip_start_cm: '', dip_end_cm: '', flowmeter_start: '', flowmeter_end: '', notes: '' })
      setCalculated(null)
      await fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dipstick Log</h1>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <span className="material-icons">add</span> New Record
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Tank</th><th>Start (cm)</th><th>End (cm)</th>
              <th>Start (L)</th><th>End (L)</th><th>Actual Issued (L)</th>
              <th>Flowmeter (L)</th><th>Error (L)</th><th>Error %</th><th>Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="11">Loading...<\/td><\/tr> : dipstickLog.length === 0 ? <tr><td colSpan="11">No records<\/td><\/tr> : dipstickLog.map(r => {
              const tank = tanks.find(t => t.id === r.tank_id)
              return (
                <tr key={r.id}>
                  <td>{r.date}<\/td>
                  <td>{tank?.name || '-'}<\/td>
                  <td>{r.dip_start_cm}<\/td><td>{r.dip_end_cm}<\/td>
                  <td>{r.start_litres?.toFixed(0)}<\/td><td>{r.end_litres?.toFixed(0)}<\/td>
                  <td style={{ color: 'var(--blue)' }}>{r.actual_issued?.toFixed(0)}<\/td>
                  <td>{r.flowmeter_issued?.toFixed(0)}<\/td>
                  <td style={{ color: Math.abs(r.error_liters) > 50 ? 'var(--red)' : 'var(--yellow)' }}>{r.error_liters?.toFixed(1)}<\/td>
                  <td style={{ color: Math.abs(r.error_percent) > 5 ? 'var(--red)' : 'var(--yellow)' }}>{r.error_percent?.toFixed(1)}%<\/td>
                  <td>{r.recorded_by || '-'}<\/td>
                <\/tr>
              )
            })}
          <\/tbody>
        <\/table>
      <\/div>

      {modalOpen && (
        <div className="overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New <span>Dipstick Record</span><\/div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group"><label>TANK<\/label><select className="form-control" required value={form.tank_id} onChange={e => setForm({...form, tank_id: e.target.value})}><option value="">Select<\/option>{tanks.map(t => <option key={t.id} value={t.id}>{t.name}<\/option>)}<\/select><\/div>
                <div className="form-group"><label>DATE<\/label><input type="date" className="form-control" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /><\/div>
              <\/div>
              <div className="form-row">
                <div className="form-group"><label>Dipstick Start (cm)<\/label><input type="number" step="0.01" className="form-control" value={form.dip_start_cm} onChange={e => setForm({...form, dip_start_cm: e.target.value})} onBlur={handleCalculate} /><\/div>
                <div className="form-group"><label>Dipstick End (cm)<\/label><input type="number" step="0.01" className="form-control" value={form.dip_end_cm} onChange={e => setForm({...form, dip_end_cm: e.target.value})} onBlur={handleCalculate} /><\/div>
              <\/div>
              <div className="form-row">
                <div className="form-group"><label>Flowmeter Start (L)<\/label><input type="number" step="0.1" className="form-control" value={form.flowmeter_start} onChange={e => setForm({...form, flowmeter_start: e.target.value})} onBlur={handleCalculate} /><\/div>
                <div className="form-group"><label>Flowmeter End (L)<\/label><input type="number" step="0.1" className="form-control" value={form.flowmeter_end} onChange={e => setForm({...form, flowmeter_end: e.target.value})} onBlur={handleCalculate} /><\/div>
              <\/div>
              {calculated && (
                <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                  <div>Start: <strong>{calculated.startL.toFixed(0)} L<\/strong> | End: <strong>{calculated.endL.toFixed(0)} L<\/strong><\/div>
                  <div>Actual Issued: <strong style={{ color: 'var(--blue)' }}>{calculated.actualIssued.toFixed(0)} L<\/strong><\/div>
                  <div>Flowmeter Issued: <strong>{calculated.flowmeterIssued.toFixed(0)} L<\/strong><\/div>
                  <div>Error: <strong style={{ color: Math.abs(calculated.errorLit) > 50 ? 'var(--red)' : 'var(--yellow)' }}>{calculated.errorLit.toFixed(1)} L ({calculated.errorPct.toFixed(1)}%)<\/strong><\/div>
                <\/div>
              )}
              <div className="form-group"><label>Notes<\/label><textarea className="form-control" rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /><\/div>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel<\/button><button type="submit" className="btn btn-primary">Save Record<\/button><\/div>
            <\/form>
          <\/div>
        <\/div>
      )}
    <\/div>
  )
}
