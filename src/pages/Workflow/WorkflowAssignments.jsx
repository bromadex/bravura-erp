// src/pages/Workflow/WorkflowAssignments.jsx
//
// Admin UI to assign which Workflow handles which Entity Type per Department.
// Backed by `workflow_assignments` table.
//
// Priority: department-specific > global (NULL department).
// When a record is created, workflowEngine.startWorkflow() resolves the right
// workflow via this table.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useHR } from '../../contexts/HRContext'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, Spinner, ModalDialog, ModalActions, ConfirmDialog } from '../../components/ui'

const ENTITY_TYPES = [
  { value: 'leave_requests',             label: 'Leave Requests',        module: 'HR',          icon: 'event_busy'     },
  { value: 'travel_requests',            label: 'Travel Requests',       module: 'HR',          icon: 'flight'          },
  { value: 'employee_attendance',        label: 'Attendance Records',    module: 'HR',          icon: 'schedule'        },
  { value: 'store_requisitions',         label: 'Store Requisitions',    module: 'Procurement', icon: 'inventory_2'     },
  { value: 'purchase_requisitions',      label: 'Purchase Requisitions', module: 'Procurement', icon: 'request_quote'   },
  { value: 'purchase_orders',            label: 'Purchase Orders',       module: 'Procurement', icon: 'receipt_long'    },
  { value: 'contractor_usage_logs',      label: 'Contractor Usage',      module: 'Fleet',       icon: 'engineering'     },
  { value: 'petty_cash_transactions',    label: 'Petty Cash Txns',       module: 'Accounting',  icon: 'savings'         },
  { value: 'petty_cash_reconciliations', label: 'PC Reconciliations',    module: 'Accounting',  icon: 'rule'            },
]

const MODULE_COLORS = {
  HR: 'var(--blue)', Procurement: 'var(--purple)', Fleet: 'var(--teal)', Accounting: 'var(--green)',
}

const BLANK = { entity_type: '', workflow_id: '', department_id: '', is_active: true, priority: 0 }

