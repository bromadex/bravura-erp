// src/components/workflow/ApprovalPanel.jsx
// Stage 4 — Enhanced: visual timeline, SLA badges, step delegation.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  getWorkflowState,
  approveStep,
  rejectStep,
  delegateStep,
  canActOnStep,
} from '../../engine/workflowEngine'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────

const ACTION_STYLE = {
  approved:  { color: 'var(--green)',    icon: 'check_circle',   label: 'Approved'   },
  rejected:  { color: 'var(--red)',      icon: 'cancel',         label: 'Rejected'   },
  submitted: { color: 'var(--blue)',     icon: 'send',           label: 'Submitted'  },
  cancelled: { color: 'var(--text-dim)', icon: 'remove_circle',  label: 'Cancelled'  },
  commented: { color: 'var(--teal)',     icon: 'chat',           label: 'Commented'  },
  delegated: { color: 'var(--purple)',   icon: 'swap_horiz',     label: 'Delegated'  },
}

const STATUS_STYLE = {
  pending:   { color: 'var(--yellow)', label: 'Pending',   icon: 'hourglass_empty' },
  approved:  { color: 'var(--green)',  label: 'Approved',  icon: 'check_circle'    },
  rejected:  { color: 'var(--red)',    label: 'Rejected',  icon: 'cancel'          },
  cancelled: { color: 'var(--text-dim)', label: 'Cancelled', icon: 'block'         },
}

const SLA_STYLE = {
  ok:      { color: 'var(--green)',  bg: 'rgba(52,211,153,.12)',  icon: 'schedule',      label: 'On Time'  },
  warning: { color: 'var(--yellow)', bg: 'rgba(251,191,36,.12)',  icon: 'warning_amber', label: 'Due Soon' },
  overdue: { color: 'var(--red)',    bg: 'rgba(239,68,68,.12)',   icon: 'alarm',         label: 'Overdue'  },
}

function fmtDuration(mins) {
  if (mins < 60)   return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
}

function elapsedSince(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return fmtDuration(Math.max(0, mins))
}

// ── Component ─────────────────────────────────────────────────

