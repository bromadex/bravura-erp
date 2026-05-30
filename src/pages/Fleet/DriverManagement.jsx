// src/pages/Fleet/DriverManagement.jsx — Driver register with Zimbabwe/SA compliance fields

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import { exportXLSX } from '../../engine/reportingEngine'
import { auditLog } from '../../engine/auditEngine'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, TabNav, AlertBanner, ModalDialog, ModalActions } from '../../components/ui'

const today      = new Date().toISOString().split('T')[0]
const in30        = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
const monthStart  = today.slice(0, 7) + '-01'
const FUEL_PRICE  = 1.50

const LICENSE_CLASSES = ['Code 4', 'Code 5', 'Code 8', 'Code 10', 'Code 14', 'EC', 'PDP', 'ZIMDEF Operator']
const STATUSES        = ['active', 'suspended', 'inactive']
const TABS            = ['All', 'Expiring (30 days)', 'Expired', 'Suspended']
const PAGE_TABS       = ['Register', 'Scorecard']

// Score badge
function ScoreBadge({ score }) {
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)'
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Attention'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `color-mix(in srgb,${color} 15%,var(--surface2))`,
      color, border: `1px solid color-mix(in srgb,${color} 30%,transparent)`,
    }}>
      {score.toFixed(0)}% {label}
    </span>
  )
}

const BLANK = {
  full_name: '', id_number: '', contact_phone: '', email: '', department: '',
  license_number: '', license_classes: '', license_expiry: '', license_issuing_authority: '',
  pdp_number: '', pdp_expiry: '',
  medical_cert_no: '', medical_expiry: '',
  defensive_driving_cert: '', defensive_driving_expiry: '',
  operator_cert_no: '', operator_cert_expiry: '',
  mhsa_fitness_cert: '', mhsa_fitness_expiry: '',
  status: 'active', notes: '',
}

// ── helpers ──────────────────────────────────────────────────────────────────

function expiryClass(dateStr) {
  if (!dateStr) return ''
  if (dateStr < today)  return 'text-red-600 font-semibold'
  if (dateStr <= in30)  return 'text-yellow-600 font-semibold'
  return ''
}

function expiryBg(dateStr) {
  if (!dateStr) return ''
  if (dateStr < today)  return 'bg-red-50'
  if (dateStr <= in30)  return 'bg-yellow-50'
  return ''
}

function fmtDate(d) {
  if (!d) return '—'
  return d
}

// ── main component ───────────────────────────────────────────────────────────

