// src/pages/Accounting/FinancialReports.jsx — Balance Sheet + P&L + Trial Balance
import { useState, useMemo } from 'react'
import { useAccounting } from '../../contexts/AccountingContext'
import { exportAoa } from '../../engine/reportingEngine'
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
        [],
        ['REVENUE'],
        ...pl.revenue.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL REVENUE', pl.totalRevenue],
        [],
        ['EXPENSES'],
        ...pl.expenses.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL EXPENSES', pl.totalExpenses],
        [],
        ['', 'NET PROFIT / (LOSS)', pl.netProfit],
      ]
      filename = `PnL_${new Date().toISOString().split('T')[0]}`
      sheet    = 'P&L'
    } else if (view === 'bs') {
      data = [
        ['Balance Sheet'],
        [],
        ['ASSETS'],
        ...bs.assets.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL ASSETS', bs.totalAssets],
        [],
        ['LIABILITIES'],
        ...bs.liabilities.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL LIABILITIES', bs.totalLiabilities],
        [],
        ['EQUITY'],
        ...bs.equity.map(a => [a.code, a.name, a.balance]),
        ['', 'TOTAL EQUITY', bs.totalEquity],
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
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Based on current account balances</div>
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

      <div style={{ maxWidth: view === 'tb' ? 900 : 720 }}>
        {view === 'pl' ? (
          <>
            {/* P&L summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Revenue',  value: pl.totalRevenue,  color: 'var(--green)' },
                { label: 'Total Expenses', value: pl.totalExpenses, color: 'var(--red)'   },
                { label: 'Net Profit',     value: pl.netProfit,     color: pl.netProfit >= 0 ? 'var(--teal)' : 'var(--red)' },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{fmt(k.value)}</div>
                </div>
              ))}
            </div>
            <AccountGroup title="Revenue" accounts={pl.revenue} total={pl.totalRevenue} color="var(--green)" />
            <AccountGroup title="Expenses" accounts={pl.expenses} total={pl.totalExpenses} color="var(--red)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border2)', marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>NET PROFIT / (LOSS)</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: pl.netProfit >= 0 ? 'var(--teal)' : 'var(--red)' }}>{fmt(pl.netProfit)}</div>
            </div>
          </>
        ) : view === 'bs' ? (
          <>
            {/* Balance Sheet summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Assets',      value: bs.totalAssets,      color: 'var(--green)' },
                { label: 'Total Liabilities', value: bs.totalLiabilities, color: 'var(--red)'   },
                { label: 'Total Equity',      value: bs.totalEquity,      color: 'var(--blue)'  },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{fmt(k.value)}</div>
                </div>
              ))}
            </div>
            <AccountGroup title="Assets" accounts={bs.assets} total={bs.totalAssets} color="var(--green)" />
            <AccountGroup title="Liabilities" accounts={bs.liabilities} total={bs.totalLiabilities} color="var(--red)" />
            <AccountGroup title="Equity" accounts={bs.equity} total={bs.totalEquity} color="var(--blue)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border2)', marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>LIABILITIES + EQUITY</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 16, color: Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity) < 0.01 ? 'var(--green)' : 'var(--red)' }}>
                {fmt(bs.totalLiabilities + bs.totalEquity)}
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
