// src/pages/Procurement/PurchaseContracts.jsx
//
// Full CRUD page for purchase_contracts and purchase_contract_lines
// Supports: Rate Contract, Framework Agreement, Blanket Order, Fixed Price
// Features: KPI cards, expiry alerts, right-side drawer form, contract lines editor

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader, KPICard, EmptyState, StatusBadge } from '../../components/ui'
import { exportXLSX, fmtNum, dateTag } from '../../engine/reportingEngine'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]

const CONTRACT_TYPES = ['Rate Contract', 'Framework Agreement', 'Blanket Order', 'Fixed Price']
const STATUSES       = ['Draft', 'Active', 'Expired', 'Terminated', 'Renewed']
const CURRENCIES     = ['USD', 'ZAR', 'BWP']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysRemaining(endDate) {
  if (!endDate) return null
  const end = new Date(endDate)
  const now = new Date(today)
  return Math.floor((end - now) / (1000 * 60 * 60 * 24))
}

function effectiveStatus(contract) {
  const days = daysRemaining(contract.end_date)
  if (days !== null && days < 0 && contract.status === 'Active') return 'Expired'
  return contract.status
}

function DaysRemainingBadge({ endDate }) {
  const days = daysRemaining(endDate)
  if (days === null) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  if (days < 0)  return <span style={{ color: 'var(--red)', fontWeight: 600 }}>Expired</span>
  if (days <= 7) return <span style={{ color: 'var(--red)', fontWeight: 600 }}>{days}d</span>
  if (days <= 30) return <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{days}d</span>
  return <span style={{ color: 'var(--green)' }}>{days}d</span>
}

function ContractStatusBadge({ status }) {
  const palette = {
    Draft:      { color: 'var(--text-dim)',  bg: 'var(--surface2)',    border: 'var(--border)' },
    Active:     { color: 'var(--green)',     bg: 'color-mix(in srgb, var(--green) 12%, transparent)', border: 'color-mix(in srgb, var(--green) 30%, transparent)' },
    Expired:    { color: 'var(--red)',       bg: 'color-mix(in srgb, var(--red) 12%, transparent)',   border: 'color-mix(in srgb, var(--red) 30%, transparent)' },
    Terminated: { color: 'var(--text-dim)',  bg: 'var(--surface)',     border: 'var(--border)' },
    Renewed:    { color: 'var(--blue)',      bg: 'color-mix(in srgb, var(--blue) 12%, transparent)',  border: 'color-mix(in srgb, var(--blue) 30%, transparent)' },
  }
  const p = palette[status] || palette.Draft
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      color: p.color,
      background: p.bg,
      border: `1px solid ${p.border}`,
    }}>
      {status}
    </span>
  )
}

// ─── Section heading inside drawer ──────────────────────────────────────────
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

function FormRow({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  )
}

