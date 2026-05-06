// src/components/workflow/WorkflowAdmin.jsx
// Super Admin UI to view and manage workflow definitions
// Route: /module/settings/workflows

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ROLE_LABELS = {
  role_super_admin:  'Super Admin',
  role_hr_manager:   'HR Manager',
  role_dept_manager: 'Department Manager',
  role_storekeeper:  'Storekeeper',
  role_fuel_attendant: 'Fuel Attendant',
  role_viewer:       'Viewer',
}

export default function WorkflowAdmin() {
  const [workflows, setWorkflows] = useState([])
  const [steps,     setSteps]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [editStep,  setEditStep]  = useState(null)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [wRes, sRes] = await Promise.all([
        supabase.from('workflows').select('*').order('module'),
        supabase.from('workflow_steps').select('*').order('step_order'),
      ])
      if (wRes.data) setWorkflows(wRes.data)
      if (sRes.data) setSteps(sRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const stepsForWorkflow = (wfId) => steps.filter(s => s.workflow_id === wfId)

  const saveStep = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('workflow_steps').update({
        step_name:      editStep.step_name,
        required_role:  editStep.required_role,
        status_on_entry: editStep.status_on_entry,
        status_on_pass: editStep.status_on_pass,
        status_on_fail: editStep.status_on_fail,
      }).eq('id', editStep.id)
      if (error) throw error
      setSteps(prev => prev.map(s => s.id === editStep.id ? { ...s, ...editStep } : s))
      toast.success('Step updated')
      setEditStep(null)
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Workflow Engine</h1>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Manage approval workflows and steps</div>
      </div>

      {loading ? <div className="empty-state">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 16 }}>
          {/* Workflow list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workflows.map(wf => (
              <div key={wf.id} className="card"
                onClick={() => setSelected(selected?.id === wf.id ? null : wf)}
                style={{ padding: 16, cursor: 'pointer', borderLeft: selected?.id === wf.id ? '3px solid var(--gold)' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="material-icons" style={{ fontSize: 18, color: wf.is_active ? 'var(--green)' : 'var(--red)' }}>
                    {wf.is_active ? 'play_circle' : 'pause_circle'}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{wf.name}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Module: {wf.module} · Table: {wf.entity_type}
                </div>
                <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                  {stepsForWorkflow(wf.id).length} step{stepsForWorkflow(wf.id).length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Steps detail */}
          {selected && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Entity: {selected.entity_type}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stepsForWorkflow(selected.id).map((step, i) => (
                  <div key={step.id} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid var(--gold)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gold)', color: '#0b0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{step.step_name}</div>
                      {step.is_final && <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(34,197,94,.1)', padding: '1px 8px', borderRadius: 10, border: '1px solid rgba(34,197,94,.3)' }}>FINAL</span>}
                      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditStep({ ...step })}>
                        <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div>Required Role: <strong style={{ color: 'var(--text)' }}>{ROLE_LABELS[step.required_role] || step.required_role}</strong></div>
                      <div>Entry Status: <code style={{ color: 'var(--yellow)' }}>{step.status_on_entry}</code></div>
                      <div>On Approve → <code style={{ color: 'var(--green)' }}>{step.status_on_pass}</code> · On Reject → <code style={{ color: 'var(--red)' }}>{step.status_on_fail}</code></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit step modal */}
      {editStep && (
        <>
          <div onClick={() => setEditStep(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 480, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Edit Step: {editStep.step_name}</div>
            <form onSubmit={saveStep} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Step Name</label>
                <input className="form-control" value={editStep.step_name} onChange={e => setEditStep(p => ({ ...p, step_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Required Role</label>
                <select className="form-control" value={editStep.required_role} onChange={e => setEditStep(p => ({ ...p, required_role: e.target.value }))}>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Status on Entry</label>
                  <input className="form-control" value={editStep.status_on_entry} onChange={e => setEditStep(p => ({ ...p, status_on_entry: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status on Approve</label>
                  <input className="form-control" value={editStep.status_on_pass} onChange={e => setEditStep(p => ({ ...p, status_on_pass: e.target.value }))} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditStep(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Step'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
