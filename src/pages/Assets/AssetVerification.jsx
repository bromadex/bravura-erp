// src/pages/Assets/AssetVerification.jsx
// Periodic physical asset verification — record condition, location, and meter readings.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions } from '../../components/ui'
import { generateTxnCode } from '../../utils/txnCode'
import { auditLog } from '../../engine/auditEngine'
import { exportXLSX } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

const CONDITIONS = [
  { value: 'verified',     label: 'Verified — OK',        color: 'var(--green)'    },
  { value: 'needs_repair', label: 'Needs Repair',          color: 'var(--yellow)'   },
  { value: 'damaged',      label: 'Damaged',               color: 'var(--red)'      },
  { value: 'missing',      label: 'Missing / Not Found',   color: 'var(--red)'      },
  { value: 'excess',       label: 'Excess / Unregistered', color: 'var(--teal)'     },
]

const COND_BADGE = {
  verified:     'badge-green',
  needs_repair: 'badge-yellow',
  damaged:      'badge-red',
  missing:      'badge-red',
  excess:       'badge-blue',
}

const TABS = [
  { id: 'verify',  label: 'Verify Assets' },
  { id: 'history', label: 'History'       },
]

const BLANK_FORM = {
  asset_id: '', verified_condition: 'verified', location_confirmed: '',
  expected_location: '', odometer_reading: '', hour_meter: '',
  tread_depth: '', notes: '', photo_url: '',
}

