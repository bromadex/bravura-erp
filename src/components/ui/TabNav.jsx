// src/components/ui/TabNav.jsx
// Underline-style tab navigation bar.

export function TabNav({ tabs, active, onChange }) {
  return (
    <div className="tab-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span className="material-icons md-16">{tab.icon}</span>}
          {tab.label}
          {tab.count != null && (
            <span className={`badge ${active === tab.id ? 'badge-gold' : 'badge-dim'}`} style={{ marginLeft: 4 }}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
