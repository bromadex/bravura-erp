// src/pages/Forms/FormsLayout.jsx
//
// Minimal public-form layout — no sidebar, no top nav, no auth.
// Used for tokenised web forms (Exit Questionnaire, etc.) sent to recipients
// outside the ERP login system.

import { Outlet } from 'react-router-dom'

export default function FormsLayout() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--gold), var(--teal))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, color: '#0b0f1a', fontSize: 18,
        }}>B</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Bravura ERP</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Secure Web Form</div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px 16px' }}>
        <Outlet />
      </main>

      <footer style={{
        padding: '16px 32px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-dim)',
        textAlign: 'center',
      }}>
        © {new Date().getFullYear()} Bravura ERP. This form is protected by a unique token — please do not share the URL.
      </footer>
    </div>
  )
}
