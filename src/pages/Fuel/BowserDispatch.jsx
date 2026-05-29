// src/pages/Fuel/BowserDispatch.jsx — Mobile bowser dispatch & return tracking

import { useState } from 'react'
import { useFuel } from '../../contexts/FuelContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const BLANK_DISPATCH = { bowser_id: '', site: '', dispatch_date: today, opening_level: '', dispatched_by: '', notes: '' }
const BLANK_RETURN   = { closing_level: '', return_date: today }

const STATUS_COLOR = { dispatched: 'badge-yellow', returned: 'badge-green', cancelled: 'badge-red' }

export default function BowserDispatch() {
  const {
    tanks, bowserDispatches, getCurrentTankLevel, getTankPercentage,
    addBowserDispatch, returnBowser,
  } = useFuel()
  const { user } = useAuth()
  const canEdit = useCanEdit('fuel', 'tanks')

  const [activeTab, setActiveTab]       = useState('active')
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [showReturnModal, setShowReturnModal]     = useState(false)
  const [dispatchForm, setDispatchForm] = useState(BLANK_DISPATCH)
  const [returnForm, setReturnForm]     = useState(BLANK_RETURN)
  const [selectedDispatch, setSelectedDispatch]   = useState(null)
  const [saving, setSaving] = useState(false)

  const bowserTanks = tanks.filter(t => t.is_bowser)

  const active    = bowserDispatches.filter(d => d.status === 'dispatched')
  const history   = bowserDispatches.filter(d => d.status !== 'dispatched')
  const totalDispatched = active.reduce((s, d) => s + (d.opening_level || 0), 0)
  const totalReturned   = history.filter(d => d.status === 'returned').length
  const totalDispensed  = history.reduce((s, d) => s + (d.fuel_dispensed || 0), 0)

  const TABS = [
    { id: 'active',  label: `Active (${active.length})`,   icon: 'local_shipping' },
    { id: 'history', label: 'History',                     icon: 'history'        },
    { id: 'bowsers', label: 'Bowser Tanks',                icon: 'water'          },
  ]

  const handleDispatch = async () => {
    if (!dispatchForm.bowser_id) { toast.error('Select a bowser tank'); return }
    if (!dispatchForm.site.trim()) { toast.error('Enter destination site'); return }
    setSaving(true)
    try {
      const tank    = tanks.find(t => t.id === dispatchForm.bowser_id)
      const tankLvl = getCurrentTankLevel(dispatchForm.bowser_id)
      const openingLevel = dispatchForm.opening_level !== '' ? parseFloat(dispatchForm.opening_level) : tankLvl
      const no = await addBowserDispatch({
        ...dispatchForm,
        opening_level: openingLevel,
        dispatched_by: dispatchForm.dispatched_by || user?.full_name || user?.email || '',
      })
      toast.success(`Dispatch ${no} created`)
      setShowDispatchModal(false)
      setDispatchForm(BLANK_DISPATCH)
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleReturn = async () => {
    if (!returnForm.closing_level && returnForm.closing_level !== 0) { toast.error('Enter closing fuel level'); return }
    setSaving(true)
    try {
      await returnBowser(selectedDispatch.id, returnForm.closing_level, returnForm.return_date)
      toast.success('Bowser return recorded')
      setShowReturnModal(false)
      setSelectedDispatch(null)
      setReturnForm(BLANK_RETURN)
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const openReturnModal = (dispatch) => {
    setSelectedDispatch(dispatch)
    setReturnForm({ closing_level: '', return_date: today })
    setShowReturnModal(true)
  }

  const getBowserName = (id) => tanks.find(t => t.id === id)?.name || id || '—'

  if (bowserTanks.length === 0 && bowserDispatches.length === 0) {
    return (
      <div>
        <PageHeader title="Bowser Dispatch" />
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <span className="material-icons" style={{ fontSize: 56, color: 'var(--text-dim)', display: 'block', marginBottom: 12 }}>local_shipping</span>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No Bowser Tanks Configured</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 400, margin: '0 auto' }}>
            To use bowser dispatch, mark one or more tanks as bowsers in the Fuel Tanks settings (enable the <strong>is_bowser</strong> flag on a tank record).
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Bowser Dispatch">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setDispatchForm(BLANK_DISPATCH); setShowDispatchModal(true) }}>
            <span className="material-icons">local_shipping</span> Dispatch Bowser
          </button>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Active Dispatches" value={active.length}       icon="local_shipping" color={active.length > 0 ? 'yellow' : ''} />
        <KPICard label="Fuel Out (L)"       value={`${totalDispatched.toLocaleString()} L`} icon="water" color="red" />
        <KPICard label="Trips Returned"     value={totalReturned}       icon="check_circle" color="green" />
        <KPICard label="Total Dispensed"    value={`${totalDispensed.toLocaleString()} L`} icon="local_gas_station" />
      </div>

      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'active' && (
        <div className="card" style={{ padding: 16 }}>
          {active.length === 0 ? (
            <EmptyState icon="local_shipping" message="No bowsers currently dispatched" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Dispatch No</th><th>Date</th><th>Bowser</th><th>Site / Destination</th>
                    <th style={{ textAlign: 'right' }}>Opening Level (L)</th>
                    <th>Dispatched By</th><th>Notes</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{d.dispatch_no || '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{d.dispatch_date}</td>
                      <td style={{ fontWeight: 600 }}>{getBowserName(d.bowser_id)}</td>
                      <td style={{ color: 'var(--gold)' }}>{d.site}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {(d.opening_level || 0).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.dispatched_by || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.notes || '—'}</td>
                      <td>
                        {canEdit && (
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => openReturnModal(d)}>
                            <span className="material-icons" style={{ fontSize: 14 }}>assignment_return</span> Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card" style={{ padding: 16 }}>
          {history.length === 0 ? (
            <EmptyState icon="history" message="No completed dispatches yet" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Dispatch No</th><th>Dispatch Date</th><th>Return Date</th>
                    <th>Bowser</th><th>Site</th>
                    <th style={{ textAlign: 'right' }}>Opening (L)</th>
                    <th style={{ textAlign: 'right' }}>Closing (L)</th>
                    <th style={{ textAlign: 'right' }}>Dispensed (L)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date)).map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{d.dispatch_no || '—'}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{d.dispatch_date}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-dim)' }}>{d.return_date || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{getBowserName(d.bowser_id)}</td>
                      <td>{d.site}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{(d.opening_level || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{d.closing_level != null ? parseFloat(d.closing_level).toLocaleString() : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--yellow)' }}>
                        {d.fuel_dispensed != null ? parseFloat(d.fuel_dispensed).toLocaleString() : '—'}
                      </td>
                      <td><span className={`badge ${STATUS_COLOR[d.status] || 'badge-yellow'}`} style={{ fontSize: 10 }}>{d.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bowsers' && (
        <div>
          {bowserTanks.length === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <EmptyState icon="water" message="No tanks marked as bowsers. Set is_bowser = true on a tank." />
            </div>
          ) : bowserTanks.map(tank => {
            const lvl = getCurrentTankLevel(tank.id)
            const pct = getTankPercentage(tank.id)
            const col = pct < 10 ? 'var(--red)' : pct < 30 ? 'var(--yellow)' : 'var(--teal)'
            const dispatches = bowserDispatches.filter(d => d.bowser_id === tank.id)
            const activeForTank = dispatches.filter(d => d.status === 'dispatched').length
            return (
              <div key={tank.id} className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{tank.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {tank.tank_code || tank.id} · {tank.fuel_type || 'DIESEL'} · Cap: {(tank.capacity || 0).toLocaleString()}L
                      {tank.location && ` · ${tank.location}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {activeForTank > 0 && <span className="badge badge-yellow">{activeForTank} dispatched</span>}
                    <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', fontSize: 22, color: col }}>{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ height: 20, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: col, borderRadius: 6, transition: 'width .6s ease' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {lvl.toLocaleString()}L available · {dispatches.length} total dispatches
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dispatch modal */}
      {showDispatchModal && (
        <ModalDialog title="Dispatch Bowser" onClose={() => setShowDispatchModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Bowser Tank *</label>
              <select className="form-control" value={dispatchForm.bowser_id}
                onChange={e => {
                  const t = tanks.find(tk => tk.id === e.target.value)
                  const lvl = t ? getCurrentTankLevel(t.id) : ''
                  setDispatchForm(f => ({ ...f, bowser_id: e.target.value, opening_level: lvl !== '' ? String(lvl) : '' }))
                }}>
                <option value="">Select bowser</option>
                {bowserTanks.map(t => {
                  const lvl = getCurrentTankLevel(t.id)
                  return <option key={t.id} value={t.id}>{t.name} — {lvl.toLocaleString()}L avail</option>
                })}
                {bowserTanks.length === 0 && tanks.map(t => {
                  const lvl = getCurrentTankLevel(t.id)
                  return <option key={t.id} value={t.id}>{t.name} — {lvl.toLocaleString()}L avail</option>
                })}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Site / Destination *</label>
              <input className="form-control" placeholder="e.g. Site B, Crusher Plant"
                value={dispatchForm.site}
                onChange={e => setDispatchForm(f => ({ ...f, site: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Dispatch Date</label>
              <input className="form-control" type="date" value={dispatchForm.dispatch_date}
                onChange={e => setDispatchForm(f => ({ ...f, dispatch_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Opening Level (L)</label>
              <input className="form-control" type="number" min="0" step="0.1"
                value={dispatchForm.opening_level}
                onChange={e => setDispatchForm(f => ({ ...f, opening_level: e.target.value }))}
                placeholder="Auto-filled from tank level" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Dispatched By</label>
              <input className="form-control" value={dispatchForm.dispatched_by}
                onChange={e => setDispatchForm(f => ({ ...f, dispatched_by: e.target.value }))}
                placeholder={user?.full_name || user?.email || ''} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <input className="form-control" value={dispatchForm.notes}
                onChange={e => setDispatchForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowDispatchModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDispatch} disabled={saving}>
              {saving ? 'Dispatching…' : 'Confirm Dispatch'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Return modal */}
      {showReturnModal && selectedDispatch && (
        <ModalDialog title="Record Bowser Return" onClose={() => { setShowReturnModal(false); setSelectedDispatch(null) }}>
          <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
            <div><strong>{getBowserName(selectedDispatch.bowser_id)}</strong> → <span style={{ color: 'var(--gold)' }}>{selectedDispatch.site}</span></div>
            <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>
              Dispatched {selectedDispatch.dispatch_date} · Opening: {(selectedDispatch.opening_level || 0).toLocaleString()}L
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Closing Level (L) *</label>
              <input className="form-control" type="number" min="0" step="0.1"
                value={returnForm.closing_level}
                onChange={e => setReturnForm(f => ({ ...f, closing_level: e.target.value }))} />
              {returnForm.closing_level !== '' && (
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>
                  Dispensed: <strong style={{ color: 'var(--yellow)' }}>
                    {Math.max(0, (selectedDispatch.opening_level || 0) - (parseFloat(returnForm.closing_level) || 0)).toLocaleString()}L
                  </strong>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Return Date</label>
              <input className="form-control" type="date" value={returnForm.return_date}
                onChange={e => setReturnForm(f => ({ ...f, return_date: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowReturnModal(false); setSelectedDispatch(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReturn} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm Return'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
