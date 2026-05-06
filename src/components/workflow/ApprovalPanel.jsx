// src/components/workflow/ApprovalPanel.jsx
// ============================================================
// STAGE 4 — Reusable Approval UI Component
// Works for ANY module. Shows: current step, progress,
// approve/reject buttons (role-gated), full history timeline.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  getWorkflowState,
  approveStep,
  rejectStep,
  canActOnStep,
} from '../../engine/workflowEngine'
import toast from 'react-hot-toast'

const ACTION_COLOR = {
  approved:  { color: 'var(--green)',    icon: 'check_circle'  },
  rejected:  { color: 'var(--red)',      icon: 'cancel'        },
  submitted: { color: 'var(--blue)',     icon: 'send'          },
  cancelled: { color: 'var(--text-dim)', icon: 'remove_circle' },
  commented: { color: 'var(--teal)',     icon: 'chat'          },
}

const STATUS_STYLE = {
  pending:    { color: 'var(--yellow)', label: 'Pending',   icon: 'hourglass_empty' },
  approved:   { color: 'var(--green)',  label: 'Approved',  icon: 'check_circle'    },
  rejected:   { color: 'var(--red)',    label: 'Rejected',  icon: 'cancel'          },
  cancelled:  { color: 'var(--text-dim)', label: 'Cancelled', icon: 'block'         },
  completed:  { color: 'var(--green)',  label: 'Completed', icon: 'task_alt'        },
}

export default function ApprovalPanel({ entityType, entityId, onStatusChange }) {
  const { user } = useAuth()
  const [state,       setState]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [acting,      setActing]      = useState(false)
  const [rejectModal, setRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [commentText, setCommentText] = useState('')

  const actor = {
    id:      user?.id      || '',
    name:    user?.full_name || user?.username || '',
    role_id: user?.role_id || '',
  }

  const load = useCallback(async () => {
    if (!entityType || !entityId) return
    setLoading(true)
    try {
      const wfState = await getWorkflowState(entityType, entityId)
      setState(wfState)
    } catch (err) {
      // No workflow instance yet — that's fine
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => { load() }, [load])

  const handleApprove = async () => {
    if (!state?.instance) return
    setActing(true)
    try {
      const result = await approveStep(state.instance.id, actor, commentText || null)
      toast.success(result.completed ? '✅ Approved — workflow complete' : `✅ Approved — moved to next step`)
      setCommentText('')
      await load()
      onStatusChange?.(result.status)
    } catch (err) {
      toast.error(err.message)
    } finally { setActing(false) }
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
    } catch (err) {
      toast.error(err.message)
    } finally { setActing(false) }
  }

  if (loading) return (
    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
      Loading workflow…
    </div>
  )

  if (!state) return (
    <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10, fontSize: 13, color: 'var(--text-dim)' }}>
      No active workflow for this record.
    </div>
  )

  const { instance, steps, actions, currentStep, isCompleted, stepProgress, totalSteps } = state
  const userCanAct = !isCompleted && canActOnStep(currentStep, actor)
  const statusStyle = STATUS_STYLE[instance.status] || STATUS_STYLE.pending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Status header ───────────────────────────────────── */}
      <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: 16, border: `1px solid ${statusStyle.color}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span className="material-icons" style={{ color: statusStyle.color, fontSize: 22 }}>
            {statusStyle.icon}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Approval Status</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Submitted by {instance.initiated_by_name} · {new Date(instance.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <span style={{
            fontWeight: 700, fontSize: 12,
            color: statusStyle.color,
            background: `${statusStyle.color}18`,
            border: `1px solid ${statusStyle.color}44`,
            padding: '4px 12px', borderRadius: 20,
          }}>
            {statusStyle.label}
          </span>
        </div>

        {/* Progress bar */}
        {!isCompleted && steps.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
              <span>Step {stepProgress} of {totalSteps}</span>
              <span>{currentStep?.step_name}</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(stepProgress / totalSteps) * 100}%`,
                background: 'var(--gold)',
                borderRadius: 3,
                transition: 'width .4s ease',
              }} />
            </div>

            {/* Step pills */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {steps.map((step, i) => {
                const isDone    = i + 1 < stepProgress
                const isCurrent = step.id === instance.current_step_id
                return (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: isDone ? 'rgba(34,197,94,.12)' : isCurrent ? 'rgba(251,191,36,.12)' : 'var(--surface)',
                    color: isDone ? 'var(--green)' : isCurrent ? 'var(--gold)' : 'var(--text-dim)',
                    border: `1px solid ${isDone ? 'rgba(34,197,94,.3)' : isCurrent ? 'rgba(251,191,36,.3)' : 'var(--border)'}`,
                  }}>
                    <span className="material-icons" style={{ fontSize: 12 }}>
                      {isDone ? 'check' : isCurrent ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                    {step.step_name}
                  </div>
                )
              })}
            </div>

            {/* Current approver role */}
            {currentStep && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 14 }}>manage_accounts</span>
                Awaiting: <strong style={{ color: 'var(--text)' }}>{currentStep.step_name}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons (role-gated) ─────────────────────── */}
      {userCanAct && (
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Your Action Required</div>
          <div style={{ marginBottom: 10 }}>
            <input
              className="form-control"
              placeholder="Add a comment (optional)…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={acting}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16 }}>check_circle</span>
              {acting ? 'Processing…' : currentStep?.is_final ? 'Approve & Complete' : 'Approve & Forward'}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setRejectModal(true)}
              disabled={acting}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-icons" style={{ fontSize: 16 }}>cancel</span>
              Reject
            </button>
          </div>
        </div>
      )}

      {/* ── History timeline ────────────────────────────────── */}
      {actions.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Approval History
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {actions.map((action, i) => {
              const style = ACTION_COLOR[action.action] || ACTION_COLOR.submitted
              return (
                <div key={action.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < actions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Icon */}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${style.color}15`, border: `1px solid ${style.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons" style={{ fontSize: 16, color: style.color }}>{style.icon}</span>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: style.color, textTransform: 'capitalize' }}>{action.action}</span>
                      {' by '}
                      <span>{action.actor_name || 'Unknown'}</span>
                    </div>
                    {action.comment && (
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>
                        "{action.comment}"
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                      {new Date(action.created_at).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
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
            <textarea
              className="form-control"
              rows={4}
              placeholder="Reason for rejection…"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setRejectModal(false); setRejectReason('') }}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={acting || !rejectReason.trim()}>
                {acting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
