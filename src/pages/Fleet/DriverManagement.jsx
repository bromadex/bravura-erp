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

const today = new Date().toISOString().split('T')[0]
const in30   = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

const LICENSE_CLASSES = ['Code 4', 'Code 5', 'Code 8', 'Code 10', 'Code 14', 'EC', 'PDP', 'ZIMDEF Operator']
const STATUSES        = ['active', 'suspended', 'inactive']
const TABS            = ['All', 'Expiring (30 days)', 'Expired', 'Suspended']

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

  const [rows,        setRows]        = useState([])
  const [departments, setDepartments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('All')
  const [showModal,   setShowModal]   = useState(false)
  const [editRecord,  setEditRecord]  = useState(null)
  const [form,        setForm]        = useState(BLANK)
  const [saving,      setSaving]      = useState(false)
  const [search,      setSearch]      = useState('')

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
    <div className="p-6 space-y-5">
      <PageHeader
        title="Driver Management"
        subtitle="Driver register, license tracking and compliance monitoring"
        actions={
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="btn-secondary flex items-center gap-1 text-sm">
              <span className="material-symbols-outlined text-base">download</span> Export
            </button>
            {canEdit && (
              <button onClick={openAdd}
                className="btn-primary flex items-center gap-1 text-sm">
                <span className="material-symbols-outlined text-base">add</span> Add Driver
              </button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <TabNav
          tabs={TABS}
          active={activeTab}
          onChange={setActiveTab}
        />
        <input
          className="input ml-auto w-full sm:w-64"
          placeholder="Search name, license, dept…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="badge" title="No drivers found" subtitle="Add a driver to get started" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                {['Driver No','Name','License No','Classes','License Expiry','PDP Expiry','Medical Expiry','Status',''].map(h => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.driver_no || '—'}</td>
                  <td className="px-3 py-2 font-medium">{r.full_name}</td>
                  <td className="px-3 py-2">{r.license_number || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.license_classes || '—'}</td>
                  <td className={`px-3 py-2 ${expiryClass(r.license_expiry)} ${expiryBg(r.license_expiry)}`}>
                    {fmtDate(r.license_expiry)}
                  </td>
                  <td className={`px-3 py-2 ${expiryClass(r.pdp_expiry)} ${expiryBg(r.pdp_expiry)}`}>
                    {fmtDate(r.pdp_expiry)}
                  </td>
                  <td className={`px-3 py-2 ${expiryClass(r.medical_expiry)} ${expiryBg(r.medical_expiry)}`}>
                    {fmtDate(r.medical_expiry)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'active'    ? 'bg-green-100 text-green-700' :
                      r.status === 'suspended' ? 'bg-red-100 text-red-700' :
                                                 'bg-gray-100 text-gray-600'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <button onClick={() => openEdit(r)}
                        className="text-blue-600 hover:underline text-xs">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <ModalDialog
          title={editRecord ? 'Edit Driver' : 'Add Driver'}
          onClose={closeModal}
          size="xl"
        >
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

            {/* Personal details */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Personal Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">ID Number</label>
                  <input className="input" value={form.id_number}
                    onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Department</label>
                  <select className="input" value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">— Select department —</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Driving License */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Driving License</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">License Number</label>
                  <input className="input" value={form.license_number}
                    onChange={e => setForm(f => ({ ...f, license_number: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Issuing Authority</label>
                  <input className="input" value={form.license_issuing_authority}
                    onChange={e => setForm(f => ({ ...f, license_issuing_authority: e.target.value }))} />
                </div>
                <div>
                  <label className="label">License Expiry</label>
                  <input className="input" type="date" value={form.license_expiry}
                    onChange={e => setForm(f => ({ ...f, license_expiry: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3">
                <label className="label mb-1">License Classes</label>
                <div className="flex flex-wrap gap-2">
                  {LICENSE_CLASSES.map(cls => (
                    <button key={cls} type="button"
                      onClick={() => toggleClass(cls)}
                      className={`px-2 py-1 rounded border text-xs ${
                        selectedClasses.includes(cls)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                      }`}>
                      {cls}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Selected: {form.license_classes || 'None'}</p>
              </div>
            </div>

            {/* PDP */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Professional Driving Permit (PDP)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">PDP Number</label>
                  <input className="input" value={form.pdp_number}
                    onChange={e => setForm(f => ({ ...f, pdp_number: e.target.value }))} />
                </div>
                <div>
                  <label className="label">PDP Expiry</label>
                  <input className="input" type="date" value={form.pdp_expiry}
                    onChange={e => setForm(f => ({ ...f, pdp_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Medical */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Medical Certificate</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Medical Cert No</label>
                  <input className="input" value={form.medical_cert_no}
                    onChange={e => setForm(f => ({ ...f, medical_cert_no: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Medical Expiry</label>
                  <input className="input" type="date" value={form.medical_expiry}
                    onChange={e => setForm(f => ({ ...f, medical_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Additional Certs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Additional Certifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Defensive Driving Cert</label>
                  <input className="input" value={form.defensive_driving_cert}
                    onChange={e => setForm(f => ({ ...f, defensive_driving_cert: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Defensive Driving Expiry</label>
                  <input className="input" type="date" value={form.defensive_driving_expiry}
                    onChange={e => setForm(f => ({ ...f, defensive_driving_expiry: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Operator Cert No (ZIMDEF)</label>
                  <input className="input" value={form.operator_cert_no}
                    onChange={e => setForm(f => ({ ...f, operator_cert_no: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Operator Cert Expiry</label>
                  <input className="input" type="date" value={form.operator_cert_expiry}
                    onChange={e => setForm(f => ({ ...f, operator_cert_expiry: e.target.value }))} />
                </div>
                <div>
                  <label className="label">MHSA Fitness Cert</label>
                  <input className="input" value={form.mhsa_fitness_cert}
                    onChange={e => setForm(f => ({ ...f, mhsa_fitness_cert: e.target.value }))} />
                </div>
                <div>
                  <label className="label">MHSA Fitness Expiry</label>
                  <input className="input" type="date" value={form.mhsa_fitness_expiry}
                    onChange={e => setForm(f => ({ ...f, mhsa_fitness_expiry: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[60px]" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <ModalActions>
            <button className="btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editRecord ? 'Update Driver' : 'Add Driver'}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
