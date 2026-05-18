// src/pages/HR/LeavePolicies.jsx
// Full CRUD for leave policies + entitlements + assignments.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useHR } from '../../contexts/HRContext'
import { useCanApprove } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import {
  PageHeader, KPICard, StatusBadge, EmptyState, SectionCard,
  ModalDialog, ModalActions, ConfirmDialog,
} from '../../components/ui'
import { allocateLeavesByPolicy } from '../../engine/leaveEngine'

const today = new Date().toISOString().split('T')[0]
const currentYear = new Date().getFullYear()

export default function LeavePolicies() {
  const { user } = useAuth()
  const { employees, leaveTypes } = useHR()
  const canApprove = useCanApprove('hr', 'leave_policies')

  // ── Data state ──────────────────────────────────────────────
  const [policies,    setPolicies]    = useState([])
  const [selected,    setSelected]    = useState(null)   // selected policy
  const [details,     setDetails]     = useState([])     // leave_policy_details for selected
  const [assignments, setAssignments] = useState([])     // leave_policy_assignments for selected
  const [periods,     setPeriods]     = useState([])
  const [loading,     setLoading]     = useState(true)

  // KPI
  const [kpiActive,      setKpiActive]      = useState(0)
  const [kpiAssignments, setKpiAssignments] = useState(0)

  // ── Modal state ─────────────────────────────────────────────
  const [policyModal, setPolicyModal] = useState({ open: false, mode: 'new', form: { name: '', description: '' } })
  const [detailModal, setDetailModal] = useState({ open: false, form: { leave_type_id: '', annual_allocation: '' } })
  const [assignModal, setAssignModal] = useState({ open: false, form: { employee_id: '', leave_period_id: '', effective_from: today } })
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null })
  const [saving, setSaving] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────
  const fetchPolicies = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('leave_policies')
        .select('*')
        .order('name')
      if (error) throw error
      setPolicies(data || [])
      setKpiActive((data || []).filter(p => p.is_active).length)

      // Total assignments this year
      const { count } = await supabase
        .from('leave_policy_assignments')
        .select('id', { count: 'exact', head: true })
        .gte('effective_from', `${currentYear}-01-01`)
      setKpiAssignments(count || 0)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const fetchPeriods = async () => {
    const { data } = await supabase.from('leave_periods').select('*').order('from_date', { ascending: false })
    setPeriods(data || [])
  }

  const fetchPolicyDetails = async (policyId) => {
    const { data } = await supabase
      .from('leave_policy_details')
      .select('*, leave_types(name, color)')
      .eq('policy_id', policyId)
    setDetails(data || [])
  }

  const fetchAssignments = async (policyId) => {
    const { data } = await supabase
      .from('leave_policy_assignments')
      .select('*, employees(name, employee_number), leave_periods(name)')
      .eq('leave_policy_id', policyId)
      .order('effective_from', { ascending: false })
    setAssignments(data || [])
  }

  useEffect(() => { fetchPolicies(); fetchPeriods() }, [])

  const selectPolicy = (policy) => {
    setSelected(policy)
    fetchPolicyDetails(policy.id)
    fetchAssignments(policy.id)
  }

  // ── Policy CRUD ──────────────────────────────────────────────
  const openNewPolicy = () =>
    setPolicyModal({ open: true, mode: 'new', form: { name: '', description: '' } })

  const openEditPolicy = () =>
    setPolicyModal({ open: true, mode: 'edit', form: { name: selected.name, description: selected.description || '' } })

  const savePolicy = async () => {
    if (!policyModal.form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      if (policyModal.mode === 'new') {
        const { data, error } = await supabase
          .from('leave_policies')
          .insert([{ id: crypto.randomUUID(), name: policyModal.form.name, description: policyModal.form.description, is_active: true }])
          .select().single()
        if (error) throw error
        toast.success('Policy created')
        setPolicyModal({ open: false, mode: 'new', form: { name: '', description: '' } })
        await fetchPolicies()
        selectPolicy(data)
      } else {
        const { error } = await supabase
          .from('leave_policies')
          .update({ name: policyModal.form.name, description: policyModal.form.description })
          .eq('id', selected.id)
        if (error) throw error
        toast.success('Policy updated')
        setPolicyModal({ open: false, mode: 'new', form: { name: '', description: '' } })
        await fetchPolicies()
        setSelected(prev => ({ ...prev, name: policyModal.form.name, description: policyModal.form.description }))
      }
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const deletePolicy = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('leave_policies').delete().eq('id', confirmDelete.id)
      if (error) throw error
      toast.success('Policy deleted')
      setConfirmDelete({ open: false, id: null })
      setSelected(null)
      setDetails([])
      setAssignments([])
      await fetchPolicies()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // ── Policy detail (entitlement) CRUD ─────────────────────────
  const saveDetail = async () => {
    if (!detailModal.form.leave_type_id) return toast.error('Select a leave type')
    if (!detailModal.form.annual_allocation || Number(detailModal.form.annual_allocation) <= 0)
      return toast.error('Annual allocation must be > 0')
    setSaving(true)
    try {
      const { error } = await supabase.from('leave_policy_details').insert([{
        id: crypto.randomUUID(),
        policy_id: selected.id,
        leave_type_id: detailModal.form.leave_type_id,
        annual_allocation: Number(detailModal.form.annual_allocation),
      }])
      if (error) throw error
      toast.success('Leave type added to policy')
      setDetailModal({ open: false, form: { leave_type_id: '', annual_allocation: '' } })
      fetchPolicyDetails(selected.id)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const removeDetail = async (detailId) => {
    if (!window.confirm('Remove this leave type from the policy?')) return
    try {
      const { error } = await supabase.from('leave_policy_details').delete().eq('id', detailId)
      if (error) throw error
      toast.success('Removed')
      fetchPolicyDetails(selected.id)
    } catch (err) { toast.error(err.message) }
  }

  // ── Policy assignment ────────────────────────────────────────
  const saveAssignment = async () => {
    const { employee_id, leave_period_id, effective_from } = assignModal.form
    if (!employee_id) return toast.error('Select an employee')
    if (!effective_from) return toast.error('Effective from date is required')
    setSaving(true)
    try {
      // Insert assignment record
      const { error: assignErr } = await supabase.from('leave_policy_assignments').insert([{
        id: crypto.randomUUID(),
        employee_id,
        leave_policy_id: selected.id,
        leave_period_id: leave_period_id || null,
        effective_from,
        status: 'active',
      }])
      if (assignErr) throw assignErr

      let allocationCount = 0
      // If period selected, allocate leaves via engine
      if (leave_period_id) {
        const ids = await allocateLeavesByPolicy(employee_id, selected.id, leave_period_id, user?.full_name || 'HR')
        allocationCount = ids.length
      }

      toast.success(
        allocationCount > 0
          ? `Policy assigned and ${allocationCount} leave allocation(s) created`
          : 'Policy assigned successfully'
      )
      setAssignModal({ open: false, form: { employee_id: '', leave_period_id: '', effective_from: today } })
      fetchAssignments(selected.id)
      await fetchPolicies()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Leave Policies" subtitle="Manage leave entitlements and policy assignments">
        <button className="btn btn-primary" onClick={openNewPolicy}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> New Policy
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Active Policies" value={kpiActive} icon="policy" color="green" />
        <KPICard label="Assignments This Year" value={kpiAssignments} icon="assignment_ind" color="gold" />
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left: Policy list ─────────────────────────────── */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <SectionCard title="Policies" padding={12}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
            ) : policies.length === 0 ? (
              <EmptyState icon="policy" message="No policies yet" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {policies.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selectPolicy(p)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                      border: `1px solid ${selected?.id === p.id ? 'var(--gold)' : 'var(--border)'}`,
                      background: selected?.id === p.id ? 'var(--gold-alpha, rgba(212,175,55,.1))' : 'var(--surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>
                        {p.description.slice(0, 60)}{p.description.length > 60 ? '…' : ''}
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <StatusBadge status={p.is_active ? 'active' : 'inactive'} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Right: Policy detail ──────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 48, opacity: .25, display: 'block', marginBottom: 12 }}>policy</span>
              Select a policy from the left to view details
            </div>
          ) : (
            <>
              {/* Policy header */}
              <SectionCard
                title={selected.name}
                actions={
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={openEditPolicy}>
                      <span className="material-icons" style={{ fontSize: 14 }}>edit</span> Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ open: true, id: selected.id })}>
                      <span className="material-icons" style={{ fontSize: 14 }}>delete</span> Delete
                    </button>
                  </>
                }
                mb={16}
              >
                {selected.description && (
                  <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: '8px 0 0' }}>{selected.description}</p>
                )}
                <div style={{ marginTop: 8 }}>
                  <StatusBadge status={selected.is_active ? 'active' : 'inactive'} />
                </div>
              </SectionCard>

              {/* Leave Entitlements */}
              <SectionCard
                title="Leave Entitlements"
                mb={16}
                actions={
                  <button className="btn btn-primary btn-sm"
                    onClick={() => setDetailModal({ open: true, form: { leave_type_id: '', annual_allocation: '' } })}>
                    <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Leave Type
                  </button>
                }
              >
                {details.length === 0 ? (
                  <EmptyState icon="event_note" message="No leave types assigned to this policy" />
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Leave Type</th>
                        <th>Annual Days Allocated</th>
                        <th style={{ width: 60 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {details.map(d => (
                        <tr key={d.id}>
                          <td>
                            {d.leave_types?.color && (
                              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: d.leave_types.color, marginRight: 6 }} />
                            )}
                            {d.leave_types?.name || '—'}
                          </td>
                          <td style={{ fontWeight: 700 }}>{d.annual_allocation}</td>
                          <td>
                            <button className="btn btn-danger btn-sm" onClick={() => removeDetail(d.id)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>

              {/* Active Assignments */}
              <SectionCard
                title="Active Assignments"
                actions={
                  <button className="btn btn-primary btn-sm"
                    onClick={() => setAssignModal({ open: true, form: { employee_id: '', leave_period_id: '', effective_from: today } })}>
                    <span className="material-icons" style={{ fontSize: 14 }}>person_add</span> Assign Policy
                  </button>
                }
              >
                {assignments.length === 0 ? (
                  <EmptyState icon="assignment_ind" message="No assignments for this policy" />
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Period</th>
                        <th>Effective From</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(a => (
                        <tr key={a.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{a.employees?.name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.employees?.employee_number}</div>
                          </td>
                          <td>{a.leave_periods?.name || '—'}</td>
                          <td>{a.effective_from}</td>
                          <td><StatusBadge status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {/* ── New / Edit Policy Modal ──────────────────────────────── */}
      <ModalDialog
        open={policyModal.open}
        onClose={() => setPolicyModal(p => ({ ...p, open: false }))}
        title={policyModal.mode === 'new' ? 'New Policy' : 'Edit Policy'}
      >
        <div className="form-group">
          <label>Policy Name *</label>
          <input className="form-control" value={policyModal.form.name}
            onChange={e => setPolicyModal(p => ({ ...p, form: { ...p.form, name: e.target.value } }))}
            placeholder="e.g. Standard Employee Policy" />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea className="form-control" rows={3} value={policyModal.form.description}
            onChange={e => setPolicyModal(p => ({ ...p, form: { ...p.form, description: e.target.value } }))}
            placeholder="Optional description" />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setPolicyModal(p => ({ ...p, open: false }))}>Cancel</button>
          <button className="btn btn-primary" onClick={savePolicy} disabled={saving}>
            {saving ? 'Saving…' : policyModal.mode === 'new' ? 'Create Policy' : 'Save Changes'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Add Leave Type to Policy Modal ──────────────────────── */}
      <ModalDialog
        open={detailModal.open}
        onClose={() => setDetailModal({ open: false, form: { leave_type_id: '', annual_allocation: '' } })}
        title="Add Leave Type to Policy"
      >
        <div className="form-group">
          <label>Leave Type *</label>
          <select className="form-control" value={detailModal.form.leave_type_id}
            onChange={e => setDetailModal(d => ({ ...d, form: { ...d.form, leave_type_id: e.target.value } }))}>
            <option value="">Select leave type…</option>
            {leaveTypes.filter(lt => lt.is_active).map(lt => (
              <option key={lt.id} value={lt.id}>{lt.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Annual Days Allocated *</label>
          <input type="number" className="form-control" min="0" step="0.5"
            value={detailModal.form.annual_allocation}
            onChange={e => setDetailModal(d => ({ ...d, form: { ...d.form, annual_allocation: e.target.value } }))}
            placeholder="e.g. 14" />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setDetailModal({ open: false, form: { leave_type_id: '', annual_allocation: '' } })}>Cancel</button>
          <button className="btn btn-primary" onClick={saveDetail} disabled={saving}>
            {saving ? 'Saving…' : 'Add Leave Type'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Assign Policy Modal ──────────────────────────────────── */}
      <ModalDialog
        open={assignModal.open}
        onClose={() => setAssignModal({ open: false, form: { employee_id: '', leave_period_id: '', effective_from: today } })}
        title="Assign Policy to Employee"
      >
        <div className="form-group">
          <label>Employee *</label>
          <select className="form-control" value={assignModal.form.employee_id}
            onChange={e => setAssignModal(a => ({ ...a, form: { ...a.form, employee_id: e.target.value } }))}>
            <option value="">Select employee…</option>
            {employees.filter(e => e.status !== 'Terminated').map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Leave Period</label>
          <select className="form-control" value={assignModal.form.leave_period_id}
            onChange={e => setAssignModal(a => ({ ...a, form: { ...a.form, leave_period_id: e.target.value } }))}>
            <option value="">None / No auto-allocation</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.from_date} → {p.to_date})</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            If a period is selected, leaves will be automatically allocated based on this policy.
          </div>
        </div>
        <div className="form-group">
          <label>Effective From *</label>
          <input type="date" className="form-control" value={assignModal.form.effective_from}
            onChange={e => setAssignModal(a => ({ ...a, form: { ...a.form, effective_from: e.target.value } }))} />
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setAssignModal({ open: false, form: { employee_id: '', leave_period_id: '', effective_from: today } })}>Cancel</button>
          <button className="btn btn-primary" onClick={saveAssignment} disabled={saving}>
            {saving ? 'Assigning…' : 'Assign Policy'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ── Confirm Delete ───────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete.open}
        title="Delete Policy"
        message="Are you sure you want to delete this policy? This action cannot be undone."
        onConfirm={deletePolicy}
        onCancel={() => setConfirmDelete({ open: false, id: null })}
      />
    </div>
  )
}
