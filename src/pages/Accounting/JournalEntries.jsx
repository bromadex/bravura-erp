// src/pages/Accounting/JournalEntries.jsx — Double-entry bookkeeping
import { useState, useMemo } from 'react'
import { useAccounting } from '../../contexts/AccountingContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'

const TODAY = new Date().toISOString().split('T')[0]
const fmt   = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const EMPTY_LINE = { account_id: '', debit: '', credit: '', description: '' }

export default function JournalEntries() {
  const { accounts, journalEntries, journalLines, postEntry, loading } = useAccounting()
  const { user }  = useAuth()
  const canEdit   = useCanEdit('accounting', 'journal-entries')

  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [form, setForm] = useState({ entry_date: TODAY, description: '', reference: '' })
  const [lines, setLines] = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return journalEntries.filter(e =>
      !q || e.description?.toLowerCase().includes(q) || e.reference?.toLowerCase().includes(q)
    )
  }, [journalEntries, search])

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0

  const setLine = (idx, field, value) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addLine   = () => setLines(prev => [...prev, { ...EMPTY_LINE }])
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isBalanced) return toast.error('Entry must balance — debits must equal credits')
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length < 2) return toast.error('At least two lines required')
    setSaving(true)
    try {
      await postEntry({
        ...form,
        lines: validLines.map(l => ({ ...l, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
        createdBy: user?.full_name || user?.username,
      })
      toast.success('Journal entry posted')
      setModal(false)
      setForm({ entry_date: TODAY, description: '', reference: '' })
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }])
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const getEntryLines = (entryId) => journalLines.filter(l => l.entry_id === entryId)
  const getAccountName = (id) => accounts.find(a => a.id === id)?.name || id

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Journal Entries</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{journalEntries.length} entries</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setModal(true)}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span> New Entry
          </button>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <input className="form-control" placeholder="Search description or reference…" style={{ maxWidth: 280 }}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Entries list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="material-icons" style={{ fontSize: 48, opacity: 0.4 }}>book</span>
          <p>No journal entries yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(e => {
            const isOpen  = expanded === e.id
            const eLines  = getEntryLines(e.id)
            return (
              <div key={e.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : e.id)}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(129,140,248,.1)', border: '1px solid rgba(129,140,248,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-icons" style={{ fontSize: 16, color: '#818cf8' }}>receipt_long</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {e.entry_date} {e.reference && <span style={{ fontFamily: 'var(--mono)' }}>· {e.reference}</span>} · {eLines.length} lines
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{fmt(e.total_debit)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>DR = CR</div>
                  </div>
                  <span className="material-icons" style={{ fontSize: 18, color: 'var(--text-dim)' }}>
                    {isOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
                {isOpen && eLines.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '8px 18px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Account</th>
                          <th style={{ padding: '8px 18px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 600 }}>Memo</th>
                          <th style={{ padding: '8px 18px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>Debit</th>
                          <th style={{ padding: '8px 18px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 600 }}>Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eLines.map(l => (
                          <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 18px', fontWeight: 500 }}>{getAccountName(l.account_id)}</td>
                            <td style={{ padding: '7px 18px', color: 'var(--text-dim)' }}>{l.description || '—'}</td>
                            <td style={{ padding: '7px 18px', textAlign: 'right', fontFamily: 'var(--mono)', color: l.debit > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{l.debit > 0 ? fmt(l.debit) : '—'}</td>
                            <td style={{ padding: '7px 18px', textAlign: 'right', fontFamily: 'var(--mono)', color: l.credit > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{l.credit > 0 ? fmt(l.credit) : '—'}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                          <td colSpan={2} style={{ padding: '7px 18px', color: 'var(--text-dim)' }}>Total</td>
                          <td style={{ padding: '7px 18px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{fmt(e.total_debit)}</td>
                          <td style={{ padding: '7px 18px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{fmt(e.total_credit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New Entry modal */}
      {modal && (
        <>
          <div onClick={() => setModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 500 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border2)', zIndex: 501, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-icons" style={{ color: '#818cf8' }}>receipt_long</span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>New Journal Entry</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <span className="material-icons">close</span>
              </button>
            </div>
            <div style={{ padding: 20, maxHeight: 'calc(90vh - 60px)', overflowY: 'auto' }}>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input type="date" required className="form-control" value={form.entry_date}
                      onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reference</label>
                    <input className="form-control" placeholder="INV-001, PO-123…" value={form.reference}
                      onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Description *</label>
                  <input required className="form-control" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>

                {/* Lines */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 32px', gap: 6, marginBottom: 6 }}>
                    {['Account', 'Memo', 'Debit', 'Credit', ''].map(h => (
                      <div key={h} style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 0.5, padding: '0 4px' }}>{h}</div>
                    ))}
                  </div>
                  {lines.map((l, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 32px', gap: 6, marginBottom: 6 }}>
                      <select className="form-control" style={{ fontSize: 12 }} value={l.account_id}
                        onChange={e => setLine(idx, 'account_id', e.target.value)}>
                        <option value="">Account…</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                      <input className="form-control" style={{ fontSize: 12 }} placeholder="Memo" value={l.description}
                        onChange={e => setLine(idx, 'description', e.target.value)} />
                      <input type="number" min="0" step="0.01" className="form-control" style={{ fontSize: 12 }} placeholder="0.00" value={l.debit}
                        onChange={e => { setLine(idx, 'debit', e.target.value); if (e.target.value) setLine(idx, 'credit', '') }} />
                      <input type="number" min="0" step="0.01" className="form-control" style={{ fontSize: 12 }} placeholder="0.00" value={l.credit}
                        onChange={e => { setLine(idx, 'credit', e.target.value); if (e.target.value) setLine(idx, 'debit', '') }} />
                      <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
                        <span className="material-icons" style={{ fontSize: 16 }}>close</span>
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 4 }}>
                    <span className="material-icons" style={{ fontSize: 14 }}>add</span> Add Line
                  </button>
                </div>

                {/* Balance indicator */}
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: isBalanced ? 'rgba(52,211,153,.08)' : 'rgba(239,68,68,.06)', border: `1px solid ${isBalanced ? 'rgba(52,211,153,.25)' : 'rgba(239,68,68,.2)'}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: isBalanced ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                    DR {fmt(totalDebit)} / CR {fmt(totalCredit)}
                    {!isBalanced && totalDebit !== totalCredit && (
                      <span style={{ color: 'var(--red)', marginLeft: 8 }}>Diff: {fmt(Math.abs(totalDebit - totalCredit))}</span>
                    )}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving || !isBalanced}>
                    {saving ? 'Posting…' : 'Post Entry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
