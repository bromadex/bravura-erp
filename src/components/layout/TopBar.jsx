import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>BRAVURA ERP</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI OPERATIONS</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Search placeholder – will be implemented later */}
        <div style={{ position: 'relative' }}>
          <span className="material-icons" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-dim)' }}>search</span>
          <input type="text" placeholder="Search..." style={{ padding: '8px 8px 8px 36px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 20, color: 'var(--text)', fontSize: 13, width: 200 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px 4px 8px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#0b0f1a' }}>
            {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{user?.full_name || user?.username}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{user?.role?.replace('_', ' ').toUpperCase()}</div>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={logout}>
          <span className="material-icons" style={{ fontSize: 16 }}>logout</span> Logout
        </button>
      </div>
    </div>
  )
}
