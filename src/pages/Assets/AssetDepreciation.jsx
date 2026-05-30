// src/pages/Assets/AssetDepreciation.jsx
// Asset depreciation management: schedules, entries, run depreciation, GL posting.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions, AlertBanner } from '../../components/ui'
import { runMonthlyDepreciation, runBatchDepreciation, buildProjectedSchedule, computeAssetDepreciation } from '../../engine/depreciationEngine'
import { exportXLSX } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]
const currentPeriod = today.slice(0, 7)

const METHODS = [
  { value: 'straight_line',    label: 'Straight Line'    },
  { value: 'reducing_balance', label: 'Reducing Balance' },
  { value: 'usage_based',      label: 'Usage-Based'      },
]

const STATUS_BADGE = {
  active:            'badge-green',
  fully_depreciated: 'badge-default',
  suspended:         'badge-yellow',
  disposed:          'badge-red',
}

const ENTRY_BADGE = { Draft: 'badge-yellow', Posted: 'badge-green', Cancelled: 'badge-default' }

const TABS = [
  { id: 'schedules', label: 'Schedules'        },
  { id: 'entries',   label: 'Entries'          },
  { id: 'run',       label: 'Run Depreciation' },
  { id: 'fleet',     label: 'Fleet Schedule'   },
]

const BLANK_SCHED = {
  asset_id: '', depreciation_method: 'straight_line', purchase_cost: '',
  salvage_value: '', useful_life_years: '', annual_rate: '20',
  start_date: today, gl_asset_account: '', gl_depreciation_acct: '', gl_accum_depr_acct: '', notes: '',
}