export default function ApprovalPanel({ entityType, entityId, onStatusChange }) {
  const { user } = useAuth()
  const [state,          setState]          = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [acting,         setActing]         = useState(false)
  const [rejectModal,    setRejectModal]    = useState(false)
  const [rejectReason,   setRejectReason]   = useState('')
  const [commentText,    setCommentText]    = useState('')
  const [delegateModal,  setDelegateModal]  = useState(false)
  const [delegateTarget, setDelegateTarget] = useState({ id: '', name: '' })
  const [delegateReason, setDelegateReason] = useState('')
  const [employees,      setEmployees]      = useState([])
  const [delegating,     setDelegating]     = useState(false)

  const actor = {
    id:      user?.id        || '',
    name:    user?.full_name || user?.username || '',
    role_id: user?.role_id   || '',
  }

  const load = useCallback(async () => {
    if (!entityType || !entityId) return
    setLoading(true)
    try   { setState(await getWorkflowState(entityType, entityId)) }
    catch { setState(null) }
    finally { setLoading(false) }
  }, [entityType, entityId])

  useEffect(() => { load() }, [load])

  // Fetch employee list when delegate modal opens
  useEffect(() => {
    if (!delegateModal || employees.length) return
    supabase.from('employees').select('id, name, employee_number')
      .neq('status', 'Terminated').order('name')
      .then(({ data }) => setEmployees(data || []))
  }, [delegateModal, employees.length])

  const handleApprove = async () => {
    if (!state?.instance) return
    setActing(true)
    try {
      const result = await approveStep(state.instance.id, actor, commentText || null)
      toast.success(result.completed ? 'Approved — workflow complete' : 'Approved — forwarded to next step')
      setCommentText('')
      await load()
      onStatusChange?.(result.status)
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return toast.error('Rejection reason is required')
    if (!state?.instance) return
    setActing(true)
    try {
      await rejectStep(state.instance.id, actor, rejectReason)
      toast.success('Request rejected')
      setRejectModal(false)
      setRejectReason('')
      await load()
      onStatusChange?.('rejected')
    } catch (err) { toast.error(err.message) }
    finally { setActing(false) }
  }

  const handleDelegate = async () => {
    if (!delegateTarget.id || !delegateTarget.name) return toast.error('Select an employee to delegate to')
    setDelegating(true)
    try {
      await delegateStep(state.instance.id, actor, delegateTarget.id, delegateTarget.name, delegateReason)
      toast.success(`Step delegated to ${delegateTarget.name}`)
      setDelegateModal(false)
      setDelegateTarget({ id: '', name: '' })
      setDelegateReason('')
      await load()
    } catch (err) { toast.error(err.message) }
    finally { setDelegating(false) }
  }

  if (loading) return (
    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      Loading workflow…
    </div>
  )

  if (!state) return (
    <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10, fontSize: 13, color: 'var(--text-dim)' }}>
      No active workflow for this record.
    </div>
  )

  const { instance, steps, actions, currentStep, isCompleted, stepProgress, totalSteps, activeDelegation, slaData } = state
  const userCanAct  = !isCompleted && canActOnStep(currentStep, actor, activeDelegation)
  const userCanDelegate = !isCompleted && !activeDelegation && canActOnStep(currentStep, actor)
  const statusStyle = STATUS_STYLE[instance.status] || STATUS_STYLE.pending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Status header ───────────────────────────────────── */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: `1px solid ${statusStyle.color}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span className="material-icons" style={{ color: statusStyle.color, fontSize: 22 }}>
            {statusStyle.icon}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{state.workflowName || 'Approval Status'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              Submitted by <strong>{instance.initiated_by_name}</strong>
              {' · '}{new Date(instance.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}{elapsedSince(instance.started_at)} elapsed
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{
              fontWeight: 700, fontSize: 12,
              color: statusStyle.color, background: `${statusStyle.color}18`,
              border: `1px solid ${statusStyle.color}44`, padding: '4px 12px', borderRadius: 20,
            }}>
              {statusStyle.label}
            </span>
            {/* SLA badge */}
            {slaData && (() => {
              const s = SLA_STYLE[slaData.urgency]
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: s.color,
                  background: s.bg, border: `1px solid ${s.color}44`,
                  padding: '3px 8px', borderRadius: 20,
                }}>
                  <span className="material-icons" style={{ fontSize: 12 }}>{s.icon}</span>
                  {slaData.urgency === 'overdue'
                    ? `${s.label} by ${fmtDuration(slaData.overdueMins)}`
                    : `Due in ${fmtDuration(slaData.remainingMins)}`}
                </span>
              )
            })()}
          </div>
        </div>

        {/* ── Visual step timeline ─────────────────────────── */}
        {steps.length > 0 && (
          <div style={{ display: 'flex', gap: 0, marginTop: 8 }}>
            {steps.map((step, i) => {
              const isDone    = isCompleted ? true : (i + 1 < stepProgress)
              const isCurrent = !isCompleted && step.id === instance.current_step_id
              const isFuture  = !isDone && !isCurrent
              const stepColor = isDone ? 'var(--green)' : isCurrent ? 'var(--gold)' : 'var(--text-dim)'

              const stepAction = actions.filter(a => a.step_id === step.id && ['approved','rejected'].includes(a.action))
              const stepApprover = stepAction.at(-1)?.actor_name

              return (
                <div key={step.id} style={{ flex: 1, position: 'relative' }}>
                  {/* Connector line */}
                  {i > 0 && (
                    <div style={{
                      position: 'absolute', left: 0, top: 13, width: '50%', height: 2,
                      background: isDone ? 'var(--green)' : 'var(--border)',
                    }} />
                  )}
                  {i < steps.length - 1 && (
                    <div style={{
                      position: 'absolute', right: 0, top: 13, width: '50%', height: 2,
                      background: isDone ? 'var(--green)' : 'var(--border)',
                    }} />
                  )}
                  {/* Node */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', zIndex: 1,
                      background: isDone ? 'rgba(52,211,153,.15)' : isCurrent ? 'rgba(251,191,36,.15)' : 'var(--surface)',
                      border: `2px solid ${stepColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="material-icons" style={{ fontSize: 14, color: stepColor }}>
                        {isDone ? 'check' : isCurrent ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: stepColor, marginTop: 5, textAlign: 'center', lineHeight: 1.2 }}>
                      {step.step_name}
                    </div>
                    {stepApprover && (
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2, textAlign: 'center' }}>
                        {stepApprover}
                      </div>
                    )}
                    {isFuture && (
                      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>Pending</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Current step awaiting info */}
        {!isCompleted && currentStep && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(251,191,36,.06)', borderRadius: 8, border: '1px solid rgba(251,191,36,.2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-icons" style={{ fontSize: 15, color: 'var(--gold)' }}>manage_accounts</span>
            <div style={{ flex: 1 }}>
              Awaiting: <strong style={{ color: 'var(--gold)' }}>{currentStep.step_name}</strong>
              {activeDelegation && (
                <span style={{ marginLeft: 8, color: 'var(--purple)', fontWeight: 600 }}>
                  <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>swap_horiz</span>
                  {' '}Delegated to {activeDelegation.toName}
                </span>
              )}
            </div>
            {slaData?.dueAt && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Due: {new Date(slaData.dueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons (role-gated) ─────────────────────── */}
      {userCanAct && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid var(--gold)44' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 18, color: 'var(--gold)' }}>notification_important</span>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>Your Action Required</div>
            {activeDelegation && (
              <span style={{ fontSize: 11, color: 'var(--purple)', background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.3)', padding: '2px 8px', borderRadius: 12 }}>
                Acting as delegate for {activeDelegation.fromName}
              </span>
            )}
          </div>
          <input
            className="form-control"
            placeholder="Add a comment (optional)…"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            style={{ fontSize: 13, marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleApprove} disabled={acting}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16 }}>check_circle</span>
              {acting ? 'Processing…' : currentStep?.is_final ? 'Approve & Complete' : 'Approve & Forward'}
            </button>
            <button className="btn btn-danger" onClick={() => setRejectModal(true)} disabled={acting}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16 }}>cancel</span>
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── Delegate button ──────────────────────────────────── */}
      {userCanDelegate && (
        <div style={{ textAlign: 'right' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setDelegateModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>swap_horiz</span>
            Delegate This Step
          </button>
        </div>
      )}

      {/* ── Approval history timeline ────────────────────────── */}
      {actions.filter(a => a.action !== 'delegated' || true).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Activity Timeline
          </div>
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />

            {actions.map((action, i) => {
              const style   = ACTION_STYLE[action.action] || ACTION_STYLE.submitted
              let comment   = action.comment
              if (action.action === 'delegated') {
                try { const p = JSON.parse(comment || '{}'); comment = `Delegated to ${p.to_name}${p.reason ? ` — "${p.reason}"` : ''}` } catch {}
              }
              return (
                <div key={action.id} style={{ display: 'flex', gap: 12, marginBottom: i < actions.length - 1 ? 14 : 0, position: 'relative' }}>
                  {/* Node on timeline */}
                  <div style={{
                    position: 'absolute', left: -17, top: 6,
                    width: 12, height: 12, borderRadius: '50%',
                    background: `${style.color}20`, border: `2px solid ${style.color}`,
                    zIndex: 1,
                  }} />
                  <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: comment ? 4 : 0 }}>
                      <span className="material-icons" style={{ fontSize: 14, color: style.color }}>{style.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <span style={{ color: style.color }}>{style.label}</span>
                        {' by '}
                        <span>{action.actor_name || 'Unknown'}</span>
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
                        {new Date(action.created_at).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {comment && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: action.action === 'delegated' ? 'normal' : 'italic' }}>
                        {action.action !== 'delegated' && '"'}{comment}{action.action !== 'delegated' && '"'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Reject modal ─────────────────────────────────────── */}
      {rejectModal && (
        <>
          <div onClick={() => setRejectModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 420, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="material-icons" style={{ color: 'var(--red)', fontSize: 22 }}>cancel</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Reject Request</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
              Please provide a reason. The submitter will be notified.
            </div>
            <textarea className="form-control" rows={4} placeholder="Reason for rejection…"
              value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setRejectModal(false); setRejectReason('') }}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={acting || !rejectReason.trim()}>
                {acting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delegate modal ───────────────────────────────────── */}
      {delegateModal && (
        <>
          <div onClick={() => setDelegateModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '95%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 601, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="material-icons" style={{ color: 'var(--purple)', fontSize: 22 }}>swap_horiz</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Delegate Approval Step</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              You are delegating <strong style={{ color: 'var(--text)' }}>{currentStep?.step_name}</strong> to another employee for this request only.
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Delegate to</label>
              <select className="form-control"
                value={delegateTarget.id}
                onChange={e => {
                  const emp = employees.find(x => x.id === e.target.value)
                  setDelegateTarget(emp ? { id: emp.id, name: emp.name } : { id: '', name: '' })
                }}>
                <option value="">— Select employee —</option>
                {employees.filter(e => e.id !== actor.id).map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Reason (optional)</label>
              <input className="form-control" placeholder="Out of office, on leave…"
                value={delegateReason} onChange={e => setDelegateReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setDelegateModal(false); setDelegateTarget({ id: '', name: '' }); setDelegateReason('') }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDelegate} disabled={delegating || !delegateTarget.id}>
                <span className="material-icons" style={{ fontSize: 15 }}>swap_horiz</span>
                {delegating ? 'Delegating…' : 'Delegate Step'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
