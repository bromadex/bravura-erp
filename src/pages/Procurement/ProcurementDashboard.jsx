// src/pages/Procurement/ProcurementDashboard.jsx
//
// Executive-level procurement landing page.
// KPIs → Pending Actions → Spend by Dept / Funnel → Recent Activity

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { PageHeader, StatusBadge } from '../../components/ui'
import { StatBar } from '../../components/ui/StatBar'
import { ChartCard } from '../../components/ui/ChartCard'
import { fmtNum, fmtDate } from '../../engine/reportingEngine'

const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString().split('T')[0]
const todayStr = new Date().toISOString().split('T')[0]
const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

const OPEN_PO_STATUSES  = ['Pending', 'Approved', 'Partial', 'partially_received', 'draft', 'ordered']
const PENDING_PR_STATUSES = ['submitted', 'draft']

export default function ProcurementDashboard() {
  const navigate = useNavigate()
  const {
    suppliers,
    purchaseOrders,
    goodsReceived,
    purchaseInvoices,
    rfqs,
    rfqQuotations,
    storeRequisitions,
    purchaseRequisitions,
    loading,
  } = useProcurement()

  // ── Row 1: KPI computations ───────────────────────────────
  const kpis = useMemo(() => {
    const openRFQs    = rfqs.filter(r => (r.status || '').toLowerCase() === 'open').length
    const pendingPRs  = purchaseRequisitions.filter(pr => PENDING_PR_STATUSES.includes((pr.status || '').toLowerCase())).length
    const openPOs     = purchaseOrders.filter(po => OPEN_PO_STATUSES.map(s => s.toLowerCase()).includes((po.status || '').toLowerCase())).length
    const openPOValue = purchaseOrders
      .filter(po => OPEN_PO_STATUSES.map(s => s.toLowerCase()).includes((po.status || '').toLowerCase()))
      .reduce((s, po) => s + (parseFloat(po.total_amount) || 0), 0)

    const invoicesDue = purchaseInvoices.filter(inv => {
      const status = (inv.status || '').toLowerCase()
      if (status === 'paid' || status === 'cancelled') return false
      return inv.due_date && inv.due_date <= sevenDaysOut
    }).length

    const grnsThisMonth = goodsReceived.filter(g => (g.date || g.created_at || '').slice(0, 10) >= startOfMonth).length

    return { openRFQs, pendingPRs, openPOs, openPOValue, invoicesDue, grnsThisMonth }
  }, [rfqs, purchaseRequisitions, purchaseOrders, purchaseInvoices, goodsReceived])

  // ── Row 2: Pending actions ────────────────────────────────
  const actions = useMemo(() => {
    const result = []

    const submittedPRs = purchaseRequisitions.filter(pr => (pr.status || '').toLowerCase() === 'submitted')
    if (submittedPRs.length > 0) {
      result.push({
        icon:    'assignment_turned_in',
        color:   'var(--yellow)',
        message: `${submittedPRs.length} Purchase Requisition${submittedPRs.length > 1 ? 's' : ''} awaiting approval`,
        count:   submittedPRs.length,
        label:   'Approve',
        path:    '/module/procurement/purchase-requisitions',
      })
    }

    const pendingPOs = purchaseOrders.filter(po => (po.status || '').toLowerCase() === 'pending')
    if (pendingPOs.length > 0) {
      result.push({
        icon:    'shopping_bag',
        color:   'var(--gold)',
        message: `${pendingPOs.length} Purchase Order${pendingPOs.length > 1 ? 's' : ''} need finance approval`,
        count:   pendingPOs.length,
        label:   'Review',
        path:    '/module/procurement/purchase-orders',
      })
    }

    const overduePIs = purchaseInvoices.filter(inv => {
      const status = (inv.status || '').toLowerCase()
      if (status === 'paid' || status === 'cancelled') return false
      return inv.due_date && inv.due_date < todayStr
    })
    if (overduePIs.length > 0) {
      const overdueTotal = overduePIs.reduce((s, inv) => s + (parseFloat(inv.total_amount) || 0), 0)
      result.push({
        icon:    'receipt_long',
        color:   'var(--red)',
        message: `${overduePIs.length} invoice${overduePIs.length > 1 ? 's' : ''} overdue — $${fmtNum(overdueTotal)} total`,
        count:   overduePIs.length,
        label:   'View',
        path:    '/module/procurement/invoices',
      })
    }

    const pastDeadlineRFQs = rfqs.filter(r => {
      const status = (r.status || '').toLowerCase()
      if (status !== 'open') return false
      return r.submission_deadline && r.submission_deadline < todayStr
    })
    if (pastDeadlineRFQs.length > 0) {
      result.push({
        icon:    'hourglass_disabled',
        color:   'var(--teal)',
        message: `${pastDeadlineRFQs.length} RFQ${pastDeadlineRFQs.length > 1 ? 's' : ''} past submission deadline`,
        count:   pastDeadlineRFQs.length,
        label:   'Close',
        path:    '/module/procurement/rfq',
      })
    }

    return result
  }, [purchaseRequisitions, purchaseOrders, purchaseInvoices, rfqs])

  // ── Row 3: Spend by department ────────────────────────────
  const spendByDept = useMemo(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const deptMap = {}
    for (const po of purchaseOrders) {
      const poDate = po.order_date || po.created_at?.slice(0, 10) || ''
      if (poDate < thirtyDaysAgo) continue
      const dept = po.department || 'Unassigned'
      deptMap[dept] = (deptMap[dept] || 0) + (parseFloat(po.total_amount) || 0)
    }
    return Object.entries(deptMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        label,
        value,
        color: ['var(--gold)', 'var(--teal)', 'var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--purple)'][i % 6],
      }))
  }, [purchaseOrders])

  // ── Row 3: Procurement funnel ─────────────────────────────
  const funnel = useMemo(() => {
    const srOpen    = storeRequisitions.filter(r => ['submitted', 'draft', 'open'].includes((r.status || '').toLowerCase())).length
    const prPending = purchaseRequisitions.filter(r => ['submitted', 'draft'].includes((r.status || '').toLowerCase())).length
    const rfqActive = rfqs.filter(r => (r.status || '').toLowerCase() === 'open').length
    const poOpen    = purchaseOrders.filter(po => OPEN_PO_STATUSES.map(s => s.toLowerCase()).includes((po.status || '').toLowerCase())).length
    const grnPending = purchaseOrders.filter(po => {
      const s = (po.status || '').toLowerCase()
      return s === 'approved' || s === 'ordered' || s === 'partial' || s === 'partially_received'
    }).length
    const invUnpaid = purchaseInvoices.filter(inv => {
      const s = (inv.status || '').toLowerCase()
      return s !== 'paid' && s !== 'cancelled'
    }).length

    const maxVal = Math.max(srOpen, prPending, rfqActive, poOpen, grnPending, invUnpaid, 1)

    return [
      { label: 'Store Requisitions',    value: srOpen,    color: 'var(--gold)'   },
      { label: 'Purchase Requisitions', value: prPending, color: 'var(--yellow)' },
      { label: 'Open RFQs',             value: rfqActive, color: 'var(--teal)'   },
      { label: 'Purchase Orders',       value: poOpen,    color: 'var(--blue)'   },
      { label: 'Pending GRNs',          value: grnPending,color: 'var(--green)'  },
      { label: 'Pending Invoices',      value: invUnpaid, color: 'var(--red)'    },
    ].map(row => ({ ...row, max: maxVal }))
  }, [storeRequisitions, purchaseRequisitions, rfqs, purchaseOrders, goodsReceived, purchaseInvoices])

  // ── Row 4: Recent activity ────────────────────────────────
  const recentActivity = useMemo(() => {
    const poRows = [...purchaseOrders]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 10)
      .map(po => ({
        type:      'Purchase Order',
        ref:       po.po_number,
        entity:    po.supplier_name || '—',
        amount:    parseFloat(po.total_amount) || 0,
        status:    po.status,
        date:      po.created_at || po.order_date,
        _sort:     po.created_at || po.order_date || '',
      }))

    const piRows = [...purchaseInvoices]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 5)
      .map(pi => ({
        type:      'Invoice',
        ref:       pi.pi_number,
        entity:    pi.supplier_name || '—',
        amount:    parseFloat(pi.total_amount) || 0,
        status:    pi.status,
        date:      pi.created_at || pi.invoice_date,
        _sort:     pi.created_at || pi.invoice_date || '',
      }))

    return [...poRows, ...piRows]
      .sort((a, b) => b._sort.localeCompare(a._sort))
      .slice(0, 10)
  }, [purchaseOrders, purchaseInvoices])

  // ── Render ────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Procurement Dashboard"
        subtitle="Executive overview — KPIs, pending actions, pipeline"
      />

      {/* ── Row 1: KPI Cards ── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Open RFQs</div>
          <div className="kpi-val" style={{ color: kpis.openRFQs > 0 ? 'var(--teal)' : 'var(--text-dim)' }}>
            {kpis.openRFQs}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Awaiting quotes</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: kpis.pendingPRs > 0 ? '3px solid var(--yellow)' : undefined }}>
          <div className="kpi-label">Pending PRs</div>
          <div className="kpi-val" style={{ color: kpis.pendingPRs > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
            {kpis.pendingPRs}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Submitted or draft</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Open POs</div>
          <div className="kpi-val" style={{ color: 'var(--gold)' }}>{kpis.openPOs}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>In progress</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Open PO Value</div>
          <div className="kpi-val" style={{ color: 'var(--teal)', fontSize: 18 }}>
            ${fmtNum(kpis.openPOValue)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Committed spend</div>
        </div>

        <div className="kpi-card" style={{ borderLeft: kpis.invoicesDue > 0 ? '3px solid var(--red)' : undefined }}>
          <div className="kpi-label">Invoices Due</div>
          <div className="kpi-val" style={{ color: kpis.invoicesDue > 0 ? 'var(--red)' : 'var(--text-dim)' }}>
            {kpis.invoicesDue}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Within 7 days</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">GRNs This Month</div>
          <div className="kpi-val" style={{ color: 'var(--green)' }}>{kpis.grnsThisMonth}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Received deliveries</div>
        </div>
      </div>

      {/* ── Row 2: Pending Actions ── */}
      {actions.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
            <span className="material-icons" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6, color: 'var(--yellow)' }}>notifications_active</span>
            Attention Required
          </div>
          <div style={{ padding: '8px 0' }}>
            {actions.map((action, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: i < actions.length - 1 ? '1px solid var(--border)' : undefined,
                }}
              >
                <span className="material-icons" style={{ color: action.color, fontSize: 20, flexShrink: 0 }}>
                  {action.icon}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{action.message}</span>
                <span
                  className="badge"
                  style={{ background: action.color, color: '#fff', fontFamily: 'var(--mono)', fontSize: 12 }}
                >
                  {action.count}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(action.path)}
                >
                  {action.label} <span className="material-icons" style={{ fontSize: 13 }}>arrow_forward</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 3: Charts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Left: Spend by Department */}
        {spendByDept.length > 0 ? (
          <ChartCard
            title="Spend by Department"
            subtitle="Last 30 days — purchase orders"
            data={spendByDept}
            unit=""
            height={140}
          />
        ) : (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Spend by Department</div>
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
              No POs in the last 30 days
            </div>
          </div>
        )}

        {/* Right: Procurement Funnel */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Procurement Funnel</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>Current pipeline counts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {funnel.map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 160, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {row.label}
                </div>
                <div style={{ flex: 1 }}>
                  <StatBar
                    value={row.value}
                    max={row.max}
                    color={row.color}
                    height={8}
                  />
                </div>
                <div style={{ width: 28, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: row.color, textAlign: 'right', flexShrink: 0 }}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Recent Activity ── */}
      <div className="card">
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
          Recent Activity
        </div>
        {recentActivity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>No recent activity</div>
        ) : (
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Entity</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge badge-dim" style={{ fontSize: 11 }}>{row.type}</span>
                    </td>
                    <td className="td-mono" style={{ color: 'var(--gold)' }}>{row.ref || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{row.entity}</td>
                    <td className="td-mono" style={{ color: 'var(--teal)' }}>
                      {row.amount > 0 ? `$${fmtNum(row.amount)}` : '—'}
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-dim)', fontSize: 12 }}>
                      {fmtDate(row.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
