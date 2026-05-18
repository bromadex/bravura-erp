// src/pages/HR/LeaveAllocation.jsx
// Bulk leave allocation management — view, manual allocation, ledger view.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState, SectionCard,
  TabNav, ModalDialog, ModalActions, Pagination,
} from '../../components/ui'
import { createLedgerEntry, getLedgerBalance } from '../../engine/leaveEngine'

const today = new Date().toISOString().split('T')[0]
const PAGE_SIZE = 20

export default function LeaveAllocation() {
  const { user } = useAuth()
  const { employees, leaveTypes } = useHR()
  const canApprove = useCanApprove('hr', 'leave')

  // ── Filters ──────────────────────────────────────────────────
  const [filterPeriod,    setFilterPeriod]    = useState('')
  const [filterEmployee,  setFilterEmployee]  = useState('')
  const [filterLeaveType, setFilterLeaveType] = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [ledgerView,      setLedgerView]      = useState(false)
  const [activeTab,       setActiveTab]       = useState('allocations')

  // ── Data ─────────────────────────────────────────────────────
  const [allocations, setAllocations] = useState([])
  const [ledger,      setLedger]      = useState([])
  const [periods,     setPeriods]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [page,        setPage]        = useState(1)
  const [totalCount,  setTotalCount]  = useState(0)

  // KPI
  const [kpiTotal,  setKpiTotal]  = useState(0)
  const [kpiDays,   setKpiDays]   = useState(0)
  const [kpiActive, setKpiActive] = useState(0)

  // ── Modal ────────────────────────────────────────────────────
  const [allocModal, setAllocModal] = useState({
    open: false,
    form: {
      employee_id: '', leave_type_id: '', leave_period_id: '',
      from_date: today, to_date: today,
      new_leaves_allocated: '', carry_forward: false,
      carry_forwarded_leaves: '', description: '',
    },
    saving: false,
  })

  // ── Fetch periods ────────────────────────────────────────────
  useEffect(() => {
    supabase.from('leave_periods').select('*').order('from_date', { ascending: false })
      .then(({ data }) => setPeriods(data || []))
  }, [])

  // ── Fetch allocations ────────────────────────────────────────
  const fetchAllocations = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('leave_allocations')
        .select('*, employees(name, employee_number), leave_types(name, color), leave_periods(name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (filterPeriod)    query = query.eq('leave_period_id', filterPeriod)
      if (filterEmployee)  query = query.eq('employee_id', filterEmployee)
      if (filterLeaveType) query = query.eq('leave_type_id', filterLeaveType)
      if (filterStatus)    query = query.eq('status', filterStatus)

      const { data, error, count } = await query
      if (error) throw error
      setAllocations(data || [])
      setTotalCount(count || 0)

      // KPIs
      setKpiTotal(count || 0)
      const totalDays = (data || []).reduce((s, a) => s + (a.total_leaves_allocated || 0), 0)
      setKpiDays(totalDays)
      setKpiActive((data || []).filter(a => a.status === 'Active').length)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [page, filterPeriod, filterEmployee, filterLeaveType, filterStatus])

  useEffect(() => { fetchAllocations() }, [fetchAllocations])

  // ── Fetch ledger ─────────────────────────────────────────────
  const fetchLedger = useCallback(async () => {
    if (!filterEmployee || !filterLeaveType) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('leave_ledger_entries')
        .select('*')
        .eq('employee_id', filterEmployee)
        .eq('leave_type_id', filterLeaveType)
        .order('from_date', { ascending: true })
      if (error) throw error

      // Compute running balance
      let running = 0
      const withBalance = (data || []).map(entry => {
        running += entry.leaves || 0
        return { ...entry, running_balance: running }
      })
      setLedger(withBalance.reverse())
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [filterEmployee, filterLeaveType])

  useEffect(() => {
    if (ledgerView) fetchLedger()
  }, [ledgerView, fetchLedger])

  // ── Save manual allocation ───────────────────────────────────
  const saveAllocation = async () => {
    const f = allocModal.form
    if (!f.employee_id)             return toast.error('Employee is required')
    if (!f.leave_type_id)           return toast.error('Leave type is required')
    if (!f.from_date || !f.to_date) return toast.error('Date range is required')
    if (!f.new_leaves_allocated || Number(f.new_leaves_allocated) <= 0)
      return toast.error('New leaves allocated must be > 0')

    setAllocModal(m => ({ ...m, saving: true }))
    try {
      const carryDays = f.carry_forward ? (Number(f.carry_forwarded_leaves) || 0) : 0
      const totalLeaves = Number(f.new_leaves_allocated) + carryDays
      const allocationId = crypto.randomUUID()

      const { error: allocErr } = await supabase.from('leave_allocations').insert([{
        id: allocationId,
        employee_id: f.employee_id,
        leave_type_id: f.leave_type_id,
        leave_period_id: f.leave_period_id || null,
        from_date: f.from_date,
        to_date: f.to_date,
        new_leaves_allocated: Number(f.new_leaves_allocated),
        carry_forward: f.carry_forward,
        carry_forwarded_leaves: carryDays,
        total_leaves_allocated: totalLeaves,
        status: 'Active',
      }])
      if (allocErr) throw allocErr

      // Credit ledger
      await createLedgerEntry({
        employeeId: f.employee_id,
        leaveTypeId: f.leave_type_id,
        transactionType: 'Allocation',
        transactionName: f.description || 'Manual Leave Allocation',
        fromDate: f.from_date,
        toDate: f.to_date,
        leaves: totalLeaves,
        isCarryForward: false,
      })

      toast.success(`${totalLeaves} day(s) allocated successfully`)
      setAllocModal({
        open: false,
        form: { employee_id: '', leave_type_id: '', leave_period_id: '', from_date: today, to_date: today, new_leaves_allocated: '', carry_forward: false, carry_forwarded_leaves: '', description: '' },
        saving: false,
      })
      fetchAllocations()
    } catch (err) {
      toast.error(err.message)
      setAllocModal(m => ({ ...m, saving: false }))
    }
  }

  const openAllocModal = () =>
    setAllocModal({
      open: true,
      form: { employee_id: '', leave_type_id: '', leave_period_id: '', from_date: today, to_date: today, new_leaves_allocated: '', carry_forward: false, carry_forwarded_leaves: '', description: '' },
      saving: false,
    })

  const updateForm = (key, value) =>
    setAllocModal(m => ({ ...m, form: { ...m.form, [key]: value } }))

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Leave Allocation" subtitle="Manage and track leave allocations by employee and period">
        <button className="btn btn-secondary" onClick={() => { setLedgerView(!ledgerView) }}>
          <span className="material-icons" style={{ fontSize: 16 }}>{ledgerView ? 'table_view' : 'receipt_long'}</span>
          {ledgerView ? 'Allocations View' : 'Ledger View'}
        </button>
        <button className="btn btn-primary" onClick={openAllocModal}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Manual Allocation
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Total Allocations" value={kpiTotal} icon="event_available" color="gold" />
        <KPICard label="Total Days Allocated" value={kpiDays.toFixed(1)} icon="calendar_month" color="blue" />
        <KPICard label="Active Allocations" value={kpiActive} icon="check_circle" color="green" />
      </div>

      {/* Filters */}
      <SectionCard mb={16} padding={12}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11 }}>Period</label>
            <select className="form-control" value={filterPeriod} onChange={e => { setFilterPeriod(e.target.value); setPage(1) }}>
              <option value="">All Periods</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11 }}>Employee</label>
            <select className="form-control" value={filterEmployee} onChange={e => { setFilterEmployee(e.target.value); setPage(1) }}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11 }}>Leave Type</label>
            <select className="form-control" value={filterLeaveType} onChange={e => { setFilterLeaveType(e.target.value); setPage(1) }}>
              <option value="">All Types</option>
              {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
            <label style={{ fontSize: 11 }}>Status</label>
            <select className="form-control" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Expired">Expired</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          {(filterPeriod || filterEmployee || filterLeaveType || filterStatus) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFilterPeriod(''); setFilterEmployee(''); setFilterLeaveType(''); setFilterStatus(''); setPage(1) }}>
              Clear Filters
            </button>
          )}
        </div>
      </SectionCard>

      {/* Main content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-dim)' }}>Loading…</div>
      ) : ledgerView ? (
        /* ── Ledger View ───────────────────────────────────────── */
        <SectionCard title={`Ledger — ${employees.find(e => e.id === filterEmployee)?.name || 'Select employee'} · ${leaveTypes.find(lt => lt.id === filterLeaveType)?.name || 'Select leave type'}`}>
          {(!filterEmployee || !filterLeaveType) ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
              Select an employee and leave type in the filters above to view their ledger.
            </div>
          ) : ledger.length === 0 ? (
            <EmptyState icon="receipt_long" message="No ledger entries found" />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date Range</th>
                  <th>Transaction Type</th>
                  <th>Reference</th>
                  <th style={{ textAlign: 'right' }}>Leaves</th>
                  <th style={{ textAlign: 'right' }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: 12 }}>{entry.from_date}{entry.to_date !== entry.from_date ? ` → ${entry.to_date}` : ''}</td>
                    <td><span className="badge badge-dim" style={{ fontSize: 11 }}>{entry.transaction_type}</span></td>
                    <td style={{ fontSize: 12 }}>{entry.transaction_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: (entry.leaves || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {(entry.leaves || 0) > 0 ? '+' : ''}{entry.leaves}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{entry.running_balance?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      ) : (
        /* ── Allocations Table ─────────────────────────────────── */
        <SectionCard>
          {allocations.length === 0 ? (
            <EmptyState icon="event_available" message="No allocations found" />
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave Type</th>
                    <th>Period</th>
                    <th>Date Range</th>
                    <th style={{ textAlign: 'right' }}>New Leaves</th>
                    <th style={{ textAlign: 'right' }}>Carry Forward</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.employees?.name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.employees?.employee_number}</div>
                      </td>
                      <td>
                        {a.leave_types?.color && (
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: a.leave_types.color, marginRight: 5 }} />
                        )}
                        {a.leave_types?.name || '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>{a.leave_periods?.name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{a.from_date} → {a.to_date}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{a.new_leaves_allocated}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                        {a.carry_forward ? a.carry_forwarded_leaves : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{a.total_leaves_allocated}</td>
                      <td><StatusBadge status={a.status?.toLowerCase()} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={totalCount}
                onChange={setPage}
              />
            </>
          )}
        </SectionCard>
      )}

      {/* ── Manual Allocation Modal ────────────────────────────── */}
      <ModalDialog
        open={allocModal.open}
        onClose={() => setAllocModal(m => ({ ...m, open: false }))}
        title="Manual Leave Allocation"
        size="lg"
      >
        <div className="form-row">
          <div className="form-group">
            <label>Employee *</label>
            <select className="form-control" value={allocModal.form.employee_id}
              onChange={e => updateForm('employee_id', e.target.value)}>
              <option value="">Select employee…</option>
              {employees.filter(e => e.status !== 'Terminated').map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Leave Type *</label>
            <select className="form-control" value={allocModal.form.leave_type_id}
              onChange={e => updateForm('leave_type_id', e.target.value)}>
              <option value="">Select leave type…</option>
              {leaveTypes.filter(lt => lt.is_active).map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Leave Period (optional)</label>
          <select className="form-control" value={allocModal.form.leave_period_id}
            onChange={e => updateForm('leave_period_id', e.target.value)}>
            <option value="">No period</option>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>From Date *</label>
            <input type="date" className="form-control" value={allocModal.form.from_date}
              onChange={e => updateForm('from_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>To Date *</label>
            <input type="date" className="form-control" value={allocModal.form.to_date}
              onChange={e => updateForm('to_date', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>New Leaves Allocated *</label>
          <input type="number" className="form-control" min="0" step="0.5"
            value={allocModal.form.new_leaves_allocated}
            onChange={e => updateForm('new_leaves_allocated', e.target.value)}
            placeholder="e.g. 14" />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={allocModal.form.carry_forward}
              onChange={e => updateForm('carry_forward', e.target.checked)} />
            Include Carry Forward Days
          </label>
        </div>
        {allocModal.form.carry_forward && (
          <div className="form-group">
            <label>Carry Forwarded Leaves</label>
            <input type="number" className="form-control" min="0" step="0.5"
              value={allocModal.form.carry_forwarded_leaves}
              onChange={e => updateForm('carry_forwarded_leaves', e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Description / Reference</label>
          <input className="form-control" value={allocModal.form.description}
            onChange={e => updateForm('description', e.target.value)}
            placeholder="e.g. Annual allocation FY2026" />
        </div>
        {allocModal.form.new_leaves_allocated && (
          <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            <strong>Total to be allocated:</strong>{' '}
            {(Number(allocModal.form.new_leaves_allocated) + (allocModal.form.carry_forward ? Number(allocModal.form.carry_forwarded_leaves || 0) : 0)).toFixed(1)} days
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setAllocModal(m => ({ ...m, open: false }))}>Cancel</button>
          <button className="btn btn-primary" onClick={saveAllocation} disabled={allocModal.saving}>
            {allocModal.saving ? 'Allocating…' : 'Allocate Leaves'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
