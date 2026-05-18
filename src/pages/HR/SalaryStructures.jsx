// src/pages/HR/SalaryStructures.jsx
// Payroll v2 — Salary Structures management page.
// Covers: structure list, create/edit structure, component management,
// employee assignment management, KPI strip, detail view modal.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanApprove } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, SectionCard,
  TabNav, ModalDialog, ModalActions, ConfirmDialog, Spinner, KPICard,
} from '../../components/ui'

// ── Constants ────────────────────────────────────────────────────────────────

const CURRENCIES = ['USD', 'ZiG', 'ZWL']

const COMPONENT_TYPES = [
  { value: 'earning',               label: 'Earning' },
  { value: 'deduction',             label: 'Deduction' },
  { value: 'employer_contribution', label: 'Employer Contribution' },
]

const AMOUNT_TYPES = [
  { value: 'fixed',            label: 'Fixed Amount' },
  { value: 'percent_of_basic', label: '% of Basic' },
]

const COMP_TYPE_BADGE = {
  earning:               'badge-green',
  deduction:             'badge-red',
  employer_contribution: 'badge-blue',
}

const BLANK_STRUCTURE = { name: '', description: '', currency: 'USD', is_active: true }
const BLANK_COMPONENT = {
  name: '', component_type: 'earning', amount_type: 'fixed',
  amount: '', is_taxable: false, is_statutory: false, sort_order: 0,
}
const BLANK_ASSIGNMENT = {
  employee_id: '', basic_salary: '', currency: 'USD', effective_date: '', notes: '',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function prettyType(t) {
  return COMPONENT_TYPES.find(x => x.value === t)?.label ?? t
}

// ════════════════════════════════════════════════════════════════════════════
export default function SalaryStructures() {
  useAuth() // ensure auth context is loaded

  const canEdit    = useCanEdit('hr', 'salary-structures')
  // canApprove reserved for future workflow
  // eslint-disable-next-line no-unused-vars
  const canApprove = useCanApprove('hr', 'salary-structures')

  // ── Structures list ──────────────────────────────────────────────────────
  const [structures,    setStructures]    = useState([])
  const [loadingList,   setLoadingList]   = useState(true)

  // ── Structure modal (create / edit) ──────────────────────────────────────
  const [structModal,   setStructModal]   = useState({ open: false, editing: null })
  const [structForm,    setStructForm]    = useState(BLANK_STRUCTURE)
  const [savingStruct,  setSavingStruct]  = useState(false)

  // ── Detail view ───────────────────────────────────────────────────────────
  const [detailStruct,  setDetailStruct]  = useState(null)
  const [detailTab,     setDetailTab]     = useState('components')

  // ── Components ────────────────────────────────────────────────────────────
  const [components,    setComponents]    = useState([])
  const [loadingComps,  setLoadingComps]  = useState(false)
  const [compModal,     setCompModal]     = useState({ open: false, editing: null })
  const [compForm,      setCompForm]      = useState(BLANK_COMPONENT)
  const [savingComp,    setSavingComp]    = useState(false)
  const [deleteComp,    setDeleteComp]    = useState(null)   // { id, name }

  // ── Employee assignments ──────────────────────────────────────────────────
  const [assignments,      setAssignments]      = useState([])
  const [loadingAssign,    setLoadingAssign]    = useState(false)
  const [employees,        setEmployees]        = useState([])
  const [assignModal,      setAssignModal]      = useState(false)
  const [assignForm,       setAssignForm]       = useState(BLANK_ASSIGNMENT)
  const [savingAssign,     setSavingAssign]     = useState(false)
  const [deactivateAssign, setDeactivateAssign] = useState(null) // { id, empName }

  // ── Fetch structures list ─────────────────────────────────────────────────
  const fetchStructures = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data, error } = await supabase
        .from('salary_structures')
        .select('*, salary_components(id), employee_salary_assignments(id)')
        .order('name')
      if (error) throw error
      setStructures(data || [])
    } catch (err) {
      toast.error('Failed to load structures: ' + err.message)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { fetchStructures() }, [fetchStructures])

  // ── Fetch components for open detail ─────────────────────────────────────
  const fetchComponents = useCallback(async (structureId) => {
    setLoadingComps(true)
    try {
      const { data, error } = await supabase
        .from('salary_components')
        .select('*')
        .eq('structure_id', structureId)
        .order('sort_order')
      if (error) throw error
      setComponents(data || [])
    } catch (err) {
      toast.error('Failed to load components: ' + err.message)
      setComponents([])
    } finally {
      setLoadingComps(false)
    }
  }, [])

  // ── Fetch assignments for open detail ────────────────────────────────────
  const fetchAssignments = useCallback(async (structureId) => {
    setLoadingAssign(true)
    try {
      const { data, error } = await supabase
        .from('employee_salary_assignments')
        .select('*, employees(name, employee_number)')
        .eq('structure_id', structureId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setAssignments(data || [])
    } catch (err) {
      toast.error('Failed to load assignments: ' + err.message)
      setAssignments([])
    } finally {
      setLoadingAssign(false)
    }
  }, [])

  // ── Fetch active employees (for assign modal) ─────────────────────────────
  const fetchEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, employee_number')
        .eq('status', 'Active')
        .order('name')
      if (error) throw error
      setEmployees(data || [])
    } catch (err) {
      console.error('fetchEmployees:', err)
    }
  }, [])

  // Reload detail data when detail changes or tab changes
  useEffect(() => {
    if (!detailStruct) return
    if (detailTab === 'components') fetchComponents(detailStruct.id)
    if (detailTab === 'employees') {
      fetchAssignments(detailStruct.id)
      fetchEmployees()
    }
  }, [detailStruct, detailTab, fetchComponents, fetchAssignments, fetchEmployees])

  // ── Open / close detail modal ─────────────────────────────────────────────
  const openDetail = (structure) => {
    setDetailStruct(structure)
    setDetailTab('components')
  }

  const closeDetail = () => {
    setDetailStruct(null)
    setComponents([])
    setAssignments([])
  }

  // ── Structure create / edit ───────────────────────────────────────────────
  const openStructModal = (editing = null) => {
    setStructForm(editing
      ? {
          name:        editing.name,
          description: editing.description || '',
          currency:    editing.currency || 'USD',
          is_active:   editing.is_active ?? true,
        }
      : { ...BLANK_STRUCTURE }
    )
    setStructModal({ open: true, editing })
  }

  const closeStructModal = () => setStructModal({ open: false, editing: null })

  const handleSaveStruct = async () => {
    if (!structForm.name.trim()) return toast.error('Structure name is required')
    setSavingStruct(true)
    try {
      if (structModal.editing) {
        const { error } = await supabase
          .from('salary_structures')
          .update({ ...structForm, updated_at: new Date().toISOString() })
          .eq('id', structModal.editing.id)
        if (error) throw error
        toast.success('Structure updated')
        // Keep detail view in sync
        if (detailStruct?.id === structModal.editing.id) {
          setDetailStruct(prev => ({ ...prev, ...structForm }))
        }
      } else {
        const { error } = await supabase
          .from('salary_structures')
          .insert([{ id: crypto.randomUUID(), ...structForm }])
        if (error) throw error
        toast.success('Structure created')
      }
      closeStructModal()
      await fetchStructures()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingStruct(false)
    }
  }

  // ── Component create / edit ───────────────────────────────────────────────
  const openCompModal = (editing = null) => {
    setCompForm(editing
      ? {
          name:           editing.name,
          component_type: editing.component_type,
          amount_type:    editing.amount_type,
          amount:         editing.amount ?? '',
          is_taxable:     editing.is_taxable ?? false,
          is_statutory:   editing.is_statutory ?? false,
          sort_order:     editing.sort_order ?? 0,
        }
      : { ...BLANK_COMPONENT, sort_order: components.length * 10 }
    )
    setCompModal({ open: true, editing })
  }

  const closeCompModal = () => setCompModal({ open: false, editing: null })

  const handleSaveComp = async () => {
    if (!compForm.name.trim()) return toast.error('Component name is required')
    if (compForm.amount === '' || isNaN(Number(compForm.amount)))
      return toast.error('A valid amount is required')
    if (!detailStruct) return
    setSavingComp(true)
    try {
      const payload = {
        name:           compForm.name.trim(),
        component_type: compForm.component_type,
        amount_type:    compForm.amount_type,
        amount:         Number(compForm.amount),
        is_taxable:     compForm.is_taxable,
        is_statutory:   compForm.is_statutory,
        sort_order:     Number(compForm.sort_order) || 0,
      }
      if (compModal.editing) {
        const { error } = await supabase
          .from('salary_components')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', compModal.editing.id)
        if (error) throw error
        toast.success('Component updated')
      } else {
        const { error } = await supabase
          .from('salary_components')
          .insert([{ id: crypto.randomUUID(), structure_id: detailStruct.id, ...payload }])
        if (error) throw error
        toast.success('Component added')
      }
      closeCompModal()
      await fetchComponents(detailStruct.id)
      await fetchStructures()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingComp(false)
    }
  }

  const handleDeleteComp = async () => {
    if (!deleteComp) return
    try {
      const { error } = await supabase
        .from('salary_components')
        .delete()
        .eq('id', deleteComp.id)
      if (error) throw error
      toast.success('Component deleted')
      setDeleteComp(null)
      await fetchComponents(detailStruct.id)
      await fetchStructures()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── Employee assignment ───────────────────────────────────────────────────
  const openAssignModal = () => {
    setAssignForm({ ...BLANK_ASSIGNMENT, currency: detailStruct?.currency || 'USD' })
    setAssignModal(true)
  }

  const handleSaveAssign = async () => {
    if (!assignForm.employee_id)
      return toast.error('Select an employee')
    if (!assignForm.basic_salary || isNaN(Number(assignForm.basic_salary)))
      return toast.error('Enter a valid basic salary')
    if (!assignForm.effective_date)
      return toast.error('Effective date is required')
    if (!detailStruct) return
    setSavingAssign(true)
    try {
      const { error } = await supabase
        .from('employee_salary_assignments')
        .insert([{
          id:             crypto.randomUUID(),
          structure_id:   detailStruct.id,
          employee_id:    assignForm.employee_id,
          basic_salary:   Number(assignForm.basic_salary),
          currency:       assignForm.currency || detailStruct.currency,
          effective_date: assignForm.effective_date,
          notes:          assignForm.notes || null,
          is_active:      true,
        }])
      if (error) throw error
      toast.success('Employee assigned to structure')
      setAssignModal(false)
      await fetchAssignments(detailStruct.id)
      await fetchStructures()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingAssign(false)
    }
  }

  const handleDeactivateAssign = async () => {
    if (!deactivateAssign) return
    try {
      const { error } = await supabase
        .from('employee_salary_assignments')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', deactivateAssign.id)
      if (error) throw error
      toast.success('Assignment deactivated')
      setDeactivateAssign(null)
      await fetchAssignments(detailStruct.id)
      await fetchStructures()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ── KPI calculations ──────────────────────────────────────────────────────
  const totalStructures  = structures.length
  const activeStructures = structures.filter(s => s.is_active).length
  const totalAssigned    = structures.reduce(
    (acc, s) => acc + (s.employee_salary_assignments?.length ?? 0), 0
  )
  const currencyCounts   = structures.reduce((acc, s) => {
    const c = s.currency || 'USD'
    acc[c] = (acc[c] || 0) + (s.employee_salary_assignments?.length ?? 0)
    return acc
  }, {})
  const mostCommonCurrency = Object.entries(currencyCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  // ── Component totals ──────────────────────────────────────────────────────
  const totalEarnings   = components
    .filter(c => c.component_type === 'earning'   && c.amount_type === 'fixed')
    .reduce((a, c) => a + Number(c.amount || 0), 0)
  const totalDeductions = components
    .filter(c => c.component_type === 'deduction' && c.amount_type === 'fixed')
    .reduce((a, c) => a + Number(c.amount || 0), 0)

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <PageHeader
        title="Salary Structures"
        subtitle="Define pay structures, components and employee assignments"
      >
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openStructModal()}>
            <span className="material-icons">add</span> New Structure
          </button>
        )}
      </PageHeader>

      {/* ── KPI strip ────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Total Structures"
          value={totalStructures}
          icon="account_tree"
          color="gold"
        />
        <KPICard
          label="Active"
          value={activeStructures}
          icon="check_circle"
          color="green"
        />
        <KPICard
          label="Employees Assigned"
          value={totalAssigned}
          icon="people"
          color="blue"
        />
        <KPICard
          label="Most Common Currency"
          value={mostCommonCurrency}
          icon="currency_exchange"
          color="teal"
        />
      </div>

      {/* ── Structures table ─────────────────────────────────────────── */}
      <SectionCard padding={0} mb={0}>
        {loadingList ? (
          <Spinner text="Loading structures…" />
        ) : structures.length === 0 ? (
          <EmptyState
            icon="account_tree"
            message="No salary structures yet"
            action={canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => openStructModal()}>
                <span className="material-icons">add</span> New Structure
              </button>
            )}
          />
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Currency</th>
                  <th style={{ textAlign: 'center' }}>Components</th>
                  <th style={{ textAlign: 'center' }}>Employees</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {structures.map(s => (
                  <tr
                    key={s.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openDetail(s)}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--gold)' }}>{s.name}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                      {s.description || '—'}
                    </td>
                    <td>
                      <span className="badge badge-dim">{s.currency || 'USD'}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{s.salary_components?.length ?? 0}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <strong>{s.employee_salary_assignments?.length ?? 0}</strong>
                    </td>
                    <td>
                      <StatusBadge status={s.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-group-sm" onClick={e => e.stopPropagation()}>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="View details"
                          onClick={() => openDetail(s)}
                        >
                          <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                        </button>
                        {canEdit && (
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Edit structure"
                            onClick={() => openStructModal(s)}
                          >
                            <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════
          Detail modal — components + employees tabs
      ══════════════════════════════════════════════════════════════ */}
      <ModalDialog
        open={!!detailStruct}
        onClose={closeDetail}
        size="xl"
        title={detailStruct ? `${detailStruct.name} · Details` : ''}
      >
        {detailStruct && (
          <>
            {/* Structure summary strip */}
            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
              paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 16,
            }}>
              <StatusBadge status={detailStruct.is_active ? 'active' : 'inactive'} />
              <span className="badge badge-dim">{detailStruct.currency || 'USD'}</span>
              {detailStruct.description && (
                <span style={{ fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>
                  {detailStruct.description}
                </span>
              )}
              {canEdit && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => openStructModal(detailStruct)}
                >
                  <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit Structure
                </button>
              )}
            </div>

            {/* Tabs */}
            <TabNav
              tabs={[
                { id: 'components', label: 'Components', icon: 'list_alt', count: components.length },
                { id: 'employees',  label: 'Employees',  icon: 'people',   count: assignments.length },
              ]}
              active={detailTab}
              onChange={setDetailTab}
            />

            {/* ── Components tab ──────────────────────────────────── */}
            {detailTab === 'components' && (
              <div style={{ marginTop: 16 }}>
                {/* Totals summary */}
                {components.length > 0 && (
                  <div style={{
                    display: 'flex', gap: 24, padding: '10px 14px', marginBottom: 12,
                    background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--text-dim)' }}>Total Earnings (fixed): </span>
                      <strong style={{ color: 'var(--green)' }}>{fmt(totalEarnings)}</strong>
                    </span>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--text-dim)' }}>Total Deductions (fixed): </span>
                      <strong style={{ color: 'var(--red)' }}>{fmt(totalDeductions)}</strong>
                    </span>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--text-dim)' }}>Net (fixed): </span>
                      <strong style={{
                        color: (totalEarnings - totalDeductions) >= 0
                          ? 'var(--gold)' : 'var(--red)',
                      }}>
                        {fmt(totalEarnings - totalDeductions)}
                      </strong>
                    </span>
                  </div>
                )}

                {canEdit && (
                  <div style={{ marginBottom: 12, textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => openCompModal()}>
                      <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Component
                    </button>
                  </div>
                )}

                {loadingComps ? (
                  <Spinner text="Loading components…" />
                ) : components.length === 0 ? (
                  <EmptyState icon="list_alt" message="No components defined yet" />
                ) : (
                  <div className="table-wrap">
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th style={{ width: 48 }}>#</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Amount Type</th>
                          <th style={{ textAlign: 'right' }}>Amount / %</th>
                          <th style={{ textAlign: 'center' }}>Taxable</th>
                          <th style={{ textAlign: 'center' }}>Statutory</th>
                          {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {components.map(c => (
                          <tr key={c.id}>
                            <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                              {c.sort_order}
                            </td>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td>
                              <span className={`badge ${COMP_TYPE_BADGE[c.component_type] || 'badge-dim'}`}>
                                {prettyType(c.component_type)}
                              </span>
                            </td>
                            <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                              {c.amount_type === 'fixed' ? 'Fixed' : '% of Basic'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {c.amount_type === 'fixed'
                                ? fmt(c.amount)
                                : `${c.amount}%`
                              }
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {c.is_taxable
                                ? <span className="material-icons" style={{ fontSize: 16, color: 'var(--green)' }}>check_circle</span>
                                : <span className="material-icons" style={{ fontSize: 16, color: 'var(--border)' }}>radio_button_unchecked</span>
                              }
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {c.is_statutory
                                ? <span className="material-icons" style={{ fontSize: 16, color: 'var(--blue)' }}>check_circle</span>
                                : <span className="material-icons" style={{ fontSize: 16, color: 'var(--border)' }}>radio_button_unchecked</span>
                              }
                            </td>
                            {canEdit && (
                              <td style={{ textAlign: 'right' }}>
                                <div className="btn-group-sm">
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    title="Edit component"
                                    onClick={() => openCompModal(c)}
                                  >
                                    <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    title="Delete component"
                                    onClick={() => setDeleteComp({ id: c.id, name: c.name })}
                                  >
                                    <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Employees tab ───────────────────────────────────── */}
            {detailTab === 'employees' && (
              <div style={{ marginTop: 16 }}>
                {canEdit && (
                  <div style={{ marginBottom: 12, textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm" onClick={openAssignModal}>
                      <span className="material-icons" style={{ fontSize: 14 }}>person_add</span> Assign Employee
                    </button>
                  </div>
                )}

                {loadingAssign ? (
                  <Spinner text="Loading assignments…" />
                ) : assignments.length === 0 ? (
                  <EmptyState icon="people" message="No employees assigned to this structure" />
                ) : (
                  <div className="table-wrap">
                    <table className="stock-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Emp #</th>
                          <th style={{ textAlign: 'right' }}>Basic Salary</th>
                          <th>Currency</th>
                          <th>Effective Date</th>
                          <th>End Date</th>
                          <th>Status</th>
                          {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map(a => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 600 }}>{a.employees?.name ?? '—'}</td>
                            <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                              {a.employees?.employee_number ?? '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {fmt(a.basic_salary)}
                            </td>
                            <td>
                              <span className="badge badge-dim">{a.currency || '—'}</span>
                            </td>
                            <td style={{ fontSize: 13 }}>{a.effective_date || '—'}</td>
                            <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                              {a.end_date || '—'}
                            </td>
                            <td>
                              <StatusBadge status={a.is_active ? 'active' : 'inactive'} />
                            </td>
                            {canEdit && (
                              <td style={{ textAlign: 'right' }}>
                                {a.is_active && (
                                  <button
                                    className="btn btn-danger btn-sm"
                                    title="Deactivate assignment"
                                    onClick={() => setDeactivateAssign({
                                      id:      a.id,
                                      empName: a.employees?.name ?? 'this employee',
                                    })}
                                  >
                                    <span className="material-icons" style={{ fontSize: 14 }}>person_remove</span>
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <ModalActions>
              <button className="btn btn-secondary" onClick={closeDetail}>Close</button>
            </ModalActions>
          </>
        )}
      </ModalDialog>

      {/* ══════════════════════════════════════════════════════════════
          Structure create / edit modal
      ══════════════════════════════════════════════════════════════ */}
      <ModalDialog
        open={structModal.open}
        onClose={closeStructModal}
        title={structModal.editing
          ? `Edit Structure · ${structModal.editing.name}`
          : 'New Salary Structure'
        }
      >
        <div className="form-group">
          <label>Name *</label>
          <input
            type="text"
            className="form-control"
            value={structForm.name}
            onChange={e => setStructForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Executive Pay Scale"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            className="form-control"
            rows={2}
            value={structForm.description}
            onChange={e => setStructForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Optional description"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Currency *</label>
            <select
              className="form-control"
              value={structForm.currency}
              onChange={e => setStructForm(p => ({ ...p, currency: e.target.value }))}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label style={{ visibility: 'hidden', display: 'block', marginBottom: 6 }}>Active</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={structForm.is_active}
                onChange={e => setStructForm(p => ({ ...p, is_active: e.target.checked }))}
              />
              <span>Active</span>
            </label>
          </div>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeStructModal} disabled={savingStruct}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveStruct} disabled={savingStruct}>
            {savingStruct ? 'Saving…' : structModal.editing ? 'Save Changes' : 'Create Structure'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ══════════════════════════════════════════════════════════════
          Component add / edit modal
      ══════════════════════════════════════════════════════════════ */}
      <ModalDialog
        open={compModal.open}
        onClose={closeCompModal}
        title={compModal.editing
          ? `Edit Component · ${compModal.editing.name}`
          : 'Add Salary Component'
        }
      >
        <div className="form-group">
          <label>Component Name *</label>
          <input
            type="text"
            className="form-control"
            value={compForm.name}
            onChange={e => setCompForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Basic Salary, Transport Allowance"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Type *</label>
            <select
              className="form-control"
              value={compForm.component_type}
              onChange={e => setCompForm(p => ({ ...p, component_type: e.target.value }))}
            >
              {COMPONENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Amount Type *</label>
            <select
              className="form-control"
              value={compForm.amount_type}
              onChange={e => setCompForm(p => ({ ...p, amount_type: e.target.value }))}
            >
              {AMOUNT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              {compForm.amount_type === 'percent_of_basic' ? 'Percentage (%)' : 'Amount'} *
            </label>
            <input
              type="number"
              className="form-control"
              value={compForm.amount}
              min={0}
              step="0.01"
              onChange={e => setCompForm(p => ({ ...p, amount: e.target.value }))}
              placeholder={compForm.amount_type === 'percent_of_basic' ? 'e.g. 10' : 'e.g. 500.00'}
            />
          </div>

          <div className="form-group">
            <label>Sort Order</label>
            <input
              type="number"
              className="form-control"
              value={compForm.sort_order}
              min={0}
              step={1}
              onChange={e => setCompForm(p => ({ ...p, sort_order: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={compForm.is_taxable}
              onChange={e => setCompForm(p => ({ ...p, is_taxable: e.target.checked }))}
            />
            <span>Taxable</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={compForm.is_statutory}
              onChange={e => setCompForm(p => ({ ...p, is_statutory: e.target.checked }))}
            />
            <span>Statutory</span>
          </label>
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={closeCompModal} disabled={savingComp}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveComp} disabled={savingComp}>
            {savingComp ? 'Saving…' : compModal.editing ? 'Save Changes' : 'Add Component'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ══════════════════════════════════════════════════════════════
          Assign employee modal
      ══════════════════════════════════════════════════════════════ */}
      <ModalDialog
        open={assignModal}
        onClose={() => setAssignModal(false)}
        title={`Assign Employee · ${detailStruct?.name ?? ''}`}
      >
        <div className="form-group">
          <label>Employee *</label>
          <select
            className="form-control"
            value={assignForm.employee_id}
            onChange={e => setAssignForm(p => ({ ...p, employee_id: e.target.value }))}
          >
            <option value="">Select employee</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}{e.employee_number ? ` (${e.employee_number})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Basic Salary *</label>
            <input
              type="number"
              className="form-control"
              value={assignForm.basic_salary}
              min={0}
              step="0.01"
              onChange={e => setAssignForm(p => ({ ...p, basic_salary: e.target.value }))}
              placeholder="e.g. 1500.00"
            />
          </div>

          <div className="form-group">
            <label>Currency</label>
            <select
              className="form-control"
              value={assignForm.currency}
              onChange={e => setAssignForm(p => ({ ...p, currency: e.target.value }))}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Effective Date *</label>
          <input
            type="date"
            className="form-control"
            value={assignForm.effective_date}
            onChange={e => setAssignForm(p => ({ ...p, effective_date: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            className="form-control"
            rows={2}
            value={assignForm.notes}
            onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Optional notes about this assignment"
          />
        </div>

        <ModalActions>
          <button
            className="btn btn-secondary"
            onClick={() => setAssignModal(false)}
            disabled={savingAssign}
          >
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSaveAssign} disabled={savingAssign}>
            {savingAssign ? 'Assigning…' : 'Assign Employee'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ══════════════════════════════════════════════════════════════
          Confirm dialogs
      ══════════════════════════════════════════════════════════════ */}
      <ConfirmDialog
        open={!!deleteComp}
        onClose={() => setDeleteComp(null)}
        onConfirm={handleDeleteComp}
        title="Delete Component"
        message={`Delete component "${deleteComp?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      <ConfirmDialog
        open={!!deactivateAssign}
        onClose={() => setDeactivateAssign(null)}
        onConfirm={handleDeactivateAssign}
        title="Deactivate Assignment"
        message={`Deactivate salary assignment for ${deactivateAssign?.empName}? The record will be kept but marked inactive.`}
        confirmLabel="Deactivate"
        danger
      />

    </div>
  )
}
