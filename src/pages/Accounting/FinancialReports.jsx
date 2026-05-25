// src/pages/Accounting/FinancialReports.jsx — Balance Sheet + P&L + Trial Balance
import { useState, useMemo, useCallback } from 'react'
import { useAccounting } from '../../contexts/AccountingContext'
import { exportAoa } from '../../engine/reportingEngine'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

function AccountGroup({ title, accounts, total, color }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `2px solid ${color}`, cursor: 'pointer', marginBottom: 4 }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ fontWeight: 800, fontSize: 13, color }}>{title}</div>
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, color }}>{fmt(total)}</div>
      </div>
      {open && accounts.map(a => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 16px', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-mid)' }}>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', marginRight: 10 }}>{a.code}</span>
            {a.name}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: a.balance !== 0 ? 'var(--text)' : 'var(--text-dim)' }}>{fmt(a.balance)}</span>
        </div>
      ))}
    </div>
  )
}

export default function FinancialReports() {
  const { getBalanceSheet, getProfitLoss, accounts, loading } = useAccounting()
  const [view, setView] = useState('pl') // 'pl' | 'bs' | 'tb'

  const bs = getBalanceSheet()
  const pl = getProfitLoss()

  // ── Period filter state ──────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [periodData, setPeriodData] = useState(null)  // null = show all-time
  const [periodLoading, setPeriodLoading] = useState(false)

  const loadPeriodData = useCallback(async () => {
    setPeriodLoading(true)
    try {
      const { data: plLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(entry_date, status)')
        .gte('journal_entries.entry_date', fromDate)
        .lte('journal_entries.entry_date', toDate)
        .eq('journal_entries.status', 'posted')

      const { data: bsLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit, journal_entries!inner(entry_date, status)')
        .lte('journal_entries.entry_date', toDate)
        .eq('journal_entries.status', 'posted')

      const plMap = {}
      const bsMap = {}
      ;(plLines || []).forEach(l => {
        if (!plMap[l.account_id]) plMap[l.account_id] = 0
        plMap[l.account_id] += (l.debit || 0) - (l.credit || 0)
      })
      ;(bsLines || []).forEach(l => {
        if (!bsMap[l.account_id]) bsMap[l.account_id] = 0
        bsMap[l.account_id] += (l.debit || 0) - (l.credit || 0)
      })

      setPeriodData({ plMap, bsMap })
    } catch (e) {
      toast.error('Failed to load period data')
    } finally { setPeriodLoading(false) }
  }, [fromDate, toDate])

  // ── Period-aware P&L and BS ──────────────────────────────────────────────
  const activePL = useMemo(() => {
    if (!periodData) return pl
    const DEBIT_NORMAL = ['Asset', 'Expense']
    const withPeriodBalance = accounts.map(a => {
      const rawDelta = periodData.plMap[a.id] || 0
      const balance = DEBIT_NORMAL.includes(a.type) ? rawDelta : -rawDelta
      return { ...a, balance }
    })
    const revenue  = withPeriodBalance.filter(a => a.type === 'Revenue')
    const expenses = withPeriodBalance.filter(a => a.type === 'Expense')
    const totalRev = revenue.reduce((s, a) => s + (a.balance || 0), 0)
    const totalExp = expenses.reduce((s, a) => s + (a.balance || 0), 0)
    return { revenue, expenses, totalRevenue: totalRev, totalExpenses: totalExp, netProfit: totalRev - totalExp }
  }, [periodData, accounts, pl])

  const activeBS = useMemo(() => {
    if (!periodData) return bs
    const DEBIT_NORMAL = ['Asset', 'Expense']
    const withPeriodBalance = accounts.map(a => {
      const rawDelta = periodData.bsMap[a.id] || 0
      const balance = DEBIT_NORMAL.includes(a.type) ? rawDelta : -rawDelta
      return { ...a, balance }
    })
    const assets      = withPeriodBalance.filter(a => a.type === 'Asset')
    const liabilities = withPeriodBalance.filter(a => a.type === 'Liability')
    const equity      = withPeriodBalance.filter(a => a.type === 'Equity')
    return {
      assets, liabilities, equity,
      totalAssets:      assets.reduce((s, a) => s + (a.balance || 0), 0),
      totalLiabilities: liabilities.reduce((s, a) => s + (a.balance || 0), 0),
      totalEquity:      equity.reduce((s, a) => s + (a.balance || 0), 0),
    }
  }, [periodData, accounts, bs])

  // ── Trial Balance ────────────────────────────────────────────────────────
  const tb = useMemo(() => {
    const DEBIT_TYPES  = ['Asset', 'Expense']
    const CREDIT_TYPES = ['Liability', 'Equity', 'Revenue']

    const rows = accounts
      .filter(a => (a.balance || 0) !== 0)
      .map(a => {
        const balance  = a.balance || 0
        const isDebit  = DEBIT_TYPES.includes(a.type)
        const isCredit = CREDIT_TYPES.includes(a.type)
        return {
          id:     a.id,
          code:   a.code,
          name:   a.name,
          type:   a.type,
          debit:  isDebit && balance > 0 ? balance : (isCredit && balance < 0 ? Math.abs(balance) : 0),
          credit: isCredit && balance > 0 ? balance : (isDebit  && balance < 0 ? Math.abs(balance) : 0),
        }
      })
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''))

    const totalDebits  = rows.reduce((s, r) => s + r.debit,  0)
    const totalCredits = rows.reduce((s, r) => s + r.credit, 0)
    const balanced     = Math.abs(totalDebits - totalCredits) < 0.01

    return { rows, totalDebits, totalCredits, balanced, diff: Math.abs(totalDebits - totalCredits) }
  }, [accounts])

  const exportReport = () => {
    let data, filename, sheet
    if (view === 'pl') {
      data = [
        ['Profit & Loss Statement'],
        periodData ? [`Period: ${fromDate} to ${toDate}`] : ['All-time balances'],
        [],
        ['REVENUE'],
        ...activePL.revenue.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL REVENUE', activePL.totalRevenue],
        [],
        ['EXPENSES'],
        ...activePL.expenses.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL EXPENSES', activePL.totalExpenses],
        [],
        ['', 'NET PROFIT / (LOSS)', activePL.netProfit],
      ]
      filename = `PnL_${new Date().toISOString().split('T')[0]}`
      sheet    = 'P&L'
    } else if (view === 'bs') {
      data = [
        ['Balance Sheet'],
        periodData ? [`As at: ${toDate}`] : ['All-time balances'],
        [],
        ['ASSETS'],
        ...activeBS.assets.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL ASSETS', activeBS.totalAssets],
        [],
        ['LIABILITIES'],
        ...activeBS.liabilities.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL LIABILITIES', activeBS.totalLiabilities],
        [],
        ['EQUITY'],
        ...activeBS.equity.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL EQUITY', activeBS.totalEquity],
      ]
      filename = `BalanceSheet_${new Date().toISOString().split('T')[0]}`
      sheet    = 'Balance Sheet'
    } else {
      // Trial Balance
      data = [
        ['Trial Balance'],
        [],
        ['Code', 'Account Name', 'Type', 'Debit', 'Credit'],
        ...tb.rows.map(r => [r.code, r.name, r.type, r.debit || '', r.credit || '']),
        [],
        ['', 'TOTALS', '', tb.totalDebits, tb.totalCredits],
      ]
      filename = `TrialBalance_${new Date().toISOString().split('T')[0]}`
      sheet    = 'Trial Balance'
    }
    exportAoa(data, filename, sheet)
    toast.success('Exported')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Financial Reports</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {periodData
              ? `Period: ${fromDate} to ${toDate}`
              : 'Based on current account balances (all-time)'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportReport}>
            <span className="material-icons" style={{ fontSize: 16 }}>table_chart</span> Export
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { id: 'pl', label: 'Profit & Loss',  icon: 'trending_up'    },
          { id: 'bs', label: 'Balance Sheet',  icon: 'account_balance' },
          { id: 'tb', label: 'Trial Balance',  icon: 'balance'         },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${view === v.id ? 'var(--gold)' : 'transparent'}`, color: view === v.id ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      {/* Period filter bar — only for P&L and Balance Sheet */}
      {(view === 'pl' || view === 'bs') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
          <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>date_range</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>PERIOD</span>
          <input type="date" className="form-control" style={{ width: 140 }}
            value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
          <input type="date" className="form-control" style={{ width: 140 }}
            value={toDate} onChange={e => setToDate(e.target.value)} />
          <button className="btn btn-secondary" onClick={loadPeriodData} disabled={periodLoading}>
            {periodLoading ? 'Loading…' : 'Apply'}
          </button>
          {periodData && (
            <button className="btn btn-secondary" onClick={() => setPeriodData(null)}
              style={{ color: 'var(--text-dim)' }}>
              Clear (All-time)
            </button>
          )}
          {periodData && (
            <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>
              Period: {fromDate} → {toDate}
            </span>
          )}
        </div>
      )}

      <div style={{ maxWidth: view === 'tb' ? 900 : 720 }}>
        {view === 'pl' ? (
          <>
            {/* P&L summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Revenue',  value: activePL.totalRevenue,  color: 'var(--green)' },
                { label: 'Total Expenses', value: activePL.totalExpenses, color: 'var(--red)'   },
                { label: 'Net Profit',     value: activePL.netProfit,     color: activePL.netProfit >= 0 ? 'var(--teal)' : 'var(--red)' },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{fmt(k.value)}</div>
                </div>
              ))}
            </div>
            <AccountGroup title="Revenue" accounts={activePL.revenue} total={activePL.totalRevenue} color="var(--green)" />
            <AccountGroup title="Expenses" accounts={activePL.expenses} total={activePL.totalExpenses} color="var(--red)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border2)', marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>NET PROFIT / (LOSS)</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: activePL.netProfit >= 0 ? 'var(--teal)' : 'var(--red)' }}>{fmt(activePL.netProfit)}</div>
            </div>
          </>
        ) : view === 'bs' ? (
          <>
            {/* Balance Sheet summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Assets',      value: activeBS.totalAssets,      color: 'var(--green)' },
                { label: 'Total Liabilities', value: activeBS.totalLiabilities, color: 'var(--red)'   },
                { label: 'Total Equity',      value: activeBS.totalEquity,      color: 'var(--blue)'  },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{fmt(k.value)}</div>
                </div>
              ))}
            </div>
            <AccountGroup title="Assets" accounts={activeBS.assets} total={activeBS.totalAssets} color="var(--green)" />
            <AccountGroup title="Liabilities" accounts={activeBS.liabilities} total={activeBS.totalLiabilities} color="var(--red)" />
            <AccountGroup title="Equity" accounts={activeBS.equity} total={activeBS.totalEquity} color="var(--blue)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border2)', marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>LIABILITIES + EQUITY</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: Math.abs(activeBS.totalAssets - activeBS.totalLiabilities - activeBS.totalEquity) < 0.01 ? 'var(--green)' : 'var(--red)' }}>
                {fmt(activeBS.totalLiabilities + activeBS.totalEquity)}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Trial Balance */}
            {/* Balance check badge */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                display:       'inline-flex',
                alignItems:    'center',
                gap:           6,
                padding:       '6px 14px',
                borderRadius:  20,
                fontSize:      13,
                fontWeight:    700,
                background:    tb.balanced ? 'var(--green)' : 'var(--red)',
                color:         'var(--surface)',
              }}>
                {tb.balanced
                  ? '✓ Balanced'
                  : `⚠ Out of balance by $${fmt(tb.diff)}`}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {tb.rows.length} accounts with non-zero balances
              </span>
            </div>

            {/* Table */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      {['Code', 'Account Name', 'Type', 'Debit', 'Credit'].map(h => (
                        <th key={h} style={{
                          padding:       '10px 14px',
                          fontWeight:    700,
                          fontSize:      11,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color:         'var(--text-dim)',
                          borderBottom:  '1px solid var(--border)',
                          textAlign:     ['Debit', 'Credit'].includes(h) ? 'right' : 'left',
                          whiteSpace:    'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map(row => (
                      <tr key={row.id}
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
                          {row.code}
                        </td>
                        <td style={{ padding: '8px 14px', color: 'var(--text)' }}>
                          {row.name}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 12 }}>
                          <span style={{
                            padding:      '2px 8px',
                            borderRadius: 4,
                            fontSize:     11,
                            fontWeight:   600,
                            background:   row.type === 'Asset'     ? 'var(--green)'  :
                                          row.type === 'Liability' ? 'var(--red)'    :
                                          row.type === 'Equity'    ? 'var(--blue)'   :
                                          row.type === 'Revenue'   ? 'var(--teal)'   :
                                          row.type === 'Expense'   ? 'var(--yellow)' : 'var(--border)',
                            color: 'var(--surface)',
                            opacity: 0.9,
                          }}>
                            {row.type}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.debit > 0 ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                          {row.debit > 0 ? fmt(row.debit) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.credit > 0 ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                          {row.credit > 0 ? fmt(row.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border2)' }}>
                      <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
                        TOTALS
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {fmt(tb.totalDebits)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {fmt(tb.totalCredits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
