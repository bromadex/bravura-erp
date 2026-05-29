// src/pages/Fleet/FleetInspections.jsx — Pre/post-trip and periodic inspection checklists

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import { exportXLSX } from '../../engine/reportingEngine'
import { auditLog } from '../../engine/auditEngine'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

const TABS          = ['Recent', 'Defects', 'By Asset']
const INSP_TYPES    = ['pre-trip', 'post-trip', 'daily', 'weekly', 'monthly']
const ITEM_RESULTS  = ['pass', 'fail', 'N/A']

// ── Inspection checklist definition ──────────────────────────────────────────

const CHECKLIST = [
  { category: 'TYRES', critical: true, items: ['Left Front', 'Right Front', 'Left Rear', 'Right Rear', 'Spare Tyre'] },
  { category: 'LIGHTS', critical: false, items: ['Headlights', 'Tail Lights', 'Brake Lights', 'Indicators', 'Reverse Lights'] },
  { category: 'FLUIDS', critical: false, items: ['Engine Oil', 'Coolant/Water', 'Brake Fluid', 'Power Steering Fluid', 'Fuel Level'] },
  { category: 'BRAKES', critical: true, items: ['Foot Brake', 'Handbrake', 'Brake Condition'] },
  { category: 'SAFETY', critical: true, items: ['Fire Extinguisher', 'First Aid Kit', 'Safety Triangles/Flares', 'Reverse Alarm', 'Seatbelts (all positions)'] },
  { category: 'BODY', critical: false, items: ['Body Damage', 'Windscreen', 'Mirrors (x3)', 'Wipers'] },
  { category: 'STRUCTURAL', critical: true, items: ['ROPS/FOPS Condition (if applicable)', 'Undercarriage/Tracks (if applicable)', 'Load Security'] },
  { category: 'INSTRUMENTS', critical: false, items: ['Horn', 'Warning Gauges', 'Speedometer', 'Hour Meter/Odometer'] },
  { category: 'ELECTRICS', critical: false, items: ['Battery', 'Alternator Warning Light'] },
  { category: 'DOCUMENTS', critical: false, items: ['License Disc', 'Insurance Disc', 'ZINARA Fitness', 'Cross-border Permit (if applicable)'] },
  { category: 'ENGINE', critical: false, items: ['Belts and Hoses', 'Air Filter', 'Engine Condition (abnormal noise/smoke)'] },
  { category: 'GENERAL', critical: false, items: ['Cab Cleanliness', 'Load Area Condition'] },
]

const CRITICAL_CATEGORIES = new Set(CHECKLIST.filter(c => c.critical).map(c => c.category))

function buildBlankItems() {
  return CHECKLIST.flatMap(cat =>
    cat.items.map(item => ({ category: cat.category, item, result: 'pass' }))
  )
}

function computeOverallResult(items) {
  const fails      = items.filter(i => i.result === 'fail')
  const critFails  = fails.filter(i => CRITICAL_CATEGORIES.has(i.category))
  if (critFails.length > 0) return 'fail'
  if (fails.length > 0)     return 'conditional'
  return 'pass'
}

// ── main component ────────────────────────────────────────────────────────────

