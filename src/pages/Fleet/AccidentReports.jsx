// src/pages/Fleet/AccidentReports.jsx — Incident reporting and tracking

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import TxnCodeBadge from '../../components/TxnCodeBadge'
import { exportXLSX } from '../../engine/reportingEngine'
import { auditLog } from '../../engine/auditEngine'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, Pagination, TabNav } from '../../components/ui'

const today    = new Date().toISOString().split('T')[0]
const PAGE_SIZE = 50

const INCIDENT_TYPES = ['accident', 'theft', 'vandalism', 'fire', 'flood', 'breakdown', 'hit_and_run', 'other']
const SEVERITY_OPTS  = ['minor', 'moderate', 'major', 'total_loss']
const STATUS_OPTS    = ['open', 'under_investigation', 'resolved', 'closed']
const CLAIM_STATUSES = ['not_claimed', 'submitted', 'approved', 'rejected', 'settled']

const SEVERITY_COLORS = { minor: 'badge-green', moderate: 'badge-yellow', major: 'badge-red', total_loss: 'badge-red' }
const STATUS_COLORS   = { open: 'badge-red', under_investigation: 'badge-yellow', resolved: 'badge-green', closed: 'badge-teal' }

const BLANK = {
  incident_date:        today,
  incident_time:        '',
  incident_location:    '',
  asset_id:             '',
  asset_reg:            '',
  asset_type:           'vehicle',
  incident_type:        'accident',
  severity:             'minor',
  description:          '',
  reported_by:          '',
  driver_id:            '',
  driver_operator:      '',
  third_party_involved: false,
  third_party_details:  '',
  police_report_no:     '',
  police_station:       '',
  estimated_damage:     '',
  actual_repair_cost:   '',
  insurance_claim_no:   '',
  insurance_company:    '',
  claim_amount:         '',
  claim_status:         'not_claimed',
  vehicle_driveable:    true,
  downtime_days:        '',
  photos_url:           '',
  status:               'open',
  resolved_date:        '',
  resolution_notes:     '',
}