export default function AssetDepreciation() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('fleet', 'maintenance')

  const [tab,       setTab]       = useState('schedules')
  const [schedules, setSchedules] = useState([])
  const [entries,   setEntries]   = useState([])
  const [assets,    setAssets]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  const [showNewSched,  setShowNewSched]  = useState(false)
  const [showRunModal,  setShowRunModal]  = useState(false)
  const [showProjModal, setShowProjModal] = useState(false)
  const [selectedSched, setSelectedSched] = useState(null)
  const [projRows,      setProjRows]      = useState([])

  const [newSchedForm, setNewSchedForm] = useState(BLANK_SCHED)
  const [runForm, setRunForm] = useState({ periodLabel: currentPeriod, entryDate: today, mode: 'batch' })
  const [saving,  setSaving]  = useState(false)
  const [batchResult, setBatchResult] = useState(null)

  // Fleet Schedule tab state
  const [fleetAssets,       setFleetAssets]       = useState([])
  const [fleetAssetsLoading, setFleetAssetsLoading] = useState(false)
  const [fleetSearch,       setFleetSearch]       = useState('')
  const [fleetMethodFilter, setFleetMethodFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [schedRes, entryRes, assetRes] = await Promise.all([
      supabase.from('asset_depreciation_schedules').select('*').order('created_at', { ascending: false }),
      supabase.from('asset_depreciation_entries').select('*, asset_depreciation_schedules(asset_code)').order('entry_date', { ascending: false }).limit(500),
      supabase.from('asset_registry').select('id,asset_code,asset_name,asset_category').order('asset_name'),
    ])
    setSchedules(schedRes.data || [])
    setEntries(entryRes.data || [])
    setAssets(assetRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Load fleet assets for Fleet Schedule tab
  useEffect(() => {
    if (tab !== 'fleet') return
    setFleetAssetsLoading(true)
    supabase.from('asset_registry')
      .select('id,asset_code,asset_name,asset_category,fleet_number,purchase_cost,purchase_date,disposal_value,salvage_value,useful_life_years,depreciation_method,depreciation_rate,current_book_value,expected_lifetime_km,current_odometer,status')
      .neq('status', 'Disposed')
      .order('asset_name')
      .then(({ data }) => { setFleetAssets(data || []); setFleetAssetsLoading(false) })
      .catch(() => setFleetAssetsLoading(false))
  }, [tab])

  const filteredSchedules = schedules.filter(s =>
    !search || s.asset_code?.toLowerCase().includes(search.toLowerCase())
  )
  const filteredEntries = entries.filter(e =>
    !search || e.period_label?.includes(search) || e.asset_depreciation_schedules?.asset_code?.toLowerCase().includes(search.toLowerCase())
  )

  // KPIs
  const totalBV   = schedules.reduce((s, x) => s + (parseFloat(x.book_value) || 0), 0)
  const active    = schedules.filter(s => s.status === 'active').length
  const fullyDep  = schedules.filter(s => s.status === 'fully_depreciated').length
  const thisMonth = entries.filter(e => e.period_label === currentPeriod).length

  const handleCreateSchedule = async () => {
    const f = newSchedForm
    if (!f.asset_id)         { toast.error('Asset is required'); return }
    if (!f.purchase_cost)    { toast.error('Purchase cost is required'); return }
    if (!f.useful_life_years){ toast.error('Useful life is required'); return }
    if (!f.start_date)       { toast.error('Start date is required'); return }
    setSaving(true)
    try {
      const asset = assets.find(a => a.id === f.asset_id)
      const cost  = parseFloat(f.purchase_cost)
      const salv  = parseFloat(f.salvage_value) || 0
      const life  = parseFloat(f.useful_life_years)
      const { error } = await supabase.from('asset_depreciation_schedules').insert([{
        asset_id:              f.asset_id,
        asset_code:            asset?.asset_code || asset?.asset_name || '',
        depreciation_method:   f.depreciation_method,
        purchase_cost:         cost,
        salvage_value:         salv,
        useful_life_years:     life,
        annual_rate:           parseFloat(f.annual_rate) || 20,
        start_date:            f.start_date,
        expected_end_date:     (() => {
          const d = new Date(f.start_date)
          d.setFullYear(d.getFullYear() + life)
          return d.toISOString().split('T')[0]
        })(),
        total_depreciated:     0,
        book_value:            cost,
        status:                'active',
        gl_asset_account:      f.gl_asset_account || null,
        gl_depreciation_acct:  f.gl_depreciation_acct || null,
        gl_accum_depr_acct:    f.gl_accum_depr_acct || null,
        notes:                 f.notes || null,
        created_by:            user?.id || '',
        created_at:            new Date().toISOString(),
        updated_at:            new Date().toISOString(),
      }])
      if (error) throw error
      toast.success('Depreciation schedule created')
      setShowNewSched(false)
      setNewSchedForm(BLANK_SCHED)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleRunDepreciation = async () => {
    if (!runForm.periodLabel) { toast.error('Period is required'); return }
    if (!runForm.entryDate)   { toast.error('Entry date is required'); return }
    setSaving(true)
    setBatchResult(null)
    try {
      if (runForm.mode === 'batch') {
        const res = await runBatchDepreciation({
          periodLabel: runForm.periodLabel,
          entryDate: runForm.entryDate,
          userId: user?.id,
        })
        setBatchResult(res)
        const msg = `Done: ${res.success.length} posted, ${res.skipped.length} skipped, ${res.failed.length} failed`
        res.failed.length > 0 ? toast.error(msg) : toast.success(msg)
      } else {
        if (!selectedSched) { toast.error('Select a schedule first'); setSaving(false); return }
        const r = await runMonthlyDepreciation({
          scheduleId: selectedSched.id,
          periodLabel: runForm.periodLabel,
          entryDate: runForm.entryDate,
          userId: user?.id,
        })
        toast.success(`Depreciation posted: $${r.depAmount.toFixed(2)} — Book value: $${r.newBV.toFixed(2)}`)
        setShowRunModal(false)
      }
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleShowProjection = (sched) => {
    setSelectedSched(sched)
    setProjRows(buildProjectedSchedule(sched))
    setShowProjModal(true)
  }

  const handleExport = () => {
    if (!filteredEntries.length) return toast.error('No entries to export')
    exportXLSX(filteredEntries.map(e => ({
      'Period':         e.period_label,
      'Asset':          e.asset_depreciation_schedules?.asset_code || '—',
      'Entry Date':     e.entry_date,
      'Amount ($)':     parseFloat(e.depreciation_amount || 0).toFixed(2),
      'Book Value After': parseFloat(e.book_value_after || 0).toFixed(2),
      'GL Entry':       e.journal_entry_id || '—',
      'Status':         e.status,
    })), `Depreciation_Entries_${today}`, 'Entries')
    toast.success(`Exported ${filteredEntries.length} entries`)
  }

  return (
    <div>
      <PageHeader title="Asset Depreciation" subtitle="Schedules, monthly run, GL posting">
        <button className="btn btn-secondary" onClick={handleExport} disabled={tab !== 'entries' || !filteredEntries.length}>
          <span className="material-icons">download</span> Export
        </button>
        {canEdit && (
          <>
            <button className="btn btn-secondary" onClick={() => { setShowRunModal(true); setBatchResult(null) }}>
              <span className="material-icons">play_arrow</span> Run Depreciation
            </button>
            <button className="btn btn-primary" onClick={() => setShowNewSched(true)}>
              <span className="material-icons">add</span> New Schedule
            </button>
          </>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Book Value"   value={`$${totalBV.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon="account_balance_wallet" color="gold" />
        <KPICard label="Active Schedules"   value={active}   icon="event_repeat"   color="green" />
        <KPICard label="Fully Depreciated"  value={fullyDep} icon="check_circle"   color="teal"  />
        <KPICard label="Entries This Month" value={thisMonth} icon="receipt_long"  color="blue"  sub={currentPeriod} />
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input className="form-control" placeholder="Search asset code or period…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Schedules tab ── */}
      {tab === 'schedules' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Asset Code</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Cost ($)</th>
                  <th style={{ textAlign: 'right' }}>Salvage ($)</th>
                  <th style={{ textAlign: 'right' }}>Life (yrs)</th>
                  <th style={{ textAlign: 'right' }}>Book Value ($)</th>
                  <th style={{ textAlign: 'right' }}>Depreciated ($)</th>
                  <th>Start Date</th>
                  <th>Status</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : filteredSchedules.length === 0 ? (
                  <tr><td colSpan="10"><EmptyState icon="event_repeat" message="No depreciation schedules" /></td></tr>
                ) : filteredSchedules.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.asset_code}</td>
                    <td style={{ fontSize: 12 }}>{METHODS.find(m => m.value === s.depreciation_method)?.label || s.depreciation_method}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{parseFloat(s.purchase_cost || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{parseFloat(s.salvage_value || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{s.useful_life_years}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--teal)' }}>
                      {parseFloat(s.book_value || s.purchase_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {parseFloat(s.total_depreciated || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.start_date}</td>
                    <td><span className={`badge ${STATUS_BADGE[s.status] || 'badge-default'}`}>{s.status?.replace('_', ' ')}</span></td>
                    {canEdit && (
                      <td className="td-actions">
                        <div className="btn-group-sm">
                          <button className="btn btn-secondary btn-sm" title="View projection" onClick={() => handleShowProjection(s)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>timeline</span>
                          </button>
                          {s.status === 'active' && (
                            <button className="btn btn-primary btn-sm" title="Run this period" onClick={() => { setSelectedSched(s); setRunForm(f => ({ ...f, mode: 'single' })); setShowRunModal(true); setBatchResult(null) }}>
                              <span className="material-icons" style={{ fontSize: 13 }}>play_arrow</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Entries tab ── */}
      {tab === 'entries' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Asset</th>
                  <th>Entry Date</th>
                  <th style={{ textAlign: 'right' }}>Amount ($)</th>
                  <th style={{ textAlign: 'right' }}>Book Value After ($)</th>
                  <th>GL Entry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : filteredEntries.length === 0 ? (
                  <tr><td colSpan="7"><EmptyState icon="receipt_long" message="No depreciation entries" /></td></tr>
                ) : filteredEntries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{e.period_label}</td>
                    <td style={{ fontSize: 12 }}>{e.asset_depreciation_schedules?.asset_code || '—'}</td>
                    <td style={{ fontSize: 12 }}>{e.entry_date}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }}>
                      {parseFloat(e.depreciation_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>
                      {parseFloat(e.book_value_after || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: 11, color: e.journal_entry_id ? 'var(--green)' : 'var(--text-dim)' }}>
                      {e.journal_entry_id ? '✓ Posted' : '—'}
                    </td>
                    <td><span className={`badge ${ENTRY_BADGE[e.status] || 'badge-default'}`}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Run tab ── */}
      {tab === 'run' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Run Monthly Depreciation</h3>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>
            Select the accounting period and click Run to generate depreciation entries for all active schedules.
            Entries will be saved as Draft. If GL accounts are configured on the schedule, entries are posted to the GL automatically.
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>Accounting Period *</label>
              <input type="month" className="form-control" value={runForm.periodLabel}
                onChange={e => setRunForm(f => ({ ...f, periodLabel: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Entry Date *</label>
              <input type="date" className="form-control" value={runForm.entryDate}
                onChange={e => setRunForm(f => ({ ...f, entryDate: e.target.value }))} />
            </div>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { setRunForm(f => ({ ...f, mode: 'batch' })); handleRunDepreciation() }} disabled={saving}>
              <span className="material-icons">play_arrow</span>
              {saving ? ' Running…' : ` Run All Active Schedules (${active})`}
            </button>
          )}

          {batchResult && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ padding: 12, background: 'rgba(34,197,94,.1)', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{batchResult.success.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Entries Posted</div>
                </div>
                <div style={{ padding: 12, background: 'rgba(148,163,184,.1)', borderRadius: 8, border: '1px solid rgba(148,163,184,.3)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{batchResult.skipped.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Skipped (already done)</div>
                </div>
                <div style={{ padding: 12, background: 'rgba(239,68,68,.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{batchResult.failed.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Failed</div>
                </div>
              </div>
              {batchResult.failed.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Failures:</div>
                  {batchResult.failed.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--red)', padding: '3px 0' }}>
                      {f.assetCode} — {f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Fleet Schedule tab ── */}
      {tab === 'fleet' && (
        <div>
          {/* Filters */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 180, margin: 0 }}>
                <input className="form-control" placeholder="Search asset name or code…"
                  value={fleetSearch} onChange={e => setFleetSearch(e.target.value)} />
              </div>
              <div className="form-group" style={{ minWidth: 160, margin: 0 }}>
                <select className="form-control" value={fleetMethodFilter} onChange={e => setFleetMethodFilter(e.target.value)}>
                  <option value="">All Methods</option>
                  {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {fleetAssetsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading fleet assets…</div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Category</th>
                      <th>Method</th>
                      <th style={{ textAlign: 'right' }}>Purchase Cost</th>
                      <th style={{ textAlign: 'right' }}>Disposal Value</th>
                      <th style={{ textAlign: 'right' }}>Life (yrs)</th>
                      <th style={{ textAlign: 'right' }}>Monthly Dep</th>
                      <th style={{ textAlign: 'right' }}>Accumulated</th>
                      <th style={{ textAlign: 'right' }}>Book Value</th>
                      <th style={{ textAlign: 'right' }}>% Remaining</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetAssets
                      .filter(a => {
                        const q = fleetSearch.toLowerCase()
                        if (q && !(a.asset_name?.toLowerCase().includes(q) || a.asset_code?.toLowerCase().includes(q))) return false
                        if (fleetMethodFilter && (a.depreciation_method || 'straight_line') !== fleetMethodFilter) return false
                        return true
                      })
                      .map(a => {
                        const dep = computeAssetDepreciation(a)
                        const cost = parseFloat(a.purchase_cost || 0)
                        const hasData = cost > 0 && (a.useful_life_years > 0 || a.depreciation_method === 'usage_based')
                        return (
                          <tr key={a.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{a.asset_name || '—'}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{a.asset_code || ''}{a.fleet_number ? ` · ${a.fleet_number}` : ''}</div>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{a.asset_category || '—'}</td>
                            <td style={{ fontSize: 12 }}>
                              {METHODS.find(m => m.value === (a.depreciation_method || 'straight_line'))?.label || a.depreciation_method}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                              {cost > 0 ? cost.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                              {parseFloat(a.disposal_value || a.salvage_value || 0) > 0
                                ? parseFloat(a.disposal_value || a.salvage_value).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>{a.useful_life_years || '—'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: hasData ? 'var(--red)' : 'var(--text-dim)' }}>
                              {hasData && dep.monthlyDep > 0
                                ? dep.monthlyDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                              {hasData && dep.accumulated > 0
                                ? dep.accumulated.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: hasData ? dep.color : 'var(--text-dim)' }}>
                              {cost > 0
                                ? dep.bookValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {hasData ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', minWidth: 50 }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, dep.remainingLifePct).toFixed(1)}%`, background: dep.color, borderRadius: 4 }} />
                                  </div>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: dep.color, fontWeight: 600, flexShrink: 0 }}>
                                    {dep.remainingLifePct.toFixed(0)}%
                                  </span>
                                </div>
                              ) : '—'}
                            </td>
                            <td>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                                background: dep.remainingLifePct > 50
                                  ? 'rgba(34,197,94,.12)' : dep.remainingLifePct > 25
                                  ? 'rgba(234,179,8,.12)' : 'rgba(239,68,68,.12)',
                                color: dep.color,
                              }}>
                                {!hasData ? 'No data'
                                  : dep.remainingLifePct > 50 ? 'Healthy'
                                  : dep.remainingLifePct > 25 ? 'Aging'
                                  : 'Near EOL'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    {fleetAssets.length === 0 && (
                      <tr><td colSpan={11}><EmptyState icon="trending_down" message="No fleet assets found" /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Schedule Modal */}
      {showNewSched && (
        <ModalDialog open onClose={() => setShowNewSched(false)} title="New Depreciation Schedule" size="lg">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Asset *</label>
              <select className="form-control" value={newSchedForm.asset_id}
                onChange={e => setNewSchedForm(f => ({ ...f, asset_id: e.target.value }))}>
                <option value="">— Select asset —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.asset_name} ({a.asset_code})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Method *</label>
              <select className="form-control" value={newSchedForm.depreciation_method}
                onChange={e => setNewSchedForm(f => ({ ...f, depreciation_method: e.target.value }))}>
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Purchase Cost ($) *</label>
              <input type="number" className="form-control" min="0" step="0.01" value={newSchedForm.purchase_cost}
                onChange={e => setNewSchedForm(f => ({ ...f, purchase_cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Salvage Value ($)</label>
              <input type="number" className="form-control" min="0" step="0.01" value={newSchedForm.salvage_value}
                onChange={e => setNewSchedForm(f => ({ ...f, salvage_value: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Useful Life (years) *</label>
              <input type="number" className="form-control" min="1" step="0.5" value={newSchedForm.useful_life_years}
                onChange={e => setNewSchedForm(f => ({ ...f, useful_life_years: e.target.value }))} />
            </div>
          </div>
          {newSchedForm.depreciation_method === 'usage_based' && (
            <div className="form-row">
              <div className="form-group">
                <label>Expected Lifetime KM</label>
                <input type="number" className="form-control" min="1" step="1" value={newSchedForm.expected_lifetime_km || ''}
                  onChange={e => setNewSchedForm(f => ({ ...f, expected_lifetime_km: e.target.value }))} />
              </div>
            </div>
          )}
          {newSchedForm.depreciation_method === 'reducing_balance' && (
            <div className="form-row">
              <div className="form-group">
                <label>Annual Rate (%)</label>
                <input type="number" className="form-control" min="1" max="100" step="0.5" value={newSchedForm.annual_rate}
                  onChange={e => setNewSchedForm(f => ({ ...f, annual_rate: e.target.value }))} />
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" className="form-control" value={newSchedForm.start_date}
                onChange={e => setNewSchedForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>GL Accounts (optional)</div>
            <div className="form-row">
              <div className="form-group">
                <label>Asset Account Code</label>
                <input className="form-control" placeholder="e.g. 1500" value={newSchedForm.gl_asset_account}
                  onChange={e => setNewSchedForm(f => ({ ...f, gl_asset_account: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Depreciation Expense Code</label>
                <input className="form-control" placeholder="e.g. 6200" value={newSchedForm.gl_depreciation_acct}
                  onChange={e => setNewSchedForm(f => ({ ...f, gl_depreciation_acct: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Accum. Depreciation Code</label>
                <input className="form-control" placeholder="e.g. 1501" value={newSchedForm.gl_accum_depr_acct}
                  onChange={e => setNewSchedForm(f => ({ ...f, gl_accum_depr_acct: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={newSchedForm.notes}
              onChange={e => setNewSchedForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowNewSched(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateSchedule} disabled={saving}>
              {saving ? 'Saving…' : 'Create Schedule'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Run Depreciation Modal (single) */}
      {showRunModal && (
        <ModalDialog open onClose={() => { setShowRunModal(false); setBatchResult(null) }}
          title={runForm.mode === 'batch' ? 'Run Batch Depreciation' : `Run — ${selectedSched?.asset_code}`} size="md">
          <div className="form-row">
            <div className="form-group">
              <label>Accounting Period *</label>
              <input type="month" className="form-control" value={runForm.periodLabel}
                onChange={e => setRunForm(f => ({ ...f, periodLabel: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Entry Date *</label>
              <input type="date" className="form-control" value={runForm.entryDate}
                onChange={e => setRunForm(f => ({ ...f, entryDate: e.target.value }))} />
            </div>
          </div>
          {runForm.mode === 'batch' && (
            <AlertBanner type="info" message={`This will process all ${active} active schedules for period ${runForm.periodLabel}.`} />
          )}
          {batchResult && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              <div>✓ {batchResult.success.length} posted &nbsp;|&nbsp; {batchResult.skipped.length} skipped &nbsp;|&nbsp; {batchResult.failed.length} failed</div>
            </div>
          )}
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => { setShowRunModal(false); setBatchResult(null) }}>Close</button>
            <button className="btn btn-primary" onClick={handleRunDepreciation} disabled={saving}>
              {saving ? 'Running…' : 'Run Now'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Projection Modal */}
      {showProjModal && selectedSched && (
        <ModalDialog open onClose={() => setShowProjModal(false)} title={`Projection — ${selectedSched.asset_code}`} size="lg">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th style={{ textAlign: 'right' }}>Monthly Depreciation ($)</th>
                  <th style={{ textAlign: 'right' }}>Book Value ($)</th>
                </tr>
              </thead>
              <tbody>
                {projRows.map(r => (
                  <tr key={r.period}>
                    <td style={{ fontFamily: 'var(--mono)' }}>{r.period}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{r.amount.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{r.bookValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowProjModal(false)}>Close</button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
