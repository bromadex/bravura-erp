// src/pages/Inventory/CycleCount.jsx
// Phase 20: Cycle Count — rolling, category/zone-based stock counting with SLE posting

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX, fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0]
const THIS_MONTH = TODAY.slice(0, 7)

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  'Draft':       { bg: 'var(--yellow)',   fg: 'var(--surface)' },
  'In Progress': { bg: 'var(--blue)',     fg: 'var(--surface)' },
  'Completed':   { bg: 'var(--teal)',     fg: 'var(--surface)' },
  'Posted':      { bg: 'var(--green)',    fg: 'var(--surface)' },
  'Cancelled':   { bg: 'var(--red)',      fg: 'var(--surface)' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] ?? { bg: 'var(--border)', fg: 'var(--text)' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.fg,
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ── Next session number helper ────────────────────────────────────────────────
async function nextSessionNo() {
  const { data } = await supabase
    .from('cycle_count_sessions')
    .select('session_no')
    .order('created_at', { ascending: false })
    .limit(1)
  if (!data?.length) return 'CC-0001'
  const last = data[0].session_no || 'CC-0000'
  const num = parseInt(last.replace('CC-', ''), 10)
  return `CC-${String((isNaN(num) ? 0 : num) + 1).padStart(4, '0')}`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CycleCount() {
  const { user } = useAuth()

  // ── state ──────────────────────────────────────────────────────────────────
  const [sessions,      setSessions]      = useState([])
  const [warehouses,    setWarehouses]    = useState([])
  const [items,         setItems]         = useState([])
  const [bins,          setBins]          = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [lines,         setLines]         = useState([])
  const [tab,           setTab]           = useState('sessions') // 'sessions' | 'count'
  const [loading,       setLoading]       = useState(false)
  const [posting,       setPosting]       = useState(false)
  const [showNewModal,  setShowNewModal]  = useState(false)

  // Count sheet filters
  const [countFilter,   setCountFilter]   = useState('ALL') // ALL | Counted | Uncounted | Variance

  // New session form
  const [form, setForm] = useState({
    warehouse_id: '',
    category: 'ALL',
    count_date: TODAY,
    counted_by: user?.full_name || user?.username || '',
    notes: '',
  })
  const [creating, setCreating] = useState(false)

  // ── Load reference data ────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: sesData },
        { data: whData },
        { data: itemData },
        { data: binData },
      ] = await Promise.all([
        supabase.from('cycle_count_sessions').select('*').order('created_at', { ascending: false }),
        supabase.from('warehouses').select('id, name').eq('is_active', true),
        supabase.from('items').select('id, name, item_code, category, unit, valuation_rate').eq('is_active', true).order('name'),
        supabase.from('bins').select('item_id, warehouse_id, actual_qty, valuation_rate'),
      ])
      setSessions(sesData || [])
      setWarehouses(whData || [])
      setItems(itemData || [])
      setBins(binData || [])
    } catch (err) {
      toast.error('Load failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Load lines for active session ──────────────────────────────────────────
  const loadLines = useCallback(async (session) => {
    if (!session) { setLines([]); return }
    const { data, error } = await supabase
      .from('cycle_count_lines')
      .select('*')
      .eq('session_id', session.id)
      .order('sort_order')
    if (error) { toast.error('Failed to load count lines: ' + error.message); return }
    setLines(data || [])
  }, [])

  useEffect(() => {
    if (activeSession) loadLines(activeSession)
    else setLines([])
  }, [activeSession, loadLines])

  // ── Derived category list ──────────────────────────────────────────────────
  const categoryOptions = useMemo(
    () => ['ALL', ...new Set(items.map(i => i.category).filter(Boolean)).values()],
    [items]
  )

  // ── KPI stats ──────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const thisMonth = sessions.filter(s => (s.created_at || '').startsWith(THIS_MONTH))
    const posted    = sessions.filter(s => s.status === 'Posted')
    const varItems  = sessions.reduce((n, s) => n + (s.items_variance || 0), 0)
    const varVal    = sessions.reduce((n, s) => n + Math.abs(Number(s.total_variance_value || 0)), 0)
    return { thisMonth: thisMonth.length, posted: posted.length, varItems, varVal }
  }, [sessions])

  // ── Create new session ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.warehouse_id) return toast.error('Warehouse is required')
    if (!form.count_date)   return toast.error('Count date is required')
    if (!form.counted_by.trim()) return toast.error('Counted By is required')
    setCreating(true)
    try {
      const sessionNo = await nextSessionNo()
      const wh = warehouses.find(w => w.id === form.warehouse_id)

      // Insert session
      const { data: sesRows, error: sesErr } = await supabase
        .from('cycle_count_sessions')
        .insert({
          id: crypto.randomUUID(),
          session_no: sessionNo,
          warehouse_id: form.warehouse_id,
          warehouse_name: wh?.name || form.warehouse_id,
          category: form.category === 'ALL' ? null : form.category,
          count_date: form.count_date,
          counted_by: form.counted_by.trim(),
          status: 'In Progress',
          notes: form.notes.trim() || null,
          created_by: user?.full_name || user?.username || null,
        })
        .select()
      if (sesErr) throw sesErr
      const newSession = sesRows[0]

      // Build lines from bins
      const whBins = bins.filter(b => b.warehouse_id === form.warehouse_id && (b.actual_qty || 0) > 0)
      const categoryItems = form.category && form.category !== 'ALL'
        ? items.filter(i => i.category === form.category)
        : items
      const itemIds = new Set(categoryItems.map(i => i.id))

      const linesToInsert = whBins
        .filter(b => itemIds.has(b.item_id))
        .map((b, idx) => {
          const item = items.find(i => i.id === b.item_id)
          return {
            id: crypto.randomUUID(),
            session_id: newSession.id,
            item_id: b.item_id,
            item_name: item?.name || b.item_id,
            item_code: item?.item_code || null,
            category: item?.category || null,
            unit: item?.unit || 'pcs',
            warehouse_id: form.warehouse_id,
            system_qty: b.actual_qty || 0,
            counted_qty: null,
            valuation_rate: b.valuation_rate || item?.valuation_rate || 0,
            sort_order: idx,
          }
        })

      if (linesToInsert.length === 0) {
        // No items found — cancel and clean up
        await supabase.from('cycle_count_sessions').delete().eq('id', newSession.id)
        toast.error('No stock found for that warehouse/category combination.')
        setCreating(false)
        return
      }

      const { error: lineErr } = await supabase.from('cycle_count_lines').insert(linesToInsert)
      if (lineErr) throw lineErr

      // Update total_items on session
      await supabase
        .from('cycle_count_sessions')
        .update({ total_items: linesToInsert.length })
        .eq('id', newSession.id)

      newSession.total_items = linesToInsert.length
      newSession.items_counted = 0

      toast.success(`Session ${sessionNo} created — ${linesToInsert.length} items to count`)
      setShowNewModal(false)
      setForm({ warehouse_id: '', category: 'ALL', count_date: TODAY, counted_by: user?.full_name || user?.username || '', notes: '' })

      await loadAll()
      setActiveSession({ ...newSession, total_items: linesToInsert.length, items_counted: 0 })
      setTab('count')
    } catch (err) {
      toast.error('Failed to create session: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Update a single counted_qty line ──────────────────────────────────────
  const handleLineChange = (lineId, value) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, _localQty: value } : l))
  }

  const handleLineBlur = async (line) => {
    const raw = line._localQty
    if (raw === undefined) return // no change
    const val = raw === '' ? null : parseFloat(raw)
    if (val !== null && isNaN(val)) return toast.error('Invalid number')

    // Compute derived fields locally (DB generated columns won't come back unless we re-select)
    const variance      = val !== null ? val - Number(line.system_qty) : null
    const varianceValue = variance !== null ? variance * Number(line.valuation_rate) : null

    const { error } = await supabase
      .from('cycle_count_lines')
      .update({ counted_qty: val })
      .eq('id', line.id)
    if (error) { toast.error('Save failed: ' + error.message); return }

    // Update local state with computed values (mirrors generated columns)
    setLines(prev => prev.map(l =>
      l.id === line.id
        ? { ...l, counted_qty: val, variance, variance_value: varianceValue, _localQty: undefined }
        : l
    ))

    // Keep session items_counted in sync
    if (activeSession) {
      const updatedLines = lines.map(l =>
        l.id === line.id ? { ...l, counted_qty: val } : l
      )
      const countedN = updatedLines.filter(l => (l.counted_qty !== null && l.counted_qty !== undefined)).length
      await supabase
        .from('cycle_count_sessions')
        .update({ items_counted: countedN })
        .eq('id', activeSession.id)
      setActiveSession(prev => ({ ...prev, items_counted: countedN }))
    }
  }

  // ── Quick fill / clear ──────────────────────────────────────────────────────
  const handleFillAll = async () => {
    const updates = lines.map(l => ({
      ...l,
      counted_qty: l.system_qty,
      variance: 0,
      variance_value: 0,
      _localQty: undefined,
    }))
    setLines(updates)
    // Batch update — run in parallel
    await Promise.all(
      updates.map(l => supabase.from('cycle_count_lines').update({ counted_qty: l.system_qty }).eq('id', l.id))
    )
    if (activeSession) {
      await supabase.from('cycle_count_sessions').update({ items_counted: lines.length }).eq('id', activeSession.id)
      setActiveSession(prev => ({ ...prev, items_counted: lines.length }))
    }
    toast.success('All counts set to system qty')
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear all counted quantities? Counts will need to be re-entered.')) return
    const updates = lines.map(l => ({ ...l, counted_qty: null, variance: null, variance_value: null, _localQty: undefined }))
    setLines(updates)
    await Promise.all(
      updates.map(l => supabase.from('cycle_count_lines').update({ counted_qty: null }).eq('id', l.id))
    )
    if (activeSession) {
      await supabase.from('cycle_count_sessions').update({ items_counted: 0 }).eq('id', activeSession.id)
      setActiveSession(prev => ({ ...prev, items_counted: 0 }))
    }
    toast('All counts cleared')
  }

  // ── Post adjustments ────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!activeSession) return
    const uncounted = lines.filter(l => l.counted_qty === null || l.counted_qty === undefined)
    if (uncounted.length > 0) {
      return toast.error(`${uncounted.length} item(s) not yet counted. Count everything before posting.`)
    }
    const varianceLines = lines.filter(l => {
      const v = Number(l.variance ?? (l.counted_qty - l.system_qty))
      return l.counted_qty !== null && v !== 0
    })
    if (!window.confirm(
      `Post ${varianceLines.length} adjustment(s) to the stock ledger?\n\nThis will create SLEs for all items with variance and cannot be undone.`
    )) return

    setPosting(true)
    try {
      const postingDt = new Date(activeSession.count_date + 'T12:00:00').toISOString()
      let totalVarValue = 0
      const sleIds = {}

      for (const line of varianceLines) {
        const variance = Number(line.variance ?? (Number(line.counted_qty) - Number(line.system_qty)))
        const vRate    = Number(line.valuation_rate) || 0
        const varVal   = variance * vRate
        totalVarValue += varVal

        const sleId = crypto.randomUUID()
        const { error: sleErr } = await supabase.from('stock_ledger_entries').insert({
          id: sleId,
          item_id: line.item_id,
          warehouse_id: line.warehouse_id,
          posting_datetime: postingDt,
          voucher_type: 'StockReconciliation',
          voucher_no: activeSession.session_no,
          actual_qty: variance,
          incoming_rate: variance > 0 ? vRate : 0,
          outgoing_rate: variance < 0 ? vRate : 0,
          valuation_rate: vRate,
          created_by: user?.full_name || user?.username || 'system',
          created_at: new Date().toISOString(),
        })
        if (sleErr) throw sleErr
        sleIds[line.id] = sleId
      }

      // Save sle_id back to each variance line
      await Promise.all(
        Object.entries(sleIds).map(([lineId, sleId]) =>
          supabase.from('cycle_count_lines').update({ sle_id: sleId }).eq('id', lineId)
        )
      )

      // Update session
      const countedN      = lines.filter(l => l.counted_qty !== null && l.counted_qty !== undefined).length
      const varItemsCount = varianceLines.length
      const { error: updErr } = await supabase
        .from('cycle_count_sessions')
        .update({
          status: 'Posted',
          posted_at: new Date().toISOString(),
          items_counted: countedN,
          items_variance: varItemsCount,
          total_variance_value: totalVarValue,
        })
        .eq('id', activeSession.id)
      if (updErr) throw updErr

      setActiveSession(prev => ({
        ...prev,
        status: 'Posted',
        posted_at: new Date().toISOString(),
        items_counted: countedN,
        items_variance: varItemsCount,
        total_variance_value: totalVarValue,
      }))

      toast.success(`Posted! ${varItemsCount} SLE adjustment(s) created.`)
      await loadAll()
      await loadLines(activeSession)
    } catch (err) {
      toast.error('Post failed: ' + err.message)
    } finally {
      setPosting(false)
    }
  }

  // ── Cancel session ──────────────────────────────────────────────────────────
  const handleCancel = async (session) => {
    if (!window.confirm(`Cancel session ${session.session_no}? This cannot be undone.`)) return
    const { error } = await supabase
      .from('cycle_count_sessions')
      .update({ status: 'Cancelled' })
      .eq('id', session.id)
    if (error) { toast.error(error.message); return }
    toast('Session cancelled')
    await loadAll()
    if (activeSession?.id === session.id) {
      setActiveSession(prev => ({ ...prev, status: 'Cancelled' }))
    }
  }

  // ── Export count sheet ──────────────────────────────────────────────────────
  const handleExport = () => {
    if (!lines.length) return toast.error('No lines to export')
    exportXLSX(
      lines.map(l => ({
        'Item Code':      l.item_code || '',
        'Item Name':      l.item_name,
        'Category':       l.category || '',
        'Unit':           l.unit || 'pcs',
        'System Qty':     Number(l.system_qty),
        'Counted Qty':    l.counted_qty !== null && l.counted_qty !== undefined ? Number(l.counted_qty) : '',
        'Variance':       l.variance !== null && l.variance !== undefined ? Number(l.variance) : '',
        'Variance Value': l.variance_value !== null && l.variance_value !== undefined ? Number(l.variance_value) : '',
      })),
      `CycleCount_${activeSession?.session_no || 'Sheet'}_${TODAY}`,
      'Count Sheet'
    )
    toast.success('Exported')
  }

  // ── Filtered count lines ────────────────────────────────────────────────────
  const filteredLines = useMemo(() => {
    if (countFilter === 'ALL') return lines
    if (countFilter === 'Counted')   return lines.filter(l => l.counted_qty !== null && l.counted_qty !== undefined)
    if (countFilter === 'Uncounted') return lines.filter(l => l.counted_qty === null || l.counted_qty === undefined)
    if (countFilter === 'Variance')  return lines.filter(l => {
      const v = Number(l.variance ?? (l.counted_qty != null ? l.counted_qty - l.system_qty : null))
      return l.counted_qty !== null && l.counted_qty !== undefined && v !== 0
    })
    return lines
  }, [lines, countFilter])

  // ── Count sheet summary ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const counted      = lines.filter(l => l.counted_qty !== null && l.counted_qty !== undefined)
    const withVariance = counted.filter(l => {
      const v = Number(l.variance ?? (Number(l.counted_qty) - Number(l.system_qty)))
      return v !== 0
    })
    const totalVarVal = withVariance.reduce((s, l) => {
      const v = Number(l.variance_value ?? ((Number(l.counted_qty) - Number(l.system_qty)) * Number(l.valuation_rate)))
      return s + v
    }, 0)
    return {
      total: lines.length,
      counted: counted.length,
      remaining: lines.length - counted.length,
      withVariance: withVariance.length,
      totalVarVal,
    }
  }, [lines])

  // ── Row background helper ──────────────────────────────────────────────────
  function rowBg(line) {
    if (line.counted_qty === null || line.counted_qty === undefined) return 'transparent'
    const v = Number(line.variance ?? (Number(line.counted_qty) - Number(line.system_qty)))
    if (v === 0) return 'rgba(52,211,153,.04)'
    return 'rgba(251,191,36,.05)'
  }

  // ── Variance colour ────────────────────────────────────────────────────────
  function varColor(variance) {
    if (variance === null || variance === undefined) return 'var(--text-dim)'
    const v = Number(variance)
    if (v === 0) return 'var(--text-dim)'
    return v > 0 ? 'var(--green)' : 'var(--red)'
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader
        title="Cycle Count"
        subtitle="Rolling stock counts by warehouse zone or category — post SLE adjustments for variances"
      >
        {tab === 'count' && activeSession && (
          <>
            <button className="btn btn-secondary" onClick={handleExport}>
              <span className="material-icons">table_chart</span> Export Sheet
            </button>
            <button className="btn btn-secondary" onClick={() => { setTab('sessions'); setActiveSession(null) }}>
              <span className="material-icons">arrow_back</span> All Sessions
            </button>
          </>
        )}
        {tab === 'sessions' && (
          <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
            <span className="material-icons">add</span> New Count Session
          </button>
        )}
      </PageHeader>

      {/* ── SESSIONS TAB ──────────────────────────────────────────────────── */}
      {tab === 'sessions' && (
        <>
          {/* KPI cards */}
          <div className="kpi-grid" style={{ marginBottom: 24 }}>
            <KPICard
              label="Sessions This Month"
              value={kpi.thisMonth}
              icon="event_note"
              color="blue"
            />
            <KPICard
              label="Posted Sessions"
              value={kpi.posted}
              icon="check_circle"
              color="green"
            />
            <KPICard
              label="Items with Variance"
              value={kpi.varItems.toLocaleString()}
              icon="swap_vert"
              color="yellow"
            />
            <KPICard
              label="Total Variance Value"
              value={`$${fmtNum(kpi.varVal)}`}
              icon="monetization_on"
              color="gold"
            />
          </div>

          {/* Sessions table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Session No</th>
                    <th>Warehouse</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Counted By</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Items</th>
                    <th style={{ textAlign: 'right' }}>Variance Items</th>
                    <th style={{ textAlign: 'right' }}>Variance Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading…</td></tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan="10">
                        <EmptyState icon="fact_check" message="No cycle count sessions yet. Click 'New Count Session' to begin." />
                      </td>
                    </tr>
                  ) : sessions.map(s => (
                    <tr
                      key={s.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setActiveSession(s); setTab('count') }}
                    >
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                        {s.session_no}
                      </td>
                      <td>{s.warehouse_name || s.warehouse_id || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.category || 'All Items'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.count_date}</td>
                      <td style={{ fontSize: 12 }}>{s.counted_by || '—'}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                        {s.items_counted}/{s.total_items}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: s.items_variance > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                        {s.items_variance || 0}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: Number(s.total_variance_value) < 0 ? 'var(--red)' : Number(s.total_variance_value) > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                        {Number(s.total_variance_value) !== 0 ? `$${fmtNum(s.total_variance_value)}` : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="btn-group">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setActiveSession(s); setTab('count') }}
                            title="Open count sheet"
                          >
                            <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                          </button>
                          {(s.status === 'Draft' || s.status === 'In Progress') && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--red)' }}
                              onClick={() => handleCancel(s)}
                              title="Cancel session"
                            >
                              <span className="material-icons" style={{ fontSize: 14 }}>cancel</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── COUNT SHEET TAB ───────────────────────────────────────────────── */}
      {tab === 'count' && activeSession && (
        <div style={{ marginTop: 16 }}>
          {/* Session header strip */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18, color: 'var(--gold)' }}>
                  {activeSession.session_no}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warehouse</span>
                {activeSession.warehouse_name || activeSession.warehouse_id}
              </div>
              {activeSession.category && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>category</span>
                  {activeSession.category}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>calendar_today</span>
                {activeSession.count_date}
              </div>
              {activeSession.counted_by && (
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>person</span>
                  {activeSession.counted_by}
                </div>
              )}
              <div>
                <StatusBadge status={activeSession.status} />
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-mid)' }}>
                Progress:&nbsp;
                <strong style={{ color: 'var(--text)' }}>
                  {summary.counted}/{summary.total}
                </strong>
                &nbsp;items counted
              </div>
            </div>
          </div>

          {/* Quick actions toolbar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Count filter tabs */}
            <div className="btn-group">
              {['ALL', 'Counted', 'Uncounted', 'Variance'].map(f => (
                <button
                  key={f}
                  className={countFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setCountFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f}
                  {f === 'Uncounted' && summary.remaining > 0 && (
                    <span style={{
                      marginLeft: 5, background: 'var(--red)', color: 'var(--surface)',
                      borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700,
                    }}>
                      {summary.remaining}
                    </span>
                  )}
                  {f === 'Variance' && summary.withVariance > 0 && (
                    <span style={{
                      marginLeft: 5, background: 'var(--yellow)', color: 'var(--surface)',
                      borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700,
                    }}>
                      {summary.withVariance}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            {(activeSession.status === 'In Progress' || activeSession.status === 'Draft') && (
              <div className="btn-group">
                <button className="btn btn-secondary btn-sm" onClick={handleFillAll} title="Set all counted = system qty">
                  <span className="material-icons" style={{ fontSize: 14 }}>done_all</span> Set All = System Qty
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleClearAll} style={{ color: 'var(--text-dim)' }} title="Clear all counts">
                  <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear All
                </button>
              </div>
            )}
          </div>

          {/* Count table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>System Qty</th>
                    <th style={{ textAlign: 'right', minWidth: 140 }}>Counted Qty</th>
                    <th style={{ textAlign: 'right' }}>Variance</th>
                    <th style={{ textAlign: 'right' }}>Variance Value</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan="10">
                        <EmptyState icon="search_off" message={
                          countFilter !== 'ALL'
                            ? `No items match the "${countFilter}" filter.`
                            : 'No items in this count session.'
                        } />
                      </td>
                    </tr>
                  ) : filteredLines.map((line, idx) => {
                    const localVal    = line._localQty !== undefined ? line._localQty : (line.counted_qty !== null && line.counted_qty !== undefined ? String(line.counted_qty) : '')
                    const hasCounted  = line.counted_qty !== null && line.counted_qty !== undefined
                    const variance    = hasCounted ? Number(line.variance ?? (Number(line.counted_qty) - Number(line.system_qty))) : null
                    const varValue    = hasCounted ? Number(line.variance_value ?? (variance * Number(line.valuation_rate))) : null
                    const editable    = activeSession.status === 'In Progress' || activeSession.status === 'Draft'

                    return (
                      <tr key={line.id} style={{ background: rowBg(line) }}>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>
                          {line.item_code || '—'}
                        </td>
                        <td style={{ fontWeight: 600 }}>{line.item_name}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.category || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.unit || 'pcs'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {fmtNum(line.system_qty)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {editable ? (
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              placeholder="enter count"
                              value={localVal}
                              onChange={e => handleLineChange(line.id, e.target.value)}
                              onBlur={() => handleLineBlur(line)}
                              className="form-control"
                              style={{
                                maxWidth: 130,
                                padding: '5px 8px',
                                fontSize: 13,
                                fontFamily: 'var(--mono)',
                                fontWeight: 700,
                                textAlign: 'right',
                                background: hasCounted
                                  ? (variance === 0 ? 'rgba(52,211,153,.1)' : 'rgba(251,191,36,.1)')
                                  : 'var(--surface2)',
                                borderColor: hasCounted
                                  ? (variance === 0 ? 'rgba(52,211,153,.4)' : 'rgba(251,191,36,.4)')
                                  : 'var(--border2)',
                              }}
                            />
                          ) : (
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              {hasCounted ? fmtNum(line.counted_qty) : '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: varColor(variance) }}>
                          {variance === null
                            ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                            : `${variance > 0 ? '+' : ''}${fmtNum(variance)}`}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: varColor(varValue) }}>
                          {varValue === null
                            ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                            : `${varValue > 0 ? '+' : ''}$${fmtNum(varValue)}`}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.notes || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary footer */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginTop: 12,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 13,
          }}>
            <span>
              Total items: <strong>{summary.total}</strong>
            </span>
            <span>
              Counted: <strong style={{ color: 'var(--green)' }}>{summary.counted}</strong>
            </span>
            <span>
              Remaining: <strong style={{ color: summary.remaining > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>{summary.remaining}</strong>
            </span>
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
              Items with variance: <strong style={{ color: summary.withVariance > 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>{summary.withVariance}</strong>
            </span>
            <span>
              Total variance value:{' '}
              <strong style={{ color: varColor(summary.totalVarVal) }}>
                {summary.totalVarVal > 0 ? '+' : ''}{summary.totalVarVal !== 0 ? `$${fmtNum(summary.totalVarVal)}` : '$0.00'}
              </strong>
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {activeSession.status === 'Posted' && activeSession.posted_at && (
                <span style={{ color: 'var(--green)', fontSize: 12 }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>verified</span>
                  Posted {new Date(activeSession.posted_at).toLocaleString()}
                </span>
              )}
            </span>
          </div>

          {/* Post Adjustments button */}
          {(activeSession.status === 'In Progress' || activeSession.status === 'Draft') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setTab('sessions'); setActiveSession(null) }}
              >
                Back to Sessions
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePost}
                disabled={posting || summary.remaining > 0}
                title={summary.remaining > 0 ? `${summary.remaining} item(s) still uncounted` : 'Post SLE adjustments for all variances'}
              >
                <span className="material-icons">
                  {posting ? 'hourglass_empty' : 'published_with_changes'}
                </span>
                {posting ? 'Posting…' : `Post Adjustments${summary.withVariance > 0 ? ` (${summary.withVariance} variance${summary.withVariance !== 1 ? 's' : ''})` : ''}`}
              </button>
            </div>
          )}

          {activeSession.status === 'Posted' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setTab('sessions'); setActiveSession(null) }}
              >
                Back to Sessions
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── NEW SESSION MODAL ────────────────────────────────────────────── */}
      <ModalDialog
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Cycle Count Session"
        size="md"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '16px 0' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Warehouse <span style={{ color: 'var(--red)' }}>*</span></label>
            <select
              className="form-control"
              value={form.warehouse_id}
              onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}
            >
              <option value="">— Select warehouse —</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select
              className="form-control"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {categoryOptions.map(c => (
                <option key={c} value={c}>{c === 'ALL' ? 'All Items' : c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Count Date <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              type="date"
              className="form-control"
              value={form.count_date}
              onChange={e => setForm(f => ({ ...f, count_date: e.target.value }))}
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Counted By <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              value={form.counted_by}
              onChange={e => setForm(f => ({ ...f, counted_by: e.target.value }))}
              placeholder="Name of counter"
            />
          </div>

          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <input
              className="form-control"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
          <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>info</span>
          Only items with positive stock in the selected warehouse will be included.
          {form.category && form.category !== 'ALL' && ` Filtered to category: "${form.category}".`}
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowNewModal(false)} disabled={creating}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            <span className="material-icons">{creating ? 'hourglass_empty' : 'fact_check'}</span>
            {creating ? 'Creating…' : 'Create & Start Counting'}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
