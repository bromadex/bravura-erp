// src/components/ui/ConfirmDialog.jsx
// Reusable destructive-action confirmation modal.

import { ModalDialog, ModalActions } from './ModalDialog'

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Confirm', message, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <ModalDialog open={open} onClose={onClose} title={title}>
      <p style={{ color: 'var(--text-mid)', fontSize: 14, lineHeight: 1.6 }}>{message}</p>
      <ModalActions>
        <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Please wait…' : confirmLabel}
        </button>
      </ModalActions>
    </ModalDialog>
  )
}
