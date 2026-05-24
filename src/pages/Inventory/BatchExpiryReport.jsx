// src/pages/Inventory/BatchExpiryReport.jsx
// Track batch expiry dates with alert tiers, urgency banners, and mark-expired action.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import { PageHeader, KPICard, EmptyState, AlertBanner } from '../../components/ui'

const TODAY = new Date()
const TODAY_STR = TODAY.toISOString().split('T')[0]

// ── Tier helpers ──────────────────────────────────────────────────────────
function computeTier(expiryDate) {
  if (!expiryDate) return 'No Expiry'
  const daysLeft = Math.floor((new Date(expiryDate) - TODAY) / 86400000)
  if (daysLeft < 0)   return 'Expired'
  if (daysLeft <= 30) return 'Critical'
  if (daysLeft <= 60) return 'Warning'
  if (daysLeft <= 90) return 'Caution'
  return 'Healthy'
}

function daysLeft(expiryDate) {
  if (!expiryDate) return null
  return Math.floor((new Date(expiryDate) - TODAY) / 86400000)
}

const TIER_STYLE = {
  'Expired':   { bg: 'var(--red)',    color: 'var(--surface)', daysColor: 'var(--red)'    },
  'Critical':  { bg: 'var(--red)',    color: 'var(--surface)', daysColor: 'var(--red)'    },
  'Warning':   { bg: 'var(--yellow)', color: 'var(--surface)', daysColor: 'var(--yellow)' },
  'Caution':   { bg: 'var(--gold)',   color: 'var(--surface)', daysColor: 'var(--gold)'   },
  'Healthy':   { bg: 'var(--green)',  color: 'var(--surface)', daysColor: 'var(--green)'  },
  'No Expiry': { bg: 'var(--border)', color: 'var(--text)',    daysColor: 'var(--text-dim)' },
}

