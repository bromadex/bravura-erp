// src/pages/Governance/EthicsGate.jsx
//
// Full-page gate shown before home screen when has_signed_code_of_ethics = false
// OR when the user has not signed for the current calendar year.
// Cannot be dismissed without signing. Updates app_users and ethics_signatures on submit.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { isHtmlContent } from '../../components/ui/RichTextEditor'
import toast from 'react-hot-toast'

const FALLBACK_CODE_OF_ETHICS = `BRAVURA — CODE OF ETHICS

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

  const currentYear = new Date().getFullYear()

  const [agreed,      setAgreed]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [checking,    setChecking]    = useState(true)
  const [doc,         setDoc]         = useState(null)
  const [companyName, setCompanyName] = useState('Bravura')

  // On mount: check annual signature + fetch document + company name
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setChecking(true)
      try {
        // 1. Check if user already signed this year
        const { data: sig } = await supabase
          .from('ethics_signatures')
          .select('id')
          .eq('user_id', user.id)
          .eq('signature_year', currentYear)
          .maybeSingle()

        if (!cancelled && !sig === false) {
          // sig exists → already signed this year
          navigate('/')
          return
        }

        // 2. Fetch governance document
        const { data: docRow } = await supabase
          .from('governance_documents')
          .select('id, body_html, body')
          .eq('doc_type', 'code_of_ethics')
          .maybeSingle()

        if (!cancelled && docRow) setDoc(docRow)

        // 3. Fetch company name from payroll_settings
        const { data: ps } = await supabase
          .from('payroll_settings')
          .select('company_name')
          .limit(1)
          .single()

        if (!cancelled && ps?.company_name) setCompanyName(ps.company_name)
      } catch {
        // non-fatal — fall through to display gate with defaults
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [user.id, currentYear, navigate])

  const handleSign = async () => {
    if (!agreed) return
    setSaving(true)
    try {
      const now = new Date().toISOString()

      // 1. Update app_users flag
      const { error: userErr } = await supabase
        .from('app_users')
        .update({ has_signed_code_of_ethics: true })
        .eq('id', user.id)
      if (userErr) throw userErr

      // 2. Upsert ethics_signatures row for this year
      const { error: sigErr } = await supabase
        .from('ethics_signatures')
        .upsert(
          [{
            user_id:       user.id,
            user_name:     user.full_name || user.username,
            employee_id:   user.employee_id ?? null,
            signature_year: currentYear,
            document_id:   doc?.id ?? null,
            signed_at:     now,
          }],
          { onConflict: 'user_id,signature_year' }
        )
      if (sigErr) throw sigErr

      // Update local user state so ProtectedRoute re-evaluates
      if (setUser) setUser(prev => ({ ...prev, has_signed_code_of_ethics: true }))
      toast.success('Code of Ethics signed. Welcome.')
      navigate('/')
    } catch (err) {
      toast.error('Failed to record signature: ' + err.message)
    } finally { setSaving(false) }
  }

  // Derive document content
  const docContent = doc?.body_html || doc?.body || null
  const useHtml    = docContent ? isHtmlContent(docContent) : false

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>Checking compliance status…</div>
          <div style={{
            width: 32, height: 32, border: '3px solid var(--border)',
            borderTopColor: 'var(--gold)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto',
          }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2, marginBottom: 6 }}>
            BRAVURA ERP
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            Code of Ethics {currentYear}
          </h1>
          {/* Gold badge */}
          <span style={{
            display: 'inline-block',
            fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            background: 'var(--gold)22', color: 'var(--gold)',
            border: '1px solid var(--gold)66', letterSpacing: 0.5,
            marginBottom: 12,
          }}>
            Annual Compliance Document
          </span>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            Before accessing the system, you must read and acknowledge the {companyName} Code of Ethics for {currentYear}.
          </p>
        </div>

        {/* Document */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 32, marginBottom: 24,
          maxHeight: '50vh', overflowY: 'auto',
        }}>
          {useHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: docContent }}
              style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-mid)' }}
            />
          ) : (
            <pre style={{
              whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)',
              fontSize: 12, lineHeight: 1.7, color: 'var(--text-mid)', margin: 0,
            }}>
              {docContent || FALLBACK_CODE_OF_ETHICS}
            </pre>
          )}
        </div>

        {/* Sign-off form */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Signing as: <strong style={{ color: 'var(--text)' }}>{user?.full_name || user?.username}</strong>
            {user?.employee_id && (
              <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>· {user.employee_id}</span>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--gold)', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              I have read, understood, and agree to uphold the {companyName} Code of Ethics for {currentYear}. I understand that violations may result in disciplinary action including termination.
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
