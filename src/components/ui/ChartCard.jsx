// src/components/ui/ChartCard.jsx
//
// Lightweight CSS bar chart for dashboard widgets. No chart library needed.
//
// Usage:
//   <ChartCard
//     title="Fuel Consumption"
//     data={[{ label: 'Mon', value: 120, color: 'var(--gold)' }, ...]}
//     unit="L"
//     height={120}
//   />

export function ChartCard({ title, subtitle, data = [], unit = '', height = 120, style }) {
  const max = Math.max(...data.map(d => d.value || 0), 1)

  return (
    <div className="card" style={{ padding: 16, ...style }}>
      {title && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{subtitle}</div>}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, paddingTop: 8 }}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {d.value > 0 ? (d.value >= 1000 ? `${(d.value/1000).toFixed(1)}k` : d.value) : ''}
              </span>
              <div
                title={`${d.label}: ${d.value}${unit}`}
                style={{
                  width: '100%',
                  height: `${pct}%`,
                  minHeight: d.value > 0 ? 3 : 0,
                  background: d.color || 'var(--gold)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height .4s ease',
                  cursor: 'default',
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textAlign: 'center' }}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
