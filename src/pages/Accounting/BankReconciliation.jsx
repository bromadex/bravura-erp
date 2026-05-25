// src/pages/Accounting/BankReconciliation.jsx — Bank Statement Import & Reconciliation
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { EmptyState } from '../../components/ui'
import toast from 'react-hot-toast'

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const MATCH_COLORS = {
  matched:   'var(--green)',
  partial:   'var(--yellow)',
  unmatched: 'var(--red)',
  excluded:  'var(--text-dim)',
}

function MatchBadge({ status }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: MATCH_COLORS[status] || 'var(--border)',
      color: status === 'unmatched' ? 'var(--surface)' : status === 'excluded' ? 'var(--text-dim)' : 'var(--surface)',
      opacity: status === 'excluded' ? 0.6 : 1,
    }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.04em' }}>
        {label.toUpperCase()}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

function autoMatch(lines, pvs) {
  const matched = []
  const usedPvIds = new Set()
  lines.forEach(line => {
    if (line.match_status !== 'unmatched') return
    const lineAmt = line.debit || line.credit
    const candidates = pvs.filter(pv => {
      if (usedPvIds.has(pv.id)) return false
      const pvAmt = pv.wht_applicable ? (pv.net_payment || pv.total_amount) : pv.total_amount
      const amtMatch = Math.abs(pvAmt - lineAmt) < 0.01
      const dateDiff = Math.abs(new Date(line.transaction_date) - new Date(pv.payment_date)) / 86400000
      return amtMatch && dateDiff <= 3
    })
    if (candidates.length === 1) {
      matched.push({ lineId: line.id, pvId: candidates[0].id })
      usedPvIds.add(candidates[0].id)
    }
  })
  return matched
}

