// src/pages/Governance/EthicsGate.jsx
//
// Full-page gate shown before home screen when has_signed_code_of_ethics = false.
// Cannot be dismissed without signing. Updates the user record on submit.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const CODE_OF_ETHICS = `BRAVURA / KAMATIVI — CODE OF ETHICS

1. INTEGRITY
   We conduct all business honestly and transparently. We do not misrepresent facts, falsify records, or engage in deceptive practices.

2. CONFIDENTIALITY
   Company information, employee data, financial records, and operational details are confidential. We do not share this information with unauthorised parties inside or outside the organisation.

3. CONFLICTS OF INTEREST
   We avoid situations where personal interests conflict with company interests. Where a conflict exists, it must be disclosed immediately to your supervisor.

4. FAIR TREATMENT
   We treat all colleagues, clients, and contractors with respect and dignity. Discrimination, harassment, or bullying of any kind is prohibited.

5. RESPONSIBLE USE OF COMPANY RESOURCES
   Company assets — equipment, vehicles, fuel, materials, and systems — are used for legitimate business purposes only. Personal use without authorisation is prohibited.

6. REPORTING VIOLATIONS
   Employees who observe unethical conduct must report it through proper channels. Retaliation against anyone who reports a concern in good faith is prohibited.

7. COMPLIANCE WITH LAWS AND REGULATIONS
   We comply with all applicable laws and regulations in Zimbabwe and internationally. Ignorance of the law is not an excuse.

8. ENVIRONMENTAL RESPONSIBILITY
   We conduct operations in a manner that minimises environmental impact and complies with all environmental standards applicable to our sites.

9. HEALTH AND SAFETY
   Every employee is responsible for maintaining a safe working environment. Safety shortcuts that risk lives are never acceptable regardless of operational pressure.

10. PROTECTING THE BRAVURA REPUTATION
    Our reputation is our most valuable asset. Every employee is an ambassador of the Bravura brand and is expected to behave accordingly at all times.

---

By signing below, I acknowledge that I have read and understood the Bravura Code of Ethics and agree to abide by its principles in all aspects of my work.`

export default function EthicsGate() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()

  const [agreed,  setAgreed]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  const handleSign = async () => {
    if (!agreed) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ has_signed_code_of_ethics: true })
        .eq('id', user.id)
      if (error) throw error
      // Update local user state so ProtectedRoute re-evaluates
      if (setUser) setUser(prev => ({ ...prev, has_signed_code_of_ethics: true }))
      toast.success('Code of Ethics signed. Welcome.')
      navigate('/')
    } catch (err) {
      toast.error('Failed to record signature: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2, marginBottom: 6 }}>BRAVURA ERP</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Code of Ethics</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            Before accessing the system, you must read and acknowledge the Bravura Code of Ethics.
          </p>
        </div>

        {/* Document */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, marginBottom: 24, maxHeight: '50vh', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--text-mid)' }}>
          {CODE_OF_ETHICS}
        </div>

        {/* Sign-off form */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Signing as: <strong style={{ color: 'var(--text)' }}>{user?.full_name || user?.username}</strong>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              I have read and understood the Bravura Code of Ethics. I agree to comply with its principles and understand that violations may result in disciplinary action including termination.
            </span>
          </label>

          <button
            onClick={handleSign}
            disabled={!agreed || saving}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14 }}
          >
            {saving ? 'Recording signature…' : 'Sign and Continue'}
          </button>
        </div>

      </div>
    </div>
  )
}
