// src/pages/Inventory/UOMConversion.jsx
// Phase 13 — UOM Conversion Rules & Test Calculator

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { PageHeader, KPICard, EmptyState, ModalDialog, ModalActions } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

const fmtFactor = (n) => {
  const v = parseFloat(n)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return v.toLocaleString('en', { maximumFractionDigits: 2 })
  if (v >= 1)    return v.toFixed(4).replace(/\.?0+$/, '')
  return v.toFixed(6).replace(/0+$/, '')
}

const SEED_RULES = [
  { from_uom: 'bag',   to_uom: 'kg',  factor: 50,    uom_category: 'Weight',   description: '1 bag = 50 kg' },
  { from_uom: 'carton',to_uom: 'pcs', factor: 12,    uom_category: 'Quantity', description: '1 carton = 12 pcs' },
  { from_uom: 'drum',  to_uom: 'L',   factor: 200,   uom_category: 'Volume',   description: '1 drum = 200 L' },
  { from_uom: 'ton',   to_uom: 'kg',  factor: 1000,  uom_category: 'Weight',   description: '1 ton = 1000 kg' },
  { from_uom: 'm³',    to_uom: 'L',   factor: 1000,  uom_category: 'Volume',   description: '1 m³ = 1000 L' },
]

// Find conversion chain: direct or 2-step via a common intermediate UOM
function computeConversion(rules, fromUOM, toUOM, qty) {
  if (!fromUOM || !toUOM || !qty) return null
  const q = parseFloat(qty)
  if (!isFinite(q)) return null

  // Direct
  const direct = rules.find((r) => r.from_uom === fromUOM && r.to_uom === toUOM && r.is_active)
  if (direct) return { result: q * parseFloat(direct.factor), steps: [`1 ${fromUOM} = ${fmtFactor(direct.factor)} ${toUOM}`] }

  // Reverse direct
  const reverse = rules.find((r) => r.from_uom === toUOM && r.to_uom === fromUOM && r.is_active)
  if (reverse) {
    const inv = 1 / parseFloat(reverse.factor)
    return { result: q * inv, steps: [`1 ${fromUOM} = ${fmtFactor(inv)} ${toUOM} (reversed)`] }
  }

  // 2-step chain
  const firstSteps = rules.filter((r) => r.from_uom === fromUOM && r.is_active)
  for (const s1 of firstSteps) {
    const s2 = rules.find((r) => r.from_uom === s1.to_uom && r.to_uom === toUOM && r.is_active)
    if (s2) {
      const combined = parseFloat(s1.factor) * parseFloat(s2.factor)
      return {
        result: q * combined,
        steps: [
          `1 ${fromUOM} = ${fmtFactor(s1.factor)} ${s1.to_uom}`,
          `1 ${s1.to_uom} = ${fmtFactor(s2.factor)} ${toUOM}`,
        ],
      }
    }
  }

  return null
}

// ── main component ────────────────────────────────────────────────────────────

