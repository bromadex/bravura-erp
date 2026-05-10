// src/components/ui/Spinner.jsx
//
// Usage:
//   <Spinner />                   — centered in its container, medium size
//   <Spinner size="sm" />         — inline small spinner
//   <Spinner size="lg" text="Loading data…" />
//   <Spinner overlay />           — full-page overlay

export function Spinner({ size = 'md', text = '', overlay = false }) {
  const dim = size === 'sm' ? 18 : size === 'lg' ? 48 : 32
  const border = size === 'sm' ? 2 : size === 'lg' ? 5 : 3

  const spinner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: dim, height: dim,
        border: `${border}px solid var(--border2)`,
        borderTopColor: 'var(--gold)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }} />
      {text && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{text}</span>}
    </div>
  )

  if (overlay) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {spinner}
      </div>
    )
  }

  if (size === 'sm') return spinner

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      {spinner}
    </div>
  )
}
