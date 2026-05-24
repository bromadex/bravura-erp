// src/pages/Procurement/BlanketOrders.jsx
// Blanket Orders / Framework Contracts — Procurement module
// Mining-site ERP — raise POs against pre-agreed supplier terms

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProcurement } from '../../contexts/ProcurementContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'
import { exportXLSX, fmtNum, fmtDate, dateTag } from '../../engine/reportingEngine'
import { generateTxnCode } from '../../utils/txnCode'

const today = new Date().toISOString().split('T')[0]

function emptyForm() {
  return {
    supplier_id: '', supplier_name: '',
    start_date: today, end_date: '',
    contract_amount: '', currency: 'ZMW',
    item_id: '', item_name: '', unit: '', unit_rate: '', contracted_qty: '',
    department: '', description: '', terms: '', notes: '',
    status: 'Draft',
  }
}

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const styles = {
    Draft:     { color: 'var(--text-dim)',  background: 'var(--surface2)',    border: '1px solid var(--border)' },
    Active:    { color: 'var(--green)',     background: 'color-mix(in srgb, var(--green) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)' },
    Exhausted: { color: 'var(--red)',       background: 'color-mix(in srgb, var(--red) 12%, transparent)',   border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)' },
    Expired:   { color: 'var(--yellow)',    background: 'color-mix(in srgb, var(--yellow) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--yellow) 30%, transparent)' },
    Cancelled: { color: 'var(--text-dim)',  background: 'var(--surface)',     border: '1px solid var(--border)' },
  }
  const s = styles[status] || styles.Draft
  return (
    <span style={{
      ...s,
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ─── Spend progress bar ───────────────────────────────────────────────────────
function SpendBar({ pct, status }) {
  const clampedPct = Math.min(pct, 100)
  const barColor =
    pct >= 100 ? 'var(--red)'
    : pct >= 80 ? 'var(--yellow)'
    : 'var(--green)'

  return (
    <div style={{ minWidth: 90 }}>
      <div style={{
        height: 6,
        borderRadius: 4,
        background: 'var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${clampedPct}%`,
          background: barColor,
          borderRadius: 4,
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ fontSize: 10, color: barColor, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(1)}% used
      </div>
    </div>
  )
}

// ─── Section heading inside modals ───────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--text-dim)',
      borderBottom: '1px solid var(--border)',
      paddingBottom: 6,
      marginBottom: 14,
      marginTop: 20,
    }}>
      {children}
    </div>
  )
}

