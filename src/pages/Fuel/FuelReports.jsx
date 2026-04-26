import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import * as XLSX from 'xlsx'

export default function FuelReports() {
  const { tanks, issuances, deliveries, getFuelEfficiency } = useFuel()
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [efficiency, setEfficiency] = useState([])

  const calculateEfficiency = () => {
    if (!period.start || !period.end) {
      alert('Select start and end date')
      return
    }
    const eff = getFuelEfficiency(period.start, period.end)
    setEfficiency(eff)
  }

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new()
    // Issuances sheet
    const issuanceData = issuances.map(i => ({
      Date: i.date, Time: i.time, Tank: tanks.find(t => t.id === i.tank_id)?.name || '',
      FuelType: i.fuel_type, Quantity: i.quantity, Equipment: i.equipment_name,
      DriverOperator: i.driver_operator, AuthorizedBy: i.authorized_by, Purpose: i.purpose,
      Odometer: i.odometer_reading, Notes: i.notes
    }))
    const wsIssuance = XLSX.utils.json_to_sheet(issuanceData)
    XLSX.utils.book_append_sheet(wb, wsIssuance, 'Fuel Issuance')
    // Deliveries sheet
    const deliveryData = deliveries.map(d => ({
      Date: d.date, Tank: tanks.find(t => t.id === d.tank_id)?.name || '',
      FuelType: d.fuel_type, Quantity: d.quantity, UnitCost: d.unit_cost,
      Total: d.quantity * (d.unit_cost || 0), Supplier: d.supplier, Notes: d.notes
    }))
    const wsDelivery = XLSX.utils.json_to_sheet(deliveryData)
    XLSX.utils.book_append_sheet(wb, wsDelivery, 'Fuel Deliveries')
    // Efficiency sheet
    const efficiencyData = efficiency.map(e => ({
      Equipment: e.name, TotalFuel: e.totalFuel, Distance: e.distance,
      Efficiency: e.efficiency.toFixed(2) + ' L/km'
    }))
    const wsEff = XLSX.utils.json_to_sheet(efficiencyData)
    XLSX.utils.book_append_sheet(wb, wsEff, 'Efficiency')
    XLSX.writeFile(wb, `Fuel_Report_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Reports</h1>
        <button className="btn btn-primary" onClick={exportToExcel}>
          <span className="material-icons">table_chart</span> Export to Excel
        </button>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Fuel Efficiency (Vehicles)</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="form-group"><label>Start Date</label><input type="date" className="form-control" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} /></div>
          <div className="form-group"><label>End Date</label><input type="date" className="form-control" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} /></div>
          <button className="btn btn-secondary" onClick={calculateEfficiency}>Calculate</button>
        </div>
        {efficiency.length > 0 && (
          <div className="table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead><tr><th>Equipment</th><th>Total Fuel (L)</th><th>Distance (km)</th><th>Efficiency (L/km)</th></tr></thead>
              <tbody>
                {efficiency.map(e => (
                  <tr key={e.name}>
                    <td>{e.name}</td><td>{e.totalFuel.toFixed(1)}</td><td>{e.distance.toFixed(0)}</td>
                    <td style={{ color: 'var(--blue)' }}>{e.efficiency.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Tank Level Summary</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tank</th><th>Capacity (L)</th><th>Current Level (L)</th><th>% Full</th><th>Status</th></tr></thead>
            <tbody>
              {tanks.map(t => {
                const percent = (t.current_level / t.capacity) * 100
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td><td>{t.capacity.toLocaleString()}</td>
                    <td>{t.current_level.toLocaleString()}</td><td>{percent.toFixed(0)}%</td>
                    <td><span className={`badge ${t.current_level < t.alert_threshold ? 'bg-red' : 'bg-green'}`}>{t.current_level < t.alert_threshold ? 'LOW' : 'OK'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
