// src/pages/Fuel/FuelShifts.jsx — Fuel attendant shift management

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, TabNav, AlertBanner, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX } from '../../engine/reportingEngine'

const today = new Date().toISOString().split('T')[0]

const BLANK_OPEN  = { shift_date: today, attendant_name: '', tank_id: '', opening_level: '', opening_meter: '', notes: '' }
const BLANK_CLOSE = { closing_level: '', closing_meter: '', notes: '' }

const STATUS_STYLE = {
  open:       { cls: 'badge-yellow', label: 'Open'       },
  closed:     { cls: 'badge-green',  label: 'Closed'     },
  reconciled: { cls: 'badge-teal',   label: 'Reconciled' },
}

export default function FuelShifts() {
  const {
    tanks, fuelShifts, issuances,
    getCurrentTankLevel, addFuelShift, closeFuelShift,
  } = useFuel()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'issuance')

  const [activeTab, setActiveTab]           = useState('active')
  const [showOpenModal, setShowOpenModal]   = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [openForm, setOpenForm]             = useState(BLANK_OPEN)
  const [closeForm, setCloseForm]           = useState(BLANK_CLOSE)
  const [selectedShift, setSelectedShift]   = useState(null)
  const [saving, setSaving]                 = useState(false)

  const openShifts   = fuelShifts.filter(s => s.status === 'open')
  const closedShifts = fuelShifts.filter(s => s.status !== 'open')

  // KPIs
  const todayShifts   = fuelShifts.filter(s => String(s.shift_date).slice(0, 10) === today)
  const todayIssued   = fuelShifts
    .filter(s => String(s.shift_date).slice(0, 10) === today && s.status !== 'open')
    .reduce((sum, s) => sum + (s.total_issued || 0), 0)
  const highVariance  = closedShifts.filter(s => Math.abs(s.variance || 0) > 50)

  const TABS = [
    { id: 'active',  label: `Open Shifts (${openShifts.length})`, icon: 'play_circle'  },
    { id: 'history', label: 'Shift History',                       icon: 'history'      },
  ]

  const getTankName = (id) => tanks.find(t => t.id === id)?.name || id || '—'

  const handleOpenShift = async () => {
    if (!openForm.attendant_name.trim()) { toast.error('Enter attendant name'); return }
    setSaving(true)
    try {
      const tank    = tanks.find(t => t.id === openForm.tank_id)
      const tankLvl = tank ? getCurrentTankLevel(tank.id) : 0
      const no = await addFuelShift({
        ...openForm,
        opening_level: openForm.opening_level !== '' ? parseFloat(openForm.opening_level) : tankLvl,
        opened_by: user?.full_name || user?.email || '',
      })
      toast.success(`Shift ${no} opened`)
      setShowOpenModal(false)
      setOpenForm(BLANK_OPEN)
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleCloseShift = async () => {
    if (!closeForm.closing_level && closeForm.closing_level !== 0) { toast.error('Enter closing fuel level'); return }
    setSaving(true)
    try {
      await closeFuelShift(selectedShift.id, closeForm, user?.full_name || user?.email || '')
      toast.success('Shift closed successfully')
      setShowCloseModal(false)
      setSelectedShift(null)
      setCloseForm(BLANK_CLOSE)
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const openCloseModal = (shift) => {
    setSelectedShift(shift)
    setCloseForm({ closing_level: '', closing_meter: String(shift.opening_meter || ''), notes: '' })
    setShowCloseModal(true)
  }

  const handleExport = () => {
    exportXLSX(
      closedShifts.map(s => ({
        'Shift No':     s.shift_no,
        Date:           s.shift_date,
        Attendant:      s.attendant_name,
        Tank:           getTankName(s.tank_id),
        'Opening (L)':  s.opening_level,
        'Closing (L)':  s.closing_level,
        'Issued (L)':   s.total_issued,
        Variance:       s.variance,
        Status:         s.status,
        'Opened By':    s.opened_by,
        'Closed By':    s.closed_by,
      })),
      `FuelShifts_${today}`,
      'Fuel Shifts'
    )
    toast.success('Exported')
  }

  // Estimate shift issuances for open shift preview
  const getShiftIssuances = (shift) =>
    issuances.filter(i =>
      i.shift_id === shift.id ||
      (String(i.date).slice(0, 10) === String(shift.shift_date).slice(0, 10) && i.tank_id === shift.tank_id && !i.shift_id)
    )

  return (
    <div>
      <PageHeader title="Fuel Shifts">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setOpenForm(BLANK_OPEN); setShowOpenModal(true) }}>
            <span className="material-icons">play_circle</span> Open Shift
          </button>
        )}
      </PageHeader>

      {highVariance.length > 0 && (
        <AlertBanner type="warning"
          message={`${highVariance.length} closed shift${highVariance.length > 1 ? 's' : ''} with variance > 50L — review for discrepancies`}
        />
      )}

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Open Shifts"      value={openShifts.length}              icon="play_circle"     color={openShifts.length > 0 ? 'yellow' : ''} />
        <KPICard label="Shifts Today"     value={todayShifts.length}             icon="today"           />
        <KPICard label="Issued Today"     value={`${todayIssued.toLocaleString()} L`} icon="local_gas_station" color="gold" />
        <KPICard label="Variance Alerts"  value={highVariance.length}            icon="warning"         color={highVariance.length > 0 ? 'red' : ''} />
      </div>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'active' && (
        <div>
          {openShifts.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <EmptyState icon="play_circle" message="No open shifts — click 'Open Shift' to start" />
            </div>
          ) : openShifts.map(shift => {
            const shiftIssuances = getShiftIssuances(shift)
            const totalIssued    = shiftIssuances.reduce((s, i) => s + (Number(i.amount) || 0), 0)
            const elapsed = shift.opened_at
              ? Math.round((Date.now() - new Date(shift.opened_at).getTime()) / 60000)
              : null
            return (
              <div key={shift.id} className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid var(--yellow)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{shift.shift_no}</span>
                      <span className="badge badge-yellow" style={{ fontSize: 10 }}>OPEN</span>
                      {elapsed != null && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{elapsed < 60 ? `${elapsed}m ago` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m ago`}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{shift.attendant_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                      {getTankName(shift.tank_id)} · {shift.shift_date} · Opened by {shift.opened_by}
                    </div>
                  </div>
                  {canEdit && (
                    <button className="btn btn-primary" onClick={() => openCloseModal(shift)}>
                      <span className="material-icons">stop_circle</span> Close Shift
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Opening Level</div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 16, marginTop: 2 }}>{(shift.opening_level || 0).toLocaleString()} L</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Issued So Far</div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 16, marginTop: 2, color: 'var(--yellow)' }}>{totalIssued.toLocaleString()} L</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Transactions</div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 16, marginTop: 2 }}>{shiftIssuances.length}</div>
                  </div>
                </div>

                {shiftIssuances.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-dim)' }}>Issuances This Shift</div>
                    <div className="table-wrap">
                      <table className="stock-table" style={{ fontSize: 12 }}>
                        <thead><tr><th>Time</th><th>Vehicle</th><th>Driver</th><th style={{ textAlign: 'right' }}>Litres</th><th>Purpose</th></tr></thead>
                        <tbody>
                          {shiftIssuances.slice(0, 10).map(i => (
                            <tr key={i.id}>
                              <td style={{ whiteSpace: 'nowrap' }}>{String(i.date).slice(0, 10)}</td>
                              <td style={{ fontWeight: 600 }}>{i.vehicle || i.equipment_name || '—'}</td>
                              <td>{i.driver || i.driver_operator || '—'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--yellow)' }}>{Number(i.amount).toLocaleString()}</td>
                              <td style={{ color: 'var(--text-dim)' }}>{i.purpose || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card" style={{ padding: 16 }}>
          {closedShifts.length === 0 ? (
            <EmptyState icon="history" message="No closed shifts yet" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Shift No</th><th>Date</th><th>Attendant</th><th>Tank</th>
                    <th style={{ textAlign: 'right' }}>Opening (L)</th>
                    <th style={{ textAlign: 'right' }}>Closing (L)</th>
                    <th style={{ textAlign: 'right' }}>Issued (L)</th>
                    <th style={{ textAlign: 'right' }}>Variance (L)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...closedShifts].sort((a, b) => new Date(b.shift_date) - new Date(a.shift_date)).map(s => {
                    const absVariance = Math.abs(s.variance || 0)
                    const varColor = absVariance > 100 ? 'var(--red)' : absVariance > 50 ? 'var(--yellow)' : 'var(--text-dim)'
                    const st = STATUS_STYLE[s.status] || STATUS_STYLE.closed
                    return (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{s.shift_no}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{s.shift_date}</td>
                        <td style={{ fontWeight: 600 }}>{s.attendant_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{getTankName(s.tank_id)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{(s.opening_level || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{s.closing_level != null ? parseFloat(s.closing_level).toLocaleString() : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                          {(s.total_issued || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: varColor }}>
                          {s.variance != null ? (s.variance > 0 ? '+' : '') + parseFloat(s.variance).toFixed(1) : '—'}
                        </td>
                        <td><span className={`badge ${st.cls}`} style={{ fontSize: 10 }}>{st.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Open shift modal */}
      {showOpenModal && (
        <ModalDialog title="Open Fuel Shift" onClose={() => setShowOpenModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Shift Date</label>
              <input className="form-control" type="date" value={openForm.shift_date}
                onChange={e => setOpenForm(f => ({ ...f, shift_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Attendant Name *</label>
              <input className="form-control" placeholder="Fuel attendant"
                value={openForm.attendant_name}
                onChange={e => setOpenForm(f => ({ ...f, attendant_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Tank</label>
              <select className="form-control" value={openForm.tank_id}
                onChange={e => {
                  const lvl = e.target.value ? getCurrentTankLevel(e.target.value) : ''
                  setOpenForm(f => ({ ...f, tank_id: e.target.value, opening_level: lvl !== '' ? String(lvl) : '' }))
                }}>
                <option value="">All / Not specified</option>
                {tanks.map(t => {
                  const lvl = getCurrentTankLevel(t.id)
                  return <option key={t.id} value={t.id}>{t.name} — {lvl.toLocaleString()}L</option>
                })}
              </select>
            </div>
            <div className="form-group">
              <label>Opening Level (L)</label>
              <input className="form-control" type="number" min="0" step="1"
                value={openForm.opening_level}
                onChange={e => setOpenForm(f => ({ ...f, opening_level: e.target.value }))}
                placeholder="Auto from tank level" />
            </div>
            <div className="form-group">
              <label>Opening Meter Reading</label>
              <input className="form-control" type="number" min="0" step="0.01"
                value={openForm.opening_meter}
                onChange={e => setOpenForm(f => ({ ...f, opening_meter: e.target.value }))}
                placeholder="Flowmeter / pump counter" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input className="form-control" value={openForm.notes}
                onChange={e => setOpenForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowOpenModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleOpenShift} disabled={saving}>
              {saving ? 'Opening…' : 'Open Shift'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Close shift modal */}
      {showCloseModal && selectedShift && (
        <ModalDialog title="Close Shift" onClose={() => { setShowCloseModal(false); setSelectedShift(null) }}>
          <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
            <strong>{selectedShift.attendant_name}</strong> · {getTankName(selectedShift.tank_id)} · {selectedShift.shift_date}
            <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>Opening: {(selectedShift.opening_level || 0).toLocaleString()}L</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Closing Level (L) *</label>
              <input className="form-control" type="number" min="0" step="1"
                value={closeForm.closing_level}
                onChange={e => setCloseForm(f => ({ ...f, closing_level: e.target.value }))} />
              {closeForm.closing_level !== '' && (() => {
                const shiftIssuances = getShiftIssuances(selectedShift)
                const totalIssued = shiftIssuances.reduce((s, i) => s + (Number(i.amount) || 0), 0)
                const variance = (selectedShift.opening_level || 0) - (parseFloat(closeForm.closing_level) || 0) - totalIssued
                const varColor = Math.abs(variance) > 100 ? 'var(--red)' : Math.abs(variance) > 50 ? 'var(--yellow)' : 'var(--green)'
                return (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Issued: <strong>{totalIssued.toLocaleString()}L</strong> ·
                    Variance: <strong style={{ color: varColor }}>{variance > 0 ? '+' : ''}{variance.toFixed(1)}L</strong>
                  </div>
                )
              })()}
            </div>
            <div className="form-group">
              <label>Closing Meter Reading</label>
              <input className="form-control" type="number" min="0" step="0.01"
                value={closeForm.closing_meter}
                onChange={e => setCloseForm(f => ({ ...f, closing_meter: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Closing Notes</label>
              <textarea className="form-control" rows="2" value={closeForm.notes}
                onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowCloseModal(false); setSelectedShift(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCloseShift} disabled={saving}>
              {saving ? 'Closing…' : 'Close Shift'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
