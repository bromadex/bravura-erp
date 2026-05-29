// src/pages/Assets/AssetRegistry.jsx
// Unified asset list with add, edit, reclassify, timeline detail panel.

import { useState, useMemo, useEffect } from 'react'
import { useAssetRegistry } from '../../contexts/AssetRegistryContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const STATUSES = ['Active', 'Maintenance', 'Grounded', 'Retired', 'Standby']

const BLANK_FORM = {
  asset_name: '', asset_category: '', asset_subtype: '', make: '', model: '',
  year: '', vin_serial: '', plate_number: '', colour: '', status: 'Active',
  primary_metric_val: '0', service_interval: '', last_service_date: '',
  purchase_date: '', purchase_cost: '', salvage_value: '', useful_life_years: '5',
  depreciation_method: 'straight_line', assigned_project: '', assigned_to: '',
  department: '', location: '', notes: '',
}

function metricLabel(cfg) {
  if (!cfg) return 'Value'
  if (cfg.measurement_type === 'km') return 'Odometer (km)'
  if (cfg.measurement_type === 'hours') return 'Hour Meter (hrs)'
  return 'Value'
}

function serviceLabel(cfg) {
  if (!cfg) return 'Interval'
  if (cfg.service_interval_basis === 'km') return 'Service Interval (km)'
  if (cfg.service_interval_basis === 'hours') return 'Service Interval (hrs)'
  return 'Service Interval (days)'
}