export default function DriverManagement() {
  const { user } = useAuth()
  const canEdit  = useCanEdit('fleet', 'drivers')

  const [rows,          setRows]          = useState([])
  const [departments,   setDepartments]   = useState([])
  const [loading,       setLoading]       = useState(true)
  const [activeTab,     setActiveTab]     = useState('All')
  const [pageTab,       setPageTab]       = useState('Register')
  const [showModal,     setShowModal]     = useState(false)
  const [editRecord,    setEditRecord]    = useState(null)
  const [form,          setForm]          = useState(BLANK)
  const [saving,        setSaving]        = useState(false)
  const [search,        setSearch]        = useState('')
  const [scorecard,     setScorecard]     = useState([])
  const [scorePeriod,   setScorePeriod]   = useState('month')
  const [scoreLoading,  setScoreLoading]  = useState(false)

  // KPI derived state
  const kpis = {
    total:           rows.length,
    licExpiring:     rows.filter(r => r.license_expiry && r.license_expiry > today && r.license_expiry <= in30).length,
    medExpiring:     rows.filter(r => r.medical_expiry && r.medical_expiry > today && r.medical_expiry <= in30).length,
    suspended:       rows.filter(r => r.status === 'suspended').length,
  }

  const hasExpired = rows.some(r =>
    (r.license_expiry && r.license_expiry < today) ||
    (r.medical_expiry && r.medical_expiry < today)
  )

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [driversRes, deptRes] = await Promise.all([
      supabase.from('driver_profiles').select('*').order('full_name'),
      supabase.from('departments').select('id,name').order('name'),
    ])
    if (!driversRes.error) setRows(driversRes.data || [])
    else toast.error('Failed to load drivers')
    if (!deptRes.error) setDepartments(deptRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const loadScorecard = useCallback(async () => {
    setScoreLoading(true)
    const qm = Math.floor(new Date().getMonth() / 3) * 3
    const quarterStart = `${today.slice(0, 4)}-${String(qm + 1).padStart(2, '0')}-01`
    const start = scorePeriod === 'month' ? monthStart : quarterStart

    const [tripsRes, brkRes] = await Promise.all([
      supabase.from('vehicle_trips')
        .select('driver_name,driver_id,asset_id,distance,fuel_used')
        .gte('date', start).lte('date', today)
        .catch(() => ({ data: [] })),
      supabase.from('breakdown_reports')
        .select('reported_by,asset_id,reported_at')
        .gte('reported_at', start + 'T00:00:00')
        .catch(() => ({ data: [] })),
    ])

    // Build driver map from trips
    const map = {}
    ;(tripsRes.data || []).forEach(r => {
      const key = r.driver_name || r.driver_id || 'Unknown'
      if (!map[key]) map[key] = { driver: key, trips: 0, totalKm: 0, totalFuel: 0, incidents: 0 }
      map[key].trips++
      map[key].totalKm   += (r.distance  || 0)
      map[key].totalFuel += (r.fuel_used || 0)
    })

    // Count breakdowns as incidents by reporter name
    ;(brkRes.data || []).forEach(b => {
      if (b.reported_by && map[b.reported_by]) {
        map[b.reported_by].incidents++
      }
    })

    // Compute scores: efficiency 40%, incidents 40%, trip completion 20%
    // Max incidents normaliser = 3, max score per metric = 100
    const scored = Object.values(map).map(d => {
      const effScore   = d.totalKm > 0 && d.totalFuel > 0
        ? Math.min(100, (d.totalKm / d.totalFuel) / 0.10)   // target: 10 km/L = 100%
        : d.totalKm > 0 ? 80 : 50
      const incScore   = Math.max(0, 100 - d.incidents * 33.3)
      const tripScore  = Math.min(100, d.trips * 10)          // 10+ trips = 100%
      const composite  = effScore * 0.4 + incScore * 0.4 + tripScore * 0.2
      const kmPerLitre = d.totalFuel > 0 ? d.totalKm / d.totalFuel : null
      const estCost    = d.totalFuel > 0 ? d.totalFuel * FUEL_PRICE : d.totalKm * 15 / 100 * FUEL_PRICE
      return { ...d, effScore, incScore, tripScore, composite, kmPerLitre, estCost }
    })

    scored.sort((a, b) => b.composite - a.composite)
    setScorecard(scored)
    setScoreLoading(false)
  }, [scorePeriod])

  useEffect(() => {
    if (pageTab === 'Scorecard') loadScorecard()
  }, [pageTab, loadScorecard])

  // ── filtered rows ──────────────────────────────────────────────────────────

  const filtered = rows.filter(r => {
    const matchSearch = !search ||
      r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.driver_no?.toLowerCase().includes(search.toLowerCase()) ||
      r.license_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.department?.toLowerCase().includes(search.toLowerCase())

    if (!matchSearch) return false

    if (activeTab === 'All')              return true
    if (activeTab === 'Suspended')        return r.status === 'suspended'
    if (activeTab === 'Expired')          return (
      (r.license_expiry && r.license_expiry < today) ||
      (r.medical_expiry && r.medical_expiry < today) ||
      (r.pdp_expiry     && r.pdp_expiry     < today)
    )
    if (activeTab === 'Expiring (30 days)') return (
      (r.license_expiry && r.license_expiry >= today && r.license_expiry <= in30) ||
      (r.medical_expiry && r.medical_expiry >= today && r.medical_expiry <= in30) ||
      (r.pdp_expiry     && r.pdp_expiry     >= today && r.pdp_expiry     <= in30)
    )
    return true
  })

  // ── modal open/close ───────────────────────────────────────────────────────

  function openAdd() {
    setEditRecord(null)
    setForm(BLANK)
    setShowModal(true)
  }

  function openEdit(r) {
    setEditRecord(r)
    const f = { ...BLANK }
    Object.keys(BLANK).forEach(k => { f[k] = r[k] ?? '' })
    setForm(f)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditRecord(null)
    setForm(BLANK)
  }

  // ── license classes toggle ─────────────────────────────────────────────────

  function toggleClass(cls) {
    const current = form.license_classes ? form.license_classes.split(',').map(s => s.trim()).filter(Boolean) : []
    const next = current.includes(cls) ? current.filter(c => c !== cls) : [...current, cls]
    setForm(f => ({ ...f, license_classes: next.join(', ') }))
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.full_name.trim()) { toast.error('Full name is required'); return }
    setSaving(true)

    const payload = {
      ...form,
      updated_at: new Date().toISOString(),
      created_by: editRecord ? undefined : (user?.email || ''),
    }
    // Clean empty date strings to null
    const dateFields = [
      'license_expiry','pdp_expiry','medical_expiry','defensive_driving_expiry',
      'operator_cert_expiry','mhsa_fitness_expiry',
    ]
    dateFields.forEach(f => { if (!payload[f]) payload[f] = null })
    if (!editRecord) {
      delete payload.updated_at
      payload.created_at = new Date().toISOString()
      try {
        payload.driver_no = await generateTxnCode('DRV')
      } catch {
        payload.driver_no = `DRV-${Date.now()}`
      }
      if (!payload.driver_no) payload.driver_no = `DRV-${Date.now()}`
    }

    let error, data
    if (editRecord) {
      ;({ error, data } = await supabase
        .from('driver_profiles')
        .update(payload)
        .eq('id', editRecord.id)
        .select()
        .single())
    } else {
      ;({ error, data } = await supabase
        .from('driver_profiles')
        .insert(payload)
        .select()
        .single())
    }

    if (error) {
      toast.error('Save failed: ' + error.message)
      setSaving(false)
      return
    }

    await auditLog({
      module: 'fleet',
      action: editRecord ? 'UPDATE' : 'CREATE',
      entityType: 'driver_profile',
      entityId: data.id,
      entityName: data.full_name,
    })

    toast.success(editRecord ? 'Driver updated' : 'Driver added')
    setSaving(false)
    closeModal()
    fetchData()
  }

  // ── export ─────────────────────────────────────────────────────────────────

  function handleExport() {
    exportXLSX(filtered.map(r => ({
      'Driver No':        r.driver_no,
      'Full Name':        r.full_name,
      'ID Number':        r.id_number,
      'Department':       r.department,
      'Phone':            r.contact_phone,
      'License No':       r.license_number,
      'License Classes':  r.license_classes,
      'License Expiry':   r.license_expiry,
      'PDP Number':       r.pdp_number,
      'PDP Expiry':       r.pdp_expiry,
      'Medical Cert No':  r.medical_cert_no,
      'Medical Expiry':   r.medical_expiry,
      'Status':           r.status,
    })), 'Drivers')
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const selectedClasses = form.license_classes
    ? form.license_classes.split(',').map(s => s.trim()).filter(Boolean)
    : []

  return (
    <div>
      <PageHeader title="Driver Management">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Driver
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Drivers"          value={kpis.total}       icon="badge"                  />
        <KPICard label="Licenses Expiring ≤30d" value={kpis.licExpiring} icon="card_membership" color="yellow" />
        <KPICard label="Medicals Expiring ≤30d" value={kpis.medExpiring} icon="health_and_safety" color="yellow" />
        <KPICard label="Suspended"              value={kpis.suspended}   icon="block"           color="red"    />
      </div>

      {/* Alert banner */}
      {hasExpired && (
        <AlertBanner
          type="error"
          message="One or more drivers have expired licenses or medical certificates. Please take immediate action."
        />
      )}

      {/* Page-level tabs: Register vs Scorecard */}
      <TabNav tabs={PAGE_TABS} active={pageTab === 'Register' ? 0 : 1}
        onChange={i => setPageTab(i === 0 ? 'Register' : 'Scorecard')} />

      {/* ── SCORECARD TAB ──────────────────────────────────────────────────────── */}
      {pageTab === 'Scorecard' && (
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6, color: 'var(--gold)' }}>military_tech</span>
              Driver Scorecard Leaderboard
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn btn-sm ${scorePeriod === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setScorePeriod('month')}>This Month</button>
              <button className={`btn btn-sm ${scorePeriod === 'quarter' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setScorePeriod('quarter')}>This Quarter</button>
              <button className="btn btn-secondary btn-sm" onClick={loadScorecard}>
                <span className="material-icons" style={{ fontSize: 12 }}>refresh</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
            Score = Efficiency 40% · Incidents 40% · Trips 20%
          </div>

          {scoreLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>Loading…</div>
          ) : scorecard.length === 0 ? (
            <EmptyState icon="military_tech" message="No trip data available for scoring in this period" />
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th style={{ textAlign: 'right' }}>Trips</th>
                    <th style={{ textAlign: 'right' }}>Total KM</th>
                    <th style={{ textAlign: 'right' }}>Fuel (L)</th>
                    <th style={{ textAlign: 'right' }}>km/L</th>
                    <th style={{ textAlign: 'right' }}>Incidents</th>
                    <th style={{ textAlign: 'right' }}>Est. Cost</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map((d, i) => (
                    <tr key={d.driver} style={{ background: i === 0 ? 'color-mix(in srgb,var(--gold) 5%,var(--surface))' : '' }}>
                      <td style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? 'var(--gold)' : i === 1 ? 'var(--text-dim)' : 'var(--text-dim)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td style={{ fontWeight: 700 }}>{d.driver}</td>
                      <td className="td-mono" style={{ textAlign: 'right' }}>{d.trips}</td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--teal)' }}>
                        {d.totalKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--yellow)' }}>
                        {d.totalFuel > 0 ? `${d.totalFuel.toFixed(1)} L` : '—'}
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: d.kmPerLitre >= 8 ? 'var(--green)' : 'var(--red)' }}>
                        {d.kmPerLitre !== null ? `${d.kmPerLitre.toFixed(1)}` : '—'}
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: d.incidents > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {d.incidents}
                      </td>
                      <td className="td-mono" style={{ textAlign: 'right', color: 'var(--gold)', fontWeight: 600 }}>
                        K{d.estCost.toFixed(2)}
                      </td>
                      <td><ScoreBadge score={d.composite} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── REGISTER TAB ──────────────────────────────────────────────────────── */}
      {pageTab === 'Register' && <>
      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
        <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
        <input className="form-control" style={{ maxWidth: 240, marginLeft: 'auto' }}
          placeholder="Search name, license, dept…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="badge" message="No drivers found — add a driver to get started" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Driver No</th><th>Name</th><th>License No</th><th>Classes</th>
                  <th>License Expiry</th><th>PDP Expiry</th><th>Medical Expiry</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const licExpired = r.license_expiry && r.license_expiry < today
                  const medExpired = r.medical_expiry && r.medical_expiry < today
                  const licWarn    = r.license_expiry && r.license_expiry >= today && r.license_expiry <= in30
                  return (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>{r.driver_no || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                      <td>{r.license_number || '—'}</td>
                      <td style={{ fontSize: 11 }}>{r.license_classes || '—'}</td>
                      <td style={{ color: licExpired ? 'var(--red)' : licWarn ? 'var(--yellow)' : undefined, fontWeight: licExpired || licWarn ? 700 : undefined }}>
                        {r.license_expiry || '—'}
                      </td>
                      <td style={{ color: r.pdp_expiry && r.pdp_expiry < today ? 'var(--red)' : undefined }}>
                        {r.pdp_expiry || '—'}
                      </td>
                      <td style={{ color: medExpired ? 'var(--red)' : r.medical_expiry && r.medical_expiry >= today && r.medical_expiry <= in30 ? 'var(--yellow)' : undefined, fontWeight: medExpired ? 700 : undefined }}>
                        {r.medical_expiry || '—'}
                      </td>
                      <td>
                        <span className={`badge ${r.status === 'active' ? 'badge-green' : r.status === 'suspended' ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: 9 }}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}

      {/* Add / Edit Modal */}
      {showModal && (
        <ModalDialog title={editRecord ? 'Edit Driver' : 'Add Driver'} onClose={closeModal} size="lg">
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>

            {/* Personal details */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>Personal Details</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input className="form-control" value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>ID Number</label>
                  <input className="form-control" value={form.id_number}
                    onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone</label>
                  <input className="form-control" value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" className="form-control" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select className="form-control" value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">— Select department —</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Driving License */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>Driving License</div>
              <div className="form-row">
                <div className="form-group">
                  <label>License Number</label>
                  <input className="form-control" value={form.license_number}
                    onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Issuing Authority</label>
                  <input className="form-control" value={form.license_issuing_authority}
                    onChange={e => setForm(f => ({ ...f, license_issuing_authority: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>License Expiry</label>
                  <input type="date" className="form-control" value={form.license_expiry}
                    onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>License Classes</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {LICENSE_CLASSES.map(cls => (
                    <button key={cls} type="button" onClick={() => toggleClass(cls)}
                      style={{
                        padding: '3px 10px', borderRadius: 14, fontSize: 11, cursor: 'pointer', border: '1px solid',
                        borderColor: selectedClasses.includes(cls) ? 'var(--primary)' : 'var(--border)',
                        background: selectedClasses.includes(cls) ? 'var(--primary)' : 'var(--surface2)',
                        color: selectedClasses.includes(cls) ? '#fff' : 'var(--text-dim)',
                        fontWeight: selectedClasses.includes(cls) ? 700 : 400,
                      }}>
                      {cls}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Selected: {form.license_classes || 'None'}</div>
              </div>
            </div>

            {/* PDP + Medical */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>PDP & Medical</div>
              <div className="form-row">
                <div className="form-group">
                  <label>PDP Number</label>
                  <input className="form-control" value={form.pdp_number}
                    onChange={e => setForm(f => ({ ...f, pdp_number: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>PDP Expiry</label>
                  <input type="date" className="form-control" value={form.pdp_expiry}
                    onChange={e => setForm(f => ({ ...f, pdp_expiry: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Medical Cert No</label>
                  <input className="form-control" value={form.medical_cert_no}
                    onChange={e => setForm(f => ({ ...f, medical_cert_no: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Medical Expiry</label>
                  <input type="date" className="form-control" value={form.medical_expiry}
                    onChange={e => setForm(f => ({ ...f, medical_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Additional Certs */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 }}>Additional Certifications</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Defensive Driving Cert</label>
                  <input className="form-control" value={form.defensive_driving_cert}
                    onChange={e => setForm(f => ({ ...f, defensive_driving_cert: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>DD Expiry</label>
                  <input type="date" className="form-control" value={form.defensive_driving_expiry}
                    onChange={e => setForm(f => ({ ...f, defensive_driving_expiry: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Operator Cert No (ZIMDEF)</label>
                  <input className="form-control" value={form.operator_cert_no}
                    onChange={e => setForm(f => ({ ...f, operator_cert_no: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Operator Cert Expiry</label>
                  <input type="date" className="form-control" value={form.operator_cert_expiry}
                    onChange={e => setForm(f => ({ ...f, operator_cert_expiry: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>MHSA Fitness Cert</label>
                  <input className="form-control" value={form.mhsa_fitness_cert}
                    onChange={e => setForm(f => ({ ...f, mhsa_fitness_cert: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>MHSA Fitness Expiry</label>
                  <input type="date" className="form-control" value={form.mhsa_fitness_expiry}
                    onChange={e => setForm(f => ({ ...f, mhsa_fitness_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={3} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <ModalActions>
            <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : editRecord ? 'Update Driver' : 'Add Driver'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
