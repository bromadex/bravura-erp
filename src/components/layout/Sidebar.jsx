import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const MODULE_SECTIONS = {
  inventory: {
    title: 'Inventory',
    icon: 'inventory',
    pages: [
      { id: 'stock-balance', label: 'Stock Balance', icon: 'list_alt' },
      { id: 'stock-in', label: 'Stock In', icon: 'inventory_2' },
      { id: 'stock-out', label: 'Stock Out', icon: 'assignment_return' },
      { id: 'transactions', label: 'Transactions', icon: 'receipt' },
      { id: 'stock-taking', label: 'Stock Taking', icon: 'fact_check' },
    ]
  },
}

export default function Sidebar({ module, onNavigate }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem(`sidebar_expanded_${module}`)
    return saved ? JSON.parse(saved) : true
  })

  useEffect(() => {
    localStorage.setItem(`sidebar_expanded_${module}`, JSON.stringify(expanded))
  }, [expanded, module])

  const section = MODULE_SECTIONS[module]
  if (!section) return null

  const currentPage = location.pathname.split('/').pop()

  return (
    <aside style={{ width: 260, background: 'var(--surface)', borderRight: '1px solid var(--border)', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto', padding: '20px 12px' }}>
      <button
        onClick={() => onNavigate('/')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', marginBottom: 20, borderRadius: 10, background: 'transparent', border: '1px solid var(--border2)', cursor: 'pointer', color: 'var(--text)' }}
      >
        <span className="material-icons">home</span>
        <span style={{ fontWeight: 600 }}>Home</span>
      </button>

      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: expanded ? 'rgba(244,162,97,.1)' : 'transparent', marginBottom: expanded ? 8 : 0 }}
      >
        <span className="material-icons" style={{ color: 'var(--gold)' }}>{section.icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{section.title}</span>
        <span className="material-icons" style={{ fontSize: 18 }}>{expanded ? 'expand_less' : 'expand_more'}</span>
      </div>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {section.pages.map(page => {
            const isActive = currentPage === page.id
            return (
              <button
                key={page.id}
                onClick={() => onNavigate(`/module/${module}/${page.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px 8px 36px',
                  borderRadius: 8, background: isActive ? 'rgba(244,162,97,.12)' : 'transparent',
                  border: 'none', cursor: 'pointer', color: isActive ? 'var(--gold)' : 'var(--text-mid)',
                  fontSize: 12, fontWeight: isActive ? 600 : 400, textAlign: 'left',
                }}
              >
                <span className="material-icons" style={{ fontSize: 16 }}>{page.icon}</span>
                <span>{page.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
