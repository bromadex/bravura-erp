// src/pages/Projects/PettyCashFunds.jsx
// Petty Cash — Fund Management (Funds + Top-ups tabs)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePettyCash } from '../../contexts/PettyCashContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCanEdit, useCanDelete } from '../../hooks/usePermission'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader, StatusBadge, EmptyState, ModalDialog, ModalActions, TabNav,
} from '../../components/ui'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'

const TODAY = new Date().toISOString().split('T')[0]

const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'GBP']

const EMPTY_FUND = {
  custodian_name: '',
  custodian_id: '',
  project: '',
  department: '',
  opening_amount: '',
  currency: 'USD',
  notes: '',
}

const EMPTY_TOPUP = {
  fund_id: '',
  date: TODAY,
  amount: '',
  reference: '',
  notes: '',
}

function balanceColor(current, opening) {
  if (!opening || opening === 0) return 'var(--text-dim)'
  const pct = (current / opening) * 100
  if (pct > 50) return 'var(--green)'
  if (pct > 20) return 'var(--yellow)'
  return 'var(--red)'
}

export default function PettyCashFunds() {
  const {
    funds, topups, loading,
    addFund, updateFund, closeFund,
    addTopup,
    getFundBalance,
  } = usePettyCash()

  const { user } = useAuth()
  const canEdit   = useCanEdit('projects', 'petty-cash-funds')
  const canDelete = useCanDelete('projects', 'petty-cash-funds')

  const [tab, setTab] = useState('funds')

  // ── Fund modal ────────────────────────────────────────────────────────────
  const [fundModal, setFundModal] = useState(false)
  const [editingFund, setEditingFund] = useState(null)
  const [fundForm, setFundForm] = useState(EMPTY_FUND)
  const [savingFund, setSavingFund] = useState(false)

  // ── Close fund confirm ────────────────────────────────────────────────────
  const [closingFund, setClosingFund] = useState(null)
  const [closingSaving, setClosingSaving] = useState(false)

  // ── Top-up modal ──────────────────────────────────────────────────────────
  const [topupModal, setTopupModal] = useState(false)
  const [topupForm, setTopupForm] = useState(EMPTY_TOPUP)
  const [savingTopup, setSavingTopup] = useState(false)

  // ── Employee lookup ───────────────────────────────────────────────────────
  const [employees,   setEmployees]   = useState([])
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    Promise.all([
      supabase.from('employees').select('id, name, employee_number').eq('status', 'Active').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ]).then(([empRes, deptRes]) => {
      if (empRes.data)  setEmployees(empRes.data)
      if (deptRes.data) setDepartments(deptRes.data)
    })
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openAddFund = () => {
    setEditingFund(null)
    setFundForm(EMPTY_FUND)
    setFundModal(true)
  }

  const openEditFund = (fund) => {
    setEditingFund(fund)
    setFundForm({
      custodian_name: fund.custodian_name || '',
      custodian_id:   fund.custodian_id   || '',
      project:        fund.project        || '',
      department:     fund.department     || '',
      opening_amount: fund.opening_balance || '',
      currency:       fund.currency       || 'USD',
      notes:          fund.notes          || '',
    })
    setFundModal(true)
  }

  const openAddTopup = (fundId = '') => {
    setTopupForm({ ...EMPTY_TOPUP, fund_id: fundId })
    setTopupModal(true)
  }

  const setFF = useCallback((field, val) => setFundForm(f => ({ ...f, [field]: val })), [])
  const setTF = useCallback((field, val) => setTopupForm(f => ({ ...f, [field]: val })), [])

  // ── Fund save ─────────────────────────────────────────────────────────────
  const handleSaveFund = async (e) => {
    e.preventDefault()
    if (!fundForm.custodian_name.trim()) return toast.error('Custodian name is required')
    if (!fundForm.opening_amount || parseFloat(fundForm.opening_amount) <= 0)
      return toast.error('Opening amount must be greater than 0')

    setSavingFund(true)
    try {
      const payload = {
        custodian_name: fundForm.custodian_name.trim(),
        custodian_id:   fundForm.custodian_id   || null,
        project:        fundForm.project.trim()  || null,
        department:     fundForm.department.trim() || null,
        opening_amount: parseFloat(fundForm.opening_amount),
        currency:       fundForm.currency,
        notes:          fundForm.notes.trim()    || null,
        updated_by:     user?.full_name || user?.username || null,
      }
      if (editingFund) {
        await updateFund(editingFund.id, payload)
        toast.success('Fund updated')
      } else {
        await addFund({ ...payload, status: 'active' })
        toast.success('Fund created')
      }
      setFundModal(false)
    } catch (err) { toast.error(err.message) }
    finally { setSavingFund(false) }
  }

  // ── Close fund ────────────────────────────────────────────────────────────
  const handleCloseFund = async () => {
    if (!closingFund) return
    setClosingSaving(true)
    try {
      await closeFund(closingFund.id)
      toast.success(`Fund ${closingFund.pcf_code || ''} closed`)
      setClosingFund(null)
    } catch (err) { toast.error(err.message) }
    finally { setClosingSaving(false) }
  }

  // ── Top-up save ───────────────────────────────────────────────────────────
  const handleSaveTopup = async (e) => {
    e.preventDefault()
    if (!topupForm.fund_id) return toast.error('Select a fund')
    if (!topupForm.amount || parseFloat(topupForm.amount) <= 0) return toast.error('Amount must be > 0')

    setSavingTopup(true)
    try {
      await addTopup({
        fund_id:   topupForm.fund_id,
        date:      topupForm.date,
        amount:    parseFloat(topupForm.amount),
        reference: topupForm.reference.trim() || null,
        notes:     topupForm.notes.trim()     || null,
        posted_by: user?.full_name || user?.username || null,
      })
      toast.success('Top-up recorded')
      setTopupModal(false)
      setTopupForm(EMPTY_TOPUP)
    } catch (err) { toast.error(err.message) }
    finally { setSavingTopup(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeFunds = useMemo(() =>
    funds.filter(f => (f.status || '').toLowerCase() === 'active'),
    [funds]
  )

  const enrichedFunds = useMemo(() =>
    funds.map(f => {
      const current = getFundBalance ? getFundBalance(f.id) : (parseFloat(f.current_balance) || 0)
      const opening = parseFloat(f.opening_balance) || 0
      const pct     = opening > 0 ? Math.min(100, (current / opening) * 100) : 0
      const color   = balanceColor(current, opening)
      return { ...f, current, opening, pct, color }
    }),
    [funds, getFundBalance]
  )

  const enrichedTopups = useMemo(() =>
    [...topups]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(t => {
        const fund = funds.find(f => f.id === t.fund_id)
        return { ...t, fundLabel: fund?.pcf_code || '—', custodian: fund?.custodian_name || '—' }
      }),
    [topups, funds]
  )

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'funds',  label: 'Funds',   icon: 'account_balance_wallet', count: funds.length },
    { id: 'topups', label: 'Top-ups', icon: 'add_card',               count: topups.length },
  ]

  return (
    <div>
      <PageHeader
        title="Petty Cash Funds"
        subtitle="Manage fund allocations and top-ups"
      >
        {canEdit && (
          <>
            {tab === 'topups' && (
              <button className="btn btn-secondary" onClick={() => openAddTopup()}>
                <span className="material-icons" style={{ fontSize: 16 }}>add_card</span>
                Add Top-up
              </button>
            )}
            <button className="btn btn-primary" onClick={openAddFund}>
              <span className="material-icons" style={{ fontSize: 16 }}>add</span>
              New Fund
            </button>
          </>
        )}
      </PageHeader>

      <TabNav tabs={tabs} active={tab} onChange={setTab} />

      {/* ═══════════════════ FUNDS TAB ═══════════════════ */}
      {tab === 'funds' && (
        <>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading funds…</div>
          ) : enrichedFunds.length === 0 ? (
            <EmptyState
              icon="account_balance_wallet"
              message="No petty cash funds yet"
              action={canEdit && (
                <button className="btn btn-primary btn-sm" onClick={openAddFund}>Create First Fund</button>
              )}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
              {enrichedFunds.map(fund => (
                <div
                  key={fund.id}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', borderTop: `3px solid ${fund.color}` }}
                >
                  {/* Header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>
                        {fund.pcf_code || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                        {fund.project || fund.department || 'General'}
                      </div>
                    </div>
                    <StatusBadge status={fund.status} />
                  </div>

                  {/* Body */}
                  <div style={{ padding: '14px 16px' }}>
                    {/* Custodian */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
                      <span className="material-icons" style={{ fontSize: 14 }}>person</span>
                      {fund.custodian_name || '—'}
                    </div>

                    {/* Balances */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Opening</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13 }}>
                          {fund.currency || 'USD'} {fmtNum(fund.opening)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Current Balance</div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: fund.color }}>
                          {fund.currency || 'USD'} {fmtNum(fund.current)}
                        </div>
                      </div>
                    </div>

                    {/* Balance bar */}
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-2, var(--surface2))', overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ height: '100%', width: `${fund.pct}%`, background: fund.color, borderRadius: 4, transition: 'width .3s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginBottom: 14 }}>
                      <span>{fund.pct.toFixed(0)}% remaining</span>
                      <span>{fund.currency || 'USD'} {fmtNum(fund.current)} of {fmtNum(fund.opening)}</span>
                    </div>

                    {/* Notes */}
                    {fund.notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12, fontStyle: 'italic', borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
                        {fund.notes}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                      {canEdit && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditFund(fund)}
                          >
                            <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openAddTopup(fund.id)}
                          >
                            <span className="material-icons" style={{ fontSize: 13 }}>add_card</span>
                            Top-up
                          </button>
                        </>
                      )}
                      {canDelete && (fund.status || '').toLowerCase() === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setClosingFund(fund)}
                        >
                          <span className="material-icons" style={{ fontSize: 13 }}>lock</span>
                          Close
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ TOP-UPS TAB ═══════════════════ */}
      {tab === 'topups' && (
        <>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>
          ) : enrichedTopups.length === 0 ? (
            <EmptyState
              icon="add_card"
              message="No top-ups recorded yet"
              action={canEdit && (
                <button className="btn btn-primary btn-sm" onClick={() => openAddTopup()}>Add First Top-up</button>
              )}
            />
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Fund</th>
                      <th>Custodian</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Reference</th>
                      <th>Posted By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedTopups.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                          {fmtDate(t.date)}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)', fontSize: 12 }}>
                            {t.fundLabel}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{t.custodian}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
                          {fmtNum(t.amount)}
                        </td>
                        <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                          {t.reference || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t.posted_by || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 180 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.notes || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ ADD/EDIT FUND MODAL ═══════════════════ */}
      <ModalDialog
        open={fundModal}
        onClose={() => setFundModal(false)}
        title={editingFund ? `Edit Fund · ${editingFund.pcf_code || ''}` : 'New Petty Cash Fund'}
        size="lg"
      >
        <form onSubmit={handleSaveFund}>
          {/* Custodian */}
          <div className="form-section">
            <div className="form-section-title">Custodian</div>
            <div className="form-row">
              <div className="form-group">
                <label>CUSTODIAN NAME *</label>
                <input
                  className="form-control"
                  value={fundForm.custodian_name}
                  onChange={e => setFF('custodian_name', e.target.value)}
                  placeholder="Full name of custodian"
                  required
                />
              </div>
              <div className="form-group">
                <label>CUSTODIAN (EMPLOYEE)</label>
                <select
                  className="form-control"
                  value={fundForm.custodian_id}
                  onChange={e => {
                    const emp = employees.find(em => em.id === e.target.value)
                    setFF('custodian_id', e.target.value)
                    if (emp && !fundForm.custodian_name) setFF('custodian_name', emp.name)
                  }}
                >
                  <option value="">— Select Employee (optional) —</option>
                  {employees.map(em => (
                    <option key={em.id} value={em.id}>{em.name} {em.employee_number ? `(${em.employee_number})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Allocation details */}
          <div className="form-section">
            <div className="form-section-title">Allocation Details</div>
            <div className="form-row">
              <div className="form-group">
                <label>PROJECT</label>
                <input
                  className="form-control"
                  value={fundForm.project}
                  onChange={e => setFF('project', e.target.value)}
                  placeholder="e.g. Dam Construction Phase 2"
                />
              </div>
              <div className="form-group">
                <label>DEPARTMENT</label>
                <select
                  className="form-control"
                  value={fundForm.department}
                  onChange={e => setFF('department', e.target.value)}
                >
                  <option value="">— Select Department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 14 }}>
              <div className="form-group">
                <label>INITIAL ALLOCATION *</label>
                <input
                  className="form-control"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={fundForm.opening_amount}
                  onChange={e => setFF('opening_amount', e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="form-group">
                <label>CURRENCY</label>
                <select
                  className="form-control"
                  value={fundForm.currency}
                  onChange={e => setFF('currency', e.target.value)}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 4 }}>
            <label>NOTES</label>
            <textarea
              className="form-control"
              rows={3}
              value={fundForm.notes}
              onChange={e => setFF('notes', e.target.value)}
              placeholder="Any additional information…"
              style={{ resize: 'vertical' }}
            />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setFundModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingFund}>
              {savingFund ? 'Saving…' : editingFund ? 'Update Fund' : 'Create Fund'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ═══════════════════ CLOSE FUND CONFIRM ═══════════════════ */}
      <ModalDialog
        open={!!closingFund}
        onClose={() => setClosingFund(null)}
        title="Close Fund"
      >
        <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>
          Are you sure you want to close fund{' '}
          <strong style={{ color: 'var(--teal)' }}>{closingFund?.pcf_code}</strong>?
        </div>
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(248,113,113,.08)',
          border: '1px solid rgba(248,113,113,.25)',
          fontSize: 12, color: 'var(--red)', marginBottom: 8,
        }}>
          <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>warning</span>
          Closing a fund is irreversible. Any remaining balance will be recorded as returned.
        </div>
        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setClosingFund(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleCloseFund} disabled={closingSaving}>
            {closingSaving ? 'Closing…' : 'Close Fund'}
          </button>
        </ModalActions>
      </ModalDialog>

      {/* ═══════════════════ ADD TOP-UP MODAL ═══════════════════ */}
      <ModalDialog
        open={topupModal}
        onClose={() => setTopupModal(false)}
        title="Add Top-up"
      >
        <form onSubmit={handleSaveTopup}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>FUND *</label>
            <select
              className="form-control"
              value={topupForm.fund_id}
              onChange={e => setTF('fund_id', e.target.value)}
              required
            >
              <option value="">— Select Active Fund —</option>
              {activeFunds.map(f => (
                <option key={f.id} value={f.id}>
                  {f.pcf_code ? `${f.pcf_code} — ` : ''}{f.custodian_name} {f.project ? `(${f.project})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label>DATE *</label>
              <input
                className="form-control"
                type="date"
                value={topupForm.date}
                onChange={e => setTF('date', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>AMOUNT *</label>
              <input
                className="form-control"
                type="number"
                min="0.01"
                step="0.01"
                value={topupForm.amount}
                onChange={e => setTF('amount', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>REFERENCE (Cheque / Transfer No.)</label>
            <input
              className="form-control"
              value={topupForm.reference}
              onChange={e => setTF('reference', e.target.value)}
              placeholder="e.g. CHQ-001234 or EFT-REF"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 4 }}>
            <label>NOTES</label>
            <textarea
              className="form-control"
              rows={3}
              value={topupForm.notes}
              onChange={e => setTF('notes', e.target.value)}
              placeholder="Optional additional notes…"
              style={{ resize: 'vertical' }}
            />
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setTopupModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={savingTopup}>
              {savingTopup ? 'Saving…' : 'Record Top-up'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