export default function UOMConversion() {
  // ── data ──────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([])
  const [conversions, setConversions] = useState([])
  const [itemsUomCount, setItemsUomCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // ── selection ─────────────────────────────────────────────────────────────
  const [selectedCat, setSelectedCat] = useState(null)

  // ── modals ────────────────────────────────────────────────────────────────
  const [catModal,   setCatModal]   = useState(false)
  const [convModal,  setConvModal]  = useState(false)
  const [editConv,   setEditConv]   = useState(null)   // row being edited
  const [saving,     setSaving]     = useState(false)

  // ── category form ─────────────────────────────────────────────────────────
  const [catForm, setCatForm] = useState({ name: '', description: '' })

  // ── conversion form ───────────────────────────────────────────────────────
  const blank = { from_uom: '', to_uom: '', factor: '', uom_category: '', description: '' }
  const [convForm, setConvForm] = useState(blank)

  // ── test converter ────────────────────────────────────────────────────────
  const [testQty,  setTestQty]  = useState('')
  const [testFrom, setTestFrom] = useState('')
  const [testTo,   setTestTo]   = useState('')

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cats }, { data: convs }] = await Promise.all([
      supabase.from('uom_categories').select('*').order('name'),
      supabase.from('uom_conversions').select('*').order('from_uom'),
    ])
    setCategories(cats || [])
    setConversions(convs || [])

    // Count items where purchase_uom != stock_uom
    const { count } = await supabase
      .from('items')
      .select('id', { count: 'exact', head: true })
      .not('purchase_uom', 'is', null)
      .filter('purchase_uom', 'neq', 'stock_uom')
    setItemsUomCount(count || 0)

    setLoading(false)
  }

  // ── filtered conversions ──────────────────────────────────────────────────
  const filteredConversions = useMemo(() => {
    if (!selectedCat) return conversions
    return conversions.filter((c) => c.uom_category === selectedCat.name)
  }, [conversions, selectedCat])

  const activeCount = useMemo(() => conversions.filter((c) => c.is_active).length, [conversions])

  // ── all unique UOMs ───────────────────────────────────────────────────────
  const allUoms = useMemo(() => {
    const s = new Set()
    conversions.forEach((c) => { s.add(c.from_uom); s.add(c.to_uom) })
    return [...s].sort()
  }, [conversions])

  // ── create category ───────────────────────────────────────────────────────
  async function handleCreateCategory() {
    if (!catForm.name.trim()) return toast.error('Category name is required')
    setSaving(true)
    const { error } = await supabase.from('uom_categories').insert({
      id: uid(),
      name: catForm.name.trim(),
      description: catForm.description.trim() || null,
      is_active: true,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Category created')
    setCatModal(false)
    setCatForm({ name: '', description: '' })
    await loadAll()
  }

  // ── open conversion modal ─────────────────────────────────────────────────
  function openConvModal(row = null) {
    setEditConv(row)
    setConvForm(row ? {
      from_uom:     row.from_uom,
      to_uom:       row.to_uom,
      factor:       String(row.factor),
      uom_category: row.uom_category || '',
      description:  row.description || '',
    } : { ...blank, uom_category: selectedCat?.name || '' })
    setConvModal(true)
  }

  // ── save conversion ───────────────────────────────────────────────────────
  async function handleSaveConversion() {
    if (!convForm.from_uom.trim()) return toast.error('From UOM is required')
    if (!convForm.to_uom.trim())   return toast.error('To UOM is required')
    const factor = parseFloat(convForm.factor)
    if (!isFinite(factor) || factor <= 0) return toast.error('Factor must be a positive number')
    if (convForm.from_uom === convForm.to_uom) return toast.error('From and To UOM must differ')

    setSaving(true)
    const payload = {
      from_uom:     convForm.from_uom.trim(),
      to_uom:       convForm.to_uom.trim(),
      factor,
      uom_category: convForm.uom_category || null,
      description:  convForm.description.trim() || null,
      is_active:    true,
    }

    let error
    if (editConv) {
      ;({ error } = await supabase.from('uom_conversions').update(payload).eq('id', editConv.id))
    } else {
      ;({ error } = await supabase.from('uom_conversions').insert({ id: uid(), ...payload }))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editConv ? 'Rule updated' : 'Rule created')
    setConvModal(false)
    await loadAll()
  }

  // ── toggle conversion active ──────────────────────────────────────────────
  async function toggleConversion(c) {
    const { error } = await supabase.from('uom_conversions').update({ is_active: !c.is_active }).eq('id', c.id)
    if (error) return toast.error(error.message)
    setConversions((prev) => prev.map((x) => x.id === c.id ? { ...x, is_active: !x.is_active } : x))
  }

  // ── delete conversion ─────────────────────────────────────────────────────
  async function deleteConversion(id) {
    if (!window.confirm('Delete this conversion rule?')) return
    const { error } = await supabase.from('uom_conversions').delete().eq('id', id)
    if (error) return toast.error(error.message)
    setConversions((prev) => prev.filter((c) => c.id !== id))
    toast.success('Rule deleted')
  }

  // ── seed common conversions ───────────────────────────────────────────────
  async function seedConversions() {
    setSaving(true)
    const rows = SEED_RULES.map((r) => ({ id: uid(), ...r, is_active: true }))
    const { error } = await supabase.from('uom_conversions').insert(rows)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Seeded 5 common conversion rules')
    await loadAll()
  }

  // ── test result ───────────────────────────────────────────────────────────
  const testResult = useMemo(
    () => computeConversion(conversions, testFrom, testTo, testQty),
    [conversions, testFrom, testTo, testQty]
  )

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 24 }}><p style={{ color: 'var(--text-dim)' }}>Loading UOM conversions…</p></div>
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="UOM Conversion Rules"
        subtitle="Define unit-of-measure categories and conversion factors (e.g. buy in bags → stock in kg)"
      >
        <button className="btn btn-secondary btn-sm" onClick={() => setCatModal(true)}>
          <span className="material-icons md-18">folder</span> Add Category
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => openConvModal()}>
          <span className="material-icons md-18">add</span> Add Conversion
        </button>
      </PageHeader>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 24 }}>
        <KPICard label="TOTAL RULES"    value={conversions.length}  icon="swap_horiz"  color="blue"   />
        <KPICard label="ACTIVE RULES"   value={activeCount}         icon="check_circle" color="green"  />
        <KPICard label="CATEGORIES"     value={categories.length}   icon="folder"      color="teal"   />
        <KPICard label="CUSTOM UOM ITEMS" value={itemsUomCount}     icon="inventory_2" color="yellow" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Left panel: categories ─────────────────────────────────────── */}
        <div style={{
          width: 280, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Categories list */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Categories</span>
            </div>
            {/* All option */}
            <div
              onClick={() => setSelectedCat(null)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                background: !selectedCat ? 'rgba(184,50,50,.08)' : 'transparent',
                borderLeft: !selectedCat ? '3px solid var(--gold)' : '3px solid transparent',
                borderBottom: '1px solid var(--border)',
                fontWeight: !selectedCat ? 700 : 400,
                fontSize: 13,
                display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span>All Conversions</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {conversions.length}
              </span>
            </div>
            {categories.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
                No categories yet
              </div>
            ) : (
              categories.map((cat) => {
                const count = conversions.filter((c) => c.uom_category === cat.name).length
                const isSel = selectedCat?.id === cat.id
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCat(cat)}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      background: isSel ? 'rgba(184,50,50,.08)' : 'transparent',
                      borderLeft: isSel ? '3px solid var(--gold)' : '3px solid transparent',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: isSel ? 700 : 400, fontSize: 13 }}>{cat.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{count}</span>
                    </div>
                    {cat.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{cat.description}</div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Test Conversion Panel */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-mid)', marginBottom: 12, letterSpacing: '.5px' }}>
              TEST CONVERSION
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label>Quantity</label>
                <input
                  className="form-control"
                  type="number"
                  placeholder="Enter qty"
                  value={testQty}
                  onChange={(e) => setTestQty(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>From UOM</label>
                <input
                  className="form-control"
                  list="uom-from-list"
                  placeholder="e.g. bag"
                  value={testFrom}
                  onChange={(e) => setTestFrom(e.target.value)}
                />
                <datalist id="uom-from-list">
                  {allUoms.map((u) => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>To UOM</label>
                <input
                  className="form-control"
                  list="uom-to-list"
                  placeholder="e.g. kg"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
                <datalist id="uom-to-list">
                  {allUoms.map((u) => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>

            {testQty && testFrom && testTo && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: testResult ? 'rgba(52,211,153,.08)' : 'rgba(248,113,113,.08)',
                border: `1px solid ${testResult ? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'}`,
                borderRadius: 8,
              }}>
                {testResult ? (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--green)' }}>
                      {parseFloat(testQty)} {testFrom} = {fmtFactor(testResult.result)} {testTo}
                    </div>
                    {testResult.steps.map((s, i) => (
                      <div key={i} style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                        {s}
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ color: 'var(--red)', fontSize: 12 }}>
                    No conversion rule found for {testFrom} → {testTo}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: conversions table ────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {selectedCat ? selectedCat.name : 'All'} Conversion Rules
                </span>
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                  {filteredConversions.length} rule{filteredConversions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openConvModal()}>
                <span className="material-icons md-18">add</span> Add Rule
              </button>
            </div>

            {filteredConversions.length === 0 ? (
              <div>
                <EmptyState icon="swap_horiz" message="No conversion rules yet" />
                {conversions.length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 24 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={seedConversions}
                      disabled={saving}
                    >
                      <span className="material-icons md-18">auto_fix_high</span>
                      Seed Common Conversions
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>FROM UOM</th>
                      <th className="td-center">→</th>
                      <th>TO UOM</th>
                      <th>FACTOR</th>
                      <th>REVERSE</th>
                      <th>CATEGORY</th>
                      <th>DESCRIPTION</th>
                      <th className="th-center">ACTIVE</th>
                      <th className="td-actions">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConversions.map((c) => {
                      const factor = parseFloat(c.factor)
                      const inverse = isFinite(factor) && factor !== 0 ? 1 / factor : null
                      return (
                        <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.5 }}>
                          <td>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>
                              {c.from_uom}
                            </span>
                          </td>
                          <td className="td-center" style={{ color: 'var(--text-dim)' }}>→</td>
                          <td>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>
                              {c.to_uom}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800 }}>
                              {fmtFactor(c.factor)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                              1 {c.from_uom} = {fmtFactor(c.factor)} {c.to_uom}
                            </div>
                          </td>
                          <td>
                            {inverse !== null && (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                                1 {c.to_uom} = {fmtFactor(inverse)} {c.from_uom}
                              </div>
                            )}
                          </td>
                          <td>
                            {c.uom_category ? (
                              <span style={{
                                background: 'rgba(167,139,250,.12)',
                                color: 'var(--purple)',
                                fontSize: 10,
                                fontFamily: 'var(--mono)',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 20,
                              }}>{c.uom_category}</span>
                            ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>
                          <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                            {c.description || '—'}
                          </td>
                          <td className="td-center">
                            <button
                              className={`btn btn-sm btn-icon ${c.is_active ? 'btn-success' : 'btn-ghost'}`}
                              onClick={() => toggleConversion(c)}
                              title={c.is_active ? 'Deactivate' : 'Activate'}
                            >
                              <span className="material-icons md-18">
                                {c.is_active ? 'toggle_on' : 'toggle_off'}
                              </span>
                            </button>
                          </td>
                          <td className="td-actions">
                            <div className="btn-group-sm">
                              <button
                                className="btn btn-sm btn-ghost btn-icon"
                                onClick={() => openConvModal(c)}
                                title="Edit"
                              >
                                <span className="material-icons md-18">edit</span>
                              </button>
                              <button
                                className="btn btn-sm btn-danger btn-icon"
                                onClick={() => deleteConversion(c.id)}
                                title="Delete"
                              >
                                <span className="material-icons md-18">delete</span>
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
        </div>
      </div>

      {/* ── Add Category Modal ─────────────────────────────────────────────── */}
      {catModal && (
        <div className="overlay" onClick={() => setCatModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add UOM Category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Category Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Weight, Volume, Length, Quantity"
                  value={catForm.name}
                  onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  className="form-control"
                  placeholder="Optional description"
                  value={catForm.description}
                  onChange={(e) => setCatForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setCatModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateCategory} disabled={saving}>
                {saving ? 'Saving…' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Conversion Modal ────────────────────────────────────── */}
      {convModal && (
        <div className="overlay" onClick={() => setConvModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editConv ? 'Edit' : 'Add'} Conversion Rule</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-row">
                <div className="form-group">
                  <label>From UOM *</label>
                  <input
                    className="form-control"
                    placeholder="e.g. bag, carton, drum"
                    value={convForm.from_uom}
                    onChange={(e) => setConvForm((p) => ({ ...p, from_uom: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>To UOM *</label>
                  <input
                    className="form-control"
                    placeholder="e.g. kg, pcs, L"
                    value={convForm.to_uom}
                    onChange={(e) => setConvForm((p) => ({ ...p, to_uom: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Factor * (1 {convForm.from_uom || 'from'} = ? {convForm.to_uom || 'to'})</label>
                <input
                  className="form-control"
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder="e.g. 50"
                  value={convForm.factor}
                  onChange={(e) => setConvForm((p) => ({ ...p, factor: e.target.value }))}
                />
                {convForm.factor && parseFloat(convForm.factor) > 0 && convForm.from_uom && convForm.to_uom && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                    Reverse: 1 {convForm.to_uom} = {fmtFactor(1 / parseFloat(convForm.factor))} {convForm.from_uom}
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  className="form-control"
                  value={convForm.uom_category}
                  onChange={(e) => setConvForm((p) => ({ ...p, uom_category: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  className="form-control"
                  placeholder="e.g. 1 bag = 50 kg cement"
                  value={convForm.description}
                  onChange={(e) => setConvForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConvModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveConversion} disabled={saving}>
                {saving ? 'Saving…' : editConv ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