export default function AccidentReports() {
  const { user }    = useAuth()
  const canEdit     = useCanEdit('fleet', 'vehicles')
  const canDelete   = useCanDelete('fleet', 'vehicles')

  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [tableLoading, setTableLoading] = useState(true)
  const [kpiData,      setKpiData]      = useState({ open: 0, month: 0, totalCost: 0, claimed: 0 })
  const [assets,       setAssets]       = useState([])
  const [employees,    setEmployees]    = useState([])
  const [showModal,    setShowModal]    = useState(false)
  const [editRecord,   setEditRecord]   = useState(null)
  const [form,         setForm]         = useState(BLANK)
  const [activeTab,    setActiveTab]    = useState('details')
  const [searchInput,  setSearchInput]  = useState('')
  const [searchTerm,   setSearchTerm]   = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    supabase.from('asset_registry').select('id,asset_name,plate_number,asset_code,asset_category').order('asset_name')
      .then(({ data }) => setAssets(data || []))
    supabase.from('employees').select('id,name').neq('status', 'Terminated').order('name')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  useEffect(() => {
    const monthStart = today.slice(0, 7) + '-01'
    Promise.all([
      supabase.from('accident_reports').select('id', { count: 'exact' }).eq('status', 'open'),
      supabase.from('accident_reports').select('id', { count: 'exact' }).gte('incident_date', monthStart),
      supabase.from('accident_reports').select('actual_repair_cost,claim_amount'),
    ]).then(([openRes, monthRes, costRes]) => {
      const totalCost = (costRes.data || []).reduce((s, r) => s + (r.actual_repair_cost || 0), 0)
      const claimed   = (costRes.data || []).reduce((s, r) => s + (r.claim_amount || 0), 0)
      setKpiData({ open: openRes.count || 0, month: monthRes.count || 0, totalCost, claimed })
    }).catch(console.error)
  }, [])

  const fetchPage = useCallback(async (p = 0) => {
    setTableLoading(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = supabase
      .from('accident_reports')
      .select('*', { count: 'exact' })
      .order('incident_date', { ascending: false })
      .range(from, to)

    if (statusFilter !== 'ALL') q = q.eq('status', statusFilter)
    if (dateFrom)               q = q.gte('incident_date', dateFrom)
    if (dateTo)                 q = q.lte('incident_date', dateTo)
    if (searchTerm.trim())      q = q.or(`asset_reg.ilike.%${searchTerm}%,reported_by.ilike.%${searchTerm}%,incident_location.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)

    const { data, count, error } = await q
    if (!error) { setRows(data || []); setTotal(count || 0); setPage(p) }
    setTableLoading(false)
  }, [statusFilter, dateFrom, dateTo, searchTerm])

  useEffect(() => { fetchPage(0) }, [fetchPage])

  const handleSearchChange = (v) => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 400)
  }

  const handleAssetChange = (assetId) => {
    const asset = assets.find(a => a.id === assetId)
    setForm(f => ({
      ...f,
      asset_id:   assetId,
      asset_reg:  asset ? (asset.plate_number || asset.asset_code || asset.asset_name) : '',
      asset_type: asset?.asset_category || 'vehicle',
    }))
  }

  const handleDriverChange = (empId) => {
    const emp = employees.find(e => e.id === empId)
    setForm(f => ({ ...f, driver_id: empId, driver_operator: emp?.name || '' }))
  }

  const openNew  = () => { setEditRecord(null); setForm(BLANK); setActiveTab('details'); setShowModal(true) }
  const openEdit = (r) => {
    setEditRecord(r)
    setForm({
      incident_date:        r.incident_date || today,
      incident_time:        r.incident_time || '',
      incident_location:    r.incident_location || '',
      asset_id:             r.asset_id || '',
      asset_reg:            r.asset_reg || '',
      asset_type:           r.asset_type || 'vehicle',
      incident_type:        r.incident_type || 'accident',
      severity:             r.severity || 'minor',
      description:          r.description || '',
      reported_by:          r.reported_by || '',
      driver_id:            r.driver_id || '',
      driver_operator:      r.driver_operator || '',
      third_party_involved: r.third_party_involved || false,
      third_party_details:  r.third_party_details || '',
      police_report_no:     r.police_report_no || '',
      police_station:       r.police_station || '',
      estimated_damage:     r.estimated_damage ?? '',
      actual_repair_cost:   r.actual_repair_cost ?? '',
      insurance_claim_no:   r.insurance_claim_no || '',
      insurance_company:    r.insurance_company || '',
      claim_amount:         r.claim_amount ?? '',
      claim_status:         r.claim_status || 'not_claimed',
      vehicle_driveable:    r.vehicle_driveable !== false,
      downtime_days:        r.downtime_days ?? '',
      photos_url:           r.photos_url || '',
      status:               r.status || 'open',
      resolved_date:        r.resolved_date || '',
      resolution_notes:     r.resolution_notes || '',
    })
    setActiveTab('details')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.incident_date) return toast.error('Incident date required')
    if (!form.asset_reg)     return toast.error('Asset registration / name required')
    if (!form.description)   return toast.error('Description is required')

    const payload = {
      ...form,
      estimated_damage:   form.estimated_damage   ? parseFloat(form.estimated_damage)   : 0,
      actual_repair_cost: form.actual_repair_cost ? parseFloat(form.actual_repair_cost) : 0,
      claim_amount:       form.claim_amount       ? parseFloat(form.claim_amount)       : 0,
      downtime_days:      form.downtime_days      ? parseInt(form.downtime_days)         : 0,
      resolved_date:      form.resolved_date || null,
      updated_at:         new Date().toISOString(),
      created_by:         user?.full_name || user?.username || '',
    }

    try {
      if (editRecord) {
        const { error } = await supabase.from('accident_reports').update(payload).eq('id', editRecord.id)
        if (error) throw error
        auditLog({ module: 'fleet', action: 'UPDATE', entityType: 'accident_report', entityId: editRecord.id, entityName: editRecord.report_number })
        toast.success('Report updated')
      } else {
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2)
        let report_number
        try { report_number = await generateTxnCode('ACC') } catch { report_number = `ACC-${Date.now()}` }
        const { error } = await supabase.from('accident_reports').insert([{
          id, report_number, ...payload, created_at: new Date().toISOString()
        }])
        if (error) throw error
        auditLog({ module: 'fleet', action: 'CREATE', entityType: 'accident_report', entityId: id, entityName: report_number })
        toast.success(`Report created — ${report_number}`)
      }
      setShowModal(false)
      setEditRecord(null)
      fetchPage(0)
    } catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm('Delete this accident report? This cannot be undone.')) return
    const { error } = await supabase.from('accident_reports').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    auditLog({ module: 'fleet', action: 'DELETE', entityType: 'accident_report', entityId: id, entityName: name })
    toast.success('Report deleted')
    fetchPage(page)
  }

  const handleExport = async () => {
    let q = supabase.from('accident_reports').select('*').order('incident_date', { ascending: false })
    if (statusFilter !== 'ALL') q = q.eq('status', statusFilter)
    if (dateFrom)               q = q.gte('incident_date', dateFrom)
    if (dateTo)                 q = q.lte('incident_date', dateTo)
    const { data } = await q
    if (!data?.length) return toast.error('No records to export')
    exportXLSX(data.map(r => ({
      ReportNo: r.report_number, Date: r.incident_date, AssetReg: r.asset_reg,
      Type: r.incident_type, Severity: r.severity, Status: r.status,
      Location: r.incident_location, ReportedBy: r.reported_by,
      EstimatedDamage: r.estimated_damage, ActualCost: r.actual_repair_cost,
      ClaimNo: r.insurance_claim_no, ClaimStatus: r.claim_status, ClaimAmount: r.claim_amount,
    })), `AccidentReports_${today}`, 'Accidents')
    toast.success(`Exported ${data.length} records`)
  }

  const clearFilters = () => { setSearchInput(''); setSearchTerm(''); setStatusFilter('ALL'); setDateFrom(''); setDateTo('') }

  const MODAL_TABS = [
    { id: 'details',   label: 'Incident Details',  icon: 'report' },
    { id: 'parties',   label: 'Parties & Police',  icon: 'people' },
    { id: 'insurance', label: 'Insurance & Costs', icon: 'security' },
    { id: 'resolution', label: 'Resolution',       icon: 'check_circle' },
  ]

  return (
    <div>
      <PageHeader title="Accident Reports">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <span className="material-icons">add_circle</span> New Report
          </button>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Open Incidents"  value={kpiData.open}  sub="requiring action"       color="red"    />
        <KPICard label="This Month"      value={kpiData.month} sub={today.slice(0, 7)}       color="yellow" />
        <KPICard label="Total Repair Cost" value={`$${kpiData.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="actual costs" color="teal" />
        <KPICard label="Insurance Claims" value={`$${kpiData.claimed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="total claimed" color="gold" />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Asset reg, location, description…" value={searchInput}
              onChange={e => handleSearchChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>From</label>
            <input type="date" className="form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="date" className="form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
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
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Accident Reports</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{total} records</span>
        </div>
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Report No</th><th>Date</th><th>Asset</th><th>Type</th><th>Severity</th>
                <th>Location</th><th>Repair Cost</th><th>Claim Status</th><th>Status</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="10"><EmptyState icon="car_crash" message="No accident reports found" /></td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td>{r.report_number ? <TxnCodeBadge code={r.report_number} /> : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.incident_date}</td>
                  <td style={{ fontWeight: 600 }}>{r.asset_reg || '—'}</td>
                  <td><span className="badge badge-gold" style={{ fontSize: 9 }}>{r.incident_type}</span></td>
                  <td><span className={`badge ${SEVERITY_COLORS[r.severity] || 'badge-yellow'}`} style={{ fontSize: 9 }}>{r.severity}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.incident_location || '—'}</td>
                  <td className="td-mono" style={{ color: r.actual_repair_cost > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                    {r.actual_repair_cost > 0 ? `$${r.actual_repair_cost.toLocaleString()}` : '—'}
                  </td>
                  <td><span className="badge badge-teal" style={{ fontSize: 9 }}>{(r.claim_status || 'not_claimed').replace(/_/g, ' ')}</span></td>
                  <td><span className={`badge ${STATUS_COLORS[r.status] || 'badge-yellow'}`} style={{ fontSize: 9 }}>{(r.status || 'open').replace(/_/g, ' ')}</span></td>
                  {(canEdit || canDelete) && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {canEdit   && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>}
                        {canDelete && <button className="btn btn-danger btn-sm"    onClick={() => handleDelete(r.id, r.report_number)}><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
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

      {/* Modal */}
      {showModal && (
        <ModalDialog open onClose={() => { setShowModal(false); setEditRecord(null) }}
          title={`${editRecord ? 'Edit' : 'New'} Accident Report`} size="xl">
          <form onSubmit={handleSubmit}>
            <TabNav tabs={MODAL_TABS} active={activeTab} onChange={setActiveTab} />

            {/* Tab 1 — Incident Details */}
            {activeTab === 'details' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Incident Date *</label>
                    <input type="date" className="form-control" required value={form.incident_date}
                      onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Time</label>
                    <input type="time" className="form-control" value={form.incident_time}
                      onChange={e => setForm(f => ({ ...f, incident_time: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Incident Type</label>
                    <select className="form-control" value={form.incident_type}
                      onChange={e => setForm(f => ({ ...f, incident_type: e.target.value }))}>
                      {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Severity</label>
                    <select className="form-control" value={form.severity}
                      onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                      {SEVERITY_OPTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Asset / Vehicle *</label>
                    <select className="form-control" value={form.asset_id}
                      onChange={e => handleAssetChange(e.target.value)}>
                      <option value="">Select asset or type below…</option>
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.asset_name || a.plate_number || a.asset_code}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Asset Reg / Name *</label>
                    <input className="form-control" required placeholder="Registration or asset name" value={form.asset_reg}
                      onChange={e => setForm(f => ({ ...f, asset_reg: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Driver / Operator</label>
                    <select className="form-control" value={form.driver_id}
                      onChange={e => handleDriverChange(e.target.value)}>
                      <option value="">— Select —</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Incident Location</label>
                    <input className="form-control" value={form.incident_location}
                      onChange={e => setForm(f => ({ ...f, incident_location: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Reported By</label>
                    <select className="form-control" value={form.reported_by}
                      onChange={e => setForm(f => ({ ...f, reported_by: e.target.value }))}>
                      <option value="">— Select employee —</option>
                      {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description *</label>
                  <textarea className="form-control" required rows={3} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.vehicle_driveable}
                        onChange={e => setForm(f => ({ ...f, vehicle_driveable: e.target.checked }))} />
                      Vehicle Driveable
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Downtime Days</label>
                    <input type="number" className="form-control" min="0" value={form.downtime_days}
                      onChange={e => setForm(f => ({ ...f, downtime_days: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {/* Tab 2 — Parties & Police */}
            {activeTab === 'parties' && (
              <>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.third_party_involved}
                      onChange={e => setForm(f => ({ ...f, third_party_involved: e.target.checked }))} />
                    Third Party Involved
                  </label>
                </div>
                {form.third_party_involved && (
                  <div className="form-group">
                    <label>Third Party Details</label>
                    <textarea className="form-control" rows={3} placeholder="Name, vehicle, contact, insurance…" value={form.third_party_details}
                      onChange={e => setForm(f => ({ ...f, third_party_details: e.target.value }))} />
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>Police Report No</label>
                    <input className="form-control" value={form.police_report_no}
                      onChange={e => setForm(f => ({ ...f, police_report_no: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Police Station</label>
                    <input className="form-control" value={form.police_station}
                      onChange={e => setForm(f => ({ ...f, police_station: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Photos / Evidence URL</label>
                  <input className="form-control" type="url" placeholder="Link to photos or document folder" value={form.photos_url}
                    onChange={e => setForm(f => ({ ...f, photos_url: e.target.value }))} />
                </div>
              </>
            )}

            {/* Tab 3 — Insurance & Costs */}
            {activeTab === 'insurance' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Estimated Damage ($)</label>
                    <input type="number" className="form-control" min="0" step="0.01" value={form.estimated_damage}
                      onChange={e => setForm(f => ({ ...f, estimated_damage: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Actual Repair Cost ($)</label>
                    <input type="number" className="form-control" min="0" step="0.01" value={form.actual_repair_cost}
                      onChange={e => setForm(f => ({ ...f, actual_repair_cost: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Insurance Company</label>
                    <input className="form-control" value={form.insurance_company}
                      onChange={e => setForm(f => ({ ...f, insurance_company: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Claim Number</label>
                    <input className="form-control" value={form.insurance_claim_no}
                      onChange={e => setForm(f => ({ ...f, insurance_claim_no: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Claim Amount ($)</label>
                    <input type="number" className="form-control" min="0" step="0.01" value={form.claim_amount}
                      onChange={e => setForm(f => ({ ...f, claim_amount: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Claim Status</label>
                    <select className="form-control" value={form.claim_status}
                      onChange={e => setForm(f => ({ ...f, claim_status: e.target.value }))}>
                      {CLAIM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Tab 4 — Resolution */}
            {activeTab === 'resolution' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  {(form.status === 'resolved' || form.status === 'closed') && (
                    <div className="form-group">
                      <label>Resolved Date</label>
                      <input type="date" className="form-control" value={form.resolved_date}
                        onChange={e => setForm(f => ({ ...f, resolved_date: e.target.value }))} />
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Resolution Notes</label>
                  <textarea className="form-control" rows={4} value={form.resolution_notes}
                    onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))} />
                </div>
              </>
            )}

            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditRecord(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary">
                <span className="material-icons">save</span>
                {editRecord ? 'Save Changes' : 'Create Report'}
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
