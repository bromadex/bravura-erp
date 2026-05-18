// src/pages/HR/LeaveEncashment.jsx
// Leave encashment processing — convert leave balance to cash.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState, SectionCard,
  TabNav, ModalDialog, ModalActions,
} from '../../components/ui'
import { getLedgerBalance, createLedgerEntry } from '../../engine/leaveEngine'
import { pushNotificationToRole } from '../../engine/notificationEngine'

const today = new Date().toISOString().split('T')[0]
const thisYear = new Date().getFullYear()

export default function LeaveEncashment() {
  const { user } = useAuth()
  const { employees, leaveTypes } = useHR()
  const canApprove = useCanApprove('hr', 'leave')

  // ── Data ─────────────────────────────────────────────────────
  const [encashments, setEncashments] = useState([])
  const [periods,     setPeriods]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('pending')

  // KPIs
  const [kpiPending, setKpiPending]   = useState(0)
  const [kpiTotalAmt, setKpiTotalAmt] = useState(0)
  const [kpiEmpCount, setKpiEmpCount] = useState(0)

  // Encashable leave types
  const encashableTypes = leaveTypes.filter(lt => lt.allow_encashment && lt.is_active)

  // ── Modal state ───────────────────────────────────────────────
  const [modal, setModal] = useState({
    open: false, saving: false,
    form: {
      employee_id: '', leave_type_id: '', leave_period_id: '',
      encashment_days: '', encashment_date: today,
    },
    currentBalance: null, loadingBalance: false, encashmentAmount: 0,
  })

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchPeriods = () =>
    supabase.from('leave_periods').select('*').order('from_date', { ascending: false })
      .then(({ data }) => setPeriods(data || []))

  const fetchEncashments = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('leave_encashments')
        .select('*, employees(name, employee_number, basic_salary), leave_types(name, color), leave_periods(name)')
        .order('created_at', { ascending: false })

      if (activeTab === 'pending') {
        query = query.in('status', ['draft', 'unpaid'])
      } else if (activeTab === 'processed') {
        query = query.in('status', ['paid', 'cancelled'])
      }

      const { data, error } = await query
      if (error) throw error
      setEncashments(data || [])

      // KPIs
      const { data: allData } = await supabase
        .from('leave_encashments')
        .select('status, encashment_amount, employee_id, encashment_date')
      if (allData) {
        setKpiPending(allData.filter(e => e.status === 'unpaid' || e.status === 'draft').length)
        const paidThisYear = allData.filter(e =>
          e.status === 'paid' && e.encashment_date?.startsWith(String(thisYear))
        )
        setKpiTotalAmt(paidThisYear.reduce((s, e) => s + (e.encashment_amount || 0), 0))
        const uniqueEmps = new Set(allData.filter(e => e.status === 'unpaid').map(e => e.employee_id))
        setKpiEmpCount(uniqueEmps.size)
      }
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [activeTab])

  useEffect(() => { fetchPeriods() }, [])
  useEffect(() => { fetchEncashments() }, [fetchEncashments])

  // ── Balance lookup when employee + type selected ──────────────
  const handleEmployeeOrTypeChange = useCallback(async (employeeId, leaveTypeId) => {
    if (!employeeId || !leaveTypeId) {
      setModal(m => ({ ...m, currentBalance: null, encashmentAmount: 0 }))
      return
    }
    setModal(m => ({ ...m, loadingBalance: true, currentBalance: null }))
    try {
      const balance = await getLedgerBalance(employeeId, leaveTypeId)
      const emp = employees.find(e => e.id === employeeId)
      const dailyRate = (emp?.basic_salary || 0) / 30
      const days = Number(modal.form.encashment_days) || 0
      const amount = dailyRate * days
      setModal(m => ({ ...m, currentBalance: balance, loadingBalance: false, encashmentAmount: amount }))
    } catch (err) {
      setModal(m => ({ ...m, currentBalance: null, loadingBalance: false }))
    }
  }, [employees, modal.form.encashment_days])

  // Recalculate amount when days change
  const recalcAmount = (days, employeeId) => {
    const emp = employees.find(e => e.id === (employeeId || modal.form.employee_id))
    if (!emp) return 0
    return ((emp.basic_salary || 0) / 30) * Number(days)
  }

  const updateModalForm = (key, value) => {
    setModal(m => {
      const newForm = { ...m.form, [key]: value }
      let newAmount = m.encashmentAmount
      if (key === 'encashment_days') {
        newAmount = recalcAmount(value, newForm.employee_id)
      }
      return { ...m, form: newForm, encashmentAmount: newAmount }
    })
  }

  // ── Submit encashment ─────────────────────────────────────────
  const submitEncashment = async () => {
    const f = modal.form
    if (!f.employee_id)       return toast.error('Employee is required')
    if (!f.leave_type_id)     return toast.error('Leave type is required')
    if (!f.encashment_days || Number(f.encashment_days) <= 0)
      return toast.error('Encashment days must be > 0')
    if (modal.currentBalance !== null && Number(f.encashment_days) > modal.currentBalance)
      return toast.error(`Cannot encash more than available balance (${modal.currentBalance} days)`)
    if (!f.encashment_date)   return toast.error('Encashment date is required')

    setModal(m => ({ ...m, saving: true }))
    try {
      const emp = employees.find(e => e.id === f.employee_id)
      const amount = ((emp?.basic_salary || 0) / 30) * Number(f.encashment_days)

      const { error } = await supabase.from('leave_encashments').insert([{
        id: crypto.randomUUID(),
        employee_id:      f.employee_id,
        leave_type_id:    f.leave_type_id,
        leave_period_id:  f.leave_period_id || null,
        leave_balance:    modal.currentBalance || 0,
        encashment_days:  Number(f.encashment_days),
        encashment_amount: amount,
        encashment_date:  f.encashment_date,
        status:           'unpaid',
        created_by:       user?.full_name || user?.id,
        created_at:       new Date().toISOString(),
      }])
      if (error) throw error

      // Notify Finance role
      pushNotificationToRole('finance', {
        type:     'leave_encashment',
        title:    'Leave Encashment Pending Payment',
        message:  `${emp?.name || 'An employee'} has ${f.encashment_days} days of leave to be encashed ($${amount.toFixed(2)}).`,
        link:     '/module/hr/leave-encashment',
        category: 'payroll',
      }).catch(() => {})

      toast.success('Encashment created and sent to Finance for payment')
      setModal({ open: false, saving: false, form: { employee_id: '', leave_type_id: '', leave_period_id: '', encashment_days: '', encashment_date: today }, currentBalance: null, loadingBalance: false, encashmentAmount: 0 })
      fetchEncashments()
    } catch (err) {
      toast.error(err.message)
      setModal(m => ({ ...m, saving: false }))
    }
  }

  // ── Mark Paid ─────────────────────────────────────────────────
  const markPaid = async (enc) => {
    if (!window.confirm(`Mark this encashment as paid and deduct ${enc.encashment_days} days from ${enc.employees?.name}'s leave balance?`)) return
    try {
      const { error } = await supabase
        .from('leave_encashments')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', enc.id)
      if (error) throw error

      // Deduct leave from ledger
      await createLedgerEntry({
        employeeId:      enc.employee_id,
        leaveTypeId:     enc.leave_type_id,
        transactionType: 'Encashment',
        transactionName: `Leave Encashment — ${enc.encashment_date}`,
        fromDate:        enc.encashment_date,
        toDate:          enc.encashment_date,
        leaves:          -enc.encashment_days,
        isCarryForward:  false,
      })

      // Notify employee
      const empUser = await supabase.from('app_users').select('id').eq('employee_id', enc.employee_id).maybeSingle()
      if (empUser.data?.id) {
        const { pushNotification } = await import('../../engine/notificationEngine')
        pushNotification(empUser.data.id, {
          type:     'encashment_paid',
          title:    'Leave Encashment Processed',
          message:  `Your leave encashment of ${enc.encashment_days} day(s) ($${(enc.encashment_amount || 0).toFixed(2)}) has been processed.`,
          link:     '/ess/payslips',
          category: 'payroll',
        }).catch(() => {})
      }

      toast.success('Encashment marked as paid and leave deducted')
      fetchEncashments()
    } catch (err) { toast.error(err.message) }
  }

  const openModal = () => setModal({
    open: true, saving: false,
    form: { employee_id: '', leave_type_id: '', leave_period_id: '', encashment_days: '', encashment_date: today },
    currentBalance: null, loadingBalance: false, encashmentAmount: 0,
  })

  const tabs = [
    { id: 'pending',   label: 'Pending',   count: kpiPending },
    { id: 'processed', label: 'Processed' },
    { id: 'all',       label: 'All' },
  ]

  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Leave Encashment" subtitle="Process leave encashment payments for employees">
        <button className="btn btn-primary" onClick={openModal}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> New Encashment
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Pending Encashments" value={kpiPending} icon="pending" color="yellow" alert={kpiPending > 0} />
        <KPICard label="Total Encashed This Year" value={fmt(kpiTotalAmt)} icon="payments" color="green" />
        <KPICard label="Employees Awaiting Payment" value={kpiEmpCount} icon="people" color="blue" />
      </div>

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <SectionCard style={{ marginTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</div>
        ) : encashments.length === 0 ? (
          <EmptyState icon="payments" message="No encashment records found" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Period</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th style={{ textAlign: 'right' }}>Days to Encash</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Date</th>
                <th>Status</th>
                {canApprove && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {encashments.map(enc => (
                <tr key={enc.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{enc.employees?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{enc.employees?.employee_number}</div>
                  </td>
                  <td>
                    {enc.leave_types?.color && (
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: enc.leave_types.color, marginRight: 5 }} />
                    )}
                    {enc.leave_types?.name || '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{enc.leave_periods?.name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{enc.leave_balance}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{enc.encashment_days}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(enc.encashment_amount)}</td>
                  <td style={{ fontSize: 12 }}>{enc.encashment_date}</td>
                  <td><StatusBadge status={enc.status} /></td>
                  {canApprove && (
                    <td>
                      {enc.status === 'unpaid' && (
                        <button className="btn btn-primary btn-sm" onClick={() => markPaid(enc)}>
                          <span className="material-icons" style={{ fontSize: 13 }}>payments</span> Mark Paid
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* ── New Encashment Modal ──────────────────────────────── */}
      <ModalDialog
        open={modal.open}
        onClose={() => setModal(m => ({ ...m, open: false }))}
        title="New Leave Encashment"
        size="lg"
      >
        <div className="form-row">
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={modal.form.employee_id}
              onChange={e => {
                updateModalForm('employee_id', e.target.value)
                handleEmployeeOrTypeChange(e.target.value, modal.form.leave_type_id)
              }}>
              <option value="">Select employee…</option>
              {employees.filter(e => e.status !== 'Terminated').map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Leave Type *</label>
            <select className="form-control" value={modal.form.leave_type_id}
              onChange={e => {
                updateModalForm('leave_type_id', e.target.value)
                handleEmployeeOrTypeChange(modal.form.employee_id, e.target.value)
              }}>
              <option value="">Select encashable leave type…</option>
              {encashableTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
            {encashableTypes.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                No encashable leave types. Enable allow_encashment on leave types.
              </div>
            )}
          </div>
        </div>

        {/* Balance display */}
        {(modal.form.employee_id && modal.form.leave_type_id) && (
          <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            <strong>Current Balance:</strong>{' '}
            {modal.loadingBalance ? (
              <span style={{ color: 'var(--text-dim)' }}>Checking…</span>
            ) : modal.currentBalance !== null ? (
              <span style={{ fontWeight: 700, color: modal.currentBalance > 0 ? 'var(--green)' : 'var(--red)' }}>
                {modal.currentBalance} day(s) available
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>Unable to fetch balance</span>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Leave Period</label>
          <select className="form-control" value={modal.form.leave_period_id}
            onChange={e => updateModalForm('leave_period_id', e.target.value)}>
            <option value="">No specific period</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Encashment Days *</label>
            <input type="number" className="form-control" min="0.5" step="0.5"
              value={modal.form.encashment_days}
              onChange={e => updateModalForm('encashment_days', e.target.value)}
              placeholder="e.g. 5" />
            {modal.currentBalance !== null && Number(modal.form.encashment_days) > modal.currentBalance && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                Exceeds available balance of {modal.currentBalance} days
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Encashment Date *</label>
            <input type="date" className="form-control" value={modal.form.encashment_date}
              onChange={e => updateModalForm('encashment_date', e.target.value)} />
          </div>
        </div>

        {/* Auto-calculated amount */}
        {modal.form.encashment_days && modal.form.employee_id && (
          <div style={{ background: 'var(--gold-alpha, rgba(212,175,55,.1))', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>CALCULATED ENCASHMENT AMOUNT</div>
            <div style={{ fontWeight: 900, fontSize: 24, color: 'var(--gold)' }}>
              ${modal.encashmentAmount.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Based on salary / 30 × {modal.form.encashment_days} days
            </div>
          </div>
        )}

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</button>
          <button className="btn btn-primary" onClick={submitEncashment} disabled={modal.saving}>
            {modal.saving ? 'Creating…' : 'Create Encashment'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
