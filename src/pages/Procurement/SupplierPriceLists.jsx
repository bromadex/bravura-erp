// src/pages/Procurement/SupplierPriceLists.jsx
//
// Phase 16 — Supplier Price List management
// Features: KPI cards, By-Item / All-Entries tab views, price comparison panel,
//           filter bar, Add/Edit modal with supplier + item dropdowns.

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PageHeader,
  KPICard,
  EmptyState,
  ModalDialog,
  ModalActions,
} from '../../components/ui'

const CURRENCIES = ['USD', 'ZAR', 'ZMW', 'BWP']

const BLANK_FORM = {
  supplier_id:    '',
  supplier_name:  '',
  item_id:        '',
  item_name:      '',
  unit:           'pcs',
  unit_price:     '',
  currency:       'USD',
  min_qty:        '1',
  valid_from:     '',
  valid_to:       '',
  lead_time_days: '0',
  notes:          '',
  is_active:      true,
}

// Format a number to 2 decimal places, or '—' if null/undefined
function fmtPrice(val) {
  if (val == null || val === '') return '—'
  return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  return d
}

// Days until a date; negative means already past
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - today) / 86400000)
}

export default function SupplierPriceLists() {
  const [entries,    setEntries]    = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)

  // Tab: 'by_item' | 'all'
  const [activeTab,  setActiveTab]  = useState('by_item')

  // Filters
  const [search,         setSearch]         = useState('')
  const [filterActive,   setFilterActive]   = useState('active')  // 'active' | 'expired' | 'all'
  const [filterSupplier, setFilterSupplier] = useState('')

  // Price comparison panel
  const [compareItem,  setCompareItem]  = useState(null)   // item_name string

  // Modal
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [form,       setForm]       = useState(BLANK_FORM)
  const [saving,     setSaving]     = useState(false)

  // ── Load data ───────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    try {
      const [splRes, supRes, itmRes] = await Promise.all([
        supabase.from('supplier_price_lists').select('*').order('item_name'),
        supabase.from('suppliers').select('id, name').order('name'),
        supabase.from('items').select('id, name, unit').order('name'),
      ])
      setEntries(splRes.data  || [])
      setSuppliers(supRes.data || [])
      setItems(itmRes.data    || [])
    } catch (err) {
      toast.error('Failed to load data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // ── KPI computations ────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]

  const kpis = useMemo(() => {
    const active       = entries.filter(e => e.is_active)
    const suppNames    = new Set(active.map(e => e.supplier_name))
    const itemIds      = new Set(active.map(e => e.item_id).filter(Boolean))
    const expiringSoon = active.filter(e => {
      if (!e.valid_to) return false
      const d = daysUntil(e.valid_to)
      return d !== null && d >= 0 && d <= 30
    })
    return {
      total:        active.length,
      suppCount:    suppNames.size,
      itemsCovered: itemIds.size,
      expiringSoon: expiringSoon.length,
    }
  }, [entries])

  // ── Filtered entries ────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...entries]

    if (filterActive === 'active') {
      rows = rows.filter(e => e.is_active && (!e.valid_to || e.valid_to >= today))
    } else if (filterActive === 'expired') {
      rows = rows.filter(e => !e.is_active || (e.valid_to && e.valid_to < today))
    }

    if (filterSupplier) {
      rows = rows.filter(e => e.supplier_name === filterSupplier)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(e =>
        (e.item_name    || '').toLowerCase().includes(q) ||
        (e.supplier_name || '').toLowerCase().includes(q)
      )
    }

    return rows
  }, [entries, filterActive, filterSupplier, search, today])

  // ── By-Item grouping ────────────────────────────────────────
  const byItem = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      if (!map.has(e.item_name)) map.set(e.item_name, [])
      map.get(e.item_name).push(e)
    }
    // Sort each group cheapest first
    const result = []
    for (const [itemName, rows] of map.entries()) {
      const sorted = [...rows].sort((a, b) => Number(a.unit_price) - Number(b.unit_price))
      result.push({ itemName, rows: sorted, best: sorted[0] })
    }
    result.sort((a, b) => a.itemName.localeCompare(b.itemName))
    return result
  }, [filtered])

  // Unique supplier names for filter dropdown
  const supplierOptions = useMemo(() =>
    [...new Set(entries.map(e => e.supplier_name))].sort(),
  [entries])

  // ── Modal helpers ────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEdit = (entry) => {
    setEditing(entry)
    setForm({
      supplier_id:    entry.supplier_id    || '',
      supplier_name:  entry.supplier_name  || '',
      item_id:        entry.item_id        || '',
      item_name:      entry.item_name      || '',
      unit:           entry.unit           || 'pcs',
      unit_price:     entry.unit_price     != null ? String(entry.unit_price) : '',
      currency:       entry.currency       || 'USD',
      min_qty:        entry.min_qty        != null ? String(entry.min_qty) : '1',
      valid_from:     entry.valid_from     || '',
      valid_to:       entry.valid_to       || '',
      lead_time_days: entry.lead_time_days != null ? String(entry.lead_time_days) : '0',
      notes:          entry.notes          || '',
      is_active:      entry.is_active !== false,
    })
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.supplier_name.trim()) return toast.error('Supplier name is required')
    if (!form.item_name.trim())     return toast.error('Item name is required')
    if (form.unit_price === '')     return toast.error('Unit price is required')

    setSaving(true)
    try {
      const payload = {
        supplier_id:    form.supplier_id    || null,
        supplier_name:  form.supplier_name.trim(),
        item_id:        form.item_id        || null,
        item_name:      form.item_name.trim(),
        unit:           form.unit           || 'pcs',
        unit_price:     Number(form.unit_price),
        currency:       form.currency       || 'USD',
        min_qty:        form.min_qty !== '' ? Number(form.min_qty) : 1,
        valid_from:     form.valid_from     || null,
        valid_to:       form.valid_to       || null,
        lead_time_days: form.lead_time_days !== '' ? Number(form.lead_time_days) : 0,
        notes:          form.notes          || null,
        is_active:      form.is_active,
        updated_at:     new Date().toISOString(),
      }

      let err
      if (editing) {
        ;({ error: err } = await supabase
          .from('supplier_price_lists')
          .update(payload)
          .eq('id', editing.id))
      } else {
        payload.created_at = new Date().toISOString()
        ;({ error: err } = await supabase
          .from('supplier_price_lists')
          .insert([payload]))
      }

      if (err) throw err
      toast.success(editing ? 'Price updated' : 'Price added')
      setModalOpen(false)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (entry) => {
    if (!window.confirm(`Deactivate price for "${entry.item_name}" from ${entry.supplier_name}?`)) return
    try {
      const { error } = await supabase
        .from('supplier_price_lists')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', entry.id)
      if (error) throw error
      toast.success('Price entry deactivated')
      await loadData()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete this price entry? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('supplier_price_lists').delete().eq('id', entry.id)
      if (error) throw error
      toast.success('Deleted')
      if (compareItem === entry.item_name) setCompareItem(null)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // When supplier dropdown changes in the form
  const handleFormSupplier = (suppId) => {
    const s = suppliers.find(x => x.id === suppId)
    setForm(f => ({ ...f, supplier_id: suppId, supplier_name: s ? s.name : '' }))
  }

  // When item dropdown changes in the form
  const handleFormItem = (itemId) => {
    const it = items.find(x => x.id === itemId)
    setForm(f => ({ ...f, item_id: itemId, item_name: it ? it.name : '', unit: it?.unit || f.unit }))
  }

  // Comparison panel data
  const compareRows = useMemo(() => {
    if (!compareItem) return []
    return entries
      .filter(e => e.item_name === compareItem && e.is_active && (!e.valid_to || e.valid_to >= today))
      .sort((a, b) => Number(a.unit_price) - Number(b.unit_price))
  }, [compareItem, entries, today])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Supplier Price Lists"
        subtitle="Manage and compare supplier pricing across all items"
      >
        <button className="btn btn-primary" onClick={openAdd}>
          <span className="material-icons">add</span> Add Price
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <KPICard
          label="Total Price Entries"
          value={kpis.total}
          icon="price_check"
          color="blue"
        />
        <KPICard
          label="Suppliers Quoted"
          value={kpis.suppCount}
          icon="storefront"
          color="teal"
        />
        <KPICard
          label="Items Covered"
          value={kpis.itemsCovered}
          icon="inventory_2"
          color="green"
        />
        <KPICard
          label="Expiring Soon"
          value={kpis.expiringSoon}
          icon="event_busy"
          color={kpis.expiringSoon > 0 ? 'yellow' : ''}
          sub="within 30 days"
          alert={kpis.expiringSoon > 0}
        />
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="material-icons" style={{ color: 'var(--text-dim)', fontSize: 18 }}>search</span>
        <input
          className="form-control"
          style={{ width: 220 }}
          placeholder="Search item or supplier…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select
          className="form-control"
          style={{ width: 140 }}
          value={filterActive}
          onChange={e => setFilterActive(e.target.value)}
        >
          <option value="active">Active Only</option>
          <option value="expired">Expired / Inactive</option>
          <option value="all">All</option>
        </select>

        <select
          className="form-control"
          style={{ width: 190 }}
          value={filterSupplier}
          onChange={e => setFilterSupplier(e.target.value)}
        >
          <option value="">All Suppliers</option>
          {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {(search || filterActive !== 'active' || filterSupplier) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterActive('active'); setFilterSupplier('') }}>
            <span className="material-icons" style={{ fontSize: 14 }}>clear</span> Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'by_item', label: 'By Item', icon: 'category' },
          { key: 'all',     label: 'All Price Entries', icon: 'list' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--gold)' : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === tab.key ? 'var(--gold)' : 'var(--text-dim)',
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab A: By Item ── */}
      {activeTab === 'by_item' && (
        <div style={{ display: 'grid', gridTemplateColumns: compareItem ? '1fr 360px' : '1fr', gap: 16 }}>
          <div className="card">
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Unit</th>
                    <th>Suppliers</th>
                    <th>Best Price</th>
                    <th>Lead Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</td></tr>
                  ) : byItem.length === 0 ? (
                    <tr><td colSpan="6" style={{ padding: 0 }}>
                      <EmptyState icon="price_check" message="No price entries match your filters" action={{ label: 'Add Price', onClick: openAdd }} />
                    </td></tr>
                  ) : byItem.map(({ itemName, rows, best }) => (
                    <tr
                      key={itemName}
                      style={{ cursor: 'pointer', background: compareItem === itemName ? 'var(--surface2)' : '' }}
                      onClick={() => setCompareItem(compareItem === itemName ? null : itemName)}
                    >
                      <td style={{ fontWeight: 600 }}>
                        <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4, color: 'var(--text-dim)' }}>
                          {compareItem === itemName ? 'expand_less' : 'expand_more'}
                        </span>
                        {itemName}
                      </td>
                      <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{best?.unit || '—'}</td>
                      <td className="td-mono">{rows.length}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 700 }}>
                        {best ? `${best.currency} ${fmtPrice(best.unit_price)}` : '—'}
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400, marginLeft: 4 }}>
                          {best ? `(${best.supplier_name})` : ''}
                        </span>
                      </td>
                      <td className="td-mono" style={{ fontSize: 12 }}>
                        {best?.lead_time_days != null ? `${best.lead_time_days}d` : '—'}
                      </td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setCompareItem(compareItem === itemName ? null : itemName)}>
                          <span className="material-icons" style={{ fontSize: 14 }}>compare_arrows</span> Compare
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Price comparison panel */}
          {compareItem && (
            <div className="card" style={{ alignSelf: 'start' }}>
              <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Price Comparison</div>
                  <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>{compareItem}</div>
                </div>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}
                  onClick={() => setCompareItem(null)}
                >
                  <span className="material-icons" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>

              {compareRows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                  No active prices found
                </div>
              ) : compareRows.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border)',
                    background: i === 0 ? 'color-mix(in srgb, var(--green) 8%, var(--surface))' : '',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {i === 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px',
                        background: 'var(--green)', color: '#fff', borderRadius: 4,
                        letterSpacing: 0.5,
                      }}>BEST</span>
                    )}
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{row.supplier_name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: i === 0 ? 'var(--green)' : 'var(--text)' }}>
                      {row.currency} {fmtPrice(row.unit_price)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/{row.unit || 'pcs'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                    <span><span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle' }}>schedule</span> {row.lead_time_days ?? 0}d lead</span>
                    <span>Min: {fmtPrice(row.min_qty)} {row.unit || 'pcs'}</span>
                    {row.valid_to && (
                      <span style={{ color: daysUntil(row.valid_to) <= 30 ? 'var(--yellow)' : '' }}>
                        exp {fmtDate(row.valid_to)}
                      </span>
                    )}
                  </div>
                  {row.notes && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      {row.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab B: All Entries ── */}
      {activeTab === 'all' && (
        <div className="card">
          <div className="table-wrap">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Item</th>
                  <th>Unit Price</th>
                  <th>Currency</th>
                  <th>Min Qty</th>
                  <th>Valid From</th>
                  <th>Valid To</th>
                  <th>Lead Time</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="10" style={{ padding: 0 }}>
                    <EmptyState icon="price_check" message="No price entries found" action={{ label: 'Add Price', onClick: openAdd }} />
                  </td></tr>
                ) : filtered.map(entry => {
                  const expiring = entry.valid_to && daysUntil(entry.valid_to) >= 0 && daysUntil(entry.valid_to) <= 30
                  return (
                    <tr key={entry.id}>
                      <td style={{ fontWeight: 600 }}>{entry.supplier_name}</td>
                      <td>{entry.item_name}</td>
                      <td className="td-mono" style={{ fontWeight: 700 }}>{fmtPrice(entry.unit_price)}</td>
                      <td className="td-mono" style={{ color: 'var(--blue)' }}>{entry.currency}</td>
                      <td className="td-mono">{fmtPrice(entry.min_qty)}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(entry.valid_from)}</td>
                      <td style={{ fontSize: 12, color: expiring ? 'var(--yellow)' : entry.valid_to && entry.valid_to < today ? 'var(--red)' : '' }}>
                        {fmtDate(entry.valid_to)}
                        {expiring && (
                          <span className="material-icons" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 2, color: 'var(--yellow)' }}>warning</span>
                        )}
                      </td>
                      <td className="td-mono" style={{ fontSize: 12 }}>{entry.lead_time_days ?? 0}d</td>
                      <td>
                        <span
                          className={`badge ${entry.is_active && (!entry.valid_to || entry.valid_to >= today) ? 'badge-green' : 'badge-red'}`}
                        >
                          {entry.is_active && (!entry.valid_to || entry.valid_to >= today) ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="td-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(entry)} title="Edit">
                          <span className="material-icons" style={{ fontSize: 14 }}>edit</span>
                        </button>
                        {entry.is_active && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDeactivate(entry)} title="Deactivate">
                            <span className="material-icons" style={{ fontSize: 14 }}>block</span>
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDelete(entry)} title="Delete" style={{ color: 'var(--red)' }}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Price Entry' : 'Add Price Entry'}
        size="lg"
      >
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '4px 0' }}>

            {/* Supplier */}
            <div className="form-group">
              <label>Supplier *</label>
              <select
                className="form-control"
                value={form.supplier_id}
                onChange={e => handleFormSupplier(e.target.value)}
              >
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!form.supplier_id && (
                <input
                  className="form-control"
                  style={{ marginTop: 6 }}
                  placeholder="Or type supplier name manually…"
                  value={form.supplier_name}
                  onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                />
              )}
            </div>

            {/* Item */}
            <div className="form-group">
              <label>Item *</label>
              <select
                className="form-control"
                value={form.item_id}
                onChange={e => handleFormItem(e.target.value)}
              >
                <option value="">— Select item —</option>
                {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              {!form.item_id && (
                <input
                  className="form-control"
                  style={{ marginTop: 6 }}
                  placeholder="Or type item name manually…"
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                />
              )}
            </div>

            {/* Unit */}
            <div className="form-group">
              <label>Unit</label>
              <input
                className="form-control"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="pcs"
              />
            </div>

            {/* Currency */}
            <div className="form-group">
              <label>Currency *</label>
              <select
                className="form-control"
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Unit Price */}
            <div className="form-group">
              <label>Unit Price *</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                className="form-control"
                value={form.unit_price}
                onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>

            {/* Min Qty */}
            <div className="form-group">
              <label>Minimum Qty</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                className="form-control"
                value={form.min_qty}
                onChange={e => setForm(f => ({ ...f, min_qty: e.target.value }))}
                placeholder="1"
              />
            </div>

            {/* Valid From */}
            <div className="form-group">
              <label>Valid From</label>
              <input
                type="date"
                className="form-control"
                value={form.valid_from}
                onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))}
              />
            </div>

            {/* Valid To */}
            <div className="form-group">
              <label>Valid To</label>
              <input
                type="date"
                className="form-control"
                value={form.valid_to}
                onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))}
              />
            </div>

            {/* Lead Time */}
            <div className="form-group">
              <label>Lead Time (days)</label>
              <input
                type="number"
                min="0"
                step="1"
                className="form-control"
                value={form.lead_time_days}
                onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))}
                placeholder="0"
              />
            </div>

            {/* Active toggle */}
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
              <input
                type="checkbox"
                id="chk-active"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              <label htmlFor="chk-active" style={{ marginBottom: 0, cursor: 'pointer' }}>Active</label>
            </div>

            {/* Notes */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Notes</label>
              <textarea
                className="form-control"
                rows="2"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes about this quote…"
              />
            </div>
          </div>

          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <span className="material-icons">save</span>
              {saving ? 'Saving…' : editing ? 'Update Price' : 'Add Price'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