function TierBadge({ tier }) {
  const s = TIER_STYLE[tier] || TIER_STYLE['No Expiry']
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: s.bg,
      color: s.color,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {tier}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function BatchExpiryReport() {
  const [batches,     setBatches]     = useState([])
  const [warehouses,  setWarehouses]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [markingId,   setMarkingId]   = useState(null) // batch id being marked
  const [showAll,     setShowAll]     = useState(false) // toggle active-only vs all

  // Filters
  const [tierFilter,  setTierFilter]  = useState('ALL')
  const [whFilter,    setWhFilter]    = useState('ALL')
  const [search,      setSearch]      = useState('')

  // ── Load ────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const [
        { data: bData, error: bErr },
        { data: wData, error: wErr },
      ] = await Promise.all([
        supabase.from('item_batches').select('*').order('expiry_date', { ascending: true }),
        supabase.from('warehouses').select('id, name'),
      ])
      if (bErr) throw bErr
      if (wErr) throw wErr
      setBatches(bData || [])
      setWarehouses(wData || [])
    } catch (err) {
      toast.error('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Computed batches with tier ───────────────────────────────────────────
  const warehouseMap = useMemo(() => {
    const m = {}
    warehouses.forEach(w => { m[w.id] = w.name })
    return m
  }, [warehouses])

  const batchesWithTier = useMemo(() =>
    batches.map(b => ({
      ...b,
      tier:     computeTier(b.expiry_date),
      daysLeft: daysLeft(b.expiry_date),
      whName:   warehouseMap[b.warehouse_id] || b.warehouse_id || '—',
    })),
  [batches, warehouseMap])

  // ── KPIs — computed from all Active batches before status filter ─────────
  const activeBatches = useMemo(() => batchesWithTier.filter(b => b.status === 'Active'), [batchesWithTier])

  const expiredCount  = useMemo(() => activeBatches.filter(b => b.tier === 'Expired').length,  [activeBatches])
  const criticalCount = useMemo(() => activeBatches.filter(b => b.tier === 'Critical').length, [activeBatches])
  const warningCount  = useMemo(() => activeBatches.filter(b => b.tier === 'Warning').length,  [activeBatches])
  const totalActive   = useMemo(() => activeBatches.length, [activeBatches])

  // ── Alert banner condition ───────────────────────────────────────────────
  const alertCount = expiredCount + criticalCount

  // ── Filtered rows ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return batchesWithTier.filter(b => {
      if (!showAll && b.status !== 'Active') return false
      if (tierFilter !== 'ALL' && b.tier !== tierFilter)           return false
      if (whFilter   !== 'ALL' && b.warehouse_id !== whFilter)     return false
      if (q && !b.batch_no?.toLowerCase().includes(q)
            && !b.item_name?.toLowerCase().includes(q)
            && !b.supplier?.toLowerCase().includes(q)) return false
      return true
    })
  }, [batchesWithTier, showAll, tierFilter, whFilter, search])

  // ── Mark Expired ────────────────────────────────────────────────────────
  async function handleMarkExpired(batch) {
    if (!window.confirm(`Mark batch "${batch.batch_no}" as Expired?`)) return
    setMarkingId(batch.id)
    try {
      const { error } = await supabase
        .from('item_batches')
        .update({ status: 'Expired' })
        .eq('id', batch.id)
      if (error) throw error
      toast.success(`Batch ${batch.batch_no} marked Expired`)
      await load()
    } catch (err) {
      toast.error('Failed: ' + err.message)
    } finally {
      setMarkingId(null)
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    if (!filtered.length) { toast.error('Nothing to export'); return }
    exportXLSX(
      filtered.map(b => ({
        'Batch No':      b.batch_no,
        Item:            b.item_name,
        Supplier:        b.supplier || '—',
        Warehouse:       b.whName,
        'Qty Available': b.qty_available,
        'Mfg Date':      b.manufacturing_date || '—',
        'Expiry Date':   b.expiry_date || '—',
        'Days Left':     b.daysLeft ?? '—',
        Tier:            b.tier,
        Status:          b.status,
        'GRN No':        b.source_grn_number || '—',
      })),
      `BatchExpiryReport_${dateTag()}`,
      'Batch Expiry'
    )
    toast.success('Exported')
  }

  // ── Days left display ─────────────────────────────────────────────────────
  function renderDaysLeft(b) {
    if (b.daysLeft === null) return <span style={{ color: 'var(--text-dim)' }}>No expiry</span>
    const color = TIER_STYLE[b.tier]?.daysColor ?? 'var(--text)'
    const label = b.daysLeft < 0
      ? `${Math.abs(b.daysLeft)}d ago`
      : `${b.daysLeft}d left`
    return (
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color }}>
        {label}
      </span>
    )
  }

  return (
    <div>
      <PageHeader
        title="Batch Expiry Report"
        subtitle="Track batch expiry dates, alert tiers, and manage expired batches"
      >
        <button
          className={`btn btn-secondary btn-sm`}
          onClick={() => setShowAll(v => !v)}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>
            {showAll ? 'visibility_off' : 'visibility'}
          </span>
          {showAll ? ' Active Only' : ' Show All'}
        </button>
        <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
          <span className="material-icons">table_chart</span> Export XLSX
        </button>
      </PageHeader>

      {/* Alert banner */}
      {!loading && alertCount > 0 && (
        <div style={{ marginBottom: 16 }}>
          <AlertBanner
            type="danger"
            message={`${alertCount} batch${alertCount !== 1 ? 'es' : ''} expired or expiring within 30 days — review required`}
          />
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          icon="dangerous"
          label="Expired Batches"
          value={expiredCount}
          sub="past expiry date (Active)"
          color="red"
          alert={expiredCount > 0}
        />
        <KPICard
          icon="timer"
          label="Expiring ≤ 30 Days"
          value={criticalCount}
          sub="critical alert tier"
          color="red"
          alert={criticalCount > 0}
        />
        <KPICard
          icon="schedule"
          label="Expiring ≤ 60 Days"
          value={warningCount}
          sub="warning tier"
          color="yellow"
        />
        <KPICard
          icon="inventory_2"
          label="Total Active Batches"
          value={totalActive}
          sub="status = Active"
          color="teal"
        />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            placeholder="Search batch no, item, supplier…"
            style={{ maxWidth: 260 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 160 }}
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
          >
            <option value="ALL">All Tiers</option>
            <option value="Expired">Expired</option>
            <option value="Critical">Critical (≤30d)</option>
            <option value="Warning">Warning (31–60d)</option>
            <option value="Caution">Caution (61–90d)</option>
            <option value="Healthy">Healthy (&gt;90d)</option>
            <option value="No Expiry">No Expiry</option>
          </select>
          <select
            className="form-control"
            style={{ width: 170 }}
            value={whFilter}
            onChange={e => setWhFilter(e.target.value)}
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {(search || tierFilter !== 'ALL' || whFilter !== 'ALL') && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearch(''); setTierFilter('ALL'); setWhFilter('ALL') }}
            >
              <span className="material-icons">clear</span>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
          Showing {filtered.length} batch{filtered.length !== 1 ? 'es' : ''}
          {!showAll && ' · Active only — toggle to show all statuses'}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="stock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Batch No</th>
                <th>Item</th>
                <th>Supplier</th>
                <th>Warehouse</th>
                <th style={{ textAlign: 'right' }}>Qty Available</th>
                <th>Mfg Date</th>
                <th>Expiry Date</th>
                <th>Days Left</th>
                <th>Tier</th>
                <th>GRN</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>
                    <span className="material-icons" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }}>hourglass_empty</span>
                    Loading batches…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="12">
                    <EmptyState
                      icon="inventory"
                      message={search || tierFilter !== 'ALL' || whFilter !== 'ALL'
                        ? 'No batches match your filters'
                        : 'No batch data found'}
                    />
                  </td>
                </tr>
              ) : filtered.map((b, idx) => {
                const isExpiredTier  = b.tier === 'Expired'
                const canMarkExpired = b.status === 'Active' && isExpiredTier
                const rowBg = isExpiredTier ? 'rgba(239,68,68,0.04)' : ''
                return (
                  <tr
                    key={b.id}
                    style={{ background: rowBg }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = rowBg}
                  >
                    <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                        {b.batch_no}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{b.status}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{b.item_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{b.item_id}</div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-mid)' }}>{b.supplier || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.whName}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                      {fmtNum(b.qty_available)}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {b.manufacturing_date || '—'}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: isExpiredTier ? 'var(--red)' : 'var(--text)' }}>
                      {b.expiry_date || '—'}
                    </td>
                    <td>{renderDaysLeft(b)}</td>
                    <td><TierBadge tier={b.tier} /></td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {b.source_grn_number || '—'}
                    </td>
                    <td>
                      {canMarkExpired && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={markingId === b.id}
                          onClick={() => handleMarkExpired(b)}
                          title="Mark this batch as Expired"
                          style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                        >
                          {markingId === b.id
                            ? <span className="material-icons" style={{ fontSize: 14 }}>hourglass_empty</span>
                            : <span className="material-icons" style={{ fontSize: 14 }}>block</span>
                          }
                          {markingId === b.id ? ' Marking…' : ' Mark Expired'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--surface2)', fontWeight: 700 }}>
                  <td colSpan="5" style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 12px' }}>
                    Totals ({filtered.length} batches)
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', padding: '8px 12px' }}>
                    {fmtNum(filtered.reduce((s, b) => s + Number(b.qty_available || 0), 0))}
                  </td>
                  <td colSpan="6" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )

}
