import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import * as XLSX from 'xlsx'

export default function FuelReports() {
  const { issuances, deliveries, dipstickLog, getCurrentTankLevel, TANK_MAX_LITRES } = useFuel()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [efficiencyData, setEfficiencyData] = useState([])

  // Calculate vehicle efficiency (km/L) based on odometer readings
  const calculateEfficiency = () => {
    if (!startDate || !endDate) {
      alert('Select start and end date')
      return
    }
    const filtered = issuances.filter(i => i.date >= startDate && i.date <= endDate && i.vehicle && i.odometer)
    const vehicleMap = new Map()
    filtered.forEach(i => {
      const v = i.vehicle
      if (!vehicleMap.has(v)) {
        vehicleMap.set(v, { name: v, totalFuel: 0, firstOdo: null, lastOdo: null })
      }
      const entry = vehicleMap.get(v)
      entry.totalFuel += i.amount
      const odo = parseFloat(i.odometer)
      if (entry.firstOdo === null || odo < entry.firstOdo) entry.firstOdo = odo
      if (entry.lastOdo === null || odo > entry.lastOdo) entry.lastOdo = odo
    })
    const result = []
    for (let [_, data] of vehicleMap.entries()) {
      const distance = (data.lastOdo || 0) - (data.firstOdo || 0)
      const efficiency = distance > 0 ? data.totalFuel / distance : 0
      result.push({ vehicle: data.name, totalFuel: data.totalFuel, distance, efficiency: efficiency.toFixed(2) })
    }
    setEfficiencyData(result)
  }

  const exportEfficiency = () => {
    if (!efficiencyData.length) return toast.error('No data to export')
    const ws = XLSX.utils.json_to_sheet(efficiencyData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fuel Efficiency')
    XLSX.writeFile(wb, `Fuel_Efficiency_${startDate}_to_${endDate}.xlsx`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Reports</h1>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <span className="material-icons">print</span> Print
        </button>
      </div>

      {/* Efficiency Report Section */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Vehicle Fuel Efficiency (L/100km)</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group"><label>Start Date</label><input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          <div className="form-group"><label>End Date</label><input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          <button className="btn btn-secondary" onClick={calculateEfficiency}>Calculate</button>
          {efficiencyData.length > 0 && <button className="btn btn-primary" onClick={exportEfficiency}>Export to Excel</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vehicle</th><th>Total Fuel (L)</th><th>Distance (km)</th><th>Efficiency (L/km)</th></tr></thead>
            <tbody>
              {efficiencyData.map(e => (
                <tr key={e.vehicle}>
                  <td>{e.vehicle}</td><td>{e.totalFuel.toFixed(1)}</td><td>{e.distance.toFixed(0)}</td><td className="mono">{e.efficiency}</td>
                </tr>
              ))}
              {efficiencyData.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center' }}>No data – run calculation</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tank Level Summary */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Tank Level Summary</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tank</th><th>Max Capacity (L)</th><th>Current Level (L)</th><th>% Full</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td>ZUFTA10 (Main)</td><td>{TANK_MAX_LITRES.toLocaleString()}</td><td>{getCurrentTankLevel().toLocaleString()}</td>
                <td>{((getCurrentTankLevel() / TANK_MAX_LITRES) * 100).toFixed(0)}%</td>
                <td><span className={`badge ${getCurrentTankLevel() < 2020 ? 'bg-red' : 'bg-green'}`}>{getCurrentTankLevel() < 2020 ? 'LOW' : 'OK'}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