export default function FleetInspections() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('fleet', 'vehicles')

  const [inspections, setInspections] = useState([])
  const [assets,      setAssets]      = useState([])
  const [employees,   setEmployees]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('Recent')

  // Inspection modal
  const [showModal,   setShowModal]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(null)

  // WO creation modal
  const [showWoModal, setShowWoModal]   = useState(false)
  const [woTarget,    setWoTarget]      = useState(null)
  const [woForm,      setWoForm]        = useState({ description: '', priority: 'medium', assigned_to: '' })
  const [woSaving,    setWoSaving]      = useState(false)

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [inspRes, assetRes, empRes] = await Promise.all([
      supabase.from('vehicle_inspections').select('*').order('inspection_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('asset_registry').select('id, asset_name, plate_number, asset_code, asset_category').order('asset_name'),
      supabase.from('employees').select('id,name').neq('status','Terminated').order('name'),
    ])
    if (!inspRes.error)  setInspections(inspRes.data || [])
    if (!assetRes.error) setAssets(assetRes.data || [])
    if (!empRes.error)   setEmployees(empRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const todayInspections = inspections.filter(i => i.inspection_date === today)
  const passCount  = todayInspections.filter(i => i.overall_result === 'pass').length
  const passRate   = todayInspections.length > 0 ? Math.round((passCount / todayInspections.length) * 100) : null
  const defectsToday = todayInspections.reduce((s, i) => s + (i.defects_found || 0), 0)
  const wosCreated = inspections.filter(i => i.wo_created).length

  // ── helpers ────────────────────────────────────────────────────────────────

  function assetLabel(id) {
    const a = assets.find(x => x.id === id)
    if (!a) return id || '—'
    return `${a.asset_name}${a.plate_number ? ` (${a.plate_number})` : ''}`
  }

  function resultBadge(r) {
    const cls = r === 'pass'        ? 'bg-green-100 text-green-700' :
                r === 'conditional' ? 'bg-yellow-100 text-yellow-700' :
                r === 'fail'        ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{r || '—'}</span>
  }

  // ── open new inspection modal ──────────────────────────────────────────────

  function openNewInspection() {
    setForm({
      asset_id:         '',
      inspection_type:  'pre-trip',
      inspection_date:  today,
      inspection_time:  new Date().toTimeString().slice(0, 5),
      inspector_name:   '',
      driver_operator:  '',
      odometer_reading: '',
      hour_meter:       '',
      defect_notes:     '',
      items:            buildBlankItems(),
    })
    setShowModal(true)
  }

  function setItemResult(category, item, result) {
    setForm(f => ({
      ...f,
      items: f.items.map(i => i.category === category && i.item === item ? { ...i, result } : i),
    }))
  }

  const overallResult   = form ? computeOverallResult(form.items) : 'pass'
  const defectsCount    = form ? form.items.filter(i => i.result === 'fail').length : 0
  const hasAnyFail      = defectsCount > 0

  // ── save inspection ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.asset_id) { toast.error('Select an asset'); return }
    if (!form.inspection_date) { toast.error('Inspection date is required'); return }
    if (overallResult === 'fail' && !form.defect_notes?.trim()) { toast.error('Defect notes are required when inspection fails'); return }
    setSaving(true)
    try {
      let inspection_no
      try { inspection_no = await generateTxnCode('INSP') } catch { inspection_no = null }
      if (!inspection_no) inspection_no = `INSP-${Date.now()}`
      const assetObj = assets.find(a => a.id === form.asset_id)

      const { data, error } = await supabase.from('vehicle_inspections').insert({
        inspection_no,
        asset_id:         form.asset_id,
        asset_name:       assetObj?.asset_name || '',
        inspection_type:  form.inspection_type,
        inspection_date:  form.inspection_date,
        inspection_time:  form.inspection_time || null,
        inspector_name:   form.inspector_name || null,
        driver_operator:  form.driver_operator || null,
        odometer_reading: form.odometer_reading ? Number(form.odometer_reading) : null,
        hour_meter:       form.hour_meter ? Number(form.hour_meter) : null,
        overall_result:   overallResult,
        defects_found:    defectsCount,
        items:            form.items,
        defect_notes:     form.defect_notes || null,
        created_by:       user?.id || '',
        created_at:       new Date().toISOString(),
      }).select().single()

      if (error) throw error

      await auditLog({
        module: 'fleet', action: 'CREATE',
        entityType: 'vehicle_inspection', entityId: data.id, entityName: inspection_no,
      })

      toast.success(`Inspection ${inspection_no} recorded`)
      setShowModal(false)

      if (overallResult === 'fail' || overallResult === 'conditional') {
        setWoTarget(data)
        setWoForm({ description: `Defects found during ${form.inspection_type} inspection of ${assetObj?.asset_name}. Defects: ${form.defect_notes || 'See inspection items.'}`, priority: 'medium', assigned_to: '' })
        setShowWoModal(true)
      }

      fetchData()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── create work order from inspection ─────────────────────────────────────

  async function handleCreateWO() {
    if (!woForm.description.trim()) { toast.error('Description is required'); return }
    setWoSaving(true)
    try {
      let wo_number
      try { wo_number = await generateTxnCode('WO') } catch { wo_number = null }
      if (!wo_number) wo_number = `WO-${Date.now()}`
      const { data, error } = await supabase.from('maintenance_work_orders').insert({
        wo_number,
        asset_id:       woTarget.asset_id,
        asset_name:     woTarget.asset_name,
        description:    woForm.description,
        priority:       woForm.priority,
        assigned_to:    woForm.assigned_to || null,
        status:         'open',
        source:         'inspection',
        source_ref:     woTarget.inspection_no,
        created_by:     user?.id || '',
        created_at:     new Date().toISOString(),
      }).select().single()

      if (error) throw error

      // Link WO to inspection
      await supabase.from('vehicle_inspections').update({ wo_created: wo_number }).eq('id', woTarget.id)

      await auditLog({
        module: 'fleet', action: 'CREATE',
        entityType: 'work_order', entityId: data.id, entityName: wo_number,
      })

      toast.success(`Work Order ${wo_number} created`)
      setShowWoModal(false)
      setWoTarget(null)
      fetchData()
    } catch (e) {
      toast.error(e.message || 'Failed to create WO')
    } finally {
      setWoSaving(false)
    }
  }

  function handleExport() {
    const rows = activeTab === 'Defects'
      ? inspections.filter(i => i.overall_result === 'fail' || (i.defects_found || 0) > 0)
      : inspections
    exportXLSX(rows.map(i => ({
      'Inspection No':  i.inspection_no,
      'Date':           i.inspection_date,
      'Time':           i.inspection_time,
      'Asset':          assetLabel(i.asset_id),
      'Type':           i.inspection_type,
      'Inspector':      i.inspector_name,
      'Driver':         i.driver_operator,
      'Odometer':       i.odometer_reading,
      'Hour Meter':     i.hour_meter,
      'Overall Result': i.overall_result,
      'Defects Found':  i.defects_found,
      'WO Created':     i.wo_created,
      'Defect Notes':   i.defect_notes,
    })), 'Fleet_Inspections')
  }

  // ── tabbed data ────────────────────────────────────────────────────────────

  const recentRows  = inspections.slice(0, 200)
  const defectRows  = inspections.filter(i => i.overall_result === 'fail' || i.overall_result === 'conditional' || (i.defects_found || 0) > 0)

  const byAsset = Object.values(
    inspections.reduce((acc, i) => {
      const id = i.asset_id || 'unknown'
      if (!acc[id]) acc[id] = { asset_id: id, count: 0, last_date: null, last_result: null, total_defects: 0 }
      acc[id].count++
      acc[id].total_defects += i.defects_found || 0
      if (!acc[id].last_date || i.inspection_date > acc[id].last_date) {
        acc[id].last_date   = i.inspection_date
        acc[id].last_result = i.overall_result
      }
      return acc
    }, {})
  )

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Fleet Inspections"
        subtitle="Pre/post-trip and periodic checklists for vehicles and equipment"
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="btn-secondary flex items-center gap-1 text-sm">
              <span className="material-icons text-base">download</span> Export
            </button>
            {canEdit && (
              <button onClick={openNewInspection}
                className="btn-primary flex items-center gap-1 text-sm">
                <span className="material-icons text-base">add</span> New Inspection
              </button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Today's Inspections" value={todayInspections.length} icon="fact_check"    color="blue"   />
        <KPICard label="Pass Rate (Today)"    value={passRate !== null ? `${passRate}%` : '—'}   icon="verified" color="green"  />
        <KPICard label="Defects Found (Today)" value={defectsToday}          icon="warning"       color="red"    />
        <KPICard label="WOs Created"          value={wosCreated}             icon="build"         color="orange" />
      </div>

      {/* Tabs */}
      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          {/* ── Recent tab ── */}
          {activeTab === 'Recent' && (
            recentRows.length === 0
              ? <EmptyState icon="fact_check" title="No inspections yet" subtitle="Record the first inspection to get started" />
              : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                      <tr>
                        {['Insp No','Date','Asset','Type','Inspector','Driver/Operator','Odometer','Result','Defects','WO',''].map(h => (
                          <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentRows.map(i => (
                        <tr key={i.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{i.inspection_no || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{i.inspection_date}{i.inspection_time ? ` ${i.inspection_time}` : ''}</td>
                          <td className="px-3 py-2 font-medium">{assetLabel(i.asset_id)}</td>
                          <td className="px-3 py-2 capitalize">{i.inspection_type}</td>
                          <td className="px-3 py-2">{i.inspector_name || '—'}</td>
                          <td className="px-3 py-2">{i.driver_operator || '—'}</td>
                          <td className="px-3 py-2 text-right">{i.odometer_reading ?? '—'}</td>
                          <td className="px-3 py-2">{resultBadge(i.overall_result)}</td>
                          <td className="px-3 py-2 text-center">{i.defects_found || 0}</td>
                          <td className="px-3 py-2 font-mono text-xs">{i.wo_created || '—'}</td>
                          <td className="px-3 py-2">
                            {canEdit && !i.wo_created && (i.overall_result === 'fail' || i.overall_result === 'conditional') && (
                              <button
                                onClick={() => {
                                  setWoTarget(i)
                                  setWoForm({ description: `Defects from ${i.inspection_type} inspection: ${i.defect_notes || 'See record.'}`, priority: 'medium', assigned_to: '' })
                                  setShowWoModal(true)
                                }}
                                className="text-orange-600 hover:underline text-xs whitespace-nowrap">
                                Create WO
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* ── Defects tab ── */}
          {activeTab === 'Defects' && (
            defectRows.length === 0
              ? <EmptyState icon="check_circle" title="No defects found" subtitle="All inspections are currently passing" />
              : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                      <tr>
                        {['Insp No','Date','Asset','Type','Result','Defects','Defect Notes','WO Created'].map(h => (
                          <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {defectRows.map(i => (
                        <tr key={i.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{i.inspection_no || '—'}</td>
                          <td className="px-3 py-2">{i.inspection_date}</td>
                          <td className="px-3 py-2 font-medium">{assetLabel(i.asset_id)}</td>
                          <td className="px-3 py-2 capitalize">{i.inspection_type}</td>
                          <td className="px-3 py-2">{resultBadge(i.overall_result)}</td>
                          <td className="px-3 py-2 text-center">{i.defects_found || 0}</td>
                          <td className="px-3 py-2 max-w-xs truncate text-xs text-gray-600">{i.defect_notes || '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-green-700">{i.wo_created || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* ── By Asset tab ── */}
          {activeTab === 'By Asset' && (
            byAsset.length === 0
              ? <EmptyState icon="directions_car" title="No inspection records" subtitle="No inspections have been recorded yet" />
              : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                      <tr>
                        {['Asset','Total Inspections','Last Inspection','Last Result','Total Defects'].map(h => (
                          <th key={h} className="px-3 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {byAsset.sort((a, b) => assetLabel(a.asset_id).localeCompare(assetLabel(b.asset_id))).map(a => (
                        <tr key={a.asset_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{assetLabel(a.asset_id)}</td>
                          <td className="px-3 py-2">{a.count}</td>
                          <td className="px-3 py-2">{a.last_date || '—'}</td>
                          <td className="px-3 py-2">{resultBadge(a.last_result)}</td>
                          <td className={`px-3 py-2 ${a.total_defects > 0 ? 'text-red-600 font-semibold' : ''}`}>
                            {a.total_defects}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </>
      )}

      {/* ── New Inspection Modal ── */}
      {showModal && form && (
        <ModalDialog
          open
          title="New Inspection"
          onClose={() => setShowModal(false)}
          size="xl"
        >
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">

            {/* Header fields */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Inspection Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="label">Asset *</label>
                  <select className="input" value={form.asset_id}
                    onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))}>
                    <option value="">— Select asset —</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.asset_name}{a.plate_number ? ` (${a.plate_number})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Inspection Type</label>
                  <select className="input" value={form.inspection_type}
                    onChange={e => setForm(f => ({ ...f, inspection_type: e.target.value }))}>
                    {INSP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" value={form.inspection_date}
                    onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Time</label>
                  <input className="input" type="time" value={form.inspection_time}
                    onChange={e => setForm(f => ({ ...f, inspection_time: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Inspector Name</label>
                  <select className="input" value={form.inspector_name}
                    onChange={e => setForm(f => ({ ...f, inspector_name: e.target.value }))}>
                    <option value="">— Select inspector —</option>
                    {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Driver / Operator</label>
                  <select className="input" value={form.driver_operator}
                    onChange={e => setForm(f => ({ ...f, driver_operator: e.target.value }))}>
                    <option value="">— Select driver/operator —</option>
                    {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Odometer Reading</label>
                  <input className="input" type="number" value={form.odometer_reading}
                    onChange={e => setForm(f => ({ ...f, odometer_reading: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Hour Meter</label>
                  <input className="input" type="number" value={form.hour_meter}
                    onChange={e => setForm(f => ({ ...f, hour_meter: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Inspection Checklist</h3>
              <div className="space-y-4">
                {CHECKLIST.map(cat => (
                  <div key={cat.category}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${cat.critical ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                        {cat.category}{cat.critical ? ' ★' : ''}
                      </span>
                      {cat.critical && <span className="text-xs text-red-500">Critical — failure causes overall FAIL</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                      {cat.items.map(item => {
                        const current = form.items.find(i => i.category === cat.category && i.item === item)?.result || 'pass'
                        return (
                          <div key={item} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                            <span className="text-xs text-gray-700 flex-1 mr-2">{item}</span>
                            <div className="flex gap-1">
                              {ITEM_RESULTS.map(r => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setItemResult(cat.category, item, r)}
                                  className={`px-1.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                                    current === r
                                      ? r === 'pass' ? 'bg-green-500 text-white border-green-500'
                                        : r === 'fail' ? 'bg-red-500 text-white border-red-500'
                                        : 'bg-gray-400 text-white border-gray-400'
                                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Overall result preview */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded border">
              <span className="text-sm font-medium text-gray-600">Overall Result:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                overallResult === 'pass'        ? 'bg-green-100 text-green-700' :
                overallResult === 'conditional' ? 'bg-yellow-100 text-yellow-700' :
                                                   'bg-red-100 text-red-700'
              }`}>
                {overallResult.toUpperCase()}
              </span>
              {defectsCount > 0 && <span className="text-sm text-red-600">{defectsCount} item(s) failed</span>}
            </div>

            {/* Defect notes */}
            {hasAnyFail && (
              <div>
                <label className="label">Defect Notes</label>
                <textarea className="input min-h-[80px]" value={form.defect_notes}
                  onChange={e => setForm(f => ({ ...f, defect_notes: e.target.value }))}
                  placeholder="Describe defects found…" />
              </div>
            )}
          </div>

          <ModalActions>
            <button className="btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Submit Inspection'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* ── Create Work Order Modal ── */}
      {showWoModal && woTarget && (
        <ModalDialog
          open
          title={`Create Work Order · ${woTarget.inspection_no || ''}`}
          onClose={() => { setShowWoModal(false); setWoTarget(null) }}
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded p-3 text-sm text-orange-800">
              <strong>Defects found</strong> during {woTarget.inspection_type} inspection of{' '}
              {assetLabel(woTarget.asset_id)}. Create a Work Order to schedule repairs.
            </div>
            <div>
              <label className="label">Description *</label>
              <textarea className="input min-h-[80px]" value={woForm.description}
                onChange={e => setWoForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Priority</label>
                <select className="input" value={woForm.priority}
                  onChange={e => setWoForm(f => ({ ...f, priority: e.target.value }))}>
                  {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assign To</label>
                <select className="input" value={woForm.assigned_to}
                  onChange={e => setWoForm(f => ({ ...f, assigned_to: e.target.value }))}>
                  <option value="">— Select technician —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <ModalActions>
            <button className="btn-secondary" onClick={() => { setShowWoModal(false); setWoTarget(null) }} disabled={woSaving}>
              Skip
            </button>
            <button className="btn-primary" onClick={handleCreateWO} disabled={woSaving}>
              {woSaving ? 'Creating…' : 'Create Work Order'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
