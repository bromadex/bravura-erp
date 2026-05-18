// src/pages/ESS/ESSLayout.jsx
// Simplified layout for Employee Self-Service — no main sidebar.

import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ESSLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const tabs = [
    { path: '/ess/dashboard',  label: 'Home',       icon: 'home' },
    { path: '/ess/attendance', label: 'Attendance', icon: 'fingerprint' },
    { path: '/ess/leave',      label: 'Leave',      icon: 'beach_access' },
    { path: '/ess/payslips',   label: 'Payslips',   icon: 'receipt_long' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--gold)' }}>Bravura ESS</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{user?.full_name}</div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, padding: '20px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </div>
      {/* Bottom nav */}
      <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', padding: '8px 0' }}>
        {tabs.map(tab => (
          <button key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              color: pathname.startsWith(tab.path) ? 'var(--gold)' : 'var(--text-dim)',
              padding: '4px 16px',
            }}>
            <span className="material-icons" style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
