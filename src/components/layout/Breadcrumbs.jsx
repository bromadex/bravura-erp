// src/components/layout/Breadcrumbs.jsx
import { useRecentPages } from '../../hooks/useRecentPages'

export default function Breadcrumbs({ crumbs, navigate }) {
  const { recentPages, favorites, toggleFavorite } = useRecentPages()
  const currentPath = crumbs[crumbs.length - 1]?.path || ''
  const isFav = favorites.some(f => f.path === currentPath)

  return (
    <>
      {/* Breadcrumb path */}
      <nav className="breadcrumb-bar" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={crumb.path} className="breadcrumb-item">
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              {isLast
                ? <span className="current">{crumb.label}</span>
                : <button onClick={() => navigate(crumb.path)}>{crumb.label}</button>
              }
            </span>
          )
        })}

        {/* Favorite toggle for current page */}
        {currentPath !== '/' && crumbs.length > 1 && (
          <button
            onClick={() => toggleFavorite({ path: currentPath, label: crumbs[crumbs.length - 1].label })}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: isFav ? 'var(--gold)' : 'var(--border2)', padding: '2px 4px', lineHeight: 1 }}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span className="material-icons" style={{ fontSize: 14 }}>{isFav ? 'star' : 'star_border'}</span>
          </button>
        )}
      </nav>

      {/* Favorite + recent pills bar — only show if there's history */}
      {(favorites.length > 0 || recentPages.length > 0) && (
        <div className="recent-pills">
          {favorites.length > 0 && (
            <>
              <span className="material-icons" style={{ fontSize: 13, color: 'var(--gold)', alignSelf: 'center', flexShrink: 0 }}>star</span>
              {favorites.map(fav => (
                <button key={fav.path} className="recent-pill fav" onClick={() => navigate(fav.path)}>
                  {fav.label}
                </button>
              ))}
              {recentPages.length > 0 && (
                <span style={{ width: 1, background: 'var(--border)', margin: '2px 2px', alignSelf: 'stretch', flexShrink: 0 }} />
              )}
            </>
          )}
          {recentPages.filter(r => !favorites.some(f => f.path === r.path)).slice(0, 6).map(page => (
            <button key={page.path} className="recent-pill" onClick={() => navigate(page.path)}>
              <span className="material-icons" style={{ fontSize: 11 }}>history</span>
              {page.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
