// src/pages/Governance/Policies.jsx — Policy documents with sign-off tracking

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function Policies() {
  const { user } = useAuth()
  const [policies,     setPolicies]     = useState([])
  const [signatures,   setSignatures]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [signing,      setSigning]      = useState(null)
  const [savingSig,    setSavingSig]    = useState(false)

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  const fetch = async () => {
    setLoading(true)
    const [pRes, sRes] = await Promise.all([
      supabase.from('policies').select('*').order('created_at', { ascending: false }),
      supabase.from('policy_signatures').select('*').eq('user_id', user.id),
    ])
    if (pRes.data) setPolicies(pRes.data)
    if (sRes.data) setSignatures(sRes.data)
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const hasSigned = (policyId) => signatures.some(s => s.policy_id === policyId)

  const handleSign = async (policy) => {
    setSavingSig(true)
    try {
      const { error } = await supabase.from('policy_signatures').insert([{
        id:          crypto.randomUUID(),
        policy_id:   policy.id,
        user_id:     user.id,
        signed_at:   new Date().toISOString(),
      }])
      if (error) throw error
      toast.success(`"${policy.title}" signed`)
      setSigning(null)
      fetch()
    } catch (err) {
      toast.error(err.message)
    } finally { setSavingSig(false) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Policies</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Company policies requiring acknowledgement</div>
      </div>

      {policies.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>description</span>
          <p>No policies published yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {policies.map(p => {
            const signed = hasSigned(p.id)
            return (
              <div key={p.id} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span className="material-icons" style={{ fontSize: 32, color: signed ? 'var(--green)' : 'var(--yellow)', flexShrink: 0 }}>
                  {signed ? 'verified' : 'description'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</div>
                  {p.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{p.description}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                    Version {p.version || '1.0'} · {new Date(p.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
                {signed ? (
                  <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>Signed</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setSigning(p)}>
                    <span className="material-icons" style={{ fontSize: 14 }}>draw</span> Sign
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {signing && (
        <>
          <div onClick={() => setSigning(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 401, padding: 24 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Acknowledge Policy</div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
              You are about to acknowledge <strong style={{ color: 'var(--text)' }}>{signing.title}</strong>. This confirms you have read and understood this policy.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSigning(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleSign(signing)} disabled={savingSig}>
                {savingSig ? 'Signing…' : 'Confirm Signature'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