export default function WorkflowAssignments() {
  const { departments } = useHR()
  const [workflows,   setWorkflows]   = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [moduleFilter, setModuleFilter] = useState('ALL')
  const [modal,       setModal]       = useState(null)
  const [confirm,     setConfirm]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(BLANK)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [wRes, aRes] = await Promise.all([
      supabase.from('workflows').select('id, name, entity_type, module, is_active').order('module').order('name'),
      supabase.from('workflow_assignments').select('*').order('created_at', { ascending: false }),
    ])
    if (wRes.error) toast.error(wRes.error.message)
    if (aRes.error) toast.error(aRes.error.message)
    setWorkflows(wRes.data || [])
    setAssignments(aRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openAdd = (presetEntity = '') => {
    setForm({ ...BLANK, entity_type: presetEntity })
    setModal({ mode: 'add' })
  }

  const openEdit = (a) => {
    setForm({
      entity_type:   a.entity_type || '',
      workflow_id:   a.workflow_id || '',
      department_id: a.department_id || '',
      is_active:     a.is_active !== false,
      priority:      a.priority || 0,
    })
    setModal({ mode: 'edit', id: a.id })
  }

  const save = async () => {
    if (!form.entity_type)   return toast.error('Select an entity type')
    if (!form.workflow_id)   return toast.error('Select a workflow')

    setSaving(true)
    try {
      const dept = form.department_id ? departments.find(d => d.id === form.department_id) : null
      const payload = {
        entity_type:    form.entity_type,
        workflow_id:    form.workflow_id,
        department_id:  form.department_id || null,
        department_name: dept?.name || null,
        is_active:      form.is_active,
        priority:       form.priority,
      }

      if (modal.mode === 'edit') {
        const { error } = await supabase.from('workflow_assignments').update(payload).eq('id', modal.id)
        if (error) throw error
        toast.success('Assignment updated')
      } else {
        // Check for duplicate (same entity_type + department_id)
        const dupe = assignments.find(a =>
          a.entity_type === payload.entity_type &&
          (a.department_id || null) === (payload.department_id || null) &&
          a.id !== modal.id
        )
        if (dupe) return toast.error('An assignment already exists for this entity + department. Edit or delete the existing one.')

        const { error } = await supabase.from('workflow_assignments').insert([{ id: crypto.randomUUID(), ...payload }])
        if (error) throw error
        toast.success('Workflow assigned')
      }
      setModal(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('workflow_assignments').delete().eq('id', confirm.id)
      if (error) throw error
      toast.success('Assignment removed')
      setConfirm(null)
      fetchAll()
    } catch (err) { toast.error(err.message) }
  }

  const toggleActive = async (a) => {
    const { error } = await supabase.from('workflow_assignments').update({ is_active: !a.is_active }).eq('id', a.id)
    if (error) toast.error(error.message)
    else { toast.success(a.is_active ? 'Deactivated' : 'Activated'); fetchAll() }
  }

  // Build a map: entity_type → [assignments]
  const groupedAssignments = useMemo(() => {
    const map = {}
    for (const a of assignments) {
      if (!map[a.entity_type]) map[a.entity_type] = []
      map[a.entity_type].push(a)
    }
    return map
  }, [assignments])

  const getWorkflowName = (id) => workflows.find(w => w.id === id)?.name || '— deleted —'
  const getDeptName     = (id) => id ? (departments.find(d => d.id === id)?.name || '— deleted —') : 'All Departments (Global)'

  const filteredEntities = useMemo(() => {
    return ENTITY_TYPES.filter(e => {
      if (moduleFilter !== 'ALL' && e.module !== moduleFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return e.label.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
      }
      return true
    })
  }, [moduleFilter, search])

  if (loading) return <div><PageHeader title="Workflow Assignments" /><div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div></div>

  return (
    <div>
      <PageHeader
        title="Workflow Assignments"
        subtitle="Map entity types to specific workflows, optionally scoped per department"
      >
        <button className="btn btn-primary" onClick={() => openAdd()}>
          <span className="material-icons">add</span> New Assignment
        </button>
      </PageHeader>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Assignments',  value: assignments.length,                                       color: 'var(--blue)'  },
          { label: 'Active',             value: assignments.filter(a => a.is_active).length,             color: 'var(--green)' },
          { label: 'Global Rules',       value: assignments.filter(a => !a.department_id).length,        color: 'var(--gold)'  },
          { label: 'Department-Specific', value: assignments.filter(a => a.department_id).length,        color: 'var(--teal)'  },
          { label: 'Workflows Available', value: workflows.length,                                       color: 'var(--purple)' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, fontFamily: 'var(--mono)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="form-control" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search entities…" style={{ maxWidth: 280 }} />
        <select className="form-control" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="ALL">All Modules</option>
          {['HR','Procurement','Fleet','Accounting'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {workflows.length === 0
        ? <EmptyState icon="account_tree" message="No workflows defined yet. Create workflows in /module/settings/workflows first." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
            {filteredEntities.map(ent => {
              const list  = groupedAssignments[ent.value] || []
              const mc    = MODULE_COLORS[ent.module]
              return (
                <div key={ent.value} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                  overflow: 'hidden', transition: 'border-color .15s',
                }}>
                  <div style={{ height: 4, background: mc }} />
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-icons" style={{ fontSize: 24, color: mc }}>{ent.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{ent.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 1 }}>{ent.value}</div>
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => openAdd(ent.value)}>
                        <span className="material-icons" style={{ fontSize: 14 }}>add</span>
                      </button>
                    </div>
                  </div>

                  {list.length === 0
                    ? <div style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>
                        No assignments — falls back to direct entity_type match on workflows table
                      </div>
                    : (
                      <div>
                        {list.sort((a, b) => {
                          // Global first, then by priority desc
                          if (!a.department_id && b.department_id) return -1
                          if (a.department_id && !b.department_id) return 1
                          return (b.priority || 0) - (a.priority || 0)
                        }).map(a => {
                          const wfName = getWorkflowName(a.workflow_id)
                          const isGlobal = !a.department_id
                          return (
                            <div key={a.id} style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, opacity: a.is_active ? 1 : 0.5 }}>
                              <span className="material-icons" style={{ fontSize: 16, color: isGlobal ? 'var(--gold)' : 'var(--teal)' }}>
                                {isGlobal ? 'public' : 'business'}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {wfName}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                                  {getDeptName(a.department_id)}{a.priority ? ` · Priority ${a.priority}` : ''}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(a)} title={a.is_active ? 'Deactivate' : 'Activate'}>
                                  <span className="material-icons" style={{ fontSize: 13, color: a.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                                    {a.is_active ? 'toggle_on' : 'toggle_off'}
                                  </span>
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
                                  <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ id: a.id, name: `${wfName} → ${getDeptName(a.department_id)}` })}>
                                  <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        )}

      {/* Add/Edit modal */}
      <ModalDialog open={modal !== null} onClose={() => setModal(null)}
        title={modal?.mode === 'edit' ? 'Edit Assignment' : 'New Workflow Assignment'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label>Entity Type *</label>
            <select className="form-control" value={form.entity_type}
              onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))} disabled={modal?.mode === 'edit'}>
              <option value="">Select entity type…</option>
              {ENTITY_TYPES.map(e => (
                <option key={e.value} value={e.value}>{e.module} — {e.label}</option>
              ))}
            </select>
            <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>The doctype/record kind this workflow will govern</small>
          </div>

          <div className="form-group">
            <label>Workflow *</label>
            <select className="form-control" value={form.workflow_id}
              onChange={e => setForm(p => ({ ...p, workflow_id: e.target.value }))}>
              <option value="">Select workflow…</option>
              {workflows
                .filter(w => !form.entity_type || w.entity_type === form.entity_type)
                .map(w => (
                  <option key={w.id} value={w.id}>{w.name}{!w.is_active ? ' (inactive)' : ''}</option>
                ))}
            </select>
            <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {workflows.filter(w => !form.entity_type || w.entity_type === form.entity_type).length === 0
                ? `No workflows defined for "${form.entity_type}". Create one first.`
                : 'Only workflows matching the selected entity type are shown.'}
            </small>
          </div>

          <div className="form-group">
            <label>Department Scope</label>
            <select className="form-control" value={form.department_id}
              onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
              <option value="">All Departments (Global)</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Department-specific assignments take priority over global ones
            </small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Priority</label>
              <input type="number" min={0} className="form-control" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))} />
              <small style={{ fontSize: 11, color: 'var(--text-dim)' }}>Higher wins when multiple match</small>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : (modal?.mode === 'edit' ? 'Save Changes' : 'Create Assignment')}
          </button>
        </ModalActions>
      </ModalDialog>

      <ConfirmDialog
        open={!!confirm}
        title="Remove Assignment"
        message={`Remove "${confirm?.name}"? Records of this entity type will fall back to global or default workflow.`}
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  )
}
