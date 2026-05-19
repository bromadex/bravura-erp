// src/pages/Forms/ExitQuestionnaire.jsx
//
// Public exit questionnaire form — opens via tokenised URL like:
//   /forms/exit-questionnaire/abc123def456
//
// Anonymous access (no login). Token is verified against
// exit_questionnaire_tokens; if valid and unused, responses are written to
// exit_questionnaire_responses and the token is marked as used.

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'

const STATES = {
  loading:  'loading',
  invalid:  'invalid',
  used:     'used',
  expired:  'expired',
  ready:    'ready',
  submitting: 'submitting',
  submitted: 'submitted',
}

export default function ExitQuestionnaire() {
  const { token } = useParams()
  const [state,    setState]    = useState(STATES.loading)
  const [errorMsg, setErrorMsg] = useState('')
  const [tokenRow, setTokenRow] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [settings, setSettings] = useState(null)
  const [answers,  setAnswers]  = useState({})

  const verify = useCallback(async () => {
    if (!token) { setState(STATES.invalid); return }
    try {
      const [tokenRes, settingsRes] = await Promise.all([
        supabase.from('exit_questionnaire_tokens').select('*').eq('token', token).maybeSingle(),
        supabase.from('exit_questionnaire_settings').select('*').eq('id', 'singleton').maybeSingle(),
      ])

      const t = tokenRes.data
      if (!t) { setState(STATES.invalid); return }
      if (t.used_at) { setTokenRow(t); setState(STATES.used); return }
      if (t.expires_at && new Date(t.expires_at) < new Date()) { setTokenRow(t); setState(STATES.expired); return }

      setTokenRow(t)
      setSettings(settingsRes.data || { questions: [], intro_text: '', thank_you_text: '' })

      // Fetch employee for personalised greeting
      const { data: emp } = await supabase.from('employees').select('id, name, designation_id').eq('id', t.employee_id).maybeSingle()
      setEmployee(emp)
      setState(STATES.ready)
    } catch (err) {
      setErrorMsg(err.message)
      setState(STATES.invalid)
    }
  }, [token])

  useEffect(() => { verify() }, [verify])

  const set = (key, value) => setAnswers(p => ({ ...p, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (state === STATES.submitting) return

    const questions = (settings?.questions || [])
    // Validate required answers
    for (const q of questions) {
      if (q.required) {
        const a = answers[q.order]
        if (a === undefined || a === null || a === '' || (q.type === 'rating' && !a)) {
          setErrorMsg(`Please answer required question: "${q.question}"`)
          return
        }
      }
    }
    setErrorMsg('')
    setState(STATES.submitting)

    try {
      const rows = questions.map(q => {
        const v = answers[q.order]
        return {
          id: crypto.randomUUID(),
          token_id: tokenRow.id,
          employee_id: tokenRow.employee_id,
          question: q.question,
          answer:   q.type === 'rating' ? null : (v !== undefined && v !== null ? String(v) : null),
          rating:   q.type === 'rating' ? (v ? parseInt(v) : null) : null,
          sort_order: q.order || 0,
        }
      })

      const { error: insErr } = await supabase.from('exit_questionnaire_responses').insert(rows)
      if (insErr) throw insErr

      // Mark token as used
      await supabase.from('exit_questionnaire_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', tokenRow.id)

      // If linked to an exit_interviews row, optionally update its status to 'Completed'
      if (tokenRow.exit_interview_id) {
        await supabase.from('exit_interviews')
          .update({ status: 'Completed', updated_at: new Date().toISOString() })
          .eq('id', tokenRow.exit_interview_id)
      }

      setState(STATES.submitted)
    } catch (err) {
      setErrorMsg(err.message)
      setState(STATES.ready)
    }
  }

  // ── Render helpers ─────────────────────────────────────────────
  if (state === STATES.loading) {
    return <Container><div style={{ padding: 60, textAlign: 'center' }}><Spinner /><div style={{ marginTop: 12, color: 'var(--text-dim)' }}>Verifying your link…</div></div></Container>
  }
  if (state === STATES.invalid) {
    return <ErrorCard icon="error" title="Invalid Link" message={errorMsg || 'This link is not valid. Please contact HR if you believe this is an error.'} />
  }
  if (state === STATES.used) {
    return <ErrorCard icon="task_alt" title="Already Submitted" message="This questionnaire has already been completed. Thank you for your feedback." />
  }
  if (state === STATES.expired) {
    return <ErrorCard icon="schedule" title="Link Expired" message="This link has expired. Please contact HR to request a new link." />
  }
  if (state === STATES.submitted) {
    return <ErrorCard icon="check_circle" title="Thank You" message={settings?.thank_you_text || 'Your responses have been recorded.'} color="var(--green)" />
  }

  const questions = settings?.questions || []

  return (
    <Container>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Exit Questionnaire</h1>
        {employee && <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>For <strong style={{ color: 'var(--gold)' }}>{employee.name}</strong></div>}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 16, border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.6 }}>
          {settings?.intro_text || 'Thank you for your service. Please share your honest feedback to help us improve.'}
        </div>
      </div>

      <form onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {questions.map(q => (
            <div key={q.order} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                {q.order}. {q.question}
                {q.required && <span style={{ color: 'var(--red)', marginLeft: 4 }}>*</span>}
              </label>
              {q.type === 'rating' && <StarRating value={answers[q.order]} onChange={v => set(q.order, v)} />}
              {q.type === 'yesno'  && (
                <div style={{ display: 'flex', gap: 16 }}>
                  {['Yes','No'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" name={`q${q.order}`} value={opt}
                        checked={answers[q.order] === opt} onChange={() => set(q.order, opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              )}
              {q.type === 'text' && (
                <textarea className="form-control" rows={3} value={answers[q.order] || ''} onChange={e => set(q.order, e.target.value)} />
              )}
              {!['rating','yesno','text'].includes(q.type) && (
                <input className="form-control" value={answers[q.order] || ''} onChange={e => set(q.order, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        {errorMsg && (
          <div style={{ marginTop: 16, padding: 12, background: 'var(--red)22', border: '1px solid var(--red)55', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
            <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>error</span>
            {errorMsg}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button type="submit" className="btn btn-primary" disabled={state === STATES.submitting}
            style={{ minWidth: 160, justifyContent: 'center' }}>
            {state === STATES.submitting ? 'Submitting…' : 'Submit Responses'}
          </button>
        </div>
      </form>
    </Container>
  )
}

function Container({ children }) {
  return (
    <div style={{
      maxWidth: 720, margin: '0 auto',
      background: 'transparent',
      borderRadius: 12,
    }}>
      {children}
    </div>
  )
}

function ErrorCard({ icon, title, message, color = 'var(--text)' }) {
  return (
    <Container>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '60px 32px', textAlign: 'center',
      }}>
        <span className="material-icons" style={{ fontSize: 64, color, marginBottom: 16, display: 'block' }}>{icon}</span>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>{message}</div>
      </div>
    </Container>
  )
}

function StarRating({ value, onChange }) {
  const stars = [1,2,3,4,5]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {stars.map(s => (
        <button type="button" key={s} onClick={() => onChange(s)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 32, color: s <= (value || 0) ? 'var(--gold)' : 'var(--text-dim)',
            padding: 4, lineHeight: 1, transition: 'color .15s, transform .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
          onMouseLeave={e => e.currentTarget.style.transform = ''}
        >
          ★
        </button>
      ))}
      {value && <span style={{ marginLeft: 12, alignSelf: 'center', fontSize: 13, color: 'var(--text-dim)' }}>{value} / 5</span>}
    </div>
  )
}
