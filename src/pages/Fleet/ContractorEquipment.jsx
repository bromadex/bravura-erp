// src/pages/Fleet/ContractorEquipment.jsx
// Contractor (hired) equipment management — register, daily usage logs, billing.

import { useState, useEffect, useMemo } from 'react'
import { useContractor, calcDailyCharge } from '../../contexts/ContractorContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const EQUIPMENT_TYPES = ['Excavator','Bulldozer','Grader','Front Loader','Dump Truck','Crane','Compactor','Water Bowser','Drill Rig','Generator Set','Compressor','Forklift','Roller','Other']
const RATE_TYPES      = [{ v: 'hourly', l: 'Hourly' }, { v: 'daily', l: 'Daily' }, { v: 'monthly', l: 'Monthly' }]
const CYCLES          = [{ v: 'weekly', l: 'Weekly' }, { v: 'biweekly', l: 'Bi-weekly' }, { v: 'monthly', l: 'Monthly' }]

const STATUS_COLORS = {
  draft:     'var(--text-dim)',
  submitted: 'var(--gold)',
  pending:   'var(--gold)',
  approved:  'var(--green)',
  rejected:  'var(--red)',
  cancelled: 'var(--text-dim)',
}

const fmt  = (n) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtH = (n) => `${(n || 0).toFixed(1)} hrs`
const today = () => new Date().toISOString().split('T')[0]
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }

const BLANK_EQ = {
  contractor_name: '', equipment_type: '', equipment_description: '', registration: '',
  assigned_project: '', rate_type: 'hourly', rate_amount: '', currency: 'USD',
  contract_start: '', contract_end: '', invoice_cycle: 'monthly',
  status: 'Active', contact_person: '', contact_phone: '', notes: '',
}

const BLANK_LOG = {
  equipment_id: '', date: today(), start_hours: '', end_hours: '',
  hours_worked: '', activity_description: '', operator_name: '', supervisor_name: '',
}

