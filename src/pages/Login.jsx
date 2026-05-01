// src/pages/Login.jsx
//
// Rate limiting: max 5 failed attempts per username in 15 minutes.
// Attempts are tracked client-side in sessionStorage AND server-side
// in the login_attempts table (created in migration_v2.sql).
// After 5 failures the form locks for the remainder of the 15-min window.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const MAX_ATTEMPTS   = 5
const WINDOW_MINS    = 15
const WINDOW_MS      = WINDOW_MINS * 60 * 1000

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [form,    setForm]    = useState({ username: '', password: '', remember: false })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Rate limit state
  const [attempts,  setAttempts]  = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [countdown, setCountdown] = useState(0)

  // Restore rate-limit state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem('login_rl')
    if (stored) {
      try {
        const { count, lockedAt } = JSON.parse(stored)
        const elapsed = Date.now() - lockedAt
        if (elapsed < WINDOW_MS) {
          setAttempts(count)
          if (count >= MAX_ATTEMPTS) {
            const until = lockedAt + WINDOW_MS
            setLockedUntil(until)
          }
        } else {
          sessionStorage.removeItem('login_rl')
        }
      } catch { sessionStorage.removeItem('login_rl') }
    }
  }, [])

  // Countdown timer when locked
  useEffect(() => {
    if (!lockedUntil) return
    const tick = () => {
      const remaining = Math.max(0, lockedUntil - Date.now())
      setCountdown(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        setLockedUntil(null)
        setAttempts(0)
        setError('')
        sessionStorage.removeItem('login_rl')
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const recordAttempt = (username, success) => {
    // Log to DB (non-fatal)
    supabase.from('login_attempts').insert([{
      id:           crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
      username:     username.toLowerCase().trim(),
      success,
      attempted_at: new Date().toISOString()
    }]).catch(() => {})
  }

  const handleFailedAttempt = (username) => {
    recordAttempt(username, false)
    const newCount = attempts + 1
    const now      = Date.now()

    setAttempts(newCount)
    sessionStorage.setItem('login_rl', JSON.stringify({ count: newCount, lockedAt: now }))

    if (newCount >= MAX_ATTEMPTS) {
      const until = now + WINDOW_MS
      setLockedUntil(until)
      setError(`Too many failed attempts. Try again in ${WINDOW_MINS} minutes.`)
    } else {
      const remaining = MAX_ATTEMPTS - newCount
      setError(`Incorrect username or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (lockedUntil && Date.now() < lockedUntil) {
      setError(`Account locked. Try again in ${countdown} seconds.`)
      return
    }

    setLoading(true)
    try {
      await login(form.username, form.password, form.remember)
      // Success — clear rate limit
      sessionStorage.removeItem('login_rl')
      setAttempts(0)
      recordAttempt(form.username, true)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err) {
      handleFailedAttempt(form.username)
    } finally {
      setLoading(false)
    }
  }

  const isLocked  = lockedUntil && Date.now() < lockedUntil
  const attemptsLeft = MAX_ATTEMPTS - attempts

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span className="material-icons" style={{ fontSize: 56, color: 'var(--gold)' }}>settings</span>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: 'var(--gold)' }}>BRAVURA</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, fontFamily: 'var(--mono)', letterSpacing: 2 }}>KAMATIVI ERP</p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Sign In</h2>

          {/* Locked banner */}
          {isLocked ? (
            <div style={{ background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 10, padding: 20, textAlign: 'center', marginBottom: 20 }}>
              <span className="material-icons" style={{ fontSize: 40, color: 'var(--red)', display: 'block', marginBottom: 8 }}>lock</span>
              <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Account temporarily locked</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
                Too many failed login attempts.
              </div>
              <div style={{
                fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--red)',
                background: 'rgba(248,113,113,.1)', padding: '8px 20px', borderRadius: 8, display: 'inline-block'
              }}>
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Time remaining</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label>USERNAME</label>
                <input className="form-control" type="text" placeholder="e.g. wendy"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  autoComplete="username" required disabled={loading} />
              </div>
              <div className="form-group">
                <label>PASSWORD</label>
                <input className="form-control" type="password" placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password" required disabled={loading} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="remember" checked={form.remember}
                  onChange={e => setForm(f => ({ ...f, remember: e.target.checked }))}
                  style={{ accentColor: 'var(--gold)', width: 16, height: 16 }} />
                <label htmlFor="remember" style={{ fontSize: 12, color: 'var(--text-mid)', cursor: 'pointer' }}>
                  Remember me for 30 days
                </label>
              </div>

              {/* Attempt warning */}
              {attempts > 0 && attempts < MAX_ATTEMPTS && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < attempts ? 'var(--red)' : 'var(--border2)' }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
                    {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left
                  </span>
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-icons" style={{ fontSize: 16 }}>error</span>
                  {error}
                </div>
              )}

              <button className="btn btn-primary" type="submit" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14 }}>
                <span className="material-icons" style={{ fontSize: 18 }}>login</span>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
          Bravura Kamativi ERP v2.0
        </p>
      </div>
    </div>
  )
}
