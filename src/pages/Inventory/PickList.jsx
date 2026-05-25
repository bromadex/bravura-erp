// src/pages/Inventory/PickList.jsx
// Pick List workflow: warehouse picker collects items before SR fulfillment.
// A pick list groups approved Store Requisitions, assigns a picker, and on
// completion writes Stock Ledger Entries (negative = issue) per picked qty.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { fmtNum } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0]

// ── Status colours ────────────────────────────────────────────────────────────
const PL_STATUS_COLORS = {
  Draft:      { bg: 'var(--yellow)',   fg: 'var(--surface)' },
  Picking:    { bg: 'var(--blue)',     fg: 'var(--surface)' },
  Completed:  { bg: 'var(--green)',    fg: 'var(--surface)' },
  Cancelled:  { bg: 'var(--red)',      fg: 'var(--surface)' },
}

const LINE_STATUS_COLORS = {
  Pending:      { bg: 'var(--border)',    fg: 'var(--text-dim)' },
  Picked:       { bg: 'var(--green)',     fg: 'var(--surface)'  },
  'Short Pick': { bg: 'var(--yellow)',    fg: 'var(--surface)'  },
  Skipped:      { bg: 'var(--red)',       fg: 'var(--surface)'  },
}

function StatusBadge({ status, colors }) {
  const s = colors[status] ?? { bg: 'var(--border)', fg: 'var(--text)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 700,
      background: s.bg,
      color: s.fg,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ── Row background for pick status ────────────────────────────────────────────
function lineRowBg(status) {
  switch (status) {
    case 'Picked':      return 'rgba(52,211,153,.07)'
    case 'Short Pick':  return 'rgba(251,191,36,.08)'
    case 'Skipped':     return 'rgba(239,68,68,.07)'
    default:            return undefined
  }
}

// ── Compute pick_status from picked qty vs requested ──────────────────────────
function computePickStatus(picked, requested) {
  const p = Number(picked)
  const r = Number(requested)
  if (p === 0) return 'Skipped'
  if (p >= r)  return 'Picked'
  return 'Short Pick'
}

// ── Thin progress bar ─────────────────────────────────────────────────────────
function ProgressBar({ picked, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((picked / total) * 100)) : 0
  const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--text-dim)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{pct}%</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PickList() {
  const { user } = useAuth()

  // ── State ──────────────────────────────────────────────────────────────────
  const [pickLists,   setPickLists]   = useState([])
  const [pendingSRs,  setPendingSRs]  = useState([])
  const [warehouses,  setWarehouses]  = useState([])
  const [bins,        setBins]        = useState([])
  const [active,      setActive]      = useState(null)   // selected pick list
  const [lines,       setLines]       = useState([])     // lines for active pick list
  const [tab,         setTab]         = useState('lists') // 'lists' | 'pick'
  const [showCreate,  setShowCreate]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [completing,  setCompleting]  = useState(false)
  const [creating,    setCreating]    = useState(false)
  const [lineFilter,  setLineFilter]  = useState('All')  // All | Pending | Picked | Short Pick | Skipped

  // Create modal form state
  const [form, setForm] = useState({
    assigned_to: '',
    warehouse_id: '',
    pick_date: TODAY,
    notes: '',
  })
  const [selectedSRIds, setSelectedSRIds] = useState(new Set())

  // ── Load all reference data ────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: plData, error: plErr },
        { data: srData, error: srErr },
        { data: whData, error: whErr },
        { data: binData, error: binErr },
      ] = await Promise.all([
        supabase.from('pick_lists').select('*, pick_list_lines(id, pick_status)').order('created_at', { ascending: false }),
        supabase.from('store_requisitions').select('id, sr_number, req_number, date, department, items, status').in('status', ['approved', 'pending']).order('date'),
        supabase.from('warehouses').select('id, name').eq('is_active', true),
        supabase.from('bins').select('item_id, warehouse_id, actual_qty'),
      ])
      if (plErr)  throw plErr
      if (srErr)  throw srErr
      if (whErr)  throw whErr
      if (binErr) throw binErr
      setPickLists(plData  || [])
      setPendingSRs(srData || [])
      setWarehouses(whData || [])
      setBins(binData      || [])
    } catch (err) {
      toast.error('Load failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Load lines for active pick list ────────────────────────────────────────
  const loadLines = useCallback(async (pl) => {
    if (!pl) { setLines([]); return }
    const { data, error } = await supabase
      .from('pick_list_lines')
      .select('*')
      .eq('pick_list_id', pl.id)
      .order('sort_order')
    if (error) { toast.error('Failed to load pick lines: ' + error.message); return }
    setLines(data || [])
  }, [])

  useEffect(() => {
    if (active) loadLines(active)
  }, [active, loadLines])

  // ── KPI computations ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const openCount = pickLists.filter(pl => pl.status === 'Draft' || pl.status === 'Picking').length
    const completedToday = pickLists.filter(pl =>
      pl.status === 'Completed' &&
      pl.completed_at &&
      pl.completed_at.startsWith(todayStr)
    ).length
    // SRs not yet in any pick list — approximate by comparing sr ids in pick lists
    const srIdsInPickLists = new Set(
      pickLists.flatMap(pl => (pl.pick_list_lines || []).map(() => null)) // placeholder
    )
    const pendingAwaitingPick = pendingSRs.length
    const linesPending = pickLists.reduce((sum, pl) => {
      return sum + (pl.pick_list_lines || []).filter(l => l.pick_status === 'Pending').length
    }, 0)
    return { openCount, completedToday, pendingAwaitingPick, linesPending }
  }, [pickLists, pendingSRs])

  // ── Create Pick List ───────────────────────────────────────────────────────
  const handleCreatePickList = async () => {
    if (!form.warehouse_id) return toast.error('Select a warehouse')
    if (!form.assigned_to.trim()) return toast.error('Enter assigned picker name')
    if (selectedSRIds.size === 0) return toast.error('Select at least one Store Requisition')
    setCreating(true)
    try {
      // Generate PK number
      const { data: last } = await supabase
        .from('pick_lists')
        .select('pick_no')
        .ilike('pick_no', 'PK-%')
        .order('created_at', { ascending: false })
        .limit(1)
      const lastNum = parseInt((last?.[0]?.pick_no || 'PK-0000').replace('PK-', '')) || 0
      const pick_no = `PK-${String(lastNum + 1).padStart(4, '0')}`

      const pickId = crypto.randomUUID()
      const { error: insertErr } = await supabase.from('pick_lists').insert({
        id: pickId,
        pick_no,
        warehouse_id: form.warehouse_id,
        warehouse_name: warehouses.find(w => w.id === form.warehouse_id)?.name,
        assigned_to: form.assigned_to,
        status: 'Picking',
        pick_date: form.pick_date,
        notes: form.notes,
        created_by: user?.full_name || 'system',
      })
      if (insertErr) throw insertErr

      // Build lines from selected SRs
      const selectedSRs = pendingSRs.filter(sr => selectedSRIds.has(sr.id))
      const allLines = []
      let sortOrder = 0
      for (const sr of selectedSRs) {
        const items = typeof sr.items === 'string' ? JSON.parse(sr.items) : (sr.items || [])
        for (const it of items) {
          const bin = bins.find(b => b.item_id === it.item_id && b.warehouse_id === form.warehouse_id)
          allLines.push({
            id: crypto.randomUUID(),
            pick_list_id: pickId,
            sr_id: sr.id,
            sr_number: sr.sr_number || sr.req_number,
            department: sr.department,
            item_id: it.item_id || '',
            item_name: it.name || it.item_name || '',
            item_code: it.item_code || '',
            unit: it.unit || 'pcs',
            requested_qty: it.qty || 1,
            system_qty: bin?.actual_qty || 0,
            warehouse_id: form.warehouse_id,
            pick_status: 'Pending',
            sort_order: sortOrder++,
          })
        }
      }

      if (allLines.length > 0) {
        const { error: lineErr } = await supabase.from('pick_list_lines').insert(allLines)
        if (lineErr) throw lineErr
      }

      toast.success(`Pick List ${pick_no} created with ${allLines.length} lines`)
      setShowCreate(false)
      setSelectedSRIds(new Set())
      setForm({ assigned_to: '', warehouse_id: '', pick_date: TODAY, notes: '' })
      await loadAll()
      // Open the new pick list immediately
      const newPl = { id: pickId, pick_no, assigned_to: form.assigned_to, warehouse_name: warehouses.find(w => w.id === form.warehouse_id)?.name, pick_date: form.pick_date, status: 'Picking' }
      setActive(newPl)
      setTab('pick')
    } catch (err) {
      toast.error('Failed to create: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Line: local qty change ──────────────────────────────────────────────────
  const handleLineQtyChange = (lineId, val) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, _localQty: val } : l))
  }

  // ── Line: blur — save to DB ─────────────────────────────────────────────────
  const handleLineBlur = async (line) => {
    const rawVal = line._localQty !== undefined ? line._localQty : line.picked_qty
    if (rawVal === undefined || rawVal === '') {
      // clear picked_qty back to null
      setLines(prev => prev.map(l => l.id === line.id ? { ...l, picked_qty: null, pick_status: 'Pending', _localQty: undefined } : l))
      await supabase.from('pick_list_lines').update({ picked_qty: null, pick_status: 'Pending' }).eq('id', line.id)
      return
    }
    const val = parseFloat(rawVal)
    if (isNaN(val)) return
    const newStatus = computePickStatus(val, line.requested_qty)
    setLines(prev => prev.map(l =>
      l.id === line.id
        ? { ...l, picked_qty: val, pick_status: newStatus, _localQty: undefined }
        : l
    ))
    const { error } = await supabase
      .from('pick_list_lines')
      .update({ picked_qty: val, pick_status: newStatus })
      .eq('id', line.id)
    if (error) toast.error('Save failed: ' + error.message)
  }

  // ── Set all lines = requested qty ──────────────────────────────────────────
  const handleSetAllRequested = async () => {
    const pending = lines.filter(l => l.pick_status === 'Pending' || l.picked_qty === null)
    if (pending.length === 0) return toast('All lines already have a picked qty')
    const updates = pending.map(l => ({
      id: l.id,
      picked_qty: l.requested_qty,
      pick_status: 'Picked',
    }))
    setLines(prev => prev.map(l => {
      const upd = updates.find(u => u.id === l.id)
      return upd ? { ...l, picked_qty: upd.picked_qty, pick_status: upd.pick_status } : l
    }))
    try {
      for (const upd of updates) {
        await supabase.from('pick_list_lines').update({ picked_qty: upd.picked_qty, pick_status: upd.pick_status }).eq('id', upd.id)
      }
      toast.success(`Set ${updates.length} line(s) to requested qty`)
    } catch (err) {
      toast.error('Bulk update failed: ' + err.message)
      await loadLines(active)
    }
  }

  // ── Complete Pick List ─────────────────────────────────────────────────────
  const handleCompletePick = async () => {
    if (!window.confirm(`Complete Pick List ${active.pick_no}? This will issue stock for all picked quantities.`)) return
    setCompleting(true)
    try {
      const pickedLines = lines.filter(l => (l.picked_qty || 0) > 0)

      // 1. Write SLEs for each line with picked_qty > 0
      for (const line of pickedLines) {
        const { error: sleErr } = await supabase.from('stock_ledger_entries').insert({
          id: crypto.randomUUID(),
          item_id: line.item_id,
          warehouse_id: line.warehouse_id,
          posting_datetime: new Date().toISOString(),
          voucher_type: 'StoreRequisition',
          voucher_no: line.sr_number,
          actual_qty: -(line.picked_qty),
          outgoing_rate: 0,
          valuation_rate: 0,
          created_by: user?.full_name || 'system',
          created_at: new Date().toISOString(),
        })
        if (sleErr) throw sleErr
      }

      // 2. Update SR status for fully or partially picked SRs
      const srIds = [...new Set(pickedLines.map(l => l.sr_id))]
      for (const srId of srIds) {
        const srLines = lines.filter(l => l.sr_id === srId)
        const allPicked = srLines.every(l => (l.picked_qty || 0) >= l.requested_qty)
        const { error: srErr } = await supabase
          .from('store_requisitions')
          .update({
            status: allPicked ? 'fulfilled' : 'partially_fulfilled',
            issued_by: user?.full_name || 'picker',
            updated_at: new Date().toISOString(),
          })
          .eq('id', srId)
        if (srErr) throw srErr
      }

      // 3. Mark pick list complete
      const { error: plErr } = await supabase
        .from('pick_lists')
        .update({
          status: 'Completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', active.id)
      if (plErr) throw plErr

      toast.success(`Pick List ${active.pick_no} completed — stock issued`)
      setTab('lists')
      setActive(null)
      setLines([])
      await loadAll()
    } catch (err) {
      toast.error('Failed to complete: ' + err.message)
    } finally {
      setCompleting(false)
    }
  }

  // ── Cancel a pick list ─────────────────────────────────────────────────────
  const handleCancel = async (pl) => {
    if (!window.confirm(`Cancel Pick List ${pl.pick_no}? No stock will be issued.`)) return
    const { error } = await supabase
      .from('pick_lists')
      .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
      .eq('id', pl.id)
    if (error) return toast.error('Cancel failed: ' + error.message)
    toast('Pick List cancelled')
    await loadAll()
    if (active?.id === pl.id) { setActive(null); setTab('lists') }
  }

  // ── Open a pick list ───────────────────────────────────────────────────────
  const handleOpen = (pl) => {
    setActive(pl)
    setLineFilter('All')
    setTab('pick')
  }

  // ── SR selection toggle ────────────────────────────────────────────────────
  const toggleSR = (id) => {
    setSelectedSRIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAllSRs = () => {
    if (selectedSRIds.size === pendingSRs.length) {
      setSelectedSRIds(new Set())
    } else {
      setSelectedSRIds(new Set(pendingSRs.map(sr => sr.id)))
    }
  }

  // ── Pick summary ───────────────────────────────────────────────────────────
  const pickSummary = useMemo(() => {
    const picked     = lines.filter(l => l.pick_status === 'Picked').length
    const shortPick  = lines.filter(l => l.pick_status === 'Short Pick').length
    const skipped    = lines.filter(l => l.pick_status === 'Skipped').length
    const pending    = lines.filter(l => l.pick_status === 'Pending').length
    const totalReq   = lines.reduce((s, l) => s + Number(l.requested_qty || 0), 0)
    const totalPicked = lines.reduce((s, l) => s + Number(l.picked_qty || 0), 0)
    const allDone    = lines.length > 0 && lines.every(l => l.picked_qty !== null && l.picked_qty !== undefined)
    return { picked, shortPick, skipped, pending, totalReq, totalPicked, allDone, total: lines.length }
  }, [lines])

  // ── Filtered lines ─────────────────────────────────────────────────────────
  const filteredLines = useMemo(() => {
    if (lineFilter === 'All') return lines
    return lines.filter(l => l.pick_status === lineFilter)
  }, [lines, lineFilter])

  // ── SR item count helper ───────────────────────────────────────────────────
  const srItemCount = (sr) => {
    try {
      const items = typeof sr.items === 'string' ? JSON.parse(sr.items) : (sr.items || [])
      return items.length
    } catch { return 0 }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Pick Lists">
        {tab === 'pick' && active ? (
          <button className="btn btn-secondary" onClick={() => { setTab('lists'); setActive(null); setLines([]) }}>
            <span className="material-icons">arrow_back</span> Back to Lists
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => {
            setForm({ assigned_to: user?.full_name || user?.username || '', warehouse_id: '', pick_date: TODAY, notes: '' })
            setSelectedSRIds(new Set())
            setShowCreate(true)
          }}>
            <span className="material-icons">add</span> New Pick List
          </button>
        )}
      </PageHeader>

      {/* ── KPI CARDS ───────────────────────────────────────────────────────── */}
      {tab === 'lists' && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <KPICard
            label="Open Pick Lists"
            value={kpi.openCount}
            icon="inventory_2"
            color="blue"
            sub="Draft + Picking"
          />
          <KPICard
            label="Completed Today"
            value={kpi.completedToday}
            icon="check_circle"
            color="green"
            sub="Fully issued"
          />
          <KPICard
            label="Pending SRs"
            value={kpi.pendingAwaitingPick}
            icon="pending_actions"
            color="yellow"
            sub="Approved, awaiting pick"
          />
          <KPICard
            label="Lines Pending"
            value={kpi.linesPending}
            icon="hourglass_top"
            sub="Unconfirmed pick lines"
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PICK LISTS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'lists' && (
        <>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
              <span className="material-icons" style={{ fontSize: 32 }}>hourglass_empty</span>
              <p>Loading pick lists…</p>
            </div>
          ) : pickLists.length === 0 ? (
            <EmptyState icon="inventory_2" message="No pick lists yet. Create one to start picking." />
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>PK No</th>
                      <th>Date</th>
                      <th>Assigned To</th>
                      <th>Warehouse</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Lines</th>
                      <th style={{ textAlign: 'right' }}>Picked</th>
                      <th style={{ minWidth: 130 }}>Progress</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickLists.map(pl => {
                      const allLines   = pl.pick_list_lines || []
                      const pickedCnt  = allLines.filter(l => l.pick_status === 'Picked' || l.pick_status === 'Short Pick').length
                      return (
                        <tr
                          key={pl.id}
                          style={{ cursor: pl.status !== 'Cancelled' ? 'pointer' : undefined }}
                          onClick={() => pl.status !== 'Cancelled' && handleOpen(pl)}
                        >
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>
                            {pl.pick_no}
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{pl.pick_date}</td>
                          <td style={{ fontSize: 13 }}>{pl.assigned_to || '—'}</td>
                          <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pl.warehouse_name || '—'}</td>
                          <td><StatusBadge status={pl.status} colors={PL_STATUS_COLORS} /></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                            {allLines.length}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                            {pickedCnt}
                          </td>
                          <td>
                            <ProgressBar picked={pickedCnt} total={allLines.length} />
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="btn-group">
                              {pl.status !== 'Cancelled' && pl.status !== 'Completed' && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleOpen(pl)}
                                  title="Open pick sheet"
                                >
                                  <span className="material-icons" style={{ fontSize: 14 }}>open_in_new</span>
                                </button>
                              )}
                              {(pl.status === 'Draft' || pl.status === 'Picking') && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: 'var(--red)' }}
                                  onClick={() => handleCancel(pl)}
                                  title="Cancel pick list"
                                >
                                  <span className="material-icons" style={{ fontSize: 14 }}>cancel</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PICK SHEET TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'pick' && active && (
        <div style={{ marginTop: 16 }}>

          {/* Header strip */}
          <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 18, color: 'var(--gold)' }}>
                {active.pick_no}
              </span>
              {active.assigned_to && (
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>person</span>
                  {active.assigned_to}
                </span>
              )}
              {active.warehouse_name && (
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warehouse</span>
                  {active.warehouse_name}
                </span>
              )}
              {active.pick_date && (
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>calendar_today</span>
                  {active.pick_date}
                </span>
              )}
              <StatusBadge status={active.status || 'Picking'} colors={PL_STATUS_COLORS} />
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-dim)' }}>
                Progress:&nbsp;
                <strong style={{ color: 'var(--text)' }}>
                  {pickSummary.picked + pickSummary.shortPick + pickSummary.skipped}/{pickSummary.total}
                </strong>
                &nbsp;picked
              </span>
            </div>
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSetAllRequested}
              title="Fill all pending lines with requested qty"
            >
              <span className="material-icons" style={{ fontSize: 14 }}>done_all</span>
              Set All = Requested
            </button>
            <span style={{ flex: 1 }} />
            {/* Filter buttons */}
            <div className="btn-group">
              {['All', 'Pending', 'Picked', 'Short Pick', 'Skipped'].map(f => (
                <button
                  key={f}
                  className={lineFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setLineFilter(f)}
                >
                  {f}
                  {f === 'Pending' && pickSummary.pending > 0 && (
                    <span style={{
                      marginLeft: 5,
                      background: 'var(--yellow)',
                      color: 'var(--surface)',
                      borderRadius: 8,
                      padding: '0 5px',
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {pickSummary.pending}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pick table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>SR No</th>
                    <th>Department</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th style={{ textAlign: 'right' }}>Requested</th>
                    <th style={{ textAlign: 'right' }}>System Qty</th>
                    <th style={{ textAlign: 'right', minWidth: 140 }}>Picked Qty</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.length === 0 ? (
                    <tr>
                      <td colSpan="10">
                        <EmptyState
                          icon="search_off"
                          message={
                            lineFilter !== 'All'
                              ? `No lines match the "${lineFilter}" filter.`
                              : 'No pick lines in this list.'
                          }
                        />
                      </td>
                    </tr>
                  ) : filteredLines.map((line, idx) => {
                    const localVal = line._localQty !== undefined
                      ? line._localQty
                      : (line.picked_qty !== null && line.picked_qty !== undefined ? String(line.picked_qty) : '')
                    const isEditable = active.status === 'Picking' || active.status === 'Draft'
                    return (
                      <tr key={line.id} style={{ background: lineRowBg(line.pick_status) }}>
                        <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>
                          {line.sr_number}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.department || '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>
                          {line.item_code || '—'}
                        </td>
                        <td style={{ fontWeight: 600 }}>{line.item_name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                          {fmtNum(line.requested_qty)}
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>{line.unit}</span>
                        </td>
                        <td style={{
                          textAlign: 'right',
                          fontFamily: 'var(--mono)',
                          color: Number(line.system_qty) < Number(line.requested_qty) ? 'var(--red)' : 'var(--text)',
                        }}>
                          {fmtNum(line.system_qty)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isEditable ? (
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              placeholder="qty…"
                              value={localVal}
                              onChange={e => handleLineQtyChange(line.id, e.target.value)}
                              onBlur={() => handleLineBlur(line)}
                              className="form-control"
                              style={{
                                maxWidth: 130,
                                padding: '5px 8px',
                                fontSize: 13,
                                fontFamily: 'var(--mono)',
                                fontWeight: 700,
                                textAlign: 'right',
                                background: line.pick_status === 'Picked'
                                  ? 'rgba(52,211,153,.12)'
                                  : line.pick_status === 'Short Pick'
                                  ? 'rgba(251,191,36,.12)'
                                  : line.pick_status === 'Skipped'
                                  ? 'rgba(239,68,68,.08)'
                                  : 'var(--surface2)',
                                borderColor: line.pick_status === 'Picked'
                                  ? 'rgba(52,211,153,.4)'
                                  : line.pick_status === 'Short Pick'
                                  ? 'rgba(251,191,36,.4)'
                                  : line.pick_status === 'Skipped'
                                  ? 'rgba(239,68,68,.3)'
                                  : 'var(--border2)',
                              }}
                            />
                          ) : (
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              {line.picked_qty !== null && line.picked_qty !== undefined
                                ? fmtNum(line.picked_qty)
                                : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={line.pick_status} colors={LINE_STATUS_COLORS} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{line.notes || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Progress summary footer */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginTop: 12,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 13,
          }}>
            <span>
              Picked:&nbsp;<strong style={{ color: 'var(--green)' }}>{pickSummary.picked}</strong>
            </span>
            <span>
              Short Pick:&nbsp;<strong style={{ color: 'var(--yellow)' }}>{pickSummary.shortPick}</strong>
            </span>
            <span>
              Skipped:&nbsp;<strong style={{ color: 'var(--red)' }}>{pickSummary.skipped}</strong>
            </span>
            <span>
              Pending:&nbsp;<strong style={{ color: 'var(--text-dim)' }}>{pickSummary.pending}</strong>
            </span>
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
              Total Requested:&nbsp;<strong style={{ fontFamily: 'var(--mono)' }}>{fmtNum(pickSummary.totalReq)}</strong>
            </span>
            <span>
              Total Picked:&nbsp;
              <strong style={{
                fontFamily: 'var(--mono)',
                color: pickSummary.totalPicked >= pickSummary.totalReq ? 'var(--green)' : 'var(--yellow)',
              }}>
                {fmtNum(pickSummary.totalPicked)}
              </strong>
            </span>
          </div>

          {/* Complete Pick List button */}
          {(active.status === 'Picking' || active.status === 'Draft') && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setTab('lists'); setActive(null); setLines([]) }}
              >
                Back to Lists
              </button>
              <button
                className="btn btn-primary"
                style={{
                  background: pickSummary.allDone ? 'var(--gold)' : undefined,
                  borderColor: pickSummary.allDone ? 'var(--gold)' : undefined,
                  color: pickSummary.allDone ? 'var(--surface)' : undefined,
                  opacity: pickSummary.allDone ? 1 : 0.5,
                }}
                onClick={handleCompletePick}
                disabled={!pickSummary.allDone || completing}
                title={
                  !pickSummary.allDone
                    ? `${pickSummary.pending} line(s) still need a picked qty (enter 0 to skip)`
                    : 'Complete and issue stock'
                }
              >
                <span className="material-icons">
                  {completing ? 'hourglass_empty' : 'task_alt'}
                </span>
                {completing ? 'Completing…' : 'Complete Pick List'}
              </button>
            </div>
          )}

          {active.status === 'Completed' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setTab('lists'); setActive(null); setLines([]) }}
              >
                Back to Lists
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CREATE PICK LIST MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      <ModalDialog
        open={showCreate}
        onClose={() => !creating && setShowCreate(false)}
        title="New Pick List"
        size="lg"
      >
        {/* Form fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '16px 0 0' }}>
          <div className="form-group">
            <label>Assigned To <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-control"
              placeholder="Picker name…"
              value={form.assigned_to}
              onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
            />
          </div>

          <div className="form-group">
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
            <label>Pick Date <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              type="date"
              className="form-control"
              value={form.pick_date}
              onChange={e => setForm(f => ({ ...f, pick_date: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <input
              className="form-control"
              placeholder="Optional notes…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        {/* SR selection table */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>
              Select Store Requisitions <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {selectedSRIds.size} selected
            </span>
          </div>

          {pendingSRs.length === 0 ? (
            <div style={{
              padding: '20px 16px',
              textAlign: 'center',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-dim)',
              fontSize: 13,
            }}>
              <span className="material-icons" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>inbox</span>
              No approved Store Requisitions awaiting fulfilment.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
              <table className="stock-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selectedSRIds.size === pendingSRs.length && pendingSRs.length > 0}
                        onChange={toggleAllSRs}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>SR No</th>
                    <th>Department</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Items</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSRs.map(sr => (
                    <tr
                      key={sr.id}
                      style={{
                        cursor: 'pointer',
                        background: selectedSRIds.has(sr.id) ? 'rgba(59,130,246,.07)' : undefined,
                      }}
                      onClick={() => toggleSR(sr.id)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSRIds.has(sr.id)}
                          onChange={() => toggleSR(sr.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)', fontSize: 12 }}>
                        {sr.sr_number || sr.req_number}
                      </td>
                      <td style={{ fontSize: 13 }}>{sr.department || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{sr.date}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                        {srItemCount(sr)}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 700,
                          background: sr.status === 'approved' ? 'var(--green)' : 'var(--yellow)',
                          color: 'var(--surface)',
                        }}>
                          {sr.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ModalActions>
          <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreatePickList}
            disabled={creating || selectedSRIds.size === 0 || !form.warehouse_id || !form.assigned_to.trim()}
          >
            <span className="material-icons">{creating ? 'hourglass_empty' : 'playlist_add'}</span>
            {creating ? 'Creating…' : `Create Pick List (${selectedSRIds.size} SR${selectedSRIds.size !== 1 ? 's' : ''})`}
          </button>
        </ModalActions>
      </ModalDialog>
    </div>
  )
}
