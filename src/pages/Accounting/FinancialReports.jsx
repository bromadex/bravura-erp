// src/pages/Accounting/FinancialReports.jsx — Balance Sheet + P&L
import { useState } from 'react'
import { useAccounting } from '../../contexts/AccountingContext'
import * as XLSX from 'xlsx'
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
  const { getBalanceSheet, getProfitLoss, loading } = useAccounting()
  const [view, setView] = useState('pl') // 'pl' | 'bs'

  const bs = getBalanceSheet()
  const pl = getProfitLoss()

  const exportReport = () => {
    const data = view === 'pl'
      ? [
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
      : [
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
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, view === 'pl' ? 'P&L' : 'Balance Sheet')
    XLSX.writeFile(wb, `${view === 'pl' ? 'PnL' : 'BalanceSheet'}_${new Date().toISOString().split('T')[0]}.xlsx`)
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
        {[{ id: 'pl', label: 'Profit & Loss', icon: 'trending_up' }, { id: 'bs', label: 'Balance Sheet', icon: 'account_balance' }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: `2px solid ${view === v.id ? 'var(--gold)' : 'transparent'}`, color: view === v.id ? 'var(--gold)' : 'var(--text-dim)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-icons" style={{ fontSize: 16 }}>{v.icon}</span>{v.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 720 }}>
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
        ) : (
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
        )}
      </div>
    </div>
  )
}