export default function ContractorEquipment() {
  const {
    equipment, usageLogs, loading, fetchAll,
    addEquipment, updateEquipment, deleteEquipment,
    addUsageLog, updateUsageLog, deleteUsageLog,
    submitUsageLog, approveUsageLog, rejectUsageLog, cancelUsageLog,
    postInvoiceToAccounts, getEquipmentLogs, getPendingCharge, getBilledCharge,
  } = useContractor()
  const { user } = useAuth()
  const canEdit   = useCanEdit('fleet',   'contractor-equipment')
  const canDelete = useCanDelete('fleet', 'contractor-equipment')

  const [tab,            setTab]            = useState('equipment')
  const [eqModal,        setEqModal]        = useState(false)
  const [editingEq,      setEditingEq]      = useState(null)
  const [eqForm,         setEqForm]         = useState({ ...BLANK_EQ })
  const [logModal,       setLogModal]       = useState(false)
  const [editingLog,     setEditingLog]      = useState(null)
  const [logForm,        setLogForm]        = useState({ ...BLANK_LOG })
  const [filterEq,       setFilterEq]       = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterFrom,     setFilterFrom]     = useState(monthStart())
  const [filterTo,       setFilterTo]       = useState(today())
  const [rejectModal,    setRejectModal]    = useState(null)   // logId
  const [rejectReason,   setRejectReason]   = useState('')
  const [billingModal,   setBillingModal]   = useState(null)   // equipmentId
  const [accounts,       setAccounts]       = useState([])
  const [billingForm,    setBillingForm]    = useState({ periodStart: monthStart(), periodEnd: today(), debitAccountId: '', creditAccountId: '', notes: '' })
  const [posting,        setPosting]        = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [employees,      setEmployees]      = useState([])

  useEffect(() => {
    supabase.from('employees').select('id, name, employee_number').neq('status', 'Terminated').order('name')
      .then(({ data }) => { if (data) setEmployees(data) })
    supabase.from('accounts').select('id, code, name, type').order('code')
      .then(({ data }) => { if (data) setAccounts(data) })
  }, [])

  // ── Equipment modal ───────────────────────────────────────────────────────
  const openEqModal = (eq = null) => {
    setEditingEq(eq)
    setEqForm(eq ? { ...BLANK_EQ, ...eq } : { ...BLANK_EQ })
    setEqModal(true)
  }

  const handleEqSubmit = async (e) => {
    e.preventDefault()
    if (!eqForm.contractor_name || !eqForm.equipment_type || !eqForm.rate_amount)
      return toast.error('Contractor, type and rate are required')
    try {
      if (editingEq) {
        await updateEquipment(editingEq.id, eqForm)
        toast.success('Equipment updated')
      } else {
        const code = await addEquipment(eqForm)
        toast.success(`Equipment added — ${code}`)
      }
      setEqModal(false)
    } catch (err) { toast.error(err.message) }
  }

  // ── Log modal ─────────────────────────────────────────────────────────────
  const openLogModal = (log = null, presetEquipId = null) => {
    setEditingLog(log)
    if (log) {
      setLogForm({ equipment_id: log.equipment_id, date: log.date, start_hours: log.start_hours ?? '', end_hours: log.end_hours ?? '', hours_worked: log.hours_worked ?? '', activity_description: log.activity_description || '', operator_name: log.operator_name || '', supervisor_name: log.supervisor_name || '' })
    } else {
      setLogForm({ ...BLANK_LOG, equipment_id: presetEquipId || '', supervisor_name: user?.full_name || '' })
    }
    setLogModal(true)
  }

  const eq4log = useMemo(() => equipment.find(e => e.id === logForm.equipment_id), [logForm.equipment_id, equipment])
  const previewCharge = useMemo(() => {
    if (!eq4log) return 0
    const hrs = logForm.hours_worked !== '' ? parseFloat(logForm.hours_worked)
      : Math.max(0, (parseFloat(logForm.end_hours) || 0) - (parseFloat(logForm.start_hours) || 0))
    return calcDailyCharge(eq4log.rate_type, eq4log.rate_amount, hrs, logForm.date)
  }, [eq4log, logForm])

  const handleLogSubmit = async (e) => {
    e.preventDefault()
    if (!logForm.equipment_id || !logForm.date) return toast.error('Equipment and date required')
    try {
      if (editingLog) {
        await updateUsageLog(editingLog.id, logForm)
        toast.success('Log updated')
      } else {
        const code = await addUsageLog(logForm)
        toast.success(`Usage logged — ${code}`)
      }
      setLogModal(false)
    } catch (err) { toast.error(err.message) }
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  const handleSubmit = async (logId) => {
    setSubmitting(logId)
    try { await submitUsageLog(logId) }
    catch (err) { toast.error(err.message) }
    finally { setSubmitting(null) }
  }

  const handleApprove = async (logId) => {
    try { await approveUsageLog(logId) }
    catch (err) { toast.error(err.message) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return toast.error('Reason required')
    try {
      await rejectUsageLog(rejectModal, rejectReason)
      setRejectModal(null); setRejectReason('')
    } catch (err) { toast.error(err.message) }
  }

  // ── Billing ───────────────────────────────────────────────────────────────
  const billingEq = useMemo(() => {
    if (!billingModal) return null
    return equipment.find(e => e.id === billingModal)
  }, [billingModal, equipment])

  const billingLogs = useMemo(() => {
    if (!billingModal) return []
    return usageLogs.filter(l =>
      l.equipment_id === billingModal &&
      l.status === 'approved' &&
      l.date >= billingForm.periodStart &&
      l.date <= billingForm.periodEnd &&
      !l.journal_entry_ref
    )
  }, [billingModal, usageLogs, billingForm.periodStart, billingForm.periodEnd])

  const billingTotal = billingLogs.reduce((s, l) => s + (l.daily_charge || 0), 0)
  const billingHours = billingLogs.reduce((s, l) => s + (l.hours_worked || 0), 0)

  const handlePostInvoice = async () => {
    if (!billingForm.debitAccountId || !billingForm.creditAccountId)
      return toast.error('Select both expense and AP accounts')
    setPosting(true)
    try {
      const { ci_code, total } = await postInvoiceToAccounts({ equipmentId: billingModal, ...billingForm })
      toast.success(`Invoice posted — ${ci_code} · ${fmt(total)}`)
      setBillingModal(null)
    } catch (err) { toast.error(err.message) }
    finally { setPosting(false) }
  }

  // ── Filtered logs ─────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => usageLogs.filter(l => {
    if (filterEq     && l.equipment_id !== filterEq) return false
    if (filterStatus && l.status       !== filterStatus) return false
    if (filterFrom   && l.date         <  filterFrom) return false
    if (filterTo     && l.date         >  filterTo) return false
    return true
  }), [usageLogs, filterEq, filterStatus, filterFrom, filterTo])

  // ── Billing summary rows ──────────────────────────────────────────────────
  const billingSummary = useMemo(() => equipment.map(eq => {
    const logs     = usageLogs.filter(l => l.equipment_id === eq.id)
    const approved = logs.filter(l => l.status === 'approved')
    const billed   = logs.filter(l => l.journal_entry_ref)
    const pending  = logs.filter(l => !['approved','cancelled','rejected'].includes(l.status))
    return {
      eq,
      approvedHours:  approved.reduce((s, l) => s + (l.hours_worked || 0), 0),
      approvedAmount: approved.reduce((s, l) => s + (l.daily_charge  || 0), 0),
      unbilledAmount: approved.filter(l => !l.journal_entry_ref).reduce((s, l) => s + (l.daily_charge || 0), 0),
      billedAmount:   billed.reduce((s, l) => s + (l.daily_charge   || 0), 0),
      pendingLogs:    pending.length,
    }
  }), [equipment, usageLogs])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Contractor Equipment">
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && tab === 'logs' && (
            <button className="btn btn-secondary" onClick={() => openLogModal()}>
              <span className="material-icons">timer</span> Log Usage
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={() => openEqModal()}>
              <span className="material-icons">add</span> Add Equipment
            </button>
          )}
        </div>
      </PageHeader>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['equipment','inventory_2','Hired Equipment'], ['logs','timer','Usage Logs'], ['billing','receipt_long','Billing']].map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 16px', fontSize: 13, fontWeight: tab === id ? 700 : 400,
            color: tab === id ? 'var(--gold)' : 'var(--text-dim)',
            borderBottom: tab === id ? '2px solid var(--gold)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ── TAB: EQUIPMENT REGISTER ──────────────────────────────────────────── */}
      {tab === 'equipment' && (
        <>
          {loading ? (
            <EmptyState icon="hourglass_empty" message="Loading…" />
          ) : equipment.length === 0 ? (
            <EmptyState icon="construction" message="No contractor equipment registered yet" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {equipment.map(eq => {
                const pendingAmt = getPendingCharge(eq.id)
                const billedAmt  = getBilledCharge(eq.id)
                const isExpired  = eq.contract_end && eq.contract_end < today()
                return (
                  <div key={eq.id} className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{eq.ce_code}</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{eq.equipment_type}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{eq.equipment_description}</div>
                      </div>
                      <StatusBadge status={isExpired ? 'Expired' : eq.status} />
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      <strong>Contractor:</strong> {eq.contractor_name}
                    </div>
                    {eq.registration && <div style={{ fontSize: 12 }}><strong>Reg:</strong> {eq.registration}</div>}
                    {eq.assigned_project && <div style={{ fontSize: 12 }}><strong>Project:</strong> {eq.assigned_project}</div>}
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <strong>Rate:</strong> {fmt(eq.rate_amount)}/{eq.rate_type} · {eq.invoice_cycle} invoicing
                    </div>
                    {(eq.contract_start || eq.contract_end) && (
                      <div style={{ fontSize: 11, color: isExpired ? 'var(--red)' : 'var(--text-dim)', marginTop: 2 }}>
                        📅 {eq.contract_start || '—'} → {eq.contract_end || '—'}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div><div style={{ color: 'var(--text-dim)' }}>Unbilled</div><strong style={{ color: 'var(--gold)' }}>{fmt(pendingAmt)}</strong></div>
                      <div><div style={{ color: 'var(--text-dim)' }}>Billed</div><strong style={{ color: 'var(--green)' }}>{fmt(billedAmt)}</strong></div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setTab('logs'); setFilterEq(eq.id) }} title="View logs">
                        <span className="material-icons" style={{ fontSize: 14 }}>list</span>
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setBillingForm(f => ({ ...f, periodStart: monthStart(), periodEnd: today() })); setBillingModal(eq.id); setTab('billing') }} title="Billing">
                        <span className="material-icons" style={{ fontSize: 14 }}>receipt_long</span>
                      </button>
                      {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => openEqModal(eq)} title="Edit"><span className="material-icons" style={{ fontSize: 14 }}>edit</span></button>}
                      {canDelete && <button className="btn btn-danger btn-sm" onClick={async () => { if (window.confirm(`Delete ${eq.ce_code}?`)) { try { await deleteEquipment(eq.id); toast.success('Deleted') } catch (err) { toast.error(err.message) } } }} title="Delete"><span className="material-icons" style={{ fontSize: 14 }}>delete</span></button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: USAGE LOGS ─────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <select className="form-control" style={{ width: 220 }} value={filterEq} onChange={e => setFilterEq(e.target.value)}>
              <option value="">All Equipment</option>
              {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.ce_code} — {eq.contractor_name} ({eq.equipment_type})</option>)}
            </select>
            <select className="form-control" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft','submitted','pending','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
            <input type="date" className="form-control" style={{ width: 150 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            <span style={{ alignSelf: 'center', color: 'var(--text-dim)' }}>to</span>
            <input type="date" className="form-control" style={{ width: 150 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterEq(''); setFilterStatus(''); setFilterFrom(monthStart()); setFilterTo(today()) }}>Reset</button>
          </div>

          {filteredLogs.length === 0 ? (
            <EmptyState icon="timer_off" message="No usage logs match the filter" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>Code</th><th>Date</th><th>Equipment</th><th>Contractor</th>
                  <th>Operator</th><th style={{ textAlign: 'right' }}>Hours</th>
                  <th style={{ textAlign: 'right' }}>Charge</th><th>Status</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const eq = equipment.find(e => e.id === log.equipment_id)
                    const statusColor = STATUS_COLORS[log.status] || 'var(--text-dim)'
                    return (
                      <tr key={log.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)' }}>{log.cu_code}</td>
                        <td>{log.date}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{eq?.equipment_type || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{eq?.registration}</div>
                        </td>
                        <td style={{ fontSize: 12 }}>{eq?.contractor_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{log.operator_name || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {fmtH(log.hours_worked)}
                          {log.start_hours != null && log.end_hours != null && (
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{log.start_hours}→{log.end_hours}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                          {fmt(log.daily_charge)}
                          {log.journal_entry_ref && (
                            <div style={{ fontSize: 10, color: 'var(--green)' }}>✓ {log.journal_entry_ref}</div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: `${statusColor}18`, padding: '2px 8px', borderRadius: 10, border: `1px solid ${statusColor}44` }}>
                            {log.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {log.status === 'draft' && canEdit && (
                              <>
                                <button className="btn btn-secondary btn-sm" onClick={() => openLogModal(log)} title="Edit"><span className="material-icons" style={{ fontSize: 13 }}>edit</span></button>
                                <button className="btn btn-primary btn-sm" disabled={submitting === log.id} onClick={() => handleSubmit(log.id)} title="Submit for approval"><span className="material-icons" style={{ fontSize: 13 }}>send</span></button>
                                {canDelete && <button className="btn btn-danger btn-sm" onClick={async () => { try { await deleteUsageLog(log.id); toast.success('Deleted') } catch (err) { toast.error(err.message) } }} title="Delete"><span className="material-icons" style={{ fontSize: 13 }}>delete</span></button>}
                              </>
                            )}
                            {['submitted','pending'].includes(log.status) && canEdit && (
                              <>
                                <button className="btn btn-primary btn-sm" onClick={() => handleApprove(log.id)} title="Approve"><span className="material-icons" style={{ fontSize: 13 }}>check</span></button>
                                <button className="btn btn-danger btn-sm" onClick={() => { setRejectModal(log.id); setRejectReason('') }} title="Reject"><span className="material-icons" style={{ fontSize: 13 }}>close</span></button>
                              </>
                            )}
                            {log.status === 'draft' && !canEdit && (
                              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Awaiting submission</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary strip */}
          {filteredLogs.length > 0 && (
            <div style={{ display: 'flex', gap: 24, padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, marginTop: 12, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Total Hours: </span><strong>{fmtH(filteredLogs.reduce((s,l) => s+(l.hours_worked||0), 0))}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Total Charge: </span><strong style={{ color: 'var(--gold)' }}>{fmt(filteredLogs.reduce((s,l) => s+(l.daily_charge||0), 0))}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Approved: </span><strong style={{ color: 'var(--green)' }}>{fmt(filteredLogs.filter(l=>l.status==='approved').reduce((s,l) => s+(l.daily_charge||0), 0))}</strong></div>
              <div><span style={{ color: 'var(--text-dim)' }}>Billed: </span><strong style={{ color: 'var(--teal)' }}>{fmt(filteredLogs.filter(l=>l.journal_entry_ref).reduce((s,l) => s+(l.daily_charge||0), 0))}</strong></div>
            </div>
          )}
        </>
      )}

      {/* ── TAB: BILLING ────────────────────────────────────────────────────── */}
      {tab === 'billing' && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Equipment</th><th>Contractor</th><th>Project</th><th>Rate</th>
                <th style={{ textAlign: 'right' }}>Approved Hrs</th>
                <th style={{ textAlign: 'right' }}>Unbilled</th>
                <th style={{ textAlign: 'right' }}>Billed</th>
                <th>Pending Logs</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {billingSummary.map(({ eq, approvedHours, unbilledAmount, billedAmount, pendingLogs }) => (
                  <tr key={eq.id}>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--gold)' }}>{eq.ce_code}</div>
                      <div style={{ fontWeight: 600 }}>{eq.equipment_type}</div>
                      {eq.registration && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{eq.registration}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>{eq.contractor_name}</td>
                    <td style={{ fontSize: 12 }}>{eq.assigned_project || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{fmt(eq.rate_amount)}/{eq.rate_type}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtH(approvedHours)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: unbilledAmount > 0 ? 'var(--gold)' : 'var(--text-dim)' }}>{fmt(unbilledAmount)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(billedAmount)}</td>
                    <td>
                      {pendingLogs > 0 && (
                        <span style={{ fontSize: 11, background: 'rgba(251,191,36,.15)', color: 'var(--gold)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(251,191,36,.3)' }}>
                          {pendingLogs} in workflow
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setTab('logs'); setFilterEq(eq.id) }} title="View logs">
                          <span className="material-icons" style={{ fontSize: 13 }}>list</span>
                        </button>
                        {unbilledAmount > 0 && canEdit && (
                          <button className="btn btn-primary btn-sm" onClick={() => {
                            setBillingModal(eq.id)
                            setBillingForm(f => ({ ...f, periodStart: monthStart(), periodEnd: today(), debitAccountId: '', creditAccountId: '' }))
                          }} title="Post to Accounts">
                            <span className="material-icons" style={{ fontSize: 13 }}>account_balance</span> Post
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Equipment Add/Edit */}
      <ModalDialog open={eqModal} onClose={() => setEqModal(false)} title={`${editingEq ? 'Edit' : 'Register'} Contractor Equipment`}>
        <form onSubmit={handleEqSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Contractor Name *</label>
              <input className="form-control" required value={eqForm.contractor_name} onChange={e => setEqForm(f => ({ ...f, contractor_name: e.target.value }))} placeholder="e.g. Zimtrac Mining Services" />
            </div>
            <div className="form-group">
              <label>Equipment Type *</label>
              <select className="form-control" required value={eqForm.equipment_type} onChange={e => setEqForm(f => ({ ...f, equipment_type: e.target.value }))}>
                <option value="">— Select type —</option>
                {EQUIPMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Description / Model</label>
              <input className="form-control" value={eqForm.equipment_description} onChange={e => setEqForm(f => ({ ...f, equipment_description: e.target.value }))} placeholder="e.g. Cat 336 Excavator" />
            </div>
            <div className="form-group">
              <label>Registration / Serial</label>
              <input className="form-control" value={eqForm.registration} onChange={e => setEqForm(f => ({ ...f, registration: e.target.value.toUpperCase() }))} placeholder="e.g. ABC 123Z" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Assigned Project</label>
              <input className="form-control" value={eqForm.assigned_project} onChange={e => setEqForm(f => ({ ...f, assigned_project: e.target.value }))} placeholder="e.g. Box Cut Phase 2" />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={eqForm.status} onChange={e => setEqForm(f => ({ ...f, status: e.target.value }))}>
                <option>Active</option><option>Suspended</option><option>Completed</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Rate Type *</label>
              <select className="form-control" required value={eqForm.rate_type} onChange={e => setEqForm(f => ({ ...f, rate_type: e.target.value }))}>
                {RATE_TYPES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Rate Amount (USD) *</label>
              <input type="number" min="0" step="0.01" className="form-control" required value={eqForm.rate_amount} onChange={e => setEqForm(f => ({ ...f, rate_amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Contract Start</label>
              <input type="date" className="form-control" value={eqForm.contract_start} onChange={e => setEqForm(f => ({ ...f, contract_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Contract End</label>
              <input type="date" className="form-control" value={eqForm.contract_end} onChange={e => setEqForm(f => ({ ...f, contract_end: e.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Invoice Cycle</label>
              <select className="form-control" value={eqForm.invoice_cycle} onChange={e => setEqForm(f => ({ ...f, invoice_cycle: e.target.value }))}>
                {CYCLES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Contact Person</label>
              <input className="form-control" value={eqForm.contact_person} onChange={e => setEqForm(f => ({ ...f, contact_person: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={eqForm.notes} onChange={e => setEqForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setEqModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Equipment</button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* Usage Log Add/Edit */}
      <ModalDialog open={logModal} onClose={() => setLogModal(false)} title={`${editingLog ? 'Edit' : 'Log'} Usage`}>
        <form onSubmit={handleLogSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Equipment *</label>
              <select className="form-control" required value={logForm.equipment_id} onChange={e => setLogForm(f => ({ ...f, equipment_id: e.target.value }))}>
                <option value="">— Select equipment —</option>
                {equipment.filter(e => e.status === 'Active').map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.ce_code} — {eq.contractor_name} / {eq.equipment_type}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input type="date" className="form-control" required value={logForm.date} onChange={e => setLogForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          {eq4log && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              Rate: <strong>{fmt(eq4log.rate_amount)}/{eq4log.rate_type}</strong>
              {previewCharge > 0 && <span style={{ marginLeft: 12 }}>Estimated charge: <strong style={{ color: 'var(--gold)' }}>{fmt(previewCharge)}</strong></span>}
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Start Hours</label>
              <input type="number" step="0.1" className="form-control" value={logForm.start_hours} onChange={e => setLogForm(f => ({ ...f, start_hours: e.target.value, hours_worked: '' }))} placeholder="0.0" />
            </div>
            <div className="form-group">
              <label>End Hours</label>
              <input type="number" step="0.1" className="form-control" value={logForm.end_hours} onChange={e => setLogForm(f => ({ ...f, end_hours: e.target.value, hours_worked: '' }))} placeholder="0.0" />
            </div>
            <div className="form-group">
              <label>Hours Worked (override)</label>
              <input type="number" step="0.1" className="form-control" value={logForm.hours_worked} onChange={e => setLogForm(f => ({ ...f, hours_worked: e.target.value }))} placeholder="Auto-calculated" />
            </div>
          </div>
          <div className="form-group">
            <label>Activity Description</label>
            <textarea className="form-control" rows={2} value={logForm.activity_description} onChange={e => setLogForm(f => ({ ...f, activity_description: e.target.value }))} placeholder="What work was performed?" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Operator</label>
              <select className="form-control" value={logForm.operator_id || ''} onChange={e => {
                const emp = employees.find(x => x.id === e.target.value)
                setLogForm(f => ({ ...f, operator_id: e.target.value, operator_name: emp?.name || '' }))
              }}>
                <option value="">— Select or type below —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
              </select>
              <input className="form-control" style={{ marginTop: 4 }} value={logForm.operator_name} onChange={e => setLogForm(f => ({ ...f, operator_name: e.target.value, operator_id: '' }))} placeholder="Or enter name manually" />
            </div>
            <div className="form-group">
              <label>Supervisor</label>
              <input className="form-control" value={logForm.supervisor_name} onChange={e => setLogForm(f => ({ ...f, supervisor_name: e.target.value }))} placeholder="Authorizing supervisor" />
            </div>
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setLogModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Log</button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* Reject modal */}
      {rejectModal && (
        <ModalDialog open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Usage Log">
          <div className="form-group">
            <label>Reason for Rejection *</label>
            <textarea className="form-control" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why this log is being rejected…" autoFocus />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Rejection</button>
          </ModalActions>
        </ModalDialog>
      )}

      {/* Post to Accounts modal */}
      {billingModal && billingEq && (
        <ModalDialog open={!!billingModal} onClose={() => setBillingModal(null)} title="Post Invoice to Accounts">
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{billingEq.ce_code} — {billingEq.contractor_name}</div>
            <div style={{ fontSize: 13 }}>{billingEq.equipment_type} {billingEq.registration ? `(${billingEq.registration})` : ''}</div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Period Start</label>
              <input type="date" className="form-control" value={billingForm.periodStart} onChange={e => setBillingForm(f => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Period End</label>
              <input type="date" className="form-control" value={billingForm.periodEnd} onChange={e => setBillingForm(f => ({ ...f, periodEnd: e.target.value }))} />
            </div>
          </div>
          <div style={{ background: billingLogs.length > 0 ? 'rgba(52,211,153,.1)' : 'rgba(248,113,113,.1)', border: `1px solid ${billingLogs.length > 0 ? 'rgba(52,211,153,.3)' : 'rgba(248,113,113,.3)'}`, borderRadius: 6, padding: 10, fontSize: 13, marginBottom: 12 }}>
            {billingLogs.length > 0 ? (
              <>✓ <strong>{billingLogs.length} approved logs</strong> — {fmtH(billingHours)} · <strong style={{ color: 'var(--gold)' }}>{fmt(billingTotal)}</strong></>
            ) : (
              <>⚠ No approved unbilled logs in this period</>
            )}
          </div>
          <div className="form-group">
            <label>Debit Account (Equipment Hire Expense) *</label>
            <select className="form-control" required value={billingForm.debitAccountId} onChange={e => setBillingForm(f => ({ ...f, debitAccountId: e.target.value }))}>
              <option value="">— Select expense account —</option>
              {accounts.filter(a => ['expense','Expense'].includes(a.type)).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              {accounts.filter(a => !['expense','Expense'].includes(a.type)).length === accounts.length && accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Credit Account (Accounts Payable) *</label>
            <select className="form-control" required value={billingForm.creditAccountId} onChange={e => setBillingForm(f => ({ ...f, creditAccountId: e.target.value }))}>
              <option value="">— Select AP account —</option>
              {accounts.filter(a => ['liability','Liability'].includes(a.type)).map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              {accounts.filter(a => !['liability','Liability'].includes(a.type)).length === accounts.length && accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input className="form-control" value={billingForm.notes} onChange={e => setBillingForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes on this invoice" />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setBillingModal(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={!billingLogs.length || posting || !billingForm.debitAccountId || !billingForm.creditAccountId} onClick={handlePostInvoice}>
              {posting ? 'Posting…' : `Post ${fmt(billingTotal)} to Accounts`}
            </button>
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
