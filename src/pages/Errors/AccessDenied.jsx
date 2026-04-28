import { useNavigate } from 'react-router-dom'

export default function AccessDenied() {
  const navigate = useNavigate()
  
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 24,
      background: 'var(--bg)'
    }}>
      <span className="material-icons" style={{ fontSize: 80, color: 'var(--red)', marginBottom: 24, opacity: 0.7 }}>
        gpp_bad
      </span>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Access Denied</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24, maxWidth: 400 }}>
        You don't have permission to view this page. Please contact your HR administrator if you believe this is an error.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>
        <span className="material-icons">home</span> Back to Home
      </button>
    </div>
  )
}
