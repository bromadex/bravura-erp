// src/pages/Fuel/FuelIssuance.jsx
// Server-side paginated. Queries fuel_log directly for the table view;
// uses FuelContext only for addIssuance (creation). KPIs run separate
// lightweight queries so they stay accurate without a full table scan.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useFuel }           from '../../contexts/FuelContext'
import { useLeave }          from '../../contexts/LeaveContext'
import { useAuth }           from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase }          from '../../lib/supabase'
import { generateTxnCode }   from '../../utils/txnCode'
import TxnCodeBadge          from '../../components/TxnCodeBadge'
import toast                 from 'react-hot-toast'
import { exportXLSX }        from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Pagination } from '../../components/ui'

const FUEL_COLORS = { DIESEL: 'badge-yellow', PETROL: 'badge-green', PARAFFIN: 'badge-blue' }
const today    = new Date().toISOString().split('T')[0]
const PAGE_SIZE = 50

export default function FuelIssuance() {
  const { addIssuance }  = useFuel()
  const { isOnLeave }    = useLeave()
  const { user }         = useAuth()
  const canEdit   = useCanEdit('fuel', 'issuance')
  const canDelete = useCanDelete('fuel', 'issuance')

  // ── Reference lookups (small, static-ish data) ────────────────
  const [employees,   setEmployees]   = useState([])
  const [vehicles,    setVehicles]    = useState([])
  const [generators,  setGenerators]  = useState([])
  const [earthmovers, setEarthmovers] = useState([])
  const [contractors, setContractors] = useState([])

  useEffect(() => {
    supabase.from('employees').select('id, name, status').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
    Promise.all([
      supabase.from('fleet').select('reg, description').eq('status', 'Active'),
      supabase.from('generators').select('gen_code, gen_name'),
      supabase.from('earth_movers').select('reg, description'),
      supabase.from('contractor_equipment').select('ce_code, contractor_name, equipment_type, equipment_description, registration').eq('status', 'Active'),
    ]).then(([vRes, gRes, eRes, cRes]) => {
      if (vRes.data) setVehicles(vRes.data)
      if (gRes.data) setGenerators(gRes.data)
      if (eRes.data) setEarthmovers(eRes.data)
      if (cRes.data) setContractors(cRes.data)
    })
  }, [])

  // ── Paginated table state ──────────────────────────────────────
  const [rows,        setRows]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(0)
  const [tableLoading, setTableLoading] = useState(true)

  // ── KPI state (separate lightweight queries) ───────────────────
  const [kpiToday,   setKpiToday]   = useState(0)
  const [kpiMonth,   setKpiMonth]   = useState(0)

  // ── Filters ───────────────────────────────────────────────────
  const [searchInput,    setSearchInput]    = useState('')
  const [searchTerm,     setSearchTerm]     = useState('')
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [fuelFilter,     setFuelFilter]     = useState('ALL')
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)
  const debounceRef = useRef(null)

  // ── Flag state ────────────────────────────────────────────────
  const [pendingFlags,   setPendingFlags]   = useState([])   // [{rule, message}]
  const [showFlagModal,  setShowFlagModal]  = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)  // form payload awaiting confirmation

  // Debounce search input → searchTerm
  const handleSearchChange = (v) => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 400)
  }

  // ── KPI queries (run once on mount) ───────────────────────────
  useEffect(() => {
    const monthStart = today.slice(0, 7) + '-01'
    Promise.all([
      supabase.from('fuel_log').select('amount').eq('date', today),
      supabase.from('fuel_log').select('amount').gte('date', monthStart),
    ]).then(([todayRes, monthRes]) => {
      const sumToday = (todayRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
      const sumMonth = (monthRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
      setKpiToday(sumToday)
      setKpiMonth(sumMonth)
    })
  }, [])

  // ── Paginated fetch ────────────────────────────────────────────
  const fetchPage = useCallback(async (p = 0) => {
    setTableLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = supabase
      .from('fuel_log')
      .select('*', { count: 'exact' })
      .order('date',       { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (dateFrom)             q = q.gte('date', dateFrom)
    if (dateTo)               q = q.lte('date', dateTo)
    if (fuelFilter !== 'ALL') q = q.eq('fuel_type', fuelFilter)
    if (searchTerm.trim())    q = q.or(`vehicle.ilike.%${searchTerm}%,driver.ilike.%${searchTerm}%,purpose.ilike.%${searchTerm}%`)
    if (showFlaggedOnly)      q = q.eq('is_flagged', true)

    const { data, count, error } = await q
    if (!error) {
      setRows(data || [])
      setTotal(count || 0)
      setPage(p)
    }
    setTableLoading(false)
  }, [dateFrom, dateTo, fuelFilter, searchTerm, showFlaggedOnly])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  // ── Form state ─────────────────────────────────────────────────
  const [showModal,  setShowModal]  = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [equipType,  setEquipType]  = useState('vehicle')

  const BLANK = {
    date: today, time: new Date().toTimeString().slice(0, 5),
    fuel_type: 'DIESEL', amount: '', vehicle: '', driver: '',
    authorized_by: user?.full_name || user?.username || '',
    purpose: '', odometer: '', flowmeter: '',
  }
  const [form, setForm] = useState(BLANK)

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setEquipType('vehicle'); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({ date: r.date, time: r.time || '', fuel_type: r.fuel_type || 'DIESEL', amount: r.amount, vehicle: r.vehicle || '', driver: r.driver || '', authorized_by: r.authorized_by || '', purpose: r.purpose || '', odometer: r.odometer || '', flowmeter: r.flowmeter || '' })
    setShowModal(true)
  }

  const selectedDriver = employees.find(e => e.id === form.driver)
  const driverOnLeave  = form.driver && isOnLeave(form.driver)

  // ── Flag rule checks (run before insert) ─────────────────────
  const runFlagChecks = async (qty, vehicleName) => {
    const flags = []
    const nowHour = new Date().getHours()
    const amount = parseFloat(qty) || 0

    // Rule 1: Overfill — need asset capacity. We look at vehicles/generators by name heuristic or skip.
    // Skip capacity check for now unless we have an asset_id (see F4.4 note)
    // We will still flag if amount > 800 as a generic overfill guard when no capacity info
    if (amount > 800) {
      flags.push({ rule: 'overfill', message: `${amount} L is very large — possible overfill. Verify tank capacity.` })
    }

    // Rule 3: Duplicate fill-up — same vehicle within last 4 hours
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    const { data: recentFills } = await supabase.from('fuel_log')
      .select('id, created_at, amount')
      .ilike('vehicle', vehicleName)
      .gte('created_at', fourHoursAgo)
      .limit(5)
    if (recentFills?.length > 0) {
      flags.push({ rule: 'duplicate_fill', message: `${vehicleName} was already fuelled within the last 4 hours (${recentFills.length} fill-up${recentFills.length > 1 ? 's' : ''} found).` })
    }

    // Rule 4: After-hours (22:00–05:00)
    if (nowHour >= 22 || nowHour < 5) {
      flags.push({ rule: 'after_hours', message: `Current time is ${nowHour}:00 — issuance outside normal hours (22:00–05:00).` })
    }

    return flags
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount')
    if (!form.vehicle) return toast.error('Select vehicle / equipment')
    if (driverOnLeave) { toast.error(`${selectedDriver?.name} is currently on leave`); return }

    const driverName = selectedDriver?.name || form.driver
    const basePayload = { ...form, amount: parseFloat(form.amount), flowmeter: parseFloat(form.flowmeter) || 0, odometer: form.odometer ? parseFloat(form.odometer) : null, user_name: user?.full_name || user?.username, driver: driverName }

    // For edits, skip flag checks
    if (editRecord) {
      try {
        const { error } = await supabase.from('fuel_log').update(basePayload).eq('id', editRecord.id)
        if (error) throw error
        toast.success('Record updated')
        await fetchPage(page)
        setShowModal(false)
        setForm(BLANK)
        setEditRecord(null)
      } catch (err) { toast.error(err.message) }
      return
    }

    // Run flag checks for new issuances
    const flags = await runFlagChecks(form.amount, form.vehicle)
    if (flags.length > 0) {
      // Warn via toasts
      flags.forEach(f => toast(`Warning: ${f.message}`, { icon: '⚠️', duration: 5000 }))
      // Determine combined flag reason
      const flagReason = flags.map(f => f.rule).join(',')
      const payload = { ...basePayload, is_flagged: true, flag_reason: flagReason }
      setPendingFlags(flags)
      setPendingPayload(payload)
      setShowFlagModal(true)
      return
    }

    // No flags — proceed directly
    await doIssuanceInsert(basePayload)
  }

  const doIssuanceInsert = async (payload) => {
    try {
      const txnCode = await generateTxnCode('FI')
      await addIssuance({ ...payload, txn_code: txnCode })
      toast.success(`Issued ${payload.amount} L — ${txnCode}${payload.is_flagged ? ' (flagged)' : ''}`)
      await fetchPage(0)
      setShowModal(false)
      setForm(BLANK)
      setEditRecord(null)
      setShowFlagModal(false)
      setPendingFlags([])
      setPendingPayload(null)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this issuance record?')) return
    const { error } = await supabase.from('fuel_log').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    await fetchPage(page)
  }

  // Export fetches all filtered records (no range cap)
  const handleExport = async () => {
    let q = supabase.from('fuel_log').select('*').order('date', { ascending: false })
    if (dateFrom)             q = q.gte('date', dateFrom)
    if (dateTo)               q = q.lte('date', dateTo)
    if (fuelFilter !== 'ALL') q = q.eq('fuel_type', fuelFilter)
    if (searchTerm.trim())    q = q.or(`vehicle.ilike.%${searchTerm}%,driver.ilike.%${searchTerm}%,purpose.ilike.%${searchTerm}%`)
    const { data } = await q
    if (!data?.length) return toast.error('No records to export')
    exportXLSX(data.map(r => ({ Date: r.date, Time: r.time, Type: r.fuel_type, Litres: r.amount, Vehicle: r.vehicle, Driver: r.driver, Odometer: r.odometer, Flowmeter: r.flowmeter, Purpose: r.purpose, AuthorisedBy: r.authorized_by })), `FuelIssuance_${today}`, 'Issuances')
    toast.success(`Exported ${data.length} records`)
  }

  const clearFilters = () => { setSearchInput(''); setSearchTerm(''); setDateFrom(''); setDateTo(''); setFuelFilter('ALL'); setShowFlaggedOnly(false) }

  return (
    <div>
      <PageHeader title="Fuel Issuance">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons">local_gas_station</span> New Issuance
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Issued Today"   value={kpiToday.toLocaleString()}  sub="litres" color="yellow" />
        <KPICard label="Issued This Month" value={kpiMonth.toLocaleString()} sub="litres" color="teal" />
        <KPICard label="Filtered Records"  value={total.toLocaleString()}   sub="matching filters" />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Vehicle, driver, purpose…" value={searchInput}
              onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Fuel Type</label>
            <select className="form-control" value={fuelFilter} onChange={e => setFuelFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              <option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showFlaggedOnly} onChange={e => setShowFlaggedOnly(e.target.checked)} />
              <span className="material-icons" style={{ fontSize: 14, color: 'var(--yellow)' }}>flag</span>
              Flagged only
            </label>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={clearFilters}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Issuance Records</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Page {page + 1}</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Code</th><th>Date</th><th>Time</th><th>Type</th><th>Vehicle / Equipment</th>
                <th>Amount (L)</th><th>Driver</th><th>Odometer</th><th>Purpose</th>
                <th>Authorised By</th><th>Flag</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="12"><EmptyState icon="local_gas_station" message="No records match your filters" /></td></tr>
              ) : rows.map(r => (
                <tr key={r.id} style={{ background: r.is_flagged ? 'rgba(234,179,8,.04)' : undefined }}>
                  <td>{r.txn_code ? <TxnCodeBadge code={r.txn_code} /> : <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{r.time || '—'}</td>
                  <td><span className={`badge ${FUEL_COLORS[r.fuel_type] || 'badge-gold'}`}>{r.fuel_type}</span></td>
                  <td style={{ fontWeight: 600 }}>{r.vehicle || '—'}</td>
                  <td className="td-mono" style={{ color: 'var(--yellow)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {r.amount} L
                      {r.is_flagged && (
                        <span title={r.flag_reason || 'Flagged'} style={{ cursor: 'help' }}>
                          <span className="material-icons" style={{ fontSize: 13, color: 'var(--yellow)', verticalAlign: 'middle' }}>warning_amber</span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{r.driver || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{r.odometer ? `${r.odometer} km` : '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.purpose || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.authorized_by || '—'}</td>
                  <td>
                    {r.is_flagged ? (
                      <span title={r.flag_reason || 'Flagged'} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 10, background: 'rgba(234,179,8,.15)',
                        color: 'var(--yellow)', border: '1px solid rgba(234,179,8,.4)', cursor: 'help',
                      }}>
                        <span className="material-icons" style={{ fontSize: 11 }}>flag</span>
                        {r.flag_reason ? r.flag_reason.split(',')[0].replace(/_/g,' ') : 'flagged'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                    )}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>}
                        {canDelete && <button className="btn btn-danger btn-sm"    onClick={() => handleDelete(r.id)}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={fetchPage} />
      </div>

      {/* Flag Confirmation Modal */}
      {showFlagModal && pendingFlags.length > 0 && (
        <div className="overlay" onClick={() => { setShowFlagModal(false); setPendingFlags([]); setPendingPayload(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title" style={{ color: 'var(--yellow)' }}>
              <span className="material-icons" style={{ fontSize: 20, marginRight: 8, verticalAlign: 'middle' }}>warning_amber</span>
              Issuance Flag Warning
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
              The following issues were detected. Do you want to proceed with the issuance?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {pendingFlags.map((f, i) => (
                <div key={i} style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  background: 'rgba(234,179,8,.10)', border: '1px solid rgba(234,179,8,.3)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <span className="material-icons" style={{ fontSize: 14, color: 'var(--yellow)', marginTop: 1 }}>flag</span>
                  <span><strong style={{ textTransform: 'capitalize' }}>{f.rule.replace(/_/g, ' ')}</strong>: {f.message}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Proceeding will mark this issuance as <strong>flagged</strong> for review.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowFlagModal(false); setPendingFlags([]); setPendingPayload(null) }}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ background: 'var(--yellow)', color: '#000' }}
                onClick={() => doIssuanceInsert(pendingPayload)}>
                <span className="material-icons" style={{ fontSize: 16 }}>check</span> Proceed Anyway (Flagged)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ModalDialog open onClose={() => { setShowModal(false); setEditRecord(null) }} title={`${editRecord ? 'Edit' : 'New'} Fuel Issuance`} size="lg">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" className="form-control" required value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input type="time" className="form-control" value={form.time}
                  onChange={e => setForm({ ...form, time: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fuel Type</label>
                <select className="form-control" value={form.fuel_type}
                  onChange={e => setForm({ ...form, fuel_type: e.target.value })}>
                  <option>DIESEL</option><option>PETROL</option><option>PARAFFIN</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount (L) *</label>
                <input type="number" className="form-control" required min="0.1" step="0.1"
                  value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>Equipment Type</label>
              <div className="btn-group">
                {['vehicle', 'generator', 'earthmover', 'contractor'].map(t => (
                  <button key={t} type="button"
                    className={equipType === t ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    onClick={() => { setEquipType(t); setForm({ ...form, vehicle: '' }) }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>
                      {t === 'vehicle' ? 'directions_car' : t === 'generator' ? 'bolt' : t === 'contractor' ? 'handshake' : 'construction'}
                    </span>
                    {t === 'contractor' ? 'Contractor' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>{equipType === 'vehicle' ? 'Vehicle' : equipType === 'generator' ? 'Generator' : equipType === 'contractor' ? 'Contractor Equipment' : 'Equipment'} *</label>
              <select className="form-control" required value={form.vehicle}
                onChange={e => setForm({ ...form, vehicle: e.target.value })}>
                <option value="">Select…</option>
                {equipType === 'vehicle'    && vehicles.map(v    => <option key={v.reg}      value={`${v.reg} – ${v.description}`}>{v.reg} – {v.description}</option>)}
                {equipType === 'generator'  && generators.map(g  => <option key={g.gen_code} value={`${g.gen_code} – ${g.gen_name}`}>{g.gen_code} – {g.gen_name}</option>)}
                {equipType === 'earthmover' && earthmovers.map(e => <option key={e.reg}      value={`${e.reg} – ${e.description}`}>{e.reg} – {e.description}</option>)}
                {equipType === 'contractor' && contractors.map(c  => <option key={c.ce_code} value={`${c.ce_code} – ${c.contractor_name} (${c.registration || c.equipment_type})`}>{c.ce_code} – {c.contractor_name} · {c.equipment_description || c.equipment_type}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Driver / Operator</label>
              <select className="form-control" value={form.driver}
                onChange={e => setForm({ ...form, driver: e.target.value })}>
                <option value="">— Select driver —</option>
                {employees.map(emp => {
                  const onLeave = isOnLeave(emp.id)
                  return (
                    <option key={emp.id} value={emp.id} disabled={onLeave}>
                      {emp.name}{onLeave ? ' (On Leave)' : ''}
                    </option>
                  )
                })}
              </select>
              {driverOnLeave && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-icons" style={{ fontSize: 14 }}>event_busy</span>
                  {selectedDriver?.name} is on approved leave — cannot be selected.
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Odometer (km)</label>
                <input type="number" className="form-control" min="0" value={form.odometer}
                  onChange={e => setForm({ ...form, odometer: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Flowmeter Reading</label>
                <input type="number" className="form-control" min="0" step="0.1" value={form.flowmeter}
                  onChange={e => setForm({ ...form, flowmeter: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Authorized By</label>
                <select className="form-control" value={form.authorized_by}
                  onChange={e => setForm({ ...form, authorized_by: e.target.value })}>
                  <option value="">— Select authoriser —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Purpose</label>
                <input className="form-control" value={form.purpose}
                  onChange={e => setForm({ ...form, purpose: e.target.value })} />
              </div>
            </div>

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditRecord(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={driverOnLeave}>
                <span className="material-icons">local_gas_station</span>
                {editRecord ? 'Save Changes' : 'Confirm Issuance'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
