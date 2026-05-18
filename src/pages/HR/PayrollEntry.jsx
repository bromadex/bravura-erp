// src/pages/HR/PayrollEntry.jsx
// Batch payroll processor — create payroll runs, generate salary slips per employee,
// review employee totals, and submit the whole run for payment.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState,
  SectionCard, TabNav, ModalDialog, ModalActions, Spinner,
} from '../../components/ui'

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n, decimals = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

const FREQUENCIES = ['Weekly', 'Bi-Weekly', 'Monthly', 'Semi-Monthly']

const EMPTY_FORM = {
  posting_date: new Date().toISOString().slice(0, 10),
  start_date: '',
  end_date: '',
  payroll_frequency: 'Monthly',
  department_id: '',
  currency: 'USD',
  notes: '',
}

// ─── component ──────────────────────────────────────────────────────────────

export default function PayrollEntry() {
  const { user } = useAuth()
  const canEdit   = useCanEdit('hr', 'payroll')
  const canApprove = useCanApprove('hr', 'payroll')

  // list state
  const [entries,     setEntries]     = useState([])
  const [departments, setDepartments] = useState([])
  const [loadingList, setLoadingList] = useState(true)

  // new run modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)

  // detail modal
  const [detailEntry,  setDetailEntry]  = useState(null)
  const [detailTab,    setDetailTab]    = useState('employees')
  const [slips,        setSlips]        = useState([])
  const [loadingSlips, setLoadingSlips] = useState(false)
  const [generating,   setGenerating]   = useState(false)
  const [submitting,   setSubmitting]   = useState(false)

  // cancel confirm
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelling,   setCancelling]   = useState(false)

  // ── initial load ─────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setLoadingList(true)
    const { data, error } = await supabase
      .from('payroll_entries')
      .select('*, departments(name)')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setEntries(data || [])
    setLoadingList(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name')
      setDepartments(depts || [])
      await loadEntries()
    }
    init()
  }, [loadEntries])

  // ── load slips for detail modal ───────────────────────────────
  const loadSlips = useCallback(async (entryId) => {
    setLoadingSlips(true)
    const { data, error } = await supabase
      .from('salary_slips')
      .select('*, employees(name, designation, department_id)')
      .eq('payroll_entry_id', entryId)
      .order('created_at', { ascending: true })
    if (error) toast.error(error.message)
    setSlips(data || [])
    setLoadingSlips(false)
  }, [])

  const openDetail = (entry) => {
    setDetailEntry(entry)
    setDetailTab('employees')
    loadSlips(entry.id)
  }

  const refreshDetail = async (entryId) => {
    const { data } = await supabase
      .from('payroll_entries')
      .select('*, departments(name)')
      .eq('id', entryId)
      .single()
    if (data) {
      setDetailEntry(data)
      setEntries(prev => prev.map(e => e.id === entryId ? data : e))
    }
  }

  // ── create new payroll run ────────────────────────────────────
  const handleCreateRun = async () => {
    if (!form.posting_date || !form.start_date || !form.end_date)
      return toast.error('Posting date, start date, and end date are required')
    if (form.start_date > form.end_date)
      return toast.error('Start date must be before end date')

    setSaving(true)
    try {
      const id = crypto.randomUUID()
      // generate sequential entry number
      const { count } = await supabase
        .from('payroll_entries')
        .select('id', { count: 'exact', head: true })
      const entryNumber = `PE-${String((count || 0) + 1).padStart(5, '0')}`

      const payload = {
        id,
        entry_number: entryNumber,
        posting_date: form.posting_date,
        start_date: form.start_date,
        end_date: form.end_date,
        payroll_frequency: form.payroll_frequency,
        department_id: form.department_id || null,
        currency: form.currency,
        notes: form.notes,
        status: 'Draft',
        total_employees: 0,
        total_gross: 0,
        total_deductions: 0,
        total_net: 0,
        created_by: user?.full_name || user?.username || 'System',
      }

      const { data, error } = await supabase
        .from('payroll_entries')
        .insert([payload])
        .select('*, departments(name)')
        .single()
      if (error) throw new Error(error.message)

      setEntries(prev => [data, ...prev])
      setShowNewModal(false)
      setForm(EMPTY_FORM)
      toast.success(`Payroll run ${entryNumber} created`)
      openDetail(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── generate salary slips ─────────────────────────────────────
  const handleGenerateSlips = async () => {
    if (!detailEntry) return
    if (slips.length > 0) {
      if (!window.confirm('Slips already exist for this run. Regenerate and overwrite them?')) return
    }

    setGenerating(true)
    try {
      // 1. Fetch employees with active salary assignments
      let empQuery = supabase
        .from('employee_salary_assignments')
        .select('*, employees!inner(id, name, designation, department_id, status)')
        .eq('is_active', true)

      if (detailEntry.department_id) {
        empQuery = empQuery.eq('employees.department_id', detailEntry.department_id)
      }

      const { data: assignments, error: aErr } = await empQuery
      if (aErr) throw new Error(aErr.message)

      const activeAssignments = (assignments || []).filter(
        a => a.employees?.status === 'Active' || a.employees?.status === 'On Leave'
      )

      if (activeAssignments.length === 0) {
        toast.error('No active employees with salary assignments found')
        setGenerating(false)
        return
      }

      // 2. Delete existing slips for this entry (re-generate)
      const { data: existingSlips } = await supabase
        .from('salary_slips')
        .select('id')
        .eq('payroll_entry_id', detailEntry.id)

      if (existingSlips?.length) {
        const slipIds = existingSlips.map(s => s.id)
        await supabase.from('salary_slip_components').delete().in('slip_id', slipIds)
        await supabase.from('salary_slips').delete().in('id', slipIds)
      }

      // 3. Pre-fetch all relevant salary components
      const structureIds = [...new Set(activeAssignments.map(a => a.structure_id).filter(Boolean))]
      const { data: allComponents } = await supabase
        .from('salary_components')
        .select('*')
        .in('structure_id', structureIds)
        .order('sort_order')

      const componentsByStructure = {}
      for (const comp of allComponents || []) {
        if (!componentsByStructure[comp.structure_id]) componentsByStructure[comp.structure_id] = []
        componentsByStructure[comp.structure_id].push(comp)
      }

      // 4. Build slips + components for each employee
      const slipsToInsert = []
      const componentsToInsert = []
      let totalGross = 0
      let totalDeductions = 0
      let totalNet = 0

      for (const assignment of activeAssignments) {
        const emp = assignment.employees
        const basicSalary = Number(assignment.basic_salary) || 0
        const components = componentsByStructure[assignment.structure_id] || []

        let earnings = 0
        let deductions = 0
        const slipComponents = []

        for (const comp of components) {
          let amount = 0
          if (comp.amount_type === 'fixed') {
            amount = Number(comp.amount) || 0
          } else if (comp.amount_type === 'percent_of_basic') {
            amount = basicSalary * ((Number(comp.amount) || 0) / 100)
          }

          if (comp.component_type === 'earning') {
            earnings += amount
          } else if (comp.component_type === 'deduction') {
            deductions += amount
          }
          // employer_contribution doesn't affect employee net

          slipComponents.push({
            component_id: comp.id,
            component_name: comp.name,
            component_type: comp.component_type,
            amount,
            is_taxable: comp.is_taxable ?? false,
            sort_order: comp.sort_order ?? 0,
          })
        }

        const grossPay = basicSalary + earnings
        const netPay = grossPay - deductions

        totalGross += grossPay
        totalDeductions += deductions
        totalNet += netPay

        const slipId = crypto.randomUUID()
        const { count: slipCount } = await supabase
          .from('salary_slips')
          .select('id', { count: 'exact', head: true })
        const slipNumber = `SS-${String((slipCount || 0) + slipsToInsert.length + 1).padStart(6, '0')}`

        slipsToInsert.push({
          id: slipId,
          slip_number: slipNumber,
          employee_id: emp.id,
          payroll_entry_id: detailEntry.id,
          structure_id: assignment.structure_id,
          posting_date: detailEntry.posting_date,
          start_date: detailEntry.start_date,
          end_date: detailEntry.end_date,
          working_days: 0,   // can be enriched from attendance later
          payment_days: 0,
          absent_days: 0,
          lwp_days: 0,
          basic_salary: basicSalary,
          gross_pay: grossPay,
          total_deduction: deductions,
          net_pay: netPay,
          currency: detailEntry.currency,
          status: 'Draft',
          mode_of_payment: 'Bank Transfer',
          bank_name: null,
          bank_account_no: null,
          remarks: null,
          created_by: user?.full_name || user?.username || 'System',
        })

        for (const sc of slipComponents) {
          componentsToInsert.push({ id: crypto.randomUUID(), slip_id: slipId, ...sc })
        }
      }

      // 5. Batch insert
      if (slipsToInsert.length > 0) {
        const { error: sErr } = await supabase.from('salary_slips').insert(slipsToInsert)
        if (sErr) throw new Error(sErr.message)
      }
      if (componentsToInsert.length > 0) {
        // insert in chunks of 500 to avoid payload limits
        for (let i = 0; i < componentsToInsert.length; i += 500) {
          const { error: cErr } = await supabase
            .from('salary_slip_components')
            .insert(componentsToInsert.slice(i, i + 500))
          if (cErr) throw new Error(cErr.message)
        }
      }

      // 6. Update entry totals
      const { error: uErr } = await supabase
        .from('payroll_entries')
        .update({
          total_employees: slipsToInsert.length,
          total_gross: totalGross,
          total_deductions: totalDeductions,
          total_net: totalNet,
          status: 'Processing',
        })
        .eq('id', detailEntry.id)
      if (uErr) throw new Error(uErr.message)

      await refreshDetail(detailEntry.id)
      await loadSlips(detailEntry.id)
      toast.success(`Generated ${slipsToInsert.length} salary slips`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── submit all slips ──────────────────────────────────────────
  const handleSubmitAll = async () => {
    if (!canApprove) return toast.error('You do not have approval permission')
    if (slips.length === 0) return toast.error('No slips to submit')
    if (!window.confirm(`Submit ${slips.length} salary slips and finalise this payroll run?`)) return

    setSubmitting(true)
    try {
      const slipIds = slips.map(s => s.id)

      const { error: sErr } = await supabase
        .from('salary_slips')
        .update({ status: 'Submitted' })
        .in('id', slipIds)
      if (sErr) throw new Error(sErr.message)

      const { error: eErr } = await supabase
        .from('payroll_entries')
        .update({ status: 'Submitted' })
        .eq('id', detailEntry.id)
      if (eErr) throw new Error(eErr.message)

      await refreshDetail(detailEntry.id)
      await loadSlips(detailEntry.id)
      toast.success('Payroll run submitted successfully')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── cancel entry ─────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { error } = await supabase
        .from('payroll_entries')
        .update({ status: 'Cancelled' })
        .eq('id', cancelTarget.id)
      if (error) throw new Error(error.message)
      setEntries(prev => prev.map(e => e.id === cancelTarget.id ? { ...e, status: 'Cancelled' } : e))
      if (detailEntry?.id === cancelTarget.id) setDetailEntry(prev => ({ ...prev, status: 'Cancelled' }))
      setCancelTarget(null)
      toast.success('Payroll run cancelled')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancelling(false)
    }
  }

  // ── KPI data ─────────────────────────────────────────────────
  const kpiTotal     = entries.length
  const kpiDraft     = entries.filter(e => e.status === 'Draft' || e.status === 'Processing').length
  const kpiSubmitted = entries.filter(e => e.status === 'Submitted').length
  const kpiTotalNet  = entries
    .filter(e => e.status === 'Submitted')
    .reduce((s, e) => s + (Number(e.total_net) || 0), 0)

  // ── department summary for detail ────────────────────────────
  const deptSummary = (() => {
    if (!slips.length) return []
    const map = {}
    for (const slip of slips) {
      const deptId = slip.employees?.department_id || 'unknown'
      const deptName = departments.find(d => d.id === deptId)?.name || 'Unknown'
      if (!map[deptId]) map[deptId] = { name: deptName, count: 0, gross: 0, deductions: 0, net: 0 }
      map[deptId].count += 1
      map[deptId].gross += Number(slip.gross_pay) || 0
      map[deptId].deductions += Number(slip.total_deduction) || 0
      map[deptId].net += Number(slip.net_pay) || 0
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  })()

  const isDraft  = (e) => e?.status === 'Draft' || e?.status === 'Processing'
  const isLocked = (e) => e?.status === 'Submitted' || e?.status === 'Cancelled'

  // ────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Payroll Entries" subtitle="Manage batch payroll runs and salary generation">
        {canApprove && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowNewModal(true) }}>
            <span className="material-icons">add</span> New Payroll Run
          </button>
        )}
      </PageHeader>

      {/* KPI strip */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard label="Total Runs"    value={kpiTotal}               icon="receipt_long"        color="blue"  />
        <KPICard label="Draft / Open"  value={kpiDraft}               icon="edit_note"           color="yellow"/>
        <KPICard label="Submitted"     value={kpiSubmitted}           icon="check_circle"        color="green" />
        <KPICard label="Total Net Paid" value={`$${fmt(kpiTotalNet, 0)}`} icon="account_balance_wallet" color="teal"  />
      </div>

      {/* Entries table */}
      {loadingList ? (
        <Spinner text="Loading payroll entries…" />
      ) : entries.length === 0 ? (
        <EmptyState icon="receipt_long" message="No payroll runs yet — click 'New Payroll Run' to get started" />
      ) : (
        <SectionCard title="Payroll Runs" padding={0}>
          <div style={{ overflowX: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Entry #</th>
                  <th>Period</th>
                  <th>Frequency</th>
                  <th>Department</th>
                  <th style={{ textAlign: 'right' }}>Employees</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>Deductions</th>
                  <th style={{ textAlign: 'right' }}>Net Pay</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                      {entry.entry_number}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {fmtDate(entry.start_date)} — {fmtDate(entry.end_date)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        Posted {fmtDate(entry.posting_date)}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{entry.payroll_frequency || '—'}</td>
                    <td style={{ fontSize: 12 }}>{entry.departments?.name || <span style={{ color: 'var(--text-dim)' }}>All</span>}</td>
                    <td className="td-mono" style={{ textAlign: 'right' }}>{entry.total_employees ?? 0}</td>
                    <td className="td-mono" style={{ textAlign: 'right' }}>${fmt(entry.total_gross, 0)}</td>
                    <td className="td-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>${fmt(entry.total_deductions, 0)}</td>
                    <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>${fmt(entry.total_net, 0)}</td>
                    <td><StatusBadge status={entry.status} /></td>
                    <td>
                      <div className="btn-group-sm">
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View detail"
                          onClick={() => openDetail(entry)}
                        >
                          <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                        </button>
                        {!isLocked(entry) && canApprove && (
                          <button
                            className="btn btn-danger btn-sm"
                            title="Cancel run"
                            onClick={() => setCancelTarget(entry)}
                          >
                            <span className="material-icons" style={{ fontSize: 14 }}>cancel</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── New Payroll Run Modal ──────────────────────────────── */}
      <ModalDialog
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Payroll Run"
        size="md"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label>Posting Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.posting_date}
              onChange={e => setForm(p => ({ ...p, posting_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Payroll Frequency *</label>
            <select
              className="form-control"
              value={form.payroll_frequency}
              onChange={e => setForm(p => ({ ...p, payroll_frequency: e.target.value }))}
            >
              {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Start Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.start_date}
              onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>End Date *</label>
            <input
              type="date"
              className="form-control"
              value={form.end_date}
              onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Department Filter</label>
            <select
              className="form-control"
              value={form.department_id}
              onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Currency</label>
            <select
              className="form-control"
              value={form.currency}
              onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
            >
              <option value="USD">USD</option>
              <option value="ZWG">ZWG</option>
              <option value="ZAR">ZAR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="form-control"
            rows="2"
            value={form.notes}
            placeholder="Optional notes for this payroll run…"
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreateRun} disabled={saving}>
            {saving ? <><Spinner size="sm" /> Creating…</> : 'Create Run'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Detail Modal ───────────────────────────────────────── */}
      <ModalDialog
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        title={detailEntry ? `${detailEntry.entry_number} · ${detailEntry.payroll_frequency} Payroll` : ''}
        size="xl"
      >
        {detailEntry && (
          <>
            {/* Entry meta bar */}
            <div style={{
              display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
              padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8,
              marginBottom: 16, fontSize: 12, color: 'var(--text-dim)',
            }}>
              <span><strong style={{ color: 'var(--text)' }}>Period:</strong> {fmtDate(detailEntry.start_date)} → {fmtDate(detailEntry.end_date)}</span>
              <span><strong style={{ color: 'var(--text)' }}>Currency:</strong> {detailEntry.currency}</span>
              {detailEntry.departments?.name && (
                <span><strong style={{ color: 'var(--text)' }}>Department:</strong> {detailEntry.departments.name}</span>
              )}
              <span style={{ marginLeft: 'auto' }}><StatusBadge status={detailEntry.status} /></span>
            </div>

            <TabNav
              tabs={[
                { id: 'employees', label: 'Employees', icon: 'people',  count: slips.length || undefined },
                { id: 'summary',   label: 'Summary',   icon: 'bar_chart' },
              ]}
              active={detailTab}
              onChange={setDetailTab}
            />

            {/* TAB: Employees */}
            {detailTab === 'employees' && (
              <div style={{ marginTop: 16 }}>
                {/* Action bar */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  {isDraft(detailEntry) && canEdit && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleGenerateSlips}
                      disabled={generating}
                    >
                      <span className="material-icons">{generating ? 'hourglass_empty' : 'auto_awesome'}</span>
                      {generating ? 'Generating slips…' : 'Generate Slips'}
                    </button>
                  )}
                  {slips.length > 0 && isDraft(detailEntry) && canApprove && (
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitAll}
                      disabled={submitting}
                    >
                      <span className="material-icons">check_circle</span>
                      {submitting ? 'Submitting…' : `Submit All (${slips.length})`}
                    </button>
                  )}
                  {slips.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
                      {slips.length} slip{slips.length !== 1 ? 's' : ''} generated
                    </span>
                  )}
                </div>

                {loadingSlips ? (
                  <Spinner text="Loading salary slips…" />
                ) : slips.length === 0 ? (
                  <EmptyState
                    icon="description"
                    message={
                      isDraft(detailEntry) && canEdit
                        ? 'No slips yet — click Generate Slips to compute salaries for all eligible employees'
                        : 'No salary slips found for this payroll run'
                    }
                  />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th style={{ textAlign: 'right' }}>Basic</th>
                          <th style={{ textAlign: 'right' }}>Gross</th>
                          <th style={{ textAlign: 'right' }}>Deductions</th>
                          <th style={{ textAlign: 'right' }}>Net Pay</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slips.map(slip => (
                          <tr key={slip.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{slip.employees?.name || '—'}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                {slip.slip_number}
                                {slip.employees?.designation ? ` · ${slip.employees.designation}` : ''}
                              </div>
                            </td>
                            <td className="td-mono" style={{ textAlign: 'right' }}>${fmt(slip.basic_salary)}</td>
                            <td className="td-mono" style={{ textAlign: 'right' }}>${fmt(slip.gross_pay)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>${fmt(slip.total_deduction)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>${fmt(slip.net_pay)}</td>
                            <td><StatusBadge status={slip.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: 700, background: 'var(--surface2)' }}>
                          <td>Totals ({slips.length} employees)</td>
                          <td className="td-mono" style={{ textAlign: 'right' }}>
                            ${fmt(slips.reduce((s, r) => s + (Number(r.basic_salary) || 0), 0))}
                          </td>
                          <td className="td-mono" style={{ textAlign: 'right' }}>
                            ${fmt(slips.reduce((s, r) => s + (Number(r.gross_pay) || 0), 0))}
                          </td>
                          <td className="td-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>
                            ${fmt(slips.reduce((s, r) => s + (Number(r.total_deduction) || 0), 0))}
                          </td>
                          <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>
                            ${fmt(slips.reduce((s, r) => s + (Number(r.net_pay) || 0), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Summary */}
            {detailTab === 'summary' && (
              <div style={{ marginTop: 16 }}>
                {/* Totals row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Employees',      value: detailEntry.total_employees ?? 0,        color: 'var(--blue)',   icon: 'people' },
                    { label: 'Total Gross',     value: `$${fmt(detailEntry.total_gross, 0)}`,   color: 'var(--teal)',   icon: 'payments' },
                    { label: 'Total Deductions',value: `$${fmt(detailEntry.total_deductions, 0)}`, color: 'var(--red)', icon: 'remove_circle' },
                    { label: 'Net Pay',         value: `$${fmt(detailEntry.total_net, 0)}`,     color: 'var(--green)', icon: 'account_balance_wallet' },
                  ].map(stat => (
                    <div key={stat.label} style={{
                      padding: 16, background: 'var(--surface2)', borderRadius: 10,
                      border: '1px solid var(--border)', textAlign: 'center',
                    }}>
                      <span className="material-icons" style={{ fontSize: 22, color: stat.color, display: 'block', marginBottom: 6 }}>{stat.icon}</span>
                      <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: 'var(--mono)' }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Earnings vs Deductions breakdown */}
                {slips.length > 0 && (() => {
                  const totalEarnings = slips.reduce((s, r) => s + (Number(r.gross_pay) || 0), 0)
                  const totalDed = slips.reduce((s, r) => s + (Number(r.total_deduction) || 0), 0)
                  const totalNet = slips.reduce((s, r) => s + (Number(r.net_pay) || 0), 0)
                  const earningsRatio = totalEarnings > 0 ? (totalNet / totalEarnings) * 100 : 0
                  return (
                    <SectionCard title="Earnings vs Deductions" mb={16}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Gross Pay</div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '100%', background: 'var(--teal)', borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, fontFamily: 'var(--mono)' }}>${fmt(totalEarnings, 0)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Deductions</div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${totalEarnings > 0 ? (totalDed / totalEarnings) * 100 : 0}%`, background: 'var(--red)', borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--red)', fontFamily: 'var(--mono)' }}>${fmt(totalDed, 0)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Net Pay ({earningsRatio.toFixed(1)}% of gross)</div>
                          <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${earningsRatio}%`, background: 'var(--green)', borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: 'var(--green)', fontFamily: 'var(--mono)' }}>${fmt(totalNet, 0)}</div>
                        </div>
                      </div>
                    </SectionCard>
                  )
                })()}

                {/* Department breakdown */}
                {deptSummary.length > 1 && (
                  <SectionCard title="Department Breakdown" mb={0}>
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th style={{ textAlign: 'right' }}>Employees</th>
                          <th style={{ textAlign: 'right' }}>Gross</th>
                          <th style={{ textAlign: 'right' }}>Deductions</th>
                          <th style={{ textAlign: 'right' }}>Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptSummary.map(d => (
                          <tr key={d.name}>
                            <td style={{ fontWeight: 600 }}>{d.name}</td>
                            <td className="td-mono" style={{ textAlign: 'right' }}>{d.count}</td>
                            <td className="td-mono" style={{ textAlign: 'right' }}>${fmt(d.gross, 0)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--red)' }}>${fmt(d.deductions, 0)}</td>
                            <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmt(d.net, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </SectionCard>
                )}

                {slips.length === 0 && (
                  <EmptyState icon="bar_chart" message="Generate salary slips first to see the summary" />
                )}
              </div>
            )}

            {detailEntry.notes && (
              <div style={{
                marginTop: 16, padding: '10px 14px', background: 'var(--surface2)',
                borderRadius: 8, fontSize: 12, color: 'var(--text-dim)',
                borderLeft: '3px solid var(--gold)',
              }}>
                <strong style={{ color: 'var(--text)' }}>Notes: </strong>{detailEntry.notes}
              </div>
            )}

            <ModalActions>
              <button className="btn btn-secondary" onClick={() => setDetailEntry(null)}>Close</button>
            </ModalActions>
          </>
        )}
      </ModalDialog>

      {/* ── Cancel Confirm Dialog ──────────────────────────────── */}
      <ModalDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Payroll Run"
        size="sm"
      >
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 16 }}>
          Are you sure you want to cancel payroll run{' '}
          <strong style={{ color: 'var(--text)' }}>{cancelTarget?.entry_number}</strong>?
          This action cannot be undone.
        </p>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setCancelTarget(null)}>Keep</button>
          <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
