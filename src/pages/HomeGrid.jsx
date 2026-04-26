import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MODULES = [
  { id: 'dashboard',   icon: 'dashboard',          label: 'Dashboard',        color: '#f4a261', desc: 'KPIs & overview', route: '/module/dashboard' },
  { id: 'procurement', icon: 'shopping_cart',      label: 'Procurement',      color: '#a78bfa', desc: 'Suppliers & orders', route: '/module/procurement' },
  { id: 'inventory',   icon: 'inventory',          label: 'Inventory',        color: '#2dd4bf', desc: 'Stock & warehouse', route: '/module/inventory/stock-balance' },
  { id: 'logistics',   icon: 'local_shipping',     label: 'Logistics',        color: '#60a5fa', desc: 'GRN, Batch Plant', route: '/module/logistics' },
  { id: 'fuel',        icon: 'local_gas_station',  label: 'Fuel Management',  color: '#fbbf24', desc: 'Tanks & issuance', route: '/module/fuel' },
  { id: 'fleet',       icon: 'directions_car',     label: 'Fleet & Assets',   color: '#34d399', desc: 'Vehicles & generators', route: '/module/fleet' },
  { id: 'hr',          icon: 'badge',              label: 'Human Resources',  color: '#f87171', desc: 'Employees & payroll', route: '/module/hr' },
  { id: 'accounting',  icon: 'receipt',            label: 'Accounting',       color: '#818cf8', desc: 'Journals & reports', route: '/module/accounting' },
  { id: 'reports',     icon: 'bar_chart',          label: 'Reports',          color: '#38bdf8', desc: 'Analytics & exports', route: '/module/reports' },
  { id: 'project',     icon: 'construction',       label: 'Project Management', color: '#94a3b8', desc: 'Coming soon' },
]

export default function HomeGrid() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Top Bar */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>BRAVURA ERP</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>KAMATIVI OPERATIONS</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '6px 12px'
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--gold),var(--teal))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 12,
              color: '#0b0f1a'
            }}>
              {(user?.full_name || user?.username || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{user?.full_name || user?.username}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {user?.role?.replace('_', ' ').toUpperCase()}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            <span className="material-icons" style={{ fontSize: 16 }}>logout</span> Logout
          </button>
        </div>
      </div>

      {/* Welcome */}
      <div style={{ padding: '32px 24px 16px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          Welcome, {user?.full_name?.split(' ')[0] || user?.username} 👋
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Select a module to get started</p>
      </div>

      {/* Module Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
        padding: '16px 24px 40px',
        maxWidth: 1000,
        margin: '0 auto'
      }}>
        {MODULES.map(m => (
          <button
            key={m.id}
            onClick={() => {
              if (m.route) {
                navigate(m.route)
              } else {
                alert(`${m.label} – coming soon`)
              }
            }}
            style={{
              background: 'var(--surface)',
              border: `1px solid var(--border)`,
              borderRadius: 16,
              padding: 24,
              cursor: 'pointer',
              transition: 'all .2s',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = m.color
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = `0 8px 24px ${m.color}22`
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <span className="material-icons" style={{ fontSize: 44, color: m.color }}>{m.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
