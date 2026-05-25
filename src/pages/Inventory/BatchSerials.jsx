// src/pages/Inventory/BatchSerials.jsx
// Phase 15 — Batch & Serial Tracking management page

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCanEdit } from '../../hooks/usePermission'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

const today = new Date().toISOString().split('T')[0]

function daysDiff(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date(dateStr) - new Date(today)) / 86400000)
}

function expiryColor(dateStr) {
  const d = daysDiff(dateStr)
  if (d === null) return 'var(--text-dim)'
  if (d < 0)  return 'var(--red)'
  if (d <= 30) return 'var(--yellow)'
  return 'var(--text)'
}

const STATUS_BADGE = {
  Active:     'badge-green',
  Exhausted:  'badge-gray',
  Expired:    'badge-red',
  Quarantine: 'badge-yellow',
  'In Stock':    'badge-green',
  Issued:        'badge-blue',
  'In Repair':   'badge-yellow',
  Scrapped:      'badge-red',
  Returned:      'badge-gray',
  Transferred:   'badge-purple',
}

export default function BatchSerials() {
  const canEdit = useCanEdit('inventory', 'batch-serials')

  const [batches, setBatches] = useState([])
  const [serials, setSerials] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('batches')

  // Filters — batches
  const [bSearch,   setBSearch]   = useState('')
  const [bStatus,   setBStatus]   = useState('All')
  const [bWarehouse, setBWarehouse] = useState('All')

  // Filters — serials
  const [sSearch,    setSSearch]    = useState('')
  const [sStatus,    setSStatus]    = useState('All')
  const [sWarehouse, setSWarehouse] = useState('All')

  // Modals
  const [batchModal,  setBatchModal]  = useState(null)   // batch row or null
  const [serialModal, setSerialModal] = useState(null)   // serial row or null

  // Serial movement history (inline expand)
  const [expandedSerial, setExpandedSerial] = useState(null)   // serial id or null
  const [serialSLEs,     setSerialSLEs]     = useState({})     // keyed by serial id

  // ── Load data ─────────────────────────────────────────────
  const loadBatches = () =>
    supabase
      .from('item_batches')
      .select('*, items(unit), warehouses(name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        if (data) setBatches(data)
      })

  const loadSerials = () =>
    supabase
      .from('item_serials')
      .select('*, items(unit), warehouses(name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        if (data) setSerials(data)
      })

  useEffect(() => {
    setLoading(true)
    Promise.all([loadBatches(), loadSerials()]).finally(() => setLoading(false))
  }, [])

  // ── KPI computations ──────────────────────────────────────
  const activeBatches  = batches.filter(b => b.status === 'Active').length
  const expiringSoon   = batches.filter(b => {
    const d = daysDiff(b.expiry_date)
    return b.status === 'Active' && d !== null && d >= 0 && d <= 30
  }).length
  const activeSerials  = serials.filter(s => s.status === 'In Stock').length
  const issuedSerials  = serials.filter(s => s.status === 'Issued').length

  // ── Unique warehouses for filters ─────────────────────────
  const batchWarehouses = ['All', ...new Set(batches.map(b => b.warehouses?.name).filter(Boolean))]
  const serialWarehouses = ['All', ...new Set(serials.map(s => s.warehouses?.name).filter(Boolean))]

  // ── Filtered data ─────────────────────────────────────────
  const filteredBatches = batches.filter(b => {
    if (bStatus !== 'All' && b.status !== bStatus) return false
    if (bWarehouse !== 'All' && b.warehouses?.name !== bWarehouse) return false
    if (bSearch) {
      const q = bSearch.toLowerCase()
      if (!b.batch_no?.toLowerCase().includes(q) && !b.item_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const filteredSerials = serials.filter(s => {
    if (sStatus !== 'All' && s.status !== sStatus) return false
    if (sWarehouse !== 'All' && s.warehouses?.name !== sWarehouse) return false
    if (sSearch) {
      const q = sSearch.toLowerCase()
      if (!s.serial_no?.toLowerCase().includes(q) && !s.item_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Batch action handlers ──────────────────────────────────
  const handleBatchStatusUpdate = async (batch, newStatus, reason) => {
    const { error } = await supabase
      .from('item_batches')
      .update({ status: newStatus, notes: reason || batch.notes, updated_at: new Date().toISOString() })
      .eq('id', batch.id)
    if (error) { toast.error(error.message); return false }
    toast.success(`Batch ${batch.batch_no} marked as ${newStatus}`)
    await loadBatches()
    return true
  }

  // ── Serial status update handler ──────────────────────────
  const handleSerialUpdate = async (serial, newStatus, notes) => {
    const historyEntry = {
      date:        new Date().toISOString(),
      action:      `Status changed to ${newStatus}`,
      from_status: serial.status,
      to_status:   newStatus,
      notes:       notes || '',
    }
    const updatedHistory = [...(serial.history || []), historyEntry]
    const { error } = await supabase
      .from('item_serials')
      .update({
        status:     newStatus,
        history:    updatedHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serial.id)
    if (error) { toast.error(error.message); return false }
    toast.success(`Serial ${serial.serial_no} updated to ${newStatus}`)
    await loadSerials()
    return true
  }

  // ── Serial movement history loader ───────────────────────
  const loadSerialSLEs = async (serial) => {
    if (serialSLEs[serial.id] !== undefined) return // already loaded
    const { data, error } = await supabase
      .from('stock_ledger_entries')
      .select('id, posting_datetime, voucher_type, voucher_no, actual_qty, warehouse_id, warehouses(name)')
      .eq('item_id', serial.item_id)
      .eq('warehouse_id', serial.warehouse_id)
      .order('posting_datetime', { ascending: true })
    if (error) {
      setSerialSLEs(prev => ({ ...prev, [serial.id]: [] }))
    } else {
      setSerialSLEs(prev => ({ ...prev, [serial.id]: data || [] }))
    }
  }

  const handleSerialRowClick = (serial) => {
    const isExpanding = expandedSerial !== serial.id
    setExpandedSerial(isExpanding ? serial.id : null)
    if (isExpanding) loadSerialSLEs(serial)
  }

  // ── Tab bar ───────────────────────────────────────────────
  const tabStyle = (active) => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: active ? 'var(--teal)' : 'var(--surface2)',
    color:      active ? '#fff'        : 'var(--text-dim)',
    transition: 'all .15s',
  })

  return (
    <div>
      <PageHeader title="Batch & Serial Tracking" />

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard label="Active Batches"  value={activeBatches}  sub="total active"  color="green" />
        <KPICard label="Expiring Soon"   value={expiringSoon}   sub="within 30 days" color="yellow" />
        <KPICard label="In-Stock Serials" value={activeSerials} sub="available"      color="teal"  />
        <KPICard label="Issued Serials"  value={issuedSerials}  sub="currently out"  color="blue"  />
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabStyle(tab === 'batches')} onClick={() => setTab('batches')}>
          <span className="material-icons" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>inventory_2</span>
          Batches
        </button>
        <button style={tabStyle(tab === 'serials')} onClick={() => setTab('serials')}>
          <span className="material-icons" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>qr_code_2</span>
          Serials
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* BATCHES TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {tab === 'batches' && (
        <>
          {/* Filter bar */}
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-control"
                placeholder="Search batch no or item…"
                style={{ maxWidth: 220 }}
                value={bSearch}
                onChange={e => setBSearch(e.target.value)}
              />
              <select className="form-control" style={{ width: 160 }} value={bStatus} onChange={e => setBStatus(e.target.value)}>
                {['All', 'Active', 'Expired', 'Exhausted', 'Quarantine'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select className="form-control" style={{ width: 180 }} value={bWarehouse} onChange={e => setBWarehouse(e.target.value)}>
                {batchWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              {(bSearch || bStatus !== 'All' || bWarehouse !== 'All') && (
                <button className="btn btn-secondary btn-sm" onClick={() => { setBSearch(''); setBStatus('All'); setBWarehouse('All') }}>
                  <span className="material-icons">clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Batches table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Batch No</th>
                    <th>Item</th>
                    <th>Warehouse</th>
                    <th>Supplier / Lot</th>
                    <th>Mfg Date</th>
                    <th>Expiry Date</th>
                    <th>Qty Available</th>
                    <th>Received / Consumed</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr><td colSpan="10"><EmptyState icon="inventory_2" message="No batches found" /></td></tr>
                  ) : filteredBatches.map(b => {
                    const expColor = expiryColor(b.expiry_date)
                    return (
                      <tr key={b.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12 }}>
                            {b.batch_no}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{b.item_name}</td>
                        <td style={{ fontSize: 12 }}>{b.warehouses?.name || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {b.supplier ? <span>{b.supplier}{b.supplier_lot ? <span style={{ color: 'var(--text-dim)' }}> / {b.supplier_lot}</span> : null}</span> : '—'}
                        </td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{b.manufacturing_date || '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: expColor, fontWeight: expColor !== 'var(--text)' ? 700 : 400 }}>
                          {b.expiry_date || '—'}
                        </td>
                        <td className="td-mono" style={{ color: b.qty_available > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                          {Number(b.qty_available).toFixed(2)}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--text-dim)' }}>{Number(b.qty_received).toFixed(2)}</span>
                          {' / '}
                          <span style={{ color: 'var(--red)' }}>{Number(b.qty_consumed).toFixed(2)}</span>
                        </td>
                        <td><span className={`badge ${STATUS_BADGE[b.status] || 'badge-gray'}`}>{b.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setBatchModal(b)}
                              title="View details">
                              <span className="material-icons" style={{ fontSize: 14 }}>visibility</span>
                            </button>
                            {canEdit && b.status === 'Active' && (
                              <>
                                <button className="btn btn-sm" style={{ background: 'var(--yellow)', color: '#000', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                                  onClick={() => setBatchModal({ ...b, _action: 'quarantine' })}
                                  title="Mark Quarantine">
                                  Quarantine
                                </button>
                                <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                                  onClick={() => setBatchModal({ ...b, _action: 'expired' })}
                                  title="Mark Expired">
                                  Expired
                                </button>
                              </>
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
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* SERIALS TAB */}
      {/* ═══════════════════════════════════════════════════ */}
      {tab === 'serials' && (
        <>
          {/* Filter bar */}
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-control"
                placeholder="Search serial no or item…"
                style={{ maxWidth: 220 }}
                value={sSearch}
                onChange={e => setSSearch(e.target.value)}
              />
              <select className="form-control" style={{ width: 160 }} value={sStatus} onChange={e => setSStatus(e.target.value)}>
                {['All', 'In Stock', 'Issued', 'In Repair', 'Scrapped', 'Returned', 'Transferred'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select className="form-control" style={{ width: 180 }} value={sWarehouse} onChange={e => setSWarehouse(e.target.value)}>
                {serialWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              {(sSearch || sStatus !== 'All' || sWarehouse !== 'All') && (
                <button className="btn btn-secondary btn-sm" onClick={() => { setSSearch(''); setSStatus('All'); setSWarehouse('All') }}>
                  <span className="material-icons">clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Serials table */}
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Serial No</th>
                    <th>Item</th>
                    <th>Warehouse</th>
                    <th>Status</th>
                    <th>Issued To / Dept</th>
                    <th>Issued Date</th>
                    <th>Warranty Expiry</th>
                    <th>Asset Code</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" style={{ textAlign: 'center', padding: 32 }}>Loading…</td></tr>
                  ) : filteredSerials.length === 0 ? (
                    <tr><td colSpan="9"><EmptyState icon="qr_code_2" message="No serials found" /></td></tr>
                  ) : filteredSerials.map(s => {
                    const wColor = expiryColor(s.warranty_expiry)
                    const isExpanded = expandedSerial === s.id
                    const sles = serialSLEs[s.id]
                    return (
                      <>
                        <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => handleSerialRowClick(s)}>
                          <td>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 12 }}>
                              {s.serial_no}
                            </span>
                            <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 4, color: 'var(--text-dim)' }}>
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{s.item_name}</td>
                          <td style={{ fontSize: 12 }}>{s.warehouses?.name || '—'}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[s.status] || 'badge-gray'}`}>{s.status}</span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {s.issued_to
                              ? <span>{s.issued_to}{s.issued_to_department ? <span style={{ color: 'var(--text-dim)' }}> / {s.issued_to_department}</span> : null}</span>
                              : '—'
                            }
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{s.issued_date || '—'}</td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: wColor, fontWeight: wColor !== 'var(--text)' ? 700 : 400 }}>
                            {s.warranty_expiry || '—'}
                          </td>
                          <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{s.asset_code || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                              <button className="btn btn-secondary btn-sm" onClick={() => setSerialModal(s)}
                                title="View history & update">
                                <span className="material-icons" style={{ fontSize: 14 }}>history</span>
                              </button>
                              {canEdit && (
                                <button className="btn btn-secondary btn-sm" onClick={() => setSerialModal({ ...s, _updateMode: true })}
                                  title="Update status">
                                  <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${s.id}-sle`}>
                            <td colSpan="9" style={{ padding: 0 }}>
                              <div style={{ margin: '0 8px 8px 8px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="material-icons" style={{ fontSize: 13 }}>receipt_long</span>
                                  Movement History — Serial {s.serial_no}
                                </div>
                                {sles === undefined ? (
                                  <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>
                                ) : sles.length === 0 ? (
                                  <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>No movement history found.</div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: 'var(--surface3, var(--surface2))' }}>
                                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Date</th>
                                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Voucher Type</th>
                                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Reference</th>
                                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Qty</th>
                                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11 }}>Warehouse</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sles.map(e => (
                                        <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                                          <td style={{ padding: '5px 12px', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>
                                            {(e.posting_datetime || '').slice(0, 10)}
                                          </td>
                                          <td style={{ padding: '5px 12px' }}>
                                            <span className={`badge ${e.voucher_type === 'GRN' || e.voucher_type === 'PurchaseReceipt' || e.voucher_type === 'StockIn' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: 10 }}>
                                              {e.voucher_type || '—'}
                                            </span>
                                          </td>
                                          <td style={{ padding: '5px 12px', fontFamily: 'var(--mono)', color: 'var(--gold)', fontSize: 11 }}>
                                            {e.voucher_no || '—'}
                                          </td>
                                          <td style={{ padding: '5px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700,
                                            color: e.actual_qty >= 0 ? 'var(--green)' : 'var(--red)' }}>
                                            {e.actual_qty >= 0 ? '+' : ''}{Number(e.actual_qty).toFixed(2)}
                                          </td>
                                          <td style={{ padding: '5px 12px', fontSize: 11 }}>
                                            {e.warehouses?.name || '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Batch Modal ───────────────────────────────────── */}
      {batchModal && (
        <BatchModal
          batch={batchModal}
          canEdit={canEdit}
          onClose={() => setBatchModal(null)}
          onUpdate={handleBatchStatusUpdate}
        />
      )}

      {/* ── Serial Modal ──────────────────────────────────── */}
      {serialModal && (
        <SerialModal
          serial={serialModal}
          canEdit={canEdit}
          onClose={() => setSerialModal(null)}
          onUpdate={handleSerialUpdate}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Batch Modal
// ═══════════════════════════════════════════════════════════
function BatchModal({ batch, canEdit, onClose, onUpdate }) {
  const [reason, setReason]   = useState(batch.notes || '')
  const [saving, setSaving]   = useState(false)
  // Determine action from _action flag
  const action = batch._action || null  // 'quarantine' | 'expired' | null (view only)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const newStatus = action === 'quarantine' ? 'Quarantine' : 'Expired'
    const ok = await onUpdate(batch, newStatus, reason)
    setSaving(false)
    if (ok) onClose()
  }

  const expColor = expiryColor(batch.expiry_date)
  const daysLeft = daysDiff(batch.expiry_date)
  const expLabel = daysLeft === null ? null
    : daysLeft < 0   ? `Expired ${Math.abs(daysLeft)} days ago`
    : daysLeft === 0 ? 'Expires today!'
    : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`

  return (
    <ModalDialog open onClose={onClose} title={action ? `Mark Batch as ${action === 'quarantine' ? 'Quarantine' : 'Expired'}` : 'Batch Details'} size="lg">
      {/* Batch info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <InfoRow label="Batch No"     value={<span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{batch.batch_no}</span>} />
        <InfoRow label="Item"         value={batch.item_name} />
        <InfoRow label="Warehouse"    value={batch.warehouses?.name || '—'} />
        <InfoRow label="Supplier"     value={batch.supplier || '—'} />
        <InfoRow label="Supplier Lot" value={batch.supplier_lot || '—'} />
        <InfoRow label="Status"       value={<span className={`badge ${STATUS_BADGE[batch.status] || 'badge-gray'}`}>{batch.status}</span>} />
        <InfoRow label="Mfg Date"     value={batch.manufacturing_date || '—'} />
        <InfoRow label="Expiry Date"  value={
          <span style={{ color: expColor, fontWeight: expColor !== 'var(--text)' ? 700 : 400 }}>
            {batch.expiry_date || '—'}
            {expLabel && <span style={{ marginLeft: 6, fontSize: 11, opacity: .8 }}>({expLabel})</span>}
          </span>
        } />
      </div>

      {/* Qty breakdown */}
      <div style={{ display: 'flex', gap: 16, background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12 }}>Received: <strong style={{ color: 'var(--teal)' }}>{Number(batch.qty_received).toFixed(2)}</strong></span>
        <span style={{ fontSize: 12 }}>Available: <strong style={{ color: 'var(--green)' }}>{Number(batch.qty_available).toFixed(2)}</strong></span>
        <span style={{ fontSize: 12 }}>Consumed: <strong style={{ color: 'var(--red)' }}>{Number(batch.qty_consumed).toFixed(2)}</strong></span>
      </div>

      {/* GRN reference */}
      {batch.source_grn_number && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Source GRN: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{batch.source_grn_number}</span>
        </div>
      )}

      {/* Action form */}
      {action && canEdit ? (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Reason / Notes {action === 'quarantine' ? '(required for quarantine)' : ''}</label>
            <textarea className="form-control" rows="3" value={reason}
              onChange={e => setReason(e.target.value)}
              required={action === 'quarantine'}
              placeholder={action === 'quarantine' ? 'State reason for quarantine…' : 'Optional notes…'}
            />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}
              style={{ background: action === 'expired' ? 'var(--red)' : 'var(--yellow)', color: action === 'expired' ? '#fff' : '#000' }}>
              {saving ? 'Saving…' : `Confirm — Mark as ${action === 'quarantine' ? 'Quarantine' : 'Expired'}`}
            </button>
          </ModalActions>
        </form>
      ) : (
        <ModalActions>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </ModalActions>
      )}
    </ModalDialog>
  )
}

// ═══════════════════════════════════════════════════════════
// Serial Modal — history timeline + status update + repairs tab
// ═══════════════════════════════════════════════════════════
function SerialModal({ serial, canEdit, onClose, onUpdate }) {
  const [newStatus, setNewStatus] = useState(serial.status)
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [mode,      setMode]      = useState(serial._updateMode ? 'update' : 'view')

  const [detailTab, setDetailTab] = useState('info')  // 'info' | 'repairs'
  const [repairs, setRepairs]     = useState([])
  const [repairLoading, setRepairLoading] = useState(false)
  const [showRepairForm, setShowRepairForm] = useState(false)
  const [repairForm, setRepairForm] = useState({
    fault_description: '', repair_vendor: '', date_sent: new Date().toISOString().split('T')[0],
    date_returned: '', repair_cost: '', outcome: 'Repaired', technician_notes: ''
  })

  const loadRepairs = async () => {
    setRepairLoading(true)
    const { data } = await supabase
      .from('serial_repair_logs')
      .select('*')
      .eq('serial_no', serial.serial_no)
      .order('date_sent', { ascending: false })
    setRepairs(data || [])
    setRepairLoading(false)
  }
  useEffect(() => { if (detailTab === 'repairs') loadRepairs() }, [detailTab])

  const history = Array.isArray(serial.history) ? serial.history : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newStatus === serial.status) { toast.error('Select a different status'); return }
    setSaving(true)
    const ok = await onUpdate(serial, newStatus, notes)
    setSaving(false)
    if (ok) onClose()
  }

  const wColor  = expiryColor(serial.warranty_expiry)
  const wDays   = daysDiff(serial.warranty_expiry)
  const wLabel  = wDays === null ? null
    : wDays < 0   ? `Expired ${Math.abs(wDays)} days ago`
    : wDays === 0 ? 'Expires today!'
    : `${wDays} days remaining`

  return (
    <ModalDialog open onClose={onClose} title={`Serial: ${serial.serial_no}`} size="lg">
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[
          { id: 'info', label: 'Details', icon: 'info' },
          { id: 'repairs', label: 'Repairs', icon: 'build' },
        ].map(t => (
          <button key={t.id} onClick={() => setDetailTab(t.id)}
            style={{ padding: '7px 14px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${detailTab === t.id ? 'var(--gold)' : 'transparent'}`,
              color: detailTab === t.id ? 'var(--gold)' : 'var(--text-dim)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-icons" style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Info tab */}
      {detailTab === 'info' && (
        <>
          {/* Serial info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <InfoRow label="Serial No"    value={<span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>{serial.serial_no}</span>} />
            <InfoRow label="Item"         value={serial.item_name} />
            <InfoRow label="Status"       value={<span className={`badge ${STATUS_BADGE[serial.status] || 'badge-gray'}`}>{serial.status}</span>} />
            <InfoRow label="Warehouse"    value={serial.warehouses?.name || '—'} />
            <InfoRow label="Issued To"    value={serial.issued_to || '—'} />
            <InfoRow label="Department"   value={serial.issued_to_department || '—'} />
            <InfoRow label="Issued Date"  value={serial.issued_date || '—'} />
            <InfoRow label="Returned"     value={serial.returned_date || '—'} />
            <InfoRow label="Asset Code"   value={serial.asset_code || '—'} />
            <InfoRow label="Purchase Rate" value={serial.purchase_rate ? `$${Number(serial.purchase_rate).toFixed(2)}` : '—'} />
            <InfoRow label="Purchase Date" value={serial.purchase_date || '—'} />
            <InfoRow label="Warranty Expiry" value={
              <span style={{ color: wColor, fontWeight: wColor !== 'var(--text)' ? 700 : 400 }}>
                {serial.warranty_expiry || '—'}
                {wLabel && <span style={{ marginLeft: 6, fontSize: 11, opacity: .8 }}>({wLabel})</span>}
              </span>
            } />
          </div>

          {/* History timeline */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              History Timeline
            </div>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '8px 0' }}>No history entries yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, borderLeft: '3px solid var(--teal)' }}>
                    <span className="material-icons" style={{ fontSize: 16, color: 'var(--teal)', flexShrink: 0, marginTop: 1 }}>timeline</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{h.action}</div>
                      {(h.from_status || h.to_status) && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                          <span className={`badge ${STATUS_BADGE[h.from_status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{h.from_status}</span>
                          <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', margin: '0 4px' }}>arrow_forward</span>
                          <span className={`badge ${STATUS_BADGE[h.to_status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{h.to_status}</span>
                        </div>
                      )}
                      {h.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{h.notes}</div>}
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'var(--mono)' }}>
                        {h.date ? new Date(h.date).toLocaleString() : ''}
                        {h.user ? ` — ${h.user}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Update form */}
          {canEdit && mode === 'update' ? (
            <form onSubmit={handleSubmit}>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
                  Add Status Update
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>New Status *</label>
                    <select className="form-control" required value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                      {['In Stock', 'Issued', 'In Repair', 'Scrapped', 'Returned', 'Transferred'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes about this status change…" />
                </div>
              </div>
              <ModalActions>
                <button type="button" className="btn btn-secondary" onClick={() => setMode('view')}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Update Status'}
                </button>
              </ModalActions>
            </form>
          ) : (
            <ModalActions>
              {canEdit && (
                <button type="button" className="btn btn-primary" onClick={() => setMode('update')}>
                  <span className="material-icons" style={{ fontSize: 15 }}>edit</span> Update Status
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            </ModalActions>
          )}
        </>
      )}

      {/* Repairs tab */}
      {detailTab === 'repairs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {repairs.length} repair event{repairs.length !== 1 ? 's' : ''} ·
              Total cost: <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>
                ${repairs.reduce((s,r) => s + Number(r.repair_cost||0), 0).toFixed(2)}
              </span>
            </div>
            {canEdit && (
              <button className="btn btn-secondary" style={{ fontSize: 12 }}
                onClick={() => setShowRepairForm(f => !f)}>
                <span className="material-icons" style={{ fontSize: 14 }}>add</span> Log Repair
              </button>
            )}
          </div>

          {/* Log Repair Form */}
          {showRepairForm && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Fault Description *</label>
                  <textarea className="form-control" rows={2} value={repairForm.fault_description}
                    onChange={e => setRepairForm(f => ({ ...f, fault_description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Repair Vendor</label>
                  <input className="form-control" value={repairForm.repair_vendor}
                    onChange={e => setRepairForm(f => ({ ...f, repair_vendor: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Outcome</label>
                  <select className="form-control" value={repairForm.outcome}
                    onChange={e => setRepairForm(f => ({ ...f, outcome: e.target.value }))}>
                    {['Repaired','Scrapped','Under Warranty','Pending','Unrepairable'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date Sent</label>
                  <input type="date" className="form-control" value={repairForm.date_sent}
                    onChange={e => setRepairForm(f => ({ ...f, date_sent: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Date Returned</label>
                  <input type="date" className="form-control" value={repairForm.date_returned}
                    onChange={e => setRepairForm(f => ({ ...f, date_returned: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Repair Cost ($)</label>
                  <input type="number" className="form-control" value={repairForm.repair_cost}
                    onChange={e => setRepairForm(f => ({ ...f, repair_cost: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Technician Notes</label>
                  <textarea className="form-control" rows={2} value={repairForm.technician_notes}
                    onChange={e => setRepairForm(f => ({ ...f, technician_notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowRepairForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={async () => {
                  if (!repairForm.fault_description.trim()) { toast.error('Fault description required'); return }
                  await supabase.from('serial_repair_logs').insert({
                    id: crypto.randomUUID(),
                    serial_no: serial.serial_no,
                    item_id: serial.item_id,
                    item_name: serial.item_name,
                    ...repairForm,
                    repair_cost: parseFloat(repairForm.repair_cost) || 0,
                    created_by: 'user',
                  })
                  // If outcome is Scrapped, also update serial status
                  if (repairForm.outcome === 'Scrapped') {
                    await onUpdate(serial, 'Scrapped', `Scrapped after repair attempt: ${repairForm.fault_description}`)
                  }
                  toast.success('Repair logged')
                  setShowRepairForm(false)
                  setRepairForm({ fault_description:'', repair_vendor:'', date_sent: new Date().toISOString().split('T')[0], date_returned:'', repair_cost:'', outcome:'Repaired', technician_notes:'' })
                  loadRepairs()
                }}>Save Repair</button>
              </div>
            </div>
          )}

          {/* Repair log list */}
          {repairLoading ? <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>
          : repairs.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '12px 0' }}>No repair records yet.</div>
          : repairs.map(r => (
            <div key={r.id} style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 8,
              borderLeft: `3px solid ${r.outcome === 'Repaired' ? 'var(--green)' : r.outcome === 'Scrapped' ? 'var(--red)' : 'var(--yellow)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{r.fault_description}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--gold)' }}>${Number(r.repair_cost).toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 16 }}>
                <span>{r.date_sent}{r.date_returned ? ` → ${r.date_returned}` : ' (ongoing)'}</span>
                {r.repair_vendor && <span>Vendor: {r.repair_vendor}</span>}
                <span style={{ fontWeight: 700, color: r.outcome === 'Repaired' ? 'var(--green)' : r.outcome === 'Scrapped' ? 'var(--red)' : 'var(--yellow)' }}>{r.outcome}</span>
              </div>
              {r.technician_notes && <div style={{ fontSize: 11, color: 'var(--text-mid)', marginTop: 4 }}>{r.technician_notes}</div>}
            </div>
          ))}

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          </ModalActions>
        </div>
      )}
    </ModalDialog>
  )
}

// ── Helper: small label+value pair ─────────────────────────
function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)', letterSpacing: .5, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