export default function AssetRegistry() {
  const {
    assets, categoryConfigs, loading,
    getCategoryConfig, createAsset, updateAsset, deleteAsset,
    reclassifyAsset, getAssetTimeline,
  } = useAssetRegistry()
  const { user } = useAuth()
  const canEdit   = useCanEdit('assets', 'registry')
  const canDelete = useCanDelete('assets', 'registry')
  const isAdmin   = user?.role === 'admin' || user?.role === 'fleet_manager'

  const [catFilter,    setCatFilter]    = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search,       setSearch]       = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editAsset,    setEditAsset]    = useState(null)
  const [form,         setForm]         = useState(BLANK_FORM)
  const [saving,       setSaving]       = useState(false)
  const [employees,    setEmployees]    = useState([])
  const [departments,  setDepartments]  = useState([])

  useEffect(() => {
    supabase.from('employees').select('id,name').neq('status','Terminated').order('name')
      .then(({ data }) => setEmployees(data || []))
    supabase.from('departments').select('id,name').order('name')
      .then(({ data }) => setDepartments(data || []))
  }, [])

  // Detail / Timeline panel
  const [detail,       setDetail]       = useState(null)
  const [timeline,     setTimeline]     = useState([])
  const [tlLoading,    setTlLoading]    = useState(false)
  const [activeTab,    setActiveTab]    = useState('info')

  // Reclassify
  const [showReclass,  setShowReclass]  = useState(false)
  const [reclassTarget, setReclassTarget] = useState('')
  const [reclassReason, setReclassReason] = useState('')
  const [reclassing,   setReclassing]   = useState(false)

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (catFilter !== 'All' && a.asset_category !== catFilter) return false
      if (statusFilter !== 'All' && a.status !== statusFilter) return false
      if (search) {
        const t = search.toLowerCase()
        if (!([a.asset_name, a.asset_code, a.plate_number, a.make, a.model, a.assigned_project, a.asset_subtype]
          .some(v => v?.toLowerCase().includes(t)))) return false
      }
      return true
    })
  }, [assets, catFilter, statusFilter, search])

  // ── Modal helpers ────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditAsset(null)
    setForm({ ...BLANK_FORM, asset_category: categoryConfigs[0]?.category || '' })
    setShowModal(true)
  }

  const openEdit = (a) => {
    setEditAsset(a)
    setForm({
      asset_name: a.asset_name || '', asset_category: a.asset_category || '',
      asset_subtype: a.asset_subtype || '', make: a.make || '', model: a.model || '',
      year: a.year || '', vin_serial: a.vin_serial || '', plate_number: a.plate_number || '',
      colour: a.colour || '', status: a.status || 'Active',
      primary_metric_val: a.primary_metric_val ?? '0',
      service_interval: a.service_interval || '', last_service_date: a.last_service_date || '',
      purchase_date: a.purchase_date || '', purchase_cost: a.purchase_cost || '',
      salvage_value: a.salvage_value || '', useful_life_years: a.useful_life_years || '5',
      depreciation_method: a.depreciation_method || 'straight_line',
      assigned_project: a.assigned_project || '', assigned_to: a.assigned_to || '',
      department: a.department || '', location: a.location || '', notes: a.notes || '',
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_name.trim()) return toast.error('Asset name is required')
    if (!form.asset_category) return toast.error('Category is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        primary_metric_val: parseFloat(form.primary_metric_val) || 0,
        service_interval: form.service_interval ? parseFloat(form.service_interval) : null,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : 0,
        salvage_value: form.salvage_value ? parseFloat(form.salvage_value) : 0,
        useful_life_years: parseInt(form.useful_life_years) || 5,
        year: form.year ? parseInt(form.year) : null,
      }
      if (editAsset) {
        await updateAsset(editAsset.id, payload)
        toast.success('Asset updated')
      } else {
        const { asset_code } = await createAsset(payload)
        toast.success(`Asset created — ${asset_code}`)
      }
      setShowModal(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete "${a.asset_name}"? This cannot be undone.`)) return
    try {
      await deleteAsset(a.id)
      toast.success('Asset deleted')
      setDetail(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Detail panel ─────────────────────────────────────────────────────────

  const openDetail = async (a) => {
    setDetail(a)
    setActiveTab('info')
    setShowReclass(false)
    setReclassTarget('')
    setReclassReason('')
  }

  const loadTimeline = async (assetId) => {
    setTlLoading(true)
    try {
      const tl = await getAssetTimeline(assetId)
      setTimeline(tl)
    } catch { setTimeline([]) } finally { setTlLoading(false) }
  }

  const switchTab = (tab) => {
    setActiveTab(tab)
    if (tab === 'timeline' && detail) loadTimeline(detail.id)
  }

  // ── Reclassification ─────────────────────────────────────────────────────

  const handleReclassify = async () => {
    if (!reclassTarget) return toast.error('Select a target category')
    if (!reclassReason.trim()) return toast.error('Reason is required')
    setReclassing(true)
    try {
      const txnCode = await reclassifyAsset(detail.id, reclassTarget, reclassReason)
      toast.success(`Reclassified — ${txnCode}`)
      // Refresh detail with updated asset
      setDetail(prev => ({ ...prev, asset_category: reclassTarget }))
      setShowReclass(false)
      setReclassTarget('')
      setReclassReason('')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReclassing(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const cfg = form.asset_category ? getCategoryConfig(form.asset_category) : null
  const detailCfg = detail ? getCategoryConfig(detail.asset_category) : null

  const statusBadgeClass = (s) => {
    if (s === 'Active')      return 'badge-green'
    if (s === 'Maintenance') return 'badge-yellow'
    if (s === 'Grounded')    return 'badge-red'
    return 'badge-dim'
  }

  const tlIcon = (type) => {
    const icons = { registered: 'add_circle', reclassified: 'swap_horiz', service: 'build',
      issue: 'warning', downtime: 'timer_off', status_change: 'published_with_changes',
      assignment: 'person', metric_update: 'speed', note: 'note' }
    return icons[type] || 'circle'
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Asset Registry</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            <span className="material-icons">add</span> Add Asset
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {/* Category pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['All', ...categoryConfigs.map(c => c.category)].map(cat => {
              const cfgItem = categoryConfigs.find(c => c.category === cat)
              return (
                <button key={cat}
                  onClick={() => setCatFilter(cat)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: `1px solid ${catFilter === cat ? (cfgItem?.color || 'var(--gold)') : 'var(--border)'}`,
                    background: catFilter === cat ? (cfgItem?.color || 'var(--gold)') + '22' : 'transparent',
                    color: catFilter === cat ? (cfgItem?.color || 'var(--gold)') : 'var(--text-dim)',
                    cursor: 'pointer',
                  }}>
                  {cfgItem && <span className="material-icons" style={{ fontSize: 11, marginRight: 3, verticalAlign: 'middle' }}>{cfgItem.icon}</span>}
                  {cat}
                </button>
              )
            })}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input className="form-control" style={{ width: 200 }} placeholder="Search name, code, plate…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Summary line */}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10, paddingLeft: 2 }}>
        {filtered.length} of {assets.length} assets
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Asset Name</th>
                <th>Category</th>
                <th>Subtype</th>
                <th>Plate / Serial</th>
                <th>Primary Metric</th>
                <th>Status</th>
                <th>Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="9" className="empty-state">No assets found — add one or import from Fleet</td></tr>
              ) : filtered.map(a => {
                const acfg = getCategoryConfig(a.asset_category)
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(a)}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{a.asset_code}</td>
                    <td style={{ fontWeight: 600 }}>{a.asset_name}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {acfg && <span className="material-icons" style={{ fontSize: 13, color: acfg.color }}>{acfg.icon}</span>}
                        {a.asset_category}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{a.asset_subtype || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{a.plate_number || a.vin_serial || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>
                      {(a.primary_metric_val || 0).toLocaleString()}
                      {' '}<span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {a.measurement_type === 'km' ? 'km' : a.measurement_type === 'hours' ? 'hrs' : ''}
                      </span>
                    </td>
                    <td><span className={`badge ${statusBadgeClass(a.status)}`}>{a.status}</span></td>
                    <td style={{ fontSize: 12 }}>{a.assigned_project || '—'}</td>
                    <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
                      {canEdit && (
                        <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => openEdit(a)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-danger btn-sm" title="Delete" onClick={() => handleDelete(a)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
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

      {/* ── Detail Panel (modal) ─────────────────────────────────────────── */}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{detail.asset_code}</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.asset_name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {detailCfg && (
                    <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: detailCfg.color }}>
                      <span className="material-icons" style={{ fontSize: 13 }}>{detailCfg.icon}</span>
                      {detail.asset_category}
                    </span>
                  )}
                  <span className={`badge ${statusBadgeClass(detail.status)}`}>{detail.status}</span>
                  {detail.asset_subtype && <span className="badge badge-dim">{detail.asset_subtype}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {canEdit && (
                  <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => openEdit(detail)}>
                    <span className="material-icons" style={{ fontSize: 13 }}>edit</span> Edit
                  </button>
                )}
                {isAdmin && (
                  <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowReclass(r => !r)}>
                    <span className="material-icons" style={{ fontSize: 13 }}>swap_horiz</span> Reclassify
                  </button>
                )}
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>

            {/* Reclassify inline form */}
            {showReclass && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'var(--gold)', background: 'rgba(184,50,50,.06)' }}>
                <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--gold)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>swap_horiz</span>
                  Reclassify Asset
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>New Category *</label>
                    <select className="form-control" value={reclassTarget}
                      onChange={e => setReclassTarget(e.target.value)}>
                      <option value="">— Select —</option>
                      {categoryConfigs
                        .filter(c => c.category !== detail.asset_category)
                        .map(c => <option key={c.category} value={c.category}>{c.display_label}</option>)}
                    </select>
                  </div>
                </div>
                {reclassTarget && (() => {
                  const toCfg = categoryConfigs.find(c => c.category === reclassTarget)
                  const fromCfg = detailCfg
                  const willChange = fromCfg?.measurement_type !== toCfg?.measurement_type
                  return (
                    <div style={{ fontSize: 12, marginBottom: 10, padding: 10, borderRadius: 6, background: willChange ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)', color: willChange ? 'var(--red)' : 'var(--green)' }}>
                      {willChange ? (
                        <>
                          <strong>Metric change:</strong> {fromCfg?.measurement_type} → {toCfg?.measurement_type}<br />
                          Current metric value ({detail.primary_metric_val?.toLocaleString()}) will be archived. New meter starts at 0.
                        </>
                      ) : (
                        <>Same measurement type ({toCfg?.measurement_type}). Metric value will be preserved.</>
                      )}
                      <div style={{ marginTop: 4 }}>
                        <strong>Features:</strong>{' '}
                        {toCfg?.show_odometer && 'Odometer '}{toCfg?.show_hour_meter && 'Hour Meter '}
                        {toCfg?.enable_fuel && 'Fuel '}{toCfg?.enable_trips && 'Trips '}
                        {toCfg?.enable_run_logs && 'Run Logs '}{toCfg?.enable_tyre_module && 'Tyres'}
                      </div>
                    </div>
                  )
                })()}
                <div className="form-group">
                  <label>Reason for reclassification *</label>
                  <textarea className="form-control" rows="2" value={reclassReason}
                    onChange={e => setReclassReason(e.target.value)}
                    placeholder="E.g. Unit was misclassified on entry — it is a generator, not a vehicle" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowReclass(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={reclassing} onClick={handleReclassify}>
                    {reclassing ? 'Processing…' : 'Confirm Reclassification'}
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {['info', 'metrics', 'financial', 'timeline'].map(tab => (
                <button key={tab} onClick={() => switchTab(tab)}
                  style={{
                    padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                    fontWeight: activeTab === tab ? 700 : 400,
                    borderBottom: `2px solid ${activeTab === tab ? 'var(--gold)' : 'transparent'}`,
                    color: activeTab === tab ? 'var(--gold)' : 'var(--text-dim)',
                    fontSize: 13, textTransform: 'capitalize',
                  }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Info tab */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[
                  ['Make', detail.make], ['Model', detail.model], ['Year', detail.year],
                  ['Plate / Reg', detail.plate_number], ['VIN / Serial', detail.vin_serial],
                  ['Colour', detail.colour], ['Subtype', detail.asset_subtype],
                  ['Assigned To', detail.assigned_to], ['Project', detail.assigned_project],
                  ['Department', detail.department], ['Location', detail.location],
                  ['Source Table', detail.source_table],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{val || '—'}</div>
                  </div>
                ))}
                {detail.notes && (
                  <div style={{ gridColumn: '1/-1', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Notes</div>
                    <div style={{ fontSize: 13 }}>{detail.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* Metrics tab */}
            {activeTab === 'metrics' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[
                  ['Measurement Type', detail.measurement_type],
                  ['Primary Metric', `${(detail.primary_metric_val || 0).toLocaleString()} ${detail.measurement_type === 'km' ? 'km' : 'hrs'}`],
                  ['Service Interval', detail.service_interval ? `${detail.service_interval.toLocaleString()} ${detail.service_interval_basis}` : '—'],
                  ['Last Service Date', detail.last_service_date || '—'],
                  ['Last Service Value', detail.last_service_val != null ? `${detail.last_service_val.toLocaleString()} ${detail.service_interval_basis}` : '—'],
                  ['Category Features', detailCfg ? [
                    detailCfg.show_odometer && 'Odometer', detailCfg.show_hour_meter && 'Hour Meter',
                    detailCfg.enable_fuel && 'Fuel', detailCfg.enable_trips && 'Trips',
                    detailCfg.enable_run_logs && 'Run Logs', detailCfg.enable_tyre_module && 'Tyres',
                  ].filter(Boolean).join(' · ') || 'None' : '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{val || '—'}</div>
                  </div>
                ))}
                {Object.keys(detail.archived_fields || {}).length > 0 && (
                  <div style={{ gridColumn: '1/-1', padding: '8px', borderRadius: 6, background: 'rgba(148,163,184,.08)', marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Archived (from previous category)</div>
                    {Object.entries(detail.archived_fields).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 12 }}><strong>{k}:</strong> {String(v ?? '—')}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Financial tab */}
            {activeTab === 'financial' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[
                  ['Purchase Date', detail.purchase_date || '—'],
                  ['Purchase Cost', detail.purchase_cost ? `$${Number(detail.purchase_cost).toLocaleString()}` : '—'],
                  ['Salvage Value', detail.salvage_value ? `$${Number(detail.salvage_value).toLocaleString()}` : '—'],
                  ['Useful Life', `${detail.useful_life_years || 5} years`],
                  ['Depreciation Method', (detail.depreciation_method || 'straight_line').replace(/_/g, ' ')],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline tab */}
            {activeTab === 'timeline' && (
              <div>
                {tlLoading ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading timeline…</div>
                ) : timeline.length === 0 ? (
                  <div className="empty-state">No timeline events yet</div>
                ) : timeline.map((ev, i) => (
                  <div key={ev.id} style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-icons" style={{ fontSize: 13 }}>{tlIcon(ev.event_type)}</span>
                      </div>
                      {i < timeline.length - 1 && <div style={{ width: 2, flexGrow: 1, background: 'var(--border)', margin: '4px 0' }} />}
                    </div>
                    <div style={{ paddingBottom: 16, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</div>
                      {ev.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{ev.description}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{ev.event_date} · {ev.created_by}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editAsset ? 'Edit' : 'Add'} <span>Asset</span></div>
            <form onSubmit={handleSubmit}>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 4 }}>IDENTITY</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Asset Name *</label>
                  <input className="form-control" required value={form.asset_name}
                    onChange={e => setForm(f => ({ ...f, asset_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select className="form-control" required value={form.asset_category}
                    onChange={e => setForm(f => ({ ...f, asset_category: e.target.value }))}>
                    <option value="">— Select —</option>
                    {categoryConfigs.map(c => <option key={c.category} value={c.category}>{c.display_label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Subtype</label>
                  <input className="form-control" placeholder="Truck, Excavator, 500kVA…"
                    value={form.asset_subtype} onChange={e => setForm(f => ({ ...f, asset_subtype: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Make</label><input className="form-control" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} /></div>
                <div className="form-group"><label>Model</label><input className="form-control" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
                <div className="form-group"><label>Year</label><input type="number" className="form-control" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Plate / Reg</label><input className="form-control" value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value.toUpperCase() }))} /></div>
                <div className="form-group"><label>VIN / Serial</label><input className="form-control" value={form.vin_serial} onChange={e => setForm(f => ({ ...f, vin_serial: e.target.value }))} /></div>
                <div className="form-group"><label>Colour</label><input className="form-control" value={form.colour} onChange={e => setForm(f => ({ ...f, colour: e.target.value }))} /></div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>METRICS &amp; SERVICE</div>
              <div className="form-row">
                <div className="form-group">
                  <label>{metricLabel(cfg)}</label>
                  <input type="number" step="0.1" min="0" className="form-control"
                    value={form.primary_metric_val} onChange={e => setForm(f => ({ ...f, primary_metric_val: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>{serviceLabel(cfg)}</label>
                  <input type="number" step="1" min="0" className="form-control"
                    value={form.service_interval} onChange={e => setForm(f => ({ ...f, service_interval: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Last Service Date</label>
                  <input type="date" className="form-control" value={form.last_service_date}
                    onChange={e => setForm(f => ({ ...f, last_service_date: e.target.value }))} />
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>ASSIGNMENT</div>
              <div className="form-row">
                <div className="form-group"><label>Project</label><input className="form-control" value={form.assigned_project} onChange={e => setForm(f => ({ ...f, assigned_project: e.target.value }))} /></div>
                <div className="form-group">
                  <label>Assigned To</label>
                  <select className="form-control" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">— Select employee —</option>
                    {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select className="form-control" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">— Select department —</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, marginTop: 12 }}>FINANCIAL</div>
              <div className="form-row">
                <div className="form-group"><label>Purchase Date</label><input type="date" className="form-control" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
                <div className="form-group"><label>Purchase Cost (USD)</label><input type="number" step="0.01" min="0" className="form-control" value={form.purchase_cost} onChange={e => setForm(f => ({ ...f, purchase_cost: e.target.value }))} /></div>
                <div className="form-group"><label>Salvage Value (USD)</label><input type="number" step="0.01" min="0" className="form-control" value={form.salvage_value} onChange={e => setForm(f => ({ ...f, salvage_value: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Useful Life (years)</label><input type="number" min="1" max="50" className="form-control" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))} /></div>
                <div className="form-group">
                  <label>Depreciation Method</label>
                  <select className="form-control" value={form.depreciation_method}
                    onChange={e => setForm(f => ({ ...f, depreciation_method: e.target.value }))}>
                    <option value="straight_line">Straight Line</option>
                    <option value="declining">Declining Balance</option>
                    <option value="units_of_production">Units of Production</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" rows="2" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editAsset ? 'Save Changes' : 'Create Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
