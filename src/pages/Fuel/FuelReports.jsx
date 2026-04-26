import { useState, useEffect } from 'react'
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
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend)

export default function FuelReports() {
  const { issuances, getIssuanceByDay, getIssuanceByVehicle, getTankLevelTrend, predictDaysUntilEmpty, getCurrentTankLevel, getTankPercentage, TANK_MAX_LITRES } = useFuel()
  const { user } = useAuth()
  const { createStoreRequisition } = useProcurement()
  const [prediction, setPrediction] = useState(null)
  const [showRequisitionModal, setShowRequisitionModal] = useState(false)
  const [reqForm, setReqForm] = useState({ quantity: 5000, notes: 'Auto-generated from low fuel alert' })

  useEffect(() => {
    setPrediction(predictDaysUntilEmpty())
  }, [predictDaysUntilEmpty])

  const issuanceByDay = getIssuanceByDay()
  const issuanceByVehicle = getIssuanceByVehicle()
  const tankTrend = getTankLevelTrend()

  const currentLevel = getCurrentTankLevel()
  const isLow = currentLevel < TANK_MAX_LITRES * 0.2

  const handleCreateFuelRequisition = async () => {
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
        items: [
          {
            name: 'Diesel (Bulk)',
            category: 'Fuel',
            qty: reqForm.quantity,
            unit: 'L',
            notes: reqForm.notes,
          },
        ],
        notes: reqForm.notes,
        status: 'submitted',
        requester_id: user?.id,
      })
      toast.success(`Requisition for ${reqForm.quantity} L created`)
      setShowRequisitionModal(false)
    } catch (err) {
      toast.error('Failed to create requisition: ' + err.message)
    }
  }

  // Chart options
  const barOptions = { responsive: true, plugins: { legend: { position: 'top' } } }
  const lineOptions = { responsive: true, plugins: { legend: { position: 'top' } } }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fuel Reports</h1>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <span className="material-icons">print</span> Print
        </button>
      </div>

      {/* Low fuel alert and requisition button */}
      {isLow && (
        <div className="card" style={{ background: 'rgba(248,113,113,.1)', borderColor: 'var(--red)', marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="material-icons" style={{ color: 'var(--red)', fontSize: 28, verticalAlign: 'middle', marginRight: 8 }}>warning</span>
              <strong>Fuel level is critical ({currentLevel.toFixed(0)} L – {getTankPercentage().toFixed(0)}%)</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>Immediate restocking is recommended.</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowRequisitionModal(true)}>
              <span className="material-icons">shopping_cart</span> Create Fuel Requisition
            </button>
          </div>
        </div>
      )}

      {/* Prediction */}
      {prediction && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-icons" style={{ fontSize: 28, color: 'var(--gold)' }}>analytics</span>
            <div>
              <div style={{ fontWeight: 700 }}>Predicted next order date</div>
              <div style={{ fontSize: 13 }}>Based on recent consumption, the tank will be empty around <strong>{prediction}</strong>. Plan a purchase order.</div>
            </div>
          </div>
        </div>
      )}

      {/* Chart: Issuance by day */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Fuel Issuance by Day</h3>
        {issuanceByDay.labels.length > 0 ? (
          <Line
            data={{
              labels: issuanceByDay.labels,
              datasets: [{ label: 'Litres', data: issuanceByDay.data, borderColor: 'var(--blue)', backgroundColor: 'rgba(96,165,250,0.2)', fill: true }],
            }}
            options={lineOptions}
          />
        ) : <div className="empty-state">No data for chart</div>}
      </div>

      {/* Chart: Issuance by vehicle */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Fuel Issuance by Vehicle (Top 10)</h3>
        {issuanceByVehicle.labels.length > 0 ? (
          <Bar
            data={{
              labels: issuanceByVehicle.labels,
              datasets: [{ label: 'Litres', data: issuanceByVehicle.data, backgroundColor: 'var(--gold)' }],
            }}
            options={barOptions}
          />
        ) : <div className="empty-state">No data for chart</div>}
      </div>

      {/* Chart: Tank level per day */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Main Tank Level Over Time</h3>
        {tankTrend.labels.length > 0 ? (
          <Line
            data={{
              labels: tankTrend.labels,
              datasets: [{ label: 'Litres', data: tankTrend.data, borderColor: 'var(--teal)', backgroundColor: 'rgba(45,212,191,0.2)', fill: true }],
            }}
            options={lineOptions}
          />
        ) : <div className="empty-state">No dipstick data available</div>}
      </div>

      {/* Requisition Modal */}
      {showRequisitionModal && (
        <div className="overlay" onClick={() => setShowRequisitionModal(false)}>
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
              <button className="btn btn-secondary" onClick={() => setShowRequisitionModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateFuelRequisition}>Create Requisition</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