export default function AssetVerification() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('fleet', 'maintenance')

  const [tab,       setTab]       = useState('verify')
  const [history,   setHistory]   = useState([])
  const [assets,    setAssets]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')

  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(BLANK_FORM)
  const [saving,    setSaving]    = useState(false)

  const [sessionId,    setSessionId]    = useState(() => `VS-${Date.now()}`)
  const [sessionDate,  setSessionDate]  = useState(today)
  const [sessionItems, setSessionItems] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [histRes, assetRes] = await Promise.all([
      supabase.from('asset_verifications')
        .select('*')
        .order('verification_date', { ascending: false })
        .limit(500),
      supabase.from('asset_registry')
        .select('id,asset_code,asset_name,asset_category,location,status')
        .order('asset_name'),
    ])
    setHistory(histRes.data || [])
    setAssets(assetRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredHistory = history.filter(h =>
    !search || h.asset_name?.toLowerCase().includes(search.toLowerCase()) ||
    h.asset_code?.toLowerCase().includes(search.toLowerCase()) ||
    h.verification_no?.toLowerCase().includes(search.toLowerCase())
  )

  // KPIs from today's session
  const todayRecs   = history.filter(h => h.verification_date === today)
  const verified    = todayRecs.filter(h => h.verified_condition === 'verified').length
  const issues      = todayRecs.filter(h => h.verified_condition !== 'verified').length
  const missing     = todayRecs.filter(h => h.verified_condition === 'missing').length

  const handleSaveVerification = async () => {
    if (!form.asset_id) { toast.error('Asset is required'); return }
    setSaving(true)
    try {
      let verification_no
      try { verification_no = await generateTxnCode('AV') } catch { verification_no = `AV-${Date.now()}` }

      const asset = assets.find(a => a.id === form.asset_id)
      const rec = {
        verification_no,
        session_id:         sessionId,
        verification_date:  sessionDate,
        asset_id:           form.asset_id,
        asset_code:         asset?.asset_code || '',
        asset_name:         asset?.asset_name || '',
        verified_condition: form.verified_condition,
        location_confirmed: form.location_confirmed || null,
        expected_location:  form.expected_location || asset?.location || null,
        odometer_reading:   parseFloat(form.odometer_reading) || null,
        hour_meter:         parseFloat(form.hour_meter) || null,
        tread_depth:        parseFloat(form.tread_depth) || null,
        notes:              form.notes || null,
        photo_url:          form.photo_url || null,
        verified_by:        user?.full_name || user?.email || '',
        created_by:         user?.id || '',
        created_at:         new Date().toISOString(),
      }

      const { error } = await supabase.from('asset_verifications').insert([rec])
      if (error) throw error

      // Update asset status if damaged/missing
      if (form.verified_condition === 'damaged') {
        await supabase.from('asset_registry').update({ status: 'Damaged', updated_at: new Date().toISOString() }).eq('id', form.asset_id)
      } else if (form.verified_condition === 'needs_repair') {
        await supabase.from('asset_registry').update({ status: 'Maintenance', updated_at: new Date().toISOString() }).eq('id', form.asset_id)
      }

      await auditLog({ module: 'assets', action: 'VERIFY', entityType: 'asset', entityId: form.asset_id, entityName: asset?.asset_name })
      toast.success(`${asset?.asset_name} verified — ${form.verified_condition}`)

      setSessionItems(prev => [...prev, { ...rec, id: verification_no }])
      setForm(BLANK_FORM)
      setShowModal(false)
      fetchData()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  const handleNewSession = () => {
    setSessionId(`VS-${Date.now()}`)
    setSessionDate(today)
    setSessionItems([])
    toast.success('New verification session started')
  }

  const handleExport = () => {
    if (!filteredHistory.length) return toast.error('No records to export')
    exportXLSX(filteredHistory.map(h => ({
      'Verification No':  h.verification_no,
      'Date':             h.verification_date,
      'Asset Code':       h.asset_code,
      'Asset Name':       h.asset_name,
      'Condition':        h.verified_condition,
      'Location':         h.location_confirmed || '—',
      'Expected Location':h.expected_location || '—',
      'Odometer':         h.odometer_reading || '—',
      'Hour Meter':       h.hour_meter || '—',
      'Verified By':      h.verified_by || '—',
      'Notes':            h.notes || '—',
    })), `AssetVerification_${today}`, 'Verifications')
    toast.success(`Exported ${filteredHistory.length} records`)
  }

  const condLabel  = (v) => CONDITIONS.find(c => c.value === v)?.label || v

  return (
    <div>
      <PageHeader title="Asset Verification" subtitle="Physical verification of assets — condition, location, meter readings">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">download</span> Export
        </button>
        {canEdit && (
          <>
            <button className="btn btn-secondary" onClick={handleNewSession}>
              <span className="material-icons">refresh</span> New Session
            </button>
            <button className="btn btn-primary" onClick={() => { setForm(BLANK_FORM); setShowModal(true) }}>
              <span className="material-icons">verified</span> Verify Asset
            </button>
          </>
        )}
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Verified Today"    value={verified} icon="check_circle"   color="green" sub={today} />
        <KPICard label="Issues Found"      value={issues}   icon="report_problem" color="yellow" sub="today" />
        <KPICard label="Missing Assets"    value={missing}  icon="search_off"     color="red"    sub="today" />
        <KPICard label="Total Assets"      value={assets.length} icon="inventory_2" color="teal" sub="registered" />
      </div>

      {/* Current session summary */}
      {sessionItems.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Current Session: {sessionId} — {sessionDate}</h3>
            <span className="badge badge-blue">{sessionItems.length} verified</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sessionItems.map((item, i) => {
              const cond = CONDITIONS.find(c => c.value === item.verified_condition)
              return (
                <div key={i} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: `${cond?.color || 'var(--border)'}18`,
                  color: cond?.color || 'var(--text-dim)',
                  border: `1px solid ${cond?.color || 'var(--border)'}44`,
                }}>
                  {item.asset_name}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <input className="form-control" placeholder="Search asset code, name, verification no…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {/* Verify tab: show all assets with last verification status */}
      {tab === 'verify' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Last Verified</th>
                  <th>Last Condition</th>
                  {canEdit && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : assets.filter(a => !search || a.asset_name?.toLowerCase().includes(search.toLowerCase()) || a.asset_code?.toLowerCase().includes(search.toLowerCase())).map(asset => {
                  const lastRec = history.find(h => h.asset_id === asset.id)
                  return (
                    <tr key={asset.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{asset.asset_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{asset.asset_code}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{asset.asset_category || '—'}</td>
                      <td style={{ fontSize: 12 }}>{asset.location || '—'}</td>
                      <td><span className={`badge ${asset.status === 'Active' ? 'badge-green' : 'badge-default'}`}>{asset.status || '—'}</span></td>
                      <td style={{ fontSize: 12 }}>{lastRec?.verification_date || <span style={{ color: 'var(--text-dim)' }}>Never</span>}</td>
                      <td>
                        {lastRec
                          ? <span className={`badge ${COND_BADGE[lastRec.verified_condition] || 'badge-default'}`} style={{ fontSize: 10 }}>
                              {condLabel(lastRec.verified_condition)}
                            </span>
                          : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                        }
                      </td>
                      {canEdit && (
                        <td>
                          <button className="btn btn-primary btn-sm" onClick={() => {
                            setForm({ ...BLANK_FORM, asset_id: asset.id, expected_location: asset.location || '' })
                            setShowModal(true)
                          }}>
                            <span className="material-icons" style={{ fontSize: 13 }}>verified</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Date</th>
                  <th>Asset</th>
                  <th>Condition</th>
                  <th>Location Confirmed</th>
                  <th>Odometer</th>
                  <th>Verified By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan="8"><EmptyState icon="verified" message="No verification records yet" /></td></tr>
                ) : filteredHistory.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{h.verification_no}</td>
                    <td style={{ fontSize: 12 }}>{h.verification_date}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{h.asset_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{h.asset_code}</div>
                    </td>
                    <td><span className={`badge ${COND_BADGE[h.verified_condition] || 'badge-default'}`} style={{ fontSize: 10 }}>{condLabel(h.verified_condition)}</span></td>
                    <td style={{ fontSize: 12 }}>{h.location_confirmed || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{h.odometer_reading ? `${h.odometer_reading} km` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{h.verified_by || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.notes}>
                        {h.notes || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Verify Asset Modal */}
      {showModal && (
        <ModalDialog open onClose={() => setShowModal(false)} title="Verify Asset" size="lg">
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-dim)' }}>
            Session: <strong style={{ color: 'var(--text)' }}>{sessionId}</strong> — Date: <strong style={{ color: 'var(--text)' }}>{sessionDate}</strong>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Asset *</label>
              <select className="form-control" value={form.asset_id}
                onChange={e => {
                  const a = assets.find(x => x.id === e.target.value)
                  setForm(f => ({ ...f, asset_id: e.target.value, expected_location: a?.location || '' }))
                }}>
                <option value="">— Select asset —</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.asset_name} ({a.asset_code})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Condition *</label>
              <select className="form-control" value={form.verified_condition}
                onChange={e => setForm(f => ({ ...f, verified_condition: e.target.value }))}>
                {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Location Found</label>
              <input className="form-control" placeholder="Where is the asset now?"
                value={form.location_confirmed}
                onChange={e => setForm(f => ({ ...f, location_confirmed: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Expected Location</label>
              <input className="form-control" placeholder="Registered location"
                value={form.expected_location}
                onChange={e => setForm(f => ({ ...f, expected_location: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Odometer Reading (km)</label>
              <input type="number" className="form-control" min="0" step="1" value={form.odometer_reading}
                onChange={e => setForm(f => ({ ...f, odometer_reading: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Hour Meter</label>
              <input type="number" className="form-control" min="0" step="0.1" value={form.hour_meter}
                onChange={e => setForm(f => ({ ...f, hour_meter: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Tread Depth (mm)</label>
              <input type="number" className="form-control" min="0" step="0.5" value={form.tread_depth}
                onChange={e => setForm(f => ({ ...f, tread_depth: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes / Observations</label>
            <textarea className="form-control" rows={2} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveVerification} disabled={saving}>
              {saving ? 'Saving…' : 'Save Verification'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
