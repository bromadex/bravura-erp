// src/components/workflow/WorkflowBuilder.jsx
// ============================================================
// Dynamic Workflow Builder — Full CRUD UI for admins
// Create / Edit / Delete workflows + steps
// Department-specific routing, role assignment, step reordering
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getAllWorkflows, saveWorkflow, deleteWorkflow } from '../../engine/workflowEngine'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────
const MODULE_OPTIONS = [
  { value: 'hr',          label: '👥 Human Resources'  },
  { value: 'procurement', label: '🛒 Procurement'       },
  { value: 'fuel',        label: '⛽ Fuel'              },
  { value: 'fleet',       label: '🚛 Fleet'             },
  { value: 'campsite',    label: '🏕 Campsite'          },
  { value: 'inventory',   label: '📦 Inventory'         },
  { value: 'finance',     label: '💰 Finance'           },
]

const ENTITY_OPTIONS = {
  hr:          [
    { value: 'leave_requests',      label: 'Leave Requests'     },
    { value: 'travel_requests',     label: 'Travel Requests'    },
    { value: 'employee_attendance', label: 'Timesheets'         },
  ],
  procurement: [
    { value: 'store_requisitions',    label: 'Store Requisitions'    },
    { value: 'purchase_requisitions', label: 'Purchase Requisitions' },
    { value: 'purchase_orders',       label: 'Purchase Orders'       },
  ],
  fuel:    [{ value: 'fuel_requests', label: 'Fuel Requests' }],
  fleet:   [{ value: 'fleet_requests', label: 'Fleet Requests' }],
  campsite:[{ value: 'camp_assignments', label: 'Camp Assignments' }],
  inventory:[{ value: 'stock_adjustments', label: 'Stock Adjustments' }],
  finance: [{ value: 'payment_requests', label: 'Payment Requests' }],
}

const ROLES = [
  { value: 'role_super_admin',   label: 'Super Admin'         },
  { value: 'role_hr_manager',    label: 'HR Manager'          },
  { value: 'role_dept_manager',  label: 'Department Manager'  },
  { value: 'role_storekeeper',   label: 'Storekeeper'         },
  { value: 'role_fuel_attendant',label: 'Fuel Attendant'      },
  { value: 'role_viewer',        label: 'Viewer'              },
]

const STATUS_PRESETS = {
  leave_requests:        ['draft','pending_supervisor','pending_hr','approved','rejected'],
  travel_requests:       ['draft','pending_supervisor','pending_hr','approved','rejected'],
  employee_attendance:   ['pending','approved','rejected'],
  store_requisitions:    ['draft','submitted','approved','rejected','fulfilled'],
  purchase_requisitions: ['draft','submitted','approved','rejected'],
  purchase_orders:       ['draft','pending','approved','rejected','received'],
}

const DEFAULT_STEP = () => ({
  _id:             crypto.randomUUID(),
  step_name:       '',
  required_role:   'role_dept_manager',
  approval_type:   'any',
  specific_user_id: '',
  description:     '',
  status_on_entry: 'pending',
  status_on_pass:  'approved',
  status_on_fail:  'rejected',
})