// ─── Form row helper ─────────────────────────────────────────────────────────
function FormRow({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 14,
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

function FormField({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Info label/value pair ────────────────────────────────────────────────────
function InfoPair({ label, value, mono, gold }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 14,
        color: gold ? 'var(--gold)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : undefined,
        fontWeight: mono ? 600 : 400,
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function BlanketOrders() {
  const navigate = useNavigate()
  const { suppliers } = useProcurement()

  const [orders,       setOrders]      = useState([])
  const [loading,      setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchTerm,   setSearchTerm]  = useState('')
  const [viewBO,       setViewBO]      = useState(null)
  const [createModal,  setCreateModal] = useState(false)
  const [editBO,       setEditBO]      = useState(null)
  const [saving,       setSaving]      = useState(false)
  const [form,         setForm]        = useState(emptyForm())

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('blanket_orders')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { toast.error('Failed to load blanket orders'); console.error(error) }
    else setOrders(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Enriched orders ────────────────────────────────────────────────────────
  const enriched = useMemo(() => orders.map(o => {
    const todayStr = new Date().toISOString().split('T')[0]
    const isExpired   = o.end_date < todayStr && o.status === 'Active'
    const isExhausted = o.status === 'Active' && Number(o.contract_amount) > 0 && Number(o.consumed_amount) >= Number(o.contract_amount)
    const effectiveStatus = isExhausted ? 'Exhausted' : isExpired ? 'Expired' : o.status
    const remaining = Number(o.contract_amount) - Number(o.consumed_amount)
    const pctUsed   = Number(o.contract_amount) > 0
      ? (Number(o.consumed_amount) / Number(o.contract_amount)) * 100
      : 0
    return { ...o, effectiveStatus, remaining, pctUsed }
  }), [orders])

  // ── Filtered orders ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return enriched.filter(bo => {
      if (filterStatus !== 'all' && bo.effectiveStatus !== filterStatus) return false
      if (term) {
        const haystack = [bo.bo_number, bo.supplier_name, bo.description, bo.item_name]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [enriched, filterStatus, searchTerm])

  // ── KPI derivations ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const in30d    = new Date(); in30d.setDate(in30d.getDate() + 30)
    const in30dStr = in30d.toISOString().split('T')[0]

    const active        = enriched.filter(o => o.effectiveStatus === 'Active')
    const totalAvail    = active.reduce((s, o) => s + Math.max(0, o.remaining), 0)
    const expiring30    = active.filter(o => o.end_date >= todayStr && o.end_date <= in30dStr).length
    const expiredExhausted = enriched.filter(o => ['Expired', 'Exhausted'].includes(o.effectiveStatus)).length

    return { activeCount: active.length, totalAvail, expiring30, expiredExhausted }
  }, [enriched])

  // ── Open create modal ──────────────────────────────────────────────────────
  const openCreate = () => {
    setEditBO(null)
    setForm(emptyForm())
    setCreateModal(true)
  }

  // ── Open edit modal ────────────────────────────────────────────────────────
  const openEdit = (bo) => {
    setEditBO(bo)
    setForm({
      supplier_id:    bo.supplier_id    || '',
      supplier_name:  bo.supplier_name  || '',
      start_date:     bo.start_date     || today,
      end_date:       bo.end_date       || '',
      contract_amount: String(bo.contract_amount || ''),
      currency:       bo.currency       || 'ZMW',
      item_id:        bo.item_id        || '',
      item_name:      bo.item_name      || '',
      unit:           bo.unit           || '',
      unit_rate:      bo.unit_rate != null ? String(bo.unit_rate) : '',
      contracted_qty: bo.contracted_qty != null ? String(bo.contracted_qty) : '',
      department:     bo.department     || '',
      description:    bo.description    || '',
      terms:          bo.terms          || '',
      notes:          bo.notes          || '',
      status:         bo.status         || 'Draft',
    })
    setCreateModal(true)
  }

  // ── Handle create / update ─────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.supplier_id) return toast.error('Select a supplier')
    if (!form.end_date)    return toast.error('End date required')
    if (!form.contract_amount || Number(form.contract_amount) <= 0) return toast.error('Contract amount must be > 0')
    setSaving(true)
    try {
      if (editBO) {
        // Update existing
        const { error } = await supabase.from('blanket_orders').update({
          supplier_id:    form.supplier_id,
          supplier_name:  suppliers.find(s => s.id === form.supplier_id)?.name || form.supplier_name,
          start_date:     form.start_date || today,
          end_date:       form.end_date,
          contract_amount: Number(form.contract_amount),
          item_name:      form.item_name || null,
          unit:           form.unit || null,
          unit_rate:      form.unit_rate ? Number(form.unit_rate) : null,
          contracted_qty: form.contracted_qty ? Number(form.contracted_qty) : null,
          department:     form.department || null,
          description:    form.description || null,
          terms:          form.terms || null,
          notes:          form.notes || null,
          status:         form.status || 'Draft',
          currency:       form.currency || 'ZMW',
          docstatus:      form.status === 'Active' ? 1 : form.status === 'Cancelled' ? 2 : 0,
          updated_at:     new Date().toISOString(),
        }).eq('id', editBO.id)
        if (error) throw error
        toast.success(`Blanket order ${editBO.bo_number} updated`)
      } else {
        // Insert new
        const boNumber = await generateTxnCode('BO')
        const supplier = suppliers.find(s => s.id === form.supplier_id)
        const id = crypto.randomUUID()
        const { error } = await supabase.from('blanket_orders').insert([{
          id,
          bo_number:       boNumber,
          supplier_id:     form.supplier_id,
          supplier_name:   supplier?.name || form.supplier_name,
          start_date:      form.start_date || today,
          end_date:        form.end_date,
          contract_amount: Number(form.contract_amount),
          consumed_amount: 0,
          item_name:       form.item_name || null,
          unit:            form.unit || null,
          unit_rate:       form.unit_rate ? Number(form.unit_rate) : null,
          contracted_qty:  form.contracted_qty ? Number(form.contracted_qty) : null,
          consumed_qty:    0,
          department:      form.department || null,
          description:     form.description || null,
          terms:           form.terms || null,
          notes:           form.notes || null,
          status:          form.status || 'Draft',
          currency:        form.currency || 'ZMW',
          docstatus:       form.status === 'Active' ? 1 : 0,
          created_by:      '',
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        }])
        if (error) throw error
        toast.success(`Blanket order ${boNumber} created`)
      }
      setCreateModal(false)
      setEditBO(null)
      setForm(emptyForm())
      loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Activate ───────────────────────────────────────────────────────────────
  const handleActivate = async (id) => {
    const { error } = await supabase.from('blanket_orders').update({
      status:     'Active',
      docstatus:  1,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Blanket order activated')
    loadData()
    // Also refresh viewBO if open
    if (viewBO && viewBO.id === id) {
      setViewBO(prev => prev ? { ...prev, status: 'Active', effectiveStatus: 'Active' } : null)
    }
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = async (id, reason) => {
    const confirmed = window.confirm(
      reason
        ? `Cancel this blanket order?\nReason: ${reason}`
        : 'Cancel this blanket order?'
    )
    if (!confirmed) return
    const bo = orders.find(o => o.id === id)
    const updatedNotes = [bo?.notes, reason ? `Cancelled: ${reason}` : 'Cancelled by user']
      .filter(Boolean).join('\n')
    const { error } = await supabase.from('blanket_orders').update({
      status:     'Cancelled',
      docstatus:  2,
      notes:      updatedNotes,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Blanket order cancelled')
    loadData()
    if (viewBO && viewBO.id === id) setViewBO(null)
  }

  // ── Raise PO ───────────────────────────────────────────────────────────────
  const handleRaisePO = (bo) => {
    navigate(
      `/module/procurement/purchase-orders?blanket_order_id=${bo.id}&supplier_id=${bo.supplier_id}&bo_number=${bo.bo_number}`
    )
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(
      filtered.map(bo => ({
        'BO Number':       bo.bo_number,
        'Supplier':        bo.supplier_name,
        'Start Date':      bo.start_date,
        'End Date':        bo.end_date,
        'Currency':        bo.currency,
        'Contract Amount': bo.contract_amount,
        'Consumed':        bo.consumed_amount,
        'Remaining':       bo.remaining,
        '% Used':          bo.pctUsed.toFixed(2),
        'Status':          bo.effectiveStatus,
        'Department':      bo.department || '',
        'Item':            bo.item_name || '',
        'Description':     bo.description || '',
      })),
      `BlanketOrders_${dateTag()}`
    )
  }

  // ── Supplier change in form ────────────────────────────────────────────────
  const handleSupplierChange = (id) => {
    const s = suppliers.find(x => x.id === id)
    sf('supplier_id', id)
    sf('supplier_name', s?.name || '')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Page Header */}
      <PageHeader
        title="Blanket Orders"
        subtitle="Framework contracts with suppliers — raise POs against pre-agreed terms"
      >
        <button
          className="btn btn-ghost"
          disabled={!filtered.length}
          onClick={handleExport}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span className="material-icons md-18">download</span>
          Export
        </button>
        <button
          className="btn btn-primary"
          onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span className="material-icons md-18">add</span>
          New Blanket Order
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <KPICard
          label="Active Contracts"
          value={kpis.activeCount}
          icon="handshake"
          color="green"
          onClick={() => setFilterStatus('Active')}
        />
        <KPICard
          label="Total Available Spend"
          value={`K ${fmtNum(kpis.totalAvail)}`}
          icon="account_balance_wallet"
          color=""
          sub="Across active contracts"
        />
        <KPICard
          label="Expiring in 30 Days"
          value={kpis.expiring30}
          icon="event_busy"
          color={kpis.expiring30 > 0 ? 'yellow' : ''}
          alert={kpis.expiring30 > 0}
          onClick={() => setFilterStatus('Active')}
        />
        <KPICard
          label="Expired / Exhausted"
          value={kpis.expiredExhausted}
          icon="warning"
          color={kpis.expiredExhausted > 0 ? 'red' : ''}
          onClick={() => setFilterStatus('Expired')}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <span className="material-icons md-18" style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', pointerEvents: 'none',
          }}>search</span>
          <input
            type="text"
            className="input"
            placeholder="Search BO number, supplier, item, description…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select
          className="input"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Active">Active</option>
          <option value="Expired">Expired</option>
          <option value="Exhausted">Exhausted</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        {(filterStatus !== 'all' || searchTerm) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatus('all'); setSearchTerm('') }}>
            <span className="material-icons md-16">clear</span>
            Clear
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>hourglass_top</span>
            Loading blanket orders…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="article"
            title="No blanket orders found"
            message={searchTerm || filterStatus !== 'all' ? 'Try adjusting your filters.' : 'Create your first framework contract to get started.'}
            action={!searchTerm && filterStatus === 'all' ? (
              <button className="btn btn-primary" onClick={openCreate}>
                <span className="material-icons md-18">add</span> New Blanket Order
              </button>
            ) : null}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>BO Number</th>
                  <th>Supplier</th>
                  <th>Period</th>
                  <th>Currency</th>
                  <th style={{ textAlign: 'right' }}>Contract Amt</th>
                  <th style={{ textAlign: 'right' }}>Consumed</th>
                  <th style={{ textAlign: 'right' }}>Remaining</th>
                  <th>% Used</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(bo => {
                  const remainingColor = bo.remaining <= 0
                    ? 'var(--red)'
                    : bo.remaining < Number(bo.contract_amount) * 0.2
                    ? 'var(--yellow)'
                    : 'var(--green)'

                  return (
                    <tr key={bo.id}>
                      <td>
                        <span style={{
                          color: 'var(--gold)',
                          fontFamily: 'var(--mono)',
                          fontWeight: 600,
                          fontSize: 13,
                        }}>
                          {bo.bo_number}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{bo.supplier_name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {fmtDate(bo.start_date)} → {fmtDate(bo.end_date)}
                      </td>
                      <td>{bo.currency}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                        K {fmtNum(bo.contract_amount)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                        {fmtNum(bo.consumed_amount)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: remainingColor }}>
                        {fmtNum(bo.remaining)}
                      </td>
                      <td>
                        <SpendBar pct={bo.pctUsed} status={bo.effectiveStatus} />
                      </td>
                      <td>
                        <StatusBadge status={bo.effectiveStatus} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View details"
                            onClick={() => setViewBO(bo)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <span className="material-icons md-16">visibility</span>
                          </button>

                          {bo.effectiveStatus === 'Active' && (
                            <button
                              className="btn btn-sm"
                              style={{ background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)', border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)', display: 'flex', alignItems: 'center', gap: 3 }}
                              title="Raise Purchase Order"
                              onClick={() => handleRaisePO(bo)}
                            >
                              <span className="material-icons md-16">add_shopping_cart</span>
                              Raise PO
                            </button>
                          )}

                          {bo.status === 'Draft' && (
                            <button
                              className="btn btn-sm"
                              style={{ background: 'color-mix(in srgb, var(--green) 15%, transparent)', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', display: 'flex', alignItems: 'center', gap: 3 }}
                              title="Activate contract"
                              onClick={() => handleActivate(bo.id)}
                            >
                              <span className="material-icons md-16">check_circle</span>
                              Activate
                            </button>
                          )}

                          {['Draft', 'Active'].includes(bo.status) && (
                            <button
                              className="btn btn-sm"
                              style={{ background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', display: 'flex', alignItems: 'center', gap: 3 }}
                              title="Cancel contract"
                              onClick={() => handleCancel(bo.id)}
                            >
                              <span className="material-icons md-16">cancel</span>
                              Cancel
                            </button>
                          )}

                          {bo.status === 'Draft' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Edit"
                              onClick={() => openEdit(bo)}
                              style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                            >
                              <span className="material-icons md-16">edit</span>
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
        )}
      </div>

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      <ModalDialog
        open={createModal}
        onClose={() => { setCreateModal(false); setEditBO(null); setForm(emptyForm()) }}
        title={editBO ? `Edit · ${editBO.bo_number}` : 'New Blanket Order'}
        size="lg"
      >
        <form onSubmit={handleCreate} style={{ padding: '6px 0' }}>

          {/* Section 1: Contract Details */}
          <SectionTitle>Contract Details</SectionTitle>

          <FormRow cols={2}>
            <FormField label="Supplier" required>
              <select
                className="input"
                value={form.supplier_id}
                onChange={e => handleSupplierChange(e.target.value)}
                required
              >
                <option value="">— Select supplier —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Currency">
              <select
                className="input"
                value={form.currency}
                onChange={e => sf('currency', e.target.value)}
              >
                <option value="ZMW">ZMW — Zambian Kwacha</option>
                <option value="USD">USD — US Dollar</option>
                <option value="ZAR">ZAR — South African Rand</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField label="Start Date">
              <input
                type="date"
                className="input"
                value={form.start_date}
                onChange={e => sf('start_date', e.target.value)}
              />
            </FormField>
            <FormField label="End Date" required>
              <input
                type="date"
                className="input"
                value={form.end_date}
                min={form.start_date || today}
                onChange={e => sf('end_date', e.target.value)}
                required
              />
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField label="Contract Amount" required>
              <input
                type="number"
                className="input"
                placeholder="0.00"
                min="0.01"
                step="0.01"
                value={form.contract_amount}
                onChange={e => sf('contract_amount', e.target.value)}
                required
              />
            </FormField>
            <FormField label="Status">
              <select
                className="input"
                value={form.status}
                onChange={e => sf('status', e.target.value)}
              >
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
              </select>
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField label="Department">
              <input
                type="text"
                className="input"
                placeholder="e.g. Mining Operations"
                value={form.department}
                onChange={e => sf('department', e.target.value)}
              />
            </FormField>
            <FormField label="Description">
              <input
                type="text"
                className="input"
                placeholder="Brief description of scope"
                value={form.description}
                onChange={e => sf('description', e.target.value)}
              />
            </FormField>
          </FormRow>

          {/* Section 2: Item (Optional) */}
          <SectionTitle>Item (Optional — for item-specific contracts)</SectionTitle>

          <FormRow cols={4}>
            <FormField label="Item Name">
              <input
                type="text"
                className="input"
                placeholder="e.g. Diesel Fuel"
                value={form.item_name}
                onChange={e => sf('item_name', e.target.value)}
              />
            </FormField>
            <FormField label="Unit">
              <input
                type="text"
                className="input"
                placeholder="e.g. Litre"
                value={form.unit}
                onChange={e => sf('unit', e.target.value)}
              />
            </FormField>
            <FormField label="Unit Rate">
              <input
                type="number"
                className="input"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={form.unit_rate}
                onChange={e => sf('unit_rate', e.target.value)}
              />
            </FormField>
            <FormField label="Contracted Qty">
              <input
                type="number"
                className="input"
                placeholder="0"
                min="0"
                step="any"
                value={form.contracted_qty}
                onChange={e => sf('contracted_qty', e.target.value)}
              />
            </FormField>
          </FormRow>

          {/* Section 3: Terms & Notes */}
          <SectionTitle>Terms &amp; Notes</SectionTitle>

          <FormRow cols={1}>
            <FormField label="Terms &amp; Conditions">
              <textarea
                className="input"
                rows={3}
                placeholder="Payment terms, delivery conditions, special clauses…"
                value={form.terms}
                onChange={e => sf('terms', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </FormField>
          </FormRow>

          <FormRow cols={1}>
            <FormField label="Internal Notes">
              <textarea
                className="input"
                rows={2}
                placeholder="Internal notes (not visible to supplier)"
                value={form.notes}
                onChange={e => sf('notes', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </FormField>
          </FormRow>

          <ModalActions>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setCreateModal(false); setEditBO(null); setForm(emptyForm()) }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {saving ? (
                <>
                  <span className="material-icons md-18" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
                  Saving…
                </>
              ) : (
                <>
                  <span className="material-icons md-18">save</span>
                  {editBO ? 'Save Changes' : 'Create Blanket Order'}
                </>
              )}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>

      {/* ── View Detail Modal ─────────────────────────────────────────────── */}
      {viewBO && (
        <ModalDialog
          open={!!viewBO}
          onClose={() => setViewBO(null)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700 }}>
                {viewBO.bo_number}
              </span>
              <StatusBadge status={viewBO.effectiveStatus} />
            </div>
          }
          size="lg"
        >
          <div style={{ padding: '4px 0 8px' }}>

            {/* Info grid */}
            <SectionTitle>Contract Details</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
              <InfoPair label="Supplier"   value={viewBO.supplier_name} />
              <InfoPair label="Department" value={viewBO.department} />
              <InfoPair label="Currency"   value={viewBO.currency} />
              <InfoPair label="Period"     value={`${fmtDate(viewBO.start_date)} → ${fmtDate(viewBO.end_date)}`} />
            </div>

            {viewBO.description && (
              <div style={{ marginBottom: 18, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>{viewBO.description}</div>
              </div>
            )}

            {/* Financial section */}
            <SectionTitle>Financial Summary</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 14 }}>
              <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Contract Amount</div>
                <div style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
                  K {fmtNum(viewBO.contract_amount)}
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Consumed</div>
                <div style={{ fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
                  K {fmtNum(viewBO.consumed_amount)}
                </div>
              </div>
              <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Remaining</div>
                <div style={{
                  fontSize: 20, fontFamily: 'var(--mono)', fontWeight: 700,
                  color: viewBO.remaining <= 0 ? 'var(--red)' : viewBO.remaining < Number(viewBO.contract_amount) * 0.2 ? 'var(--yellow)' : 'var(--green)',
                }}>
                  K {fmtNum(viewBO.remaining)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
                Spend Utilisation
              </div>
              <div style={{ maxWidth: 420 }}>
                <SpendBar pct={viewBO.pctUsed} status={viewBO.effectiveStatus} />
              </div>
            </div>

            {/* Item details */}
            {viewBO.item_name && (
              <>
                <SectionTitle>Item Details</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 18 }}>
                  <InfoPair label="Item"          value={viewBO.item_name} />
                  <InfoPair label="Unit"          value={viewBO.unit} />
                  <InfoPair label="Unit Rate"     value={viewBO.unit_rate != null ? `K ${fmtNum(viewBO.unit_rate)}` : null} mono />
                  <InfoPair label="Contracted Qty" value={viewBO.contracted_qty != null ? fmtNum(viewBO.contracted_qty) : null} mono />
                </div>
                {viewBO.consumed_qty != null && viewBO.contracted_qty != null && Number(viewBO.contracted_qty) > 0 && (
                  <div style={{ marginBottom: 18, maxWidth: 320 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
                      Quantity Utilisation ({fmtNum(viewBO.consumed_qty)} / {fmtNum(viewBO.contracted_qty)} {viewBO.unit})
                    </div>
                    <SpendBar
                      pct={(Number(viewBO.consumed_qty) / Number(viewBO.contracted_qty)) * 100}
                      status={viewBO.effectiveStatus}
                    />
                  </div>
                )}
              </>
            )}

            {/* Terms */}
            {viewBO.terms && (
              <>
                <SectionTitle>Terms &amp; Conditions</SectionTitle>
                <div style={{
                  padding: '12px 14px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  marginBottom: 16,
                }}>
                  {viewBO.terms}
                </div>
              </>
            )}

            {/* Notes */}
            {viewBO.notes && (
              <>
                <SectionTitle>Notes</SectionTitle>
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  whiteSpace: 'pre-wrap',
                  marginBottom: 16,
                }}>
                  {viewBO.notes}
                </div>
              </>
            )}

            {/* Timestamps */}
            <div style={{ display: 'flex', gap: 24, marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              {viewBO.created_at && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Created: {fmtDate(viewBO.created_at)}
                </span>
              )}
              {viewBO.updated_at && viewBO.updated_at !== viewBO.created_at && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Updated: {fmtDate(viewBO.updated_at)}
                </span>
              )}
            </div>
          </div>

          <ModalActions>
            <button className="btn btn-ghost" onClick={() => setViewBO(null)}>
              Close
            </button>

            {viewBO.status === 'Draft' && (
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)' }}
                onClick={() => { handleActivate(viewBO.id); setViewBO(null) }}
              >
                <span className="material-icons md-16">check_circle</span>
                Activate
              </button>
            )}

            {['Draft', 'Active'].includes(viewBO.status) && (
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 35%, transparent)' }}
                onClick={() => handleCancel(viewBO.id)}
              >
                <span className="material-icons md-16">cancel</span>
                Cancel
              </button>
            )}

            {viewBO.effectiveStatus === 'Active' && (
              <button
                className="btn btn-primary"
                onClick={() => { setViewBO(null); handleRaisePO(viewBO) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span className="material-icons md-18">add_shopping_cart</span>
                Raise PO
              </button>
            )}
          </ModalActions>
        </ModalDialog>
      )}
    </div>
  )
}
