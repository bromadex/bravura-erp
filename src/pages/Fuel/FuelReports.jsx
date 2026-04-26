import { useState, useEffect, useRef } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useProcurement } from '../../contexts/ProcurementContext'
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

// Register all required components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler
)

export default function FuelReports() {
  const {
    issuances,
    getIssuanceByDay,
    getIssuanceByVehicle,
    getTankLevelTrend,
    predictDaysUntilEmpty,
    getCurrentTankLevel,
    getTankPercentage,
    TANK_MAX_LITRES
  } = useFuel()
  const { user } = useAuth()
  const { createStoreRequisition } = useProcurement()
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

  // Improved chart options with better visibility
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#f1f5f9', font: { size: 12, weight: 'bold' } },
      },
      tooltip: { backgroundColor: '#1a2235', titleColor: '#f4a261', bodyColor: '#f1f5f9' },
    },
    scales: {
      y: {
        ticks: { color: '#94a3b8', stepSize: 500 },
        grid: { color: 'rgba(148,163,184,0.2)' },
        title: { display: true, text: 'Litres', color: '#94a3b8', font: { weight: 'bold' } },
      },
      x: {
        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45 },
        grid: { color: 'rgba(148,163,184,0.1)' },
      },
    },
  }

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#f1f5f9', font: { size: 12, weight: 'bold' } },
      },
      tooltip: { backgroundColor: '#1a2235', titleColor: '#f4a261', bodyColor: '#f1f5f9' },
    },
    scales: {
      y: {
        ticks: { color: '#94a3b8', stepSize: 500 },
        grid: { color: 'rgba(148,163,184,0.2)' },
        title: { display: true, text: 'Litres', color: '#94a3b8', font: { weight: 'bold' } },
      },
      x: {
        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45 },
        grid: { color: 'rgba(148,163,184,0.1)' },
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

      {/* Low fuel alert */}
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

      {/* Prediction */}
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

      {/* Chart: Issuance by Day */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Fuel Issuance by Day</h3>
        {issuanceByDay.labels?.length > 0 ? (
          <div style={{ height: 400, width: '100%' }}>
            <Line
              data={{
                labels: issuanceByDay.labels,
                datasets: [{
                  label: 'Litres Issued',
                  data: issuanceByDay.data,
                  borderColor: '#60a5fa',
                  backgroundColor: 'rgba(96,165,250,0.2)',
                  borderWidth: 3,
                  pointRadius: 5,
                  pointBackgroundColor: '#60a5fa',
                  pointBorderColor: '#fff',
                  fill: true,
                  tension: 0.3,
                }],
              }}
              options={lineChartOptions}
            />
          </div>
        ) : (
          <div className="empty-state">No data – add fuel issuances first</div>
        )}
      </div>

      {/* Chart: Issuance by Vehicle */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Fuel Issuance by Vehicle (Top 10)</h3>
        {issuanceByVehicle.labels?.length > 0 ? (
          <div style={{ height: 400, width: '100%' }}>
            <Bar
              data={{
                labels: issuanceByVehicle.labels,
                datasets: [{
                  label: 'Litres Issued',
                  data: issuanceByVehicle.data,
                  backgroundColor: '#f4a261',
                  borderRadius: 6,
                  barPercentage: 0.7,
                }],
              }}
              options={barChartOptions}
            />
          </div>
        ) : (
          <div className="empty-state">No data – add fuel issuances first</div>
        )}
      </div>

      {/* Chart: Tank Level Over Time */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--gold)' }}>Main Tank Level Over Time</h3>
        {tankTrend.labels?.length > 0 ? (
          <div style={{ height: 400, width: '100%' }}>
            <Line
              data={{
                labels: tankTrend.labels,
                datasets: [{
                  label: 'Litres in Tank',
                  data: tankTrend.data,
                  borderColor: '#2dd4bf',
                  backgroundColor: 'rgba(45,212,191,0.2)',
                  borderWidth: 3,
                  pointRadius: 5,
                  pointBackgroundColor: '#2dd4bf',
                  pointBorderColor: '#fff',
                  fill: true,
                  tension: 0.3,
                }],
              }}
              options={lineChartOptions}
            />
          </div>
        ) : (
          <div className="empty-state">No dipstick data – add dipstick records first</div>
        )}
      </div>

      {/* Requisition Modal */}
      {showReqModal && (
        <div className="overlay" onClick={() => setShowReqModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Create Fuel <span>Requisition</span></div>
            <div className="form-group">
              <label>Quantity (Litres)</label>
              <input type="number" className="form-control" value={reqForm.quantity} onChange={e => setReqForm({...reqForm, quantity: parseInt(e.target.value) || 0})} />
              <div style={{ fontSize: 11, marginTop: 4 }}>Recommended: at least {Math.round(TANK_MAX_LITRES * 0.8 - currentLevel)} L to reach 80%</div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows="2" value={reqForm.notes} onChange={e => setReqForm({...reqForm, notes: e.target.value})} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReqModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateRequisition}>Create Requisition</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
