// src/components/ui/StatBar.jsx
//
// A simple inline progress/fill bar.
// Usage:
//   <StatBar value={65} max={100} color="var(--green)" />
//   <StatBar value={3} segments={[{value:3,color:'var(--green)',label:'OK'},{value:1,color:'var(--red)',label:'Down'}]} />

export function StatBar({ value = 0, max = 100, color = 'var(--gold)', height = 6, radius = 3, showLabel = false, className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100))
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height, background: 'var(--surface2)', borderRadius: radius, overflow: 'hidden', minWidth: 40 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: radius, transition: 'width .3s ease' }} />
      </div>
      {showLabel && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', flexShrink: 0 }}>{pct.toFixed(0)}%</span>}
    </div>
  )
}

export function SegmentedBar({ segments = [], height = 8, radius = 4 }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0) || 1
  return (
    <div style={{ display: 'flex', height, borderRadius: radius, overflow: 'hidden', gap: 1 }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          title={seg.label ? `${seg.label}: ${seg.value}` : undefined}
          style={{
            flex: seg.value / total,
            background: seg.color || 'var(--border2)',
            minWidth: seg.value > 0 ? 2 : 0,
            transition: 'flex .3s ease',
          }}
        />
      ))}
    </div>
  )
}
