// src/pages/Fuel/FuelTanks.jsx — multi-tank aware

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { exportMultiSheet } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, TabNav, AlertBanner, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

function TankGauge({ tank, level, percentage }) {
  const levelColor = percentage < 10 ? 'var(--red)' : percentage < 20 ? 'var(--yellow)' : percentage < 40 ? 'var(--yellow)' : 'var(--teal)'
  const statusLabel = percentage < 10 ? 'Critical' : percentage < 20 ? 'Low' : percentage < 40 ? 'Below 40%' : 'Normal'
  const badgeClass = percentage < 10 ? 'badge-red' : percentage < 20 ? 'badge-yellow' : percentage < 40 ? 'badge-yellow' : 'badge-green'

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{tank.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {tank.tank_code || tank.id} · {tank.fuel_type || 'DIESEL'} · Capacity: {(tank.capacity || 0).toLocaleString()} L
            {tank.location && ` · ${tank.location}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', color: levelColor }}>
            {percentage.toFixed(0)}%
          </span>
          <span className={`badge ${badgeClass}`}>{statusLabel}</span>
        </div>
      </div>

      {/* Gauge bar */}
      <div style={{ position: 'relative', height: 32, background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, percentage)}%`, background: levelColor, borderRadius: 8, transition: 'width .8s ease', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
          {percentage > 10 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
              {level.toLocaleString()} L
            </span>
          )}
        </div>
        {[20, 40, 60, 80].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.18)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
        <span>0</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>100%</span>
      </div>

      {tank.unit_cost > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
          Value: <strong style={{ color: 'var(--text)' }}>${(level * tank.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          {' '}at ${tank.unit_cost}/L
          {tank.alert_threshold > 0 && (
            <span style={{ marginLeft: 12 }}>Alert threshold: {tank.alert_threshold.toLocaleString()} L</span>
          )}
        </div>
      )}
    </div>
  )
}

const BLANK_TRANSFER = { from_tank_id: '', to_tank_id: '', quantity: '', fuel_type: 'DIESEL', reason: '', notes: '' }

export default function FuelTanks() {
  const {
    tanks, issuances, deliveries, dipstickLog, transfers,
    getCurrentTankLevel, getTankPercentage, TANK_MAX_LITRES, addTransfer,
    setOpeningFuelBalance, addTank, loading,
  } = useFuel()
  const { user } = useAuth()

  const canEdit = useCanEdit('fuel', 'tanks')
  const [activeTab, setActiveTab] = useState('overview')
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferForm, setTransferForm]           = useState(BLANK_TRANSFER)
  const [transferSaving, setTransferSaving]       = useState(false)
  const [showOpeningModal, setShowOpeningModal]   = useState(false)
  const [openingForm, setOpeningForm]             = useState({ tank_id: '', level: '', date: today, notes: '' })
  const [openingSaving, setOpeningSaving]         = useState(false)
  const [showTankModal, setShowTankModal]         = useState(false)
  const [tankForm, setTankForm]                   = useState({ name: '', fuel_type: 'DIESEL', capacity: '', current_level: '', location: '', unit_cost: '', alert_threshold: '', is_bowser: false, tank_type: 'fixed', notes: '' })
  const [tankSaving, setTankSaving]               = useState(false)

  const handleOpeningBalance = async () => {
    if (!openingForm.tank_id) { toast.error('Select a tank'); return }
    const lvl = parseFloat(openingForm.level)
    if (!openingForm.level || isNaN(lvl) || lvl < 0) { toast.error('Enter a valid level in litres'); return }
    const tank = tanks.find(t => t.id === openingForm.tank_id)
    if (tank && lvl > (tank.capacity || 0)) { toast.error(`Level exceeds tank capacity (${tank.capacity?.toLocaleString()}L)`); return }
    setOpeningSaving(true)
    try {
      await setOpeningFuelBalance(openingForm.tank_id, lvl, openingForm.date, openingForm.notes)
      toast.success(`Opening balance set: ${lvl.toLocaleString()}L`)
      setShowOpeningModal(false)
      setOpeningForm({ tank_id: '', level: '', date: today, notes: '' })
    } catch (e) { toast.error(e.message) }
    setOpeningSaving(false)
  }

  const handleAddTank = async () => {
    if (!tankForm.name.trim()) { toast.error('Tank name is required'); return }
    if (!tankForm.capacity || parseFloat(tankForm.capacity) <= 0) { toast.error('Enter a valid capacity'); return }
    setTankSaving(true)
    try {
      const code = await addTank(tankForm)
      toast.success(`Tank ${code} created`)
      setShowTankModal(false)
      setTankForm({ name: '', fuel_type: 'DIESEL', capacity: '', current_level: '', location: '', unit_cost: '', alert_threshold: '', is_bowser: false, tank_type: 'fixed', notes: '' })
    } catch (e) { toast.error(e.message) }
    setTankSaving(false)
  }

  const handleTransfer = async () => {
    if (!transferForm.from_tank_id || !transferForm.to_tank_id) { toast.error('Select both tanks'); return }
    if (transferForm.from_tank_id === transferForm.to_tank_id) { toast.error('Source and destination must be different tanks'); return }
    const qty = parseFloat(transferForm.quantity)
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return }
    setTransferSaving(true)
    try {
      const no = await addTransfer({ ...transferForm, quantity: qty, transferred_by: user?.email || user?.full_name || '' })
      toast.success(`Transfer ${no} recorded`)
      setShowTransferModal(false)
      setTransferForm(BLANK_TRANSFER)
    } catch (e) { toast.error(e.message) }
    setTransferSaving(false)
  }

  // Aggregate KPIs (all tanks combined)
  const totalIssued     = issuances.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalDelivered  = deliveries.reduce((s, d) => s + (d.qty || d.amount || 0), 0)
  const issuedToday     = issuances.filter(i => String(i.date).slice(0, 10) === today).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const issuedThisMonth = issuances.filter(i => String(i.date).slice(0, 7) === today.slice(0, 7)).reduce((s, i) => s + (Number(i.amount) || 0), 0)

  // For backward compat: if no tanks in DB, show single hardcoded gauge
  const showMultiTank = tanks.length > 0
  const primaryLevel   = getCurrentTankLevel()
  const primaryPct     = getTankPercentage()
  const criticalTanks  = tanks.filter(t => getTankPercentage(t.id) < 10)
  const lowTanks       = tanks.filter(t => { const p = getTankPercentage(t.id); return p >= 10 && p < 20 })

  // 7-day trend
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().split('T')[0]
    return {
      label:   d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
      dateStr: ds,
      issued:  issuances.filter(iss => String(iss.date).slice(0, 10) === ds).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    }
  })
  const maxDay = Math.max(...last7.map(d => d.issued), 1)

  // By vehicle (top 8)
  const vehicleMap = {}
  issuances.forEach(i => { const k = i.vehicle || i.equipment_name || 'Unknown'; vehicleMap[k] = (vehicleMap[k] || 0) + (Number(i.amount) || 0) })
  const byVehicle = Object.entries(vehicleMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxVehicle = Math.max(...byVehicle.map(v => v[1]), 1)

  // By driver (top 8)
  const driverMap = {}
  issuances.forEach(i => { const k = i.driver || i.driver_operator || 'Unknown'; driverMap[k] = (driverMap[k] || 0) + (Number(i.amount) || 0) })
  const byDriver = Object.entries(driverMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxDriver = Math.max(...byDriver.map(d => d[1]), 1)

  const handleExport = () => {
    exportMultiSheet([
      { name: 'Issuances',  rows: issuances.map(i => ({ Date: i.date, Vehicle: i.vehicle, Driver: i.driver, Litres: i.amount, Purpose: i.purpose, Tank: i.tank_id })) },
      { name: 'By Vehicle', rows: byVehicle.map(([v, l]) => ({ Vehicle: v, TotalLitres: l })) },
      { name: 'By Driver',  rows: byDriver.map(([d, l])  => ({ Driver: d,  TotalLitres: l })) },
    ], `FuelTanks_${today}`)
    toast.success('Exported')
  }

  const TABS = [
    { id: 'overview',  label: 'Overview',   icon: 'water'      },
    { id: 'analytics', label: 'Analytics',  icon: 'bar_chart'  },
    { id: 'transfers', label: 'Transfers',  icon: 'swap_horiz' },
  ]

  return (
    <div>
      <PageHeader title="Fuel Tanks">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <>
            <button className="btn btn-secondary" onClick={() => { setOpeningForm({ tank_id: tanks[0]?.id || '', level: '', date: today, notes: '' }); setShowOpeningModal(true) }}>
              <span className="material-icons">inventory_2</span> Set Opening Balance
            </button>
            <button className="btn btn-secondary" onClick={() => { setTransferForm(BLANK_TRANSFER); setShowTransferModal(true) }}>
              <span className="material-icons">swap_horiz</span> Transfer
            </button>
            <button className="btn btn-primary" onClick={() => { setTankForm({ name: '', fuel_type: 'DIESEL', capacity: '', current_level: '', location: '', unit_cost: '', alert_threshold: '', is_bowser: false, tank_type: 'fixed', notes: '' }); setShowTankModal(true) }}>
              <span className="material-icons">add</span> Add Tank
            </button>
          </>
        )}
      </PageHeader>

      {/* Critical alert banners */}
      {criticalTanks.map(t => (
        <AlertBanner key={t.id} type="danger" message={
          <span>
            <strong>CRITICAL — {t.name} nearly empty:</strong>{' '}
            {getTankPercentage(t.id).toFixed(0)}% · {getCurrentTankLevel(t.id).toLocaleString()} L remaining of {(t.capacity || 0).toLocaleString()} L
          </span>
        } />
      ))}
      {lowTanks.map(t => (
        <AlertBanner key={t.id} type="warning" message={
          <span>
            <strong>LOW FUEL — {t.name}:</strong>{' '}
            {getTankPercentage(t.id).toFixed(0)}% · {getCurrentTankLevel(t.id).toLocaleString()} L remaining — place order soon
          </span>
        } />
      ))}
      {/* Fallback single-tank alert if no tanks in DB */}
      {!showMultiTank && primaryPct < 20 && (
        <AlertBanner
          type={primaryPct < 10 ? 'danger' : 'warning'}
          message={`${primaryPct < 10 ? 'CRITICAL — Tank nearly empty' : 'LOW FUEL'}: ${primaryPct.toFixed(0)}% · ${primaryLevel.toLocaleString()} L`}
        />
      )}

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          {/* Tank gauges */}
          {showMultiTank ? (
            tanks.map(tank => (
              <TankGauge
                key={tank.id}
                tank={tank}
                level={getCurrentTankLevel(tank.id)}
                percentage={getTankPercentage(tank.id)}
              />
            ))
          ) : (
            /* Backward compat: no tanks in DB — show hardcoded single-tank gauge */
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Main Tank</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Capacity: {TANK_MAX_LITRES.toLocaleString()} L</div>
                </div>
                <span style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)' }}>
                  {primaryPct.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 36, background: 'var(--surface2)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ height: '100%', width: `${Math.min(100, primaryPct)}%`, background: primaryPct < 20 ? 'var(--yellow)' : 'var(--teal)', borderRadius: 10, display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
                  {primaryPct > 12 && <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{primaryLevel.toLocaleString()} L</span>}
                </div>
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            {showMultiTank ? (
              tanks.map(t => (
                <KPICard key={t.id} label={t.name} value={`${getCurrentTankLevel(t.id).toLocaleString()} L`} sub={`${getTankPercentage(t.id).toFixed(1)}% · cap: ${(t.capacity || 0).toLocaleString()} L`} color={getTankPercentage(t.id) < 20 ? 'red' : 'teal'} />
              ))
            ) : (
              <KPICard label="Current Level" value={`${primaryLevel.toLocaleString()} L`} sub={`${primaryPct.toFixed(1)}% full`} color="teal" />
            )}
            <KPICard label="Issued Today"       value={`${issuedToday.toLocaleString()} L`}    sub={today} color="yellow" />
            <KPICard label="Issued This Month"  value={`${issuedThisMonth.toLocaleString()} L`} sub={today.slice(0, 7)} />
            <KPICard label="Total Delivered"    value={`${totalDelivered.toLocaleString()} L`}  sub={`${deliveries.length} deliveries`} color="green" />
            <KPICard label="Total Issued"       value={`${totalIssued.toLocaleString()} L`}     sub={`${issuances.length} transactions`} />
          </div>

          {/* Recent issuances */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Recent Issuances</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Amount (L)</th><th>Purpose</th>
                    {showMultiTank && <th>Tank</th>}
                  </tr>
                </thead>
                <tbody>
                  {issuances.slice(0, 8).map(i => {
                    const tank = tanks.find(t => t.id === i.tank_id)
                    return (
                      <tr key={i.id}>
                        <td>{String(i.date).slice(0, 10)}</td>
                        <td style={{ fontWeight: 600 }}>{i.vehicle || '—'}</td>
                        <td>{i.driver || '—'}</td>
                        <td className="td-mono" style={{ color: 'var(--yellow)' }}>{Number(i.amount).toLocaleString()} L</td>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{i.purpose || '—'}</td>
                        {showMultiTank && <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tank?.name || '—'}</td>}
                      </tr>
                    )
                  })}
                  {issuances.length === 0 && (
                    <tr><td colSpan={showMultiTank ? 6 : 5}><EmptyState icon="local_gas_station" message="No issuances yet" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent deliveries */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Recent Deliveries</div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead><tr><th>Date</th><th>Supplier</th><th>Qty (L)</th><th>Fuel Type</th><th>Delivery Note</th></tr></thead>
                <tbody>
                  {deliveries.slice(0, 5).map(d => (
                    <tr key={d.id}>
                      <td>{d.date}</td>
                      <td style={{ fontWeight: 600 }}>{d.supplier || '—'}</td>
                      <td className="td-mono" style={{ color: 'var(--green)' }}>{(d.qty || 0).toLocaleString()} L</td>
                      <td><span className={`badge ${d.fuel_type === 'DIESEL' ? 'badge-yellow' : 'badge-green'}`}>{d.fuel_type}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.delivery_note || '—'}</td>
                    </tr>
                  ))}
                  {deliveries.length === 0 && (
                    <tr><td colSpan="5"><EmptyState icon="local_shipping" message="No deliveries yet" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <>
          {/* 7-day bar chart */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>7-Day Consumption Trend</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Litres issued per day (all tanks)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
              {last7.map((day, i) => {
                const pct     = (day.issued / maxDay) * 100
                const isToday = day.dateStr === today
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, color: isToday ? 'var(--gold)' : 'var(--text-dim)', fontWeight: isToday ? 700 : 400, fontFamily: 'var(--mono)' }}>
                      {day.issued > 0 ? day.issued : ''}
                    </div>
                    <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${Math.max(3, pct)}%`, background: isToday ? 'var(--gold)' : 'var(--teal)', borderRadius: '4px 4px 0 0', opacity: day.issued > 0 ? 1 : 0.15, transition: 'height .4s ease' }} />
                    </div>
                    <div style={{ fontSize: 9, color: isToday ? 'var(--gold)' : 'var(--text-dim)', textAlign: 'center', fontWeight: isToday ? 700 : 400, lineHeight: 1.2 }}>
                      {day.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>By Vehicle (top 8)</div>
              {byVehicle.length === 0 ? <EmptyState icon="directions_car" message="No data yet" /> : byVehicle.map(([vehicle, litres]) => {
                const pct = (litres / maxVehicle) * 100
                const pctTotal = totalIssued > 0 ? ((litres / totalIssued) * 100).toFixed(0) : 0
                return (
                  <div key={vehicle} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={vehicle}>{vehicle}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                        {litres.toLocaleString()} L <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({pctTotal}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>By Driver / Operator (top 8)</div>
              {byDriver.length === 0 ? <EmptyState icon="person" message="No data yet" /> : byDriver.map(([driver, litres]) => {
                const pct = (litres / maxDriver) * 100
                const pctTotal = totalIssued > 0 ? ((litres / totalIssued) * 100).toFixed(0) : 0
                return (
                  <div key={driver} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12 }}>{driver}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                        {litres.toLocaleString()} L <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({pctTotal}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 4 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--yellow)', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {dipstickLog.length > 0 && (
            <div className="card" style={{ padding: 20, marginTop: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Tank Level History (Dipstick)</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>End-of-day levels from dipstick readings</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100, overflowX: 'auto' }}>
                {[...dipstickLog].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-30).map((d, i) => {
                  const lvl = d.fuel_end || 0
                  const tank = tanks.find(t => t.id === d.tank_id)
                  const cap = tank?.capacity || TANK_MAX_LITRES
                  const pct = (lvl / cap) * 100
                  const col = pct < 10 ? 'var(--red)' : pct < 20 ? 'var(--yellow)' : 'var(--teal)'
                  return (
                    <div key={i} title={`${d.date}: ${lvl.toLocaleString()} L${tank ? ` (${tank.name})` : ''}`}
                      style={{ flex: '0 0 20px', height: `${Math.max(4, pct)}%`, background: col, borderRadius: '3px 3px 0 0', cursor: 'pointer', transition: 'opacity .15s' }}
                      onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseOut={e  => e.currentTarget.style.opacity = '1'} />
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>Last {Math.min(30, dipstickLog.length)} readings · hover to see value</div>
            </div>
          )}
        </>
      )}

      {activeTab === 'transfers' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Tank-to-Tank Transfers</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Move fuel between tanks or bowsers</div>
            </div>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => { setTransferForm(BLANK_TRANSFER); setShowTransferModal(true) }}>
                <span className="material-icons">add</span> New Transfer
              </button>
            )}
          </div>
          {(!transfers || transfers.length === 0) ? (
            <EmptyState icon="swap_horiz" message="No transfers recorded yet" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Transfer No</th><th>Date</th><th>From Tank</th><th>To Tank</th>
                    <th>Fuel Type</th><th style={{ textAlign: 'right' }}>Qty (L)</th>
                    <th>Reason</th><th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {[...transfers].sort((a, b) => new Date(b.transfer_date) - new Date(a.transfer_date)).map(t => {
                    const fromTank = tanks.find(tk => tk.id === t.from_tank_id)
                    const toTank   = tanks.find(tk => tk.id === t.to_tank_id)
                    return (
                      <tr key={t.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{t.transfer_no || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{t.transfer_date}</td>
                        <td style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>{fromTank?.name || t.from_tank_id}</td>
                        <td style={{ color: 'var(--green)', fontSize: 12, fontWeight: 600 }}>{toTank?.name || t.to_tank_id}</td>
                        <td><span className="badge badge-yellow" style={{ fontSize: 10 }}>{t.fuel_type}</span></td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{parseFloat(t.quantity).toLocaleString()}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.reason || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t.transferred_by || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showOpeningModal && (
        <ModalDialog title="Set Opening Fuel Balance" onClose={() => setShowOpeningModal(false)}>
          <div style={{ marginBottom: 8, padding: '10px 12px', background: 'rgba(244,162,97,.1)', borderRadius: 6, fontSize: 12, color: 'var(--text-dim)' }}>
            Creates a dipstick reading tagged as <strong>Opening Balance</strong>. Use this once when starting fresh or at period-open to establish the baseline tank level.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Tank *</label>
              <select className="form-control" value={openingForm.tank_id}
                onChange={e => setOpeningForm(f => ({ ...f, tank_id: e.target.value }))}>
                <option value="">Select tank</option>
                {tanks.map(t => <option key={t.id} value={t.id}>{t.name} (cap: {(t.capacity || 0).toLocaleString()}L)</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Opening Level (Litres) *</label>
              <input className="form-control" type="number" min="0" step="1"
                value={openingForm.level}
                onChange={e => setOpeningForm(f => ({ ...f, level: e.target.value }))} />
              {openingForm.tank_id && openingForm.level && (() => {
                const tank = tanks.find(t => t.id === openingForm.tank_id)
                const cap  = tank?.capacity || 0
                const lvl  = parseFloat(openingForm.level) || 0
                const pct  = cap > 0 ? ((lvl / cap) * 100).toFixed(0) : '—'
                return <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>{pct}% of capacity</div>
              })()}
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input className="form-control" type="date" value={openingForm.date}
                onChange={e => setOpeningForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <input className="form-control" placeholder="e.g. Period-open balance"
                value={openingForm.notes}
                onChange={e => setOpeningForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowOpeningModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleOpeningBalance} disabled={openingSaving}>
              {openingSaving ? 'Saving…' : 'Set Opening Balance'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {showTankModal && (
        <ModalDialog title="Add Fuel Tank / Storage" onClose={() => setShowTankModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Tank Name *</label>
              <input className="form-control" placeholder="e.g. Workshop Tank, Drum 1, Site Bowser A"
                value={tankForm.name} onChange={e => setTankForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fuel Type *</label>
              <select className="form-control" value={tankForm.fuel_type}
                onChange={e => setTankForm(f => ({ ...f, fuel_type: e.target.value }))}>
                {['DIESEL','PETROL','PARAFFIN','AVTUR','LUBRICANT'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Tank Type</label>
              <select className="form-control" value={tankForm.tank_type}
                onChange={e => setTankForm(f => ({ ...f, tank_type: e.target.value }))}>
                <option value="fixed">Fixed Tank</option>
                <option value="drum">Drum</option>
                <option value="ibc">IBC / Tote</option>
                <option value="bowser">Bowser / Mobile</option>
              </select>
            </div>
            <div className="form-group">
              <label>Capacity (Litres) *</label>
              <input className="form-control" type="number" min="1" step="1"
                value={tankForm.capacity} onChange={e => setTankForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Current Level (Litres)</label>
              <input className="form-control" type="number" min="0" step="1" placeholder="0"
                value={tankForm.current_level} onChange={e => setTankForm(f => ({ ...f, current_level: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Location / Site</label>
              <input className="form-control" placeholder="e.g. Workshop, Pit A, Camp Store"
                value={tankForm.location} onChange={e => setTankForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Unit Cost ($/L)</label>
              <input className="form-control" type="number" min="0" step="0.001" placeholder="0.00"
                value={tankForm.unit_cost} onChange={e => setTankForm(f => ({ ...f, unit_cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Alert Threshold (L)</label>
              <input className="form-control" type="number" min="0" step="1" placeholder="0"
                value={tankForm.alert_threshold} onChange={e => setTankForm(f => ({ ...f, alert_threshold: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="is_bowser_chk" checked={tankForm.is_bowser}
                onChange={e => setTankForm(f => ({ ...f, is_bowser: e.target.checked, tank_type: e.target.checked ? 'bowser' : f.tank_type }))} />
              <label htmlFor="is_bowser_chk" style={{ margin: 0, cursor: 'pointer' }}>
                This is a mobile bowser (can be dispatched to sites)
              </label>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <input className="form-control" value={tankForm.notes}
                onChange={e => setTankForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowTankModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddTank} disabled={tankSaving}>
              {tankSaving ? 'Saving…' : 'Create Tank'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {showTransferModal && (
        <ModalDialog title="Tank-to-Tank Transfer" onClose={() => setShowTransferModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>From Tank (Source) *</label>
              <select className="form-control" value={transferForm.from_tank_id}
                onChange={e => setTransferForm(f => ({ ...f, from_tank_id: e.target.value }))}>
                <option value="">Select source tank</option>
                {tanks.map(t => {
                  const lvl = getCurrentTankLevel(t.id)
                  return <option key={t.id} value={t.id}>{t.name} — {lvl.toLocaleString()}L avail</option>
                })}
              </select>
              {transferForm.from_tank_id && (() => {
                const lvl = getCurrentTankLevel(transferForm.from_tank_id)
                const qty = parseFloat(transferForm.quantity) || 0
                return (
                  <div style={{ fontSize: 11, marginTop: 4, color: qty > lvl ? 'var(--red)' : 'var(--text-dim)' }}>
                    Available: {lvl.toLocaleString()}L {qty > lvl ? '— Insufficient!' : ''}
                  </div>
                )
              })()}
            </div>
            <div className="form-group">
              <label>To Tank (Destination) *</label>
              <select className="form-control" value={transferForm.to_tank_id}
                onChange={e => setTransferForm(f => ({ ...f, to_tank_id: e.target.value }))}>
                <option value="">Select destination tank</option>
                {tanks.filter(t => t.id !== transferForm.from_tank_id).map(t => {
                  const lvl = getCurrentTankLevel(t.id)
                  const cap = t.capacity || 0
                  const space = cap - lvl
                  return <option key={t.id} value={t.id}>{t.name} — {space.toLocaleString()}L free</option>
                })}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity to Transfer (L) *</label>
              <input className="form-control" type="number" min="1" step="0.1"
                value={transferForm.quantity}
                onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fuel Type</label>
              <select className="form-control" value={transferForm.fuel_type}
                onChange={e => setTransferForm(f => ({ ...f, fuel_type: e.target.value }))}>
                {['DIESEL','PETROL','PARAFFIN','AVTUR'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Reason</label>
              <input className="form-control" placeholder="Why is this transfer needed?"
                value={transferForm.reason}
                onChange={e => setTransferForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input className="form-control" value={transferForm.notes}
                onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleTransfer} disabled={transferSaving}>
              {transferSaving ? 'Transferring…' : 'Confirm Transfer'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