function FormField({ label, required, children, span }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Empty contract line ─────────────────────────────────────────────────────
function emptyLine(sortOrder = 0) {
  return {
    _key: crypto.randomUUID(),
    item_name: '', item_code: '', unit: '', contracted_rate: '', min_qty: '', max_qty: '', notes: '', sort_order: sortOrder,
  }
}

// ─── Empty contract form ─────────────────────────────────────────────────────
function emptyForm() {
  return {
    contract_no: '', title: '', contract_type: 'Rate Contract', status: 'Draft',
    supplier_id: '', supplier_name: '',
    start_date: today, end_date: '',
    currency: 'USD', contract_value: '', committed_value: '',
    payment_terms: '', delivery_terms: '',
    notice_period: '', renewal_alert_days: '30',
    notes: '',
  }
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PurchaseContracts() {
  const [contracts,   setContracts]   = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [totalCount,  setTotalCount]  = useState(0)

  // Filters
  const [search,       setSearch]       = useState('')
  const [filterType,   setFilterType]   = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editMode,   setEditMode]   = useState(false)   // false = view, true = edit/create
  const [activeId,   setActiveId]   = useState(null)    // contract id being viewed/edited
  const [saving,     setSaving]     = useState(false)

  // Form state
  const [form,  setForm]  = useState(emptyForm())
  const [lines, setLines] = useState([emptyLine(0)])

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Load contracts ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: cData, error: cErr }, { data: sData }] = await Promise.all([
      supabase.from('purchase_contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    if (cErr) toast.error('Failed to load contracts')
    setContracts(cData || [])
    setTotalCount((cData || []).length)
    setSuppliers(sData || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Load contract lines ────────────────────────────────────────────────────
  const loadLines = useCallback(async (contractId) => {
    const { data } = await supabase
      .from('purchase_contract_lines')
      .select('*')
      .eq('contract_id', contractId)
      .order('sort_order')
    return (data || []).map(l => ({ ...l, _key: l.id || crypto.randomUUID() }))
  }, [])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const todayStr = today
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    const in30Str = in30.toISOString().split('T')[0]

    const active    = contracts.filter(c => c.status === 'Active')
    const totalVal  = active.reduce((s, c) => s + Number(c.contract_value || 0), 0)
    const expiring  = active.filter(c => c.end_date && c.end_date >= todayStr && c.end_date <= in30Str)
    const expired   = contracts.filter(c => c.status === 'Expired')

    return { activeCount: active.length, totalVal, expiringCount: expiring.length, expiredCount: expired.length }
  }, [contracts])

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return contracts.filter(c => {
      if (filterType !== 'All' && c.contract_type !== filterType) return false
      if (filterStatus !== 'All') {
        const eff = effectiveStatus(c)
        if (eff !== filterStatus) return false
      }
      if (term) {
        const hay = [c.contract_no, c.title, c.supplier_name].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [contracts, filterType, filterStatus, search])

  // ── Expiry alert contracts ─────────────────────────────────────────────────
  const expiringContracts = useMemo(() => {
    const todayStr = today
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    const in30Str = in30.toISOString().split('T')[0]
    return contracts.filter(c =>
      c.status === 'Active' && c.end_date && c.end_date >= todayStr && c.end_date <= in30Str
    )
  }, [contracts])

  // ── Open new contract ──────────────────────────────────────────────────────
  const openNew = () => {
    const suggested = 'PC-' + String(totalCount + 1).padStart(4, '0')
    setForm({ ...emptyForm(), contract_no: suggested })
    setLines([emptyLine(0)])
    setActiveId(null)
    setEditMode(true)
    setDrawerOpen(true)
  }

  // ── Open view ─────────────────────────────────────────────────────────────
  const openView = async (contract) => {
    setActiveId(contract.id)
    setForm({
      contract_no:       contract.contract_no       || '',
      title:             contract.title             || '',
      contract_type:     contract.contract_type     || 'Rate Contract',
      status:            contract.status            || 'Draft',
      supplier_id:       contract.supplier_id       || '',
      supplier_name:     contract.supplier_name     || '',
      start_date:        contract.start_date        || today,
      end_date:          contract.end_date          || '',
      currency:          contract.currency          || 'USD',
      contract_value:    contract.contract_value    != null ? String(contract.contract_value) : '',
      committed_value:   contract.committed_value   != null ? String(contract.committed_value) : '',
      payment_terms:     contract.payment_terms     || '',
      delivery_terms:    contract.delivery_terms    || '',
      notice_period:     contract.notice_period     != null ? String(contract.notice_period) : '',
      renewal_alert_days: contract.renewal_alert_days != null ? String(contract.renewal_alert_days) : '30',
      notes:             contract.notes             || '',
    })
    const loadedLines = await loadLines(contract.id)
    setLines(loadedLines.length > 0 ? loadedLines : [emptyLine(0)])
    setEditMode(false)
    setDrawerOpen(true)
  }

  // ── Open edit ─────────────────────────────────────────────────────────────
  const openEdit = async (contract) => {
    await openView(contract)
    setEditMode(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.contract_no) return toast.error('Contract number required')
    if (!form.title)       return toast.error('Title required')
    if (!form.end_date)    return toast.error('End date required')
    setSaving(true)
    try {
      const payload = {
        contract_no:      form.contract_no,
        title:            form.title,
        contract_type:    form.contract_type,
        status:           form.status,
        supplier_id:      form.supplier_id || null,
        supplier_name:    form.supplier_name || null,
        start_date:       form.start_date || null,
        end_date:         form.end_date,
        currency:         form.currency,
        contract_value:   form.contract_value   ? Number(form.contract_value)   : null,
        committed_value:  form.committed_value  ? Number(form.committed_value)  : 0,
        payment_terms:    form.payment_terms    || null,
        delivery_terms:   form.delivery_terms   || null,
        notice_period:    form.notice_period    ? Number(form.notice_period)    : null,
        renewal_alert_days: form.renewal_alert_days ? Number(form.renewal_alert_days) : 30,
        notes:            form.notes            || null,
        updated_at:       new Date().toISOString(),
      }

      let contractId = activeId

      if (activeId) {
        const { error } = await supabase.from('purchase_contracts').update(payload).eq('id', activeId)
        if (error) throw error
        toast.success(`Contract ${form.contract_no} updated`)
      } else {
        contractId = crypto.randomUUID()
        const { error } = await supabase.from('purchase_contracts').insert([{
          id: contractId,
          ...payload,
          created_by: '',
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        toast.success(`Contract ${form.contract_no} created`)
      }

      // Save lines
      await saveLines(contractId)

      setDrawerOpen(false)
      setActiveId(null)
      loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Save contract lines ───────────────────────────────────────────────────
  const saveLines = async (contractId) => {
    // Delete all existing lines first
    await supabase.from('purchase_contract_lines').delete().eq('contract_id', contractId)

    const toInsert = lines
      .filter(l => l.item_name || l.item_code)
      .map((l, i) => ({
        id:              l.id || crypto.randomUUID(),
        contract_id:     contractId,
        item_id:         l.item_id || null,
        item_name:       l.item_name || '',
        item_code:       l.item_code || null,
        unit:            l.unit || null,
        contracted_rate: l.contracted_rate ? Number(l.contracted_rate) : null,
        min_qty:         l.min_qty ? Number(l.min_qty) : null,
        max_qty:         l.max_qty ? Number(l.max_qty) : null,
        notes:           l.notes || null,
        sort_order:      i,
      }))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('purchase_contract_lines').insert(toInsert)
      if (error) throw error
    }
  }

  // ── Line operations ───────────────────────────────────────────────────────
  const addLine = () => setLines(ls => [...ls, emptyLine(ls.length)])
  const removeLine = (key) => setLines(ls => ls.filter(l => l._key !== key))
  const updateLine = (key, field, value) =>
    setLines(ls => ls.map(l => l._key === key ? { ...l, [field]: value } : l))

  // ── Supplier change ───────────────────────────────────────────────────────
  const handleSupplierChange = (id) => {
    const s = suppliers.find(x => x.id === id)
    sf('supplier_id', id)
    sf('supplier_name', s?.name || '')
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportXLSX(
      filtered.map(c => ({
        'Contract No':  c.contract_no,
        'Title':        c.title,
        'Supplier':     c.supplier_name,
        'Type':         c.contract_type,
        'Status':       effectiveStatus(c),
        'Start Date':   c.start_date,
        'End Date':     c.end_date,
        'Currency':     c.currency,
        'Value':        c.contract_value,
        'Days Remaining': daysRemaining(c.end_date),
      })),
      `PurchaseContracts_${dateTag()}`,
      'Contracts'
    )
    toast.success('Exported')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Page Header */}
      <PageHeader
        title="Purchase Contracts"
        subtitle="Rate contracts, framework agreements and blanket order registers with expiry tracking"
      >
        <button className="btn btn-ghost" onClick={handleExport} disabled={!filtered.length}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons md-18">download</span>
          Export
        </button>
        <button className="btn btn-primary" onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-icons md-18">add</span>
          New Contract
        </button>
      </PageHeader>

      {/* Expiry alert banner */}
      {expiringContracts.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid var(--gold)',
          color: 'var(--gold)',
          background: 'color-mix(in srgb, var(--gold) 8%, transparent)',
          marginBottom: 18,
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span className="material-icons md-18">warning</span>
          {expiringContracts.length} contract{expiringContracts.length > 1 ? 's' : ''} expiring within 30 days — review renewal status
        </div>
      )}

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
          label="Total Contract Value"
          value={`${fmtNum(kpis.totalVal)} USD`}
          icon="account_balance_wallet"
          sub="Active contracts"
        />
        <KPICard
          label="Expiring Soon (≤30 days)"
          value={kpis.expiringCount}
          icon="event_busy"
          color={kpis.expiringCount > 0 ? 'yellow' : ''}
          alert={kpis.expiringCount > 0}
          onClick={() => setFilterStatus('Active')}
        />
        <KPICard
          label="Expired (not renewed)"
          value={kpis.expiredCount}
          icon="warning"
          color={kpis.expiredCount > 0 ? 'red' : ''}
          onClick={() => setFilterStatus('Expired')}
        />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <span className="material-icons md-18" style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', pointerEvents: 'none',
          }}>search</span>
          <input
            type="text"
            className="input"
            placeholder="Search contract no, title, supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 200 }}>
          <option value="All">All Types</option>
          {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 160 }}>
          <option value="All">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterType !== 'All' || filterStatus !== 'All' || search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType('All'); setFilterStatus('All'); setSearch('') }}>
            <span className="material-icons md-16">clear</span> Clear
          </button>
        )}
      </div>

      {/* Contracts table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>hourglass_top</span>
            Loading contracts…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="article"
            title="No contracts found"
            message={search || filterType !== 'All' || filterStatus !== 'All'
              ? 'Try adjusting your filters.'
              : 'Create your first purchase contract to get started.'}
            action={!search && filterType === 'All' && filterStatus === 'All' ? (
              <button className="btn btn-primary" onClick={openNew}>
                <span className="material-icons md-18">add</span> New Contract
              </button>
            ) : null}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract No</th>
                  <th>Title</th>
                  <th>Supplier</th>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th>Status</th>
                  <th>Days Rem.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const eff  = effectiveStatus(c)
                  const days = daysRemaining(c.end_date)
                  const isExpired  = days !== null && days < 0
                  const isExpiring = !isExpired && days !== null && days <= 30

                  return (
                    <tr
                      key={c.id}
                      style={{
                        opacity: isExpired ? 0.6 : 1,
                        borderLeft: isExpiring ? '3px solid color-mix(in srgb, var(--yellow) 60%, transparent)' : undefined,
                      }}
                    >
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 600, fontSize: 13 }}>
                          {c.contract_no}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, maxWidth: 200 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {c.title}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{c.supplier_name || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>
                          {c.contract_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {c.start_date || '—'}
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: isExpiring ? 'var(--yellow)' : isExpired ? 'var(--red)' : 'var(--text-dim)' }}>
                        {c.end_date || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13 }}>
                        {c.contract_value != null ? `${c.currency} ${fmtNum(c.contract_value)}` : '—'}
                      </td>
                      <td>
                        <ContractStatusBadge status={eff} />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                        <DaysRemainingBadge endDate={c.end_date} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="View"
                            onClick={() => openView(c)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <span className="material-icons md-16">visibility</span>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => openEdit(c)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <span className="material-icons md-16">edit</span>
                          </button>
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

      {/* ── Right-side drawer ─────────────────────────────────────────────── */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { if (!saving) { setDrawerOpen(false); setActiveId(null) } }}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.35)',
              zIndex: 900,
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(680px, 95vw)',
            background: 'var(--surface)',
            borderLeft: '1px solid var(--border)',
            zIndex: 901,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
          }}>

            {/* Drawer header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  {activeId
                    ? (editMode ? `Edit — ${form.contract_no}` : form.contract_no)
                    : 'New Purchase Contract'}
                </div>
                {activeId && !editMode && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                    {form.title}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {activeId && !editMode && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-icons md-16">edit</span> Edit
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { if (!saving) { setDrawerOpen(false); setActiveId(null) } }}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <span className="material-icons">close</span>
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {editMode ? (
                /* ── EDIT / CREATE FORM ── */
                <form id="contract-form" onSubmit={handleSave}>

                  {/* Section 1: Header */}
                  <SectionTitle>Contract Header</SectionTitle>
                  <FormRow cols={2}>
                    <FormField label="Contract No" required>
                      <input
                        type="text"
                        className="input"
                        placeholder="PC-0001"
                        value={form.contract_no}
                        onChange={e => sf('contract_no', e.target.value)}
                        required
                      />
                    </FormField>
                    <FormField label="Status">
                      <select className="input" value={form.status} onChange={e => sf('status', e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FormField>
                  </FormRow>
                  <FormRow cols={1}>
                    <FormField label="Title" required>
                      <input
                        type="text"
                        className="input"
                        placeholder="Contract title / description"
                        value={form.title}
                        onChange={e => sf('title', e.target.value)}
                        required
                      />
                    </FormField>
                  </FormRow>
                  <FormRow cols={1}>
                    <FormField label="Contract Type">
                      <select className="input" value={form.contract_type} onChange={e => sf('contract_type', e.target.value)}>
                        {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </FormField>
                  </FormRow>

                  {/* Section 2: Supplier */}
                  <SectionTitle>Supplier</SectionTitle>
                  <FormRow cols={1}>
                    <FormField label="Supplier">
                      <select
                        className="input"
                        value={form.supplier_id}
                        onChange={e => handleSupplierChange(e.target.value)}
                      >
                        <option value="">— Select supplier —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </FormField>
                  </FormRow>
                  {form.supplier_name && (
                    <div style={{
                      fontSize: 12, color: 'var(--text-dim)', marginBottom: 12,
                      padding: '6px 10px', background: 'var(--surface2)',
                      borderRadius: 6, border: '1px solid var(--border)',
                    }}>
                      Supplier: <strong style={{ color: 'var(--text)' }}>{form.supplier_name}</strong>
                    </div>
                  )}

                  {/* Section 3: Dates & Value */}
                  <SectionTitle>Dates &amp; Value</SectionTitle>
                  <FormRow cols={2}>
                    <FormField label="Start Date">
                      <input type="date" className="input" value={form.start_date}
                        onChange={e => sf('start_date', e.target.value)} />
                    </FormField>
                    <FormField label="End Date" required>
                      <input type="date" className="input" value={form.end_date}
                        min={form.start_date || today}
                        onChange={e => sf('end_date', e.target.value)}
                        required />
                    </FormField>
                  </FormRow>
                  <FormRow cols={2}>
                    <FormField label="Currency">
                      <select className="input" value={form.currency} onChange={e => sf('currency', e.target.value)}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Contract Value">
                      <input type="number" className="input" placeholder="0.00" min="0" step="0.01"
                        value={form.contract_value} onChange={e => sf('contract_value', e.target.value)} />
                    </FormField>
                  </FormRow>
                  <FormRow cols={2}>
                    <FormField label="Payment Terms">
                      <input type="text" className="input" placeholder="e.g. Net 30"
                        value={form.payment_terms} onChange={e => sf('payment_terms', e.target.value)} />
                    </FormField>
                    <FormField label="Delivery Terms">
                      <input type="text" className="input" placeholder="e.g. DDP, FOB"
                        value={form.delivery_terms} onChange={e => sf('delivery_terms', e.target.value)} />
                    </FormField>
                  </FormRow>

                  {/* Section 4: Settings */}
                  <SectionTitle>Settings</SectionTitle>
                  <FormRow cols={2}>
                    <FormField label="Notice Period (days)">
                      <input type="number" className="input" placeholder="e.g. 30" min="0"
                        value={form.notice_period} onChange={e => sf('notice_period', e.target.value)} />
                    </FormField>
                    <FormField label="Renewal Alert (days before expiry)">
                      <input type="number" className="input" placeholder="30" min="0"
                        value={form.renewal_alert_days} onChange={e => sf('renewal_alert_days', e.target.value)} />
                    </FormField>
                  </FormRow>
                  <FormRow cols={1}>
                    <FormField label="Notes">
                      <textarea className="input" rows={3} placeholder="Internal notes…"
                        value={form.notes} onChange={e => sf('notes', e.target.value)}
                        style={{ resize: 'vertical' }} />
                    </FormField>
                  </FormRow>

                  {/* Contract Lines */}
                  <SectionTitle>Contract Lines</SectionTitle>
                  <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Item Name', 'Code', 'Unit', 'Rate', 'Min Qty', 'Max Qty', 'Notes', ''].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-dim)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line._key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 4px' }}>
                              <input className="input" style={{ minWidth: 120 }} placeholder="Item name"
                                value={line.item_name} onChange={e => updateLine(line._key, 'item_name', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input className="input" style={{ width: 80 }} placeholder="Code"
                                value={line.item_code || ''} onChange={e => updateLine(line._key, 'item_code', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input className="input" style={{ width: 60 }} placeholder="pcs"
                                value={line.unit || ''} onChange={e => updateLine(line._key, 'unit', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input type="number" className="input" style={{ width: 80 }} placeholder="0.00" min="0" step="0.01"
                                value={line.contracted_rate || ''} onChange={e => updateLine(line._key, 'contracted_rate', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input type="number" className="input" style={{ width: 70 }} placeholder="0" min="0"
                                value={line.min_qty || ''} onChange={e => updateLine(line._key, 'min_qty', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input type="number" className="input" style={{ width: 70 }} placeholder="0" min="0"
                                value={line.max_qty || ''} onChange={e => updateLine(line._key, 'max_qty', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <input className="input" style={{ width: 100 }} placeholder="Notes"
                                value={line.notes || ''} onChange={e => updateLine(line._key, 'notes', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 4px' }}>
                              <button type="button" onClick={() => removeLine(line._key)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 2 }}
                                title="Remove line">
                                <span className="material-icons md-18">delete_outline</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <span className="material-icons md-16">add</span> Add Line
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
                    Total Contract Scope: <strong>{lines.filter(l => l.item_name || l.item_code).length}</strong> line item{lines.filter(l => l.item_name || l.item_code).length !== 1 ? 's' : ''}
                  </div>

                </form>
              ) : (
                /* ── VIEW MODE ── */
                <div>
                  {/* Header info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <ViewPair label="Contract Type" value={form.contract_type} />
                    <ViewPair label="Status" value={<ContractStatusBadge status={effectiveStatus({ status: form.status, end_date: form.end_date })} />} />
                    <ViewPair label="Supplier" value={form.supplier_name || '—'} />
                    <ViewPair label="Currency" value={form.currency} />
                    <ViewPair label="Start Date" value={form.start_date || '—'} />
                    <ViewPair label="End Date">
                      <span>{form.end_date || '—'}</span>
                      {form.end_date && (
                        <span style={{ marginLeft: 8 }}>
                          <DaysRemainingBadge endDate={form.end_date} />
                        </span>
                      )}
                    </ViewPair>
                  </div>

                  {/* Financial */}
                  {(form.contract_value || form.committed_value) && (
                    <>
                      <SectionTitle>Financial</SectionTitle>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                        {form.contract_value && (
                          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Contract Value</div>
                            <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 700 }}>{form.currency} {fmtNum(form.contract_value)}</div>
                          </div>
                        )}
                        {form.committed_value && (
                          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Committed Value</div>
                            <div style={{ fontSize: 18, fontFamily: 'var(--mono)', fontWeight: 700 }}>{form.currency} {fmtNum(form.committed_value)}</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Terms */}
                  {(form.payment_terms || form.delivery_terms) && (
                    <>
                      <SectionTitle>Terms</SectionTitle>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                        {form.payment_terms && <ViewPair label="Payment Terms" value={form.payment_terms} />}
                        {form.delivery_terms && <ViewPair label="Delivery Terms" value={form.delivery_terms} />}
                      </div>
                    </>
                  )}

                  {/* Settings */}
                  <SectionTitle>Settings</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                    <ViewPair label="Notice Period" value={form.notice_period ? `${form.notice_period} days` : '—'} />
                    <ViewPair label="Renewal Alert" value={form.renewal_alert_days ? `${form.renewal_alert_days} days before expiry` : '—'} />
                  </div>

                  {/* Notes */}
                  {form.notes && (
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
                        {form.notes}
                      </div>
                    </>
                  )}

                  {/* Contract Lines (view) */}
                  <SectionTitle>Contract Lines</SectionTitle>
                  {lines.filter(l => l.item_name || l.item_code).length === 0 ? (
                    <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No line items.</p>
                  ) : (
                    <>
                      <div className="table-wrap" style={{ marginBottom: 8 }}>
                        <table className="table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Item Name</th>
                              <th>Code</th>
                              <th>Unit</th>
                              <th style={{ textAlign: 'right' }}>Rate</th>
                              <th style={{ textAlign: 'right' }}>Min Qty</th>
                              <th style={{ textAlign: 'right' }}>Max Qty</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.filter(l => l.item_name || l.item_code).map((l) => (
                              <tr key={l._key}>
                                <td style={{ fontWeight: 500 }}>{l.item_name || '—'}</td>
                                <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)', fontSize: 11 }}>{l.item_code || '—'}</td>
                                <td>{l.unit || '—'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                                  {l.contracted_rate != null ? fmtNum(l.contracted_rate) : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{l.min_qty != null ? fmtNum(l.min_qty) : '—'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{l.max_qty != null ? fmtNum(l.max_qty) : '—'}</td>
                                <td style={{ color: 'var(--text-dim)', fontSize: 11 }}>{l.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        Total Contract Scope: <strong>{lines.filter(l => l.item_name || l.item_code).length}</strong> line item{lines.filter(l => l.item_name || l.item_code).length !== 1 ? 's' : ''}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            {editMode && (
              <div style={{
                flexShrink: 0,
                padding: '14px 20px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                background: 'var(--surface)',
              }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (activeId) setEditMode(false)
                    else { setDrawerOpen(false); setActiveId(null) }
                  }}
                  disabled={saving}
                >
                  {activeId ? 'Cancel Edit' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  form="contract-form"
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
                      {activeId ? 'Save Changes' : 'Create Contract'}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── View mode pair helper ────────────────────────────────────────────────────
function ViewPair({ label, value, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>
        {children || value || '—'}
      </span>
    </div>
  )
}
