// src/pages/Fleet/EquipmentAllocation.jsx — Asset allocation to sites/projects

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import { generateTxnCode } from '../../utils/txnCode'
import { exportXLSX } from '../../engine/reportingEngine'
import { auditLog } from '../../engine/auditEngine'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, TabNav, ModalDialog, ModalActions } from '../../components/ui'

const today     = new Date().toISOString().split('T')[0]
const monthStart = today.slice(0, 7) + '-01'

const TABS = ['Active Allocations', 'History', 'By Site']

const BLANK_ALLOC = {
  asset_id: '', site: '', project_id: '', department: '',
  allocated_by: '', start_date: today, end_date: '',
  scheduled_hours: '', notes: '',
}

const BLANK_CLOSE = { actual_hours: '', notes: '' }

// ── helpers ───────────────────────────────────────────────────────────────────

function utilClass(pct) {
  if (pct === null) return ''
  if (pct >= 80) return 'text-green-600 font-semibold'
  if (pct >= 50) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function calcUtil(scheduled, actual) {
  if (!scheduled || Number(scheduled) === 0) return null
  return Math.round((Number(actual) / Number(scheduled)) * 100)
}

// ── component ─────────────────────────────────────────────────────────────────

export default function EquipmentAllocation() {
  const { user }  = useAuth()
  const canEdit   = useCanEdit('fleet', 'vehicles')

  const [allocations, setAllocations] = useState([])
  const [assets,      setAssets]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('Active Allocations')

  // Allocate modal
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [allocForm,      setAllocForm]      = useState(BLANK_ALLOC)
  const [allocSaving,    setAllocSaving]    = useState(false)

  // Close allocation modal
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeTarget,    setCloseTarget]    = useState(null)
  const [closeForm,      setCloseForm]      = useState(BLANK_CLOSE)
  const [closeSaving,    setCloseSaving]    = useState(false)

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [allocRes, assetRes] = await Promise.all([
      supabase.from('equipment_allocations').select('*').order('created_at', { ascending: false }),
      supabase.from('asset_registry').select('id, asset_name, plate_number, asset_code, asset_category, status').order('asset_name'),
    ])
    if (!allocRes.error)  setAllocations(allocRes.data || [])
    if (!assetRes.error)  setAssets(assetRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const active    = allocations.filter(a => a.status === 'active')
  const totalAssets = assets.length
  const allocatedIds = new Set(active.map(a => a.asset_id))
  const availableCount = assets.filter(a => !allocatedIds.has(a.id)).length
  const sitesInUse = new Set(active.map(a => a.site).filter(Boolean)).size
  const schedHoursMonth = allocations
    .filter(a => a.start_date && a.start_date >= monthStart)
    .reduce((s, a) => s + Number(a.scheduled_hours || 0), 0)

  // ── asset lookup helper ────────────────────────────────────────────────────

  function assetLabel(id) {
    const a = assets.find(x => x.id === id)
    if (!a) return id || '—'
    return `${a.asset_name}${a.plate_number ? ` (${a.plate_number})` : ''}`
  }

  // ── tabbed data ────────────────────────────────────────────────────────────

  const activeAllocs    = allocations.filter(a => a.status === 'active')
  const historyAllocs   = allocations.filter(a => a.status !== 'active')

  const bySite = Object.values(
    activeAllocs.reduce((acc, a) => {
      const s = a.site || 'Unknown'
      if (!acc[s]) acc[s] = { site: s, count: 0, scheduled_hours: 0, actual_hours: 0 }
      acc[s].count++
      acc[s].scheduled_hours += Number(a.scheduled_hours || 0)
      acc[s].actual_hours    += Number(a.actual_hours    || 0)
      return acc
    }, {})
  )

  // ── allocate save ──────────────────────────────────────────────────────────

  async function handleAllocSave() {
    if (!allocForm.asset_id) { toast.error('Select an asset'); return }
    if (!allocForm.site.trim()) { toast.error('Site is required'); return }
    if (!allocForm.start_date)  { toast.error('Start date is required'); return }
    setAllocSaving(true)
    try {
      const allocation_no = await generateTxnCode('ALLOC')
      const { data, error } = await supabase.from('equipment_allocations').insert({
        allocation_no,
        asset_id:         allocForm.asset_id,
        site:             allocForm.site.trim(),
        project_id:       allocForm.project_id || null,
        department:       allocForm.department || null,
        allocated_by:     allocForm.allocated_by || user?.email || '',
        start_date:       allocForm.start_date,
        end_date:         allocForm.end_date || null,
        scheduled_hours:  allocForm.scheduled_hours ? Number(allocForm.scheduled_hours) : 0,
        actual_hours:     0,
        status:           'active',
        notes:            allocForm.notes || null,
        created_by:       user?.id || '',
        created_at:       new Date().toISOString(),
      }).select().single()

      if (error) throw error

      // Update asset status to deployed
      await supabase.from('asset_registry').update({ status: 'deployed' }).eq('id', allocForm.asset_id)

      await auditLog({
        module: 'fleet', action: 'CREATE',
        entityType: 'equipment_allocation', entityId: data.id, entityName: allocation_no,
      })

      toast.success(`Allocation ${allocation_no} created`)
      setShowAllocModal(false)
      setAllocForm(BLANK_ALLOC)
      fetchData()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setAllocSaving(false)
    }
  }

  // ── close allocation save ──────────────────────────────────────────────────

  async function handleCloseSave() {
    if (closeForm.actual_hours === '' || closeForm.actual_hours === null || closeForm.actual_hours === undefined) {
      toast.error('Actual hours is required'); return
    }
    setCloseSaving(true)
    try {
      const { error } = await supabase.from('equipment_allocations').update({
        actual_hours: Number(closeForm.actual_hours),
        notes:        closeForm.notes || closeTarget.notes,
        status:       'completed',
        end_date:     today,
        updated_at:   new Date().toISOString(),
      }).eq('id', closeTarget.id)

      if (error) throw error

      // Update asset status back to available
      await supabase.from('asset_registry').update({ status: 'available' }).eq('id', closeTarget.asset_id)

      await auditLog({
        module: 'fleet', action: 'UPDATE',
        entityType: 'equipment_allocation', entityId: closeTarget.id, entityName: closeTarget.allocation_no,
      })

      toast.success('Allocation closed')
      setShowCloseModal(false)
      setCloseTarget(null)
      setCloseForm(BLANK_CLOSE)
      fetchData()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setCloseSaving(false)
    }
  }

  function openClose(row) {
    setCloseTarget(row)
    setCloseForm({ actual_hours: row.actual_hours || '', notes: row.notes || '' })
    setShowCloseModal(true)
  }

  function handleExport() {
    const rows = activeTab === 'History' ? historyAllocs : activeAllocs
    exportXLSX(rows.map(a => {
      const util = calcUtil(a.scheduled_hours, a.actual_hours)
      return {
        'Allocation No':    a.allocation_no,
        'Asset':            assetLabel(a.asset_id),
        'Site':             a.site,
        'Project':          a.project_id,
        'Department':       a.department,
        'Start Date':       a.start_date,
        'End Date':         a.end_date || 'Open',
        'Sched Hours':      a.scheduled_hours,
        'Actual Hours':     a.actual_hours,
        'Utilization %':    util !== null ? `${util}%` : '—',
        'Status':           a.status,
      }
    }), 'Equipment_Allocations')
  }

  // ── shared allocation table ────────────────────────────────────────────────

  function AllocTable({ rows, showCloseBtn = false }) {
    if (rows.length === 0) return (
      <EmptyState icon="place" title="No allocations" subtitle="No records match the current filter" />
    )
    return (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Alloc No','Asset','Site','Project','Start Date','End Date','Sched Hrs','Actual Hrs','Util %','Status',''].map(h => (
                <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(a => {
              const util = calcUtil(a.scheduled_hours, a.actual_hours)
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{a.allocation_no || '—'}</td>
                  <td className="px-3 py-2 font-medium">{assetLabel(a.asset_id)}</td>
                  <td className="px-3 py-2">{a.site}</td>
                  <td className="px-3 py-2 text-xs">{a.project_id || '—'}</td>
                  <td className="px-3 py-2">{a.start_date || '—'}</td>
                  <td className="px-3 py-2">{a.end_date || <span className="text-blue-500">Open</span>}</td>
                  <td className="px-3 py-2 text-right">{a.scheduled_hours ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{a.actual_hours ?? '—'}</td>
                  <td className={`px-3 py-2 text-right ${utilClass(util)}`}>
                    {util !== null ? `${util}%` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.status === 'active'    ? 'bg-green-100 text-green-700' :
                      a.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                      'bg-red-100 text-red-700'
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {showCloseBtn && canEdit && a.status === 'active' && (
                      <button onClick={() => openClose(a)}
                        className="text-red-600 hover:underline text-xs whitespace-nowrap">
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Equipment Allocation"
        subtitle="Allocate assets to sites and projects, track utilization"
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="btn-secondary flex items-center gap-1 text-sm">
              <span className="material-icons text-base">download</span> Export
            </button>
            {canEdit && (
              <button onClick={() => { setAllocForm(BLANK_ALLOC); setShowAllocModal(true) }}
                className="btn-primary flex items-center gap-1 text-sm">
                <span className="material-icons text-base">add</span> Allocate Asset
              </button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Currently Allocated" value={active.length}        icon="place"          color="blue"   />
        <KPICard label="Available Assets"     value={availableCount}       icon="check_circle"   color="green"  />
        <KPICard label="Sites In Use"         value={sitesInUse}           icon="location_city"  color="purple" />
        <KPICard label="Sched Hours (Month)"  value={schedHoursMonth}      icon="schedule"       color="orange" />
      </div>

      {/* Tabs */}
      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          {activeTab === 'Active Allocations' && (
            <AllocTable rows={activeAllocs} showCloseBtn />
          )}

          {activeTab === 'History' && (
            <AllocTable rows={historyAllocs} />
          )}

          {activeTab === 'By Site' && (
            bySite.length === 0
              ? <EmptyState icon="location_city" title="No active allocations" subtitle="Allocate assets to see site groupings" />
              : (
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                      <tr>
                        {['Site','Assets Allocated','Total Sched Hrs','Total Actual Hrs','Utilization %'].map(h => (
                          <th key={h} className="px-3 py-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bySite.sort((a, b) => a.site.localeCompare(b.site)).map(s => {
                        const util = calcUtil(s.scheduled_hours, s.actual_hours)
                        return (
                          <tr key={s.site} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{s.site}</td>
                            <td className="px-3 py-2">{s.count}</td>
                            <td className="px-3 py-2 text-right">{s.scheduled_hours.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right">{s.actual_hours.toFixed(1)}</td>
                            <td className={`px-3 py-2 text-right ${utilClass(util)}`}>
                              {util !== null ? `${util}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </>
      )}

      {/* Allocate Asset Modal */}
      {showAllocModal && (
        <ModalDialog
          open
          title="Allocate Asset"
          onClose={() => setShowAllocModal(false)}
          size="lg"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="label">Asset *</label>
                <select className="input" value={allocForm.asset_id}
                  onChange={e => setAllocForm(f => ({ ...f, asset_id: e.target.value }))}>
                  <option value="">— Select asset —</option>
                  {assets.filter(a => !allocatedIds.has(a.id) && a.status !== 'deployed').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.asset_name}{a.plate_number ? ` (${a.plate_number})` : ''} — {a.status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Site *</label>
                <input className="input" value={allocForm.site}
                  onChange={e => setAllocForm(f => ({ ...f, site: e.target.value }))}
                  placeholder="e.g. Bindura North Mine" />
              </div>
              <div>
                <label className="label">Project ID / Code</label>
                <input className="input" value={allocForm.project_id}
                  onChange={e => setAllocForm(f => ({ ...f, project_id: e.target.value }))} />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={allocForm.department}
                  onChange={e => setAllocForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label className="label">Allocated By</label>
                <input className="input" value={allocForm.allocated_by}
                  onChange={e => setAllocForm(f => ({ ...f, allocated_by: e.target.value }))} />
              </div>
              <div>
                <label className="label">Start Date *</label>
                <input className="input" type="date" value={allocForm.start_date}
                  onChange={e => setAllocForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">End Date (optional)</label>
                <input className="input" type="date" value={allocForm.end_date}
                  onChange={e => setAllocForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Scheduled Hours</label>
                <input className="input" type="number" min="0" value={allocForm.scheduled_hours}
                  onChange={e => setAllocForm(f => ({ ...f, scheduled_hours: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-[60px]" value={allocForm.notes}
                  onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <ModalActions>
            <button className="btn-secondary" onClick={() => setShowAllocModal(false)} disabled={allocSaving}>Cancel</button>
            <button className="btn-primary" onClick={handleAllocSave} disabled={allocSaving}>
              {allocSaving ? 'Saving…' : 'Allocate Asset'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Close Allocation Modal */}
      {showCloseModal && closeTarget && (
        <ModalDialog
          open
          title={`Close Allocation · ${closeTarget.allocation_no || ''}`}
          onClose={() => { setShowCloseModal(false); setCloseTarget(null) }}
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p><span className="font-medium">Asset:</span> {assetLabel(closeTarget.asset_id)}</p>
              <p><span className="font-medium">Site:</span> {closeTarget.site}</p>
              <p><span className="font-medium">Scheduled Hours:</span> {closeTarget.scheduled_hours}</p>
            </div>
            <div>
              <label className="label">Actual Hours *</label>
              <input className="input" type="number" min="0" value={closeForm.actual_hours}
                onChange={e => setCloseForm(f => ({ ...f, actual_hours: e.target.value }))} />
            </div>
            <div>
              <label className="label">Closing Notes</label>
              <textarea className="input min-h-[60px]" value={closeForm.notes}
                onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <ModalActions>
            <button className="btn-secondary" onClick={() => { setShowCloseModal(false); setCloseTarget(null) }} disabled={closeSaving}>Cancel</button>
            <button className="btn-danger" onClick={handleCloseSave} disabled={closeSaving}>
              {closeSaving ? 'Closing…' : 'Close Allocation'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
