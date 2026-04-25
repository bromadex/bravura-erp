import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '', remember: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password, form.remember)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:16 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>⚙️</div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'var(--gold)' }}>BRAVURA</h1>
          <p style={{ color:'var(--text-dim)', fontSize:13, fontFamily:'var(--mono)', letterSpacing:2 }}>KAMATIVI ERP</p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding:28 }}>
          <h2 style={{ fontSize:18, fontWeight:700, marginBottom:24 }}>Sign In</h2>
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group">
              <label>USERNAME</label>
              <input className="form-control" type="text" placeholder="e.g. wendy"
                value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))}
                autoComplete="username" required />
            </div>
            <div className="form-group">
              <label>PASSWORD</label>
              <input className="form-control" type="password" placeholder="••••••••"
                value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}
                autoComplete="current-password" required />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="checkbox" id="remember" checked={form.remember}
                onChange={e => setForm(f => ({...f, remember: e.target.checked}))}
                style={{ accentColor:'var(--gold)', width:16, height:16 }} />
              <label htmlFor="remember" style={{ fontSize:12, color:'var(--text-mid)', cursor:'pointer' }}>Remember me for 30 days</label>
            </div>
            {error && <div style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--red)' }}>✕ {error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width:'100%', justifyContent:'center', padding:'12px', fontSize:14 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p style={{ textAlign:'center', marginTop:16, fontSize:11, color:'var(--text-dim)', fontFamily:'var(--mono)' }}>
          Bravura Kamativi ERP v2.0
        </p>
      </div>
    </div>
  )
}