export default function BankReconciliation() {
  const [bankAccounts, setBankAccounts]         = useState([])
  const [selectedAccount, setSelectedAccount]   = useState(null)
  const [stmtLines, setStmtLines]               = useState([])
  const [pvRows, setPvRows]                     = useState([])
  const [glAccounts, setGlAccounts]             = useState([])
  const [fromDate, setFromDate]                 = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [toDate, setToDate]                     = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading]                   = useState(false)
  const [showAddBankModal, setShowAddBankModal] = useState(false)
  const [showAddLineModal, setShowAddLineModal] = useState(false)
  const [activeTab, setActiveTab]               = useState('reconcile')
  const [matchTarget, setMatchTarget]           = useState(null) // lineId being matched
  const [matchPvId, setMatchPvId]               = useState('')

  // Add bank form state
  const [bankForm, setBankForm] = useState({ account_name: '', bank_name: '', account_number: '', currency: 'USD', gl_account_id: '', opening_balance: '0', notes: '' })
  // Add line form state
  const [lineForm, setLineForm] = useState({ transaction_date: new Date().toISOString().split('T')[0], value_date: '', description: '', reference: '', debit: '', credit: '', running_balance: '' })

  // Load bank accounts on mount
  useEffect(() => {
    loadBankAccounts()
    loadGlAccounts()
  }, [])

  const loadGlAccounts = async () => {
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name, type')
      .eq('type', 'Asset')
      .eq('is_active', true)
      .order('code')
    if (data) setGlAccounts(data)
  }

  const loadBankAccounts = async () => {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*, accounts(code, name, balance)')
      .eq('is_active', true)
      .order('account_name')
    if (error) { toast.error('Failed to load bank accounts'); return }
    setBankAccounts(data || [])
    if (data?.length && !selectedAccount) setSelectedAccount(data[0])
  }

  const loadStatementData = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    try {
      const [linesRes, pvsRes] = await Promise.all([
        supabase
          .from('bank_statement_lines')
          .select('*')
          .eq('bank_account_id', selectedAccount.id)
          .gte('transaction_date', fromDate)
          .lte('transaction_date', toDate)
          .order('transaction_date'),
        supabase
          .from('payment_vouchers')
          .select('id, pv_number, supplier_name, payment_date, total_amount, payment_method, net_payment, wht_applicable')
          .gte('payment_date', fromDate)
          .lte('payment_date', toDate)
          .not('status', 'eq', 'Cancelled'),
      ])
      setStmtLines(linesRes.data || [])
      setPvRows(pvsRes.data || [])
    } catch (e) {
      toast.error('Failed to load statement data')
    } finally { setLoading(false) }
  }, [selectedAccount, fromDate, toDate])

  const handleAutoMatch = async () => {
    if (!stmtLines.length) return
    const matches = autoMatch(stmtLines, pvRows)
    if (!matches.length) { toast('No automatic matches found'); return }
    let count = 0
    for (const m of matches) {
      const { error } = await supabase
        .from('bank_statement_lines')
        .update({ match_status: 'matched', matched_voucher_id: m.pvId })
        .eq('id', m.lineId)
      if (!error) count++
    }
    toast.success(`Auto-matched ${count} transaction${count !== 1 ? 's' : ''}`)
    await loadStatementData()
  }

  const handleMatchLine = async (lineId, pvId) => {
    if (!pvId) return
    const { error } = await supabase
      .from('bank_statement_lines')
      .update({ match_status: 'matched', matched_voucher_id: pvId })
      .eq('id', lineId)
    if (error) { toast.error('Match failed'); return }
    toast.success('Line matched')
    setMatchTarget(null)
    setMatchPvId('')
    await loadStatementData()
  }

  const handleExcludeLine = async (lineId) => {
    const { error } = await supabase
      .from('bank_statement_lines')
      .update({ match_status: 'excluded' })
      .eq('id', lineId)
    if (error) { toast.error('Update failed'); return }
    await loadStatementData()
  }

  const handleUnmatchLine = async (lineId) => {
    const { error } = await supabase
      .from('bank_statement_lines')
      .update({ match_status: 'unmatched', matched_voucher_id: null })
      .eq('id', lineId)
    if (error) { toast.error('Update failed'); return }
    await loadStatementData()
  }

  const handleAddBank = async () => {
    if (!bankForm.account_name || !bankForm.bank_name) { toast.error('Account Name and Bank Name are required'); return }
    const { error } = await supabase.from('bank_accounts').insert([{
      account_name:    bankForm.account_name,
      bank_name:       bankForm.bank_name,
      account_number:  bankForm.account_number || null,
      currency:        bankForm.currency || 'USD',
      gl_account_id:   bankForm.gl_account_id || null,
      opening_balance: parseFloat(bankForm.opening_balance) || 0,
      notes:           bankForm.notes || null,
    }])
    if (error) { toast.error('Failed to create bank account'); return }
    toast.success('Bank account created')
    setShowAddBankModal(false)
    setBankForm({ account_name: '', bank_name: '', account_number: '', currency: 'USD', gl_account_id: '', opening_balance: '0', notes: '' })
    await loadBankAccounts()
  }

  const handleAddLine = async () => {
    if (!lineForm.transaction_date || !lineForm.description) { toast.error('Date and Description are required'); return }
    const { error } = await supabase.from('bank_statement_lines').insert([{
      bank_account_id:  selectedAccount.id,
      transaction_date: lineForm.transaction_date,
      value_date:       lineForm.value_date || null,
      description:      lineForm.description,
      reference:        lineForm.reference || null,
      debit:            parseFloat(lineForm.debit) || 0,
      credit:           parseFloat(lineForm.credit) || 0,
      running_balance:  lineForm.running_balance !== '' ? parseFloat(lineForm.running_balance) : null,
    }])
    if (error) { toast.error('Failed to add line'); return }
    toast.success('Statement line added')
    setShowAddLineModal(false)
    setLineForm({ transaction_date: new Date().toISOString().split('T')[0], value_date: '', description: '', reference: '', debit: '', credit: '', running_balance: '' })
    await loadStatementData()
  }

  // Reconciliation calculations
  const recon = useMemo(() => {
    if (!selectedAccount || !stmtLines.length) return null

    const lastWithBalance = [...stmtLines].reverse().find(l => l.running_balance != null)
    const stmtClosingBalance = lastWithBalance
      ? lastWithBalance.running_balance
      : stmtLines.reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0) + (selectedAccount.opening_balance || 0)

    const matchedVoucherIds = new Set(stmtLines.filter(l => l.matched_voucher_id).map(l => l.matched_voucher_id))
    const outstandingPayments = pvRows.filter(pv => !matchedVoucherIds.has(pv.id))
    const outstandingTotal    = outstandingPayments.reduce((s, pv) => s + (pv.wht_applicable ? (pv.net_payment || pv.total_amount) : pv.total_amount), 0)

    const depositsInTransit = stmtLines.filter(l => l.match_status === 'unmatched' && (l.credit || 0) > 0)
    const depositsTotal     = depositsInTransit.reduce((s, l) => s + (l.credit || 0), 0)

    const adjustedBalance = stmtClosingBalance - outstandingTotal + depositsTotal
    const glBalance       = selectedAccount.accounts?.balance || 0
    const difference      = adjustedBalance - glBalance
    const reconciled      = Math.abs(difference) < 0.01

    return { stmtClosingBalance, outstandingTotal, depositsTotal, adjustedBalance, glBalance, difference, reconciled, outstandingPayments }
  }, [selectedAccount, stmtLines, pvRows])

  const unmatchedPvs = useMemo(() => {
    const matchedVoucherIds = new Set(stmtLines.filter(l => l.matched_voucher_id).map(l => l.matched_voucher_id))
    return pvRows.filter(pv => !matchedVoucherIds.has(pv.id))
  }, [stmtLines, pvRows])

  const tabs = [
    { id: 'reconcile', label: 'Reconciliation',   icon: 'balance' },
    { id: 'statement', label: 'Statement Lines',   icon: 'list_alt' },
    { id: 'unmatched', label: 'Unmatched Payments', icon: 'link_off' },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Bank Reconciliation</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Match statement lines against GL entries</div>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowAddBankModal(true)}>
          <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Bank Account
        </button>
      </div>

      {bankAccounts.length === 0 ? (
        <EmptyState
          icon="account_balance"
          title="No bank accounts configured"
          description="Add a bank account to start reconciling your transactions."
          action={{ label: 'Add Bank Account', onClick: () => setShowAddBankModal(true) }}
        />
      ) : (
        <>
          {/* Controls bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>account_balance</span>
            <select className="form-control" style={{ width: 220 }}
              value={selectedAccount?.id || ''}
              onChange={e => setSelectedAccount(bankAccounts.find(b => b.id === e.target.value))}>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
              ))}
            </select>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)', marginLeft: 8 }}>date_range</span>
            <input type="date" className="form-control" style={{ width: 140 }}
              value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
            <input type="date" className="form-control" style={{ width: 140 }}
              value={toDate} onChange={e => setToDate(e.target.value)} />
            <button className="btn btn-primary" onClick={loadStatementData} disabled={loading}>
              <span className="material-icons" style={{ fontSize: 16 }}>refresh</span>
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === t.id ? 'var(--gold)' : 'transparent'}`, color: activeTab === t.id ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-icons" style={{ fontSize: 16 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* ── Reconciliation Tab ───────────────────────────────── */}
          {activeTab === 'reconcile' && (
            !recon ? (
              <EmptyState icon="balance" title="No statement data loaded" description="Select a bank account, set a date range, and click Load." />
            ) : (
              <div style={{ maxWidth: 640 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 12, letterSpacing: '0.04em' }}>
                  BANK RECONCILIATION — {selectedAccount.account_name} — {fromDate} to {toDate}
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {[
                    { label: 'Statement Closing Balance',         value: recon.stmtClosingBalance,  bold: false, indent: 0 },
                    { label: 'Less: Outstanding Payments',        value: -recon.outstandingTotal,    bold: false, indent: 1, note: `(${recon.outstandingPayments.length} payment${recon.outstandingPayments.length !== 1 ? 's' : ''})` },
                    { label: 'Add: Unmatched Deposits',           value: recon.depositsTotal,        bold: false, indent: 1 },
                    null, // separator
                    { label: 'ADJUSTED BALANCE',                  value: recon.adjustedBalance,      bold: true,  indent: 0 },
                    { label: 'GL Book Balance',                   value: recon.glBalance,            bold: false, indent: 0 },
                    null,
                    { label: recon.reconciled ? '✓ RECONCILED — DIFFERENCE' : '⚠ DIFFERENCE', value: recon.difference, bold: true, indent: 0, highlight: recon.reconciled ? 'var(--green)' : 'var(--red)' },
                  ].map((row, i) => {
                    if (!row) return <div key={i} style={{ borderTop: '2px solid var(--border2)', margin: '0' }} />
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: row.bold ? 'var(--surface2)' : 'transparent',
                      }}>
                        <span style={{ fontSize: row.bold ? 13 : 12, fontWeight: row.bold ? 800 : 400, color: row.highlight || (row.bold ? 'var(--text)' : 'var(--text-mid)'), paddingLeft: row.indent ? 20 : 0 }}>
                          {row.label}{row.note && <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>{row.note}</span>}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: row.bold ? 15 : 13, fontWeight: row.bold ? 800 : 600, color: row.highlight || (row.value < 0 ? 'var(--red)' : 'var(--text)') }}>
                          ${fmt(row.value)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}

          {/* ── Statement Lines Tab ──────────────────────────────── */}
          {activeTab === 'statement' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-primary" onClick={() => setShowAddLineModal(true)}>
                  <span className="material-icons" style={{ fontSize: 16 }}>add</span> Add Line
                </button>
                <button className="btn btn-secondary" onClick={handleAutoMatch} disabled={loading || !stmtLines.length}>
                  <span className="material-icons" style={{ fontSize: 16 }}>auto_fix_high</span> Auto-Match
                </button>
              </div>

              {stmtLines.length === 0 ? (
                <EmptyState icon="list_alt" title="No statement lines" description="Add lines manually or use the auto-match feature after loading data." />
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          {['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Status', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', textAlign: ['Debit', 'Credit', 'Balance'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stmtLines.map(line => (
                          <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{line.transaction_date}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)', maxWidth: 220 }}>{line.description}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{line.reference || '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: line.debit > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{line.debit > 0 ? fmt(line.debit) : '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: line.credit > 0 ? 'var(--green)' : 'var(--text-dim)' }}>{line.credit > 0 ? fmt(line.credit) : '—'}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{line.running_balance != null ? fmt(line.running_balance) : '—'}</td>
                            <td style={{ padding: '8px 12px' }}><MatchBadge status={line.match_status} /></td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              {line.match_status === 'unmatched' && (
                                <>
                                  {matchTarget === line.id ? (
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <select className="form-control" style={{ fontSize: 11, padding: '2px 6px', width: 160 }}
                                        value={matchPvId} onChange={e => setMatchPvId(e.target.value)}>
                                        <option value="">Select PV…</option>
                                        {pvRows.filter(pv => !stmtLines.find(l => l.matched_voucher_id === pv.id)).sort((a, b) => {
                                          const lineAmt = line.debit || line.credit
                                          const aAmt = a.wht_applicable ? (a.net_payment || a.total_amount) : a.total_amount
                                          const bAmt = b.wht_applicable ? (b.net_payment || b.total_amount) : b.total_amount
                                          return Math.abs(aAmt - lineAmt) - Math.abs(bAmt - lineAmt)
                                        }).map(pv => (
                                          <option key={pv.id} value={pv.id}>
                                            {pv.pv_number} — {pv.supplier_name} — ${fmt(pv.wht_applicable ? (pv.net_payment || pv.total_amount) : pv.total_amount)}
                                          </option>
                                        ))}
                                      </select>
                                      <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleMatchLine(line.id, matchPvId)}>OK</button>
                                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setMatchTarget(null)}>×</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => { setMatchTarget(line.id); setMatchPvId('') }}>Match</button>
                                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--text-dim)' }} onClick={() => handleExcludeLine(line.id)}>Exclude</button>
                                    </div>
                                  )}
                                </>
                              )}
                              {(line.match_status === 'matched' || line.match_status === 'excluded') && (
                                <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--text-dim)' }} onClick={() => handleUnmatchLine(line.id)}>Undo</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Unmatched Payments Tab ───────────────────────────── */}
          {activeTab === 'unmatched' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
                Payment vouchers in this period with no matched bank statement line
              </div>
              {unmatchedPvs.length === 0 ? (
                <EmptyState icon="check_circle" title="All payments are matched" description="No outstanding payment vouchers in this period." />
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface2)' }}>
                          {['PV Number', 'Supplier', 'Payment Date', 'Amount', 'Method'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', textAlign: h === 'Amount' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unmatchedPvs.map(pv => (
                          <tr key={pv.id} style={{ borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{pv.pv_number}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{pv.supplier_name}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{pv.payment_date}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                              ${fmt(pv.wht_applicable ? (pv.net_payment || pv.total_amount) : pv.total_amount)}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>{pv.payment_method || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border2)' }}>
                          <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 800, fontSize: 12 }}>TOTAL UNMATCHED</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--red)' }}>
                            ${fmt(unmatchedPvs.reduce((s, pv) => s + (pv.wht_applicable ? (pv.net_payment || pv.total_amount) : pv.total_amount), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Add Bank Account Modal ─────────────────────────────────────── */}
      {showAddBankModal && (
        <Modal title="Add Bank Account" onClose={() => setShowAddBankModal(false)}>
          <FormField label="Account Name" required>
            <input className="form-control" value={bankForm.account_name} onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))} placeholder="e.g. FBC USD Operating Account" />
          </FormField>
          <FormField label="Bank Name" required>
            <input className="form-control" value={bankForm.bank_name} onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. FBC Bank" />
          </FormField>
          <FormField label="Account Number (last 4 digits)">
            <input className="form-control" value={bankForm.account_number} onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))} placeholder="e.g. ****1234" maxLength={20} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Currency">
              <select className="form-control" value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value }))}>
                {['USD', 'ZWG', 'EUR', 'GBP', 'ZAR'].map(c => <option key={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Opening Balance">
              <input className="form-control" type="number" step="0.01" value={bankForm.opening_balance} onChange={e => setBankForm(f => ({ ...f, opening_balance: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Linked GL Account (Asset)">
            <select className="form-control" value={bankForm.gl_account_id} onChange={e => setBankForm(f => ({ ...f, gl_account_id: e.target.value }))}>
              <option value="">— None —</option>
              {glAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
          </FormField>
          <FormField label="Notes">
            <textarea className="form-control" rows={2} value={bankForm.notes} onChange={e => setBankForm(f => ({ ...f, notes: e.target.value }))} />
          </FormField>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowAddBankModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddBank}>Create Bank Account</button>
          </div>
        </Modal>
      )}

      {/* ── Add Statement Line Modal ───────────────────────────────────── */}
      {showAddLineModal && (
        <Modal title="Add Statement Line" onClose={() => setShowAddLineModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Transaction Date" required>
              <input className="form-control" type="date" value={lineForm.transaction_date} onChange={e => setLineForm(f => ({ ...f, transaction_date: e.target.value }))} />
            </FormField>
            <FormField label="Value Date">
              <input className="form-control" type="date" value={lineForm.value_date} onChange={e => setLineForm(f => ({ ...f, value_date: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Description" required>
            <input className="form-control" value={lineForm.description} onChange={e => setLineForm(f => ({ ...f, description: e.target.value }))} placeholder="From bank statement…" />
          </FormField>
          <FormField label="Reference">
            <input className="form-control" value={lineForm.reference} onChange={e => setLineForm(f => ({ ...f, reference: e.target.value }))} placeholder="Bank reference number" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Debit (money out)">
              <input className="form-control" type="number" step="0.01" min="0" value={lineForm.debit} onChange={e => setLineForm(f => ({ ...f, debit: e.target.value }))} />
            </FormField>
            <FormField label="Credit (money in)">
              <input className="form-control" type="number" step="0.01" min="0" value={lineForm.credit} onChange={e => setLineForm(f => ({ ...f, credit: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Running Balance">
            <input className="form-control" type="number" step="0.01" value={lineForm.running_balance} onChange={e => setLineForm(f => ({ ...f, running_balance: e.target.value }))} placeholder="Statement balance after this line" />
          </FormField>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowAddLineModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddLine}>Add Line</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
