import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useFuel }   from '../../contexts/FuelContext'
import { useAuth }   from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions, AlertBanner } from '../../components/ui'
import TxnCodeBadge  from '../../components/TxnCodeBadge'
import { generateTxnCode } from '../../utils/txnCode'
import { auditLog }  from '../../engine/auditEngine'
import { exportXLSX } from '../../engine/reportingEngine'
import { startWorkflow, approveStep, rejectStep } from '../../engine/workflowEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]
const monthStart = today.slice(0, 7) + '-01'

const STATUS_BADGE = {
  pending:  'badge-yellow',
  approved: 'badge-green',
  rejected: 'badge-red',
  issued:   'badge-teal',
}

const FUEL_TYPES = ['DIESEL', 'PETROL', 'PARAFFIN']
const TABS = ['All', 'Pending', 'Approved', 'Issued', 'Rejected']

const BLANK_REQUEST = {
  requester_name: '', department: '', equipment_name: '', fuel_type: 'DIESEL',
  tank_id: '', requested_qty: '', required_date: '', purpose: '',
  project_id: '', cost_center: '', notes: '', driver_operator: '',
}

const BLANK_APPROVE = { approved_qty: '', tank_id: '', notes: '' }
const BLANK_ISSUE   = { odometer: '', actual_qty: '', attendant: '', notes: '' }

