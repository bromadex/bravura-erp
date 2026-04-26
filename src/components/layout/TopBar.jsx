import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* Brand — click goes home */}
      <div style={{ cursor:'pointer', marginRight: 8 }} onClick={() => navigate('/')}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', lineHeight:1 }}>BRAVURA ERP</div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
        <span className="material-icons" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:17, color:'var(--text-dim)' }}>search</span>
        <input
          type="text"
          placeholder="Search..."
          style={{ width:'100%', padding:'7px 10px 7px 34px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, color:'var(--text)', fontSize:12, outline:'none' }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Notification bell */}
      <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', position:'relative', padding:4 }}>
        <span className="material-icons">notifications</span>
      </button>

      {/* User chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '4px 12px 4px 6px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg,var(--gold),var(--teal))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: '#0b0f1a', flexShrink: 0,
        }}>
          {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ overflow:'hidden' }}>
          <div style={{ fontSize:12, fontWeight:700, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:100 }}>
            {user?.full_name || user?.username}
          </div>
          <div style={{ fontSize:9, color:'var(--text-dim)', fontFamily:'var(--mono)' }}>
            {user?.role?.replace('_',' ').toUpperCase()}
          </div>
        </div>
      </div>

      {/* Logout */}
      <button className="btn btn-secondary btn-sm" onClick={logout}>
        <span className="material-icons" style={{ fontSize:15 }}>logout</span>
        <span style={{ display:'none' }} className="logout-label">Logout</span>
      </button>
    </div>
  )
}
