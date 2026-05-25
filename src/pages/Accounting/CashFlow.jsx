// src/pages/Accounting/CashFlow.jsx — Cash Flow Statement (Indirect Method)
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { EmptyState } from '../../components/ui'
import { exportAoa } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtCF = (n) => n >= 0 ? `$${fmt(n)}` : `($${fmt(Math.abs(n))})`

function classifyCFSection(acct) {
  const n = (acct.name || '').toLowerCase()
  if (n.includes('depreciat') || n.includes('amortis') || n.includes('amortiz')) return 'noncash'
  if (acct.type === 'Asset' && (n.includes('receivable') || n.includes('debtor') || n.includes('trade receiv'))) return 'receivables'
  if (acct.type === 'Asset' && (n.includes('inventor') || n.includes('stock'))) return 'inventory'
  if (acct.type === 'Asset' && (n.includes('prepaid') || n.includes('prepay'))) return 'prepayments'
  if (acct.type === 'Liability' && (n.includes('payable') || n.includes('creditor') || n.includes('trade pay'))) return 'payables'
  if (acct.type === 'Liability' && (n.includes('accrual') || n.includes('accrued'))) return 'accruals'
  if (acct.type === 'Asset' && (n.includes('cash') || n.includes('bank') || n.includes('petty'))) return 'cash'
  if (acct.type === 'Asset' && (n.includes('property') || n.includes('plant') || n.includes('equipment') || n.includes('vehicle') || n.includes('asset'))) return 'investing'
  if (acct.type === 'Liability' && (n.includes('loan') || n.includes('borrow') || n.includes('mortgage') || n.includes('finance'))) return 'financing'
  if (acct.type === 'Equity') return 'financing'
  return null
}

