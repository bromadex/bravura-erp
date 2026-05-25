// src/pages/Governance/CodeOfEthics.jsx
// Code of Ethics — Document tab (view/edit with RichTextEditor, version history)
//                  Compliance tab (annual signing dashboard, XLSX export)

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { TabNav } from '../../components/ui'
import { ModalDialog, ModalActions } from '../../components/ui'
import { ConfirmDialog } from '../../components/ui'
import RichTextEditor, { isHtmlContent } from '../../components/ui/RichTextEditor'
import toast from 'react-hot-toast'

// ── Fallback plain text ──────────────────────────────────────────────────────
const FALLBACK_TEXT = `BRAVURA — CODE OF ETHICS

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

const CURRENT_YEAR = new Date().getFullYear()
const TABS = [
  { id: 'document',   label: 'Document',   icon: 'article'    },
  { id: 'compliance', label: 'Compliance', icon: 'verified_user' },
]

// ── Compliance % colour helper ───────────────────────────────────────────────
function complianceColor(pct) {
  if (pct >= 90) return 'var(--green)'
  if (pct >= 75) return 'var(--yellow)'
  return 'var(--red)'
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', minWidth: 130, flex: 1 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mid)', marginTop: 2 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CodeOfEthics() {
  const { user } = useAuth()
  const isAdmin = ['role_super_admin', 'role_hr_manager', 'role_hr'].includes(user?.role_id)

  // ── Tab ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('document')

  // ── Document state ───────────────────────────────────────────────────────
  const [doc,          setDoc]          = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [editing,      setEditing]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [editBody,     setEditBody]     = useState('')
  const [editVersion,  setEditVersion]  = useState('')
  const [changeNotes,  setChangeNotes]  = useState('')

  // ── Version history ───────────────────────────────────────────────────────
  const [versions,      setVersions]      = useState([])
  const [versionsOpen,  setVersionsOpen]  = useState(false)
  const [viewingVer,    setViewingVer]    = useState(null)   // version row to preview

  // ── Confirm reset-signatures dialog ─────────────────────────────────────
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting,    setResetting]    = useState(false)

  // ── Compliance state ─────────────────────────────────────────────────────
  const [sigYear,      setSigYear]      = useState(CURRENT_YEAR)
  const [signatures,   setSignatures]   = useState([])
  const [allUsers,     setAllUsers]     = useState([])
  const [loadingComp,  setLoadingComp]  = useState(false)

  // ════════════════════════════════════════════════════════════════════════════
  // FETCH — document
  // ════════════════════════════════════════════════════════════════════════════
  const fetchDoc = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('governance_documents')
      .select('*')
      .eq('doc_type', 'code_of_ethics')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    setDoc(data || null)
    setLoading(false)
  }, [])

  const fetchVersions = useCallback(async (docId) => {
    const { data } = await supabase
      .from('governance_document_versions')
      .select('*')
      .eq('document_id', docId)
      .order('created_at', { ascending: false })
    setVersions(data || [])
  }, [])

  useEffect(() => { fetchDoc() }, [fetchDoc])
  useEffect(() => {
    if (doc?.id) fetchVersions(doc.id)
  }, [doc?.id, fetchVersions])

  // ════════════════════════════════════════════════════════════════════════════
  // FETCH — compliance
  // ════════════════════════════════════════════════════════════════════════════
  const fetchCompliance = useCallback(async () => {
    setLoadingComp(true)
    const [sigRes, usersRes] = await Promise.all([
      supabase.from('ethics_signatures').select('*').eq('signature_year', sigYear),
      supabase.from('app_users').select('id, full_name, username, employee_id').eq('is_active', true),
    ])
    setSignatures(sigRes.data || [])
    setAllUsers(usersRes.data || [])
    setLoadingComp(false)
  }, [sigYear])

  useEffect(() => {
    if (tab === 'compliance') fetchCompliance()
  }, [tab, fetchCompliance])

  // ════════════════════════════════════════════════════════════════════════════
  // SAVE DOCUMENT
  // ════════════════════════════════════════════════════════════════════════════
  const startEdit = () => {
    const bodyToEdit = doc?.body_html || doc?.body || ''
    setEditBody(bodyToEdit)
    setEditVersion(doc?.version || '1.0')
    setChangeNotes('')
    setEditing(true)
  }

  // Called after user confirms (or directly if no signatures exist)
  const doSave = async () => {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      if (doc) {
        const { error } = await supabase
          .from('governance_documents')
          .update({ body_html: editBody, version: editVersion, updated_at: now })
          .eq('id', doc.id)
        if (error) throw error
        // Version snapshot
        const { error: vErr } = await supabase
          .from('governance_document_versions')
          .insert([{
            document_id:    doc.id,
            version:        editVersion,
            body_html:      editBody,
            change_notes:   changeNotes,
            changed_by:     user.id,
            changed_by_name: user.full_name || user.username || '',
            effective_date: now.slice(0, 10),
          }])
        if (vErr) throw vErr
      } else {
        const newId = crypto.randomUUID()
        const { error } = await supabase.from('governance_documents').insert([{
          id:                      newId,
          doc_type:                'code_of_ethics',
          title:                   'Bravura Code of Ethics',
          body_html:               editBody,
          version:                 editVersion,
          is_mandatory_onboarding: true,
          published_by:            user.id,
          created_at:              now,
          updated_at:              now,
        }])
        if (error) throw error
        // Version snapshot
        await supabase.from('governance_document_versions').insert([{
          document_id:    newId,
          version:        editVersion,
          body_html:      editBody,
          change_notes:   changeNotes || 'Initial version',
          changed_by:     user.id,
          changed_by_name: user.full_name || user.username || '',
          effective_date: now.slice(0, 10),
        }])
      }

      toast.success('Code of Ethics updated — v' + editVersion)
      setEditing(false)
      fetchDoc()
    } catch (err) {
      toast.error(err.message)
    } finally { setSaving(false) }
  }

  // Handle Save button — check for existing signatures first
  const handleSave = async () => {
    // Check if there are any signatures for current year to warn about reset
    const { data: existingSigs } = await supabase
      .from('ethics_signatures')
      .select('id')
      .eq('signature_year', CURRENT_YEAR)
      .limit(1)

    if (existingSigs && existingSigs.length > 0) {
      setConfirmReset(true)
    } else {
      await doSave()
    }
  }

  const handleConfirmReset = async () => {
    setResetting(true)
    try {
      // Delete all ethics_signatures for current year
      const { error: delErr } = await supabase
        .from('ethics_signatures')
        .delete()
        .eq('signature_year', CURRENT_YEAR)
      if (delErr) throw delErr

      // Reset has_signed_code_of_ethics for all active users
      const { error: updErr } = await supabase
        .from('app_users')
        .update({ has_signed_code_of_ethics: false })
        .eq('is_active', true)
      if (updErr) throw updErr

      setConfirmReset(false)
      await doSave()
    } catch (err) {
      toast.error('Reset failed: ' + err.message)
    } finally { setResetting(false) }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPORT XLSX
  // ════════════════════════════════════════════════════════════════════════════
  const exportXlsx = () => {
    const signedSet = new Set(signatures.map(s => s.user_id))
    const rows = allUsers.map(u => ({
      Employee:  u.full_name || u.username,
      Status:    signedSet.has(u.id) ? 'Signed' : 'Pending',
      'Signed At': signedSet.has(u.id)
        ? new Date(signatures.find(s => s.user_id === u.id)?.signed_at).toLocaleDateString('en-GB')
        : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Ethics ${sigYear}`)
    XLSX.writeFile(wb, `EthicsCompliance_${sigYear}.xlsx`)
    toast.success('Exported')
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ════════════════════════════════════════════════════════════════════════════
  const displayHtml = doc?.body_html || doc?.body || ''
  const isHtml      = isHtmlContent(displayHtml)
  const updatedDate = doc
    ? new Date(doc.updated_at || doc.created_at).toLocaleDateString('en-GB')
    : null

  const signedSet    = new Set(signatures.map(s => s.user_id))
  const totalEmp     = allUsers.length
  const totalSigned  = signedSet.size
  const totalPending = totalEmp - totalSigned
  const pct          = totalEmp > 0 ? Math.round((totalSigned / totalEmp) * 100) : 0
  const pctColor     = complianceColor(pct)

  const signedEmployees  = allUsers.filter(u => signedSet.has(u.id))
  const pendingEmployees = allUsers.filter(u => !signedSet.has(u.id))

  const yearOptions = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

  // ════════════════════════════════════════════════════════════════════════════
  // JSX
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: 24 }}>
      {/* Print CSS */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }} className="no-print">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Code of Ethics</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Mandatory onboarding document — applies to all employees</div>
        </div>
        {tab === 'document' && !editing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => window.print()}>
              <span className="material-icons" style={{ fontSize: 16 }}>print</span> Print
            </button>
            {isAdmin && (
              <button className="btn btn-secondary" onClick={startEdit}>
                <span className="material-icons" style={{ fontSize: 16 }}>edit</span> Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="no-print">
        <TabNav tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {/* ═══════════════════ TAB: DOCUMENT ═══════════════════ */}
      {tab === 'document' && (
        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
          ) : editing ? (
            /* ── Edit mode ── */
            <div className="no-print">
              {/* Version + change notes row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: '0 0 160px' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Version</label>
                  <input
                    className="form-input"
                    value={editVersion}
                    onChange={e => setEditVersion(e.target.value)}
                    placeholder="e.g. 1.1"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Change Notes</label>
                  <textarea
                    className="form-input"
                    value={changeNotes}
                    onChange={e => setChangeNotes(e.target.value)}
                    placeholder="What changed in this version?"
                    rows={1}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Rich text editor */}
              <RichTextEditor
                value={editBody}
                onChange={setEditBody}
                toolbar="full"
                minHeight={400}
                placeholder="Write the Code of Ethics here…"
              />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <>
              {/* Gold meta banner */}
              {doc && (
                <div style={{ background: 'rgba(184,163,100,.1)', border: '1px solid rgba(184,163,100,.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gold)', flexWrap: 'wrap' }}>
                  <span className="material-icons" style={{ fontSize: 15 }}>history</span>
                  Last updated {updatedDate}
                  {doc.version && <> · v{doc.version}</>}
                  {doc.published_by_name && <> · {doc.published_by_name}</>}
                </div>
              )}

              {/* Document body */}
              {isHtml ? (
                <div
                  className="ql-editor"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', minHeight: 300 }}
                  dangerouslySetInnerHTML={{ __html: displayHtml }}
                />
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px', whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.8, color: 'var(--text-mid)' }}>
                  {displayHtml || FALLBACK_TEXT}
                </div>
              )}

              {/* No doc fallback notice */}
              {!doc && (
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>Using default content</div>
              )}

              {/* Version history — collapsible */}
              {doc && (
                <div className="no-print" style={{ marginTop: 24 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() => setVersionsOpen(v => !v)}
                  >
                    <span className="material-icons" style={{ fontSize: 15 }}>
                      {versionsOpen ? 'expand_less' : 'expand_more'}
                    </span>
                    {versionsOpen ? 'Hide' : 'Show'} Version History
                    {versions.length > 0 && (
                      <span className="badge badge-dim" style={{ marginLeft: 6 }}>{versions.length}</span>
                    )}
                  </button>

                  {versionsOpen && (
                    <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      {versions.length === 0 ? (
                        <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text-dim)' }}>No version history yet.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface2)' }}>
                              {['Version', 'Date', 'Changed By', 'Notes', ''].map(h => (
                                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {versions.map((v, idx) => (
                              <tr key={v.id} style={{ borderBottom: idx < versions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--gold)' }}>v{v.version}</td>
                                <td style={{ padding: '8px 14px', color: 'var(--text-mid)' }}>
                                  {new Date(v.created_at).toLocaleDateString('en-GB')}
                                </td>
                                <td style={{ padding: '8px 14px', color: 'var(--text-mid)' }}>{v.changed_by_name || '—'}</td>
                                <td style={{ padding: '8px 14px', color: 'var(--text-dim)', maxWidth: 260 }}>{v.change_notes || '—'}</td>
                                <td style={{ padding: '8px 14px' }}>
                                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setViewingVer(v)}>
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: COMPLIANCE ═══════════════════ */}
      {tab === 'compliance' && (
        <div style={{ marginTop: 20 }}>
          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--text-mid)' }}>Year:</label>
              <select
                className="form-input"
                value={sigYear}
                onChange={e => setSigYear(Number(e.target.value))}
                style={{ width: 120 }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary" onClick={exportXlsx} disabled={loadingComp}>
              <span className="material-icons" style={{ fontSize: 16 }}>download</span>
              Export XLSX
            </button>
          </div>

          {loadingComp ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
          ) : (
            <>
              {/* KPI cards */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <KPI label="Total Employees" value={totalEmp} />
                <KPI label="Signed"          value={totalSigned} color="var(--green)" />
                <KPI label="Pending"         value={totalPending} color={totalPending > 0 ? 'var(--yellow)' : 'var(--text)'} />
                <KPI
                  label="% Compliance"
                  value={`${pct}%`}
                  color={pctColor}
                  sub={pct >= 90 ? 'On track' : pct >= 75 ? 'Needs attention' : 'Action required'}
                />
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pctColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, textAlign: 'right' }}>
                  {totalSigned} of {totalEmp} employees signed for {sigYear}
                </div>
              </div>

              {/* Signed employees table */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  Signed Employees
                  <span className="badge badge-green" style={{ marginLeft: 8 }}>{signedEmployees.length}</span>
                </div>
                {signedEmployees.length === 0 ? (
                  <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--text-dim)' }}>No signatures recorded yet for {sigYear}.</div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          {['Employee', 'Signed At'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {signedEmployees.map((u, idx) => {
                          const sig = signatures.find(s => s.user_id === u.id)
                          return (
                            <tr key={u.id} style={{ borderBottom: idx < signedEmployees.length - 1 ? '1px solid var(--border)' : 'none' }}>
                              <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{u.full_name || u.username}</td>
                              <td style={{ padding: '8px 14px', color: 'var(--text-mid)' }}>
                                {sig?.signed_at ? new Date(sig.signed_at).toLocaleDateString('en-GB') : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pending employees table */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  Pending Employees
                  <span className="badge badge-yellow" style={{ marginLeft: 8 }}>{pendingEmployees.length}</span>
                </div>
                {pendingEmployees.length === 0 ? (
                  <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--green)' }}>All employees have signed.</div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          {['Employee', 'Action'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pendingEmployees.map((u, idx) => (
                          <tr key={u.id} style={{ borderBottom: idx < pendingEmployees.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{u.full_name || u.username}</td>
                            <td style={{ padding: '8px 14px' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: 11, padding: '3px 10px' }}
                                onClick={() => toast.info('Reminder feature coming soon')}
                              >
                                <span className="material-icons" style={{ fontSize: 13 }}>notifications</span>
                                Remind
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* Version preview modal */}
      <ModalDialog
        open={!!viewingVer}
        onClose={() => setViewingVer(null)}
        title={`Version ${viewingVer?.version} · ${viewingVer ? new Date(viewingVer.created_at).toLocaleDateString('en-GB') : ''}`}
        size="lg"
      >
        {viewingVer && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {viewingVer.change_notes && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
                <strong>Notes:</strong> {viewingVer.change_notes}
              </div>
            )}
            {isHtmlContent(viewingVer.body_html) ? (
              <div
                className="ql-editor"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}
                dangerouslySetInnerHTML={{ __html: viewingVer.body_html }}
              />
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.8, color: 'var(--text-mid)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 20 }}>
                {viewingVer.body_html}
              </pre>
            )}
          </div>
        )}
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setViewingVer(null)}>Close</button>
        </ModalActions>
      </ModalDialog>

      {/* Confirm re-sign reset dialog */}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleConfirmReset}
        title="Reset All Signatures?"
        message={`This will require all employees to re-sign the Code of Ethics for ${CURRENT_YEAR}. Their "has_signed" flag will be reset and they will be shown the sign gate on next login. Proceed?`}
        confirmLabel="Yes, Reset & Save"
        danger
        loading={resetting}
      />
    </div>
  )
}
