// src/components/ui/ModalDialog.jsx
// Standard modal wrapper — always uses .overlay + .modal CSS classes.
// Clicks outside the modal box close it.

export function ModalDialog({ open, onClose, title, size = '', children, style }) {
  if (open === false) return null
  const sizeClass = size ? `modal-${size}` : ''
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${sizeClass}`} onClick={e => e.stopPropagation()} style={style}>
        {title && (
          <div className="modal-title">
            {typeof title === 'string'
              ? title.split('·').map((part, i) =>
                  i === 0 ? part : <span key={i}> · <span>{part}</span></span>
                )
              : title}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function ModalActions({ children }) {
  return <div className="modal-actions">{children}</div>
}