function CFRow({ label, value, indent = false, bold = false, separator = false }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: separator ? '10px 16px' : '6px 16px',
      borderTop: separator ? '2px solid var(--border2)' : '1px solid var(--border)',
      background: bold ? 'var(--surface2)' : 'transparent',
    }}>
      <span style={{
        fontSize: bold ? 13 : 12,
        fontWeight: bold ? 800 : 400,
        color: bold ? 'var(--text)' : 'var(--text-mid)',
        paddingLeft: indent ? 24 : 0,
      }}>{label}</span>
      <span style={{
        fontFamily: 'var(--mono)',
        fontSize: bold ? 14 : 12,
        fontWeight: bold ? 800 : 600,
        color: typeof value === 'number'
          ? (value >= 0 ? 'var(--text)' : 'var(--red)')
          : 'var(--text-dim)',
        whiteSpace: 'nowrap',
      }}>
        {typeof value === 'number' ? fmtCF(value) : (value || '—')}
      </span>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', letterSpacing: '0.03em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function CashFlow() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear(), 0, 1); return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [cfData, setCFData] = useState(null)
  const [loading, setLoading] = useState(false)

  const generateCF = useCallback(async () => {
    setLoading(true)
    try {
      const [linesRes, acctsRes] = await Promise.all([
        supabase
          .from('journal_lines')
          .select('account_id, debit, credit, description, journal_entries!inner(id, entry_date, description, status)')
          .gte('journal_entries.entry_date', fromDate)
          .lte('journal_entries.entry_date', toDate)
          .eq('journal_entries.status', 'posted'),
        supabase
          .from('accounts')
          .select('id, code, name, type, is_active')
          .eq('is_active', true)
          .order('code'),
      ])

      const lines = linesRes.data || []
      const accts = acctsRes.data || []

      if (lines.length === 0) {
        setCFData({ empty: true })
        return
      }

      // Build net balance per account for the period
      const acctBalanceMap = {}
      lines.forEach(l => {
        if (!acctBalanceMap[l.account_id]) acctBalanceMap[l.account_id] = { debit: 0, credit: 0 }
        acctBalanceMap[l.account_id].debit  += l.debit  || 0
        acctBalanceMap[l.account_id].credit += l.credit || 0
      })

      const DEBIT_NORMAL = ['Asset', 'Expense']

      // Net profit from Revenue - Expenses in period
      let netProfit = 0
      accts.forEach(a => {
        const b = acctBalanceMap[a.id] || { debit: 0, credit: 0 }
        const net = DEBIT_NORMAL.includes(a.type) ? b.debit - b.credit : b.credit - b.debit
        if (a.type === 'Revenue') netProfit += net
        if (a.type === 'Expense') netProfit -= net
      })

      // Classify and build sections
      const sections = { noncash: [], receivables: [], inventory: [], prepayments: [], payables: [], accruals: [], investing: [], financing: [] }
      accts.forEach(a => {
        const section = classifyCFSection(a)
        if (!section || section === 'cash') return
        const b = acctBalanceMap[a.id] || { debit: 0, credit: 0 }
        const netChange = DEBIT_NORMAL.includes(a.type) ? b.debit - b.credit : b.credit - b.debit
        if (netChange !== 0) sections[section].push({ ...a, netChange })
      })

      const addBackNonCash = sections.noncash.reduce((s, a) => s + a.netChange, 0)

      const wcItems = [
        ...sections.receivables.map(a => ({ name: a.name, value: -a.netChange, label: `(Increase)/Decrease in ${a.name}` })),
        ...sections.inventory.map(a => ({ name: a.name, value: -a.netChange, label: `(Increase)/Decrease in ${a.name}` })),
        ...sections.prepayments.map(a => ({ name: a.name, value: -a.netChange, label: `(Increase)/Decrease in ${a.name}` })),
        ...sections.payables.map(a => ({ name: a.name, value: a.netChange, label: `Increase/(Decrease) in ${a.name}` })),
        ...sections.accruals.map(a => ({ name: a.name, value: a.netChange, label: `Increase/(Decrease) in ${a.name}` })),
      ]
      const wcChange = wcItems.reduce((s, v) => s + v.value, 0)

      const operatingCF = netProfit + addBackNonCash + wcChange

      const investingItems = sections.investing.map(a => ({ name: a.name, value: -a.netChange }))
      const investingCF    = investingItems.reduce((s, a) => s + a.value, 0)

      const financingItems = sections.financing.map(a => ({
        name:  a.name,
        value: a.type === 'Equity' ? a.netChange : -a.netChange,
      }))
      const financingCF = financingItems.reduce((s, a) => s + a.value, 0)

      const netCashChange = operatingCF + investingCF + financingCF

      setCFData({
        empty: false,
        netProfit, addBackNonCash, wcChange, wcItems,
        noncashItems:  sections.noncash,
        operatingCF,
        investingItems, investingCF,
        financingItems, financingCF,
        netCashChange,
      })
    } catch (e) {
      console.error(e)
      toast.error('Failed to generate cash flow statement')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  const handleExport = () => {
    if (!cfData || cfData.empty) return
    const d = cfData
    const data = [
      ['CASH FLOW STATEMENT (INDIRECT METHOD)'],
      [`Period: ${fromDate} to ${toDate}`],
      [],
      ['A. OPERATING ACTIVITIES'],
      ['Net Profit / (Loss)', '', fmtCF(d.netProfit)],
      ['Adjustments for non-cash items:'],
      ...d.noncashItems.map(a => [`  ${a.name}`, '', fmtCF(a.netChange)]),
      ['Changes in working capital:'],
      ...d.wcItems.map(w => [`  ${w.label}`, '', fmtCF(w.value)]),
      ['NET CASH FROM OPERATING ACTIVITIES', '', fmtCF(d.operatingCF)],
      [],
      ['B. INVESTING ACTIVITIES'],
      ...d.investingItems.map(i => [`  ${i.name}`, '', fmtCF(i.value)]),
      ['NET CASH FROM INVESTING ACTIVITIES', '', fmtCF(d.investingCF)],
      [],
      ['C. FINANCING ACTIVITIES'],
      ...d.financingItems.map(f => [`  ${f.name}`, '', fmtCF(f.value)]),
      ['NET CASH FROM FINANCING ACTIVITIES', '', fmtCF(d.financingCF)],
      [],
      ['NET INCREASE/(DECREASE) IN CASH', '', fmtCF(d.netCashChange)],
    ]
    exportAoa(data, `CashFlow_${toDate}`, 'Cash Flow')
    toast.success('Exported')
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Cash Flow Statement</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Indirect method — based on journal entries</div>
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!cfData || cfData.empty}>
          <span className="material-icons" style={{ fontSize: 16 }}>table_chart</span> Export
        </button>
      </div>

      {/* Date filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
        <span className="material-icons" style={{ fontSize: 16, color: 'var(--text-dim)' }}>date_range</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>PERIOD</span>
        <input type="date" className="form-control" style={{ width: 140 }}
          value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>to</span>
        <input type="date" className="form-control" style={{ width: 140 }}
          value={toDate} onChange={e => setToDate(e.target.value)} />
        <button className="btn btn-primary" onClick={generateCF} disabled={loading}>
          <span className="material-icons" style={{ fontSize: 16 }}>play_arrow</span>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {!cfData ? (
        <EmptyState
          icon="waterfall_chart"
          title="No data generated yet"
          description="Select a period and click Generate to produce the cash flow statement."
        />
      ) : cfData.empty ? (
        <EmptyState
          icon="waterfall_chart"
          title="No journal entries found"
          description="There are no posted journal entries for this period."
        />
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Net Profit',      value: cfData.netProfit,    color: 'var(--gold)'   },
              { label: 'Operating CF',    value: cfData.operatingCF,  color: cfData.operatingCF  >= 0 ? 'var(--green)'  : 'var(--red)' },
              { label: 'Investing CF',    value: cfData.investingCF,  color: 'var(--blue)'   },
              { label: 'Financing CF',    value: cfData.financingCF,  color: 'var(--purple)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: 1, marginBottom: 6 }}>{k.label.toUpperCase()}</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: k.color }}>{fmtCF(k.value)}</div>
              </div>
            ))}
          </div>

          <div style={{ maxWidth: 760 }}>
            {/* A. Operating Activities */}
            <SectionCard title="A. Operating Activities">
              <CFRow label="Net Profit / (Loss)" value={cfData.netProfit} bold />
              {cfData.noncashItems.length > 0 && (
                <>
                  <CFRow label="Adjustments for non-cash items:" value="" />
                  {cfData.noncashItems.map(a => (
                    <CFRow key={a.id} label={a.name} value={a.netChange} indent />
                  ))}
                </>
              )}
              {cfData.wcItems.length > 0 && (
                <>
                  <CFRow label="Changes in working capital:" value="" />
                  {cfData.wcItems.map((w, i) => (
                    <CFRow key={i} label={w.label} value={w.value} indent />
                  ))}
                </>
              )}
              <CFRow label="NET CASH FROM OPERATING ACTIVITIES" value={cfData.operatingCF} bold separator />
            </SectionCard>

            {/* B. Investing Activities */}
            <SectionCard title="B. Investing Activities">
              {cfData.investingItems.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>No investing activity in this period</div>
              ) : (
                cfData.investingItems.map((item, i) => (
                  <CFRow key={i} label={item.name} value={item.value} indent />
                ))
              )}
              <CFRow label="NET CASH FROM INVESTING ACTIVITIES" value={cfData.investingCF} bold separator />
            </SectionCard>

            {/* C. Financing Activities */}
            <SectionCard title="C. Financing Activities">
              {cfData.financingItems.length === 0 ? (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-dim)' }}>No financing activity in this period</div>
              ) : (
                cfData.financingItems.map((item, i) => (
                  <CFRow key={i} label={item.name} value={item.value} indent />
                ))
              )}
              <CFRow label="NET CASH FROM FINANCING ACTIVITIES" value={cfData.financingCF} bold separator />
            </SectionCard>

            {/* Summary */}
            <div style={{ border: '2px solid var(--gold)', borderRadius: 8, padding: '16px 20px', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>NET INCREASE/(DECREASE) IN CASH</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: cfData.netCashChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmtCF(cfData.netCashChange)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