export default function FuelRequests() {
  const { fuelRequests, tanks, addFuelRequest, updateFuelRequest, approveFuelRequest, rejectFuelRequest, addIssuance, fetchAll, getCurrentTankLevel } = useFuel()
  const { user } = useAuth()
  const canEdit   = useCanEdit('fuel', 'requests')
  const canDelete = useCanDelete('fuel', 'requests')

  const [activeTab,   setActiveTab]   = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm,  setSearchTerm]  = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const debounceRef = useRef(null)

  const [showNewModal,    setShowNewModal]    = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showIssueModal,  setShowIssueModal]  = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [selected,        setSelected]        = useState(null)

  const [newForm,     setNewForm]     = useState(BLANK_REQUEST)
  const [approveForm, setApproveForm] = useState(BLANK_APPROVE)
  const [issueForm,   setIssueForm]   = useState(BLANK_ISSUE)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [employees,    setEmployees]    = useState([])
  const [departments,  setDepartments]  = useState([])
  const [assets,       setAssets]       = useState([])

  useEffect(() => {
    supabase.from('employees').select('id,name,employee_number,department_id').neq('status','Terminated').order('name')
      .then(({ data }) => setEmployees(data || []))
    supabase.from('departments').select('id,name').order('name')
      .then(({ data }) => setDepartments(data || []))
    supabase.from('asset_registry').select('id,asset_name,asset_code,plate_number,asset_category').order('asset_name')
      .then(({ data }) => setAssets(data || []))
  }, [])

  const handleSearchChange = (v) => {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchTerm(v), 350)
  }

  const clearFilters = () => {
    setSearchInput(''); setSearchTerm(''); setDateFrom(''); setDateTo(''); setStatusFilter('all')
  }

  const tabStatus = activeTab === 'All' ? null : activeTab.toLowerCase()

  const filtered = fuelRequests.filter(r => {
    if (tabStatus && r.status !== tabStatus) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (dateFrom && r.request_date < dateFrom) return false
    if (dateTo   && r.request_date > dateTo)   return false
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      if (!(
        r.request_no?.toLowerCase().includes(t) ||
        r.equipment_name?.toLowerCase().includes(t) ||
        r.department?.toLowerCase().includes(t) ||
        r.requester_name?.toLowerCase().includes(t)
      )) return false
    }
    return true
  })

  const pendingCount    = fuelRequests.filter(r => r.status === 'pending').length
  const approvedToday   = fuelRequests.filter(r => r.status === 'approved' && r.approved_at?.slice(0, 10) === today).length
  const monthlyLitres   = fuelRequests
    .filter(r => r.request_date >= monthStart)
    .reduce((s, r) => s + (Number(r.requested_qty) || 0), 0)

  const approvedWithTime = fuelRequests.filter(r => r.approved_at && r.request_date)
  const avgApprovalHrs = approvedWithTime.length
    ? Math.round(
        approvedWithTime.reduce((s, r) => {
          const diff = new Date(r.approved_at) - new Date(r.request_date)
          return s + diff / 3600000
        }, 0) / approvedWithTime.length
      )
    : 0

  const openApprove = (r) => {
    setSelected(r)
    setApproveForm({ approved_qty: r.requested_qty || '', tank_id: r.tank_id || tanks[0]?.id || '', notes: '' })
    setShowApproveModal(true)
  }

  const openReject = (r) => {
    setSelected(r)
    setRejectReason('')
    setShowRejectModal(true)
  }

  const openIssue = (r) => {
    setSelected(r)
    setIssueForm({ odometer: '', actual_qty: r.approved_qty || r.requested_qty || '', attendant: user?.full_name || user?.username || '', notes: '' })
    setShowIssueModal(true)
  }

  const handleNewSubmit = async (e) => {
    e.preventDefault()
    if (!newForm.requested_qty || parseFloat(newForm.requested_qty) <= 0) return toast.error('Enter a valid quantity')
    setSubmitting(true)
    try {
      const request_no = await generateTxnCode('FLR')
      await addFuelRequest({
        ...newForm,
        request_no,
        requested_qty: parseFloat(newForm.requested_qty),
        request_date: today,
        requester_id: user?.id || null,
      })
      auditLog({ module: 'fuel', action: 'CREATE', entityType: 'fuel_request', entityName: request_no, userName: user?.full_name || user?.username, txnCode: request_no })
      toast.success(`Request ${request_no} submitted`)
      setShowNewModal(false)
      setNewForm(BLANK_REQUEST)
    } catch (err) { toast.error(err.message) }
    setSubmitting(false)
  }

  const handleApprove = async (e) => {
    e.preventDefault()
    if (!approveForm.approved_qty || parseFloat(approveForm.approved_qty) <= 0) return toast.error('Enter approved quantity')
    const tank = tanks.find(t => t.id === approveForm.tank_id)
    const level = tank ? getCurrentTankLevel(tank.id) : null
    if (tank && level !== null && parseFloat(approveForm.approved_qty) > level) {
      if (!window.confirm(`Tank level is ${level.toLocaleString()} L but you are approving ${approveForm.approved_qty} L. Continue?`)) return
    }
    setSubmitting(true)
    try {
      const approvedBy = user?.full_name || user?.username || ''
      await approveFuelRequest(selected.id, approvedBy)
      await updateFuelRequest(selected.id, {
        approved_qty: parseFloat(approveForm.approved_qty),
        tank_id: approveForm.tank_id || selected.tank_id,
        notes: approveForm.notes || selected.notes,
      })
      try { await approveStep({ entityType: 'fuel_request', entityId: selected.id, approvedBy }) } catch {}
      auditLog({ module: 'fuel', action: 'APPROVE', entityType: 'fuel_request', entityId: selected.id, entityName: selected.request_no, userName: approvedBy })
      toast.success(`Request ${selected.request_no} approved`)
      setShowApproveModal(false)
      setSelected(null)
    } catch (err) { toast.error(err.message) }
    setSubmitting(false)
  }

  const handleReject = async (e) => {
    e.preventDefault()
    if (!rejectReason.trim()) return toast.error('Enter a rejection reason')
    setSubmitting(true)
    try {
      const rejectedBy = user?.full_name || user?.username || ''
      await rejectFuelRequest(selected.id, rejectReason, rejectedBy)
      try { await rejectStep({ entityType: 'fuel_request', entityId: selected.id, rejectedBy, reason: rejectReason }) } catch {}
      auditLog({ module: 'fuel', action: 'REJECT', entityType: 'fuel_request', entityId: selected.id, entityName: selected.request_no, userName: rejectedBy, details: rejectReason })
      toast.success(`Request ${selected.request_no} rejected`)
      setShowRejectModal(false)
      setSelected(null)
    } catch (err) { toast.error(err.message) }
    setSubmitting(false)
  }

  const handleIssue = async (e) => {
    e.preventDefault()
    if (!issueForm.actual_qty || parseFloat(issueForm.actual_qty) <= 0) return toast.error('Enter actual litres issued')
    setSubmitting(true)
    try {
      const issuedBy  = user?.full_name || user?.username || ''
      const issuedAt  = new Date().toISOString()
      const txnCode   = await generateTxnCode('FI')
      await addIssuance({
        date:           today,
        fuel_type:      selected.fuel_type || 'DIESEL',
        amount:         parseFloat(issueForm.actual_qty),
        vehicle:        selected.equipment_name || '',
        driver:         selected.driver_operator || '',
        authorized_by:  selected.approved_by || issuedBy,
        purpose:        selected.purpose || '',
        odometer:       issueForm.odometer || null,
        notes:          issueForm.notes || null,
        tank_id:        selected.tank_id || null,
        project_id:     selected.project_id || null,
        cost_center:    selected.cost_center || null,
        user_name:      issuedBy,
        txn_code:       txnCode,
      })
      await updateFuelRequest(selected.id, {
        status:    'issued',
        issued_at: issuedAt,
        issued_by: issuedBy,
      })
      auditLog({ module: 'fuel', action: 'LOG', entityType: 'fuel_request', entityId: selected.id, entityName: selected.request_no, userName: issuedBy, txnCode })
      toast.success(`Issued ${issueForm.actual_qty} L — ${txnCode}`)
      setShowIssueModal(false)
      setSelected(null)
    } catch (err) { toast.error(err.message) }
    setSubmitting(false)
  }

  const handleExport = () => {
    if (!filtered.length) return toast.error('No records to export')
    exportXLSX(
      filtered.map(r => ({
        'Request No':   r.request_no,
        'Date':         r.request_date,
        'Required By':  r.required_date,
        'Requestor':    r.requester_name,
        'Department':   r.department,
        'Equipment':    r.equipment_name,
        'Driver':       r.driver_operator,
        'Fuel Type':    r.fuel_type,
        'Requested L':  r.requested_qty,
        'Approved L':   r.approved_qty,
        'Status':       r.status,
        'Approved By':  r.approved_by,
        'Purpose':      r.purpose,
      })),
      `FuelRequests_${today}`,
      'Requests'
    )
    toast.success(`Exported ${filtered.length} records`)
  }

  return (
    <div>
      <PageHeader title="Fuel Requests" subtitle="Approval workflow for fuel requisitions">
        <button className="btn btn-secondary" onClick={handleExport}>
          <span className="material-icons">table_chart</span> Export
        </button>
        <button className="btn btn-primary" onClick={() => { setNewForm(BLANK_REQUEST); setShowNewModal(true) }}>
          <span className="material-icons">add</span> New Request
        </button>
      </PageHeader>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Pending Requests"     value={pendingCount}                    sub="awaiting approval" color="yellow" icon="pending" />
        <KPICard label="Approved Today"        value={approvedToday}                   sub="requests"          color="green"  icon="check_circle" />
        <KPICard label="Litres This Month"     value={monthlyLitres.toLocaleString()}  sub="litres requested"  color="teal"   icon="local_gas_station" />
        <KPICard label="Avg Approval Time"     value={avgApprovalHrs ? `${avgApprovalHrs}h` : '—'} sub="hours"    icon="schedule" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Search</label>
            <input className="form-control" placeholder="Request no, equipment, department…"
              value={searchInput} onChange={e => handleSearchChange(e.target.value)} />
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
            <label>Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="issued">Issued</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={clearFilters}>
              <span className="material-icons">clear</span>
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 0 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? 'var(--primary)' : 'var(--text-dim)',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                fontSize: 13, transition: 'all .15s',
              }}>
              {tab}
              {tab === 'Pending' && pendingCount > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--yellow)', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>Request No</th>
                <th>Date / Required</th>
                <th>Requestor / Dept</th>
                <th>Equipment / Driver</th>
                <th>Type</th>
                <th>Requested L</th>
                <th>Approved L</th>
                <th>Status</th>
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <EmptyState icon="local_gas_station" message="No requests match your filters" />
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.request_no ? <TxnCodeBadge code={r.request_no} /> : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    <div>{r.request_date || '—'}</div>
                    {r.required_date && <div style={{ color: 'var(--text-dim)' }}>Due: {r.required_date}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600 }}>{r.requester_name || '—'}</div>
                    <div style={{ color: 'var(--text-dim)' }}>{r.department || '—'}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <div>{r.equipment_name || '—'}</div>
                    {r.driver_operator && <div style={{ color: 'var(--text-dim)' }}>{r.driver_operator}</div>}
                  </td>
                  <td>
                    <span className={`badge ${r.fuel_type === 'DIESEL' ? 'badge-yellow' : r.fuel_type === 'PETROL' ? 'badge-green' : 'badge-blue'}`}>
                      {r.fuel_type || '—'}
                    </span>
                  </td>
                  <td className="td-mono">{r.requested_qty ? `${Number(r.requested_qty).toLocaleString()} L` : '—'}</td>
                  <td className="td-mono" style={{ color: r.approved_qty ? 'var(--teal)' : 'var(--text-dim)' }}>
                    {r.approved_qty ? `${Number(r.approved_qty).toLocaleString()} L` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status] || 'badge-default'}`}>
                      {r.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="td-actions">
                      <div className="btn-group-sm">
                        {r.status === 'pending' && (
                          <>
                            <button className="btn btn-success btn-sm" title="Approve" onClick={() => openApprove(r)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>check</span>
                            </button>
                            <button className="btn btn-danger btn-sm" title="Reject" onClick={() => openReject(r)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>close</span>
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && (
                          <button className="btn btn-primary btn-sm" title="Issue Fuel" onClick={() => openIssue(r)}>
                            <span className="material-icons" style={{ fontSize: 13 }}>local_gas_station</span>
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

      {showNewModal && (
        <ModalDialog open onClose={() => setShowNewModal(false)} title="New Fuel Request" size="lg">
          <form onSubmit={handleNewSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Requestor Name *</label>
                <select className="form-control" required value={newForm.requester_name}
                  onChange={e => {
                    const emp = employees.find(x => x.name === e.target.value)
                    const dept = emp ? (departments.find(d => d.id === emp.department_id)?.name || '') : ''
                    setNewForm(f => ({ ...f, requester_name: e.target.value, department: dept || f.department }))
                  }}>
                  <option value="">— Select requestor —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.name}>
                      {emp.name}{emp.employee_number ? ` (${emp.employee_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Department</label>
                <select className="form-control" value={newForm.department}
                  onChange={e => setNewForm({ ...newForm, department: e.target.value })}>
                  <option value="">— Select department —</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Equipment Name</label>
                <input className="form-control" list="asset-list" placeholder="Type reg / name to search…"
                  value={newForm.equipment_name}
                  onChange={e => setNewForm({ ...newForm, equipment_name: e.target.value })} />
                <datalist id="asset-list">
                  {assets.map(a => (
                    <option key={a.id}
                      value={a.plate_number || a.asset_name}
                      label={`${a.asset_name}${a.plate_number ? ` (${a.plate_number})` : ''} — ${a.asset_category || ''}`} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Driver / Operator</label>
                <select className="form-control" value={newForm.driver_operator}
                  onChange={e => setNewForm({ ...newForm, driver_operator: e.target.value })}>
                  <option value="">— Select driver/operator —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.name}>
                      {emp.name}{emp.employee_number ? ` (${emp.employee_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Fuel Type *</label>
                <select className="form-control" required value={newForm.fuel_type}
                  onChange={e => setNewForm({ ...newForm, fuel_type: e.target.value })}>
                  {FUEL_TYPES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tank</label>
                <select className="form-control" value={newForm.tank_id}
                  onChange={e => setNewForm({ ...newForm, tank_id: e.target.value })}>
                  <option value="">— Select tank —</option>
                  {tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.fuel_type || 'DIESEL'}) — {getCurrentTankLevel(t.id).toLocaleString()} L avail
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Requested Qty (L) *</label>
                <input type="number" className="form-control" required min="1" step="0.1"
                  value={newForm.requested_qty} onChange={e => setNewForm({ ...newForm, requested_qty: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Required By Date</label>
                <input type="date" className="form-control" value={newForm.required_date}
                  onChange={e => setNewForm({ ...newForm, required_date: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <input className="form-control" value={newForm.purpose}
                onChange={e => setNewForm({ ...newForm, purpose: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Project / Cost Centre</label>
                <input className="form-control" placeholder="Project code" value={newForm.project_id}
                  onChange={e => setNewForm({ ...newForm, project_id: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Cost Center</label>
                <input className="form-control" value={newForm.cost_center}
                  onChange={e => setNewForm({ ...newForm, cost_center: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={newForm.notes}
                onChange={e => setNewForm({ ...newForm, notes: e.target.value })} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <span className="material-icons">send</span> Submit Request
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}

      {showApproveModal && selected && (
        <ModalDialog open onClose={() => { setShowApproveModal(false); setSelected(null) }}
          title={`Approve Request · ${selected.request_no}`} size="md">
          <form onSubmit={handleApprove}>
            <div style={{ padding: '10px 0 14px', borderBottom: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', color: 'var(--text-dim)' }}>
                <span>Requestor: <strong style={{ color: 'var(--text)' }}>{selected.requester_name}</strong></span>
                <span>Department: <strong style={{ color: 'var(--text)' }}>{selected.department || '—'}</strong></span>
                <span>Equipment: <strong style={{ color: 'var(--text)' }}>{selected.equipment_name || '—'}</strong></span>
                <span>Fuel Type: <strong style={{ color: 'var(--text)' }}>{selected.fuel_type}</strong></span>
                <span>Requested: <strong style={{ color: 'var(--yellow)' }}>{Number(selected.requested_qty).toLocaleString()} L</strong></span>
                <span>Purpose: <strong style={{ color: 'var(--text)' }}>{selected.purpose || '—'}</strong></span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Approved Qty (L) *</label>
                <input type="number" className="form-control" required min="0.1" step="0.1"
                  value={approveForm.approved_qty}
                  onChange={e => setApproveForm({ ...approveForm, approved_qty: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Draw From Tank *</label>
                <select className="form-control" required value={approveForm.tank_id}
                  onChange={e => setApproveForm({ ...approveForm, tank_id: e.target.value })}>
                  <option value="">— Select tank —</option>
                  {tanks.map(t => {
                    const level = getCurrentTankLevel(t.id)
                    const low   = level < parseFloat(approveForm.approved_qty || 0)
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name} — {level.toLocaleString()} L avail{low ? ' ⚠' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
            {approveForm.tank_id && (() => {
              const tank  = tanks.find(t => t.id === approveForm.tank_id)
              const level = tank ? getCurrentTankLevel(tank.id) : 0
              const pct   = tank?.capacity ? Math.round((level / tank.capacity) * 100) : null
              const qty   = parseFloat(approveForm.approved_qty) || 0
              const insufficient = qty > level
              return (
                <AlertBanner type={insufficient ? 'danger' : 'info'}
                  message={`${tank?.name}: ${level.toLocaleString()} L available${pct !== null ? ` (${pct}%)` : ''}${insufficient ? ` — Insufficient stock for ${qty.toLocaleString()} L` : ''}`} />
              )
            })()}
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={approveForm.notes}
                onChange={e => setApproveForm({ ...approveForm, notes: e.target.value })} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowApproveModal(false); setSelected(null) }}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={submitting}
                onClick={() => { setShowApproveModal(false); openReject(selected) }}>
                <span className="material-icons" style={{ fontSize: 14 }}>close</span> Reject
              </button>
              <button type="submit" className="btn btn-success" disabled={submitting}>
                <span className="material-icons" style={{ fontSize: 14 }}>check</span> Approve
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}

      {showRejectModal && selected && (
        <ModalDialog open onClose={() => { setShowRejectModal(false); setSelected(null) }}
          title={`Reject Request · ${selected.request_no}`} size="sm">
          <form onSubmit={handleReject}>
            <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text-dim)' }}>
              Rejecting request from <strong style={{ color: 'var(--text)' }}>{selected.requester_name}</strong> for{' '}
              <strong style={{ color: 'var(--yellow)' }}>{Number(selected.requested_qty).toLocaleString()} L</strong>.
            </div>
            <div className="form-group">
              <label>Rejection Reason *</label>
              <textarea className="form-control" rows={3} required value={rejectReason}
                onChange={e => setRejectReason(e.target.value)} placeholder="Provide a reason for rejection…" />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowRejectModal(false); setSelected(null) }}>Cancel</button>
              <button type="submit" className="btn btn-danger" disabled={submitting}>
                <span className="material-icons" style={{ fontSize: 14 }}>block</span> Confirm Reject
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}

      {showIssueModal && selected && (
        <ModalDialog open onClose={() => { setShowIssueModal(false); setSelected(null) }}
          title={`Issue Fuel · ${selected.request_no}`} size="md">
          <form onSubmit={handleIssue}>
            <div style={{ padding: '10px 0 14px', borderBottom: '1px solid var(--border)', marginBottom: 14, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', color: 'var(--text-dim)' }}>
                <span>Equipment: <strong style={{ color: 'var(--text)' }}>{selected.equipment_name || '—'}</strong></span>
                <span>Driver: <strong style={{ color: 'var(--text)' }}>{selected.driver_operator || '—'}</strong></span>
                <span>Fuel Type: <strong style={{ color: 'var(--text)' }}>{selected.fuel_type}</strong></span>
                <span>Approved Qty: <strong style={{ color: 'var(--teal)' }}>{Number(selected.approved_qty || selected.requested_qty).toLocaleString()} L</strong></span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Actual Litres Issued *</label>
                <input type="number" className="form-control" required min="0.1" step="0.1"
                  value={issueForm.actual_qty}
                  onChange={e => setIssueForm({ ...issueForm, actual_qty: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Odometer / Hour Meter</label>
                <input type="number" className="form-control" min="0" step="0.1" placeholder="Optional"
                  value={issueForm.odometer}
                  onChange={e => setIssueForm({ ...issueForm, odometer: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Fuel Attendant</label>
              <input className="form-control" value={issueForm.attendant}
                onChange={e => setIssueForm({ ...issueForm, attendant: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-control" rows={2} value={issueForm.notes}
                onChange={e => setIssueForm({ ...issueForm, notes: e.target.value })} />
            </div>
            <ModalActions>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowIssueModal(false); setSelected(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <span className="material-icons">local_gas_station</span> Confirm Issuance
              </button>
            </ModalActions>
          </form>
        </ModalDialog>
      )}
    </div>
  )
}
