// src/pages/Governance/CodeOfEthics.jsx
// Displays the Code of Ethics document from governance_documents
// where is_mandatory_onboarding=true. Admins can manage content.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const FALLBACK_TEXT = `BRAVURA / KAMATIVI — CODE OF ETHICS

1. INTEGRITY
   We conduct all business honestly and transparently. We do not misrepresent facts, falsify records, or engage in deceptive practices.

2. CONFIDENTIALITY
   Company information, employee data, financial records, and operational details are confidential. We do not share this information with unauthorised parties.

3. CONFLICTS OF INTEREST
   We avoid situations where personal interests conflict with company interests. Where a conflict exists, it must be disclosed immediately.

4. FAIR TREATMENT
   We treat all colleagues, clients, and contractors with respect and dignity. Discrimination, harassment, or bullying of any kind is prohibited.

5. RESPONSIBLE USE OF COMPANY RESOURCES
   Company assets are used for legitimate business purposes only. Personal use without authorisation is prohibited.

6. REPORTING VIOLATIONS
   Employees who observe unethical conduct must report it. Retaliation against anyone who reports a concern in good faith is prohibited.

7. COMPLIANCE WITH LAWS
   We comply with all applicable laws and regulations. Ignorance of the law is not an excuse.

8. ENVIRONMENTAL RESPONSIBILITY
   We conduct operations in a manner that minimises environmental impact.

9. HEALTH AND SAFETY
   Every employee is responsible for maintaining a safe working environment.

10. PROTECTING THE BRAVURA REPUTATION
    Every employee is an ambassador of the Bravura brand and is expected to behave accordingly at all times.`

export default function CodeOfEthics() {
  const { user } = useAuth()
  const [doc,      setDoc]      = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [editBody, setEditBody] = useState('')

  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  const fetchDoc = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('governance_documents')
      .select('*')
      .eq('doc_type', 'code_of_ethics')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    setDoc(data || null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchDoc() }, [fetchDoc])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (doc) {
        const { error } = await supabase.from('governance_documents')
          .update({ body: editBody, updated_at: new Date().toISOString() })
          .eq('id', doc.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('governance_documents').insert([{
          id:                       crypto.randomUUID(),
          doc_type:                 'code_of_ethics',
          title:                    'Bravura Code of Ethics',
          body:                     editBody,
          is_mandatory_onboarding:  true,
          published_by:             user.id,
          created_at:               new Date().toISOString(),
        }])
        if (error) throw error
      }
      toast.success('Code of Ethics updated')
      setEditing(false)
      fetchDoc()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  const displayText = loading ? '' : (doc?.body || FALLBACK_TEXT)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Code of Ethics</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Mandatory onboarding document — applies to all employees</div>
        </div>
        {isAdmin && !editing && (
          <button className="btn btn-secondary" onClick={() => { setEditBody(displayText); setEditing(true) }}>
            <span className="material-icons" style={{ fontSize: 16 }}>edit</span> Edit
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : editing ? (
        <div>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={30}
            style={{ width: '100%', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)', lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.8, color: 'var(--text-mid)' }}>
            {displayText}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
            {doc ? `Last updated: ${new Date(doc.updated_at || doc.created_at).toLocaleDateString('en-GB')}` : 'Using default content'}
          </div>
        </>
      )}
    </div>
  )
}
