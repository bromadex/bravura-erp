// src/pages/Inventory/PutawayRules.jsx
// Phase 11 — Putaway Rules: auto-route incoming goods to the correct
// warehouse / storage location based on item, category, or supplier.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    priority: 10,
    item_id: '', item_category: '', supplier_id: '',
    min_qty: '', max_qty: '',
    warehouse_id: '', location_id: '',
    notes: '', is_active: true,
  }
}

function ConditionChip({ label, color }) {
  const colorMap = {
    blue:   { color: 'var(--blue)',   bg: 'rgba(10,132,255,.10)'  },
    teal:   { color: 'var(--teal)',   bg: 'rgba(100,210,255,.10)' },
    purple: { color: 'var(--purple)', bg: 'rgba(191,90,242,.10)'  },
    yellow: { color: 'var(--yellow)', bg: 'rgba(255,214,10,.10)'  },
  }
  const s = colorMap[color] || colorMap.blue
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      fontSize: 11, fontWeight: 600, color: s.color, background: s.bg,
      marginRight: 4, marginBottom: 2, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PutawayRules() {
  const [rules,      setRules]      = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [locations,  setLocations]  = useState([])
  const [items,      setItems]      = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [testItemId, setTestItemId] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [form,       setForm]       = useState(emptyForm())

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    const safe = async (q) => { try { const r = await q; return r.error ? { data: [] } : r } catch { return { data: [] } } }
    const [rRes, wRes, lRes, iRes, cRes, sRes] = await Promise.all([
      supabase.from('putaway_rules').select('*').order('priority'),
      supabase.from('warehouses').select('id, name, warehouse_type, type').order('name'),
      supabase.from('storage_locations').select('id, name, warehouse_id').order('name'),
      supabase.from('items').select('id, name, item_code, category').order('name'),
      safe(supabase.from('item_categories').select('id, name').order('name')),
      supabase.from('suppliers').select('id, name').order('name'),
    ])
    if (rRes.error) toast.error('Failed to load putaway rules')
    setRules(rRes.data || [])
    setWarehouses(wRes.data || [])
    setLocations(lRes.data || [])
    setItems(iRes.data || [])
    setCategories(cRes.data || [])
    setSuppliers(sRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Derive category list from table or from items
  const catOptions = useMemo(() => {
    if (categories.length > 0) return categories.map(c => c.name)
    const set = new Set(items.map(i => i.category).filter(Boolean))
    return [...set].sort()
  }, [categories, items])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }
  const openEdit = (r) => {
    setEditing(r)
    setForm({
      priority:      r.priority,
      item_id:       r.item_id || '',
      item_category: r.item_category || '',
      supplier_id:   r.supplier_id || '',
      min_qty:       r.min_qty != null ? String(r.min_qty) : '',
      max_qty:       r.max_qty != null ? String(r.max_qty) : '',
      warehouse_id:  r.warehouse_id || '',
      location_id:   r.location_id || '',
      notes:         r.notes || '',
      is_active:     r.is_active,
    })
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.warehouse_id) return toast.error('Target warehouse is required')
    setSaving(true)
    try {
      const payload = {
        priority:      Number(form.priority) || 10,
        item_id:       form.item_id || null,
        item_category: form.item_category || null,
        supplier_id:   form.supplier_id || null,
        min_qty:       form.min_qty !== '' ? Number(form.min_qty) : null,
        max_qty:       form.max_qty !== '' ? Number(form.max_qty) : null,
        warehouse_id:  form.warehouse_id,
        location_id:   form.location_id || null,
        notes:         form.notes || null,
        is_active:     form.is_active,
        updated_at:    new Date().toISOString(),
      }
      if (editing) {
        const { error } = await supabase.from('putaway_rules').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Rule updated')
      } else {
        const { error } = await supabase.from('putaway_rules').insert([{
          id: crypto.randomUUID(),
          ...payload,
          created_by: '',
          created_at: new Date().toISOString(),
        }])
        if (error) throw error
        toast.success('Putaway rule created')
      }
      setModalOpen(false)
      loadData()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this putaway rule?')) return
    const { error } = await supabase.from('putaway_rules').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Rule deleted')
    setRules(rs => rs.filter(r => r.id !== id))
  }

  const handleToggleActive = async (r) => {
    const { error } = await supabase.from('putaway_rules')
      .update({ is_active: !r.is_active, updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) return toast.error(error.message)
    setRules(rs => rs.map(x => x.id === r.id ? { ...x, is_active: !x.is_active } : x))
  }

  const handleMovePriority = async (rule, direction) => {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority)
    const idx = sorted.findIndex(r => r.id === rule.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    const [e1, e2] = await Promise.all([
      supabase.from('putaway_rules').update({ priority: other.priority }).eq('id', rule.id),
      supabase.from('putaway_rules').update({ priority: rule.priority  }).eq('id', other.id),
    ])
    if (e1.error || e2.error) return toast.error('Failed to reorder')
    loadData()
  }

  // ── Test Putaway ──────────────────────────────────────────────────────────
  const runTest = () => {
    if (!testItemId) { setTestResult(null); return }
    const item = items.find(i => i.id === testItemId)
    if (!item) return setTestResult({ noItem: true })
    const activeRules = rules.filter(r => r.is_active).sort((a, b) => a.priority - b.priority)
    let match = null
    for (const r of activeRules) {
      let ok = true
      if (r.item_id       && r.item_id       !== item.id)       ok = false
      if (r.item_category && r.item_category !== item.category) ok = false
      if (ok) { match = r; break }
    }
    const wh  = match ? warehouses.find(w => w.id === match.warehouse_id) : null
    const loc = match?.location_id ? locations.find(l => l.id === match.location_id) : null
    setTestResult(match ? { rule: match, warehouse: wh, location: loc, item } : { noMatch: true, item })
  }

  // ── Display helpers ───────────────────────────────────────────────────────
  const describeConditions = (r) => {
    const chips = []
    const itemName = r.item_id ? (items.find(i => i.id === r.item_id)?.name || r.item_id) : null
    if (itemName) chips.push({ label: `Item: ${itemName}`, color: 'blue' })
    if (r.item_category) chips.push({ label: `Cat: ${r.item_category}`, color: 'teal' })
    const supName = r.supplier_id ? (suppliers.find(s => s.id === r.supplier_id)?.name || r.supplier_id) : null
    if (supName) chips.push({ label: `Supplier: ${supName}`, color: 'purple' })
    if (r.min_qty != null || r.max_qty != null) {
      chips.push({ label: `Qty: ${r.min_qty ?? 0}–${r.max_qty ?? '∞'}`, color: 'yellow' })
    }
    if (chips.length === 0) chips.push({ label: 'Catch-all (all items)', color: 'teal' })
    return chips
  }

  const describeTarget = (r) => {
    const wh  = warehouses.find(w => w.id === r.warehouse_id)
    const loc = r.location_id ? locations.find(l => l.id === r.location_id) : null
    return [wh?.name || '?', loc?.name].filter(Boolean).join(' → ')
  }

  const filteredLocations = locations.filter(l => l.warehouse_id === form.warehouse_id)
  const activeCount       = rules.filter(r => r.is_active).length

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</div>

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Putaway Rules"
        subtitle="Automatically route incoming goods to the correct warehouse and storage location"
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>add</span>
            New Rule
          </button>
        }
      />

      {/* Info callout */}
      <div style={{
        background: 'rgba(10,132,255,.07)', border: '1px solid rgba(10,132,255,.25)',
        borderRadius: 8, padding: '11px 16px', marginBottom: 22,
        fontSize: 13, color: 'var(--text-dim)', display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span className="material-icons" style={{ fontSize: 17, color: 'var(--blue)', marginTop: 1 }}>info</span>
        <span>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> Rules are evaluated in priority order — lower number fires first.
          The first matching rule wins. Conditions are <strong>AND-logic</strong>.
          Leave all conditions blank to create a <em>catch-all</em> default.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Rules Table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {rules.length === 0 ? (
            <EmptyState icon="warehouse" title="No putaway rules" description="Create rules to automatically assign incoming goods to warehouses and locations" />
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {['Priority','Conditions','→ Target','Active','Actions'].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...rules].sort((a, b) => a.priority - b.priority).map((r, idx, arr) => (
                      <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                        <td style={{ minWidth: 72 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', fontWeight: 700, fontSize: 15 }}>
                              #{r.priority}
                            </span>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button onClick={() => handleMovePriority(r, 'up')} disabled={idx === 0}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '1px 3px', opacity: idx === 0 ? 0.3 : 1 }}>
                                <span className="material-icons" style={{ fontSize: 14 }}>expand_less</span>
                              </button>
                              <button onClick={() => handleMovePriority(r, 'down')} disabled={idx === arr.length - 1}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '1px 3px', opacity: idx === arr.length - 1 ? 0.3 : 1 }}>
                                <span className="material-icons" style={{ fontSize: 14 }}>expand_more</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {describeConditions(r).map((c, i) => <ConditionChip key={i} label={c.label} color={c.color} />)}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-icons" style={{ fontSize: 14, color: 'var(--gold)' }}>arrow_forward</span>
                            <strong style={{ fontSize: 13 }}>{describeTarget(r)}</strong>
                          </div>
                          {r.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{r.notes}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button onClick={() => handleToggleActive(r)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                            <span className="material-icons" style={{ fontSize: 20, color: r.is_active ? 'var(--green)' : 'var(--text-dim)' }}>
                              {r.is_active ? 'check_circle' : 'cancel'}
                            </span>
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>edit</span>
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>
                              <span className="material-icons" style={{ fontSize: 13 }}>delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Test Putaway */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
              Test Putaway
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              Select an item to simulate which rule would apply
            </div>
            <select className="form-control" style={{ marginBottom: 10, fontSize: 13 }}
              value={testItemId} onChange={e => { setTestItemId(e.target.value); setTestResult(null) }}>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.item_code ? `[${i.item_code}] ` : ''}{i.name}</option>)}
            </select>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={runTest} disabled={!testItemId}>
              <span className="material-icons" style={{ fontSize: 15, marginRight: 4 }}>play_arrow</span>
              Test
            </button>
            {testResult && (
              <div style={{ marginTop: 12 }}>
                {testResult.noMatch ? (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,214,10,.08)', border: '1px solid rgba(255,214,10,.3)', fontSize: 12, color: 'var(--yellow)' }}>
                    <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
                    No matching rule for <strong>{testResult.item.name}</strong>. Item goes to default warehouse.
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(48,209,88,.08)', border: '1px solid rgba(48,209,88,.3)', fontSize: 12 }}>
                    <div style={{ color: 'var(--green)', fontWeight: 700, marginBottom: 6 }}>
                      <span className="material-icons" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>check_circle</span>
                      Rule #{testResult.rule.priority} matched
                    </div>
                    <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>Item: <strong style={{ color: 'var(--text)' }}>{testResult.item.name}</strong></div>
                    <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>Warehouse: <strong style={{ color: 'var(--text)' }}>{testResult.warehouse?.name || '—'}</strong></div>
                    {testResult.location && <div style={{ color: 'var(--text-dim)' }}>Location: <strong style={{ color: 'var(--text)' }}>{testResult.location.name}</strong></div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Summary</div>
            {[
              { label: 'Total rules',  value: rules.length,               color: 'var(--text)'     },
              { label: 'Active',       value: activeCount,                color: 'var(--green)'    },
              { label: 'Inactive',     value: rules.length - activeCount, color: 'var(--text-dim)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <ModalDialog open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit Rule #${editing.priority}` : 'New Putaway Rule'} size="md">
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Conditions (leave blank for catch-all)
          </div>
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(10,132,255,.06)', border: '1px solid rgba(10,132,255,.2)', fontSize: 12, color: 'var(--text-dim)' }}>
            <span className="material-icons" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4, color: 'var(--blue)' }}>info</span>
            Conditions use <strong>AND</strong> logic. Leave all blank for a catch-all default rule.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Priority *</label>
              <input type="number" min="1" required className="form-control" value={form.priority}
                onChange={e => sf('priority', e.target.value)} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', paddingBottom: 2 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => sf('is_active', e.target.checked)} />
                Active
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Specific Item</label>
            <select className="form-control" value={form.item_id} onChange={e => sf('item_id', e.target.value)}>
              <option value="">Any item</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.item_code ? `[${i.item_code}] ` : ''}{i.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Item Category</label>
            <select className="form-control" value={form.item_category} onChange={e => sf('item_category', e.target.value)}>
              <option value="">Any category</option>
              {catOptions.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Supplier</label>
            <select className="form-control" value={form.supplier_id} onChange={e => sf('supplier_id', e.target.value)}>
              <option value="">Any supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Min Qty</label>
              <input type="number" min="0" step="0.01" className="form-control" value={form.min_qty}
                onChange={e => sf('min_qty', e.target.value)} placeholder="Leave blank = any" />
            </div>
            <div className="form-group">
              <label className="form-label">Max Qty</label>
              <input type="number" min="0" step="0.01" className="form-control" value={form.max_qty}
                onChange={e => sf('max_qty', e.target.value)} placeholder="Leave blank = no cap" />
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            Target Warehouse &amp; Location
          </div>
          <div className="form-group">
            <label className="form-label">Warehouse *</label>
            <select required className="form-control" value={form.warehouse_id}
              onChange={e => { sf('warehouse_id', e.target.value); sf('location_id', '') }}>
              <option value="">Select warehouse…</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Storage Location</label>
            <select className="form-control" value={form.location_id}
              onChange={e => sf('location_id', e.target.value)} disabled={!form.warehouse_id}>
              <option value="">Any location in warehouse</option>
              {filteredLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={2} value={form.notes}
              onChange={e => sf('notes', e.target.value)}
              placeholder="e.g. Temperature-controlled zone, hazardous materials bay" />
          </div>
          <ModalActions>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Rule' : 'Create Rule'}
            </button>
          </ModalActions>
        </form>
      </ModalDialog>
    </div>
  )
}
