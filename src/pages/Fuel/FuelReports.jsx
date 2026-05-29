import { useState, useEffect } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useProcurement } from '../../contexts/ProcurementContext'
import { useTheme } from '../../contexts/ThemeContext'
import toast from 'react-hot-toast'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

export default function FuelReports() {
  const {
    issuances,
    getIssuanceByDay,
    getIssuanceByVehicle,
    getTankLevelTrend,
    predictDaysUntilEmpty,
    getCurrentTankLevel,
    getTankPercentage,
    getAnomalousIssuances,
    TANK_MAX_LITRES
  } = useFuel()
  const { user } = useAuth()
  const { createStoreRequisition } = useProcurement()
  const { theme } = useTheme()
  const [prediction, setPrediction] = useState(null)
  const [showReqModal, setShowReqModal] = useState(false)
  const [reqForm, setReqForm] = useState({ quantity: 5000, notes: 'Auto-generated from low fuel alert' })

  useEffect(() => {
    setPrediction(predictDaysUntilEmpty())
  }, [predictDaysUntilEmpty])

  const currentLevel = getCurrentTankLevel()
  const isLow = currentLevel < TANK_MAX_LITRES * 0.2
  const issuanceByDay = getIssuanceByDay()
  const issuanceByVehicle = getIssuanceByVehicle()
  const tankTrend = getTankLevelTrend()
  const anomalies = getAnomalousIssuances ? getAnomalousIssuances() : []

  const handleCreateRequisition = async () => {
    if (!reqForm.quantity || reqForm.quantity <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    try {
      await createStoreRequisition({
        date: new Date().toISOString().split('T')[0],
        department: 'Fuel Management',
        requester_name: user?.full_name || user?.username,
        priority: 'urgent',
        items: [{
          name: 'Diesel (Bulk)',
          category: 'Fuel',
          qty: reqForm.quantity,
          unit: 'L',
          notes: reqForm.notes,
        }],
        notes: reqForm.notes,
        status: 'submitted',
        requester_id: user?.id,
      })
      toast.success(`Requisition for ${reqForm.quantity} L created`)
      setShowReqModal(false)
    } catch (err) {
      toast.error('Failed to create requisition: ' + err.message)
    }
  }

  // Chart.js draws on <canvas> — it cannot read CSS variables.
  // Must use real colours derived from current theme.
  const isDark      = theme === 'dark'
  const textColor   = isDark ? '#e2e8f0' : '#1e293b'
  const dimColor    = isDark ? '#94a3b8' : '#64748b'
  const gridColor   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
  const tooltipBg   = isDark ? '#1e293b' : '#ffffff'
  const tooltipBrd  = isDark ? '#334155' : '#e2e8f0'

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,   // fill the fixed-height container without distorting
    plugins: {
      legend: {
        labels: { color: textColor, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: '#f4a261',
        bodyColor: textColor,
        borderColor: tooltipBrd,
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      y: {
        ticks:  { color: dimColor, font: { size: 11 } },
        grid:   { color: gridColor },
        border: { color: gridColor },
      },
      x: {
        ticks:  { color: dimColor, font: { size: 11 }, maxRotation: 45, minRotation: 0 },
        grid:   { color: gridColor },
        border: { color: gridColor },
      },
    },
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Reports</h1>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <span className="material-icons">print</span> Print
        </button>
      </div>

      {isLow && (
        <div className="card" style={{ background: 'rgba(248,113,113,.15)', borderColor: 'var(--red)', marginBottom: 24, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="material-icons" style={{ color: 'var(--red)', fontSize: 28, verticalAlign: 'middle', marginRight: 8 }}>warning</span>
              <strong>Fuel level is critical ({currentLevel.toFixed(0)} L – {getTankPercentage().toFixed(0)}%)</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>Immediate restocking is recommended.</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowReqModal(true)}>
              <span className="material-icons">shopping_cart</span> Create Fuel Requisition
            </button>
          </div>
        </div>
      )}

      {prediction && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-icons" style={{ fontSize: 32, color: 'var(--gold)' }}>analytics</span>
            <div>
              <div style={{ fontWeight: 700 }}>Predicted next order date</div>
              <div style={{ fontSize: 13 }}>Based on recent consumption, the tank will be empty around <strong>{prediction}</strong>. Plan a purchase order.</div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Fuel Issuance by Day</h3>
        {issuanceByDay.labels?.length > 0 ? (
          <div style={{ height: 340, width: '100%' }}>
            <Line key={`day-${theme}`} data={{
              labels: issuanceByDay.labels,
              datasets: [{
                label: 'Litres Issued',
                data: issuanceByDay.data,
                borderColor: '#3b82f6',
                backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: isDark ? '#1e293b' : '#ffffff',
                pointBorderWidth: 2,
                fill: true,
                tension: 0.35,
              }],
            }} options={chartOptions} />
          </div>
        ) : <div className="empty-state">No data – add fuel issuances first</div>}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Fuel Issuance by Vehicle (Top 10)</h3>
        {issuanceByVehicle.labels?.length > 0 ? (
          <div style={{ height: 340, width: '100%' }}>
            <Bar key={`veh-${theme}`} data={{
              labels: issuanceByVehicle.labels,
              datasets: [{
                label: 'Litres Issued',
                data: issuanceByVehicle.data,
                backgroundColor: isDark ? 'rgba(244,162,97,0.85)' : 'rgba(180,83,9,0.75)',
                borderRadius: 6,
                barPercentage: 0.65,
              }],
            }} options={chartOptions} />
          </div>
        ) : <div className="empty-state">No data – add fuel issuances first</div>}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Main Tank Level Over Time</h3>
        {tankTrend.labels?.length > 0 ? (
          <div style={{ height: 340, width: '100%' }}>
            <Line key={`tank-${theme}`} data={{
              labels: tankTrend.labels,
              datasets: [{
                label: 'Litres in Tank',
                data: tankTrend.data,
                borderColor: '#14b8a6',
                backgroundColor: isDark ? 'rgba(20,184,166,0.15)' : 'rgba(20,184,166,0.08)',
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#14b8a6',
                pointBorderColor: isDark ? '#1e293b' : '#ffffff',
                pointBorderWidth: 2,
                fill: true,
                tension: 0.35,
              }],
            }} options={chartOptions} />
          </div>
        ) : <div className="empty-state">No dipstick data – add dipstick records first</div>}
      </div>

      {/* ── Anomaly / Theft Detection ──────────────────────────────────── */}
      <div className="card" style={{ padding: 20, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: anomalies.length > 0 ? 'var(--red)' : 'var(--text-dim)' }}>warning</span>
            Anomalous Issuances
            {anomalies.length > 0 && (
              <span style={{ marginLeft: 8, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{anomalies.length}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Statistically unusual fuel draws (≥ 2.5× vehicle average)</div>
        </div>
        {anomalies.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '16px 0' }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--green)' }}>check_circle</span>
            No anomalies detected — all issuances within normal range
          </div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Date</th><th>Vehicle</th><th>Driver</th>
                  <th style={{ textAlign: 'right' }}>Issued (L)</th>
                  <th style={{ textAlign: 'right' }}>Vehicle Avg (L)</th>
                  <th style={{ textAlign: 'right' }}>Excess (L)</th>
                  <th>Purpose</th><th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map(a => (
                  <tr key={a.id} style={{ background: 'rgba(248,113,113,.07)' }}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{String(a.date).slice(0, 10)}</td>
                    <td style={{ fontWeight: 600 }}>{a.vehicle || a.equipment_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{a.driver || a.driver_operator || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--red)' }}>
                      {Number(a.amount).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {a.avg?.toLocaleString() || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                      +{a.deviation?.toLocaleString() || '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.purpose || '—'}</td>
                    <td>
                      <span className="badge badge-red" style={{ fontSize: 9 }}>ANOMALY</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showReqModal && (
        <div className="overlay" onClick={() => setShowReqModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create Fuel <span>Requisition</span></div>
            <div className="form-group">
              <label>Quantity (Litres)</label>
              <input type="number" className="form-control" value={reqForm.quantity} onChange={e => setReqForm({...reqForm, quantity: parseInt(e.target.value) || 0})} />
              <div style={{ fontSize: 11, marginTop: 4 }}>Recommended: at least {Math.round(TANK_MAX_LITRES * 0.8 - currentLevel)} L to reach 80%</div>
            </div>
            <div className="form-group"><label>Notes</label><textarea className="form-control" rows="2" value={reqForm.notes} onChange={e => setReqForm({...reqForm, notes: e.target.value})} /></div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowReqModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleCreateRequisition}>Create Requisition</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
