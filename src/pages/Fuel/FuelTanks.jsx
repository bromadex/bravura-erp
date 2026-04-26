import { useNavigate } from 'react-router-dom'
import { useFuel } from '../../contexts/FuelContext'
import * as XLSX from 'xlsx'

export default function FuelTanks() {
  const navigate = useNavigate()
  const { issuances, deliveries, getCurrentTankLevel, getTankPercentage, TANK_MAX_LITRES } = useFuel()

  const currentLevel = getCurrentTankLevel()
  const percentage = getTankPercentage()
  const totalIssued = issuances.reduce((sum, i) => sum + (i.amount || 0), 0)
  const totalDelivered = deliveries.reduce((sum, d) => sum + (d.qty || 0), 0)

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new()
    const issuanceData = issuances.map(i => ({
      Date: i.date, Time: i.time, FuelType: i.fuel_type, Amount: i.amount,
      Vehicle: i.vehicle, Driver: i.driver, AuthorizedBy: i.authorized_by,
      Purpose: i.purpose, Odometer: i.odometer
    }))
    const wsIssuance = XLSX.utils.json_to_sheet(issuanceData)
    XLSX.utils.book_append_sheet(wb, wsIssuance, 'Fuel Issuance')
    const deliveryData = deliveries.map(d => ({
      Date: d.date, FuelType: d.fuel_type, Quantity: d.qty, Supplier: d.supplier,
      DipBefore: d.dip_before, DipAfter: d.dip_after, Notes: d.notes
    }))
    const wsDelivery = XLSX.utils.json_to_sheet(deliveryData)
    XLSX.utils.book_append_sheet(wb, wsDelivery, 'Fuel Deliveries')
    XLSX.writeFile(wb, `Fuel_Report_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Tanks</h1>
        <button className="btn btn-primary" onClick={exportToExcel}>
          <span className="material-icons">table_chart</span> Export
        </button>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700 }}>Main Tank Level (ZUFTA10)</div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, height: 28, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ width: `${Math.min(100, percentage)}%`, height: '100%', background: percentage < 20 ? 'var(--red)' : percentage < 40 ? 'var(--yellow)' : 'var(--teal)', transition: 'width .5s', borderRadius: 8 }}></div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{currentLevel.toLocaleString()} L</span>
              <span>{percentage.toFixed(0)}%</span>
              <span>{TANK_MAX_LITRES.toLocaleString()} L (max)</span>
            </div>
          </div>
          <div className="kpi-grid" style={{ flex: 2, marginBottom: 0 }}>
            <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/module/fuel/issuance')}>
              <div className="kpi-label">Total Issued</div>
              <div className="kpi-val">{totalIssued.toLocaleString()} L</div>
              <div className="kpi-sub">{issuances.length} transactions – click to view</div>
            </div>
            <div className="kpi-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/module/fuel/deliveries')}>
              <div className="kpi-label">Total Delivered</div>
              <div className="kpi-val" style={{ color: 'var(--green)' }}>{totalDelivered.toLocaleString()} L</div>
              <div className="kpi-sub">{deliveries.length} deliveries – click to view</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Issuances table remains unchanged */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Fuel Issuances</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Amount (L)</th><th>Purpose</th></tr></thead>
            <tbody>
              {issuances.slice(0, 5).map(i => (
                <tr key={i.id}><td>{i.date}</td><td>{i.vehicle || '-'}</td><td>{i.driver || '-'}</td><td className="mono">{i.amount} L</td><td>{i.purpose || '-'}</td></tr>
              ))}
              {issuances.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center' }}>No issues yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Deliveries table unchanged */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Fuel Deliveries</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Supplier</th><th>Quantity (L)</th><th>Fuel Type</th></tr></thead>
            <tbody>
              {deliveries.slice(0, 5).map(d => (
                <tr key={d.id}><td>{d.date}</td><td>{d.supplier || '-'}</td><td className="mono">{d.qty} L</td><td>{d.fuel_type}</td></tr>
              ))}
              {deliveries.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center' }}>No deliveries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