// ── STATUS BADGE ──────────────────────────────────────────────
function StatusBadge({ active }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
      color:       active ? 'var(--green)' : 'var(--text-dim)',
      background:  active ? 'rgba(34,197,94,.1)' : 'var(--surface2)',
      border:      `1px solid ${active ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ── MODULE ICON ───────────────────────────────────────────────
function moduleIcon(module) {
  return { hr: 'people', procurement: 'shopping_cart', fuel: 'local_gas_station',
           fleet: 'directions_car', campsite: 'hotel', inventory: 'inventory_2',
           finance: 'receipt_long' }[module] || 'settings'
}

// ── STEP CARD ─────────────────────────────────────────────────
function StepCard({ step, index, total, onChange, onRemove, onMoveUp, onMoveDown, users, entityType }) {
  const statuses = STATUS_PRESETS[entityType] || []

  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 12, padding: 16,
      border: '1px solid var(--border)',
      borderLeft: '4px solid var(--gold)',
      position: 'relative',
    }}>
      {/* Step header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--gold)', color: '#0b0f1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>{index + 1}</div>
        <input
          className="form-control"
          placeholder="Step name (e.g. Supervisor Review)"
          value={step.step_name}
          onChange={e => onChange({ ...step, step_name: e.target.value })}
          style={{ fontWeight: 600 }}
        />
        {/* Reorder buttons */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={index === 0}
            style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--border)' : 'var(--text-dim)', padding: 4 }}>
            <span className="material-icons" style={{ fontSize: 18 }}>arrow_upward</span>
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--border)' : 'var(--text-dim)', padding: 4 }}>
            <span className="material-icons" style={{ fontSize: 18 }}>arrow_downward</span>
          </button>
          <button onClick={onRemove} disabled={total === 1}
            style={{ background: 'none', border: 'none', cursor: total === 1 ? 'default' : 'pointer', color: total === 1 ? 'var(--border)' : 'var(--red)', padding: 4 }}>
            <span className="material-icons" style={{ fontSize: 18 }}>delete</span>
          </button>
        </div>
      </div>

      {/* Step fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Required Role *</label>
          <select className="form-control" value={step.required_role}
            onChange={e => onChange({ ...step, required_role: e.target.value })}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Approval Type</label>
          <select className="form-control" value={step.approval_type}
            onChange={e => onChange({ ...step, approval_type: e.target.value })}>
            <option value="any">Any one approver</option>
            <option value="all">All must approve</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Status on Entry</label>
          <input list={`entry-${step._id}`} className="form-control" value={step.status_on_entry}
            onChange={e => onChange({ ...step, status_on_entry: e.target.value })} />
          <datalist id={`entry-${step._id}`}>
            {statuses.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Status on Approve</label>
          <input list={`pass-${step._id}`} className="form-control" value={step.status_on_pass}
            onChange={e => onChange({ ...step, status_on_pass: e.target.value })} />
          <datalist id={`pass-${step._id}`}>
            {statuses.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
      </div>

      {/* Optional: specific user override */}
      <div className="form-group" style={{ margin: '10px 0 0' }}>
        <label className="form-label" style={{ fontSize: 11 }}>
          Specific Approver Override <span style={{ color: 'var(--text-dim)' }}>(optional — overrides role)</span>
        </label>
        <select className="form-control" value={step.specific_user_id || ''}
          onChange={e => onChange({ ...step, specific_user_id: e.target.value || null })}>
          <option value="">— Use role-based (default) —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
        </select>
      </div>

      {/* Description */}
      <div className="form-group" style={{ margin: '10px 0 0' }}>
        <label className="form-label" style={{ fontSize: 11 }}>Instructions for approver (optional)</label>
        <input className="form-control" placeholder="e.g. Check leave balance before approving"
          value={step.description} onChange={e => onChange({ ...step, description: e.target.value })} />
      </div>

      {/* Final step indicator */}
      {index === total - 1 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
          <span className="material-icons" style={{ fontSize: 14 }}>task_alt</span>
          Final step — completion ends workflow
        </div>
      )}
    </div>
  )
}

// ── WORKFLOW FLOW DIAGRAM ─────────────────────────────────────
function FlowDiagram({ steps }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '12px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginRight: 4 }}>START</div>
      {steps.map((s, i) => (
        <div key={s._id || i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>arrow_forward</span>
          <div style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: i === steps.length - 1 ? 'rgba(34,197,94,.12)' : 'rgba(251,191,36,.1)',
            color: i === steps.length - 1 ? 'var(--green)' : 'var(--gold)',
            border: `1px solid ${i === steps.length - 1 ? 'rgba(34,197,94,.3)' : 'rgba(251,191,36,.3)'}`,
            whiteSpace: 'nowrap',
          }}>
            {s.step_name || `Step ${i + 1}`}
          </div>
        </div>
      ))}
      <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>arrow_forward</span>
      <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>
        COMPLETE
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function WorkflowBuilder() {
  const { user } = useAuth()
  const [workflows,   setWorkflows]   = useState([])
  const [departments, setDepartments] = useState([])
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(null)

  // Form state
  const [wfId,          setWfId]          = useState(null)
  const [wfName,        setWfName]        = useState('')
  const [wfModule,      setWfModule]      = useState('hr')
  const [wfEntity,      setWfEntity]      = useState('leave_requests')
  const [wfDescription, setWfDescription] = useState('')
  const [wfDept,        setWfDept]        = useState('')
  const [wfDeptName,    setWfDeptName]    = useState('')
  const [wfActive,      setWfActive]      = useState(true)
  const [wfPriority,    setWfPriority]    = useState(0)
  const [steps,         setSteps]         = useState([DEFAULT_STEP()])

  const load = useCallback(async () => {
    setLoading(true)
    const [wfData, deptData, userData] = await Promise.all([
      getAllWorkflows(),
      supabase.from('departments').select('id, name').order('name').then(r => r.data || []),
      supabase.from('app_users').select('id, full_name, username').order('full_name').then(r => r.data || []),
    ])
    setWorkflows(wfData)
    setDepartments(deptData)
    setUsers(userData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setWfId(null); setWfName(''); setWfModule('hr'); setWfEntity('leave_requests')
    setWfDescription(''); setWfDept(''); setWfDeptName(''); setWfActive(true)
    setWfPriority(0); setSteps([DEFAULT_STEP()])
    setShowBuilder(true)
  }

  const openEdit = (wf) => {
    const wfSteps = (wf.workflow_steps || [])
      .sort((a, b) => a.step_order - b.step_order)
      .map(s => ({ ...s, _id: s.id }))
    setWfId(wf.id); setWfName(wf.name); setWfModule(wf.module)
    setWfEntity(wf.entity_type); setWfDescription(wf.description || '')
    setWfDept(wf.department_filter || ''); setWfDeptName(wf.department_name || '')
    setWfActive(wf.is_active); setWfPriority(wf.priority || 0)
    setSteps(wfSteps.length ? wfSteps : [DEFAULT_STEP()])
    setShowBuilder(true)
  }

  const closeBuilder = () => { setShowBuilder(false) }

  // Step management
  const addStep = () => {
    const last = steps[steps.length - 1]
    const next = DEFAULT_STEP()
    // Auto-fill status flow from previous step's status_on_pass
    next.status_on_entry = last?.status_on_pass || 'pending'
    next.status_on_pass  = 'approved'
    setSteps(prev => [...prev, next])
  }

  const removeStep = (idx) => setSteps(prev => prev.filter((_, i) => i !== idx))

  const updateStep = (idx, updated) => setSteps(prev => prev.map((s, i) => i === idx ? updated : s))

  const moveUp = (idx) => {
    if (idx === 0) return
    setSteps(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a })
  }

  const moveDown = (idx) => {
    setSteps(prev => { if (idx === prev.length - 1) return prev; const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!wfName.trim())  return toast.error('Workflow name is required')
    if (!wfEntity)       return toast.error('Select a module process')
    if (steps.some(s => !s.step_name.trim())) return toast.error('All steps must have a name')
    if (steps.some(s => !s.required_role))    return toast.error('All steps must have a required role')

    setSaving(true)
    try {
      const dept = departments.find(d => d.id === wfDept)
      const wfPayload = {
        id: wfId, name: wfName.trim(), module: wfModule, entity_type: wfEntity,
        description: wfDescription.trim(), department_filter: wfDept || null,
        department_name: dept?.name || null, is_active: wfActive, priority: parseInt(wfPriority) || 0,
      }
      await saveWorkflow(wfPayload, steps)
      toast.success(wfId ? 'Workflow updated ✓' : 'Workflow created ✓')
      closeBuilder()
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (wf) => {
    if (!window.confirm(`Delete workflow "${wf.name}"? This cannot be undone.\nExisting active instances will be unaffected.`)) return
    setDeleting(wf.id)
    try {
      await deleteWorkflow(wf.id)
      toast.success('Workflow deleted')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally { setDeleting(null) }
  }

  const toggleActive = async (wf) => {
    await supabase.from('workflows').update({ is_active: !wf.is_active, updated_at: new Date().toISOString() }).eq('id', wf.id)
    await load()
    toast.success(wf.is_active ? 'Workflow deactivated' : 'Workflow activated')
  }

  const entityOptions = ENTITY_OPTIONS[wfModule] || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Builder</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} configured
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <span className="material-icons">add</span> New Workflow
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading workflows…</div>
      ) : workflows.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 52, opacity: 0.25 }}>account_tree</span>
          <p>No workflows configured yet.</p>
          <button className="btn btn-primary" onClick={openNew} style={{ marginTop: 12 }}>Create First Workflow</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workflows.map(wf => {
            const wfSteps = (wf.workflow_steps || []).sort((a, b) => a.step_order - b.step_order)
            return (
              <div key={wf.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  {/* Icon */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(251,191,36,.12)', border: '1px solid rgba(251,191,36,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 22 }}>{moduleIcon(wf.module)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{wf.name}</div>
                      <StatusBadge active={wf.is_active} />
                      {wf.department_filter && (
                        <span style={{ fontSize: 11, color: 'var(--teal)', background: 'rgba(45,212,191,.1)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(45,212,191,.25)' }}>
                          {wf.department_name || wf.department_filter}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                      Module: <strong style={{ color: 'var(--text)' }}>{wf.module}</strong>
                      {' · '}Process: <strong style={{ color: 'var(--text)' }}>{wf.entity_type}</strong>
                      {' · '}{wfSteps.length} step{wfSteps.length !== 1 ? 's' : ''}
                    </div>
                    {wf.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{wf.description}</div>
                    )}
                    {/* Flow diagram */}
                    {wfSteps.length > 0 && (
                      <FlowDiagram steps={wfSteps.map(s => ({ ...s, _id: s.id }))} />
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(wf)}
                      title={wf.is_active ? 'Deactivate' : 'Activate'}>
                      <span className="material-icons" style={{ fontSize: 15 }}>{wf.is_active ? 'pause' : 'play_arrow'}</span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(wf)} title="Edit">
                      <span className="material-icons" style={{ fontSize: 15 }}>edit</span>
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(wf)}
                      disabled={deleting === wf.id} title="Delete">
                      <span className="material-icons" style={{ fontSize: 15 }}>delete</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Workflow Builder Modal ─────────────────────────────── */}
      {showBuilder && (
        <>
          <div onClick={closeBuilder}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 700 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: '95%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto',
            background: 'var(--surface)', borderRadius: 20,
            border: '1px solid var(--border2)', zIndex: 701,
          }}>
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <span className="material-icons" style={{ color: 'var(--gold)', fontSize: 22 }}>account_tree</span>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{wfId ? 'Edit' : 'Create'} Workflow</div>
              <div style={{ flex: 1 }} />
              <button onClick={closeBuilder} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: 24 }}>
              {/* ── Workflow Details ─────────────────────────── */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
                  Workflow Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Workflow Name *</label>
                    <input className="form-control" required placeholder="e.g. Leave Request — Mining Operations"
                      value={wfName} onChange={e => setWfName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Module *</label>
                    <select className="form-control" value={wfModule}
                      onChange={e => { setWfModule(e.target.value); setWfEntity(ENTITY_OPTIONS[e.target.value]?.[0]?.value || '') }}>
                      {MODULE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Process *</label>
                    <select className="form-control" value={wfEntity}
                      onChange={e => setWfEntity(e.target.value)}>
                      {entityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department <span style={{ color: 'var(--text-dim)' }}>(optional — blank = all)</span></label>
                    <select className="form-control" value={wfDept}
                      onChange={e => { const d = departments.find(x => x.id === e.target.value); setWfDept(e.target.value); setWfDeptName(d?.name || '') }}>
                      <option value="">— All Departments —</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority <span style={{ color: 'var(--text-dim)' }}>(higher = preferred when multiple match)</span></label>
                    <input type="number" className="form-control" min={0} max={100}
                      value={wfPriority} onChange={e => setWfPriority(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Description</label>
                    <input className="form-control" placeholder="Describe when this workflow applies…"
                      value={wfDescription} onChange={e => setWfDescription(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label className="form-label" style={{ margin: 0 }}>Active</label>
                    <input type="checkbox" checked={wfActive} onChange={e => setWfActive(e.target.checked)}
                      style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {wfActive ? 'New records will use this workflow' : 'Workflow is paused'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Approval Steps ───────────────────────────── */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                  Approval Steps ({steps.length})
                </div>

                {/* Live flow diagram */}
                <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px 14px', marginBottom: 16, border: '1px solid var(--border)' }}>
                  <FlowDiagram steps={steps} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {steps.map((step, i) => (
                    <StepCard
                      key={step._id}
                      step={step}
                      index={i}
                      total={steps.length}
                      onChange={updated => updateStep(i, updated)}
                      onRemove={() => removeStep(i)}
                      onMoveUp={() => moveUp(i)}
                      onMoveDown={() => moveDown(i)}
                      users={users}
                      entityType={wfEntity}
                    />
                  ))}
                </div>

                <button type="button" onClick={addStep}
                  style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 10, border: '2px dashed var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, transition: 'all .2s' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}>
                  <span className="material-icons">add</span> Add Approval Step
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={closeBuilder}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>save</span>
                  {saving ? 'Saving…' : wfId ? 'Update Workflow' : 'Create Workflow'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
